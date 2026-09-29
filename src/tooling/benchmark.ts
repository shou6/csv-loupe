export const LAST_ROW_MARKER = 'csv-lens-last-row';

export interface BenchmarkResult {
  bytes: number;
  rows: number;
  columns: number;
  firstRowsMs: number;
  indexMs: number;
  indexMemoryBytes: number;
  searchMs: number;
  searchHits: number;
  randomRow: number;
  randomRowMs: number;
}

export function sampleRow(_index: number, _columns: number, _last: boolean): string {
  throw new Error('not implemented');
}

export async function writeLargeCsv(_file: string, _rows: number, _columns: number): Promise<void> {
  throw new Error('not implemented');
}

export async function runBenchmark(_file: string): Promise<BenchmarkResult> {
  throw new Error('not implemented');
}
