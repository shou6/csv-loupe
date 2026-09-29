import { ByteSource } from './byteSource';

export class NodeFileSource implements ByteSource {
  private constructor(readonly size: number) {}
  static open(_file: string): Promise<NodeFileSource> {
    throw new Error('not implemented');
  }
  read(_offset: number, _length: number): Promise<Uint8Array> {
    throw new Error('not implemented');
  }
  close(): Promise<void> {
    throw new Error('not implemented');
  }
}
