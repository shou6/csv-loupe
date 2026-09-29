import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { InProcessJobRunner, JobRunner } from '../core/jobs';
import { ContextCommand, EncodingId, HostMessage, WebviewMessage } from '../core/protocol';
import { CsvSession, SessionEnvironment } from '../core/session';
import { ByteSource } from '../core/source/byteSource';
import { MemorySource } from '../core/source/memorySource';
import { NodeFileSource } from '../core/source/nodeFileSource';
import { buildWebviewHtml } from '../core/webviewHtml';
import { CsvLensTestApi } from './testApi';
import { WorkerJobRunner } from './workerJobRunner';

export const VIEW_TYPE = 'csvLens.editor';

/** CSV を読み取り専用で表示するカスタムエディタ。TextDocument を経由しないので、VS Code の大容量の確認が出ない */
export class CsvLensEditorProvider implements vscode.CustomReadonlyEditorProvider {
  /** 右クリックメニューのコマンドを送る先。最後にアクティブになったパネル */
  private activePanel: vscode.WebviewPanel | undefined;
  private readonly sessions = new Map<string, CsvSession>();
  /** テストの実行時だけ、送ったメッセージを記録する */
  private readonly messageLog: Map<string, HostMessage[]> | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    options: { recordMessages?: boolean } = {}
  ) {
    this.messageLog = options.recordMessages ? new Map() : undefined;
  }

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => undefined };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const uri = document.uri;
    const key = uri.toString();
    const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    panel.webview.html = buildWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js')).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.css')).toString(),
      nonce: crypto.randomBytes(16).toString('base64'),
      lang: vscode.env.language,
    });

    this.messageLog?.set(key, []);
    const session = new CsvSession(this.environment(uri, panel));
    this.sessions.set(key, session);
    const disposables: vscode.Disposable[] = [
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
        void session.handle(message);
      }),
      panel.onDidChangeViewState(() => {
        if (panel.active) {
          this.activePanel = panel;
        }
      }),
    ];
    if (panel.active) {
      this.activePanel = panel;
    }
    panel.onDidDispose(() => {
      if (this.activePanel === panel) {
        this.activePanel = undefined;
      }
      this.sessions.delete(key);
      vscode.Disposable.from(...disposables).dispose();
      void session.dispose();
    });
    void session.start();
  }

  private environment(uri: vscode.Uri, panel: vscode.WebviewPanel): SessionEnvironment {
    const workerPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'worker.js').fsPath;
    return {
      fileName: path.posix.basename(uri.path),
      l10n: vscode.l10n.bundle,
      open: async (): Promise<{ source: ByteSource; runner: JobRunner }> => {
        if (uri.scheme === 'file') {
          return {
            source: await NodeFileSource.open(uri.fsPath),
            runner: new WorkerJobRunner(workerPath, uri.fsPath),
          };
        }
        // file 以外（リモートの仮想ファイルなど）は、全体を読み込んでその場で処理する
        const source = new MemorySource(await vscode.workspace.fs.readFile(uri));
        return { source, runner: new InProcessJobRunner(source) };
      },
      post: (message) => {
        this.messageLog?.get(uri.toString())?.push(message);
        void panel.webview.postMessage(message);
      },
      copy: async (text) => {
        await vscode.env.clipboard.writeText(text);
      },
      openSource: async (line: number, encoding: EncodingId) => {
        const document = await vscode.workspace.openTextDocument(uri, { encoding });
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        await vscode.window.showTextDocument(document, {
          selection: new vscode.Range(position, position),
        });
      },
    };
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

  testApi(): CsvLensTestApi {
    return {
      messages: (uri) => this.messageLog?.get(uri.toString()) ?? [],
      send: async (uri, message) => {
        const session = this.sessions.get(uri.toString());
        if (!session) {
          throw new Error('Not open: ' + uri.toString());
        }
        await session.handle(message);
      },
    };
  }
}
