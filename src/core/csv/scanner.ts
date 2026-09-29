import { EncodingId } from '../protocol';

/**
 * 区切りに関わる文字（" と区切り文字と \n）を比べる単位。
 * - byte: 1 バイト。UTF-8 は 2 バイト目以降が 0x80 以上なので ASCII と誤認しない
 * - cp932: 1 バイト。ただし 2 バイト目（0x40〜0xFC）はパイプ（0x7C）などと重なるので、
 *   1 バイト目を読んだら次の 1 バイトを比べずに飛ばす
 * - utf16le / utf16be: 2 バイト
 */
export type UnitMode = 'byte' | 'cp932' | 'utf16le' | 'utf16be';

export function unitModeFor(encoding: EncodingId): UnitMode {
  switch (encoding) {
    case 'shiftjis':
      return 'cp932';
    case 'utf16le':
    case 'utf16be':
      return encoding;
    default:
      return 'byte';
  }
}

const LF = 0x0a;
const QUOTE = 0x22;

// 状態
const FIELD_START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
/** 引用の中で " を読んだ直後。次が " なら "" で、それ以外なら引用の終わり */
const QUOTE_IN_QUOTED = 3;

/**
 * レコードの境界を探す状態機械。チャンクを順に渡すと、レコードが終わる位置（\n の直後）を知らせる。
 * 状態はチャンクをまたいで持ち越す。引用符はフィールドの先頭にあるときだけ引用の始まりとする。
 * CR だけの改行は扱わない（CRLF の CR はレコードの末尾の文字として残し、解析のときに除く）。
 */
export class RecordScanner {
  /** 現在の位置の行番号（1 始まり）。レコードの終わりを知らせた時点では、次のレコードの行番号 */
  line: number;
  private state = FIELD_START;
  /** cp932 で、1 バイト目を読んで 2 バイト目を待っている */
  private leadPending = false;
  /** UTF-16 で、前のチャンクの末尾に残った 1 バイト */
  private carry = -1;

  constructor(
    private readonly mode: UnitMode,
    private readonly delimiter: number,
    startLine: number
  ) {
    this.line = startLine;
  }

  /** onRecordEnd にはチャンクの中の位置（レコードの終わりの \n の直後）を渡す */
  feed(chunk: Uint8Array, onRecordEnd: (endInChunk: number) => void): void {
    switch (this.mode) {
      case 'byte':
        this.feedBytes(chunk, onRecordEnd);
        break;
      case 'cp932':
        this.feedCp932(chunk, onRecordEnd);
        break;
      default:
        this.feedUtf16(chunk, onRecordEnd, this.mode === 'utf16le');
    }
  }

  private feedBytes(chunk: Uint8Array, onRecordEnd: (end: number) => void): void {
    for (let i = 0; i < chunk.length; i++) {
      if (this.step(chunk[i])) {
        onRecordEnd(i + 1);
      }
    }
  }

  private feedCp932(chunk: Uint8Array, onRecordEnd: (end: number) => void): void {
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      if (this.leadPending) {
        this.leadPending = false;
        continue;
      }
      if ((b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xfc)) {
        this.leadPending = true;
      }
      if (this.step(b)) {
        onRecordEnd(i + 1);
      }
    }
  }

  private feedUtf16(chunk: Uint8Array, onRecordEnd: (end: number) => void, le: boolean): void {
    let i = 0;
    if (this.carry >= 0 && chunk.length > 0) {
      const unit = le ? this.carry | (chunk[0] << 8) : (this.carry << 8) | chunk[0];
      this.carry = -1;
      i = 1;
      if (this.step(unit)) {
        onRecordEnd(1);
      }
    }
    for (; i + 1 < chunk.length; i += 2) {
      const unit = le ? chunk[i] | (chunk[i + 1] << 8) : (chunk[i] << 8) | chunk[i + 1];
      if (this.step(unit)) {
        onRecordEnd(i + 2);
      }
    }
    if (i < chunk.length) {
      this.carry = chunk[i];
    }
  }

  /** 1 単位を読む。レコードが終わったら true */
  private step(unit: number): boolean {
    if (unit === LF) {
      this.line++;
    }
    switch (this.state) {
      case FIELD_START:
        if (unit === QUOTE) {
          this.state = QUOTED;
        } else if (unit === LF) {
          return true;
        } else if (unit !== this.delimiter) {
          this.state = UNQUOTED;
        }
        return false;
      case UNQUOTED:
        if (unit === this.delimiter) {
          this.state = FIELD_START;
        } else if (unit === LF) {
          this.state = FIELD_START;
          return true;
        }
        return false;
      case QUOTED:
        if (unit === QUOTE) {
          this.state = QUOTE_IN_QUOTED;
        }
        return false;
      default:
        if (unit === QUOTE) {
          this.state = QUOTED;
        } else if (unit === this.delimiter) {
          this.state = FIELD_START;
        } else if (unit === LF) {
          this.state = FIELD_START;
          return true;
        } else {
          this.state = UNQUOTED;
        }
        return false;
    }
  }
}
