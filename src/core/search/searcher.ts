import { CsvFormat } from '../csv/types';
import { FindHit, FindQuery } from '../protocol';
import { ByteSource } from '../source/byteSource';

export interface SearchProgress {
  hits: FindHit[];
  total: number;
  scannedBytes: number;
  done: boolean;
  truncated: boolean;
}

export interface SearchOptions {
  limit: number;
  chunkSize?: number;
  reportEveryChunks?: number;
  onProgress: (progress: SearchProgress) => void;
  shouldStop?: () => boolean;
}

export async function searchRecords(
  _source: ByteSource,
  _format: CsvFormat,
  _query: FindQuery,
  _options: SearchOptions
): Promise<void> {
  throw new Error('not implemented');
}
