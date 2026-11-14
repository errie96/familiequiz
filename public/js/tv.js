// Tv-scherm (host.html): alle weergaven, effecten en de verbinding met de server.
// Gewoon script (geen module); wordt na shared.js geladen, zie host.html.
const socket = io();
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const VIEWS = ["v-welcome", "v-demodraw", "v-lobby", "v-info", "v-mc", "v-memory", "v-song", "v-price", "v-draw", "v-thirty", "v-roundresult", "v-teamphoto", "v-joker", "v-final", "v-end", "v-review", "v-standings", "v-pause"];
// Eén vaste overgang voor alle schermen: kort invagen (opacity + translate, los van de schaalberekening). Alleen als het
// scherm echt wisselt; een update van hetzelfde scherm animeert niet opnieuw.
let curView = null;
function showView(id) {
  VIEWS.forEach((v) => $(v).classList.toggle("hidden", v !== id));
  if (curView !== id) {
    curView = id;
    const v = $(id);
    v.classList.remove("view-in"); void v.offsetWidth; v.classList.add("view-in");
    setTimeout(() => v.classList.remove("view-in"), 700);
  }
  if (typeof scheduleFit === "function") scheduleFit();
}

// ---------- Geluid: de browser wil eerst één klik of toetsdruk ----------
let audioUnlocked = false;
function unlock() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  QuizFX.unlockAudio();
  $("audio-banner").classList.add("hidden");
  document.querySelectorAll("audio").forEach((a) => a.play().catch(() => {}));
  QuizFX.retryMusic();
  socket.emit("tv_audio", { ok: true }); // de bediening ziet nu in de checklist dat de tv geluid heeft
}
["click", "keydown", "touchstart"].forEach((ev) => document.addEventListener(ev, unlock));
const allAudio = () => Array.from(document.querySelectorAll("audio"));

// Verbinding weg: pas na 1,5 seconde de kaart tonen (een korte hapering hoeft niemand te zien)
let offlineTimer = null;
function showOffline(on) {
  clearTimeout(offlineTimer);
  if (!on) return $("tv-offline").classList.remove("show");
  $("off-title").textContent = QuizFX.t("tv.verbinding.titel").replace(/^tv\.verbinding\.titel$/, "Even geduld…");
  $("off-text").textContent = QuizFX.t("tv.verbinding.tekst").replace(/^tv\.verbinding\.tekst$/, "We zijn zo terug!");
  offlineTimer = setTimeout(() => $("tv-offline").classList.add("show"), 1500);
}
socket.on("connect", () => { socket.emit("register_tv"); showOffline(false); QuizFX.syncClock(socket); if (audioUnlocked) socket.emit("tv_audio", { ok: true }); });
// ---------- Opening (quizmaster drukt op Start, of "Opening testen" in de bediening) ----------
let lastTv = null, openingTimer = null;
socket.on("opening", (info) => {
  const o = $("opening");
  if (info && info.hold) holdScreen(info.ms || 6000); // bij de start: het eerste scherm komt pas na de opening
  $("op-title").textContent = QuizFX.t("opening.tekst").replace(/^opening\.tekst$/, "De quiz gaat beginnen!");
  const sub = (lastTv && lastTv.brand && lastTv.brand.subtitle) || "";
  $("op-sub").textContent = sub;
  QuizFX.renderBrand(o);
  o.classList.remove("show"); void o.offsetWidth; o.classList.add("show");
  if (!lastTv || (lastTv.soundOut || "tv") === "tv") QuizFX.playOpening(lastTv && lastTv.ambience ? lastTv.ambience.opening : null);
  setTimeout(() => { try { QuizFX.launchConfetti(); } catch (e) { /* geen confetti */ } }, 1700);
  clearTimeout(openingTimer);
  openingTimer = setTimeout(() => o.classList.remove("show"), 6000);
});
socket.on("disconnect", () => showOffline(true));
fetch("/api/brand").then((r) => r.json()).then((b) => QuizFX.setBrand(b)).catch(() => {}); // logo al vóór de eerste stand
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
// Soundboard van de quizmaster: een vast geluid of een eigen bestand uit public/media/sounds/
socket.on("sfx", (m) => {
  if (!m) return;
  if (m.name && ["drumroll", "applause", "sadTrombone", "cheer", "buzzer", "ding", "fanfare"].includes(m.name) && typeof QuizFX[m.name] === "function") QuizFX[m.name]();
  else if (typeof m.src === "string" && m.src.startsWith("/media/sounds/")) { const a = new Audio(m.src); a.play().catch(() => {}); }
});
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
  c.dataset.team = name;
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
  // Alleen opnieuw opbouwen als er echt iets verandert (andere opties of het antwoord). Elke nieuwe stand van de server
  // (bijvoorbeeld een team dat antwoordt) riep dit aan; de nieuwe .qo-elementen speelden dan hun binnenkomst-animatie
  // opnieuw af, waardoor de antwoorden even wegvielen en weer terugkwamen.
  const sig = JSON.stringify([options, correct]);
  if (box.dataset.sig === sig && box.firstChild && box.firstChild.className === "qgrid") return;
  box.dataset.sig = sig;
  box.replaceChildren();
  const grid = el("div", "qgrid");
  let burstAt = null;
  options.forEach((opt, i) => {
    const fresh = correct === i && !animSeen.has(chipStep + "|correct");
    const d = el("div", "qo" + (correct === i ? " correct" : "") + (fresh ? " fresh" : "") + (Number.isInteger(correct) && correct !== i ? " dim" : ""));
    if (fresh) { animSeen.add(chipStep + "|correct"); if (QuizFX.ding) QuizFX.ding(); burstAt = d; }
    const l = el("b", "letter", QuizFX.letter(i));
    const txt = el("span", "qo-text");
    txt.append(l, document.createTextNode(opt));
    if (correct === i) txt.append(el("b", "", "  ✅"));
    d.append(txt);
    grid.appendChild(d);
  });
  box.appendChild(grid);
  // goed antwoord: een kleine confetti-uitbarsting vanuit het vak (na het passend maken van het scherm)
  if (burstAt && QuizFX.sparkBurst) setTimeout(() => { if (burstAt.isConnected) QuizFX.sparkBurst(burstAt); }, 350);
}
const medal = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);
// Stand: bij een nieuwe stand schuiven de teams van hun oude naar hun nieuwe plek en tellen de punten op
const lastStand = new WeakMap(); // ul -> { sig, order: [naam], score: { naam: punten } }
function standingsList(ul, rows) {
  rows = rows || [];
  const sig = JSON.stringify(rows.map((r) => [r.name, r.score, r.rank]));
  const prev = lastStand.get(ul);
  if (prev && prev.sig === sig && ul.childElementCount) return; // niets veranderd: niet opnieuw animeren
  ul.replaceChildren();
  const lis = rows.map((row) => {
    const li = el("li", row.rank <= 3 ? `top${row.rank}` : "");
    li.append(el("span", "", `${medal(row.rank)}  ${row.name}`));
    const b = el("b", "st-score", `${row.score} pt`);
    li.append(b);
    ul.appendChild(li);
    const was = prev && prev.score[row.name];
    if (prev && Number.isFinite(was) && was !== row.score) countFrom(b, was, row.score, " pt", 1200, 500);
    return li;
  });
  if (prev) flipRows(lis, rows.map((r) => prev.order.indexOf(r.name)));
  else lis.forEach((li, i) => li.style.setProperty("--i", i));
  ul.classList.toggle("ds-stagger", !prev);
  lastStand.set(ul, { sig, order: rows.map((r) => r.name), score: Object.fromEntries(rows.map((r) => [r.name, r.score])) });
}
// Getal laten oplopen (of aflopen) van "from" naar "to"
function countFrom(node, from, to, suffix = "", ms = 1000, delay = 0) {
  node.textContent = `${from}${suffix}`;
  setTimeout(() => {
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      node.textContent = `${p >= 1 ? to : Math.round(from + (to - from) * e)}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}
let lastSecs = null;
let curTimer = null;
// Klokje bovenin: een ring die leegloopt (groen → amber → rood) met het aantal seconden, dat bij elke seconde even "tikt"
const RING_C = 2 * Math.PI * 15.5;
function timerRing(info) {
  const box = $("tv-timer");
  if (!box.querySelector(".tring")) {
    box.innerHTML = `<svg class="tring" viewBox="0 0 36 36" aria-hidden="true"><circle class="tr-bg" cx="18" cy="18" r="15.5"/><circle class="tr-fg" cx="18" cy="18" r="15.5" stroke-dasharray="${RING_C.toFixed(2)}"/></svg><b class="tr-num"></b><span class="tr-s">s</span>`;
  }
  box.querySelector(".tr-fg").style.strokeDashoffset = (RING_C * (1 - Math.max(0, Math.min(1, info.fraction)))).toFixed(2);
  const num = box.querySelector(".tr-num");
  if (num.textContent !== String(info.secs)) {
    num.textContent = String(info.secs);
    if (num.animate && info.running) num.animate([{ transform: "scale(1.25)", opacity: 0.5 }, { transform: "scale(1)", opacity: 1 }], { duration: 350, easing: "ease-out" });
  }
}
// Pauzedilemma: de vraag met twee opties en live (anonieme) balkjes; geen punten
let dilemmaShown = null;
function renderDilemma(d) {
  $("pause-dilemma").classList.toggle("hidden", !d || !d.text);
  $("v-pause").classList.toggle("has-dilemma", !!(d && d.text));
  if (!d || !d.text) { dilemmaShown = null; return; }
  if (dilemmaShown !== d.text) {
    dilemmaShown = d.text;
    $("dil-q").textContent = d.text; $("dil-a").textContent = d.a; $("dil-b").textContent = d.b;
    QuizFX.whoosh();
  }
  const total = Math.max(1, d.total || 0);
  for (const k of ["a", "b"]) {
    $("dil-bar-" + k).style.width = `${Math.round(((d.counts && d.counts[k]) || 0) / total * 100)}%`;
    $("dil-num-" + k).textContent = d.total ? `${(d.counts && d.counts[k]) || 0}` : "";
  }
  $("dil-total").textContent = d.total ? `${d.total} ${d.total === 1 ? "stem" : "stemmen"}` : "Kies A of B op je telefoon!";
  scheduleFit();
}
// Timerbalk: één vloeiende, lineaire animatie voor de hele resterende tijd. Elke nieuwe stand van de server zet de klok
// opnieuw, maar de balk wordt alleen bijgesteld bij een afwijking van meer dan 0,4 s: geen sprongetjes meer.
let barAnim = null;
function setTimerBar(info) {
  const fill = $("tv-timerfill");
  if (!info.running) { barAnim = null; fill.style.transition = "none"; fill.style.width = `${(info.fraction * 100).toFixed(2)}%`; return; } // pauze: blijft staan
  const endAt = Date.now() + info.leftMs;
  if (barAnim && Math.abs(barAnim.endAt - endAt) < 400) return;
  barAnim = { endAt };
  fill.style.transition = "none";
  fill.style.width = `${(info.fraction * 100).toFixed(2)}%`;
  void fill.offsetWidth;
  fill.style.transition = `width ${Math.max(0, Math.round(info.leftMs))}ms linear, background 0.4s`;
  fill.style.width = "0%";
}
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
  // Het rondeoverzicht als nette tegels in plaats van één lange regel met bolletjes
  const parts = s.id === "rounds_overview" ? String(s.text || "").split("•").map((x) => x.trim()).filter(Boolean) : [];
  $("info-text").classList.toggle("round-tiles", parts.length > 2);
  if (parts.length > 2) $("info-text").replaceChildren(...parts.map((x) => { const m = /^(\d+)\.\s*(\S+)\s+(.*)$/.exec(x); const t = el("div", "round-tile"); if (m) t.append(el("span", "rt-no", m[1]), el("span", "rt-emoji", m[2]), el("span", "rt-name", m[3])); else t.textContent = x; return t; }));
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
// De antwoorden vliegen één keer per vraag binnen: A en C van links, B en D van rechts, met overshoot en een lichte draai,
// en een oplopende plop per antwoord. Via de Web Animations API, zodat het niet afhangt van klassen of timers.
let flownStep = null;
function flyIn(opts, stepId) {
  if (flownStep === stepId) return;
  flownStep = stepId;
  const grid = opts.firstChild;
  const kids = grid && grid.children ? Array.from(grid.children) : [];
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  kids.forEach((q, i) => {
    if (!reduce && typeof q.animate === "function") {
      q.animate([
        { opacity: 0, transform: `translateX(${i % 2 ? 14 : -14}vw) scale(0.82) rotate(${i % 2 ? 3 : -3}deg)` },
        { opacity: 1, transform: "none" }
      ], { duration: 750, delay: i * 160, easing: "cubic-bezier(.2,1.45,.4,1)", fill: "backwards" });
    }
    setTimeout(() => { try { QuizFX.pop(i); } catch (e) { /* geen geluid */ } }, i * 160 + 90);
  });
}
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
    $("mc-teams").replaceChildren();
    return;
  }
  opts.classList.remove("opts-hidden");
  readShown = s.id + "|shown";
  lettersGrid($("mc-options"), s.options, s.answer);
  flyIn(opts, s.id); // de antwoorden vliegen binnen (één keer per vraag)
  showPicks(opts, s);
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
    $("song-lines").replaceChildren(); linesKey = null;
    $("v-song").classList.remove("has-lines");
    return;
  }
  const key = s.id;
  if (songKey !== key) {
    songKey = key;
    const a = QuizFX.renderMedia($("song-audio"), s.audio, { autoplay: true });
    if (a && !audioUnlocked) a.play().catch(() => {});
  }
  const rev = s.status === "revealed";
  $("v-song").classList.add("has-lines");
  $("song-title").style.fontSize = "";
  $("song-title").textContent = rev
    ? (s.song ? `🎵 ${s.song.title} · ${s.song.artist} · ${s.song.year}` : QuizFX.t("muziek.onthuld")) + (s.done ? "  🏁" : "")
    : "🎵 " + QuizFX.t("muziek.vraag");
  $("song-sub").textContent = rev
    ? (s.done ? QuizFX.t("muziek.klaar") + " " + QuizFX.t("muziek.klaar.tekst", { doel: s.target }) : (s.test ? "Oefenliedje: zo gaat het straks. " : "") + QuizFX.t("muziek.onthuld.tekst", { doel: s.target }))
    : QuizFX.t("muziek.uitleg", { doel: s.target });
  renderTimelines(s);
}

// ---- De tijdlijnen op de tv ----
// Elk team een rij kaarten (jaartal groot, artiest boven, titel onder). Een ingediende kaart ligt dicht (quizlogo boven)
// eerst helemaal rechts; als iedereen heeft ingediend schuift hij naar de gekozen plek. Bij "Toon het antwoord" draaien de kaarten één voor één om: goed blijft liggen, fout valt weg.
const HCOLORS = [["#f472b6", "#fb7185"], ["#fbbf24", "#f59e0b"], ["#34d399", "#10b981"], ["#60a5fa", "#38bdf8"], ["#c084fc", "#a78bfa"], ["#fb923c", "#f97316"], ["#a3e635", "#84cc16"], ["#22d3ee", "#2dd4bf"]];
const hHash = (str) => { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
let linesKey = null, revealTimers = [], droppedIn = new Set();
const PLACE_DELAY_MS = 2000; // zo lang na de laatste inzending blijven de dichte kaarten rechts liggen
let allInAt = new Map(), placeTimer = null, lastLines = null;
function hFront(card) {
  const f = el("div", "hface hfront");
  const c = HCOLORS[hHash(card.id || card.title) % HCOLORS.length];
  f.style.background = `linear-gradient(145deg, ${c[0]}, ${c[1]})`;
  f.append(el("div", "ha", card.artist || ""), el("div", "hy", String(card.year)), el("div", "ht", card.title || ""));
  return f;
}
function hBack() {
  const b = el("div", "hface hback");
  const logo = QuizFX.brandLogo();
  if (logo) { const img = document.createElement("img"); img.src = logo; img.alt = ""; b.append(img); } else b.append(el("div", "hq", "?"));
  return b;
}
function hOpenCard(card) { const slot = el("div", "hslot"); const c = el("div", "hcard"); c.append(hFront(card)); slot.append(c); return slot; }
function hPendingCard(song) {
  // voor- en achterkant; de voorkant (het liedje) zit er pas in bij het onthullen
  const slot = el("div", "hslot pending"); const c = el("div", "hcard");
  c.append(song ? hFront(song) : el("div", "hface hfront"), hBack());
  slot.append(c);
  return slot;
}
function renderTimelines(s) {
  const box = $("song-lines");
  const rev = s.status === "revealed";
  // Maat van de kaarten: vooraf vastgelegd voor de hele ronde, zodat de tijdlijnen tijdens het spel niet krimpen.
  // Breedte voor het doel (zoveel kaarten kan een tijdlijn hooguit worden) plus de dichte kaart; past in de hoogte (aantal teams).
  const rows = Math.max(1, s.teams.length);
  const goal = s.test ? 0 : Number(s.target) || 0;
  const most = Math.max(4, goal + 1, ...s.teams.map((t) => t.timeline.length + 1));
  const vh = window.innerHeight / 100, vw = window.innerWidth / 100;
  const size = Math.max(40, Math.min(16 * vh, (76 * vh) / rows - 2.2 * vh, (72 * vw) / (most * 1.07)));
  box.style.setProperty("--hc", `${size.toFixed(1)}px`);
  box.style.setProperty("--hgap", `${Math.min(1.4 * vh, size * 0.12).toFixed(1)}px`);
  // Ingediende kaarten liggen eerst dicht tegen de rechterrand van de rij; 2 seconden nadat alle (verbonden) teams
  // hebben ingediend, schuiven ze naar de plek die het team koos. Bij "Toon het antwoord" draaien ze om.
  const live = s.teams.filter((t) => t.connected);
  const everyoneIn = (live.length ? live : s.teams).every((t) => t.slot !== null) && s.teams.some((t) => t.slot !== null);
  if (!everyoneIn || rev) allInAt.delete(s.id);
  else if (!allInAt.has(s.id)) allInAt.set(s.id, Date.now());
  const wait = everyoneIn && !rev ? PLACE_DELAY_MS - (Date.now() - allInAt.get(s.id)) : 0;
  const allIn = rev || (everyoneIn && wait <= 0);
  lastLines = s;
  clearTimeout(placeTimer);
  if (everyoneIn && !rev && wait > 0) placeTimer = setTimeout(() => { if (lastLines && lastLines.id === s.id) renderTimelines(lastLines); }, wait + 20);
  const key = [s.id, s.status, rows, allIn ? 1 : 0, rev ? "" : s.teams.map((t) => `${t.slot}|${t.timeline.length}|${t.connected ? 1 : 0}`).join(",")].join("#");
  if (key === linesKey) return;
  const wasOpen = linesKey && linesKey.startsWith(s.id + "#open");
  linesKey = key;
  revealTimers.forEach(clearTimeout); revealTimers = [];
  // FLIP: oude plek van elke kaart onthouden, zodat de dichte kaart zichtbaar naar zijn plek schuift
  const oldRects = new Map();
  box.querySelectorAll(".hslot[data-k]").forEach((n) => oldRects.set(n.dataset.k, n.getBoundingClientRect()));
  box.replaceChildren();
  const pendings = [];
  s.teams.forEach((t) => {
    const st = TEAMSTYLE[t.name] || {};
    const row = el("div", "hrow" + (t.connected ? "" : " off"));
    row.style.setProperty("--tc", st.color || "#64748b");
    const who = el("div", "hteam");
    const txt = el("div");
    const count = el("div", "hcount", `${t.timeline.length} / ${s.target}`);
    txt.append(el("div", "hname", t.name), count);
    who.append(QuizFX.avatar(t.name, st.photo, `${Math.min(size * 0.8, 7 * vh).toFixed(0)}px`, st.color), txt);
    const cards = el("div", "hcards");
    // Bij het onthullen eerst de stand van vlak ervoor opbouwen: de goede kaart zit dan al in de tijdlijn, die halen we er even uit
    const r = rev ? t.result : null;
    const inLine = !!(r && r.ok && s.song && t.timeline[r.slot] && t.timeline[r.slot].id === s.song.id);
    const base = inLine ? t.timeline.filter((_, i) => i !== r.slot) : t.timeline;
    if (inLine) count.textContent = `${base.length} / ${s.target}`;
    const chosen = rev ? (r ? r.slot : null) : t.slot;
    const slot = chosen === null ? null : allIn ? chosen : base.length; // nog niet iedereen: dicht helemaal rechts
    base.forEach((c, i) => { if (slot === i) cards.append(mkPending()); const o = hOpenCard(c); o.dataset.k = t.name + "|" + c.id; cards.append(o); });
    if (slot !== null && slot >= base.length) cards.append(mkPending());
    function mkPending() {
      const p = hPendingCard(rev ? s.song : null);
      p.dataset.k = t.name + "|?";
      if (!allIn) p.classList.add("parked"); // tegen de rechterrand, los van de tijdlijn
      const k = s.id + "|" + t.name;
      if (!rev && !droppedIn.has(k)) { droppedIn.add(k); p.classList.add("drop-in"); try { QuizFX.pop(droppedIn.size); } catch (e) { /* geen geluid */ } }
      if (rev) pendings.push({ el: p, ok: !!(r && r.ok), keep: inLine, count, total: t.timeline.length });
      return p;
    }
    row.append(who, cards);
    box.append(row);
  });
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (oldRects.size && !reduce) {
    box.querySelectorAll(".hslot[data-k]").forEach((n) => {
      const o = oldRects.get(n.dataset.k); if (!o) return;
      const nw = n.getBoundingClientRect(), dx = o.left - nw.left, dy = o.top - nw.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      n.classList.remove("drop-in");
      n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(0.34, 1.3, 0.64, 1)" });
    });
  }
  if (!rev) { scheduleFit(); return; }
  // Onthullen: één voor één omdraaien (team voor team), met een tromslag ervoor
  const startAt = wasOpen && !reduce ? 700 : 100, gap = reduce ? 0 : Math.max(450, Math.min(900, 3600 / Math.max(1, pendings.length)));
  if (wasOpen && !reduce) { try { QuizFX.drumHit(); } catch (e) { /* geen geluid */ } }
  pendings.forEach((p, i) => {
    revealTimers.push(setTimeout(() => {
      p.el.classList.add("flipped", p.ok ? "good" : "bad");
      if (wasOpen) { try { p.ok ? QuizFX.ding() : QuizFX.buzzer(); } catch (e) { /* geen geluid */ } }
      if (p.keep) p.count.textContent = `${p.total} / ${s.target}`;
      // fout: na even kijken valt de kaart van tafel; goed (ook bij het oefenliedje) blijft liggen
      if (!p.ok) revealTimers.push(setTimeout(() => p.el.classList.add("gone"), reduce ? 0 : 1700));
    }, startAt + i * gap));
  });
  scheduleFit();
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
// Tekeningen van alle teams: de maat hangt alleen af van het aantal teams, niet van de tekst eronder. Zo zijn ze
// tijdens het tekenen, het nakijken en de uitslag precies even groot.
// Meerkeuze met "antwoord meteen tonen": de teamfoto's vliegen van het rijtje onder de vraag naar het vakje dat
// het team koos (één keer; bij een volgende stand staan ze er gewoon).
function showPicks(opts, s) {
  const grid = opts.querySelector(".qgrid");
  if (!grid) return;
  const picks = s.status === "closed" && Array.isArray(s.picks) ? s.picks : [];
  const key = JSON.stringify(picks);
  if (grid.dataset.picks === key) return;
  grid.dataset.picks = key;
  grid.querySelectorAll(".qo-picks").forEach((x) => x.remove());
  grid.classList.toggle("has-picks", picks.length > 0);
  if (!picks.length) return;
  const fresh = !animSeen.has(chipStep + "|picks");
  animSeen.add(chipStep + "|picks");
  const from = {};
  if (fresh) $("mc-teams").querySelectorAll(".tchip[data-team] .team-avatar").forEach((a) => { from[a.parentNode.dataset.team] = a.getBoundingClientRect(); });
  const cells = [...grid.querySelectorAll(".qo")];
  const made = [];
  picks.forEach((p) => {
    const cell = cells[p.choice];
    if (!cell) return;
    let box = cell.querySelector(".qo-picks");
    if (!box) { box = el("span", "qo-picks"); cell.append(box); }
    const st = TEAMSTYLE[p.name] || {};
    const av = QuizFX.avatar(p.name, st.photo, "1.7em", st.color);
    av.title = p.name;
    box.append(av);
    box.classList.toggle("many", box.children.length > 4); // veel teams in één vak: de foto's liggen iets over elkaar
    made.push([p.name, av]);
  });
  if (!fresh) return;
  requestAnimationFrame(() => made.forEach(([name, av], k) => {
    const a = from[name], b = av.getBoundingClientRect();
    if (!a || !av.animate) return;
    const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
    av.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.6 }, { transform: "translate(0, 0) scale(1.25)", opacity: 1, offset: 0.8 }, { transform: "none", opacity: 1 }],
      { duration: 900, delay: k * 110, easing: "cubic-bezier(.2,.8,.3,1)", fill: "backwards" });
  }));
}
function fixedGallery(n) {
  const g = el("div", "gallery fixed");
  const cols = n <= 4 ? Math.max(1, n) : n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3);
  const h = n <= 4 ? 44 : n <= 8 ? 24 : 16; // hoogte van één tekening in vh
  g.style.setProperty("--cols", cols);
  g.style.setProperty("--w", `min(calc(${h}vh * 4 / 3 + 2vw), calc((88vw - ${cols - 1} * 1.5vw) / ${cols}))`);
  return g;
}
function renderDraw(s, state) {
  showView("v-draw");
  const body = $("draw-body");
  if (s.status === "drawing") {
    $("draw-title").textContent = `✏️ Beurt ${s.turn} van ${s.total}`;
    const key = `${s.id}|${s.turn}|drawing`;
    if (drawKey !== key) {
      drawKey = key; liveStrokes = {}; liveCanvas = {};
      body.replaceChildren();
      const g = fixedGallery(s.teams.filter((t) => t.strokes).length);
      s.teams.forEach((t) => {
        if (!t.strokes) return;
        liveStrokes[t.name] = t.strokes.map((x) => ({ ...x, p: [...x.p] }));
        const card = el("div", "gcard");
        const wrap = el("div", "padwrap");
        const cv = el("canvas");
        liveCanvas[t.name] = cv;
        wrap.append(cv);
        const label = el("div", "draw-label gcard-cap"); label.dataset.team = t.name;
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
      drawers.forEach((t) => { const c = el("div", "team-card"); c.append(QuizFX.avatar(t.name, (TEAMSTYLE[t.name] || {}).photo, "clamp(70px, 8vw, 150px)", (TEAMSTYLE[t.name] || {}).color), el("div", "tc-name", t.name), el("div", "tv-sub", `✏️ ${t.drawer}`)); g.append(c); });
      body.append(el("h2", "", "Deze beurt tekenen:"), g, el("p", "tv-sub", "Tekenaars: pak je telefoon erbij. Je woord verschijnt zodra de quizmaster start."));
    }
  } else if (s.status === "drawing") {
    // (wordt hierboven afgehandeld)
  } else if (s.status === "judging" || s.status === "result") {
    $("draw-title").textContent = QuizFX.t("teken.uitslag", { beurt: s.turn, totaal: s.total });
    const g = fixedGallery(s.teams.filter((t) => t.strokes).length);
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
      const cap = el("div", "gcard-cap"); cap.append(lab, sub);
      card.append(wrap, cap);
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
  if (s.status === "select") {
    // Elk team kiest op de basistelefoon wie er gaan uitleggen; een vinkje zodra een team klaar is
    $("th-title").textContent = "⏱️ 30 Seconds";
    body.append(el("p", "tv-sub", s.per === 1 ? "Elk team kiest één verteller. Tik hem of haar aan op de basistelefoon." : `Elk team kiest ${s.per} vertellers. Tik ze aan op de basistelefoon.`));
    const grid = el("div", "th-choose");
    (s.choosing || []).forEach((t) => {
      const card = el("div", "th-choose-card" + (t.done ? " done" : ""));
      card.style.borderColor = t.color || "#64748b";
      const head = el("div", "th-choose-head");
      head.append(QuizFX.avatar(t.name, t.photo, "3.2vw"), el("b", "", t.name));
      card.append(head, el("div", "th-choose-names", t.done ? "✅ " + t.names.join(" · ") : "⏳ nog aan het kiezen…"));
      grid.append(card);
    });
    body.append(grid);
  } else if (s.status === "ready") {
    $("th-title").textContent = `⏱️ 30 Seconds · beurt ${s.turn} van ${s.total}`;
    body.append(el("p", "tv-sub", QuizFX.t("dertig.klaar", { wie: who })), el("div", "huge tv-center", "🎲"));
    if (s.lastLap) body.append(el("p", "tv-sub", "Dit is de laatste rondgang."));
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

// Aanmeldscherm bij persoonlijk aanmelden: per familie wie er al is (alleen namen), tot de quizmaster de teams maakt
let signupKnown = null;
function renderLobbySignup(su) {
  const box = $("lobby-signup");
  const show = !!su && !su.teamsMade;
  box.classList.toggle("hidden", !show);
  $("lobby-head").textContent = su ? (su.teamsMade ? "De teams" : QuizFX.t("aanmeld.tv.kop")) : "Teams";
  if (!show) { signupKnown = su ? signupKnown : null; return; }
  const names = su.families.flatMap((f) => f.people.map((p) => f.name + "|" + p.label));
  const fresh = signupKnown ? names.filter((n) => !signupKnown.has(n)) : [];
  if (fresh.length) QuizFX.pop(names.length);
  signupKnown = new Set(names);
  box.replaceChildren();
  su.families.forEach((f) => {
    const full = f.expected != null && f.present >= f.expected;
    const card = el("div", "fam-card" + (full ? " full" : ""));
    const head = el("div", "fam-head");
    head.append(el("span", "", f.name), el("span", "fam-count", f.expected != null ? `${full ? "✓ " : ""}${f.present} / ${f.expected}` : String(f.present)));
    const row = el("div", "fam-names");
    f.people.forEach((p) => row.append(el("span", "fam-chip" + (fresh.includes(f.name + "|" + p.label) ? " fx-new" : ""), p.label)));
    card.append(head, row);
    box.append(card);
  });
  if (su.total) box.append(el("div", "fam-total", su.expected != null ? (su.complete ? `Iedereen is er: ${su.total} deelnemers. De teams worden zo gemaakt!` : `${su.total} van de ${su.expected} deelnemers aangemeld`) : `${su.total} aangemeld`));
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
  box.classList.toggle("wide", list.some((t) => t.names));
  list.forEach((t) => {
    const card = el("div", "team-card" + (t.connected === false ? " off" : "") + (fresh.includes(t.name) ? " fx-new" : ""));
    card.append(QuizFX.avatar(t.name, t.photo, "clamp(80px, 9vw, 180px)", (TEAMSTYLE[t.name] || {}).color), el("div", "tc-name", t.name));
    // persoonlijk aanmelden: de namen van de teamleden erbij, zodat iedereen ziet waar hij zit
    card.append(t.names ? el("div", "tc-members", t.names.join(", ")) : el("div", "tv-sub", `${t.members} ${t.members === 1 ? "speler" : "spelers"}`));
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
  (s.teams || []).forEach((t) => { const c = el("div", "team-card"); c.append(QuizFX.avatar(t.name, t.photo, "clamp(80px, 9vw, 180px)", t.color), el("div", "tc-name", t.name)); grid.append(c); });
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
  $("mc-cat").classList.add("hidden"); // "Oefenvraag" staat al bovenin de balk: niet twee keer tonen
  const closed = s.status === "closed";
  const shown = closed && s.name != null; // antwoord tonen? (instelling "Antwoorden tussendoor tonen")
  const hiddenText = "Het antwoord volgt bij het nakijken";
  if (s.variant === "blur") {
    $("mc-question").textContent = shown ? QuizFX.t("open.antwoord", { antwoord: s.name }) : closed ? hiddenText : (s.question || QuizFX.t("blur.vraag"));
    QuizFX.renderBlur($("mc-media"), s.media, shown ? s.blurMax : s.blurStep, s.blurMax, s.media ? s.media.src : "Foto ontbreekt");
    const dots = $("mc-dots");
    dots.classList.toggle("hidden", closed);
    dots.replaceChildren();
    for (let i = 0; i <= s.blurMax; i++) dots.appendChild(el("i", i <= s.blurStep ? "on" : ""));
    const pts = s.blurPoints[Math.min(s.blurStep, s.blurPoints.length - 1)];
    $("mc-pointsnow").classList.toggle("hidden", closed);
    $("mc-pointsnow").textContent = s.test ? QuizFX.t("blur.oefen") : QuizFX.t("blur.punten", { punten: pts });
  } else {
    $("mc-question").textContent = shown ? QuizFX.t("open.antwoord", { antwoord: s.name }) : closed ? hiddenText : QuizFX.t("logo.vraag");
    // renderLogo tekent alleen opnieuw als er echt iets verandert (ander logo, of de onthulling), dus elke update mag
    QuizFX.renderLogo($("mc-media"), s.media, s.hide, shown, s.media ? s.media.src : "Logo ontbreekt");
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
  $("podium").classList.add("hidden"); $("podium").replaceChildren(); $("podium-rest").textContent = "";
  $("tv-scoreboard").classList.remove("hidden"); $("winner-photos").classList.remove("hidden");
  revealedN = 0;
  $("tv-scoreboard").replaceChildren();
  $("winner-banner").classList.add("hidden");
  $("reveal-spot").classList.add("hidden");
  clearTimeout(spotTimer);
  spotDone = null;
}
// De avond in cijfers: tegels komen één voor één in beeld; getallen tellen op
let statsKey = null;
function renderStats(list) {
  const key = JSON.stringify(list);
  if (key === statsKey) return;
  statsKey = key;
  const grid = $("stats-grid");
  grid.className = "stats-grid" + (list.length <= 6 ? " few" : "");
  grid.replaceChildren();
  if (!list.length) { grid.append(el("p", "tv-sub", "Nog geen cijfers: er is nog te weinig gespeeld.")); return; }
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.forEach((x, i) => {
    const card = el("div", "stat-card");
    const val = el("div", "stat-value", x.value);
    card.append(el("div", "stat-emoji", x.emoji), val, el("div", "stat-label", x.label));
    grid.append(card);
    setTimeout(() => {
      card.classList.add("show");
      try { QuizFX.pop(i); } catch (e) { /* geen geluid */ }
      // hele getallen tellen op van 0 naar de eindwaarde
      if (!reduce && /^\d+$/.test(x.value) && Number(x.value) > 3) {
        const end = Number(x.value), t0 = performance.now(), dur = 700;
        const tick = (now) => { const p = Math.min(1, (now - t0) / dur); val.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3)))); if (p < 1 && statsKey === key) requestAnimationFrame(tick); else val.textContent = x.value; };
        requestAnimationFrame(tick);
      }
    }, reduce ? 0 : 500 + i * 650);
  });
  scheduleFit();
}
function renderEnd(end) {
  showView("v-end");
  const rs = end.reveal;
  // Voor de ontknoping dimt de tv naar een donkere achtergrond met een spotlight op het podium
  const dark = rs !== "idle" && !(rs === "done" && ["awards", "album", "breakdown", "stats"].includes(end.endView));
  if (dark && !document.body.classList.contains("finale")) { QuizFX.whoosh(); setTimeout(() => QuizFX.drumHit(), 500); }
  document.body.classList.toggle("finale", dark);
  $("end-wait").classList.toggle("hidden", rs !== "idle");
  const showBreak = rs === "done" && end.endView === "breakdown" && end.breakdown;
  const showAwards = rs === "done" && end.endView === "awards" && end.awards;
  const showAlbum = rs === "done" && end.endView === "album" && end.album;
  const showStats = rs === "done" && end.endView === "stats" && end.stats;
  $("end-stats").classList.toggle("hidden", !showStats);
  if (!showStats) statsKey = null;
  $("end-reveal").classList.toggle("hidden", rs === "idle" || showBreak || showAwards || showAlbum || showStats);
  $("end-breakdown").classList.toggle("hidden", !showBreak);
  $("end-awards").classList.toggle("hidden", !showAwards);
  $("end-album").classList.toggle("hidden", !showAlbum);
  if (!showAlbum) stopAlbum();
  if (!showAwards) awardsKey = null;
  if (showStats) { renderStats(end.stats); return; }
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
  if (rs === "idle" || !end.scores) { resetReveal(); hideDuo(); return; }
  const list = end.scores;
  const target = Math.min(end.revealN, list.length);
  if (target < revealedN) { resetReveal(); hideDuo(); }
  // Podium: de laatste twee teams samen in beeld (zonder plek), daarna tromgeroffel en de winnaar
  if (end.duo && target === list.length - 2 && revealedN === target) { showDuo(list.slice(0, 2)); return; }
  if (duoShown && target === list.length && revealedN === list.length - 2) { finishDuo(list); return; }
  if (duoBusy) return; // de onthulling van de winnaar loopt nog
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
  if (all && !duoBusy && $("podium").classList.contains("hidden") && !winnerPending) {
    winnerPending = true;
    setTimeout(() => { winnerPending = false; if (revealedN >= list.length && !duoBusy) { showWinnerBanner(list, fresh); showPodium(list, !fresh); } }, spotMs);
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
  // Schermvullend: kolommen en rijen uitrekenen, de kaarten verdelen de hoogte
  const n = list.length, rows = n <= 4 ? 1 : n <= 10 ? 2 : n <= 18 ? 3 : 4, cols = Math.ceil(n / rows);
  grid.className = `award-grid fill rows-${Math.min(rows, 3)}`;
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.style.gridAutoRows = `calc((${rows === 1 ? 50 : 66}vh - ${(rows - 1) * 2}vh) / ${rows})`;
  list.forEach((a, i) => {
    const card = el("div", "award-card");
    const teamsBox = el("div", "aw-teams");
    a.teams.forEach((t) => { const sp = el("span"); sp.append(QuizFX.avatar(t.name, t.photo, "1.8em", t.color), t.name); teamsBox.append(sp); });
    card.append(el("div", "aw-emoji", a.emoji), el("div", "aw-title", a.title), teamsBox, el("div", "aw-detail", a.detail));
    grid.append(card);
    setTimeout(() => { card.classList.add("show", "trophy"); QuizFX.drumHit && QuizFX.drumHit(); setTimeout(() => { QuizFX.ding && QuizFX.ding(); }, 260); if (i % 3 === 2) QuizFX.cheer && QuizFX.cheer(); }, 600 + i * 1400);
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
// ---------- Podium: de laatste twee samen, dan de winnaar ----------
let duoShown = false, duoBusy = false;
function duoCard(p) {
  const st = TEAMSTYLE[p.name] || {};
  const c = el("div", "duo-card");
  c.dataset.name = p.name;
  c.append(el("div", "duo-label", ""), QuizFX.avatar(p.name, p.photo || st.photo, "clamp(160px, 30vh, 480px)", p.color || st.color), el("div", "", p.name));
  return c;
}
function showDuo(top2) {
  if (duoShown) return;
  duoShown = true;
  // vaste volgorde op naam, zodat de plaats op het scherm niets verraadt
  const pair = [...top2].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  $("duo-cards").replaceChildren(...pair.map(duoCard));
  $("reveal-duo").classList.remove("hidden");
  QuizFX.whoosh(); setTimeout(() => QuizFX.drumHit(), 350); setTimeout(() => QuizFX.drumHit(), 700);
}
function hideDuo() { duoShown = false; duoBusy = false; $("reveal-duo").classList.add("hidden"); }
function finishDuo(list) {
  if (duoBusy) return;
  duoBusy = true;
  const cards = [...$("duo-cards").children];
  cards.forEach((c) => c.classList.add("shake"));
  QuizFX.drumroll(3);
  setTimeout(() => {
    // Beide teams verdwijnen: alleen de winnaar komt in beeld, zodat er geen verwarring is
    $("reveal-duo").classList.add("hidden");
    duoShown = false;
    const winners = list.filter((p) => p.rank === 1);
    const afterSpot = () => {
      while (revealedN < list.length) { const li = QuizFX.rankRow(list[list.length - 1 - revealedN]); $("tv-scoreboard").prepend(li); li.classList.add("show"); revealedN++; }
      showWinnerBanner(list, false);
      showPodium(list, false);
      duoBusy = false;
    };
    QuizFX.cheer(); QuizFX.launchConfetti(); (QuizFX.triumph || QuizFX.fanfare)();
    if (winners.length === 1) spotlight(winners[0], 5500, afterSpot);
    else setTimeout(afterSpot, 600); // gedeelde winnaars: de banner noemt ze allebei
  }, 3100);
}
// Overwinningskaarten: de tv tekent per team een kaart en stuurt ze naar de server (data/fotos, mee in de foto-zip)
let cardsBusy = false, cardsDone = false;
function makeCards() {
  if (cardsBusy) return;
  cardsBusy = true;
  socket.emit("card_keys", null, async (res) => {
    try {
      if (res && res.ok) for (const it of res.cards) {
        const blob = await QuizFX.trophyCard(it.card);
        if (blob) await fetch(`/origineel/${encodeURIComponent(it.key)}`, { method: "POST", headers: { "Content-Type": "image/png" }, body: blob });
      }
      cardsDone = true;
    } catch (e) { /* de kaarten staan er dan niet bij; opnieuw maken kan via de bediening */ }
    cardsBusy = false;
  });
}
socket.on("make_cards", () => { cardsDone = false; makeCards(); });
// Punten die oplopen van 0 naar het eindresultaat (in ongeveer 1 seconde), in plaats van ineens te verschijnen
function countUp(node, to, suffix = "", ms = 1000, delay = 0) {
  node.textContent = `0${suffix}`;
  setTimeout(() => {
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      node.textContent = `${p >= 1 ? to : Math.round(to * e)}${suffix}`;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}
// Podium met drie blokken (brons, zilver, goud): eerst de derde plek, dan de tweede, als laatste de winnaar
function showPodium(list, instant) {
  const box = $("podium");
  if (!box.classList.contains("hidden")) return;
  const top = list.slice(0, 3);
  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const HEIGHT = { 1: 36, 2: 27, 3: 20 }; // vh
  box.replaceChildren();
  order.forEach((p) => {
    const r = Math.min(p.rank, 3), st = TEAMSTYLE[p.name] || {};
    const col = el("div", `pd-col pd-${r}`);
    const pts = el("div", "pd-pts", `${p.score}`);
    const head = el("div", "pd-head");
    head.append(QuizFX.avatar(p.name, p.photo || st.photo, "clamp(70px, 14vh, 230px)", p.color || st.color), el("div", "pd-name", p.name), pts);
    const block = el("div", "pd-block", r === 1 ? "🥇" : r === 2 ? "🥈" : "🥉");
    block.style.height = `${HEIGHT[r]}vh`;
    col.append(head, block);
    if (!instant) { const d = r === 1 ? 1.3 : r === 2 ? 0.7 : 0.1; col.style.animationDelay = `${d}s`; countUp(pts, p.score, " punten", 1000, d * 1000 + 500); }
    else col.style.animation = "none";
    box.append(col);
  });
  const rest = list.slice(3);
  $("podium-rest").textContent = rest.length ? rest.map((p) => `${p.rank}. ${p.name} (${p.score})`).join("   ·   ") : "";
  $("tv-scoreboard").classList.add("hidden");
  $("winner-photos").classList.add("hidden");
  box.classList.remove("hidden");
  setTimeout(scheduleFit, 100);
}
// Ontknoping: elke plek eerst groot in beeld (foto, naam, punten), daarna schuift het team in de ranglijst
let spotTimer = null, spotDone = null, winnerPending = false;
function spotlight(player, ms, done) {
  const sp = $("reveal-spot");
  const st = TEAMSTYLE[player.name] || {};
  const rankTxt = player.rank === 1 ? "🏆 Winnaar!" : player.rank === 2 ? "🥈 Tweede plaats" : player.rank === 3 ? "🥉 Derde plaats" : `Plek ${player.rank}`;
  sp.replaceChildren(el("div", "spot-rank", rankTxt), QuizFX.avatar(player.name, player.photo || st.photo, "clamp(180px, 34vh, 560px)", player.color || st.color), el("div", "spot-team", player.name), (() => { const n = el("div", "spot-pts", "0 punten"); countUp(n, player.score, " punten", 1000, 700); return n; })());
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
  const before = lastPosOrder; // volgorde van de vorige keer: teams schuiven vanaf hun oude plek naar de nieuwe
  lastPosOrder = list.map((p) => p.name);
  const rows = list.map((p, i) => {
    const row = el("div", "pos-row" + (p.rank <= 3 ? ` top${p.rank}` : ""));
    if (!before) row.style.animationDelay = `${i * 0.25}s`;
    if (p.color) row.style.borderLeft = `0.5vw solid ${p.color}`;
    row.append(el("span", "pos-rank", p.rank === 1 ? "🥇 1e" : p.rank === 2 ? "🥈 2e" : p.rank === 3 ? "🥉 3e" : `${p.rank}e`), QuizFX.avatar(p.name, p.photo, "1.6em", p.color), el("span", "", p.name));
    const old = before ? before.indexOf(p.name) : -1;
    if (old >= 0 && old !== i) row.append(el("span", "pos-move " + (old > i ? "up" : "down"), old > i ? `▲ ${old - i}` : `▼ ${i - old}`));
    return row;
  });
  $("positions-list").replaceChildren(...rows);
  if (before) flipRows(rows, rows.map((r, i) => before.indexOf(list[i].name)));
}
let lastPosOrder = null;
// Rijen laten verschuiven vanaf hun vorige plek (FLIP): oldIdx[i] = vorige plek van rij i (-1 = nieuw)
function flipRows(rows, oldIdx) {
  if (!rows.length || !rows[0].animate) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const h = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().top : rows[0].offsetHeight;
  rows.forEach((r, i) => {
    r.style.animation = "none"; // geen inval-animatie: ze schuiven
    const o = oldIdx[i];
    const from = o < 0 ? [{ opacity: 0, transform: "translateX(-4vw)" }] : [{ transform: `translateY(${(o - i) * h}px)` }];
    r.animate([...from, { opacity: 1, transform: "none" }], { duration: 1100, delay: 300 + i * 60, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "backwards" });
  });
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
  if (state.phase !== "END") cardsDone = false;
  else if (state.end && state.end.reveal === "done" && !cardsDone && !cardsBusy) setTimeout(makeCards, 9000); // na de onthulling en het podium
  if (state.phase !== "END") document.body.classList.remove("finale");
  const cur = { id: step ? step.id : null, kind: step ? step.kind : null, status: step ? step.status : null, paused: !!state.paused, header: state.header && state.header.round };
  const prev = fxLast; fxLast = cur;
  if (!prev || cur.id !== prev.id) flownStep = null; // een nieuwe (of opnieuw getoonde) vraag: de antwoorden vliegen weer binnen
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
        if (v) { v.classList.remove("fx-enter"); void v.offsetWidth; v.classList.add("fx-enter"); setTimeout(() => v.classList.remove("fx-enter"), 1900); } // alleen bij binnenkomst
      });
    }
    return;
  }
  if (cur.status !== prev.status && REVEAL[cur.kind] === cur.status) QuizFX.reveal();
}
// ---------- Rondeovergang ----------
let lastRoundHeader = null;
// Het ronde-gordijn is weg: de uitlegpagina van de ronde ("Ronde 3: …") is zelf de overgang. Een gordijn eroverheen
// gaf twee schermen tegelijk. Alleen bijhouden bij welke ronde we zijn.
function maybeCurtain(state) { lastRoundHeader = state.header.round || ""; }
// Bovenste regel: past de ronde (links) of de punten (rechts) niet in zijn vak, dan wordt die tekst kleiner, tot hij past
function fitTop() {
  // Joker-vakje te breed? Eerst de namen weglaten (alleen de teamfoto's/letters), pas daarna kleiner maken
  $("tv-points").classList.remove("compact");
  const right = document.querySelector("#tv-top .tt-right");
  // breedte zonder animatie (offsetWidth telt het opveren van het vakje niet mee)
  const need = right ? [...right.children].filter((c) => c.offsetParent !== null).reduce((sum, c) => sum + c.offsetWidth, 0) + 20 : 0;
  if (right && need > right.clientWidth) $("tv-points").classList.add("compact");
  document.querySelectorAll("#tv-top .tt-left, #tv-top .tt-right").forEach((col) => {
    col.style.removeProperty("--fit");
    const avail = col.clientWidth, need = col.scrollWidth;
    if (avail > 0 && need > avail + 1) col.style.setProperty("--fit", String(Math.max(0.45, (avail / need) * 0.97).toFixed(3)));
  });
}
window.addEventListener("resize", fitTop);
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
// Schermen met een tekening, foto of logo: het beeld heeft een vaste maat. Past het scherm niet, dan wordt eerst de
// tekst eromheen kleiner (tot 60%), zodat tekeningen en logo's op elk scherm even groot blijven. Pas als dat niet
// genoeg is, wordt het hele scherm verkleind (zoals bij de andere schermen).
const FIT_TEXT = ".tv-title, .tv-q, .tv-sub, .pointsnow, .cat, .tchip, .qo, .gcard-cap, h2";
function shrinkTextToFit(v, availH, availW) {
  if (!v.querySelector(".blurbox, .padwrap")) return;
  const els = [...v.querySelectorAll(FIT_TEXT)].filter((e) => !e.closest(".hidden"));
  const base = els.map((e) => parseFloat(getComputedStyle(e).fontSize) || 0);
  els.forEach((e) => { if (e.dataset.fitfs === undefined) e.dataset.fitfs = e.style.fontSize || ""; });
  // kleine marge: tijdens een animatie is het scherm soms 1 pixel te breed, en dat mag de tekst niet verkleinen
  for (let f = 0.92; f >= 0.6 && (v.scrollHeight > availH + 3 || v.scrollWidth > availW + 6); f -= 0.08) {
    els.forEach((e, i) => { if (base[i]) e.style.fontSize = `${(base[i] * f).toFixed(1)}px`; });
  }
}
// Rechtsboven: welke teams in deze ronde hun joker hebben ingezet (dubbele punten). Geen joker = geen vakje.
// Tot drie teams met foto/letter en naam, bij meer teams alleen de rondjes (anders past de bovenste regel niet).
let jokerKey = null;
function renderJokerPill(list) {
  const pill = $("tv-points");
  const key = JSON.stringify(list);
  if (key === jokerKey) return;
  const fresh = jokerKey !== null && list.length > 0 && key !== jokerKey;
  jokerKey = key;
  pill.classList.toggle("hidden", !list.length);
  pill.replaceChildren();
  if (!list.length) return;
  pill.append(document.createTextNode(list.length === 1 ? "🃏 Joker:" : "🃏 Jokers:"));
  list.forEach((t) => {
    const item = el("span", "jk-team");
    item.append(QuizFX.avatar(t.name, t.photo, "1.25em", t.color));
    item.append(el("span", "jk-name", t.name));
    item.title = t.name;
    pill.append(item);
  });
  if (fresh) { pill.classList.remove("jk-pop"); void pill.offsetWidth; pill.classList.add("jk-pop"); }
  fitTop();
}
// Teamnamen: past het langste woord niet op de kaart, dan de naam kleiner maken (nooit midden in een woord afbreken)
function fitNames(root) {
  root.querySelectorAll(".tc-name").forEach((n) => {
    n.style.fontSize = "";
    const base = parseFloat(getComputedStyle(n).fontSize) || 16;
    for (let f = 0.92; f >= 0.5 && n.scrollWidth > n.clientWidth + 1; f -= 0.06) n.style.fontSize = `${(base * f).toFixed(1)}px`;
  });
}
function fitView() {
  const main = document.querySelector("main");
  const v = VIEWS.map((id) => $(id)).find((x) => x && !x.classList.contains("hidden"));
  if (!main || !v) return;
  document.querySelectorAll("[data-fitfs]").forEach((e) => { e.style.fontSize = e.dataset.fitfs; delete e.dataset.fitfs; }); // vorige verkleining terugdraaien
  autoSizeText(v);
  fitNames(v);
  v.style.transform = "";
  v.style.marginTop = "";
  const cs = getComputedStyle(main);
  const availH = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  shrinkTextToFit(v, availH, availW);
  const h = v.scrollHeight, w = v.scrollWidth;
  const s = Math.min(1, availH / Math.max(1, h), availW / Math.max(1, w));
  if (s < 0.995) v.style.transform = `scale(${Math.max(0.3, s)})`;
  // Blijft er onder de inhoud veel leeg? Dan de inhoud iets boven het midden zetten in plaats van tegen de bovenrand:
  // dat oogt rustiger en verzorgder op een groot scherm. (Schermen die zelf het hele vlak vullen, blijven staan.)
  const free = availH - h * Math.min(1, s);
  if (free > availH * 0.08 && !v.dataset.top) v.style.marginTop = `${Math.round(free * 0.4)}px`;
}
function scheduleFit() {
  requestAnimationFrame(() => { fitView(); fitTop(); });
  clearTimeout(fitTimer);
  fitTimer = setTimeout(() => { fitView(); fitTop(); }, 350); // na laden van plaatjes en animaties nog een keer
}
window.addEventListener("resize", scheduleFit);
document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IMG") scheduleFit(); }, true);

// ---------- Hoofdlus ----------
let wasPaused = false;
let lastStepId = null;
let lastBeep = null;
// Tijdens de opening (bij de start) en de logo-flits (begin van een ronde) wacht het nieuwe scherm even:
// de laatste stand wordt bewaard en getoond zodra het klaar is, mét zijn eigen animatie en geluid.
let holdUntil = 0, heldState = null, replayState = null, holdTimer = null, stingFor = null;
function holdScreen(ms) {
  holdUntil = Date.now() + ms;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { holdUntil = 0; const st = heldState; heldState = null; if (st && replayState) replayState(st); }, ms);
}
function showSting() {
  const o = $("sting");
  QuizFX.renderBrand(o);
  o.classList.remove("show"); void o.offsetWidth; o.classList.add("show");
  try { QuizFX.whoosh && QuizFX.whoosh(); } catch (e) { /* geen geluid */ }
  setTimeout(() => o.classList.remove("show"), 1500);
}
socket.on("state_update", function tvState(state) {
  replayState = tvState;
  if (Date.now() < holdUntil) { heldState = state; return; }
  // Logo-flits: bij het begin van een nieuwe ronde eerst anderhalve seconde het logo groot in beeld
  const st0 = state.step;
  if (state.phase === "PLAY" && !state.paused && st0 && st0.roundIntro && stingFor !== st0.id && state.brand && state.brand.logo && (!state.ambience || state.ambience.sting !== false)) {
    stingFor = st0.id;
    if (lastTv) { showSting(); heldState = state; holdScreen(1500); return; } // niet bij het (her)laden van de pagina
  }
  document.body.classList.toggle("has-brand-logo", !!(state.brand && state.brand.logo));
  const step = state.step;
  const inQuiz = state.phase === "PLAY";
  TEAMSTYLE = state.teamStyle || {};
  cheatSoundOn = state.cheatSound !== false;
  setSoundOut(state.soundOut);
  QuizFX.setSoundFiles(state.soundFiles);
  renderPositions(state.positions);
  chipStep = step ? step.id : state.phase;
  fxTransitions(state);
  QuizFX.applyTheme(state.theme);
  QuizFX.setTexts(state.texts);
  QuizFX.setBrand(state.brand);
  lastTv = state;
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = QuizFX.t(e.dataset.t); });
  $("tv-logo").classList.toggle("hidden", state.phase === "LOBBY"); // in de lobby staat het logo al groot in beeld
  // Achtergrondmuziek vóór de start en in de pauze, alleen als de quizgeluiden via de tv gaan
  const mu = state.ambience || {};
  QuizFX.setBackgroundMusic(mu.background, (state.soundOut || "tv") === "tv" && mu.on && (state.phase === "LOBBY" || (state.phase === "PLAY" && state.paused)));
  // "Druk één keer op OK" alleen vóór de start (daarna waarschuwt de bediening als de tv nog geen geluid heeft)
  $("audio-banner").classList.toggle("hidden", audioUnlocked || state.phase !== "LOBBY");
  if (!step || step.kind !== "info") infoShown = null;

  // Tijdens de pauze geen ronde, vraagnummer of punten bovenin (die horen bij de stap waarop gepauzeerd is)
  const onPause = state.phase === "PLAY" && state.paused;
  $("tv-round").textContent = state.header.round || QuizFX.brandName();
  $("tv-round").classList.toggle("hidden", onPause || state.phase === "LOBBY"); // welkom/aanmelden: naam en logo staan al groot in beeld
  maybeCurtain(state);
  const prog = onPause ? null : state.header.progress;
  $("tv-prog").classList.toggle("hidden", !prog);
  if (prog) $("tv-prog").textContent = prog.label ? prog.label : `Vraag ${prog.n} van ${prog.total}`;
  renderJokerPill(onPause ? [] : state.header.jokers || []);
  fitTop(); // past alles in de bovenste regel? anders kleiner

  // Aftelklok bovenin en (bij tekenen en 30 seconds) groot in beeld
  QuizFX.countdown("tv", step && step.timer ? step.timer : null, (info) => {
    $("tv-timerbar").classList.toggle("hidden", !info);
    const big = ["th-bigtimer", "draw-bigtimer"].some((id) => { const e = document.getElementById(id); return e && e.offsetParent !== null; });
    $("tv-timer").classList.toggle("hidden", !info || big); // staat het grote getal in beeld, dan geen tweede klokje
    curTimer = info;
    document.body.classList.toggle("hurry", !!(info && info.running && info.secs <= 5 && info.secs > 0));
    if (!info) { barAnim = null; return; }
    timerRing(info);
    setTimerBar(info);
    const low = info.secs <= 5 && info.running;
    $("tv-timerbar").classList.toggle("low", low);
    $("tv-timerbar").classList.toggle("half", !low && info.fraction <= 0.5);
    $("tv-timer").classList.toggle("low", low);
    $("tv-timer").classList.toggle("half", !low && info.fraction <= 0.5);
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
  // Pauzetimer: als hij afloopt een belletje (alleen als de quizgeluiden via de tv gaan)
  QuizFX.setPauseTimer(state.pauseTimer, () => { if ((lastTv && lastTv.soundOut || "tv") === "tv") QuizFX.chime(); });
  if (state.phase === "PLAY" && state.paused) { showView("v-pause"); renderDilemma(state.dilemma); startPauseShow(state.teamStyle || {}, state.pausePhotos || []); return; }
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
    // Met een logo staat het logo bovenaan in plaats van de emoji
    const logo = QuizFX.brandLogo();
    $("welcome-emoji").classList.toggle("hidden", !!logo);
    $("welcome-logo").classList.toggle("hidden", !logo);
    if (logo && $("welcome-logo").getAttribute("src") !== logo) { $("welcome-logo").src = logo; $("welcome-logo").alt = QuizFX.brandName(); }
    const sub = state.brand && state.brand.subtitle;
    $("welcome-sub").textContent = sub || "";
    $("welcome-sub").classList.toggle("hidden", !sub);
    $("welcome-title").textContent = state.welcome.title;
    $("welcome-text").textContent = state.welcome.text;
    resetReveal();
    return;
  }
  if (state.phase === "LOBBY") {
    showView("v-lobby");
    renderLobbyTeams(state.teamList);
    renderHallOfFame(state.hallOfFame);
    $("lobby-head").textContent = QuizFX.t("lobby.teams") + (state.maxTeams ? ` (${state.teamList.length} van ${state.maxTeams})` : "");
    renderLobbySignup(state.signup); // persoonlijk aanmelden: eigen kop en het overzicht per familie
    $("lobby-empty").textContent = state.signup ? QuizFX.t("aanmeld.tv.leeg") : QuizFX.t("lobby.leeg");
    $("lobby-empty").classList.toggle("hidden", state.teamList.length > 0 || !!(state.signup && state.signup.total));
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
  img.onload = () => { $("welcome-wifi").classList.remove("hidden"); $("welcome-row").classList.add("has-wifi"); scheduleFit(); };
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
