
(function(){
  const U = window.Utils || {};
  let RUNNING = false, TICK = 900, lastUrl = null, sameCount = 0, busy = false;
  let lastVid = null, lastCaption = null;

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

  function activeCaptionNode(){
    const header = document.querySelector('ytd-reel-player-header-renderer');
    if (!header) return null;
    return header.querySelector('#description, yt-formatted-string[slot="description"]') || null;
  }
  function activeUsernameNode(){
    const header = document.querySelector('ytd-reel-player-header-renderer');
    if (!header) return null;
    return header.querySelector('a[href^="/@"], a[href^="/channel/"]') || null;
  }
  async function waitForFreshData(targetVid, prevCaption){
    const t0 = Date.now();
    let capText = '';
    while (Date.now() - t0 < 2000){
      const capEl = activeCaptionNode();
      capText = (capEl ? capEl.textContent.trim() : '') || '';
      if (capText && capText !== prevCaption) break;
      await U.sleep(100);
    }
    return capText;
  }

  function scrapeNow(){
    const vid = U.getVideoId(location.href);
    const info = { platform:'youtube', url: location.href, vid, timestamp: Date.now(), username:null, caption:null, tags:[] };
    try{
      const userNode = activeUsernameNode();
      if (userNode) info.username = userNode.textContent.trim();
      const capEl = activeCaptionNode();
      if (capEl) info.caption = capEl.textContent.trim();
      if (!info.caption){
        const ogd = document.querySelector('meta[property="og:description"]')?.getAttribute('content');
        const ogt = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
        info.caption = ogd || ogt || null;
      }
      info.tags = U.extractHashtags(info.caption || '');
    }catch(e){}
    return info;
  }

  async function fetchTranscript(){
    try {
      const tr = U.getFirstCaptionTrack();
      if (!tr) return '';
      const txt = await U.fetchTranscriptFromTrack(tr);
      return txt || '';
    } catch { return ''; }
  }

  async function advanceOnce(){
    const nextBtn = document.querySelector('ytd-shorts button[aria-label*="Next"], button[aria-label="Next video"], #navigation-button-down');
    if (nextBtn) nextBtn.click();
    U.dispatchKey(document.body, 'ArrowDown'); U.dispatchKey(document.body, 'j', 'KeyJ');
    await U.sleep(20); U.wheelScroll(document.body, 1100);
  }

  function progressed(){
    const cur = location.href;
    if (cur === lastUrl) sameCount++; else sameCount = 0;
    lastUrl = cur; return sameCount === 0;
  }

  async function loop(){
    if (!RUNNING || busy) return; busy = true;
    openFirstShortIfGrid();

    const currentVid = U.getVideoId(location.href);
    const capBefore = activeCaptionNode()?.textContent?.trim() || '';
    const freshCap = await waitForFreshData(currentVid, capBefore);
    let data = scrapeNow();
    if (freshCap && (!data.caption || data.caption === capBefore)) data.caption = freshCap;

    if (!(currentVid && currentVid === lastVid && data.caption && data.caption === lastCaption)){
      fetchTranscript().then(txt => { if (txt && txt.length>40) { try { chrome.runtime.sendMessage({type:'SAVE_SCRAPE_ITEM', payload:Object.assign({}, data, { transcript: txt })}); } catch{} } });
      U.scrapeSend(data);
      lastVid = currentVid; lastCaption = data.caption || '';
    }

    await advanceOnce();
    await U.sleep(Math.max(200, TICK*0.40));
    if (!progressed()){
      U.dispatchKey(window,'ArrowDown'); U.dispatchKey(window,'j','KeyJ');
      const btn = document.querySelector('button[aria-label="Next video"], #navigation-button-down'); if (btn) btn.click();
      U.wheelScroll(document.body, 1600); await U.sleep(200);
    }
    if (sameCount >= 3) { location.reload(); sameCount=0; }
    busy = false;
    if (RUNNING) setTimeout(loop, TICK);
  }

  chrome.runtime.onMessage.addListener((msg, sender, respond)=>{
    if (msg?.type === 'CONTENT_START' && (msg.payload?.platform === 'youtube' || msg.payload==null)){
      RUNNING = true; TICK = Math.max(250, Number(msg.payload?.delayMs || 900));
      lastUrl = null; sameCount = 0; busy = false; setTimeout(loop, 320);
      respond && respond({ok:true}); return true;
    }
    if (msg?.type === 'CONTENT_STOP'){ RUNNING=false; respond && respond({ok:true}); return true; }
    if (msg?.type === 'SCRAPE_EXTRACT'){ try { const data = scrapeNow(); respond && respond({ok:true, data}); } catch(e){ respond && respond({ok:false, error:String(e)}); } return true; }
    if (msg?.type === 'SCRAPE_ONCE'){ try { const data = scrapeNow(); U.scrapeSend(data); respond && respond({ok:true}); } catch(e){ respond && respond({ok:false, error:String(e)}); } return true; }
    if (msg?.type === 'GET_TRANSCRIPT'){ (async ()=>{ try { const text = await fetchTranscript(); respond && respond({ok:true, text}); } catch(e){ respond && respond({ok:false, error:String(e)}); } })(); return true; }
    if (msg?.type === 'PING'){ respond && respond({ok:true}); return true; }
  });

  setTimeout(()=>{
    try { chrome.runtime.sendMessage({type:'GET_SESSION'}, (resp)=>{ const s=resp?.data; if (s?.running && s.platform==='youtube'){ RUNNING=true; TICK=Math.max(250, Number(s.delayMs||900)); setTimeout(loop, 500); } }); } catch {}
  }, 500);
})();
