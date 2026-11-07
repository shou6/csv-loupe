import * as assert from 'assert';
import { DEFAULT_PREFERENCES, readPreferences } from '../../core/preferences';

suite('readPreferences', () => {
  test('保存が無ければ既定。空の値は隠さない', () => {
    assert.deepStrictEqual(readPreferences(undefined), DEFAULT_PREFERENCES);
    assert.strictEqual(DEFAULT_PREFERENCES.hideEmptyValues, false);
  });

  test('保存した値を読む', () => {
    assert.deepStrictEqual(readPreferences({ hideEmptyValues: true }), {
      ...DEFAULT_PREFERENCES,
      hideEmptyValues: true,
    });
  });

  test('型の合わない値は既定に戻す', () => {
    assert.deepStrictEqual(readPreferences({ hideEmptyValues: 'yes' }), DEFAULT_PREFERENCES);
    assert.deepStrictEqual(readPreferences('broken'), DEFAULT_PREFERENCES);
    assert.deepStrictEqual(readPreferences(null), DEFAULT_PREFERENCES);
  });
});
