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

/** 右クリックメニューのコマンド */
export type ContextCommand =
  'copyCell' | 'copyRow' | 'findSameValue' | 'openRecordView' | 'openSourceAtRow';

/** Webview → 拡張機能ホスト */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'requestRows'; requestId: number; from: number; count: number }
  | { type: 'find'; searchId: number; query: FindQuery }
  | { type: 'cancelFind' }
  | { type: 'setEncoding'; encoding: EncodingChoice }
  | { type: 'setDelimiter'; delimiter: DelimiterId }
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
  header: string[];
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
  | { type: 'rows'; generation: number; requestId: number; rows: RowData[] }
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
