
import {getDB, clearDB, getSettings, saveSettings, getLogin, saveLogin, updateItem, pushItem, PRESET_TAGS, deleteItem} from '../libs/storage.js';
import {downloadJSON} from '../libs/ui_utils.js';

const main = document.getElementById('main'); const nav = document.querySelector('.sidebar nav'); const boot = document.getElementById('boot'); const app = document.getElementById('app'); const brand = document.getElementById('brand');
function applyTheme(theme){ document.documentElement.setAttribute('data-theme', theme==='light'?'light':'dark'); }
window.addEventListener('load', async ()=>{ const s = await getSettings(); applyTheme(s.appearance?.theme || 'dark'); const login = await getLogin(); if (login?.email) brand.textContent = `CHRONOSCROLL — ${login.email}`; setTimeout(()=>{ boot.classList.add('hidden'); app.classList.remove('hidden'); route('dashboard'); }, 900); });
nav.addEventListener('click', (e)=>{ const btn = e.target.closest('button[data-route]'); if (!btn) return; nav.querySelectorAll('button').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); route(btn.dataset.route); });
function route(name){ switch(name){ case 'dashboard': return renderDashboard(); case 'onboarding': return renderOnboarding(); case 'add': return renderAddItem(); case 'search': return renderSearch(); case 'settings': return renderSettings(); case 'export': return renderExport(); case 'bulk': return renderBulk(); case 'about': return renderAbout(); case 'login': return renderLogin(); } }

async function renderDashboard(){
  const db = await getDB(); const s = await getSettings(); const counts = db.reduce((a,x)=>{a[x.platform]=(a[x.platform]||0)+1; return a;},{});
  main.innerHTML = `
    <div class="grid cols-3">
      <div class="card"><h3>Quick Start</h3><p>Open the popup and click <span class="badge">START ▶</span>. Auto-scroll ${s.platform==='youtube'?'Shorts':'Reels'} every <b>${s.delayMs}</b> ms.</p>
      <p>Autostart: <b>${s.autoscroll ? 'on' : 'off'}</b></p></div>
      <div class="card"><h3>Totals</h3><div class="grid cols-2" style="margin-top:8px;"><div class="badge">All: ${db.length}</div><div class="badge">YouTube: ${counts.youtube||0}</div><div class="badge">Instagram: ${counts.instagram||0}</div></div></div>
      <div class="card"><h3>Exports</h3><div class="grid cols-2" style="margin-top:8px;"><button class="button" id="exportAll">Export All JSON</button><button class="button" id="exportIG">Export Instagram JSON</button></div></div>
    </div>
    <div class="card" style="margin-top:14px;">
      <h3>Latest Captures</h3>
      <table class="table"><thead><tr><th></th><th>When</th><th>Platform</th><th>User</th><th>Caption</th><th>Tags</th><th>URL</th></tr></thead>
      <tbody id="rows">${db.slice(-20).reverse().map(item=>`
        <tr data-id="${item.id||''}"><td><button class="iconbtn trash" title="Delete"></button></td><td>${new Date(item.timestamp).toLocaleString()}</td><td>${item.platform}</td><td>${item.username||'-'}</td><td>${(item.caption||'').slice(0,120)}</td><td>${(item.tags||[]).slice(0,5).join(', ')}</td><td><a href="${item.url}" target="_blank">open</a></td></tr>`).join('')}</tbody></table>
    </div>`;
  document.getElementById('exportAll').addEventListener('click', async ()=>{ const all = await getDB(); downloadJSON(`chronoscroll-all-${Date.now()}.json`, all); });
  document.getElementById('exportIG').addEventListener('click', async ()=>{ const ig = (await getDB()).filter(x=>x.platform==='instagram'); downloadJSON(`chronoscroll-instagram-${Date.now()}.json`, ig); });
  document.getElementById('rows').addEventListener('click', async (e)=>{ const btn = e.target.closest('.trash'); if (!btn) return; const tr = btn.closest('tr'); const id = tr.dataset.id; await deleteItem(id); renderDashboard(); });
}

function tagCheckbox(id, checked){ return `<label class="checkbox-row"><input type="checkbox" data-tag="${id}" ${checked?'checked':''}/> <span>${id}</span></label>`; }
async function renderAddItem(){
  const s = await getSettings();
  main.innerHTML = `
    <div class="card"><h3>Add Reel/Short Manually</h3><p>Paste a direct URL to an Instagram Reel or YouTube Short. Optionally fill in username and caption. Choose tags below or add custom tags (comma-separated).</p>
      <div class="grid cols-2" style="gap:10px;">
        <label>URL <input type="text" id="url" placeholder="https://www.instagram.com/reel/... or https://www.youtube.com/shorts/..."/></label>
        <label>Username <input type="text" id="user" placeholder="optional"/></label>
      </div>
      <label>Caption <textarea id="cap" placeholder="optional"></textarea></label>
      <div class="grid cols-3" id="tagsBox" style="margin-top:8px;">${PRESET_TAGS.map(t=>tagCheckbox(t,false)).join('')}</div>
      <label style="margin-top:8px;">Custom tags <input type="text" id="custom" placeholder="comma-separated"/></label>
      <div style="margin-top:10px;"><button class="button primary" id="save">Add to Database</button></div>
    </div>`;
  document.getElementById('save').addEventListener('click', async ()=>{
    const url = (document.getElementById('url').value||'').trim(); if (!url) return alert('Please paste a URL.');
    const username = (document.getElementById('user').value||'').trim()||null; const caption = (document.getElementById('cap').value||'').trim()||null;
    const checks = Array.from(document.querySelectorAll('input[data-tag]:checked')).map(c=>c.dataset.tag);
    const custom = (document.getElementById('custom').value||'').split(',').map(t=>t.trim().toLowerCase()).filter(Boolean);
    const tags = [...new Set([...checks, ...custom])];
    const platform = url.includes('youtube.com') ? 'youtube' : (url.includes('instagram.com') ? 'instagram' : s.platform);
    await pushItem({platform, url, username, caption, timestamp: Date.now(), tags}); alert('Added.');
  });
}

async function renderSettings(){
  const s = await getSettings();
  main.innerHTML = `
    <div class="grid cols-2">
      <div class="card"><h3>Appearance</h3>
        <label>Theme
          <select id="theme">
            <option value="dark" ${s.appearance.theme==='dark'?'selected':''}>Dark</option>
            <option value="light" ${s.appearance.theme==='light'?'selected':''}>Light</option>
          </select>
        </label>
        <label style="margin-top:8px;">Density
          <select id="density">
            <option value="comfortable" ${s.appearance.density==='comfortable'?'selected':''}>Comfortable</option>
            <option value="compact" ${s.appearance.density==='compact'?'selected':''}>Compact</option>
          </select>
        </label>
        <div style="margin-top:10px;"><button class="button" id="saveAppearance">Save</button></div>
      </div>
      <div class="card"><h3>Autoscroll</h3>
        <label>Default Platform
          <select id="platform">
            <option value="youtube" ${s.platform==='youtube'?'selected':''}>YouTube Shorts</option>
            <option value="instagram" ${s.platform==='instagram'?'selected':''}>Instagram Reels</option>
          </select>
        </label>
        <label style="margin-top:8px;">Delay (ms)
          <input type="number" id="delay" min="250" step="50" value="${s.delayMs}"/>
        </label>
        <label class="checkbox-row" style="margin-top:8px;"><input type="checkbox" id="minimized" ${s.minimized?'checked':''}/> Run in minimized window</label>
        <label class="checkbox-row"><input type="checkbox" id="autoscroll" ${s.autoscroll?'checked':''}/> Autostart on browser launch</label>
        <div style="margin-top:10px;"><button class="button primary" id="saveScroll">Save</button></div>
      </div>
    </div>`;
  document.getElementById('saveAppearance').addEventListener('click', async ()=>{
    const theme = document.getElementById('theme').value; const density = document.getElementById('density').value;
    await saveSettings({appearance:{theme, density}}); applyTheme(theme); alert('Saved!');
  });
  document.getElementById('saveScroll').addEventListener('click', async ()=>{
    const platform = document.getElementById('platform').value; const delay = Number(document.getElementById('delay').value); const minimized = document.getElementById('minimized').checked; const autoscroll = document.getElementById('autoscroll').checked;
    await saveSettings({platform, delayMs: delay, minimized, autoscroll}); alert('Saved!');
  });
}

async function renderExport(){
  const db = await getDB();
  main.innerHTML = `
    <div class="card"><h3>Export</h3><p>Download your database as JSON, or Instagram-only.</p>
      <div class="grid cols-3" style="margin-top:8px;"><button class="button" id="exportAll">Download All JSON</button><button class="button" id="exportIG">Instagram JSON</button><button class="button" id="clear">Clear Database</button></div>
    </div>
    <div class="card" style="margin-top:14px;">
      <h3>Preview (last 50)</h3>
      <table class="table"><thead><tr><th></th><th>When</th><th>Platform</th><th>User</th><th>Caption</th><th>Tags</th><th>URL</th><th>Add Tag</th></tr></thead>
      <tbody id="rows"></tbody></table>
    </div>`;
  document.getElementById('exportAll').addEventListener('click', ()=> downloadJSON(`chronoscroll-all-${Date.now()}.json`, db));
  document.getElementById('exportIG').addEventListener('click', ()=> downloadJSON(`chronoscroll-instagram-${Date.now()}.json`, db.filter(x=>x.platform==='instagram')));
  document.getElementById('clear').addEventListener('click', async ()=>{ if (confirm('Clear all captured items?')) { await clearDB(); renderExport(); } });
  const rows = document.getElementById('rows');
  rows.innerHTML = db.slice(-50).reverse().map(item=>`
    <tr data-id="${item.id||''}">
      <td><button class="iconbtn trash" title="Delete"></button></td>
      <td>${new Date(item.timestamp).toLocaleString()}</td>
      <td>${item.platform}</td>
      <td>${item.username||'-'}</td>
      <td>${(item.caption||'').slice(0,200)}</td>
      <td>${(item.tags||[]).slice(0,8).join(', ')}</td>
      <td><a href="${item.url}" target="_blank">open</a></td>
      <td><input type="text" class="tagedit" placeholder="add tag…"/><button class="button tagadd">Add Tag</button></td>
    </tr>`).join('');
  rows.addEventListener('click', async (e)=>{
    const del = e.target.closest('.trash'); if (del) { const tr = del.closest('tr'); await deleteItem(tr.dataset.id); return renderExport(); }
    const btn = e.target.closest('.tagadd'); if (!btn) return;
    const tr = btn.closest('tr'); const id = tr.dataset.id;
    const inp = tr.querySelector('.tagedit'); const tag = (inp.value||'').trim().toLowerCase(); if (!tag) return;
    const db2 = await getDB(); const it = db2.find(x=>x.id===id); if (!it) return;
    const tags = [...new Set([...(it.tags||[]), tag])]; await updateItem(id, {tags}); renderExport();
  });
}

async function renderBulk(){
  const s = await getSettings();
  main.innerHTML = `
    <div class="card"><h3>Bulk Crawl from JSON</h3><p>Import a JSON list of URLs (either <code>["url1","url2"]</code> or <code>{ "urls": ["url1","url2"] }</code>). ChronoScroll opens a minimized window, loads each URL, scrapes, and saves.</p>
      <div class="grid cols-3"><input type="file" id="file" accept=".json"/><select id="platform"><option value="youtube" ${s.platform==='youtube'?'selected':''}>YouTube Shorts</option><option value="instagram" ${s.platform==='instagram'?'selected':''}>Instagram Reels</option></select><input type="number" id="delay" min="250" step="50" value="${s.delayMs}" /></div>
      <div style="margin-top:10px;"><button class="button primary" id="start">Start Bulk Crawl</button></div>
    </div>`;
  document.getElementById('start').addEventListener('click', async ()=>{
    const f = document.getElementById('file').files[0]; if (!f) return alert('Pick a JSON file of URLs');
    const platform = document.getElementById('platform').value; const delay = Number(document.getElementById('delay').value)||900;
    const txt = await f.text(); let js; try { js = JSON.parse(txt); } catch { return alert('Invalid JSON'); }
    const urls = Array.isArray(js) ? js : (Array.isArray(js.urls)?js.urls:[]); if (!urls.length) return alert('No URLs found in JSON.');
    chrome.runtime.sendMessage({type:'BULK_SCRAPE_START', payload:{urls, platform, delayMs: delay, minimized:true}}, (resp)=>{
      if (!resp?.ok) alert('Failed: ' + (resp?.error||'unknown')); else alert('Bulk crawl started for '+urls.length+' URLs.');
    });
  });
}

async function renderSearch(){
  const db = await getDB();
  main.innerHTML = `
    <div class="card"><h3>Search</h3>
      <div class="grid cols-3" style="gap:10px; margin-top:8px;"><input type="text" id="q" placeholder="username, caption, tags... (space-separated terms)"/><select id="platform"><option value="">All</option><option value="youtube">YouTube</option><option value="instagram">Instagram</option></select><button class="button" id="go">Search</button></div>
    </div>
    <div id="results" class="card" style="margin-top:14px;">
      <h3>Results</h3>
      <table class="table"><thead><tr><th></th><th>When</th><th>Platform</th><th>User</th><th>Caption</th><th>Tags</th><th>URL</th><th>Add Tag</th></tr></thead><tbody id="rows"></tbody></table>
    </div>`;
  const qEl = document.getElementById('q'); const pEl = document.getElementById('platform'); const rows = document.getElementById('rows');
  function run(){
    const q = qEl.value.toLowerCase().trim(); const pf = pEl.value; const terms = q.split(/\s+/).filter(Boolean);
    const res = db.filter(x => { if (pf && x.platform!==pf) return false;
      const hay = `${(x.username||'').toLowerCase()} ${(x.caption||'').toLowerCase()} ${(x.tags||[]).join(' ')}`; return terms.every(t => hay.includes(t)); });
    rows.innerHTML = res.slice(0,400).map(item=>`
      <tr data-id="${item.id||''}"><td><button class="iconbtn trash" title="Delete"></button></td><td>${new Date(item.timestamp).toLocaleString()}</td><td>${item.platform}</td><td>${item.username||'-'}</td><td>${(item.caption||'').slice(0,200)}</td><td>${(item.tags||[]).slice(0,8).join(', ')}</td><td><a href="${item.url}" target="_blank">open</a></td><td><input type="text" class="tagedit" placeholder="add tag…"/><button class="button tagadd">Add</button></td></tr>`).join('');
  }
  document.getElementById('go').addEventListener('click', run);
  qEl.addEventListener('keydown', e=>{ if (e.key==='Enter') run(); });
  rows.addEventListener('click', async (e)=>{
    const del = e.target.closest('.trash'); if (del) { const tr = del.closest('tr'); await deleteItem(tr.dataset.id); return run(); }
    const btn = e.target.closest('.tagadd'); if (!btn) return; const tr = btn.closest('tr'); const id = tr.dataset.id;
    const inp = tr.querySelector('.tagedit'); const tag = (inp.value||'').trim().toLowerCase(); if (!tag) return;
    const db2 = await getDB(); const it = db2.find(x=>x.id===id); if (!it) return; const tags = [...new Set([...(it.tags||[]), tag])];
    await updateItem(id, {tags}); run();
  });
  run();
}

async function renderAbout(){ main.innerHTML = `<div class="card"><h2>About ChronoScroll</h2><p>Voxel-styled research helper. Auto-scrolls Shorts/Reels or bulk-scrapes a list of URLs in a minimized window, then logs public <b>username</b>, <b>caption</b>, <b>URL</b>, and <b>tags</b>.</p></div>`; }

async function renderOnboarding(){
  const s = await getSettings(); const cats = Object.assign({education:false,coding:false,fitness:false,cooking:false,tech:false,travel:false,comedy:false,music:false}, s.categories||{});
  main.innerHTML = `
    <div class="grid cols-2">
      <div class="card"><h2>Welcome</h2><p>ChronoScroll auto-scrolls Shorts/Reels and logs <b>username</b>, <b>caption</b>, <b>URL</b>, and extracted <b>tags</b>. You can also add items manually or bulk crawl from a JSON list.</p>
        <ol><li>Open the <b>popup</b> and choose platform.</li><li>Set delay (800–1500ms recommended).</li><li>Click <b>START ▶</b>.</li></ol></div>
      <div class="card"><h3>Your Interests</h3><div id="catList" class="grid cols-2" style="margin-top:8px;">
        ${Object.entries(cats).map(([k,v])=>`<label class="checkbox-row"><input type="checkbox" data-cat="${k}" ${v?'checked':''}/> <span>${k}</span></label>`).join('')}</div>
        <div style="margin-top:10px;"><button class="button primary" id="saveCats">Save Preferences</button></div>
      </div>
    </div>`;
  document.getElementById('saveCats').addEventListener('click', async ()=>{
    const checks = Array.from(document.querySelectorAll('input[data-cat]')); const categories = {}; checks.forEach(c => categories[c.dataset.cat] = c.checked);
    await saveSettings({categories}); alert('Saved!');
  });
}

async function renderLogin(){
  const login = await getLogin(); const email = login?.email || ''; const name = login?.name || '';
  main.innerHTML = `<div class="card"><h3>Login (Local)</h3><p>Local-only login to persist preferences. No data leaves your device.</p>
    <label>Name <input type="text" id="name" value="${name}" placeholder="your name"/></label>
    <label style="margin-top:8px;">Email <input type="email" id="email" value="${email}" placeholder="you@example.com"/></label>
    <div style="margin-top:10px;" class="grid cols-2"><button class="button primary" id="save">Sign In / Save</button><button class="button" id="logout">Sign Out</button></div></div>`;
  document.getElementById('save').addEventListener('click', async ()=>{
    const nameVal = document.getElementById('name').value.trim(); const emailVal = document.getElementById('email').value.trim();
    await saveLogin({name: nameVal, email: emailVal, loggedIn: true, savedAt: Date.now()}); brand.textContent = `CHRONOSCROLL — ${emailVal||nameVal||'user'}`; alert('Saved!');
  });
  document.getElementById('logout').addEventListener('click', async ()=>{ await saveLogin({name:'', email:'', loggedIn:false}); brand.textContent = 'CHRONOSCROLL'; alert('Signed out.'); });
}
