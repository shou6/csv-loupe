import { EncodingId } from '../protocol';

/** TextDecoder のうち使う部分。DOM の型定義に頼らないために自前で持つ */
export interface Decoder {
  decode(input: Uint8Array): string;
}

const LABELS: Record<EncodingId, string> = {
  utf8: 'utf-8',
  utf8bom: 'utf-8',
  utf16le: 'utf-16le',
  utf16be: 'utf-16be',
  shiftjis: 'shift_jis',
};

/**
 * 文字コードのデコーダ。BOM は読み始める位置（dataStart）で飛ばすので、ここでは取り除かない。
 * 読めないバイトは置換文字（U+FFFD）にする。
 */
export function createDecoder(encoding: EncodingId): Decoder {
  return new TextDecoder(LABELS[encoding], { ignoreBOM: true });
}
