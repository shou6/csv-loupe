export interface HeaderDetection {
  hasHeader: boolean;
  /** 判別に確信があるか。無ければ画面で ? を付ける */
  confident: boolean;
}

/** 数として読める値（前後の空白は除いてから比べる） */
const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
/** 判別に使う、2 件目以降のレコードの数 */
const SAMPLE = 100;

/**
 * 先頭のレコードがヘッダーかどうかを判別する。列ごとに、先頭の値と 2 件目以降の値を比べて
 * 「ヘッダーらしい」と「データらしい」の票を数える。
 * - 2 件目以降がすべて数字の列：先頭が数字でなければヘッダー、数字ならデータ
 * - 先頭の値が同じ列の 2 件目以降にもあればデータ
 * - 2 件目以降（2 件以上）の長さがそろっている列：先頭だけ長さが違えばヘッダー
 *   （同じ長さでもデータとはみなさない。見出しとデータの長さが偶然そろうことは多い）
 * - 先頭の中で値が重複していればデータ（見出しは普通重複しない）
 * 票が同じなら、ヘッダーありとし確信なしとする。
 */
export function detectHeader(records: string[][]): HeaderDetection {
  if (records.length < 2) {
    return { hasHeader: true, confident: false };
  }
  const first = records[0].map((value) => value.trim());
  const data = records.slice(1, SAMPLE + 1);
  let headerVotes = 0;
  let dataVotes = 0;
  const named = first.filter((value) => value !== '');
  if (new Set(named).size < named.length) {
    dataVotes++;
  }
  for (let column = 0; column < first.length; column++) {
    const head = first[column];
    if (head === '') {
      continue;
    }
    const values = data.map((record) => (record[column] ?? '').trim()).filter((v) => v !== '');
    if (values.length === 0) {
      continue;
    }
    if (values.every((value) => NUMBER.test(value))) {
      if (NUMBER.test(head)) {
        dataVotes++;
      } else {
        headerVotes++;
      }
    } else if (values.includes(head)) {
      dataVotes++;
    } else if (
      values.length >= 2 &&
      values.every((value) => value.length === values[0].length) &&
      head.length !== values[0].length
    ) {
      headerVotes++;
    }
  }
  if (headerVotes === dataVotes) {
    return { hasHeader: true, confident: false };
  }
  return { hasHeader: headerVotes > dataVotes, confident: true };
}

/** ヘッダーにできる最も下の行（ツールバーの選択肢の数） */
export const MAX_HEADER_ROW = 10;

export interface HeaderRowDetection {
  /** ヘッダーのレコードの番号（1 始まり）。0 はヘッダーなし */
  headerRow: number;
  /** 判別に確信があるか。無ければ画面で ? を付ける */
  confident: boolean;
}

/** 空でないセルの数 */
function filledCount(record: string[]): number {
  return record.filter((value) => value.trim() !== '').length;
}

/**
 * ヘッダーが何行目にあるかを判別する。スプレッドシートから書き出したファイルは、表の上に
 * タイトルなどの行があることがある。先頭から、空でないセルの数が典型（中央値）の半分に満たない行を
 * 飛ばし（最大 MAX_HEADER_ROW - 1 行）、残りの先頭がヘッダーかを detectHeader で判別する。
 * 行を飛ばしたときは、次の行をヘッダーとする。ヘッダーらしくなければ確信なしとする。
 */
export function detectHeaderRow(records: string[][]): HeaderRowDetection {
  const sample = records.slice(0, SAMPLE + MAX_HEADER_ROW);
  const counts = sample.map(filledCount).sort((a, b) => a - b);
  const typical = counts.length > 0 ? counts[Math.floor(counts.length / 2)] : 0;
  let skipped = 0;
  while (
    skipped < MAX_HEADER_ROW - 1 &&
    skipped < sample.length - 1 &&
    filledCount(sample[skipped]) * 2 < typical
  ) {
    skipped++;
  }
  const detection = detectHeader(records.slice(skipped));
  if (skipped > 0) {
    return { headerRow: skipped + 1, confident: detection.hasHeader && detection.confident };
  }
  return { headerRow: detection.hasHeader ? 1 : 0, confident: detection.confident };
}
