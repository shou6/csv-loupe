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
  firstRow: number;
  visibleCount: number;
  contentHeight: number;
}

export function computeViewport(_input: ViewportInput): Viewport {
  throw new Error('not implemented');
}

export function scrollTopForRow(_row: number, _input: ViewportInput): number {
  throw new Error('not implemented');
}
