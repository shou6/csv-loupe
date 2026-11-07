/** レコード表示の最小幅（px） */
export const MIN_RECORD_WIDTH = 200;
/** レコード表示を広げたときに表へ残す最小幅（px） */
export const MIN_TABLE_WIDTH = 200;

/**
 * レコード表示の幅を、表とレコード表示の両方が使える範囲に収める。
 * 全体が狭く両方の最小幅を取れないときは、レコード表示の最小幅を優先する。
 */
export function clampRecordWidth(width: number, containerWidth: number): number {
  const max = Math.max(MIN_RECORD_WIDTH, containerWidth - MIN_TABLE_WIDTH);
  return Math.round(Math.min(max, Math.max(MIN_RECORD_WIDTH, width)));
}
