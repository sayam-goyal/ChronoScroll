const p = {
  windowsCreate: (data) => new Promise((res, rej) => { try { chrome.windows.create(data, w => { const e = chrome.runtime.lastError; if (e) rej(e); else res(w); }); } catch (e) { rej(e); } }),
  windowsUpdate: (id, data) => new Promise((res, rej) => { try { chrome.windows.update(id, data, w => { const e = chrome.runtime.lastError; if (e) rej(e); else res(w); }); } catch (e) { rej(e); } }),
  tabsQuery: (query) => new Promise((res, rej) => { try { chrome.tabs.query(query, r => { const e = chrome.runtime.lastError; if (e) rej(e); else res(r); }); } catch (e) { rej(e); } }),
  tabsGet: (id) => new Promise((res, rej) => { try { chrome.tabs.get(id, t => { const e = chrome.runtime.lastError; if (e) rej(e); else res(t); }); } catch (e) { rej(e); } }),
  tabsUpdate: (id, data) => new Promise((res, rej) => { try { chrome.tabs.update(id, data, t => { const e = chrome.runtime.lastError; if (e) rej(e); else res(t); }); } catch (e) { rej(e); } }),
  tabsSend: (id, msg) => new Promise((res, rej) => { try { chrome.tabs.sendMessage(id, msg, r => { const e = chrome.runtime.lastError; if (e) rej(e); else res(r); }); } catch (e) { rej(e); } })
};

let currentJob = null; // { tabId, windowId, delayMs, maxCount, jitterMs, startedAt }

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'START_SCRAPE') {
    startScrapeJob(msg.config)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // keep port open
  }
  if (msg?.type === 'STOP_SCRAPE') {
    stopScrapeJob().then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === 'OPEN_DASHBOARD') {
    const url = chrome.runtime.getURL('dashboard.html');
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return false;
  }
});

async function startScrapeJob(config) {
  // If a reels tab already exists, reuse it; otherwise open /reels/
  const reelsTabs = await p.tabsQuery({ url: ['https://www.instagram.com/reels/*', 'https://www.instagram.com/reel/*'] });
  let targetTab = reelsTabs?.[0];
  let win;
  if (!targetTab) {
    win = await p.windowsCreate({ url: 'https://www.instagram.com/reels/', focused: true });
    const tabs = await p.tabsQuery({ windowId: win.id, active: true });
    targetTab = tabs?.[0];
    if (!targetTab?.id) throw new Error('Could not obtain tab id after window creation');
  } else {
    // Bring existing tab to front
    win = await p.windowsUpdate(targetTab.windowId, { focused: true });
  }

  const delayMs = Math.max(1500, (config?.delaySec ?? 6) * 1000);
  const jitterMs = Math.max(0, (config?.jitterSec ?? 1) * 1000);
  const maxCount = Math.max(1, config?.maxCount ?? 200);

  currentJob = { tabId: targetTab.id, windowId: targetTab.windowId, delayMs, jitterMs, maxCount, startedAt: Date.now() };

  await waitForContentScript(targetTab.id, 'https://www.instagram.com/reels/');
  await p.tabsSend(targetTab.id, { type: 'CONTENT_START', job: currentJob });
}

async function waitForContentScript(tabId, expectedUrl, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await p.tabsGet(tabId);
      const url = t.url || '';
      const okPath = /https:\/\/www\.instagram\.com\/(reels|reel)\//.test(url);
      if (!okPath && expectedUrl) await p.tabsUpdate(tabId, { url: expectedUrl });
      const ping = await p.tabsSend(tabId, { type: 'PING' });
      if (ping && (ping.ok || ping.running !== undefined)) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('Content script never became ready (are you on the login page?)');
}

async function stopScrapeJob() {
  if (!currentJob) return;
  try { await p.tabsSend(currentJob.tabId, { type: 'CONTENT_STOP' }); } catch {}
  currentJob = null;
}

chrome.tabs.onRemoved.addListener((tabId) => { if (currentJob?.tabId === tabId) currentJob = null; });
chrome.windows.onRemoved.addListener((windowId) => { if (currentJob?.windowId === windowId) currentJob = null; });