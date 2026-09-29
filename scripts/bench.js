// 性能を計る（要件の NFR-1）。大きな CSV を一時フォルダに作り、コアの処理の時間を計る。
// 使い方: npm run bench [-- --rows 10000000 --columns 20]
// 作った CSV は次回も使う（作り直すときは消す）。計測の中身は out/tooling/benchmark.js（単体テスト済み）。
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const helperPath = path.join(root, 'out', 'tooling', 'benchmark.js');
if (!fs.existsSync(helperPath)) {
  console.error('Run "npm run compile-tests" first (' + helperPath + ' is missing).');
  process.exit(1);
}
const { runBenchmark, writeLargeCsv } = require(helperPath);

function option(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const rows = option('rows', 10_000_000);
const columns = option('columns', 20);
const dir = path.join(os.tmpdir(), 'csv-lens-bench');
const file = path.join(dir, 'rows-' + rows + '-cols-' + columns + '.csv');

/** 要件の目標 */
const targets = {
  firstRowsMs: 1000,
  indexMs: 30_000,
  searchMs: 30_000,
  randomRowMs: 500,
  indexMemoryBytes: 200 * 1024 * 1024,
};

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    console.log('Writing ' + file + ' ...');
    const started = Date.now();
    await writeLargeCsv(file, rows, columns);
    console.log('Written in ' + ((Date.now() - started) / 1000).toFixed(1) + ' s');
  }
  const result = await runBenchmark(file);
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + ' MB';
  const ms = (value) => Math.round(value).toLocaleString('en-US') + ' ms';
  console.log('');
  console.log('File:    ' + file);
  console.log('Size:    ' + mb(result.bytes));
  console.log(
    'Rows:    ' + result.rows.toLocaleString('en-US') + ' x ' + result.columns + ' columns'
  );
  console.log('');
  const lines = [
    ['First rows shown', ms(result.firstRowsMs), result.firstRowsMs <= targets.firstRowsMs, '1 s'],
    ['Index built', ms(result.indexMs), result.indexMs <= targets.indexMs, '30 s'],
    [
      'Full search (' + result.searchHits + ' hit)',
      ms(result.searchMs),
      result.searchMs <= targets.searchMs,
      '30 s',
    ],
    [
      'Row ' + result.randomRow.toLocaleString('en-US') + ' read',
      ms(result.randomRowMs),
      result.randomRowMs <= targets.randomRowMs,
      '0.5 s',
    ],
    [
      'Index memory',
      mb(result.indexMemoryBytes),
      result.indexMemoryBytes <= targets.indexMemoryBytes,
      '200 MB',
    ],
  ];
  for (const [name, value, ok, target] of lines) {
    console.log(
      (ok ? 'OK  ' : 'NG  ') + name.padEnd(28) + value.padStart(12) + '   (target ' + target + ')'
    );
  }
  process.exitCode = lines.every((line) => line[2]) && result.searchHits === 1 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
