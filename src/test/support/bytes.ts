/** テストデータのバイト列を作る補助 */

export function utf8(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

export function utf16le(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'utf16le'));
}

export function utf16be(text: string): Uint8Array {
  const bytes = utf16le(text);
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    [bytes[i], bytes[i + 1]] = [bytes[i + 1], bytes[i]];
  }
  return bytes;
}

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const arrays = parts.map((part) => (part instanceof Uint8Array ? part : Uint8Array.from(part)));
  const result = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * CP932 のバイト列。Node には Shift_JIS の符号化が無いので、使う文字だけ表を持つ。
 * ASCII はそのまま。
 */
const CP932: Record<string, number[]> = {
  表: [0x95, 0x5c],
  ソ: [0x83, 0x5c],
  ポ: [0x83, 0x7c],
  あ: [0x82, 0xa0],
  '①': [0x87, 0x40],
};

export function cp932(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of text) {
    const mapped = CP932[ch];
    if (mapped) {
      bytes.push(...mapped);
    } else if (ch.charCodeAt(0) < 0x80) {
      bytes.push(ch.charCodeAt(0));
    } else {
      throw new Error('テスト用の CP932 の表に無い文字: ' + ch);
    }
  }
  return Uint8Array.from(bytes);
}
