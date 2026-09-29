import * as assert from 'assert';
import { detectHeader } from '../../core/csv/header';

suite('detectHeader', () => {
  test('数字の列の先頭だけが文字なら、ヘッダーありと判別する', () => {
    const records = [
      ['レースID', '日付', '場所', '距離'],
      ['RX001', '20260927', '中山', '1200'],
      ['RX002', '20260927', '阪神', '1600'],
      ['RX003', '20260928', '中山', '1800'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: true, confident: true });
  });

  test('先頭も下の行と同じ形なら、ヘッダーなしと判別する', () => {
    const records = [
      ['1', '01140', '01', '横山和生'],
      ['1', '01160', '01', '荻野極'],
      ['1', '01171', '01', '西村淳也'],
      ['1', '05339', '01', 'ルメール'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: false, confident: true });
  });

  test('長さのそろった列で、先頭だけ長さが違えばヘッダーあり', () => {
    const records = [
      ['code', 'name'],
      ['AB', 'x'],
      ['CD', 'yy'],
      ['EF', 'zzz'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: true, confident: true });
  });

  test('先頭の値が同じ列の下の行にも出てくるなら、データとみなす', () => {
    const records = [
      ['apple', 'red'],
      ['banana', 'yellow'],
      ['apple', 'green'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: false, confident: true });
  });

  test('先頭の中で値が重複していれば、データとみなす', () => {
    const records = [
      ['x', 'x', 'long text'],
      ['a', 'bb', 'ccc'],
      ['dddd', 'e', 'ffff f'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: false, confident: true });
  });

  test('判別できなければ、ヘッダーありとし確信なしとする', () => {
    const records = [
      ['name', 'comment'],
      ['Tanaka', 'hello world'],
      ['Sato', 'good morning'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: true, confident: false });
  });

  test('レコードが 1 件以下なら、ヘッダーありとし確信なしとする', () => {
    assert.deepStrictEqual(detectHeader([['a', 'b']]), { hasHeader: true, confident: false });
    assert.deepStrictEqual(detectHeader([]), { hasHeader: true, confident: false });
  });

  test('空のセルは判別に使わない', () => {
    const records = [
      ['id', 'score'],
      ['1', ''],
      ['2', '90'],
      ['', '75'],
    ];
    assert.deepStrictEqual(detectHeader(records), { hasHeader: true, confident: true });
  });
});
