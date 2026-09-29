/**
 * セルを区切り文字でつなぎ、1 レコードの文字列にする（Copy Row で使う）。
 * 区切り文字、引用符、改行を含むセルだけを引用符で囲み、引用符は二重にする。
 */
export function formatRecord(cells: string[], delimiter: string): string {
  return cells
    .map((cell) =>
      cell.includes(delimiter) || /["\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell
    )
    .join(delimiter);
}
