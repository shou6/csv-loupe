import { Translate } from '../translate';

export interface RecordPair {
  column: number;
  name: string;
  value: string;
}

export function recordPairs(_header: string[], _cells: string[], _t: Translate): RecordPair[] {
  throw new Error('not implemented');
}
