import { delimiterChar } from '../csv/delimiter';
import { parseRecord, recordText } from '../csv/parser';
import { forEachRecord } from '../csv/records';
import { CsvFormat } from '../csv/types';
import { createDecoder } from '../encoding/decode';
import { SparseIndex } from '../index/sparseIndex';
import { RowData } from '../protocol';
import { ByteSource } from '../source/byteSource';

export interface InitialRows {
  header: string[];
  rows: RowData[];
  /** ファイルを最後まで読んだか（行数がこれで確定するか） */
  complete: boolean;
}

/** 開いた直後に表示する、ヘッダーと先頭の maxRows 行。索引に頼らず先頭から読む */
export async function readInitial(
  source: ByteSource,
  format: CsvFormat,
  maxRows: number
): Promise<InitialRows> {
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  let header: string[] = [];
  const rows: RowData[] = [];
  let complete = true;
  let record = 0;
  await forEachRecord(source, format, { offset: format.dataStart, line: 1 }, (raw) => {
    if (record > maxRows) {
      complete = false;
      return false;
    }
    const cells = parseRecord(recordText(raw.bytes, decoder), delimiter);
    if (record === 0) {
      header = cells;
    } else {
      rows.push({ row: record, line: raw.line, cells });
    }
    record++;
  });
  return { header, rows, complete };
}

/**
 * Row fromRow から count 行を読む。rowLimit（その時点で読める行数）を超えた分は返さない。
 * 索引の直前の記録点から読み進める。
 */
export async function readRows(
  source: ByteSource,
  format: CsvFormat,
  index: SparseIndex,
  fromRow: number,
  count: number,
  rowLimit: number
): Promise<RowData[]> {
  const first = Math.max(1, fromRow);
  const last = Math.min(fromRow + count - 1, rowLimit);
  if (last < first) {
    return [];
  }
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  const checkpoint = index.locate(first);
  const rows: RowData[] = [];
  let record = checkpoint.record;
  await forEachRecord(source, format, checkpoint, (raw) => {
    if (record >= first) {
      rows.push({
        row: record,
        line: raw.line,
        cells: parseRecord(recordText(raw.bytes, decoder), delimiter),
      });
    }
    record++;
    return record <= last;
  });
  return rows;
}
