/* Home PnL chart (lightweight-charts, vendored as lwc.js). Persistent node survives Home re-renders.
   Gestures (iPhone): one-finger drag = scroll through time, pinch = zoom, press & hold = crosshair, tap marker = trade. */
(function () {
  const LWC = window.LightweightCharts;
  const TZ = 'America/Toronto';
  const etFull = s => new Date(s * 1000).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
  const etTick = s => new Date(s * 1000).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const money = v => (v < 0 ? '-$' : '$') + Math.abs(v).toFixed(2);
  const sMoney = v => v == null ? '—' : (v >= 0 ? '+' : '') + money(v);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toS = t => Math.floor((typeof t === 'number' ? t * 1000 : Date.parse(t)) / 1000);
  const P = { el: null, chart: null, series: null, marks: [], data: [], base: 200, range: 'LIVE', sig: '', onRange: null };

  function build() {
    const el = document.createElement('div');
    el.className = 'pnlbox'; el.id = 'pnlbox';
    el.innerHTML = `<div class="pnlhead"><b>P&amp;L</b><span class="pnlnow" id="pnlnow">—</span></div>
      <div class="pnlwrap"><div class="pnlchart" id="pnlchart"></div><div class="pnltip" id="pnltip" hidden></div>
        <button class="pnlreset" id="pnlreset">Fit</button></div>
      <div class="pnlranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-pr="${r}" class="${r === P.range ? 'on' : ''}">${r === 'LIVE' ? '<i class="ldot"></i>' : ''}${r}</button>`).join('')}</div>
      <div class="pnlhint">Drag to scroll · pinch to zoom · hold for details · tap ▲▼ for the trade</div>
      <div class="pnltrade" id="pnltrade" hidden></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-pr]');
      if (b) { e.stopPropagation(); P.range = b.dataset.pr; el.querySelectorAll('[data-pr]').forEach(x => x.classList.toggle('on', x === b)); P.sig = ''; P.fit = true; P.onRange && P.onRange(P.range); return; }
      if (e.target.id === 'pnlreset') { e.stopPropagation(); P.chart && P.chart.timeScale().fitContent(); return; }
      if (e.target.closest('.pnlx')) { e.stopPropagation(); el.querySelector('#pnltrade').hidden = true; }
    });
    P.el = el;
    if (!LWC) { el.querySelector('#pnlchart').textContent = 'Chart failed to load'; return; }
    const ch = LWC.createChart(el.querySelector('#pnlchart'), {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: 'rgba(235,235,245,0.6)', fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 2,
        tickMarkFormatter: t => etTick(t) },
      localization: { timeFormatter: t => etFull(t), priceFormatter: v => sMoney(v) },
      crosshair: { mode: 0, vertLine: { color: 'rgba(235,235,245,0.4)', labelBackgroundColor: '#2c2c2e' },
        horzLine: { color: 'rgba(235,235,245,0.4)', labelBackgroundColor: '#2c2c2e' } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { pinch: true, mouseWheel: true, axisPressedMouseMove: { time: true, price: false }, axisDoubleClickReset: true },
      kineticScroll: { touch: true, mouse: false },
    });
    const s = ch.addBaselineSeries({
      baseValue: { type: 'price', price: 0 },
      topLineColor: '#00d35a', topFillColor1: 'rgba(0,211,90,0.32)', topFillColor2: 'rgba(0,211,90,0.02)',
      bottomLineColor: '#ff453a', bottomFillColor1: 'rgba(255,69,58,0.02)', bottomFillColor2: 'rgba(255,69,58,0.32)',
      lineWidth: 3, priceLineVisible: false, lastValueVisible: true,
    });
    s.createPriceLine({ price: 0, color: 'rgba(235,235,245,0.35)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    P.chart = ch; P.series = s;
    const tip = el.querySelector('#pnltip');
    ch.subscribeCrosshairMove(p => {
      if (!p || !p.time || !p.point || p.point.x < 0) { tip.hidden = true; return; }
      const d = p.seriesData.get(s); if (!d) { tip.hidden = true; return; }
      const pc = P.base ? d.value / P.base * 100 : 0;
      tip.innerHTML = `<span>${esc(etFull(p.time))}</span><b class="${d.value >= 0 ? 'up' : 'down'}">${sMoney(d.value)}</b><i class="${d.value >= 0 ? 'up' : 'down'}">${pc >= 0 ? '+' : ''}${pc.toFixed(2)}%</i>`;
      tip.hidden = false;
      const w = el.querySelector('.pnlwrap').clientWidth;
      tip.style.left = Math.max(4, Math.min(w - tip.offsetWidth - 60, p.point.x - tip.offsetWidth / 2)) + 'px';
    });
    ch.subscribeClick(p => {
      if (!p || p.time == null || !P.marks.length) return;
      const vr = ch.timeScale().getVisibleRange();
      const tol = vr ? Math.max(30, (vr.to - vr.from) / 25) : 120;
      let best = null;
      P.marks.forEach(m => { const d = Math.abs(m._s - p.time); if (d <= tol && (!best || d < best.d)) best = { d, m }; });
      if (best) showTrade(best.m);
    });
  }

  function showTrade(m) {
    const box = P.el.querySelector('#pnltrade');
    const buy = m.side === 'buy';
    const name = m.label || (m.text || '').replace(/^Bought /, '') || 'coin';
    const fomo = m.coin_url && /^https:\/\/fomo\.family\//.test(m.coin_url) ? m.coin_url : null;
    box.innerHTML = `<div class="pnltop"><span class="spill ${buy ? 'in' : 'sold'}">${buy ? '▲ BUY' : '▼ SELL'}</span><b>${esc(name)}</b>
        <button class="pnlx" aria-label="Close">✕</button></div>
      <div class="pnlrow"><span>${esc(etFull(m._s))}</span><span>Size <b>${m.size != null ? money(m.size) : '—'}</b></span>
        ${buy ? '' : `<span>P&amp;L <b class="${(m.pnl || 0) >= 0 ? 'up' : 'down'}">${sMoney(m.pnl)}</b></span>`}
        ${!buy && m.exit ? `<span>${esc(m.exit)}</span>` : ''}</div>
      <div class="olinks">${fomo ? `<a class="ofomo" href="${esc(fomo)}" target="_blank" rel="noopener">Open on FOMO ↗</a>` : ''}
        <a class="odex" href="https://dexscreener.com/solana/${esc(encodeURIComponent(m.mint || ''))}" target="_blank" rel="noopener">DexScreener</a></div>`;
    box.hidden = false;
  }

  function update(data) {
    if (!P.el) build();
    if (!data || !P.series) return;
    P.base = data.base || P.base;
    const byS = new Map();
    (data.points || []).forEach(p => byS.set(toS(p.t), +(p.v - P.base).toFixed(2)));
    const pts = [...byS.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    const sig = data.range + ':' + pts.length + ':' + (pts.length ? pts[pts.length - 1].time + '/' + pts[pts.length - 1].value : '') + ':' + (data.marks || []).length;
    const now = P.el.querySelector('#pnlnow');
    if (pts.length) {
      const v = pts[pts.length - 1].value, pc = v / P.base * 100;
      now.className = 'pnlnow ' + (v >= 0 ? 'up' : 'down');
      now.textContent = `${sMoney(v)} · ${pc >= 0 ? '+' : ''}${pc.toFixed(2)}%`;
      P.el.classList.toggle('pnl-up', v >= 0);
      P.el.classList.toggle('pnl-dn', v < 0);
    }
    if (sig === P.sig) return;
    P.sig = sig;
    const range = P.chart.timeScale().getVisibleLogicalRange();
    const atEnd = !range || range.to >= P.data.length - 2;
    P.data = pts;
    if (pts.length === 1) pts.unshift({ time: pts[0].time - 60, value: pts[0].value });
    const first = !P.drawn;
    P.series.setData(pts);
    const wrap = P.el.querySelector('#pnlchart');
    if (first && wrap && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      wrap.classList.remove('drawin'); void wrap.offsetWidth; wrap.classList.add('drawin');
    }
    P.drawn = true;
    const times = pts.map(p => p.time);
    const snap = s => { let lo = 0, hi = times.length - 1; if (!times.length) return s; if (s <= times[0]) return times[0];
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= s) lo = mid; else hi = mid - 1; } return times[lo]; };
    P.marks = (data.marks || []).map(m => ({ ...m, _s: toS(m.t) })).filter(m => !times.length || m._s >= times[0] - 60);
    const mk = P.marks.map(m => {
      const buy = m.side === 'buy' || m.kind === 'bought';
      const win = (m.pnl != null ? m.pnl : (m.kind === 'gain' ? 1 : -1)) >= 0;
      return { time: snap(m._s), position: buy ? 'belowBar' : 'aboveBar', shape: buy ? 'arrowUp' : 'arrowDown',
               color: buy ? '#38d6f5' : (win ? '#16e07a' : '#ff4d5e'), size: 1,
               text: buy ? `${m.label || ''} bought ${m.size != null ? '$' + (+m.size).toFixed(2) : ''}` : `${m.label || ''} ${m.exit === 'stop' ? 'stop ' : ''}${m.text || ''}` };
    }).sort((a, b) => a.time - b.time);
    P.series.setMarkers(mk);
    if (P.fit || !range) {
      P.chart.timeScale().fitContent(); P.fit = false;
      const first = P.marks.length ? Math.min(...P.marks.map(m => m._s)) : null;
      if (first && times.length && first - 1800 > times[0]) {  // focus on the trading window; drag left for older history
        try { P.chart.timeScale().setVisibleRange({ from: snap(first - 1800), to: times[times.length - 1] }); } catch (e) {}
      }
    }
    else if (atEnd) P.chart.timeScale().scrollToRealTime();
  }

  function mount(ph) {
    if (!P.el) build();
    if (ph && ph.parentNode) ph.replaceWith(P.el);
  }
  window.PnlChart = { mount, update, state: P, showTrade };
})();
