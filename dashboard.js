const q = sel => document.querySelector(sel);
const resultsEl = q('#results');
const searchEl = q('#search');
let data = [];

// 1x1 transparent PNG fallback (no external icons needed)
const TRANSPARENT_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/erwYt0AAAAASUVORK5CYII=';

(async function init() {
  if (!resultsEl) return;

  const store = await chrome.storage.local.get({ reels: [] });
  data = (store.reels || []).sort((a,b) => (b.collectedAt||'').localeCompare(a.collectedAt||''));
  render(data);

  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const term = searchEl.value.trim().toLowerCase();
      if (!term) return render(data);
      const filtered = data.filter(item =>
        (item.caption||'').toLowerCase().includes(term) ||
        (item.username||'').toLowerCase().includes(term) ||
        (item.url||'').toLowerCase().includes(term)
      );
      render(filtered);
    });
  }

  const exportBtn = q('#export');
  exportBtn?.addEventListener('click', async () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try { await chrome.downloads.download({ url, filename: 'reels_export.json', saveAs: true }); }
    catch { const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2)); window.open(dataUrl, '_blank'); }
  });

  const clearBtn = q('#clear');
  clearBtn?.addEventListener('click', async () => {
    if (!confirm('Clear all saved reels?')) return;
    await chrome.storage.local.set({ reels: [] });
    data = [];
    render(data);
  });
})();

function render(items){
  resultsEl.innerHTML = '';
  const tpl = document.getElementById('cardTpl');
  for (const item of items) {
    const node = tpl.content.cloneNode(true);
    const a = node.querySelector('.card');
    a.href = item.url;
    const img = node.querySelector('img');
    img.src = item.previewImage || TRANSPARENT_PX;
    node.querySelector('.user').textContent = item.username || 'Unknown';
    node.querySelector('.caption').textContent = item.caption || '(no caption)';
    node.querySelector('.url').textContent = item.url;
    node.querySelector('.date').textContent = formatDate(item.collectedAt);
    resultsEl.appendChild(node);
  }
}

function formatDate(iso){
  if (!iso) return '';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}
