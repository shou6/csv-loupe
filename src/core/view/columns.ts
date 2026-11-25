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

/**
 * 見出しの段に出す文字。ヘッダーが複数行なら、その列の各行の値を上から順に返す。
 * どの行にも値の無い列は、列名（name）を一番上の段に出す。1 行以下なら列名だけを返す
 */
export function headerLabelLines(lines: string[][], column: number, name: string): string[] {
  if (lines.length <= 1) {
    return [name];
  }
  const values = lines.map((line) => line[column] ?? '');
  if (values.every((value) => value.trim() === '')) {
    return [name, ...values.slice(1).map(() => '')];
  }
  return values;
}
