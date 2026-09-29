import * as assert from 'assert';
import { delimiterChar, delimiterForFileName } from '../../core/csv/delimiter';
import { parseRecord, recordText } from '../../core/csv/parser';
import { RecordScanner, UnitMode } from '../../core/csv/scanner';
import { createDecoder } from '../../core/encoding/decode';
import { concat, cp932, utf16be, utf16le, utf8 } from '../support/bytes';

/** バイト列を chunkSize ごとに区切って走査し、レコードが終わる位置（絶対位置）と、その次の行番号を返す */
function scan(
  bytes: Uint8Array,
  mode: UnitMode,
  delimiter: string,
  chunkSize = bytes.length || 1
): { ends: number[]; lines: number[] } {
  const scanner = new RecordScanner(mode, delimiter.charCodeAt(0), 1);
  const ends: number[] = [];
  const lines: number[] = [];
  for (let pos = 0; pos < bytes.length; pos += chunkSize) {
    const chunk = bytes.subarray(pos, pos + chunkSize);
    scanner.feed(chunk, (end) => {
      ends.push(pos + end);
      lines.push(scanner.line);
    });
  }
  return { ends, lines };
}

suite('delimiterForFileName と delimiterChar', () => {
  test('.tsv はタブ、それ以外はカンマ。拡張子の大文字と小文字は問わない', () => {
    assert.strictEqual(delimiterForFileName('data.tsv'), 'tab');
    assert.strictEqual(delimiterForFileName('DATA.TSV'), 'tab');
    assert.strictEqual(delimiterForFileName('data.csv'), 'comma');
    assert.strictEqual(delimiterForFileName('data'), 'comma');
    assert.strictEqual(delimiterForFileName('tsv.csv'), 'comma');
  });

  test('区切り文字の実際の文字', () => {
    assert.strictEqual(delimiterChar('comma'), ',');
    assert.strictEqual(delimiterChar('tab'), '\t');
    assert.strictEqual(delimiterChar('semicolon'), ';');
    assert.strictEqual(delimiterChar('pipe'), '|');
  });
});

suite('RecordScanner', () => {
  test('LF と CRLF の改行でレコードが終わる', () => {
    assert.deepStrictEqual(scan(utf8('a,b\nc,d\n'), 'byte', ','), { ends: [4, 8], lines: [2, 3] });
    assert.deepStrictEqual(scan(utf8('a,b\r\nc,d'), 'byte', ','), { ends: [5], lines: [2] });
  });

  test('引用符の中の改行ではレコードが終わらないが、行番号は進む', () => {
    // a,"x↵y"↵b↵
    assert.deepStrictEqual(scan(utf8('a,"x\ny"\nb\n'), 'byte', ','), {
      ends: [8, 10],
      lines: [3, 4],
    });
  });

  test('引用符の中の "" は引用符の終わりにならない', () => {
    assert.deepStrictEqual(scan(utf8('a,"x""\ny"\nb'), 'byte', ',').ends, [10]);
  });

  test('フィールドの途中の引用符は、ただの文字として扱う', () => {
    assert.deepStrictEqual(scan(utf8('a"b,c\nd\n'), 'byte', ',').ends, [6, 8]);
  });

  test('引用符が閉じないまま終わると、それ以降でレコードは終わらない', () => {
    assert.deepStrictEqual(scan(utf8('a,"b\nc\nd'), 'byte', ',').ends, []);
  });

  test('区切り文字の直後の引用符だけを、引用の始まりとする（区切り文字ごと）', () => {
    for (const d of [',', '\t', ';', '|']) {
      const text = 'a' + d + '"x\ny"\nb' + d + 'c"d\ne\n';
      assert.deepStrictEqual(scan(utf8(text), 'byte', d).ends, [8, 14, 16], JSON.stringify(d));
    }
  });

  test('チャンクの大きさを変えても結果は同じ', () => {
    const cases: [Uint8Array, UnitMode][] = [
      [utf8('id,"na\r\nme"\r\n1,"a""b"\r\n2,名前\r\n"x'), 'byte'],
      [cp932('表,"ポ\nソ"\nあ,①\n'), 'cp932'],
      [utf16le('a,"b\nc"\nd\n'), 'utf16le'],
      [utf16be('a,"b\nc"\nd\n'), 'utf16be'],
    ];
    for (const [bytes, mode] of cases) {
      const whole = scan(bytes, mode, ',');
      for (let size = 1; size <= 7; size++) {
        assert.deepStrictEqual(scan(bytes, mode, ',', size), whole, mode + ' / ' + size);
      }
    }
  });

  test('UTF-16 は 2 バイトを単位にして、UTF-8 と同じ境界を見つける', () => {
    const text = 'a,"x\ny"\nb\n';
    const expected = scan(utf8(text), 'byte', ',');
    const double = { ends: expected.ends.map((e) => e * 2), lines: expected.lines };
    assert.deepStrictEqual(scan(utf16le(text), 'utf16le', ','), double);
    assert.deepStrictEqual(scan(utf16be(text), 'utf16be', ','), double);
  });

  test('UTF-16 の文字の上位バイトに 0x0A や 0x22 があっても誤認しない', () => {
    // U+0A22 と U+220A はどちらも、片方のバイトが \n、もう片方が " になる
    const text = 'ਢ,∊\nz\n';
    assert.deepStrictEqual(scan(utf16le(text), 'utf16le', ',').ends, [8, 12]);
    assert.deepStrictEqual(scan(utf16be(text), 'utf16be', ',').ends, [8, 12]);
  });

  test('CP932 の 2 バイト目がパイプ（0x7C）でも、区切り文字と誤認しない', () => {
    // ポ は 0x83 0x7C。区切り文字と誤認すると、直後の " が引用の始まりになり改行を飲み込む
    const bytes = cp932('ポ"x\ny\n');
    assert.deepStrictEqual(scan(bytes, 'cp932', '|').ends, [5, 7]);
    // 1 バイト目と 2 バイト目の間でチャンクが切れても同じ
    assert.deepStrictEqual(scan(bytes, 'cp932', '|', 1).ends, [5, 7]);
    // byte の単位で読むと誤認する（cp932 の単位が必要な理由）
    assert.deepStrictEqual(scan(bytes, 'byte', '|').ends, []);
  });
});

suite('parseRecord', () => {
  test('区切り文字で分ける', () => {
    assert.deepStrictEqual(parseRecord('a,b,c', ','), ['a', 'b', 'c']);
    assert.deepStrictEqual(parseRecord('a\tb', '\t'), ['a', 'b']);
    assert.deepStrictEqual(parseRecord('a;b|c', ';'), ['a', 'b|c']);
  });

  test('空のレコードは空のセル 1 つ、末尾の区切り文字は空のセルを作る', () => {
    assert.deepStrictEqual(parseRecord('', ','), ['']);
    assert.deepStrictEqual(parseRecord('a,', ','), ['a', '']);
  });

  test('引用符で囲んだセルの中の区切り文字、改行、"" を扱う', () => {
    assert.deepStrictEqual(parseRecord('"a,b","c""d"', ','), ['a,b', 'c"d']);
    assert.deepStrictEqual(parseRecord('"x\ny",z', ','), ['x\ny', 'z']);
  });

  test('フィールドの途中の引用符と、引用の後に続く文字は、そのまま値にする', () => {
    assert.deepStrictEqual(parseRecord('a"b,c', ','), ['a"b', 'c']);
    assert.deepStrictEqual(parseRecord('"abc"def,g', ','), ['abcdef', 'g']);
  });

  test('閉じない引用符は、末尾までを 1 つのセルにする', () => {
    assert.deepStrictEqual(parseRecord('"abc,d\ne', ','), ['abc,d\ne']);
  });
});

suite('recordText', () => {
  test('レコードのバイト列を文字列にし、末尾の改行（LF と CRLF）を除く', () => {
    const decoder = createDecoder('utf8');
    assert.strictEqual(recordText(utf8('a,b\n'), decoder), 'a,b');
    assert.strictEqual(recordText(utf8('a,b\r\n'), decoder), 'a,b');
    assert.strictEqual(recordText(utf8('a,b'), decoder), 'a,b');
    assert.strictEqual(recordText(utf8('"x\r\ny"\r\n'), decoder), '"x\r\ny"');
    assert.strictEqual(recordText(concat(utf16le('a\r\n')), createDecoder('utf16le')), 'a');
  });
});
