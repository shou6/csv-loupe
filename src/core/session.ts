import { delimiterForFileName } from './csv/delimiter';
import { detectHeader } from './csv/header';
import { CsvFormat } from './csv/types';
import { bomLength, detectEncoding, resolveEncoding } from './encoding/detect';
import { SparseIndex } from './index/sparseIndex';
import { errorMessage, JobHandle, JobMessage, JobRunner } from './jobs';
import {
  ContextCommand,
  DelimiterId,
  EncodingChoice,
  EncodingId,
  FindQuery,
  HostMessage,
  InitMessage,
  RowData,
  SortDirection,
  SortStatus,
  WebviewMessage,
} from './protocol';
import { readHead, readRows, shapeInitial } from './read/rowReader';
import { ByteSource } from './source/byteSource';

/** 開いた直後に送る行数 */
export const INITIAL_ROWS = 100;
/** 文字コードの判定に使う先頭のバイト数 */
const HEAD_SIZE = 64 * 1024;
/** 1 回の要求で返す行数の上限 */
const MAX_ROWS_PER_REQUEST = 1000;
/** 検索の一覧に入れる一致の上限 */
export const FIND_LIMIT = 10_000;
/** ソートできる行数の上限 */
export const SORT_LIMIT = 1_000_000;

/** セッションが頼る外側の機能。拡張機能ホストでは vscode の API で、テストではフェイクで実装する */
export interface SessionEnvironment {
  readonly fileName: string;
  /** 翻訳の表（vscode.l10n.bundle） */
  readonly l10n: Record<string, string> | undefined;
  /** ファイルを開き、そのファイルでジョブを動かすものと一緒に返す */
  open(): Promise<{ source: ByteSource; runner: JobRunner }>;
  post(message: HostMessage): void;
  copy(text: string): Promise<void>;
  /** 標準のテキストエディタで元のファイルを開き、line 行目へ移動する */
  openSource(line: number, encoding: EncodingId): Promise<void>;
}

/** 読み込んだファイルの状態。読み直すたびに作り直す */
interface Loaded {
  generation: number;
  source: ByteSource;
  runner: JobRunner;
  format: CsvFormat;
  index: SparseIndex;
  /** Row 1 にあたるレコードの番号（ヘッダーありなら 1、なしなら 0） */
  firstDataRecord: number;
  initialRows: number;
  rowsCounted: number;
  countDone: boolean;
  init: InitMessage;
  /** ソート中の順序。order[i] は表示の位置 i + 1 の Row、position[r - 1] は Row r の表示の位置 */
  sort?: { column: number; direction: SortDirection; order: Uint32Array; position: Uint32Array };
}

/** 近い Row をまとめて読むときの、1 回で読む範囲の上限 */
const GROUP_SPAN = 128;

/** 指定した Row（順不同）を読む。近いもの同士はまとめて読む */
async function readRowsAt(loaded: Loaded, rows: number[]): Promise<Map<number, RowData>> {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  const result = new Map<number, RowData>();
  let i = 0;
  while (i < sorted.length) {
    const start = sorted[i];
    let end = start;
    while (i + 1 < sorted.length && sorted[i + 1] - start < GROUP_SPAN) {
      end = sorted[++i];
    }
    i++;
    const read = await readRows(
      loaded.source,
      loaded.format,
      loaded.index,
      start,
      end - start + 1,
      loaded.rowsCounted,
      loaded.firstDataRecord
    );
    for (const row of read) {
      result.set(row.row, row);
    }
  }
  return result;
}

/**
 * 開いている 1 つのファイルを受け持つ。Webview からのメッセージに応じて読み、結果を送る。
 * vscode に依存しない。
 */
export class CsvSession {
  private generation = 0;
  private loaded: Loaded | undefined;
  private indexJob: JobHandle | undefined;
  private searchJob: JobHandle | undefined;
  private sortJob: JobHandle | undefined;
  /** 画面で選んだ文字コードと区切り文字。再読み込みでも保つ */
  private encodingChoice: EncodingChoice | undefined;
  private delimiterChoice: DelimiterId | undefined;
  private headerChoice: boolean | undefined;

  constructor(
    private readonly env: SessionEnvironment,
    private readonly options: { sortLimit?: number } = {}
  ) {}

  start(): Promise<void> {
    return this.load();
  }

  async handle(message: WebviewMessage): Promise<void> {
    const loaded = this.loaded;
    try {
      switch (message.type) {
        case 'ready':
          if (loaded) {
            this.env.post(loaded.init);
            this.env.post(progressMessage(loaded));
          }
          break;
        case 'requestRows':
          if (loaded && message.sortId !== undefined) {
            await this.sendSortedRows(loaded, message.requestId, message.from, message.count);
          } else if (loaded) {
            const rows = await readRows(
              loaded.source,
              loaded.format,
              loaded.index,
              message.from,
              Math.min(message.count, MAX_ROWS_PER_REQUEST),
              loaded.rowsCounted,
              loaded.firstDataRecord
            );
            if (loaded === this.loaded) {
              this.env.post({
                type: 'rows',
                generation: loaded.generation,
                requestId: message.requestId,
                rows,
              });
            }
          }
          break;
        case 'find':
          if (loaded) {
            this.find(loaded, message.searchId, message.query);
          }
          break;
        case 'sort':
          if (loaded) {
            this.sort(loaded, message.sortId, message.column, message.direction);
          }
          break;
        case 'locateRow':
          if (loaded) {
            const position = loaded.sort ? loaded.sort.position[message.row - 1] : message.row;
            this.env.post({
              type: 'rowLocated',
              generation: loaded.generation,
              requestId: message.requestId,
              row: message.row,
              position: position ?? message.row,
            });
          }
          break;
        case 'cancelFind':
          this.searchJob?.cancel();
          this.searchJob = undefined;
          break;
        case 'setEncoding':
          this.encodingChoice = message.encoding;
          await this.load();
          break;
        case 'setDelimiter':
          this.delimiterChoice = message.delimiter;
          await this.load();
          break;
        case 'setHeader':
          this.headerChoice = message.hasHeader;
          await this.load();
          break;
        case 'reload':
          await this.load();
          break;
        case 'copy':
          await this.env.copy(message.text);
          break;
        case 'openSource':
          if (loaded) {
            await this.env.openSource(message.line, loaded.format.encoding);
          }
          break;
      }
    } catch (error) {
      // 読み直しで閉じたファイルを読んでいた場合などは、古い結果なので知らせない
      if (loaded === this.loaded) {
        this.env.post({ type: 'error', message: errorMessage(error) });
      }
    }
  }

  /** 右クリックメニューのコマンド。処理は表示中のデータを持つ Webview が行う */
  contextCommand(command: ContextCommand, row: number, column: number): void {
    this.env.post({ type: 'contextCommand', command, row, column });
  }

  fileChanged(): void {
    this.env.post({ type: 'fileChanged' });
  }

  async dispose(): Promise<void> {
    this.generation++;
    this.stopJobs();
    const loaded = this.loaded;
    this.loaded = undefined;
    await loaded?.source.close().catch(() => undefined);
  }

  private stopJobs(): void {
    this.indexJob?.cancel();
    this.indexJob = undefined;
    this.searchJob?.cancel();
    this.searchJob = undefined;
    this.sortJob?.cancel();
    this.sortJob = undefined;
  }

  /** ソート中の表示の位置 from から count 行を、位置と一緒に送る */
  private async sendSortedRows(
    loaded: Loaded,
    requestId: number,
    from: number,
    count: number
  ): Promise<void> {
    const order = loaded.sort?.order;
    const positions: number[] = [];
    const wanted: number[] = [];
    if (order) {
      const last = Math.min(from + Math.min(count, MAX_ROWS_PER_REQUEST) - 1, order.length);
      for (let position = Math.max(1, from); position <= last; position++) {
        positions.push(position);
        wanted.push(order[position - 1]);
      }
    }
    const read = await readRowsAt(loaded, wanted);
    if (loaded !== this.loaded) {
      return;
    }
    const rows: RowData[] = [];
    const found: number[] = [];
    wanted.forEach((row, i) => {
      const data = read.get(row);
      if (data) {
        rows.push(data);
        found.push(positions[i]);
      }
    });
    this.env.post({
      type: 'rows',
      generation: loaded.generation,
      requestId,
      rows,
      positions: found,
    });
  }

  /** 1 列で並べ替える。direction が null なら元の順に戻す */
  private sort(
    loaded: Loaded,
    sortId: number,
    column: number,
    direction: SortDirection | null
  ): void {
    this.sortJob?.cancel();
    this.sortJob = undefined;
    const state = (status: SortStatus, dir: SortDirection | null = direction) =>
      this.env.post({
        type: 'sortState',
        generation: loaded.generation,
        sortId,
        status,
        column,
        direction: dir,
      });
    if (direction === null) {
      loaded.sort = undefined;
      state('cleared');
      return;
    }
    if (!loaded.countDone) {
      state('counting', null);
      return;
    }
    if (loaded.rowsCounted > (this.options.sortLimit ?? SORT_LIMIT)) {
      state('tooLarge', null);
      return;
    }
    state('sorting');
    this.sortJob = loaded.runner.run(
      {
        kind: 'sort',
        format: loaded.format,
        column,
        direction,
        firstDataRecord: loaded.firstDataRecord,
      },
      (message) => {
        if (loaded !== this.loaded) {
          return;
        }
        if (message.kind === 'error') {
          this.env.post({ type: 'error', message: message.message });
          state('cleared', null);
        } else if (message.kind === 'sortResult') {
          const order = Uint32Array.from(message.rows);
          const position = new Uint32Array(order.length);
          order.forEach((row, i) => {
            position[row - 1] = i + 1;
          });
          loaded.sort = { column, direction, order, position };
          state('done');
        }
      }
    );
  }

  /** 検索を始める。実行中の検索は止める */
  private find(loaded: Loaded, searchId: number, query: FindQuery): void {
    this.searchJob?.cancel();
    const fileSize = loaded.source.size;
    this.searchJob = loaded.runner.run(
      {
        kind: 'search',
        format: loaded.format,
        query,
        limit: FIND_LIMIT,
        firstDataRecord: loaded.firstDataRecord,
      },
      (message) => {
        if (loaded !== this.loaded) {
          return;
        }
        if (message.kind === 'error') {
          this.env.post({ type: 'error', message: message.message });
        } else if (message.kind === 'searchProgress') {
          const p = message.progress;
          this.env.post({
            type: 'findProgress',
            generation: loaded.generation,
            searchId,
            hits: p.hits,
            total: p.total,
            scannedBytes: p.scannedBytes,
            fileSize,
            done: p.done,
            truncated: p.truncated,
          });
        }
      }
    );
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.stopJobs();
    const previous = this.loaded;
    this.loaded = undefined;
    await previous?.source.close().catch(() => undefined);
    let source: ByteSource | undefined;
    try {
      const opened = await this.env.open();
      source = opened.source;
      if (generation !== this.generation) {
        await source.close();
        return;
      }
      const head = await source.read(0, HEAD_SIZE);
      const detection = this.encodingChoice
        ? { encoding: resolveEncoding(this.encodingChoice, head), confident: true }
        : detectEncoding(head, head.length >= source.size);
      const format: CsvFormat = {
        encoding: detection.encoding,
        delimiter: this.delimiterChoice ?? delimiterForFileName(this.env.fileName),
        dataStart: bomLength(detection.encoding, head),
      };
      const headRecords = await readHead(source, format, INITIAL_ROWS + 1);
      const header =
        this.headerChoice !== undefined
          ? { hasHeader: this.headerChoice, confident: true }
          : detectHeader(headRecords.records.map((record) => record.cells));
      const initial = shapeInitial(headRecords, header.hasHeader, INITIAL_ROWS);
      const firstDataRecord = header.hasHeader ? 1 : 0;
      if (generation !== this.generation) {
        await source.close();
        return;
      }
      const index = new SparseIndex(format.dataStart);
      const loaded: Loaded = {
        generation,
        source,
        runner: opened.runner,
        format,
        index,
        firstDataRecord,
        initialRows: initial.rows.length,
        rowsCounted: initial.rows.length,
        countDone: initial.complete,
        init: {
          type: 'init',
          generation,
          fileName: this.env.fileName,
          encoding: detection.encoding,
          encodingConfident: detection.confident,
          delimiter: format.delimiter,
          hasHeader: header.hasHeader,
          headerConfident: header.confident,
          header: initial.header,
          columnCount: Math.max(0, ...headRecords.records.map((record) => record.cells.length)),
          rows: initial.rows,
          rowsCounted: initial.rows.length,
          countDone: initial.complete,
          l10n: this.env.l10n,
        },
      };
      this.loaded = loaded;
      this.env.post(loaded.init);
      if (initial.complete) {
        // 先頭を読んだ時点で最後まで読めた。行数は確定しているので数えない
        index.extend([], [], headRecords.records.length);
        index.markComplete();
      } else {
        this.indexJob = opened.runner.run({ kind: 'index', format }, (message) =>
          this.onIndexMessage(loaded, message)
        );
      }
    } catch (error) {
      if (generation === this.generation) {
        await source?.close().catch(() => undefined);
        this.env.post({ type: 'error', message: errorMessage(error) });
      }
    }
  }

  private onIndexMessage(loaded: Loaded, message: JobMessage): void {
    if (loaded !== this.loaded) {
      return;
    }
    if (message.kind === 'error') {
      this.env.post({ type: 'error', message: message.message });
      return;
    }
    if (message.kind !== 'indexProgress') {
      return;
    }
    const progress = message.progress;
    loaded.index.extend(progress.offsets, progress.lines, progress.recordCount);
    const counted = Math.max(progress.recordCount - loaded.firstDataRecord, 0);
    if (progress.done) {
      loaded.index.markComplete();
      loaded.rowsCounted = counted;
      loaded.countDone = true;
    } else {
      // 先頭の行は読めているので、数えた件数がそれより少なくても減らさない
      loaded.rowsCounted = Math.max(loaded.initialRows, counted);
    }
    this.env.post(progressMessage(loaded));
  }
}

function progressMessage(loaded: Loaded): HostMessage {
  return {
    type: 'progress',
    generation: loaded.generation,
    rowsCounted: loaded.rowsCounted,
    countDone: loaded.countDone,
  };
}
