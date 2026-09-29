export interface WebviewHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
  lang: string;
}

export function buildWebviewHtml(_options: WebviewHtmlOptions): string {
  throw new Error('not implemented');
}
