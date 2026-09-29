import * as assert from 'assert';
import { CsvFormat } from '../../core/csv/types';
import { FindHit, FindQuery } from '../../core/protocol';
import { createMatcher } from '../../core/search/matcher';
import { searchRecords, SearchProgress } from '../../core/search/searcher';
import { MemorySource } from '../../core/source/memorySource';
import { cp932, utf8 } from '../support/bytes';

function query(text: string, options: Partial<FindQuery> = {}): FindQuery {
  return { text, caseSensitive: false, wholeCell: false, ...options };
}

const UTF8: CsvFormat = { encoding: 'utf8', delimiter: 'comma', dataStart: 0 };

async function search(
  bytes: Uint8Array,
  q: FindQuery,
  options: { format?: CsvFormat; limit?: number; chunkSize?: number } = {}
): Promise<{ hits: FindHit[]; reports: SearchProgress[] }> {
  const reports: SearchProgress[] = [];
  await searchRecords(new MemorySource(bytes), options.format ?? UTF8, q, {
    limit: options.limit ?? 10_000,
    chunkSize: options.chunkSize ?? 16,
    reportEveryChunks: 1,
    onProgress: (progress) => reports.push(progress),
  });
  return { hits: reports.flatMap((r) => r.hits), reports };
}

suite('createMatcher', () => {
  test('既定は部分一致で、大文字と小文字を区別しない', () => {
    const m = createMatcher(query('abc'));
    assert.deepStrictEqual(
      ['xABCx', 'abc', 'ab', ''].map((cell) => m.matches(cell)),
      [true, true, false, false]
    );
  });

  test('大文字と小文字を区別できる', () => {
    const m = createMatcher(query('abc', { caseSensitive: true }));
    assert.deepStrictEqual(
      ['xabcx', 'ABC'].map((cell) => m.matches(cell)),
      [true, false]
    );
  });

  test('セル全体の一致にできる（大文字と小文字の区別の有無とも）', () => {
    const insensitive = createMatcher(query('abc', { wholeCell: true }));
    assert.deepStrictEqual(
      ['ABC', 'abcd'].map((cell) => insensitive.matches(cell)),
      [true, false]
    );
    const sensitive = createMatcher(query('abc', { wholeCell: true, caseSensitive: true }));
    assert.deepStrictEqual(
      ['abc', 'ABC'].map((cell) => sensitive.matches(cell)),
      [true, false]
    );
  });

  test('空の検索語は、部分一致では何にも一致せず、セル全体の一致では空のセルに一致する', () => {
    assert.strictEqual(createMatcher(query('')).matches(''), false);
    assert.strictEqual(createMatcher(query('')).matches('a'), false);
    const whole = createMatcher(query('', { wholeCell: true, caseSensitive: true }));
    assert.deepStrictEqual(
      ['', 'a'].map((cell) => whole.matches(cell)),
      [true, false]
    );
  });

  test('レコードの文字列での下見は、一致しうるものを落とさない', () => {
    assert.strictEqual(createMatcher(query('Tanaka')).mightMatch('1,TANAKA,x'), true);
    assert.strictEqual(createMatcher(query('Tanaka')).mightMatch('1,Sato,x'), false);
    // ファイル上では " が "" になるので、" を含む検索語は下見で落とさない
    assert.strictEqual(createMatcher(query('a"b')).mightMatch('"a""b"'), true);
  });

  test('長い値の抜粋は、一致した箇所の付近を返す', () => {
    const cell = 'x'.repeat(300) + 'needle' + 'y'.repeat(300);
    const excerpt = createMatcher(query('NEEDLE')).excerpt(cell);
    assert.ok(excerpt.includes('needle'), excerpt);
    assert.ok(excerpt.length <= 122, String(excerpt.length));
    assert.ok(excerpt.startsWith('…') && excerpt.endsWith('…'));
    assert.strictEqual(createMatcher(query('a')).excerpt('short a'), 'short a');
  });
});

suite('searchRecords', () => {
  const text = 'id,name,ref\n1,Tanaka,2\n2,"Sato\nTanaka",tanaka\n3,Suzuki,1\n';

  test('一致したセルの Row と列を、Row と列の順に返す。ヘッダーは対象外', async () => {
    const { hits, reports } = await search(utf8(text), query('tanaka'));
    assert.deepStrictEqual(
      hits.map((h) => [h.row, h.column, h.value]),
      [
        [1, 1, 'Tanaka'],
        [2, 1, 'Sato\nTanaka'],
        [2, 2, 'tanaka'],
      ]
    );
    const last = reports[reports.length - 1];
    assert.deepStrictEqual([last.total, last.done, last.truncated], [3, true, false]);
    assert.strictEqual(last.scannedBytes, utf8(text).length);
    assert.ok(reports.length > 1, '途中経過を知らせていない');
    assert.ok(reports.slice(0, -1).every((r) => !r.done));
    const header = await search(utf8(text), query('name'));
    assert.deepStrictEqual(header.hits, []);
  });

  test('ヘッダーなし（データの最初のレコードが 0）のときは、先頭のレコードも Row 1 として探す', async () => {
    const reports: SearchProgress[] = [];
    await searchRecords(new MemorySource(utf8(text)), UTF8, query('name'), {
      limit: 100,
      firstDataRecord: 0,
      onProgress: (progress) => reports.push(progress),
    });
    assert.deepStrictEqual(
      reports.flatMap((r) => r.hits).map((h) => [h.row, h.column]),
      [[1, 1]]
    );
  });

  test('一覧は上限までにし、件数は最後まで数える', async () => {
    let rows = 'v\n';
    for (let i = 0; i < 50; i++) {
      rows += 'match\n';
    }
    const { hits, reports } = await search(utf8(rows), query('match'), { limit: 10 });
    const last = reports[reports.length - 1];
    assert.strictEqual(hits.length, 10);
    assert.deepStrictEqual([last.total, last.truncated], [50, true]);
  });

  test('引用符を含む値も見つける', async () => {
    const { hits } = await search(utf8('a\n"say ""hi"""\n'), query('"hi"'));
    assert.deepStrictEqual(
      hits.map((h) => h.value),
      ['say "hi"']
    );
  });

  test('文字コードと区切り文字に従う', async () => {
    const format: CsvFormat = { encoding: 'shiftjis', delimiter: 'pipe', dataStart: 0 };
    const { hits } = await search(cp932('表|ポ\nあ|ポ①\n'), query('ポ'), { format });
    assert.deepStrictEqual(
      hits.map((h) => [h.row, h.column]),
      [[1, 1]]
    );
  });

  test('止めると、それ以降を読まず、done を知らせない', async () => {
    let rows = 'v\n';
    for (let i = 0; i < 200; i++) {
      rows += 'x' + i + '\n';
    }
    const reports: SearchProgress[] = [];
    let calls = 0;
    await searchRecords(new MemorySource(utf8(rows)), UTF8, query('x'), {
      limit: 10_000,
      chunkSize: 16,
      reportEveryChunks: 1,
      onProgress: (progress) => reports.push(progress),
      shouldStop: () => ++calls > 3,
    });
    assert.ok(reports.every((r) => !r.done));
    assert.ok(reports.flatMap((r) => r.hits).length < 200);
  });
});
