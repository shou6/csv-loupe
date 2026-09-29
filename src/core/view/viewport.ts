export interface ViewportInput {
  scrollTop: number;
  /** 行を表示する部分の高さ（見出しを除く） */
  viewportHeight: number;
  rowHeight: number;
  totalRows: number;
  /** スクロールする要素の高さの上限（ブラウザの上限より十分小さくする） */
  maxContentHeight: number;
}

export interface Viewport {
  /** 画面の先頭に表示する Row */
  firstRow: number;
  /** 描画する行数（下端で一部だけ見える行を含む） */
  visibleCount: number;
  /** スクロールする要素の高さ */
  contentHeight: number;
}

interface Geometry {
  contentHeight: number;
  maxScroll: number;
  maxFirstRow: number;
  /** 行数 × 行の高さが上限を超え、スクロールの比率で換算するか */
  scaled: boolean;
}

function geometry(input: ViewportInput): Geometry {
  const natural = input.totalRows * input.rowHeight;
  const contentHeight = Math.min(natural, input.maxContentHeight);
  const fullyVisible = Math.max(1, Math.floor(input.viewportHeight / input.rowHeight));
  return {
    contentHeight,
    maxScroll: Math.max(0, contentHeight - input.viewportHeight),
    maxFirstRow: Math.max(1, input.totalRows - fullyVisible + 1),
    scaled: natural > input.maxContentHeight,
  };
}

/**
 * スクロール位置から、表示する Row の範囲を決める。1,000 万行 × 行の高さはブラウザの要素の高さの
 * 上限を超えるので、そのときは高さを上限に抑え、スクロールの比率で Row に換算する。
 */
export function computeViewport(input: ViewportInput): Viewport {
  const g = geometry(input);
  const scrollTop = Math.max(0, Math.min(input.scrollTop, g.maxScroll));
  let firstRow: number;
  if (g.scaled) {
    const ratio = g.maxScroll > 0 ? scrollTop / g.maxScroll : 0;
    firstRow = 1 + Math.round(ratio * (g.maxFirstRow - 1));
  } else {
    firstRow = Math.floor(scrollTop / input.rowHeight) + 1;
  }
  firstRow = Math.max(1, Math.min(firstRow, g.maxFirstRow));
  const wanted = Math.ceil(input.viewportHeight / input.rowHeight) + 1;
  const visibleCount = Math.max(0, Math.min(wanted, input.totalRows - firstRow + 1));
  return { firstRow, visibleCount, contentHeight: g.contentHeight };
}

/** row が画面の先頭に来るスクロール位置（computeViewport の逆） */
export function scrollTopForRow(row: number, input: ViewportInput): number {
  const g = geometry(input);
  const target = Math.max(1, Math.min(row, g.maxFirstRow));
  const top = g.scaled
    ? g.maxFirstRow > 1
      ? ((target - 1) / (g.maxFirstRow - 1)) * g.maxScroll
      : 0
    : (target - 1) * input.rowHeight;
  return Math.min(top, g.maxScroll);
}
