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
  function line(cv, data, prev) {
    const pts = (data.points || []).map(p => ({ t: ts(p.t), v: p.v }));
    const draw = (k) => {
      const [x, W, H] = prep(cv);
      const top = 64, bot = H - 12;
      const start = data.start;
      if (!pts.length) {
        x.setLineDash([4, 5]); x.strokeStyle = C.t3; x.lineWidth = 1;
        x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke(); return;
      }
      let vs = pts.map(p => p.v).concat(start != null ? [start] : []);
      let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
      const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
      const X = t => (t - t0) / (t1 - t0) * W, Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
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
        x.beginPath(); x.arc(mx, Y(near.v), 3, 0, 7); x.fillStyle = col; x.fill(); x.globalAlpha = 1;
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
  window.Charts = { line, candles, ring };
})();
