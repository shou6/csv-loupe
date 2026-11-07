import { RowData } from '../core/protocol';
import { Translate } from '../core/translate';
import { recordPairs, withoutEmptyValues } from '../core/view/record';
import { trimForDisplay } from '../core/view/cellText';
import { appendTrimmed, el } from './dom';

/** 選んだ行を「列名と値」の縦の並びで見せるパネル */
export class RecordView {
  readonly element: HTMLElement;

  constructor(
    private readonly onClose: () => void,
    private readonly onToggleHideEmpty: () => void
  ) {
    this.element = el('aside', { className: 'record-view', attrs: { hidden: '' } });
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  show(): void {
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }

  render(
    header: string[],
    row: RowData | undefined,
    selectedColumn: number | undefined,
    hideEmpty: boolean,
    t: Translate
  ): void {
    if (!this.open) {
      return;
    }
    const close = el('button', {
      className: 'icon',
      text: '×',
      title: t('Close'),
      attrs: { 'aria-label': t('Close') },
      on: { click: () => this.onClose() },
    });
    const hideEmptyButton = el('button', {
      className: hideEmpty ? 'selected' : '',
      text: t('Hide Empty'),
      title: t('Hide columns whose value is empty'),
      attrs: { 'aria-pressed': String(hideEmpty) },
      on: { click: () => this.onToggleHideEmpty() },
    });
    const actions = el('div', { className: 'record-actions' }, hideEmptyButton, close);
    if (!row) {
      this.element.replaceChildren(
        el('div', { className: 'record-header' }, el('span', { text: t('Record View') }), actions),
        el('div', { className: 'message', text: t('Select a cell to see its row.') })
      );
      return;
    }
    const title = el(
      'div',
      { className: 'record-title' },
      el('span', { className: 'strong', text: t('Row {0}', row.row.toLocaleString('en-US')) }),
      el('span', { text: t('Source Line {0}', row.line.toLocaleString('en-US')) })
    );
    const pairs = recordPairs(header, row.cells, t);
    const list = el(
      'dl',
      { className: 'record-list' },
      ...(hideEmpty ? withoutEmptyValues(pairs) : pairs).flatMap((pair) => {
        const selected = pair.column === selectedColumn ? 'selected' : '';
        const value = el('dd', { className: selected });
        const display = trimForDisplay(pair.value);
        appendTrimmed(value, display, display.text, t('The value has spaces at the start or end.'));
        return [el('dt', { className: selected, text: pair.name, title: pair.name }), value];
      })
    );
    this.element.replaceChildren(el('div', { className: 'record-header' }, title, actions), list);
  }
}
