import { delimiterChar } from '../csv/delimiter';
import { parseRecord, recordText } from '../csv/parser';
import { forEachRecord } from '../csv/records';
import { CsvFormat } from '../csv/types';
import { createDecoder } from '../encoding/decode';
import { ByteSource } from '../source/byteSource';

export type SortDirection = 'asc' | 'desc';

/** 数として読める値（前後の空白は除いてから比べる） */
const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

/**
 * 並べ替えの順序を作る。戻り値の i 番目は、並べ替えた後の i 番目にあたる元の位置（0 始まり）。
 * - 空でない値がすべて数字なら数として、それ以外は数字の部分を数として扱う文字列の順で比べる
 * - 空のセルは向きに関係なく最後に置く
 * - 同じ値は元の順を保つ
 */
export function sortOrder(keys: string[], direction: SortDirection): Uint32Array {
  const trimmed = keys.map((key) => key.trim());
  const numeric = trimmed.every((key) => key === '' || NUMBER.test(key));
  const sign = direction === 'asc' ? 1 : -1;
  const order = Array.from({ length: keys.length }, (_, i) => i);
  let compare: (a: number, b: number) => number;
  if (numeric) {
    const values = trimmed.map((key) => (key === '' ? NaN : Number(key)));
    compare = (a, b) => values[a] - values[b];
  } else {
    const collator = new Intl.Collator('ja', { numeric: true });
    compare = (a, b) => collator.compare(trimmed[a], trimmed[b]);
  }
  order.sort((a, b) => {
    const emptyA = trimmed[a] === '';
    const emptyB = trimmed[b] === '';
    if (emptyA || emptyB) {
      return emptyA === emptyB ? a - b : emptyA ? 1 : -1;
    }
    return sign * compare(a, b) || a - b;
  });
  return Uint32Array.from(order);
}

/**
 * ファイル全体の column 列の値で並べ替え、並べ替えた順の Row（1 始まり）を返す。
 * firstDataRecord は Row 1 にあたるレコードの番号（ヘッダーありなら 1、なしなら 0）。
 */
export async function sortRows(
  source: ByteSource,
  format: CsvFormat,
  column: number,
  direction: SortDirection,
  firstDataRecord: number,
  shouldStop: () => boolean = () => false
): Promise<number[] | undefined> {
  const decoder = createDecoder(format.encoding);
  const delimiter = delimiterChar(format.delimiter);
  const keys: string[] = [];
  let record = 0;
  let stopped = false;
  await forEachRecord(
    source,
    format,
    { offset: format.dataStart, line: 1 },
    (raw) => {
      if (record++ < firstDataRecord) {
        return;
      }
      keys.push(parseRecord(recordText(raw.bytes, decoder), delimiter)[column] ?? '');
    },
    {
      chunkSize: 1024 * 1024,
      onChunk: () => {
        if (shouldStop()) {
          stopped = true;
          return false;
        }
      },
    }
  );
  if (stopped) {
    return undefined;
  }
  return Array.from(sortOrder(keys, direction), (index) => index + 1);
}
