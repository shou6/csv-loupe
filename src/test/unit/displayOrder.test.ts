import * as assert from 'assert';
import { displayOrder } from '../../core/view/displayOrder';

suite('displayOrder', () => {
  const sorted = Uint32Array.from([3, 1, 4, 2, 5]);
  const filtered = Uint32Array.from([2, 3, 5]);

  test('並べ替えも絞り込みもしていなければ、元の順（undefined）', () => {
    assert.strictEqual(displayOrder(undefined, undefined), undefined);
  });

  test('並べ替えだけなら、並べ替えた順', () => {
    assert.deepStrictEqual(Array.from(displayOrder(sorted, undefined) ?? []), [3, 1, 4, 2, 5]);
  });

  test('絞り込みだけなら、一致した行を元の順で', () => {
    assert.deepStrictEqual(Array.from(displayOrder(undefined, filtered) ?? []), [2, 3, 5]);
  });

  test('両方なら、並べ替えた順のうち一致した行だけ', () => {
    assert.deepStrictEqual(Array.from(displayOrder(sorted, filtered) ?? []), [3, 2, 5]);
  });

  test('一致した行が無ければ、空', () => {
    assert.deepStrictEqual(Array.from(displayOrder(sorted, new Uint32Array(0)) ?? [9]), []);
  });
});
