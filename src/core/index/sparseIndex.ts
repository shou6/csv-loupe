export interface Checkpoint {
  /** レコードの番号。0 はヘッダー、n は Row n */
  record: number;
  offset: number;
  line: number;
}

/**
 * 間引いた索引。interval レコードごとに 1 つだけ、開始位置と行番号を記録する。
 * 全レコードの位置を持つと 1,000 万行で 80MB を超えるため。任意のレコードは、直前の記録点から
 * 読み進めて探す（最大 interval - 1 レコードを読み飛ばす）。
 */
export class SparseIndex {
  /** 数え終えたレコードの数（ヘッダーを含む） */
  recordCount = 0;
  /** ファイルの末尾まで数え終えたか */
  complete = false;
  // 4GB を超えるファイルに備えて Float64Array にする
  private offsets: Float64Array = new Float64Array(1024);
  private lines: Float64Array = new Float64Array(1024);
  private size = 1;

  constructor(
    readonly dataStart: number,
    readonly interval = 64
  ) {
    this.offsets[0] = dataStart;
    this.lines[0] = 1;
  }

  /** 記録点を足す。offsets と lines は、レコード interval、2 × interval… の続き */
  extend(offsets: ArrayLike<number>, lines: ArrayLike<number>, recordCount: number): void {
    const needed = this.size + offsets.length;
    if (needed > this.offsets.length) {
      let capacity = this.offsets.length;
      while (capacity < needed) {
        capacity *= 2;
      }
      this.offsets = grow(this.offsets, capacity);
      this.lines = grow(this.lines, capacity);
    }
    for (let i = 0; i < offsets.length; i++) {
      this.offsets[this.size] = offsets[i];
      this.lines[this.size] = lines[i];
      this.size++;
    }
    this.recordCount = recordCount;
  }

  markComplete(): void {
    this.complete = true;
  }

  /** record 以前で最も近い記録点 */
  locate(record: number): Checkpoint {
    const i = Math.max(0, Math.min(Math.floor(record / this.interval), this.size - 1));
    return { record: i * this.interval, offset: this.offsets[i], line: this.lines[i] };
  }
}

function grow(array: Float64Array, capacity: number): Float64Array {
  const result = new Float64Array(capacity);
  result.set(array);
  return result;
}
