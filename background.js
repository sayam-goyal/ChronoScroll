
import {pushItem, getSettings, setSession, getSession, getDB, updateItem} from './libs/storage.js';
import { summarizeTranscript } from './libs/ai.js';

const PLATFORM_URLS = { youtube: 'https://www.youtube.com/shorts', instagram: 'https://www.instagram.com/reels/' };
let scrapeWindowId = null; let scrapeTabId = null;
let bulkQueue = []; let bulkActive = false;
let sumQueue = []; let sumActive = false;

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

async function ensureYTTab(minimized=true){
  if (scrapeTabId) return scrapeTabId;
  await openScrapeWindow('youtube', minimized); 
  await onceTabComplete(scrapeTabId);
  await waitForContentReady(scrapeTabId, 'youtube');
  return scrapeTabId;
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

async function fetchTranscriptForYT(url, minimized=true){
  const tabId = await ensureYTTab(minimized);
  await chrome.tabs.update(tabId, {url}); await onceTabComplete(tabId);
  await waitForContentReady(tabId, 'youtube');
  try {
    const data = await new Promise(res => chrome.tabs.sendMessage(tabId, {type:'GET_TRANSCRIPT'}, res));
    return data?.text || '';
  } catch { return ''; }
}

async function summarizeNext(){
  if (!sumQueue.length){ sumActive=false; return; }
  const id = sumQueue.shift();
  try {
    const db = await getDB(); const item = db.find(i=>i.id===id);
    if (!item) { setTimeout(summarizeNext, 50); return; }
    let transcript = item.transcript || '';
    if (!transcript && item.platform === 'youtube'){
      transcript = await fetchTranscriptForYT(item.url, true);
      if (transcript && transcript.length) await updateItem(item.id, {transcript});
    }
    const sourceText = transcript || item.caption || '';
    if (!sourceText){ setTimeout(summarizeNext, 50); return; }
    const s = await getSettings();
    const prefs = Object.entries(s.categories||{}).filter(([,v])=>v).map(([k])=>k).join(', ');
    const sum = await summarizeTranscript(sourceText, prefs);
    await updateItem(item.id, {summary: sum.summary||'', topics: sum.topics||[], genres: sum.genres||[], key_quotes: sum.key_quotes||[], ai_tags: sum.tags||[], suitability: sum.suitability||'neutral'});
  } catch (e) {
    // ignore individual failure
  }
  setTimeout(summarizeNext, 200);
}

function startSummarize(ids){
  sumQueue.push(...ids);
  if (!sumActive){ sumActive = true; summarizeNext(); }
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
        const res = await pushItem(msg.payload);
        const sess = await getSession();
        if (sess.running && res?.added){ sess.items=(sess.items||0)+1; await setSession(sess); }
        sendResponse({ok:true, data:res}); break;
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
      case 'SUMMARIZE_ALL': {
        const db = await getDB(); startSummarize(db.map(x=>x.id)); sendResponse({ok:true, count: db.length}); break;
      }
      case 'SUMMARIZE_IDS': {
        const ids = msg.payload?.ids || []; if (!ids.length) { sendResponse({ok:false, error:'No ids'}); break; }
        startSummarize(ids); sendResponse({ok:true, count: ids.length}); break;
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
