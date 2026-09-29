import * as assert from 'assert';
import { InProcessJobRunner } from '../../core/jobs';
import { EncodingId, HostMessage, InitMessage } from '../../core/protocol';
import { CsvSession, SessionEnvironment } from '../../core/session';
import { ByteSource } from '../../core/source/byteSource';
import { MemorySource } from '../../core/source/memorySource';
import { cp932, utf8 } from '../support/bytes';

function csv(rows: number): string {
  let text = 'id,name\n';
  for (let i = 1; i <= rows; i++) {
    text += i + ',n' + i + '\n';
  }
  return text;
}

/** セッションの環境のフェイク。送ったメッセージと、コピーや元のファイルを開く操作を記録する */
class FakeEnvironment implements SessionEnvironment {
  readonly messages: HostMessage[] = [];
  readonly copied: string[] = [];
  readonly opened: { line: number; encoding: EncodingId }[] = [];
  opens = 0;
  l10n: Record<string, string> | undefined = { Find: '検索' };

  constructor(
    public bytes: Uint8Array,
    readonly fileName = 'sample.csv'
  ) {}

  open(): Promise<{ source: ByteSource; runner: InProcessJobRunner }> {
    this.opens++;
    const source = new MemorySource(this.bytes);
    // 途中経過の知らせを確かめられるよう、小さい単位で走査する
    return Promise.resolve({
      source,
      runner: new InProcessJobRunner(source, { chunkSize: 64, reportEveryChunks: 1 }),
    });
  }

  post(message: HostMessage): void {
    this.messages.push(message);
  }

  copy(text: string): Promise<void> {
    this.copied.push(text);
    return Promise.resolve();
  }

  openSource(line: number, encoding: EncodingId): Promise<void> {
    this.opened.push({ line, encoding });
    return Promise.resolve();
  }

  of<T extends HostMessage['type']>(type: T): Extract<HostMessage, { type: T }>[] {
    return this.messages.filter((m): m is Extract<HostMessage, { type: T }> => m.type === type);
  }

  lastInit(): InitMessage {
    const inits = this.of('init');
    assert.ok(inits.length > 0, 'init を送っていない');
    return inits[inits.length - 1];
  }
}

/** 条件を満たすまで待つ（索引の作成は非同期に進む） */
async function waitUntil(condition: () => boolean, message: string): Promise<void> {
  // mocha の既定の 2 秒より短く打ち切り、何を待っていたかを失敗の理由に出す
  const start = Date.now();
  while (Date.now() - start < 1500) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail('時間内に満たされなかった: ' + message);
}

function countDone(env: FakeEnvironment): boolean {
  return env.of('progress').some((p) => p.countDone) || env.lastInit().countDone;
}

suite('CsvSession', () => {
  test('開くと、ファイルの情報とヘッダーと先頭の行を送る', async () => {
    const env = new FakeEnvironment(utf8(csv(3)));
    const session = new CsvSession(env);
    await session.start();
    const init = env.lastInit();
    assert.deepStrictEqual(
      {
        fileName: init.fileName,
        encoding: init.encoding,
        encodingConfident: init.encodingConfident,
        delimiter: init.delimiter,
        header: init.header,
        rows: init.rows.map((r) => r.cells),
        rowsCounted: init.rowsCounted,
        countDone: init.countDone,
        l10n: init.l10n,
      },
      {
        fileName: 'sample.csv',
        encoding: 'utf8',
        encodingConfident: true,
        delimiter: 'comma',
        header: ['id', 'name'],
        rows: [
          ['1', 'n1'],
          ['2', 'n2'],
          ['3', 'n3'],
        ],
        rowsCounted: 3,
        countDone: true,
        l10n: { Find: '検索' },
      }
    );
    await session.dispose();
  });

  test('先頭の行は最大 100 行。残りは索引を作りながら数え、途中経過を送る', async () => {
    const env = new FakeEnvironment(utf8(csv(1000)));
    const session = new CsvSession(env);
    await session.start();
    const init = env.lastInit();
    assert.strictEqual(init.rows.length, 100);
    assert.strictEqual(init.countDone, false);
    await waitUntil(() => countDone(env), '行数を数え終える');
    const progress = env.of('progress');
    assert.ok(progress.length > 1, '途中経過を送っていない');
    assert.ok(progress.every((p) => p.generation === init.generation));
    assert.ok(
      progress.every((p) => p.rowsCounted >= 100),
      '先頭の行数より少なく数えている'
    );
    assert.deepStrictEqual(progress[progress.length - 1], {
      type: 'progress',
      generation: init.generation,
      rowsCounted: 1000,
      countDone: true,
    });
    await session.dispose();
  });

  test('.tsv はタブ区切り、CP932 のファイルは Shift_JIS として開く', async () => {
    const tsv = new FakeEnvironment(utf8('a\tb\n1\t2\n'), 'data.tsv');
    await new CsvSession(tsv).start();
    assert.deepStrictEqual([tsv.lastInit().delimiter, tsv.lastInit().header], ['tab', ['a', 'b']]);

    const sjis = new FakeEnvironment(cp932('表,ポ\nあ,①\n'));
    await new CsvSession(sjis).start();
    assert.deepStrictEqual(
      [sjis.lastInit().encoding, sjis.lastInit().header, sjis.lastInit().rows[0].cells],
      ['shiftjis', ['表', 'ポ'], ['あ', '①']]
    );
  });

  test('ヘッダーの有無を判別して送る。ヘッダーなしなら先頭のレコードを Row 1 にする', async () => {
    const env = new FakeEnvironment(utf8('1,01140,01,A\n1,01160,01,B\n1,01171,01,C\n'));
    const session = new CsvSession(env);
    await session.start();
    const init = env.lastInit();
    assert.deepStrictEqual(
      [init.hasHeader, init.headerConfident, init.header, init.columnCount, init.rowsCounted],
      [false, true, [], 4, 3]
    );
    assert.deepStrictEqual(init.rows[0], { row: 1, line: 1, cells: ['1', '01140', '01', 'A'] });
    await session.dispose();
  });

  test('ヘッダーの有無を切り替えると読み直し、確信ありとして送る', async () => {
    const env = new FakeEnvironment(utf8('1,01140,01,A\n1,01160,01,B\n1,01171,01,C\n'));
    const session = new CsvSession(env);
    await session.start();
    await session.handle({ type: 'setHeader', hasHeader: true });
    const init = env.lastInit();
    assert.deepStrictEqual(
      [init.hasHeader, init.headerConfident, init.header, init.rowsCounted],
      [true, true, ['1', '01140', '01', 'A'], 2]
    );
    assert.deepStrictEqual(init.rows[0].cells, ['1', '01160', '01', 'B']);
    await session.dispose();
  });

  test('ヘッダーなしの大きなファイルは、すべてのレコードを行として数え、読み、検索する', async () => {
    let text = '';
    for (let i = 1; i <= 1000; i++) {
      text += i + ',' + i * 2 + '\n';
    }
    const env = new FakeEnvironment(utf8(text));
    const session = new CsvSession(env);
    await session.start();
    assert.strictEqual(env.lastInit().hasHeader, false);
    await waitUntil(() => countDone(env), '行数を数え終える');
    assert.strictEqual(env.of('progress').pop()?.rowsCounted, 1000);
    await session.handle({ type: 'requestRows', requestId: 1, from: 1000, count: 5 });
    assert.deepStrictEqual(
      env.of('rows')[0].rows.map((r) => [r.row, r.cells]),
      [[1000, ['1000', '2000']]]
    );
    await session.handle({
      type: 'find',
      searchId: 1,
      query: { text: '1', caseSensitive: true, wholeCell: true },
    });
    await waitUntil(() => env.of('findProgress').some((m) => m.done), '検索を終える');
    assert.deepStrictEqual(
      env.of('findProgress').flatMap((m) => m.hits.map((h) => [h.row, h.column])),
      [[1, 0]]
    );
    await session.dispose();
  });

  test('Webview の準備ができたら、最新の init と途中経過を送り直す', async () => {
    const env = new FakeEnvironment(utf8(csv(1000)));
    const session = new CsvSession(env);
    await session.start();
    await waitUntil(() => countDone(env), '行数を数え終える');
    env.messages.length = 0;
    await session.handle({ type: 'ready' });
    assert.deepStrictEqual(
      env.messages.map((m) => m.type),
      ['init', 'progress']
    );
    assert.strictEqual(env.of('progress')[0].countDone, true);
    await session.dispose();
  });

  test('要求された範囲の行を返す。数え終えていない範囲は返さない', async () => {
    const env = new FakeEnvironment(utf8(csv(1000)));
    const session = new CsvSession(env);
    await session.start();
    // 先頭の 100 行は、数え終える前でも読める
    await session.handle({ type: 'requestRows', requestId: 7, from: 99, count: 2 });
    const early = env.of('rows')[0];
    assert.strictEqual(early.requestId, 7);
    assert.strictEqual(early.generation, env.lastInit().generation);
    assert.deepStrictEqual(
      early.rows.map((r) => r.row),
      [99, 100]
    );
    await waitUntil(() => countDone(env), '行数を数え終える');
    await session.handle({ type: 'requestRows', requestId: 8, from: 998, count: 10 });
    const late = env.of('rows')[1];
    assert.deepStrictEqual(
      late.rows.map((r) => [r.row, r.line, r.cells[1]]),
      [
        [998, 999, 'n998'],
        [999, 1000, 'n999'],
        [1000, 1001, 'n1000'],
      ]
    );
    await session.dispose();
  });

  test('文字コードを切り替えると読み直し、確信ありとして送る。世代が進む', async () => {
    const env = new FakeEnvironment(cp932('表,ポ\n'));
    const session = new CsvSession(env);
    await session.start();
    const before = env.lastInit();
    await session.handle({ type: 'setEncoding', encoding: 'utf8' });
    const after = env.lastInit();
    assert.strictEqual(after.encoding, 'utf8');
    assert.strictEqual(after.encodingConfident, true);
    assert.ok(after.generation > before.generation);
    assert.strictEqual(env.opens, 2);
    assert.ok(after.header[0].includes('�'), 'UTF-8 として読み直していない');
    await session.dispose();
  });

  test('切り替えると新しい世代で索引を作り直し、古い世代の途中経過は送らない', async () => {
    const env = new FakeEnvironment(utf8(csv(1000)));
    const session = new CsvSession(env);
    await session.start();
    const first = env.lastInit().generation;
    await session.handle({ type: 'setDelimiter', delimiter: 'semicolon' });
    const second = env.lastInit().generation;
    assert.ok(second > first);
    const switchedAt = env.messages.length;
    await waitUntil(
      () => env.of('progress').some((p) => p.generation === second && p.countDone),
      '新しい世代で数え終える'
    );
    const after = env.messages.slice(switchedAt);
    assert.ok(
      after.every((m) => m.type !== 'progress' || m.generation === second),
      '古い世代の途中経過が届いている'
    );
    const last = env
      .of('progress')
      .filter((p) => p.generation === second)
      .pop();
    assert.strictEqual(last?.rowsCounted, 1000);
    await session.dispose();
  });

  test('区切り文字を切り替えると読み直す。再読み込みでも選んだものを保つ', async () => {
    const env = new FakeEnvironment(utf8('a;b\n1;2\n'));
    const session = new CsvSession(env);
    await session.start();
    assert.deepStrictEqual(env.lastInit().header, ['a;b']);
    await session.handle({ type: 'setDelimiter', delimiter: 'semicolon' });
    assert.deepStrictEqual(
      [env.lastInit().delimiter, env.lastInit().header],
      ['semicolon', ['a', 'b']]
    );
    env.bytes = utf8('a;b\n1;2\n3;4\n');
    await session.handle({ type: 'reload' });
    assert.deepStrictEqual(
      [env.lastInit().delimiter, env.lastInit().rows.length],
      ['semicolon', 2]
    );
    await session.dispose();
  });

  test('コピーと、元のファイルを開く操作を環境に頼む', async () => {
    const env = new FakeEnvironment(cp932('表\n'));
    const session = new CsvSession(env);
    await session.start();
    await session.handle({ type: 'copy', text: 'abc' });
    await session.handle({ type: 'openSource', line: 12 });
    assert.deepStrictEqual(env.copied, ['abc']);
    assert.deepStrictEqual(env.opened, [{ line: 12, encoding: 'shiftjis' }]);
    await session.dispose();
  });

  test('右クリックメニューのコマンドを、対象のセルと一緒に Webview へ送る', async () => {
    const env = new FakeEnvironment(utf8(csv(3)));
    const session = new CsvSession(env);
    await session.start();
    session.contextCommand('copyRow', 2, 1);
    assert.deepStrictEqual(env.messages[env.messages.length - 1], {
      type: 'contextCommand',
      command: 'copyRow',
      row: 2,
      column: 1,
    });
    await session.dispose();
  });

  test('検索の途中経過と結果を、検索の番号を付けて送る', async () => {
    const env = new FakeEnvironment(utf8(csv(500)));
    const session = new CsvSession(env);
    await session.start();
    await session.handle({
      type: 'find',
      searchId: 3,
      query: { text: 'n49', caseSensitive: false, wholeCell: false },
    });
    await waitUntil(() => env.of('findProgress').some((m) => m.done), '検索を終える');
    const progress = env.of('findProgress');
    assert.ok(progress.every((m) => m.searchId === 3));
    assert.ok(progress.every((m) => m.fileSize === env.bytes.length));
    const hits = progress.flatMap((m) => m.hits);
    // n49 と n490〜n499
    assert.deepStrictEqual(
      hits.map((h) => h.row),
      [49, 490, 491, 492, 493, 494, 495, 496, 497, 498, 499]
    );
    assert.strictEqual(progress[progress.length - 1].total, 11);
    await session.dispose();
  });

  test('新しい検索を始めると、前の検索の結果はもう送らない', async () => {
    const env = new FakeEnvironment(utf8(csv(3000)));
    const session = new CsvSession(env);
    await session.start();
    const find = (searchId: number, text: string) =>
      session.handle({
        type: 'find',
        searchId,
        query: { text, caseSensitive: false, wholeCell: false },
      });
    await find(1, 'n');
    await find(2, 'n2999');
    await waitUntil(
      () => env.of('findProgress').some((m) => m.searchId === 2 && m.done),
      '2 つ目の検索を終える'
    );
    const afterSecond = env.messages.slice(
      env.messages.findIndex((m) => m.type === 'findProgress' && m.searchId === 2)
    );
    assert.ok(
      afterSecond.every((m) => m.type !== 'findProgress' || m.searchId === 2),
      '前の検索の結果が届いている'
    );
    assert.ok(!env.of('findProgress').some((m) => m.searchId === 1 && m.done));
    await session.dispose();
  });

  test('検索を取り消すと、それ以降は結果を送らない', async () => {
    const env = new FakeEnvironment(utf8(csv(3000)));
    const session = new CsvSession(env);
    await session.start();
    await session.handle({
      type: 'find',
      searchId: 1,
      query: { text: 'n', caseSensitive: false, wholeCell: false },
    });
    await session.handle({ type: 'cancelFind' });
    const count = env.of('findProgress').length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(env.of('findProgress').length, count);
    await session.dispose();
  });

  test('ソートすると、並べ替えた順の行を表示の位置と一緒に返し、Row の位置を答える', async () => {
    const env = new FakeEnvironment(utf8('id,score\n1,30\n2,10\n3,20\n'));
    const session = new CsvSession(env);
    await session.start();
    await session.handle({ type: 'sort', sortId: 1, column: 1, direction: 'asc' });
    await waitUntil(() => env.of('sortState').some((m) => m.status === 'done'), 'ソートを終える');
    assert.deepStrictEqual(
      env.of('sortState').map((m) => m.status),
      ['sorting', 'done']
    );
    await session.handle({ type: 'requestRows', requestId: 5, from: 1, count: 3, sortId: 1 });
    const rows = env.of('rows')[0];
    assert.deepStrictEqual(
      rows.rows.map((r) => r.row),
      [2, 3, 1]
    );
    assert.deepStrictEqual(rows.positions, [1, 2, 3]);
    await session.handle({ type: 'locateRow', requestId: 6, row: 1 });
    assert.deepStrictEqual(env.of('rowLocated')[0], {
      type: 'rowLocated',
      generation: env.lastInit().generation,
      requestId: 6,
      row: 1,
      position: 3,
    });
    await session.handle({ type: 'sort', sortId: 2, column: 1, direction: null });
    assert.strictEqual(env.of('sortState').pop()?.status, 'cleared');
    await session.handle({ type: 'locateRow', requestId: 7, row: 1 });
    assert.strictEqual(env.of('rowLocated').pop()?.position, 1);
    await session.dispose();
  });

  test('行数を数え終える前や、行数が上限を超えるときはソートしない', async () => {
    const env = new FakeEnvironment(utf8(csv(1000)));
    const session = new CsvSession(env, { sortLimit: 500 });
    await session.start();
    await session.handle({ type: 'sort', sortId: 1, column: 1, direction: 'asc' });
    assert.strictEqual(env.of('sortState')[0].status, 'counting');
    await waitUntil(() => countDone(env), '行数を数え終える');
    await session.handle({ type: 'sort', sortId: 2, column: 1, direction: 'asc' });
    assert.strictEqual(env.of('sortState')[1].status, 'tooLarge');
    await session.dispose();
  });

  test('ファイルの変更を知らせる', async () => {
    const env = new FakeEnvironment(utf8(csv(1)));
    const session = new CsvSession(env);
    await session.start();
    session.fileChanged();
    assert.deepStrictEqual(env.messages[env.messages.length - 1], { type: 'fileChanged' });
    await session.dispose();
  });

  test('開けなければ、エラーを送る', async () => {
    const env = new FakeEnvironment(utf8(''));
    env.open = () => Promise.reject(new Error('EACCES: permission denied'));
    await new CsvSession(env).start();
    const errors = env.of('error');
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0].message, /EACCES/);
  });
});

suite('InProcessJobRunner', () => {
  test('止めた後は、途中経過を知らせない', async () => {
    const source = new MemorySource(utf8(csv(5000)));
    const runner = new InProcessJobRunner(source, { chunkSize: 64, reportEveryChunks: 1 });
    let received = 0;
    const handle = runner.run(
      { kind: 'index', format: { encoding: 'utf8', delimiter: 'comma', dataStart: 0 } },
      () => {
        received++;
        if (received === 3) {
          handle.cancel();
        }
      }
    );
    await handle.done;
    assert.strictEqual(received, 3);
  });
});
