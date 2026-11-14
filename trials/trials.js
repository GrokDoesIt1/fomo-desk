(function (global) {
  const DATA_DEFAULT = "PS4U4f8CnekTpJRlsI_mwuJaCNg8hCAIDE3jw1xMTAk";

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

  function dataUrl(name) {
    const key = persistKey();
    return new URL("../d/" + key + "/" + name, location.href).href;
  }

  function money(n, opts) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    const abs = Math.abs(v);
    const d = abs >= 100 ? 2 : abs >= 1 ? 2 : 2;
    const s = v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: d, maximumFractionDigits: d });
    if (opts && opts.sign && v > 0) return "+" + s;
    return s;
  }
  function pct(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const v = Number(n);
    return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
  }
  function cls(n) { return n > 0 ? "tr-up" : n < 0 ? "tr-dn" : ""; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function mcap(n) {
    if (n == null || Number.isNaN(Number(n))) return "n/a";
    const v = Number(n);
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(v >= 100e3 ? 0 : 1) + "k";
    return money(v);
  }
  function remain(ends, now) {
    if (!ends) return "—";
    const t = ends < 1e12 ? ends * 1000 : ends;
    const s = Math.max(0, (t - (now || Date.now())) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (s <= 0) return "verdict due";
    if (h) return h + "h " + String(m).padStart(2, "0") + "m left";
    return m + "m left";
  }
  function wr(b) {
    if (b.win_rate == null) return "—";
    return Number(b.win_rate).toFixed(0) + "%";
  }
  function bestWorst(b) {
    const bits = [];
    if (b.best && b.best.symbol) bits.push("best " + b.best.symbol + " " + money(b.best.pnl, { sign: true }));
    if (b.worst && b.worst.symbol && (!b.best || b.worst.symbol !== b.best.symbol || b.closed > 1)) {
      bits.push("worst " + b.worst.symbol + " " + money(b.worst.pnl, { sign: true }));
    }
    if (!bits.length) return "—";
    return bits.join(" · ");
  }

  function strip(data) {
    const s = data.summary || {};
    const pnl = Number(s.pnl_usd || 0);
    return `<div class="tr-strip">
      <div class="cell"><div class="k">Start</div><div class="v">${esc(money(s.start_usd))}</div></div>
      <div class="cell"><div class="k">Equity</div><div class="v">${esc(money(s.equity_usd))}</div></div>
      <div class="cell"><div class="k">PnL</div><div class="v ${cls(pnl)}">${esc(money(pnl, { sign: true }))} <span style="font-size:13px;font-weight:650">${esc(pct(s.pnl_pct))}</span></div></div>
      <div class="cell"><div class="k">Open</div><div class="v">${esc(s.open || 0)}</div></div>
      <div class="cell wide"><div class="k">Verdicts</div><div class="v sm" data-cd="${esc(s.countdown_to || "")}">${esc(s.verdict_at_et || "")}${s.verdict_at_nova6_et ? " · nova6 " + String(s.verdict_at_nova6_et).replace(/^.*, /, "") : ""}</div></div>
    </div>`;
  }

  function posBlock(p) {
    const x = p.multiple != null ? Number(p.multiple).toFixed(2) + "×" : "—";
    return `<div class="tr-pos">
      <div class="row"><span>${esc(p.symbol || "coin")}</span><span class="${cls(p.pnl_usd)}">${esc(money(p.pnl_usd, { sign: true }))}</span></div>
      <div class="row"><span>Entry MC</span><span>${esc(mcap(p.entry_mcap))}</span></div>
      <div class="row"><span>Now MC</span><span>${esc(mcap(p.now_mcap))}</span></div>
      <div class="row"><span>Multiple</span><span>${esc(x)}</span></div>
      <div class="row"><span>Initials out</span><span>${p.initials_out ? "yes" : "no"}</span></div>
    </div>`;
  }

  function closedBlock(t) {
    const x = t.multiple != null ? Number(t.multiple).toFixed(2) + "×" : "—";
    return `<div class="tr-fill">
      <div class="row"><span>${esc(t.symbol || "coin")}</span><span class="${cls(t.pnl_usd)}">${esc(money(t.pnl_usd, { sign: true }))}</span></div>
      <div class="row"><span>In → out</span><span>${esc(money(t.buy_usd))} → ${esc(money(t.proceeds_usd))} · ${esc(x)}</span></div>
      <div class="row"><span>Exit</span><span>${esc((t.exit_reason || "").replace(/_/g, " "))}</span></div>
    </div>`;
  }

  function card(b) {
    const skip = b.top_skip_reason
      ? `${b.copied}/${b.buys_seen} copied · ${b.skipped} skipped (${esc(b.top_skip_reason)})`
      : `${b.copied}/${b.buys_seen} copied` + (b.skipped ? ` · ${b.skipped} skipped` : "");
    const vcls = b.verdict === "WORTH FOLLOWING" ? "ok" : b.verdict === "NOT WORTH IT" ? "no" : "";
    const opens = (b.open_positions || []).map(posBlock).join("") || `<p class="tr-empty">No open positions.</p>`;
    const closed = (b.closed_trades || []).map(closedBlock).join("") || `<p class="tr-empty">No closed trades yet.</p>`;
    const href = b.address ? "https://solscan.io/account/" + encodeURIComponent(b.address) : "";
    return `<article class="tr-card" data-id="${esc(b.id)}" tabindex="0" role="button" aria-expanded="false">
      <div class="hd">
        <div class="who">
          <div class="nm">${esc(b.handle || b.id)} <span class="tid">${esc(b.id)}</span></div>
          <div class="wal">${href ? `<a class="tr-wal" href="${href}" target="_blank" rel="noopener">${esc(b.address_short)}</a>` : esc(b.address_short)}</div>
        </div>
        <div class="pnl ${cls(b.pnl_usd)}">${esc(money(b.pnl_usd, { sign: true }))}<small>${esc(pct(b.pnl_pct))}</small></div>
        <svg class="tr-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </div>
      <div class="tr-meta">
        <div><span class="k">Start → now</span><span>${esc(money(b.start_usd))} → ${esc(money(b.equity_usd))}</span></div>
        <div><span class="k">Trades</span><span>${esc(b.closed)} closed · ${esc(b.open)} open</span></div>
        <div><span class="k">Win rate</span><span>${esc(wr(b))}</span></div>
        <div><span class="k">Time left</span><span data-left="${esc(b.ends_at || "")}">${esc(b.countdown || remain(b.ends_at))}</span></div>
        <div><span class="k">Best / worst</span><span>${esc(bestWorst(b))}</span></div>
        <div><span class="k">Leader buys</span><span>${skip}</span></div>
      </div>
      <div class="tr-verdict ${vcls}">${esc(b.verdict || "")}</div>
      <div class="tr-more">
        <h3>Open</h3>${opens}
        <h3>Closed</h3>${closed}
      </div>
    </article>`;
  }

  function renderTrialsBoard(root, data, opts) {
    if (!root) return;
    if (!data || !data.books) {
      root.innerHTML = `<div class="tr-err">No trial data yet.</div>`;
      return;
    }
    const standalone = opts && opts.standalone;
    const s = data.summary || {};
    root.classList.add("tr-root");
    root.innerHTML = `
      <div class="${standalone ? "tr-page" : ""}" style="${standalone ? "" : "padding:0 16px"}">
        <div class="tr-top"><h1 class="tr-title">Trials</h1><span class="tr-paper">Paper</span></div>
        <p class="tr-sub">Seven $1,000 books · ranked by PnL after fees and slippage</p>
        ${strip(data)}
        <div class="tr-cards">${(data.books || []).map(card).join("")}</div>
        <p class="tr-foot">${esc(data.rules || "")}</p>
      </div>`;
    root.querySelectorAll(".tr-card").forEach((el) => {
      const toggle = (ev) => {
        if (ev.target.closest("a")) return;
        const on = el.classList.toggle("open");
        el.setAttribute("aria-expanded", on ? "true" : "false");
      };
      el.addEventListener("click", toggle);
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(ev); }
      });
    });
    const cd = root.querySelector("[data-cd]");
    const tick = () => {
      const now = Date.now();
      root.querySelectorAll("[data-left]").forEach((n) => {
        n.textContent = remain(Number(n.getAttribute("data-left")), now);
      });
      if (cd && s.verdict_at_et) {
        const left = remain(Number(cd.getAttribute("data-cd")), now);
        const nova = s.verdict_at_nova6_et ? " · nova6 " + String(s.verdict_at_nova6_et).replace(/^.*, /, "") : "";
        cd.textContent = (s.verdict_at_et || "") + nova + " · " + left;
      }
    };
    tick();
    if (root._trTick) clearInterval(root._trTick);
    root._trTick = setInterval(tick, 15000);
  }

  async function loadTrialsBoard() {
    const url = dataUrl("trials.json");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("trials.json " + res.status);
    return res.json();
  }

  async function bootTrialsPage(root) {
    const key = persistKey();
    try {
      if (key && !(new URLSearchParams((location.hash || "").replace(/^#/, "")).get("d"))) {
        history.replaceState(null, "", location.pathname + location.search + "#d=" + encodeURIComponent(key));
      }
    } catch (_) {}
    try {
      const data = await loadTrialsBoard();
      renderTrialsBoard(root, data, { standalone: true });
    } catch (e) {
      root.classList.add("tr-root");
      root.innerHTML = `<div class="tr-page"><div class="tr-top"><h1 class="tr-title">Trials</h1><span class="tr-paper">Paper</span></div><div class="tr-err">Could not load trial books. ${esc(e.message || e)}</div></div>`;
    }
  }

  global.persistTrialsKey = persistKey;
  global.renderTrialsBoard = renderTrialsBoard;
  global.loadTrialsBoard = loadTrialsBoard;
  global.bootTrialsPage = bootTrialsPage;
})(window);
