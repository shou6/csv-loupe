export interface Checkpoint {
  record: number;
  offset: number;
  line: number;
}

export class SparseIndex {
  recordCount = 0;
  complete = false;
  constructor(
    readonly dataStart: number,
    readonly interval = 64
  ) {}
  extend(_offsets: ArrayLike<number>, _lines: ArrayLike<number>, _recordCount: number): void {
    throw new Error('not implemented');
  }
  markComplete(): void {
    throw new Error('not implemented');
  }
  locate(_record: number): Checkpoint {
    throw new Error('not implemented');
  }
}
