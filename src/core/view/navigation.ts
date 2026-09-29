export type RowInput = { row: number } | { error: 'invalid' | 'outOfRange' | 'counting' };

/**
 * Go to Row の入力を検証する。3 桁区切りのカンマと前後の空白は無視する。
 * 行数を数え終える前は使えない（索引の完成後に使える）。
 */
export function parseRowInput(text: string, rowsCounted: number, countDone: boolean): RowInput {
  const digits = text.trim().replace(/,/g, '');
  if (!/^\d+$/.test(digits)) {
    return { error: 'invalid' };
  }
  if (!countDone) {
    return { error: 'counting' };
  }
  const row = Number(digits);
  if (row < 1 || row > rowsCounted) {
    return { error: 'outOfRange' };
  }
  return { row };
}

/** Tail：末尾から size 行を表示するときの、先頭の Row */
export function tailStart(total: number, size: number): number {
  return Math.max(1, total - size + 1);
}
