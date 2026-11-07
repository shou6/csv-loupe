/** 選んだセルを動かす操作 */
export type MoveKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'pageUp'
  | 'pageDown'
  | 'home'
  | 'end'
  /** Ctrl+Home：先頭の行 */
  | 'first'
  /** Ctrl+End：末尾の行 */
  | 'last';

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const PLAIN_KEYS: Record<string, MoveKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
  Home: 'home',
  End: 'end',
};

/** キーの入力を移動の操作にする。Ctrl（Mac は Cmd）は Home と End とだけ組み合わせる */
export function moveKeyFor(input: KeyInput): MoveKey | undefined {
  if (input.shiftKey || input.altKey) {
    return undefined;
  }
  if (input.ctrlKey || input.metaKey) {
    return input.key === 'Home' ? 'first' : input.key === 'End' ? 'last' : undefined;
  }
  return PLAIN_KEYS[input.key];
}

/** 表示中の範囲での位置。index は範囲の中の行（0 始まり）、columnIndex は表示している列の中の番号 */
export interface CellIndex {
  index: number;
  columnIndex: number;
}

export interface MoveContext {
  /** 表示中の範囲の行数 */
  rowCount: number;
  /** 表示している列の数 */
  columnCount: number;
  /** 1 画面に入る行数 */
  pageRows: number;
  /** 画面の先頭の行の index */
  topIndex: number;
  /** 行数を数え終えたか */
  countDone: boolean;
}

export type MoveResult = CellIndex | { error: 'counting' } | undefined;

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/**
 * 選んだセルを動かした先を決める。範囲の端では止まる。何も選んでいなければ、画面の先頭のセルを選ぶ。
 * 行数を数え終える前の Ctrl+End は counting を返し、動かさない。行か列が無ければ undefined。
 */
export function moveCell(
  current: CellIndex | undefined,
  key: MoveKey,
  context: MoveContext
): MoveResult {
  if (key === 'last' && !context.countDone) {
    return { error: 'counting' };
  }
  if (context.rowCount <= 0 || context.columnCount <= 0) {
    return undefined;
  }
  const lastRow = context.rowCount - 1;
  const lastColumn = context.columnCount - 1;
  if (!current) {
    return { index: clamp(context.topIndex, lastRow), columnIndex: 0 };
  }
  const index = clamp(current.index, lastRow);
  const columnIndex = clamp(current.columnIndex, lastColumn);
  const page = Math.max(1, context.pageRows);
  switch (key) {
    case 'up':
      return { index: clamp(index - 1, lastRow), columnIndex };
    case 'down':
      return { index: clamp(index + 1, lastRow), columnIndex };
    case 'left':
      return { index, columnIndex: clamp(columnIndex - 1, lastColumn) };
    case 'right':
      return { index, columnIndex: clamp(columnIndex + 1, lastColumn) };
    case 'pageUp':
      return { index: clamp(index - page, lastRow), columnIndex };
    case 'pageDown':
      return { index: clamp(index + page, lastRow), columnIndex };
    case 'home':
      return { index, columnIndex: 0 };
    case 'end':
      return { index, columnIndex: lastColumn };
    case 'first':
      return { index: 0, columnIndex };
    case 'last':
      return { index: lastRow, columnIndex };
  }
}

/**
 * レコード表示の「前の行」「次の行」で移る先の index。範囲と順は ↑ / ↓ と同じ。
 * 範囲の端か、選んだ行の位置が分からなければ undefined（ボタンを無効にする）。
 */
export function stepRow(
  index: number | undefined,
  direction: 'previous' | 'next',
  rowCount: number
): number | undefined {
  if (index === undefined) {
    return undefined;
  }
  const next = direction === 'previous' ? index - 1 : index + 1;
  return next >= 0 && next < rowCount ? next : undefined;
}
