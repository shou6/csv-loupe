import { ByteSource } from '../source/byteSource';
import { CsvFormat, RecordPosition } from './types';

export interface RawRecord {
  offset: number;
  line: number;
  bytes: Uint8Array;
}

export async function forEachRecord(
  _source: ByteSource,
  _format: CsvFormat,
  _from: RecordPosition,
  _onRecord: (record: RawRecord) => boolean | void,
  _options: { chunkSize?: number } = {}
): Promise<void> {
  throw new Error('not implemented');
}
