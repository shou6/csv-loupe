import { CsvFormat } from '../csv/types';
import { SparseIndex } from '../index/sparseIndex';
import { RowData } from '../protocol';
import { ByteSource } from '../source/byteSource';

export interface InitialRows {
  header: string[];
  rows: RowData[];
  complete: boolean;
}

export async function readInitial(
  _source: ByteSource,
  _format: CsvFormat,
  _maxRows: number
): Promise<InitialRows> {
  throw new Error('not implemented');
}

export async function readRows(
  _source: ByteSource,
  _format: CsvFormat,
  _index: SparseIndex,
  _fromRow: number,
  _count: number,
  _rowLimit: number
): Promise<RowData[]> {
  throw new Error('not implemented');
}
