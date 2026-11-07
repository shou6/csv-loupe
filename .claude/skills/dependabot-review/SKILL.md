---
name: dependabot-review
description: 自動マージされなかった Dependabot の PR（`deps:review` ラベル）の影響を調べ、取り込むか、止めるか、手で直すかを決める。実行時の依存の更新とメジャー更新が対象。「Dependabot の PR を見て」「依存の更新を取り込んで」「deps:review を片付けて」と言われた時に使う。
---

# Dependabot の PR の影響調査

Dependabot の PR を自動でマージするかは、`.github/workflows/ci.yml` の merge ジョブが決める。対象外のものには `.github/workflows/dependabot-triage.yml` がラベルを付ける。

| 更新 | 扱い |
| --- | --- |
| devDependencies、GitHub Actions のメジャーでない更新 | CI が通れば自動でマージされる。調査しない |
| 上記以外（dependencies、メジャー更新） | `deps:review` ラベルが付く。このスキルで調べる |

dependencies は esbuild で `dist/` にまとめられ、VSIX に入る（宣言だけの拡張機能でも `files` に入れたものは VSIX に入る）。取り込むと利用者の環境での動きが変わり、Marketplace への更新も要る。

## 1. 対象を一覧する

```bash
gh pr list --label deps:review --json number,title,headRefName
```

## 2. PR ごとに調べる

1. PR の本文のリリースノートと変更履歴を読み、何が変わるかをつかむ。0.x の版は minor でも破壊的変更にあたることがある
2. `src/` と `scripts/`、`esbuild.js` で使っている箇所を探す
3. 同じライブラリを別の依存も持っていないかを `npm ls <名前>` で見る。版がずれると壊れることがある（yomu では katex の版が依存どうしでずれ、数式の表示が崩れた）
4. 単体テストに、版を固定する検査があるかを見る
5. `gh pr checks <番号>` で CI の結果を見る。通っていても、見た目の崩れは CI では分からない

## 3. 手元で確かめる

見た目や操作に関わる依存は、手元で確かめる。

```bash
gh pr checkout <番号>
npm install
npm run compile
npm run test:unit
npm test   # extensionDependencies があり手元で EPERM になるときは npm run test:integration:local
npm run try   # 手元の VS Code に入れ直す
```

変わった機能を手元の VS Code で使い、ユーザーに確かめてもらう。Claude は画面を見られない。

## 4. 決める

| 結果 | すること |
| --- | --- |
| 影響なし、または改善 | PR にコメントで調査結果を書き、ユーザーの了承を得てから `gh pr merge <番号> --squash --delete-branch`（CI が通っていること） |
| 壊れる、対応が要る | PR にコメントで理由を書いて閉じる。今後も上げないなら `.github/dependabot.yml` の `ignore` に理由と一緒に足す（別の Issue で） |
| 直せば取り込める | Issue を作り、その Issue のブランチで更新と修正をまとめて行う |
| 判断がつかない | PR にコメントして `needs:user` ラベルを付け、ユーザーに聞く |

コメントには次を書く。

- 変更の要点（リリースノートから、この拡張機能に関係するものだけ）
- 使っている箇所と、影響の有無
- 確かめたこと（CI、手元のテスト、目視）

## 5. リリースが要るかを伝える

dependencies を取り込んだら、Marketplace への更新が要る。急ぐか（不具合の修正、セキュリティの修正）、次の機能のリリースにまとめるかをユーザーに伝える。リリースの手順は vscode-marketplace-publish スキル。
