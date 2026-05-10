'use strict';
let artifactPack = null;
let finalHtml = '';
const titleEl = document.getElementById('artifactTitle');
const summaryEl = document.getElementById('summary');
const canvasEl = document.getElementById('canvas');
document.getElementById('btnCopyHtml').addEventListener('click', copyHtml);
document.getElementById('btnDownloadHtml').addEventListener('click', downloadHtml);
document.getElementById('btnDownloadState').addEventListener('click', downloadState);
load();
async function load(){
  const raw = await chrome.storage.local.get(['genoma_v13_program_artifact']);
  artifactPack = raw.genoma_v13_program_artifact || null;
  if(!artifactPack?.child){
    titleEl.textContent = 'no program artifact found';
    summaryEl.classList.add('error');
    summaryEl.textContent = 'No program artifact was saved. Return to the side panel and press COMPILE PROGRAM TEXT.';
    return;
  }
  const child = normalizeChild(artifactPack.child);
  titleEl.textContent = child.title;
  summaryEl.textContent = child.summary || 'Generated program-text UI artifact. This is the artifact view, not the live page.';
  const style = document.createElement('style');
  style.textContent = child.css;
  document.head.appendChild(style);
  canvasEl.innerHTML = child.html;
  finalHtml = buildFullHtml(child);
}
function normalizeChild(c){ return { title:String(c.title||'Program Text Artifact'), summary:String(c.summary||''), html:String(c.html||'<section><h1>Empty child phenotype</h1></section>'), css:String(c.css||'') }; }
function buildFullHtml(child){ return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(child.title)}</title><style>${child.css}</style></head><body>${child.html}</body></html>`; }
async function copyHtml(){ await navigator.clipboard.writeText(finalHtml || canvasEl.innerHTML); flash('HTML copied.'); }
function downloadHtml(){ const blob = new Blob([finalHtml || canvasEl.innerHTML], {type:'text/html'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`genoma-program-artifact-${Date.now()}.html`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function downloadState(){ const blob = new Blob([JSON.stringify(artifactPack,null,2)], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`genoma-program-state-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function flash(msg){ const old=summaryEl.textContent; summaryEl.textContent=msg; setTimeout(()=>summaryEl.textContent=old,1500); }
function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
