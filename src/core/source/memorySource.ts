import { ByteSource } from './byteSource';

export class MemorySource implements ByteSource {
  constructor(private readonly bytes: Uint8Array) {}
  get size(): number {
    throw new Error('not implemented');
  }
  read(_offset: number, _length: number): Promise<Uint8Array> {
    throw new Error('not implemented');
  }
  close(): Promise<void> {
    throw new Error('not implemented');
  }
}
