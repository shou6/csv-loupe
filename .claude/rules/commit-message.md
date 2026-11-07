# コミットメッセージ規約

Conventional Commits の形式で書き、要約は日本語にする。

```text
<type>(<scope>): <summary>
```

## type

| type | 用途 |
| ------ | ------ |
| `feat` | 機能追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみ |
| `refactor` | 振る舞いを変えない整理 |
| `test` | テスト追加・修正 |
| `chore` | 設定、依存関係、補助作業 |
| `ci` | CI 設定 |

## scope

主な変更領域を短く入れる。

| scope | 対象 |
| ------ | ------ |
| `core` | `src/core/`（CSV の解析など vscode に依存しない処理） |
| `host` | `src/host/`（拡張機能側） |
| `worker` | `src/worker/` |
| `webview` | `src/webview/` |
| `tooling` | `src/tooling/`、`scripts/` などの開発用スクリプト |
| `config` | `package.json` の設定、`.claude/`、lint や format の設定 |
| `ci` | `.github/workflows/` |
| `deps` | 実行時の依存（dependencies） |
| `deps-dev` | 開発用の依存（devDependencies） |
| `readme` | `README.md`、`README.ja.md` |
| `icon` | アイコン |

## ルール

- 1行目は 72 文字程度に収める
- 実装内容と異なる scope を付けない
- 絵文字を使わない
- 本文に `Closes #<Issue番号>` は書かない（PR の本文に書く）

## 例

```text
feat(core): 引用符の中の改行を 1 つのセルとして読む
chore(deps-dev): eslint を更新
chore(config): Issue のテンプレートを追加
```
