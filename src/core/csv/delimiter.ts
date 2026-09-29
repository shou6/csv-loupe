import { DelimiterId } from '../protocol';

export function delimiterForFileName(_fileName: string): DelimiterId {
  throw new Error('not implemented');
}

export function delimiterChar(_delimiter: DelimiterId): string {
  throw new Error('not implemented');
}
