/** 列幅の下限（px） */
export const MIN_COLUMN_WIDTH = 40;
/** 内容に合わせるときの列幅の上限（px） */
export const MAX_FIT_WIDTH = 600;

/** 内容の幅（余白込み）の一覧から、列幅を決める。下限と上限の間に収める */
export function fitColumnWidth(contentWidths: number[]): number {
  const widest = Math.ceil(Math.max(0, ...contentWidths));
  return Math.min(MAX_FIT_WIDTH, Math.max(MIN_COLUMN_WIDTH, widest));
}
