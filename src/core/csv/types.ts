import { DelimiterId, EncodingId } from '../protocol';

/** ファイルの読み方 */
export interface CsvFormat {
  encoding: EncodingId;
  delimiter: DelimiterId;
  /** データの開始位置（BOM の直後） */
  dataStart: number;
}

/** レコードの開始位置と、開始する行番号 */
export interface RecordPosition {
  offset: number;
  line: number;
}
