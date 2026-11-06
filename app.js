/* Grok Bot desk app. Plan A: #t= token -> /api + SSE. Plan B: #d= path -> poll JSON every 15s.
   FOMO links only from server (links.py). Friendlier labels; agent internals unchanged. */
(function () {
  'use strict';
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const usd = (v, sign) => v == null ? '—' : (sign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '')) + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const short = v => v == null ? '—' : (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Number(v).toFixed(0));
  const pct = (v, d) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%';
  const hm = t => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const price = p => p == null ? '—' : p >= 1 ? '$' + p.toFixed(4) : '$' + p.toPrecision(4);
  const COLORS = { scanner: '#64d2ff', auditor: '#64d2ff', analyst: '#ffd60a', executor: '#00d35a', risk: '#ff6b9a' };
  const STEP_TITLE = { scanner: 'Finding pools', auditor: 'Checking safety', analyst: 'Scoring entry', executor: 'Sizing a paper trade', risk: 'Managing the exit' };

  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('t')) { localStorage.setItem('desk_t', h.get('t')); localStorage.removeItem('desk_d'); }
  if (h.get('d')) { localStorage.setItem('desk_d', h.get('d')); localStorage.removeItem('desk_t'); }
  if (h.get('t') || h.get('d')) history.replaceState(null, '', location.pathname);
  const TOKEN = localStorage.getItem('desk_t'), DPATH = localStorage.getItem('desk_d');
  const PLAN = TOKEN ? 'A' : (DPATH ? 'B' : null);

  const S = {
    tab: 'home', range: 'LIVE', state: null, chart: null, activity: null, account: null,
    positions: null, coins: null, decisions: {}, lastOk: null, overlay: null, prevPts: 0,
    searchIdx: null, coinQ: '', coinFilter: 'all', coinSort: 'new', openStep: null
  };

  async function get(path) {
    let url, opt = { cache: 'no-store' };
    if (PLAN === 'A') { url = '/api' + path; opt.headers = { Authorization: 'Bearer ' + TOKEN }; }
    else {
      const ROOT = (location.pathname.replace(/\/[^/]*$/, '/') || '/');
      const base = ROOT + 'd/' + encodeURIComponent(DPATH) + '/';
      const m = path.match(/^\/chart\?range=(\w+)/);
      if (m) url = base + 'chart-' + m[1] + '.json';
      else if (path.startsWith('/activity')) url = base + 'activity.json';
      else if (path.startsWith('/search')) url = base + 'search.json';
      else if (path.startsWith('/agents/')) {
        const ag = path.split('/')[2];
        url = base + 'agents/' + ag + '/decisions.json';
      } else url = base + path.slice(1).replace(/\?.*$/, '') + '.json';
    }
    const r = await fetch(url, opt);
    if (r.status === 404 && PLAN === 'B' && /\/(coin|audit|positions|coins)\//.test(path)) return null;
    if (r.status === 404 && PLAN === 'B' && (path === '/positions' || path === '/coins')) return { rows: [] };
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  async function post(path, body) {
    if (PLAN !== 'A') throw new Error('Read-only on this link. Change settings in Telegram.');
    const r = await fetch('/api' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  let retryIn = 0, retryTimer = null;
  function offline() {
    const el = $('#err'); el.hidden = false; retryIn = PLAN === 'B' ? 15 : 5;
    clearInterval(retryTimer);
    const tick = () => { el.textContent = `Desk offline · retrying in ${retryIn}s · last update ${S.lastOk ? hm(S.lastOk) : 'never'}`; if (retryIn-- <= 0) { clearInterval(retryTimer); refresh(); } };
    tick(); retryTimer = setInterval(tick, 1000);
  }
  function online() { S.lastOk = new Date().toISOString(); $('#err').hidden = true; clearInterval(retryTimer); }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.k); toast.k = setTimeout(() => el.hidden = true, 1800); }
  const skel = (hgt, mt) => `<div class="skel" style="height:${hgt}px;margin-top:${mt || 10}px"></div>`;

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

  function navbar(title) {
    const unread = S.state && S.state.unread > 0;
    return `<div class="nav"><button class="icon" data-go="team" aria-label="Team"><span class="avatar">G</span></button>
      <div class="title">${esc(title || 'Your desk')}</div>
      <button class="icon" data-act="search" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
      <button class="icon" data-act="bell" aria-label="Pushes"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>${unread ? '<span class="dot"></span>' : ''}</button></div>`;
  }

  function reasonBars(items, color) {
    if (!items || !items.length) return '<div class="empty-msg">Nothing to chart yet tonight</div>';
    const max = Math.max(...items.map(x => x.n), 1);
    return `<div class="bars">${items.map(x => `
      <div class="barrow"><div class="lab">${esc(x.plain || x.tech)}</div><div class="cnt">${x.n}</div>
      <div class="track"><i style="width:${Math.max(6, 100 * x.n / max)}%;background:${color || 'var(--cyan)'}"></i></div>
      <div class="detail">${esc(x.tech || '')}${x.source ? ' · ' + esc(x.source) : ''}</div></div>`).join('')}</div>`;
  }

  function renderHome() {
    const st = S.state;
    if (!st) { $('#view').innerHTML = navbar() + skel(66) + skel(22) + skel(180) + skel(200); return; }
    const ui = st.ui || {};
    const up = st.todayPct >= 0;
    const waiting = !ui.tradesTonight && (ui.headline || 'Waiting for a setup');
    $('#view').innerHTML = navbar('Your desk') + `
      <div class="hero">
        <div class="label">Paper balance${st.mode === 'PAPER' ? ' <span class="pill paper">PAPER</span>' : ''}</div>
        <div class="balrow"><div class="bal" id="bal"></div></div>
        <div class="today ${up ? 'up' : 'down'}">${pct(st.todayPct)} today · ${st.multiplier.toFixed(2)}× night start</div>
        ${waiting ? `<div class="wait">${esc(waiting)} — the desk is watching new pools. No paper trade sized yet tonight.</div>` : ''}
      </div>
      <div class="chartwrap"><canvas id="line"></canvas>${!S.chart || S.chart.points.length < 2 ? '<div class="empty">Chart fills after the first paper fill</div>' : ''}</div>
      <div class="ranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-range="${r}" class="${r === S.range ? 'on' : ''}">${r}</button>`).join('')}</div>
      <h2>Tonight’s pipeline</h2>
      <div class="pipeline">${(ui.pipeline || []).map(p => `
        <button class="pipe ${S.openStep === p.step ? 'open' : ''}" data-act="togstep" data-step="${p.step}">
          <div><span class="n">${p.step}</span><span class="ttl">${esc(p.title)}</span>
            <span class="sdot ${p.paused || !p.alive ? 'off' : ''}" style="display:inline-block;margin-left:8px;background:${p.paused || !p.alive ? '' : COLORS[p.agent]}"></span></div>
          <div class="blurb">${esc(p.blurb)}</div>
          <div class="stat">${esc(p.stat)}</div>
          ${S.openStep === p.step ? `<div class="tech">agent · ${esc(p.agent)}</div>` : ''}
        </button>`).join('')}</div>
      <h2>Why coins were skipped</h2>
      ${reasonBars(ui.killReasons, '#64d2ff')}
      <h2>Safety / score refusals</h2>
      ${reasonBars(ui.rejectReasons, '#ff9f0a')}
      <h2>Recent activity <button data-go="activity">See all</button></h2>
      <div id="act5">${activityList(S.activity, 5)}</div>`;
    odometer($('#bal'), usd(st.balance));
    const cv = $('#line'); if (cv && S.chart) { Charts.line(cv, S.chart, S.prevPts); S.prevPts = S.chart.points.length; }
  }

  function activityList(act, n) {
    if (!act) return skel(60) + skel(60);
    const rows = n ? act.rows.slice(0, n) : act.rows;
    if (!rows.length) return '<div class="list"><div class="empty-msg">Quiet so far — nothing bought, sold, or refused yet</div></div>';
    return '<div class="list">' + rows.map(r => {
      const vcls = r.kind === 'sold' ? 'up' : r.kind === 'stopped' ? 'down' : 't2';
      const sub = r.plain ? `${esc(r.plain)}` : esc(r.subtitle || '');
      const tech = r.plain && r.subtitle ? `<div class="detail">${esc(r.subtitle)}</div>` : '';
      return `<button class="row" style="width:100%;text-align:left" data-open="${r.opens}" data-mint="${esc(r.mint || '')}">
        <div class="m"><b>${esc(r.title)}</b><span>${sub}</span>${tech}</div>
        <div class="v ${vcls}">${esc(r.value || '')}</div></button>`;
    }).join('') + '</div>';
  }

  function renderActivity() {
    $('#view').innerHTML = `${navbar('Activity')}<div style="margin-top:8px">${activityList(S.activity)}</div>` +
      (S.activity && S.activity.next && PLAN === 'A' ? `<button class="btn" style="width:100%;margin-top:12px" data-act="more">Load more</button>` : '');
  }

  function filteredCoins() {
    let rows = (S.coins && S.coins.rows) || [];
    const q = (S.coinQ || '').trim().toLowerCase();
    if (q) rows = rows.filter(r => (r.label || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || (r.symbol || '').toLowerCase().includes(q) || (r.mint || '').toLowerCase().includes(q));
    if (S.coinFilter === 'kill') rows = rows.filter(r => r.verdict === 'kill' || r.verdict === 'reject');
    if (S.coinFilter === 'pass') rows = rows.filter(r => r.verdict === 'pass');
    if (S.coinFilter === 'auditor') rows = rows.filter(r => r.stage === 'auditor');
    if (S.coinFilter === 'analyst') rows = rows.filter(r => r.stage === 'analyst');
    if (S.coinSort === 'az') rows = rows.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    else rows = rows.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return rows;
  }

  function renderCoins() {
    const rows = filteredCoins();
    $('#view').innerHTML = navbar('Coins tonight') + `
      <input class="searchbox" id="coinq" placeholder="Search name, symbol, or mint" value="${esc(S.coinQ)}">
      <div class="filters">
        ${[['all','All'],['kill','Skipped'],['pass','Passed'],['auditor','Safety'],['analyst','Score']].map(([k,l]) =>
          `<button class="chipbtn ${S.coinFilter===k?'on':''}" data-act="cfilt" data-v="${k}">${l}</button>`).join('')}
        <button class="chipbtn ${S.coinSort==='new'?'on':''}" data-act="csort" data-v="new">Newest</button>
        <button class="chipbtn ${S.coinSort==='az'?'on':''}" data-act="csort" data-v="az">A–Z</button>
      </div>
      ${rows.length ? `<div class="list">${rows.map(r => {
        const badge = r.verdict === 'pass' ? 'up' : (r.verdict === 'kill' || r.verdict === 'reject' ? 'down' : 't2');
        const stage = STEP_TITLE[r.stage] || r.stage || '';
        return `<button class="row" style="width:100%;text-align:left" data-open="${r.verdict==='reject'&&r.stage==='auditor'?'audit':'coin'}" data-mint="${esc(r.mint)}">
          <div class="m"><b>${esc(r.label || r.symbol || r.name)}</b>
            <span>${esc(r.plain || 'Seen')} · ${esc(stage)}</span>
            ${r.tech ? `<div class="detail">${esc(r.tech)}</div>` : ''}</div>
          <div class="v ${badge}">${esc(r.verdict || '—')}</div></button>`;
      }).join('')}</div>` : '<div class="list"><div class="empty-msg">No coins match that filter yet</div></div>'}`;
    const q = $('#coinq');
    if (q) q.addEventListener('input', () => { S.coinQ = q.value; clearTimeout(renderCoins._t); renderCoins._t = setTimeout(renderCoins, 120); });
  }

  function renderPositions() {
    const data = S.positions || { rows: [], open: 0 };
    const open = (data.rows || []).filter(r => r.open);
    const closed = (data.rows || []).filter(r => !r.open);
    $('#view').innerHTML = navbar('Your positions') + `
      ${open.length ? `<h2>Open · ${open.length}</h2><div class="list">${open.map(p => {
        const pnl = p.pnl_usd || 0;
        return `<button class="row" style="width:100%;text-align:left" data-open="coin" data-mint="${esc(p.mint)}">
          <div class="m"><b>${esc(p.label)}</b><span>${usd(p.size_usd)} in · ${pct(p.sincePct)} since entry</span>
            <div class="detail">${esc(p.exit_plain || '')}</div></div>
          <div class="v ${pnl >= 0 ? 'up' : 'down'}">${usd(pnl, true)}</div></button>`;
      }).join('')}</div>` : `<div class="wait" style="margin-top:12px">No open paper positions. When a setup clears the pipeline, it shows up here with stop / trail rules in plain words.</div>`}
      ${closed.length ? `<h2>Closed</h2><div class="list">${closed.slice(0, 20).map(p => {
        const pnl = p.pnl_usd || 0;
        return `<button class="row" style="width:100%;text-align:left" data-open="coin" data-mint="${esc(p.mint)}">
          <div class="m"><b>${esc(p.label)}</b><span>${esc(p.exit_plain || p.exit_reason || 'Closed')}</span></div>
          <div class="v ${pnl >= 0 ? 'up' : 'down'}">${usd(pnl, true)}</div></button>`;
      }).join('')}</div>` : ''}`;
  }

  function renderTeam() {
    const st = S.state, a = S.account, ui = (st && st.ui) || {};
    if (!st) { $('#view').innerHTML = navbar('Team') + skel(120) + skel(200); return; }
    const ro = PLAN !== 'A';
    $('#view').innerHTML = navbar('Team & settings') + `
      ${ro ? `<div class="note">This link is read-only (Plan B). Pause agents, change mode, or edit numbers in Telegram — then they show up here.</div>` : ''}
      <h2>How the desk works</h2>
      ${(ui.pipeline || []).map(p => {
        const dec = S.decisions[p.agent];
        const rows = (dec && dec.rows) ? dec.rows.slice(0, 5) : [];
        return `<div class="stepcard">
          <div class="hd"><span class="n" style="background:${COLORS[p.agent]};color:#000;width:22px;height:22px;border-radius:11px;display:inline-grid;place-items:center;font-size:12px">${p.step}</span>
            ${esc(p.title)} <span class="t2" style="font-weight:400">· ${p.paused ? 'paused' : (p.alive ? 'running' : 'quiet')}</span></div>
          <div class="body">${esc(p.blurb)}</div>
          <div class="meta">${esc(p.stat)} · internal name ${esc(p.agent)}</div>
          ${rows.length ? `<div class="list" style="margin-top:10px">${rows.map(r => `
            <a class="row" href="${esc(r.coin_url)}" target="_blank" rel="noopener"><div class="m"><b>${esc(r.label)}</b>
              <span>${esc(r.plain || r.reason || r.verdict || '')}</span>
              ${r.reason && r.plain ? `<div class="detail">${esc(r.reason)}</div>` : ''}</div>
              <div class="v t2">${esc(r.verdict || '')}</div></a>`).join('')}</div>` : `<div class="t2" style="margin-top:8px;font-size:13px">No recent decisions yet</div>`}
          ${!ro ? `<button class="btn" style="margin-top:10px" data-pause="${p.agent}">${p.paused ? 'Resume' : 'Pause'} step</button>` : ''}
        </div>`;
      }).join('')}
      <h2>Account</h2>
      ${a ? `<div class="list">
        <div class="row"><div class="m"><b>Mode</b><span>${a.liveAllowed ? 'LIVE unlocked after a full PAPER night' : 'LIVE unlocks after 1 full PAPER night'}${ro ? ' · change in Telegram' : ''}</span></div>
          <div class="v"><span class="pill paper">${esc(a.mode)}</span></div></div>
        <div class="row"><div class="m"><b>Stack</b><span>${a.ticket && a.ticket.message ? esc(a.ticket.message) : 'Paper start stack'}</span></div><div class="v num">${usd(a.stack)}</div></div>
        ${a.profile_url ? `<a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><div class="m"><b>Your FOMO profile</b><span>@${esc(a.handle)}</span></div><div class="v t3">›</div></a>` : ''}
        <button class="row" style="width:100%;text-align:left" data-act="invite"><div class="m"><b>Invite a friend</b><span>Share your FOMO signup link</span></div><div class="v t3">›</div></button>
        <div class="row"><div class="m"><b>Telegram</b><span>${a.telegram.configured ? (a.telegram.owner ? 'connected' : 'bot set — send /start') : 'not connected'}</span></div>${ro ? '' : '<button class="btn" data-act="testpush">Send test push</button>'}</div>
        <div class="row"><div class="m"><b>Phone notifications</b><span>${a.webpush.available ? 'Available on Plan A' : esc(a.webpush.note || 'Plan B · Telegram only')}</span></div></div>
      </div>
      ${a.settings.map(g => `<h2 id="set-${g.items[0].key.split('.')[0]}">${esc(g.title)}</h2><div class="list">${g.items.map(setRow(ro)).join('')}</div>`).join('')}`
      : skel(200)}`;
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

  // ---------- COIN / AUDIT (unchanged FOMO link behavior) ----------
  async function openCoin(mint) {
    if (!mint) return;
    S.overlay = { kind: 'coin', mint };
    const el = overlayEl();
    el.innerHTML = backBar() + skel(30) + skel(66) + skel(260);
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
        <div><span>24h volume</span><b>${short(c.stats.volume24h)}</b></div><div><span>Holders</span><b>${c.stats.holders == null ? '—' : c.stats.holders}</b></div></div>
      ${p && x ? `<h2>Your paper position · ${usd(p.size)}</h2><div class="list">
        <div class="row"><div class="m"><b>Hard stop</b><span>Leave if it drops ${x.stopPct}% from entry</span></div><div class="v num down">${price(x.stopPrice)}</div></div>
        <div class="row"><div class="m"><b>Trailing exit</b><span>${x.trailActive ? 'Active · ' + x.trailPct + '% off the top' : 'Arms after a run-up to ' + price(x.trailStartPrice)}</span></div><div class="v num up">${x.trailActive ? price(x.trailPrice) : '–'}</div></div>
        <div class="row"><div class="m"><b>Time limit</b><span>left before we call it</span></div><div class="v num">${Math.floor(x.timeoutLeftS / 3600)}h ${Math.floor(x.timeoutLeftS % 3600 / 60)}m</div></div></div>` : ''}
      <a class="cta ${p ? 'sell' : ''}" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${p ? 'Sell on FOMO' : 'Buy on FOMO'}</a>`;
    Charts.candles($('#cnd'), c.candles, x ? x.exitLine : null);
  }

  const LAYER_NAMES = ['Mint authority', 'Freeze authority', 'Dev wallet', 'Top 10 holders', 'Liquidity lock', 'Pool age', 'Bundled wallets', 'Delegations'];
  async function openAudit(mint) {
    if (!mint) return;
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
    if (!a || a.state === 'empty') { el.innerHTML = backBar() + `<div class="empty-msg">No safety check yet for this coin</div>${a ? `<a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>` : ''}`; return; }
    const layers = a.layers;
    if (reduce()) o.shown = layers.length;
    const done = o.shown >= layers.length && a.state !== 'running';
    el.innerHTML = backBar() + `<div style="font-size:22px;font-weight:700;margin-top:4px">${esc(a.name || a.label)}</div><div class="t2">Safety check · ${hm(a.ts)}</div>
      <div class="discs">${LAYER_NAMES.map((nm, i) => {
        const L = layers.find(l => l.n === i + 1), vis = L && i < o.shown, reading = !vis && i === o.shown && (L || a.state === 'running');
        const cls = vis ? (L.pass === true ? 'g' : L.pass === false ? 'r' : 'x') : (reading ? 'reading' : '');
        return `<div class="disc ${cls}"><span class="n">${vis ? (L.pass === true ? '✓' : L.pass === false ? '✕' : '–') : i + 1}</span><span class="m">${esc(L ? L.name : nm)}</span><span class="v">${vis ? esc(L.value) : ''}</span></div>`;
      }).join('')}</div>
      ${done ? (a.state === 'rejected' ? `<div class="verdict down">Skipped · ${esc(a.reason)}</div><div class="t2">We won’t size a paper buy on ${esc(a.symbol || a.label)}</div>` : `<div class="verdict up">Cleared · 8/8 checks</div><div class="t2">Handed to sizing${a.size ? ' · ' + usd(a.size) : ''}</div>`) : ''}
      <div class="list" style="margin-top:16px"><div class="row"><div class="m"><b>Check safety before sizing</b><span>${PLAN !== 'A' ? 'Change in Telegram' : ''}</span></div><button class="swbtn" data-act="auditor-toggle" ${PLAN !== 'A' ? 'disabled' : ''}><span class="switch ${a.enabled ? 'on' : ''}"></span></button></div></div>
      <a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    if (o.shown < layers.length) { clearTimeout(o.timer); o.timer = setTimeout(() => { if (S.overlay === o) { o.shown++; renderAudit(); } }, 350 + 150); }
  }

  function overlayEl() { let el = $('#ov'); if (!el) { el = document.createElement('div'); el.id = 'ov'; el.className = 'screen'; document.body.appendChild(el); } return el; }
  function closeOverlay() { const el = $('#ov'); if (el) el.remove(); S.overlay = null; }
  const backBar = paper => `<div class="nav"><button class="back" data-act="back">‹ Back</button><div style="flex:1"></div>${paper ? '<span class="pill paper">PAPER</span>' : ''}</div>`;

  async function openBell() {
    S.overlay = { kind: 'bell' };
    const el = overlayEl(); el.innerHTML = backBar() + skel(60);
    try {
      const p = await get('/pushes'); online();
      const rows = (p.rows || p) ;
      const list = Array.isArray(rows) ? rows : (p.rows || []);
      el.innerHTML = backBar() + '<h2>Pushes</h2>' + (list.length ? '<div class="list">' + list.map(r => `<a class="row" ${r.coin_url ? `href="${esc(r.coin_url)}" target="_blank" rel="noopener"` : ''}><div class="m"><b>${esc((r.text || '').split('\n')[0])}</b><span>${hm(r.ts)} · ${esc(r.kind)}</span></div></a>`).join('') + '</div>' : '<div class="list"><div class="empty-msg">No pushes yet</div></div>');
      if (PLAN === 'A') { post('/pushes/read').catch(() => {}); if (S.state) S.state.unread = 0; }
    } catch (e) { offline(); }
  }
  function openSearch() {
    S.overlay = { kind: 'search' };
    const el = overlayEl();
    el.innerHTML = backBar() + '<input class="searchbox" id="q" placeholder="Name, symbol or mint" autocomplete="off"><div id="res" style="margin-top:12px"></div>';
    const q = $('#q'); q.focus();
    let k; q.addEventListener('input', () => { clearTimeout(k); k = setTimeout(async () => {
      const v = q.value.trim(); if (!v) { $('#res').innerHTML = ''; return; }
      try {
        let rows;
        if (PLAN === 'A') rows = (await get('/search?q=' + encodeURIComponent(v))).rows || [];
        else { S.searchIdx = S.searchIdx || ((await get('/search')).rows || []); const lv = v.toLowerCase(); rows = S.searchIdx.filter(r => r.mint === v || (r.name || '').toLowerCase().includes(lv) || (r.symbol || '').toLowerCase().includes(lv)).slice(0, 10); }
        $('#res').innerHTML = rows.length ? '<div class="list">' + rows.map(r => `<button class="row" style="width:100%;text-align:left" data-open="coin" data-mint="${esc(r.mint)}"><div class="m"><b>${esc(r.name || r.label)}</b><span>${esc(r.symbol || '')} · ${esc(r.mint.slice(0, 4) + '…' + r.mint.slice(-3))}</span></div></button>`).join('') + '</div>' : '<div class="empty-msg">No coin on the desk matches</div>';
      } catch (e) { offline(); }
    }, 250); });
  }

  async function refresh() {
    if (!PLAN) return;
    try {
      const jobs = [get('/state'), get('/chart?range=' + S.range), get('/activity'), get('/positions'), get('/coins')];
      if (S.tab === 'team') {
        jobs.push(get('/account'));
        ['scanner', 'auditor', 'analyst', 'executor', 'risk'].forEach(n => jobs.push(get('/agents/' + n + '/decisions')));
      }
      const r = await Promise.all(jobs);
      S.state = r[0]; S.chart = r[1]; S.activity = r[2]; S.positions = r[3] || { rows: [] }; S.coins = r[4] || { rows: [] };
      if (S.tab === 'team') {
        S.account = r[5];
        r.slice(6).forEach(d => { if (d && d.agent) S.decisions[d.agent] = d; });
      }
      online(); render();
      if (S.overlay && S.overlay.kind === 'coin') get('/coin/' + S.overlay.mint).then(c => S.overlay && S.overlay.kind === 'coin' && renderCoin(c)).catch(() => {});
      if (S.overlay && S.overlay.kind === 'audit' && S.overlay.data && S.overlay.data.state === 'running') loadAudit();
    } catch (e) { offline(); render(); }
  }
  function render() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    if (S.tab === 'home') renderHome();
    else if (S.tab === 'coins') renderCoins();
    else if (S.tab === 'positions') renderPositions();
    else if (S.tab === 'activity') renderActivity();
    else renderTeam();
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

  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab],[data-go],[data-range],[data-open],[data-act],[data-pause],[data-mode],[data-bool],[data-settings]');
    if (!t || t.disabled) return;
    if (t.dataset.tab || t.dataset.go) { closeOverlay(); S.tab = t.dataset.tab || t.dataset.go; render(); refresh(); window.scrollTo(0, 0); return; }
    if (t.dataset.range) { S.range = t.dataset.range; S.prevPts = 0; try { S.chart = await get('/chart?range=' + S.range); online(); } catch (_) { offline(); } renderHome(); return; }
    if (t.dataset.open && t.dataset.mint) { t.dataset.open === 'audit' ? openAudit(t.dataset.mint) : openCoin(t.dataset.mint); return; }
    if (t.dataset.settings) { S.tab = 'team'; await refresh(); const el = $('#set-' + t.dataset.settings); el && el.scrollIntoView(); return; }
    if (t.dataset.pause) {
      try { const a = S.state.agents.find(x => x.name === t.dataset.pause); await post(`/agents/${a.name}/${a.paused ? 'resume' : 'pause'}`); refresh(); } catch (err) { toast(err.message); }
      return;
    }
    if (t.dataset.mode) {
      const m = t.dataset.mode; if (S.account && S.account.mode === m) return;
      let body = { mode: m };
      if (m === 'LIVE') { const typed = prompt('Type LIVE to confirm'); if (typed !== 'LIVE') return; body.confirm = 'LIVE'; }
      try { const r = await post('/mode', body); toast(r.message.split('\n')[0]); } catch (err) { toast(err.message); }
      refresh(); return;
    }
    if (t.dataset.bool) {
      const key = t.dataset.bool, nv = t.dataset.v !== 'true';
      const body = { key, value: nv };
      if (key === 'auditor.enabled' && !nv) { if (!confirm('Turn off safety checks?') || !confirm('Sure? Coins skip the 8-layer check.')) return; body.confirm = 'twice'; }
      try { await post('/settings', body); toast('Saved'); } catch (err) { toast(err.message); }
      refresh(); return;
    }
    const act = t.dataset.act;
    if (act === 'back') closeOverlay();
    else if (act === 'bell') openBell();
    else if (act === 'search') openSearch();
    else if (act === 'togstep') { const n = +t.dataset.step; S.openStep = S.openStep === n ? null : n; renderHome(); }
    else if (act === 'cfilt') { S.coinFilter = t.dataset.v; renderCoins(); }
    else if (act === 'csort') { S.coinSort = t.dataset.v; renderCoins(); }
    else if (act === 'more') { try { const more = await get('/activity?before=' + S.activity.next); S.activity = { rows: S.activity.rows.concat(more.rows), next: more.next }; renderActivity(); } catch (_) { offline(); } }
    else if (act === 'invite') {
      const url = S.account && S.account.signup_url; if (!url) { toast('Signup link not loaded yet'); return; }
      if (navigator.share) { try { await navigator.share({ title: 'FOMO', url }); } catch (_) {} }
      else { try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (_) { toast(url); } }
    }
    else if (act === 'testpush') { try { const r = await post('/test-push'); toast(r.ok ? 'Test push sent' : 'No channel took it'); } catch (err) { toast(err.message); } }
    else if (act === 'enablepush') enablePush();
    else if (act === 'auditor-toggle') {
      const on = S.overlay.data.enabled; const body = { key: 'auditor.enabled', value: !on };
      if (on) { if (!confirm('Turn off safety checks?') || !confirm('Sure?')) return; body.confirm = 'twice'; }
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

  if (!PLAN) {
    $('#view').innerHTML = '<div class="nav"><div class="title">Your desk</div></div><div class="empty-msg">Open the private desk link once (from Telegram) to sign this phone in.</div>';
    return;
  }
  render(); refresh();
  if (PLAN === 'A') { stream(); setInterval(refresh, 30000); } else setInterval(refresh, 15000);
  window.addEventListener('resize', () => { if (S.tab === 'home' && S.chart) { S.prevPts = 0; const cv = $('#line'); if (cv) Charts.line(cv, S.chart, 0); } });
})();
