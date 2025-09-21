
export const DB_KEY = 'chronoscroll.database';
export const SETTINGS_KEY = 'chronoscroll.settings';
export const SESSION_KEY = 'chronoscroll.session';
export const LOGIN_KEY = 'chronoscroll.login';

function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function get(key){ return new Promise(res => chrome.storage.local.get(key, v => res(v[key]))); }
async function set(obj){ return new Promise(res => chrome.storage.local.set(obj, res)); }

function extractVid(url){ try { const m = (url||'').match(/\/shorts\/([A-Za-z0-9_-]{5,})/); return m?m[1]:null; } catch{ return null; } }

export async function pushItem(item){
  const db = (await get(DB_KEY)) || [];
  if (!item.id) item.id = uid();
  if (!item.vid && item.url) item.vid = extractVid(item.url);
  const normalizedCaption = (item.caption||'').trim();
  const isDup = db.slice(-150).some(x => (x.vid && item.vid && x.vid===item.vid) || (x.url===item.url && (x.caption||'').trim()===normalizedCaption));
  let added=false;
  if (!isDup){ db.push(item); added=true; await set({[DB_KEY]: db}); } else { await set({[DB_KEY]: db}); }
  return {added, total: db.length};
}
export async function getDB(){ return (await get(DB_KEY)) || []; }
export async function clearDB(){ await set({[DB_KEY]: []}); }
export async function updateItem(id, patch){
  const db = (await get(DB_KEY)) || []; const i=db.findIndex(x=>x.id===id);
  if (i>=0){ db[i]=Object.assign({}, db[i], patch); await set({[DB_KEY]: db}); return true; } return false;
}
export async function deleteItem(id){
  const db = (await get(DB_KEY)) || []; const next = db.filter(x=>x.id!==id); await set({[DB_KEY]: next}); return next.length;
}

export async function getSettings(){
  const defaults = { platform:'youtube', autoscroll:false, delayMs: 900, minimized:true, appearance:{theme:'dark', density:'comfortable'}, categories:{}, aiKey: '' };
  const s = (await get(SETTINGS_KEY)) || {}; return Object.assign({}, defaults, s);
}
export async function saveSettings(s){ const cur = await getSettings(); await set({[SETTINGS_KEY]: Object.assign({}, cur, s)}); }

export async function getSession(){ return (await get(SESSION_KEY)) || {running:false}; }
export async function setSession(sess){ await set({[SESSION_KEY]: sess}); }

export async function getLogin(){ return (await get(LOGIN_KEY)) || null; }
export async function saveLogin(login){ const cur = (await get(LOGIN_KEY)) || {}; await set({[LOGIN_KEY]: Object.assign({}, cur, login)}); }

export const PRESET_TAGS = ['education','coding','fitness','cooking','tech','travel','comedy','music','finance','science','news','design','ai','history','math','diy','gaming','health','productivity','language'];
