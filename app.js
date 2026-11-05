/* Grok Bot desk app. Plan A: #t= token -> localStorage -> /api + SSE. Plan B: #d= path -> poll /d/{path}/*.json every 15s.
   Every FOMO link shown here comes from the server (coin_url / profile_url / signup_url built by links.py). */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd = (v, sign) => v == null ? 'n/a' : (sign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '')) + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const short = v => v == null ? 'n/a' : (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0));
  const pct = (v, d) => v == null ? 'n/a' : (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const price = p => p == null ? 'n/a' : p >= 1 ? '$' + p.toFixed(4) : '$' + p.toPrecision(4);
  const COLORS = { scanner: '#64d2ff', auditor: '#64d2ff', analyst: '#ffd60a', executor: '#00d35a', risk: '#ff6b9a' };
  const NAMES = { scanner: 'Scanner', auditor: 'Auditor', analyst: 'Analyst', executor: 'Executor', risk: 'Risk' };

  // ---------- auth / plan ----------
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('t')) { localStorage.setItem('desk_t', h.get('t')); localStorage.removeItem('desk_d'); }
  if (h.get('d')) { localStorage.setItem('desk_d', h.get('d')); localStorage.removeItem('desk_t'); }
  if (h.get('t') || h.get('d')) history.replaceState(null, '', location.pathname);
  const TOKEN = localStorage.getItem('desk_t'), DPATH = localStorage.getItem('desk_d');
  const PLAN = TOKEN ? 'A' : (DPATH ? 'B' : null);

  const S = { tab: 'home', range: 'LIVE', state: null, chart: null, activity: null, account: null, decisions: {}, lastOk: null, overlay: null, prevPts: 0, bal: null, searchIdx: null };

  async function get(path) {
    let url, opt = { cache: 'no-store' };
    if (PLAN === 'A') { url = '/api' + path; opt.headers = { Authorization: 'Bearer ' + TOKEN }; }
    else {
      // ROOT is '/' locally or '/fomo-desk/' on GitHub Pages project site
      const ROOT = (location.pathname.replace(/\/[^/]*$/, '/') || '/');
      const base = ROOT + 'd/' + encodeURIComponent(DPATH) + '/';
      const m = path.match(/^\/chart\?range=(\w+)/);
      if (m) url = base + 'chart-' + m[1] + '.json';
      else if (path.startsWith('/activity')) url = base + 'activity.json';
      else if (path.startsWith('/search')) url = base + 'search.json';
      else url = base + path.slice(1).replace(/\?.*$/, '') + '.json';
    }
    const r = await fetch(url, opt);
    if (r.status === 404 && PLAN === 'B' && /\/(coin|audit)\//.test(path)) return null;
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  async function post(path, body) {
    if (PLAN !== 'A') throw new Error('Read-only here. Use Telegram.');
    const r = await fetch('/api' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  // ---------- error row ----------
  let retryIn = 0, retryTimer = null;
  function offline() {
    const el = $('#err'); el.hidden = false; retryIn = PLAN === 'B' ? 15 : 5;
    clearInterval(retryTimer);
    const tick = () => { el.textContent = `Desk offline · retrying in ${retryIn}s · last update ${S.lastOk ? hm(S.lastOk) : 'never'}`; if (retryIn-- <= 0) { clearInterval(retryTimer); refresh(); } };
    tick(); retryTimer = setInterval(tick, 1000);
  }
  function online() { S.lastOk = new Date().toISOString(); $('#err').hidden = true; clearInterval(retryTimer); }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.k); toast.k = setTimeout(() => el.hidden = true, 1800); }

  // ---------- odometer ----------
  function odometer(el, text) {
    const prev = el.dataset.v || '';
    if (reduce() || !prev || prev.length !== text.length) {
      el.innerHTML = [...text].map(ch => /\d/.test(ch) ? `<span class="d"><span style="transform:translateY(-${ch}em)">${[...'0123456789'].map(n => `<i>${n}</i>`).join('')}</span></span>` : `<span>${esc(ch)}</span>`).join('');
    } else {
      const ds = el.querySelectorAll('.d>span'); let di = ds.length, k = 0;
      for (let i = text.length - 1; i >= 0; i--) {
        if (!/\d/.test(text[i])) continue; di--;
        if (text[i] !== prev[i]) { const s = ds[di]; s.style.transitionDelay = (k++ * 30) + 'ms'; s.style.transform = `translateY(-${text[i]}em)`; }
      }
    }
    el.dataset.v = text;
  }

  // ---------- skeletons ----------
  const skel = (hgt, mt) => `<div class="skel" style="height:${hgt}px;margin-top:${mt || 10}px"></div>`;

  // ---------- HOME ----------
  function navbar() {
    const unread = S.state && S.state.unread > 0;
    return `<div class="nav"><button class="icon" data-go="account" aria-label="Account"><span class="avatar">G</span></button>
      <button class="title" data-go="agents">Grok Bot ›</button>
      <button class="icon" data-act="search" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
      <button class="icon" data-act="bell" aria-label="Pushes"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>${unread ? '<span class="dot"></span>' : ''}</button></div>`;
  }
  function renderHome() {
    const st = S.state;
    if (!st) { $('#view').innerHTML = navbar() + skel(66, 6) + skel(22) + skel(240) + skel(44) + skel(300, 30); return; }
    const up = st.todayPct >= 0;
    $('#view').innerHTML = navbar() + `
      <div class="balrow"><div class="bal" id="bal"></div>${st.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : ''}</div>
      <div class="today ${up ? 'up' : 'down'}">${pct(st.todayPct)} today <span class="pill mult">${st.multiplier.toFixed(2)}×</span></div>
      <div class="chartwrap"><canvas id="line"></canvas>${!S.chart || S.chart.points.length < 2 ? '<div class="empty">Waiting for the first trade</div>' : ''}</div>
      <div class="ranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-range="${r}" class="${r === S.range ? 'on' : ''}">${r}</button>`).join('')}</div>
      <h2>Agents · ${st.running} running</h2><div class="carousel">${st.agents.map(agentCard).join('')}</div>
      <h2>Activity <button data-go="activity">See all</button></h2><div id="act5">${activityList(S.activity, 5)}</div>`;
    odometer($('#bal'), usd(st.balance));
    drawLine(); drawRings();
  }
  function drawLine() { const cv = $('#line'); if (cv && S.chart) { Charts.line(cv, S.chart, S.prevPts); S.prevPts = S.chart.points.length; } }
  function drawRings() { document.querySelectorAll('canvas[data-ring]').forEach(cv => Charts.ring(cv, cv.dataset.ring === '' ? null : +cv.dataset.ring, +cv.dataset.min)); }

  function agentCard(a) {
    const col = COLORS[a.name], hd = `<div class="hd"><span class="sdot ${a.paused || !a.alive ? 'off' : ''}" style="background:${a.paused || !a.alive ? '' : col}"></span>${NAMES[a.name]}${a.paused ? ' <span class="t2">· paused</span>' : ''}</div>`;
    let body = '';
    if (a.name === 'scanner') {
      body = `<div class="big num" style="color:${col}">${a.pools} pools</div><div class="sub">${a.waiting} in the waiting room</div><div class="body feed">` +
        (a.feed.length ? a.feed.map(f => `<a class="r" href="${esc(f.coin_url)}" target="_blank" rel="noopener"><span class="${f.verdict === 'kill' ? 'k' : ''}">${esc(f.label)}</span><span class="${f.verdict === 'kill' ? 'down' : 'up'}">${f.verdict === 'kill' ? esc(f.reason) : '→ auditor'}</span></a>`).join('') : '<div class="t2">Listening for graduations</div>') + '</div>';
    } else if (a.name === 'auditor') {
      const l = a.last, ls = l ? l.layers : [];
      const strips = [1, 2, 3, 4, 5, 6, 7, 8].map(n => { const x = ls.find(y => y.n === n); return `<i class="${!x ? '' : x.pass === true ? 'g' : x.pass === false ? 'r' : 'n'}"></i>`; }).join('');
      const line = !l ? 'No coin taken apart yet' : (!l.complete && !l.reason ? 'taking apart...' : (l.passed ? '8/8 → Executor' : esc(l.reason)));
      body = `<div class="big num">${a.taken} taken apart</div><div class="sub">${a.rejected} rejected${a.enabled ? '' : ' · off'}</div><div class="body">${l ? `<div class="t2">${esc(l.label)}</div>` : ''}<div class="strips">${strips}</div><div class="${l && l.reason ? 'down' : l && l.passed ? 'up' : 't2'}">${line}</div></div>`;
    } else if (a.name === 'analyst') {
      const l = a.last;
      body = `<div class="big" style="color:${col}">Scoring</div><div class="sub">${a.count} asked · ${a.mode === 'rules' ? 'rules' : 'Jev'}</div><div class="body"><canvas class="ring" data-ring="${l ? l.score : ''}" data-min="${a.min_score}"></canvas><div class="t2" style="text-align:center">${l ? esc(l.label) + ' · ' + (l.passed ? 'pass' : esc(l.reason)) : 'Nothing scored yet'}</div></div>`;
    } else if (a.name === 'executor') {
      const l = a.last, filled = l && (l.status === 'filled' || l.status === 'bought');
      body = `<div class="big num" style="color:${col}">${a.trades} trades</div><div class="sub">${l ? usd(l.size) + ' · ' + l.stack_pct + '% of stack' : a.stack_pct + '% of stack per ticket'}</div><div class="body">${l ? `<div class="t2">${esc(l.label)}</div><div class="bar"><i style="width:${filled ? 100 : l.status === 'pushed' ? 60 : 20}%"></i></div><div class="${filled ? 'up' : 't2'}">${filled ? '✓ Filled' : (l.status === 'pushed' ? 'Executing... 60%' : esc(l.status))}</div>` : '<div class="t2">Waiting for a cleared coin</div>'}</div>`;
    } else if (a.name === 'risk') {
      const l = a.last;
      body = `<div class="big" style="color:${col}">${a.guarding || !l ? 'Guarding' : esc(l.outcome)}</div><div class="sub">${a.open} open · ${a.count} exits tonight</div><div class="body">${l ? `<div class="t2">${esc(l.outcome)} ${esc(l.label)} · <span class="${l.pnl >= 0 ? 'up' : 'down'}">${usd(l.pnl, true)}</span></div>` : '<div class="t2">No exits yet</div>'}<div style="display:flex;gap:8px"><span class="pill mono" style="background:rgba(255,69,58,.16);color:#ff453a">stop -${a.stop_pct}%</span><span class="pill mono" style="background:rgba(0,211,90,.16);color:#00d35a">trail ${a.trail_pct}%</span></div></div>`;
    }
    return `<div class="card" data-agent="${a.name}">${hd}${body}</div>`;
  }

  // ---------- ACTIVITY ----------
  function activityList(act, n) {
    if (!act) return skel(60) + skel(60) + skel(60);
    const rows = n ? act.rows.slice(0, n) : act.rows;
    if (!rows.length) return '<div class="list"><div class="empty-msg">Nothing yet tonight</div></div>';
    return '<div class="list">' + rows.map(r => {
      const vcls = r.kind === 'sold' ? 'up' : r.kind === 'stopped' ? 'down' : r.kind === 'rejected' ? 't2' : '';
      return `<button class="row" style="width:100%;text-align:left" data-open="${r.opens}" data-mint="${esc(r.mint)}"><div class="m"><b>${esc(r.title)}</b><span>${esc(r.subtitle)}</span></div><div class="v ${vcls}">${esc(r.value)}</div></button>`;
    }).join('') + '</div>';
  }
  function renderActivity() {
    $('#view').innerHTML = `<div class="nav"><div class="title" style="font-size:28px">Activity</div></div>${activityList(S.activity)}` +
      (S.activity && S.activity.next && PLAN === 'A' ? `<button class="btn" style="width:100%;margin-top:12px" data-act="more">Load more</button>` : '');
  }

  // ---------- AGENTS ----------
  function renderAgents() {
    const st = S.state;
    if (!st) { $('#view').innerHTML = '<div class="nav"><div class="title" style="font-size:28px">Agents</div></div>' + skel(260) + skel(260); return; }
    const riskLocked = st.agents.find(a => a.name === 'risk').open > 0;
    $('#view').innerHTML = `<div class="nav"><div class="title" style="font-size:28px">Agents</div></div>` + st.agents.map(a => {
      const d = S.decisions[a.name], locked = a.name === 'risk' && riskLocked && !a.paused;
      const cnt = a.name === 'scanner' ? a.count + ' scanned' : a.name === 'auditor' ? a.taken + ' taken apart' : a.name === 'analyst' ? a.count + ' scored' : a.name === 'executor' ? a.trades + ' trades' : a.count + ' exits';
      return `<div class="agentfull" id="ag-${a.name}"><div class="hd"><span class="sdot ${a.paused || !a.alive ? 'off' : ''}" style="background:${a.paused || !a.alive ? '' : COLORS[a.name]}"></span><b>${NAMES[a.name]}</b>
        <span class="t2 num">${cnt}</span><button class="swbtn" data-pause="${a.name}" ${locked || PLAN !== 'A' ? 'disabled' : ''} aria-label="pause"><span class="switch ${a.paused ? '' : 'on'}" ${locked || PLAN !== 'A' ? 'disabled' : ''}></span></button></div>
        <div class="t2" style="font-size:13px;margin:4px 0 8px">${a.paused ? 'paused' : (a.alive ? 'running' : 'no heartbeat')}${locked ? ' · locked while a position is open' : ''}</div>
        ${d ? (d.rows.length ? d.rows.map(r => `<div class="dec"><span class="tm num">${hm(r.ts)}</span><a class="c" href="${esc(r.coin_url)}" target="_blank" rel="noopener">${esc(r.label)}</a><span class="rs">${esc(r.verdict)}${r.reason ? ' · ' + esc(r.reason) : ''}</span></div>`).join('') : `<div class="t2" style="padding:8px 0">${a.name === 'scanner' ? 'Listening for graduations' : 'No decisions yet'}</div>`) : skel(120)}
        <button class="btn" style="margin-top:10px" data-settings="${a.name}">Settings</button></div>`;
    }).join('');
  }

  // ---------- ACCOUNT ----------
  function renderAccount() {
    const a = S.account;
    if (!a) { $('#view').innerHTML = '<div class="nav"><div class="title" style="font-size:28px">Account</div></div>' + skel(44) + skel(200) + skel(400); return; }
    const ro = PLAN !== 'A';
    const standalone = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    $('#view').innerHTML = `<div class="nav"><div class="title" style="font-size:28px">Account</div></div>
      <div class="seg"><button data-mode="PAPER" class="${a.mode === 'PAPER' ? 'on' : ''}" ${ro ? 'disabled' : ''}>PAPER</button><button data-mode="LIVE" class="${a.mode === 'LIVE' ? 'on' : ''}" ${ro ? 'disabled' : ''}>LIVE</button></div>
      <div class="t2" style="font-size:13px;margin:6px 4px">${a.liveAllowed ? 'LIVE unlocked after a full PAPER night' : 'LIVE unlocks after 1 full PAPER night'}${ro ? ' · read-only here, change it in Telegram' : ''}</div>
      <div class="list" style="margin-top:12px">
        <div class="row"><div class="m"><b>Stack</b><span>${a.mode === 'PAPER' ? 'PAPER stack' : 'LIVE stack'}${a.ticket && a.ticket.message ? ' · ' + esc(a.ticket.message) : ''}</span></div><div class="v num">${usd(a.stack)}</div></div>
        ${a.profile_url ? `<a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><div class="m"><b>Your FOMO profile</b><span>@${esc(a.handle)}</span></div><div class="v t3">›</div></a>` : ''}
        <button class="row" style="width:100%;text-align:left" data-act="invite"><div class="m"><b>Invite a friend</b><span>Share your FOMO link</span></div><div class="v t3">›</div></button>
        <div class="row"><div class="m"><b>Telegram</b><span>${a.telegram.configured ? (a.telegram.owner ? 'connected' : 'bot set, send it /start') : 'not connected'}</span></div>${ro ? '' : '<button class="btn" data-act="testpush">Send test push</button>'}</div>
        <div class="row"><div class="m"><b>Notifications</b><span>${a.webpush.available ? (standalone ? 'Web push on this iPhone' : 'Add to Home Screen first to enable') : esc(a.webpush.note)}</span></div>${a.webpush.available && standalone ? '<button class="btn" data-act="enablepush">Enable notifications</button>' : ''}</div>
      </div>
      ${a.settings.map(g => `<h2 id="set-${g.items[0].key.split('.')[0]}">${esc(g.title)}</h2><div class="list">${g.items.map(setRow(ro)).join('')}</div>`).join('')}`;
  }
  const setRow = ro => it => {
    const dis = ro || it.readonly ? 'disabled' : '';
    let ctl;
    if (it.choices) ctl = `<select data-key="${it.key}" ${dis}>${it.choices.map(c => `<option ${c === it.value ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`;
    else if (it.type === 'bool') ctl = `<button class="swbtn" data-bool="${it.key}" data-v="${it.value}" ${dis}><span class="switch ${it.value ? 'on' : ''}"></span></button>`;
    else if (it.type === 'str') ctl = `<input type="text" data-key="${it.key}" value="${esc(it.value)}" ${dis} style="width:170px">`;
    else ctl = `<input type="number" step="any" data-key="${it.key}" value="${it.value}" ${it.min != null ? 'min="' + it.min + '"' : ''} ${it.max != null ? 'max="' + it.max + '"' : ''} ${dis}>`;
    const slider = (it.type === 'float' || it.type === 'int') && it.min != null && it.max != null
      ? `<input type="range" data-slide="${it.key}" min="${it.min}" max="${it.max}" step="${it.type === 'int' ? 1 : (it.max - it.min) / 200}" value="${it.value}" ${dis}>` : '';
    return `<div class="set"><div class="top"><span>${esc(it.label)}${it.negative ? ' <span class="t3 mono">(−)</span>' : ''}</span>${ctl}</div>${slider}</div>`;
  };

  // ---------- COIN ----------
  async function openCoin(mint) {
    S.overlay = { kind: 'coin', mint };
    const el = overlayEl();
    el.innerHTML = backBar() + skel(30) + skel(66) + skel(260) + skel(120);
    try { const c = await get('/coin/' + mint); if (S.overlay && S.overlay.mint === mint) { renderCoin(c); online(); } } catch (e) { offline(); }
  }
  function renderCoin(c) {
    const el = overlayEl();
    if (!c) { el.innerHTML = backBar() + '<div class="empty-msg">No data for this coin yet</div>'; return; }
    const p = c.position, x = c.exit, age = c.ageH == null ? '' : (c.ageH >= 1 ? Math.floor(c.ageH) + 'h old' : Math.round(c.ageH * 60) + 'm old');
    el.innerHTML = backBar(c.mode === 'PAPER') + `
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><b style="font-size:22px">${esc(c.name || c.label)}</b>${c.shield ? `<span class="chip">🛡 ${esc(c.shield)}</span>` : ''}</div>
      <div class="t2">${esc(c.symbol || c.label)} · Solana${age ? ' · ' + age : ''}</div>
      <div class="price" style="font:700 52px var(--disp);margin-top:8px">${price(c.price)}</div>
      ${p ? `<div class="${p.sincePct >= 0 ? 'up' : 'down'}" style="font-weight:600">${p.sincePct >= 0 ? '▲' : '▼'} ${Math.abs(p.sincePct).toFixed(2)}% since entry</div>` : ''}
      <div class="chartwrap" style="height:260px;margin-top:10px"><canvas id="cnd"></canvas></div>
      <div class="stats"><div><span>Market cap</span><b>${short(c.stats.marketCap)}</b></div><div><span>Liquidity</span><b>${short(c.stats.liquidity)}</b></div>
        <div><span>24h volume</span><b>${short(c.stats.volume24h)}</b></div><div><span>Holders</span><b>${c.stats.holders == null ? 'n/a' : c.stats.holders}</b></div></div>
      ${p ? `<h2>Your position · ${usd(p.size)} in · Executor</h2><div class="list">
        <div class="row"><div class="m"><b>Stop</b><span>-${x.stopPct}% from entry</span></div><div class="v num down">${price(x.stopPrice)}</div></div>
        <div class="row"><div class="m"><b>Trail</b><span>${x.trailActive ? x.trailPct + '% off the top' : 'arms at ' + price(x.trailStartPrice)}</span></div><div class="v num up">${x.trailActive ? price(x.trailPrice) : '–'}</div></div>
        <div class="row"><div class="m"><b>Timeout</b><span>time left</span></div><div class="v num">${Math.floor(x.timeoutLeftS / 3600)}h ${Math.floor(x.timeoutLeftS % 3600 / 60)}m</div></div></div>` : ''}
      <a class="cta ${p ? 'sell' : ''}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${p ? 'Sell on FOMO' : 'Buy on FOMO'}</a>`;
    Charts.candles($('#cnd'), c.candles, x ? x.exitLine : null);
  }

  // ---------- AUDITOR ----------
  const LAYER_NAMES = ['Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders', 'Liquidity lock', 'Pool age', 'Bundled wallets', 'Delegations'];
  async function openAudit(mint) {
    S.overlay = { kind: 'audit', mint, shown: 0, data: null };
    overlayEl().innerHTML = backBar() + skel(30) + LAYER_NAMES.map(() => skel(46, 6)).join('');
    await loadAudit();
  }
  async function loadAudit() {
    const o = S.overlay; if (!o || o.kind !== 'audit') return;
    try { const a = await get('/audit/' + o.mint); online(); if (S.overlay !== o) return; o.data = a; renderAudit(); } catch (e) { offline(); }
  }
  function renderAudit() {
    const o = S.overlay, a = o.data, el = overlayEl();
    if (!a || a.state === 'empty') { el.innerHTML = backBar() + `<div class="empty-msg">No coin taken apart yet</div>${a ? `<a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>` : ''}`; return; }
    const layers = a.layers;
    if (reduce()) o.shown = layers.length;
    const done = o.shown >= layers.length && a.state !== 'running';
    el.innerHTML = backBar() + `<div style="font-size:22px;font-weight:700;margin-top:4px">${esc(a.name || a.label)}</div><div class="t2">${esc(a.symbol || '')} · taken apart ${hm(a.ts)}</div>
      <div class="discs">${LAYER_NAMES.map((nm, i) => {
        const L = layers.find(l => l.n === i + 1), vis = L && i < o.shown, reading = !vis && i === o.shown && (L || a.state === 'running');
        const cls = vis ? (L.pass === true ? 'g' : L.pass === false ? 'r' : 'x') : (reading ? 'reading' : '');
        return `<div class="disc ${cls}"><span class="n">${vis ? (L.pass === true ? '✓' : L.pass === false ? '✕' : '–') : i + 1}</span><span class="m">${esc(L ? L.name : nm)}</span><span class="v">${vis ? esc(L.value) : ''}</span></div>`;
      }).join('')}</div>
      ${done ? (a.state === 'rejected' ? `<div class="verdict down">Rejected · ${esc(a.reason)}</div><div class="t2">Grok Bot won't buy ${esc(a.symbol || a.label)}</div>` : `<div class="verdict up">Cleared · 8/8 parts</div><div class="t2">Sent to Executor${a.size ? ' · ' + usd(a.size) : ''}</div>`) : ''}
      <div class="list" style="margin-top:16px"><div class="row"><div class="m"><b>Take apart before buying</b></div><button class="swbtn" data-act="auditor-toggle" ${PLAN !== 'A' ? 'disabled' : ''}><span class="switch ${a.enabled ? 'on' : ''}"></span></button></div></div>
      <a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    if (o.shown < layers.length) { clearTimeout(o.timer); o.timer = setTimeout(() => { if (S.overlay === o) { o.shown++; renderAudit(); } }, 350 + 150); }
  }

  // ---------- overlays ----------
  function overlayEl() { let el = $('#ov'); if (!el) { el = document.createElement('div'); el.id = 'ov'; el.className = 'screen'; document.body.appendChild(el); } return el; }
  function closeOverlay() { const el = $('#ov'); if (el) el.remove(); S.overlay = null; }
  const backBar = paper => `<div class="nav"><button class="back" data-act="back">‹ Back</button><div style="flex:1"></div>${paper ? '<span class="pill paper">PAPER</span>' : ''}</div>`;

  async function openBell() {
    S.overlay = { kind: 'bell' };
    const el = overlayEl(); el.innerHTML = backBar() + skel(60) + skel(60);
    try {
      const p = await get('/pushes'); online();
      el.innerHTML = backBar() + '<h2>Pushes</h2>' + (p.rows.length ? '<div class="list">' + p.rows.map(r => `<a class="row" ${r.coin_url ? `href="${esc(r.coin_url)}" target="_blank" rel="noopener"` : ''}><div class="m"><b>${esc(r.text.split('\n')[0])}</b><span>${hm(r.ts)} · ${esc(r.kind)}</span></div></a>`).join('') + '</div>' : '<div class="list"><div class="empty-msg">No pushes yet</div></div>');
      if (PLAN === 'A') { post('/pushes/read').catch(() => {}); if (S.state) S.state.unread = 0; }
    } catch (e) { offline(); }
  }
  function openSearch() {
    S.overlay = { kind: 'search' };
    const el = overlayEl();
    el.innerHTML = backBar() + '<input class="search" id="q" placeholder="Name, symbol or mint" autocomplete="off"><div id="res" style="margin-top:12px"></div>';
    const q = $('#q'); q.focus();
    let k; q.addEventListener('input', () => { clearTimeout(k); k = setTimeout(async () => {
      const v = q.value.trim(); if (!v) { $('#res').innerHTML = ''; return; }
      try {
        let rows;
        if (PLAN === 'A') rows = (await get('/search?q=' + encodeURIComponent(v))).rows;
        else { S.searchIdx = S.searchIdx || (await get('/search')).rows; const lv = v.toLowerCase(); rows = S.searchIdx.filter(r => r.mint === v || (r.name || '').toLowerCase().includes(lv) || (r.symbol || '').toLowerCase().includes(lv)).slice(0, 10); }
        $('#res').innerHTML = rows.length ? '<div class="list">' + rows.map(r => `<button class="row" style="width:100%;text-align:left" data-open="coin" data-mint="${esc(r.mint)}"><div class="m"><b>${esc(r.name || r.label)}</b><span>${esc(r.symbol || '')} · ${esc(r.mint.slice(0, 4) + '...' + r.mint.slice(-3))}</span></div></button>`).join('') + '</div>' : '<div class="empty-msg">No coin on the desk matches</div>';
      } catch (e) { offline(); }
    }, 250); });
  }

  // ---------- data ----------
  async function refresh() {
    if (!PLAN) return;
    try {
      const jobs = [get('/state'), get('/chart?range=' + S.range), get('/activity')];
      if (S.tab === 'account') jobs.push(get('/account'));
      if (S.tab === 'agents') ['scanner', 'auditor', 'analyst', 'executor', 'risk'].forEach(n => jobs.push(get('/agents/' + n + '/decisions')));
      const r = await Promise.all(jobs);
      S.state = r[0]; S.chart = r[1]; S.activity = r[2];
      if (S.tab === 'account') S.account = r[3];
      if (S.tab === 'agents') r.slice(3).forEach(d => S.decisions[d.agent] = d);
      online(); render();
      if (S.overlay && S.overlay.kind === 'coin') get('/coin/' + S.overlay.mint).then(c => S.overlay && S.overlay.kind === 'coin' && renderCoin(c)).catch(() => {});
      if (S.overlay && S.overlay.kind === 'audit' && S.overlay.data && S.overlay.data.state === 'running') loadAudit();
    } catch (e) { offline(); render(); }
  }
  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    if (S.tab === 'home') renderHome(); else if (S.tab === 'agents') renderAgents(); else if (S.tab === 'activity') renderActivity(); else renderAccount();
  }
  let rk; const soon = () => { clearTimeout(rk); rk = setTimeout(refresh, 400); };
  function stream() {
    const es = new EventSource('/api/stream?t=' + encodeURIComponent(TOKEN));
    ['scan', 'verdict', 'signal', 'fill', 'exit', 'balance', 'settings', 'activity'].forEach(ev => es.addEventListener(ev, soon));
    es.addEventListener('audit_layer', e => { soon(); try { const d = JSON.parse(e.data); if (S.overlay && S.overlay.kind === 'audit' && S.overlay.mint === d.mint) loadAudit(); } catch (_) {} });
    es.addEventListener('audit_done', e => { soon(); try { const d = JSON.parse(e.data); if (S.overlay && S.overlay.kind === 'audit' && S.overlay.mint === d.mint) loadAudit(); } catch (_) {} });
    es.onerror = () => { offline(); };
    es.onopen = () => online();
  }

  // ---------- events ----------
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab],[data-go],[data-range],[data-open],[data-act],[data-pause],[data-mode],[data-bool],[data-settings]');
    if (!t || t.disabled) return;
    if (t.dataset.tab || t.dataset.go) { closeOverlay(); S.tab = t.dataset.tab || t.dataset.go; render(); refresh(); window.scrollTo(0, 0); return; }
    if (t.dataset.range) { S.range = t.dataset.range; S.prevPts = 0; try { S.chart = await get('/chart?range=' + S.range); online(); } catch (_) { offline(); } renderHome(); return; }
    if (t.dataset.open && t.dataset.mint) { t.dataset.open === 'audit' ? openAudit(t.dataset.mint) : openCoin(t.dataset.mint); return; }
    if (t.dataset.settings) { S.tab = 'account'; await refresh(); const el = $('#set-' + t.dataset.settings); el && el.scrollIntoView(); return; }
    if (t.dataset.pause) {
      const a = S.state.agents.find(x => x.name === t.dataset.pause);
      try { await post(`/agents/${a.name}/${a.paused ? 'resume' : 'pause'}`); refresh(); } catch (err) { toast(err.message); }
      return;
    }
    if (t.dataset.mode) {
      const m = t.dataset.mode; if (S.account && S.account.mode === m) return;
      let body = { mode: m };
      if (m === 'LIVE') { const typed = prompt('Type LIVE to trade real money'); if (typed !== 'LIVE') return; body.confirm = 'LIVE'; }
      try { const r = await post('/mode', body); toast(r.message.split('\n')[0]); } catch (err) { toast(err.message); }
      refresh(); return;
    }
    if (t.dataset.bool) {
      const key = t.dataset.bool, nv = t.dataset.v !== 'true';
      const body = { key, value: nv };
      if (key === 'auditor.enabled' && !nv) { if (!confirm('Turn off the Auditor? Coins go straight to the Analyst.') || !confirm('Sure? No coin will be taken apart.')) return; body.confirm = 'twice'; }
      try { await post('/settings', body); toast('Saved'); } catch (err) { toast(err.message); }
      refresh(); return;
    }
    const act = t.dataset.act;
    if (act === 'back') closeOverlay();
    else if (act === 'bell') openBell();
    else if (act === 'search') openSearch();
    else if (act === 'more') { try { const more = await get('/activity?before=' + S.activity.next); S.activity = { rows: S.activity.rows.concat(more.rows), next: more.next }; renderActivity(); } catch (_) { offline(); } }
    else if (act === 'invite') {
      const url = S.account.signup_url;
      if (navigator.share) { try { await navigator.share({ title: 'FOMO', url }); } catch (_) {} }
      else { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (_) { toast(url); } }
    }
    else if (act === 'testpush') { try { const r = await post('/test-push'); toast(r.ok ? 'Test push sent' : 'No channel took it'); } catch (err) { toast(err.message); } }
    else if (act === 'enablepush') enablePush();
    else if (act === 'auditor-toggle') {
      const on = S.overlay.data.enabled; const body = { key: 'auditor.enabled', value: !on };
      if (on) { if (!confirm('Turn off the Auditor?') || !confirm('Sure? No coin will be taken apart before buying.')) return; body.confirm = 'twice'; }
      try { await post('/settings', body); loadAudit(); } catch (err) { toast(err.message); }
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target, key = t.dataset.key || t.dataset.slide; if (!key || PLAN !== 'A') return;
    try { const r = await post('/settings', { key, value: t.value }); toast((r.messages && r.messages[0]) || 'Saved'); } catch (err) { toast(err.message); }
    refresh();
  });
  document.addEventListener('input', e => { const t = e.target; if (t.dataset.slide) { const n = document.querySelector(`input[data-key="${t.dataset.slide}"]`); if (n) n.value = t.value; } });

  async function enablePush() {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Notifications not allowed'); return; }
      const key = S.account.webpush.publicKey, pad = '='.repeat((4 - key.length % 4) % 4);
      const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/')), arr = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
      await post('/push', sub.toJSON()); toast('Notifications on');
    } catch (err) { toast('Could not enable: ' + err.message); }
  }

  // ---------- boot ----------
  if (!PLAN) {
    $('#view').innerHTML = '<div class="nav"><div class="title">Grok Bot</div></div><div class="empty-msg">Open the link from Telegram once to sign this phone in.</div>';
    return;
  }
  render(); refresh();
  if (PLAN === 'A') { stream(); setInterval(refresh, 30000); } else setInterval(refresh, 15000);
  window.addEventListener('resize', () => { if (S.tab === 'home') { S.prevPts = 0; drawLine(); drawRings(); } });
})();
