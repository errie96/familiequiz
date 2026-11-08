// Telefoon van de speler (index.html): aanmelden, alle soorten vragen, foto's en instellingen.
// Gewoon script (geen module); wordt na shared.js geladen, zie index.html.
const socket = io();
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

let deviceId = localStorage.getItem("quiz_device_id") || null;
let me = null;
let lastState = null;
let currentView = null;

const SCREENS = ["join-screen", "game-screen", "pause-screen", "standings-screen", "look-screen"];
function showScreen(id) { SCREENS.forEach((s) => $(s).classList.toggle("hidden", s !== id)); }

// ---------------- Instellingen van deze telefoon ----------------
const PREF_KEY = "fq_prefs";
const prefs = Object.assign({ size: 0, contrast: false, vibrate: true }, (() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { return {}; } })());
prefs.awake = true; // scherm altijd aan houden tijdens de quiz (geen instelling meer)
function applyPrefs() {
  document.body.classList.toggle("size-1", prefs.size === 1);
  document.body.classList.toggle("size-2", prefs.size === 2);
  document.body.classList.toggle("contrast", !!prefs.contrast);
  $("set-size").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === prefs.size));
  $("set-contrast").checked = !!prefs.contrast;
  $("set-vibrate").checked = !!prefs.vibrate;
}
function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* privémodus */ } applyPrefs(); }
$("set-size").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { prefs.size = Number(b.dataset.v); savePrefs(); }));
$("set-contrast").addEventListener("change", () => { prefs.contrast = $("set-contrast").checked; savePrefs(); });
$("set-vibrate").addEventListener("change", () => { prefs.vibrate = $("set-vibrate").checked; savePrefs(); if (prefs.vibrate) buzz(60); });
// Het instellingenmenu telt niet als spieken: de speler blijft in de app
$("settings-btn").addEventListener("click", () => { renderSettingsInfo(); $("settings-panel").classList.remove("hidden"); });
$("settings-close").addEventListener("click", () => $("settings-panel").classList.add("hidden"));
$("settings-panel").addEventListener("click", (e) => { if (e.target === $("settings-panel")) $("settings-panel").classList.add("hidden"); });
function renderSettingsInfo() {
  const inTeam = typeof me !== "undefined" && me;
  // Naam wijzigen kan alleen vóór de start van de quiz
  const canRename = inTeam && (!latestState || latestState.phase === "LOBBY");
  $("set-me").classList.toggle("hidden", !canRename);
  if (canRename && document.activeElement !== $("set-name")) $("set-name").value = me.label || "";
}
$("set-name-save").addEventListener("click", () => {
  socket.emit("rename_self", { name: $("set-name").value }, (res) => { $("set-name-msg").textContent = res && res.ok ? "✅ Naam aangepast." : (res && res.message) || "Dat lukte niet."; });
});
applyPrefs();

// ---------------- Wake Lock ----------------
// Via QuizFX: Wake Lock waar het kan (https), anders de video-reserve. Belangrijk bij lokaal spelen op
// http://192.168..., want daar bestaat Wake Lock niet en zou een iPhone na 30 seconden op slot gaan.
function requestWakeLock() {
  if (prefs.awake) QuizFX.wantAwake();
  else QuizFX.releaseAwake();
}

// ---------------- Spiekdetectie ----------------
// Actief bij vragen. De melding bij de quizmaster en op de tv blijft staan tot deze telefoon weer in beeld is.
let cheatActive = false;
let lastNotifyTime = 0;
function notifyLeftApp(reason) {
  if (!deviceId || !cheatActive) return;
  const now = Date.now();
  if (now - lastNotifyTime < 1500) return;
  lastNotifyTime = now;
  socket.emit("player_blurred", { reason, t: now });
}
function notifyBack() {
  if (!deviceId) return;
  socket.emit("player_back", { t: Date.now() });
}
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) notifyLeftApp("locked");
  else { notifyBack(); requestWakeLock(); }
});
window.addEventListener("pagehide", () => notifyLeftApp("app_switch"));
window.addEventListener("blur", () => notifyLeftApp("app_switch"));
window.addEventListener("focus", notifyBack);

// ---------------- Identiteit ----------------
function saveIdentity(id) { deviceId = id; localStorage.setItem("quiz_device_id", id); }
function clearIdentity() {
  localStorage.removeItem("quiz_device_id");
  deviceId = null; me = null; currentView = null; mounted = { key: null, update: null };
  QuizFX.countdown("phone", null, () => {});
}
// Verbinding kwijt? Rode balk en knoppen uit, zodat niemand denkt dat een antwoord is ingediend terwijl het niet aankomt
// ---------------- Verbinding: duidelijke melding en netjes terugkeren ----------------
let offlineSince = 0, offlineTick = null, wasOffline = false;
function showToast(text, ms = 4000, color = "#0ea5e9") {
  const t = $("toast");
  t.textContent = text; t.style.background = color;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
function setOffline(off) {
  document.body.classList.toggle("offline", off);
  $("offline-bar").classList.toggle("hidden", !off);
  if (off) {
    if (!offlineSince) offlineSince = Date.now();
    wasOffline = true;
    clearInterval(offlineTick);
    const upd = () => {
      const sec = Math.round((Date.now() - offlineSince) / 1000);
      $("offline-bar").textContent = sec < 15
        ? "📡 Verbinding kwijt, opnieuw verbinden…"
        : `📡 Al ${sec} seconden geen verbinding. Controleer je wifi. ${pending.length ? "Je antwoord is bewaard en wordt verstuurd zodra je weer verbonden bent." : "Je blijft in je team; de app gaat vanzelf verder."}`;
    };
    upd(); offlineTick = setInterval(upd, 1000);
  } else { clearInterval(offlineTick); offlineSince = 0; }
}
socket.on("disconnect", () => setOffline(true));
socket.on("connect_error", () => setOffline(true));
socket.on("connect", () => {
  setOffline(false);
  if (deviceId) { socket.emit("hello", { deviceId }); requestWakeLock(); }
  else showJoin();
});
socket.on("need_join", (data) => {
  const known = !!deviceId;
  clearIdentity(); clearPending();
  showJoin(known && data && data.reason === "unknown" ? "Je telefoon hoort niet meer bij een team (de quiz is opnieuw gestart of je team is verwijderd). Meld je hieronder opnieuw aan." : undefined);
});
socket.on("session", (data) => {
  saveIdentity(data.deviceId);
  if (!document.hidden) notifyBack();
  if (wasOffline) { wasOffline = false; showToast("✅ Weer verbonden, je zit nog in je team.", 3000, "#16a34a"); }
  resumeOnNextState = true; // na de eerstvolgende stand: onafgemaakte acties alsnog versturen
});

// ---------------- Acties die niet verloren mogen gaan ----------------
// Een antwoord wordt eerst op de telefoon bewaard. Komt er (door een wegvallende verbinding) geen bevestiging,
// dan wordt het na het herverbinden automatisch opnieuw verstuurd, zolang dezelfde vraag nog openstaat.
const PENDING_KEY = "fq_pending";
const RESUMABLE = new Set(["submit_answer", "submit_text", "submit_price", "place_card", "joker_choose", "final_wager", "draw_guess", "teamphoto_skip"]);
let pending = (() => { try { return (JSON.parse(localStorage.getItem(PENDING_KEY)) || []).filter((p) => Date.now() - p.at < 10 * 60e3); } catch (e) { return []; } })();
let resumeOnNextState = false;
const savePending = () => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (e) { /* privémodus */ } updatePendingFlag(); };
function clearPending() { pending = []; savePending(); }
setTimeout(() => updatePendingFlag(), 0);
function updatePendingFlag() { /* bewust geen zichtbare status: antwoorden worden stil opnieuw verstuurd */ }
const savedAt = {}; // vraag -> tijd van bevestiging door de server
function act(event, data, cb) {
  if (!RESUMABLE.has(event)) return socket.emit(event, data, cb);
  const item = { id: Math.random().toString(36).slice(2), event, data: data || null, viewId: latestState && latestState.view ? latestState.view.id : null, at: Date.now() };
  pending = pending.filter((p) => !(p.event === event && p.viewId === item.viewId)); // nieuwste antwoord telt
  pending.push(item); savePending();
  sendPending(item, cb);
}
function sendPending(item, cb) {
  if (!socket.connected) return; // blijft bewaard tot we weer verbonden zijn
  socket.timeout(7000).emit(item.event, item.data, (err, res) => {
    if (err) return; // geen bevestiging: blijft bewaard en gaat bij herverbinden opnieuw
    pending = pending.filter((p) => p.id !== item.id); savePending();
    if (res && res.ok && item.viewId) savedAt[item.viewId] = new Date();
    if (cb) cb(res);
  });
}
function resumePending(state) {
  const viewId = state.view ? state.view.id : null;
  const keep = pending.filter((p) => p.viewId && p.viewId === viewId); // alleen als dezelfde vraag nog openstaat
  const dropped = pending.length - keep.length;
  pending = keep; savePending();
  keep.forEach((p) => sendPending(p, () => {}));
  if (dropped) showToast("Je vorige antwoord kwam te laat: die vraag was al gesloten.", 5000, "#b45309");
}
socket.on("kicked", () => { clearIdentity(); showJoin("Je team is verwijderd door de quizmaster."); });
socket.on("quiz_reset", () => { clearIdentity(); showJoin(); });

// ---------------- Team maken / aansluiten ----------------
let pollHandle = null;
let teamsFull = false;
function showJoinError(message) {
  $("join-error").textContent = message || "";
  $("join-error").classList.toggle("hidden", !message);
}
function showJoin(message) {
  showScreen("join-screen");
  updateSteps();
  selectTab(!$("join-existing").classList.contains("hidden") ? "join" : "new");
  showJoinError(message);
}
const myName = () => $("my-name").value.trim();
function updateSteps() { $("join-steps").classList.toggle("hidden", !myName()); }
$("my-name").addEventListener("input", () => {
  updateSteps();
  showJoinError("");
  if (myName()) refreshTeamsAlways();
  if (myName() && !$("join-existing").classList.contains("hidden")) {
    refreshTeams();
    if (!pollHandle) pollHandle = setInterval(refreshTeams, 3000);
  }
});
function selectTab(which) {
  const isNew = which === "new";
  $("join-new").classList.toggle("hidden", !isNew);
  $("join-existing").classList.toggle("hidden", isNew);
  $("tab-new").className = isNew ? "btn-primary" : "btn-option";
  $("tab-join").className = isNew ? "btn-option" : "btn-primary";
  $("tab-join").style.textAlign = "center";
  showJoinError("");
  clearInterval(pollHandle);
  pollHandle = null;
  if (!isNew && myName()) { refreshTeams(); pollHandle = setInterval(refreshTeams, 3000); }
}
$("tab-new").addEventListener("click", () => selectTab("new"));
$("tab-join").addEventListener("click", () => selectTab("join"));
// Ook vanuit het tabblad "Nieuw team" kijken of het maximum aantal teams al bereikt is
// Teamkleur kiezen: rondjes in de kleuren die nog vrij zijn
let chosenColor = null;
function renderColors(colors) {
  const box = $("color-pick");
  if (!colors || !colors.length) return box.replaceChildren();
  if (!chosenColor || !colors.some((x) => x.c === chosenColor && x.free)) chosenColor = (colors.find((x) => x.free) || {}).c || null;
  box.replaceChildren(...colors.map((x) => {
    const b = el("button");
    b.type = "button"; b.title = x.free ? "Kies deze kleur" : "Al gekozen door een ander team";
    b.style.cssText = `width:44px; height:44px; border-radius:50%; padding:0; margin:0; background:${x.c}; border:${x.c === chosenColor ? "4px solid #fff" : "4px solid transparent"}; box-shadow:${x.c === chosenColor ? "0 0 0 3px " + x.c : "none"}; opacity:${x.free ? 1 : 0.2};`;
    b.disabled = !x.free;
    b.onclick = () => { chosenColor = x.c; renderColors(colors); };
    return b;
  }));
}
function refreshTeamsAlways() {
  socket.emit("list_teams", null, (res) => {
    renderColors(res && res.colors);
    teamsFull = !!(res && res.full);
    $("tab-new").disabled = teamsFull;
    $("tab-new").textContent = teamsFull ? "Nieuw team (vol)" : "Nieuw team";
    $("tab-new").textContent = res && res.started ? "Nieuw team (quiz is begonnen)" : $("tab-new").textContent;
    if (teamsFull) { selectTab("join"); showJoinError(res && res.started ? "De quiz is al begonnen: sluit aan bij een bestaand team." : `Er doen al ${res.maxTeams} teams mee: sluit aan bij een bestaand team.`); }
  });
}
function refreshTeams() {
  if ($("join-screen").classList.contains("hidden") || !myName()) return;
  socket.emit("list_teams", null, (res) => {
    const list = $("team-list");
    list.replaceChildren();
    const teams = (res && res.teams) || [];
    teamsFull = !!(res && res.full);
    $("tab-new").disabled = teamsFull;
    $("tab-new").textContent = teamsFull ? "Nieuw team (vol)" : "Nieuw team";
    if (teamsFull && !$("join-new").classList.contains("hidden")) selectTab("join");
    $("team-list-empty").classList.toggle("hidden", teams.length > 0);
    teams.forEach((t) => {
      const btn = el("button", "btn-option", `${t.name}  (${t.members} ${t.members === 1 ? "telefoon" : "telefoons"})`);
      btn.onclick = () => joinTeam(t.teamId);
      list.appendChild(btn);
    });
  });
}
function onJoined(res) {
  if (!res || !res.ok) return showJoinError((res && res.message) || "Dat lukte niet. Probeer het opnieuw.");
  clearInterval(pollHandle);
  pollHandle = null;
  saveIdentity(res.deviceId);
  showScreen("game-screen");
  requestWakeLock();
}
function createTeam() {
  const teamName = $("team-name").value.trim();
  if (!teamName) return showJoinError("Vul een teamnaam in.");
  if (!myName()) return showJoinError("Vul eerst je eigen naam in.");
  socket.emit("create_team", { teamName, label: myName(), color: chosenColor || undefined }, onJoined);
}
function joinTeam(teamId) {
  if (!myName()) return showJoinError("Vul eerst je eigen naam in.");
  socket.emit("join_team", { teamId, label: myName() }, onJoined);
}
$("btn-create").addEventListener("click", createTeam);
$("team-name").addEventListener("keydown", (e) => { if (e.key === "Enter") createTeam(); });

// ---------------- Foto maken: alleen de camera (geen bestaande foto uit de galerij) ----------------
// capture="user" opent op iPhone en Android meteen de voorcamera; omdraaien kan in de camera zelf.
function photoPicker(onFile, labels) {
  const camInput = el("input"); camInput.type = "file"; camInput.accept = "image/*"; camInput.className = "hidden";
  camInput.setAttribute("capture", "user");
  camInput.onchange = () => { const f = camInput.files && camInput.files[0]; camInput.value = ""; if (f) onFile(f); };
  const cam = el("button", "btn-primary", (labels && labels.camera) || "📸 Maak een foto");
  cam.style.background = "#22c55e"; cam.style.margin = "0";
  cam.onclick = () => camInput.click();
  const row = el("div", "row2"); row.style.margin = "8px 0";
  row.append(cam, camInput);
  return { row, cam, setBusy(b) { cam.disabled = b; } };
}

// ---------------- Teamkaart ----------------
function renderTeamCard() {
  $("team-title").textContent = me.teamName;
  const slot = $("team-photo-slot");
  const shown = slot.firstChild;
  if (!shown || shown.dataset.src !== String(me.photo)) {
    const av = QuizFX.avatar(me.teamName, me.photo, "56px");
    av.dataset.src = String(me.photo);
    slot.replaceChildren(av);
  }
  $("team-photo-actions").classList.add("hidden"); // teamfoto alleen op het teamfotomoment (na de testvragen)
  panelPicker.cam.textContent = me.photo ? "📸 Nieuwe teamfoto" : "📸 Teamfoto maken";
  $("btn-team-photo-remove").classList.toggle("hidden", !me.photo);
  const pending = !!me.proposal;
  $("role-text").textContent = me.role === "base"
    ? "Dit is jullie basistelefoon: hiermee dien je de antwoorden in."
    : `De basistelefoon (${me.baseLabel}) dient de antwoorden in.`;
  // Akkoord met de basistelefoon: iedereen in het team moet akkoord zijn voordat de quiz begint
  let bc = $("base-confirm");
  if (!bc) { bc = el("div"); bc.id = "base-confirm"; $("role-text").after(bc); }
  bc.replaceChildren();
  const ok = me.baseOk || { approved: true, confirmed: true, waiting: [] };
  if (!ok.approved) {
    const btn = el("button", "btn-primary", `✔ Akkoord: ${me.role === "base" ? "deze telefoon" : me.baseLabel} is onze basis`);
    btn.style.margin = "8px 0";
    btn.onclick = () => socket.emit("approve_base", null, () => {});
    bc.append(btn);
  } else if (!ok.confirmed && ok.waiting.length) {
    bc.append(el("p", "note", `⏳ Wachten op akkoord van: ${ok.waiting.join(", ")}`));
  } else if (ok.confirmed && me.members.length > 1) {
    bc.append(el("p", "note", "✅ Het hele team is akkoord met de basistelefoon."));
  }
  if (me.canChangeBase === false) bc.append(el("p", "note", "Wisselen van basistelefoon kan weer vóór de volgende ronde."));
  const list = $("member-list");
  list.replaceChildren();
  me.members.forEach((m) => {
    const li = el("li");
    li.style.alignItems = "center";
    li.append(el("span", "", (m.memberId === me.memberId ? `${m.label} (jij)` : m.label) + (m.role === "base" ? " ⭐ basis" : "")));
    const right = el("span");
    right.style.cssText = "display:flex; gap:8px; align-items:center;";
    if (m.role !== "base" && m.connected && !pending && me.canChangeBase !== false) {
      const btn = el("button", "btn-option", m.memberId === me.memberId ? "Maak mij de basis" : "Stel voor als basis");
      btn.style.cssText = "width:auto; margin:0; padding:6px 10px; font-size:13px;";
      btn.onclick = () => proposeBase(m.memberId);
      right.appendChild(btn);
    }
    const status = el("span", "", m.connected ? "●" : "○ offline");
    status.style.color = m.connected ? "#4ade80" : "#94a3b8";
    right.appendChild(status);
    li.append(right);
    list.appendChild(li);
  });
  $("member-actions").classList.toggle("hidden", me.role === "base");
  renderProposal();
}
function renderProposal() {
  const p = me && me.proposal;
  const banner = $("base-banner");
  banner.classList.toggle("hidden", !p || !$("join-screen").classList.contains("hidden"));
  if (!p) return;
  const count = `${p.approved} van ${p.needed} akkoord`;
  let text;
  if (p.youAreProposer) text = `Jij stelde ${p.youAreCandidate ? "jezelf" : p.candidateLabel} voor als basistelefoon. Wachten op de rest van het team (${count}).`;
  else if (p.youApproved) text = `Je bent akkoord. Wachten op de rest van het team (${count}).`;
  else if (p.youAreCandidate) text = `${p.proposerLabel} stelt jou voor als basistelefoon van het team. Akkoord? (${count})`;
  else text = `${p.proposerLabel} stelt ${p.candidateLabel} voor als basistelefoon van het team. Akkoord? (${count})`;
  $("base-banner-text").textContent = text;
  $("btn-base-yes").classList.toggle("hidden", p.youApproved);
  $("btn-base-no").textContent = p.youAreProposer ? "Voorstel intrekken" : "Niet akkoord";
}
function proposeBase(memberId) {
  socket.emit("propose_base", { memberId }, (res) => {
    if (res && res.ok) return $("lobby-error").classList.add("hidden");
    $("lobby-error").textContent = (res && res.message) || "Dat lukte niet.";
    $("lobby-error").classList.remove("hidden");
  });
}
// Teamfoto: alleen de basistelefoon; vierkant bijgesneden zodat hij mooi rond op de tv staat
function photoStatus(text) { $("team-photo-status").textContent = text || ""; $("team-photo-status").classList.toggle("hidden", !text); }
// Foto verkleinen en naar de server sturen; status() krijgt de tekst voor de gebruiker
async function uploadTeamPhoto(file, picker, status) {
  picker.setBusy(true);
  status("Foto voorbereiden…");
  try {
    const dataUrl = await QuizFX.compressPhoto(file, 640, true);
    socket.emit("set_team_photo", { dataUrl }, (res) => {
      picker.setBusy(false);
      status(res && res.ok ? "✅ Teamfoto opgeslagen, hij staat nu op het grote scherm." : (res && res.message) || "Opslaan is niet gelukt.");
      if (res && res.ok) QuizFX.uploadOriginal(file, res.original); // ware grootte voor het album, op de achtergrond
    });
  } catch (error) { picker.setBusy(false); status(error.message || "Foto kon niet worden verwerkt."); }
}
const panelPicker = photoPicker((file) => uploadTeamPhoto(file, panelPicker, photoStatus));
// Pauzefoto's: iedereen (niet alleen de basistelefoon) mag tijdens de pauze foto's maken
const pausePicker = photoPicker(async (file) => {
  const msg = (t) => { $("pause-photo-msg").textContent = t; };
  pausePicker.setBusy(true); msg("Foto voorbereiden…");
  try {
    const dataUrl = await QuizFX.compressPhoto(file, 1280, false, 600000);
    socket.emit("pause_photo", { dataUrl }, (res) => {
      pausePicker.setBusy(false);
      msg(res && res.ok ? "✅ Staat op het grote scherm! Nog een?" : (res && res.message) || "Dat lukte niet.");
      if (res && res.ok) QuizFX.uploadOriginal(file, res.original); // ware grootte voor het album, op de achtergrond
    });
  } catch (e) { pausePicker.setBusy(false); msg(e.message || "Foto kon niet worden verwerkt."); }
}, { camera: "📸 Pauzefoto maken" });
$("pause-photo-picker").append(pausePicker.row);
$("team-photo-picker").append(panelPicker.row);
$("btn-team-photo-remove").addEventListener("click", () => {
  if (!confirm("Teamfoto verwijderen?")) return;
  socket.emit("set_team_photo", { dataUrl: null }, (res) => photoStatus(res && res.ok ? "Teamfoto verwijderd." : (res && res.message) || "Dat lukte niet."));
});
$("btn-base-yes").addEventListener("click", () => socket.emit("respond_base", { approve: true }, () => {}));
$("btn-base-no").addEventListener("click", () => socket.emit("respond_base", { approve: false }, () => {}));
socket.on("team_notice", (data) => showToast(data.text, 6000));
$("btn-leave").addEventListener("click", () => {
  if (!confirm("Weet je zeker dat je dit team wilt verlaten?")) return;
  socket.emit("leave_team", null, (res) => {
    if (res && res.ok) { clearIdentity(); showJoin(); }
    else { $("lobby-error").textContent = (res && res.message) || "Dat lukte niet."; $("lobby-error").classList.remove("hidden"); }
  });
});

// =====================================================================
// Weergaves: elk type scherm (view.type) heeft een builder. De builder
// tekent het scherm één keer en geeft een update-functie terug voor de
// onderdelen die live veranderen (zodat typen niet onderbroken wordt).
// =====================================================================
const ERR = {
  not_open: "Dit kan nu niet meer.", not_base: "Alleen de basistelefoon kan indienen.",
  wrong_question: "De vraag is net gewisseld.", invalid: "Dat antwoord is niet geldig."
};
const noop = () => {};
const bigEl = (txt) => el("div", "bigtxt", txt);
function submitBtn(label, onclick) {
  const b = el("button", "btn-primary", label);
  b.style.background = "#22c55e";
  b.onclick = onclick;
  return b;
}

const BUILD = {
  lobby(box) {
    box.append(el("h2", "", QuizFX.t("tel.wachten.titel")), el("p", "note", QuizFX.t("tel.wachten.tekst")));
    // Kort: waar de instellingen zitten
    box.append(el("p", "note", "⚙️ Rechtsboven: tekst groter, contrast, trillen en je naam."));
  },
  info(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", v.emoji || ""); e.style.fontSize = "54px";
    d.append(e, el("h2", "", v.title), el("p", "note", v.text || ""));
    if (v.scoring) { const sc = el("p", "note", "🎯 " + v.scoring); sc.style.cssText = "background:#1e293b; border-radius:10px; padding:10px; margin-top:10px;"; d.append(sc); }
    box.append(d);
  },
  roundresult(box) {
    box.append(bigEl("📊"), el("h2", "", "Dit was de ronde!"), el("p", "note", "Kijk naar het grote scherm."));
  },
  end(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", "🏁 🏆"); e.style.fontSize = "54px";
    d.append(e, el("h2", "", QuizFX.t("tel.einde.titel")), el("p", "note", QuizFX.t("tel.einde.tekst")));
    box.append(d);
    // Uitslag als plaatje delen (pas na de ontknoping, anders zou het de spanning verklappen).
    // Het plaatje wordt vooraf gemaakt: de iPhone staat delen alleen toe meteen na de tik, niet na lang rekenen.
    const share = el("button", "btn-primary", "📤 Deel de uitslag");
    const msg = el("p", "note");
    const rows = v && v.share;
    if (!rows) { share.disabled = true; msg.textContent = "Na de ontknoping kun je hier de uitslag delen."; box.append(share, msg); return; }
    const fname = `familiequiz-uitslag-${new Date().toISOString().slice(0, 10)}.png`;
    const key = JSON.stringify(rows);
    if (shareCache.key !== key) {
      shareCache.key = key; shareCache.blob = null;
      const date = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
      shareCache.ready = QuizFX.resultImage({ title: "Familiequiz", subtitle: date, rows }).then((b) => { if (shareCache.key === key) shareCache.blob = b; return b; }).catch(() => null);
    }
    share.onclick = async () => {
      const blob = shareCache.blob || await shareCache.ready;
      if (!blob) { msg.textContent = "Het plaatje maken lukte niet."; return; }
      const file = new File([blob], fname, { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Familiequiz", text: "De uitslag van de familiequiz! 🏆" });
          msg.textContent = "✔ Gedeeld!";
          return;
        }
      } catch (e) { if (e && e.name === "AbortError") return; }
      // Delen kan niet (bijv. via http op het thuisnetwerk): plaatje groot tonen, lang indrukken om te bewaren of te delen
      showShareImage(blob);
      msg.textContent = "Houd het plaatje ingedrukt om het te bewaren of te delen.";
    };
    box.append(share, msg);
  },

  // ----- Meerkeuze, foto blur en logo's -----
  mc(box, v) {
    if (v.category) box.append(el("span", "badge", v.category));
    const h = el("h3", "", v.question || (v.variant === "blur" ? "Wat zien we op het grote scherm?" : "Welk logo is dit?"));
    h.style.margin = "12px 0";
    box.append(h);
    const media = el("div");
    box.append(media);
    if (v.media) QuizFX.renderMedia(media, v.media);
    if (v.variant !== "text") box.append(el("p", "note", "👀 Kijk naar het grote scherm"));
    if (v.status === "reading") { // eerst de vraag lezen; de antwoorden komen zo
      return; // eerst alleen de vraag
    }
    const opts = el("div");
    box.append(opts);
    const canAnswer = v.isBase && v.status === "open" && !v.answered;
    let selected = v.answered ? v.given : null;
    const buttons = v.options.map((opt, i) => {
      const b = el("button", "btn-option", `${QuizFX.letter(i)}: ${opt}`);
      b.disabled = !canAnswer;
      b.onclick = () => { selected = i; paint(); };
      opts.append(b);
      return b;
    });
    const send = submitBtn("Antwoord indienen 📤", () => {
      if (selected === null) return;
      send.disabled = true;
      act("submit_answer", { stepId: v.id, value: selected }, (res) => {
        send.disabled = false;
        if (!res || !res.ok) { err.textContent = ERR[res && res.reason] || "Indienen is niet gelukt."; err.classList.remove("hidden"); }
      });
    });
    send.style.marginTop = "16px";
    const err = el("p", "bad hidden"); err.style.textAlign = "center";
    function paint() {
      buttons.forEach((b, i) => { b.style.background = i === selected ? "#2563eb" : ""; });
      send.classList.toggle("hidden", !canAnswer || selected === null);
    }
    paint();
    box.append(send, err);
    if (v.answered) box.append(el("p", "note good", "✅ Ingediend! Wachten tot iedereen klaar is..."));
    else if (v.status === "showing") { /* antwoorden in beeld, zo meteen kiezen */ }
    else if (v.status !== "open") box.append(el("p", "note", "De vraag is gesloten."));
    else if (!v.isBase) box.append(el("p", "note", "Overleg met je team. De basistelefoon dient het antwoord in."));
  },

  // ----- Geheugen: samen opschrijven -----
  memory(box, v) {
    box.append(el("h3", "", v.prompt));
    if (v.status === "idle") { box.append(el("p", "note", "Pak jullie telefoon klaar… de quizmaster start zo.")); return noop; }
    const info = el("p", "note");
    const list = el("div");
    if (v.test) box.append(el("span", "badge", "Oefenronde"));
    if (v.status === "writing" && !v.isBase) {
      box.append(el("p", "note", "Overleg met je team: de basistelefoon schrijft de antwoorden op."), info, list);
    } else if (v.status === "writing") {
      const input = el("input"); input.type = "text"; input.placeholder = "Typ iets en tik op Toevoegen"; input.maxLength = 60; input.autocomplete = "off";
      const add = () => {
        const text = input.value.trim();
        if (!text) return;
        socket.emit("memory_add", { text }, (res) => { if (res && res.message) { info.textContent = res.message; } });
        input.value = "";
        input.focus();
      };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
      const btn = el("button", "btn-primary", "➕ Toevoegen");
      btn.onclick = add;
      box.append(input, btn, info, list);
      info.textContent = "Jij schrijft op voor het team. De quizmaster bepaalt wanneer de tijd om is.";
    } else {
      box.append(el("p", "note", "De quizmaster keurt de antwoorden na… kijk naar het grote scherm."), list);
    }
    return (nv) => {
      list.replaceChildren();
      const writing = nv.status === "writing" && nv.isBase;
      [...nv.entries].reverse().forEach((e) => {
        const r = el("div", "entry");
        r.append(el("span", "", e.text));
        if (writing) { const x = el("button", "", "✕"); x.onclick = () => socket.emit("memory_remove", { id: e.id }); r.append(x); }
        list.append(r);
      });
      if (!nv.entries.length) list.append(el("p", "note", "Nog niets opgeschreven."));
      else list.prepend(el("p", "note", `${nv.entries.length} opgeschreven`));
    };
  },

  // ----- Muziek: tijdlijn -----
  song(box, v) {
    if (v.status === "loading") { box.append(bigEl("🔎"), el("p", "note", "Het volgende liedje wordt gezocht… even geduld.")); return noop; }
    box.append(el("h3", "", v.status === "revealed" ? `${v.song.title} · ${v.song.artist}` : "🎵 Luister naar het liedje"));
    if (v.status === "revealed") {
      box.append(bigEl(`${v.song.year}`));
      if (v.result) box.append(el("p", "bigtxt " + (v.result.ok ? "good" : "bad"), v.result.ok ? "✔ Goed! De kaart is toegevoegd aan jullie tijdlijn." : "✘ Helaas, de kaart is niet toegevoegd."));
      // jaartal met speling: exact, of er net naast (zonder punten te noemen: die blijven geheim)
      if (v.result && v.result.diff === 0) box.append(el("p", "bigtxt good", "⭐ Exact jaartal goed!"));
      else if (v.result && v.result.diff !== null && v.result.diff !== undefined && v.result.diff <= 3) box.append(el("p", "bigtxt good", `👍 Bijna! Je zat er ${v.result.diff} jaar naast: dat levert ook nog wat op.`));
      else if (v.result && v.result.exact) box.append(el("p", "bigtxt good", "⭐ Exact jaartal goed!"));
      else box.append(el("p", "note", "Jullie hebben niet geplaatst."));
      // bonus: titel en artiest (zonder punten te noemen)
      if (v.guess && (v.guess.title || v.guess.artist)) {
        const b = v.bonus || {};
        if (v.guess.title) box.append(el("p", "bigtxt " + (b.title ? "good" : "bad"), `🎵 Titel "${v.guess.title}": ${b.title ? "✔ goed!" : "✘ niet goed"}`));
        if (v.guess.artist) box.append(el("p", "bigtxt " + (b.artist ? "good" : "bad"), `🎤 Artiest "${v.guess.artist}": ${b.artist ? "✔ goed!" : "✘ niet goed"}`));
      }
    } else if (v.placed !== null) {
      box.append(el("p", "note good", "✅ Geplaatst! Wachten tot iedereen klaar is..."));
    } else if (v.isBase) {
      box.append(el("p", "note", "Tik op de plek waar het liedje hoort (oud boven, nieuw onder) en bevestig."));
    } else {
      box.append(el("p", "note", "Denk mee! De basistelefoon legt het liedje in de tijdlijn."));
    }
    if (v.test) box.append(el("p", "note good", "Oefenliedje: dit telt niet mee en de kaart komt niet in jullie tijdlijn."));
    else box.append(el("p", "note", `Jullie tijdlijn: ${v.timeline.length} kaarten · wie als eerste ${v.target} heeft, beëindigt de ronde`));
    const canPlace = v.isBase && v.status === "open" && v.placed === null;
    let sel = v.placed;
    const tl = el("div", "tl");
    const slots = [];
    const addSlot = (i) => {
      const s = el("button", "tlslot", canPlace ? "⬇ Hier plaatsen" : "");
      s.onclick = () => { sel = i; paint(); };
      if (!canPlace && !(v.placed === i)) { s.style.display = "none"; }
      if (!canPlace && v.placed === i) s.textContent = "⭐ Hier hebben jullie het liedje gelegd";
      slots.push(s);
      tl.append(s);
    };
    addSlot(0);
    v.timeline.forEach((c, i) => {
      const card = el("div", "tlcard");
      card.append(el("div", "yr", String(c.year)), el("div", "tt", `${c.title} · ${c.artist}`));
      tl.append(card);
      addSlot(i + 1);
    });
    box.append(tl);
    const yi = el("input"); yi.type = "text"; yi.inputMode = "numeric"; yi.maxLength = 4; yi.placeholder = "Exact jaartal (optioneel, bonuspunten)";
    yi.classList.toggle("hidden", !canPlace);
    if (v.yearGuess) yi.value = v.yearGuess;
    if (canPlace) box.append(yi);
    // bonus: titel en artiest raden (de quizmaster keurt goed)
    const ti = el("input"); ti.type = "text"; ti.maxLength = 80; ti.placeholder = "Titel (optioneel, bonus)";
    const ai = el("input"); ai.type = "text"; ai.maxLength = 80; ai.placeholder = "Artiest (optioneel, bonus)";
    if (canPlace && v.askTitleArtist) box.append(ti, ai);
    const send = submitBtn("Kaart plaatsen 📤", () => {
      if (sel === null) return;
      send.disabled = true;
      const year = parseInt(yi.value, 10);
      act("place_card", { stepId: v.id, slot: sel, year: Number.isInteger(year) ? year : undefined, title: ti.value.trim() || undefined, artist: ai.value.trim() || undefined }, (res) => { send.disabled = false; if (!res || !res.ok) alert(ERR[res && res.reason] || "Plaatsen is niet gelukt."); });
    });
    function paint() {
      slots.forEach((s, i) => s.classList.toggle("sel", sel === i));
      send.classList.toggle("hidden", !canPlace || sel === null);
    }
    paint();
    box.append(send);
  },

  // ----- Prijzen -----
  price(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", v.emoji); e.style.fontSize = "54px";
    d.append(e, el("h3", "", v.name + (v.unit ? ` (${v.unit})` : "")));
    box.append(d);
    if (v.test) box.append(el("p", "note good", "Oefenvraag: telt niet mee."));
    const canAnswer = v.isBase && v.status === "open" && !v.answered;
    const mk = (label, val) => {
      box.append(Object.assign(el("label", "lbl"), { textContent: label }));
      const i = el("input"); i.type = "text"; i.inputMode = "decimal"; i.placeholder = "bijv. 2,49"; i.disabled = !canAnswer;
      if (val !== undefined && val !== null) i.value = String(val).replace(".", ",");
      box.append(i);
      return i;
    };
    const nowI = mk("Prijs nu (in euro's)", v.given && v.given.now);
    const agoI = mk(`Prijs ${v.agoYears} jaar geleden (in euro's)`, v.given && v.given.ago);
    const parse = (x) => Number(String(x.value).replace(",", ".").replace(/[^0-9.]/g, ""));
    const err = el("p", "bad hidden"); err.style.textAlign = "center";
    const send = submitBtn("Schatting indienen 📤", () => {
      const now = parse(nowI), ago = parse(agoI);
      if (!(now >= 0) || !(ago >= 0) || nowI.value.trim() === "" || agoI.value.trim() === "") { err.textContent = "Vul beide prijzen in."; err.classList.remove("hidden"); return; }
      send.disabled = true;
      act("submit_price", { stepId: v.id, now, ago }, (res) => {
        send.disabled = false;
        if (!res || !res.ok) { err.textContent = ERR[res && res.reason] || "Indienen is niet gelukt."; err.classList.remove("hidden"); }
      });
    });
    send.classList.toggle("hidden", !canAnswer);
    box.append(send, err);
    if (v.answered) box.append(el("p", "note good", "✅ Ingediend! Wachten tot iedereen klaar is..."));
    else if (v.status !== "open") box.append(el("p", "note", "Kijk naar het grote scherm voor de echte prijzen."));
    else if (!v.isBase) box.append(el("p", "note", "Overleg met je team. De basistelefoon dient de schatting in."));
  },

  // ----- Tekenen -----
  draw(box, v) {
    if (v.status === "ready") {
      box.append(bigEl("✏️"), el("h3", "", `Beurt ${v.turn} van ${v.total}`), el("p", "note", v.role === "drawer" ? "Jij bent de tekenaar! Zodra de quizmaster start, zie je hier je woord." : v.role === "idle" ? "Jullie team heeft deze beurt geen tekenaar." : `${v.drawerLabel} gaat tekenen. ${v.role === "guesser" ? "Jij vult straks het antwoord van het team in." : `${v.answererLabel} vult het antwoord in.`}`));
      return noop;
    }
    if (v.status === "judging" || v.status === "result") {
      box.append(bigEl("⏹"), el("h3", "", v.answerWord ? `Het woord was: ${v.answerWord}` : "Beurt afgelopen"), el("p", "note", v.given ? `Jullie antwoord: ${v.given}` : "Jullie hebben geen antwoord gegeven."), el("p", "note", "De quizmaster keurt de antwoorden. De uitslag zie je aan het einde."));
      return noop;
    }
    if (v.role === "idle") { box.append(el("p", "note", "Jullie team heeft deze beurt geen tekenaar. Kijk mee op het grote scherm.")); return noop; }

    const wrap = el("div", "padwrap");
    const canvas = el("canvas");
    wrap.append(canvas);
    let strokes = [];
    const repaint = () => QuizFX.paintStrokes(canvas, strokes);
    window.addEventListener("resize", repaint);

    if (v.role === "drawer") {
      box.append(el("p", "note", "Teken dit woord (niet praten of letters schrijven!):"), bigEl(v.word), wrap);
      let color = "#111827", width = 5, drawing = null, pending = [], timer = null;
      const flush = () => { clearTimeout(timer); timer = null; if (pending.length) { socket.emit("draw_ops", { ops: pending }); pending = []; } };
      const queue = (op) => { pending.push(op); if (!timer) timer = setTimeout(flush, 60); };
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)]; };
      canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        const p = pos(e);
        drawing = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), c: color, w: width, p: [p] };
        strokes.push(drawing);
        queue({ t: "p", id: drawing.id, c: color, w: width, p: [p] });
        repaint();
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        e.preventDefault();
        const p = pos(e);
        drawing.p.push(p);
        queue({ t: "p", id: drawing.id, c: drawing.c, w: drawing.w, p: [p] });
        repaint();
      });
      const end = () => { drawing = null; flush(); };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);

      const sw = el("div", "swatches");
      ["#111827", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"].forEach((c, i) => {
        const b = el("button", "swatch" + (i === 0 ? " sel" : ""));
        b.style.background = c;
        b.onclick = () => { color = c; sw.querySelectorAll(".swatch").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); };
        sw.append(b);
      });
      const tools = el("div", "row2");
      const thin = el("button", "btn-option", "Dun"); thin.onclick = () => { width = 3; };
      const thick = el("button", "btn-option", "Dik"); thick.onclick = () => { width = 10; };
      const undo = el("button", "btn-option", "↩ Terug"); undo.onclick = () => { strokes.pop(); queue({ t: "u" }); repaint(); };
      const clear = el("button", "btn-option", "🗑 Wis"); clear.onclick = () => { strokes = []; queue({ t: "x" }); repaint(); };
      tools.append(thin, thick, undo, clear);
      tools.querySelectorAll("button").forEach((b) => { b.style.textAlign = "center"; b.style.padding = "10px 4px"; });
      box.append(sw, tools);
      socket.emit("draw_get", null, (res) => { if (!strokes.length) { strokes = (res && res.strokes) || []; repaint(); } });
      requestAnimationFrame(repaint);
      return noop;
    }

    // Meekijken: tekening live; alleen de basistelefoon geeft één antwoord
    box.append(el("p", "note", `${v.drawerLabel} tekent! Wat is het?`), wrap);
    window.__drawHandler = (ops) => {
      ops.forEach((op) => {
        if (op.t === "x") strokes = [];
        else if (op.t === "u") strokes.pop();
        else {
          let st = strokes.find((x) => x.id === op.id);
          if (!st) { st = { id: op.id, c: op.c, w: op.w, p: [] }; strokes.push(st); }
          st.p.push(...op.p);
        }
      });
      repaint();
    };
    socket.emit("draw_get", null, (res) => { strokes = (res && res.strokes) || []; repaint(); });
    requestAnimationFrame(repaint);
    if (v.role === "watcher") { box.append(el("p", "note", `Overleg met je team: ${v.answererLabel} vult het antwoord in.`)); return noop; }
    if (!v.isBase) box.append(el("p", "note good", "De basistelefoon tekent nu, dus jij vult deze keer het antwoord in."));
    if (v.answered) { box.append(el("p", "note good", `✅ Ingediend: ${v.given}`), el("p", "note", "De quizmaster keurt het antwoord goed of fout.")); return noop; }
    const input = el("input"); input.type = "text"; input.placeholder = "Jullie antwoord (één poging!)"; input.maxLength = 40; input.autocomplete = "off";
    const err = el("p", "bad hidden"); err.style.textAlign = "center";
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      if (!confirm(`"${text}" indienen? Jullie hebben maar één poging.`)) return;
      act("draw_guess", { text }, (res) => { if (!res || !res.ok) { err.textContent = ERR[res && res.reason] || "Indienen is niet gelukt."; err.classList.remove("hidden"); } });
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    const btn = submitBtn("Antwoord indienen 📤", send);
    box.append(input, btn, err);
    return noop;
  },

  demo_draw(box, v) {
    box.append(bigEl("✏️"), el("h3", "", "Oefenronde tekenen"), el("p", "note", v.status === "drawing" ? "De quizmaster tekent op het grote scherm. Roep het antwoord!" : "Kijk naar het grote scherm: de quizmaster doet het eerst voor. Straks tekent iemand van jullie team op de eigen telefoon."));
    return noop;
  },
  demo_thirty(box, v) {
    box.append(bigEl("⏱️"), el("h3", "", "Oefenronde 30 Seconds"), el("p", "note", v.status === "running" ? "De quizmaster legt uit. Roep de antwoorden!" : "Kijk naar het grote scherm: de quizmaster doet het eerst voor."));
    return noop;
  },

  // ----- Logo's: open antwoord -----
  logo(box, v) {
    if (v.test) box.append(el("span", "badge", "Oefenvraag"));
    if (v.variant === "blur") box.append(el("h3", "", "📸 " + (v.question || "Wat zie je op de foto?")), el("p", "note", "👀 Kijk naar het grote scherm. De foto wordt steeds scherper: hoe eerder goed, hoe meer punten. Eén antwoord per team!"));
    else box.append(el("h3", "", "🏷️ Welk logo is dit?"), el("p", "note", "👀 Kijk naar het grote scherm. Eén antwoord per team; hoe sneller goed, hoe meer punten."));
    if (v.answered) { box.append(el("p", "bigtxt good", `✅ ${v.given}`), el("p", "note", "Ingediend! De quizmaster keurt de antwoorden achteraf.")); return noop; }
    if (v.status !== "open") { box.append(el("p", "note", "De vraag is gesloten.")); return noop; }
    if (!v.isBase) { box.append(el("p", "note", "Overleg met je team. De basistelefoon dient het antwoord in.")); return noop; }
    const input = el("input"); input.type = "text"; input.placeholder = v.variant === "blur" ? "Wat is het?" : "Merknaam"; input.maxLength = 40; input.autocomplete = "off";
    const err = el("p", "bad hidden"); err.style.textAlign = "center";
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      if (!confirm(`"${text}" indienen? Jullie hebben maar één poging.`)) return;
      act("submit_text", { stepId: v.id, text }, (res) => { if (!res || !res.ok) { err.textContent = ERR[res && res.reason] || "Indienen is niet gelukt."; err.classList.remove("hidden"); } });
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    box.append(input, submitBtn("Antwoord indienen 📤", send), err);
    return noop;
  },

  // ----- 30 Seconds -----
  thirty(box, v) {
    box.append(el("h3", "", `⏱️ 30 Seconds · beurt ${v.turn} van ${v.total}`));
    if (v.role === "explainer") {
      if (v.words) {
        box.append(el("p", "note", "Leg uit aan je team, zonder het woord zelf te zeggen!"));
        v.words.forEach((w) => box.append(el("div", "wordcard", w)));
        if (v.status === "judging") box.append(el("p", "note", "Tijd om! De quizmaster keurt de antwoorden goed."));
      } else if (v.status === "ready") box.append(el("p", "note", "Jij bent aan de beurt! Zodra de quizmaster start, zie je vijf woorden."));
      else box.append(el("p", "note", "Klaar! Kijk naar het grote scherm."));
    } else if (v.role === "teammate") {
      box.append(bigEl("🗣️"), el("p", "note", `${v.explainer} legt uit aan jullie team. Roep de antwoorden!`));
    } else {
      box.append(bigEl("🤫"), el("p", "note", v.team ? `Team ${v.team} is aan de beurt (${v.explainer}). Niet meeroepen!` : "Wachten…"));
    }
    return noop;
  },

  // ----- Teamfoto (direct na het aanmelden) -----
  teamphoto(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", "📸"); e.style.fontSize = "54px";
    d.append(e, el("h2", "", QuizFX.t("teamfoto.titel")));
    box.append(d, el("p", "note", QuizFX.t("teamfoto.tekst.tel")));
    const preview = el("div"); preview.style.cssText = "display:flex; justify-content:center; margin:14px 0;";
    preview.append(QuizFX.avatar(me ? me.teamName : "", v.photo, "160px"));
    box.append(preview);
    const status = el("p", "note");
    if (!v.isBase) {
      status.textContent = v.photo ? "✅ Jullie teamfoto staat erin! Kijk op het grote scherm." : v.skipped ? "Jullie team doet het zonder foto." : `De basistelefoon (${me ? me.baseLabel : ""}) maakt de foto. Ga er samen voor staan!`;
      box.append(status);
      return noop;
    }
    const say = (text) => { status.textContent = text; };
    const picker = photoPicker((file) => uploadTeamPhoto(file, picker, say), { camera: v.photo ? "📸 Opnieuw maken" : "📸 Maak de teamfoto" });
    box.append(picker.row);
    if (!v.photo && !v.skipped) {
      const skip = el("button", "btn-option", "Overslaan (zonder foto)");
      skip.style.textAlign = "center";
      skip.onclick = () => { if (confirm("Doorgaan zonder teamfoto? Je kunt later in het teamblok alsnog een foto maken.")) act("teamphoto_skip", null, () => {}); };
      box.append(skip);
    }
    status.textContent = v.photo ? "✅ Teamfoto staat op het grote scherm. Niet tevreden? Maak hem opnieuw." : v.skipped ? "Jullie gaan zonder foto verder." : "Tik op de groene knop: de camera gaat meteen open.";
    box.append(status);
    return noop;
  },

  // ----- Joker -----
  joker(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", "🃏"); e.style.fontSize = "54px";
    d.append(e, el("h2", "", QuizFX.t("joker.titel")));
    box.append(d, el("p", "note", QuizFX.t("joker.tekst.tel")));
    const list = el("div"), status = el("p", "note"), send = el("button", "btn-primary", "🃏 Joker inzetten en indienen");
    box.append(list, send, status);
    let selected = v.chosen || null;
    function paint(nv) {
      list.replaceChildren();
      nv.rounds.forEach((r) => {
        const b = el("button", "btn-option", (selected === r.id ? "🃏 " : "") + r.title);
        if (selected === r.id) b.style.background = "#7c3aed";
        b.disabled = !nv.isBase || !!nv.submitted;
        b.onclick = () => { selected = r.id; paint(nv); };
        list.append(b);
      });
      send.disabled = !nv.isBase || !!nv.submitted || !selected;
      if (nv.submitted) { status.textContent = "✅ Jokerkeuze ingediend!"; send.textContent = "✅ Joker ingediend"; }
      else if (!nv.isBase) { status.textContent = "De basistelefoon dient de jokerkeuze in."; send.classList.add("hidden"); }
      else { status.textContent = selected ? "Je keuze staat klaar. Tik op indienen om te bevestigen." : "Kies eerst de ronde waarop jullie de joker willen inzetten."; send.classList.remove("hidden"); }
    }
    send.onclick = () => {
      if (!selected || send.disabled) return;
      send.disabled = true;
      act("joker_choose", { roundId: selected }, (result) => {
        if (result && result.ok) { status.textContent = "✅ Jokerkeuze ingediend!"; send.textContent = "✅ Joker ingediend"; }
        else { status.textContent = "Indienen is niet gelukt. Kies de ronde opnieuw."; send.disabled = false; }
      });
    };
    paint(v);
    return (nv) => { if (nv.chosen) selected = nv.chosen; paint(nv); };
  },

  // ----- Beslissingsvraag bij gelijke stand -----
  tiebreak(box, v) {
    const d = el("div"); d.style.textAlign = "center";
    const e = el("div", "", "⚖️"); e.style.fontSize = "54px";
    d.append(e, el("h2", "", "Beslissingsvraag"));
    box.append(d);
    if (!v.inGame) { box.append(el("p", "note", "Jullie team doet niet mee: andere teams staan gelijk op de eerste plaats. Kijk mee op het grote scherm!")); return noop; }
    box.append(el("h3", "", v.question), el("p", "note", `Schat een getal${v.unit ? " (in " + v.unit + ")" : ""}. Wie het dichtstbij zit, wint!`));
    const canAnswer = v.isBase && v.status === "open" && !v.answered;
    const gi = el("input"); gi.type = "text"; gi.inputMode = "decimal"; gi.placeholder = "Jullie schatting"; gi.disabled = !canAnswer;
    if (v.answered) gi.value = String(v.given).replace(".", ",");
    const err = el("p", "bad hidden"); err.style.textAlign = "center";
    const send = submitBtn("Antwoord indienen 📤", () => {
      const n = Number(String(gi.value).replace(",", ".").replace(/[^0-9.\-]/g, ""));
      if (gi.value.trim() === "" || !Number.isFinite(n)) { err.textContent = "Vul een getal in."; err.classList.remove("hidden"); return; }
      act("submit_answer", { stepId: v.id, value: n }, (res) => { if (!res || !res.ok) { err.textContent = "Indienen is niet gelukt."; err.classList.remove("hidden"); } });
    });
    send.classList.toggle("hidden", !canAnswer);
    box.append(gi, send, err);
    if (v.answered) box.append(el("p", "note good", "✅ Ingediend! Wachten tot iedereen klaar is…"));
    else if (!v.isBase) box.append(el("p", "note", "Overleg met je team. De basistelefoon dient het antwoord in."));
    return noop;
  },

  // ----- Slotvraag -----
  final(box, v) {
    box.append(el("h2", "", `🎰 Slotvraag: ${v.category}`));
    if (v.status === "wager") {
      box.append(el("p", "note", QuizFX.t("slot.inzet.tel", { max: v.maxWager })));
      if (!v.isBase) { box.append(el("p", "note", "De basistelefoon bepaalt de inzet. Overleg!")); const s = el("p", "bigtxt", v.wager !== null ? `Inzet: ${v.wager}` : ""); box.append(s); return noop; }
      const input = el("input"); input.type = "number"; input.min = 0; input.max = v.maxWager; input.inputMode = "numeric"; input.value = v.wager !== null ? v.wager : "";
      const quick = el("div", "row2");
      [["0", 0], ["¼", 0.25], ["½", 0.5], ["Alles", 1]].forEach(([l, f]) => {
        const b = el("button", "btn-option", l); b.style.textAlign = "center";
        b.onclick = () => { input.value = Math.floor(v.maxWager * f); };
        quick.append(b);
      });
      const err = el("p", "bad hidden"); err.style.textAlign = "center";
      const ok = submitBtn(v.wager !== null ? "Inzet wijzigen" : "Inzet bevestigen", () => {
        const amount = Math.floor(Number(input.value));
        act("final_wager", { amount }, (res) => {
          if (!res || !res.ok) { err.textContent = (res && res.message) || "Dat lukte niet."; err.classList.remove("hidden"); }
          else err.classList.add("hidden");
        });
      });
      box.append(input, quick, ok, err);
      if (v.wager !== null) box.append(el("p", "note good", `✅ Ingezet: ${v.wager} punten. Wachten tot iedereen klaar is…`));
      return noop;
    }
    box.append(el("p", "bigtxt", v.wager !== null ? `Inzet: ${v.wager}` : ""), el("h3", "", v.question));
    const canAnswer = v.isBase && v.status === "question" && !v.answered;
    let selected = v.answered ? v.given : null;
    const opts = el("div");
    const buttons = v.options.map((opt, i) => {
      const b = el("button", "btn-option", `${QuizFX.letter(i)}: ${opt}`);
      b.disabled = !canAnswer;
      b.onclick = () => { selected = i; paint(); };
      opts.append(b);
      return b;
    });
    const send = submitBtn("Antwoord indienen 📤", () => { if (selected !== null) act("submit_answer", { stepId: v.id, value: selected }, () => {}); });
    function paint() { buttons.forEach((b, i) => { b.style.background = i === selected ? "#2563eb" : ""; }); send.classList.toggle("hidden", !canAnswer || selected === null); }
    paint();
    box.append(opts, send);
    if (v.answered) box.append(el("p", "note good", "✅ Ingediend! Wachten tot iedereen klaar is…"));
    else if (!v.isBase) box.append(el("p", "note", "Overleg met je team. De basistelefoon dient het antwoord in."));
    return noop;
  }
};

// Tekenen: live streken van de tekenaar doorgeven aan de raders
socket.on("draw_ops", (data) => { if (window.__drawHandler && data && data.ops) window.__drawHandler(data.ops); });

// Trillen bij een nieuwe vraag en bij indienen (werkt op Android; iPhone ondersteunt geen trillen vanuit de browser),
// en een duidelijke "Ingediend!"-balk in de teamkleur zolang de vraag nog open staat.
const shareCache = { key: null, blob: null, ready: null };
function showShareImage(blob) {
  const url = URL.createObjectURL(blob);
  const ov = el("div"); ov.style.cssText = "position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.92); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:16px;";
  const img = el("img"); img.src = url; img.alt = "Uitslag van de familiequiz"; img.style.cssText = "max-width:100%; max-height:75vh; border-radius:12px; -webkit-touch-callout:default;";
  const save = el("a", "btn-primary", "⬇️ Opslaan"); save.href = url; save.download = `familiequiz-uitslag-${new Date().toISOString().slice(0, 10)}.png`; save.style.textAlign = "center";
  const close = el("button", "btn-option", "Sluiten"); close.style.textAlign = "center";
  close.onclick = () => { ov.remove(); URL.revokeObjectURL(url); };
  ov.append(el("p", "note", "Houd het plaatje ingedrukt om het te bewaren of te delen."), img, save, close);
  document.body.append(ov);
}
// Signaal bij een nieuwe vraag, na indienen e.d.: het scherm licht kort op in de teamkleur (werkt op elke telefoon,
// ook met Niet storen). Trillen vanuit een website werkt op veel telefoons niet, dus dat doen we niet.
function flash(times) {
  const f = $("flash");
  if (!f) return;
  f.style.background = (typeof me !== "undefined" && me && me.color) || "#fbbf24";
  f.style.animation = "none"; void f.offsetWidth;
  f.style.animation = `flashOn 0.45s ease-out ${Math.max(1, Math.min(3, times))}`;
}
const buzz = (pattern) => {
  if (!prefs.vibrate) return;
  const p = Array.isArray(pattern) ? pattern : [pattern];
  flash(Math.ceil(p.length / 2));
};
function submittedNow(v) {
  switch (v.type) {
    case "mc": case "price": case "logo": return v.status === "open" && !!v.answered;
    case "tiebreak": return v.status === "open" && !!v.answered;
    case "song": return v.status === "open" && v.placed !== null && v.placed !== undefined;
    case "joker": return !!v.submitted;
    case "final": return (v.status === "wager" && v.wager !== null) || (v.status === "question" && v.answered);
    case "draw": return v.status === "drawing" && v.role === "guesser" && !!v.answered;
    default: return false;
  }
}
let lastQuestionId = null, lastSubmitted = false;
function feedback(v) {
  if (!v) return;
  if (v.cheat && v.id !== lastQuestionId && !v.answered) buzz(70);
  if (v.cheat) lastQuestionId = v.id;
  const sub = submittedNow(v);
  const flag = $("submitted-flag");
  flag.classList.toggle("hidden", !sub);
  if (sub && pending.some((p) => p.viewId === v.id)) { pending = pending.filter((p) => p.viewId !== v.id); savePending(); }
  flag.style.background = (me && me.color) || "#16a34a";
  if (sub && !lastSubmitted) buzz([40, 50, 40]);
  lastSubmitted = sub;
  // Trillen zodra je (weer) kunt antwoorden, bijv. als een vraag opengaat of een late kans krijgt
  const openNow = ["open", "question", "wager", "drawing", "writing"].includes(v.status) && !sub && !v.answered;
  const openKey = openNow ? `${v.id}|${v.status}` : null;
  if (openKey && openKey !== lastOpenKey && v.id === lastQuestionId && lastOpenKey !== null) buzz(90);
  lastOpenKey = openKey;
  // Trillen als de tijd begint te lopen
  const timerKey = v.timer && v.timer.running ? v.id : null;
  if (timerKey && timerKey !== lastTimerKey) buzz([60, 40, 60]);
  lastTimerKey = timerKey;
  // Jouw beurt (tekenen of uitleggen bij 30 Seconds): lang trillen
  const myTurn = (v.type === "draw" && v.role === "drawer" && ["ready", "drawing"].includes(v.status)) || (v.type === "thirty" && v.role === "explainer" && ["ready", "running"].includes(v.status));
  const turnKey = myTurn ? `${v.id}|${v.turn}` : null;
  if (turnKey && turnKey !== lastTurnKey) buzz([120, 60, 120, 60, 250]);
  lastTurnKey = turnKey;
}
let lastTurnKey = null;
let lastOpenKey = null, lastTimerKey = null;
let mounted = { key: null, update: null };
function viewKey(v) {
  switch (v.type) {
    case "mc": return [v.id, v.status, v.answered, v.isBase, v.given].join("|");
    case "memory": return [v.id, v.status, v.isBase].join("|");
    case "song": return [v.id, v.status, v.placed, v.isBase, v.result && v.result.ok].join("|");
    case "price": return [v.id, v.status, v.answered, v.isBase].join("|");
    case "draw": return [v.id, v.status, v.role, v.turn, v.answered].join("|");
    case "logo": return [v.id, v.status, v.answered, v.isBase].join("|");
    case "demo_draw": case "demo_thirty": return [v.type, v.id, v.status].join("|");
    case "thirty": return [v.id, v.status, v.role, v.turn, v.words ? 1 : 0].join("|");
    case "joker": return [v.id, v.isBase].join("|");
    case "teamphoto": return [v.id, v.isBase, v.photo, v.skipped].join("|");
    case "final": return [v.id, v.status, v.answered, v.wager !== null, v.isBase, v.result ? 1 : 0].join("|");
    case "tiebreak": return [v.id, v.status, v.answered, v.isBase, v.inGame].join("|");
    case "info": return [v.type, v.id].join("|");
    case "end": return ["end", v.share ? JSON.stringify(v.share) : ""].join("|"); // opnieuw opbouwen zodra de uitslag gedeeld kan worden
    default: return v.type + (v.id || "");
  }
}
function mount(v) {
  const key = viewKey(v);
  const box = $("view");
  if (mounted.key !== key) {
    window.__drawHandler = null;
    box.replaceChildren();
    mounted = { key, update: (BUILD[v.type] || BUILD.lobby)(box, v) || noop };
  }
  mounted.update(v);
}

const funFacts = [
  "Valsspelen bij de familiequiz kost je gegarandeerd de afwasbeurt van vanavond.",
  "Wie het hardst roept dat de vraag niet klopt, heeft meestal het foute antwoord gekozen.",
  "Neem gerust nog een drankje; de quizmaster houdt de antwoorden geheim tot het einde!",
  "Hopelijk hebben jullie je joker op de goede ronde gezet..."
];
let prevPaused = false;

// ---------------- Emoji-reacties naar de tv ----------------
const REACTIONS = ["😂", "😱", "👏", "🎉", "❤️", "🔥", "🤯", "💩"];
(() => {
  const bar = $("react-bar");
  REACTIONS.forEach((e) => {
    const b = el("button", "", e);
    b.type = "button";
    b.onclick = () => { socket.emit("react", { emoji: e }); b.classList.add("sent"); setTimeout(() => b.classList.remove("sent"), 200); };
    bar.append(b);
  });
})();
function updateReactBar(state) {
  const v = state.view || {};
  const on = !!deviceId && state.phase === "PLAY" && (state.paused || v.type === "info" || v.type === "roundresult");
  $("react-bar").classList.toggle("hidden", !on);
  document.body.classList.toggle("reacting", on);
}
let latestState = null;
let toastTimer = null;
socket.on("state_update", (state) => {
  latestState = state;
  updateReactBar(state);
  if (resumeOnNextState && state.view) { resumeOnNextState = false; resumePending(state); }
  else if (socket.connected && state.view && pending.some((p) => p.viewId !== state.view.id)) { pending = pending.filter((p) => p.viewId === state.view.id); savePending(); }
  if (!deviceId || !state.me) return;
  me = state.me;
  lastState = state;
  QuizFX.applyTheme(state.theme);
  QuizFX.setTexts(state.texts);
  document.querySelectorAll("[data-t]").forEach((e) => { e.textContent = QuizFX.t(e.dataset.t); });
  renderTeamCard();
  const v = state.view;
  cheatActive = !!(v && v.cheat) && !state.paused && state.phase === "PLAY";
  QuizFX.countdown("phone", v && v.timer ? v.timer : null, (info) => {
    const badge = $("timer-badge");
    if (!info) return badge.classList.add("hidden");
    badge.classList.remove("hidden");
    badge.textContent = `⏱ ${info.secs}s`;
    badge.style.background = info.secs <= 5 && info.running ? "#dc2626" : "#475569";
  });

  if (state.paused && state.phase === "PLAY") {
    showScreen("pause-screen");
    if (!prevPaused) $("pause-funfact").textContent = `"${funFacts[Math.floor(Math.random() * funFacts.length)]}"`;
    prevPaused = true;
    return;
  }
  prevPaused = false;

  if (state.reviewing) { showScreen("look-screen"); return; }
  if (state.showStandings && state.standings) {
    showScreen("standings-screen");
    const list = $("standings-list");
    list.replaceChildren();
    state.standings.forEach((row) => {
      const li = el("li");
      if (row.teamId === me.teamId) li.style.background = "#2563eb";
      const medalIcon = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`;
      li.append(el("span", "", `${medalIcon}  ${row.name}`), el("b", "", `${row.score} pt`));
      list.appendChild(li);
    });
    return;
  }

  showScreen("game-screen");
  $("round-badge").textContent = state.roundName || "Familiequiz";
  $("team-badge").textContent = me.teamName;
  $("team-badge").style.background = me.color || "#2563eb";
  // het scherm kleurt subtiel mee in de teamkleur
  if (me.color) { document.documentElement.style.setProperty("--team", me.color); document.body.classList.add("teamed"); }
  feedback(v);
  $("team-panel").classList.toggle("hidden", !["lobby", "info", "roundresult"].includes(v.type));
  mount(v);
});
