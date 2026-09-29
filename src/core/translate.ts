export type Translate = (message: string, ...args: string[]) => string;

export function createTranslator(_bundle: Record<string, string> | undefined): Translate {
  throw new Error('not implemented');
}
