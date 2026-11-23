import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { COLOR_THEMES, colorThemeFromSetting } from '../../core/view/colorTheme';

suite('colorThemeFromSetting', () => {
  test('設定の値をそのままテーマにする', () => {
    assert.deepStrictEqual(
      COLOR_THEMES.map((theme) => colorThemeFromSetting(theme)),
      ['purple', 'teal', 'vscode']
    );
  });

  test('知らない値や未設定なら、既定の purple', () => {
    for (const value of [undefined, null, '', 'Purple', 'red', 1, {}]) {
      assert.strictEqual(colorThemeFromSetting(value), 'purple', String(value));
    }
  });

  test('package.json に設定を定義している。選択肢は purple / teal / vscode、既定は purple', () => {
    const root = path.resolve(__dirname, '../../..');
    const read = (name: string) =>
      JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')) as Record<string, unknown>;
    const packageJson = read('package.json') as {
      contributes: {
        configuration: {
          properties: Record<
            string,
            { enum?: string[]; default?: unknown; enumDescriptions?: string[] }
          >;
        };
      };
    };
    const setting = packageJson.contributes.configuration.properties['csvLoupe.colorTheme'];
    assert.ok(setting, 'csvLoupe.colorTheme が無い');
    assert.deepStrictEqual(setting.enum, ['purple', 'teal', 'vscode']);
    assert.strictEqual(setting.default, 'purple');
    // 選択肢の説明は %key% にし、英語と日本語の両方に定義する
    const keys = (setting.enumDescriptions ?? []).map((text) => text.replace(/^%|%$/g, ''));
    assert.strictEqual(keys.length, 3);
    for (const nls of ['package.nls.json', 'package.nls.ja.json']) {
      const table = read(nls);
      for (const key of keys) {
        assert.ok(typeof table[key] === 'string', nls + ' に ' + key + ' が無い');
      }
    }
  });
});
