import { DELIMITERS, delimiterChar } from '../core/csv/delimiter';
import { formatRecord } from '../core/csv/format';
import {
  ContextCommand,
  DelimiterId,
  EncodingChoice,
  HostMessage,
  InitMessage,
  RowData,
  SortDirection,
} from '../core/protocol';
import { createTranslator, Translate } from '../core/translate';
import { columnNames, matchColumns, visibleColumns } from '../core/view/columns';
import { delimiterLabel, encodingLabel, rowCountLabel } from '../core/view/labels';
import { parseRowInput, tailStart } from '../core/view/navigation';
import { el } from './dom';
import { FindPanel } from './findPanel';
import { CellPosition, GridView, SortState } from './grid';
import { RecordView } from './recordView';
import { onHostMessage, post } from './vscodeApi';

/** 表示行数の候補。0 は All（全行） */
const PEEK_SIZES = [1, 10, 100, 0];
/** 画面で選べる文字コード */
const ENCODINGS: EncodingChoice[] = ['utf8', 'shiftjis', 'utf16le', 'utf16be'];
/** 行のキャッシュの上限。超えたら表示中の付近以外を捨てる */
const CACHE_LIMIT = 20_000;
/** ソートできる行数の上限（拡張機能ホストと合わせる） */
const SORT_LIMIT = 1_000_000;

interface State {
  init: InitMessage | undefined;
  rowsCounted: number;
  countDone: boolean;
  /** 表示行数。0 は All */
  peekSize: number;
  /** All 以外のときに表示する先頭の位置（Tail で変わる） */
  peekStart: number;
  selected: CellPosition | undefined;
  wrap: boolean;
  error: string | undefined;
  /** 表示中に元のファイルが変わった */
  fileChanged: boolean;
  /** 列名（ヘッダーなしなら「列 1」…） */
  columns: string[];
  /** 非表示にした列の番号 */
  hidden: Set<number>;
  /** 有効なソート。並べ替えが終わってから設定する */
  sort: (SortState & { sortId: number }) | undefined;
  /** 並べ替え中の列。終わるまで見出しに印を出す */
  sorting: number | undefined;
}

const state: State = {
  init: undefined,
  rowsCounted: 0,
  countDone: false,
  peekSize: 10,
  peekStart: 1,
  selected: undefined,
  wrap: false,
  error: undefined,
  fileChanged: false,
  columns: [],
  hidden: new Set(),
  sort: undefined,
  sorting: undefined,
};

/** Row → 行のデータ */
const cache = new Map<number, RowData>();
/** ソート中の、表示の位置 → Row */
const sortedRows = new Map<number, number>();
let requestId = 0;
let sortId = 0;
/** 返事を待っている要求。1 つずつ送り、返事が来てから次を送る */
let inFlight: { id: number } | undefined;
let queued: { from: number; count: number } | undefined;
/** ソート中の移動で、ホストに位置を尋ねている要求（要求の番号 → 列） */
const pendingJumps = new Map<number, number>();

let t: Translate = createTranslator(undefined);

const app = document.getElementById('app') as HTMLElement;
const toolbar = el('div', { className: 'toolbar' });
const banners = el('div', { className: 'banners' });
const statusBar = el('div', { className: 'status-bar' });
const columnsPanel = el('div', { className: 'columns-panel', attrs: { hidden: '' } });
const goToInput = el('input', {
  className: 'goto-input',
  attrs: { type: 'text', inputmode: 'numeric', spellcheck: 'false' },
  on: {
    keydown: (event) => {
      if ((event as KeyboardEvent).key === 'Enter') {
        event.preventDefault();
        goToRow(goToInput.value);
      }
    },
  },
});

function columnName(column: number): string {
  return state.columns[column] ?? t('(column {0})', String(column + 1));
}

/** 列の表示・非表示のパネルを開いているか */
function columnsOpen(): boolean {
  return columnsPanel.hidden !== true;
}

function shownColumns(): number[] {
  return visibleColumns(state.columns.length, state.hidden);
}

/** 表示中の範囲の先頭の位置（1 始まり） */
function basePosition(): number {
  return state.peekSize === 0 ? 1 : state.peekStart;
}

/** 表示中の範囲の行数 */
function displayCount(): number {
  if (state.peekSize === 0) {
    return state.rowsCounted;
  }
  return Math.max(0, Math.min(state.peekSize, state.rowsCounted - state.peekStart + 1));
}

function rowAt(index: number): number | undefined {
  const position = basePosition() + index;
  return state.sort ? sortedRows.get(position) : position;
}

/** 選んだ行の Row と Source Line（元のファイルの行）を出す */
function renderStatus(): void {
  const selected = state.selected;
  const data = selected ? cache.get(selected.row) : undefined;
  if (!selected || !data || !state.init) {
    statusBar.replaceChildren(el('span', { text: t('Select a cell to see its position.') }));
    return;
  }
  statusBar.replaceChildren(
    el('span', { className: 'strong', text: t('Row {0}', data.row.toLocaleString('en-US')) }),
    el('span', { text: t('Source Line {0}', data.line.toLocaleString('en-US')) }),
    el('span', { text: columnName(selected.column) }),
    el('button', {
      className: 'link',
      text: t('Open Source at Row'),
      on: { click: () => post({ type: 'openSource', line: data.line }) },
    })
  );
}

/** 知らせ（一時的な案内）。次の操作で消える */
let notice: string | undefined;

function showNotice(message: string | undefined): void {
  notice = message;
  renderBanners();
}

/** 行数を数え終える前は使えない操作の案内 */
function countingNotice(): void {
  showNotice(t('Available after row counting finishes.'));
}

function goToRow(text: string): void {
  const result = parseRowInput(text, state.rowsCounted, state.countDone);
  if ('error' in result) {
    if (result.error === 'counting') {
      countingNotice();
    } else if (result.error === 'outOfRange') {
      showNotice(t('Enter a row number from 1 to {0}.', state.rowsCounted.toLocaleString('en-US')));
    } else {
      showNotice(t('Enter a row number.'));
    }
    return;
  }
  jumpTo(result.row, state.selected?.column ?? shownColumns()[0] ?? 0);
}

/** 末尾へ移る。All 以外の表示行数のときは、末尾から表示行数ぶんを表示する */
function tail(): void {
  if (!state.countDone) {
    countingNotice();
    return;
  }
  showNotice(undefined);
  if (state.peekSize === 0) {
    grid.scrollToIndex(Math.max(0, state.rowsCounted - 1));
  } else {
    state.peekStart = tailStart(state.rowsCounted, state.peekSize);
    grid.scrollToIndex(0);
  }
}

const recordView = new RecordView(() => {
  recordView.hide();
  renderToolbar();
});

function renderRecord(): void {
  const selected = state.selected;
  recordView.render(
    state.columns,
    selected ? cache.get(selected.row) : undefined,
    selected?.column,
    t
  );
}

function openRecordView(): void {
  recordView.show();
  renderToolbar();
  renderRecord();
}

const grid = new GridView(
  {
    header: () => state.columns,
    columns: shownColumns,
    displayCount,
    rowAt,
    getRow: (row) => cache.get(row),
    requestIndexes,
    wrap: () => state.wrap,
    selected: () => state.selected,
    mark: (row, column) => findPanel.mark(row, column),
    sort: () => state.sort,
    sorting: () => state.sorting,
  },
  {
    onSelect: (cell) => {
      state.selected = cell;
      grid.refresh();
      renderRecord();
      renderStatus();
    },
    // 直前の onSelect でセルを選んでいるので、開くだけでよい
    onOpen: () => openRecordView(),
    onHeaderClick: (column) => toggleSort(column),
  }
);

const findPanel = new FindPanel({
  search: (searchId, query) => post({ type: 'find', searchId, query }),
  cancel: () => post({ type: 'cancelFind' }),
  jump: (hit) => jumpTo(hit.row, hit.column),
  columnName,
  cleared: () => grid.refresh(),
  translate: () => t,
});

/** セルを選んで表示する。非表示の列なら表示に戻す。ソート中は表示の位置をホストに尋ねる */
function jumpTo(row: number, column: number): void {
  if (row > state.rowsCounted) {
    showNotice(t('Row {0} can be shown after row counting finishes.', row.toLocaleString('en-US')));
    return;
  }
  showNotice(undefined);
  if (state.hidden.delete(column)) {
    columnsChanged();
  }
  state.selected = { row, column };
  if (state.sort) {
    const id = ++requestId;
    pendingJumps.set(id, column);
    post({ type: 'locateRow', requestId: id, row });
    return;
  }
  revealPosition(row, column);
}

/** 表示の位置へスクロールする。All 以外の表示行数で範囲の外なら All に切り替える */
function revealPosition(position: number, column: number): void {
  if (
    state.peekSize !== 0 &&
    (position < state.peekStart || position >= state.peekStart + state.peekSize)
  ) {
    state.peekSize = 0;
    renderToolbar();
  }
  grid.revealIndex(position - basePosition());
  grid.revealColumn(column);
  renderRecord();
  renderStatus();
}

/** 表の index の範囲の行を要求する（ソート中は表示の位置で、そうでなければ Row で） */
function requestIndexes(fromIndex: number, count: number): void {
  const base = basePosition();
  const first = base + Math.max(0, fromIndex);
  const last = Math.min(base + fromIndex + count - 1, base + displayCount() - 1);
  if (last < first) {
    return;
  }
  if (inFlight) {
    queued = { from: fromIndex, count };
    return;
  }
  inFlight = { id: ++requestId };
  post({
    type: 'requestRows',
    requestId: inFlight.id,
    from: first,
    count: last - first + 1,
    sortId: state.sort?.sortId,
  });
}

function pruneCache(): void {
  if (cache.size <= CACHE_LIMIT) {
    return;
  }
  const visible = new Set<number>();
  for (let index = 0; index < 200; index++) {
    const row = rowAt(index);
    if (row !== undefined) {
      visible.add(row);
    }
  }
  const center = rowAt(0) ?? 1;
  for (const row of cache.keys()) {
    if (!visible.has(row) && Math.abs(row - center) > CACHE_LIMIT / 4) {
      cache.delete(row);
    }
  }
}

/** 見出しのクリックで、昇順 → 降順 → 元の順を切り替える */
function toggleSort(column: number): void {
  let direction: SortDirection | null = 'asc';
  if (state.sort?.column === column) {
    direction = state.sort.direction === 'asc' ? 'desc' : null;
  }
  if (direction !== null && !state.countDone) {
    showNotice(t('Sorting is available after row counting finishes.'));
    return;
  }
  if (direction !== null && state.rowsCounted > SORT_LIMIT) {
    showNotice(
      t('Sorting is available for files with up to {0} rows.', SORT_LIMIT.toLocaleString('en-US'))
    );
    return;
  }
  post({ type: 'sort', sortId: ++sortId, column, direction });
}

function copyCell(cell: CellPosition): void {
  const value = cache.get(cell.row)?.cells[cell.column];
  if (value !== undefined) {
    post({ type: 'copy', text: value });
  }
}

function copyRow(row: number): void {
  const data = cache.get(row);
  if (data && state.init) {
    post({ type: 'copy', text: formatRecord(data.cells, delimiterChar(state.init.delimiter)) });
  }
}

function runContextCommand(command: ContextCommand, cell: CellPosition): void {
  state.selected = cell;
  switch (command) {
    case 'copyCell':
      copyCell(cell);
      break;
    case 'copyRow':
      copyRow(cell.row);
      break;
    case 'openRecordView':
      openRecordView();
      break;
    case 'openSourceAtRow': {
      const line = cache.get(cell.row)?.line;
      if (line !== undefined) {
        post({ type: 'openSource', line });
      }
      break;
    }
    case 'findSameValue': {
      const value = cache.get(cell.row)?.cells[cell.column];
      if (value !== undefined) {
        findPanel.findSameValue(value);
      }
      break;
    }
    default:
      break;
  }
  grid.refresh();
  renderRecord();
  renderStatus();
}

function setPeekSize(size: number): void {
  state.peekSize = size;
  if (size !== 0) {
    state.peekStart = 1;
  }
  renderToolbar();
  grid.scrollToIndex(0);
}

/** 列の一覧の絞り込みの文字 */
let columnFilter = '';

/** 列の表示・非表示を選ぶパネル */
function renderColumnsPanel(): void {
  const list = el('div', { className: 'columns-list' });
  const filter = el('input', {
    className: 'columns-filter',
    attrs: { type: 'text', spellcheck: 'false', placeholder: t('Filter columns') },
    on: {
      input: () => {
        columnFilter = filter.value;
        renderColumnList(list);
      },
    },
  });
  filter.value = columnFilter;
  const showAll = el('button', {
    text: t('Show All'),
    on: {
      click: () => {
        state.hidden.clear();
        columnsChanged();
      },
    },
  });
  const close = el('button', {
    className: 'icon',
    text: '×',
    title: t('Close'),
    attrs: { 'aria-label': t('Close') },
    on: { click: () => toggleColumnsPanel(false) },
  });
  columnsPanel.replaceChildren(
    el('div', { className: 'columns-head' }, filter, showAll, close),
    list
  );
  renderColumnList(list);
}

function renderColumnList(list: HTMLElement): void {
  list.replaceChildren(
    ...matchColumns(state.columns, columnFilter).map((column) => {
      const box = el('input', {
        attrs: { type: 'checkbox' },
        on: {
          change: () => {
            if (box.checked) {
              state.hidden.delete(column);
            } else {
              state.hidden.add(column);
            }
            columnsChanged(false);
          },
        },
      });
      box.checked = !state.hidden.has(column);
      return el(
        'label',
        { className: 'columns-item', title: state.columns[column] },
        box,
        el('span', { text: state.columns[column] })
      );
    })
  );
}

function columnsChanged(rerenderPanel = true): void {
  grid.renderHeader();
  renderToolbar();
  if (rerenderPanel && columnsOpen()) {
    renderColumnsPanel();
  }
}

function toggleColumnsPanel(open: boolean): void {
  columnsPanel.hidden = !open;
  if (open) {
    renderColumnsPanel();
    columnsPanel.querySelector('input')?.focus();
  }
  renderToolbar();
}

function renderToolbar(): void {
  const init = state.init;
  if (!init) {
    toolbar.replaceChildren();
    return;
  }
  const info = el(
    'div',
    { className: 'info' },
    el('span', { className: 'file-name', text: init.fileName }),
    el('span', {
      className: 'counts',
      text: rowCountLabel(state.rowsCounted, state.countDone, state.columns.length, t),
    }),
    encodingSelect(init),
    delimiterSelect(init),
    headerSelect(init)
  );
  const sizes = el(
    'div',
    { className: 'segmented', attrs: { role: 'group', 'aria-label': t('Rows to show') } },
    ...PEEK_SIZES.map((size) =>
      el('button', {
        className: size === state.peekSize ? 'selected' : '',
        text: size === 0 ? t('All') : size === 1 ? t('1 row') : t('{0} rows', String(size)),
        attrs: { 'aria-pressed': String(size === state.peekSize) },
        on: { click: () => setPeekSize(size) },
      })
    )
  );
  const columnsButton = el('button', {
    className: columnsOpen() ? 'selected' : state.hidden.size > 0 ? 'filtered' : '',
    text: t('Columns ({0}/{1})', String(shownColumns().length), String(state.columns.length)),
    attrs: { 'aria-pressed': String(columnsOpen()) },
    on: { click: () => toggleColumnsPanel(!columnsOpen()) },
  });
  const wrap = el('button', {
    className: state.wrap ? 'selected' : '',
    text: t('Word Wrap'),
    attrs: { 'aria-pressed': String(state.wrap) },
    on: {
      click: () => {
        state.wrap = !state.wrap;
        renderToolbar();
        grid.refresh();
      },
    },
  });
  const record = el('button', {
    className: recordView.open ? 'selected' : '',
    text: t('Record View'),
    attrs: { 'aria-pressed': String(recordView.open) },
    on: {
      click: () => {
        if (recordView.open) {
          recordView.hide();
          renderToolbar();
        } else {
          openRecordView();
        }
      },
    },
  });
  goToInput.placeholder = t('Go to Row');
  goToInput.setAttribute('aria-label', t('Go to Row'));
  const tailButton = el('button', {
    text: t('Tail'),
    title: t('Show the last rows'),
    on: { click: () => tail() },
  });
  toolbar.replaceChildren(
    info,
    el('div', { className: 'controls' }, sizes, columnsButton, wrap, record),
    el(
      'div',
      { className: 'find-row-bar' },
      findPanel.bar,
      el('div', { className: 'goto' }, goToInput, tailButton)
    )
  );
  findPanel.render();
}

/** 文字コードの表示と切り替え。判定に確信がなければ ? を付けて目立たせる */
function encodingSelect(init: InitMessage): HTMLElement {
  const current: EncodingChoice = init.encoding === 'utf8bom' ? 'utf8' : init.encoding;
  const select = el(
    'select',
    {
      className: init.encodingConfident ? '' : 'uncertain',
      attrs: { 'aria-label': t('Encoding') },
      on: {
        change: () => post({ type: 'setEncoding', encoding: select.value as EncodingChoice }),
      },
    },
    ...ENCODINGS.map((encoding) => {
      const option = el('option', {
        text:
          encoding === current
            ? encodingLabel(init.encoding, init.encodingConfident)
            : encodingLabel(encoding, true),
        attrs: { value: encoding },
      });
      option.selected = encoding === current;
      return option;
    })
  );
  select.title = init.encodingConfident
    ? t('Encoding')
    : t('The encoding was guessed. Choose another one if the text looks wrong.');
  return el('label', { className: 'picker' }, el('span', { text: t('Encoding') }), select);
}

function delimiterSelect(init: InitMessage): HTMLElement {
  const select = el(
    'select',
    {
      attrs: { 'aria-label': t('Delimiter') },
      on: {
        change: () => post({ type: 'setDelimiter', delimiter: select.value as DelimiterId }),
      },
    },
    ...DELIMITERS.map((delimiter) => {
      const option = el('option', {
        text: delimiterLabel(delimiter, t),
        attrs: { value: delimiter },
      });
      option.selected = delimiter === init.delimiter;
      return option;
    })
  );
  return el('label', { className: 'picker' }, el('span', { text: t('Delimiter') }), select);
}

/** ヘッダーの有無の表示と切り替え。判別に確信がなければ ? を付けて目立たせる */
function headerSelect(init: InitMessage): HTMLElement {
  const mark = init.headerConfident ? '' : '?';
  const select = el(
    'select',
    {
      className: init.headerConfident ? '' : 'uncertain',
      attrs: { 'aria-label': t('Header row') },
      on: { change: () => post({ type: 'setHeader', hasHeader: select.value === 'yes' }) },
    },
    el('option', {
      text: t('Yes') + (init.hasHeader ? mark : ''),
      attrs: { value: 'yes' },
    }),
    el('option', {
      text: t('No') + (init.hasHeader ? '' : mark),
      attrs: { value: 'no' },
    })
  );
  select.value = init.hasHeader ? 'yes' : 'no';
  select.title = init.headerConfident
    ? t('Header row')
    : t('Whether the first row is a header was guessed. Change it if it looks wrong.');
  return el('label', { className: 'picker' }, el('span', { text: t('Header row') }), select);
}

function renderBanners(): void {
  const items: HTMLElement[] = [];
  if (state.error) {
    items.push(el('div', { className: 'banner error', text: state.error }));
  }
  if (state.fileChanged) {
    items.push(
      el(
        'div',
        { className: 'banner' },
        el('span', { text: t('The file has changed on disk.') + ' ' }),
        el('button', {
          className: 'link',
          text: t('Reload'),
          on: { click: () => post({ type: 'reload' }) },
        })
      )
    );
  }
  if (notice) {
    items.push(el('div', { className: 'banner', text: notice }));
  }
  if (!state.init && !state.error) {
    items.push(el('div', { className: 'message', text: t('Loading…') }));
  }
  banners.replaceChildren(...items);
}

function onInit(message: InitMessage): void {
  t = createTranslator(message.l10n);
  grid.whitespaceTitle = t('The value has spaces at the start or end.');
  grid.sortTitle = t('Click to sort');
  grid.sortingTitle = t('Sorting…');
  const columns = columnNames(message.header, message.hasHeader, message.columnCount, t);
  const sameColumns = JSON.stringify(state.columns) === JSON.stringify(columns);
  state.columns = columns;
  if (!sameColumns) {
    state.hidden.clear();
    columnFilter = '';
  }
  state.init = message;
  state.rowsCounted = message.rowsCounted;
  state.countDone = message.countDone;
  state.error = undefined;
  state.fileChanged = false;
  state.peekStart = 1;
  state.selected = undefined;
  state.sort = undefined;
  state.sorting = undefined;
  notice = undefined;
  findPanel.reset();
  cache.clear();
  sortedRows.clear();
  pendingJumps.clear();
  inFlight = undefined;
  queued = undefined;
  for (const row of message.rows) {
    cache.set(row.row, row);
  }
  renderToolbar();
  renderBanners();
  if (columnsOpen()) {
    renderColumnsPanel();
  }
  grid.setRowNumberDigits(String(Math.max(message.rowsCounted, 1)).length);
  if (!sameColumns) {
    grid.setHeader();
  } else {
    grid.renderHeader();
    grid.scrollToIndex(0);
  }
  renderRecord();
  renderStatus();
}

function onSortState(message: Extract<HostMessage, { type: 'sortState' }>): void {
  if (message.sortId !== sortId) {
    return;
  }
  // 帯を出すと表の位置がずれるので、並べ替え中は見出しの印で示す
  state.sorting = message.status === 'sorting' ? message.column : undefined;
  grid.renderHeader();
  switch (message.status) {
    case 'sorting':
      return;
    case 'counting':
      showNotice(t('Sorting is available after row counting finishes.'));
      return;
    case 'tooLarge':
      showNotice(
        t('Sorting is available for files with up to {0} rows.', SORT_LIMIT.toLocaleString('en-US'))
      );
      return;
    case 'done':
    case 'cleared':
      showNotice(undefined);
      state.sort =
        message.status === 'done' && message.direction
          ? { column: message.column, direction: message.direction, sortId: message.sortId }
          : undefined;
      sortedRows.clear();
      // 並べ替える前の順で要求した行の返事は捨てる
      inFlight = undefined;
      queued = undefined;
      state.peekStart = 1;
      grid.renderHeader();
      grid.scrollToIndex(0);
      return;
  }
}

function onMessage(message: HostMessage): void {
  switch (message.type) {
    case 'init':
      onInit(message);
      return;
    case 'progress':
      if (message.generation !== state.init?.generation) {
        return;
      }
      state.rowsCounted = message.rowsCounted;
      state.countDone = message.countDone;
      renderToolbar();
      grid.setRowNumberDigits(String(Math.max(message.rowsCounted, 1)).length);
      grid.schedule();
      return;
    case 'rows': {
      if (message.generation !== state.init?.generation || message.requestId !== inFlight?.id) {
        return;
      }
      message.rows.forEach((row, i) => {
        cache.set(row.row, row);
        const position = message.positions?.[i];
        if (position !== undefined) {
          sortedRows.set(position, row.row);
        }
      });
      inFlight = undefined;
      pruneCache();
      const next = queued;
      queued = undefined;
      grid.refresh();
      renderRecord();
      renderStatus();
      if (next && !inFlight) {
        requestIndexes(next.from, next.count);
      }
      return;
    }
    case 'sortState':
      if (message.generation === state.init?.generation) {
        onSortState(message);
      }
      return;
    case 'rowLocated': {
      const column = pendingJumps.get(message.requestId);
      if (column === undefined || message.generation !== state.init?.generation) {
        return;
      }
      pendingJumps.delete(message.requestId);
      revealPosition(message.position, column);
      return;
    }
    case 'findProgress':
      if (message.generation === state.init?.generation && findPanel.onProgress(message)) {
        grid.refresh();
      }
      return;
    case 'contextCommand':
      runContextCommand(message.command, { row: message.row, column: message.column });
      return;
    case 'fileChanged':
      state.fileChanged = true;
      renderBanners();
      return;
    case 'error':
      state.error = message.message;
      // 行の要求が失敗したときも、次の要求を送れるようにする
      inFlight = undefined;
      queued = undefined;
      renderBanners();
      return;
    default:
      return;
  }
}

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    findPanel.focus();
  }
});

grid.element.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && state.selected) {
    // テキストを選択しているときは、ブラウザの既定のコピーに任せる
    if (!window.getSelection()?.toString()) {
      event.preventDefault();
      copyCell(state.selected);
    }
  }
});

app.replaceChildren(
  toolbar,
  columnsPanel,
  banners,
  el('div', { className: 'main' }, grid.element, recordView.element),
  findPanel.results,
  statusBar
);
renderStatus();
onHostMessage(onMessage);
renderBanners();
post({ type: 'ready' });
