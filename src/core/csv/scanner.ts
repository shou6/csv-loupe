export type UnitMode = 'byte' | 'cp932' | 'utf16le' | 'utf16be';

export class RecordScanner {
  line: number;
  constructor(_mode: UnitMode, _delimiter: number, startLine: number) {
    this.line = startLine;
  }
  feed(_chunk: Uint8Array, _onRecordEnd: (endInChunk: number) => void): void {
    throw new Error('not implemented');
  }
}
