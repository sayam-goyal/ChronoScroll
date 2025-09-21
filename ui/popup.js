
import {getSettings, saveSettings, pushItem, getLogin} from '../libs/storage.js';

const $ = s => document.querySelector(s);
const platformEl = $('#platform'); const delayEl = $('#delay'); const minimizedEl = $('#minimized');
const statusEl = $('#status'); const countEl = $('#count');
const mUrl = $('#m-url'); const mUser = $('#m-user'); const mCap = $('#m-cap'); const mTags = $('#m-tags');
const brand = $('#brand');

function applyTheme(theme){ document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark'); }

async function refresh(){
  const s = await getSettings();
  platformEl.value = s.platform; delayEl.value = s.delayMs; minimizedEl.checked = !!s.minimized;
  applyTheme(s.appearance?.theme || 'dark');
  const login = await getLogin(); if (login?.email) brand.textContent = `ChronoScroll — ${login.email}`;
  const sess = await new Promise(res => chrome.runtime.sendMessage({type:'GET_SESSION'}, r=>res(r?.data||{})));
  statusEl.textContent = 'STATUS: ' + (sess.running ? 'RUNNING' : 'IDLE');
  countEl.textContent = 'ITEMS: ' + (sess.items||0);
}
setInterval(refresh, 800); refresh();

platformEl.addEventListener('change', ()=> saveSettings({platform: platformEl.value}));
delayEl.addEventListener('change', ()=> saveSettings({delayMs: Number(delayEl.value)}));
minimizedEl.addEventListener('change', ()=> saveSettings({minimized: minimizedEl.checked}));

$('#start').addEventListener('click', async ()=>{
  await saveSettings({platform: platformEl.value, delayMs: Number(delayEl.value), minimized: minimizedEl.checked, autoscroll:true});
  chrome.runtime.sendMessage({type:'START_AUTOSCROLL', payload:{platform: platformEl.value, delayMs: Number(delayEl.value), minimized: minimizedEl.checked}}, ()=>{});
  setTimeout(refresh, 300);
});
$('#stop').addEventListener('click', ()=>{ chrome.runtime.sendMessage({type:'STOP_AUTOSCROLL'}, ()=>{}); setTimeout(refresh, 300); });

// Manual Add
$('#m-save').addEventListener('click', async ()=>{
  const url = (mUrl.value||'').trim(); if (!url) return alert('Please paste a Reel/Short URL.');
  const username = (mUser.value||'').trim() || null;
  const caption = (mCap.value||'').trim() || null;
  const tags = (mTags.value||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
  const platform = url.includes('youtube.com') ? 'youtube' : (url.includes('instagram.com') ? 'instagram' : (platformEl.value||'youtube'));
  const item = {platform, url, username, caption, timestamp: Date.now(), tags};
  await pushItem(item);
  mUrl.value = ''; mUser.value=''; mCap.value=''; mTags.value='';
  alert('Added to database.');
});
