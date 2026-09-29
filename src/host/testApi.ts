import * as vscode from 'vscode';
import { HostMessage, WebviewMessage } from '../core/protocol';

/** 統合テストのために、テストの実行時だけ activate が返す */
export interface CsvLensTestApi {
  /** その URI のエディタへ送ったメッセージ */
  messages(uri: vscode.Uri): HostMessage[];
  /** Webview から届いたものとしてメッセージを渡す */
  send(uri: vscode.Uri, message: WebviewMessage): Promise<void>;
  /**
   * その URI の Webview からのメッセージを受け取らない。テストが送るメッセージと競合させないため。
   * 例えば Webview は init を受け取ると cancelFind を送るので、テストが始めた検索を止めてしまう
   */
  ignoreWebview(uri: vscode.Uri): void;
}
