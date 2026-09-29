import * as assert from 'assert';
import { parseRowInput, tailStart } from '../../core/view/navigation';

suite('parseRowInput', () => {
  test('数字の Row を受け付ける。3 桁区切りのカンマと前後の空白は無視する', () => {
    assert.deepStrictEqual(parseRowInput('12,542', 20000, true), { row: 12542 });
    assert.deepStrictEqual(parseRowInput(' 5 ', 20000, true), { row: 5 });
    assert.deepStrictEqual(parseRowInput('20000', 20000, true), { row: 20000 });
  });

  test('数字でなければ invalid', () => {
    for (const text of ['', 'abc', '1.5', '-3', '1e3']) {
      assert.deepStrictEqual(parseRowInput(text, 100, true), { error: 'invalid' }, text);
    }
  });

  test('範囲の外なら outOfRange', () => {
    assert.deepStrictEqual(parseRowInput('0', 100, true), { error: 'outOfRange' });
    assert.deepStrictEqual(parseRowInput('101', 100, true), { error: 'outOfRange' });
  });

  test('行数を数え終える前は counting（索引の完成後に使える）', () => {
    assert.deepStrictEqual(parseRowInput('5', 100, false), { error: 'counting' });
  });
});

suite('tailStart', () => {
  test('末尾から表示行数ぶんを表示するときの、先頭の Row', () => {
    assert.strictEqual(tailStart(100, 10), 91);
    assert.strictEqual(tailStart(100, 1), 100);
    assert.strictEqual(tailStart(5, 10), 1);
    assert.strictEqual(tailStart(0, 10), 1);
  });
});
