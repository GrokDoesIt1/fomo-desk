/* Grok Bot desk. Plan A: #t= ; Plan B: #d= . FOMO URLs only from server (links.py). */
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
  const SHORT = { scanner: 'Look', auditor: 'Check', analyst: 'Score', executor: 'Size', risk: 'Guard' };
  const COLORS = { scanner: '#64d2ff', auditor: '#64d2ff', analyst: '#ffd60a', executor: '#00d35a', risk: '#ff6b9a' };

  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('t')) { localStorage.setItem('desk_t', h.get('t')); localStorage.removeItem('desk_d'); }
  if (h.get('d')) { localStorage.setItem('desk_d', h.get('d')); localStorage.removeItem('desk_t'); }
  // Drop private hash and cache-bust query; token stays in localStorage.
  if (h.get('t') || h.get('d') || /(?:^|[?&])_bv=/.test(location.search)) {
    history.replaceState(null, '', location.pathname);
  }
  const TOKEN = localStorage.getItem('desk_t'), DPATH = localStorage.getItem('desk_d');
  const PLAN = TOKEN ? 'A' : (DPATH ? 'B' : null);

  const S = {
    tab: 'home', range: 'LIVE', state: null, chart: null, activity: null, account: null,
    positions: null, coins: null, decisions: {}, lastOk: null, overlay: null, prevPts: 0,
    searchIdx: null, coinQ: '', coinFilter: 'all', coinSort: 'new', openStep: null,
    openRow: null, showFilt: false, seenAct: new Set(), seenDisc: new Set(), homeActAll: false, homeScope: 'session',
    prevStats: {}
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
      else if (path.startsWith('/agents/')) url = base + 'agents/' + path.split('/')[2] + '/decisions.json';
      else url = base + path.slice(1).replace(/\?.*$/, '') + '.json';
    }
    const r = await fetch(url, opt);
    if (r.status === 404 && PLAN === 'B' && /\/(coin|audit)\//.test(path)) return null;
    if (r.status === 404 && PLAN === 'B' && (path === '/positions' || path === '/coins')) return { rows: [] };
    if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  async function post(path, body) {
    if (PLAN !== 'A') throw new Error('Read-only · use Telegram');
    const r = await fetch('/api' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  let retryIn = 0, retryTimer = null;
  function offline() {
    const el = $('#err'); el.hidden = false; retryIn = PLAN === 'B' ? 15 : 5;
    clearInterval(retryTimer);
    const tick = () => { el.textContent = `Offline · ${retryIn}s`; if (retryIn-- <= 0) { clearInterval(retryTimer); refresh(); } };
    tick(); retryTimer = setInterval(tick, 1000);
  }
  function online() { S.lastOk = new Date().toISOString(); $('#err').hidden = true; clearInterval(retryTimer); }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.k); toast.k = setTimeout(() => el.hidden = true, 1600); }
  const skel = (hgt, mt) => `<div class="skel" style="height:${hgt}px;margin-top:${mt || 10}px"></div>`;

  function odometer(el, text) {
    if (!el) return;
    const prev = el.dataset.v || '';
    if (reduce() || !prev || prev.length !== text.length) {
      el.innerHTML = [...text].map(ch => /\d/.test(ch) ? `<span class="d"><span style="transform:translateY(-${ch}em)">${[...'0123456789'].map(n => `<i>${n}</i>`).join('')}</span></span>` : `<span>${esc(ch)}</span>`).join('');
    } else {
      const ds = el.querySelectorAll('.d>span'); let di = ds.length, k = 0;
      for (let i = text.length - 1; i >= 0; i--) {
        if (!/\d/.test(text[i])) continue; di--;
        if (text[i] !== prev[i]) { const s = ds[di]; if (!s) continue; s.style.transitionDelay = (k++ * 30) + 'ms'; s.style.transform = `translateY(-${text[i]}em)`; }
      }
    }
    el.dataset.v = text;
  }

  function navbar(title) {
    const unread = S.state && S.state.unread > 0;
    const scanning = S.state && S.state.running > 0;
    return `<div class="nav"><button class="icon" data-go="team" aria-label="Team"><span class="avatar">G</span></button>
      <div class="title">${esc(title || 'Desk')}</div>
      <button class="icon" data-act="search" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
      <button class="icon" data-act="bell" aria-label="Pushes"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>${unread ? '<span class="dot"></span>' : ''}${scanning && !unread ? '<span class="dot" style="background:var(--cyan)"></span>' : ''}</button></div>`;
  }

  function statusLine(st) {
    const ui = st.ui || {};
    const focus = ui.focus;
    if (focus && focus.active && focus.line) {
      return `<span class="live"><i class="pulse"></i></span><b>${esc(SHORT[focus.agent] || focus.agent)}</b><span class="t2"> · ${esc(focus.line)}</span>`;
    }
    if (ui.openPositions > 0) return `<span class="live"><i class="pulse"></i></span><b>${ui.openPositions} open</b>`;
    if (ui.tradesTonight > 0) return `<span class="live"><i class="pulse"></i></span><b>${ui.tradesTonight} tonight</b>`;
    if (st.running > 0) return `<span class="live"><i class="pulse"></i></span><b>Scanning</b><span class="t2"> · watching</span>`;
    return `<b>${esc(ui.headline || 'Waiting')}</b>`;
  }

  function pipelineStrip(ui) {
    const steps = ui.pipeline || [];
    const hot = steps.find(p => p.active) || steps.find(p => p.alive && !p.paused);
    const anyActive = steps.some(p => p.active);
    const beam = reduce() || !anyActive ? '' : '<i class="beam" aria-hidden="true"></i>';
    const strip = `<div class="strip">${beam}${steps.map(p => {
      const short = SHORT[p.agent] || p.title;
      const cls = [
        S.openStep === p.step ? 'on' : '',
        p.paused || !p.alive ? 'pause' : '',
        p.active ? 'hot working' : '',
        !p.active && hot && hot.step === p.step && p.alive && !p.paused ? 'hot' : ''
      ].filter(Boolean).join(' ');
      const tip = p.line || p.doing || short;
      const col = (p.alive && !p.paused) ? (COLORS[p.agent] || '#fff') : '';
      return `<button class="step ${cls}" data-act="togstep" data-step="${p.step}" aria-label="${esc(tip)}" style="${col ? 'color:' + col : ''}">
        <span class="orb">${p.step}${p.active && !reduce() ? '<i class="spin"></i>' : ''}</span>
        <span class="lab">${esc(short)}</span></button>`;
    }).join('')}</div>`;
    // progress between agents: filled up to active step
    const activeIdx = Math.max(0, steps.findIndex(p => p.active));
    const dots = steps.length > 1 ? `<div class="flowdots" aria-hidden="true">${steps.slice(0, -1).map((_, i) => {
      const cls = anyActive ? (i < activeIdx ? 'done' : (i === activeIdx ? 'on' : '')) : '';
      return `<i class="${cls}"></i>`;
    }).join('')}</div>` : '';
    return strip + dots;
  }

  function stepPanel(ui) {
    const p = (ui.pipeline || []).find(x => x.step === S.openStep);
    if (!p) return '';
    const dec = S.decisions[p.agent];
    const rows = (dec && dec.rows) ? dec.rows.slice(0, 3) : [];
    const live = p.active ? (p.line || p.doing) : (p.paused ? 'Paused' : 'Watching');
    return `<div class="panel">
      <div class="ph"><span class="sdot ${p.active ? '' : 'off'}" style="background:${COLORS[p.agent]}"></span>${esc(SHORT[p.agent])} · ${esc(live)}
        <span class="t2" style="font-weight:400;margin-left:auto">${p.paused ? 'paused' : (p.active ? 'now' : (p.alive ? 'watching' : 'quiet'))}</span></div>
      <div class="pm">${esc(p.stat || '')}${p.coin ? ' · ' + esc(p.coin) : ''}</div>
      ${rows.length ? `<div class="list" style="margin-top:10px">${rows.map(r => `
        <a class="row" href="${esc(r.coin_url || '#')}" target="_blank" rel="noopener"><div class="m"><b>${esc(r.label)}</b>
          <span>${esc(r.plain || r.reason || r.verdict || '')}</span></div>
          <div class="v t2">${esc(r.verdict || '')}</div></a>`).join('')}</div>` : ''}
      ${PLAN === 'A' ? `<button class="btn" style="margin-top:10px;width:100%" data-pause="${p.agent}">${p.paused ? 'Resume' : 'Pause'}</button>` : ''}
    </div>`;
  }

  function reasonMini(items) {
    if (!items || !items.length) return '';
    const max = Math.max(...items.map(x => x.n), 1);
    return `<div class="mini">${items.slice(0, 8).map(x => `
      <button class="ticker" data-act="reason" data-tech="${esc(x.tech || '')}" data-plain="${esc(x.plain || '')}">
        <b>${esc(x.plain || x.tech || '—')}</b>
        <span>${x.n} · <i style="display:inline-block;width:${Math.max(8, 40 * x.n / max)}px;height:4px;background:var(--cyan);border-radius:2px;vertical-align:middle"></i></span>
      </button>`).join('')}</div>`;
  }

  function activityList(act, n) {
    if (!act) return skel(56) + skel(56);
    const rows = n ? act.rows.slice(0, n) : act.rows;
    if (!rows.length) return '<div class="list"><div class="empty-msg">Quiet</div></div>';
    return '<div class="list act">' + rows.map(r => {
      const id = r.id != null ? String(r.id) : (r.ts + r.title);
      const fresh = !S.seenAct.has(id);
      S.seenAct.add(id);
      const vcls = r.kind === 'sold' ? 'up' : r.kind === 'stopped' ? 'down' : 't2';
      const open = S.openRow === id ? 'open' : '';
      return `<button class="row ${open}" style="width:100%;text-align:left;${fresh && !reduce() ? '' : 'animation:none'}" data-act="togrow" data-id="${esc(id)}" data-open="${r.opens || ''}" data-mint="${esc(r.mint || '')}">
        <div class="m"><b>${esc(r.title)}</b><span>${esc(r.plain || r.subtitle || '')}</span>
          ${r.subtitle ? `<div class="detail">${esc(r.subtitle)}</div>` : ''}</div>
        <div class="v ${vcls}">${esc(r.value || hm(r.ts))}</div></button>`;
    }).join('') + '</div>';
  }

  function stateClass(stage, verdict) {
    if (verdict === 'pass') return 'pass';
    if (verdict === 'kill') return 'kill';
    if (verdict === 'reject') return 'reject';
    if (stage === 'waiting') return 'wait';
    if (stage === 'auditor' || stage === 'analyst' || stage === 'scanner') return 'check';
    return '';
  }

  function focusCard(st) {
    const ui = st.ui || {};
    const focus = ui.focus;
    const waiting = (ui.pipeline && ui.pipeline[0] && String(ui.pipeline[0].stat || '').match(/(\d+)\s+waiting/)) || null;
    const waitN = waiting ? waiting[1] : null;
    if (focus && focus.active) {
      const disc = (ui.discoveries || []).find(d => d.mint && focus.mint && d.mint === focus.mint);
      const stc = stateClass(disc && disc.stage, disc && disc.verdict) || (focus.outcome === 'kill' ? 'kill' : 'check');
      const why = (disc && disc.plain) || focus.detail || focus.doing || 'Checking';
      const tag = SHORT[focus.agent] || focus.agent;
      const ago = focus.stageTs ? hm(focus.stageTs) : '';
      return `<button class="focus active ${stc}" data-act="togrow" data-id="focus-${esc(focus.mint || 'x')}" data-open="${(disc && disc.verdict === 'reject' && disc.stage === 'auditor') ? 'audit' : 'coin'}" data-mint="${esc(focus.mint || '')}">
        <span class="orbmini">${focus.step || '·'}${!reduce() ? '<i class="ring"></i>' : ''}</span>
        <div class="m"><div class="who">${esc(tag)} · ${esc(focus.doing || 'Working')}</div>
          <b>${esc(focus.coin || focus.label || 'token')}</b>
          <span>${esc(why)}</span></div>
        <div class="side"><span class="tag">${esc((disc && disc.badge) || focus.status || 'live')}</span>
          ${ago ? `<span class="ago">${esc(ago)}</span>` : ''}</div>
        ${!reduce() ? '<div class="bar"><i></i></div>' : ''}</button>`;
    }
    return `<div class="focus idle">
      <span class="orbmini">·</span>
      <div class="m"><div class="who">Desk</div>
        <b>${esc(ui.headline || 'Watching')}</b>
        <span>${waitN ? (waitN + ' waiting on liquidity') : (st.running > 0 ? 'Bots idle · no fake work' : 'Paused')}</span></div>
      <div class="side"><span class="tag">watch</span></div></div>`;
  }

  function agentLane(ui) {
    const steps = ui.pipeline || [];
    return `<div class="lane">${steps.map(p => {
      const on = p.active;
      return `<div class="chipbot ${on ? 'on' : ''} ${p.paused ? 'pause' : ''}">
        <span class="sdot ${on ? '' : 'off'}" style="${on ? 'background:' + (COLORS[p.agent] || '#fff') : ''}"></span>
        <b>${esc(SHORT[p.agent])}</b>
        <span>${esc(on ? (p.line || p.doing) : (p.paused ? 'paused' : 'watching'))}</span>
      </div>`;
    }).join('')}</div>`;
  }

  function discoveryRail(ui) {
    const rows = (ui.discoveries || []).slice(0, 10);
    if (!rows.length) return '';
    const first = !S.seenDisc.size;
    return `<div class="sec"><b>Found</b><span class="t2">live</span></div>
      <div class="rail">${rows.map(r => {
        const stc = stateClass(r.stage, r.verdict);
        const id = r.mint || r.label;
        const fresh = !first && id && !S.seenDisc.has(id);
        if (id) S.seenDisc.add(id);
        const stage = SHORT[r.stage] || (r.stage === 'waiting' ? 'Wait' : (r.stage || ''));
        const badge = r.badge || r.verdict || (r.stage === 'waiting' ? 'wait' : 'seen');
        return `<button class="rail-card ${stc} ${fresh && !reduce() ? 'fresh' : ''}" data-act="togrow" data-id="d-${esc(r.mint)}" data-open="${r.verdict === 'reject' && r.stage === 'auditor' ? 'audit' : 'coin'}" data-mint="${esc(r.mint)}">
          <span class="badge">${esc(badge)}</span>
          <div class="sym">${esc(r.label || r.symbol || 'coin')}${boughtTag(r.mint)}</div>
          <div class="meta">${esc(stage)}</div>
          <div class="why">${esc(r.plain || '—')}</div>
        </button>`;
      }).join('')}</div>`;
  }

  function stageTicker(ui) {
    const rows = (ui.stages || []).slice(0, 8);
    if (!rows.length) return '';
    return `<div class="sec"><b>Pipeline</b><span class="t2">events</span></div>
      <div class="tickerlist">${rows.map((r, i) => {
        const id = (r.ts || '') + (r.agent || '') + (r.mint || '') + (r.detail || '');
        const fresh = i === 0 && id && !S.seenAct.has('st:' + id);
        if (id) S.seenAct.add('st:' + id);
        const out = r.outcome === 'kill' || r.outcome === 'reject' ? 'out' : (r.outcome === 'pass' ? 'ok' : '');
        const who = SHORT[r.agent] || r.agent || '';
        const title = r.label ? `${r.doing || r.status} · ${r.label}` : (r.doing || r.status || '—');
        return `<button class="tick ${out} ${fresh && !reduce() ? 'fresh' : ''}" data-act="togrow" data-id="st-${esc(id)}" data-open="coin" data-mint="${esc(r.mint || '')}">
          <span class="who">${esc(who)}</span>
          <div class="m"><b>${esc(title)}</b>${boughtTag(r.mint)}<span>${esc(r.detail || '')}</span></div>
          <span class="tm">${esc(hm(r.ts))}</span></button>`;
      }).join('')}</div>`;
  }


  function homeStats(ui) {
    const st = (ui && ui.stats) || {};
    const scope = S.homeScope || st.scope || 'session';
    const scoped = (st.byScope && st.byScope[scope]) || st;
    // scanning/waiting are live desk activity — always from top-level, never invented
    const tiles = [
      { key: 'seen', label: 'Seen', n: scoped.seen || 0, filt: 'all', sub: scope === 'session' ? 'night' : scope },
      { key: 'scanning', label: 'Scanning', n: st.scanning || 0, filt: 'scan',
        sub: (st.waiting ? (st.waiting + ' wait') : 'live') },
      { key: 'passed', label: 'Passed', n: scoped.passed || 0, filt: 'full', sub: 'paper' },
      { key: 'failed', label: "Didn't", n: scoped.failed || 0, filt: 'kill', sub: 'skip' }
    ];
    const scopes = (st.scopes || ['session', 'today', 'all']).map(s =>
      `<button class="scopchip ${s === scope ? 'on' : ''}" data-act="hscope" data-v="${s}">${s === 'session' ? 'night' : s}</button>`
    ).join('');
    return `<div class="statbar" id="statbar">
      <div class="statscopes">${scopes}</div>
      <div class="statgrid">${tiles.map(t => `
        <button class="stattile ${t.key}" data-act="statgo" data-filt="${t.filt}" aria-label="${t.label}">
          <span class="sl">${esc(t.label)}</span>
          <span class="sn" data-stat="${t.key}">${t.n}</span>
          <span class="ss">${esc(t.sub || '')}</span>
        </button>`).join('')}
      </div>
    </div>`;
  }

  function tierDots(n, failed) {
    const filled = Math.max(0, Math.min(5, n || 0));
    return `<span class="tdots ${failed ? 'fail' : ''}" aria-hidden="true">${[1,2,3,4,5].map(i =>
      `<i class="${i <= filled ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function passLadder(ui) {
    const lad = (ui && ui.ladder) || { full: [], progress: [], fullCount: 0 };
    const full = lad.full || [];
    const prog = lad.progress || [];
    const row = (r, kind) => {
      const failed = !!r.failed;
      const cls = r.fullPass ? 'pass' : (failed ? 'reject' : 'check');
      const badge = r.fullPass ? (r.tierLabel || 'Passed') : (failed ? (r.tierLabel || 'Skip') : (r.tierLabel || 'Live'));
      return `<button class="prow ${cls}" data-act="togrow" data-id="p-${esc(r.mint)}" data-open="${failed && r.tierKey === 'check' ? 'audit' : 'coin'}" data-mint="${esc(r.mint)}">
        <div class="m"><b>${esc(r.symbol || r.label || 'coin')}</b>${boughtTag(r.mint)}
          <span>${esc(r.plain || r.status || '')}</span></div>
        <div class="side">${tierDots(r.dots || r.tier, failed)}
          <span class="pbadge">${esc(badge)}</span></div>
      </button>`;
    };
    const fullBlock = full.length
      ? `<div class="plist">${full.map(r => row(r, 'full')).join('')}</div>`
      : `<div class="empty-msg soft">No full passes yet</div>`;
    const progBlock = prog.length
      ? `<div class="sec"><b>In progress</b><span class="t2">furthest</span></div>
         <div class="plist">${prog.map(r => row(r, 'prog')).join('')}</div>`
      : '';
    return `<div class="sec"><b>Passed</b><span class="t2">${full.length ? full.length + ' paper' : 'tiered'}</span></div>
      ${fullBlock}${progBlock}`;
  }

  function boughtSet() {
    const m = {};
    ((S.positions && S.positions.rows) || []).forEach(r => { if (!m[r.mint]) m[r.mint] = r; });
    return m;
  }
  function boughtTag(mint) {
    const r = S.bought && S.bought[mint];
    if (!r) return '';
    return r.open ? `<span class="btag live">STILL IN · ${etTime(r.opened_at)}</span>`
      : `<span class="btag">SOLD ${etTime(r.closed_at)} · ${esc(r.exit_reason || '')}</span>`;
  }
  function heldTxt(sec) {
    if (sec == null) return '—';
    if (sec < 3600) return Math.max(1, Math.round(sec / 60)) + 'm';
    if (sec < 86400) return (sec / 3600).toFixed(1) + 'h';
    return (sec / 86400).toFixed(1) + 'd';
  }
  function money(v) { if (v == null) return '—'; const a = Math.abs(v); return (v < 0 ? '-$' : '$') + (a >= 100 ? a.toFixed(0) : a.toFixed(2)); }
  function sMoney(v) { return v == null ? '—' : (v >= 0 ? '+' : '') + money(v); }
  function shortMc(v) { if (!v) return '—'; return v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : '$' + Math.round(v / 1e3) + 'K'; }
  function etTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }) + ' ET'; } catch (e) { return '—'; }
  }
  function liveHeld(r) {
    if (!r.opened_at) return heldTxt(r.held_s);
    const s = Math.max(0, (Date.now() - Date.parse(r.opened_at)) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = Math.floor(s % 60);
    return (h ? h + 'h ' : '') + m + 'm ' + String(sec).padStart(2, '0') + 's';
  }
  setInterval(() => document.querySelectorAll('[data-held]').forEach(el => {
    el.textContent = liveHeld({ opened_at: el.dataset.held });
  }), 1000);
  function fomoUrl(r) {
    return r.coin_url && /^https:\/\/fomo\.family\//.test(r.coin_url) ? r.coin_url : null;  // built only in links.py
  }
  function openLinks(r) {
    return `<div class="olinks">${fomoUrl(r) ? `<a class="ofomo" href="${esc(fomoUrl(r))}" target="_blank" rel="noopener">Open on FOMO ↗</a>` : ''}
      <a class="odex" href="https://dexscreener.com/solana/${esc(encodeURIComponent(r.mint))}" target="_blank" rel="noopener">DexScreener</a></div>`;
  }
  function tierOf(r) {
    const sc = r.score;
    const t = sc == null ? '' : (sc >= 85 ? 'Strong' : sc >= 70 ? 'Good' : 'Starter');
    return (t ? t + ' · ' : '') + (sc != null ? 'score ' + sc : 'passed all 5 bots');
  }
  function myTrades() {
    const data = S.positions || { rows: [] };
    const rows = data.rows || [];
    const sm = data.summary || {};
    const open = rows.filter(r => r.open), closed = rows.filter(r => !r.open).slice(0, 8);
    const tot = (sm.realized || 0) + (sm.unrealized || 0);
    const exitTxt = { stop: 'Stop', trail: 'Trailing', timeout: 'Time limit', target: 'Target' };
    const card = r => {
      const up = (r.pnl_usd || 0) >= 0;
      return `<div class="mycard ${up ? 'win' : 'loss'}" data-act="togrow" data-id="pos-${r.id}" data-open="coin" data-mint="${esc(r.mint)}" role="button" tabindex="0">
        <div class="mytop"><b>${esc(r.symbol || r.label || 'coin')}</b><span class="spill in">STILL IN · <span data-held="${esc(r.opened_at || '')}">${liveHeld(r)}</span></span></div>
        <div class="mytime">Bought ${etTime(r.opened_at)}</div>
        <div class="mypnl ${up ? 'up' : 'down'}">${sMoney(r.pnl_usd)} <small>${r.sincePct == null ? '' : pct(r.sincePct)}</small></div>
        <div class="mygrid"><span>In <b>${money(r.size_usd)}</b></span><span>Mcap <b>${shortMc(r.entry_mcap)}</b></span>
          <span>Held <b data-held="${esc(r.opened_at || '')}">${liveHeld(r)}</b></span><span>Entry <b>${r.entry_price != null ? Number(r.entry_price).toPrecision(3) : '—'}</b></span></div>
        <div class="mywhy">Why bought: ${esc(r.why_buy || tierOf(r))}</div>
        ${openLinks(r)}
      </div>`;
    };
    const crow = r => {
      const up = (r.pnl_usd || 0) >= 0;
      return `<div class="myrow" data-act="togrow" data-id="pos-${r.id}" data-open="coin" data-mint="${esc(r.mint)}" role="button" tabindex="0">
        <div class="m"><b>${esc(r.symbol || r.label || 'coin')} <span class="spill sold">SOLD ${etTime(r.closed_at)}</span></b>
          <span>Bought ${etTime(r.opened_at)} · held ${heldTxt(r.held_s)}</span>
          <span class="mywhy2">Why sold: ${esc(r.why_sell || exitTxt[r.exit_reason] || 'closed')}</span>
          <span class="mywhy2 t3">Why bought: ${esc(r.why_buy || '')}</span></div>
        <div class="myrside"><div class="${up ? 'up' : 'down'} myr">${sMoney(r.pnl_usd)}</div>${openLinks(r)}</div></div>`;
    };
    return `<div class="mytrades">
      <div class="sec"><b>My Trades</b><span class="t2">paper</span></div>
      <div class="mysum">
        <div><span>Open</span><b>${sm.open || 0}</b></div>
        <div><span>Closed</span><b>${sm.closed || 0}</b></div>
        <div><span>Win rate</span><b>${sm.winRate == null ? '—' : Math.round(sm.winRate) + '%'}</b></div>
        <div><span>Total P&amp;L</span><b class="${tot >= 0 ? 'up' : 'down'}">${sMoney(tot)}</b></div>
      </div>
      ${open.length ? `<div class="myopen">${open.map(card).join('')}</div>` : '<div class="empty-msg soft">No open trades right now</div>'}
      ${closed.length ? `<div class="sec"><b>Closed</b><span class="t2">realized ${sMoney(sm.realized)}</span></div><div class="mylist">${closed.map(crow).join('')}</div>` : ''}
    </div>`;
  }
  function tradeFlash() {
    const rows = (S.positions && S.positions.rows) || [];
    const key = r => r.id + ':' + (r.open ? 'o' : 'c');
    const now = new Set(rows.map(key));
    if (S.posKeys) {
      rows.forEach(r => {
        if (S.posKeys.has(key(r))) return;
        const sym = r.symbol || r.label || 'coin';
        if (r.open) flash(`Bought ${sym} · ${money(r.size_usd)}`, true);
        else flash(`Sold ${sym} · ${sMoney(r.pnl_usd)}`, (r.pnl_usd || 0) >= 0);
      });
    }
    S.posKeys = now;
  }
  function flash(t, good) {
    let el = document.getElementById('tflash');
    if (!el) { el = document.createElement('div'); el.id = 'tflash'; document.body.appendChild(el); }
    el.className = 'tflash ' + (good ? 'good' : 'bad'); el.textContent = t;
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(flash.k); flash.k = setTimeout(() => el.classList.remove('show'), 3500);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch (e) {}
  }

  if (window.PnlChart) {
    PnlChart.state.onRange = r => get('/chart?range=' + r).then(d => { S.pnl = d; PnlChart.update(d); }).catch(() => {});
    document.addEventListener('pointerdown', e => { if (e.target.closest && e.target.closest('#pnlbox') && window.Charts) Charts.view.busy = Date.now() + 6000; }, true);
    document.addEventListener('touchmove', e => { if (e.target.closest && e.target.closest('#pnlbox') && window.Charts) Charts.view.busy = Date.now() + 4000; }, { capture: true, passive: true });
  }
  function renderHome() {
    const st = S.state;
    if (!st) { $('#view').innerHTML = navbar() + skel(56) + skel(22) + skel(160) + skel(80); return; }
    const ui = st.ui || {};
    const up = st.todayPct >= 0;
    const scanning = !!(ui.focus && ui.focus.active) || (st.running > 0 && (ui.discoveries || []).some(d => d.stage === 'waiting' || d.verdict === 'kill'));
    document.body.classList.toggle('scanning', !!scanning && !reduce());
    if (S.openStep && ui.pipeline) {
      const p = ui.pipeline.find(x => x.step === S.openStep);
      if (p && !S.decisions[p.agent]) get('/agents/' + p.agent + '/decisions').then(d => { if (d && d.agent) { S.decisions[d.agent] = d; if (S.tab === 'home') renderHome(); } }).catch(() => {});
    }
    const pts = (S.chart && S.chart.points) || [];
    let chartFlat = pts.length < 2;
    if (pts.length) {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pts.length; i++) { const v = pts[i].v; if (v < lo) lo = v; if (v > hi) hi = v; }
      chartFlat = !(hi - lo > 1e-9);
    }
    const chartEmpty = !S.chart || pts.length < 2;
    $('#view').innerHTML = navbar('Desk') + `
      <div class="hero">
        <div class="topline"><span class="pill paper">PAPER</span><span class="live"><i class="pulse"></i> live</span></div>
        <div class="balrow"><div class="bal" id="bal"></div></div>
        <div class="today ${up ? 'up' : 'down'}">${pct(st.todayPct)}</div>
      </div>
      <div id="pnlph"></div>
      ${homeStats(ui)}
      ${myTrades()}
      ${focusCard(st)}
      <div class="chartwrap${chartFlat ? ' flat' : ''}"><canvas id="line"></canvas>${chartEmpty ? '<div class="empty">—</div>' : ''}</div>
      <div class="ranges${chartFlat ? ' flat' : ''}">${['LIVE', '1H', '6H', '24H', 'ALL'].map(r => `<button data-range="${r}" class="${r === S.range ? 'on' : ''}">${r}</button>`).join('')}</div>
      ${pipelineStrip(ui)}
      ${stepPanel(ui)}
      ${agentLane(ui)}
      ${passLadder(ui)}
      ${discoveryRail(ui)}
      ${stageTicker(ui)}
      ${reasonMini(ui.killReasons)}
      <div class="sec"><b>Activity</b>
        <button class="btn" data-act="moreact" style="min-height:32px;font-size:12px;background:transparent;color:var(--blue)">${S.homeActAll ? 'Less' : 'All'}</button></div>
      <div id="act5">${activityList(S.activity, S.homeActAll ? 40 : 6)}</div>`;
    if (window.PnlChart) { PnlChart.mount($('#pnlph')); PnlChart.update(S.pnl); }
    odometer($('#bal'), usd(st.balance));
    const stats = ui.stats || {};
    const scoped = (stats.byScope && stats.byScope[S.homeScope || stats.scope || 'session']) || stats;
    [['seen', scoped.seen], ['scanning', stats.scanning], ['passed', scoped.passed], ['failed', scoped.failed]].forEach(([k, n]) => {
      const el = document.querySelector('[data-stat="' + k + '"]');
      if (!el) return;
      const text = String(n == null ? 0 : n);
      const prev = S.prevStats[k];
      if (prev != null && String(prev) !== text && String(prev).length === text.length && !reduce()) {
        odometer(el, String(prev));
        requestAnimationFrame(() => requestAnimationFrame(() => odometer(el, text)));
      } else {
        odometer(el, text);
      }
      S.prevStats[k] = text;
    });
    const cv = $('#line'); if (cv && S.chart) { Charts.line(cv, S.chart, S.prevPts); Charts.interact(cv, S.chart, m => m && m.mint && openCoin(m.mint)); S.prevPts = (S.chart.points || []).length; }
  }

  function filteredCoins() {
    let rows = (S.coins && S.coins.rows) || [];
    const q = (S.coinQ || '').trim().toLowerCase();
    if (q) rows = rows.filter(r => (r.label || '').toLowerCase().includes(q) || (r.name || '').toLowerCase().includes(q) || (r.symbol || '').toLowerCase().includes(q) || (r.mint || '').toLowerCase().includes(q));
    if (S.coinFilter === 'kill') rows = rows.filter(r => r.verdict === 'kill' || r.verdict === 'reject' || r.failed);
    if (S.coinFilter === 'pass') rows = rows.filter(r => r.verdict === 'pass' || r.fullPass);
    if (S.coinFilter === 'full') rows = rows.filter(r => r.fullPass);
    if (S.coinFilter === 'wait') rows = rows.filter(r => r.stage === 'waiting');
    if (S.coinFilter === 'scan') rows = rows.filter(r => r.stage === 'waiting' || (!r.failed && !r.fullPass && (r.stage === 'scanner' || r.stage === 'auditor' || r.stage === 'analyst')));
    if (S.coinFilter === 'auditor') rows = rows.filter(r => r.stage === 'auditor');
    if (S.coinFilter === 'analyst') rows = rows.filter(r => r.stage === 'analyst');
    if (S.coinSort === 'az') rows = rows.slice().sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    else rows = rows.slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return rows;
  }

  function renderCoins() {
    const rows = filteredCoins();
    $('#view').innerHTML = navbar('Coins') + `
      <div class="toolrow">
        <button class="btn ${S.showFilt ? 'on' : ''}" data-act="filt">Filter</button>
        <span class="t2" style="font-size:12px">${rows.length}</span>
      </div>
      <input class="searchbox ${S.showFilt ? 'show' : ''}" id="coinq" placeholder="Search" value="${esc(S.coinQ)}">
      <div class="filters ${S.showFilt ? 'show' : ''}">
        ${[['all','All'],['scan','Scan'],['wait','Wait'],['kill','Skip'],['full','Passed'],['pass','Clear'],['auditor','Check'],['analyst','Score']].map(([k,l]) =>
          `<button class="chipbtn ${S.coinFilter===k?'on':''}" data-act="cfilt" data-v="${k}">${l}</button>`).join('')}
        <button class="chipbtn ${S.coinSort==='new'?'on':''}" data-act="csort" data-v="new">New</button>
        <button class="chipbtn ${S.coinSort==='az'?'on':''}" data-act="csort" data-v="az">A–Z</button>
      </div>
      ${rows.length ? `<div class="list">${rows.map(r => {
        const stc = stateClass(r.stage, r.verdict);
        const id = r.mint;
        const open = S.openRow === id ? 'open' : '';
        const stageLab = SHORT[r.stage] || (r.stage === 'waiting' ? 'Wait' : (r.stage || ''));
        const pill = r.verdict || (r.stage === 'waiting' ? 'wait' : 'check');
        return `<button class="row st-${stc || 'check'} ${open}" style="width:100%;text-align:left" data-act="togrow" data-id="${esc(id)}" data-open="${r.verdict==='reject'&&r.stage==='auditor'?'audit':'coin'}" data-mint="${esc(r.mint)}">
          <div class="m"><b>${esc(r.label || r.symbol || r.name)}</b>
            <span>${esc(stageLab)} · ${esc(r.plain || '—')}</span>
            ${r.tech ? `<div class="detail">${esc(r.tech)}</div>` : ''}</div>
          <div class="v"><span class="badge-pill ${stc || 'check'}">${esc(pill)}</span></div></button>`;
      }).join('')}</div>` : '<div class="list"><div class="empty-msg">None</div></div>'}`;
    const q = $('#coinq');
    if (q) q.addEventListener('input', () => { S.coinQ = q.value; clearTimeout(renderCoins._t); renderCoins._t = setTimeout(renderCoins, 120); });
  }

  function renderTrades() {
    const data = S.positions || { rows: [], open: 0 };
    const open = (data.rows || []).filter(r => r.open);
    const closed = (data.rows || []).filter(r => !r.open);
    $('#view').innerHTML = navbar('Trades') + `
      ${open.length ? `<div class="list" style="margin-top:8px">${open.map(p => {
        const pnl = p.pnl_usd || 0;
        const id = 'o-' + p.mint;
        return `<div role="button" tabindex="0" class="row ${S.openRow===id?'open':''}" style="width:100%;text-align:left;flex-wrap:wrap" data-act="togrow" data-id="${esc(id)}" data-open="coin" data-mint="${esc(p.mint)}">
          <div class="m"><b>${esc(p.label)} <span class="spill in">STILL IN · <span data-held="${esc(p.opened_at || '')}">${liveHeld(p)}</span></span></b><span>Bought ${etTime(p.opened_at)} · ${usd(p.size_usd)} · ${pct(p.sincePct)}</span>
            <div class="detail">${esc(p.exit_plain || '')}</div></div>
          <div class="v ${pnl >= 0 ? 'up' : 'down'}">${usd(pnl, true)}</div><div style="flex-basis:100%">${openLinks(p)}</div></div>`;
      }).join('')}</div>` : `<div class="list" style="margin-top:8px"><div class="empty-msg">No open trades</div></div>`}
      ${closed.length ? `<div style="margin:16px 0 6px;font-size:13px;color:var(--t2)">Closed</div><div class="list">${closed.slice(0, 20).map(p => {
        const pnl = p.pnl_usd || 0;
        return `<div role="button" tabindex="0" class="row" style="width:100%;text-align:left;flex-wrap:wrap" data-open="coin" data-mint="${esc(p.mint)}">
          <div class="m"><b>${esc(p.label)} <span class="spill sold">SOLD ${etTime(p.closed_at)}</span></b><span>Bought ${etTime(p.opened_at)} · ${esc(p.exit_plain || p.exit_reason || '')}</span></div>
          <div class="v ${pnl >= 0 ? 'up' : 'down'}">${usd(pnl, true)}</div><div style="flex-basis:100%">${openLinks(p)}</div></div>`;
      }).join('')}</div>` : ''}`;
  }

  function renderTeam() {
    const st = S.state, a = S.account, ui = (st && st.ui) || {};
    if (!st) { $('#view').innerHTML = navbar('Team') + skel(120); return; }
    const ro = PLAN !== 'A';
    $('#view').innerHTML = navbar('Team') + `
      ${ro ? `<div class="note">Read-only · pause / settings in Telegram</div>` : ''}
      <div class="list" style="margin-top:8px">${(ui.pipeline || []).map(p => `
        <button class="row" style="width:100%;text-align:left" data-act="jumpstep" data-step="${p.step}">
          <div class="m"><b>${esc(SHORT[p.agent])}</b><span>${esc(p.active ? (p.line || p.doing) : (p.paused ? 'paused' : 'watching'))} · ${esc(p.stat || '')}</span></div>
          <div class="v"><span class="sdot ${p.active ? '' : 'off'}" style="${p.active ? 'background:'+COLORS[p.agent] : ''}"></span></div>
        </button>`).join('')}</div>
      ${a ? `<div class="list" style="margin-top:14px">
        <div class="row"><div class="m"><b>Mode</b></div><div class="v"><span class="pill paper">${esc(a.mode)}</span></div></div>
        <div class="row"><div class="m"><b>Stack</b></div><div class="v num">${usd(a.stack)}</div></div>
        ${a.profile_url ? `<a class="row" href="${esc(a.profile_url)}" target="_blank" rel="noopener"><div class="m"><b>FOMO</b><span>@${esc(a.handle || '')}</span></div><div class="v t3">›</div></a>` : ''}
        <button class="row" style="width:100%;text-align:left" data-act="invite"><div class="m"><b>Invite</b></div><div class="v t3">›</div></button>
        <div class="row"><div class="m"><b>Telegram</b><span>${a.telegram && a.telegram.configured ? 'on' : 'off'}</span></div>${ro ? '' : '<button class="btn" data-act="testpush">Test</button>'}</div>
      </div>
      ${a.settings ? a.settings.map(g => `<div style="margin:16px 0 6px;font-size:13px;color:var(--t2)">${esc(g.title)}</div><div class="list">${g.items.map(setRow(ro)).join('')}</div>`).join('') : ''}`
      : skel(160)}`;
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
    return `<div class="set"><div class="top"><span>${esc(it.label)}</span>${ctl}</div>${slider}</div>`;
  };

  async function openCoin(mint) {
    if (!mint) return;
    S.overlay = { kind: 'coin', mint };
    const el = overlayEl();
    el.innerHTML = backBar() + skel(30) + skel(66) + skel(220);
    try { const c = await get('/coin/' + mint); if (S.overlay && S.overlay.mint === mint) { renderCoin(c); online(); } } catch (e) { offline(); }
  }
  function renderCoin(c) {
    const el = overlayEl();
    if (!c) { el.innerHTML = backBar() + '<div class="empty-msg">No data</div>'; return; }
    const p = c.position, x = c.exit, age = c.ageH == null ? '' : (c.ageH >= 1 ? Math.floor(c.ageH) + 'h' : Math.round(c.ageH * 60) + 'm');
    el.innerHTML = backBar(c.mode === 'PAPER') + `
      <div style="display:flex;align-items:center;gap:8px;margin-top:4px"><b style="font-size:22px">${esc(c.name || c.label)}</b>${c.shield ? `<span class="chip">🛡 ${esc(c.shield)}</span>` : ''}</div>
      <div class="t2">${esc(c.symbol || c.label)}${age ? ' · ' + age : ''}</div>
      <div class="price" style="font:700 48px var(--disp);margin-top:8px">${price(c.price)}</div>
      ${p ? `<div class="${p.sincePct >= 0 ? 'up' : 'down'}" style="font-weight:600">${pct(p.sincePct)}</div>` : ''}
      <div class="chartwrap" style="height:240px;margin-top:10px"><canvas id="cnd"></canvas></div>
      <div class="stats"><div><span>Mcap</span><b>${short(c.stats.marketCap)}</b></div><div><span>Liq</span><b>${short(c.stats.liquidity)}</b></div>
        <div><span>Vol 24h</span><b>${short(c.stats.volume24h)}</b></div><div><span>Holders</span><b>${c.stats.holders == null ? '—' : c.stats.holders}</b></div></div>
      ${p && x ? `<div class="list" style="margin-top:12px">
        <div class="row"><div class="m"><b>Stop</b><span>−${x.stopPct}%</span></div><div class="v num down">${price(x.stopPrice)}</div></div>
        <div class="row"><div class="m"><b>Trail</b><span>${x.trailActive ? x.trailPct + '%' : 'armed later'}</span></div><div class="v num up">${x.trailActive ? price(x.trailPrice) : '–'}</div></div>
        <div class="row"><div class="m"><b>Time</b></div><div class="v num">${Math.floor(x.timeoutLeftS / 3600)}h ${Math.floor(x.timeoutLeftS % 3600 / 60)}m</div></div></div>` : ''}
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
    if (!a || a.state === 'empty') { el.innerHTML = backBar() + `<div class="empty-msg">No check yet</div>${a ? `<a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>` : ''}`; return; }
    const layers = a.layers;
    if (reduce()) o.shown = layers.length;
    const done = o.shown >= layers.length && a.state !== 'running';
    el.innerHTML = backBar() + `<div style="font-size:22px;font-weight:700;margin-top:4px">${esc(a.name || a.label)}</div><div class="t2">Check · ${hm(a.ts)}</div>
      <div class="discs">${LAYER_NAMES.map((nm, i) => {
        const L = layers.find(l => l.n === i + 1), vis = L && i < o.shown, reading = !vis && i === o.shown && (L || a.state === 'running');
        const cls = vis ? (L.pass === true ? 'g' : L.pass === false ? 'r' : 'x') : (reading ? 'reading' : '');
        return `<div class="disc ${cls}"><span class="n">${vis ? (L.pass === true ? '✓' : L.pass === false ? '✕' : '–') : i + 1}</span><span class="m">${esc(L ? L.name : nm)}</span><span class="v">${vis ? esc(L.value) : ''}</span></div>`;
      }).join('')}</div>
      ${done ? (a.state === 'rejected' ? `<div class="verdict down">Skip</div>` : `<div class="verdict up">Clear</div>`) : ''}
      <a class="cta" href="${esc(a.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    if (o.shown < layers.length) { clearTimeout(o.timer); o.timer = setTimeout(() => { if (S.overlay === o) { o.shown++; renderAudit(); } }, reduce() ? 0 : 400); }
  }

  function overlayEl() { let el = $('#ov'); if (!el) { el = document.createElement('div'); el.id = 'ov'; el.className = 'screen'; document.body.appendChild(el); } return el; }
  function closeOverlay() { const el = $('#ov'); if (el) el.remove(); S.overlay = null; }
  const backBar = paper => `<div class="nav"><button class="back" data-act="back">‹</button><div style="flex:1"></div>${paper ? '<span class="pill paper">PAPER</span>' : ''}</div>`;

  async function openBell() {
    S.overlay = { kind: 'bell' };
    const el = overlayEl(); el.innerHTML = backBar() + skel(60);
    try {
      const p = await get('/pushes'); online();
      const list = Array.isArray(p) ? p : (p.rows || []);
      el.innerHTML = backBar() + (list.length ? '<div class="list">' + list.map(r => `<a class="row" ${r.coin_url ? `href="${esc(r.coin_url)}" target="_blank" rel="noopener"` : ''}><div class="m"><b>${esc((r.text || '').split('\n')[0])}</b><span>${hm(r.ts)}</span></div></a>`).join('') + '</div>' : '<div class="list"><div class="empty-msg">None</div></div>');
      if (PLAN === 'A') { post('/pushes/read').catch(() => {}); if (S.state) S.state.unread = 0; }
    } catch (e) { offline(); }
  }
  function openSearch() {
    S.overlay = { kind: 'search' };
    const el = overlayEl();
    el.innerHTML = backBar() + '<input class="searchbox show" id="q" placeholder="Search" autocomplete="off"><div id="res" style="margin-top:12px"></div>';
    const q = $('#q'); q.focus();
    let k; q.addEventListener('input', () => { clearTimeout(k); k = setTimeout(async () => {
      const v = q.value.trim(); if (!v) { $('#res').innerHTML = ''; return; }
      try {
        let rows;
        if (PLAN === 'A') rows = (await get('/search?q=' + encodeURIComponent(v))).rows || [];
        else { S.searchIdx = S.searchIdx || ((await get('/search')).rows || []); const lv = v.toLowerCase(); rows = S.searchIdx.filter(r => r.mint === v || (r.name || '').toLowerCase().includes(lv) || (r.symbol || '').toLowerCase().includes(lv)).slice(0, 10); }
        $('#res').innerHTML = rows.length ? '<div class="list">' + rows.map(r => `<button class="row" style="width:100%;text-align:left" data-open="coin" data-mint="${esc(r.mint)}"><div class="m"><b>${esc(r.name || r.label)}</b><span>${esc(r.symbol || '')}</span></div></button>`).join('') + '</div>' : '<div class="empty-msg">None</div>';
      } catch (e) { offline(); }
    }, 250); });
  }

  async function refresh() {
    if (!PLAN) return;
    try {
      const pr = window.PnlChart ? PnlChart.state.range : '24H';
      get('/chart?range=' + pr).then(d => { S.pnl = d; window.PnlChart && S.tab === 'home' && PnlChart.update(d); }).catch(() => {});
      const jobs = [get('/state'), get('/chart?range=' + S.range), get('/activity'), get('/positions'), get('/coins')];
      if (S.tab === 'team') {
        jobs.push(get('/account'));
        ['scanner', 'auditor', 'analyst', 'executor', 'risk'].forEach(n => jobs.push(get('/agents/' + n + '/decisions')));
      }
      const r = await Promise.all(jobs);
      S.state = r[0]; S.chart = r[1]; S.activity = r[2]; S.positions = r[3] || { rows: [] }; S.coins = r[4] || { rows: [] };
      S.bought = boughtSet(); tradeFlash();
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
    if (S.tab !== 'home') document.body.classList.remove('scanning');
    if (S.tab === 'home') { if (!(window.Charts && Charts.view.busy > Date.now())) renderHome(); }
    else if (S.tab === 'coins') renderCoins();
    else if (S.tab === 'trades') renderTrades();
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
    if (e.target.closest('a[href]')) return;
    const t = e.target.closest('[data-tab],[data-go],[data-range],[data-open],[data-act],[data-pause],[data-mode],[data-bool],[data-settings]');
    if (!t || t.disabled) return;
    if (t.dataset.tab || t.dataset.go) { closeOverlay(); S.tab = t.dataset.tab || t.dataset.go; render(); refresh(); window.scrollTo(0, 0); return; }
    if (t.dataset.range) { S.range = t.dataset.range; S.prevPts = 0; try { S.chart = await get('/chart?range=' + S.range); online(); } catch (_) { offline(); } renderHome(); return; }
    if (t.dataset.open && t.dataset.mint && t.dataset.act !== 'togrow') { t.dataset.open === 'audit' ? openAudit(t.dataset.mint) : openCoin(t.dataset.mint); return; }
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
      if (key === 'auditor.enabled' && !nv) { if (!confirm('Turn off checks?') || !confirm('Sure?')) return; body.confirm = 'twice'; }
      try { await post('/settings', body); toast('Saved'); } catch (err) { toast(err.message); }
      refresh(); return;
    }
    const act = t.dataset.act;
    if (act === 'back') closeOverlay();
    else if (act === 'bell') openBell();
    else if (act === 'search') openSearch();
    else if (act === 'togstep') { const n = +t.dataset.step; S.openStep = S.openStep === n ? null : n; renderHome(); }
    else if (act === 'jumpstep') { S.openStep = +t.dataset.step; S.tab = 'home'; render(); refresh(); }
    else if (act === 'togrow') {
      const id = t.dataset.id;
      if (S.openRow === id && t.dataset.open && t.dataset.mint) {
        t.dataset.open === 'audit' ? openAudit(t.dataset.mint) : openCoin(t.dataset.mint);
        return;
      }
      S.openRow = S.openRow === id ? null : id;
      render();
    }
    else if (act === 'filt') { S.showFilt = !S.showFilt; renderCoins(); }
    else if (act === 'cfilt') { S.coinFilter = t.dataset.v; renderCoins(); }
    else if (act === 'csort') { S.coinSort = t.dataset.v; renderCoins(); }
    else if (act === 'moreact') { S.homeActAll = !S.homeActAll; renderHome(); }
    else if (act === 'hscope') {
      S.homeScope = t.dataset.v || 'session';
      if (S.tab === 'home') renderHome();
    }
    else if (act === 'statgo') {
      S.coinFilter = t.dataset.filt || 'all';
      S.showFilt = true;
      S.tab = 'coins';
      render(); refresh(); window.scrollTo(0, 0);
    }
    else if (act === 'reason') {
      const sheet = $('#sheet');
      sheet.hidden = false;
      sheet.innerHTML = `<div><div style="font-weight:600;margin-bottom:6px">${esc(t.dataset.plain || '')}</div><div class="detail" style="display:block">${esc(t.dataset.tech || '')}</div><button class="btn" style="width:100%;margin-top:14px" data-act="closesheet">Close</button></div>`;
    }
    else if (act === 'closesheet') { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
    else if (act === 'invite') {
      const url = S.account && S.account.signup_url; if (!url) { toast('Link not ready'); return; }
      if (navigator.share) { try { await navigator.share({ title: 'FOMO', url }); } catch (_) {} }
      else { try { await navigator.clipboard.writeText(url); toast('Copied'); } catch (_) { toast(url); } }
    }
    else if (act === 'testpush') { try { const r = await post('/test-push'); toast(r.ok ? 'Sent' : 'No channel'); } catch (err) { toast(err.message); } }
    else if (act === 'enablepush') enablePush();
    else if (act === 'auditor-toggle') {
      const on = S.overlay.data.enabled; const body = { key: 'auditor.enabled', value: !on };
      if (on) { if (!confirm('Turn off checks?') || !confirm('Sure?')) return; body.confirm = 'twice'; }
      try { await post('/settings', body); loadAudit(); } catch (err) { toast(err.message); }
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target, key = t.dataset.key || t.dataset.slide; if (!key || PLAN !== 'A') return;
    try { const r = await post('/settings', { key, value: t.value }); toast((r.messages && r.messages[0]) || 'Saved'); } catch (err) { toast(err.message); }
    refresh();
  });
  document.addEventListener('input', e => { const t = e.target; if (t.dataset.slide) { const n = document.querySelector(`input[data-key="${t.dataset.slide}"]`); if (n) n.value = t.value; } });
  document.addEventListener('click', e => { if (e.target.id === 'sheet') { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; } });

  async function enablePush() {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Blocked'); return; }
      const key = S.account.webpush.publicKey, pad = '='.repeat((4 - key.length % 4) % 4);
      const raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/')), arr = new Uint8Array([...raw].map(c => c.charCodeAt(0)));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: arr });
      await post('/push', sub.toJSON()); toast('On');
    } catch (err) { toast(err.message); }
  }

  if (!PLAN) {
    $('#view').innerHTML = '<div class="nav"><div class="title">Desk</div></div><div class="empty-msg">Open the private link once.</div>';
    return;
  }
  render(); refresh();
  if (PLAN === 'A') { stream(); setInterval(refresh, 30000); } else setInterval(refresh, 15000);
  window.addEventListener('resize', () => { if (S.tab === 'home' && S.chart) { S.prevPts = 0; const cv = $('#line'); if (cv) Charts.line(cv, S.chart, 0); } });
})();
