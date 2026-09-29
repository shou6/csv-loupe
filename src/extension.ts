import * as vscode from 'vscode';
import { ContextCommand } from './core/protocol';
import { CsvLensEditorProvider, VIEW_TYPE } from './host/editorProvider';

const CONTEXT_COMMANDS: ContextCommand[] = [
  'copyCell',
  'copyRow',
  'findSameValue',
  'openRecordView',
  'openSourceAtRow',
];

/** エントリポイント。登録だけを行い、ロジックは各モジュールに置く */
export function activate(context: vscode.ExtensionContext): void {
  const provider = new CsvLensEditorProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    }),
    ...CONTEXT_COMMANDS.map((command) =>
      vscode.commands.registerCommand(
        'csvLens.' + command.charAt(0).toLowerCase() + command.slice(1),
        (cell: unknown) => provider.runContextCommand(command, cell)
      )
    )
  );
}

export function deactivate(): void {}
