---
name: vscode-marketplace-publish
description: VS Code 拡張機能を Visual Studio Marketplace に公開する、または更新を出す。名前の重複の確認、アイコン・README・スクリーンショットの準備、タグの push による VSIX の生成、管理画面へのアップロード、公開後の確認までを扱う。「Marketplace に公開したい」「拡張機能をリリースしたい」「VSIX を登録したい」「新しいバージョンを出したい」「スクリーンショットは要る？」と言われた時に使う。vsce publish は使わず、VSIX を手でアップロードする方式。
---

# VS Code 拡張機能の Marketplace への公開

VSIX を作り、管理画面から手でアップロードして公開する。
`vsce publish` は使わない。PAT による認証は 2026-12-01 の Azure DevOps の global PAT 廃止で使えなくなるため。

## 1. 前提を確かめる

| 項目 | 確かめ方 |
| --- | --- |
| Publisher が作成済み | <https://marketplace.visualstudio.com/manage> を開ける。ID が `package.json` の `publisher` と一致する |
| アカウントの保全 | Microsoft アカウントでパスワードレスか二段階認証が有効。パスキーだけではパスワードが残っている場合がある |
| リポジトリが Public | README の画像とバッジ、`repository` と `bugs` のリンクが外から見える必要がある |
| 公開前の整備が済んでいる | 済んでいなければ repo-publish-readiness スキルを先に使う |

## 2. 名前の重複を確かめる

Marketplace の表示名は重複できない。extension-name-check スキルで、表示名と拡張機能 ID を確かめる。

## 3. 公開する中身を整える

### アイコン

- 128px 以上の正方形の PNG。SVG は不可。256px で作ると高解像度の画面でもきれい
- VS Code のロゴは使えない（ブランドガイドラインが、拡張機能を示すための使用と加工を禁じている）
- 作るときは extension-icon-create スキルを使う

### README

- 英語で書く（Marketplace のページにそのまま出る）。日本語版は `README.ja.md` に分ける
- 画像は PNG か JPEG。SVG は、GitHub Actions のバッジなど vsce が認める提供元だけ使える
- 相対パスの画像は、vsce が `repository` を元に GitHub の URL へ書き換える

### スクリーンショット

必須ではない。見た目が変わる拡張機能なら、適用前と適用後を並べた 1 枚が効果的。

1. 見本のフォルダを作る。実際のプロジェクトは写さない（プロジェクト名などが写り込む）
2. ユーザーに撮ってもらう（Claude は画面を撮れない）
   - 有効：F5 の Extension Development Host で見本のフォルダを開く。タイトルに「[Extension Development Host]」と出ていることを確かめる
   - 無効：普段のウィンドウで開く。前の状態が残っていたら「Developer: Reload Window」
   - 撮る範囲、テーマ、ウィンドウの幅をそろえる
3. 受け取った 2 枚の差分を確かめる。同じ画像を 2 回貼っていることがある

   ```bash
   python -c "from PIL import Image, ImageChops; a=Image.open('a.png').convert('RGB'); b=Image.open('b.png').convert('RGB'); print(a.size, b.size, ImageChops.difference(a,b).getbbox() if a.size==b.size else 'size differs')"
   ```

4. Pillow で 1 枚に並べる。大きさが数ピクセルずれるので同じ台紙に揃え、見出しを付ける
5. `images/` に置き、README（英日）の冒頭から参照する。`images/` は `package.json` の `files` に入れない（VSIX に入れない）

## 4. VSIX を作る

1. `package.json` の `version` を上げる。`major.minor.patch` だけで、`-beta` などは不可
2. `CHANGELOG.md` にそのバージョンの項目を足す
3. 手元で確かめる：`npm run vsix` と、許可リストの検査（あれば `npm run verify:package`）
4. main にマージし、タグを push する（main への push はフックで止まることが多い。止まったらユーザーに頼む）

   ```bash
   git tag v0.0.1
   git push origin v0.0.1
   ```

5. リリースのワークフローが VSIX を GitHub Release に添付するのを待つ。ワークフローがなければ手元の VSIX を使う

## 5. アップロードする

<https://marketplace.visualstudio.com/manage> で行う。ユーザーの操作になる。

- 初回：「New extension」から「Visual Studio Code」を選び、VSIX をアップロード
- 2 回目以降：拡張機能の「…」メニューから「Update」
- 「Verifying」の表示が数分で消え、公開される

## 6. 公開後に確かめる

API で登録状態を確かめる。

```bash
curl -s -X POST "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json;api-version=3.0-preview.1" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"<publisher>.<name>"}]}],"flags":1}' \
  | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8'));const e=r.results[0].extensions;console.log(e.length?e.map(x=>x.displayName+' '+x.versions[0].version+' flags='+x.flags).join('\n'):'not found')"
```

ユーザーに確かめてもらうこと。

- ページの表示（アイコン、README の画像、バッジ）：`https://marketplace.visualstudio.com/items?itemName=<publisher>.<name>`
- 開発版をアンインストールし、Marketplace から入れて動く
- `extensionDependencies` があれば、依存先も一緒に入る

## 7. 公開を取り下げる時

管理画面の「…」メニューから「Unpublish」。一覧からは消えるが、インストール済みの環境からは消えない。
公開した VSIX の中身は取り消せないので、入れるファイルは `package.json` の `files`（許可リスト）で管理する。
