import * as fs from 'fs';
import { ByteSource } from './byteSource';

/** ローカルのファイルを、範囲を指定して読む。ファイル全体をメモリに載せない */
export class NodeFileSource implements ByteSource {
  private constructor(
    private readonly handle: fs.promises.FileHandle,
    /** 開いた時点の大きさ。その後に増えた分は読まない */
    readonly size: number
  ) {}

  static async open(file: string): Promise<NodeFileSource> {
    const handle = await fs.promises.open(file, 'r');
    try {
      const { size } = await handle.stat();
      return new NodeFileSource(handle, size);
    } catch (error) {
      await handle.close();
      throw error;
    }
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const size = Math.min(length, this.size - offset);
    if (size <= 0) {
      return new Uint8Array(0);
    }
    const buffer = Buffer.allocUnsafe(size);
    const { bytesRead } = await this.handle.read(buffer, 0, size, offset);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, bytesRead);
  }

  close(): Promise<void> {
    return this.handle.close();
  }
}
