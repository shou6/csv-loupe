import * as assert from 'assert';
import { createTranslator } from '../../core/translate';
import { recordPairs } from '../../core/view/record';

const t = createTranslator(undefined);

suite('recordPairs', () => {
  test('列名と値の組を、列の順に並べる', () => {
    assert.deepStrictEqual(recordPairs(['id', 'name'], ['1', 'Tanaka'], t), [
      { column: 0, name: 'id', value: '1' },
      { column: 1, name: 'name', value: 'Tanaka' },
    ]);
  });

  test('ヘッダーより少ない行は、足りない列を空にする', () => {
    assert.deepStrictEqual(recordPairs(['id', 'name', 'status'], ['1'], t), [
      { column: 0, name: 'id', value: '1' },
      { column: 1, name: 'name', value: '' },
      { column: 2, name: 'status', value: '' },
    ]);
  });

  test('ヘッダーより多い行は、余った列に番号で名前を付ける', () => {
    assert.deepStrictEqual(recordPairs(['id'], ['1', 'x', 'y'], t), [
      { column: 0, name: 'id', value: '1' },
      { column: 1, name: '(column 2)', value: 'x' },
      { column: 2, name: '(column 3)', value: 'y' },
    ]);
  });

  test('余った列の名前は翻訳する', () => {
    const ja = createTranslator({ '(column {0})': '（{0} 列目）' });
    assert.strictEqual(recordPairs([], ['x'], ja)[0].name, '（1 列目）');
  });
});
