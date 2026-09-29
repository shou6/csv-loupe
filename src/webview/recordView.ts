import { RowData } from '../core/protocol';
import { Translate } from '../core/translate';
import { recordPairs } from '../core/view/record';
import { el } from './dom';

/** 選んだ行を「列名と値」の縦の並びで見せるパネル */
export class RecordView {
  readonly element: HTMLElement;

  constructor(private readonly onClose: () => void) {
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
    if (!row) {
      this.element.replaceChildren(
        el('div', { className: 'record-header' }, el('span', { text: t('Record View') }), close),
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
    const list = el(
      'dl',
      { className: 'record-list' },
      ...recordPairs(header, row.cells, t).flatMap((pair) => {
        const selected = pair.column === selectedColumn ? 'selected' : '';
        return [
          el('dt', { className: selected, text: pair.name, title: pair.name }),
          el('dd', { className: selected, text: pair.value }),
        ];
      })
    );
    this.element.replaceChildren(el('div', { className: 'record-header' }, title, close), list);
  }
}
