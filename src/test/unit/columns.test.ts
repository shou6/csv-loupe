import * as assert from 'assert';
import { createTranslator } from '../../core/translate';
import { columnNames, headerLabelLines } from '../../core/view/columns';

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

suite('headerLabelLines', () => {
  const lines = [
    ['売上', '', '原価'],
    ['4月', '5月', ''],
  ];

  test('ヘッダーが複数行なら、その列の各行の値を上から順に返す', () => {
    assert.deepStrictEqual(headerLabelLines(lines, 0, '売上 / 4月'), ['売上', '4月']);
    assert.deepStrictEqual(headerLabelLines(lines, 1, '5月'), ['', '5月']);
    assert.deepStrictEqual(headerLabelLines(lines, 2, '原価'), ['原価', '']);
  });

  test('どの行にも値の無い列は、列名を一番上の段に出す', () => {
    assert.deepStrictEqual(headerLabelLines(lines, 3, '(column 4)'), ['(column 4)', '']);
  });

  test('ヘッダーが 1 行以下なら、列名だけを返す', () => {
    assert.deepStrictEqual(headerLabelLines([['id', 'name']], 1, 'name'), ['name']);
    assert.deepStrictEqual(headerLabelLines([], 0, 'Column 1'), ['Column 1']);
  });
});
