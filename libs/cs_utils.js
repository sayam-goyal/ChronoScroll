
// cs_utils.js — non-module helpers (attach to window), for content scripts only.
(function(){
  const Utils = {};
  Utils.sleep = (ms) => new Promise(r => setTimeout(r, ms));
  Utils.dispatchKey = function(target, key, code){
    try { const evDown = new KeyboardEvent('keydown', {key, code: code||key, bubbles: true});
          const evUp = new KeyboardEvent('keyup', {key, code: code||key, bubbles: true});
          (target||document).dispatchEvent(evDown); (target||document).dispatchEvent(evUp); } catch{}
  };
  Utils.wheelScroll = function(target, dy=600){
    try { const ev = new WheelEvent('wheel', {deltaY: dy, bubbles: true}); (target||document).dispatchEvent(ev); } catch{}
  };
  Utils.extractHashtags = function(text=''){
    const tags = []; try{ const re=/#([\p{L}\p{Nd}_]+)/gu; let m; while((m=re.exec(text))) tags.push(m[1].toLowerCase()); }catch{}
    return [...new Set(tags)];
  };
  Utils.scrapeSend = function(item){ try { chrome.runtime.sendMessage({type:'SAVE_SCRAPE_ITEM', payload:item}); } catch{} };
  window.Utils = Utils;
})();
