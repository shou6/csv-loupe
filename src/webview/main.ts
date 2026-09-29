import { DELIMITERS, delimiterChar } from '../core/csv/delimiter';
import { formatRecord } from '../core/csv/format';
import {
  ContextCommand,
  DelimiterId,
  EncodingChoice,
  HostMessage,
  InitMessage,
  RowData,
} from '../core/protocol';
import { createTranslator, Translate } from '../core/translate';
import { delimiterLabel, encodingLabel, rowCountLabel } from '../core/view/labels';
import { columnNames } from '../core/view/columns';
import { parseRowInput, tailStart } from '../core/view/navigation';
import { el } from './dom';
import { CellPosition, GridView } from './grid';
import { FindPanel } from './findPanel';
import { RecordView } from './recordView';
import { onHostMessage, post } from './vscodeApi';

/** 表示行数の候補。0 は All（全行） */
const PEEK_SIZES = [1, 10, 100, 0];
/** 画面で選べる文字コード */
const ENCODINGS: EncodingChoice[] = ['utf8', 'shiftjis', 'utf16le', 'utf16be'];
/** 行のキャッシュの上限。超えたら表示中の付近以外を捨てる */
const CACHE_LIMIT = 20_000;

interface State {
  init: InitMessage | undefined;
  rowsCounted: number;
  countDone: boolean;
  /** 表示行数。0 は All */
  peekSize: number;
  /** All 以外のときに表示する先頭の Row（Tail で変わる） */
  peekStart: number;
  selected: CellPosition | undefined;
  wrap: boolean;
  error: string | undefined;
  /** 表示中に元のファイルが変わった */
  fileChanged: boolean;
  /** 列名（ヘッダーなしなら「列 1」…） */
  columns: string[];
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
};

const cache = new Map<number, RowData>();
let requestId = 0;
/** 返事を待っている要求。1 つずつ送り、返事が来てから次を送る */
let inFlight: { id: number; from: number; count: number } | undefined;
let queued: { from: number; count: number } | undefined;

let t: Translate = createTranslator(undefined);

const app = document.getElementById('app') as HTMLElement;
const toolbar = el('div', { className: 'toolbar' });
const banners = el('div', { className: 'banners' });
const statusBar = el('div', { className: 'status-bar' });
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

/** 選んだ行の Row と Source Line（元のファイルの行）を出す */
function renderStatus(): void {
  const selected = state.selected;
  const data = selected ? cache.get(selected.row) : undefined;
  if (!selected || !data || !state.init) {
    statusBar.replaceChildren(el('span', { text: t('Select a cell to see its position.') }));
    return;
  }
  const column = columnName(selected.column);
  statusBar.replaceChildren(
    el('span', { className: 'strong', text: t('Row {0}', data.row.toLocaleString('en-US')) }),
    el('span', { text: t('Source Line {0}', data.line.toLocaleString('en-US')) }),
    el('span', { text: column }),
    el('button', {
      className: 'link',
      text: t('Open Source at Row'),
      on: { click: () => post({ type: 'openSource', line: data.line }) },
    })
  );
}

function columnName(column: number): string {
  return state.columns[column] ?? t('(column {0})', String(column + 1));
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
  jumpTo(result.row, state.selected?.column ?? 0);
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

/** 表示中の範囲の行数 */
function displayCount(): number {
  if (state.peekSize === 0) {
    return state.rowsCounted;
  }
  return Math.max(0, Math.min(state.peekSize, state.rowsCounted - state.peekStart + 1));
}

function rowAt(index: number): number {
  return (state.peekSize === 0 ? 1 : state.peekStart) + index;
}

const grid = new GridView(
  {
    header: () => state.columns,
    displayCount,
    rowAt,
    getRow: (row) => cache.get(row),
    requestRows,
    wrap: () => state.wrap,
    selected: () => state.selected,
    mark: (row, column) => findPanel.mark(row, column),
  },
  {
    onSelect: (cell) => {
      state.selected = cell;
      grid.refresh();
      renderRecord();
      renderStatus();
    },
  }
);

const findPanel = new FindPanel({
  search: (searchId, query) => post({ type: 'find', searchId, query }),
  cancel: () => post({ type: 'cancelFind' }),
  jump: (hit) => jumpTo(hit.row, hit.column),
  columnName,
  translate: () => t,
});

/** 知らせ（一時的な案内）。次の操作で消える */
let notice: string | undefined;

function showNotice(message: string | undefined): void {
  notice = message;
  renderBanners();
}

/** セルを選んで、表示する。All 以外の表示行数で範囲の外なら All に切り替える */
function jumpTo(row: number, column: number): void {
  if (row > state.rowsCounted) {
    showNotice(t('Row {0} can be shown after row counting finishes.', row.toLocaleString('en-US')));
    return;
  }
  showNotice(undefined);
  state.selected = { row, column };
  if (state.peekSize !== 0 && (row < state.peekStart || row >= state.peekStart + state.peekSize)) {
    state.peekSize = 0;
    renderToolbar();
  }
  const index = state.peekSize === 0 ? row - 1 : row - state.peekStart;
  grid.revealIndex(index);
  grid.revealColumn(column);
  renderRecord();
  renderStatus();
}

function requestRows(from: number, count: number): void {
  const last = Math.min(from + count - 1, state.rowsCounted);
  if (last < from) {
    return;
  }
  if (inFlight) {
    queued = { from, count: last - from + 1 };
    return;
  }
  inFlight = { id: ++requestId, from, count: last - from + 1 };
  post({ type: 'requestRows', requestId: inFlight.id, from, count: inFlight.count });
}

function pruneCache(): void {
  if (cache.size <= CACHE_LIMIT) {
    return;
  }
  const center = rowAt(0);
  for (const row of cache.keys()) {
    if (Math.abs(row - center) > CACHE_LIMIT / 4) {
      cache.delete(row);
    }
  }
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
    el('div', { className: 'controls' }, sizes, wrap, record),
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
  const columns = columnNames(message.header, message.hasHeader, message.columnCount, t);
  const sameColumns = JSON.stringify(state.columns) === JSON.stringify(columns);
  state.columns = columns;
  state.init = message;
  state.rowsCounted = message.rowsCounted;
  state.countDone = message.countDone;
  state.error = undefined;
  state.fileChanged = false;
  state.peekStart = 1;
  state.selected = undefined;
  notice = undefined;
  findPanel.reset();
  cache.clear();
  inFlight = undefined;
  queued = undefined;
  for (const row of message.rows) {
    cache.set(row.row, row);
  }
  renderToolbar();
  renderBanners();
  grid.setRowNumberDigits(String(Math.max(message.rowsCounted, 1)).length);
  if (!sameColumns) {
    grid.setHeader();
  } else {
    grid.scrollToIndex(0);
  }
  renderRecord();
  renderStatus();
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
      for (const row of message.rows) {
        cache.set(row.row, row);
      }
      inFlight = undefined;
      pruneCache();
      const next = queued;
      queued = undefined;
      grid.refresh();
      renderRecord();
      renderStatus();
      if (next && !inFlight) {
        requestRows(next.from, next.count);
      }
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
  banners,
  el('div', { className: 'main' }, grid.element, recordView.element),
  findPanel.results,
  statusBar
);
renderStatus();
onHostMessage(onMessage);
renderBanners();
post({ type: 'ready' });
