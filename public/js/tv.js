// Tv-scherm (host.html): alle weergaven, effecten en de verbinding met de server.
// Gewoon script (geen module); wordt na shared.js geladen, zie host.html.
const socket = io();
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const VIEWS = ["v-welcome", "v-demodraw", "v-lobby", "v-info", "v-mc", "v-memory", "v-song", "v-price", "v-draw", "v-thirty", "v-roundresult", "v-teamphoto", "v-joker", "v-final", "v-end", "v-review", "v-standings", "v-pause"];
function showView(id) { VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== id)); if (typeof scheduleFit === "function") scheduleFit(); }

// ---------- Geluid: de browser wil eerst één klik of toetsdruk ----------
let audioUnlocked = false;
function unlock() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  QuizFX.unlockAudio();
  $("audio-banner").classList.add("hidden");
  document.querySelectorAll("audio").forEach((a) => a.play().catch(() => {}));
}
["click", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, unlock));
const allAudio = () => Array.from(document.querySelectorAll("audio"));

socket.on("connect", () => { socket.emit("register_tv"); $("tv-offline").classList.add("hidden"); });
socket.on("disconnect", () => $("tv-offline").classList.remove("hidden"));
QuizFX.wantAwake(); // tv mag niet in slaap vallen
socket.on("play_audio", () => allAudio().forEach((a) => { a.currentTime = 0; a.play().catch(() => {}); }));

// ---- Waar klinkt het geluid? Op de tv (standaard) of op de bediening (instelling van de quizmaster) ----
// Bij "bediening": de tv speelt niets af, maar stuurt elk geluidje en elk audiofragment door.
let soundOut = "tv";
QuizFX.setSoundRoute((name, args) => {
  if (soundOut !== "bediening") return true;
  socket.emit("tv_sound", { name, args });
  return false;
});
const mediaSrc = (a) => { const u = a.currentSrc || a.src || ""; try { const x = new URL(u, location.href); return x.origin === location.origin ? x.pathname : x.href; } catch (e) { return u; } };
const relayPlay = (a) => socket.emit("tv_sound", { name: "media_play", src: mediaSrc(a), at: a.currentTime || 0 });
document.addEventListener("play", (e) => {
  const a = e.target;
  if (!(a instanceof HTMLAudioElement)) return;
  a.muted = soundOut === "bediening";
  if (soundOut === "bediening") relayPlay(a);
}, true);
document.addEventListener("pause", (e) => {
  if (e.target instanceof HTMLAudioElement && soundOut === "bediening") socket.emit("tv_sound", { name: "media_pause" });
}, true);
function setSoundOut(where) {
  if (where === soundOut) return;
  soundOut = where === "bediening" ? "bediening" : "tv";
  allAudio().forEach((a) => {
    a.muted = soundOut === "bediening";
    if (soundOut === "bediening" && !a.paused) relayPlay(a); // midden in een fragment omgezet: bediening neemt het over
  });
  if (soundOut === "tv") socket.emit("tv_sound", { name: "media_pause" });
}
socket.on("pause_audio", () => allAudio().forEach((a) => a.pause()));
socket.on("resume_audio", () => allAudio().forEach((a) => { a.play().catch(() => {}); })); // verder waar hij was

// ---------- Spiekmeldingen: blijven staan tot de speler weer kijkt ----------
let shownAlerts = new Set();
let cheatSoundOn = true; // in de bediening uit te zetten
function renderAlerts(list) {
  const box = $("tv-alerts");
  box.replaceChildren();
  const keys = new Set();
  (list || []).forEach((a) => {
    keys.add(a.key);
    const d = el("div", "tv-alert");
    d.textContent = `⚠️ ${a.label} (${a.teamName}): scherm vergrendeld of app verlaten`;
    box.appendChild(d);
    if (!shownAlerts.has(a.key) && cheatSoundOn) QuizFX.alarm(false);
  });
  shownAlerts = keys;
}

// ---------- Hulpjes ----------
// Teambolletje met foto (of letter) in de teamkleur; licht op ("pop") op het moment dat het team indient
let TEAMSTYLE = {};
const animSeen = new Set(); // welke animaties al gespeeld zijn (niet bij elke update opnieuw)
let chipStep = "";
const popped = new Set();
function teamChip(name, opts) {
  const o = opts || {};
  const st = TEAMSTYLE[name] || {};
  const c = el("span", "tchip" + (o.done ? " done" : "") + (o.off ? " off" : ""));
  c.style.cssText = `display:inline-flex; align-items:center; gap:0.45em; padding-left:0.25em; border:0.18em solid ${st.color || "transparent"};` + (o.bg ? `background:${o.bg};` : "");
  c.append(QuizFX.avatar(name, st.photo, "1.7em", st.color), document.createTextNode(o.text !== undefined ? o.text : (o.done ? "✓ " : "") + name));
  const key = chipStep + "|" + name;
  if (o.done && !popped.has(key)) { popped.add(key); c.classList.add("pop"); popSound(name); }
  return c;
}
// "Plop" per team dat indient; komen er meerdere tegelijk binnen, dan kort na elkaar
let popAt = 0;
function popSound(name) {
  const n = Object.keys(TEAMSTYLE).sort().indexOf(name);
  const now = Date.now(); popAt = Math.max(now, popAt + 140);
  setTimeout(() => { try { QuizFX.pop(n < 0 ? 0 : n); } catch (e) { /* geen geluid */ } }, popAt - now);
}
function chips(box, list, showStatus, label) {
  box.replaceChildren();
  list.forEach((t) => box.appendChild(teamChip(t.name, { done: showStatus && t.answered, off: t.connected === false, text: (showStatus && t.answered ? "✓ " : "") + t.name + (label ? label(t) : "") })));
}
function lettersGrid(box, options, correct, extraFn) {
  box.replaceChildren();
  const grid = el("div", "qgrid");
  options.forEach((opt, i) => {
    const fresh = correct === i && !animSeen.has(chipStep + "|correct");
    const d = el("div", "qo" + (correct === i ? " correct" : "") + (fresh ? " fresh" : "") + (Number.isInteger(correct) && correct !== i ? " dim" : ""));
    if (fresh) { animSeen.add(chipStep + "|correct"); if (QuizFX.ding) QuizFX.ding(); }
    const l = el("b", "letter", QuizFX.letter(i));
    d.append(l, document.createTextNode(opt));
    if (correct === i) d.append(el("b", "", "  ✅"));
    grid.appendChild(d);
  });
  box.appendChild(grid);
}
const medal = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);
function standingsList(ul, rows) {
  ul.replaceChildren();
  (rows || []).forEach((row) => {
    const li = el("li");
    li.append(el("span", "", `${medal(row.rank)}  ${row.name}`));
    const b = el("b", "", `${row.score} pt`);
    b.style.color = "#38bdf8";
    li.append(b);
    ul.appendChild(li);
  });
}
let lastSecs = null;
let curTimer = null;
function bigTimer(info, el2) {
  if (el2) el2.textContent = info ? info.secs : "";
}

// ---------- Weergave per stap ----------
let renderedMedia = null;
const mediaKey = (...a) => a.join("|");

let infoShown = null, infoTimers = [];
function renderInfo(s) {
  showView("v-info");
  const p = $("info-points");
  if (infoShown === s.id) return;
  infoShown = s.id;
  infoTimers.forEach(clearTimeout); infoTimers = [];
  $("info-emoji").textContent = s.emoji || "";
  $("info-title").textContent = s.title;
  $("info-text").textContent = s.text || "";
  p.classList.toggle("hidden", !s.roundIntro);
  if (s.roundIntro) {
    p.replaceChildren(document.createTextNode(QuizFX.t("tussen.punten", { punten: s.points })));
    if (s.scoring) { const sc = el("div", "tv-sub", "🎯 " + s.scoring); sc.style.cssText = "margin-top:1.2vh; font-size:0.75em; max-width:75vw; margin-left:auto; margin-right:auto;"; p.append(sc); }
  }
  const pre = $("info-pre");
  ["info-emoji", "info-title", "info-text", "info-points"].forEach((id) => $(id).classList.remove("trans-spin", "trans-title", "hide-until"));
  if (!s.transition) { pre.classList.add("hidden"); return; }
  // "Nu gaan we door naar…" → tromgeroffel → de naam van de ronde of categorie springt in beeld
  pre.textContent = QuizFX.t(s.roundIntro ? "tussen.ronde" : "tussen.categorie");
  pre.classList.remove("hidden", "show"); void pre.offsetWidth; pre.classList.add("show");
  ["info-emoji", "info-title", "info-text", "info-points"].forEach((id) => $(id).classList.add("hide-until"));
  [0, 250, 500, 750, 1000, 1250].forEach((t) => infoTimers.push(setTimeout(QuizFX.drumHit, t)));
  infoTimers.push(setTimeout(() => {
    $("info-emoji").classList.remove("hide-until"); $("info-emoji").classList.add("trans-spin");
    $("info-title").classList.remove("hide-until"); $("info-title").classList.add("trans-title");
    QuizFX.fanfare();
    if (typeof confetti === "function") confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 } });
  }, 1500));
  infoTimers.push(setTimeout(() => { $("info-text").classList.remove("hide-until"); $("info-points").classList.remove("hide-until"); $("info-text").classList.add("trans-title"); }, 2600));
}

let readShown = null;
function renderMc(s) {
  showView("v-mc");
  $("mc-cat").classList.toggle("hidden", !s.category || s.test);
  $("mc-cat").textContent = s.category || "";
  $("mc-question").textContent = s.question;
  const isBlur = s.variant === "blur", isLogo = s.variant === "logo";
  const key = mediaKey(s.id, s.variant, s.status === "closed" ? "rev" : "q");
  if (isBlur) {
    const box = $("mc-media");
    const maxStep = s.blurMax;
    const step = s.status === "closed" ? maxStep : s.blurStep;
    QuizFX.renderBlur(box, s.media, step, maxStep, s.media ? s.media.src : "Foto ontbreekt");
    $("mc-dots").classList.toggle("hidden", s.status === "closed");
    const dots = $("mc-dots");
    dots.replaceChildren();
    for (let i = 0; i <= maxStep; i++) dots.appendChild(el("i", i <= s.blurStep ? "on" : ""));
    const pts = s.blurPoints && s.blurPoints[Math.min(s.blurStep, s.blurPoints.length - 1)];
    $("mc-pointsnow").classList.toggle("hidden", s.status === "closed" || s.test);
    $("mc-pointsnow").textContent = `Nu goed = ${pts} punten${s.blurStep < maxStep ? ", maar de foto wordt nog scherper…" : ""}`;
  } else if (isLogo) {
    if (renderedMedia !== key) { QuizFX.renderLogo($("mc-media"), s.media, s.hide, s.status === "closed", s.media ? s.media.src : "Logo ontbreekt"); renderedMedia = key; }
    $("mc-dots").classList.add("hidden");
    $("mc-pointsnow").classList.add("hidden");
  } else {
    if (renderedMedia !== key) { QuizFX.renderMedia($("mc-media"), s.media); renderedMedia = key; }
    $("mc-dots").classList.add("hidden");
    $("mc-pointsnow").classList.add("hidden");
  }
  // Eerst alleen de vraag; daarna komen de antwoorden erbij. De vraag blijft gewoon staan: de antwoorden staan
  // tijdens het lezen al onzichtbaar op hun plek (geen verspringen), en daarna verschijnen ze één voor één.
  const opts = $("mc-options");
  if (s.status === "reading") {
    readShown = s.id + "|read";
    lettersGrid(opts, s.options, null);
    opts.classList.add("opts-hidden");
    opts.classList.remove("opts-in");
    $("mc-teams").replaceChildren();
    return;
  }
  opts.classList.remove("opts-hidden");
  if (readShown === s.id + "|read") {
    readShown = s.id + "|shown"; // net in beeld: alleen de antwoorden laten binnenkomen, niet de vraag
    opts.classList.remove("opts-in"); void opts.offsetWidth; opts.classList.add("opts-in");
    setTimeout(() => opts.classList.remove("opts-in"), 1400);
    QuizFX.whoosh();
  }
  lettersGrid($("mc-options"), s.options, s.answer);
  $("mc-explain").textContent = s.status === "closed" && s.explanation ? `💡 ${s.explanation}` : "";
  if (s.status === "closed" && s.results) {
    const resKey = chipStep + "|mcresult";
    if (!animSeen.has(resKey) && s.results.length >= 2 && !s.test) {
      animSeen.add(resKey);
      const ok = s.results.filter((r) => r.ok).length;
      if (ok === s.results.length) setTimeout(() => { QuizFX.burst(); QuizFX.applause(1.6); }, 500); // iedereen goed
      else if (ok === 0) setTimeout(() => QuizFX.aww(), 500); // niemand goed
    }
    const box = $("mc-teams");
    box.replaceChildren();
    s.results.forEach((r) => {
      box.appendChild(teamChip(r.name, { done: r.ok, bg: r.ok ? "#15803d" : "#7f1d1d", text: `${r.ok ? "✔" : "✘"} ${r.name}${r.ok && r.pts > 1 ? " +" + r.pts : ""}` }));
    });
  } else {
    chips($("mc-teams"), s.teams, true);
  }
}

function renderMemory(s) {
  showView("v-memory");
  $("mem-title").textContent = s.prompt;
  const body = $("mem-body");
  body.replaceChildren();
  if (s.status === "idle") {
    body.append(el("p", "tv-sub", QuizFX.t("geheugen.klaar")));
  } else if (s.status === "writing") {
    body.append(el("p", "tv-sub", QuizFX.t("geheugen.schrijven")));
    const row = el("div", "chips-row");
    s.teams.forEach((t) => row.append(el("span", "tchip", `${t.name}: ${t.count}`)));
    body.append(row);
  } else if (s.status === "judging") {
    body.append(el("div", "huge tv-center", "🧐"), el("p", "tv-sub", QuizFX.t("geheugen.nakijken")));
  } else if (s.status === "done") {
    body.append(el("p", "tv-sub", QuizFX.t("geheugen.bord")));
    const list = el("div", "chips-row");
    s.items.forEach((i) => list.append(el("span", "tchip", i)));
    body.append(list);
    body.append(el("p", "tv-sub", QuizFX.t("geheugen.uitslag")));
  }
}

let songKey = null;
function renderSong(s) {
  showView("v-song");
  if (s.status === "loading") {
    $("song-emoji").textContent = "🔎";
    $("song-title").textContent = QuizFX.t("muziek.zoeken");
    $("song-sub").textContent = "";
    $("song-teams").replaceChildren();
    return;
  }
  const key = s.id;
  if (songKey !== key) {
    songKey = key;
    const a = QuizFX.renderMedia($("song-audio"), s.audio, { autoplay: true });
    if (a && !audioUnlocked) a.play().catch(() => {});
  }
  const rev = s.status === "revealed";
  $("song-title").textContent = rev ? QuizFX.t(s.done ? "muziek.klaar" : "muziek.onthuld") : QuizFX.t("muziek.vraag");
  $("song-title").style.fontSize = "";
  $("song-emoji").textContent = rev ? (s.done ? "🏁" : "📱") : "🎵";
  $("song-sub").textContent = rev
    ? QuizFX.t(s.done ? "muziek.klaar.tekst" : "muziek.onthuld.tekst", { doel: s.target })
    : QuizFX.t("muziek.uitleg", { doel: s.target });
  const box = $("song-teams");
  box.replaceChildren();
  s.teams.forEach((t) => box.appendChild(teamChip(t.name, { done: t.answered, off: !t.connected })));
}

function renderPrice(s) {
  showView("v-price");
  $("price-emoji").textContent = s.emoji;
  $("price-name").textContent = s.name + (s.unit ? ` (${s.unit})` : "");
  $("price-sub").textContent = s.status === "revealed" ? "" : QuizFX.t("prijs.vraag", { jaren: s.agoYears });
  chips($("price-teams"), s.teams, true);
  $("price-teams").classList.toggle("hidden", s.status === "revealed");
  const box = $("price-result");
  box.replaceChildren();
  if (s.status === "revealed") {
    // De bedragen blijven geheim: die komen pas bij het nakijken
    box.append(el("p", "tv-sub", "🔒 Antwoorden zijn binnen. De prijzen blijven nog even geheim!"));
  }
}

// Live tekeningen op de tv: per beurt één keer opbouwen, daarna alleen streepjes bijtekenen
let drawKey = null, liveStrokes = {}, liveCanvas = {};
socket.on("draw_ops_tv", (data) => {
  const st = liveStrokes[data.team];
  if (!st) return;
  (data.ops || []).forEach((op) => {
    if (op.t === "x") st.length = 0;
    else if (op.t === "u") st.pop();
    else { let x = st.find((y) => y.id === op.id); if (!x) { x = { id: op.id, c: op.c, w: op.w, p: [] }; st.push(x); } x.p.push(...op.p); }
  });
  if (liveCanvas[data.team]) QuizFX.paintStrokes(liveCanvas[data.team], st);
});
function renderDraw(s, state) {
  showView("v-draw");
  const body = $("draw-body");
  if (s.status === "drawing") {
    $("draw-title").textContent = `✏️ Beurt ${s.turn} van ${s.total}`;
    const key = `${s.id}|${s.turn}|drawing`;
    if (drawKey !== key) {
      drawKey = key; liveStrokes = {}; liveCanvas = {};
      body.replaceChildren();
      const g = el("div", "gallery");
      s.teams.forEach((t) => {
        if (!t.strokes) return;
        liveStrokes[t.name] = t.strokes.map((x) => ({ ...x, p: [...x.p] }));
        const card = el("div", "gcard");
        const wrap = el("div", "padwrap");
        const cv = el("canvas");
        liveCanvas[t.name] = cv;
        wrap.append(cv);
        const label = el("div", "draw-label"); label.dataset.team = t.name;
        card.append(wrap, label);
        g.append(card);
        requestAnimationFrame(() => QuizFX.paintStrokes(cv, liveStrokes[t.name]));
      });
      body.append(g, el("div", "bigtimer", ""));
      body.lastChild.id = "draw-bigtimer";
    }
    // alleen de labels bijwerken (wie tekent, wie heeft al geraden)
    s.teams.forEach((t) => {
      const lab = body.querySelector(`.draw-label[data-team="${CSS.escape(t.name)}"]`);
      if (lab) lab.replaceChildren(teamChip(t.name, { done: t.answered, text: `${t.answered ? "✓ " : ""}${t.name}${t.drawer ? " · tekent: " + t.drawer : ""}` }));
    });
    return;
  }
  drawKey = null;
  body.replaceChildren();
  if (s.status === "ready") {
    $("draw-title").textContent = `✏️ Tekenen · beurt ${s.turn} van ${s.total}`;
    body.append(el("p", "tv-sub", s.total ? QuizFX.t("teken.klaar") : "Er zijn geen teams met minstens twee spelers: deze ronde wordt overgeslagen."));
    // Wie gaat er tekenen? Zo kan de tekenaar zich klaarmaken voordat de quizmaster de beurt start
    const drawers = (s.teams || []).filter((t) => t.drawer);
    if (drawers.length) {
      const g = el("div", "team-cards"); g.style.cssText = "justify-content:center; margin:3vh 0;";
      drawers.forEach((t) => { const c = el("div", "team-card"); c.append(QuizFX.avatar(t.name, (TEAMSTYLE[t.name] || {}).photo, "clamp(70px, 8vw, 150px)", (TEAMSTYLE[t.name] || {}).color), el("div", "", t.name), el("div", "tv-sub", `✏️ ${t.drawer}`)); g.append(c); });
      body.append(el("h2", "", "Deze beurt tekenen:"), g, el("p", "tv-sub", "Tekenaars: pak je telefoon erbij. Je woord verschijnt zodra de quizmaster start."));
    }
  } else if (s.status === "drawing") {
    // (wordt hierboven afgehandeld)
  } else if (s.status === "judging" || s.status === "result") {
    $("draw-title").textContent = QuizFX.t("teken.uitslag", { beurt: s.turn, totaal: s.total });
    const g = el("div", "gallery");
    s.teams.forEach((t) => {
      if (!t.strokes) return;
      const card = el("div", "gcard");
      const wrap = el("div", "padwrap");
      const cv = el("canvas");
      wrap.append(cv);
      const ans = t.guess ? `geraden: "${t.guess}"${t.ok === true ? " ✔" : t.ok === false ? " ✘" : ""}` : "niet geraden";
      const lab = el("div", "", `${t.name}: ${t.word || ""}`); lab.style.fontWeight = "bold";
      const sub = el("div", "", `${t.drawer ? `getekend door ${t.drawer} · ` : ""}${ans}`);
      if (t.ok === true) sub.style.color = "#4ade80"; else if (t.ok === false) sub.style.color = "#f87171";
      card.append(wrap, lab, sub);
      g.append(card);
      requestAnimationFrame(() => QuizFX.paintStrokes(cv, t.strokes));
    });
    body.append(g);
  }
}

function thirtySlots(words, ok, all) {
  const box = el("div", "slots");
  (words || []).forEach((w, i) => {
    const good = ok && ok[i];
    const d = el("div", "slot" + (good ? " ok" : all ? " no" : ""), w ? w : "?");
    box.append(d);
  });
  return box;
}
let ddKey = null, ddStrokes = [];
function renderDemoDraw(s) {
  showView("v-demodraw");
  $("dd-title").textContent = s.status === "result" ? `Het woord was: ${s.word}` : s.status === "drawing" ? QuizFX.t("teken.oefen") : "✏️ Oefenronde tekenen";
  $("dd-sub").textContent = s.status === "drawing" ? "Roep het antwoord! Zo gaat het straks ook bij jullie: de tekening verschijnt live op de telefoons van je team." : s.status === "ready" ? "De quizmaster doet het eerst één keer voor." : "";
  if (ddKey !== s.id + s.status) { ddKey = s.id + s.status; ddStrokes = (s.strokes || []).map((x) => ({ ...x, p: [...x.p] })); }
  requestAnimationFrame(() => QuizFX.paintStrokes($("dd-canvas"), ddStrokes));
}
socket.on("demo_ops", (data) => {
  (data.ops || []).forEach((op) => {
    if (op.t === "x") ddStrokes = [];
    else if (op.t === "u") ddStrokes.pop();
    else { let st = ddStrokes.find((x) => x.id === op.id); if (!st) { st = { id: op.id, c: op.c, w: op.w, p: [] }; ddStrokes.push(st); } st.p.push(...op.p); }
  });
  QuizFX.paintStrokes($("dd-canvas"), ddStrokes);
});
function renderDemoThirty(s) {
  showView("v-thirty");
  $("th-title").textContent = s.status === "result" ? "Oefenbeurt: dit waren de woorden" : s.status === "running" ? QuizFX.t("dertig.oefen") : "⏱️ Oefenronde 30 Seconds";
  const body = $("th-body");
  body.replaceChildren();
  if (s.status === "ready") { body.append(el("p", "tv-sub", "De quizmaster doet het eerst één keer voor. Goede antwoorden kleuren groen.")); return; }
  if (s.status === "running") { const t = el("div", "bigtimer", ""); t.id = "th-bigtimer"; body.append(t); }
  body.append(thirtySlots(s.words, s.ok, s.status === "result"));
}

function renderThirty(s) {
  showView("v-thirty");
  const body = $("th-body");
  body.replaceChildren();
  const who = s.team ? `${s.team} · ${s.explainer}` : "";
  if (s.status === "ready") {
    $("th-title").textContent = `⏱️ 30 Seconds · beurt ${s.turn} van ${s.total}`;
    body.append(el("p", "tv-sub", QuizFX.t("dertig.klaar", { wie: who })), el("div", "huge tv-center", "🎲"));
  } else if (s.status === "running") {
    $("th-title").textContent = QuizFX.t("dertig.bezig", { wie: who });
    const t = el("div", "bigtimer", "");
    t.id = "th-bigtimer";
    body.append(t, thirtySlots(s.words, s.ok, false));
  } else if (s.status === "judging" || s.status === "result") {
    $("th-title").textContent = QuizFX.t(s.status === "judging" ? "dertig.nakijken" : "dertig.uitslag", { team: s.team });
    body.append(thirtySlots(s.words, s.ok, true));
  } else {
    $("th-title").textContent = "⏱️ 30 Seconds";
  }
}

// Aanmeldscherm: alle teams als kaartje met foto; de nieuwste teamfoto groot naast de QR-code
let spotKey = null;
const photoTime = (url) => Number((/[?&]v=(\d+)/.exec(url || "") || [])[1] || 0);
let lobbyKnown = null;
function renderLobbyTeams(list) {
  const box = $("lobby-teams");
  box.replaceChildren();
  const fresh = lobbyKnown ? list.filter((t) => !lobbyKnown.has(t.name)).map((t) => t.name) : [];
  if (fresh.length) QuizFX.chime(); // nieuw team erbij
  lobbyKnown = new Set(list.map((t) => t.name));
  list.forEach((t) => {
    const card = el("div", "team-card" + (t.connected === false ? " off" : "") + (fresh.includes(t.name) ? " fx-new" : ""));
    card.append(QuizFX.avatar(t.name, t.photo, "clamp(80px, 9vw, 180px)", (TEAMSTYLE[t.name] || {}).color), el("div", "", t.name), el("div", "tv-sub", `${t.members} ${t.members === 1 ? "speler" : "spelers"}`));
    box.append(card);
  });
  const newest = list.filter((t) => t.photo).sort((a, b) => photoTime(b.photo) - photoTime(a.photo))[0];
  const spot = $("lobby-spot");
  spot.classList.toggle("hidden", !newest);
  if (!newest) { spotKey = null; return; }
  const key = newest.name + "|" + newest.photo;
  if (key === spotKey) return;
  spotKey = key;
  spot.replaceChildren(QuizFX.avatar(newest.name, newest.photo, "24vw"), el("div", "spot-name", newest.name));
  const col = (TEAMSTYLE[newest.name] || {}).color;
  if (col) spot.firstChild.style.borderColor = col;
  spot.classList.remove("pop"); void spot.offsetWidth; spot.classList.add("pop");
}

function renderRoundResult(s) {
  showView("v-roundresult");
  if (!animSeen.has(s.id + "|applause")) { animSeen.add(s.id + "|applause"); QuizFX.applause(2.4); }
  $("rr-title").textContent = s.title;
  const body = $("rr-body");
  body.replaceChildren();
  // Geen punten en geen volgorde: alleen de teams, de stand blijft geheim
  const grid = el("div", "team-cards");
  grid.style.cssText = "justify-content:center; margin:4vh 0;";
  (s.teams || []).forEach((t) => { const c = el("div", "team-card"); c.append(QuizFX.avatar(t.name, t.photo, "clamp(80px, 9vw, 180px)", t.color), el("div", "", t.name)); grid.append(c); });
  body.append(grid);
  // Momentum: één voor één in beeld, met een klein geluidje (geen punten, alleen beweging)
  const mom = s.momentum || [];
  if (mom.length) {
    // Alleen de eerste keer animeren; bij een latere update van hetzelfde scherm staan ze er meteen
    const key = s.id + mom.map((m) => m.text).join("|");
    const fresh = renderRoundResult.lastMomentum !== key;
    renderRoundResult.lastMomentum = key;
    const box = el("div", "momentum");
    mom.forEach((m, i) => {
      const line = el("div", "momentum-line");
      if (fresh) line.style.animationDelay = `${0.8 + i * 1.6}s`;
      else { line.style.animation = "none"; line.style.opacity = "1"; line.style.transform = "none"; }
      line.append(el("span", "momentum-emoji", m.emoji), el("span", "", m.text));
      box.append(line);
    });
    body.append(box);
    if (fresh) mom.forEach((_, i) => setTimeout(() => { try { QuizFX.whoosh(); } catch (e) { /* geen geluid */ } }, 800 + i * 1600));
  }
  body.append(el("p", "tv-sub", "👏 Goed gespeeld! De punten blijven geheim tot de ontknoping."));
  if (s.next) body.append(el("p", "tv-sub", `Hierna: ${s.next}`));
}

let logoKey = null;
function renderLogoStep(s) {
  showView("v-mc");
  $("mc-cat").classList.toggle("hidden", !s.test);
  $("mc-cat").textContent = "Oefenvraag";
  const closed = s.status === "closed";
  if (s.variant === "blur") {
    $("mc-question").textContent = closed ? QuizFX.t("open.antwoord", { antwoord: s.name }) : (s.question || QuizFX.t("blur.vraag"));
    QuizFX.renderBlur($("mc-media"), s.media, closed ? s.blurMax : s.blurStep, s.blurMax, s.media ? s.media.src : "Foto ontbreekt");
    const dots = $("mc-dots");
    dots.classList.toggle("hidden", closed);
    dots.replaceChildren();
    for (let i = 0; i <= s.blurMax; i++) dots.appendChild(el("i", i <= s.blurStep ? "on" : ""));
    const pts = s.blurPoints[Math.min(s.blurStep, s.blurPoints.length - 1)];
    $("mc-pointsnow").classList.toggle("hidden", closed);
    $("mc-pointsnow").textContent = s.test ? QuizFX.t("blur.oefen") : QuizFX.t("blur.punten", { punten: pts });
  } else {
    $("mc-question").textContent = closed ? QuizFX.t("open.antwoord", { antwoord: s.name }) : QuizFX.t("logo.vraag");
    const key = s.id + s.status;
    if (logoKey !== key) { logoKey = key; QuizFX.renderLogo($("mc-media"), s.media, s.hide, closed, s.media ? s.media.src : "Logo ontbreekt"); }
    $("mc-dots").classList.add("hidden");
    $("mc-pointsnow").classList.toggle("hidden", closed);
    $("mc-pointsnow").textContent = QuizFX.t("logo.uitleg");
  }
  $("mc-options").replaceChildren();
  $("mc-explain").textContent = "";
  chips($("mc-teams"), s.teams, true);
}

function renderFinal(s) {
  showView("v-final");
  $("final-title").textContent = QuizFX.t("slot.titel", { categorie: s.category });
  const q = $("final-q");
  q.replaceChildren();
  $("final-result").replaceChildren();
  const teamsBox = $("final-teams");
  teamsBox.replaceChildren();
  s.teams.forEach((t) => teamsBox.append(teamChip(t.name, { done: t.answered })));
  if (s.status === "wager") {
    $("final-sub").textContent = QuizFX.t("slot.inzet", { max: s.maxWager || 100 });
    return;
  }
  $("final-sub").textContent = s.status === "revealed" && s.explanation ? `💡 ${s.explanation}` : "";
  const h1 = el("h1", "tv-q", s.question);
  h1.style.textAlign = "center";
  q.append(h1);
  const o = el("div");
  q.append(o);
  lettersGrid(o, s.options, s.status === "revealed" ? s.answer : null);
}

function renderTiebreak(s) {
  showView("v-final");
  $("final-emoji").textContent = "⚖️";
  $("final-title").textContent = QuizFX.t("beslis.titel");
  const q = $("final-q");
  q.replaceChildren();
  $("final-result").replaceChildren();
  $("final-sub").textContent = s.status === "revealed"
    ? (s.explanation ? `💡 ${s.explanation}` : "")
    : QuizFX.t("beslis.tekst");
  const h1 = el("h1", "tv-q", s.question);
  h1.style.textAlign = "center";
  q.append(h1);
  if (s.status === "revealed") {
    const a = el("div", "bigtimer", `${s.answer}${s.unit ? " " + s.unit : ""}`);
    a.style.color = "#4ade80";
    q.append(a);
  } else if (s.unit) q.append(el("p", "tv-sub", `Antwoord in: ${s.unit}`));
  const box = $("final-teams");
  box.replaceChildren();
  s.teams.forEach((t) => box.append(teamChip(t.name, { done: t.answered })));
}

// ---------- Einduitslag: plek voor plek, de quizmaster bepaalt het tempo ----------
let revealedN = 0;
function resetReveal() {
  revealedN = 0;
  $("tv-scoreboard").replaceChildren();
  $("winner-banner").classList.add("hidden");
  $("reveal-spot").classList.add("hidden");
  clearTimeout(spotTimer);
  spotDone = null;
}
function renderEnd(end) {
  showView("v-end");
  const rs = end.reveal;
  $("end-wait").classList.toggle("hidden", rs !== "idle");
  const showBreak = rs === "done" && end.endView === "breakdown" && end.breakdown;
  const showAwards = rs === "done" && end.endView === "awards" && end.awards;
  const showAlbum = rs === "done" && end.endView === "album" && end.album;
  $("end-reveal").classList.toggle("hidden", rs === "idle" || showBreak || showAwards || showAlbum);
  $("end-breakdown").classList.toggle("hidden", !showBreak);
  $("end-awards").classList.toggle("hidden", !showAwards);
  $("end-album").classList.toggle("hidden", !showAlbum);
  if (!showAlbum) stopAlbum();
  if (!showAwards) awardsKey = null;
  if (showAwards) { renderAwards(end.awards); return; }
  if (showAlbum) { startAlbum(end.album); return; }
  if (showBreak) {
    const b = end.breakdown;
    QuizFX.renderTable($("breakdown-table"), {
      columns: ["Team", ...b.rounds.map((r) => r.title), "Slot", "Totaal"],
      rows: b.rows.map((r) => [r.name, ...r.rounds.map((x) => `${x.pts}${x.joker ? " 🃏" : ""}`), r.final === null ? "–" : { t: `${r.final >= 0 ? "+" : ""}${r.final}`, ok: r.final > 0 ? true : r.final < 0 ? false : null }, `${r.total}`])
    });
    return;
  }
  if (rs === "idle" || !end.scores) { resetReveal(); return; }
  const list = end.scores;
  const target = Math.min(end.revealN, list.length);
  if (target < revealedN) resetReveal();
  const fresh = target - revealedN > 0 && target - revealedN <= 1;
  let spotMs = 0;
  while (revealedN < target) {
    const player = list[list.length - 1 - revealedN];
    const li = QuizFX.rankRow(player);
    $("tv-scoreboard").prepend(li);
    if (fresh) { spotMs = player.rank === 1 ? 5000 : 3400; spotlight(player, spotMs, () => li.classList.add("show")); QuizFX.drumHit(); } else li.classList.add("show");
    revealedN++;
  }
  const all = revealedN >= list.length;
  if (all && $("winner-banner").classList.contains("hidden") && !winnerPending) {
    winnerPending = true;
    setTimeout(() => { winnerPending = false; if (revealedN >= list.length) showWinnerBanner(list, fresh); }, spotMs);
  }
}
// ---------- Hall of fame op het aanmeldscherm ----------
function renderHallOfFame(list) {
  const box = $("hof-list");
  $("hall-of-fame").classList.toggle("hidden", !(list && list.length));
  if (!list || !list.length) return;
  box.replaceChildren(...list.map((e) => {
    const row = el("div", "hof-row");
    const d = new Date(e.date);
    row.append(el("span", "hof-date", isNaN(d) ? "" : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })), el("span", "hof-name", "🏆 " + e.winners.join(" & ")));
    return row;
  }));
}
// ---------- Awards: kaarten verschijnen één voor één ----------
let awardsKey = null;
function renderAwards(list) {
  const key = JSON.stringify(list.map((a) => a.title + a.teams.map((t) => t.name).join()));
  if (key === awardsKey) return;
  awardsKey = key;
  const grid = $("award-grid");
  grid.replaceChildren();
  if (!list.length) { grid.append(el("p", "tv-sub", "Te weinig teams voor prijsjes.")); return; }
  list.forEach((a, i) => {
    const card = el("div", "award-card");
    const teamsBox = el("div", "aw-teams");
    a.teams.forEach((t) => { const sp = el("span"); sp.append(QuizFX.avatar(t.name, t.photo, "1.8em", t.color), t.name); teamsBox.append(sp); });
    card.append(el("div", "aw-emoji", a.emoji), el("div", "aw-title", a.title), teamsBox, el("div", "aw-detail", a.detail));
    grid.append(card);
    setTimeout(() => { card.classList.add("show"); QuizFX.drumHit && QuizFX.drumHit(); }, 600 + i * 1400);
  });
}
// ---------- Fotoalbum: diavoorstelling met teamfoto's en tekeningen ----------
let albumTimer = null, albumKey = null, albumIdx = 0, albumSlides = [];
function stopAlbum() { clearInterval(albumTimer); albumTimer = null; albumKey = null; }
function showSlide() {
  const stage = $("album-stage");
  const sl = albumSlides[albumIdx % albumSlides.length];
  if (!sl) { stage.replaceChildren(el("p", "tv-sub", "Er zijn nog geen teamfoto's of tekeningen.")); $("album-count").textContent = ""; return; }
  stage.classList.remove("go"); void stage.offsetWidth; stage.classList.add("go");
  if (sl.kind === "pause") {
    const img = el("img", "al-img"); img.src = sl.photo; img.alt = "";
    stage.replaceChildren(img, el("div", "al-cap", `📸 ${sl.name}`), el("div", "al-sub", sl.label ? `pauzefoto van ${sl.label}` : "pauzefoto"));
  } else if (sl.kind === "photo") {
    const img = el("img", "al-img"); img.src = sl.photo; img.alt = sl.name;
    if (sl.color) img.style.border = `0.6vw solid ${sl.color}`;
    stage.replaceChildren(img, el("div", "al-cap", sl.name), el("div", "al-sub", sl.rank === 1 ? "🏆 Winnaar!" : `${sl.rank}e plaats`));
  } else {
    const cv = el("canvas"); cv.width = 800; cv.height = 600;
    if (sl.color) cv.style.border = `0.5vw solid ${sl.color}`;
    stage.replaceChildren(cv, el("div", "al-cap", `"${sl.word}" ${sl.ok ? "✔" : "✘"}`), el("div", "al-sub", `getekend door ${sl.drawer || "?"} · ${sl.name}`));
    requestAnimationFrame(() => QuizFX.paintStrokes(cv, sl.strokes));
  }
  $("album-count").textContent = `${(albumIdx % albumSlides.length) + 1} / ${albumSlides.length}`;
}
function startAlbum(slides) {
  const key = String(slides.length) + (slides[0] ? slides[0].name : "");
  if (key === albumKey) return;
  stopAlbum();
  albumKey = key; albumSlides = slides; albumIdx = 0;
  showSlide();
  albumTimer = setInterval(() => { albumIdx++; showSlide(); }, 5500);
}
// Ontknoping: elke plek eerst groot in beeld (foto, naam, punten), daarna schuift het team in de ranglijst
let spotTimer = null, spotDone = null, winnerPending = false;
function spotlight(player, ms, done) {
  const sp = $("reveal-spot");
  const st = TEAMSTYLE[player.name] || {};
  const rankTxt = player.rank === 1 ? "🏆 Winnaar!" : player.rank === 2 ? "🥈 Tweede plaats" : player.rank === 3 ? "🥉 Derde plaats" : `Plek ${player.rank}`;
  sp.replaceChildren(el("div", "spot-rank", rankTxt), QuizFX.avatar(player.name, player.photo || st.photo, "clamp(180px, 34vh, 560px)", player.color || st.color), el("div", "spot-team", player.name), el("div", "spot-pts", `${player.score} punten`));
  sp.classList.toggle("winner", player.rank === 1);
  sp.classList.remove("hidden", "go"); void sp.offsetWidth; sp.classList.add("go");
  clearTimeout(spotTimer);
  if (spotDone) spotDone(); // vorige plek nog in beeld? die eerst in de lijst zetten
  spotDone = done || null;
  spotTimer = setTimeout(() => { sp.classList.add("hidden"); const d = spotDone; spotDone = null; if (d) d(); }, ms);
}
function showWinnerBanner(list, fresh) {
  if (!$("winner-banner").classList.contains("hidden")) return;
  {
    QuizFX.showWinners(list, $("winner-banner"), $("winner-name-text"));
    $("winner-photos").replaceChildren(...list.filter((p) => p.rank === 1).map((p) => QuizFX.avatar(p.name, p.photo, "clamp(140px, 16vw, 340px)", p.color)));
    if (fresh) { (QuizFX.triumph || QuizFX.fanfare)(); QuizFX.launchConfetti(); }
  }
}

// ---------- Automatisch passend maken op elk schermformaat ----------
// Past de inhoud niet in het beschikbare vlak, dan wordt het hele scherm (de actieve view) kleiner geschaald.
let fitTimer = null;
// ---------- Muiscursor: alleen zichtbaar als de muis beweegt ----------
let cursorTimer = null;
document.addEventListener("mousemove", () => {
  document.body.classList.add("show-cursor");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.remove("show-cursor"), 2000);
});
// ---------- Emoji-reacties van de spelers ----------
socket.on("reaction", (r) => {
  const layer = $("reactions");
  if (!layer || layer.childElementCount > 40) return; // niet te druk
  const d = el("div", "reaction", r.emoji);
  d.style.left = `${5 + Math.random() * 88}vw`;
  d.style.setProperty("--drift", `${(Math.random() - 0.5) * 16}vw`);
  if (r.color) { const dot = el("small"); dot.style.background = r.color; d.append(dot); }
  layer.append(d);
  setTimeout(() => d.remove(), 4300);
});
// ---------- Tussenstand: alleen posities ----------
let posKey = null;
function renderPositions(pos) {
  const box = $("positions-overlay");
  box.classList.toggle("hidden", !pos);
  if (!pos) { posKey = null; stopRace(); return; }
  const key = JSON.stringify(pos);
  if (key === posKey) return;
  posKey = key;
  if (pos.mode === "race") return startRace(pos);
  stopRace();
  const list = pos.list || [];
  $("positions-list").replaceChildren(...list.map((p, i) => {
    const row = el("div", "pos-row");
    row.style.animationDelay = `${i * 0.25}s`;
    if (p.color) row.style.borderLeft = `0.5vw solid ${p.color}`;
    row.append(el("span", "pos-rank", p.rank === 1 ? "🥇 1e" : p.rank === 2 ? "🥈 2e" : p.rank === 3 ? "🥉 3e" : `${p.rank}e`), QuizFX.avatar(p.name, p.photo, "1.6em", p.color), el("span", "", p.name));
    return row;
  }));
}
// ---------- Balkenrace: per gespeelde ronde schuiven de balken op en halen teams elkaar in ----------
// Geen getallen: de balken zijn verhoudingen ten opzichte van de koploper.
let raceTimer = null;
function stopRace() { clearInterval(raceTimer); raceTimer = null; }
function startRace(pos) {
  stopRace();
  const box = $("positions-list");
  const n = pos.series.length, rowH = 9; // vh per rij
  box.replaceChildren();
  const label = el("div", "tv-sub"); label.style.cssText = "text-align:center; font-weight:bold; color:#fbbf24; margin-bottom:1vh;";
  const stage = el("div"); stage.style.cssText = `position:relative; height:${n * rowH}vh; width:100%;`;
  box.append(label, stage);
  const rows = pos.series.map((t) => {
    const row = el("div");
    row.style.cssText = `position:absolute; left:0; right:0; height:${rowH - 1.5}vh; display:flex; align-items:center; gap:1vw; transition: top 0.9s cubic-bezier(.4,1.4,.5,1);`;
    const who = el("div"); who.style.cssText = "display:flex; align-items:center; gap:0.6vw; width:22vw; font-size:clamp(16px,2vw,40px); font-weight:bold; white-space:nowrap; overflow:hidden;";
    who.append(QuizFX.avatar(t.name, t.photo, "1.5em", t.color), t.name);
    const track = el("div"); track.style.cssText = "flex:1; height:70%; background:#1e293b; border-radius:999px; overflow:hidden;";
    const bar = el("div", "bar"); bar.style.cssText = `height:100%; width:0%; background:${t.color || "#38bdf8"}; border-radius:999px; transition: width 0.9s ease-out;`;
    track.append(bar);
    const medal = el("div"); medal.style.cssText = "width:3em; font-size:clamp(18px,2.4vw,48px); text-align:center;";
    row.append(who, track, medal);
    stage.append(row);
    return { t, row, bar, medal };
  });
  const steps = Math.max(1, pos.rounds.length);
  let k = 0;
  const show = () => {
    const i = Math.min(k, steps - 1);
    label.textContent = pos.rounds.length ? pos.rounds[i] : "Nog geen ronde gespeeld";
    const vals = rows.map((r) => ({ r, v: r.t.values[i] || 0 }));
    vals.sort((a, b) => b.v - a.v);
    vals.forEach(({ r, v }, place) => {
      r.row.style.top = `${place * rowH}vh`;
      r.bar.style.width = `${Math.max(2, v)}%`;
      r.medal.textContent = i === steps - 1 ? (place === 0 ? "🥇" : place === 1 ? "🥈" : place === 2 ? "🥉" : "") : "";
    });
    if (QuizFX.tick && k < steps) QuizFX.tick();
    k++;
    if (k > steps) { stopRace(); if (QuizFX.fanfare) QuizFX.fanfare(); }
  };
  raceTimer = setInterval(show, 1600);
  setTimeout(show, 150);
}
// ---------- Pauze: diavoorstelling met de teamfoto's ----------
// Teamfoto's en pauzefoto's door elkaar; een nieuwe pauzefoto komt meteen groot in beeld
let pauseTimer = null, pauseIdx = 0, pauseKey = null, pauseSeen = 0, pauseList = [];
function stopPauseShow() { clearInterval(pauseTimer); pauseTimer = null; pauseKey = null; }
// Pauze: een fotomuur met zoveel mogelijk foto's tegelijk (nieuwste eerst). Zijn er meer foto's dan plekken,
// dan wisselt er om de paar seconden één foto, zodat ze allemaal voorbijkomen.
let pauseShown = [];
function pauseTile(item, isNew) {
  const t = el("div", "pw-tile" + (isNew ? " new" : ""));
  t.style.setProperty("--tilt", `${(Math.random() * 4 - 2).toFixed(1)}deg`);
  const img = el("img"); img.src = item.photo; img.alt = ""; img.loading = "eager";
  t.append(img, el("div", "pw-cap", `${isNew ? "📸 Nieuw! " : ""}${item.name}${item.label ? " · " + item.label : ""}`));
  return t;
}
function pauseSlots(n) { return n <= 4 ? { cols: Math.max(1, n), slots: n } : n <= 8 ? { cols: 4, slots: n } : { cols: 6, slots: 12 }; }
function pauseSlide() { // één tegel wisselen voor een foto die nu niet in beeld is
  const wall = $("pause-show").querySelector(".pause-wall");
  if (!wall || pauseList.length <= pauseShown.length) return;
  const hidden = pauseList.filter((x) => !pauseShown.includes(x));
  const next = hidden[pauseIdx++ % hidden.length];
  const slot = Math.floor(Math.random() * pauseShown.length);
  const old = wall.children[slot];
  if (!old) return;
  old.classList.add("out");
  setTimeout(() => { if (old.parentNode === wall) { wall.replaceChild(pauseTile(next, false), old); pauseShown[slot] = next; } }, 600);
}
function startPauseShow(style, photos) {
  const teamsList = Object.entries(style).filter(([, v]) => v.photo).map(([name, v]) => ({ kind: "team", name: `Team ${name}`, photo: v.photo }));
  const pics = photos.map((p) => ({ kind: "pause", name: p.team, label: p.label, photo: p.url })).reverse(); // nieuwste eerst
  const key = teamsList.map((x) => x.name + x.photo).join("|") + "#" + pics.length;
  if (key === pauseKey) return;
  const fresh = pics.length > pauseSeen && pauseKey !== null;
  pauseSeen = pics.length;
  stopPauseShow();
  pauseKey = key;
  pauseList = [...pics, ...teamsList];
  $("v-pause").classList.toggle("has-photos", pauseList.length > 0);
  if (!pauseList.length) { $("pause-show").replaceChildren(el("p", "tv-sub", "📸 Maak een pauzefoto met je telefoon: hij verschijnt hier!")); return; }
  const { cols, slots } = pauseSlots(pauseList.length);
  pauseShown = pauseList.slice(0, slots);
  const wall = el("div", "pause-wall");
  wall.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  wall.style.maxWidth = cols <= 2 ? "60vw" : cols <= 4 ? "92vw" : "96vw";
  pauseShown.forEach((item, i) => wall.append(pauseTile(item, fresh && i === 0)));
  const more = pauseList.length - slots;
  $("pause-show").replaceChildren(wall, el("p", "tv-sub pw-hint", `📸 ${pics.length} pauzefoto${pics.length === 1 ? "" : "'s"}${more > 0 ? ` · de rest wisselt vanzelf` : ""} · maak er zelf ook een met je telefoon!`));
  if (fresh && QuizFX.ding) QuizFX.ding();
  if (more > 0) pauseTimer = setInterval(pauseSlide, 3500);
}
// ---------- Effecten bij overgangen: nieuwe vraag, onthulling, nieuwe teamfoto, pauze ----------
let fxLast = null, fxPhotos = null;
const QUESTION_KINDS = ["mc", "logo", "price", "final", "tiebreak", "song", "memory"];
const REVEAL = { song: "revealed", price: "revealed", logo: "closed", memory: "closed", final: "result", tiebreak: "result", thirty: "result", draw: "result" };
function flashScreen(color) {
  const f = $("fx-flash"); if (!f) return;
  f.style.background = color || "#fff"; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
}
function fxTransitions(state) {
  const step = state.step;
  const cur = { id: step ? step.id : null, kind: step ? step.kind : null, status: step ? step.status : null, paused: !!state.paused, header: state.header && state.header.round };
  const prev = fxLast; fxLast = cur;
  // nieuwe teamfoto (lobby of teamfoto-stap): fototoestel-klik + witte flits
  const photos = {}; Object.entries(TEAMSTYLE).forEach(([n, v]) => { if (v.photo) photos[n] = v.photo; });
  if (fxPhotos && Object.entries(photos).some(([n, u]) => fxPhotos[n] !== u)) { QuizFX.shutter(); flashScreen("#ffffff"); }
  fxPhotos = photos;
  if (!prev || state.phase !== "PLAY") return; // niet bij het openen van de tv
  if (cur.paused !== prev.paused) { if (cur.paused) QuizFX.chime(); else QuizFX.whoosh(); return; }
  if (cur.paused) return;
  if (cur.id !== prev.id) {
    // nieuwe vraag: binnenvliegen (de rondeovergang heeft al een eigen whoosh)
    if (QUESTION_KINDS.includes(cur.kind)) {
      if (cur.header === prev.header) QuizFX.whoosh();
      requestAnimationFrame(() => {
        const v = VIEWS.map((id) => $(id)).find((x) => x && !x.classList.contains("hidden"));
        if (v) { v.classList.remove("fx-enter"); void v.offsetWidth; v.classList.add("fx-enter"); setTimeout(() => v.classList.remove("fx-enter"), 1400); } // alleen bij binnenkomst
      });
    }
    return;
  }
  if (cur.status !== prev.status && REVEAL[cur.kind] === cur.status) QuizFX.reveal();
}
// ---------- Rondeovergang ----------
let lastRoundHeader = null;
function maybeCurtain(state) {
  const r = state.header.round || "";
  if (state.phase !== "PLAY" || r === lastRoundHeader) { lastRoundHeader = r; return; }
  const first = lastRoundHeader === null;
  lastRoundHeader = r;
  const m = /^Ronde (\d+): (.*)$/.exec(r);
  if (first || !m) return; // niet bij het openen van de tv, en alleen voor echte rondes
  const c = $("round-curtain");
  c.querySelector(".rc-no").textContent = `Ronde ${m[1]}`;
  c.querySelector(".rc-title").textContent = m[2];
  c.classList.remove("go"); void c.offsetWidth; c.classList.add("go");
  if (QuizFX.whoosh) QuizFX.whoosh();
}
// ---------- Tekst automatisch passend: lange vragen kleiner, zodat ze niet over het scherm lopen ----------
function autoSizeText(v) {
  v.querySelectorAll(".tv-q").forEach((q) => {
    const len = (q.textContent || "").length;
    const f = len <= 70 ? 1 : Math.max(0.55, 1 - (len - 70) / 240);
    q.style.fontSize = f < 1 ? `calc(clamp(24px, 3.6vw, 70px) * ${f.toFixed(2)})` : "";
  });
  v.querySelectorAll(".qgrid").forEach((g) => {
    const longest = Math.max(0, ...[...g.querySelectorAll(".qo")].map((o) => (o.textContent || "").length));
    const f = longest <= 40 ? 1 : Math.max(0.6, 1 - (longest - 40) / 180);
    g.querySelectorAll(".qo").forEach((o) => { o.style.fontSize = f < 1 ? `calc(clamp(16px, 2.2vw, 40px) * ${f.toFixed(2)})` : ""; });
  });
}
function fitView() {
  const main = document.querySelector("main");
  const v = VIEWS.map((id) => $(id)).find((x) => x && !x.classList.contains("hidden"));
  if (!main || !v) return;
  autoSizeText(v);
  v.style.transform = "";
  const cs = getComputedStyle(main);
  const availH = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = v.scrollHeight, w = v.scrollWidth;
  const s = Math.min(1, availH / Math.max(1, h), availW / Math.max(1, w));
  if (s < 0.995) v.style.transform = `scale(${Math.max(0.3, s)})`;
}
function scheduleFit() {
  requestAnimationFrame(fitView);
  clearTimeout(fitTimer);
  fitTimer = setTimeout(fitView, 350); // na laden van plaatjes en animaties nog een keer
}
window.addEventListener("resize", scheduleFit);
document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IMG") scheduleFit(); }, true);

// ---------- Hoofdlus ----------
let wasPaused = false;
let lastStepId = null;
let lastBeep = null;
socket.on("state_update", (state) => {
  const step = state.step;
  const inQuiz = state.phase === "PLAY";
  TEAMSTYLE = state.teamStyle || {};
  cheatSoundOn = state.cheatSound !== false;
  setSoundOut(state.soundOut);
  renderPositions(state.positions);
  chipStep = step ? step.id : state.phase;
  fxTransitions(state);
  QuizFX.applyTheme(state.theme);
  QuizFX.setTexts(state.texts);
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = QuizFX.t(e.dataset.t); });
  if (!step || step.kind !== "info") infoShown = null;

  // Tijdens de pauze geen ronde, vraagnummer of punten bovenin (die horen bij de stap waarop gepauzeerd is)
  const onPause = state.phase === "PLAY" && state.paused;
  $("tv-round").textContent = state.header.round || "Familiequiz";
  $("tv-round").classList.toggle("hidden", onPause);
  maybeCurtain(state);
  const prog = onPause ? null : state.header.progress;
  $("tv-prog").classList.toggle("hidden", !prog);
  if (prog) $("tv-prog").textContent = prog.label ? prog.label : `Vraag ${prog.n} van ${prog.total}`;
  $("tv-points").classList.toggle("hidden", onPause || !state.header.points);
  if (state.header.points) $("tv-points").textContent = `💯 ${state.header.points} punten te verdienen`;

  // Aftelklok bovenin en (bij tekenen en 30 seconds) groot in beeld
  QuizFX.countdown("tv", step && step.timer ? step.timer : null, (info) => {
    $("tv-timerbar").classList.toggle("hidden", !info);
    $("tv-timer").classList.toggle("hidden", !info);
    curTimer = info;
    document.body.classList.toggle("hurry", !!(info && info.running && info.secs <= 5 && info.secs > 0));
    if (!info) return;
    $("tv-timer").textContent = `⏱ ${info.secs}s`;
    $("tv-timerfill").style.width = `${Math.round(info.fraction * 100)}%`;
    const low = info.secs <= 5 && info.running;
    $("tv-timerbar").classList.toggle("low", low);
    $("tv-timerbar").classList.toggle("half", !low && info.fraction <= 0.5);
    $("tv-timer").classList.toggle("low", low);
    bigTimer(info, $("draw-bigtimer"));
    bigTimer(info, $("th-bigtimer"));
    if (low && lastSecs !== info.secs && info.secs > 0) { QuizFX.tick(); if (info.secs <= 3) QuizFX.heartbeat(); } // tikken (en hartslag) in de laatste seconden
    if (info.secs === 0 && lastSecs > 0 && QuizFX.buzzer) QuizFX.buzzer(); // tijd is op
    lastSecs = info.secs;
  });

  renderAlerts(state.alerts);

  // Geluid: pauzeren bij pauze, stoppen buiten de muziekvragen
  if (state.paused) allAudio().forEach((a) => a.pause());
  else if (wasPaused && step && step.kind === "song") allAudio().forEach((a) => a.play().catch(() => {}));
  wasPaused = state.paused;
  if (step && step.kind !== "song") { allAudio().forEach((a) => a.pause()); songKey = null; }

  if (step && step.id !== lastStepId) { lastStepId = step.id; renderedMedia = null; }



  // Overlays hebben voorrang op de gewone schermen
  if (state.phase === "PLAY" && state.paused) { showView("v-pause"); startPauseShow(state.teamStyle || {}, state.pausePhotos || []); return; }
  stopPauseShow();
  if (state.review && state.review.data) {
    showView("v-review");
    $("review-title").textContent = state.review.data.title;
    $("review-sub").textContent = state.review.data.subtitle || "";
    QuizFX.renderTable($("review-table"), state.review.data);
    if (state.review.data.images) {
      const g = el("div", "review-gallery");
      state.review.data.images.forEach((im) => {
        const card = el("div", "gcard");
        const wrap = el("div", "padwrap"); const cv = el("canvas"); wrap.append(cv);
        card.append(wrap, el("div", "", `${im.ok ? "✔" : "✘"} ${im.label}`));
        card.style.outline = im.ok ? "3px solid #22c55e" : "3px solid #7f1d1d";
        g.append(card);
        requestAnimationFrame(() => QuizFX.paintStrokes(cv, im.strokes));
      });
      $("review-table").append(g);
    }
    $("review-page").textContent = `Pagina ${state.review.page + 1} van ${state.review.total}`;
    return;
  }
  if (state.showStandings && state.standings) {
    showView("v-standings");
    standingsList($("standings-list"), state.standings);
    return;
  }

  if (state.phase === "LOBBY" && state.lobbyStage === "welcome") {
    showView("v-welcome");
    $("welcome-emoji").textContent = state.welcome.emoji || "🎉";
    $("welcome-title").textContent = state.welcome.title;
    $("welcome-text").textContent = state.welcome.text;
    resetReveal();
    return;
  }
  if (state.phase === "LOBBY") {
    showView("v-lobby");
    renderLobbyTeams(state.teamList);
    renderHallOfFame(state.hallOfFame);
    $("lobby-teams").previousElementSibling.textContent = QuizFX.t("lobby.teams") + (state.maxTeams ? ` (${state.teamList.length} van ${state.maxTeams})` : "");
    $("lobby-empty").classList.toggle("hidden", state.teamList.length > 0);
    resetReveal();
    return;
  }
  if (state.phase === "END") return renderEnd(state.end);
  if (!inQuiz || !step) return;

  switch (step.kind) {
    case "info": renderInfo(step); break;
    case "mc": renderMc(step); break;
    case "logo": renderLogoStep(step); break;
    case "memory": renderMemory(step); break;
    case "song": renderSong(step); break;
    case "price": renderPrice(step); break;
    case "draw": renderDraw(step, state); break;
    case "thirty": renderThirty(step); break;
    case "demo_draw": renderDemoDraw(step); break;
    case "demo_thirty": renderDemoThirty(step); break;
    case "roundresult": renderRoundResult(step); break;
    case "teamphoto": {
      showView("v-teamphoto");
      const grid = $("teamphoto-grid");
      grid.replaceChildren();
      step.teams.forEach((t) => {
        const card = el("div");
        card.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:1vh; width:clamp(120px,16vw,300px);" + (t.connected ? "" : " opacity:0.45;");
        const pic = QuizFX.avatar(t.name, t.photo, "clamp(110px,14vw,280px)");
        if (!t.photo) { pic.style.border = "4px dashed #64748b"; pic.style.background = "transparent"; pic.style.color = "#64748b"; }
        else { pic.style.border = "4px solid #4ade80"; }
        const label = el("div", "tchip" + (t.photo ? " done" : ""), (t.photo ? "✓ " : "") + t.name + (t.skipped && !t.photo ? " (zonder foto)" : t.photo ? "" : " …"));
        card.append(pic, label);
        grid.append(card);
      });
      break;
    }
    case "joker":
      showView("v-joker");
      chips($("joker-teams"), step.chosen.map((c) => ({ name: c.name, answered: c.done })), true, (t) => { const c = step.chosen.find((x) => x.name === t.name); return c && c.round ? `  🃏 ${c.round}` : "  …kiest nog"; });
      break;
    case "final": $("final-emoji").textContent = "🎰"; renderFinal(step); break;
    case "tiebreak": renderTiebreak(step); break;
  }
  bigTimer(curTimer, $("draw-bigtimer"));
  bigTimer(curTimer, $("th-bigtimer"));
  scheduleFit();
});

// ---------- Wifi-QR op het welkomstscherm (plaatje zelf neerzetten: public/media/wifi-qr.png of .jpg) ----------
(() => {
  const img = $("welcome-wifi-img");
  const tries = ["/media/wifi-qr.png", "/media/wifi-qr.jpg", "/media/wifi-qr.jpeg"];
  let i = 0;
  img.onload = () => $("welcome-wifi").classList.remove("hidden");
  img.onerror = () => { i++; if (i < tries.length) img.src = tries[i] + "?v=" + Date.now(); };
  img.src = tries[0] + "?v=" + Date.now();
})();

// ---------- QR-code ----------
// Het adres kan veranderen (laptop wisselt van netwerk of krijgt een nieuw adres): elke 20 s even nakijken
let joinUrl = null;
function loadJoinQr() {
  fetch("/api/join-url").then((r) => r.json()).then((d) => {
    if (d.url === joinUrl) return;
    joinUrl = d.url;
    $("join-url").textContent = d.url;
    // de QR-code maakt de server zelf (werkt ook zonder internet)
    const img = document.createElement("img");
    img.src = "/qr.svg?t=" + Date.now(); img.alt = "QR-code"; img.width = 260; img.height = 260;
    img.style.cssText = "display:block; width:clamp(160px, 22vw, 420px); height:auto; image-rendering:pixelated;";
    $("qrcode").replaceChildren(img);
  }).catch(() => {});
}
loadJoinQr();
setInterval(loadJoinQr, 20000);
