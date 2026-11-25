import { Translate } from '../translate';
import { KeyInput } from './keyboard';

/** 検索バーのキー操作 */
export type FindKeyAction = 'next' | 'previous' | 'clear';

/**
 * キーの入力を検索の操作にする。検索欄（input）では Enter・↓・F3 で次へ、Shift+Enter・↑・Shift+F3 で前へ、
 * Esc でリセット。検索欄の外（global）では、表の移動と重ならない F3 と Shift+F3 だけを受ける。
 */
export function findKeyAction(
  input: KeyInput,
  where: 'input' | 'global'
): FindKeyAction | undefined {
  if (input.ctrlKey || input.metaKey || input.altKey) {
    return undefined;
  }
  if (input.key === 'F3') {
    return input.shiftKey ? 'previous' : 'next';
  }
  if (where !== 'input') {
    return undefined;
  }
  switch (input.key) {
    case 'Enter':
      return input.shiftKey ? 'previous' : 'next';
    case 'ArrowDown':
      return input.shiftKey ? undefined : 'next';
    case 'ArrowUp':
      return input.shiftKey ? undefined : 'previous';
    case 'Escape':
      return input.shiftKey ? undefined : 'clear';
    default:
      return undefined;
  }
}

/** 検索バーに出す状態 */
export interface FindStatus {
  /** 一致の件数（移動できる上限を超えた分も数える） */
  total: number;
  /** 選んでいる一致の番号（0 始まり）。選んでいなければ -1 */
  current: number;
  /** 移動できる一致の数 */
  stored: number;
  done: boolean;
  /** 移動できる一致が上限に達したか */
  truncated: boolean;
  /** 検索の進み具合（%） */
  percent: number;
}

/** 検索バーの件数の表示。選んでいれば「3 / 120」の形にする */
export function findStatusText(status: FindStatus, t: Translate, hasQuery: boolean): string {
  if (!hasQuery) {
    return '';
  }
  const total = status.total.toLocaleString('en-US');
  let text: string;
  if (status.total === 0) {
    text = status.done ? t('No results') : '';
  } else if (status.current >= 0) {
    text = (status.current + 1).toLocaleString('en-US') + ' / ' + total;
  } else {
    text = status.total === 1 ? t('1 match') : t('{0} matches', total);
  }
  if (!status.done) {
    text = (text ? text + ' ' : '') + t('(searching… {0}%)', String(status.percent));
  } else if (status.truncated) {
    text += ' ' + t('(moves through the first {0})', status.stored.toLocaleString('en-US'));
  }
  return text;
}
