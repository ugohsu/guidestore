# -*- coding: utf-8 -*-
import mimetypes
import os
import uuid

from flask import Blueprint, abort, jsonify, render_template, request, send_file

from helpers import get_db, UPLOADS_DIR

items_bp = Blueprint('items', __name__)

_INLINE_MIMES = {'application/pdf', 'text/html', 'text/plain'}


# --- Pages ---

@items_bp.route('/items')
def items_list():
    return render_template('items_list.html')


@items_bp.route('/items/<int:item_id>')
def item_detail(item_id):
    return render_template('item_detail.html', item_id=item_id)


# --- API: items ---

def _item_tags(db, item_id):
    rows = db.execute('''
        SELECT t.id, t.name FROM tags t
        JOIN item_tags it ON it.tag_id = t.id
        WHERE it.item_id = ?
        ORDER BY t.name COLLATE NOCASE
    ''', (item_id,)).fetchall()
    return [{'id': r['id'], 'name': r['name']} for r in rows]


@items_bp.route('/api/items')
def api_items_list():
    db = get_db()
    rows = db.execute('''
        SELECT i.id, i.name, i.memo, i.created_at,
               COUNT(e.id) FILTER (WHERE e.is_deleted = 0) AS entry_count,
               MAX(e.pushed_at) FILTER (WHERE e.is_deleted = 0) AS last_pushed_at
        FROM items i
        LEFT JOIN entries e ON e.item_id = i.id
        GROUP BY i.id
        ORDER BY i.name COLLATE NOCASE
    ''').fetchall()
    items = []
    for row in rows:
        items.append({
            'id': row['id'],
            'name': row['name'],
            'memo': row['memo'],
            'created_at': row['created_at'],
            'entry_count': row['entry_count'] or 0,
            'last_pushed_at': row['last_pushed_at'],
            'tags': _item_tags(db, row['id']),
        })
    return jsonify(items)


@items_bp.route('/api/items', methods=['POST'])
def api_items_create():
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '機器名は必須です'}), 400
    memo = (data.get('memo') or '').strip() or None
    db = get_db()
    cur = db.execute('INSERT INTO items (name, memo) VALUES (?, ?)', (name, memo))
    db.commit()
    item_id = cur.lastrowid
    return jsonify({'id': item_id, 'name': name, 'memo': memo,
                    'entry_count': 0, 'last_pushed_at': None, 'tags': []}), 201


@items_bp.route('/api/items/<int:item_id>')
def api_item_get(item_id):
    db = get_db()
    row = db.execute('SELECT * FROM items WHERE id = ?', (item_id,)).fetchone()
    if not row:
        return jsonify({'error': '見つかりません'}), 404
    return jsonify({
        'id': row['id'],
        'name': row['name'],
        'memo': row['memo'],
        'created_at': row['created_at'],
        'tags': _item_tags(db, item_id),
    })


@items_bp.route('/api/items/<int:item_id>', methods=['PUT'])
def api_item_update(item_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM items WHERE id = ?', (item_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '機器名は必須です'}), 400
    memo = (data.get('memo') or '').strip() or None
    db.execute('UPDATE items SET name = ?, memo = ? WHERE id = ?', (name, memo, item_id))
    db.commit()
    return jsonify({'ok': True})


@items_bp.route('/api/items/<int:item_id>', methods=['DELETE'])
def api_item_delete(item_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM items WHERE id = ?', (item_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404
    file_rows = db.execute(
        "SELECT file_path FROM entries WHERE item_id = ? AND entry_type = 'file' AND file_path IS NOT NULL",
        (item_id,)
    ).fetchall()
    for fr in file_rows:
        _delete_upload_file(fr['file_path'])
    db.execute('DELETE FROM items WHERE id = ?', (item_id,))
    db.commit()
    return jsonify({'ok': True})


# --- API: entries ---

def _entry_to_dict(row):
    d = {
        'id': row['id'],
        'item_id': row['item_id'],
        'entry_type': row['entry_type'],
        'body': row['body'],
        'file_name': row['file_name'],
        'file_mime': row['file_mime'],
        'file_size': row['file_size'],
        'memo': row['memo'],
        'pushed_at': row['pushed_at'],
        'file_url': None,
    }
    if row['file_path']:
        d['file_url'] = f'/uploads/{row["file_path"]}'
    return d


@items_bp.route('/api/items/<int:item_id>/entries')
def api_entries_list(item_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM items WHERE id = ?', (item_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404
    rows = db.execute('''
        SELECT * FROM entries
        WHERE item_id = ? AND is_deleted = 0
        ORDER BY pushed_at DESC, id DESC
    ''', (item_id,)).fetchall()
    return jsonify([_entry_to_dict(r) for r in rows])


@items_bp.route('/api/items/<int:item_id>/entries', methods=['POST'])
def api_entries_create(item_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM items WHERE id = ?', (item_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404

    ct = request.content_type or ''
    if 'multipart/form-data' in ct:
        f = request.files.get('file')
        if not f or not f.filename:
            return jsonify({'error': 'ファイルが指定されていません'}), 400
        original_name = f.filename
        ext = os.path.splitext(original_name)[1].lower()
        safe_name = str(uuid.uuid4()) + ext
        save_path = os.path.join(UPLOADS_DIR, safe_name)
        mime = f.content_type or mimetypes.guess_type(original_name)[0] or 'application/octet-stream'
        f.save(save_path)
        size = os.path.getsize(save_path)
        memo = (request.form.get('memo') or '').strip() or None
        cur = db.execute(
            'INSERT INTO entries (item_id, entry_type, file_name, file_mime, file_size, file_path, memo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (item_id, 'file', original_name, mime, size, safe_name, memo)
        )
    else:
        data = request.get_json()
        entry_type = data.get('entry_type')
        if entry_type not in ('text', 'url'):
            return jsonify({'error': '不正なエントリ種別です'}), 400
        body = (data.get('body') or '').strip()
        if not body:
            return jsonify({'error': '内容は必須です'}), 400
        memo = (data.get('memo') or '').strip() or None
        cur = db.execute(
            'INSERT INTO entries (item_id, entry_type, body, memo) VALUES (?, ?, ?, ?)',
            (item_id, entry_type, body, memo)
        )

    db.commit()
    row = db.execute('SELECT * FROM entries WHERE id = ?', (cur.lastrowid,)).fetchone()
    return jsonify(_entry_to_dict(row)), 201


@items_bp.route('/api/entries/<int:entry_id>', methods=['DELETE'])
def api_entry_delete(entry_id):
    db = get_db()
    row = db.execute('SELECT * FROM entries WHERE id = ? AND is_deleted = 0', (entry_id,)).fetchone()
    if not row:
        return jsonify({'error': '見つかりません'}), 404
    if row['file_path']:
        _delete_upload_file(row['file_path'])
    db.execute('UPDATE entries SET is_deleted = 1 WHERE id = ?', (entry_id,))
    db.commit()
    return jsonify({'ok': True})


@items_bp.route('/api/entries/<int:entry_id>/memo', methods=['PUT'])
def api_entry_memo_update(entry_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM entries WHERE id = ? AND is_deleted = 0', (entry_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404
    data = request.get_json()
    memo = (data.get('memo') or '').strip() or None
    db.execute('UPDATE entries SET memo = ? WHERE id = ?', (memo, entry_id))
    db.commit()
    return jsonify({'ok': True})


# --- API: tags ---

@items_bp.route('/api/tags')
def api_tags_list():
    db = get_db()
    rows = db.execute('SELECT id, name FROM tags ORDER BY name COLLATE NOCASE').fetchall()
    return jsonify([{'id': r['id'], 'name': r['name']} for r in rows])


@items_bp.route('/api/items/<int:item_id>/tags', methods=['POST'])
def api_item_tag_add(item_id):
    db = get_db()
    if not db.execute('SELECT 1 FROM items WHERE id = ?', (item_id,)).fetchone():
        return jsonify({'error': '見つかりません'}), 404
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'タグ名は必須です'}), 400
    row = db.execute('SELECT id FROM tags WHERE name = ?', (name,)).fetchone()
    if row:
        tag_id = row['id']
    else:
        cur = db.execute('INSERT INTO tags (name) VALUES (?)', (name,))
        tag_id = cur.lastrowid
    db.execute('INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)', (item_id, tag_id))
    db.commit()
    return jsonify({'id': tag_id, 'name': name})


@items_bp.route('/api/items/<int:item_id>/tags/<int:tag_id>', methods=['DELETE'])
def api_item_tag_remove(item_id, tag_id):
    db = get_db()
    db.execute('DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?', (item_id, tag_id))
    db.commit()
    return jsonify({'ok': True})


# --- File serving ---

@items_bp.route('/uploads/<filename>')
def serve_upload(filename):
    if '/' in filename or '\\' in filename or filename.startswith('.'):
        abort(404)
    db = get_db()
    row = db.execute(
        'SELECT file_name, file_mime FROM entries WHERE file_path = ? AND is_deleted = 0',
        (filename,)
    ).fetchone()
    if not row:
        abort(404)
    file_path = os.path.join(UPLOADS_DIR, filename)
    if not os.path.isfile(file_path):
        abort(404)

    mime = row['file_mime'] or 'application/octet-stream'
    original_name = row['file_name'] or filename
    ext = os.path.splitext(original_name)[1].lower()

    if mime.startswith('image/') or mime == 'application/pdf':
        return send_file(file_path, mimetype=mime)
    if ext in ('.html', '.htm'):
        return send_file(file_path, mimetype='text/html')
    if ext in ('.md', '.markdown'):
        return send_file(file_path, mimetype='text/plain')
    return send_file(file_path, mimetype=mime, as_attachment=True, download_name=original_name)


# --- Helpers ---

def _delete_upload_file(file_path):
    try:
        os.remove(os.path.join(UPLOADS_DIR, file_path))
    except OSError:
        pass
