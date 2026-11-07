/** 開いたときの表示行数の既定 */
export const DEFAULT_PEEK_SIZE = 10;

/** 設定 csvLoupe.initialRowCount の値 → 表示行数。0 は All。知らない値は既定にする */
export function peekSizeFromSetting(value: unknown): number {
  switch (value) {
    case '1':
      return 1;
    case '100':
      return 100;
    case 'all':
      return 0;
    default:
      return DEFAULT_PEEK_SIZE;
  }
}
