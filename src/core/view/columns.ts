import { Translate } from '../translate';

/** 非表示にした列を除いた列の番号（元の順） */
export function visibleColumns(count: number, hidden: ReadonlySet<number>): number[] {
  const columns: number[] = [];
  for (let column = 0; column < count; column++) {
    if (!hidden.has(column)) {
      columns.push(column);
    }
  }
  return columns;
}

/** 列名の一部（前後の空白は除く）で絞り込んだ列の番号。大文字と小文字は区別しない */
export function matchColumns(names: string[], query: string): number[] {
  const needle = query.trim().toLowerCase();
  const columns: number[] = [];
  names.forEach((name, column) => {
    if (name.toLowerCase().includes(needle)) {
      columns.push(column);
    }
  });
  return columns;
}

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
