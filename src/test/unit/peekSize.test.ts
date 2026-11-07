import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { peekSizeFromSetting } from '../../core/view/peekSize';

suite('peekSizeFromSetting', () => {
  test('設定の値を表示行数にする。All は 0', () => {
    assert.strictEqual(peekSizeFromSetting('1'), 1);
    assert.strictEqual(peekSizeFromSetting('10'), 10);
    assert.strictEqual(peekSizeFromSetting('100'), 100);
    assert.strictEqual(peekSizeFromSetting('all'), 0);
  });

  test('知らない値や未設定なら、既定の 10', () => {
    for (const value of [undefined, null, '', '5', 'ALL', 10, {}]) {
      assert.strictEqual(peekSizeFromSetting(value), 10, String(value));
    }
  });

  test('package.json に設定を定義している。選択肢は 1 / 10 / 100 / all、既定は 10', () => {
    const root = path.resolve(__dirname, '../../..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      contributes: {
        configuration: { properties: Record<string, { enum?: string[]; default?: unknown }> };
      };
    };
    const setting = packageJson.contributes.configuration.properties['csvLoupe.initialRowCount'];
    assert.ok(setting, 'csvLoupe.initialRowCount が無い');
    assert.deepStrictEqual(setting.enum, ['1', '10', '100', 'all']);
    assert.strictEqual(setting.default, '10');
  });
});
