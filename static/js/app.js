document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const app = document.querySelector('.app');
  const backdrop = document.querySelector('.backdrop');
  if (toggle && app) {
    toggle.addEventListener('click', () => app.classList.toggle('sidebar-open'));
  }
  if (backdrop && app) {
    backdrop.addEventListener('click', () => app.classList.remove('sidebar-open'));
  }

  const filterQ = document.getElementById('filter-q');
  const clearBtn = document.getElementById('filter-q-clear');
  if (filterQ && clearBtn) {
    const sync = () => { clearBtn.style.display = filterQ.value ? 'block' : 'none'; };
    sync();
    filterQ.addEventListener('input', sync);
    clearBtn.addEventListener('click', () => {
      filterQ.value = '';
      filterQ.dispatchEvent(new Event('input'));
      filterQ.focus();
    });
  }
});

async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
    throw new Error('認証が必要です');
  }
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) {
    const message = (body && body.error) || `リクエストに失敗しました (${res.status})`;
    throw new Error(message);
  }
  return body;
}

function apiPostJson(url, data) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function apiPutJson(url, data) {
  return apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// DB の pushed_at / created_at は UTC の "YYYY-MM-DD HH:MM:SS" 形式。表示は JST。
function formatJst(value) {
  if (!value) return '';
  const utc = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(utc.getTime())) return value;
  return utc.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 画像ライトボックス（全ページ共通）
(function () {
  let overlay = null;
  function openLightbox(src) {
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `<img class="lightbox-img" src="${escapeHtml(src)}" alt="拡大表示">`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => { overlay.remove(); overlay = null; });
    document.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Escape' && overlay) { overlay.remove(); overlay = null; }
      document.removeEventListener('keydown', onKey);
    });
  }
  document.addEventListener('click', (ev) => {
    const img = ev.target.closest('.lightbox-trigger');
    if (img) openLightbox(img.src || img.dataset.src);
  });
})();
