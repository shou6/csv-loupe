import * as vscode from 'vscode';
import { ContextCommand } from './core/protocol';
import { CsvLoupeEditorProvider, VIEW_TYPE } from './host/editorProvider';
import { CsvLoupeTestApi } from './host/testApi';

const CONTEXT_COMMANDS: ContextCommand[] = [
  'copyCell',
  'copyRow',
  'findSameValue',
  'openRecordView',
  'openSourceAtRow',
];

/** エントリポイント。登録だけを行い、ロジックは各モジュールに置く。テストの実行時だけテスト用の API を返す */
export function activate(context: vscode.ExtensionContext): CsvLoupeTestApi | undefined {
  const testing = context.extensionMode === vscode.ExtensionMode.Test;
  const provider = new CsvLoupeEditorProvider(context.extensionUri, { recordMessages: testing });
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    ...CONTEXT_COMMANDS.map((command) =>
      vscode.commands.registerCommand('csvLoupe.' + command, (cell: unknown) =>
        provider.runContextCommand(command, cell)
      )
    )
  );
  return testing ? provider.testApi() : undefined;
}

export function deactivate(): void {}
