/**
 * 表示の順を決める。戻り値の i 番目は、表示の位置 i + 1 に出す Row（1 始まり）。
 * sorted は並べ替えた順の Row、filtered は絞り込みで残す Row（Row の順）。
 * どちらも無ければ元の順なので undefined を返す。両方あれば、並べ替えた順のうち絞り込みで残る行だけにする。
 */
export function displayOrder(
  sorted: Uint32Array | undefined,
  filtered: Uint32Array | undefined
): Uint32Array | undefined {
  if (!filtered) {
    return sorted;
  }
  if (!sorted) {
    return filtered;
  }
  const keep = new Set(filtered);
  return sorted.filter((row) => keep.has(row));
}

/**
 * Row から表示の位置（1 始まり）を引く関数を作る。表示していない Row は 0。
 * ascending（Row の順。絞り込みだけのとき）なら二分探索にし、メモリを残した行の数に比例させる。
 * 並べ替えた順なら Row の番号で引く配列を作る。並べ替えは行数が上限以下のときだけなので、配列の大きさも上限以下になる
 */
export function positionLookup(order: Uint32Array, ascending: boolean): (row: number) => number {
  if (ascending) {
    return (row) => {
      let low = 0;
      let high = order.length - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        if (order[middle] === row) {
          return middle + 1;
        }
        if (order[middle] < row) {
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      return 0;
    };
  }
  let last = 0;
  for (const row of order) {
    last = Math.max(last, row);
  }
  const position = new Uint32Array(last);
  order.forEach((row, i) => {
    position[row - 1] = i + 1;
  });
  return (row) => (row >= 1 && row <= last ? position[row - 1] : 0);
}
