export interface HeaderDetection {
  hasHeader: boolean;
  confident: boolean;
}

export function detectHeader(_records: string[][]): HeaderDetection {
  throw new Error('not implemented');
}
