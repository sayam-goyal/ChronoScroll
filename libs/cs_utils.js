
(function(){
  const Utils = {};
  Utils.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  Utils.dispatchKey = function(target, key, code){
    try { const evDown = new KeyboardEvent('keydown', {key, code: code||key, bubbles: true});
          const evUp   = new KeyboardEvent('keyup',   {key, code: code||key, bubbles: true});
          (target||document).dispatchEvent(evDown); (target||document).dispatchEvent(evUp); } catch{}
  };
  Utils.wheelScroll = function(target, dy=600){ try{ const ev=new WheelEvent('wheel',{deltaY:dy,bubbles:true}); (target||document).dispatchEvent(ev);}catch{} };
  Utils.extractHashtags = function(text=''){ const tags=[]; try{ const re=/#([\p{L}\p{Nd}_]+)/gu; let m; while((m=re.exec(text))) tags.push(m[1].toLowerCase()); }catch{} return [...new Set(tags)]; };
  Utils.scrapeSend = function(item){ try { chrome.runtime.sendMessage({type:'SAVE_SCRAPE_ITEM', payload:item}); } catch{} };
  Utils.getVideoId = function(url){ try { const m = (url||location.href).match(/\/shorts\/([A-Za-z0-9_-]{5,})/); return m?m[1]:null; } catch{ return null; } };
  // YouTube transcript helpers
  Utils.getPlayerResponse = function(){
    try { return window.ytInitialPlayerResponse || (window.yt && window.yt.config_ && window.yt.config_.PLAYER_RESPONSE) || null; } catch { return null; }
  };
  Utils.getFirstCaptionTrack = function(){
    try {
      const pr = Utils.getPlayerResponse();
      const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length) return tracks[0];
    } catch {}
    return null;
  };
  Utils.fetchTranscriptFromTrack = async function(track){
    const urlBase = track?.baseUrl || '';
    if (!urlBase) return '';
    const tryUrls = [
      urlBase + (urlBase.includes('?')?'&':'?') + 'fmt=json3',
      urlBase
    ];
    for (const u of tryUrls){
      try {
        const resp = await fetch(u, {credentials:'include'});
        const text = await resp.text();
        if (u.includes('fmt=json3')){
          try { const js = JSON.parse(text);
            const parts = (js.events||[]).flatMap(ev => (ev.segs||[]).map(s => s.utf8)).join(' ').trim();
            if (parts) return parts;
          } catch {}
        } else {
          const clean = text.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
          if (clean) return clean;
        }
      } catch {}
    }
    return '';
  };
  window.Utils = Utils;
})();
