# Changelog

This file lists all notable changes to this extension.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0]

### Added

- Choose the number of header rows (1 to 3) from the toolbar, for files whose header spans several rows, such as files exported from Excel. The headings are stacked, and joined as "upper / lower" where a column name is needed.
- Find: **Filter** toggle to show only the rows that match. Row numbers stay the same as in the whole file, and you can still sort the filtered rows.
- Find: `↓` / `↑` in the Find box and `F3` / `Shift+F3` move to the next and previous match.
- Color themes: blue, green, amber, rose, and gray.

### Changed

- Find no longer shows the list of matches below the table. Matches are highlighted in the table, and the Find box shows the position as "3 / 120".

## [0.3.0]

### Added

- Choose the header row from the toolbar: None, or record 1 to 10. Rows above the header are not shown.
- Header detection skips title rows and empty rows above the table, which are common in files exported from spreadsheets, and uses the next row as the header.
- Setting `csvLoupe.colorTheme` to choose the color theme: purple (default), teal, or the VS Code theme colors. You can also change it from the toolbar.

### Fixed

- The last row was partly hidden when you scrolled to the bottom, depending on the height of the editor.

## [0.2.0]

### Added

- Setting `csvLoupe.initialRowCount` to choose the number of rows to show when you open a file (`1` / `10` / `100` / `all`).
- Keyboard navigation in the table: arrow keys, Page Up / Page Down, Home / End, and Ctrl+Home / Ctrl+End move the selected cell. Enter opens Record View.
- Double-click a column border to fit the column width to its content.
- Record View: buttons to move to the previous and next row.
- Record View: Hide Empty toggle to hide columns with empty values. CSV Loupe remembers the choice.
- Record View: drag the border between the table and Record View to change its width. CSV Loupe remembers the width.

### Changed

- The accent color is now purple instead of teal.

## [0.1.0]

Initial release.

### Added

- Custom editor that opens `.csv` and `.tsv` files as a table by default and never writes to them.
- Opens large files without a confirmation prompt. The first rows appear right away, and CSV Loupe counts the rows in a background worker.
- Encoding detection and switching: UTF-8, UTF-8 with BOM, UTF-16 LE / BE, and Shift_JIS (CP932).
- Delimiter by file extension, with switching between comma, tab, semicolon, and pipe.
- Header detection. CSV Loupe compares the first record with the rest to decide whether the file has a header, and you can switch it from the toolbar. Without a header, CSV Loupe names the columns "Column 1", "Column 2", and so on.
- Quick Peek (1 / 10 / 100 rows) and a virtual-scrolling table of all rows.
- Sticky header, row numbers, resizable columns, word wrap, cell and row highlight, and copying cells and rows.
- Sorting by one column. Click a column header to sort. Available after CSV Loupe finishes counting the rows, for files up to 1,000,000 rows.
- Showing and hiding columns from the column list.
- CSV Loupe trims leading and trailing spaces in cell values and shows a marker in their place.
- Find across the whole file with a list of matches by Row and column, and Find Same Value. Clear the search with the × button or Esc.
- Record View, also opened by double-clicking a cell.
- Go to Row, Tail, and Open Source at Row.
- Notice with a reload button when the file changes on disk.
- Own color scheme with a teal accent and alternating row colors, following the light or dark theme. High contrast themes use the theme colors.
