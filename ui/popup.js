
import {getSettings, saveSettings, pushItem, getLogin} from '../libs/storage.js';

const $ = s => document.querySelector(s);
const platformEl = $('#platform'); const delayEl = $('#delay'); const minimizedEl = $('#minimized'); const autostartEl = $('#autostart');
const statusEl = $('#status'); const countEl = $('#count');
const mUrl = $('#m-url'); const mUser = $('#m-user'); const mCap = $('#m-cap'); const mTags = $('#m-tags');
const brand = $('#brand'); const detectBtn = $('#detect');

function applyTheme(theme){ document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark'); }

function setManualForm({url, username, caption, tags}){
  if (url) mUrl.value = url;
  if (username) mUser.value = username;
  if (caption) mCap.value = caption;
  if (tags && tags.length) mTags.value = Array.from(new Set(tags)).join(', ');
}

async function activeTab(){
  return new Promise(res => chrome.tabs.query({active:true, currentWindow:true}, tabs => res(tabs && tabs[0])));
}

async function tryInjectAndScrape(tabId, platform){
  // Ask existing content script
  const ask = await new Promise(r => chrome.tabs.sendMessage(tabId, {type:'SCRAPE_EXTRACT'}, r));
  if (ask && ask.ok && ask.data) return ask.data;

  // Inject content script
  try {
    await chrome.scripting.executeScript({target:{tabId}, files:['libs/cs_utils.js', platform==='instagram'?'content/instagram.js':'content/youtube_shorts.js']});
    const ans = await new Promise(r => chrome.tabs.sendMessage(tabId, {type:'SCRAPE_EXTRACT'}, r));
    if (ans && ans.ok && ans.data) return ans.data;
  } catch(e) {}

  // Generic OG/JSON-LD fallback
  try {
    const [result] = await chrome.scripting.executeScript({
      target:{tabId},
      func: () => {
        const out = { url: location.href, username: null, caption: null, tags: [] };
        const ogd = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
        const ogt = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
        out.caption = ogd || ogt || document.title || null;
        try{
          const s = document.querySelector('script[type="application/ld+json"]');
          if (s) {
            const data = JSON.parse(s.textContent);
            const all = Array.isArray(data)?data:[data];
            for (const item of all) {
              const a = item.author;
              if (a && (a.alternateName || a.name)) { out.username = a.alternateName || a.name; break; }
            }
          }
        }catch{}
        const re=/#([\p{L}\p{Nd}_]+)/gu; const t=[]; let m; const cap=out.caption||''; while((m=re.exec(cap))) t.push(m[1].toLowerCase()); out.tags=[...new Set(t)];
        return out;
      }
    });
    if (result && result.result) return result.result;
  } catch(e){}

  return null;
}

async function detectFromCurrentTab(){
  const tab = await activeTab(); if (!tab || !tab.url) return alert('No active tab found.');
  const platform = tab.url.includes('instagram.com') ? 'instagram' : (tab.url.includes('youtube.com') ? 'youtube' : null);
  if (!platform) return alert('Open an Instagram Reel or YouTube Short in the active tab first.');
  const data = await tryInjectAndScrape(tab.id, platform);
  if (!data) return alert('Could not detect details from the current tab.');
  data.platform = platform; data.timestamp = Date.now(); setManualForm(data);
}

async function refresh(){
  const s = await getSettings();
  platformEl.value = s.platform; delayEl.value = s.delayMs; minimizedEl.checked = !!s.minimized; autostartEl.checked = !!s.autoscroll;
  const login = await getLogin(); if (login?.email) brand.textContent = `ChronoScroll — ${login.email}`;
  const sess = await new Promise(res => chrome.runtime.sendMessage({type:'GET_SESSION'}, r=>res(r?.data||{})));
  statusEl.textContent = 'STATUS: ' + (sess.running ? 'RUNNING' : 'IDLE');
  countEl.textContent = 'ITEMS: ' + (sess.items||0);
}
setInterval(refresh, 800); refresh();

platformEl.addEventListener('change', ()=> saveSettings({platform: platformEl.value}));
delayEl.addEventListener('change', ()=> saveSettings({delayMs: Number(delayEl.value)}));
minimizedEl.addEventListener('change', ()=> saveSettings({minimized: minimizedEl.checked}));
autostartEl.addEventListener('change', ()=> saveSettings({autoscroll: autostartEl.checked}));

$('#start').addEventListener('click', async ()=>{
  await saveSettings({platform: platformEl.value, delayMs: Number(delayEl.value), minimized: minimizedEl.checked, autoscroll: autostartEl.checked, autoscrollEnabled:true});
  chrome.runtime.sendMessage({type:'START_AUTOSCROLL', payload:{platform: platformEl.value, delayMs: Number(delayEl.value), minimized: minimizedEl.checked}}, ()=>{});
  setTimeout(refresh, 300);
});
$('#stop').addEventListener('click', ()=>{ chrome.runtime.sendMessage({type:'STOP_AUTOSCROLL'}, ()=>{}); setTimeout(refresh, 300); });

// Manual Add
$('#m-save').addEventListener('click', async ()=>{
  const url = (mUrl.value||'').trim(); if (!url) return alert('Please paste a Reel/Short URL or click Detect.');
  const username = (mUser.value||'').trim() || null;
  const caption = (mCap.value||'').trim() || null;
  const tags = (mTags.value||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const platform = url.includes('youtube.com') ? 'youtube' : (url.includes('instagram.com') ? 'instagram' : (platformEl.value||'youtube'));
  const item = {platform, url, username, caption, timestamp: Date.now(), tags};
  await pushItem(item);
  mUrl.value = ''; mUser.value=''; mCap.value=''; mTags.value='';
  alert('Added to database.');
});

// Detect button + auto-detect on open
detectBtn.addEventListener('click', detectFromCurrentTab);
detectFromCurrentTab().catch(()=>{});
