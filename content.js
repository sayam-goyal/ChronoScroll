// content.js — Grid runner with guaranteed save + robust storage wrappers + on-page counter
// Matches: https://www.instagram.com/reels/* and https://www.instagram.com/reel/*

let running = false;
let seenShortcodes = new Set();
let lastScrapedShortcode = null;
let gridCursor = 0;
let pendingTarget = null; // { shortcode, url }
let saveCount = 0;

/* ---------------- Storage helpers (promise-wrapped) ---------------- */
function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, (res) => resolve(res || {})));
}
function setLocal(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, () => resolve(true)));
}

/* ---------------- Minimal HUD so you can see saves ---------------- */
function ensureHud() {
  if (document.getElementById('__reels_hud')) return;
  const hud = document.createElement('div');
  hud.id = '__reels_hud';
  hud.style.cssText = `
    position: fixed; z-index: 2147483647; right: 8px; bottom: 8px;
    background: rgba(0,0,0,.7); color: #fff; padding: 6px 10px; border-radius: 8px;
    font: 12px/1.2 -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial;
    pointer-events: none;
  `;
  hud.textContent = 'Saved: 0';
  document.documentElement.appendChild(hud);
}
function bumpHud() {
  ensureHud();
  const hud = document.getElementById('__reels_hud');
  if (hud) hud.textContent = `Saved: ${saveCount}`;
}

/* ---------------- Messaging ---------------- */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') { sendResponse?.({ ok: true, running }); return; }
  if (msg?.type === 'CONTENT_PREPARE') {
    ensureOnGrid().then(() => sendResponse?.({ ok: true }))
      .catch(e => sendResponse?.({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === 'CONTENT_START' && !running) {
    running = true;
    autoLoop(msg.job).catch(console.error);
    sendResponse?.({ ok: true });
    return;
  }
  if (msg?.type === 'CONTENT_STOP') { running = false; sendResponse?.({ ok: true }); return; }
});

/* ====================== MAIN LOOP ====================== */

async function autoLoop(job) {
  const delayMs  = Math.max(220, Math.floor((job?.delaySec ?? 0.4) * 1000));
  const jitterMs = Math.max(0, Math.floor((job?.jitterSec ?? 0) * 1000));
  const maxCount = Math.max(1, job?.maxCount ?? 500);

  ensureHud();

  await ensureOnGrid(8000);
  gridCursor = await computeStartingCursor();

  // load previous count for HUD
  try {
    const { reels = [] } = await getLocal({ reels: [] });
    saveCount = Array.isArray(reels) ? reels.length : 0;
    bumpHud();
  } catch {}

  let collected = 0;
  while (running && collected < maxCount) {
    await ensureGridHasIndex(gridCursor);

    let anchors = await collectGridAnchors();
    let idx = gridCursor;

    while (idx < anchors.length && seenShortcodes.has(anchors[idx].shortcode)) idx++;

    if (idx >= anchors.length) {
      for (let i = 0; i < 4; i++) { await gridScrollDown(1800); await sleep(140); }
      anchors = await collectGridAnchors();
    }

    const candidate = anchors[idx];
    if (!candidate) {
      await hardReturnToGrid();
      gridCursor = await computeStartingCursor();
      await sleep(delayMs);
      continue;
    }

    // Record fallback BEFORE opening the reel
    pendingTarget = {
      shortcode: candidate.shortcode,
      url: `https://www.instagram.com/reel/${candidate.shortcode}`
    };

    // Open tile
    candidate.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait for reel viewer (or URL) to show
    const opened = await waitForReel(6000);
    if (!opened) {
      gridCursor = idx + 1;
      await gridScrollTileIntoView(gridCursor);
      await sleep(delayMs);
      continue;
    }

    // Give DOM a tick to hydrate
    await sleep(180);

    // Scrape (with fallback to pendingTarget if DOM is sparse)
    try {
      let data = scrapeNowOrFallback();
      if ((!data.shortcode || !isReelUrl(data.url))) {
        await sleep(200);
        data = scrapeNowOrFallback(); // quick retry
      }

      if (!data.shortcode && pendingTarget?.shortcode) {
        data.shortcode = pendingTarget.shortcode;
      }
      if (!isReelUrl(data.url) && pendingTarget?.url) {
        data.url = pendingTarget.url;
      }

      if (data.shortcode) {
        data.url = forceReelUrl(data.url || `https://www.instagram.com/reel/${data.shortcode}`);
        await upsertEntry(data);
        seenShortcodes.add(data.shortcode);
        lastScrapedShortcode = data.shortcode;
        collected++;
        saveCount++;
        bumpHud();
      }
    } catch (e) {
      if (pendingTarget?.shortcode) {
        await upsertEntry({
          shortcode: pendingTarget.shortcode,
          url: pendingTarget.url,
          caption: '',
          username: '',
          previewImage: '',
          collectedAt: new Date().toISOString(),
          source: 'instagram'
        });
        seenShortcodes.add(pendingTarget.shortcode);
        lastScrapedShortcode = pendingTarget.shortcode;
        collected++;
        saveCount++;
        bumpHud();
      }
    }

    // Exit viewer -> back to grid
    await exitViewerToGrid();

    // Rebuild anchors; set next cursor AFTER the last-scraped tile
    await waitForGrid(8000);
    anchors = await collectGridAnchors();

    let nextIdx = -1;
    if (lastScrapedShortcode) {
      const where = anchors.findIndex(a => a.shortcode === lastScrapedShortcode);
      if (where >= 0) nextIdx = where + 1;
    }
    if (nextIdx < 0) nextIdx = idx + 1;

    gridCursor = nextIdx;

    await ensureGridHasIndex(gridCursor);
    await gridScrollTileIntoView(gridCursor);

    const jitter = jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    await sleep(delayMs + jitter);

    if (!isGridUrl(location.href)) await hardReturnToGrid();
    pendingTarget = null;
  }

  running = false;
}

/* ====================== SCRAPE (hardened + fallback) ====================== */

function scrapeNowOrFallback() {
  const canonical = getCanonicalUrl() || normalizeUrl(location.href);
  const url = forceReelUrl(canonical);

  let shortcode = getShortcodeFromUrl(url) || getShortcodeFromAnyAnchor();
  if (!shortcode && pendingTarget?.shortcode) shortcode = pendingTarget.shortcode;

  const ogTitle = q('meta[property="og:title"]')?.content?.trim() || '';
  const ogDesc  = q('meta[property="og:description"]')?.content?.trim() || '';
  const ogImg   = q('meta[property="og:image"]')?.content?.trim() || '';

  let username = parseUsernameFromOgTitle(ogTitle)
              || usernameFromProfileAnchors()
              || usernameFromHeaderText()
              || '';

  let caption = extractCaptionFromOg(ogDesc)
             || extractCaptionFromJsonLd()
             || extractCaptionFromDom()
             || '';

  return {
    id: shortcode || null,
    shortcode: shortcode || null,
    url,
    caption,
    username,
    previewImage: ogImg || '',
    collectedAt: new Date().toISOString(),
    source: 'instagram'
  };
}

/* ====================== GRID HELPERS ====================== */

async function ensureOnGrid(timeoutMs = 8000) {
  if (!isGridUrl(location.href)) location.assign('https://www.instagram.com/reels/');
  const ok = await waitForGrid(timeoutMs);
  if (!ok) throw new Error('Could not open reels grid (login required?)');
}

async function waitForGrid(timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const tiles = document.querySelectorAll('a[href^="/reel/"], a[href^="/reels/"]');
    if (tiles.length > 0) return true;
    await sleep(100);
  }
  return false;
}

async function collectGridAnchors() {
  const nodes = [...document.querySelectorAll('a[href^="/reel/"], a[href^="/reels/"]')];
  const list = nodes.map(el => {
    const href = el.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
    return { el, url };
  }).filter(o => isReelUrl(o.url));

  const uniq = new Map();
  for (const it of list) {
    const sc = getShortcodeFromUrl(it.url);
    if (!sc) continue;
    const r = it.el.getBoundingClientRect();
    if (!uniq.has(sc)) uniq.set(sc, { ...it, shortcode: sc, y: r.top, x: r.left });
  }
  return [...uniq.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

async function ensureGridHasIndex(idx, maxScrolls = 30) {
  let anchors = await collectGridAnchors();
  let scrolls = 0;
  while (anchors.length <= idx && scrolls < maxScrolls) {
    await gridScrollDown(2000);
    await sleep(140);
    anchors = await collectGridAnchors();
    scrolls++;
  }
}

async function gridScrollDown(px = 1600) {
  const sc = document.scrollingElement || document.body;
  sc.scrollBy(0, px);
}

async function gridScrollTileIntoView(idx) {
  const anchors = await collectGridAnchors();
  const a = anchors[idx];
  if (a?.el?.scrollIntoView) a.el.scrollIntoView({ block: 'center' });
}

async function computeStartingCursor() {
  const anchors = await collectGridAnchors();
  if (!anchors.length) return 0;

  const sc = getShortcodeFromUrl(location.href);
  if (sc) {
    const i = anchors.findIndex(a => a.shortcode === sc);
    if (i >= 0) return i + 1;
  }

  const mid = (window.innerHeight || 800) / 2;
  let best = 0, bestAbs = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs((anchors[i].y ?? 0) - mid);
    if (d < bestAbs) { bestAbs = d; best = i; }
  }
  return best;
}

/* ====================== VIEWER HANDLING ====================== */

async function waitForReel(timeoutMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (isReelUrl(location.href)) return true;
    if (document.querySelector('div[role="dialog"] video')) return true; // overlay viewer
    await sleep(80);
  }
  return isReelUrl(location.href);
}

async function exitViewerToGrid() {
  const hadDialog = !!document.querySelector('div[role="dialog"]');
  if (hadDialog) { key('Escape', 27); await sleep(160); }
  if (!isGridUrl(location.href)) { history.back?.(); await sleep(200); }
  if (!isGridUrl(location.href)) await hardReturnToGrid();
}

async function hardReturnToGrid() {
  location.assign('https://www.instagram.com/reels/');
  await waitForGrid(8000);
}

/* ====================== HARDENED SCRAPE HELPERS ====================== */

function q(s) { return document.querySelector(s); }
function getCanonicalUrl() {
  const link = document.querySelector('link[rel="canonical"]')?.href;
  return link ? normalizeUrl(link) : null;
}
function normalizeUrl(u) {
  try { const url = new URL(u, 'https://www.instagram.com'); url.pathname = url.pathname.replace(/\/+$/, ''); return url.toString(); }
  catch { return u; }
}
function forceReelUrl(u) {
  try { const sc = getShortcodeFromUrl(u); return sc ? `https://www.instagram.com/reel/${sc}` : normalizeUrl(u); }
  catch { return normalizeUrl(u); }
}
function getShortcodeFromAnyAnchor() {
  const a = [...document.querySelectorAll('a[href*="/reel/"], a[href*="/reels/"]')]
    .map(x => x.getAttribute('href') || '')
    .map(h => h.startsWith('http') ? h : `https://www.instagram.com${h}`)
    .find(isReelUrl);
  return a ? getShortcodeFromUrl(a) : null;
}

function parseUsernameFromOgTitle(ogTitle) {
  if (!ogTitle) return '';
  const at = ogTitle.match(/@([A-Za-z0-9._]+)/);
  if (at) return at[1];
  const before = ogTitle.split(' on Instagram')[0];
  if (before && !/Instagram/i.test(before)) return before.trim();
  return '';
}
function usernameFromProfileAnchors() {
  const links = [...document.querySelectorAll('a[href^="/"][href$="/"]')];
  const candidates = links
    .map(a => ({ href: a.getAttribute('href') || '', text: a.textContent?.trim() || '', rect: a.getBoundingClientRect() }))
    .filter(o => /^\/[A-Za-z0-9._]+\/$/.test(o.href))
    .filter(o => !['reel','reels','explore','accounts','p'].includes(o.href.slice(1,-1).toLowerCase()))
    .sort((x,y) => x.rect.top - y.rect.top);
  const first = candidates[0];
  const val = first?.href?.replace(/\//g,'') || first?.text || '';
  return val.replace(/^@/, '');
}
function usernameFromHeaderText() {
  const scope = document.querySelector('div[role="dialog"] header') || document.querySelector('header') || document.body;
  const texts = [...scope.querySelectorAll('a, span, div')].map(n => n.textContent?.trim() || '').filter(Boolean);
  const hit = texts.find(t => /^@?[A-Za-z0-9._]{2,30}$/.test(t));
  return (hit || '').replace(/^@/, '');
}

function extractCaptionFromOg(text) {
  if (!text) return '';
  const after = text.split('Instagram:')[1] || text;
  const m = after.match(/[“"]([^”"]+)[”"]/);
  if (m && m[1]) return m[1].trim();
  return after.replace(/•.*$/, '').trim();
}
function extractCaptionFromJsonLd() {
  try {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      const t = s.textContent?.trim(); if (!t) continue;
      const obj = JSON.parse(t);
      if (obj) {
        if (typeof obj.caption === 'string' && obj.caption.trim()) return obj.caption.trim();
        if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
        if (Array.isArray(obj)) {
          for (const item of obj) {
            if (item?.caption) return String(item.caption).trim();
            if (item?.name) return String(item.name).trim();
          }
        }
      }
    }
  } catch {}
  return '';
}
function extractCaptionFromDom() {
  const scope = document.querySelector('div[role="dialog"]') || document.querySelector('main') || document.body;
  const markers = ['[data-testid*="caption" i]','[data-testid="reel_caption"]','h1[dir], h2[dir]'];
  for (const sel of markers) {
    const el = scope.querySelector(sel);
    const txt = el?.innerText?.trim();
    if (txt && txt.length > 5) return clipCaption(txt);
  }
  const spans = [...scope.querySelectorAll('span, div')]
    .map(el => ({ text: el.innerText?.trim() || '', rect: el.getBoundingClientRect() }))
    .filter(o => o.text && o.text.length >= 15)
    .filter(o => !/^Reply|Suggested|Following|Followers|View profile|Sign up|Log in|See translation|More/i.test(o.text))
    .sort((a,b) => a.rect.top - b.rect.top);
  return spans[0]?.text ? clipCaption(spans[0].text) : '';
}
function clipCaption(t, max = 3000) { t = t.replace(/\s{2,}/g,' ').trim(); return t.length > max ? t.slice(0,max) : t; }

/* ====================== UPSERT USING WRAPPERS ====================== */

async function upsertEntry(entry) {
  const doc = {
    shortcode: entry.shortcode,
    url: forceReelUrl(entry.url || `https://www.instagram.com/reel/${entry.shortcode}`),
    caption: entry.caption || '',
    username: entry.username || '',
    previewImage: entry.previewImage || '',
    collectedAt: entry.collectedAt || new Date().toISOString(),
    source: 'instagram'
  };
  if (!doc.shortcode) return;

  const store = await getLocal({ reels: [] });
  const reels = Array.isArray(store.reels) ? store.reels : [];
  const i = reels.findIndex(r => r.shortcode === doc.shortcode);
  if (i >= 0) reels[i] = { ...reels[i], ...doc };
  else reels.push(doc);
  await setLocal({ reels });
}

/* ====================== URL / KEYS / UTILS ====================== */

function isGridUrl(u) {
  try { return /^https:\/\/www\.instagram\.com\/reels\/?($|\?)/.test(u); } catch { return false; }
}
function isReelUrl(u) {
  try {
    const url = new URL(u, 'https://www.instagram.com');
    const p = url.pathname.replace(/\/+$/, '');
    if (/^\/audio\//.test(p)) return false;
    return /^\/reel\/[^/]+$/.test(p) || /^\/reels\/[^/]+$/.test(p);
  } catch { return false; }
}
function getShortcodeFromUrl(u) {
  try {
    const url = new URL(u, 'https://www.instagram.com');
    const parts = url.pathname.split('/').filter(Boolean);
    const ix = parts.indexOf('reels') >= 0 ? parts.indexOf('reels') : parts.indexOf('reel');
    if (ix >= 0 && parts[ix + 1]) return parts[ix + 1];
  } catch {}
  return null;
}
function key(k, codeNum) {
  try { window.focus(); document.activeElement?.blur?.(); document.body?.focus?.(); } catch {}
  const evKD = new KeyboardEvent('keydown', { key: k, code: k, keyCode: codeNum, which: codeNum, bubbles: true, cancelable: true });
  const evKU = new KeyboardEvent('keyup',   { key: k, code: k, keyCode: codeNum, which: codeNum, bubbles: true, cancelable: true });
  document.dispatchEvent(evKD); document.dispatchEvent(evKU);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
