import * as assert from 'assert';
import { MoveContext, moveCell, moveKeyFor, stepRow } from '../../core/view/keyboard';

function key(
  name: string,
  mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  return {
    key: name,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  };
}

suite('moveKeyFor', () => {
  test('矢印、PageUp / PageDown、Home / End を移動に対応させる', () => {
    assert.strictEqual(moveKeyFor(key('ArrowUp')), 'up');
    assert.strictEqual(moveKeyFor(key('ArrowDown')), 'down');
    assert.strictEqual(moveKeyFor(key('ArrowLeft')), 'left');
    assert.strictEqual(moveKeyFor(key('ArrowRight')), 'right');
    assert.strictEqual(moveKeyFor(key('PageUp')), 'pageUp');
    assert.strictEqual(moveKeyFor(key('PageDown')), 'pageDown');
    assert.strictEqual(moveKeyFor(key('Home')), 'home');
    assert.strictEqual(moveKeyFor(key('End')), 'end');
  });

  test('Ctrl+Home / Ctrl+End（Mac は Cmd も）は先頭と末尾の行', () => {
    assert.strictEqual(moveKeyFor(key('Home', { ctrl: true })), 'first');
    assert.strictEqual(moveKeyFor(key('End', { ctrl: true })), 'last');
    assert.strictEqual(moveKeyFor(key('Home', { meta: true })), 'first');
    assert.strictEqual(moveKeyFor(key('End', { meta: true })), 'last');
  });

  test('Shift や Alt と一緒のとき、ほかのキーのときは移動しない', () => {
    assert.strictEqual(moveKeyFor(key('ArrowDown', { shift: true })), undefined);
    assert.strictEqual(moveKeyFor(key('ArrowDown', { alt: true })), undefined);
    assert.strictEqual(moveKeyFor(key('ArrowDown', { ctrl: true })), undefined);
    assert.strictEqual(moveKeyFor(key('a')), undefined);
    assert.strictEqual(moveKeyFor(key('Enter')), undefined);
  });
});

suite('moveCell', () => {
  const context: MoveContext = {
    rowCount: 100,
    columnCount: 5,
    pageRows: 20,
    topIndex: 30,
    countDone: true,
  };
  const at = (index: number, columnIndex: number) => ({ index, columnIndex });

  test('上下左右に 1 つずつ動く', () => {
    assert.deepStrictEqual(moveCell(at(10, 2), 'up', context), at(9, 2));
    assert.deepStrictEqual(moveCell(at(10, 2), 'down', context), at(11, 2));
    assert.deepStrictEqual(moveCell(at(10, 2), 'left', context), at(10, 1));
    assert.deepStrictEqual(moveCell(at(10, 2), 'right', context), at(10, 3));
  });

  test('範囲の端では止まる', () => {
    assert.deepStrictEqual(moveCell(at(0, 0), 'up', context), at(0, 0));
    assert.deepStrictEqual(moveCell(at(0, 0), 'left', context), at(0, 0));
    assert.deepStrictEqual(moveCell(at(99, 4), 'down', context), at(99, 4));
    assert.deepStrictEqual(moveCell(at(99, 4), 'right', context), at(99, 4));
  });

  test('PageUp / PageDown は 1 画面ぶん動き、端で止まる', () => {
    assert.deepStrictEqual(moveCell(at(50, 1), 'pageDown', context), at(70, 1));
    assert.deepStrictEqual(moveCell(at(50, 1), 'pageUp', context), at(30, 1));
    assert.deepStrictEqual(moveCell(at(90, 1), 'pageDown', context), at(99, 1));
    assert.deepStrictEqual(moveCell(at(5, 1), 'pageUp', context), at(0, 1));
  });

  test('1 画面の行数が 0 でも、少なくとも 1 行動く', () => {
    assert.deepStrictEqual(moveCell(at(5, 1), 'pageDown', { ...context, pageRows: 0 }), at(6, 1));
  });

  test('Home / End は行の先頭と末尾の列', () => {
    assert.deepStrictEqual(moveCell(at(10, 2), 'home', context), at(10, 0));
    assert.deepStrictEqual(moveCell(at(10, 2), 'end', context), at(10, 4));
  });

  test('Ctrl+Home / Ctrl+End は先頭と末尾の行。列は保つ', () => {
    assert.deepStrictEqual(moveCell(at(10, 2), 'first', context), at(0, 2));
    assert.deepStrictEqual(moveCell(at(10, 2), 'last', context), at(99, 2));
  });

  test('行数を数え終える前の Ctrl+End は counting で、移動しない', () => {
    const counting = { ...context, countDone: false };
    assert.deepStrictEqual(moveCell(at(10, 2), 'last', counting), { error: 'counting' });
    assert.deepStrictEqual(moveCell(undefined, 'last', counting), { error: 'counting' });
    assert.deepStrictEqual(moveCell(at(10, 2), 'down', counting), at(11, 2));
  });

  test('何も選んでいなければ、どのキーでも表示中の先頭のセルを選ぶ', () => {
    for (const k of ['up', 'down', 'right', 'pageDown', 'end', 'first', 'last'] as const) {
      assert.deepStrictEqual(moveCell(undefined, k, context), at(30, 0), k);
    }
  });

  test('表示中の先頭が範囲の外なら、範囲に収める', () => {
    assert.deepStrictEqual(moveCell(undefined, 'down', { ...context, topIndex: 500 }), at(99, 0));
  });

  test('行か列が 1 つも無ければ選ばない', () => {
    assert.strictEqual(moveCell(at(0, 0), 'down', { ...context, rowCount: 0 }), undefined);
    assert.strictEqual(moveCell(undefined, 'down', { ...context, columnCount: 0 }), undefined);
  });

  test('選んだ列が範囲の外（非表示にした列など）なら、範囲に収めてから動く', () => {
    assert.deepStrictEqual(moveCell(at(10, -1), 'down', context), at(11, 0));
    assert.deepStrictEqual(moveCell(at(10, 9), 'left', context), at(10, 3));
  });
});

suite('stepRow', () => {
  test('前後の行の index。範囲の端では undefined', () => {
    assert.strictEqual(stepRow(5, 'previous', 10), 4);
    assert.strictEqual(stepRow(5, 'next', 10), 6);
    assert.strictEqual(stepRow(0, 'previous', 10), undefined);
    assert.strictEqual(stepRow(9, 'next', 10), undefined);
  });

  test('選んだ行の位置が分からなければ undefined', () => {
    assert.strictEqual(stepRow(undefined, 'next', 10), undefined);
    assert.strictEqual(stepRow(undefined, 'previous', 10), undefined);
  });
});
