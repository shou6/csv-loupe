export interface WebviewHtmlOptions {
  /** webview.cspSource */
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  /** スクリプトの nonce。開くたびに作り直す */
  nonce: string;
  /** 表示言語（vscode.env.language） */
  lang: string;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Webview の HTML。CSP は既定ですべてを禁止し、拡張機能に同梱したスタイルと、nonce を付けた
 * スクリプトだけを許す。画面の中身はすべてスクリプトが作る。
 */
export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    'style-src ' + options.cspSource,
    'font-src ' + options.cspSource,
    "script-src 'nonce-" + options.nonce + "'",
  ].join('; ');
  return [
    '<!DOCTYPE html>',
    '<html lang="' + escapeAttribute(options.lang) + '">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta http-equiv="Content-Security-Policy" content="' + escapeAttribute(csp) + '">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<link rel="stylesheet" href="' + escapeAttribute(options.styleUri) + '">',
    '</head>',
    '<body>',
    '<div id="app"></div>',
    '<script nonce="' +
      escapeAttribute(options.nonce) +
      '" src="' +
      escapeAttribute(options.scriptUri) +
      '"></script>',
    '</body>',
    '</html>',
  ].join('\n');
}
