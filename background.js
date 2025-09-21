
import {pushItem, getSettings, setSession, getSession} from './libs/storage.js';

const PLATFORM_URLS = { youtube: 'https://www.youtube.com/shorts', instagram: 'https://www.instagram.com/reels/' };
let scrapeWindowId = null; let scrapeTabId = null; let bulkQueue = []; let bulkActive = false;

async function openScrapeWindow(platform, minimized=true) {
  const url = PLATFORM_URLS[platform] || PLATFORM_URLS.youtube;
  return new Promise(resolve => {
    chrome.windows.create({url, state:minimized?'minimized':'normal', focused:!minimized, type:'normal'}, async (win) => {
      try { await chrome.windows.update(win.id, {state:minimized?'minimized':'normal', focused:false}); } catch{}
      scrapeWindowId = win.id; scrapeTabId = win.tabs?.[0]?.id || null; resolve({win, tabId: scrapeTabId});
    });
  });
}
async function closeScrapeWindow() { if (scrapeWindowId!=null){ try{ await chrome.windows.remove(scrapeWindowId);}catch{} } scrapeWindowId=null; scrapeTabId=null; }

function onceTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info, tab) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener); resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForContentReady(tabId, platform, tries=20) {
  for (let i=0;i<tries;i++) {
    try {
      const resp = await new Promise(res => chrome.tabs.sendMessage(tabId, {type:'PING'}, res));
      if (resp && resp.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  try {
    await chrome.scripting.executeScript({target:{tabId}, files:['libs/cs_utils.js', platform==='instagram'?'content/instagram.js':'content/youtube_shorts.js']});
  } catch {}
  try {
    const resp2 = await new Promise(res => chrome.tabs.sendMessage(tabId, {type:'PING'}, res));
    if (resp2 && resp2.ok) return true;
  } catch {}
  return false;
}

async function startAutoscroll({platform, delayMs=900, minimized=true}){
  const sess = await getSession(); if (sess.running) return sess;
  const {tabId} = await openScrapeWindow(platform, minimized);
  await setSession({running:true, platform, delayMs, minimized, tabId, startedAt: Date.now(), items:0});
  await onceTabComplete(tabId);
  await waitForContentReady(tabId, platform);
  await new Promise(res => chrome.tabs.sendMessage(tabId, {type:'CONTENT_START', payload:{platform, delayMs}}, res));
  return await getSession();
}
async function stopAutoscroll(){ const sess = await getSession(); if (!sess.running) return sess; try{ if(scrapeTabId) chrome.tabs.sendMessage(scrapeTabId,{type:'CONTENT_STOP'});}catch{} await setSession({running:false}); await closeScrapeWindow(); return await getSession(); }

chrome.windows.onRemoved.addListener(async (wid)=>{ if (wid===scrapeWindowId){ await setSession({running:false}); scrapeWindowId=null; scrapeTabId=null; } });

async function bulkNext(platform, delayMs) {
  if (!bulkQueue.length) { bulkActive=false; return; }
  const url = bulkQueue.shift();
  try {
    await chrome.tabs.update(scrapeTabId, {url});
    await onceTabComplete(scrapeTabId);
    await waitForContentReady(scrapeTabId, platform);
    chrome.tabs.sendMessage(scrapeTabId, {type:'SCRAPE_ONCE', payload:{platform}}, (resp)=>{
      setTimeout(()=> bulkNext(platform, delayMs), Math.max(300, delayMs));
    });
  } catch(e) {
    setTimeout(()=> bulkNext(platform, delayMs), Math.max(300, delayMs));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'START_AUTOSCROLL': {
        const s = await getSettings(); const cfg = Object.assign({}, s, msg.payload||{});
        const started = await startAutoscroll(cfg); sendResponse({ok:true, data: started}); break;
      }
      case 'STOP_AUTOSCROLL': { const stopped = await stopAutoscroll(); sendResponse({ok:true, data: stopped}); break; }
      case 'SAVE_SCRAPE_ITEM': {
        const count = await pushItem(msg.payload);
        const sess = await getSession(); if (sess.running){ sess.items=(sess.items||0)+1; await setSession(sess); }
        sendResponse({ok:true, data:{count}}); break;
      }
      case 'GET_SESSION': sendResponse({ok:true, data: await getSession()}); break;
      case 'BULK_SCRAPE_START': {
        const {urls, platform, delayMs=900, minimized=true} = msg.payload||{};
        if (!urls || !urls.length) { sendResponse({ok:false, error:'No URLs provided'}); break; }
        if (!scrapeTabId) { await openScrapeWindow(platform||'youtube', minimized); await onceTabComplete(scrapeTabId); await waitForContentReady(scrapeTabId, platform||'youtube'); }
        bulkQueue = urls.slice(); bulkActive = true;
        sendResponse({ok:true, data:{count: bulkQueue.length}});
        bulkNext(platform||'youtube', delayMs);
        break;
      }
      default: sendResponse({ok:false, error:'Unknown message'});
    }
  })();
  return true;
});

async function updateBadge(){ const s = await getSession(); if (s.running){ chrome.action.setBadgeText({text: 'ON'}); chrome.action.setBadgeBackgroundColor({color: '#34d399'});} else { chrome.action.setBadgeText({text:''}); } }
chrome.alarms.create('badge',{periodInMinutes:0.2}); chrome.alarms.onAlarm.addListener(a=>{ if(a.name==='badge') updateBadge(); });
chrome.runtime.onInstalled.addListener(()=>updateBadge()); chrome.runtime.onStartup.addListener(async ()=>{
  updateBadge();
  const s = await getSettings();
  if (s.autoscroll){ try { await startAutoscroll({platform: s.platform||'youtube', delayMs: s.delayMs||900, minimized: s.minimized!==false}); } catch {} }
});
