import { ByteSource } from './byteSource';

/** メモリ上のバイト列。テストと、file 以外のスキーム（全体を読み込んだもの）に使う */
export class MemorySource implements ByteSource {
  constructor(private readonly bytes: Uint8Array) {}

  get size(): number {
    return this.bytes.length;
  }

  read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.bytes.length);
    return Promise.resolve(this.bytes.subarray(Math.min(offset, end), end));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
