# -*- coding: utf-8 -*-
import os
import sqlite3

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from flask import g

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('DATA_DIR', os.path.join(BASE_DIR, 'data'))
DB_PATH = os.path.join(DATA_DIR, 'guidestore.db')
SCHEMA_PATH = os.path.join(BASE_DIR, 'schema.sql')
UPLOADS_DIR = os.path.join(DATA_DIR, 'uploads')

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


def get_db():
    if 'db' not in g:
        os.makedirs(DATA_DIR, exist_ok=True)
        os.makedirs(UPLOADS_DIR, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA foreign_keys = ON')
        conn.execute('PRAGMA journal_mode = WAL')
        with open(SCHEMA_PATH, encoding='utf-8') as f:
            conn.executescript(f.read())
        conn.commit()
        g.db = conn
    return g.db


def close_db(e=None):
    conn = g.pop('db', None)
    if conn is not None:
        conn.close()
