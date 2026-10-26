(() => {
"use strict";
/* ============================================================
   Data (from Asteric's synthetic demonstration firm)
   ============================================================ */
const CAL = [ // [bin lo, n, mean predicted, observed]
  [0.1,5,.146,0],[0.2,9,.257,.222],[0.3,23,.347,.348],[0.4,39,.45,.333],[0.5,46,.543,.565],
  [0.6,54,.636,.63],[0.7,55,.737,.782],[0.8,74,.836,.757],[0.9,25,.928,.64]];
const wilson = (k,n,z=1.96) => { const p=k/n, d=1+z*z/n, c=(p+z*z/(2*n))/d, h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d; return [Math.max(0,c-h),Math.min(1,c+h)]; };

/* ============================================================
   Environment
   ============================================================ */
const root = document.documentElement;
const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (RM) root.classList.add("rm");
const clamp = (x,a=0,b=1) => Math.min(b,Math.max(a,x));
const ease = t => t<.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
const seg = (a,b,x) => ease(clamp((x-a)/(b-a)));
const lin = (a,b,x) => clamp((x-a)/(b-a));
const mix = (a,b,t) => a+(b-a)*t;
function rng(seed){ return () => { seed|=0; seed=seed+0x6d2b79f5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* ============================================================
   Product screens (adapted from the Asteric app)
   ============================================================ */
function calSVG(w=520,h=300){
  const m={l:40,r:12,t:10,b:30}, iw=w-m.l-m.r, ih=h-m.t-m.b, X=v=>m.l+v*iw, Y=v=>m.t+(1-v)*ih;
  let g=""; for (const v of [0,.2,.4,.6,.8,1]) g+=`<line x1="${m.l}" x2="${w-m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ecedf1"/><text x="${m.l-8}" y="${Y(v)+3}" text-anchor="end" font-size="10" fill="#8a8d96">${v*100}%</text><text x="${X(v)}" y="${h-12}" text-anchor="middle" font-size="10" fill="#8a8d96">${v*100}%</text>`;
  let ci="", pts=[]; for (const [,n,mp,o] of CAL){ const [lo,hi]=wilson(Math.round(o*n),n); ci+=`<line x1="${X(mp)}" x2="${X(mp)}" y1="${Y(lo)}" y2="${Y(hi)}" stroke="#afb3c4"/>`; pts.push([X(mp),Y(o)]); }
  const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const dots=pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="#3c83f6" stroke="#fff" stroke-width="2"/>`).join("");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Calibration curve: predicted versus observed favorable rate across nine probability bands">${g}<line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="#8a8d96" stroke-dasharray="4 4"/>${ci}<path d="${path}" fill="none" stroke="#3c83f6" stroke-width="2"/>${dots}</svg>`;
}
const SCREENS = [
`<h3 class="s-title">Matters</h3><p class="s-sub">Every matter, its recorded predictions and what happened.</p>
<div class="tblwrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Matter</th><th>Category</th><th>Status</th><th class="r">Latest prediction</th><th class="r">Expenses</th><th class="r">Recovery</th></tr></thead><tbody>
${[["Delgado v. Corepoint Manufacturing","KR-1843","Discrimination","Marco Rodriguez","Open · Post-discovery","$500K–$700K","74%","$81,200","—"],
["Marsh v. Redwood Transit","KR-1634","Wage & hour","Jane Ross","Open · Mediation","$255K–$440K","57%","$103,500","—"],
["Jansen v. Pacifica Credit Union","KR-1369","Wrongful termination","Marco Rodriguez","Open · Mediation","$120K–$195K","84%","$72,400","—"],
["Okonkwo v. Meridian Logistics","KR-1182","Wrongful termination","Jane Ross","Settlement","$400K–$550K","78%","$48,200","$475,000"],
["Underwood v. Summit Grocers","KR-1302","Wrongful termination","David Chen","Settlement","$180K–$325K","60%","$39,600","$374,500"],
["Whitmore v. Juniper Pharmacy","KR-1254","Discrimination","Ana Keller","Arbitration award","$885K–$1.33M","73%","$176,800","$825,000"],
["Laurent v. Nova Auto Group","KR-1515","Retaliation","Liam Brennan","Settlement","$295K–$445K","96%","$66,500","$332,500"],
["Varga v. Bayline Telecom","KR-1152","Wrongful termination","Marco Rodriguez","Settlement","$1.48M–$2.42M","85% · historical","$237,600","$1,038,500"]]
.map(r=>`<tr><td><span class="cp">${r[0]}</span><span class="cs"><span class="mono">${r[1]}</span> · ${r[3]}</span></td><td class="ink2">${r[2]}</td><td><span class="badge${r[4].startsWith("Open")?" badge--blue":""}">${r[4]}</span></td><td class="r">${r[5]}<span class="cs">${r[6]} favorable</span></td><td class="r">${r[7]}</td><td class="r">${r[8]}</td></tr>`).join("")}
</tbody></table></div><p class="fine" style="margin-top:10px">721 matters · sortable, filterable, exportable to CSV</p>`,
`<h3 class="s-title">Okonkwo v. Meridian Logistics</h3><p class="s-sub">Wrongful termination · Jane Ross · Los Angeles County Superior Court · <span class="badge">Closed Aug 14, 2025</span></p>
<div class="kpis" style="box-shadow:none;margin-bottom:14px"><div class="kpi"><div class="kpi-k">Latest predicted range</div><div class="kpi-v" style="font-size:16px">$400K–$550K</div><div class="kpi-f">v2 · 78% favorable</div></div><div class="kpi"><div class="kpi-k">Duration</div><div class="kpi-v" style="font-size:16px">17.0 mo</div><div class="kpi-f">Expected 17.0 mo</div></div><div class="kpi"><div class="kpi-k">Litigation expenses</div><div class="kpi-v" style="font-size:16px">$48,200</div><div class="kpi-f">Expected $50,000 · ▼ −4%</div></div><div class="kpi"><div class="kpi-k">Outcome</div><div class="kpi-v" style="font-size:16px">$475,000</div><div class="kpi-f">Settlement · Fee $190,000</div></div></div>
<div class="pred"><div class="lm" style="margin-bottom:6px"><span>Oct 9, 2024</span><span>Revision v2</span><span>Jane Ross</span></div><div class="pred-grid"><div><div class="pk">Recovery range</div><div class="pv">$400K–$550K</div><div class="pd">▲ +27% midpoint</div></div><div><div class="pk">Favorable</div><div class="pv">78%</div><div class="pd">▲ +13 pts</div></div><div><div class="pk">Duration</div><div class="pv">17.0 mo</div></div><div><div class="pk">Expense</div><div class="pv">$50,000</div></div><div><div class="pk">Confidence</div><div class="pv">High</div></div></div><div style="margin-top:8px"><span class="lock">🔒 Locked · recorded before the outcome was known</span></div></div>
<div class="pred" style="margin-top:10px;opacity:.75"><div class="lm" style="margin-bottom:6px"><span>Mar 14, 2024</span><span>Initial prediction</span><span>Jane Ross</span></div><div class="pred-grid"><div><div class="pk">Recovery range</div><div class="pv">$300K–$450K</div></div><div><div class="pk">Favorable</div><div class="pv">65%</div></div><div><div class="pk">Duration</div><div class="pv">14.0 mo</div></div><div><div class="pk">Expense</div><div class="pv">$45,000</div></div><div><div class="pk">Confidence</div><div class="pv">Medium</div></div></div></div>`,
`<h3 class="s-title">Calibration</h3><p class="s-sub">How the firm's recorded probabilities compared with what actually happened.</p>
<div class="kpis" style="box-shadow:none;margin-bottom:12px"><div class="kpi"><div class="kpi-k">Brier score</div><div class="kpi-v">0.218</div><div class="kpi-f">Lower is better · n = 330</div></div><div class="kpi"><div class="kpi-k">Base-rate reference</div><div class="kpi-v">0.240</div><div class="kpi-f">Always forecasting 60%</div></div><div class="kpi"><div class="kpi-k">Skill vs base rate</div><div class="kpi-v">+9%</div><div class="kpi-f">More informative than the base rate</div></div><div class="kpi"><div class="kpi-k">Resolved predictions</div><div class="kpi-v">330</div><div class="kpi-f">Recorded before the outcome</div></div></div>
<div style="max-width:620px">${calSVG(620,240)}</div>`,
`<h3 class="s-title">Economics</h3><p class="s-sub">Return on legal capital by referral source · expense-only · portfolio 1.72×</p>
<div style="display:grid;gap:9px;max-width:640px;margin-top:6px">${[["Community legal clinic",2.19],["Former clients",2.12],["Web intake",2.06],["No referral source",1.92],["Bar association referral service",1.72],["Meyer Lindqvist (co-counsel)",1.52],["Pacific Labor Referral Group",1.12]].map(([k,v])=>`<div style="display:grid;grid-template-columns:200px 1fr 46px;gap:10px;align-items:center;font-size:12px"><span class="ink2" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${k}</span><div style="position:relative;height:16px;background:var(--surface-2)"><div style="position:absolute;left:0;top:2px;bottom:2px;width:${v/2.4*100}%;background:var(--accent);border-radius:0 4px 4px 0"></div><div style="position:absolute;left:${1.72/2.4*100}%;top:-3px;bottom:-3px;border-left:1.5px dashed #8a8d96"></div></div><b class="num" style="font-weight:550;text-align:right">${v.toFixed(2)}×</b></div>`).join("")}</div>
<p class="fine" style="margin-top:14px">Dashed line: portfolio. Fully costed ROLC adds attorney time at the firm's configured hourly cost.</p>`,
`<h3 class="s-title">Portfolio Watch</h3><p class="s-sub">Open matters whose current facts have moved away from their latest prediction.</p>
<div class="tblwrap" style="overflow-x:auto"><table class="tbl"><thead><tr><th>Severity</th><th>Matter</th><th>Flag</th><th class="r">Measure</th></tr></thead><tbody>
${[["high","Marsh v. Redwood Transit","Expense variance","+76.9%"],["high","Jansen v. Pacifica Credit Union","Duration exceeded","+5.8 mo"],["high","Lindqvist v. Ansel Capital","Expense variance","+53.7%"],["medium","Delgado v. Corepoint Manufacturing","Expense variance","+47.6%"],["medium","Park v. Atlas Security Services","Major event since latest prediction","4 events"],["medium","Kaur v. Lumen Biotech","Major event since latest prediction","3 events"]].map(r=>`<tr><td><span class="sev" data-s="${r[0]}"></span>${r[0][0].toUpperCase()+r[0].slice(1)}</td><td class="cp">${r[1]}</td><td>${r[2]}</td><td class="r"><b style="font-weight:550">${r[3]}</b></td></tr>`).join("")}
</tbody></table></div>`
];
const screensEl = document.getElementById("screens");
screensEl.innerHTML = SCREENS.map((s,i)=>`<div class="screen${i===0?" on":""}" role="tabpanel" aria-label="${["Matters","Decision ledger","Calibration","Economics","Portfolio Watch"][i]}">${s}</div>`).join("");

/* ============================================================
   Canvas: one particle system, several formations
   ============================================================ */
const cv = document.getElementById("field"), cx = cv.getContext("2d");
const N = 720;
const R = rng(20190152);
// attributes: 0 favorable · 1 no recovery · 2 open
const P = Array.from({length:N},(_,i)=>({i,type:2,bin:-1}));
{ // assign real distributions: 150 open, 333 favorable, 237 not
  const order = P.map((_,i)=>i).sort(()=>R()-.5);
  let k=0; const take=n=>order.slice(k,k+=n);
  // calibration subset: per-bin favorable counts
  for (let b=0;b<CAL.length;b++){ const [,n,,o]=CAL[b]; const fav=Math.round(o*n); take(n).forEach((idx,j)=>{P[idx].bin=b;P[idx].type=j<fav?0:1;}); }
  take(135).forEach(idx=>P[idx].type=0); take(105).forEach(idx=>P[idx].type=1);
  order.slice(k).forEach(idx=>P[idx].type=2);
}
// the hero matter: a favorable prediction in the 60–70% band (Okonkwo: 65%)
const HERO = P.find(p=>p.bin===5 && p.type===0).i;
// rank within bin for cluster layout
{ const c={}; for (const p of P) if (p.bin>=0){ p.rank=c[p.bin]=(c[p.bin]??-1)+1; } }
// field (3D) base positions
for (const p of P){
  const u=R(), v=R(), w=R();
  const th=2*Math.PI*u, ph=Math.acos(2*v-1), r=Math.cbrt(w);
  p.fx=Math.sin(ph)*Math.cos(th)*r; p.fy=Math.cos(ph)*r*.62; p.fz=Math.sin(ph)*Math.sin(th)*r;
  p.tw=R()*Math.PI*2;
}
P[HERO].fx=.06; P[HERO].fy=.02; P[HERO].fz=.34;
const gridOrder = P.map(p=>p.i).sort(()=>R()-.5);
gridOrder.forEach((idx,k)=>P[idx].g=k);
// network assignment: our firm = 1 in 4 (hero included)
const NETC = 14; P.forEach((p,k)=>{ p.net = (k%4===0 || p.i===HERO) ? 0 : 1 + (k % (NETC-1)); });
{ const c={}; for (const p of P){ p.nrank=c[p.net]=(c[p.net]??-1)+1; } }
// hero neighbours in the field (constellation lines)
const NB = P.filter(p=>p.i!==HERO).map(p=>[p.i,(p.fx-P[HERO].fx)**2+(p.fy-P[HERO].fy)**2+(p.fz-P[HERO].fz)**2]).sort((a,b)=>a[1]-b[1]).slice(0,9).map(a=>a[0]);

let W=0,H=0,DPR=1,ASP=1,DESK=true, Hh=1;
const F = { grid:new Float32Array(N*2), cal:new Float32Array(N*2), net:new Float32Array(N*2) };
let calRect=null, netGeo=null;
function layout(){
  DPR = Math.min(devicePixelRatio||1, innerWidth<700?1.5:2);
  W=innerWidth; H=innerHeight; ASP=W/H; Hh=H/2; DESK = W>1000;
  cv.width=Math.round(W*DPR); cv.height=Math.round(H*DPR);
  // visual region in world units (half-height = 1)
  const reg = DESK ? {x0:ASP*(-0.02), x1:ASP*0.9, y0:-.62, y1:.72} : {x0:-ASP*.88, x1:ASP*.88, y0:-.9, y1:.02};
  // GRID
  { const rows=DESK?20:30, cols=Math.ceil(N/rows); const gx=(reg.x1-reg.x0)/cols, gy=(reg.y1-reg.y0)/rows, s=Math.min(gx,gy);
    const ox=(reg.x0+reg.x1)/2-(cols-1)*s/2, oy=(reg.y0+reg.y1)/2+(rows-1)*s/2 + (DESK?.06:0);
    for (const p of P){ const c=p.g%cols, r=Math.floor(p.g/cols); F.grid[p.i*2]=ox+c*s; F.grid[p.i*2+1]=oy-r*s; }
    F.gridCell=s; }
  // CAL
  { const m = DESK?{l:.14,r:.02,t:.06,b:.16}:{l:.16,r:.04,t:.04,b:.14};
    const w=reg.x1-reg.x0, h=(DESK?1.42:.98);
    const x0=reg.x0+m.l*w, x1=reg.x1-m.r*w, y1=(DESK?.7:-.12), y0=y1-(DESK?h:.74);
    calRect={x0,x1,y0,y1}; const sp = DESK?.0098:.0088;
    for (const p of P){
      if (p.bin<0){ F.cal[p.i*2]=F.grid[p.i*2]; F.cal[p.i*2+1]=F.grid[p.i*2+1]; continue; }
      const [,,mp,o]=CAL[p.bin]; const cxw=mix(x0,x1,mp), cyw=mix(y0,y1,o);
      const a=p.rank*2.39996, rr=sp*Math.sqrt(p.rank+.5);
      F.cal[p.i*2]=cxw+Math.cos(a)*rr; F.cal[p.i*2+1]=cyw+Math.sin(a)*rr;
    } }
  // NET
  { const hx=DESK?ASP*.47:0, hy=DESK?.0:-.42, rad=DESK?Math.min(.8,ASP*.32):Math.min(.5,ASP*.62);
    const centers=[]; const a0=Math.PI*.86, gap=.62; for (let c=0;c<NETC;c++){ const a = c===0 ? a0 : a0 + gap + (c-1)*(2*Math.PI-2*gap)/(NETC-2); const rr=rad*(c===0?1.02:(.88+.2*((c*37)%10)/10)); centers.push([hx+Math.cos(a)*rr, hy+Math.sin(a)*rr*.86]); }
    netGeo={hx,hy,centers};
    const sp = DESK?.0108:.0072; netGeo.sp=sp;
    for (const p of P){ const [ccx,ccy]=centers[p.net]; const a=p.nrank*2.39996, rr=(p.net===0?sp*1.05:sp*.85)*Math.sqrt(p.nrank+.5); F.net[p.i*2]=ccx+Math.cos(a)*rr; F.net[p.i*2+1]=ccy+Math.sin(a)*rr; } }
  measure();
}

/* chapters */
let CH=[];
function measure(){
  const y=scrollY;
  CH=[...document.querySelectorAll("[data-ch],[data-ch-plain]")].map(el=>{ const r=el.getBoundingClientRect(); return {el,key:el.dataset.ch||("plain:"+el.dataset.chPlain),top:r.top+y,h:r.height}; });
}
function prog(c,s){ return c.h>H ? clamp((s-c.top)/(c.h-H)) : clamp((s-c.top+H)/(c.h+H)); }

/* scene state from scroll */
function scene(s){
  const st={A:"field",B:"field",t:0,focus:0,op:1,axes:0,curve:0,net:0,hero:1};
  let cur=null; for (const c of CH){ if (s>=c.top-1 && s<c.top+c.h){ cur=c; break; } }
  if (!cur){ st.op = s<(CH[0]?.top??0)?1:0; return st; }
  const p=prog(cur,s);
  switch(cur.key){
    case "hero": st.focus=seg(.2,.5,p); st.op=1; break;
    case "ledger": st.focus=1; st.op=1-.86*seg(0,.12,p); break;
    case "portfolio": st.B="grid"; st.t=seg(.12,.6,p); st.focus=1-seg(0,.42,p); st.op=.14+.86*seg(0,.16,p); break;
    case "calibration": st.A="grid"; st.B="cal"; st.t=seg(.04,.55,p); st.axes=seg(.32,.6,p); st.curve=seg(.58,.82,p); break;
    case "economics": st.A="cal"; st.B="field"; st.t=seg(0,.3,p); st.axes=1-seg(0,.12,p); st.curve=st.axes; st.op=1-.9*seg(0,.22,p); break;
    case "plain:econ": case "watch": st.op=.1; break;
    case "network": st.B="net"; st.t=seg(.05,.55,p); st.op=.1+.9*seg(0,.2,p); st.net=seg(.42,.7,p); break;
    case "product": st.A="net"; st.B="net"; st.net=1-seg(0,.15,p); st.op=1-seg(0,.22,p); break;
    default: st.op=0;
  }
  return st;
}

/* drawing */
let ang=0, last=performance.now(), time=0;
const COL=["60,131,246","175,179,196","24,24,27"];
function pos(form,p,rot){
  if (form==="field"){ const c=Math.cos(rot), s=Math.sin(rot); const x=p.fx*c - p.fz*s, z=p.fx*s + p.fz*c; return [x*ASP*.98, p.fy*1.55, z*1.6]; }
  const a=F[form]; return [a[p.i*2], a[p.i*2+1], 0];
}
function draw(st){
  cx.setTransform(DPR,0,0,DPR,0,0); cx.clearRect(0,0,W,H);
  if (st.op<=0.01){ cv.style.opacity="0"; return; }
  cv.style.opacity=String(st.op);
  const camZ=3.2, f=3.2, adv=2.35*st.focus;
  const hp = (()=>{ const a=pos(st.A,P[HERO],ang), b=pos(st.B,P[HERO],ang); return [mix(a[0],b[0],st.t),mix(a[1],b[1],st.t),mix(a[2],b[2],st.t)]; })();
  const ox=hp[0]*st.focus, oy=hp[1]*st.focus, oz=hp[2]*st.focus;
  const proj=(x,y,z)=>{ const d=camZ-adv-(z-oz); if (d<.18) return null; const sc=f/d; return [W/2+(x-ox)*sc*Hh, H/2-(y-oy)*sc*Hh, sc]; };
  const flat = (st.A!=="field"&&st.B!=="field") || (st.t>.999 && st.B!=="field");
  const baseR = DESK?1.9:1.6;
  const heroS=proj(...hp);
  // constellation lines from the hero matter (field only)
  if (st.A==="field" && st.t<.5 && heroS){
    cx.lineWidth=1; for (const j of NB){ const q=pos("field",P[j],ang); const s2=proj(...q); if(!s2) continue; cx.strokeStyle=`rgba(60,131,246,${(.16*(1-st.t*2))*(1-.7*st.focus)})`; cx.beginPath(); cx.moveTo(heroS[0],heroS[1]); cx.lineTo(s2[0],s2[1]); cx.stroke(); }
  }
  // calibration axes
  if (st.axes>.01 && calRect) drawAxes(st.axes, st.curve);
  // network lines
  if (st.net>.01 && netGeo) drawNet(st.net);
  for (const p of P){
    if (p.i===HERO) continue;
    const a=pos(st.A,p,ang), b=pos(st.B,p,ang);
    const x=mix(a[0],b[0],st.t), y=mix(a[1],b[1],st.t), z=mix(a[2],b[2],st.t);
    const s=proj(x,y,z); if(!s) continue;
    let al;
    const inCal=p.bin>=0;
    const alA = st.A==="cal" ? (inCal?.95:.05) : st.A==="net" ? (p.net===0?.95:.55) : st.A==="grid"?.9:.55+.35*(z+1.6)/3.2;
    const alB = st.B==="cal" ? (inCal?.95:.05) : st.B==="net" ? (p.net===0?.95:.55) : st.B==="grid"?.9:.55+.35*(z+1.6)/3.2;
    al = mix(alA,alB,st.t) * (1-.72*st.focus);
    let type=p.type, col=COL[type];
    if ((st.B==="net"||st.A==="net") && p.net!==0) col=COL[1];
    if (type===2) al*=.55;
    if (!flat && st.A==="field") al *= .85+.15*Math.sin(time*.8+p.tw);
    const r = flat ? baseR*(st.B==="grid"&&F.gridCell? Math.min(1.25, F.gridCell*Hh/9) : 1) : baseR*Math.pow(s[2],.75);
    if (al<.02 || s[0]<-20||s[0]>W+20||s[1]<-20||s[1]>H+20) continue;
    cx.fillStyle=`rgba(${col},${al.toFixed(3)})`; cx.beginPath(); cx.arc(s[0],s[1],Math.max(.6,r),0,6.283); cx.fill();
  }
  // hero matter, drawn last
  if (heroS && st.hero){
    const r=(DESK?3.2:2.8)*Math.pow(heroS[2],.6);
    cx.fillStyle="rgba(60,131,246,.12)"; cx.beginPath(); cx.arc(heroS[0],heroS[1],r*3.2,0,6.283); cx.fill();
    cx.fillStyle="#3c83f6"; cx.beginPath(); cx.arc(heroS[0],heroS[1],r,0,6.283); cx.fill();
    cx.strokeStyle="#fff"; cx.lineWidth=1.5; cx.stroke();
  }
}
function w2s(x,y){ return [W/2+x*Hh, H/2-y*Hh]; }
function drawAxes(a, curve){
  const {x0,x1,y0,y1}=calRect; const X=v=>w2s(mix(x0,x1,v),0)[0], Y=v=>w2s(0,mix(y0,y1,v))[1];
  cx.save(); cx.globalAlpha=a;
  cx.font=`11px Geist, system-ui, sans-serif`; cx.fillStyle="#8a8d96"; cx.lineWidth=1;
  for (const v of [0,.2,.4,.6,.8,1]){
    cx.strokeStyle="#ecedf1"; cx.beginPath(); cx.moveTo(X(0),Y(v)); cx.lineTo(X(1),Y(v)); cx.stroke();
    cx.textAlign="right"; cx.fillText(`${Math.round(v*100)}%`, X(0)-10, Y(v)+4);
    cx.textAlign="center"; cx.fillText(`${Math.round(v*100)}%`, X(v), Y(0)+18);
  }
  cx.textAlign="center"; cx.fillText("Predicted probability of a favorable outcome", (X(0)+X(1))/2, Y(0)+38);
  cx.save(); cx.translate(X(0)-(DESK?42:36),(Y(0)+Y(1))/2); cx.rotate(-Math.PI/2); cx.fillText("Observed favorable rate",0,0); cx.restore();
  cx.setLineDash([4,4]); cx.strokeStyle="#8a8d96"; cx.lineWidth=1.2; cx.beginPath(); cx.moveTo(X(0),Y(0)); cx.lineTo(X(1),Y(1)); cx.stroke(); cx.setLineDash([]);
  if (curve>.01){
    cx.globalAlpha=a*curve;
    cx.strokeStyle="#afb3c4"; cx.lineWidth=1;
    for (const [,n,mp,o] of CAL){ const [lo,hi]=wilson(Math.round(o*n),n); cx.beginPath(); cx.moveTo(X(mp),Y(lo)); cx.lineTo(X(mp),Y(hi)); cx.stroke(); cx.beginPath(); cx.moveTo(X(mp)-3,Y(lo)); cx.lineTo(X(mp)+3,Y(lo)); cx.moveTo(X(mp)-3,Y(hi)); cx.lineTo(X(mp)+3,Y(hi)); cx.stroke(); }
    cx.strokeStyle="#3c83f6"; cx.lineWidth=2; cx.beginPath();
    const n=CAL.length, upto=curve*(n-1);
    for (let i=0;i<n;i++){ const [, , mp,o]=CAL[i]; if (i>Math.ceil(upto)) break; let px=X(mp), py=Y(o);
      if (i>upto){ const [, , mp0,o0]=CAL[i-1]; const t=upto-(i-1); px=mix(X(mp0),px,t); py=mix(Y(o0),py,t); }
      i?cx.lineTo(px,py):cx.moveTo(px,py); }
    cx.stroke();
    cx.globalAlpha=a*seg(.85,1,curve);
    cx.fillStyle="#5e616e"; cx.textAlign="left"; cx.font=`500 11px Geist, system-ui, sans-serif`;
    const [,,mp9,o9]=CAL[8]; const ly=Y(Math.max(0.06,o9-.2));
    cx.strokeStyle="#8a8d96"; cx.lineWidth=1; cx.beginPath(); cx.moveTo(X(mp9)+14,Y(o9)+6); cx.lineTo(X(1)-4,ly-14); cx.stroke();
    cx.textAlign="right"; cx.fillText("Predicted 90–100%", X(1), ly); cx.fillStyle="#18181b"; cx.fillText("64% observed", X(1), ly+15);
  }
  cx.restore();
}
function drawNet(a){
  const {hx,hy,centers}=netGeo; const [HX,HY]=w2s(hx,hy);
  cx.save(); cx.globalAlpha=a;
  centers.forEach(([x,y],k)=>{ const [sx,sy]=w2s(x,y);
    cx.setLineDash(k===0?[]:[2,5]); cx.strokeStyle=k===0?"rgba(60,131,246,.45)":"rgba(140,144,156,.32)"; cx.lineWidth=k===0?1.3:1;
    cx.beginPath(); cx.moveTo(sx,sy); cx.lineTo(HX,HY); cx.stroke();
    const t=((time*.18)+k*.137)%1; cx.setLineDash([]); cx.fillStyle=k===0?"rgba(60,131,246,.9)":"rgba(140,144,156,.6)";
    cx.beginPath(); cx.arc(mix(sx,HX,t),mix(sy,HY,t),k===0?2:1.5,0,6.283); cx.fill(); });
  cx.setLineDash([]);
  cx.fillStyle="#fff"; cx.strokeStyle="#3c83f6"; cx.lineWidth=1.5; cx.beginPath(); cx.arc(HX,HY,DESK?16:12,0,6.283); cx.fill(); cx.stroke();
  cx.fillStyle="rgba(60,131,246,.18)"; cx.beginPath(); cx.arc(HX,HY,(DESK?16:12)+6+3*Math.sin(time*1.4),0,6.283); cx.fill();
  cx.font=`500 11.5px Geist, system-ui, sans-serif`; cx.textAlign="center"; cx.fillStyle="#18181b";
  cx.fillText("De-identified aggregate signals", HX, HY+(DESK?36:30));
  cx.fillStyle="#8a8d96"; cx.font=`11px Geist, system-ui, sans-serif`; cx.fillText("illustrative", HX, HY+(DESK?51:44));
  const [fx,fy]=w2s(...centers[0]); const fr=netGeo.sp*1.05*Math.sqrt(N/4)*Hh; cx.fillStyle="#1f5fcf"; cx.font=`500 11.5px Geist, system-ui, sans-serif`;
  const lbl="Your firm · private workspace", lw=cx.measureText(lbl).width; cx.fillText(lbl, clamp(fx, lw/2+10, W-lw/2-10), fy+fr+18);
  cx.restore();
}

/* ============================================================
   DOM choreography per chapter
   ============================================================ */
const $=id=>document.getElementById(id);
const setR=(el,v)=>{ if(el){ const s=v.toFixed(3); if (el._r!==s){ el._r=s; el.style.setProperty("--r",s); } } };
const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const nav=$("nav");
const ledgerItems=[...document.querySelectorAll("#ledgerList .li")], railItems=[...document.querySelectorAll("#rail li")];
const mrows=[...document.querySelectorAll(".mrow")], bars=[...document.querySelectorAll(".bar-f")], rolcs=[...document.querySelectorAll(".rolc .v")];
const wrows=[...document.querySelectorAll(".wrow")];
const tabs=[...document.querySelectorAll("#tabs button")], screens=[...document.querySelectorAll(".screen")], fnav=[...document.querySelectorAll(".f-nav[data-nav]")];
let curTab=0;
function setTab(i){ if (i===curTab) return; curTab=i; tabs.forEach((t,k)=>t.setAttribute("aria-selected",String(k===i))); screens.forEach((s,k)=>s.classList.toggle("on",k===i)); fnav.forEach(n=>n.toggleAttribute("aria-current",+n.dataset.nav===i)); fnav.forEach(n=>{ if (+n.dataset.nav===i) n.setAttribute("aria-current","page"); }); }
fnav.forEach(n=>{ if (+n.dataset.nav===0) n.setAttribute("aria-current","page"); });
tabs.forEach((t,k)=>t.addEventListener("click",()=>{
  const c=CH.find(c=>c.key==="product"); if (RM||!c){ setTab(k); return; }
  scrollTo({top:c.top+(c.h-H)*(k/5+.1), behavior:"smooth"});
}));

function dom(s){
  const get=k=>CH.find(c=>c.key===k);
  // nav
  nav.dataset.solid = String(s>40);
  // HERO
  { const c=get("hero"); const p=c?prog(c,s):0;
    const t1=seg(.02,.16,p); const copy=$("heroCopy"); copy.style.opacity=String(1-t1); copy.style.transform=`translateY(${-28*t1}px)`; copy.style.visibility=t1>.99?"hidden":"visible";
    $("cue").style.opacity=String(1-seg(0,.05,p));
    setR($("heroCap1"), seg(.14,.22,p)*(1-seg(.4,.48,p)));
    const mc=$("mcard"), oc=$("ocard");
    const appear=seg(.34,.46,p), back=seg(.62,.76,p);
    mc.style.opacity=String(appear*(1-.45*back));
    mc.style.transform=`translate(-50%,-50%) translate(${(DESK?-150:-8)*back}px,${(DESK?-70:-92)*back}px) scale(${mix(.9,1,appear)*(1-.06*back)})`;
    mc.style.filter=back>.01?`saturate(${1-.5*back})`:"";
    setR($("ghostLabel"), seg(.74,.82,p));
    const oa=seg(.66,.78,p); oc.style.opacity=String(oa);
    oc.style.transform=`translate(-50%,-50%) translate(${(DESK?120:8)*oa}px,${(DESK?60:118)*oa}px) scale(${mix(.94,1,oa)})`;
    oc.style.pointerEvents=oa>.5?"auto":"none"; mc.style.pointerEvents=appear>.5?"auto":"none";
    const tl=seg(.48,.54,p)*(1-seg(.9,.97,p)); setR($("tl"), tl); $("tl").classList.toggle("late", !DESK && back>.4);
    const tt=lin(.5,.72,p); $("tlFill").style.width=(tt*100)+"%"; $("tlKnob").style.left=(tt*100)+"%";
    const mIdx=Math.round(tt*17); const yr=2024+Math.floor((2+mIdx)/12), mo=(2+mIdx)%12;
    const label=`${months[mo]} ${yr}${mIdx>0?` · ${mIdx} month${mIdx>1?"s":""} after intake`:" · intake"}`; if ($("tlNow")._t!==label){ $("tlNow")._t=label; $("tlNow").textContent=label; }
    setR($("heroCap2"), seg(.84,.92,p));
  }
  // LEDGER
  { const c=get("ledger"); const p=c?prog(c,s):0;
    const step = p<.08?-1:Math.min(4,Math.floor((p-.08)/.17));
    ledgerItems.forEach((li,k)=>li.classList.toggle("on",k<=step));
    railItems.forEach((li,k)=>{ li.classList.toggle("on",k<=step); li.classList.toggle("cur",k===step); });
    const list=$("ledgerList"), win=list.parentElement; const target=ledgerItems[Math.max(0,step)];
    if (target){ const off=Math.max(0, Math.min(target.offsetTop-win.clientHeight*.38, list.scrollHeight-win.clientHeight)); const tf=`translateY(${-off}px)`; if (list._tf!==tf){ list._tf=tf; list.style.transform=tf; } }
  }
  // PORTFOLIO
  { const c=get("portfolio"); const p=c?prog(c,s):0;
    for (const [id,a,b] of [["portEb",.1,.2],["portH",.12,.24],["portLede",.2,.32],["portLeg",.5,.62]]) setR($(id), seg(a,b,p));
    setR($("portKpis"), seg(.66,.8,p)); }
  // CALIBRATION
  { const c=get("calibration"); const p=c?prog(c,s):0; setR($("calStat"), seg(.6,.72,p)); setR($("calFind"), seg(.8,.9,p)); }
  // ECONOMICS
  { const c=get("economics"); const p=c?prog(c,s):0;
    const k=Math.floor(lin(.12,.72,p)*4.999);
    mrows.forEach(r=>r.classList.toggle("on", p>.1 && +r.dataset.i<=k));
    const bt=seg(.62,.78,p); bars.forEach(b=>b.style.transform=`scaleX(${(+b.dataset.w)*bt})`);
    const rt=seg(.72,.86,p); rolcs.forEach(v=>{ const t=(+v.dataset.to*rt).toFixed(2)+"×"; if (v.textContent!==t) v.textContent=t; v.style.color = rt>.99 ? (+v.dataset.to<2 ? "var(--neg)" : "var(--ink)") : "var(--ink)"; });
    setR($("verdict"), seg(.86,.95,p)); }
  // WATCH
  { const c=get("watch"); const p=c?prog(c,s):0;
    wrows.forEach((r,k)=>r.classList.toggle("on", p>.14+k*.1));
    setR($("drift"), seg(.08,.18,p));
    const d1=seg(.15,.6,p), v1=Math.round(81200*d1); $("d1").style.width=(v1/90000*100)+"%"; $("d1").classList.toggle("over", v1>55000); $("d1v").textContent="$"+v1.toLocaleString("en-US");
    const d2=seg(.25,.7,p), v2=25.8*d2; $("d2").style.width=(v2/27.8*100)+"%"; $("d2").classList.toggle("over", v2>20); $("d2v").textContent=v2.toFixed(1); }
  // NETWORK
  { const c=get("network"); const p=c?prog(c,s):0; setR($("netDis"), seg(.5,.62,p)); }
  // PRODUCT
  { const c=get("product"); const p=c?prog(c,s):0; if (!RM) setTab(Math.min(4,Math.floor(lin(.08,.98,p)*5))); }
}

/* ============================================================
   Loop
   ============================================================ */
let target=scrollY, smooth=scrollY, lastY=scrollY, running=true;
addEventListener("scroll",()=>{ target=scrollY; const d=scrollY-lastY; if (Math.abs(d)>6){ nav.dataset.hidden=String(d>0 && scrollY>400); lastY=scrollY; } },{passive:true});
addEventListener("resize",()=>{ layout(); target=smooth=scrollY; frame(true); });
document.addEventListener("visibilitychange",()=>{ running=!document.hidden; if (running){ last=performance.now(); requestAnimationFrame(loop); } });

function frame(force){
  const st=scene(smooth); dom(smooth); draw(st);
}
function loop(now){
  if (!running) return;
  const dt=Math.min(.05,(now-last)/1000); last=now; time+=dt;
  const diff=target-smooth; smooth = Math.abs(diff)<.5 ? target : smooth+diff*Math.min(1,dt*9);
  const st=scene(smooth);
  ang += dt*.045*(1-.85*st.focus);
  dom(smooth); draw(st);
  requestAnimationFrame(loop);
}

if (RM){
  // Reduced motion: no animation. Content is shown in its final state; the canvas shows
  // the formation for the section in view, redrawn only when scrolling.
  layout();
  ledgerItems.forEach(li=>li.classList.add("on")); mrows.forEach(r=>r.classList.add("on")); wrows.forEach(r=>r.classList.add("on"));
  bars.forEach(b=>b.style.setProperty("--w",b.dataset.w)); rolcs.forEach(v=>v.textContent=(+v.dataset.to).toFixed(2)+"×");
  $("d1").style.width="90%"; $("d1").classList.add("over"); $("d1v").textContent="$81,200"; $("d2").style.width="92.8%"; $("d2").classList.add("over"); $("d2v").textContent="25.8";
  ["mcard","ocard"].forEach(id=>$(id).style.opacity="1"); $("mcard").style.transform="translate(-50%,-92%)"; $("ocard").style.transform="translate(-50%,8%)";
  setR($("ghostLabel"),1);
  const still=()=>{ const s=scrollY+H*.5; let key=null; for (const c of CH) if (s>=c.top && s<c.top+c.h) key=c.key;
    const st={A:"field",B:"field",t:1,focus:0,op:.35,axes:0,curve:0,net:0,hero:1};
    if (key==="portfolio") Object.assign(st,{B:"grid",op:1}); else if (key==="calibration") Object.assign(st,{A:"cal",B:"cal",op:1,axes:1,curve:1});
    else if (key==="network") Object.assign(st,{A:"net",B:"net",op:1,net:1}); else if (key && key!=="hero") st.op=0;
    draw(st); nav.dataset.solid=String(scrollY>40); };
  addEventListener("scroll",still,{passive:true}); addEventListener("resize",()=>{layout();still();}); still();
} else {
  layout(); frame(true); requestAnimationFrame(t=>{ last=t; loop(t); });
  addEventListener("load",()=>{ measure(); });
  document.fonts && document.fonts.ready.then(()=>measure());
}
})();
