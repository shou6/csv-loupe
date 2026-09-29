export interface DisplayText {
  text: string;
  leading: boolean;
  trailing: boolean;
}

export function trimForDisplay(_value: string): DisplayText {
  throw new Error('not implemented');
}
