import * as assert from 'assert';
import { createTranslator } from '../../core/translate';
import { columnNames } from '../../core/view/columns';

const t = createTranslator(undefined);

suite('columnNames', () => {
  test('ヘッダーありなら見出しを使い、見出しより多い列は番号で呼ぶ', () => {
    assert.deepStrictEqual(columnNames(['id', 'name'], true, 3, t), ['id', 'name', '(column 3)']);
  });

  test('ヘッダーなしなら「Column 1」「Column 2」…とする', () => {
    assert.deepStrictEqual(columnNames([], false, 3, t), ['Column 1', 'Column 2', 'Column 3']);
  });

  test('日本語に訳せる', () => {
    const ja = createTranslator({ 'Column {0}': '列 {0}' });
    assert.deepStrictEqual(columnNames([], false, 2, ja), ['列 1', '列 2']);
  });
});
