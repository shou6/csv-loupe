import { HostMessage, InitMessage } from '../core/protocol';
import { createTranslator, Translate } from '../core/translate';
import { delimiterLabel, encodingLabel, rowCountLabel } from '../core/view/labels';
import { el } from './dom';
import { onHostMessage, post } from './vscodeApi';

/** 表示行数の候補（All は Phase 3 で足す） */
const PEEK_SIZES = [1, 10, 100];

interface State {
  init: InitMessage | undefined;
  rowsCounted: number;
  countDone: boolean;
  peekSize: number;
  error: string | undefined;
}

const state: State = {
  init: undefined,
  rowsCounted: 0,
  countDone: false,
  peekSize: 10,
  error: undefined,
};

const app = document.getElementById('app') as HTMLElement;
let t: Translate = createTranslator(undefined);

function renderToolbar(init: InitMessage): HTMLElement {
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
        text: size === 1 ? t('1 row') : t('{0} rows', String(size)),
        attrs: { 'aria-pressed': String(size === state.peekSize) },
        on: {
          click: () => {
            state.peekSize = size;
            render();
          },
        },
      })
    )
  );
  return el('div', { className: 'toolbar' }, info, el('div', { className: 'controls' }, sizes));
}

function renderTable(init: InitMessage): HTMLElement {
  const head = el(
    'tr',
    {},
    el('th', { className: 'row-number', text: '#' }),
    ...init.header.map((name) => el('th', { text: name, title: name }))
  );
  const body = init.rows.slice(0, state.peekSize).map((row) =>
    el(
      'tr',
      {},
      el('td', { className: 'row-number', text: String(row.row) }),
      ...init.header.map((_, column) => {
        const value = row.cells[column] ?? '';
        return el('td', { text: value, title: value });
      })
    )
  );
  return el(
    'div',
    { className: 'table-container' },
    el('table', {}, el('thead', {}, head), el('tbody', {}, ...body))
  );
}

function render(): void {
  const init = state.init;
  if (!init) {
    app.replaceChildren(el('div', { className: 'message', text: state.error ?? t('Loading…') }));
    return;
  }
  const parts: HTMLElement[] = [renderToolbar(init)];
  if (state.error) {
    parts.push(el('div', { className: 'banner error', text: state.error }));
  }
  parts.push(renderTable(init));
  app.replaceChildren(...parts);
}

function onMessage(message: HostMessage): void {
  switch (message.type) {
    case 'init':
      t = createTranslator(message.l10n);
      state.init = message;
      state.rowsCounted = message.rowsCounted;
      state.countDone = message.countDone;
      state.error = undefined;
      break;
    case 'progress':
      if (message.generation !== state.init?.generation) {
        return;
      }
      state.rowsCounted = message.rowsCounted;
      state.countDone = message.countDone;
      break;
    case 'error':
      state.error = message.message;
      break;
    default:
      return;
  }
  render();
}

onHostMessage(onMessage);
render();
post({ type: 'ready' });
