/** vscode.l10n.t と同じ形の翻訳関数 */
export type Translate = (message: string, ...args: string[]) => string;

/**
 * 翻訳の表（vscode.l10n.bundle）から翻訳関数を作る。Webview は vscode.l10n を使えないので、
 * 拡張機能ホストから表を受け取ってこれで訳す。英語のときは表が無い（undefined）。
 */
export function createTranslator(bundle: Record<string, string> | undefined): Translate {
  return (message, ...args) =>
    (bundle?.[message] ?? message).replace(
      /\{(\d+)\}/g,
      (_, index: string) => args[Number(index)] ?? ''
    );
}
