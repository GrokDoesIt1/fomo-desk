(() => {
  const DATA_DEFAULT = "PS4U4f8CnekTpJRlsI_mwuJaCNg8hCAIDE3jw1xMTAk";
  const TABS = ["home", "main", "versions", "copy", "trials"];

  function persistKey() {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const d = h.get("d");
    if (d) {
      try { localStorage.setItem("desk_d", d); } catch (_) {}
      return d;
    }
    let saved = null;
    try { saved = localStorage.getItem("desk_d"); } catch (_) {}
    return saved || DATA_DEFAULT;
  }

  const KEY = persistKey();
  try {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    if (!h.get("d") && KEY) {
      history.replaceState(null, "", location.pathname + location.search + "#d=" + encodeURIComponent(KEY));
    }
  } catch (_) {}

  const DATA_BASE = new URL("../d/" + KEY + "/", location.href).href;

  async function loadJSON(name) {
    const res = await fetch(DATA_BASE + name, { cache: "no-store" });
    if (!res.ok) throw new Error(name + " " + res.status);
    return res.json();
  }

  const $ = (sel) => document.querySelector(sel);
  const view = $("#view");
  const toast = (msg) => {
    const t = $("#toast");
    t.hidden = false; t.textContent = msg;
    setTimeout(() => { t.hidden = true; }, 2600);
  };
  const usd = (n) => (n == null || Number.isNaN(Number(n))) ? "—" : Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" });
  const signed = (n) => {
    const v = Number(n) || 0;
    const cls = v > 0 ? "up" : v < 0 ? "dn" : "";
    const s = (v > 0 ? "+" : "") + usd(v);
    return `<span class="${cls}">${s}</span>`;
  };
  const pct = (n) => {
    const v = Number(n) || 0;
    const cls = v > 0 ? "up" : v < 0 ? "dn" : "";
    return `<span class="${cls}">${v > 0 ? "+" : ""}${v.toFixed(1)}%</span>`;
  };
  const ago = (ts) => {
    if (!ts) return "";
    const t = typeof ts === "number" ? ts * (ts < 1e12 ? 1000 : 1) : Date.parse(ts);
    if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };
  const remain = (ends) => {
    if (!ends) return "—";
    const t = typeof ends === "number" ? ends * (ends < 1e12 ? 1000 : 1) : Date.parse(ends);
    const s = Math.max(0, (t - Date.now()) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h + "h " + m + "m left";
  };

  let cache = {};
  async function refresh() {
    const [state, versions, activity, positions, copy] = await Promise.all([
      loadJSON("state.json"),
      loadJSON("versions.json"),
      loadJSON("activity.json"),
      loadJSON("positions.json"),
      loadJSON("copy-grok.json")
    ]);
    cache = { state, versions, activity, positions, copy };
    return cache;
  }

  function mainDesk() {
    const v = (cache.versions && cache.versions.versions || []).find((x) => x.id === "main" || x.leader) || (cache.versions && cache.versions.versions || [])[0] || {};
    const st = cache.state || {};
    return {
      name: v.name || "Main desk",
      start: v.started_with ?? v.start_equity ?? st.startBalance ?? 350,
      now: v.now_value ?? v.equity ?? st.balance,
      change: v.change ?? v.pnl,
      change_pct: v.change_pct ?? v.pnl_pct,
      today: v.today_pnl ?? 0,
      todayPct: st.todayPct,
      run_line: v.run_line,
      trades: v.trades,
      win_rate: v.win_rate,
      open: v.open,
      recent: v.recent || []
    };
  }

  function renderHome() {
    const m = mainDesk();
    const c = cache.copy || {};
    const acts = (cache.activity && cache.activity.rows) || [];
    const live = acts.filter((a) => /buy|sell|fill|open|close/i.test((a.kind || "") + " " + (a.title || ""))).slice(0, 8);
    const show = live.length ? live : acts.slice(0, 8);
    view.innerHTML = `
      <div class="h"><h1><span class="live-dot"></span>Overview</h1><span>All desks · PAPER</span></div>
      <div class="cards">
        <div class="card">
          <div class="k">Main desk (Test 2)</div>
          <div class="v">${usd(m.now)} <small>${signed(m.change)} ${pct(m.change_pct)}</small></div>
          <div class="row"><span>Start → now</span><span>${usd(m.start)} → ${usd(m.now)}</span></div>
          <div class="row"><span>Today PnL</span><span>${signed(m.today)}</span></div>
        </div>
        <div class="card">
          <div class="k">Copy Bot</div>
          <div class="v">${usd(c.now_value ?? c.cash)} <small>${signed((c.now_value ?? c.cash ?? 0) - (c.started_with ?? 200))} ${pct(c.change_pct)}</small></div>
          <div class="row"><span>Start → now</span><span>${usd(c.started_with ?? 200)} → ${usd(c.now_value ?? c.cash)}</span></div>
          <div class="row"><span>Today PnL</span><span>${signed(c.pnl_24h)}</span></div>
          <div class="row"><span>On trial</span><span>${(c.trials || []).filter((t)=>t.status==="running").length}</span></div>
        </div>
      </div>
      <div class="h"><h1>Live</h1><span>Recent desk activity</span></div>
      <div class="list">${show.map((a) => `
        <div class="item">
          <div class="t"><span>${a.title || a.kind || "Update"}</span><span>${signed(a.value === "Skipped" ? 0 : a.value)}</span></div>
          <div class="m">${a.subtitle || a.plain || ""} · ${ago(a.ts)} · PAPER</div>
        </div>`).join("") || "<div class='item'><div class='m'>No live trades yet. Zero trades is not a failure.</div></div>"}
      </div>`;
  }

  function renderMain() {
    const m = mainDesk();
    const pos = ((cache.positions && cache.positions.rows) || []).filter((p) => p.status === "open" || p.open);
    view.innerHTML = `
      <div class="h"><h1>Main desk</h1><span class="paper-badge">PAPER</span></div>
      <div class="card">
        <div class="k">${m.name}</div>
        <div class="v">${usd(m.now)} <small>${signed(m.change)} ${pct(m.change_pct)}</small></div>
        <div class="row"><span>Start → now</span><span>${usd(m.start)} → ${usd(m.now)}</span></div>
        <div class="row"><span>Today PnL</span><span>${signed(m.today)}</span></div>
        <div class="row"><span>Trades / WR / Open</span><span>${m.trades || 0} · ${m.win_rate != null ? m.win_rate + "%" : "—"} · ${m.open || 0}</span></div>
        ${m.run_line ? `<div class="m" style="margin-top:8px;color:var(--muted)">${m.run_line}</div>` : ""}
      </div>
      <div class="h"><h1>Open</h1></div>
      <div class="list">${(pos.slice(0, 8).map((p) => `
        <div class="item"><div class="t"><span>${p.ticker || p.symbol || p.name || "Position"}</span><span>${signed(p.pnl)}</span></div>
        <div class="m">PAPER</div></div>`).join("") || "<div class='item'><div class='m'>No open paper positions.</div></div>")}
      </div>
      <div class="h"><h1>Recent closes</h1><a class="more" href="../">Full desk ↗</a></div>
      <div class="list">${(m.recent || []).slice(0, 8).map((r) => `
        <div class="item"><div class="t"><span>${r.ticker || "Trade"}</span><span>${signed(r.pnl)} ${r.pct != null ? pct(r.pct) : ""}</span></div>
        <div class="m">${r.reason || ""} · ${ago(r.closed_at)} · PAPER</div></div>`).join("")}
      </div>`;
  }

  function renderVersions() {
    const vs = (cache.versions && cache.versions.versions) || [];
    view.innerHTML = `
      <div class="h"><h1>Versions</h1><span class="paper-badge">PAPER</span></div>
      <div class="list">${vs.map((v) => `
        <div class="item">
          <div class="t"><span>${v.letter ? v.letter + " · " : ""}${v.name || v.id}</span><span>${signed(v.change ?? v.pnl)} ${pct(v.change_pct ?? v.pnl_pct)}</span></div>
          <div class="m">${usd(v.started_with ?? v.start_equity)} → ${usd(v.now_value ?? v.equity)} · today ${signed(v.today_pnl)} · ${v.trades || 0} trades · PAPER</div>
          ${v.short ? `<div class="m">${v.short}</div>` : ""}
        </div>`).join("")}
      </div>
      <p><a class="more" href="../versions/">Open full Versions page ↗</a></p>`;
  }

  function renderCopy() {
    const c = cache.copy || {};
    const thoughts = (c.thoughts || []).slice(0, 8);
    view.innerHTML = `
      <div class="h"><h1>Copy Bot</h1><span class="paper-badge">PAPER</span></div>
      <div class="card">
        <div class="k">Copy desk</div>
        <div class="v">${usd(c.now_value ?? c.cash)} <small>${signed((c.now_value ?? 0) - (c.started_with ?? 200))}</small></div>
        <div class="m">${c.run_line || ""}</div>
        <div class="row"><span>Following</span><span>${c.following || 0}</span></div>
        <div class="row"><span>Today / booked</span><span>${signed(c.pnl_24h)} / ${signed(c.booked_pnl ?? c.change)}</span></div>
      </div>
      <div class="h"><h1>Thinking</h1></div>
      ${(thoughts.map((t) => `<div class="thought">${(t.text || t.body || t).toString()}</div>`).join("")) || "<div class='m'>No thoughts yet.</div>"}
      <p><a class="more" href="../copy-grok/">Open Copy Grok page ↗</a></p>`;
  }

  function renderTrials() {
    const trials = (cache.copy && cache.copy.trials) || [];
    view.innerHTML = `
      <div class="h"><h1>Trials</h1><span>${trials.length}/10 · PAPER</span></div>
      <div class="m" style="margin-bottom:10px">Separate $200 books. Verdict after 24h. Only a YES after the verdict adds someone to the main copy desk.</div>
      <div class="list">${trials.map((t) => `
        <div class="item">
          <div class="t"><span>${t.id} · @${t.handle || "trader"}</span><span>${t.status || ""}</span></div>
          <div class="m">${remain(t.ends_at || t.ends)} · cash ${usd(t.cash_usd ?? t.cash ?? 200)} · PAPER</div>
        </div>`).join("") || "<div class='item'><div class='m'>No paper trials running.</div></div>"}
      </div>`;
  }

  const renders = { home: renderHome, main: renderMain, versions: renderVersions, copy: renderCopy, trials: renderTrials };

  function tabFromHash() {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    const t = h.get("tab") || (location.hash.includes("trials") && !h.get("d") ? "trials" : null);
    return TABS.includes(t) ? t : "home";
  }

  function setTab(tab, push) {
    document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    try { (renders[tab] || renderHome)(); } catch (e) { view.innerHTML = `<div class="err">Could not render ${tab}: ${e.message}</div>`; }
    if (push !== false) {
      const url = location.pathname + location.search + "#d=" + encodeURIComponent(KEY) + "&tab=" + tab;
      history.replaceState(null, "", url);
    }
  }

  document.getElementById("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tab]");
    if (b) setTab(b.dataset.tab);
  });

  function tickClock() {
    const el = document.getElementById("clock");
    if (el) el.textContent = new Date().toLocaleString("en-CA", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit" }) + " ET";
  }
  tickClock(); setInterval(tickClock, 15000);

  async function setupPush() {
    const btn = document.getElementById("btn-push");
    if (!("serviceWorker" in navigator)) { btn.hidden = true; return; }
    try { await navigator.serviceWorker.register("./sw.js"); } catch (e) { console.warn("sw", e); }
    const st = await navigator.permissions?.query({ name: "notifications" }).catch(() => null);
    if (Notification.permission === "granted") btn.textContent = "Alerts on"; btn.classList.toggle("on", Notification.permission === "granted");
    btn.addEventListener("click", async () => {
      try {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast("Notifications were not allowed"); return; }
        const reg = await navigator.serviceWorker.ready;
        // Public VAPID is fetched from the live desk API when reachable; otherwise we still enable the SW for later.
        let key = null;
        try {
          const acc = await fetch("../d/" + KEY + "/account.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
          key = acc && acc.webpush && acc.webpush.publicKey;
        } catch (_) {}
        if (key && window.PushManager) {
          const pad = "=".repeat((4 - key.length % 4) % 4);
          const raw = Uint8Array.from(atob((key + pad).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
          const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
          const posted = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) }).catch(() => null);
          if (posted && posted.ok) { btn.textContent = "Alerts on"; btn.classList.add("on"); toast("Push on · PAPER alerts"); return; }
          toast("Subscribed in-app, but this Pages host cannot reach the desk API yet. Alerts will work once the desk can see the subscription.");
        } else {
          toast("Alerts allowed. Install the app and keep the desk online to finish Web Push.");
        }
        btn.textContent = "Alerts on";
        btn.classList.add("on");
      } catch (err) { toast("Push setup failed"); console.warn(err); }
    });
  }

  async function boot() {
    try {
      await refresh();
      const splash = document.getElementById("splash");
      const tab = tabFromHash();
      setTab(tab, false);
      document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
      setTimeout(() => splash.classList.add("hide"), 400);
    } catch (e) {
      document.getElementById("splash").classList.add("hide");
      view.innerHTML = `<div class="err">Could not load PAPER desk data. ${e.message}</div>`;
    }
    setupPush();
    window.addEventListener("hashchange", () => setTab(tabFromHash(), false));
    setInterval(() => refresh().then(() => setTab(tabFromHash(), false)).catch(() => {}), 60000);
  }
  boot();
})();
