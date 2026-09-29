/**
 * 性能の計測（npm run bench）の中身。大きな CSV を作り、要件の NFR-1 の各項目を計る。
 * 拡張機能と同じコアの処理を、Node の上で直接呼ぶ（Webview の描画の時間は含まない）。
 */
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { delimiterForFileName } from '../core/csv/delimiter';
import { CsvFormat } from '../core/csv/types';
import { bomLength, detectEncoding } from '../core/encoding/detect';
import { buildIndex } from '../core/index/buildIndex';
import { SparseIndex } from '../core/index/sparseIndex';
import { readInitial, readRows } from '../core/read/rowReader';
import { searchRecords } from '../core/search/searcher';
import { NodeFileSource } from '../core/source/nodeFileSource';

/** 最後の行にだけ入れる値。検索がファイルの末尾まで走査することを確かめる */
export const LAST_ROW_MARKER = 'csv-loupe-last-row';

export interface BenchmarkResult {
  bytes: number;
  rows: number;
  columns: number;
  /** 開いてから、ヘッダーと先頭の 100 行を読み終えるまで */
  firstRowsMs: number;
  /** 索引の作成（全体の走査） */
  indexMs: number;
  /** 拡張機能ホストが保持する索引の大きさ */
  indexMemoryBytes: number;
  /** 最後の行にだけある値の検索（全体の走査） */
  searchMs: number;
  searchHits: number;
  /** 索引の完成後に読む、中ほどの Row */
  randomRow: number;
  randomRowMs: number;
}

/**
 * 計測用の 1 行。1 列目は番号、2 列目は日本語、残りは数字。
 * 1,000 行ごとに改行を含むセルを入れる。
 */
export function sampleRow(index: number, columns: number, last: boolean): string {
  const cells: string[] = [String(index), last ? LAST_ROW_MARKER : '名前' + (index % 100)];
  for (let column = 2; column < columns; column++) {
    cells.push(String((index * 31 + column * 17) % 99991));
  }
  if (index % 1000 === 0) {
    cells[Math.min(2, cells.length - 1)] = '"line1\nline2"';
  }
  return cells.slice(0, columns).join(',');
}

/** ヘッダーと rows 行の CSV を書く。1MB ずつまとめて書く */
export async function writeLargeCsv(file: string, rows: number, columns: number): Promise<void> {
  const stream = fs.createWriteStream(file);
  const write = (text: string) =>
    new Promise<void>((resolve, reject) => {
      stream.write(text, (error) => (error ? reject(error) : resolve()));
    });
  const header = ['id', 'name', ...Array.from({ length: columns - 2 }, (_, i) => 'c' + (i + 2))];
  let buffer = header.slice(0, columns).join(',') + '\n';
  for (let index = 1; index <= rows; index++) {
    buffer += sampleRow(index, columns, index === rows) + '\n';
    if (buffer.length >= 1024 * 1024) {
      await write(buffer);
      buffer = '';
    }
  }
  await write(buffer);
  await new Promise<void>((resolve, reject) => {
    stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });
}

export async function runBenchmark(file: string): Promise<BenchmarkResult> {
  const openedAt = performance.now();
  const source = await NodeFileSource.open(file);
  try {
    const head = await source.read(0, 64 * 1024);
    const detection = detectEncoding(head, head.length >= source.size);
    const format: CsvFormat = {
      encoding: detection.encoding,
      delimiter: delimiterForFileName(file),
      dataStart: bomLength(detection.encoding, head),
    };
    const initial = await readInitial(source, format, 100);
    const firstRowsMs = performance.now() - openedAt;

    const index = new SparseIndex(format.dataStart);
    const indexedAt = performance.now();
    await buildIndex(source, format, {
      onProgress: (progress) => {
        index.extend(progress.offsets, progress.lines, progress.recordCount);
        if (progress.done) {
          index.markComplete();
        }
      },
    });
    const indexMs = performance.now() - indexedAt;
    const rows = Math.max(0, index.recordCount - 1);

    const searchedAt = performance.now();
    let searchHits = 0;
    await searchRecords(
      source,
      format,
      { text: LAST_ROW_MARKER, caseSensitive: false, wholeCell: false },
      { limit: 10_000, onProgress: (progress) => (searchHits += progress.hits.length) }
    );
    const searchMs = performance.now() - searchedAt;

    const randomRow = Math.ceil(rows / 2);
    const readAt = performance.now();
    await readRows(source, format, index, randomRow, 50, rows);
    const randomRowMs = performance.now() - readAt;

    return {
      bytes: source.size,
      rows,
      columns: initial.header.length,
      firstRowsMs,
      indexMs,
      indexMemoryBytes: index.byteLength,
      searchMs,
      searchHits,
      randomRow,
      randomRowMs,
    };
  } finally {
    await source.close();
  }
}
