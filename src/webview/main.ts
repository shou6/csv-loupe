import { delimiterChar } from '../core/csv/delimiter';
import { formatRecord } from '../core/csv/format';
import { ContextCommand, HostMessage, InitMessage, RowData } from '../core/protocol';
import { createTranslator, Translate } from '../core/translate';
import { delimiterLabel, encodingLabel, rowCountLabel } from '../core/view/labels';
import { el } from './dom';
import { CellPosition, GridView } from './grid';
import { onHostMessage, post } from './vscodeApi';

/** 表示行数の候補。0 は All（全行） */
const PEEK_SIZES = [1, 10, 100, 0];
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
    header: () => state.init?.header ?? [],
    displayCount,
    rowAt,
    getRow: (row) => cache.get(row),
    requestRows,
    wrap: () => state.wrap,
    selected: () => state.selected,
    mark: () => undefined,
  },
  {
    onSelect: (cell) => {
      state.selected = cell;
      grid.refresh();
    },
  }
);

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
    default:
      break;
  }
  grid.refresh();
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
      text: rowCountLabel(state.rowsCounted, state.countDone, init.header.length, t),
    }),
    el('span', {
      text: t('Encoding: {0}', encodingLabel(init.encoding, init.encodingConfident)),
    }),
    el('span', { text: t('Delimiter: {0}', delimiterLabel(init.delimiter, t)) })
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
  toolbar.replaceChildren(info, el('div', { className: 'controls' }, sizes, wrap));
}

function renderBanners(): void {
  const items: HTMLElement[] = [];
  if (state.error) {
    items.push(el('div', { className: 'banner error', text: state.error }));
  } else if (!state.init) {
    items.push(el('div', { className: 'message', text: t('Loading…') }));
  }
  banners.replaceChildren(...items);
}

function onInit(message: InitMessage): void {
  t = createTranslator(message.l10n);
  const sameColumns = JSON.stringify(state.init?.header) === JSON.stringify(message.header);
  state.init = message;
  state.rowsCounted = message.rowsCounted;
  state.countDone = message.countDone;
  state.error = undefined;
  state.peekStart = 1;
  state.selected = undefined;
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
      if (next && !inFlight) {
        requestRows(next.from, next.count);
      }
      return;
    }
    case 'contextCommand':
      runContextCommand(message.command, { row: message.row, column: message.column });
      return;
    case 'error':
      state.error = message.message;
      renderBanners();
      return;
    default:
      return;
  }
}

grid.element.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && state.selected) {
    // テキストを選択しているときは、ブラウザの既定のコピーに任せる
    if (!window.getSelection()?.toString()) {
      event.preventDefault();
      copyCell(state.selected);
    }
  }
});

app.replaceChildren(toolbar, banners, grid.element);
onHostMessage(onMessage);
renderBanners();
post({ type: 'ready' });
