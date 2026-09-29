import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { HostMessage, InitMessage } from '../../core/protocol';
import { CsvLensTestApi } from '../../host/testApi';

async function api(): Promise<CsvLensTestApi> {
  const extension = vscode.extensions.all.find((e) => e.id.endsWith('.csv-lens'));
  assert.ok(extension, '拡張機能が見つからない');
  const exported = (await extension.activate()) as CsvLensTestApi | undefined;
  assert.ok(exported, 'テスト用の API を返していない');
  return exported;
}

async function waitFor<T>(find: () => T | undefined, message: string, timeout = 15_000) {
  const start = Date.now();
  for (;;) {
    const found = find();
    if (found !== undefined) {
      return found;
    }
    if (Date.now() - start > timeout) {
      assert.fail('時間内に届かなかった: ' + message);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** find で見つかるまで action を繰り返す。ファイルの監視は、開いた直後にはまだ始まっていないことがある */
async function retryUntil<T>(action: () => void, find: () => T | undefined, message: string) {
  const start = Date.now();
  for (;;) {
    action();
    try {
      return await waitFor(find, message, 1_000);
    } catch (error) {
      if (Date.now() - start > 15_000) {
        throw error;
      }
    }
  }
}

function lastOf<T extends HostMessage['type']>(
  messages: HostMessage[],
  type: T
): Extract<HostMessage, { type: T }> | undefined {
  const found = messages.filter((m): m is Extract<HostMessage, { type: T }> => m.type === type);
  return found[found.length - 1];
}

suite('CSV Lens のエディタ', () => {
  let dir: string;
  let testApi: CsvLensTestApi;

  suiteSetup(async () => {
    // macOS の一時ディレクトリはシンボリックリンク（/var → /private/var）なので、実体のパスで監視する
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'csv-lens-')));
    testApi = await api();
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // 閉じたエディタがファイルを閉じ終える前だと Windows で削除に失敗するので、再試行する
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  async function open(name: string, content: string | Uint8Array): Promise<vscode.Uri> {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content);
    const uri = vscode.Uri.file(file);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'csvLens.editor');
    return uri;
  }

  async function init(uri: vscode.Uri): Promise<InitMessage> {
    return waitFor(() => lastOf(testApi.messages(uri), 'init'), 'init');
  }

  test('開くと、ヘッダーと先頭の 100 行を送り、Worker で残りの行数を数える', async () => {
    let text = 'id,name\n';
    for (let i = 1; i <= 5000; i++) {
      text += i + ',name' + i + '\n';
    }
    const uri = await open('large.csv', text);
    const first = await init(uri);
    assert.deepStrictEqual(first.header, ['id', 'name']);
    assert.strictEqual(first.rows.length, 100);
    const done = await waitFor(() => {
      const progress = lastOf(testApi.messages(uri), 'progress');
      return progress?.countDone ? progress : undefined;
    }, '行数を数え終える');
    assert.strictEqual(done.rowsCounted, 5000);
  });

  test('CP932 のファイルを Shift_JIS として読む', async () => {
    // 表,ポ ↵ あ,①
    const bytes = Uint8Array.from([
      0x95, 0x5c, 0x2c, 0x83, 0x7c, 0x0a, 0x82, 0xa0, 0x2c, 0x87, 0x40, 0x0a,
    ]);
    const message = await init(await open('sjis.csv', bytes));
    assert.strictEqual(message.encoding, 'shiftjis');
    assert.deepStrictEqual(message.header, ['表', 'ポ']);
    assert.deepStrictEqual(message.rows[0].cells, ['あ', '①']);
  });

  test('.tsv はタブ区切りとして読む', async () => {
    const message = await init(await open('data.tsv', 'a\tb\n1\t2\n'));
    assert.strictEqual(message.delimiter, 'tab');
    assert.deepStrictEqual(message.header, ['a', 'b']);
  });

  test('右クリックメニューのコマンドを、対象のセルと一緒に Webview へ送る', async () => {
    const uri = await open('menu.csv', 'a,b\n1,2\n');
    await init(uri);
    await vscode.commands.executeCommand('csvLens.copyCell', {
      webview: 'csvLens.editor',
      webviewSection: 'cell',
      row: 1,
      column: 1,
    });
    const message = await waitFor(
      () => lastOf(testApi.messages(uri), 'contextCommand'),
      'contextCommand'
    );
    assert.deepStrictEqual(message, {
      type: 'contextCommand',
      command: 'copyCell',
      row: 1,
      column: 1,
    });
  });

  test('Webview から頼まれた文字列をクリップボードに入れる', async () => {
    const uri = await open('copy.csv', 'a,b\n1,2\n');
    await init(uri);
    await testApi.send(uri, { type: 'copy', text: '1\t2' });
    assert.strictEqual(await vscode.env.clipboard.readText(), '1\t2');
  });

  test('元のファイルを、CSV Lens と同じ文字コードの標準のテキストエディタで開き、指定した行へ移る', async () => {
    // 表,ポ ↵ あ,"①↵x" ↵ z
    const bytes = Uint8Array.from([
      0x95, 0x5c, 0x2c, 0x83, 0x7c, 0x0a, 0x82, 0xa0, 0x2c, 0x22, 0x87, 0x40, 0x0a, 0x78, 0x22,
      0x0a, 0x7a, 0x0a,
    ]);
    const uri = await open('source.csv', bytes);
    await init(uri);
    await testApi.send(uri, { type: 'openSource', line: 4 });
    const editor = await waitFor(() => {
      const active = vscode.window.activeTextEditor;
      return active?.document.uri.fsPath === uri.fsPath ? active : undefined;
    }, 'テキストエディタで開く');
    assert.strictEqual(editor.selection.active.line, 3);
    assert.strictEqual(editor.document.lineAt(0).text, '表,ポ');
    assert.strictEqual(editor.document.encoding, 'shiftjis');
  });

  test('表示中にファイルが変わったら知らせ、再読み込みで新しい内容を送る', async () => {
    const uri = await open('changing.csv', 'a,b\n1,2\n');
    const before = await init(uri);
    await retryUntil(
      () => fs.writeFileSync(uri.fsPath, 'a,b\n1,2\n3,4\n'),
      () => lastOf(testApi.messages(uri), 'fileChanged'),
      'fileChanged'
    );
    await testApi.send(uri, { type: 'reload' });
    const after = await waitFor(() => {
      const latest = lastOf(testApi.messages(uri), 'init');
      return latest && latest.generation > before.generation ? latest : undefined;
    }, '読み直した init');
    assert.deepStrictEqual(
      after.rows.map((r) => r.cells),
      [
        ['1', '2'],
        ['3', '4'],
      ]
    );
  });

  test('Worker で CSV 全体を検索し、Row と列を返す', async () => {
    let text = 'id,name\n';
    for (let i = 1; i <= 5000; i++) {
      text += i + ',name' + i + '\n';
    }
    testApi.ignoreWebview(vscode.Uri.file(path.join(dir, 'find.csv')));
    const uri = await open('find.csv', text);
    await init(uri);
    await testApi.send(uri, {
      type: 'find',
      searchId: 1,
      query: { text: 'NAME4999', caseSensitive: false, wholeCell: true },
    });
    const done = await waitFor(() => {
      const found = testApi.messages(uri).filter((m) => m.type === 'findProgress' && m.done);
      return found[0];
    }, '検索を終える');
    assert.ok(done.type === 'findProgress');
    const hits = testApi.messages(uri).flatMap((m) => (m.type === 'findProgress' ? m.hits : []));
    assert.deepStrictEqual(hits, [{ row: 4999, column: 1, value: 'name4999' }]);
    assert.strictEqual(done.total, 1);
  });
});
