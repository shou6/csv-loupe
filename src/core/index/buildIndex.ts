import { createScanner } from '../csv/records';
import { CsvFormat } from '../csv/types';
import { ByteSource } from '../source/byteSource';

/** 索引の作成の途中経過。offsets と lines は、前回の知らせ以降に増えた記録点 */
export interface IndexProgress {
  offsets: number[];
  lines: number[];
  /** その時点までに数えたレコードの数（ヘッダーを含む） */
  recordCount: number;
  done: boolean;
}

export interface BuildIndexOptions {
  /** 記録点の間隔（SparseIndex と合わせる） */
  interval?: number;
  chunkSize?: number;
  /** 何チャンクごとに途中経過を知らせるか */
  reportEveryChunks?: number;
  onProgress: (progress: IndexProgress) => void;
}

/**
 * ファイル全体を走査して、間引いた索引の記録点を作る。セルの解析や文字列への変換はしない。
 * 戻り値はレコードの総数（ヘッダーを含む）。
 */
export async function buildIndex(
  source: ByteSource,
  format: CsvFormat,
  options: BuildIndexOptions
): Promise<number> {
  const interval = options.interval ?? 64;
  const chunkSize = options.chunkSize ?? 1024 * 1024;
  const reportEvery = options.reportEveryChunks ?? 8;
  const size = source.size;
  if (format.dataStart >= size) {
    options.onProgress({ offsets: [], lines: [], recordCount: 0, done: true });
    return 0;
  }
  const scanner = createScanner(format, 1);
  let recordCount = 1;
  let offsets: number[] = [];
  let lines: number[] = [];
  let chunks = 0;
  let pos = format.dataStart;
  while (pos < size) {
    const chunk = await source.read(pos, Math.min(chunkSize, size - pos));
    if (chunk.length === 0) {
      break;
    }
    const chunkStart = pos;
    scanner.feed(chunk, (end) => {
      const next = chunkStart + end;
      if (next >= size) {
        return;
      }
      if (recordCount % interval === 0) {
        offsets.push(next);
        lines.push(scanner.line);
      }
      recordCount++;
    });
    pos += chunk.length;
    chunks++;
    if (chunks % reportEvery === 0 && pos < size) {
      options.onProgress({ offsets, lines, recordCount, done: false });
      offsets = [];
      lines = [];
    }
  }
  options.onProgress({ offsets, lines, recordCount, done: true });
  return recordCount;
}
