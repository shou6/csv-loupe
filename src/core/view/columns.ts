import { Translate } from '../translate';

/**
 * 表に出す列名。ヘッダーありなら見出しを使い、見出しより多い列は番号で呼ぶ。
 * ヘッダーなしなら「Column 1」「Column 2」…とする。
 */
export function columnNames(
  header: string[],
  hasHeader: boolean,
  columnCount: number,
  t: Translate
): string[] {
  const count = Math.max(hasHeader ? header.length : 0, columnCount);
  const names: string[] = [];
  for (let column = 0; column < count; column++) {
    if (!hasHeader) {
      names.push(t('Column {0}', String(column + 1)));
    } else {
      names.push(column < header.length ? header[column] : t('(column {0})', String(column + 1)));
    }
  }
  return names;
}
