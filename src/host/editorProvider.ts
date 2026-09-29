import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { ContextCommand, HostMessage } from '../core/protocol';
import { buildWebviewHtml } from '../core/webviewHtml';

export const VIEW_TYPE = 'csvLens.editor';

/** CSV を読み取り専用で表示するカスタムエディタ。TextDocument を経由しないので、VS Code の大容量の確認が出ない */
export class CsvLensEditorProvider implements vscode.CustomReadonlyEditorProvider {
  /** 右クリックメニューのコマンドを送る先。最後にアクティブになったパネル */
  private activePanel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    panel.webview.html = buildWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css')).toString(),
      nonce: crypto.randomBytes(16).toString('base64'),
      lang: vscode.env.language,
    });
    if (panel.active) {
      this.activePanel = panel;
    }
    panel.onDidChangeViewState(() => {
      if (panel.active) {
        this.activePanel = panel;
      }
    });
    panel.onDidDispose(() => {
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
    });
  }

  /** 右クリックメニューから呼ばれる。対象のセルは Webview が data-vscode-context で渡す */
  runContextCommand(command: ContextCommand, context: unknown): void {
    const cell = context as { row?: unknown; column?: unknown } | undefined;
    if (typeof cell?.row !== 'number' || typeof cell.column !== 'number') {
      return;
    }
    const message: HostMessage = {
      type: 'contextCommand',
      command,
      row: cell.row,
      column: cell.column,
    };
    void this.activePanel?.webview.postMessage(message);
  }
}
