import * as assert from 'assert';
import { computeViewport, scrollTopForRow, ViewportInput } from '../../core/view/viewport';

function input(overrides: Partial<ViewportInput>): ViewportInput {
  return {
    scrollTop: 0,
    viewportHeight: 200,
    rowHeight: 20,
    totalRows: 100,
    maxContentHeight: 1_000_000,
    ...overrides,
  };
}

suite('computeViewport', () => {
  test('全体の高さが上限に収まるときは、行の高さで割って先頭の Row を決める', () => {
    assert.deepStrictEqual(computeViewport(input({})), {
      firstRow: 1,
      visibleCount: 11,
      contentHeight: 2000,
    });
    assert.strictEqual(computeViewport(input({ scrollTop: 45 })).firstRow, 3);
  });

  test('一番下までスクロールすると、最後の行が画面に収まる位置になる', () => {
    const view = computeViewport(input({ scrollTop: 1800 }));
    assert.strictEqual(view.firstRow, 91);
    assert.strictEqual(view.firstRow + view.visibleCount - 1 >= 100, true);
    assert.strictEqual(view.visibleCount, 10);
  });

  test('上限を超えるときは、高さを上限に抑え、スクロールの比率で Row を決める', () => {
    const big = { totalRows: 10_000_000, rowHeight: 24, viewportHeight: 480 };
    const maxContentHeight = 10_000_000;
    const top = computeViewport(input({ ...big, maxContentHeight }));
    assert.strictEqual(top.contentHeight, maxContentHeight);
    assert.strictEqual(top.firstRow, 1);
    const bottom = computeViewport(
      input({ ...big, maxContentHeight, scrollTop: maxContentHeight - 480 })
    );
    assert.strictEqual(bottom.firstRow, 10_000_000 - 20 + 1);
    const middle = computeViewport(
      input({ ...big, maxContentHeight, scrollTop: (maxContentHeight - 480) / 2 })
    );
    assert.ok(Math.abs(middle.firstRow - 5_000_000) < 10, String(middle.firstRow));
  });

  test('行が無ければ何も表示しない。画面より行が少なければ、その行数だけ表示する', () => {
    assert.deepStrictEqual(computeViewport(input({ totalRows: 0 })), {
      firstRow: 1,
      visibleCount: 0,
      contentHeight: 0,
    });
    assert.strictEqual(computeViewport(input({ totalRows: 3 })).visibleCount, 3);
  });

  test('範囲の外のスクロール位置でも、Row を範囲に収める', () => {
    assert.strictEqual(computeViewport(input({ scrollTop: -50 })).firstRow, 1);
    assert.strictEqual(computeViewport(input({ scrollTop: 99_999 })).firstRow, 91);
  });
});

suite('scrollTopForRow', () => {
  test('その Row が先頭に来るスクロール位置を返す（computeViewport の逆）', () => {
    for (const row of [1, 2, 50, 91]) {
      const top = scrollTopForRow(row, input({}));
      assert.strictEqual(computeViewport(input({ scrollTop: top })).firstRow, row, String(row));
    }
  });

  test('比率で換算するときも、逆算すると同じ Row になる', () => {
    const big = input({ totalRows: 10_000_000, rowHeight: 24, maxContentHeight: 10_000_000 });
    for (const row of [1, 1234, 5_000_000, 9_999_981]) {
      const top = scrollTopForRow(row, big);
      assert.strictEqual(computeViewport({ ...big, scrollTop: top }).firstRow, row, String(row));
    }
  });

  test('最後の方の Row は、一番下のスクロール位置に抑える', () => {
    assert.strictEqual(scrollTopForRow(100, input({})), 1800);
  });
});
