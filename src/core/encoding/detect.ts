import { EncodingChoice, EncodingId } from '../protocol';

export interface Detection {
  encoding: EncodingId;
  confident: boolean;
}

export function detectEncoding(_sample: Uint8Array, _isWholeFile: boolean): Detection {
  throw new Error('not implemented');
}

export function resolveEncoding(_choice: EncodingChoice, _head: Uint8Array): EncodingId {
  throw new Error('not implemented');
}

export function bomLength(_encoding: EncodingId, _head: Uint8Array): number {
  throw new Error('not implemented');
}
