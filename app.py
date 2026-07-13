# -*- coding: utf-8 -*-
import os
import time
from datetime import timedelta

from flask import Flask, jsonify, redirect, request, session, url_for

from helpers import close_db

_STATIC_VERSION = str(int(time.time()))


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get('SECRET_KEY', 'dev-insecure-key-change-me')
    app.permanent_session_lifetime = timedelta(days=30)
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB

    @app.context_processor
    def inject_static_version():
        return {'static_v': _STATIC_VERSION}

    @app.teardown_appcontext
    def _close_db(e=None):
        close_db(e)

    @app.before_request
    def require_login():
        if request.endpoint in ('auth.login', 'static') or session.get('authenticated'):
            return
        if request.path.startswith('/api/') or request.path.startswith('/uploads/'):
            return jsonify({'error': '認証が必要です'}), 401
        return redirect(url_for('auth.login', next=request.path))

    from blueprints.auth import auth_bp
    from blueprints.items import items_bp
    from blueprints.export import export_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(items_bp)
    app.register_blueprint(export_bp)

    @app.route('/')
    def index():
        return redirect(url_for('items.items_list'))

    return app


app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
