import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseRecord } from '../../core/csv/parser';
import { LAST_ROW_MARKER, runBenchmark, sampleRow, writeLargeCsv } from '../../tooling/benchmark';

suite('sampleRow', () => {
  test('指定した列数の行を作り、同じ番号なら同じ内容になる', () => {
    assert.strictEqual(parseRecord(sampleRow(5, 20, false), ',').length, 20);
    assert.strictEqual(sampleRow(5, 20, false), sampleRow(5, 20, false));
    assert.notStrictEqual(sampleRow(5, 20, false), sampleRow(6, 20, false));
  });

  test('1,000 行ごとに、改行を含むセルを引用符で囲んで入れる', () => {
    assert.ok(sampleRow(1000, 5, false).includes('"'));
    assert.strictEqual(parseRecord(sampleRow(1000, 5, false), ',').length, 5);
    assert.ok(parseRecord(sampleRow(1000, 5, false), ',').some((cell) => cell.includes('\n')));
    assert.ok(!sampleRow(999, 5, false).includes('\n'));
  });

  test('最後の行にだけ、検索の目印の値を入れる', () => {
    assert.ok(sampleRow(7, 5, true).includes(LAST_ROW_MARKER));
    assert.ok(!sampleRow(7, 5, false).includes(LAST_ROW_MARKER));
  });
});

suite('writeLargeCsv と runBenchmark', () => {
  test('ヘッダーと指定した行数を書き、計測では行数と目印の検索の結果を返す', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-loupe-bench-'));
    try {
      const file = path.join(dir, 'small.csv');
      await writeLargeCsv(file, 3000, 6);
      const result = await runBenchmark(file);
      assert.strictEqual(result.rows, 3000);
      assert.strictEqual(result.columns, 6);
      assert.strictEqual(result.bytes, fs.statSync(file).size);
      assert.strictEqual(result.searchHits, 1);
      assert.strictEqual(result.randomRow, Math.ceil(3000 / 2));
      for (const key of ['firstRowsMs', 'indexMs', 'searchMs', 'randomRowMs'] as const) {
        assert.ok(result[key] >= 0, key);
      }
      assert.ok(result.indexMemoryBytes >= 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
