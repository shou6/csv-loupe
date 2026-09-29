import { CsvFormat } from '../csv/types';
import { ByteSource } from '../source/byteSource';

export interface IndexProgress {
  offsets: number[];
  lines: number[];
  recordCount: number;
  done: boolean;
}

export interface BuildIndexOptions {
  interval?: number;
  chunkSize?: number;
  reportEveryChunks?: number;
  onProgress: (progress: IndexProgress) => void;
}

export async function buildIndex(
  _source: ByteSource,
  _format: CsvFormat,
  _options: BuildIndexOptions
): Promise<number> {
  throw new Error('not implemented');
}
