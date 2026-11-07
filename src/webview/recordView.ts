import { RowData } from '../core/protocol';
import { Translate } from '../core/translate';
import { recordPairs } from '../core/view/record';
import { trimForDisplay } from '../core/view/cellText';
import { appendTrimmed, el } from './dom';

/** 選んだ行を「列名と値」の縦の並びで見せるパネル */
export class RecordView {
  readonly element: HTMLElement;

  constructor(
    private readonly onClose: () => void,
    private readonly onStep: (direction: 'previous' | 'next') => void
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
    canStep: { previous: boolean; next: boolean },
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
    const step = (direction: 'previous' | 'next', text: string, label: string) => {
      const button = el('button', {
        className: 'icon',
        text,
        title: label,
        attrs: { 'aria-label': label },
        on: { click: () => this.onStep(direction) },
      });
      button.disabled = !canStep[direction];
      return button;
    };
    const actions = el(
      'div',
      { className: 'record-actions' },
      step('previous', '↑', t('Previous Row')),
      step('next', '↓', t('Next Row')),
      close
    );
    const list = el(
      'dl',
      { className: 'record-list' },
      ...recordPairs(header, row.cells, t).flatMap((pair) => {
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
