import { RowData } from '../core/protocol';
import { computeViewport, scrollTopForRow } from '../core/view/viewport';
import { el } from './dom';

/** 折り返さないときの行の高さ（CSS の .grid td と合わせる） */
export const ROW_HEIGHT = 22;
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

/** 表に出すデータ。表示中の範囲（先頭の N 行か全行か）の対応は呼ぶ側が決める */
export interface GridSource {
  header(): string[];
  /** 表に出す行の数 */
  displayCount(): number;
  /** 表の index 番目（0 始まり）に出す Row */
  rowAt(index: number): number;
  getRow(row: number): RowData | undefined;
  /** まだ持っていない行を要求する */
  requestRows(from: number, count: number): void;
  wrap(): boolean;
  selected(): CellPosition | undefined;
  /** 検索の一致などの印 */
  mark(row: number, column: number): CellMark | undefined;
}

export interface GridEvents {
  onSelect(cell: CellPosition): void;
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
  private widths: number[] = [];
  private rowNumberWidth = 60;
  private frame = 0;
  /** プログラムから移動した先。ブラウザがスクロール位置を丸めても、その行を先頭に保つ */
  private pinned: { index: number; scrollTop: number } | undefined;
  private firstIndex = 0;

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
    const header = this.source.header();
    this.widths = header.map(() => DEFAULT_COLUMN_WIDTH);
    this.renderHeader();
    this.scrollToIndex(0);
  }

  /** 行番号の列の幅を、行数の桁数に合わせる */
  setRowNumberDigits(digits: number): void {
    const width = Math.max(48, 16 + digits * 9);
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
    const count = Math.min(view.visibleCount, input.totalRows - first);
    this.renderRows(first, count);
    if (this.source.wrap() && count > 0 && this.atBottom(input)) {
      this.fitLastRow(first, count);
    }
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

  private renderHeader(): void {
    const header = this.source.header();
    this.headRow.replaceChildren(
      el('th', { className: 'row-number', text: '#' }),
      ...header.map((name, column) => {
        const resizer = el('span', { className: 'resizer', attrs: { 'aria-hidden': 'true' } });
        resizer.addEventListener('mousedown', (event) => this.startResize(event, column));
        return el('th', { title: name }, el('span', { className: 'label', text: name }), resizer);
      })
    );
    this.renderColumns();
  }

  private renderColumns(): void {
    const cols = [this.rowNumberWidth, ...this.widths].map((width) => {
      const col = el('col');
      col.style.width = width + 'px';
      return col;
    });
    this.colgroup.replaceChildren(...cols);
    const total =
      cols.length > 0 ? this.rowNumberWidth + this.widths.reduce((a, b) => a + b, 0) : 0;
    (this.colgroup.parentElement as HTMLElement).style.width = total + 'px';
  }

  private startResize(event: MouseEvent, column: number): void {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = this.widths[column];
    const move = (e: MouseEvent) => {
      this.widths[column] = Math.max(MIN_COLUMN_WIDTH, startWidth + e.clientX - startX);
      this.renderColumns();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.schedule();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  private renderRows(first: number, count: number): void {
    this.firstIndex = first;
    const header = this.source.header();
    const selected = this.source.selected();
    const wrap = this.source.wrap();
    const rows: HTMLTableRowElement[] = [];
    let missingFrom: number | undefined;
    let missingTo = 0;
    for (let index = first; index < first + count; index++) {
      const rowNumber = this.source.rowAt(index);
      const data = this.source.getRow(rowNumber);
      if (!data) {
        missingFrom ??= rowNumber;
        missingTo = rowNumber;
      }
      const columns = Math.max(header.length, data?.cells.length ?? 0);
      const tr = el('tr', {
        className: selected?.row === rowNumber ? 'selected-row' : '',
      });
      tr.append(el('td', { className: 'row-number', text: String(rowNumber) }));
      for (let column = 0; column < columns; column++) {
        tr.append(this.renderCell(data, rowNumber, column, selected, wrap));
      }
      rows.push(tr);
    }
    this.body.replaceChildren(...rows);
    this.body.classList.toggle('wrap', wrap);
    if (missingFrom !== undefined) {
      const from = Math.max(1, missingFrom - PREFETCH);
      this.source.requestRows(from, missingTo - from + 1 + PREFETCH);
    }
  }

  private renderCell(
    data: RowData | undefined,
    row: number,
    column: number,
    selected: CellPosition | undefined,
    wrap: boolean
  ): HTMLTableCellElement {
    if (!data) {
      return el('td', { className: 'pending', text: column === 0 ? '…' : '' });
    }
    const value = data.cells[column] ?? '';
    const classes: string[] = [];
    if (selected?.row === row && selected.column === column) {
      classes.push('selected-cell');
    }
    const mark = this.source.mark(row, column);
    if (mark) {
      classes.push(mark);
    }
    if (column >= this.source.header().length) {
      classes.push('extra');
    }
    // 折り返さないときは、セルの中の改行を記号で見せて行の高さを保つ
    const text = wrap ? value : value.replace(/\r?\n/g, '↵');
    const td = el('td', {
      className: classes.join(' '),
      text,
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
