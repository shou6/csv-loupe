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
