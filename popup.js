function sendMessageP(msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(response);
      });
    } catch (e) { reject(e); }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const els = {
    delaySec: $('delaySec'),
    jitterSec: $('jitterSec'),
    maxCount: $('maxCount'),
    minimized: $('minimized'),
    startBtn: $('startBtn'),
    stopBtn: $('stopBtn'),
    openDb: $('openDb'),
    exportJson: $('exportJson'),
    count: $('count')
  };

  try {
    const { reels = [] } = await chrome.storage.local.get({ reels: [] });
    if (els.count) els.count.textContent = `${reels.length} saved`;
  } catch {
    if (els.count) els.count.textContent = '—';
  }

  els.startBtn?.addEventListener('click', async () => {
    const config = {
      delaySec: Math.max(0.2, Number(els.delaySec?.value || 0.3)),
      jitterSec: Math.max(0, Number(els.jitterSec?.value || 0)),
      maxCount: Math.max(1, Number(els.maxCount?.value || 500)),
      minimized: !!els.minimized?.checked
    };
    try {
      const res = await sendMessageP({ type: 'START_SCRAPE', config });
      if (res?.ok) window.close();
      else alert('Could not start: ' + (res?.error || 'unknown error'));
    } catch (e) {
      alert('Could not start: ' + (e?.message || e || 'unknown error'));
    }
  });

  els.stopBtn?.addEventListener('click', async () => {
    try {
      const res = await sendMessageP({ type: 'STOP_SCRAPE' });
      if (!res?.ok) alert('Could not stop: ' + (res?.error || 'unknown error'));
    } catch (e) {
      alert('Could not stop: ' + (e?.message || e || 'unknown error'));
    }
  });

  els.openDb?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url });
  });

  els.exportJson?.addEventListener('click', async () => {
    const { reels = [] } = await chrome.storage.local.get({ reels: [] });
    const blob = new Blob([JSON.stringify(reels, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try { await chrome.downloads.download({ url, filename: 'reels_export.json', saveAs: true }); }
    catch {
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reels, null, 2));
      chrome.tabs.create({ url: dataUrl });
    }
  });
});
