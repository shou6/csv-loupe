export type RowInput = { row: number } | { error: 'invalid' | 'outOfRange' | 'counting' };

export function parseRowInput(_text: string, _rowsCounted: number, _countDone: boolean): RowInput {
  throw new Error('not implemented');
}

export function tailStart(_total: number, _size: number): number {
  throw new Error('not implemented');
}
