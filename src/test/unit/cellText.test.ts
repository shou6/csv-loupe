import * as assert from 'assert';
import { trimForDisplay } from '../../core/view/cellText';

suite('trimForDisplay', () => {
  test('前後の空白を詰め、どちらにあったかを返す', () => {
    assert.deepStrictEqual(trimForDisplay(' 57'), { text: '57', leading: true, trailing: false });
    assert.deepStrictEqual(trimForDisplay('35.0  '), {
      text: '35.0',
      leading: false,
      trailing: true,
    });
    assert.deepStrictEqual(trimForDisplay('\t x \t'), { text: 'x', leading: true, trailing: true });
  });

  test('全角の空白も空白として扱う', () => {
    assert.deepStrictEqual(trimForDisplay('　３上'), {
      text: '３上',
      leading: true,
      trailing: false,
    });
  });

  test('間の空白と、空白の無い値はそのまま', () => {
    assert.deepStrictEqual(trimForDisplay('a b'), { text: 'a b', leading: false, trailing: false });
    assert.deepStrictEqual(trimForDisplay(''), { text: '', leading: false, trailing: false });
  });

  test('空白だけの値は、空にして先頭に空白があったとする', () => {
    assert.deepStrictEqual(trimForDisplay('   '), { text: '', leading: true, trailing: false });
  });
});
