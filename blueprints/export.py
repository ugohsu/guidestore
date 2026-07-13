# -*- coding: utf-8 -*-
import io
import os
import tarfile
import datetime

from flask import Blueprint, send_file

from helpers import get_db, DB_PATH, UPLOADS_DIR

export_bp = Blueprint('export', __name__)

_SPEC_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'spec.md')


def _build_start_here(db, now, dirname):
    item_count  = db.execute('SELECT COUNT(*) FROM items').fetchone()[0]
    entry_count = db.execute('SELECT COUNT(*) FROM entries WHERE is_deleted = 0').fetchone()[0]

    rows = db.execute('''
        SELECT i.name, GROUP_CONCAT(t.name, ', ') AS tags
        FROM items i
        LEFT JOIN item_tags it ON it.item_id = i.id
        LEFT JOIN tags t ON t.id = it.tag_id
        GROUP BY i.id
        ORDER BY i.name COLLATE NOCASE
    ''').fetchall()
    items_md = '\n'.join(
        f"- {r['name']}" + (f"（{r['tags']}）" if r['tags'] else '')
        for r in rows
    ) or '（登録なし）'

    return f"""\
# guidestore エクスポート — まずこのファイルを読んでください

エクスポート日時: {now.strftime('%Y-%m-%d %H:%M UTC')}
機器数: {item_count} 件 / エントリ数: {entry_count} 件

## このアーカイブの構成

```
{dirname}/
├── START_HERE.md   ← 今読んでいるファイル
├── spec.md         ← アプリ仕様・スキーマ詳細
├── guidestore.db   ← SQLite DB（全データ）
└── uploads/        ← アップロードファイル（PDF・画像・HTML 等）
```

## 登録されている機器

{items_md}

## DB スキーマ（概要）

```sql
items     (id, name, memo, created_at)
entries   (id, item_id, entry_type, body,
           file_name, file_mime, file_size, file_path,
           memo, is_deleted, pushed_at)
  -- entry_type: 'text' | 'url' | 'file'
  -- file_path:  uploads/<UUID>.<ext> のファイル名部分のみ
tags      (id, name)
item_tags (item_id, tag_id)
```

## Claude Code への指示

このアーカイブを展開し、ユーザーの質問にデータを参照して回答してください。

手順:
1. `sqlite3 guidestore.db` で items・entries テーブルを照会し、関連する機器・エントリを特定する
2. `entry_type = 'text'` → `entries.body` に内容がある
3. `entry_type = 'url'`  → `entries.body` に URL がある
4. `entry_type = 'file'` → `uploads/<file_path>` のファイルを直接読む
   - PDF    : テキスト抽出（pdfminer 等）
   - HTML   : そのまま読む（レンダリング結果も把握可能）
   - Markdown: そのまま読む
   - 画像   : マルチモーダルで確認
5. `entries.memo` に補足メモがあれば併せて参照する

例: 「Dyson の掃除機の水拭きの起動方法は？」
→ items を検索 → 対応 entries を確認 → ファイルがあれば読む → 回答
"""


@export_bp.route('/export/archive')
def export_archive():
    db = get_db()
    now = datetime.datetime.now(datetime.timezone.utc)
    dirname = f'guidestore-export-{now.strftime("%Y%m%d-%H%M%S")}'
    filename = f'{dirname}.tar.xz'

    start_here_bytes = _build_start_here(db, now, dirname).encode('utf-8')

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:xz') as tar:
        # START_HERE.md
        info = tarfile.TarInfo(name=f'{dirname}/START_HERE.md')
        info.size = len(start_here_bytes)
        info.mtime = int(now.timestamp())
        tar.addfile(info, io.BytesIO(start_here_bytes))

        # spec.md
        if os.path.isfile(_SPEC_PATH):
            tar.add(_SPEC_PATH, arcname=f'{dirname}/spec.md')

        # DB（ファイルとして直接追加）
        if os.path.isfile(DB_PATH):
            tar.add(DB_PATH, arcname=f'{dirname}/guidestore.db')

        # アップロードファイル
        if os.path.isdir(UPLOADS_DIR):
            for fname in sorted(os.listdir(UPLOADS_DIR)):
                fpath = os.path.join(UPLOADS_DIR, fname)
                if os.path.isfile(fpath):
                    tar.add(fpath, arcname=f'{dirname}/uploads/{fname}')

    return send_file(
        io.BytesIO(buf.getvalue()),
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=filename,
    )


@export_bp.route('/export/markdown')
def export_markdown():
    # TODO: Markdown エクスポート（Web チャット向けテキスト化）
    from flask import Response
    return Response('未実装', status=501, content_type='text/plain; charset=utf-8')
