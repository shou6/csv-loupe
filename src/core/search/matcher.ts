import { FindQuery } from '../protocol';

/** 一覧に出す値の抜粋の長さ */
const EXCERPT_LENGTH = 120;
/** 抜粋で、一致した箇所の前に残す長さ */
const EXCERPT_BEFORE = 40;

export interface Matcher {
  /** セルが検索語に一致するか */
  matches(cell: string): boolean;
  /**
   * レコードの文字列（セルに分ける前）が一致しうるか。false なら、セルに分けずに飛ばしてよい。
   * 大半のレコードは一致しないので、これで検索を速くする。
   */
  mightMatch(recordText: string): boolean;
  /** 一覧に出す値の抜粋。長い値は一致した箇所の付近だけにする */
  excerpt(cell: string): string;
}

/**
 * 検索の条件から一致の判定を作る。既定は部分一致で、大文字と小文字を区別しない。
 * 空の検索語は、部分一致では何にも一致せず、セル全体の一致では空のセルに一致する（Find Same Value 用）。
 */
export function createMatcher(query: FindQuery): Matcher {
  const fold = query.caseSensitive ? (s: string) => s : (s: string) => s.toLowerCase();
  const needle = fold(query.text);
  const matches = query.wholeCell
    ? (cell: string) => fold(cell) === needle
    : (cell: string) => needle !== '' && fold(cell).includes(needle);
  let mightMatch: (recordText: string) => boolean;
  if (needle === '') {
    mightMatch = () => query.wholeCell;
  } else if (needle.includes('"')) {
    // ファイル上では " が "" になるので、レコードの文字列では判定できない
    mightMatch = () => true;
  } else {
    mightMatch = (recordText) => fold(recordText).includes(needle);
  }
  return {
    matches,
    mightMatch,
    excerpt: (cell) => {
      if (cell.length <= EXCERPT_LENGTH) {
        return cell;
      }
      const at = query.wholeCell ? 0 : Math.max(0, fold(cell).indexOf(needle));
      const start = Math.max(0, Math.min(at - EXCERPT_BEFORE, cell.length - EXCERPT_LENGTH));
      const end = start + EXCERPT_LENGTH;
      return (start > 0 ? '…' : '') + cell.slice(start, end) + (end < cell.length ? '…' : '');
    },
  };
}
