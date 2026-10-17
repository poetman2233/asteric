/* =========================================================
   Asteric — landing page interaction layer
   Subtle, premium motion. rAF-gated. Reduced-motion honored.
   ========================================================= */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- NAV: frost on scroll, hide on scroll-down ---------- */
  const nav = $('#nav');
  let navTick = false, lastY = window.scrollY;
  const setNav = () => {
    const y = window.scrollY;
    nav.dataset.scrolled = y > 16 ? 'true' : 'false';
    if (y > 120 && y > lastY + 3) nav.dataset.hidden = 'true';        // scrolling down → hide
    else if (y < lastY - 3 || y <= 120) nav.dataset.hidden = 'false'; // scrolling up / near top → show
    lastY = y; navTick = false;
  };
  window.addEventListener('scroll', () => { if (!navTick) { navTick = true; requestAnimationFrame(setNav); } }, { passive: true });
  setNav();

  /* ---------- hero copy stagger index ---------- */
  $$('.hero__copy [data-reveal]').forEach((el, i) => el.style.setProperty('--i', i));

  /* ---------- REVEAL (fade + slide-up) ---------- */
  const reveals = $$('[data-reveal]');
  if (reduce) {
    reveals.forEach(el => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(el => io.observe(el));
  }

  /* ---------- HERO blotter rows (realistic, consistent) ---------- */
  const matters = [
    ['Okonkwo v. Meridian Logistics', 'Wrongful term.',   '$300–450K', '$475K', '2.4×', 'good'],
    ['Alvarez v. Brightwave Health',  'FEHA retaliation',  '$180–260K', '$225K', '1.9×', ''],
    ['Chen v. Northgate Systems',     'Wage & hour',       '$90–140K',  '$118K', '3.4×', 'good'],
    ['Delgado v. Corepoint Mfg.',     'Discrimination',    '$400–600K', '$355K', '0.9×', 'warn'],
    ['Whitmore v. Ansel Capital',     'Wrongful term.',    '$1.2–1.8M', '$640K', '0.6×', 'warn'],
  ];
  const blotter = $('#blotterBody');
  if (blotter) {
    matters.forEach(m => {
      const [name, cat, pred, act, rolc, tone] = m;
      const row = document.createElement('div');
      row.className = 'blotter__row'; row.setAttribute('role', 'row');
      row.innerHTML =
        `<span class="b-name">${name}</span>` +
        `<span class="b-cat">${cat}</span>` +
        `<span class="b-num">${pred}</span>` +
        `<span class="b-num">${act}</span>` +
        `<span class="b-rolc" data-tone="${tone}">${rolc}</span>`;
      blotter.appendChild(row);
    });
  }
  const blotterWrap = $('.blotter');
  const populate = () => {
    if (!blotterWrap) return;
    blotterWrap.classList.add('is-live');
    if (reduce) return;
    $$('.blotter__row', blotterWrap).forEach((r, i) => { r.style.transitionDelay = (0.07 * i) + 's'; });
  };
  const heroSurface = $('.hero__surface');
  if (reduce) { populate(); }
  else if (heroSurface) {
    const pio = new IntersectionObserver((ents, obs) => {
      ents.forEach(e => { if (e.isIntersecting) { populate(); obs.disconnect(); } });
    }, { threshold: 0.25 });
    pio.observe(heroSurface);
  }

  /* ---------- Parallax on floating surfaces ---------- */
  if (!reduce) {
    const items = $$('[data-parallax]').map(el => ({ el, f: parseFloat(el.dataset.parallax) || 0.05 }));
    if (items.length) {
      let pTick = false;
      const apply = () => {
        const vh = window.innerHeight;
        items.forEach(({ el, f }) => {
          const r = el.getBoundingClientRect();
          const fromCenter = (r.top + r.height / 2) - vh / 2;
          el.style.transform = `translateY(${(-fromCenter * f).toFixed(1)}px)`;
        });
        pTick = false;
      };
      window.addEventListener('scroll', () => { if (!pTick) { pTick = true; requestAnimationFrame(apply); } }, { passive: true });
      apply();
    }
  }

  /* ---------- COUNT-UPS ---------- */
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const runCount = (el) => {
    const to = parseFloat(el.dataset.to);
    const dp = parseInt(el.dataset.dp || '0', 10);
    const suffix = el.dataset.suffix || '';
    if (reduce) { el.textContent = to.toFixed(dp) + suffix; return; }
    const dur = 1300, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = (to * easeOut(p)).toFixed(dp) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const counts = $$('[data-count]');
  if (reduce) {
    counts.forEach(runCount);
  } else {
    const cio = new IntersectionObserver((ents, obs) => {
      ents.forEach(e => { if (e.isIntersecting) { runCount(e.target); obs.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counts.forEach(el => cio.observe(el));
  }

  /* ---------- ROLC bars grow in view ---------- */
  const rolcSurface = $('.rolc');
  if (rolcSurface) {
    const grow = () => $$('.rolc__bar', rolcSurface).forEach((b, i) => {
      const set = () => { b.style.width = (b.dataset.w || 50) + '%'; };
      reduce ? set() : setTimeout(set, 110 * i);
    });
    if (reduce) { grow(); }
    else {
      const rio = new IntersectionObserver((ents, obs) => {
        ents.forEach(e => { if (e.isIntersecting) { grow(); obs.disconnect(); } });
      }, { threshold: 0.4 });
      rio.observe(rolcSurface);
    }
  }

  /* ---------- Calibration curve draws once, in view ---------- */
  const curve = $('#chartCurve');
  const point = $('#chartPoint');
  if (curve) {
    const len = curve.getTotalLength();
    curve.style.strokeDasharray = len;
    if (reduce) {
      curve.style.strokeDashoffset = 0;
      if (point) point.style.opacity = 1;
    } else {
      curve.style.strokeDashoffset = len;
      curve.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1)';
      if (point) { point.style.opacity = 0; point.style.transition = 'opacity .5s ease'; }
      const chart = $('#chartGlass');
      const dio = new IntersectionObserver((ents, obs) => {
        ents.forEach(e => {
          if (e.isIntersecting) {
            curve.style.strokeDashoffset = 0;
            if (point) setTimeout(() => { point.style.opacity = 1; }, 1200);
            obs.disconnect();
          }
        });
      }, { threshold: 0.4 });
      if (chart) dio.observe(chart);
    }
  }

  /* ---------- FAQ accordion (grid-template-rows), single-open ---------- */
  $$('.acc').forEach((acc) => {
    const btn = $('.acc__btn', acc);
    btn.addEventListener('click', () => {
      const open = acc.dataset.open === 'true';
      $$('.acc').forEach(a => {
        if (a !== acc) { a.dataset.open = 'false'; $('.acc__btn', a).setAttribute('aria-expanded', 'false'); }
      });
      acc.dataset.open = open ? 'false' : 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  });

  /* ---------- CONSTELLATION (interactive network) ----------
     A network of private disputes. The cursor reveals the local subgraph,
     signals travel the connections, and the North Star anchors it all. */
  const initConstellation = () => {
    const canvas = $('#constellation');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const mark = $('#heroMark');
    const R = 210;                 // cursor reveal radius
    const INK = '20,22,34', BLUE = '60,131,246';
    let W, H, dpr, nodes = [], edges = [], adj = [], cell = 120, northIdx = 0;
    let signals = [], lastSpawn = 0, lastAmbient = 0;

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      nodes = [];
      cell = Math.max(98, Math.round(Math.sqrt((W * H) / 108)));   // slightly denser
      for (let gy = 0; gy * cell < H + cell; gy++) {
        for (let gx = 0; gx * cell < W + cell; gx++) {
          if (Math.random() < 0.26) continue;                       // deliberate empty space
          const jx = (Math.random() - 0.5) * cell * 0.72;
          const jy = (Math.random() - 0.5) * cell * 0.72;
          const x = gx * cell + cell * 0.5 + jx;
          const y = gy * cell + cell * 0.5 + jy;
          if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
          nodes.push({ bx: x, by: y, x, y, r: Math.random() < 0.14 ? 2.0 : 1.05, infl: 0 });
        }
      }
      let nx = W * 0.5, ny = H * 0.28;
      if (mark) { const b = mark.getBoundingClientRect(); if (b.width) { nx = b.left + b.width / 2; ny = b.top + b.height / 2; } }
      nodes.push({ bx: nx, by: ny, x: nx, y: ny, r: 2.7, infl: 0, north: true });
      northIdx = nodes.length - 1;

      edges = []; adj = nodes.map(() => []);
      const maxD = cell * 1.75, seen = new Set();
      for (let i = 0; i < nodes.length; i++) {
        const near = [];
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
          if (d < maxD) near.push([d, j]);
        }
        near.sort((a, b) => a[0] - b[0]);
        const k = nodes[i].north ? 6 : (Math.random() < 0.32 ? 3 : 2);
        for (let n = 0; n < Math.min(k, near.length); n++) {
          const j = near[n][1], key = i < j ? i + '-' + j : j + '-' + i;
          if (!seen.has(key)) { seen.add(key); const e = edges.length; edges.push([i, j]); adj[i].push({ e, to: j }); adj[j].push({ e, to: i }); }
        }
      }
      signals = [];
    };

    let mx = -9999, my = -9999, strength = 0, lastMove = -9999, nearestIdx = -1;
    window.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; lastMove = performance.now(); }, { passive: true });

    const spawnFrom = (idx, hops) => {
      if (signals.length > 9 || !adj[idx] || !adj[idx].length) return;
      const pick = adj[idx][(Math.random() * adj[idx].length) | 0];
      signals.push({ from: idx, to: pick.to, e: pick.e, t: 0, speed: 0.012 + Math.random() * 0.012, hops: hops });
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, W, H);
      for (const [a, b] of edges) {
        const na = nodes[a], nb = nodes[b];
        ctx.strokeStyle = 'rgba(' + INK + ',0.05)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
      }
      for (const nd of nodes) {
        ctx.fillStyle = nd.north ? 'rgba(' + BLUE + ',0.4)' : 'rgba(' + INK + ',0.14)';
        ctx.beginPath(); ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2); ctx.fill();
      }
    };

    let running = true;
    const frame = () => {
      if (!running) return;
      const now = performance.now();
      const idle = now - lastMove > 680;
      strength += ((idle ? 0 : 1) - strength) * 0.06;

      // node influence + gentle pull toward cursor
      nearestIdx = -1; let nd2 = R * R;
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i];
        const dx = mx - nd.bx, dy = my - nd.by, dd = dx * dx + dy * dy;
        const infl = Math.max(0, 1 - Math.sqrt(dd) / R) * strength;
        nd.infl = infl;
        if (!idle && dd < nd2) { nd2 = dd; nearestIdx = i; }
        const tx = nd.bx + dx * 0.05 * infl, ty = nd.by + dy * 0.05 * infl;
        nd.x += (tx - nd.x) * 0.12; nd.y += (ty - nd.y) * 0.12;
      }

      // spawn signals: from the focused node while hovering, plus rare ambient
      if (nearestIdx >= 0 && now - lastSpawn > 620) { lastSpawn = now; spawnFrom(nearestIdx, 2); }
      if (now - lastAmbient > 2600) { lastAmbient = now; spawnFrom((Math.random() * nodes.length) | 0, 1); }

      ctx.clearRect(0, 0, W, H);

      // edges (local subgraph of the focused node reads brighter, in blue)
      const focusAdj = nearestIdx >= 0 ? adj[nearestIdx] : null;
      const focusSet = focusAdj ? new Set(focusAdj.map(a => a.e)) : null;
      for (let ei = 0; ei < edges.length; ei++) {
        const na = nodes[edges[ei][0]], nb = nodes[edges[ei][1]];
        const infl = Math.max(na.infl, nb.infl);
        if (focusSet && focusSet.has(ei)) {
          ctx.strokeStyle = 'rgba(' + BLUE + ',' + (0.16 + 0.24 * strength).toFixed(3) + ')';
          ctx.lineWidth = 1.0;
        } else {
          ctx.strokeStyle = 'rgba(' + INK + ',' + (0.045 + 0.16 * infl).toFixed(3) + ')';
          ctx.lineWidth = 0.8 + 0.35 * infl;
        }
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
      }

      // nodes
      for (let i = 0; i < nodes.length; i++) {
        const nd = nodes[i], infl = nd.infl;
        let r = nd.r * (1 + 0.85 * infl);
        if (nd.north) {
          r = nd.r * (1 + 0.12 * Math.sin(now / 1400)) * (1 + 0.5 * infl);   // breathing anchor
          ctx.fillStyle = 'rgba(' + BLUE + ',' + (0.4 + 0.4 * infl).toFixed(3) + ')';
        } else if (i === nearestIdx) {
          ctx.fillStyle = 'rgba(' + BLUE + ',' + (0.55 * strength + 0.14).toFixed(3) + ')';
          r = nd.r * (1.4 + 0.6 * infl);
        } else {
          ctx.fillStyle = 'rgba(' + INK + ',' + (0.13 + 0.5 * infl).toFixed(3) + ')';
        }
        ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.fill();
      }

      // travelling signals
      for (let s = signals.length - 1; s >= 0; s--) {
        const sig = signals[s]; sig.t += sig.speed;
        const a = nodes[sig.from], b = nodes[sig.to];
        const px = a.x + (b.x - a.x) * sig.t, py = a.y + (b.y - a.y) * sig.t;
        ctx.fillStyle = 'rgba(' + BLUE + ',0.85)';
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(' + BLUE + ',0.18)';
        ctx.beginPath(); ctx.arc(px, py, 4.4, 0, Math.PI * 2); ctx.fill();
        if (sig.t >= 1) {
          signals.splice(s, 1);
          if (sig.hops > 0) spawnFrom(sig.to, sig.hops - 1);   // propagate onward
        }
      }

      if (mark) {
        const b = mark.getBoundingClientRect();
        const d = Math.hypot(mx - (b.left + b.width / 2), my - (b.top + b.height / 2));
        mark.classList.toggle('near', d < 150 && !idle);
      }
      requestAnimationFrame(frame);
    };

    build();
    if (reduce) { drawStatic(); return; }
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 180); }, { passive: true });
    document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });
    requestAnimationFrame(frame);
  };
  initConstellation();

  /* ---------- EMERGE: scroll-driven "intelligence from the network" ----------
     Phase 1: scattered private disputes → Phase 2: connections form →
     Phase 3: clusters resolve, labels + an emergent insight surface. */
  const initEmerge = () => {
    const section = $('#emerge'), canvas = $('#emergeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const capEl = $('#emergeCap'), bar = $('#emergeBar'), insight = $('#emergeInsight'), hint = $('#emergeHint');
    const INK = '20,22,34', BLUE = '60,131,246';
    const clusters = ['Wrongful termination', 'Wage & hour', 'Discrimination', 'Retaliation'];
    const centersN = [[0.30, 0.40], [0.70, 0.36], [0.32, 0.70], [0.70, 0.68]];
    let W, H, dpr, nodes = [], edges = [], centers = [], hoverCluster = -1, mxC = -9999, myC = -9999;

    const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

    const build = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      centers = centersN.map(c => ({ x: c[0] * W, y: c[1] * H }));
      const spread = Math.min(W, H) * 0.15;
      nodes = [];
      const N = Math.max(56, Math.min(92, Math.round(W / 15)));
      for (let i = 0; i < N; i++) {
        const ci = i % clusters.length, c = centers[ci];
        const ang = Math.random() * Math.PI * 2, rad = Math.pow(Math.random(), 0.7) * spread;
        nodes.push({
          ci,
          sx: 40 + Math.random() * (W - 80), sy: 40 + Math.random() * (H - 80),
          tx: c.x + Math.cos(ang) * rad, ty: c.y + Math.sin(ang) * rad,
          x: 0, y: 0, r: 1.7 + Math.random() * 1.5
        });
      }
      edges = [];
      const within = Math.min(W, H) * 0.16;
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          if (nodes[i].ci === nodes[j].ci) {
            const d = Math.hypot(nodes[i].tx - nodes[j].tx, nodes[i].ty - nodes[j].ty);
            if (d < within && Math.random() < 0.55) edges.push([i, j, 1]);
          } else if (Math.random() < 0.008) edges.push([i, j, 0]);
        }
      }
    };

    const draw = (p) => {
      if (!W || !H) return;
      const appear = smooth(p / 0.22);
      const connect = smooth((p - 0.30) / 0.28);
      const cp = smooth((p - 0.55) / 0.38);
      const labelA = smooth((p - 0.72) / 0.18);

      for (const n of nodes) { n.x = n.sx + (n.tx - n.sx) * cp; n.y = n.sy + (n.ty - n.sy) * cp; }

      ctx.clearRect(0, 0, W, H);

      // edges
      for (const [a, b, within] of edges) {
        const na = nodes[a], nb = nodes[b];
        let alpha, blue = false;
        if (within) { alpha = connect * (0.10 + 0.16 * cp); blue = cp > 0.5; }
        else { alpha = connect * 0.05 * (1 - cp * 0.6); }
        if (alpha <= 0.002) continue;
        const active = hoverCluster >= 0 && na.ci === hoverCluster && within;
        ctx.strokeStyle = (blue || active) ? 'rgba(' + BLUE + ',' + (alpha + (active ? 0.2 : 0)).toFixed(3) + ')' : 'rgba(' + INK + ',' + alpha.toFixed(3) + ')';
        ctx.lineWidth = active ? 1.1 : 0.8;
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();
      }

      // nodes
      for (const n of nodes) {
        const active = hoverCluster >= 0 && n.ci === hoverCluster;
        const clustered = cp > 0.55;
        let a = 0.18 + 0.55 * appear;
        let fill = INK;
        if (active) { fill = BLUE; a = 0.9; }
        else if (clustered) { fill = BLUE; a = 0.30 + 0.35 * cp; }
        ctx.fillStyle = 'rgba(' + fill + ',' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (active ? 1.5 : 1) * (0.7 + 0.3 * appear), 0, Math.PI * 2); ctx.fill();
      }

      // cluster labels
      if (labelA > 0.01) {
        ctx.font = '500 13px "Geist", system-ui, sans-serif';
        ctx.textAlign = 'center';
        for (let ci = 0; ci < clusters.length; ci++) {
          let sx = 0, sy = 0, cnt = 0;
          for (const n of nodes) if (n.ci === ci) { sx += n.x; sy += n.y; cnt++; }
          if (!cnt) continue;
          const lx = sx / cnt, ly = sy / cnt - Math.min(W, H) * 0.135;
          const on = hoverCluster === ci;
          ctx.fillStyle = 'rgba(' + (on ? BLUE : INK) + ',' + (labelA * (on ? 0.95 : 0.7)).toFixed(3) + ')';
          ctx.fillText(clusters[ci], lx, ly);
        }
        ctx.textAlign = 'start';
      }

      if (capEl) {
        const t = p < 0.30 ? 'Every dispute is a single private data point.'
          : p < 0.62 ? 'Connect them across the private network.'
          : 'Patterns emerge that no single case can show.';
        if (capEl.textContent !== t) capEl.textContent = t;
      }
      if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
      if (insight) insight.classList.toggle('show', p > 0.82);
      if (hint) hint.style.opacity = p > 0.08 ? '0' : '1';
    };

    // pointer hover → highlight the cluster under the cursor
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mxC = e.clientX - rect.left; myC = e.clientY - rect.top;
      let best = 1e9, bi = -1;
      for (const n of nodes) { const d = (n.x - mxC) ** 2 + (n.y - myC) ** 2; if (d < best) { best = d; bi = n.ci; } }
      hoverCluster = best < 90 * 90 ? bi : -1;
    }, { passive: true });
    canvas.addEventListener('mouseleave', () => { hoverCluster = -1; });

    const progress = () => {
      const rect = section.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return 1;
      return Math.max(0, Math.min(1, -rect.top / total));
    };

    build();
    if (reduce) { draw(1); return; }

    let running = false, needsBuild = false;
    const loop = () => { if (!running) return; if (needsBuild) { build(); needsBuild = false; } draw(progress()); requestAnimationFrame(loop); };
    const io = new IntersectionObserver((ents) => {
      ents.forEach(e => { running = e.isIntersecting; if (running) requestAnimationFrame(loop); });
    }, { threshold: 0 });
    io.observe(section);
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { needsBuild = true; }, 150); }, { passive: true });
  };
  initEmerge();
})();
