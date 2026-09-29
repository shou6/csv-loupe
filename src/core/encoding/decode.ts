import { EncodingId } from '../protocol';

/** TextDecoder のうち使う部分。DOM の型定義に頼らないために自前で持つ */
export interface Decoder {
  decode(input: Uint8Array): string;
}

export function createDecoder(_encoding: EncodingId): Decoder {
  throw new Error('not implemented');
}
