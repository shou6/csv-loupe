import * as assert from 'assert';
import { CsvFormat } from '../../core/csv/types';
import { sortOrder, sortRows } from '../../core/sort/sorter';
import { MemorySource } from '../../core/source/memorySource';
import { utf8 } from '../support/bytes';

const UTF8: CsvFormat = { encoding: 'utf8', delimiter: 'comma', dataStart: 0 };

suite('sortOrder', () => {
  test('数字の列は数として比べる', () => {
    assert.deepStrictEqual([...sortOrder(['10', '9', '100', '-1.5'], 'asc')], [3, 1, 0, 2]);
    assert.deepStrictEqual([...sortOrder(['10', '9', '100'], 'desc')], [2, 0, 1]);
  });

  test('文字の列は、数字の部分を数として比べる', () => {
    assert.deepStrictEqual([...sortOrder(['item10', 'item2', 'apple'], 'asc')], [2, 1, 0]);
  });

  test('空のセルは向きに関係なく最後に置く', () => {
    assert.deepStrictEqual([...sortOrder(['2', '', '1'], 'asc')], [2, 0, 1]);
    assert.deepStrictEqual([...sortOrder(['2', '', '1'], 'desc')], [0, 2, 1]);
  });

  test('同じ値は元の順を保つ（降順でも）', () => {
    assert.deepStrictEqual([...sortOrder(['b', 'a', 'b', 'a'], 'asc')], [1, 3, 0, 2]);
    assert.deepStrictEqual([...sortOrder(['b', 'a', 'b', 'a'], 'desc')], [0, 2, 1, 3]);
  });

  test('前後の空白は比べるときに除く', () => {
    assert.deepStrictEqual([...sortOrder([' 57', '9'], 'asc')], [1, 0]);
  });
});

suite('sortRows', () => {
  test('ファイルの列の値で並べ替えた順の Row を返す。ヘッダーは含めない', async () => {
    const source = new MemorySource(utf8('id,score\n1,30\n2,"1\n0"\n3,20\n'));
    // 「1↵0」は数字でないので、列全体を文字として比べる
    assert.deepStrictEqual(await sortRows(source, UTF8, 1, 'asc', 1), [2, 3, 1]);
  });

  test('ヘッダーなしなら先頭のレコードも Row 1 として並べ替える', async () => {
    const source = new MemorySource(utf8('b\na\nc\n'));
    assert.deepStrictEqual(await sortRows(source, UTF8, 0, 'asc', 0), [2, 1, 3]);
  });
});
