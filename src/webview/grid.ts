import { RowData } from '../core/protocol';
import { trimForDisplay } from '../core/view/cellText';
import { computeViewport, scrollTopForRow } from '../core/view/viewport';
import { appendTrimmed, el } from './dom';

/** 折り返さないときの行の高さ（CSS の .grid td と合わせる） */
export const ROW_HEIGHT = 24;
/** スクロールする要素の高さの上限。ブラウザの上限（約 3,300 万 px）より十分小さくする */
const MAX_CONTENT_HEIGHT = 8_000_000;
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 40;
/** 見えている範囲の前後に、先読みする行数 */
const PREFETCH = 100;

export interface CellPosition {
  row: number;
  column: number;
}

export type CellMark = 'match' | 'current-match';

export interface SortState {
  column: number;
  direction: 'asc' | 'desc';
}

/** 表に出すデータ。表示中の範囲（先頭の N 行か全行か、ソート中か）の対応は呼ぶ側が決める */
export interface GridSource {
  /** 全列の列名 */
  header(): string[];
  /** 表に出す列の番号（元の順） */
  columns(): number[];
  /** 表に出す行の数 */
  displayCount(): number;
  /** 表の index 番目（0 始まり）に出す Row。ソート中で、まだ分からなければ undefined */
  rowAt(index: number): number | undefined;
  getRow(row: number): RowData | undefined;
  /** 表の index の範囲で、まだ持っていない行を要求する */
  requestIndexes(fromIndex: number, count: number): void;
  wrap(): boolean;
  selected(): CellPosition | undefined;
  /** 検索の一致などの印 */
  mark(row: number, column: number): CellMark | undefined;
  sort(): SortState | undefined;
}

export interface GridEvents {
  onSelect(cell: CellPosition): void;
  /** 見出しをクリックしたとき（ソートの切り替え） */
  onHeaderClick(column: number): void;
}

/**
 * 仮想スクロールの表。スクロールする枠（element）の中に、全体の高さを持つ sizer を置き、
 * その中に画面の高さの枠（viewport）を sticky で固定して、見えている行だけを描く。
 * 見出しと行番号の列は常に見える。
 */
export class GridView {
  readonly element: HTMLDivElement;
  private readonly sizer: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly colgroup: HTMLTableColElement;
  private readonly headRow: HTMLTableRowElement;
  private readonly body: HTMLTableSectionElement;
  /** 列幅。元の列の番号で持ち、非表示にしても保つ */
  private widths: number[] = [];
  private rowNumberWidth = 60;
  private frame = 0;
  /** プログラムから移動した先。ブラウザがスクロール位置を丸めても、その行を先頭に保つ */
  private pinned: { index: number; scrollTop: number } | undefined;
  private firstIndex = 0;
  /** 空白の印の説明と、ソートの説明（翻訳済み） */
  whitespaceTitle = '';
  sortTitle = '';

  constructor(
    private readonly source: GridSource,
    private readonly events: GridEvents
  ) {
    this.colgroup = el('colgroup');
    this.headRow = el('tr');
    this.body = el('tbody');
    const table = el(
      'table',
      { className: 'grid' },
      this.colgroup,
      el('thead', {}, this.headRow),
      this.body
    );
    this.viewport = el('div', { className: 'grid-viewport' }, table);
    this.sizer = el('div', { className: 'grid-sizer' }, this.viewport);
    this.element = el(
      'div',
      { className: 'table-container', attrs: { tabindex: '0' } },
      this.sizer
    );
    this.element.addEventListener('scroll', () => this.schedule());
    new ResizeObserver(() => this.schedule()).observe(this.element);
    this.body.addEventListener('mousedown', (event) => this.onPointer(event));
    this.body.addEventListener('contextmenu', (event) => this.onPointer(event));
  }

  /** 見出し（列）が変わったとき。列幅を初期値に戻す */
  setHeader(): void {
    this.widths = this.source.header().map(() => DEFAULT_COLUMN_WIDTH);
    this.renderHeader();
    this.scrollToIndex(0);
  }

  /** 表示する列やソートの印が変わったとき */
  renderHeader(): void {
    const header = this.source.header();
    const sort = this.source.sort();
    this.headRow.replaceChildren(
      el('th', { className: 'row-number', text: '#' }),
      ...this.source.columns().map((column) => {
        const name = header[column] ?? '';
        const resizer = el('span', { className: 'resizer', attrs: { 'aria-hidden': 'true' } });
        resizer.addEventListener('mousedown', (event) => this.startResize(event, column));
        const sorted = sort?.column === column ? sort.direction : undefined;
        const th = el(
          'th',
          {
            className: sorted ? 'sorted' : '',
            title: name + (this.sortTitle ? '\n' + this.sortTitle : ''),
            attrs: sorted ? { 'aria-sort': sorted === 'asc' ? 'ascending' : 'descending' } : {},
            on: { click: () => this.events.onHeaderClick(column) },
          },
          el('span', { className: 'label', text: name }),
          el('span', {
            className: 'sort-mark',
            text: sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '',
          }),
          resizer
        );
        return th;
      })
    );
    this.renderColumns();
    this.schedule();
  }

  /** 行番号の列の幅を、行数の桁数に合わせる */
  setRowNumberDigits(digits: number): void {
    const width = Math.max(48, 20 + digits * 9);
    if (width !== this.rowNumberWidth) {
      this.rowNumberWidth = width;
      this.renderColumns();
    }
  }

  /** 表の index 番目の行を先頭に表示する */
  scrollToIndex(index: number): void {
    const scrollTop = scrollTopForRow(index + 1, this.viewportInput(0));
    this.element.scrollTop = scrollTop;
    this.pinned = { index, scrollTop: this.element.scrollTop };
    this.refresh();
  }

  /** index 番目の行が画面に入っていなければ、入るようにスクロールする */
  revealIndex(index: number): void {
    const visible = Math.max(1, Math.floor(this.rowsHeight() / ROW_HEIGHT));
    if (index < this.firstIndex || index >= this.firstIndex + visible) {
      this.scrollToIndex(Math.max(0, index - Math.floor(visible / 3)));
    } else {
      this.refresh();
    }
  }

  /** 列が横方向に見えていなければ、見えるようにスクロールする（行番号の列に隠れないようにする） */
  revealColumn(column: number): void {
    const columns = this.source.columns();
    const position = columns.indexOf(column);
    if (position < 0) {
      return;
    }
    const left = columns.slice(0, position).reduce((sum, c) => sum + this.width(c), 0);
    const width = this.width(column);
    const visibleLeft = this.element.scrollLeft;
    const visibleWidth = this.element.clientWidth - this.rowNumberWidth;
    if (left < visibleLeft) {
      this.element.scrollLeft = left;
    } else if (left + width > visibleLeft + visibleWidth) {
      this.element.scrollLeft = left + Math.min(width, visibleWidth) - visibleWidth;
    }
  }

  schedule(): void {
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.refresh();
      });
    }
  }

  refresh(): void {
    const input = this.viewportInput(this.element.scrollTop);
    const view = computeViewport(input);
    let first = view.firstRow - 1;
    if (this.pinned && Math.abs(this.element.scrollTop - this.pinned.scrollTop) <= 2) {
      first = Math.min(this.pinned.index, Math.max(0, input.totalRows - 1));
    } else {
      this.pinned = undefined;
    }
    const headerHeight = this.headerHeight();
    this.sizer.style.height =
      Math.max(view.contentHeight + headerHeight, this.element.clientHeight) + 'px';
    this.viewport.style.height = this.element.clientHeight + 'px';
    const count = Math.max(0, Math.min(view.visibleCount, input.totalRows - first));
    this.renderRows(first, count);
    if (this.source.wrap() && count > 0 && this.atBottom(input)) {
      this.fitLastRow(first, count);
    }
  }

  private width(column: number): number {
    return this.widths[column] ?? DEFAULT_COLUMN_WIDTH;
  }

  private viewportInput(scrollTop: number) {
    return {
      scrollTop,
      viewportHeight: this.rowsHeight(),
      rowHeight: ROW_HEIGHT,
      totalRows: this.source.displayCount(),
      maxContentHeight: MAX_CONTENT_HEIGHT,
    };
  }

  private headerHeight(): number {
    return this.headRow.offsetHeight || ROW_HEIGHT;
  }

  private rowsHeight(): number {
    return Math.max(ROW_HEIGHT, this.element.clientHeight - this.headerHeight());
  }

  private atBottom(input: { scrollTop: number }): boolean {
    const maxScroll = this.element.scrollHeight - this.element.clientHeight;
    return input.scrollTop >= maxScroll - 1;
  }

  /** 折り返しで行が高くなったとき、一番下では最後の行まで見えるように先頭をずらす */
  private fitLastRow(first: number, count: number): void {
    const last = first + count;
    let start = first;
    while (start < last - 1 && this.body.offsetHeight > this.rowsHeight()) {
      start++;
      this.renderRows(start, last - start);
    }
  }

  private renderColumns(): void {
    const columns = this.source.columns();
    const cols = [this.rowNumberWidth, ...columns.map((c) => this.width(c))].map((width) => {
      const col = el('col');
      col.style.width = width + 'px';
      return col;
    });
    this.colgroup.replaceChildren(...cols);
    const total = this.rowNumberWidth + columns.reduce((sum, c) => sum + this.width(c), 0);
    (this.colgroup.parentElement as HTMLElement).style.width = total + 'px';
  }

  private startResize(event: MouseEvent, column: number): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.width(column);
    const move = (e: MouseEvent) => {
      this.widths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + e.clientX - startX);
      this.renderColumns();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.schedule();
    };
    // 列幅を変えた後の click で、ソートが切り替わらないようにする
    const swallowClick = (e: MouseEvent) => e.stopPropagation();
    window.addEventListener('click', swallowClick, { capture: true, once: true });
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  private renderRows(first: number, count: number): void {
    this.firstIndex = first;
    const columns = this.source.columns();
    const selected = this.source.selected();
    const wrap = this.source.wrap();
    const rows: HTMLTableRowElement[] = [];
    let missingFrom: number | undefined;
    let missingTo = 0;
    for (let index = first; index < first + count; index++) {
      const rowNumber = this.source.rowAt(index);
      const data = rowNumber === undefined ? undefined : this.source.getRow(rowNumber);
      if (!data) {
        missingFrom ??= index;
        missingTo = index;
      }
      const classes = [index % 2 === 1 ? 'odd' : ''];
      if (rowNumber !== undefined && selected?.row === rowNumber) {
        classes.push('selected-row');
      }
      const tr = el('tr', { className: classes.join(' ').trim() });
      tr.append(
        el('td', {
          className: 'row-number',
          text: rowNumber === undefined ? '' : String(rowNumber),
        })
      );
      for (const column of columns) {
        tr.append(this.renderCell(data, column, selected, wrap));
      }
      rows.push(tr);
    }
    this.body.replaceChildren(...rows);
    this.body.classList.toggle('wrap', wrap);
    if (missingFrom !== undefined) {
      const from = Math.max(0, missingFrom - PREFETCH);
      this.source.requestIndexes(from, missingTo - from + 1 + PREFETCH);
    }
  }

  private renderCell(
    data: RowData | undefined,
    column: number,
    selected: CellPosition | undefined,
    wrap: boolean
  ): HTMLTableCellElement {
    if (!data) {
      return el('td', { className: 'pending', text: '…' });
    }
    const row = data.row;
    const value = data.cells[column] ?? '';
    const classes: string[] = [];
    if (selected?.row === row && selected.column === column) {
      classes.push('selected-cell');
    }
    const mark = this.source.mark(row, column);
    if (mark) {
      classes.push(mark);
    }
    const td = el('td', {
      className: classes.join(' '),
      title: value.length > 0 ? value : undefined,
      attrs: {
        'data-row': String(row),
        'data-column': String(column),
        'data-vscode-context': JSON.stringify({
          webviewSection: 'cell',
          row,
          column,
          preventDefaultContextMenuItems: true,
        }),
      },
    });
    // 前後の空白は詰めて印で示す。折り返さないときは、セルの中の改行を記号で見せて行の高さを保つ
    const display = trimForDisplay(value);
    appendTrimmed(
      td,
      display,
      wrap ? display.text : display.text.replace(/\r?\n/g, '↵'),
      this.whitespaceTitle
    );
    return td;
  }

  private onPointer(event: MouseEvent): void {
    const td = (event.target as HTMLElement).closest('td');
    if (!td?.dataset.row || !td.dataset.column) {
      return;
    }
    if (event.type === 'mousedown' && event.button !== 0) {
      return;
    }
    this.events.onSelect({ row: Number(td.dataset.row), column: Number(td.dataset.column) });
  }
}
