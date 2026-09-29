import * as assert from 'assert';
import { createDecoder } from '../../core/encoding/decode';
import { bomLength, detectEncoding, resolveEncoding } from '../../core/encoding/detect';
import { concat, cp932, utf16be, utf16le, utf8 } from '../support/bytes';

suite('detectEncoding', () => {
  test('BOM があれば BOM に従い、確信ありとする', () => {
    assert.deepStrictEqual(detectEncoding(concat([0xef, 0xbb, 0xbf], utf8('a,b')), true), {
      encoding: 'utf8bom',
      confident: true,
    });
    assert.deepStrictEqual(detectEncoding(concat([0xff, 0xfe], utf16le('a,b')), true), {
      encoding: 'utf16le',
      confident: true,
    });
    assert.deepStrictEqual(detectEncoding(concat([0xfe, 0xff], utf16be('a,b')), true), {
      encoding: 'utf16be',
      confident: true,
    });
  });

  test('BOM の無い UTF-16 は 0x00 の位置から推定し、確信なしとする', () => {
    assert.deepStrictEqual(detectEncoding(utf16le('id,name\n1,Tanaka\n'), true), {
      encoding: 'utf16le',
      confident: false,
    });
    assert.deepStrictEqual(detectEncoding(utf16be('id,name\n1,Tanaka\n'), true), {
      encoding: 'utf16be',
      confident: false,
    });
  });

  test('ASCII だけ、または UTF-8 として正しければ UTF-8 とし、確信ありとする', () => {
    assert.deepStrictEqual(detectEncoding(utf8('id,name\n1,a\n'), true), {
      encoding: 'utf8',
      confident: true,
    });
    assert.deepStrictEqual(detectEncoding(utf8('id,名前\n1,田中\n'), true), {
      encoding: 'utf8',
      confident: true,
    });
  });

  test('先頭だけを見ているときは、末尾で途切れた UTF-8 の文字を誤りとしない', () => {
    const bytes = utf8('id,名前');
    const truncated = bytes.subarray(0, bytes.length - 1);
    assert.deepStrictEqual(detectEncoding(truncated, false), {
      encoding: 'utf8',
      confident: true,
    });
  });

  test('UTF-8 として読めず、CP932 として読めれば Shift_JIS とし、確信ありとする', () => {
    assert.deepStrictEqual(detectEncoding(cp932('表,ポ,ソ,あ,①\n'), true), {
      encoding: 'shiftjis',
      confident: true,
    });
  });

  test('どちらとしても読めなければ Shift_JIS とし、確信なしとする', () => {
    assert.deepStrictEqual(detectEncoding(Uint8Array.from([0x61, 0xff, 0xfd, 0x0a]), true), {
      encoding: 'shiftjis',
      confident: false,
    });
  });

  test('空のファイルは UTF-8 とする', () => {
    assert.deepStrictEqual(detectEncoding(new Uint8Array(0), true), {
      encoding: 'utf8',
      confident: true,
    });
  });
});

suite('resolveEncoding と bomLength', () => {
  const bomUtf8 = concat([0xef, 0xbb, 0xbf], utf8('a'));

  test('UTF-8 を選んだとき、BOM があれば BOM 付きとして扱う', () => {
    assert.strictEqual(resolveEncoding('utf8', bomUtf8), 'utf8bom');
    assert.strictEqual(resolveEncoding('utf8', utf8('a')), 'utf8');
    assert.strictEqual(resolveEncoding('shiftjis', bomUtf8), 'shiftjis');
    assert.strictEqual(resolveEncoding('utf16le', utf8('a')), 'utf16le');
  });

  test('BOM の長さは、文字コードとファイルの先頭が一致するときだけ数える', () => {
    assert.strictEqual(bomLength('utf8bom', bomUtf8), 3);
    assert.strictEqual(bomLength('utf8', utf8('a')), 0);
    assert.strictEqual(bomLength('utf16le', concat([0xff, 0xfe], utf16le('a'))), 2);
    assert.strictEqual(bomLength('utf16le', utf16le('a')), 0);
    assert.strictEqual(bomLength('utf16be', concat([0xfe, 0xff], utf16be('a'))), 2);
    assert.strictEqual(bomLength('shiftjis', bomUtf8), 0);
  });
});

suite('createDecoder', () => {
  test('各文字コードのバイト列を文字列にする', () => {
    assert.strictEqual(createDecoder('utf8').decode(utf8('名前')), '名前');
    assert.strictEqual(createDecoder('utf8bom').decode(utf8('名前')), '名前');
    assert.strictEqual(createDecoder('utf16le').decode(utf16le('名前')), '名前');
    assert.strictEqual(createDecoder('utf16be').decode(utf16be('名前')), '名前');
    assert.strictEqual(createDecoder('shiftjis').decode(cp932('表ポ①')), '表ポ①');
  });

  test('読めないバイトは置換文字にする', () => {
    assert.strictEqual(createDecoder('utf8').decode(Uint8Array.from([0x61, 0xff])), 'a�');
  });
});
