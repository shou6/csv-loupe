import { EncodingChoice, EncodingId } from '../protocol';

export interface Detection {
  encoding: EncodingId;
  /** 判定に確信があるか。無ければ画面で ? を付ける */
  confident: boolean;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

/** BOM の無い UTF-16 の推定に使う先頭のバイト数 */
const UTF16_SAMPLE = 4096;

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((b, i) => bytes[i] === b);
}

/** label の文字コードとして誤りなく読めるか。先頭だけのときは、末尾で途切れた文字を誤りとしない */
function decodes(label: string, sample: Uint8Array, isWholeFile: boolean): boolean {
  try {
    new TextDecoder(label, { fatal: true }).decode(sample, { stream: !isWholeFile });
    return true;
  } catch {
    return false;
  }
}

/**
 * BOM の無い UTF-16 を 0x00 の位置から推定する。CSV には区切り文字や改行などの ASCII が必ずあり、
 * UTF-16 ではその上位バイトが 0x00 になる。UTF-8 や CP932 のテキストには 0x00 がまず現れない。
 */
function guessUtf16(sample: Uint8Array): 'utf16le' | 'utf16be' | undefined {
  const length = Math.min(sample.length, UTF16_SAMPLE) & ~1;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < length; i += 2) {
    if (sample[i] === 0) {
      evenZeros++;
    }
    if (sample[i + 1] === 0) {
      oddZeros++;
    }
  }
  const zeros = evenZeros + oddZeros;
  if (zeros < Math.max(2, (length / 2) * 0.05)) {
    return undefined;
  }
  if (oddZeros >= zeros * 0.9) {
    return 'utf16le';
  }
  if (evenZeros >= zeros * 0.9) {
    return 'utf16be';
  }
  return undefined;
}

/**
 * ファイルの先頭（sample）から文字コードを判定する。
 * BOM → BOM の無い UTF-16 → UTF-8 → Shift_JIS（CP932）の順に試す。
 */
export function detectEncoding(sample: Uint8Array, isWholeFile: boolean): Detection {
  if (startsWith(sample, UTF8_BOM)) {
    return { encoding: 'utf8bom', confident: true };
  }
  if (startsWith(sample, UTF16LE_BOM)) {
    return { encoding: 'utf16le', confident: true };
  }
  if (startsWith(sample, UTF16BE_BOM)) {
    return { encoding: 'utf16be', confident: true };
  }
  const utf16 = guessUtf16(sample);
  if (utf16) {
    return { encoding: utf16, confident: false };
  }
  if (decodes('utf-8', sample, isWholeFile)) {
    return { encoding: 'utf8', confident: true };
  }
  return { encoding: 'shiftjis', confident: decodes('shift_jis', sample, isWholeFile) };
}

/** 画面で選んだ文字コードを、ファイルの先頭に合わせて決める。UTF-8 は BOM があれば BOM 付きとする */
export function resolveEncoding(choice: EncodingChoice, head: Uint8Array): EncodingId {
  return choice === 'utf8' && startsWith(head, UTF8_BOM) ? 'utf8bom' : choice;
}

/** ファイルの先頭にある BOM の長さ。文字コードと BOM が一致するときだけ数える */
export function bomLength(encoding: EncodingId, head: Uint8Array): number {
  switch (encoding) {
    case 'utf8bom':
      return startsWith(head, UTF8_BOM) ? 3 : 0;
    case 'utf16le':
      return startsWith(head, UTF16LE_BOM) ? 2 : 0;
    case 'utf16be':
      return startsWith(head, UTF16BE_BOM) ? 2 : 0;
    default:
      return 0;
  }
}
