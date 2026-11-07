import * as assert from 'assert';
import { MIN_RECORD_WIDTH, MIN_TABLE_WIDTH, clampRecordWidth } from '../../core/view/recordWidth';

suite('clampRecordWidth', () => {
  test('範囲の中ならそのままの幅（整数に丸める）', () => {
    assert.strictEqual(clampRecordWidth(400, 1200), 400);
    assert.strictEqual(clampRecordWidth(400.6, 1200), 401);
  });

  test('レコード表示は最小幅より狭くならない', () => {
    assert.strictEqual(clampRecordWidth(10, 1200), MIN_RECORD_WIDTH);
  });

  test('表が最小幅を下回るほど広くならない', () => {
    assert.strictEqual(clampRecordWidth(1190, 1200), 1200 - MIN_TABLE_WIDTH);
  });

  test('全体が狭く両方の最小幅を取れないときは、レコード表示の最小幅を優先する', () => {
    assert.strictEqual(clampRecordWidth(300, MIN_RECORD_WIDTH + 50), MIN_RECORD_WIDTH);
  });
});
