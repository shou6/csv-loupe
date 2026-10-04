# CSV Loupe

<!-- 何をする拡張機能かを 1〜2 文で書く -->

VS Code 拡張機能。TypeScript + esbuild。Marketplace 公開を目指す。

## コマンド

```bash
npm run compile         # 型検査 + lint + esbuild（開発ビルド）
npm run watch           # tsc と esbuild を並列で watch（F5 の preLaunchTask）
npm run check-types     # tsc --noEmit
npm run lint            # eslint src
npm run format          # prettier --write
npm run test:unit       # 単体テストだけを Node 上で実行（数秒。TDD のループはこれを使う）
npm test                # 単体テスト + VS Code 上の統合テスト（初回は VS Code のダウンロードで時間がかかる）
npm run test:integration:local  # 手元用の統合テスト。extensionDependencies を一時ディレクトリに入れてから実行する
npm run package         # 本番ビルド（minify）
npm run vsix            # vsce package で .vsix を生成
npm run try             # 単体テスト → VSIX 生成 → 中身の検査 → 入れ直し。手元の VS Code で試す時に使う
npm run lint:md         # Markdown の lint
npm run verify:package  # 公開パッケージに入るファイルが意図したものだけかを検査する
```

- `README.md` は英語で書く（Marketplace のページにそのまま表示される）。日本語の説明は `README.ja.md`。片方を直したらもう片方も直す
- リリースと公開の手順は [docs/publishing.md](docs/publishing.md)。Marketplace への公開は手作業で、`vsce publish` は使わない
- `npm ci` は実行しない。F5 の watch タスクが `esbuild.exe` を掴んでいると `node_modules` の削除に失敗して壊れる。依存を入れ直す時は `npm install` を使う
- 開発中の動作確認は VS Code で F5（Run Extension）を押し、Extension Development Host で行う。本番ビルドを普段の環境で試すなら `npm run try`
- テストは Mocha（`suite` / `test`）。`src/test/unit/` は vscode 非依存の単体テスト、`src/test/integration/` は `@vscode/test-cli` で VS Code 上で動かす統合テスト
- テストの `suite(...)` の直下で関数を呼ばない。そこで例外が出ると mocha ごと落ち、失敗件数すら表示されない。テストデータは直接組み立てるか、`test` の中で作る
- Windows では `npm` と `code` の実体が `.cmd` で、`spawn` から直接は起動できない（EINVAL）。シェル経由にする場合は、引数の配列と併用せず 1 行の文字列で渡す（Node がエスケープしないため）

## 構成

```text
src/
├── extension.ts        エントリポイント。登録だけ行い、ロジックを置かない
├── hello.ts            サンプルのコマンドの中身（vscode 非依存）
├── tooling/            npm run try などの開発用スクリプトの中身（単体テストする）
└── test/
    ├── unit/           単体テスト（vscode 非依存）
    ├── integration/    VS Code 上で動かす統合テスト
    └── support/        テストの補助
scripts/                npm scripts から呼ぶ Node スクリプト
l10n/                   画面の文字列の日本語訳
resources/              アイコン
```

## 開発ルール

- TDD で進める。先にテストを書いて失敗を確認し、その後に実装する（グローバル設定を参照）
- `vscode` モジュールに依存しない層は純粋関数にし、単体テストできる形を保つ。翻訳関数などは引数で受け取る（`src/hello.ts` を参照）
- 外部プロセスやネットワークはインタフェースで抽象化し、テストではフェイクに差し替える
- `strict` を維持し、`any` を使わない
- 画面に出す文字列は `vscode.l10n.t('English text', ...args)` に通す。第 1 引数は単一の文字列リテラルにする（`+` でつなぐと実行時のキーと一致しなくなる）。足したら `l10n/bundle.l10n.ja.json` に日本語訳を足す。抜けや使われなくなった訳はテストが検出する。`package.json` の文字列は `%key%` にし、`package.nls.json` と `package.nls.ja.json` の両方へ定義する
- 公開パッケージに入れるファイルは `package.json` の `files`（許可リスト）で決まる。実行時に必要なファイルを足したら `files` にも足す。`.vscodeignore` は置かない
- 依存ライブラリを足したら、単体テストだけでなく統合テスト（`npm test`）も通す。バンドルすると動かないライブラリがある（例：`jsonc-parser` の既定の配布形式は、esbuild の `mainFields` を `['module', 'main']` にしないと実行時に落ちる）
- コミット前に `npm run compile` と `npm test` を通す
- `extensionDependencies` があると、`npm test` はそれを `.vscode-test/extensions` に自動で入れる。Windows では、このワークスペースを VS Code で開いていると、そのフォルダの rename が EPERM で失敗する。ワークスペースの外なら成功し、CI では起きない。`files.watcherExclude` では直らない。手元では `npm run test:integration:local` を使う
- 依存先の拡張機能が有効化の中で重い処理をすると、統合テストが mocha の既定の 2 秒を超える。`.vscode-test.mjs` で 30 秒にしている。初回の遅さを手元で再現するには、user-data-dir と extensions-dir の両方を消してから試す
- コミットメッセージは `.claude/rules/commit-message.md` に従う

## 開発中の注意

- F5 の開発用のウィンドウと普段のウィンドウは、依存先の拡張機能のインストール先を共有する。依存先が自分のインストール先へ生成物を書く拡張機能だと、F5 の結果が普段のウィンドウに残ることがある。「Developer: Reload Window」で戻る
- F5 で開いた開発用のウィンドウがすぐ閉じる時は、拡張機能ホストが異常終了している。原因は元のウィンドウの「デバッグ コンソール」に出る。ログは `%APPDATA%\Code\logs\<日時>\main.log` の `Extension host ... exited with code`
- `git rm` でステージした削除は、次のコミットに混ざる。コミット前に `git status` でステージ済みの内容を確かめる

## 環境

- Node.js 24、VS Code 1.138 以上
- ドキュメントは日本語。`.md` の保存時に markdownlint と textlint が hook で走る
