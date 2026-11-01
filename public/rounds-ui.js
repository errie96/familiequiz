// Tekent elk rondetype op de telefoon, het tv-scherm en de bediening.
// Per type: Rounds.<type>.phone / .tv / .host (host valt terug op tv).
// Elke functie krijgt (root, view, ctx) en wordt bij elke statusupdate opnieuw aangeroepen:
// view.key verandert = opnieuw opbouwen, anders alleen bijwerken (zodat invoer niet verdwijnt).
window.Rounds = (function () {
  const R = {};
  const LET = ["A", "B", "C", "D", "E", "F"];

  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on")) n[k] = v;
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  const fresh = (root, key, role) => {
    if (root._key === key) return false;
    root._key = key; root._ui = {}; root.replaceChildren(); root.className = "rr " + role;
    return true;
  };
  const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
  const markEl = (m) => el("span", { class: "mark " + (m || "none") }, m === "ok" ? "✔" : m === "bad" ? "✘" : "–");

  function mediaEl(media, o = {}) {
    if (!media) return null;
    if (media.kind === "audio") {
      const a = el("audio", { controls: true, class: "r-audio" });
      a.src = media.src;
      if (o.autoplay) a.autoplay = true;
      return a;
    }
    const wrap = el("div", { class: "r-imgwrap" });
    const box = el("div", { class: "r-img" });
    const img = el("img", { src: media.src, alt: "" });
    box.append(img);
    (media.hide || []).forEach(([x, y, w, h]) =>
      box.append(el("div", { class: "r-hide", style: `left:${x}%;top:${y}%;width:${w}%;height:${h}%` }, "?")));
    wrap.append(box);
    wrap._img = img;
    return wrap;
  }
  const blurStyle = (v, role) => {
    const frac = v.levels > 1 ? (v.levels - 1 - v.level) / (v.levels - 1) : 0;
    const max = role === "tv" ? 3.2 : 1.6;
    return `filter: blur(${(frac * max).toFixed(2)}${role === "tv" ? "vw" : "em"}); transform: scale(${1 + frac * 0.12});`;
  };

  // ---------- Resultaat met per team het antwoord en een groene vink of rood kruis ----------
  function renderResult(box, r) {
    if (r.category) box.append(el("span", { class: "badge" }, r.category));
    box.append(el("h2", { class: "r-q" }, r.question));
    if (r.media) box.append(mediaEl(r.media));
    if (r.options) {
      const grid = el("div", { class: "qgrid" });
      r.options.forEach((o, i) => grid.append(el("div", { class: "qo" + (i === r.answer ? " correct" : "") },
        el("b", { class: "letter" }, LET[i]), o, i === r.answer ? el("b", {}, "  ✅") : null)));
      box.append(grid);
    } else if (r.correctText) box.append(el("div", { class: "r-correct" }, "✅ " + r.correctText));
    if (r.options && r.correctText && r.sharp) box.append(el("div", { class: "r-correct" }, "✅ " + r.correctText));
    const rows = el("div", { class: "res-rows" });
    r.rows.forEach((row) => {
      const line = el("div", { class: "res-row " + (row.mark || "") },
        row.mark !== undefined && row.mark !== null ? markEl(row.mark) : el("span", { class: "mark none" }, ""),
        el("b", { class: "res-name" }, row.name),
        el("span", { class: "res-text" }, row.text || ""),
        row.points !== undefined && row.points !== null ? el("b", { class: "res-pts" }, (row.delta && row.points > 0 ? "+" : "") + fmt(row.points) + " pt") : null);
      rows.append(line);
      if (row.lines) {
        const chips = el("div", { class: "res-lines" });
        row.lines.forEach((l) => chips.append(el("span", { class: "chip2 " + l.mark }, (l.mark === "ok" ? "✔ " : l.mark === "bad" ? "✘ " : "") + l.text)));
        rows.append(chips);
      }
    });
    box.append(rows);
    if (r.explanation) box.append(el("p", { class: "r-expl" }, "💡 " + r.explanation));
  }
  const resultScreen = (root, v, role) => { renderResult(root, v.result); };

  // ---------- Info-scherm ----------
  const buildInfo = (root, v) => {
    root.append(el("div", { class: "r-emoji" }, v.emoji || "ℹ️"), el("h1", { class: "r-title" }, v.title || ""),
      v.text ? el("p", { class: "r-text" }, v.text) : null,
      v.points ? el("div", { class: "r-points" }, `Te verdienen in deze ronde: ${v.points} punten`) : null,
      v.counts === false ? el("div", { class: "r-points off" }, "Telt niet mee voor de uitslag") : null);
  };
  R.info = {
    tv(root, v) { if (fresh(root, v.key, "tv")) buildInfo(root, v); },
    phone(root, v) { if (fresh(root, v.key, "phone")) { buildInfo(root, v); root.classList.add("center"); } }
  };

  R.round_end = {
    tv(root, v) {
      if (!fresh(root, v.key, "tv")) return;
      root.append(el("h1", { class: "r-title" }, `Uitslag: ${v.roundName}`), el("p", { class: "r-sub" }, `Te verdienen: ${v.points} punten`));
      const rows = el("div", { class: "res-rows" });
      v.rows.forEach((r) => rows.append(el("div", { class: "res-row" }, el("b", { class: "mark none" }, `#${r.rank}`), el("b", { class: "res-name" }, r.name),
        el("span", { class: "res-text" }, `totaal ${fmt(r.total)}`), el("b", { class: "res-pts" }, `${fmt(r.roundPts)} pt`))));
      root.append(rows);
    },
    phone(root, v) {
      if (!fresh(root, v.key, "phone")) return;
      root.classList.add("center");
      root.append(el("h2", {}, v.roundName), v.mine ? el("p", { class: "r-text" }, `Jullie scoorden ${fmt(v.mine.roundPts)} van ${v.points} punten (plek ${v.mine.rank}). Totaal: ${fmt(v.mine.total)}.`) : null,
        el("p", { class: "r-note" }, "Kijk op het grote scherm voor de volledige uitslag."));
    }
  };
  R.review = {
    tv(root, v) { if (fresh(root, v.key, "tv")) renderResult(root, v.result); },
    phone(root, v) { if (fresh(root, v.key, "phone")) { root.classList.add("center"); root.append(el("h2", {}, "📝 Nakijken"), el("p", { class: "r-note" }, v.text)); } }
  };
  R.hitster = {
    tv(root, v) { if (fresh(root, v.key, "tv")) root.append(el("div", { class: "r-emoji" }, "🎵"), el("h1", { class: "r-title" }, v.title), el("p", { class: "r-text" }, v.text)); },
    phone(root, v) { if (fresh(root, v.key, "phone")) { root.classList.add("center"); root.append(el("h2", {}, "🎵 " + v.title), el("p", { class: "r-note" }, v.text)); } }
  };

  // ---------- Meerkeuze en logo ----------
  const ERR = {
    not_open: "De vraag is niet meer open.", not_base: "Alleen de basistelefoon kan indienen.", wrong_question: "De vraag is net gewisseld.",
    invalid: "Dat antwoord is niet geldig.", bad_wager: "Die inzet kan niet.", too_many: "Dat zijn al heel veel regels.", already: "Dit is al ingevuld.", drawer: "De tekenaar kan niet raden."
  };
  const errText = (res) => ERR[res && res.reason] || "Indienen is niet gelukt. Probeer het opnieuw.";

  function resultLine(v) {
    if (v.mine === "ok") return "✅ Goed!";
    if (v.mine === "bad") return `❌ Helaas. Het goede antwoord: ${v.correctText}`;
    return `Geen antwoord. Het goede antwoord: ${v.correctText}`;
  }

  // Gedeelde telefoon-weergave voor alles met antwoordknoppen (meerkeuze, logo, blur, slotvraag)
  function choicePhone(root, v, ctx, o = {}) {
    if (fresh(root, v.key, "phone")) {
      const u = root._ui;
      u.selected = null;
      if (v.category) root.append(el("span", { class: "badge" }, v.category));
      root.append(el("h3", { class: "r-q" }, v.question));
      if (o.top) o.top(root, u, v);
      else { const m = mediaEl(v.media); if (m) root.append(m); }
      u.btns = v.options.map((opt, i) => el("button", { class: "btn-option", onclick: () => { if (u.canPick) { u.selected = i; u.paint(); } } }, `${LET[i]}: ${opt}`));
      root.append(el("div", {}, ...u.btns));
      if (o.extra) o.extra(root, u);
      u.submit = el("button", { class: "btn-primary btn-go", onclick: () => {
        if (u.selected === null || u.sending) return;
        const payload = o.payload ? o.payload(u) : { answer: u.selected };
        if (!payload) return;
        u.sending = true;
        u.ctx.submit(payload, (res) => {
          u.sending = false;
          if (res && res.ok) { u.err.classList.add("hidden"); u.local = u.selected; }
          else { u.err.textContent = errText(res); u.err.classList.remove("hidden"); }
          u.paint();
        });
      } }, "Antwoord indienen 📤");
      u.msg = el("p", { class: "r-note" });
      u.err = el("p", { class: "r-err hidden" });
      root.append(u.submit, u.msg, u.err);
      u.paint = () => {
        const w = u.v;
        const givenVal = o.given ? o.given(w) : w.given;
        const answered = givenVal !== null && givenVal !== undefined;
        u.canPick = w.phase === "open" && w.isBase && !answered;
        const shown = answered ? givenVal : u.selected;
        u.btns.forEach((b, i) => { b.disabled = !u.canPick; b.style.background = i === shown ? "#2563eb" : ""; });
        u.submit.classList.toggle("hidden", !(u.canPick && u.selected !== null));
        if (o.onPaint) o.onPaint(u, w);
        u.msg.textContent = w.phase === "result" ? resultLine(w)
          : w.phase === "closed" ? (answered ? "✅ Ingediend. Het antwoord komt straks." : "De tijd is om.")
          : !w.isBase ? "Overleg met je team. De basistelefoon dient het antwoord in."
          : answered ? "✅ Ingediend! Wachten op de andere teams..." : "";
      };
    }
    const u = root._ui;
    u.v = v; u.ctx = ctx;
    if (o.update) o.update(u, v);
    u.paint();
  }

  function choiceTV(root, v, ctx) {
    if (fresh(root, v.key, "tv")) {
      if (v.phase === "result" && v.result) { renderResult(root, v.result); return; }
      if (v.category) root.append(el("span", { class: "pill cat" }, v.category));
      root.append(el("h1", { class: "r-q" }, v.question));
      const m = mediaEl(v.media, { autoplay: true });
      if (m) root.append(el("div", { class: "r-media" }, m));
      const grid = el("div", { class: "qgrid" });
      v.options.forEach((o, i) => grid.append(el("div", { class: "qo" }, el("b", { class: "letter" }, LET[i]), o)));
      root.append(grid);
      if (v.phase === "closed") root.append(el("div", { class: "r-banner" }, "✅ Alle teams hebben geantwoord"));
    }
  }
  function choiceHost(root, v, ctx) {
    if (v.phase === "result" && v.result) { if (fresh(root, v.key, "host")) renderResult(root, v.result); return; }
    if (fresh(root, v.key, "host")) {
      if (v.category) root.append(el("span", { class: "badge" }, v.category));
      root.append(el("h3", { class: "r-q" }, v.question));
      const m = mediaEl(v.media); if (m) root.append(m);
      v.options.forEach((o, i) => root.append(el("div", { class: "qo" + (i === v.answer ? " correct" : ""), style: "margin-top:6px" }, `${LET[i]}: ${o}${i === v.answer ? "  ✅" : ""}`)));
    }
  }
  R.mc = { phone: (r, v, c) => choicePhone(r, v, c), tv: choiceTV, host: choiceHost };
  R.logo = R.mc;

  // ---------- Foto blur ----------
  R.blur = {
    phone: (root, v, ctx) => choicePhone(root, v, ctx, {
      top(rt, u, vv) { u.img = mediaEl(vv.media); u.pts = el("div", { class: "r-banner small" }); rt.append(u.img, u.pts); },
      update(u, vv) { u.img._img.style.cssText = blurStyle(vv, "phone"); u.pts.textContent = vv.phase === "open" ? `Nu goed antwoorden = ${vv.pointsNow} punten` : ""; u.pts.classList.toggle("hidden", vv.phase !== "open"); }
    }),
    tv(root, v) {
      if (fresh(root, v.key, "tv")) {
        if (v.phase === "result" && v.result) { renderResult(root, v.result); return; }
        root.append(el("h1", { class: "r-q" }, v.question));
        root._ui.img = mediaEl(v.media); root._ui.pts = el("div", { class: "r-banner" });
        root.append(el("div", { class: "r-media" }, root._ui.img), root._ui.pts);
        const grid = el("div", { class: "qgrid" });
        v.options.forEach((o, i) => grid.append(el("div", { class: "qo" }, el("b", { class: "letter" }, LET[i]), o)));
        root.append(grid);
      }
      const u = root._ui;
      if (u.img) { u.img._img.style.cssText = blurStyle(v, "tv"); u.pts.textContent = `Nu goed antwoorden = ${v.pointsNow} punten`; }
    },
    host(root, v, ctx) {
      if (v.phase === "result" && v.result) { if (fresh(root, v.key, "host")) renderResult(root, v.result); return; }
      if (fresh(root, v.key, "host")) {
        root.append(el("h3", { class: "r-q" }, v.question));
        const u = root._ui;
        u.img = mediaEl(v.media);
        u.img.style.cursor = "pointer";
        u.img.onclick = () => ctx.act("clearer");
        u.info = el("p", { class: "r-note" });
        root.append(u.img, u.info, el("p", { class: "r-note" }, "Tik op het plaatje om het duidelijker te maken."));
        v.options.forEach((o, i) => root.append(el("div", { class: "qo" + (i === v.answer ? " correct" : ""), style: "margin-top:6px" }, `${LET[i]}: ${o}${i === v.answer ? "  ✅" : ""}`)));
      }
      const u = root._ui;
      u.img._img.style.cssText = blurStyle(v, "phone");
      u.info.textContent = `Stap ${v.level + 1} van ${v.levels}  ·  nu goed antwoorden = ${v.pointsNow} punten`;
    }
  };

  // ---------- Geheugen ----------
  R.memory = {
    phone(root, v, ctx) {
      if (fresh(root, v.key, "phone")) {
        const u = root._ui;
        root.append(el("h3", { class: "r-q" }, v.prompt));
        if (v.phase === "result") { renderResult(root, { ...v.result, question: "Uitslag" }); return; }
        u.list = el("div", { class: "memo-list" });
        if (v.phase === "writing" && v.isBase) {
          u.input = el("input", { type: "text", maxlength: 80, placeholder: "Typ een antwoord en tik op Toevoegen", autocomplete: "off" });
          const add = () => { const t = u.input.value.trim(); if (!t) return; u.ctx.submit({ op: "add", text: t }, (res) => { if (res && res.ok) { u.input.value = ""; u.input.focus(); } }); };
          u.input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
          u.doneBtn = el("button", { class: "btn-primary", style: "background:#22c55e", onclick: () => u.ctx.submit({ op: "done", value: !u.v.done }, () => {}) });
          root.append(u.input, el("button", { class: "btn-primary", onclick: add }, "➕ Toevoegen"), u.list, u.doneBtn);
        } else root.append(u.list);
        u.note = el("p", { class: "r-note" });
        root.append(u.note);
      }
      const u = root._ui;
      u.v = v; u.ctx = ctx;
      if (v.phase === "result") return;
      u.list.replaceChildren();
      v.lines.forEach((t, i) => u.list.append(el("div", { class: "memo-line" }, el("span", {}, t),
        v.phase === "writing" && v.isBase ? el("button", { class: "btn-x", onclick: () => ctx.submit({ op: "remove", i }, () => {}) }, "✕") : null)));
      if (u.doneBtn) u.doneBtn.textContent = v.done ? "↩️ Toch nog aanvullen" : "✅ Wij zijn klaar";
      u.note.textContent = v.phase === "judging" ? "De quizmaster kijkt jullie antwoorden na..." : v.isBase ? `${v.lines.length} antwoorden opgeschreven` : "De basistelefoon schrijft op. Jullie zien de lijst live.";
    },
    tv(root, v) {
      if (fresh(root, v.key, "tv")) {
        if (v.phase === "result") { renderResult(root, { ...v.result, question: v.prompt }); return; }
        root.append(el("h1", { class: "r-q" }, v.prompt), el("p", { class: "r-sub" }, v.phase === "writing" ? "Schrijf zoveel mogelijk op!" : "De quizmaster kijkt de antwoorden na..."));
        root._ui.chips = el("div", { class: "chips-row" });
        root.append(root._ui.chips);
      }
      const u = root._ui;
      if (u.chips) { u.chips.replaceChildren(); (v.counts || []).forEach((c) => u.chips.append(el("span", { class: "tchip" + (c.done ? " done" : "") }, `${c.done ? "✓ " : ""}${c.name}: ${c.n}`))); }
    },
    host(root, v, ctx) {
      // De quizmaster ziet de antwoorden live en keurt ze goed of fout
      root.className = "rr host";
      root._key = v.key + ":" + JSON.stringify(v.judging || v.counts);
      root.replaceChildren();
      root.append(el("h3", { class: "r-q" }, v.prompt), el("p", { class: "r-note" }, `Te verdienen: ${v.total} punten (1 per goed antwoord)`));
      if (v.key_list && v.key_list.length) root.append(el("details", {}, el("summary", {}, "Antwoorden op het bord"), el("p", { class: "r-note" }, v.key_list.join(" · "))));
      if (v.phase === "writing") {
        (v.counts || []).forEach((c) => root.append(el("div", { class: "team-line" }, `${c.done ? "✓ " : ""}${c.name}: ${c.n} antwoorden`)));
        return;
      }
      (v.judging || []).forEach((t) => {
        const box = el("div", { class: "team" }, el("b", {}, `${t.name} (${t.lines.filter((l) => l.ok === true).length} goed)`));
        const all = el("button", { class: "btn-option btn-small", onclick: () => ctx.act("judge_all", { teamId: t.teamId, ok: true }) }, "Alles goed");
        box.append(all);
        t.lines.forEach((l, i) => box.append(el("div", { class: "judge-line" }, el("span", {}, l.t),
          el("span", {}, el("button", { class: "btn-small " + (l.ok === true ? "on-ok" : "btn-option"), onclick: () => ctx.act("judge", { teamId: t.teamId, i, ok: l.ok === true ? null : true }) }, "✔"),
            el("button", { class: "btn-small " + (l.ok === false ? "on-bad" : "btn-option"), onclick: () => ctx.act("judge", { teamId: t.teamId, i, ok: l.ok === false ? null : false }) }, "✘")))));
        root.append(box);
      });
    }
  };

  // ---------- Prijzen van vroeger ----------
  R.prices = {
    phone(root, v, ctx) {
      if (fresh(root, v.key, "phone")) {
        const u = root._ui;
        root.append(el("h3", { class: "r-q" }, v.product), v.unit ? el("p", { class: "r-note" }, v.unit) : null);
        if (v.phase === "result") { renderResult(root, v.result); return; }
        const field = (label) => { const i = el("input", { type: "text", inputmode: "decimal", placeholder: "0,00", autocomplete: "off" }); return { i, row: el("label", { class: "price-field" }, el("span", {}, label), i) }; };
        u.now = field("Prijs nu (€)"); u.then = field(`Prijs ${v.years} jaar geleden (€)`);
        u.submit = el("button", { class: "btn-primary btn-go", onclick: () => {
          const now = parseFloat(u.now.i.value.replace(",", ".")), then = parseFloat(u.then.i.value.replace(",", "."));
          if (!(now >= 0) || !(then >= 0)) { u.err.textContent = "Vul beide prijzen in."; u.err.classList.remove("hidden"); return; }
          u.ctx.submit({ now, then }, (res) => { if (!(res && res.ok)) { u.err.textContent = errText(res); u.err.classList.remove("hidden"); } else u.err.classList.add("hidden"); });
        } }, "Antwoord indienen 📤");
        u.msg = el("p", { class: "r-note" }); u.err = el("p", { class: "r-err hidden" });
        root.append(u.now.row, u.then.row, u.submit, u.msg, u.err);
      }
      const u = root._ui;
      if (v.phase === "result") return;
      u.ctx = ctx;
      const locked = !v.isBase || !!v.given;
      [u.now.i, u.then.i].forEach((i) => { i.disabled = locked; });
      if (v.given) { u.now.i.value = String(v.given.now).replace(".", ","); u.then.i.value = String(v.given.then).replace(".", ","); }
      u.submit.classList.toggle("hidden", locked);
      u.msg.textContent = v.given ? "✅ Ingediend! Wachten op de andere teams..." : !v.isBase ? "Overleg met je team. De basistelefoon dient het antwoord in." : "";
    },
    tv(root, v) {
      if (!fresh(root, v.key, "tv")) return;
      if (v.phase === "result") { renderResult(root, { ...v.result, question: v.product }); return; }
      root.append(el("div", { class: "r-emoji" }, "🛒"), el("h1", { class: "r-title" }, v.product), v.unit ? el("p", { class: "r-sub" }, v.unit) : null,
        el("div", { class: "r-banner" }, "Wat kost het nu?"), el("div", { class: "r-banner alt" }, `En wat kostte het ${v.years} jaar geleden?`));
    },
    host(root, v) {
      if (fresh(root, v.key, "host")) {
        if (v.phase === "result") { renderResult(root, v.result); return; }
        root.append(el("h3", { class: "r-q" }, v.product), el("p", { class: "r-note" }, `Antwoord: nu € ${v.actual.now.toFixed(2).replace(".", ",")} · ${v.years} jaar geleden € ${v.actual.then.toFixed(2).replace(".", ",")}`));
      }
    }
  };

  // ---------- Tekenen ----------
  const PALETTE = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"];
  function board(editable) {
    const canvas = el("canvas", { width: 640, height: 480, class: "board" });
    const g = canvas.getContext("2d");
    const clear = () => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, 640, 480); };
    const last = {};
    const seg = (s, pts) => {
      g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w; g.lineCap = "round"; g.lineJoin = "round";
      pts.forEach((p) => {
        const x = p[0] * 640, y = p[1] * 480, l = last[s.id];
        g.beginPath();
        if (l) { g.moveTo(l[0] * 640, l[1] * 480); g.lineTo(x, y); g.stroke(); } else { g.arc(x, y, s.w / 2, 0, 7); g.fill(); }
        last[s.id] = p;
      });
    };
    clear();
    const api = { canvas, clear: () => { clear(); Object.keys(last).forEach((k) => delete last[k]); }, seg, redraw(strokes) { api.clear(); strokes.forEach((s) => seg(s, s.p)); } };
    return api;
  }
  R.draw = {
    phone(root, v, ctx) {
      if (fresh(root, v.key, "phone")) {
        const u = root._ui;
        root.append(el("h3", {}, `✏️ Tekenbeurt ${v.turn} van ${v.turns}`));
        if (v.phase === "result") { root.append(el("p", { class: "r-note" }, `Jullie team scoorde ${v.points} punten in deze ronde.`)); return; }
        if (v.me === "idle") { root.append(el("p", { class: "r-note" }, "Jullie team heeft deze beurt geen tekenaar. Kijk mee op het grote scherm.")); return; }
        if (v.phase === "ready") {
          root.append(el("p", { class: "r-text" }, v.me === "drawer" ? "Jij bent de tekenaar! Ga naar de tafel van de quizmaster en wacht op de start." : `${v.drawerLabel} gaat tekenen. Maak je klaar om te raden!`));
          return;
        }
        if (v.phase === "turn_end") { root.append(el("div", { class: "r-banner" }, `Het woord was: ${v.word || "?"}`), el("p", { class: "r-note" }, `${v.guessedCount} teamgenoot(en) hadden het goed.`)); return; }
        // drawing
        const b = board(v.me === "drawer"); u.board = b;
        if (v.me === "drawer") root.append(el("div", { class: "r-banner" }, `Teken: ${v.word}`));
        root.append(b.canvas);
        ctx.fetch((res) => { if (res && root._ui === u) b.redraw(res.strokes || []); });
        if (v.me === "drawer") {
          let color = PALETTE[0], width = 6, id = null, buf = [], t = 0;
          const flush = () => { if (buf.length) { ctx.event("stroke", { id, c: color, w: width, p: buf }); buf = []; } };
          const pt = (e) => { const r = b.canvas.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
          b.canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); b.canvas.setPointerCapture(e.pointerId); id = Math.random().toString(36).slice(2, 10); const p = pt(e); buf = [p]; b.seg({ id, c: color, w: width }, [p]); t = Date.now(); flush(); });
          b.canvas.addEventListener("pointermove", (e) => { if (!id) return; const p = pt(e); buf.push(p); b.seg({ id, c: color, w: width }, [p]); if (Date.now() - t > 90) { t = Date.now(); flush(); } });
          const up = () => { if (id) { flush(); id = null; } };
          b.canvas.addEventListener("pointerup", up); b.canvas.addEventListener("pointercancel", up);
          const tools = el("div", { class: "tools" });
          PALETTE.forEach((c) => tools.append(el("button", { class: "swatch", style: `background:${c}`, onclick: () => { color = c; } })));
          [3, 6, 14].forEach((w) => tools.append(el("button", { class: "btn-option btn-small", onclick: () => { width = w; } }, w === 3 ? "dun" : w === 6 ? "middel" : "dik")));
          tools.append(el("button", { class: "btn-option btn-small", onclick: () => { b.clear(); ctx.event("clear", {}); } }, "🧽 Wis alles"));
          root.append(tools, el("p", { class: "r-note" }, "Niet praten of de letters schrijven!"));
        } else {
          u.input = el("input", { type: "text", placeholder: "Wat is het?", autocomplete: "off", maxlength: 40 });
          u.msg = el("p", { class: "r-note" });
          const go = () => {
            const guess = u.input.value.trim(); if (!guess) return;
            ctx.submit({ guess }, (res) => {
              if (res && res.correct) { u.msg.textContent = "✅ Goed geraden!"; u.input.disabled = true; u.btn.disabled = true; }
              else { u.msg.textContent = "❌ Niet goed, probeer nog eens."; u.input.value = ""; }
            });
          };
          u.input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
          u.btn = el("button", { class: "btn-primary", onclick: go }, "Raad! 🎯");
          root.append(u.input, u.btn, u.msg);
        }
        window.Rounds._incoming = (d) => {
          if (d.sid !== v.sid || d.turn !== v.turn - 1 || root._ui !== u) return;
          if (d.type === "clear") b.clear(); else if (d.type === "stroke") b.seg(d.data, d.data.p);
        };
      }
      const u = root._ui;
      if (u.input && v.guessedMe) { u.input.disabled = true; u.btn.disabled = true; u.msg.textContent = "✅ Goed geraden!"; }
    },
    tv(root, v) {
      root.className = "rr tv";
      root.replaceChildren();
      root.append(el("h1", { class: "r-title" }, `✏️ Tekenbeurt ${v.turn} van ${v.turns}`));
      const t = v.teams || [];
      if (v.phase === "ready") root.append(el("div", { class: "r-banner" }, "Tekenaars: kom naar de tafel van de quizmaster!"));
      if (v.phase === "result") root.append(el("p", { class: "r-sub" }, "De tekenronde is klaar."));
      const rows = el("div", { class: "res-rows" });
      t.forEach((x) => rows.append(el("div", { class: "res-row" }, el("span", { class: "mark none" }, "✏️"), el("b", { class: "res-name" }, x.name),
        el("span", { class: "res-text" }, v.phase === "result" ? "" : x.drawer ? `${x.drawer} tekent${v.phase === "turn_end" && x.word ? ` · woord: ${x.word}` : ""}${v.phase === "drawing" || v.phase === "turn_end" ? ` · ${x.guessed} geraden` : ""}` : "geen tekenaar deze beurt"),
        el("b", { class: "res-pts" }, `${x.points} pt`))));
      root.append(rows);
    },
    host(root, v, ctx) {
      root.className = "rr host"; root.replaceChildren();
      root.append(el("h3", {}, `✏️ Tekenbeurt ${v.turn} van ${v.turns}`));
      (v.teams || []).forEach((x) => root.append(el("div", { class: "team-line" }, `${x.name}: ${x.drawer ? `${x.drawer} tekent "${x.word}" · ${x.guessed} geraden` : "geen tekenaar"} · ${x.points} pt`)));
    }
  };

  // ---------- 30 seconds ----------
  const wordList = (words, marks, onToggle) => {
    const box = el("div", { class: "words" });
    words.forEach((w, i) => {
      const row = el("div", { class: "word" + (marks && marks[i] ? " ok" : "") }, el("span", {}, w));
      if (onToggle) row.append(el("button", { class: "btn-small " + (marks && marks[i] ? "on-ok" : "btn-option"), onclick: () => onToggle(i, !(marks && marks[i])) }, marks && marks[i] ? "✔ goed" : "goed?"));
      else if (marks) row.append(markEl(marks[i] ? "ok" : "bad"));
      box.append(row);
    });
    return box;
  };
  R.thirty = {
    phone(root, v) {
      root.className = "rr phone"; root.replaceChildren();
      root.append(el("h3", {}, `⏱️ Beurt ${v.turn} van ${v.turns}`));
      if (v.phase === "result") { root.append(el("p", { class: "r-note" }, "Deze ronde is klaar.")); return; }
      if (v.me === "explainer") {
        if (v.phase === "ready") root.append(el("div", { class: "r-banner" }, "Jij bent aan de beurt! Wacht op de start van de quizmaster."));
        else { root.append(el("p", { class: "r-note" }, "Leg uit zonder het woord zelf te zeggen!")); root.append(wordList(v.words || [], v.phase === "judge" ? v.marks : null)); }
      } else if (v.me === "guesser") root.append(el("div", { class: "r-banner" }, `${v.explainer} legt uit. Raad mee!`));
      else root.append(el("p", { class: "r-note" }, `${v.teamName} is aan de beurt (${v.explainer}). Kijk op het grote scherm.`));
    },
    tv(root, v) {
      root.className = "rr tv"; root.replaceChildren();
      root.append(el("h1", { class: "r-title" }, `⏱️ Beurt ${v.turn} van ${v.turns}`));
      if (v.phase === "result") root.append(el("p", { class: "r-sub" }, "De 30-secondenronde is klaar."));
      else {
        root.append(el("div", { class: "r-banner" }, `${v.teamName}: ${v.explainer} legt uit`));
        if (v.phase === "ready") root.append(el("p", { class: "r-sub" }, "Maak je klaar..."));
        if (v.phase === "running") root.append(el("p", { class: "r-sub" }, `✔ ${v.marksCount} goed`));
        if (v.phase === "judge" && v.words) root.append(wordList(v.words, v.marks));
      }
      const rows = el("div", { class: "chips-row" });
      (v.scores || []).forEach((s) => rows.append(el("span", { class: "tchip" }, `${s.name}: ${s.points}`)));
      root.append(rows);
    },
    host(root, v, ctx) {
      root.className = "rr host"; root.replaceChildren();
      root.append(el("h3", {}, `⏱️ Beurt ${v.turn} van ${v.turns}`));
      if (v.phase === "result") return;
      root.append(el("p", { class: "r-note" }, `${v.teamName}: ${v.explainer}`));
      root.append(wordList(v.words || [], v.marks, v.phase === "running" || v.phase === "judge" ? (i, ok) => ctx.act("mark", { i, ok }) : null));
      root.append(el("button", { class: "btn-option btn-small", onclick: () => { if (confirm("Deze beurt overslaan?")) ctx.act("skip_turn"); } }, "⏭️ Beurt overslaan"));
    }
  };

  // ---------- Slotvraag met inzet ----------
  R.final = {
    phone: (root, v, ctx) => choicePhone(root, v, ctx, {
      given: (w) => (w.given ? w.given.answer : null),
      extra(rt, u) {
        u.wager = el("input", { type: "number", min: 0, step: 1, inputmode: "numeric", placeholder: "0" });
        rt.append(el("label", { class: "price-field" }, el("span", { class: "wager-label" }), u.wager));
        u.wagerLabel = rt.querySelector(".wager-label");
      },
      payload(u) {
        const wager = parseInt(u.wager.value || "0", 10);
        if (!Number.isInteger(wager) || wager < 0 || wager > u.v.total) { u.err.textContent = `Kies een inzet tussen 0 en ${u.v.total}.`; u.err.classList.remove("hidden"); return null; }
        return { answer: u.selected, wager };
      },
      onPaint(u, w) {
        u.wagerLabel.textContent = w.given ? `Jullie inzet: ${w.given.wager}` : `Jullie inzet (je hebt ${w.total} punten)`;
        u.wager.disabled = !(w.phase === "open" && w.isBase && !w.given);
        if (w.given) u.wager.value = w.given.wager;
        u.wager.classList.toggle("hidden", w.phase === "result");
        u.wagerLabel.parentElement.classList.toggle("hidden", w.phase === "result");
      }
    }),
    tv: choiceTV,
    host: choiceHost
  };

  // ---------- Joker ----------
  R.joker = {
    phone(root, v, ctx) {
      root.className = "rr phone"; root.replaceChildren();
      root.append(el("h2", {}, "🃏 Joker inzetten"), el("p", { class: "r-text" }, "Kies één ronde waarin jullie punten worden verdubbeld. Dit kan maar één keer."));
      if (v.chosen) { root.append(el("div", { class: "r-banner" }, `Jullie joker staat op: ${v.chosen}`)); return; }
      if (v.phase !== "open") { root.append(el("p", { class: "r-note" }, "De jokers zijn ingezet.")); return; }
      if (!v.isBase) { root.append(el("p", { class: "r-note" }, "Overleg met je team. De basistelefoon kiest.")); }
      (v.choices || []).forEach((c) => root.append(el("button", { class: "btn-option", disabled: !v.isBase, onclick: () => {
        if (confirm(`Joker inzetten op "${c.name}"? Dit kan daarna niet meer worden aangepast.`)) ctx.submit({ roundId: c.id }, (res) => { if (!(res && res.ok)) alert(errText(res)); });
      } }, `${c.name}  ·  jullie score: ${fmt(c.pts)}`)));
    },
    tv(root, v) {
      if (fresh(root, v.key, "tv")) { root.append(el("div", { class: "r-emoji" }, "🃏"), el("h1", { class: "r-title" }, "Jokers inzetten!"), el("p", { class: "r-text" }, "Kies op de basistelefoon de ronde waarin jullie punten verdubbeld worden."), root._ui.chips = el("div", { class: "chips-row" })); }
      const u = root._ui; u.chips.replaceChildren();
      (v.teams || []).forEach((t) => u.chips.append(el("span", { class: "tchip" + (t.chosen ? " done" : "") }, `${t.chosen ? "✓ " : ""}${t.name}`)));
    },
    host(root, v, ctx) {
      root.className = "rr host"; root.replaceChildren();
      root.append(el("h3", {}, "🃏 Jokers"));
      (v.teams || []).forEach((t) => root.append(el("div", { class: "team-line" }, `${t.name}: ${t.chosen ? "gekozen: " + (t.round || "?") : "nog niet gekozen"}`,
        t.chosen ? el("button", { class: "btn-option btn-small", onclick: () => ctx.act("clear_joker", { teamId: t.teamId }) }, "↩️ wissen") : null)));
    }
  };

  return Object.assign(R, { el, renderResult, _incoming: null, mediaEl });
})();
