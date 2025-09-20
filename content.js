// Injected on https://www.instagram.com/reels/* and /reel/*
let running = false;
let seenShortcodes = new Set();
let lastGoodReelUrl = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PING') { sendResponse?.({ ok: true, running }); return; }
  if (msg?.type === 'CONTENT_PREPARE') {
    openFirstReelIfOnGrid().then(() => sendResponse?.({ ok: true }))
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

/* -------------------- PREP -------------------- */
async function openFirstReelIfOnGrid() {
  const isGrid = /https:\/\/www\.instagram\.com\/reels\/?($|\?)/.test(location.href);
  if (!isGrid) return;
  await sleep(400);
  const first = collectReelAnchors()[0]?.url;
  if (first && first !== location.href) {
    location.assign(first);
    await waitForReel(8000);
  }
}

async function autoLoop(job) {
  const delayMs  = Math.max(250, job?.delayMs || 1000); // default 1s
  const jitterMs = Math.max(0, job?.jitterMs || 0);
  const maxCount = Math.max(1, job?.maxCount || 200);

  await ensureOnValidReel(8000);

  let collected = 0;
  while (running && collected < maxCount) {
    forceViewerFocus();

    const beforeShortcode = getShortcodeFromUrl(location.href);

    // SCRAPE (once per shortcode)
    try {
      const data = scrapeCurrent();
      if (data?.shortcode && isReelUrl(data.url) && !seenShortcodes.has(data.shortcode)) {
        seenShortcodes.add(data.shortcode);
        await saveEntry(data);
        collected++;
        lastGoodReelUrl = data.url;
      }
    } catch (e) { console.warn('Scrape error', e); }

    // MOVE — staged with pointer swipe fallback
    const moved = await moveNextWithSwipe(beforeShortcode, 8000);
    if (!moved) {
      // Recover then try a strict hop
      await recoverToReel(6000);
      const hopped = await hopToNextByIndex(beforeShortcode, 6000);
      if (!hopped) await aggressiveNudge();
    }

    const jitter = jitterMs ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
    await sleep(delayMs + jitter);
  }
  running = false;
}

/* -------------------- MOVE: keys → wheel → swipe → strict hop -------------------- */
async function moveNextWithSwipe(prevShortcode, totalMs = 8000) {
  const budget = deadline(totalMs);

  // 0) next chevron (if present in this layout)
  if (await clickNextChevronOnly(prevShortcode, 300)) return true;

  // 1) Keys
  for (let i = 0; i < 3 && !budget.elapsed(); i++) {
    key('ArrowDown', 40);
    if (await waitForShortcodeChange(prevShortcode, 260)) return true;
  }
  for (let i = 0; i < 2 && !budget.elapsed(); i++) {
    key('PageDown', 34);
    if (await waitForShortcodeChange(prevShortcode, 260)) return true;
  }

  // 2) Wheel
  const scroller = findScrollableContainer();
  if (scroller) {
    for (let i = 0; i < 4 && !budget.elapsed(); i++) {
      scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 1100, bubbles: true, cancelable: true }));
      if (await waitForShortcodeChange(prevShortcode, 220)) return true;
    }
  }

  // 3) Pointer swipe (drag up) on the reel viewer
  const target = findSwipeTarget() || scroller || document.body;
  for (let i = 0; i < 2 && !budget.elapsed(); i++) {
    await swipeUp(target, { distance: 420, duration: 220 });
    if (await waitForShortcodeChange(prevShortcode, 400)) return true;
  }

  // 4) Strict DOM hop (click next visible reel tile)
  if (!budget.elapsed()) {
    const hopped = await clickNextAnchorHop(prevShortcode, Math.max(500, budget.left()));
    if (hopped) return true;
  }

  return false;
}

async function clickNextChevronOnly(prevShortcode, timeoutMs = 300) {
  const selectors = [
    'button[aria-label*="Next" i]',
    'div[role="button"][aria-label*="Next" i]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const ok = await waitForShortcodeChange(prevShortcode, timeoutMs);
      if (ok) return true;
    }
  }
  return false;
}

async function clickNextAnchorHop(prevShortcode, timeoutMs) {
  const anchors = collectReelAnchors();
  if (!anchors.length) return false;

  const idxInList = anchors.findIndex(a => a.shortcode === prevShortcode);
  const idx = idxInList >= 0 ? idxInList : nearestIndexToViewport(anchors);

  const candidate = anchors[idx + 1] || anchors[idx + 2];
  if (candidate?.el) {
    candidate.el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const ok = await waitForShortcodeChange(prevShortcode, timeoutMs);
    return ok;
  }
  return false;
}

async function hopToNextByIndex(prevShortcode, timeoutMs) {
  const anchors = collectReelAnchors();
  if (!anchors.length) return false;
  const idxInList = anchors.findIndex(a => a.shortcode === prevShortcode);
  const idx = idxInList >= 0 ? idxInList : nearestIndexToViewport(anchors);
  const next = anchors[idx + 1] || anchors[idx + 2];
  if (next?.url && next.url !== location.href) {
    location.assign(next.url);
    return await waitForShortcodeChange(prevShortcode, timeoutMs);
  }
  return false;
}

/* -------------------- Pointer swipe (drag up) -------------------- */
async function swipeUp(el, { distance = 420, duration = 240 } = {}) {
  if (!el) el = document.body;
  const rect = (el.getBoundingClientRect?.() || { left: 0, top: 0, width: innerWidth, height: innerHeight });
  const startX = Math.round(rect.left + rect.width / 2);
  const startY = Math.round(rect.top + rect.height * 0.60);
  const endY   = Math.max(0, startY - distance);

  // Prefer PointerEvents; fall back to MouseEvents
  const hasPointer = 'PointerEvent' in window;

  const dispatch = (type, x, y) => {
    const opts = { clientX: x, clientY: y, bubbles: true, cancelable: true };
    if (hasPointer) {
      el.dispatchEvent(new PointerEvent(type, { ...opts, pointerId: 1, pointerType: 'touch', isPrimary: true, pressure: type === 'pointerup' ? 0 : 0.5 }));
    } else {
      const map = { pointerdown: 'mousedown', pointermove: 'mousemove', pointerup: 'mouseup' };
      el.dispatchEvent(new MouseEvent(map[type] || type, opts));
    }
  };

  // sequence
  dispatch('pointerdown', startX, startY);
  const steps = Math.max(4, Math.floor(duration / 16));
  for (let i = 1; i <= steps; i++) {
    const y = Math.round(startY + (endY - startY) * (i / steps));
    dispatch('pointermove', startX, y);
    await sleep(duration / steps);
  }
  dispatch('pointerup', startX, endY);
}

/* -------------------- Guards & Recovery -------------------- */
async function ensureOnValidReel(timeoutMs = 8000) {
  const ok = await waitForReel(timeoutMs);
  if (!ok && lastGoodReelUrl) {
    location.assign(lastGoodReelUrl);
    await waitForReel(timeoutMs);
  }
}

async function recoverToReel(timeoutMs = 6000) {
  history.back?.();
  if (await waitForReel(800)) return true;

  key('Escape', 27);
  await sleep(120);
  const scroller = findScrollableContainer();
  if (scroller) {
    for (let i = 0; i < 3; i++) {
      scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 900, bubbles: true, cancelable: true }));
      if (await waitForReel(260)) return true;
      await sleep(120);
    }
  }

  if (lastGoodReelUrl) {
    location.assign(lastGoodReelUrl);
    if (await waitForReel(timeoutMs)) return true;
  }

  const any = collectReelAnchors()[0]?.url;
  if (any) { location.assign(any); return await waitForReel(timeoutMs); }
  return false;
}

/* -------------------- Scraping -------------------- */
function scrapeCurrent() {
  const url = location.href;
  const shortcode = getShortcodeFromUrl(url);
  const ogDesc  = document.querySelector('meta[property="og:description"]')?.content || '';
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
  const ogImg   = document.querySelector('meta[property="og:image"]')?.content || '';
  const username = (ogTitle || '').split(' on Instagram')[0] || guessUsernameFromPage() || '';
  let caption = extractCaptionFromOg(ogDesc);
  if (!caption) {
    try {
      const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(s => s.textContent.trim())
        .map(t => { try { return JSON.parse(t); } catch { return null; } })
        .find(obj => obj && (obj.caption || obj.name));
      caption = jsonLd?.caption || jsonLd?.name || '';
    } catch {}
  }
  if (!caption) caption = findLargestVisibleSpan(160);
  return { id: shortcode, shortcode, url, caption: caption || '', username: username || '', previewImage: ogImg || '', collectedAt: new Date().toISOString(), source: 'instagram' };
}

/* -------------------- DOM helpers -------------------- */
function collectReelAnchors() {
  const list = [...document.querySelectorAll('a[href]')].map(el => {
    const href = el.getAttribute('href') || '';
    const url = href.startsWith('http') ? href : `https://www.instagram.com${href}`;
    return { el, url };
  }).filter(o => isReelUrl(o.url));

  const enriched = list.map(o => {
    const r = o.el.getBoundingClientRect();
    return { ...o, y: r.top, shortcode: getShortcodeFromUrl(o.url) };
  });

  const uniq = new Map();
  for (const it of enriched) if (it.shortcode) uniq.set(it.shortcode, it);
  return [...uniq.values()].sort((a, b) => a.y - b.y);
}

function nearestIndexToViewport(items) {
  let best = 0, bestAbs = Infinity;
  for (let i = 0; i < items.length; i++) {
    const d = Math.abs(items[i].y);
    if (d < bestAbs) { bestAbs = d; best = i; }
  }
  return best;
}

function forceViewerFocus() {
  try {
    const candidates = [
      'div[role="dialog"]',
      'section main',      // common wrapper
      'video',             // focusing the video helps on this layout
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) { el.focus?.(); break; }
    }
    document.body?.focus?.();
  } catch {}
}

/* -------------------- Utilities -------------------- */
function isReelUrl(u) {
  try {
    const url = new URL(u);
    const p = url.pathname.replace(/\/+$/, '');
    if (/^\/audio\//.test(p)) return false;
    return /^\/reel\/[^/]+$/.test(p) || /^\/reels\/[^/]+$/.test(p);
  } catch { return false; }
}
function getShortcodeFromUrl(u) {
  try {
    const url = new URL(u);
    const parts = url.pathname.split('/').filter(Boolean);
    const ix = parts.indexOf('reels') >= 0 ? parts.indexOf('reels') : parts.indexOf('reel');
    if (ix >= 0 && parts[ix + 1]) return parts[ix + 1];
  } catch {}
  return null;
}
function extractCaptionFromOg(text) {
  if (!text) return '';
  const after = text.split('Instagram:')[1] || '';
  const m = after.match(/[“"]([^”"]+)[”"]/);
  return m ? m[1] : after.trim();
}
function guessUsernameFromPage() {
  const a = [...document.querySelectorAll('header a[role="link"], a[href*="/reel/"], a[href^="/reels/"]')]
    .find(el => el.textContent?.trim()?.length > 0);
  return a?.textContent?.trim() || '';
}
function findLargestVisibleSpan(minLength = 120) {
  const spans = [...document.querySelectorAll('span[dir], h1, h2, div[role="button"] span')];
  const vis = spans.map(el => ({ el, text: el.innerText?.trim() || '' }))
                   .filter(o => o.text && o.text.length >= minLength)
                   .sort((a, b) => b.text.length - a.text.length);
  return vis[0]?.text || '';
}
async function saveEntry(entry) {
  const store = await chrome.storage.local.get({ reels: [] });
  const reels = store.reels || [];
  if (!reels.find(r => r.shortcode === entry.shortcode)) {
    reels.push(entry);
    await chrome.storage.local.set({ reels });
  }
}
function key(k, codeNum) {
  try { window.focus(); document.activeElement?.blur?.(); document.body?.focus?.(); } catch {}
  const evKD = new KeyboardEvent('keydown', { key: k, code: k, keyCode: codeNum, which: codeNum, bubbles: true, cancelable: true });
  const evKU = new KeyboardEvent('keyup',   { key: k, code: k, keyCode: codeNum, which: codeNum, bubbles: true, cancelable: true });
  document.dispatchEvent(evKD); document.dispatchEvent(evKU);
}
function findScrollableContainer() {
  return (
    document.querySelector('div[role="dialog"]') ||
    document.querySelector('main') ||
    document.scrollingElement ||
    document.body
  );
}
async function waitForShortcodeChange(prevShortcode, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const sc = getShortcodeFromUrl(location.href);
    if (sc && sc !== prevShortcode && isReelUrl(location.href)) return true;
    await sleep(120);
  }
  return false;
}
async function waitForReel(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isReelUrl(location.href)) return true;
    await sleep(120);
  }
  return false;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function deadline(ms) {
  const t0 = Date.now();
  return { left: () => Math.max(0, ms - (Date.now() - t0)), elapsed: () => Date.now() - t0 >= ms };
}
