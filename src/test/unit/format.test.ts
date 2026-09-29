import * as assert from 'assert';
import { formatRecord } from '../../core/csv/format';
import { parseRecord } from '../../core/csv/parser';

suite('formatRecord', () => {
  test('区切り文字でつなぐ', () => {
    assert.strictEqual(formatRecord(['a', 'b', 'c'], ','), 'a,b,c');
    assert.strictEqual(formatRecord(['a', 'b'], '\t'), 'a\tb');
  });

  test('区切り文字、引用符、改行を含むセルだけを引用符で囲み、引用符は二重にする', () => {
    assert.strictEqual(
      formatRecord(['a,b', 'say "hi"', 'x\ny', 'x\r\ny', 'plain'], ','),
      '"a,b","say ""hi""","x\ny","x\r\ny",plain'
    );
  });

  test('区切り文字ごとに、その文字を含むセルだけを囲む', () => {
    assert.strictEqual(formatRecord(['a,b', 'c\td'], '\t'), 'a,b\t"c\td"');
    assert.strictEqual(formatRecord(['a;b', 'c|d'], ';'), '"a;b";c|d');
    assert.strictEqual(formatRecord(['a;b', 'c|d'], '|'), 'a;b|"c|d"');
  });

  test('解析し直すと元のセルに戻る', () => {
    const cells = ['', ' space ', '"', 'a,"b"\nc', '末尾'];
    for (const delimiter of [',', '\t', ';', '|']) {
      assert.deepStrictEqual(
        parseRecord(formatRecord(cells, delimiter), delimiter),
        cells,
        JSON.stringify(delimiter)
      );
    }
  });
});
