import { delimiterChar } from '../csv/delimiter';
import { parseRecord, recordText } from '../csv/parser';
import { forEachRecord } from '../csv/records';
import { CsvFormat } from '../csv/types';
import { createDecoder } from '../encoding/decode';
import { FindHit, FindQuery } from '../protocol';
import { ByteSource } from '../source/byteSource';
import { createMatcher } from './matcher';

/** 検索の途中経過。hits は前回の知らせ以降に見つけた一致 */
export interface SearchProgress {
  hits: FindHit[];
  /** その時点までの一致の件数（一覧の上限を超えた分も数える） */
  total: number;
  /** 読み終えた位置（バイト） */
  scannedBytes: number;
  done: boolean;
  /** 一覧が上限に達し、それ以降の一致を一覧に入れていないか */
  truncated: boolean;
}

export interface SearchOptions {
  /** 一覧に入れる一致の上限 */
  limit: number;
  chunkSize?: number;
  /** 何チャンクごとに途中経過を知らせるか */
  reportEveryChunks?: number;
  onProgress: (progress: SearchProgress) => void;
  /** true を返したら止める。止めたときは done を知らせない */
  shouldStop?: () => boolean;
}

/** CSV 全体（ヘッダーを除く）から、条件に一致するセルを探す */
export async function searchRecords(
  source: ByteSource,
  format: CsvFormat,
  query: FindQuery,
  options: SearchOptions
): Promise<void> {
  const matcher = createMatcher(query);
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  const reportEvery = options.reportEveryChunks ?? 8;
  let hits: FindHit[] = [];
  let stored = 0;
  let total = 0;
  let truncated = false;
  let record = 0;
  let chunks = 0;
  let stopped = false;
  await forEachRecord(
    source,
    format,
    { offset: format.dataStart, line: 1 },
    (raw) => {
      const row = record++;
      if (row === 0) {
        return;
      }
      const text = recordText(raw.bytes, decoder);
      if (!matcher.mightMatch(text)) {
        return;
      }
      const cells = parseRecord(text, delimiter);
      for (let column = 0; column < cells.length; column++) {
        if (matcher.matches(cells[column])) {
          total++;
          if (stored < options.limit) {
            hits.push({ row, column, value: matcher.excerpt(cells[column]) });
            stored++;
          } else {
            truncated = true;
          }
        }
      }
    },
    {
      chunkSize: options.chunkSize ?? 1024 * 1024,
      onChunk: (end) => {
        if (options.shouldStop?.()) {
          stopped = true;
          return false;
        }
        chunks++;
        if (chunks % reportEvery === 0 && end < source.size) {
          options.onProgress({ hits, total, scannedBytes: end, done: false, truncated });
          hits = [];
        }
      },
    }
  );
  if (stopped || options.shouldStop?.()) {
    return;
  }
  options.onProgress({ hits, total, scannedBytes: source.size, done: true, truncated });
}
