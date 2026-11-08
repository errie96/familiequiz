// Bediening (quizmaster) – Stap-paneel: wat de quizmaster bij de huidige stap ziet en doet.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Stap-paneel ----------------
const L = (i) => QuizFX.letter(i);
function toggle(on, onclick) {
  const b = el("button", "tg " + (on ? "on" : "off"), on ? "✔ goed" : "✘ fout");
  b.onclick = onclick;
  return b;
}
function renderPanel(state) {
  const box = $("panel");
  const p = state.panel, step = state.step;
  if (!(p && p.type === "demo_draw" && p.status === "drawing")) demoPadEl = null;
  else if (demoPadEl && box.contains(demoPadEl)) return;
  box.replaceChildren();
  if (!p || state.phase !== "PLAY") return box.classList.add("hidden");
  box.classList.remove("hidden");
  const head = el("div", "", "");
  head.style.cssText = "display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;";
  head.append(Object.assign(el("span", "badge"), { textContent: state.header.round }), Object.assign(el("span", "badge"), { textContent: `Stap ${state.stepNo} van ${state.stepTotal}` }));
  box.append(head);

  if (p.type === "mc") {
    box.append(el("p", "q-small", p.question || "(foto/logo-vraag)")); // klein: niet van een afstand mee te lezen
    if (p.variant === "blur") {
      const b = el("button", "btn-primary", `🔍 Scherper maken (${p.blurStep} van ${p.blurMax})`);
      b.disabled = p.status !== "open" || p.blurStep >= p.blurMax;
      b.onclick = () => socket.emit("blur_next");
      const all = el("button", "btn-option", "Meteen helemaal scherp");
      all.disabled = p.status !== "open";
      all.onclick = () => socket.emit("blur_next", { all: true });
      all.style.textAlign = "center";
      box.append(b, all);
    }
    p.options.forEach((o, i) => { const r = el("div", "opt" + (i === p.answer ? " right" : "")); r.append(el("span", "", `${L(i)}: ${o}`), el("span", "", i === p.answer ? "✅" : "")); box.append(r); });
    if (p.voided) box.append(el("p", "", p.voided === "void" ? "🚫 Deze vraag is vervallen" : "✅ Voor iedereen goed gerekend"));
    box.append(el("h3", "", "Antwoorden"));
    p.teams.forEach((t) => {
      const row = el("div", "line");
      const who = el("span", "", (t.connected ? "" : "○ ") + t.name);
      const ans = el("span", "", t.answered ? `${L(t.value)}${t.value === p.answer ? " ✔" : " ✘"}` : "⏳");
      const right = el("span");
      right.append(ans);
      if (t.answered) { const w = el("button", "btn-option tg", "wis"); w.style.marginLeft = "8px"; w.onclick = () => socket.emit("clear_answer", { teamId: t.teamId }); right.append(w); }
      row.append(who, right);
      box.append(row);
    });
    if (p.explanation) box.append(el("p", "muted", `💡 ${p.explanation}`));
  }

  if (p.type === "memory") {
    box.append(el("h3", "", "Wat stond er op het bord?"));
    const items = el("div", "muted");
    items.textContent = p.items.join(" · ");
    box.append(items);
    box.append(el("p", "muted", p.status === "idle" ? "Teams schrijven nog niet. Druk op Start." : p.status === "writing" ? "Teams schrijven nu…" : p.status === "judging" ? "Keur de antwoorden na. Automatisch goed gerekend: wat lijkt op een item. Tik om te wijzigen." : "Nagekeken."));
    p.teams.forEach((t) => {
      box.append(el("h3", "", `${t.name} (${t.entries.filter((e) => e.ok).length} goed van ${t.entries.length})`));
      t.entries.forEach((e) => {
        const row = el("div", "line");
        row.append(el("span", "", e.text));
        if (p.status === "judging") row.append(toggle(!!e.ok, () => socket.emit("memory_judge", { teamId: t.teamId, entryId: e.id, ok: !e.ok })));
        else row.append(el("span", "", e.ok === true ? "✔" : e.ok === false ? "✘" : ""));
        box.append(row);
      });
    });
  }

  if (p.type === "song" && p.status === "loading") {
    box.append(el("h3", "", `🔎 ${p.categoryName}: liedje zoeken…`));
    box.append(el("p", "muted", "De Excel-bibliotheek wordt eerst gebruikt. Als de gekozen categorie én de standaardbibliotheek op zijn, wordt online gezocht via Spotify (of iTunes als reserve)."));
    box.append(el("p", "muted", trackStatus || ""));
    const again = el("button", "btn-option", "🔁 Opnieuw zoeken");
    again.style.textAlign = "center";
    again.onclick = () => { trackBusy = {}; fetchForPanel(p); };
    box.append(again);
  }
  if (p.type === "song" && p.status !== "loading") {
    box.append(el("h3", "", `${p.song.title} · ${p.song.artist}`));
    box.append(el("p", "", `Jaar: ${p.song.year}`));
    box.append(el("p", "muted", `Kaarten per team: ${p.cards.map((c) => c.name + " " + c.n).join(" · ")} (doel ${p.target})`));
    const r = el("div", "row");
    const replay = el("button", "btn-option", "🔁 Opnieuw afspelen op tv");
    replay.style.textAlign = "center";
    replay.textContent = "🔁 Opnieuw afspelen";
    replay.onclick = () => { if (QuizSpotify.connected() && !p.song.hasAudio) spPlay(p.song); else socket.emit("song_replay"); };
    const pz = el("button", "btn-option", "⏸ Muziek stoppen");
    pz.style.textAlign = "center";
    pz.onclick = () => { spStop(); socket.emit("song_pause"); };
    r.append(pz);
    r.append(replay);
    box.append(r);
    if (QuizSpotify.connected() && !p.song.hasAudio) box.append(el("p", "muted", `Spotify: ${$("sp-status").textContent}`));
    if (!p.song.hasAudio && !QuizSpotify.connected()) {
      const a = el("a", "lnk", "Open dit liedje in Spotify");
      a.href = p.song.spotify; a.target = "_blank"; a.rel = "noopener";
      box.append(el("p", "muted", "Geen geluidsbestand ingesteld: speel het liedje zelf af (bijv. via Spotify) zodat het via de tv-speakers te horen is."), a);
    }
    box.append(el("p", "muted", `${p.placed} team(s) hebben geplaatst.`));
    // Bonus: titel en artiest goedkeuren (voorstel van de app staat er al; tik om te wisselen)
    if (p.bonus && p.bonusOn) {
      box.append(el("h4", "", "🎤 Bonus: titel en artiest"));
      p.bonus.forEach((b) => {
        const line = el("div", "line");
        line.append(el("span", "", `${b.name}: ${b.title || b.artist ? `"${b.title || "–"}" · "${b.artist || "–"}"` : "niets ingevuld"}`));
        const acts = el("span", "acts");
        const tog = (field, ok, label) => {
          const btn = el("button", "btn-option btn-small", `${ok ? "✔" : "✘"} ${label}`);
          btn.style.background = ok ? "#15803d" : "";
          btn.disabled = !(field === "title" ? b.title : b.artist);
          btn.onclick = () => socket.emit("song_judge", { stepId: p.song.id, teamId: b.teamId, field, ok: !ok });
          return btn;
        };
        acts.append(tog("title", b.titleOk, "titel"), tog("artist", b.artistOk, "artiest"));
        line.append(acts);
        box.append(line);
      });
    }
  }

  if (p.type === "price") {
    box.append(el("h3", "", `${p.name}${p.unit ? " (" + p.unit + ")" : ""}`));
    box.append(el("p", "", `Nu: ${QuizFX.euro(p.now)}  ·  ${p.agoYears} jaar geleden: ${QuizFX.euro(p.ago)}`));
  }

  if (p.type === "draw") {
    box.append(el("h3", "", `Tekenen: beurt ${p.turn} van ${p.total}`));
    if (p.smallTeams.length) box.append(el("p", "bad", `Let op: ${p.smallTeams.join(", ")} heeft maar één telefoon en kan niet meedoen (de basistelefoon tekent nooit).`));
    if (p.status === "ready") box.append(el("p", "muted", "Druk op Start: elk team krijgt een ander woord, op de telefoon van een willekeurig teamlid (niet de basistelefoon)."));
    if (p.status === "judging") box.append(el("p", "muted", "Keur de antwoorden goed of fout (automatisch voorgesteld) en bevestig."));
    p.teams.forEach((t) => {
      const row = el("div", "line");
      const left = el("div");
      left.append(el("div", "", `${t.name} · tekent: ${t.drawer} · invuller: ${t.answerer}`), el("div", "muted", `Woord: ${t.word}`), el("div", "", t.answer ? `Antwoord: ${t.answer}` : "⏳ nog geen antwoord"));
      if (t.strokes) {
        const wrap = el("div", "padwrap"); wrap.style.width = "160px"; wrap.style.marginTop = "6px";
        const cv = el("canvas"); wrap.append(cv); left.append(wrap);
        requestAnimationFrame(() => QuizFX.paintStrokes(cv, t.strokes));
      }
      row.append(left);
      if (p.status !== "ready" && t.answer) row.append(toggle(t.ok, () => socket.emit("draw_judge", { teamId: t.teamId, ok: !t.ok })));
      box.append(row);
    });
  }

  if (p.type === "logo") {
    box.append(el("h3", "", `${p.test ? "Oefenvraag · " : ""}${p.variant === "blur" ? "Foto" : "Logo"}: ${p.name}`));
    if (p.variant === "blur") {
      const bl = el("button", "btn-primary", `🔍 Scherper maken (${p.blurStep} van ${p.blurMax})`);
      bl.disabled = p.status !== "open" || p.blurStep >= p.blurMax;
      bl.onclick = () => socket.emit("blur_next");
      box.append(bl);
    }
    if (p.alt && p.alt.length) box.append(el("p", "muted", `Ook goed: ${p.alt.join(", ")}`));
    box.append(el("p", "muted", "Antwoorden staan op volgorde van binnenkomst; de snelste goede krijgt de meeste punten. Keur goed of fout (automatisch voorgesteld)."));
    p.teams.slice().sort((a, b) => (a.place || 99) - (b.place || 99)).forEach((t) => {
      const row = el("div", "line");
      row.append(el("span", "", `${t.place ? "#" + t.place + " " : "⏳ "}${t.name}${t.answer ? ": " + t.answer : ""}${t.ok && t.pts ? "  (+" + t.pts + ")" : ""}`));
      // hoeveel lijkt het op het goede antwoord? vanaf 80% een groene hint
      if (t.answer && t.sim !== null && t.sim !== undefined) { const h = el("span", "", ` ≈${t.sim}%`); h.style.cssText = `font-size:12px; margin-left:4px; color:${t.sim >= 80 ? "#4ade80" : t.sim >= 60 ? "#fbbf24" : "#94a3b8"};`; row.firstChild.append(h); }
      if (t.answer) row.append(toggle(t.ok, () => socket.emit("logo_judge", { teamId: t.teamId, ok: !t.ok })));
      box.append(row);
    });
  }

  if (p.type === "thirty") {
    box.append(el("h3", "", `30 Seconds: beurt ${p.turn} van ${p.total}`));
    if (p.team) box.append(el("p", "", `Aan de beurt: ${p.team} · ${p.explainer}`));
    if (p.words) {
      p.words.forEach((w, i) => {
        const row = el("div", "line");
        row.append(el("span", "", w));
        if (p.status !== "ready") row.append(toggle(!!p.ok[i], () => socket.emit("thirty_toggle", { index: i })));
        box.append(row);
      });
    }
    box.append(el("p", "muted", p.status === "running" ? "Tik een woord aan zodra het goed geraden is: het kleurt meteen groen op de tv." : p.status === "judging" ? "Controleer en bevestig." : ""));
  }

  if (p.type === "demo_thirty") {
    box.append(el("h3", "", "Oefenronde 30 Seconds: jij legt uit"));
    p.words.forEach((w, i) => {
      const row = el("div", "line");
      row.append(el("span", "", w));
      if (p.status !== "ready") row.append(toggle(!!p.ok[i], () => socket.emit("thirty_toggle", { index: i })));
      box.append(row);
    });
    box.append(el("p", "muted", "Leg de woorden uit aan de zaal en tik ze aan zodra ze goed geraden zijn."));
  }

  if (p.type === "demo_draw") {
    box.append(el("h3", "", `Oefenronde tekenen: "${p.word}"`));
    if (p.status === "drawing") box.append(drawPad());
    else box.append(el("p", "muted", p.status === "ready" ? "Druk op Start; daarna verschijnt hier je tekenvlak. De tekening komt live op de tv." : "Klaar."));
  }

  if (p.type === "teamphoto") {
    box.append(el("h3", "", "Teamfoto's"));
    p.teams.forEach((t) => {
      const line = el("div", "line");
      if (t.photo) line.append(QuizFX.avatar(t.name, t.photo, "40px"), " ");
      line.append(`${t.name}: ${t.photo ? "✅ foto gemaakt" : t.skipped ? "zonder foto" : t.connected ? "⏳ nog bezig" : "○ offline"}`);
      box.append(line);
    });
  }

  if (p.type === "joker") {
    box.append(el("h3", "", "Jokers"));
    p.teams.forEach((t) => box.append(Object.assign(el("div", "line"), { textContent: `${t.name}: ${t.round || "nog niet gekozen"}` })));
  }

  if (p.type === "tiebreak") {
    box.append(el("h3", "", "Beslissingsvraag (gelijke stand)"), el("p", "q-small", p.question), el("p", "", `Goede antwoord: ${p.answer}${p.unit ? " " + p.unit : ""}`));
    p.teams.forEach((t) => box.append(Object.assign(el("div", "line"), { textContent: `${t.name}: ${t.guess === null ? "⏳" : t.guess}` })));
  }

  if (p.type === "final") {
    box.append(el("h3", "", "Slotvraag"));
    if (p.status !== "wager") {
      box.append(el("p", "q-small", p.question));
      p.options.forEach((o, i) => { const r = el("div", "opt" + (i === p.answer ? " right" : "")); r.append(el("span", "", `${L(i)}: ${o}`), el("span", "", i === p.answer ? "✅" : "")); box.append(r); });
    }
    p.teams.forEach((t) => {
      const row = el("div", "line");
      row.append(el("span", "", t.name), el("span", "muted", `inzet ${t.wager ?? "–"} / max ${t.max}${t.answer !== null ? " · antwoord " + L(t.answer) : ""}`));
      box.append(row);
    });
  }
}
// Tekenvlak voor de oefenronde (de quizmaster tekent, de tv kijkt live mee)
let demoPadEl = null;
function drawPad() {
  if (demoPadEl) return demoPadEl;
  const box = el("div");
  const wrap = el("div", "padwrap");
  const canvas = el("canvas");
  wrap.append(canvas);
  let strokes = [], drawing = null, pending = [], timer = null, color = "#111827";
  const repaint = () => QuizFX.paintStrokes(canvas, strokes);
  const flush = () => { clearTimeout(timer); timer = null; if (pending.length) { socket.emit("demo_ops", { ops: pending }); pending = []; } };
  const queue = (op) => { pending.push(op); if (!timer) timer = setTimeout(flush, 60); };
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)]; };
  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); const p = pos(e); drawing = { id: "q" + Date.now().toString(36), c: color, w: 5, p: [p] }; strokes.push(drawing); queue({ t: "p", id: drawing.id, c: color, w: 5, p: [p] }); repaint(); });
  canvas.addEventListener("pointermove", (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); drawing.p.push(p); queue({ t: "p", id: drawing.id, c: drawing.c, w: 5, p: [p] }); repaint(); });
  const end = () => { drawing = null; flush(); };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  const tools = el("div", "row");
  [["Zwart", "#111827"], ["Rood", "#dc2626"], ["Blauw", "#2563eb"]].forEach(([l, c]) => { const bt = el("button", "btn-option", l); bt.style.textAlign = "center"; bt.onclick = () => { color = c; }; tools.append(bt); });
  const undo = el("button", "btn-option", "↩"); undo.onclick = () => { strokes.pop(); queue({ t: "u" }); repaint(); };
  const clr = el("button", "btn-option", "🗑"); clr.onclick = () => { strokes = []; queue({ t: "x" }); repaint(); };
  tools.append(undo, clr);
  box.append(wrap, tools);
  requestAnimationFrame(repaint);
  demoPadEl = box;
  return box;
}

// Team-id opzoeken op naam (voor draw_judge)
function findTeamId(name) { const t = (S && S.teams || []).find((x) => x.name === name); return t ? t.teamId : null; }
