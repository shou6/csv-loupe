import { FindHit, FindQuery, HostMessage } from '../core/protocol';
import { Translate } from '../core/translate';
import { el } from './dom';

type FindProgressMessage = Extract<HostMessage, { type: 'findProgress' }>;

/** 入力が止まってから検索を始めるまでの時間 */
const DEBOUNCE_MS = 300;

export interface FindCallbacks {
  search(searchId: number, query: FindQuery): void;
  cancel(): void;
  /** 一致したセルへ移動する */
  jump(hit: FindHit): void;
  columnName(column: number): string;
  /** 検索をリセットしたとき（強調表示を消すために表を描き直す） */
  cleared(): void;
  translate(): Translate;
}

/**
 * 検索欄と結果の一覧。一致の件数だけでなく、どの Row のどの列にあるかを一覧で見せる。
 * 検索は拡張機能ホスト（Worker）が行い、結果を少しずつ送ってくる。
 */
export class FindPanel {
  readonly bar: HTMLElement;
  readonly results: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly caseButton: HTMLButtonElement;
  private readonly wholeButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly list: HTMLElement;
  private readonly prevButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private caseSensitive = false;
  private wholeCell = false;
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
    this.status = el('span', { className: 'find-status', attrs: { 'aria-live': 'polite' } });
    this.prevButton = el('button', { text: '↑', on: { click: () => this.move(-1) } });
    this.nextButton = el('button', { text: '↓', on: { click: () => this.move(1) } });
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
      this.prevButton,
      this.nextButton,
      this.clearButton,
      this.status
    );
    this.list = el('div', { className: 'find-list', attrs: { role: 'listbox' } });
    this.results = el('div', { className: 'find-results', attrs: { hidden: '' } }, this.list);
    this.render();
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  /** Find Same Value。セル全体の一致で、大文字と小文字を区別して探す */
  findSameValue(value: string): void {
    this.input.value = value;
    this.caseSensitive = true;
    this.wholeCell = true;
    this.run();
  }

  /** 検索のリセット。検索語、設定、強調表示、一覧を消し、実行中の検索を止める */
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
  }

  /** ファイルを読み直したとき。結果は古くなるので消す（検索語は残す） */
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
    this.appendItems(message.hits);
    this.total = message.total;
    this.done = message.done;
    this.truncated = message.truncated;
    this.percent =
      message.fileSize > 0 ? Math.floor((message.scannedBytes / message.fileSize) * 100) : 100;
    if (first) {
      this.select(0);
    }
    this.render();
    return true;
  }

  render(): void {
    const t = this.callbacks.translate();
    this.input.placeholder = t('Find');
    this.input.setAttribute('aria-label', t('Find'));
    this.caseButton.title = t('Match Case');
    this.wholeButton.title = t('Match Whole Cell');
    this.prevButton.title = t('Previous Match');
    this.nextButton.title = t('Next Match');
    this.clearButton.title = t('Clear Search (Esc)');
    this.clearButton.disabled = this.input.value === '' && !this.lastQuery;
    for (const [button, on] of [
      [this.caseButton, this.caseSensitive],
      [this.wholeButton, this.wholeCell],
    ] as const) {
      button.classList.toggle('selected', on);
      button.setAttribute('aria-pressed', String(on));
    }
    this.prevButton.disabled = this.hits.length === 0;
    this.nextButton.disabled = this.hits.length === 0;
    this.status.textContent = this.statusText(t);
    this.results.hidden = this.hits.length === 0;
  }

  private statusText(t: Translate): string {
    if (!this.lastQuery) {
      return '';
    }
    const total = this.total.toLocaleString('en-US');
    let text: string;
    if (this.total === 0) {
      text = this.done ? t('No results') : '';
    } else if (this.current >= 0) {
      text = t('{0} of {1}', (this.current + 1).toLocaleString('en-US'), total);
    } else {
      text = this.total === 1 ? t('1 match') : t('{0} matches', total);
    }
    if (!this.done) {
      text = (text ? text + ' ' : '') + t('(searching… {0}%)', String(this.percent));
    } else if (this.truncated) {
      text += ' ' + t('(list shows the first {0})', this.hits.length.toLocaleString('en-US'));
    }
    return text;
  }

  private toggle(option: 'case' | 'whole'): void {
    if (option === 'case') {
      this.caseSensitive = !this.caseSensitive;
    } else {
      this.wholeCell = !this.wholeCell;
    }
    this.run();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.sameAsLast()) {
        this.move(event.shiftKey ? -1 : 1);
      } else {
        this.run();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.clear();
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
    this.list.replaceChildren();
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
    this.list.children[this.current]?.classList.remove('current');
    this.current = index;
    const item = this.list.children[index];
    item?.classList.add('current');
    item?.scrollIntoView({ block: 'nearest' });
    this.callbacks.jump(this.hits[index]);
  }

  private appendItems(hits: FindHit[]): void {
    const t = this.callbacks.translate();
    const start = this.list.children.length;
    this.list.append(
      ...hits.map((hit, i) =>
        el(
          'div',
          {
            className: 'find-item',
            attrs: { role: 'option' },
            on: {
              click: () => {
                this.select(start + i);
                this.render();
              },
            },
          },
          el('span', {
            className: 'find-row',
            text: t('Row {0}', hit.row.toLocaleString('en-US')),
          }),
          el('span', { className: 'find-column', text: this.callbacks.columnName(hit.column) }),
          el('span', { className: 'find-value', text: hit.value.replace(/\r?\n/g, '↵') })
        )
      )
    );
  }
}
