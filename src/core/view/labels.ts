import { DelimiterId, EncodingId } from '../protocol';
import { Translate } from '../translate';

export function rowCountLabel(
  _rows: number,
  _done: boolean,
  _columns: number,
  _t: Translate
): string {
  throw new Error('not implemented');
}

export function encodingLabel(_encoding: EncodingId, _confident: boolean): string {
  throw new Error('not implemented');
}

export function delimiterLabel(_delimiter: DelimiterId, _t: Translate): string {
  throw new Error('not implemented');
}
