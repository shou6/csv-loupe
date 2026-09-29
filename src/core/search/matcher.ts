import { FindQuery } from '../protocol';

export interface Matcher {
  matches(cell: string): boolean;
  mightMatch(recordText: string): boolean;
  excerpt(cell: string): string;
}

export function createMatcher(_query: FindQuery): Matcher {
  throw new Error('not implemented');
}
