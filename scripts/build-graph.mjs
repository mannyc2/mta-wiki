#!/usr/bin/env node
// Build a self-contained, dependency-free HTML graph viz from data/canonical/*.jsonl.
//
//   node scripts/build-graph.mjs [--all] [--out wiki/graph.html]
//
// Nodes  = every record in the typed JSONL files (entities/routes/corridors/...).
// Edges  = relations.jsonl  (payload.subject_id --relation_kind--> payload.object_id).
// By default only CONNECTED nodes are emitted (orphan metric_claims are dropped);
// pass --all to embed every node.
//
// Output: a single HTML file with the graph data inlined. No network, no build step.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CANON = path.join(ROOT, "data", "canonical");

const args = process.argv.slice(2);
const INCLUDE_ALL = args.includes("--all");
const outArg = args.indexOf("--out");
const OUT = path.resolve(ROOT, outArg !== -1 ? args[outArg + 1] : "wiki/graph.html");

function readJsonl(file) {
  const p = path.join(CANON, file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

const NODE_FILES = [
  "routes.jsonl",
  "corridors.jsonl",
  "projects.jsonl",
  "entities.jsonl",
  "events.jsonl",
  "claims.jsonl",
  "metric_claims.jsonl",
  "treatment_components.jsonl",
  "sources.jsonl",
  "source_gaps.jsonl",
  "tables.jsonl",
];

// --- collect nodes (record_id + aliases -> canonical id) --------------------
const nodeById = new Map(); // canonical record_id -> node
const aliasToId = new Map(); // any id (incl. alias) -> canonical record_id

for (const file of NODE_FILES) {
  for (const r of readJsonl(file)) {
    const id = r.record_id;
    if (!id) continue;
    const kind = r.record_kind || file.replace(".jsonl", "");
    const name = r.display_name || r.payload?.route_name || r.payload?.entity_name || id;
    nodeById.set(id, {
      id,
      kind,
      name,
      sources: r.source_ids || (r.source_id ? [r.source_id] : []),
      review: r.review_state || null,
      truth: r.truth_status || null,
    });
    aliasToId.set(id, id);
    for (const a of r.record_aliases || []) aliasToId.set(a, id);
  }
}

// --- collect edges ----------------------------------------------------------
const edges = [];
const degree = new Map();
const bump = (id) => degree.set(id, (degree.get(id) || 0) + 1);

for (const r of readJsonl("relations.jsonl")) {
  const p = r.payload || {};
  const s = aliasToId.get(p.subject_id) || p.subject_id;
  const o = aliasToId.get(p.object_id) || p.object_id;
  if (!nodeById.has(s) || !nodeById.has(o)) continue; // skip unresolved endpoints
  edges.push({
    s,
    o,
    kind: p.relation_kind || "related",
    family: p.relation_family || "other",
    label: r.display_name || p.relation_kind || "",
  });
  bump(s);
  bump(o);
}

// --- filter to connected (unless --all) -------------------------------------
let nodes = [...nodeById.values()].map((n) => ({ ...n, deg: degree.get(n.id) || 0 }));
if (!INCLUDE_ALL) nodes = nodes.filter((n) => n.deg > 0);
const keep = new Set(nodes.map((n) => n.id));
const finalEdges = edges.filter((e) => keep.has(e.s) && keep.has(e.o));

const payload = { nodes, edges: finalEdges, generatedAt: null, includeAll: INCLUDE_ALL };

const html = renderHtml(payload);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);

const kinds = nodes.reduce((m, n) => ((m[n.kind] = (m[n.kind] || 0) + 1), m), {});
console.log(`wrote ${path.relative(ROOT, OUT)}`);
console.log(`  ${nodes.length} nodes, ${finalEdges.length} edges${INCLUDE_ALL ? " (--all)" : " (connected only)"}`);
console.log("  by kind:", kinds);

// ---------------------------------------------------------------------------
function renderHtml(data) {
  const json = JSON.stringify(data);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>MTA Wiki — Knowledge Graph</title>
<style>
  :root{
    --bg:#0e1116; --panel:#161b22; --line:#283039; --text:#e6edf3; --muted:#8b949e;
    --route:#58a6ff; --corridor:#3fb950; --project:#d29922; --entity:#bc8cff;
    --event:#ec6547; --claim:#79c0ff; --metric_claim:#56d4dd; --treatment_component:#f778ba;
    --source:#a5a5a5; --source_gap:#6e7681; --table:#9e6a03;
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--text);
    font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow:hidden}
  #app{display:flex;height:100%}
  #side{width:300px;flex:0 0 300px;background:var(--panel);border-right:1px solid var(--line);
    display:flex;flex-direction:column;overflow:hidden}
  #side h1{font-size:14px;margin:0;padding:14px 16px;border-bottom:1px solid var(--line);letter-spacing:.02em}
  #side h1 small{display:block;color:var(--muted);font-weight:400;font-size:11px;margin-top:3px}
  .sec{padding:12px 16px;border-bottom:1px solid var(--line)}
  .sec h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 8px}
  input[type=search]{width:100%;background:var(--bg);border:1px solid var(--line);color:var(--text);
    border-radius:6px;padding:7px 9px;font-size:13px;outline:none}
  input[type=search]:focus{border-color:var(--route)}
  .legend{display:flex;flex-direction:column;gap:5px}
  .legrow{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:2px 0;opacity:1}
  .legrow.off{opacity:.32}
  .dot{width:11px;height:11px;border-radius:50%;flex:0 0 11px}
  .legrow .cnt{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
  #detail{flex:1;overflow:auto;padding:12px 16px}
  #detail .empty{color:var(--muted);font-style:italic}
  #detail .nkind{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;
    padding:2px 7px;border-radius:10px;background:var(--bg);border:1px solid var(--line);margin-bottom:6px}
  #detail h3{margin:6px 0 4px;font-size:15px}
  #detail .meta{color:var(--muted);font-size:11px;margin-bottom:10px}
  #detail .nb{margin:2px 0;padding:4px 7px;border-radius:5px;background:var(--bg);cursor:pointer;
    display:flex;gap:7px;align-items:center;border:1px solid transparent}
  #detail .nb:hover{border-color:var(--line)}
  #detail .rel{color:var(--muted);font-size:10px}
  #detail .grp{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:10px 0 4px}
  #canvas-wrap{flex:1;position:relative}
  canvas{display:block;width:100%;height:100%;cursor:grab}
  canvas.drag{cursor:grabbing}
  #hud{position:absolute;left:12px;bottom:12px;color:var(--muted);font-size:11px;
    background:rgba(14,17,22,.7);padding:6px 9px;border-radius:6px;pointer-events:none}
  #tip{position:absolute;pointer-events:none;background:#1f2630;border:1px solid var(--line);
    padding:4px 8px;border-radius:5px;font-size:12px;max-width:280px;display:none;z-index:5;box-shadow:0 4px 16px #0008}
  .btns{display:flex;gap:6px;margin-top:8px}
  .btn{flex:1;background:var(--bg);border:1px solid var(--line);color:var(--text);border-radius:6px;
    padding:6px;cursor:pointer;font-size:12px}
  .btn:hover{border-color:var(--route)}
</style>
</head>
<body>
<div id="app">
  <aside id="side">
    <h1>MTA Wiki — Knowledge Graph<small id="sub"></small></h1>
    <div class="sec">
      <input id="search" type="search" placeholder="Search nodes…" autocomplete="off"/>
      <div class="btns">
        <button class="btn" id="reheat">Re-layout</button>
        <button class="btn" id="fit">Fit view</button>
      </div>
    </div>
    <div class="sec">
      <h2>Node types <span style="float:right;font-weight:400;text-transform:none;letter-spacing:0"><a id="toggleAll" href="#" style="color:var(--muted)">toggle all</a></span></h2>
      <div class="legend" id="legend"></div>
    </div>
    <div id="detail"><p class="empty">Click a node to inspect it.</p></div>
  </aside>
  <div id="canvas-wrap">
    <canvas id="c"></canvas>
    <div id="hud"></div>
    <div id="tip"></div>
  </div>
</div>
<script>
const DATA = ${json};
const KIND_COLOR = {route:"#58a6ff",corridor:"#3fb950",project:"#d29922",entity:"#bc8cff",
  event:"#ec6547",claim:"#79c0ff",metric_claim:"#56d4dd",treatment_component:"#f778ba",
  source:"#a5a5a5",source_gap:"#6e7681",table:"#9e6a03"};
const color = (k)=>KIND_COLOR[k]||"#8b949e";

const nodes = DATA.nodes.map(n=>({...n}));
const byId = new Map(nodes.map(n=>[n.id,n]));
const edges = DATA.edges.map(e=>({...e, a:byId.get(e.s), b:byId.get(e.o)})).filter(e=>e.a&&e.b);
const adj = new Map(nodes.map(n=>[n.id,[]]));
for(const e of edges){ adj.get(e.s).push({e,other:e.b}); adj.get(e.o).push({e,other:e.a}); }

// ---- layout: ring seed + force sim ----------------------------------------
let i=0;
for(const n of nodes){
  const a = i++ * 2.399963; const r = 30 + Math.sqrt(i)*22;
  n.x = Math.cos(a)*r; n.y = Math.sin(a)*r; n.vx=0; n.vy=0;
  n.rad = 4 + Math.sqrt(n.deg)*2.4;
}
const enabledKinds = new Set(Object.keys(nodes.reduce((m,n)=>((m[n.kind]=1),m),{})));
let alpha = 1;

function step(){
  if(alpha < 0.005) return;
  const active = nodes.filter(n=>enabledKinds.has(n.kind));
  const k = alpha;
  // repulsion (O(n^2), fine at this scale)
  for(let a=0;a<active.length;a++){
    const na=active[a];
    for(let b=a+1;b<active.length;b++){
      const nb=active[b];
      let dx=na.x-nb.x, dy=na.y-nb.y; let d2=dx*dx+dy*dy||0.01;
      if(d2>90000) continue;
      const f = 900/d2;
      const d=Math.sqrt(d2); const fx=dx/d*f, fy=dy/d*f;
      na.vx+=fx*k; na.vy+=fy*k; nb.vx-=fx*k; nb.vy-=fy*k;
    }
  }
  // springs
  for(const e of edges){
    if(!enabledKinds.has(e.a.kind)||!enabledKinds.has(e.b.kind)) continue;
    let dx=e.b.x-e.a.x, dy=e.b.y-e.a.y; const d=Math.sqrt(dx*dx+dy*dy)||0.01;
    const f=(d-70)*0.015*k; const fx=dx/d*f, fy=dy/d*f;
    e.a.vx+=fx; e.a.vy+=fy; e.b.vx-=fx; e.b.vy-=fy;
  }
  // gravity to center + integrate
  for(const n of active){
    n.vx += -n.x*0.0012*k; n.vy += -n.y*0.0012*k;
    if(n===dragNode) continue;
    n.x+=n.vx*0.5; n.y+=n.vy*0.5; n.vx*=0.86; n.vy*=0.86;
  }
  alpha *= 0.992;
}

// ---- canvas / camera -------------------------------------------------------
const cv=document.getElementById("c"), ctx=cv.getContext("2d");
const wrap=document.getElementById("canvas-wrap");
let DPR=Math.min(devicePixelRatio||1,2);
let cam={x:0,y:0,z:1};
function resize(){ const r=wrap.getBoundingClientRect(); cv.width=r.width*DPR; cv.height=r.height*DPR;
  cv.style.width=r.width+"px"; cv.style.height=r.height+"px"; }
new ResizeObserver(resize).observe(wrap); resize();

function fit(){
  const act=nodes.filter(n=>enabledKinds.has(n.kind));
  if(!act.length) return;
  let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
  for(const n of act){ minx=Math.min(minx,n.x);miny=Math.min(miny,n.y);maxx=Math.max(maxx,n.x);maxy=Math.max(maxy,n.y); }
  const w=cv.width/DPR, h=cv.height/DPR;
  const z=Math.min(w/(maxx-minx+120), h/(maxy-miny+120), 2.2);
  cam.z=z; cam.x=(minx+maxx)/2; cam.y=(miny+maxy)/2;
}
const toScreen=(n)=>({x:(n.x-cam.x)*cam.z+cv.width/DPR/2, y:(n.y-cam.y)*cam.z+cv.height/DPR/2});
const toWorld=(sx,sy)=>({x:(sx-cv.width/DPR/2)/cam.z+cam.x, y:(sy-cv.height/DPR/2)/cam.z+cam.y});

let selected=null, hover=null;
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,cv.width,cv.height);
  const hl = selected ? new Set([selected.id, ...adj.get(selected.id).map(a=>a.other.id)]) : null;
  // edges
  ctx.lineWidth=1;
  for(const e of edges){
    if(!enabledKinds.has(e.a.kind)||!enabledKinds.has(e.b.kind)) continue;
    const dim = hl && !(hl.has(e.a.id)&&hl.has(e.b.id));
    const focus = selected && (e.a.id===selected.id||e.b.id===selected.id);
    const A=toScreen(e.a), B=toScreen(e.b);
    ctx.strokeStyle = focus ? "rgba(88,166,255,.55)" : dim ? "rgba(120,130,145,.05)" : "rgba(120,130,145,.18)";
    ctx.beginPath(); ctx.moveTo(A.x,A.y); ctx.lineTo(B.x,B.y); ctx.stroke();
  }
  // nodes
  for(const n of nodes){
    if(!enabledKinds.has(n.kind)) continue;
    const s=toScreen(n); const dim = hl && !hl.has(n.id);
    const r=Math.max(2,n.rad*cam.z);
    ctx.globalAlpha = dim ? 0.18 : 1;
    ctx.beginPath(); ctx.arc(s.x,s.y,r,0,7); ctx.fillStyle=color(n.kind); ctx.fill();
    if(n===selected){ ctx.lineWidth=2; ctx.strokeStyle="#fff"; ctx.stroke(); }
    else if(n===hover){ ctx.lineWidth=1.5; ctx.strokeStyle="#fff9"; ctx.stroke(); }
    if(cam.z>0.85 && (!dim) && (r>5 || n===selected || n===hover)){
      ctx.globalAlpha = dim?0.3:0.9; ctx.fillStyle="#e6edf3";
      ctx.font="11px system-ui"; ctx.textAlign="center";
      ctx.fillText(n.name.length>34?n.name.slice(0,33)+"…":n.name, s.x, s.y - r - 4);
    }
  }
  ctx.globalAlpha=1;
}
function loop(){ step(); draw(); requestAnimationFrame(loop); }

// ---- picking / interaction -------------------------------------------------
function pick(sx,sy){
  let best=null,bd=1e9;
  for(const n of nodes){
    if(!enabledKinds.has(n.kind)) continue;
    const s=toScreen(n); const dx=s.x-sx, dy=s.y-sy; const d=dx*dx+dy*dy;
    const r=Math.max(6,n.rad*cam.z)+4;
    if(d<r*r && d<bd){ bd=d; best=n; }
  }
  return best;
}
let dragNode=null, panning=false, last=null, moved=false;
cv.addEventListener("mousedown",e=>{
  const sx=e.offsetX, sy=e.offsetY; moved=false;
  const n=pick(sx,sy);
  if(n){ dragNode=n; } else { panning=true; cv.classList.add("drag"); }
  last={x:sx,y:sy};
});
window.addEventListener("mousemove",e=>{
  const rect=cv.getBoundingClientRect(); const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  if(dragNode){ const w=toWorld(sx,sy); dragNode.x=w.x; dragNode.y=w.y; dragNode.vx=0;dragNode.vy=0; alpha=Math.max(alpha,.25); moved=true; }
  else if(panning && last){ cam.x-=(sx-last.x)/cam.z; cam.y-=(sy-last.y)/cam.z; last={x:sx,y:sy}; moved=true; }
  else {
    const tip=document.getElementById("tip");
    const n=pick(sx,sy); hover=n;
    if(n){ tip.style.display="block"; tip.style.left=(sx+14)+"px"; tip.style.top=(sy+12)+"px";
      tip.innerHTML='<b>'+esc(n.name)+'</b><br><span style="color:#8b949e">'+n.kind+' · deg '+n.deg+'</span>'; cv.style.cursor="pointer"; }
    else { tip.style.display="none"; cv.style.cursor=""; }
  }
});
window.addEventListener("mouseup",e=>{
  if(dragNode && !moved) select(dragNode);
  else if(panning && !moved){ const rect=cv.getBoundingClientRect(); select(pick(e.clientX-rect.left,e.clientY-rect.top)); }
  dragNode=null; panning=false; cv.classList.remove("drag"); last=null;
});
cv.addEventListener("wheel",e=>{
  e.preventDefault();
  const rect=cv.getBoundingClientRect(); const sx=e.offsetX, sy=e.offsetY;
  const before=toWorld(sx,sy);
  cam.z *= e.deltaY<0?1.12:0.89; cam.z=Math.max(0.1,Math.min(8,cam.z));
  const after=toWorld(sx,sy); cam.x+=before.x-after.x; cam.y+=before.y-after.y;
},{passive:false});

// ---- detail panel ----------------------------------------------------------
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function select(n){
  selected=n;
  const d=document.getElementById("detail");
  if(!n){ d.innerHTML='<p class="empty">Click a node to inspect it.</p>'; return; }
  const nbrs=adj.get(n.id).map(a=>({rel:a.e, other:a.other, out:a.e.s===n.id}));
  const outs=nbrs.filter(x=>x.out), ins=nbrs.filter(x=>!x.out);
  const row=(x)=>'<div class="nb" data-id="'+esc(x.other.id)+'"><span class="dot" style="background:'+color(x.other.kind)+'"></span>'+
    '<span>'+esc(x.other.name.length>30?x.other.name.slice(0,29)+"…":x.other.name)+'<br><span class="rel">'+esc(x.rel.kind)+'</span></span></div>';
  d.innerHTML='<span class="nkind" style="border-color:'+color(n.kind)+';color:'+color(n.kind)+'">'+n.kind+'</span>'+
    '<h3>'+esc(n.name)+'</h3>'+
    '<div class="meta">'+n.deg+' connection'+(n.deg===1?'':'s')+(n.sources?.length?' · '+n.sources.length+' source'+(n.sources.length===1?'':'s'):'')+
      (n.review?' · '+esc(n.review):'')+'</div>'+
    (outs.length?'<div class="grp">→ outgoing ('+outs.length+')</div>'+outs.map(row).join(''):'')+
    (ins.length?'<div class="grp">← incoming ('+ins.length+')</div>'+ins.map(row).join(''):'');
  d.querySelectorAll(".nb").forEach(el=>el.onclick=()=>{ const t=byId.get(el.dataset.id); select(t); centerOn(t); });
}
function centerOn(n){ cam.x=n.x; cam.y=n.y; }

// ---- legend / filters ------------------------------------------------------
const counts={}; for(const n of nodes) counts[n.kind]=(counts[n.kind]||0)+1;
const legend=document.getElementById("legend");
Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,c])=>{
  const row=document.createElement("div"); row.className="legrow"; row.dataset.kind=k;
  row.innerHTML='<span class="dot" style="background:'+color(k)+'"></span><span>'+k+'</span><span class="cnt">'+c+'</span>';
  row.onclick=()=>{ if(enabledKinds.has(k)) enabledKinds.delete(k); else enabledKinds.add(k);
    row.classList.toggle("off",!enabledKinds.has(k)); alpha=Math.max(alpha,.3); };
  legend.appendChild(row);
});
document.getElementById("toggleAll").onclick=(e)=>{e.preventDefault();
  const allOn = enabledKinds.size===Object.keys(counts).length;
  document.querySelectorAll(".legrow").forEach(r=>{ const k=r.dataset.kind;
    if(allOn){ enabledKinds.delete(k); r.classList.add("off"); } else { enabledKinds.add(k); r.classList.remove("off"); } });
  alpha=Math.max(alpha,.3);
};

// ---- search ----------------------------------------------------------------
const search=document.getElementById("search");
search.addEventListener("keydown",e=>{ if(e.key!=="Enter") return;
  const q=search.value.trim().toLowerCase(); if(!q) return;
  const hit=nodes.find(n=>enabledKinds.has(n.kind)&&n.name.toLowerCase().includes(q))
         || nodes.find(n=>n.name.toLowerCase().includes(q));
  if(hit){ if(!enabledKinds.has(hit.kind)){enabledKinds.add(hit.kind);document.querySelector('.legrow[data-kind="'+hit.kind+'"]')?.classList.remove("off");}
    select(hit); centerOn(hit); cam.z=Math.max(cam.z,1.3); }
});

document.getElementById("reheat").onclick=()=>{ alpha=1; };
document.getElementById("fit").onclick=fit;
document.getElementById("sub").textContent = nodes.length+" nodes · "+edges.length+" edges"+(DATA.includeAll?"":" (connected)");
document.getElementById("hud").textContent = "drag node · scroll zoom · drag bg pan · enter to search";

setTimeout(()=>{ for(let i=0;i<60;i++) step(); fit(); },0);
loop();
</script>
</body>
</html>`;
}
