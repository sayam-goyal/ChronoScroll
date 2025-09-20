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
const els = {
delaySec: document.getElementById('delaySec'),
jitterSec: document.getElementById('jitterSec'),
maxCount: document.getElementById('maxCount'),
minimized: document.getElementById('minimized'),
startBtn: document.getElementById('startBtn'),
stopBtn: document.getElementById('stopBtn'),
openDb: document.getElementById('openDb'),
exportJson: document.getElementById('exportJson'),
count: document.getElementById('count')
};


try { const { reels = [] } = await chrome.storage.local.get({ reels: [] }); els.count.textContent = `${reels.length} saved`; } catch { els.count.textContent = '—'; }


els.startBtn.onclick = async () => {
const config = { delaySec: Number(els.delaySec.value || 6), jitterSec: Number(els.jitterSec.value || 1), maxCount: Number(els.maxCount.value || 200), minimized: !!els.minimized.checked };
try {
const res = await sendMessageP({ type: 'START_SCRAPE', config });
if (res?.ok) { window.close(); } else { alert('Could not start: ' + (res?.error || 'unknown error')); }
} catch (e) { alert('Could not start: ' + (e?.message || e || 'unknown error')); }
};


els.stopBtn.onclick = async () => {
try { const res = await sendMessageP({ type: 'STOP_SCRAPE' }); if (!res?.ok) alert('Could not stop: ' + (res?.error || 'unknown error')); } catch (e) { alert('Could not stop: ' + (e?.message || e || 'unknown error')); }
};


els.openDb.onclick = () => { const url = chrome.runtime.getURL('dashboard.html'); chrome.tabs.create({ url }); };


els.exportJson.onclick = async () => {
const { reels = [] } = await chrome.storage.local.get({ reels: [] });
const blob = new Blob([JSON.stringify(reels, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
try { await chrome.downloads.download({ url, filename: 'reels_export.json', saveAs: true }); }
catch { const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(reels, null, 2)); chrome.tabs.create({ url: dataUrl }); }
};
});