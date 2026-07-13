# guidestore

家庭内の機器・備品の取扱説明書やメモを一元管理するウェブアプリ。個人・家族利用を想定。

## 概要

機器（家電・ガジェットなど）ごとに、取扱説明書（PDF・画像・HTML・Markdown等）やメモ、URLを時系列のエントリとして紐づけて記録できます。登録したデータは AI（Claude Code や Web チャット）にエクスポートし、自然言語で問い合わせることを想定しています。

例:
> 「Dyson製の掃除機を持ってましたよね？あれの水拭きの起動の仕方ってどうやるんでしたっけ？」

## 主な機能

- 機器の登録・編集・削除、タグ付け（複数タグ対応）
- 機器ごとのエントリ管理（テキスト／URL／ファイルの3種別）
  - ファイルは画像・PDF・Markdown・HTML・その他に対応し、種別に応じてブラウザ内表示 or ダウンロード
  - エントリへのメモ追記・編集
  - エントリの論理削除
- 機器一覧の検索・タグ絞り込み（2ペイン表示、モバイル対応）
- 単一パスワードによる認証（家族内共有を想定）
- データエクスポート
  - `GET /export/archive` — `tar.xz` 形式（`START_HERE.md` + DB + アップロードファイル一式）。Claude Code に読み込ませて質問応答させる用途
  - `GET /export/markdown` — Markdown 単一ファイル形式（Web チャット向け）。**現時点では未実装**（`501 Not Implemented` を返す）

## 技術スタック

- バックエンド: Python / Flask（Blueprint構成）
- DB: SQLite
- フロントエンド: Vanilla JS（フレームワークなし）
- デプロイ: Docker + Docker Compose（Flask/gunicorn + nginx リバースプロキシ）

## セットアップ（Docker）

```bash
cp .env.example .env
# .env を編集して SECRET_KEY・APP_PASSWORD などを設定する

docker compose up -d --build
```

`.env` の主な設定項目:

| 変数 | 内容 |
|---|---|
| `SECRET_KEY` | Flask セッション署名用キー |
| `APP_PASSWORD` | ログイン用の共有パスワード（必須） |
| `APP_UID` / `APP_GID` | コンテナが作成するファイルの所有者（ホストユーザーに合わせる） |
| `APP_PORT` | ホスト側の公開ポート（デフォルト 5003） |

起動後、`http://localhost:${APP_PORT}/` にアクセスします。

## ディレクトリ構成

```
guidestore/
├── app.py                 # アプリファクトリ、認証ミドルウェア
├── helpers.py              # DB接続・パス定義
├── blueprints/
│   ├── auth.py              # ログイン/ログアウト
│   ├── items.py             # 機器・エントリ・タグのAPIとページ
│   └── export.py            # tar.xz / Markdown エクスポート
├── schema.sql               # SQLiteスキーマ（items / entries / tags / item_tags）
├── templates/                # Jinja2 テンプレート
├── static/                   # CSS / JS
├── nginx/nginx.conf          # リバースプロキシ設定
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── docs/spec.md              # 詳細仕様書
```

データベース（`data/guidestore.db`）とアップロードファイル（`data/uploads/`）は `data/` 配下に保存され、Git管理外です。

## データモデル

- `items` — 機器（名前・メモ）
- `entries` — 機器に紐づくエントリ（`text` / `url` / `file`、論理削除フラグあり）
- `tags` / `item_tags` — タグと機器の多対多関連

詳細は [`docs/spec.md`](docs/spec.md) を参照してください。

## 認証

単一ユーザー・単一パスワード方式です。`.env` の `APP_PASSWORD` と一致するパスワードでログインすると、全ページ・APIにアクセスできます。ユーザーの区別はありません。
