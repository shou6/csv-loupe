import { DelimiterId, EncodingId } from '../protocol';
import { Translate } from '../translate';

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** 「1,283,492 rows × 14 columns」。数えている途中は「1,234,000+ rows (counting…)」 */
export function rowCountLabel(rows: number, done: boolean, columns: number, t: Translate): string {
  const count = formatNumber(rows);
  const rowPart = !done
    ? t('{0}+ rows (counting…)', count)
    : rows === 1
      ? t('{0} row', count)
      : t('{0} rows', count);
  const columnPart =
    columns === 1
      ? t('{0} column', formatNumber(columns))
      : t('{0} columns', formatNumber(columns));
  return rowPart + ' × ' + columnPart;
}

const ENCODING_LABELS: Record<EncodingId, string> = {
  utf8: 'UTF-8',
  utf8bom: 'UTF-8 BOM',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  shiftjis: 'Shift_JIS (CP932)',
};

/** 文字コードの表示名。判定に確信がなければ ? を付ける */
export function encodingLabel(encoding: EncodingId, confident: boolean): string {
  return ENCODING_LABELS[encoding] + (confident ? '' : '?');
}

export function delimiterLabel(delimiter: DelimiterId, t: Translate): string {
  switch (delimiter) {
    case 'comma':
      return t('Comma');
    case 'tab':
      return t('Tab');
    case 'semicolon':
      return t('Semicolon');
    case 'pipe':
      return t('Pipe');
  }
}
