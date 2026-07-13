/* item_detail.js — 機器詳細ページの制御 */

let detailItemId = null;
let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
  detailItemId = ITEM_ID;
  loadItemDetail(detailItemId);

  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ドロップゾーン
  const zone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-input');
  if (zone && fileInput) {
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) setSelectedFile(f);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) setSelectedFile(fileInput.files[0]);
    });
  }

  document.getElementById('btn-add-entry')?.addEventListener('click', submitEntry);
  document.getElementById('text-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitEntry();
  });

  // エントリリストのイベント委譲
  document.getElementById('entries-list')?.addEventListener('click', handleEntryListClick);
});

async function loadItemDetail(itemId) {
  showDetailSpinner();
  try {
    const [item, entries] = await Promise.all([
      apiFetch(`/api/items/${itemId}`),
      apiFetch(`/api/items/${itemId}/entries`),
    ]);
    renderDetailHeader(item);
    renderEntries(entries);
    initItemEditing(item);
    initTagManagement(item);
    initDeleteItem(item);
    hideDetailSpinner();
  } catch (e) {
    showDetailError(e.message);
  }
}

// --- ヘッダー ---

function renderDetailHeader(item) {
  document.getElementById('detail-name-display').textContent = item.name;
  const memoEl = document.getElementById('detail-memo-display');
  memoEl.textContent = item.memo || '';
  memoEl.style.display = item.memo ? '' : 'none';
  document.getElementById('detail-created').textContent = '登録: ' + formatJst(item.created_at);
  renderDetailTags(item);
  document.getElementById('item-header-card').style.display = '';
  document.getElementById('entries-card').style.display = '';
  document.title = item.name + ' - guidestore';
}

function renderDetailTags(item) {
  document.getElementById('detail-tags-list').innerHTML = item.tags.map(t =>
    `<span class="chip">${escapeHtml(t.name)}<button type="button" class="chip-remove-tag" data-tag-id="${t.id}" title="タグを外す">×</button></span>`
  ).join('');
}

// --- エントリ ---

function renderEntries(entries) {
  const list = document.getElementById('entries-list');
  const empty = document.getElementById('entries-empty');
  if (entries.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = entries.map(renderEntryHtml).join('');
}

function renderEntryHtml(e) {
  const badgeClass = entryBadgeClass(e);
  const badgeLabel = entryBadgeLabel(e);
  const memoText = e.memo ? `メモ: ${escapeHtml(e.memo)}` : '';

  return `<div class="entry-card" data-entry-id="${e.id}">
    <span class="entry-type-badge ${badgeClass}">${badgeLabel}</span>
    <div class="entry-body">
      <div class="entry-content">${entryContentHtml(e)}</div>
      <div class="entry-footer">
        <span>${formatJst(e.pushed_at)}</span>
        <span class="entry-memo-display" id="memo-display-${e.id}">${memoText}</span>
      </div>
      <div class="inline-form entry-memo-edit" id="memo-edit-${e.id}" style="display:none">
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap">
          <input type="text" class="memo-edit-input" style="flex:1; min-width:120px" value="${escapeHtml(e.memo || '')}" placeholder="メモを入力">
          <button class="btn btn-sm memo-save-btn" data-id="${e.id}">保存</button>
          <button class="btn btn-text btn-sm memo-cancel-btn" data-id="${e.id}">×</button>
        </div>
      </div>
    </div>
    <div class="entry-actions">
      <button class="btn btn-text btn-sm memo-toggle-btn" data-id="${e.id}">メモ</button>
      <button class="btn btn-danger btn-sm entry-delete-btn" data-id="${e.id}">削除</button>
    </div>
  </div>`;
}

function entryBadgeClass(e) {
  if (e.entry_type === 'text') return 'type-text';
  if (e.entry_type === 'url')  return 'type-url';
  if (!e.file_mime) return 'type-file';
  if (e.file_mime.startsWith('image/')) return 'type-img';
  if (e.file_mime === 'application/pdf') return 'type-pdf';
  const ext = (e.file_name || '').split('.').pop().toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'type-html';
  if (ext === 'md' || ext === 'markdown') return 'type-md';
  return 'type-file';
}

function entryBadgeLabel(e) {
  if (e.entry_type === 'text') return 'テキスト';
  if (e.entry_type === 'url')  return 'URL';
  if (!e.file_mime) return 'ファイル';
  if (e.file_mime.startsWith('image/')) return '画像';
  if (e.file_mime === 'application/pdf') return 'PDF';
  const ext = (e.file_name || '').split('.').pop().toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'HTML';
  if (ext === 'md' || ext === 'markdown') return 'Markdown';
  return 'ファイル';
}

function entryContentHtml(e) {
  if (e.entry_type === 'text') {
    return `<div class="entry-text">${escapeHtml(e.body)}</div>`;
  }
  if (e.entry_type === 'url') {
    return `<a class="entry-file-link" href="${escapeHtml(e.body)}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.body)}</a>`;
  }
  const url = escapeHtml(e.file_url || '');
  const name = escapeHtml(e.file_name || 'ファイル');
  const size = e.file_size ? ` <span class="muted">(${formatFileSize(e.file_size)})</span>` : '';
  if (e.file_mime && e.file_mime.startsWith('image/')) {
    return `<img src="${url}" class="entry-thumb lightbox-trigger" alt="${name}" data-src="${url}">
            <div style="font-size:12.5px; color:var(--muted); margin-top:4px">${name}${size}</div>`;
  }
  const icon = e.file_mime === 'application/pdf' ? '📄' : '📎';
  return `<a class="entry-file-link" href="${url}" target="_blank" rel="noopener noreferrer">${icon} ${name}${size}</a>`;
}

// --- エントリ操作（イベント委譲） ---

async function handleEntryListClick(e) {
  const deleteBtn  = e.target.closest('.entry-delete-btn');
  const toggleBtn  = e.target.closest('.memo-toggle-btn');
  const saveBtn    = e.target.closest('.memo-save-btn');
  const cancelBtn  = e.target.closest('.memo-cancel-btn');

  if (deleteBtn) {
    const id = Number(deleteBtn.dataset.id);
    if (!confirm('このエントリを削除しますか？')) return;
    try {
      await apiFetch(`/api/entries/${id}`, { method: 'DELETE' });
      deleteBtn.closest('.entry-card').remove();
      const remaining = document.querySelectorAll('#entries-list .entry-card');
      document.getElementById('entries-empty').style.display = remaining.length === 0 ? '' : 'none';
    } catch (err) { alert(err.message); }
  }

  if (toggleBtn) {
    const id = toggleBtn.dataset.id;
    const editDiv = document.getElementById(`memo-edit-${id}`);
    const isOpen = editDiv.style.display !== 'none';
    editDiv.style.display = isOpen ? 'none' : '';
    if (!isOpen) editDiv.querySelector('input').focus();
  }

  if (saveBtn) {
    const id = Number(saveBtn.dataset.id);
    const input = document.querySelector(`#memo-edit-${id} .memo-edit-input`);
    const memo = input.value.trim() || null;
    try {
      await apiPutJson(`/api/entries/${id}/memo`, { memo });
      document.getElementById(`memo-display-${id}`).textContent = memo ? `メモ: ${memo}` : '';
      document.getElementById(`memo-edit-${id}`).style.display = 'none';
    } catch (err) { alert(err.message); }
  }

  if (cancelBtn) {
    document.getElementById(`memo-edit-${cancelBtn.dataset.id}`).style.display = 'none';
  }
}

// --- 投稿フォーム ---

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tab-text').style.display = tab === 'text' ? '' : 'none';
  document.getElementById('tab-url').style.display  = tab === 'url'  ? '' : 'none';
  document.getElementById('tab-file').style.display = tab === 'file' ? '' : 'none';
}

function setSelectedFile(file) {
  selectedFile = file;
  document.getElementById('file-selected-name').textContent = file.name;
}

async function submitEntry() {
  if (!detailItemId) return;
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  const memo = document.getElementById('entry-memo').value.trim() || null;
  const btn = document.getElementById('btn-add-entry');
  btn.disabled = true;

  try {
    let entry;
    if (activeTab === 'text') {
      const body = document.getElementById('text-input').value.trim();
      if (!body) { alert('テキストを入力してください'); return; }
      entry = await apiPostJson(`/api/items/${detailItemId}/entries`, { entry_type: 'text', body, memo });
      document.getElementById('text-input').value = '';
    } else if (activeTab === 'url') {
      const body = document.getElementById('url-input').value.trim();
      if (!body) { alert('URLを入力してください'); return; }
      entry = await apiPostJson(`/api/items/${detailItemId}/entries`, { entry_type: 'url', body, memo });
      document.getElementById('url-input').value = '';
    } else if (activeTab === 'file') {
      if (!selectedFile) { alert('ファイルを選択してください'); return; }
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (memo) formData.append('memo', memo);
      entry = await apiFetch(`/api/items/${detailItemId}/entries`, { method: 'POST', body: formData });
      selectedFile = null;
      document.getElementById('file-selected-name').textContent = '';
      document.getElementById('file-input').value = '';
    }
    document.getElementById('entry-memo').value = '';
    prependEntryToList(entry);
  } catch (e) {
    alert(e.message);
  } finally {
    btn.disabled = false;
  }
}

function prependEntryToList(entry) {
  const list = document.getElementById('entries-list');
  document.getElementById('entries-empty').style.display = 'none';
  const div = document.createElement('div');
  div.innerHTML = renderEntryHtml(entry);
  list.prepend(div.firstElementChild);
}

// --- アイテム編集 ---

function initItemEditing(item) {
  const viewMode = document.getElementById('item-view-mode');
  const editMode = document.getElementById('item-edit-mode');

  document.getElementById('btn-edit-item').onclick = () => {
    document.getElementById('edit-name-input').value = item.name;
    document.getElementById('edit-memo-input').value = item.memo || '';
    viewMode.style.display = 'none';
    editMode.style.display = '';
    document.getElementById('edit-name-input').focus();
  };

  document.getElementById('btn-cancel-item-edit').onclick = () => {
    viewMode.style.display = '';
    editMode.style.display = 'none';
  };

  document.getElementById('btn-save-item-edit').onclick = async () => {
    const name = document.getElementById('edit-name-input').value.trim();
    const memo = document.getElementById('edit-memo-input').value.trim() || null;
    if (!name) { alert('機器名を入力してください'); return; }
    try {
      await apiPutJson(`/api/items/${item.id}`, { name, memo });
      item.name = name;
      item.memo = memo;
      renderDetailHeader(item);
      viewMode.style.display = '';
      editMode.style.display = 'none';
    } catch (e) { alert(e.message); }
  };
}

// --- タグ管理 ---

function initTagManagement(item) {
  document.getElementById('detail-tags-list').addEventListener('click', async e => {
    const btn = e.target.closest('.chip-remove-tag');
    if (!btn) return;
    const tagId = Number(btn.dataset.tagId);
    try {
      await apiFetch(`/api/items/${item.id}/tags/${tagId}`, { method: 'DELETE' });
      item.tags = item.tags.filter(t => t.id !== tagId);
      renderDetailTags(item);
    } catch (e) { alert(e.message); }
  });

  const addBtn = document.getElementById('btn-add-tag');
  const popup  = document.getElementById('add-tag-popup');
  const input  = document.getElementById('add-tag-input');

  addBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = popup.style.display !== 'none';
    popup.style.display = isOpen ? 'none' : '';
    if (!isOpen) { input.value = ''; input.focus(); }
  });

  document.addEventListener('click', e => {
    if (!popup?.contains(e.target) && e.target !== addBtn) {
      if (popup) popup.style.display = 'none';
    }
  });

  document.getElementById('btn-add-tag-confirm')?.addEventListener('click', () => doAddTag(item));
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') doAddTag(item); });
}

async function doAddTag(item) {
  const input = document.getElementById('add-tag-input');
  const name = input.value.trim();
  if (!name) return;
  try {
    const tag = await apiPostJson(`/api/items/${item.id}/tags`, { name });
    if (!item.tags.some(t => t.id === tag.id)) item.tags.push(tag);
    renderDetailTags(item);
    input.value = '';
    document.getElementById('add-tag-popup').style.display = 'none';
  } catch (e) { alert(e.message); }
}

// --- アイテム削除 ---

function initDeleteItem(item) {
  document.getElementById('btn-delete-item').onclick = async () => {
    if (!confirm(`「${item.name}」を削除しますか？エントリも含めてすべて削除されます。`)) return;
    try {
      await apiFetch(`/api/items/${item.id}`, { method: 'DELETE' });
      window.location.href = '/items';
    } catch (e) { alert(e.message); }
  };
}

// --- スピナー / エラー ---

function showDetailSpinner() {
  document.getElementById('item-header-card').style.display = 'none';
  document.getElementById('entries-card').style.display = 'none';
  document.getElementById('detail-spinner').style.display = '';
  document.getElementById('detail-error').style.display = 'none';
}

function hideDetailSpinner() {
  document.getElementById('detail-spinner').style.display = 'none';
}

function showDetailError(msg) {
  document.getElementById('detail-spinner').style.display = 'none';
  const el = document.getElementById('detail-error');
  el.textContent = msg;
  el.style.display = '';
}
