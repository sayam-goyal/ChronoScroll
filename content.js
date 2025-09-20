let running = false;
let seenShortcodes = new Set();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') { sendResponse?.({ ok: true, running }); return; }
  if (msg?.type === 'CONTENT_PREPARE') { openFirstReelIfOnGrid().then(() => sendResponse?.({ ok: true })).catch(e => sendResponse?.({ ok: false, error: String(e) })); return true; }
  if (msg?.type === 'CONTENT_START' && !running) { running = true; autoLoop(msg.job).catch(console.error); sendResponse?.({ ok: true }); return; }
  if (msg?.type === 'CONTENT_STOP') { running = false; sendResponse?.({ ok: true }); return; }
});

async function openFirstReelIfOnGrid() {
  const isGrid = /https:\/\/www\.instagram\.com\/reels\/?($|\?)/.test(location.href);
  if (!isGrid) return;
  await sleep(800);
  const a = [...document.querySelectorAll('a[href^="/reel/" i], a[href*="/reels/"]')][0];
  if (a) { a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await waitForUrlChange(8000); }
}

async function autoLoop(job) {
  const delayMs = job.delayMs || 6000;
  const jitterMs = job.jitterMs || 1000;
  const maxCount = job.maxCount || 100;
  try { window.focus(); document.body?.focus?.(); } catch {}
  let collected = 0;
  while (running && collected < maxCount) {
    try {
      const data = scrapeCurrent();
      if (data?.shortcode && !seenShortcodes.has(data.shortcode)) { seenShortcodes.add(data.shortcode); await saveEntry(data); collected++; }
    } catch (e) { console.warn('Scrape error', e); }
    const moved = await goToNextReelWithKeypress();
    if (!moved) await clickAnyNextControl();
    await waitForUrlChange(8000);
    const jitter = Math.floor(Math.random() * (jitterMs + 1));
    await sleep(delayMs + jitter);
  }
  running = false;
}

function scrapeCurrent() {
  const url = location.href;
  const shortcode = getShortcodeFromUrl(url);
  const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const ogImg = document.querySelector('meta[property="og:image"]')?.content || '';
  const username = (ogTitle || '').split(' on Instagram')[0] || guessUsernameFromPage() || '';
  let caption = extractCaptionFromOg(ogDesc);
  if (!caption) {
    try {
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => s.textContent.trim()).map(t => { try { return JSON.parse(t); } catch { return null; } })
        .find(obj => obj && (obj.caption || obj.name));
      caption = jsonLd?.caption || jsonLd?.name || '';
    } catch {}
  }
  if (!caption) caption = findLargestVisibleSpan(180);
  return { id: shortcode, shortcode, url, caption: caption || '', username: username || '', previewImage: ogImg || '', collectedAt: new Date().toISOString(), source: 'instagram' };
}

function getShortcodeFromUrl(u) { try { const url = new URL(u); const parts = url.pathname.split('/').filter(Boolean); const i = parts.indexOf('reels') >= 0 ? parts.indexOf('reels') : parts.indexOf('reel'); if (i >= 0 && parts[i+1]) return parts[i+1]; } catch {} return null; }
function extractCaptionFromOg(text) { if (!text) return ''; const after = text.split('Instagram:')[1] || ''; const m = after.match(/[“"]([^”"]+)[”"]/); return m ? m[1] : after.trim(); }
function guessUsernameFromPage() { const a = [...document.querySelectorAll('header a[role="link"], a[href*="/reel"], a[href*="/reels" ]')].find(el => el.textContent?.trim()?.length > 0); return a?.textContent?.trim() || ''; }
function findLargestVisibleSpan(minLength = 120) { const spans = [...document.querySelectorAll('span[dir], h1, h2, div[role="button"] span')]; const vis = spans.map(el => ({ el, text: el.innerText?.trim() || '' })).filter(o => o.text && o.text.length >= minLength).sort((a, b) => b.text.length - a.text.length); return vis[0]?.text || ''; }
async function saveEntry(entry) { const store = await chrome.storage.local.get({ reels: [] }); const reels = store.reels || []; if (!reels.find(r => r.shortcode === entry.shortcode)) { reels.push(entry); await chrome.storage.local.set({ reels }); } }

async function goToNextReelWithKeypress() { const before = location.href; const ev = (k,c,code)=>new KeyboardEvent(c,{key:k,code:k,keyCode:code,which:code,bubbles:true,cancelable:true}); try { window.focus(); document.activeElement?.blur?.(); document.body?.focus?.(); } catch {} for (let i=0;i<3;i++){ document.dispatchEvent(ev('ArrowDown','keydown',40)); await sleep(120); document.dispatchEvent(ev('ArrowDown','keyup',40)); } await sleep(600); if (location.href!==before) return true; const fbs=[['PageDown',34],['ArrowRight',39]]; for (const [k,code] of fbs){ document.dispatchEvent(ev(k,'keydown',code)); await sleep(600); if (location.href!==before) return true; } const nextLink=[...document.querySelectorAll('a[href^="/reel" i], a[href^="/reels" i]')].map(a=>a.getAttribute('href')).map(h=>h?(h.startsWith('http')?h:`https://www.instagram.com${h}`):'').find(h=>/https:\/\/www\.instagram\.com\/(reels|reel)\//.test(h)&&h!==location.href); if (nextLink){ location.assign(nextLink); return true; } return false; }
async function clickAnyNextControl(){ const sels=['button[aria-label*="Next" i]','div[role="button"][aria-label*="Next" i]','svg[aria-label*="Next" i]']; for (const s of sels){ const el=document.querySelector(s); if (el){ el.dispatchEvent(new MouseEvent('click',{bubbles:true})); await sleep(300);} } }
async function waitForUrlChange(t=8000){ const s=Date.now(); const before=location.href; while(Date.now()-s<t){ if (location.href!==before) return true; await sleep(200);} return false; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }