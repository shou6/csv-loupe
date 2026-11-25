import * as assert from 'assert';
import { createTranslator } from '../../core/translate';
import { findKeyAction, findStatusText, FindStatus } from '../../core/view/findBar';

const t = createTranslator(undefined);

function key(name: string, options: { shift?: boolean; ctrl?: boolean } = {}) {
  return {
    key: name,
    shiftKey: options.shift ?? false,
    ctrlKey: options.ctrl ?? false,
    metaKey: false,
    altKey: false,
  };
}

suite('findKeyAction', () => {
  test('検索欄では Enter・↓・F3 で次へ、Shift+Enter・↑・Shift+F3 で前へ、Esc でリセット', () => {
    assert.deepStrictEqual(
      [
        key('Enter'),
        key('ArrowDown'),
        key('F3'),
        key('Enter', { shift: true }),
        key('ArrowUp'),
        key('F3', { shift: true }),
        key('Escape'),
      ].map((input) => findKeyAction(input, 'input')),
      ['next', 'next', 'next', 'previous', 'previous', 'previous', 'clear']
    );
  });

  test('検索欄の外では F3 と Shift+F3 だけを受ける（矢印キーは表の移動に使う）', () => {
    assert.deepStrictEqual(
      [key('F3'), key('F3', { shift: true }), key('ArrowDown'), key('Enter'), key('Escape')].map(
        (input) => findKeyAction(input, 'global')
      ),
      ['next', 'previous', undefined, undefined, undefined]
    );
  });

  test('ほかのキーや Ctrl との組み合わせは受けない', () => {
    assert.deepStrictEqual(
      [key('a'), key('ArrowDown', { ctrl: true }), key('F3', { ctrl: true })].map((input) =>
        findKeyAction(input, 'input')
      ),
      [undefined, undefined, undefined]
    );
  });
});

suite('findStatusText', () => {
  const base: FindStatus = {
    total: 0,
    current: -1,
    stored: 0,
    done: true,
    truncated: false,
    percent: 100,
  };

  test('検索していなければ空', () => {
    assert.strictEqual(findStatusText(base, t, false), '');
  });

  test('一致が無ければ No results', () => {
    assert.strictEqual(findStatusText(base, t, true), 'No results');
  });

  test('一致した箇所を選んでいれば「3 / 120」の形', () => {
    assert.strictEqual(
      findStatusText({ ...base, total: 1200, stored: 1200, current: 2 }, t, true),
      '3 / 1,200'
    );
  });

  test('選んでいなければ件数', () => {
    assert.strictEqual(findStatusText({ ...base, total: 1, stored: 1 }, t, true), '1 match');
    assert.strictEqual(findStatusText({ ...base, total: 5, stored: 5 }, t, true), '5 matches');
  });

  test('検索中は進み具合を付ける', () => {
    assert.strictEqual(
      findStatusText({ ...base, done: false, percent: 40, total: 2, current: 0 }, t, true),
      '1 / 2 (searching… 40%)'
    );
  });

  test('移動できる件数が上限に達したら、その件数を付ける', () => {
    assert.strictEqual(
      findStatusText(
        { ...base, total: 20000, stored: 10000, current: 0, truncated: true },
        t,
        true
      ),
      '1 / 20,000 (moves through the first 10,000)'
    );
  });
});
