
// storage.js
import {uid} from './utils.js';

export const DB_KEY = 'chronoscroll.database';
export const SETTINGS_KEY = 'chronoscroll.settings';
export const SESSION_KEY = 'chronoscroll.session';
export const LOGIN_KEY = 'chronoscroll.login';
export const PRESET_TAGS = ['education','coding','fitness','cooking','tech','travel','comedy','music','finance','science','news','design','ai','history','math','diy','gaming','health','productivity','language'];

export async function get(key) { return new Promise(res => chrome.storage.local.get(key, v => res(v[key]))); }
export async function set(obj) { return new Promise(res => chrome.storage.local.set(obj, res)); }

function ensureId(item){ if (!item.id) item.id = uid(); return item; }

export async function pushItem(item) {
  const db = (await get(DB_KEY)) || [];
  ensureId(item);
  const recent = db.slice(-5);
  if (!recent.find(x => x.url===item.url && (x.caption||'')===(item.caption||''))) db.push(item);
  await set({[DB_KEY]: db}); return db.length;
}

export async function getDB() { return (await get(DB_KEY)) || []; }
export async function clearDB() { await set({[DB_KEY]: []}); }

export async function updateItem(id, patch) {
  const db = (await get(DB_KEY)) || [];
  const idx = db.findIndex(x => x.id===id);
  if (idx >= 0) {
    db[idx] = Object.assign({}, db[idx], patch);
    await set({[DB_KEY]: db});
    return true;
  }
  return false;
}

export async function deleteItem(id) {
  const db = (await get(DB_KEY)) || [];
  const next = db.filter(x => x.id !== id);
  await set({[DB_KEY]: next});
  return next.length;
}

export async function getSettings() {
  const defaults = {
    platform: 'youtube',
    autoscroll: false,
    delayMs: 900,
    minimized: true,
    categories: {},
    appearance: { theme: 'dark', density: 'comfortable' }
  };
  const s = (await get(SETTINGS_KEY)) || {};
  return Object.assign({}, defaults, s);
}
export async function saveSettings(s) {
  const cur = await getSettings();
  await set({[SETTINGS_KEY]: Object.assign({}, cur, s)});
}

export async function saveLogin(login) {
  const cur = (await get(LOGIN_KEY)) || {};
  await set({[LOGIN_KEY]: Object.assign({}, cur, login)});
}
export async function getLogin() { return (await get(LOGIN_KEY)) || null; }

export async function setSession(sess) { await set({[SESSION_KEY]: sess}); }
export async function getSession() { return (await get(SESSION_KEY)) || {running:false}; }
