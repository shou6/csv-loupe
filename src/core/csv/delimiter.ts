import { DelimiterId } from '../protocol';

const CHARS: Record<DelimiterId, string> = {
  comma: ',',
  tab: '\t',
  semicolon: ';',
  pipe: '|',
};

/** 画面で選べる区切り文字の一覧（表示順） */
export const DELIMITERS: DelimiterId[] = ['comma', 'tab', 'semicolon', 'pipe'];

/** 開いた時の区切り文字。.tsv はタブ、それ以外はカンマ */
export function delimiterForFileName(fileName: string): DelimiterId {
  return /\.tsv$/i.test(fileName) ? 'tab' : 'comma';
}

export function delimiterChar(delimiter: DelimiterId): string {
  return CHARS[delimiter];
}
