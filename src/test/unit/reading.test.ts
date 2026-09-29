import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { forEachRecord, RawRecord } from '../../core/csv/records';
import { CsvFormat } from '../../core/csv/types';
import { buildIndex, IndexProgress } from '../../core/index/buildIndex';
import { SparseIndex } from '../../core/index/sparseIndex';
import { readInitial, readRows } from '../../core/read/rowReader';
import { MemorySource } from '../../core/source/memorySource';
import { NodeFileSource } from '../../core/source/nodeFileSource';
import { concat, utf16le, utf8 } from '../support/bytes';

const UTF8: CsvFormat = { encoding: 'utf8', delimiter: 'comma', dataStart: 0 };

/**
 * テスト用の CSV。10 行ごとに、改行を含むセルがある。
 * 各レコードの開始位置と、開始する行番号も返す（record 0 はヘッダー）。
 */
function sampleCsv(rows: number): { text: string; starts: number[]; lines: number[] } {
  let text = 'id,text\n';
  const starts = [0];
  const lines = [1];
  let line = 2;
  for (let i = 1; i <= rows; i++) {
    starts.push(text.length);
    lines.push(line);
    if (i % 10 === 0) {
      text += i + ',"line1\nline2"\n';
      line += 2;
    } else {
      text += i + ',v' + i + '\n';
      line += 1;
    }
  }
  return { text, starts, lines };
}

async function collect(
  bytes: Uint8Array,
  format: CsvFormat,
  chunkSize?: number
): Promise<{ offset: number; line: number; text: string }[]> {
  const records: { offset: number; line: number; text: string }[] = [];
  await forEachRecord(
    new MemorySource(bytes),
    format,
    { offset: format.dataStart, line: 1 },
    (record: RawRecord) => {
      records.push({
        offset: record.offset,
        line: record.line,
        text: Buffer.from(record.bytes).toString('utf8'),
      });
    },
    { chunkSize }
  );
  return records;
}

suite('MemorySource と NodeFileSource', () => {
  test('指定した範囲を読み、ファイルの末尾を超えた分は読まない', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-lens-'));
    try {
      const file = path.join(dir, 'a.csv');
      fs.writeFileSync(file, 'abcdef');
      const node = await NodeFileSource.open(file);
      for (const source of [new MemorySource(utf8('abcdef')), node]) {
        assert.strictEqual(source.size, 6);
        assert.strictEqual(Buffer.from(await source.read(1, 3)).toString(), 'bcd');
        assert.strictEqual(Buffer.from(await source.read(4, 10)).toString(), 'ef');
        assert.strictEqual((await source.read(6, 10)).length, 0);
        await source.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

suite('forEachRecord', () => {
  test('レコードごとに、開始位置、開始する行、改行を含むバイト列を渡す', async () => {
    assert.deepStrictEqual(await collect(utf8('a,b\n"x\ny",z\r\nc'), UTF8), [
      { offset: 0, line: 1, text: 'a,b\n' },
      { offset: 4, line: 2, text: '"x\ny",z\r\n' },
      { offset: 13, line: 4, text: 'c' },
    ]);
  });

  test('末尾の改行の後に空のレコードを作らない。空のファイルにはレコードが無い', async () => {
    assert.deepStrictEqual(
      (await collect(utf8('a\nb\n'), UTF8)).map((r) => r.text),
      ['a\n', 'b\n']
    );
    assert.deepStrictEqual(await collect(new Uint8Array(0), UTF8), []);
  });

  test('チャンクの大きさを変えても結果は同じ', async () => {
    const { text } = sampleCsv(25);
    const whole = await collect(utf8(text), UTF8);
    for (const size of [1, 2, 3, 5, 16]) {
      assert.deepStrictEqual(await collect(utf8(text), UTF8, size), whole, String(size));
    }
  });

  test('dataStart（BOM の後）から読み始める', async () => {
    const bytes = concat([0xef, 0xbb, 0xbf], utf8('a\nb'));
    const format: CsvFormat = { encoding: 'utf8bom', delimiter: 'comma', dataStart: 3 };
    assert.deepStrictEqual(await collect(bytes, format), [
      { offset: 3, line: 1, text: 'a\n' },
      { offset: 5, line: 2, text: 'b' },
    ]);
  });

  test('false を返すと、そこで止める', async () => {
    let count = 0;
    await forEachRecord(new MemorySource(utf8('a\nb\nc\n')), UTF8, { offset: 0, line: 1 }, () => {
      count++;
      return count < 2;
    });
    assert.strictEqual(count, 2);
  });
});

suite('SparseIndex', () => {
  test('記録点が無い位置は、直前の記録点から読むように案内する', () => {
    const index = new SparseIndex(3, 4);
    assert.deepStrictEqual(index.locate(0), { record: 0, offset: 3, line: 1 });
    index.extend([100, 200], [5, 9], 10);
    assert.strictEqual(index.recordCount, 10);
    assert.deepStrictEqual(index.locate(3), { record: 0, offset: 3, line: 1 });
    assert.deepStrictEqual(index.locate(4), { record: 4, offset: 100, line: 5 });
    assert.deepStrictEqual(index.locate(7), { record: 4, offset: 100, line: 5 });
    assert.deepStrictEqual(index.locate(9), { record: 8, offset: 200, line: 9 });
  });

  test('記録点を足し続けても保持できる', () => {
    const index = new SparseIndex(0, 2);
    const offsets = Array.from({ length: 5000 }, (_, i) => (i + 1) * 10);
    index.extend(offsets, offsets, 10001);
    assert.deepStrictEqual(index.locate(10000), { record: 10000, offset: 50000, line: 50000 });
    assert.strictEqual(index.complete, false);
    index.markComplete();
    assert.strictEqual(index.complete, true);
  });
});

suite('buildIndex', () => {
  async function build(bytes: Uint8Array, format: CsvFormat, chunkSize: number) {
    const reports: IndexProgress[] = [];
    const count = await buildIndex(new MemorySource(bytes), format, {
      interval: 8,
      chunkSize,
      reportEveryChunks: 2,
      onProgress: (progress) => reports.push(progress),
    });
    return { count, reports };
  }

  test('interval ごとのレコードの開始位置と行を記録し、レコードの総数を返す', async () => {
    const { text, starts, lines } = sampleCsv(100);
    const { count, reports } = await build(utf8(text), UTF8, 16);
    assert.strictEqual(count, 101);
    const expectedRecords = [8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96];
    assert.deepStrictEqual(
      reports.flatMap((r) => r.offsets),
      expectedRecords.map((r) => starts[r])
    );
    assert.deepStrictEqual(
      reports.flatMap((r) => r.lines),
      expectedRecords.map((r) => lines[r])
    );
    assert.ok(reports.length > 2, '途中の経過を知らせていない');
    const last = reports[reports.length - 1];
    assert.deepStrictEqual([last.recordCount, last.done], [101, true]);
    assert.ok(reports.slice(0, -1).every((r) => !r.done));
  });

  test('空のファイルは 0、ヘッダーだけ（改行なし）は 1', async () => {
    assert.strictEqual((await build(new Uint8Array(0), UTF8, 4)).count, 0);
    assert.strictEqual((await build(utf8('id,name'), UTF8, 4)).count, 1);
  });

  test('UTF-16 でも位置をバイトで記録する', async () => {
    const { text, starts } = sampleCsv(20);
    const format: CsvFormat = { encoding: 'utf16le', delimiter: 'comma', dataStart: 2 };
    const bytes = concat([0xff, 0xfe], utf16le(text));
    const { count, reports } = await build(bytes, format, 7);
    assert.strictEqual(count, 21);
    assert.deepStrictEqual(
      reports.flatMap((r) => r.offsets),
      [8, 16].map((r) => 2 + starts[r] * 2)
    );
  });
});

suite('readInitial', () => {
  test('ヘッダーと先頭の行を読み、ファイルを最後まで読んだかを返す', async () => {
    const result = await readInitial(new MemorySource(utf8('id,text\n1,"a\nb"\n2,c\n')), UTF8, 100);
    assert.deepStrictEqual(result, {
      header: ['id', 'text'],
      rows: [
        { row: 1, line: 2, cells: ['1', 'a\nb'] },
        { row: 2, line: 4, cells: ['2', 'c'] },
      ],
      complete: true,
    });
  });

  test('行が多ければ maxRows 行で止め、最後まで読んでいないとする', async () => {
    const result = await readInitial(new MemorySource(utf8(sampleCsv(150).text)), UTF8, 100);
    assert.strictEqual(result.rows.length, 100);
    assert.strictEqual(result.rows[99].row, 100);
    assert.strictEqual(result.complete, false);
  });

  test('ちょうど maxRows 行のファイルは、最後まで読んだとする', async () => {
    const result = await readInitial(new MemorySource(utf8(sampleCsv(100).text)), UTF8, 100);
    assert.strictEqual(result.complete, true);
  });

  test('空のファイルは、ヘッダーも行も無い', async () => {
    assert.deepStrictEqual(await readInitial(new MemorySource(new Uint8Array(0)), UTF8, 10), {
      header: [],
      rows: [],
      complete: true,
    });
  });

  test('区切り文字と文字コードに従う', async () => {
    const format: CsvFormat = { encoding: 'utf16le', delimiter: 'tab', dataStart: 0 };
    const result = await readInitial(new MemorySource(utf16le('名前\tx\n田中\ty\n')), format, 10);
    assert.deepStrictEqual(result.header, ['名前', 'x']);
    assert.deepStrictEqual(result.rows[0].cells, ['田中', 'y']);
  });
});

suite('readRows', () => {
  async function indexed(rows: number) {
    const { text, lines } = sampleCsv(rows);
    const source = new MemorySource(utf8(text));
    const index = new SparseIndex(0, 8);
    await buildIndex(source, UTF8, {
      interval: 8,
      chunkSize: 32,
      onProgress: (p) => index.extend(p.offsets, p.lines, p.recordCount),
    });
    return { source, index, lines };
  }

  test('索引から、指定した Row の範囲を読む', async () => {
    const { source, index, lines } = await indexed(100);
    const rows = await readRows(source, UTF8, index, 50, 3, 100);
    assert.deepStrictEqual(rows, [
      { row: 50, line: lines[50], cells: ['50', 'line1\nline2'] },
      { row: 51, line: lines[51], cells: ['51', 'v51'] },
      { row: 52, line: lines[52], cells: ['52', 'v52'] },
    ]);
  });

  test('読める行数（rowLimit）を超えた分は返さない', async () => {
    const { source, index } = await indexed(100);
    assert.deepStrictEqual(
      (await readRows(source, UTF8, index, 98, 10, 100)).map((r) => r.row),
      [98, 99, 100]
    );
    assert.deepStrictEqual(
      (await readRows(source, UTF8, index, 30, 10, 32)).map((r) => r.row),
      [30, 31, 32]
    );
    assert.deepStrictEqual(await readRows(source, UTF8, index, 101, 5, 100), []);
  });

  test('索引が無くても（記録点が先頭だけでも）先頭から読んで返す', async () => {
    const { text } = sampleCsv(30);
    const rows = await readRows(new MemorySource(utf8(text)), UTF8, new SparseIndex(0), 20, 2, 30);
    assert.deepStrictEqual(
      rows.map((r) => r.cells),
      [
        ['20', 'line1\nline2'],
        ['21', 'v21'],
      ]
    );
  });
});
