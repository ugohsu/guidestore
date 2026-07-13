# guidestore 仕様書

## 概要

家庭内の機器・備品の取扱説明書やメモを一元管理するウェブアプリ。
個人・家族利用を想定。

---

## 開発・デプロイ構成

manaddr と同じパターン。

- **開発（正本）**: `/workspace/sandbox/guidestore/`（このコンテナ内）
- **動作確認・本番**: `~/host/apps/guidestore/`（hp-mini 上）
  - コードは rsync で一方向反映。データ（`data/`）は反映対象外
  - コンテナ再ビルド・再起動はユーザー側の手動操作
- Claude は `~/host/apps/guidestore/` を直接編集しない

反映コマンド（manaddr 準拠）:
```
rsync -av --delete --exclude='data' --exclude='.env' --exclude='.claude' --exclude='__pycache__' /workspace/sandbox/guidestore/ ~/host/apps/guidestore/
```

---

## 技術スタック

manaddr に準拠する。

- **バックエンド**: Python / Flask
- **DB**: SQLite
- **フロントエンド**: Vanilla JS（フレームワークなし）
- **デプロイ**: Docker + Docker Compose
- **スタイル**: manaddr の `style.css` をベースに流用・拡張

---

## 画面構成

### 全体レイアウト

manaddr と同じサイドバー + メインエリア構成。

```
┌──────────────┬──────────────────────────────────────────┐
│  sidebar     │  main                                    │
│              │                                          │
│  guidestore  │  [ページコンテンツ]                       │
│              │                                          │
│  機器一覧    │                                          │
│  機器タグ    │                                          │
│              │                                          │
│  ログアウト  │                                          │
└──────────────┴──────────────────────────────────────────┘
```

モバイルではサイドバーをハンバーガーメニューで開閉（manaddr 踏襲）。

---

### 1. 機器一覧ページ（トップページ）

パス: `/`

2ペイン・マスター/ディテール表示（manaddr の人物一覧と同構造）。

**左ペイン（機器リスト）**

- 検索フィールド（機器名で絞り込み）
- タグフィルタ（select）
- 機器カード一覧（クリックで右ペインに詳細表示）
  - 機器名
  - タグチップ
  - エントリ件数バッジ
  - 最終更新日時
- 「＋ 機器を追加」ボタン

**右ペイン（機器詳細）**

機器を選択すると表示（未選択時はプレースホルダー）。
→ 詳細は「機器詳細ページ」参照。

デスクトップ: 右ペインに詳細を表示、全画面展開トグルあり（manaddr 踏襲）。
モバイル: 機器タップで詳細に全画面遷移、戻るボタンで一覧に戻る。

---

### 2. 機器詳細ページ（右ペイン / 単独ページ）

対象機器の情報と、紐づくエントリ（説明書・メモ等）を表示・管理する。

**ヘッダー部**

- 機器名（インライン編集可）
- タグチップ一覧（追加・削除可）
- 機器メモ（1行テキスト、インライン編集可）
- 登録日

**エントリタイムライン**

エントリを時系列（新しい順）で表示。manaddr の「やりとり（chat bubbles）」に近いスタイル。

各エントリには以下が表示される：

| 項目 | 内容 |
|------|------|
| エントリ種別アイコン | text / url / file（画像・PDF・MD・HTML・その他） |
| コンテンツ | 種別に応じた表示（後述） |
| push日時 | 登録されたタイムスタンプ |
| メモ | テキスト（後から追記・編集可） |
| 削除ボタン | 削除確認後に論理削除 |

**エントリ種別ごとの表示**

| 種別 | 条件 | 表示方法 |
|------|------|----------|
| テキスト | `entry_type = text` | テキストをそのまま表示 |
| URL | `entry_type = url` | リンクとして表示（外部リンクアイコン付き） |
| 画像ファイル | `file_mime` が `image/*` | サムネイル表示、クリックでライトボックス拡大 |
| PDF | `file_mime = application/pdf` | ファイル名表示、クリックでブラウザ内別タブ表示（`<a target="_blank">`） |
| Markdown | 拡張子 `.md` | ファイル名表示、クリックでブラウザ内別タブ表示（plain text、プリレンダリング不要） |
| HTML | 拡張子 `.html` | ファイル名表示、クリックでブラウザ内別タブ表示（レンダリングされた状態） |
| その他ファイル | 上記以外 | ファイル名表示、クリックでダウンロード |

**エントリ投稿フォーム**

詳細ペイン下部に固定表示。

3つのタブで入力種別を切り替える：

```
[ テキスト ] [ URL ] [ ファイル ]
```

- **テキストタブ**: `<textarea>` + 「追加」ボタン
- **URLタブ**: `<input type="url">` + ページタイトル取得（オプション） + 「追加」ボタン
- **ファイルタブ**: ファイル選択（drag & drop 対応） + 「追加」ボタン

各タブ共通で「メモ」テキストフィールドを持つ（push時に任意で入力。空でも可）。

---

### 3. 機器追加ページ

パス: `/items/new`

- 機器名（必須）
- タグ（任意、複数）
- メモ（任意）
- 「登録」ボタン

---

## DB 設計

### `items`（機器）

```sql
CREATE TABLE items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    memo        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### `entries`（エントリ）

```sql
CREATE TABLE entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    entry_type  TEXT    NOT NULL CHECK(entry_type IN ('text', 'url', 'file')),
    body        TEXT,                  -- text/url の場合はここに内容
    file_name   TEXT,                  -- file の場合のオリジナルファイル名
    file_mime   TEXT,                  -- file の場合の MIME type
    file_size   INTEGER,               -- bytes
    file_path   TEXT,                  -- サーバー上の保存パス (data/uploads/<uuid>.<ext>)
    memo        TEXT,
    is_deleted  INTEGER NOT NULL DEFAULT 0,
    pushed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_entries_item_id ON entries(item_id);
```

### `tags`・`item_tags`（タグ・多対多）

```sql
CREATE TABLE tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
```

---

## ファイル保管方針

- ファイルは `data/uploads/` 以下にフラットに保存
- ファイル名は `<uuid>.<元の拡張子>` でサーバー側が決定（パストラバーサル防止）
- オリジナルのファイル名は `entries.file_name` に保持
- `data/` ディレクトリは git 管理外（`.gitignore` で除外）
- アップロードサイズ上限は 50 MB（設定で変更可）

---

## 認証

manaddr 踏襲。単一ユーザーのパスワード認証（`.env` に `APP_PASSWORD` を設定）。

---

## ファイル構成（予定）

```
guidestore/
├── app.py
├── blueprints/
│   ├── __init__.py
│   ├── auth.py
│   └── items.py
├── helpers.py
├── schema.sql
├── static/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js          # サイドバー開閉など共通
│       ├── items_list.js   # 一覧ページ（2ペイン制御）
│       └── item_detail.js  # 詳細ペイン（エントリ投稿・表示）
├── templates/
│   ├── base.html
│   ├── login.html
│   ├── items_list.html
│   ├── _item_detail_pane.html
│   └── item_new.html
├── data/               # git 管理外
│   ├── guidestore.db
│   └── uploads/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── requirements.txt
└── docs/
    └── spec.md
```

---

## エクスポート機能

### 目的

登録済みのデータを AI に与えて自然言語で問い合わせできるようにする。

例:
> 「Dyson製の掃除機を持ってましたよね？あれの水拭きの起動の仕方ってどうやるんでしたっけ？」

エクスポート形式は用途に応じて2種類用意する。

---

### (A) tar.xz エクスポート ― Claude Code 向け

エンドポイント: `GET /export/archive` → `guidestore-export-<日時>.tar.xz` をダウンロード

**アーカイブ内容:**

```
guidestore-export-20260702-123456/
├── START_HERE.md       ← Claude Code が最初に読むファイル
├── spec.md             ← アプリ仕様・スキーマ説明
├── guidestore.db       ← SQLite DB（全データ）
└── uploads/            ← アップロードされた全ファイル（元ファイルそのまま）
    ├── <uuid>.pdf
    ├── <uuid>.jpg
    └── ...
```

**`START_HERE.md` の内容:**

アーカイブ展開後に Claude Code が最初に読むことを想定した指示書。以下を記載する：

- このアーカイブは guidestore のエクスポートであること
- `guidestore.db` は SQLite で、`items`・`entries`・`tags` テーブルを持つこと（スキーマは `spec.md` 参照）
- `uploads/` 内のファイルは `entries.file_path` で参照できること
- 「機器について質問されたら、DB を照会し、関連ファイルを読んで答えてほしい」という指示
- エクスポート日時・件数サマリ

→ Claude Code はこれを読むだけで回答者として振る舞える。`sqlite3 guidestore.db` で照会し、PDF・画像・HTML 等のファイルを直接参照できる。

**UI:** サイドバーに「エクスポート (tar.xz)」リンク。クリックで即ダウンロード。

---

### (B) Markdown エクスポート ― Web チャット向け（暫定）

Web ブラウザ上の AI チャット（claude.ai 等）へのアップロード用。tar.xz はファイルの中身を展開して読めないため、テキスト化した単一ファイルで代替する。

エンドポイント: `GET /export/markdown` → `guidestore-export-<日時>.md` をダウンロード

**出力構造:**

```markdown
# guidestore エクスポート
生成日時: 2026-07-02 12:34:56

---

## Dyson V15 掃除機

タグ: 掃除機, Dyson
メモ: リビング保管

### 2026-01-15 10:23 — テキスト
水拭きモードはメインボタン長押し後、サイドの青いボタンを押す。

### 2026-01-10 09:00 — URL
https://www.dyson.co.jp/...

### 2026-01-08 14:30 — ファイル: 取扱説明書.pdf
（pdfminer.six で抽出したテキスト）

### 2026-01-07 11:00 — ファイル: 保証書scan.jpg
[画像ファイル]

---
```

**ファイル種別ごとのテキスト化方針:**

| ファイル種別 | 処理 |
|---|---|
| テキストエントリ | そのまま埋め込む |
| URL エントリ | URL をそのまま記載 |
| `.md` | ファイル内容をそのまま埋め込む |
| `.html` | ファイル内容をそのまま埋め込む（AI は HTML を直接解釈できる） |
| `.pdf` | `pdfminer.six` でテキスト抽出（失敗時は `[PDF: テキスト抽出不可]`） |
| 画像 | `[画像ファイル: <元ファイル名>]` と記載 |
| その他 | `[ファイル: <元ファイル名>]` と記載 |

> **注**: 画像・バイナリファイルの内容はこの形式では失われる。Web チャット向けの最善策は引き続き検討中。

**UI:** サイドバーに「エクスポート (Markdown)」リンク。

---

### 依存ライブラリ追加

- `pdfminer.six` （Markdown エクスポート時の PDF テキスト抽出）

---

## 未検討・今後の課題

- タグ管理ページ（manaddr の「宛先タグ」相当、必要に応じて追加）
- エントリへのラベル付け機能（必要に応じて追加）
- URL エントリのページタイトル自動取得（server-side fetch）
- 複数ファイルの一括アップロード
- AI エクスポートへの画像埋め込み（マルチモーダル AI 向け base64 埋め込みオプション）
