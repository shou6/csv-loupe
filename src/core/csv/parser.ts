import { Decoder } from '../encoding/decode';

const FIELD_START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
const QUOTE_IN_QUOTED = 3;

/**
 * 1 レコードの文字列をセルに分ける。規則は RecordScanner と同じ。
 * フィールドの途中の引用符はただの文字とし、閉じない引用符は末尾までを 1 つのセルにする。
 */
export function parseRecord(text: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let state = FIELD_START;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    switch (state) {
      case FIELD_START:
        if (c === '"') {
          state = QUOTED;
        } else if (c === delimiter) {
          cells.push(cell);
          cell = '';
        } else {
          cell += c;
          state = UNQUOTED;
        }
        break;
      case UNQUOTED:
        if (c === delimiter) {
          cells.push(cell);
          cell = '';
          state = FIELD_START;
        } else {
          cell += c;
        }
        break;
      case QUOTED:
        if (c === '"') {
          state = QUOTE_IN_QUOTED;
        } else {
          cell += c;
        }
        break;
      default:
        if (c === '"') {
          cell += '"';
          state = QUOTED;
        } else if (c === delimiter) {
          cells.push(cell);
          cell = '';
          state = FIELD_START;
        } else {
          cell += c;
          state = UNQUOTED;
        }
    }
  }
  cells.push(cell);
  return cells;
}

/** レコードのバイト列を文字列にし、末尾の改行（LF か CRLF）を除く */
export function recordText(bytes: Uint8Array, decoder: Decoder): string {
  const text = decoder.decode(bytes);
  if (!text.endsWith('\n')) {
    return text;
  }
  return text.endsWith('\r\n') ? text.slice(0, -2) : text.slice(0, -1);
}
