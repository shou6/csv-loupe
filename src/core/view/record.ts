import { Translate } from '../translate';

export interface RecordPair {
  column: number;
  name: string;
  value: string;
}

/**
 * Record View に出す「列名と値」の組。ヘッダーより少ない行は足りない列を空にし、
 * 多い行は余った列に番号で名前を付ける。
 */
export function recordPairs(header: string[], cells: string[], t: Translate): RecordPair[] {
  const count = Math.max(header.length, cells.length);
  const pairs: RecordPair[] = [];
  for (let column = 0; column < count; column++) {
    pairs.push({
      column,
      name: column < header.length ? header[column] : t('(column {0})', String(column + 1)),
      value: cells[column] ?? '',
    });
  }
  return pairs;
}
