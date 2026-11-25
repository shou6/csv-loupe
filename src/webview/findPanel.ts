import { FindHit, FindQuery, HostMessage } from '../core/protocol';
import { Translate } from '../core/translate';
import { findKeyAction, findStatusText } from '../core/view/findBar';
import { el } from './dom';

type FindProgressMessage = Extract<HostMessage, { type: 'findProgress' }>;

/** 入力が止まってから検索を始めるまでの時間 */
const DEBOUNCE_MS = 300;

export interface FindCallbacks {
  search(searchId: number, query: FindQuery): void;
  cancel(): void;
  /** 一致したセルへ移動する */
  jump(hit: FindHit): void;
  /** 検索をリセットしたとき（強調表示を消すために表を描き直す） */
  cleared(): void;
  /** 絞り込みに使う検索が変わったとき（filterSearch() の値が変わりうる） */
  filterChanged(): void;
  translate(): Translate;
}

/**
 * 検索バー。一致したセルは表の中で強調し、Enter・↓・F3 などで次の一致へ移る。
 * 「一致した行だけ表示」をオンにすると、検索を終えた時点で表を絞り込む。
 * 検索は拡張機能ホスト（Worker）が行い、結果を少しずつ送ってくる。
 */
export class FindPanel {
  readonly bar: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly caseButton: HTMLButtonElement;
  private readonly wholeButton: HTMLButtonElement;
  private readonly filterButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private caseSensitive = false;
  private wholeCell = false;
  private filterOn = false;
  private searchId = 0;
  private lastQuery: FindQuery | undefined;
  private hits: FindHit[] = [];
  private hitKeys = new Set<string>();
  private total = 0;
  private done = true;
  private truncated = false;
  private percent = 0;
  private current = -1;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly callbacks: FindCallbacks) {
    this.input = el('input', {
      className: 'find-input',
      attrs: { type: 'text', spellcheck: 'false' },
      on: {
        input: () => {
          this.clearButton.disabled = false;
          this.scheduleSearch();
        },
        keydown: (event) => this.onKey(event as KeyboardEvent),
      },
    });
    this.caseButton = el('button', {
      className: 'toggle',
      text: 'Aa',
      on: { click: () => this.toggle('case') },
    });
    this.wholeButton = el('button', {
      className: 'toggle',
      text: '[ab]',
      on: { click: () => this.toggle('whole') },
    });
    this.filterButton = el('button', {
      className: 'toggle filter-toggle',
      on: { click: () => this.toggleFilter() },
    });
    this.status = el('span', { className: 'find-status', attrs: { 'aria-live': 'polite' } });
    this.prevButton = el('button', { text: '↑', on: { click: () => this.previous() } });
    this.nextButton = el('button', { text: '↓', on: { click: () => this.next() } });
    this.clearButton = el('button', {
      className: 'toggle',
      text: '×',
      on: { click: () => this.clear() },
    });
    this.bar = el(
      'div',
      { className: 'find-bar' },
      this.input,
      this.caseButton,
      this.wholeButton,
      this.filterButton,
      this.prevButton,
      this.nextButton,
      this.clearButton,
      this.status
    );
    this.render();
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  /** 次の一致へ移る */
  next(): void {
    this.move(1);
  }

  /** 前の一致へ移る */
  previous(): void {
    this.move(-1);
  }

  /**
   * 絞り込みに使う検索の番号。「一致した行だけ表示」がオンで、検索を終えているときだけ返す。
   * それ以外は null（絞り込まない）
   */
  filterSearch(): number | null {
    return this.filterOn && this.lastQuery && this.done ? this.searchId : null;
  }

  /** 検索中で、絞り込みを待っているか */
  filterPending(): boolean {
    return this.filterOn && this.lastQuery !== undefined && !this.done;
  }

  /** Find Same Value。セル全体の一致で、大文字と小文字を区別して探す */
  findSameValue(value: string): void {
    this.input.value = value;
    this.caseSensitive = true;
    this.wholeCell = true;
    this.run();
  }

  /** 検索のリセット。検索語、設定、強調表示を消し、実行中の検索を止める。絞り込みも解く */
  clear(): void {
    clearTimeout(this.timer);
    this.callbacks.cancel();
    this.input.value = '';
    this.caseSensitive = false;
    this.wholeCell = false;
    this.lastQuery = undefined;
    this.searchId++;
    this.clearResults();
    this.render();
    this.callbacks.cleared();
    this.callbacks.filterChanged();
  }

  /** ファイルを読み直したとき。結果は古くなるので消す（検索語と絞り込みの切り替えは残す） */
  reset(): void {
    this.callbacks.cancel();
    this.lastQuery = undefined;
    this.clearResults();
    this.render();
  }

  mark(row: number, column: number): 'match' | 'current-match' | undefined {
    const key = row + ':' + column;
    if (!this.hitKeys.has(key)) {
      return undefined;
    }
    const current = this.hits[this.current];
    return current && current.row === row && current.column === column ? 'current-match' : 'match';
  }

  onProgress(message: FindProgressMessage): boolean {
    if (message.searchId !== this.searchId) {
      return false;
    }
    const first = this.hits.length === 0 && message.hits.length > 0;
    for (const hit of message.hits) {
      this.hits.push(hit);
      this.hitKeys.add(hit.row + ':' + hit.column);
    }
    this.total = message.total;
    this.done = message.done;
    this.truncated = message.truncated;
    this.percent =
      message.fileSize > 0 ? Math.floor((message.scannedBytes / message.fileSize) * 100) : 100;
    // 絞り込みのときは、絞り込んでから最初の一致へ移る（表示の位置が変わるため）
    if (first && !this.filterOn) {
      this.select(0);
    }
    this.render();
    if (message.done) {
      this.callbacks.filterChanged();
    }
    return true;
  }

  /** 絞り込みを変えたあと、選んでいる一致（無ければ最初の一致）へ移る */
  revealCurrentMatch(): void {
    if (this.hits.length > 0) {
      this.select(Math.max(0, this.current));
      this.render();
    }
  }

  render(): void {
    const t = this.callbacks.translate();
    this.input.placeholder = t('Find');
    this.input.setAttribute('aria-label', t('Find'));
    this.caseButton.title = t('Match Case');
    this.wholeButton.title = t('Match Whole Cell');
    this.filterButton.textContent = t('Filter');
    this.filterButton.title = t('Show Only Matching Rows');
    this.prevButton.title = t('Previous Match');
    this.nextButton.title = t('Next Match');
    this.clearButton.title = t('Clear Search (Esc)');
    this.clearButton.disabled = this.input.value === '' && !this.lastQuery;
    for (const [button, on] of [
      [this.caseButton, this.caseSensitive],
      [this.wholeButton, this.wholeCell],
      [this.filterButton, this.filterOn],
    ] as const) {
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
    this.prevButton.disabled = this.hits.length === 0;
    this.nextButton.disabled = this.hits.length === 0;
    this.status.textContent = findStatusText(
      {
        total: this.total,
        current: this.current,
        stored: this.hits.length,
        done: this.done,
        truncated: this.truncated,
        percent: this.percent,
      },
      t,
      this.lastQuery !== undefined
    );
  }

  private toggle(option: 'case' | 'whole'): void {
    if (option === 'case') {
      this.caseSensitive = !this.caseSensitive;
    } else {
      this.wholeCell = !this.wholeCell;
    }
    this.run();
  }

  private toggleFilter(): void {
    this.filterOn = !this.filterOn;
    this.render();
    this.callbacks.filterChanged();
  }

  private onKey(event: KeyboardEvent): void {
    const action = findKeyAction(event, 'input');
    if (!action) {
      return;
    }
    event.preventDefault();
    // F3 は window でも受けるので、二重に動かさない
    event.stopPropagation();
    if (action === 'clear') {
      this.clear();
    } else if (event.key === 'Enter' && !this.sameAsLast()) {
      this.run();
    } else if (action === 'next') {
      this.next();
    } else {
      this.previous();
    }
  }

  private scheduleSearch(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), DEBOUNCE_MS);
  }

  private query(): FindQuery {
    return { text: this.input.value, caseSensitive: this.caseSensitive, wholeCell: this.wholeCell };
  }

  private sameAsLast(): boolean {
    return JSON.stringify(this.query()) === JSON.stringify(this.lastQuery);
  }

  private run(): void {
    clearTimeout(this.timer);
    const query = this.query();
    this.clearResults();
    this.searchId++;
    if (query.text === '' && !query.wholeCell) {
      this.lastQuery = undefined;
      this.callbacks.cancel();
      this.callbacks.cleared();
      this.callbacks.filterChanged();
    } else {
      this.lastQuery = query;
      this.done = false;
      this.callbacks.search(this.searchId, query);
    }
    this.render();
  }

  private clearResults(): void {
    this.hits = [];
    this.hitKeys.clear();
    this.total = 0;
    this.done = true;
    this.truncated = false;
    this.percent = 0;
    this.current = -1;
  }

  private move(step: number): void {
    if (this.hits.length === 0) {
      return;
    }
    const next = this.current < 0 ? 0 : (this.current + step + this.hits.length) % this.hits.length;
    this.select(next);
    this.render();
  }

  private select(index: number): void {
    this.current = index;
    this.callbacks.jump(this.hits[index]);
  }
}
