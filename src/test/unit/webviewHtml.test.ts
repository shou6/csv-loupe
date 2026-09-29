import * as assert from 'assert';
import { buildWebviewHtml } from '../../core/webviewHtml';

function build(): string {
  return buildWebviewHtml({
    cspSource: 'https://file+.vscode-resource.example',
    scriptUri: 'https://file+.vscode-resource.example/dist/webview.js',
    styleUri: 'https://file+.vscode-resource.example/dist/webview.css',
    nonce: 'abc123',
    lang: 'ja',
  });
}

suite('buildWebviewHtml', () => {
  function csp(html: string): string {
    const match = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
    assert.ok(match, 'CSP の meta が無い');
    return match[1];
  }

  test('CSP は既定ですべてを禁止し、スクリプトは nonce 付きのものだけを許す', () => {
    const policy = csp(build());
    assert.match(policy, /default-src 'none'/);
    assert.match(policy, /script-src 'nonce-abc123'/);
    assert.match(policy, /style-src https:\/\/file\+\.vscode-resource\.example/);
    assert.ok(!policy.includes('unsafe-inline'), 'unsafe-inline を許している');
    assert.ok(!policy.includes('unsafe-eval'), 'unsafe-eval を許している');
  });

  test('スクリプトとスタイルを読み込み、スクリプトに nonce を付ける', () => {
    const html = build();
    assert.ok(
      html.includes(
        '<script nonce="abc123" src="https://file+.vscode-resource.example/dist/webview.js"></script>'
      )
    );
    assert.ok(html.includes('href="https://file+.vscode-resource.example/dist/webview.css"'));
  });

  test('html の lang に表示言語を入れる', () => {
    assert.match(build(), /<html lang="ja">/);
  });

  test('外部のリソース（http や https の別サイト）を参照しない', () => {
    const urls = [...build().matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(urls.length > 0);
    for (const url of urls) {
      assert.ok(url.startsWith('https://file+.vscode-resource.example/'), url);
    }
  });
});
