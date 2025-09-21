
(function(){
  const U = window.Utils || {};
  let RUNNING = false, TICK = 900, lastUrl = null, sameCount = 0, busy = false;

  function isOnGrid(){ return location.pathname.replace(/\/+$/,'') === '/shorts'; }
  function openFirstShortIfGrid(){
    try{
      if (isOnGrid()){
        const first = document.querySelector('a.yt-simple-endpoint[href^="/shorts/"], ytd-reel-shelf-renderer a#thumbnail');
        if (first){ first.click(); return true; }
      }
      const gridItem = document.querySelector('ytd-reel-item-renderer a#thumbnail');
      if (gridItem){ gridItem.click(); return true; }
    } catch(e){} return false;
  }
  function scrapeNow(){
    const info = { platform:'youtube', url: location.href, timestamp: Date.now(), username:null, caption:null, tags:[] };
    try{
      const ogd = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
      const ogt = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
      if (ogd) info.caption = ogd; if (!info.caption && ogt) info.caption = ogt;
      const header = document.querySelector('ytd-reel-player-header-renderer');
      if (header){
        const user = header.querySelector('a[href^="/@"], a[href^="/channel/"]'); if (user) info.username = user.textContent.trim();
        const desc = header.querySelector('#description, yt-formatted-string[slot="description"]'); if (desc) info.caption = desc.textContent.trim() || info.caption;
      }
      if (!info.caption){ const d2 = document.querySelector('#shorts-description, #description-inline-expander, .shorts-description'); if (d2) info.caption = d2.textContent.trim(); }
      info.tags = U.extractHashtags(info.caption || '');
    }catch(e){} return info;
  }
  async function advanceOnce(){
    const nextBtn = document.querySelector('ytd-shorts button[aria-label*="Next"], button[aria-label="Next video"], #navigation-button-down'); if (nextBtn) nextBtn.click();
    U.dispatchKey(document.body, 'ArrowDown'); U.dispatchKey(document.body, 'j', 'KeyJ'); await U.sleep(30); U.wheelScroll(document.body, 1100);
  }
  function progressed(){ const cur = location.href; if (cur===lastUrl) sameCount++; else sameCount=0; lastUrl=cur; return sameCount===0; }
  async function loop(){
    if (!RUNNING || busy) return; busy = true;
    openFirstShortIfGrid();
    const data = scrapeNow(); U.scrapeSend(data);
    await advanceOnce(); await U.sleep(Math.max(200, TICK*0.35));
    if (!progressed()){ U.dispatchKey(window,'ArrowDown'); U.dispatchKey(window,'j','KeyJ'); const btn=document.querySelector('button[aria-label="Next video"], #navigation-button-down'); if (btn) btn.click(); U.wheelScroll(document.body, 1600); await U.sleep(180); }
    if (sameCount>=3){ location.reload(); sameCount=0; }
    busy=false; if (RUNNING) setTimeout(loop, TICK);
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond)=>{
    if (msg?.type === 'CONTENT_START' && (msg.payload?.platform === 'youtube' || msg.payload==null)){
      RUNNING = true; TICK = Math.max(250, Number(msg.payload?.delayMs || 900));
      lastUrl = null; sameCount = 0; busy = false; setTimeout(loop, 320);
      respond && respond({ok:true}); return true;
    }
    if (msg?.type === 'CONTENT_STOP'){ RUNNING=false; respond && respond({ok:true}); return true; }
    if (msg?.type === 'SCRAPE_EXTRACT'){ try { openFirstShortIfGrid(); const data = scrapeNow(); respond && respond({ok:true, data}); } catch(e){ respond && respond({ok:false, error:String(e)}); } return true; }
    if (msg?.type === 'SCRAPE_ONCE'){ try { openFirstShortIfGrid(); const data = scrapeNow(); U.scrapeSend(data); respond && respond({ok:true}); } catch(e){ respond && respond({ok:false, error:String(e)}); } return true; }
    if (msg?.type === 'PING'){ respond && respond({ok:true}); return true; }
  });

  setTimeout(()=>{
    try { chrome.runtime.sendMessage({type:'GET_SESSION'}, (resp)=>{ const s=resp?.data; if (s?.running && s.platform==='youtube'){ RUNNING=true; TICK=Math.max(250, Number(s.delayMs||900)); setTimeout(loop, 500); } }); } catch {}
  }, 500);
})();
