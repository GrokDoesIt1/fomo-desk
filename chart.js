/* Canvas charts, devicePixelRatio aware: Home line, Coin candles, score ring. */
(function () {
  const C = { green: '#00d35a', red: '#ff453a', blue: '#0a84ff', orange: '#ff9f0a', t2: 'rgba(235,235,245,0.6)', t3: 'rgba(235,235,245,0.3)', c2: '#2c2c2e' };
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function prep(cv) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * d)); cv.height = Math.max(1, Math.round(r.height * d));
    const x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, r.width, r.height);
    return [x, r.width, r.height];
  }
  const ts = t => typeof t === 'number' ? t * 1000 : Date.parse(t);

  /* line: {points:[{t,v}], marks:[{t,kind,text}], start} ; prevLen for slide-in */
  const VIEW = { z: null }; // zoom window {a,b} in ms, survives re-renders
  function line(cv, data, prev) {
    let pts = (data.points || []).map(p => ({ t: ts(p.t), v: p.v }));
    if (VIEW.z && VIEW.rng === data.range) {
      const inz = pts.filter(p => p.t >= VIEW.z.a && p.t <= VIEW.z.b);
      if (inz.length >= 2) pts = inz; else VIEW.z = null;
    }
    const draw = (k) => {
      const [x, W, H] = prep(cv);
      const marks = data.marks || [];
      // Reserve mark rows only when marks exist — avoids ~60px empty gap on flat paper equity.
      const top = marks.length ? Math.min(64, 16 + marks.length * 22) : 10;
      const bot = H - 10;
      const start = data.start;
      if (!pts.length) {
        x.setLineDash([4, 5]); x.strokeStyle = C.t3; x.lineWidth = 1;
        x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); return;
      }
      let vs = pts.map(p => p.v).concat(start != null ? [start] : []);
      let lo = Math.min(...vs), hi = Math.max(...vs);
      const flat = (hi - lo < 1e-9);
      if (flat) { hi += 0.5; lo -= 0.5; } // tight band so a flat line isn't lost in a tall empty chart
      const pad = (hi - lo) * (flat ? 0.15 : 0.08); lo -= pad; hi += pad;
      const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
      const X = t => (t - t0) / (t1 - t0) * W, Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
      cv._g = { pts, t0, t1, W, H, X, Y, start, hits: [] };
      if (start != null) {
        x.setLineDash([4, 5]); x.strokeStyle = C.t3; x.lineWidth = 1;
        x.beginPath(); x.moveTo(0, Y(start)); x.lineTo(W, Y(start)); x.stroke(); x.setLineDash([]);
      }
      const n = pts.length;
      const shown = pts.map((p, i) => (i === n - 1 && k < 1 && n > 1) ? { t: pts[n - 2].t + (p.t - pts[n - 2].t) * k, v: pts[n - 2].v + (p.v - pts[n - 2].v) * k } : p);
      const g = x.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(0,211,90,0.28)'); g.addColorStop(1, 'rgba(0,211,90,0)');
      x.beginPath(); shown.forEach((p, i) => i ? x.lineTo(X(p.t), Y(p.v)) : x.moveTo(X(p.t), Y(p.v)));
      x.lineTo(X(shown[shown.length - 1].t), bot); x.lineTo(X(shown[0].t), bot); x.closePath(); x.fillStyle = g; x.fill();
      x.beginPath(); shown.forEach((p, i) => i ? x.lineTo(X(p.t), Y(p.v)) : x.moveTo(X(p.t), Y(p.v)));
      x.strokeStyle = C.green; x.lineWidth = 2; x.lineJoin = 'round'; x.stroke();
      // marks above the line, never overlapping: a later mark moves up a row
      x.font = '600 12px -apple-system,system-ui'; x.textBaseline = 'middle';
      const rows = [];
      (data.marks || []).slice().sort((a, b) => ts(a.t) - ts(b.t)).forEach(m => {
        const mt = ts(m.t); if (mt < t0) return;
        const mx = Math.min(Math.max(X(mt), 4), W - 4);
        const w = x.measureText(m.text).width + 14;
        let left = Math.min(Math.max(mx - w / 2, 2), W - w - 2), r = 0;
        while (rows[r] && rows[r].some(s => left < s[1] + 4 && left + w > s[0] - 4)) r++;
        (rows[r] = rows[r] || []).push([left, left + w]);
        const near = pts.reduce((a, p) => Math.abs(p.t - mt) < Math.abs(a.t - mt) ? p : a, pts[0]);
        const y = Math.max(12, Math.min(Y(near.v) - 18 - r * 24, top + 40) - r * 0);
        const yy = Math.max(12, Y(near.v) - 20 - r * 24);
        const col = m.kind === 'bought' ? C.blue : (m.kind === 'gain' ? C.green : C.red);
        x.globalAlpha = (data._fade || 1);
        x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(left, yy - 10, w, 20, 10) : x.rect(left, yy - 10, w, 20); x.fill();
        x.fillStyle = m.kind === 'bought' ? '#fff' : '#000'; x.fillText(m.text, left + 7, yy + 0.5);
        x.beginPath(); x.arc(mx, Y(near.v), 4, 0, 7); x.fillStyle = col; x.fill(); x.globalAlpha = 1;
        cv._g.hits.push({ x0: left, x1: left + w, y0: yy - 12, y1: yy + 12, mx, my: Y(near.v), m });
        void y;
      });
    };
    if (reduce() || !prev || prev >= pts.length) { draw(1); return; }
    const t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 250); data._fade = Math.min(1, (now - t0) / 200); draw(1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  /* candles: [{t,o,h,l,c,v}], exitLine price (orange dashed), entry */
  function candles(cv, cs, exitLine) {
    const [x, W, H] = prep(cv);
    if (!cs || !cs.length) { x.fillStyle = C.t2; x.font = '14px -apple-system'; x.textAlign = 'center'; x.fillText('No candles yet', W / 2, H / 2); return; }
    cs = cs.slice(-90);
    const vh = 44, top = 10, bot = H - vh - 8;
    let lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < 1e-18) { hi *= 1.01; lo *= 0.99; }
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    const bw = W / Math.max(cs.length, 30), vmax = Math.max(...cs.map(c => c.v || 0), 1e-9);
    cs.forEach((c, i) => {
      const cx = i * bw + bw / 2, col = c.c >= c.o ? C.green : C.red;
      x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1;
      x.beginPath(); x.moveTo(cx, Y(c.h)); x.lineTo(cx, Y(c.l)); x.stroke();
      const y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c));
      x.fillRect(cx - bw * 0.35, y1, bw * 0.7, Math.max(1, y2 - y1));
      const vhh = (c.v || 0) / vmax * vh; x.globalAlpha = 0.45; x.fillRect(cx - bw * 0.35, H - vhh, bw * 0.7, vhh); x.globalAlpha = 1;
    });
    if (exitLine) {
      x.setLineDash([5, 4]); x.strokeStyle = C.orange; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(0, Y(exitLine)); x.lineTo(W, Y(exitLine)); x.stroke(); x.setLineDash([]);
      x.fillStyle = C.orange; x.font = '600 11px -apple-system'; x.fillText('Risk trailing stop', 6, Y(exitLine) - 6);
    }
  }

  function ring(cv, score, min) {
    const [x, W, H] = prep(cv), r = Math.min(W, H) / 2 - 8, cx = W / 2, cy = H / 2;
    x.lineWidth = 10; x.lineCap = 'round'; x.strokeStyle = C.c2;
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    if (score != null) {
      x.strokeStyle = score >= (min || 70) ? C.green : C.red;
      x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100); x.stroke();
    }
    x.fillStyle = '#fff'; x.font = '700 34px -apple-system,"SF Pro Display"'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(score == null ? '–' : String(Math.round(score)), cx, cy);
  }
  /* crosshair + tooltip, tap marks, drag pan, pinch / wheel zoom, double-tap reset */
  function interact(cv, data, onMark) {
    const wrap = cv.parentElement; if (!wrap) return;
    let tip = wrap.querySelector('.ctip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'ctip'; tip.hidden = true; wrap.appendChild(tip); }
    let ov = wrap.querySelector('.cxh');
    if (!ov) { ov = document.createElement('canvas'); ov.className = 'cxh'; wrap.appendChild(ov); }
    VIEW.rng = data.range;
    const fmtT = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
    const hide = () => { tip.hidden = true; const [x] = prep(ov); void x; };
    function show(px) {
      const g = cv._g; if (!g || !g.pts.length) return;
      const t = g.t0 + px / g.W * (g.t1 - g.t0);
      const p = g.pts.reduce((a, q) => Math.abs(q.t - t) < Math.abs(a.t - t) ? q : a, g.pts[0]);
      const [x, W, H] = prep(ov), cx = g.X(p.t), cy = g.Y(p.v);
      x.strokeStyle = 'rgba(235,235,245,0.45)'; x.lineWidth = 1; x.setLineDash([3, 3]);
      x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, H); x.moveTo(0, cy); x.lineTo(W, cy); x.stroke(); x.setLineDash([]);
      x.beginPath(); x.arc(cx, cy, 5, 0, 7); x.fillStyle = C.green; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 2; x.stroke();
      const base = g.start != null ? g.start : g.pts[0].v, pnl = p.v - base;
      tip.innerHTML = `<span>${fmtT(p.t)}</span><b>${money(p.v)}</b><i class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${money(pnl)}</i>`;
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(cx - tip.offsetWidth / 2, 4), W - tip.offsetWidth - 4) + 'px';
    }
    function markAt(px, py) {
      const g = cv._g; if (!g) return null;
      return (g.hits || []).find(h => (px >= h.x0 && px <= h.x1 && py >= h.y0 && py <= h.y1) || Math.hypot(px - h.mx, py - h.my) < 16);
    }
    function markTip(h) {
      const m = h.m, t = ts(m.t);
      tip.innerHTML = m.side === 'buy'
        ? `<span>${fmtT(t)} · BUY</span><b>${m.text}</b><i>${m.size != null ? '$' + Number(m.size).toFixed(2) + ' in' : ''} · tap again to open</i>`
        : `<span>${fmtT(t)} · SELL ${m.label || ''}</span><b class="${(m.pnl || 0) >= 0 ? 'up' : 'down'}">${m.pnl != null ? ((m.pnl >= 0 ? '+' : '') + money(m.pnl)) : m.text}</b><i>${m.exit || ''} · tap again to open</i>`;
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(h.mx - tip.offsetWidth / 2, 4), cv._g.W - tip.offsetWidth - 4) + 'px';
    }
    const redraw = () => line(cv, data, null);
    const zoom = (cx, f) => {
      const g = cv._g; if (!g) return;
      const all = (data.points || []).map(p => ts(p.t)); if (all.length < 3) return;
      const A = all[0], B = all[all.length - 1];
      const a0 = VIEW.z ? VIEW.z.a : A, b0 = VIEW.z ? VIEW.z.b : B, at = a0 + cx / g.W * (b0 - a0);
      let a = at - (at - a0) * f, b = at + (b0 - at) * f;
      if (b - a < 60000) return;
      a = Math.max(A, a); b = Math.min(B, b);
      VIEW.z = (a <= A && b >= B) ? null : { a, b }; redraw();
    };
    const pan = dx => {
      if (!VIEW.z || !cv._g) return;
      const all = (data.points || []).map(p => ts(p.t)), A = all[0], B = all[all.length - 1];
      const span = VIEW.z.b - VIEW.z.a, sh = -dx / cv._g.W * span;
      let a = Math.max(A, Math.min(B - span, VIEW.z.a + sh)); VIEW.z = { a, b: a + span }; redraw();
    };
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const touches = new Map(); let pinch0 = null, last = null, armed = null, lastTap = 0, moved = false;
    ov.style.touchAction = 'pan-y';
    ov.onpointerdown = e => {
      VIEW.busy = Date.now() + 4000; ov.setPointerCapture(e.pointerId); touches.set(e.pointerId, pos(e)); moved = false;
      if (touches.size === 2) { const [p1, p2] = [...touches.values()]; pinch0 = { d: Math.abs(p1[0] - p2[0]) || 1, c: (p1[0] + p2[0]) / 2 }; hide(); return; }
      last = pos(e); const h = markAt(...last);
      if (h) { if (armed === h.m) { onMark && onMark(h.m); armed = null; } else { armed = h.m; markTip(h); } return; }
      armed = null; show(last[0]);
    };
    ov.onpointermove = e => { VIEW.busy = Date.now() + 2500;
      if (!touches.has(e.pointerId)) { if (e.pointerType === 'mouse') { const p = pos(e); markAt(...p) ? markTip(markAt(...p)) : show(p[0]); } return; }
      touches.set(e.pointerId, pos(e));
      if (touches.size === 2 && pinch0) {
        const [p1, p2] = [...touches.values()], d = Math.abs(p1[0] - p2[0]) || 1;
        if (Math.abs(d / pinch0.d - 1) > 0.08) { zoom(pinch0.c, pinch0.d / d); pinch0.d = d; }
        return;
      }
      const p = pos(e);
      if (VIEW.z && e.pointerType === 'mouse' && e.buttons && last) { pan(p[0] - last[0]); moved = true; }
      else show(p[0]);
      last = p;
    };
    const up = e => {
      touches.delete(e.pointerId); if (touches.size < 2) pinch0 = null;
      const now = Date.now();
      if (!moved && now - lastTap < 300 && VIEW.z) { VIEW.z = null; redraw(); }
      lastTap = now;
      if (!touches.size && !armed) setTimeout(() => { if (!touches.size && !armed) hide(); }, e.pointerType === 'mouse' ? 0 : 1800);
    };
    ov.onpointerup = up; ov.onpointercancel = up;
    ov.onpointerleave = e => { if (e.pointerType === 'mouse' && !armed) hide(); };
    ov.onwheel = e => { if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return; e.preventDefault(); zoom(pos(e)[0], e.deltaY > 0 ? 1.2 : 0.83); };
    let rb = wrap.querySelector('.zreset');
    if (!rb) { rb = document.createElement('button'); rb.className = 'zreset'; rb.textContent = 'Reset zoom'; wrap.appendChild(rb); }
    rb.hidden = !VIEW.z; rb.onclick = () => { VIEW.z = null; redraw(); rb.hidden = true; };
    const ro = redraw; cv._zoomHook = () => { rb.hidden = !VIEW.z; }; void ro;
    const origRedraw = redraw;
    // keep reset button in sync after zoom/pan
    ov.addEventListener('pointerup', () => { rb.hidden = !VIEW.z; }); ov.addEventListener('wheel', () => { rb.hidden = !VIEW.z; }); void origRedraw;
  }
  window.Charts = { line, candles, ring, interact, view: VIEW };
})();
