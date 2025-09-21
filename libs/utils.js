
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export function dispatchKey(target, key, code) {
  const evDown = new KeyboardEvent('keydown', {key, code: code || key, bubbles: true});
  const evUp = new KeyboardEvent('keyup', {key, code: code || key, bubbles: true});
  target.dispatchEvent(evDown); target.dispatchEvent(evUp);
}
export function wheelScroll(target, dy=400) {
  const ev = new WheelEvent('wheel', {deltaY: dy, bubbles: true});
  target.dispatchEvent(ev);
}
export function now() { return Date.now(); }
export function extractHashtags(text='') {
  const tags = []; const re = /#([\p{L}\p{Nd}_]+)/gu; let m;
  while ((m = re.exec(text))) tags.push(m[1].toLowerCase());
  return [...new Set(tags)];
}
export function isOnInstagramAudioPage() { return location.pathname.includes('/audio/'); }
export function downloadJSON(filename, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 300);
}
export function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
