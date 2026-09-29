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

/** 先頭のレコード。ヘッダーかどうかを決める前の形 */
export interface HeadRecords {
  records: { line: number; cells: string[] }[];
  /** ファイルの末尾まで読んだか（maxRecords より後にレコードが無いか） */
  complete: boolean;
}

/** 先頭から最大 maxRecords 件のレコードを読む。索引に頼らない */
export async function readHead(
  source: ByteSource,
  format: CsvFormat,
  maxRecords: number
): Promise<HeadRecords> {
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  const records: HeadRecords['records'] = [];
  let complete = true;
  await forEachRecord(source, format, { offset: format.dataStart, line: 1 }, (raw) => {
    if (records.length >= maxRecords) {
      complete = false;
      return false;
    }
    records.push({ line: raw.line, cells: parseRecord(recordText(raw.bytes, decoder), delimiter) });
  });
  return { records, complete };
}

/** 先頭のレコードを、ヘッダーと先頭の maxRows 行に分ける */
export function shapeInitial(head: HeadRecords, hasHeader: boolean, maxRows: number): InitialRows {
  const header = hasHeader ? (head.records[0]?.cells ?? []) : [];
  const data = hasHeader ? head.records.slice(1) : head.records;
  return {
    header,
    rows: data.slice(0, maxRows).map((record, i) => ({
      row: i + 1,
      line: record.line,
      cells: record.cells,
    })),
    complete: head.complete && data.length <= maxRows,
  };
}

/** 開いた直後に表示する、ヘッダーと先頭の maxRows 行。ヘッダーなしなら先頭のレコードを Row 1 にする */
export async function readInitial(
  source: ByteSource,
  format: CsvFormat,
  maxRows: number,
  hasHeader = true
): Promise<InitialRows> {
  const head = await readHead(source, format, maxRows + (hasHeader ? 1 : 0));
  return shapeInitial(head, hasHeader, maxRows);
}

/**
 * Row fromRow から count 行を読む。rowLimit（その時点で読める行数）を超えた分は返さない。
 * firstDataRecord は Row 1 にあたるレコードの番号（ヘッダーありなら 1、なしなら 0）。
 * 索引の直前の記録点から読み進める。
 */
export async function readRows(
  source: ByteSource,
  format: CsvFormat,
  index: SparseIndex,
  fromRow: number,
  count: number,
  rowLimit: number,
  firstDataRecord = 1
): Promise<RowData[]> {
  const first = Math.max(1, fromRow);
  const last = Math.min(fromRow + count - 1, rowLimit);
  if (last < first) {
    return [];
  }
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  const firstRecord = first - 1 + firstDataRecord;
  const lastRecord = last - 1 + firstDataRecord;
  const checkpoint = index.locate(firstRecord);
  const rows: RowData[] = [];
  let record = checkpoint.record;
  await forEachRecord(source, format, checkpoint, (raw) => {
    if (record >= firstRecord) {
      rows.push({
        row: record + 1 - firstDataRecord,
        line: raw.line,
        cells: parseRecord(recordText(raw.bytes, decoder), delimiter),
      });
    }
    record++;
    return record <= lastRecord;
  });
  return rows;
}
