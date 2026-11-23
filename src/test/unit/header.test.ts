import * as assert from 'assert';
import { detectHeader, detectHeaderRow, MAX_HEADER_ROW } from '../../core/csv/header';

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

suite('detectHeaderRow', () => {
  test('先頭がヘッダーなら 1 行目とする', () => {
    const records = [
      ['id', 'name', 'price'],
      ['1', 'a', '100'],
      ['2', 'b', '200'],
      ['3', 'c', '300'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 1, confident: true });
  });

  test('先頭もデータなら、ヘッダーなし（0）とする', () => {
    const records = [
      ['1', '01140', '01', '横山和生'],
      ['1', '01160', '01', '荻野極'],
      ['1', '01171', '01', '西村淳也'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 0, confident: true });
  });

  test('先頭にタイトルの行（空でないセルが極端に少ない行）があれば飛ばし、その次をヘッダーとする', () => {
    const records = [
      ['売上一覧', '', '', ''],
      ['id', 'name', 'price', 'date'],
      ['1', 'a', '100', '2026-01-01'],
      ['2', 'b', '200', '2026-01-02'],
      ['3', 'c', '300', '2026-01-03'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 2, confident: true });
  });

  test('タイトルの行と空の行が続いても飛ばす', () => {
    const records = [
      ['売上一覧', '', ''],
      ['', '', ''],
      [''],
      ['id', 'name', 'price'],
      ['1', 'a', '100'],
      ['2', 'b', '200'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 4, confident: true });
  });

  test('タイトルの行の次がヘッダーらしくなくても、その行をヘッダーとし確信なしとする', () => {
    const records = [
      ['売上一覧', '', ''],
      ['1', 'a', '100'],
      ['2', 'b', '200'],
      ['3', 'c', '300'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 2, confident: false });
  });

  test('飛ばすのは先頭の 9 行まで（ヘッダーは 10 行目まで）', () => {
    const records = [
      ...Array.from({ length: 12 }, () => ['note', '', '']),
      ['id', 'name', 'price'],
      ...Array.from({ length: 20 }, (_, i) => [String(i), 'x' + i, String(i * 10)]),
    ];
    assert.strictEqual(detectHeaderRow(records).headerRow, MAX_HEADER_ROW);
  });

  test('判別できなければ 1 行目とし確信なしとする。行が少なくても同じ', () => {
    const records = [
      ['name', 'comment'],
      ['Tanaka', 'hello world'],
      ['Sato', 'good morning'],
    ];
    assert.deepStrictEqual(detectHeaderRow(records), { headerRow: 1, confident: false });
    assert.deepStrictEqual(detectHeaderRow([['a', 'b']]), { headerRow: 1, confident: false });
    assert.deepStrictEqual(detectHeaderRow([]), { headerRow: 1, confident: false });
  });
});
