import * as assert from 'assert';
import { MAX_FIT_WIDTH, MIN_COLUMN_WIDTH, fitColumnWidth } from '../../core/view/columnWidth';

suite('fitColumnWidth', () => {
  test('最も広い内容に合わせる（切り上げ）', () => {
    assert.strictEqual(fitColumnWidth([80, 120.2, 95]), 121);
  });

  test('下限は最小幅の 40px', () => {
    assert.strictEqual(MIN_COLUMN_WIDTH, 40);
    assert.strictEqual(fitColumnWidth([12, 30]), MIN_COLUMN_WIDTH);
    assert.strictEqual(fitColumnWidth([]), MIN_COLUMN_WIDTH);
  });

  test('上限より広くしない', () => {
    assert.strictEqual(fitColumnWidth([MAX_FIT_WIDTH + 500]), MAX_FIT_WIDTH);
  });
});
