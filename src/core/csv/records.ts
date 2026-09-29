import { ByteSource } from '../source/byteSource';
import { delimiterChar } from './delimiter';
import { RecordScanner, unitModeFor } from './scanner';
import { CsvFormat, RecordPosition } from './types';

export interface RawRecord {
  /** レコードの開始位置（バイト） */
  offset: number;
  /** レコードが始まる行番号 */
  line: number;
  /** 末尾の改行を含むバイト列 */
  bytes: Uint8Array;
}

/** 既定の読み込みの単位。行の読み出しでは小さく、全体の走査では大きくする */
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

export function createScanner(format: CsvFormat, startLine: number): RecordScanner {
  return new RecordScanner(
    unitModeFor(format.encoding),
    delimiterChar(format.delimiter).charCodeAt(0),
    startLine
  );
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * from の位置からレコードを順に読み、onRecord に渡す。onRecord が false を返すと止める。
 * from はレコードの開始位置でなければならない。末尾の改行の後に空のレコードは作らない。
 */
export async function forEachRecord(
  source: ByteSource,
  format: CsvFormat,
  from: RecordPosition,
  onRecord: (record: RawRecord) => boolean | void,
  options: {
    chunkSize?: number;
    /** チャンクを 1 つ処理するたびに、読み終えた位置（絶対位置）を渡す。false を返すと止める */
    onChunk?: (end: number) => boolean | void;
  } = {}
): Promise<void> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const scanner = createScanner(format, from.line);
  let recordStart = from.offset;
  let recordLine = from.line;
  /** 前のチャンクから続いている、読みかけのレコードの断片 */
  let parts: Uint8Array[] = [];
  let stopped = false;
  let pos = from.offset;
  while (pos < source.size && !stopped) {
    const chunk = await source.read(pos, Math.min(chunkSize, source.size - pos));
    if (chunk.length === 0) {
      break;
    }
    const chunkStart = pos;
    let segmentStart = 0;
    scanner.feed(chunk, (end) => {
      if (stopped) {
        return;
      }
      const piece = chunk.subarray(segmentStart, end);
      const bytes = parts.length > 0 ? concatBytes([...parts, piece]) : piece;
      parts = [];
      const result = onRecord({ offset: recordStart, line: recordLine, bytes });
      recordStart = chunkStart + end;
      recordLine = scanner.line;
      segmentStart = end;
      if (result === false) {
        stopped = true;
      }
    });
    if (!stopped && segmentStart < chunk.length) {
      parts.push(chunk.subarray(segmentStart));
    }
    pos += chunk.length;
    if (!stopped && options.onChunk?.(pos) === false) {
      stopped = true;
    }
  }
  if (!stopped && parts.length > 0) {
    onRecord({ offset: recordStart, line: recordLine, bytes: concatBytes(parts) });
  }
}
