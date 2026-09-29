/**
 * 拡張機能ホストと Webview の間でやり取りするメッセージの型。両側でこのファイルを共有する。
 */

/** 文字コード。utf8bom は「BOM 付きの UTF-8」を表す */
export type EncodingId = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'shiftjis';

/** 画面で選べる文字コード。utf8 を選ぶと、BOM があれば utf8bom として扱う */
export type EncodingChoice = 'utf8' | 'shiftjis' | 'utf16le' | 'utf16be';

export type DelimiterId = 'comma' | 'tab' | 'semicolon' | 'pipe';

/** 1 行ぶんのデータ。row はヘッダーを除いた通し番号（1 始まり） */
export interface RowData {
  row: number;
  /** レコードが始まる物理的な行の番号（1 始まり） */
  line: number;
  cells: string[];
}

export interface FindQuery {
  text: string;
  caseSensitive: boolean;
  wholeCell: boolean;
}

export interface FindHit {
  row: number;
  /** 0 始まりの列の番号 */
  column: number;
  /** 値の抜粋 */
  value: string;
}

export type SortDirection = 'asc' | 'desc';

/** ソートの状態。counting は行数を数え終えていない、tooLarge は行数が上限を超えている */
export type SortStatus = 'sorting' | 'done' | 'cleared' | 'counting' | 'tooLarge';

/** 右クリックメニューのコマンド */
export type ContextCommand =
  'copyCell' | 'copyRow' | 'findSameValue' | 'openRecordView' | 'openSourceAtRow';

/** Webview → 拡張機能ホスト */
export type WebviewMessage =
  | { type: 'ready' }
  | {
      type: 'requestRows';
      requestId: number;
      from: number;
      count: number;
      /** ソート中の要求。このとき from と count は表示の位置（1 始まり） */
      sortId?: number;
    }
  | { type: 'sort'; sortId: number; column: number; direction: SortDirection | null }
  /** ソート中の表示の位置を尋ねる */
  | { type: 'locateRow'; requestId: number; row: number }
  | { type: 'find'; searchId: number; query: FindQuery }
  | { type: 'cancelFind' }
  | { type: 'setEncoding'; encoding: EncodingChoice }
  | { type: 'setDelimiter'; delimiter: DelimiterId }
  | { type: 'setHeader'; hasHeader: boolean }
  | { type: 'reload' }
  | { type: 'copy'; text: string }
  | { type: 'openSource'; line: number };

/** 開いた（読み直した）時に送る、ファイルの情報と先頭の行 */
export interface InitMessage {
  type: 'init';
  /** 読み直すたびに増える。古い読み込みの結果を捨てるのに使う */
  generation: number;
  fileName: string;
  encoding: EncodingId;
  /** 文字コードの判定に確信があるか */
  encodingConfident: boolean;
  delimiter: DelimiterId;
  /** 先頭のレコードをヘッダーとして扱うか */
  hasHeader: boolean;
  /** ヘッダーの有無の判別に確信があるか */
  headerConfident: boolean;
  /** ヘッダー。ヘッダーなしのときは空 */
  header: string[];
  /** 列の数（先頭の行のうち最も多いもの） */
  columnCount: number;
  /** 先頭の行（最大 100 行） */
  rows: RowData[];
  /** その時点までに数えた行数 */
  rowsCounted: number;
  /** 行数を数え終えたか */
  countDone: boolean;
  /** 翻訳の表（vscode.l10n.bundle）。英語のときは無い */
  l10n?: Record<string, string>;
}

/** 拡張機能ホスト → Webview */
export type HostMessage =
  | InitMessage
  | { type: 'progress'; generation: number; rowsCounted: number; countDone: boolean }
  | {
      type: 'rows';
      generation: number;
      requestId: number;
      rows: RowData[];
      /** ソート中の要求への返事のとき、rows[i] の表示の位置 */
      positions?: number[];
    }
  | {
      type: 'sortState';
      generation: number;
      sortId: number;
      status: SortStatus;
      column: number;
      direction: SortDirection | null;
    }
  | { type: 'rowLocated'; generation: number; requestId: number; row: number; position: number }
  | {
      type: 'findProgress';
      generation: number;
      searchId: number;
      hits: FindHit[];
      total: number;
      scannedBytes: number;
      fileSize: number;
      done: boolean;
      truncated: boolean;
    }
  | { type: 'contextCommand'; command: ContextCommand; row: number; column: number }
  | { type: 'fileChanged' }
  | { type: 'error'; message: string };
