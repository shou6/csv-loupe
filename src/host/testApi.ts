import * as vscode from 'vscode';
import { HostMessage, WebviewMessage } from '../core/protocol';

/** 統合テストのために、テストの実行時だけ activate が返す */
export interface CsvLensTestApi {
  /** その URI のエディタへ送ったメッセージ */
  messages(uri: vscode.Uri): HostMessage[];
  /** Webview から届いたものとしてメッセージを渡す */
  send(uri: vscode.Uri, message: WebviewMessage): Promise<void>;
}
