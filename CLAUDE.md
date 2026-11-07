# CSV Loupe

CSV と TSV を読み取り専用の表で開く VS Code 拡張機能。大容量のファイルでもすぐに中身を確かめられることに絞り、編集や分析はしない。

VS Code 拡張機能。TypeScript + esbuild。Marketplace 公開を目指す。

開発の規則とコミットメッセージの規約は次のファイルにある。

@.claude/rules/development.md
@.claude/rules/commit-message.md

## 作業の流れ（必須）

実装と検証は手元（Windows）で行う。GitHub の Issue から始め、PR を CI の成功で自動マージする。

1. **Issue から始める。** 対応する Issue がない作業は、先に Issue を作る（`.github/ISSUE_TEMPLATE/` に従う）。バグも直す前に Issue を作る
2. ブランチを切る：`<種別>/<Issue番号>-<短い説明>`（種別：`feat` / `fix` / `docs` / `chore`）
3. Issue の範囲だけを TDD で実装する。仕様で分からない点は推測せず、Issue にコメントして `needs:user` ラベルを付けて止まる
4. `npm run compile`、`npm run test:unit`、`npm test` を通す
5. コミットして push し、PR を作る。本文は `.github/pull_request_template.md` に従い、`Closes #<Issue番号>` と検証の結果を書く
6. ドラフトにするかは下記「PR の種類」で決める。通常の PR は、CI が通ると自動でマージされる
7. CI の結果を見届ける。失敗したら原因を直して同じブランチに push する。テストを消す、スキップするなどで通さない。原因が PR の範囲外にあるときや判断が要るときは、PR にコメントして止まる
8. 作業中に見つけた範囲外の問題は直さず、新しい Issue を作って PR の本文に番号を書く

main への直接の push はしない。マージは CI に任せ、Claude は `gh pr merge` を実行しない（dependabot-review スキルで、ユーザーが取り込みを了承したときを除く）。

### PR の種類

main の ruleset は CI の 4 つのジョブ（`Lint, unit tests and package` と 3 つの OS の `Integration tests`）を必須にしている。`.github/workflows/ci.yml` の merge ジョブは、ドラフトでない PR で全部のジョブが通るとスカッシュマージし、`Closes #` の Issue を閉じてブランチを消す。

**ドラフトで作る PR**（ユーザーの確認が要るもの。ドラフトの間はマージされない）

- 見た目や操作に関わる変更（Webview の表、スタイル、操作）。Claude は画面を見られないため、ユーザーが `npm run try` か F5 で確かめる
- 方針の判断が要る変更（依存の追加、CLAUDE.md・`.claude/`・CI・ruleset の変更など）。ユーザーが直接指示したものは除く
- リリース（バージョンを上げる PR）

ドラフトにしたときは、PR 本文の「手元で確認してほしい点」に手順と見るポイントを書く。ユーザーが確かめて Ready for review にすると、CI が動き、通ればマージされる。

**通常の PR で作るもの**：ロジック、テスト、ドキュメントの変更など、`npm run compile`、`npm run test:unit`、`npm test` で確かめきれるもの。

### Dependabot

Dependabot の PR は、ci.yml の merge ジョブと `.github/workflows/dependabot-triage.yml` が振り分ける。

- devDependencies と GitHub Actions のメジャーでない更新は、CI が通れば ci.yml の merge ジョブがマージする
- それ以外（dependencies とメジャー更新）は `deps:review` ラベルが付く。dependabot-review スキルで影響を調べてから取り込む。dependencies は VSIX に入るため、取り込んだら Marketplace への更新が要るかをユーザーに伝える

### 公開リポジトリでの注意

このリポジトリは公開している。Issue、PR、コミットメッセージは誰でも読める。

- `docs/`（git の管理外）の要件定義や実装計画の中身を、Issue や PR に書き写さない。必要なら「要件定義 4 節の決定に沿う」のように場所だけを示す
- 秘密情報、個人のパス、手元の環境の詳細を書かない

### GitHub の操作

`gh` を使う。Issue は `gh issue create --template`、PR は `gh pr create --body-file` で作る。

## スキル

`.claude/skills/` にある。

| スキル | 使うとき |
| --- | --- |
| dependabot-review | `deps:review` の付いた Dependabot の PR の影響を調べる |
| vscode-marketplace-publish | リリースと Marketplace への公開 |
| extension-icon-create | アイコンを作り直す |
| yomiyasu | README.ja.md など、日本語の文章を推敲する |

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
├── core/               vscode に依存しない中身（単体テストする）
│   ├── session.ts      1 つのエディタの状態と操作。host と Webview の間を取り持つ
│   ├── protocol.ts     拡張機能ホストと Webview の間のメッセージの型（両側で共有）
│   ├── jobs.ts         時間のかかる処理（索引、検索、並べ替え）の定義
│   ├── translate.ts    翻訳の表から翻訳関数を作る（Webview は vscode.l10n を使えない）
│   ├── webviewHtml.ts  Webview の HTML と CSP
│   ├── csv/            CSV の解析、区切り文字、ヘッダーの判別
│   ├── encoding/       文字コードの判定と変換
│   ├── index/          行の位置の索引（大容量のファイルを途中から読むため）
│   ├── read/           索引を使って行を読む
│   ├── search/         Find と Find Same Value
│   ├── sort/           並べ替え
│   ├── source/         ファイルを範囲を指定して読む。テストではメモリ上のものに差し替える
│   └── view/           表示用の値（セルの文字、列、ラベル、移動、表示範囲）
├── host/               vscode に依存する部分。CustomReadonlyEditorProvider と Worker の起動
├── worker/worker.ts    Worker の入口。索引や検索を主スレッドの外で動かす
├── webview/            Webview 側のスクリプトと CSS。dist/ にブラウザ向けでバンドルする
├── tooling/            npm run try などの開発用スクリプトの中身（単体テストする）
└── test/
    ├── unit/           単体テスト（vscode 非依存）
    ├── integration/    VS Code 上で動かす統合テスト
    └── support/        テストの補助
scripts/                npm scripts から呼ぶ Node スクリプト
l10n/                   画面の文字列の日本語訳
resources/              アイコン
images/                 README 用のスクリーンショット（公開パッケージには入れない）
docs/                   仕様と実装計画（git 管理外）
```

esbuild が `dist/` にバンドルする入口は 4 つある。

- `src/extension.ts`
- `src/worker/worker.ts`
- `src/webview/main.ts`
- `src/webview/styles.css`

## 開発ルール

- TDD で進める。先にテストを書いて失敗を確認し、その後に実装する（`.claude/rules/development.md`）
- `vscode` モジュールに依存しない層は純粋関数にし、単体テストできる形を保つ。翻訳関数などは引数で受け取る（`src/core/view/labels.ts` を参照）
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
