# Change Log

All notable changes to this extension are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.0.1]

Initial release.

### Added

- Read-only custom editor for `.csv` and `.tsv` files, opened by default.
- Opens large files without a confirmation prompt. The first rows appear right away, and rows are counted in a background worker.
- Encoding detection and switching: UTF-8, UTF-8 with BOM, UTF-16 LE / BE, and Shift_JIS (CP932).
- Delimiter by file extension, with switching between comma, tab, semicolon, and pipe.
- Quick Peek (1 / 10 / 100 rows) and a virtual-scrolling table of all rows.
- Sticky header, row numbers, resizable columns, word wrap, cell and row highlight, and copying cells and rows.
- Find across the whole file with a list of matches by Row and column, and Find Same Value.
- Record View, Go to Row, Tail, and Open Source at Row.
- Notice with a reload button when the file changes on disk.
