
(function(){
  const U = window.Utils || {};
  let RUNNING=false, TICK=900, lastUrl=null, sameCount=0, busy=false;
  function parseJsonLD(){ try{ const s=document.querySelector('script[type="application/ld+json"]'); if(!s) return null;
    const data=JSON.parse(s.textContent); const info={platform:'instagram',url:location.href,timestamp:Date.now(),username:null,caption:null,tags:[]};
    const all=Array.isArray(data)?data:[data]; for(const item of all){ const t=item['@type']; if(t==='VideoObject'||t==='SocialMediaPosting'){ if(item.description) info.caption=item.description; const a=item.author; if(a) info.username=a.alternateName||a.name||info.username; } }
    if(info.username||info.caption){ info.tags=U.extractHashtags(info.caption||''); return info; } }catch{} return null; }
  function scrapeFromViewer(){ const info={platform:'instagram',url:location.href,timestamp:Date.now(),username:null,caption:null,tags:[]};
    try{ const dialog=document.querySelector('div[role="dialog"]')||document.body; const userEl=dialog.querySelector('header a[href^="/"][role="link"], header a[href^="/"][tabindex="0"]')||dialog.querySelector('a[role="link"][href^="/"][tabindex="0"]'); if(userEl) info.username=(userEl.innerText||'').trim(); const cap=dialog.querySelector('h1')||dialog.querySelector('ul li span[dir="auto"]')||dialog.querySelector('span[dir="auto"]'); if(cap) info.caption=(cap.innerText||'').trim(); }catch{} info.tags=U.extractHashtags(info.caption||''); return info; }
  function scrapeNow(){ return parseJsonLD() || scrapeFromViewer(); }
  async function toNext(){ const dialog=document.querySelector('div[role="dialog"]')||document; const nextBtn=dialog.querySelector('button[aria-label="Next"]')||dialog.querySelector('svg[aria-label="Next"]')?.closest('button'); if(nextBtn) nextBtn.click(); U.dispatchKey(dialog,'ArrowRight'); await U.sleep(40); U.dispatchKey(dialog,'PageDown'); await U.sleep(30); U.wheelScroll(dialog,1100); }
  function progressed(){ const cur=location.href; if(cur===lastUrl) sameCount++; else sameCount=0; lastUrl=cur; return sameCount===0; }
  async function loop(){ if(!RUNNING||busy) return; busy=true; const data=scrapeNow(); U.scrapeSend(data); await toNext(); await U.sleep(Math.max(200,TICK*0.35)); if(!progressed()){ U.dispatchKey(document,'ArrowRight'); U.wheelScroll(document,1500); await U.sleep(160);} if(sameCount>=3){ location.reload(); sameCount=0; } busy=false; if(RUNNING) setTimeout(loop,TICK); }
  chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
    if(msg?.type==='CONTENT_START' && msg.payload?.platform==='instagram'){ RUNNING=true; TICK=Math.max(250, Number(msg.payload.delayMs||900)); lastUrl=null; sameCount=0; busy=false; setTimeout(loop,400); respond&&respond({ok:true}); return true; }
    if(msg?.type==='CONTENT_STOP'){ RUNNING=false; respond&&respond({ok:true}); return true; }
    if(msg?.type==='SCRAPE_EXTRACT'){ try{ const data=scrapeNow(); respond&&respond({ok:true,data}); }catch(e){ respond&&respond({ok:false,error:String(e)});} return true; }
    if(msg?.type==='SCRAPE_ONCE'){ try{ const data=scrapeNow(); U.scrapeSend(data); respond&&respond({ok:true}); }catch(e){ respond&&respond({ok:false,error:String(e)});} return true; }
    if(msg?.type==='PING'){ respond&&respond({ok:true}); return true; }
  });
})();
