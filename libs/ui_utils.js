
// ui_utils.js — module helpers for UI pages
export function downloadJSON(filename, dataObj){
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 200);
}
export function uid(){ return Math.random().toString(36).slice(2) + Date.now().toString(36); }
