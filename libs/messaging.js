
// messaging.js
export function sendMessage(type, payload={}) {
  return new Promise(resolve => chrome.runtime.sendMessage({type, payload}, resolve));
}
export function onMessage(type, handler) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === type) {
      (async () => {
        try { sendResponse({ok:true, data: await handler(msg.payload, sender)}); }
        catch(e) { console.error(e); sendResponse({ok:false, error:String(e)}); }
      })();
      return true;
    }
  });
}
