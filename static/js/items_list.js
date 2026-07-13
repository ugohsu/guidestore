/* items_list.js — 機器一覧ページの制御 */

let allItems = [];
let allTags = [];

document.addEventListener('DOMContentLoaded', () => {
  loadItems();
  document.getElementById('filter-q')?.addEventListener('input', renderItemList);
  document.getElementById('filter-tag')?.addEventListener('change', renderItemList);
  document.getElementById('btn-new-item')?.addEventListener('click', openNewItemModal);
  document.getElementById('new-item-modal-close')?.addEventListener('click', closeNewItemModal);
  document.getElementById('new-item-cancel')?.addEventListener('click', closeNewItemModal);
  document.getElementById('new-item-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeNewItemModal();
  });
  document.getElementById('new-item-form')?.addEventListener('submit', handleNewItemSubmit);
});

async function loadItems() {
  try {
    [allItems, allTags] = await Promise.all([
      apiFetch('/api/items'),
      apiFetch('/api/tags'),
    ]);
    renderItemList();
    populateTagFilter();
  } catch (e) {
    const el = document.getElementById('list-alert');
    el.className = 'alert alert-error';
    el.textContent = e.message;
    el.style.display = '';
  }
}

function renderItemList() {
  const q = (document.getElementById('filter-q')?.value || '').trim().toLowerCase();
  const tagId = document.getElementById('filter-tag')?.value || '';

  let items = allItems;
  if (q) items = items.filter(it => it.name.toLowerCase().includes(q));
  if (tagId) items = items.filter(it => it.tags.some(t => String(t.id) === tagId));

  const tbody = document.getElementById('items-tbody');
  const empty = document.getElementById('items-empty');

  if (items.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = items.map(it => {
    const tagsHtml = it.tags.map(t => `<span class="chip">${escapeHtml(t.name)}</span>`).join(' ');
    const lastUpdate = it.last_pushed_at ? formatJst(it.last_pushed_at) : '—';
    return `<tr data-href="/items/${it.id}" style="cursor:pointer">
      <td><a href="/items/${it.id}" style="font-weight:500">${escapeHtml(it.name)}</a></td>
      <td>${tagsHtml}</td>
      <td><span class="badge">${it.entry_count}</span></td>
      <td class="muted" style="font-size:12.5px; white-space:nowrap">${lastUpdate}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr[data-href]').forEach(tr => {
    tr.addEventListener('click', e => {
      if (e.target.tagName === 'A') return;
      window.location.href = tr.dataset.href;
    });
  });
}

function populateTagFilter() {
  const sel = document.getElementById('filter-tag');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">すべてのタグ</option>' +
    allTags.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
  sel.value = current;
}

// --- 新規機器モーダル ---

function openNewItemModal() {
  document.getElementById('new-item-name').value = '';
  document.getElementById('new-item-memo').value = '';
  document.getElementById('new-item-error').textContent = '';
  document.getElementById('new-item-modal').style.display = '';
  document.getElementById('new-item-name').focus();
}

function closeNewItemModal() {
  document.getElementById('new-item-modal').style.display = 'none';
}

async function handleNewItemSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-item-name').value.trim();
  const memo = document.getElementById('new-item-memo').value.trim();
  const errEl = document.getElementById('new-item-error');
  errEl.textContent = '';
  if (!name) { errEl.textContent = '機器名を入力してください'; return; }
  try {
    const item = await apiPostJson('/api/items', { name, memo });
    window.location.href = `/items/${item.id}`;
  } catch (e) {
    errEl.textContent = e.message;
  }
}
