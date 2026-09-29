import * as assert from 'assert';
import { matchColumns, visibleColumns } from '../../core/view/columns';

suite('visibleColumns と matchColumns', () => {
  test('非表示にした列を除いた列の番号を、元の順で返す', () => {
    assert.deepStrictEqual(visibleColumns(5, new Set([1, 3])), [0, 2, 4]);
    assert.deepStrictEqual(visibleColumns(3, new Set()), [0, 1, 2]);
  });

  test('列名の一部で絞り込む。大文字と小文字は区別しない。空なら全列', () => {
    const names = ['id', 'Race Name', 'race_id', '場所'];
    assert.deepStrictEqual(matchColumns(names, 'ID'), [0, 2]);
    assert.deepStrictEqual(matchColumns(names, ' race '), [1, 2]);
    assert.deepStrictEqual(matchColumns(names, '場'), [3]);
    assert.deepStrictEqual(matchColumns(names, ''), [0, 1, 2, 3]);
  });
});
