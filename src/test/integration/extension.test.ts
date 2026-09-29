import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// out/test/integration から見たプロジェクトルート
const ROOT = path.resolve(__dirname, '../../..');

interface Manifest {
  name: string;
  publisher: string;
  contributes?: { commands?: { command: string }[] };
}

function readManifest(): Manifest {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Manifest;
}

function extensionId(): string {
  const manifest = readManifest();
  return manifest.publisher + '.' + manifest.name;
}

/** 条件を満たすまで待つ。満たさなければ失敗にする */
async function waitUntil(condition: () => boolean, message: string, timeout = 10_000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      assert.fail('時間内に満たされなかった: ' + message);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function activeViewType(): string | undefined {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.viewType : undefined;
}

suite('Extension', () => {
  let dir: string;

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-loupe-'));
  });

  suiteTeardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // 閉じたエディタがファイルを閉じ終える前だと Windows で削除に失敗するので、再試行する
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  });

  test('拡張機能が読み込まれ、有効化できる', async () => {
    const extension = vscode.extensions.getExtension(extensionId());
    assert.ok(extension, '拡張機能が見つからない: ' + extensionId());
    await extension.activate();
    assert.strictEqual(extension.isActive, true);
  });

  test('package.json に書いたコマンドが、すべて登録されている', async () => {
    await vscode.extensions.getExtension(extensionId())?.activate();
    const registered = await vscode.commands.getCommands(true);
    const declared = (readManifest().contributes?.commands ?? []).map((c) => c.command);
    assert.ok(declared.length > 0, 'package.json にコマンドが無い');
    assert.deepStrictEqual(
      declared.filter((command) => !registered.includes(command)),
      [],
      '登録されていないコマンド'
    );
  });

  for (const name of ['sample.csv', 'sample.tsv']) {
    test(name + ' を開くと、既定で CSV Loupe のエディタになる', async () => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, 'id,name\n1,a\n');
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
      await waitUntil(() => activeViewType() === 'csvLoupe.editor', 'CSV Loupe で開く');
    });
  }

  test('拡張機能ホストの TextDecoder が Shift_JIS（CP932）を読める', () => {
    // 「表①」: ① は CP932 の拡張文字（0x87 0x40）
    const bytes = Uint8Array.from([0x95, 0x5c, 0x87, 0x40]);
    assert.strictEqual(new TextDecoder('shift_jis').decode(bytes), '表①');
  });
});
