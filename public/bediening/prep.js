// Bediening (quizmaster) – Voorbereiding (checklist) en teamoverzicht.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Voorbereiding (alleen vóór de start) ----------------
const prepDone = (k) => localStorage.getItem("quiz_prep_" + k) === "1";
function openPanel(id) { const d = $(id); if (!d) return; d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); }
function renderPrep(state) {
  const box = $("prep-panel");
  box.classList.toggle("hidden", state.phase !== "LOBBY");
  if (state.phase !== "LOBBY") return;
  const media = (state.warnings || []).filter((w) => w.startsWith("📁")).length;
  const other = (state.warnings || []).filter((w) => !w.startsWith("📁")).length;
  const spOn = QuizSpotify.connected();
  const items = [
    { ok: state.tvCount > 0, text: "📺 Tv is verbonden", hint: "Open /host.html op de tv." },
    { ok: !!state.settings.maxTeams, text: "👥 Maximaal aantal teams ingesteld", panel: "teams-panel" },
    { ok: prepDone("plan"), text: "🗂️ Rondevolgorde bekeken", panel: "plan-panel", manual: "plan", hint: "Ligt vast na de start; extra rondes kunnen later nog." },
    { ok: spOn, text: "🎵 Spotify verbonden", panel: "spotify-panel" },
    { ok: spOn && !!spTarget(), text: "🔊 Afspeelapparaat gekozen en getest", panel: "spotify-panel" },
    { ok: Object.keys(state.hitsterPlaylists || {}).length > 0, text: `🎶 Hitster-playlists gekoppeld (${Object.keys(state.hitsterPlaylists || {}).length})`, panel: "playlists-panel" },
    { ok: !other, text: other ? `📋 Vragenlijst: ${other} waarschuwing(en)` : "📋 Vragenlijst zonder waarschuwingen", panel: "quiz-panel" },
    { ok: !media, text: media ? "🖼️ Foto's of logo's ontbreken (zie bovenin)" : "🖼️ Alle foto's en logo's aanwezig" },
    { ok: !(state.onlineHost && state.pinIsDefault), text: "🔐 Eigen toegangscode ingesteld", hint: state.onlineHost ? "Zet HOST_PIN in Render." : "Lokaal is 1234 prima." },
    { ok: prepDone("theme"), text: "🎨 Thema gekozen", panel: "theme-panel", manual: "theme" }
  ];
  const n = items.filter((i) => i.ok).length;
  $("prep-badge").textContent = `(${n} van ${items.length} klaar)`;
  // Startklaar? Fouten blokkeren de start, waarschuwingen niet
  const rd = state.readiness || { ok: true, errors: [], warnings: [], info: [] };
  const head = el("div", "qbox");
  head.style.cssText = `border:2px solid ${rd.ok ? "#22c55e" : "#ef4444"}; margin-bottom:8px;`;
  head.append(el("div", "", rd.ok ? "✅ Quiz is startklaar" : `❌ Quiz kan niet starten (${rd.errors.length} ${rd.errors.length === 1 ? "fout" : "fouten"})`));
  head.firstChild.style.cssText = "font-size:18px; font-weight:bold;";
  rd.errors.forEach((e) => head.append(el("div", "", "❌ " + e)));
  if (rd.warnings.length) { const d = el("details"); d.append(el("summary", "", `⚠️ ${rd.warnings.length} waarschuwing(en): quiz kan starten, maar iets ontbreekt`)); rd.warnings.forEach((w) => d.append(el("div", "muted", w))); head.append(d); }
  if (rd.info.length) { const d = el("details"); d.append(el("summary", "", "ℹ️ Wat is er geladen?")); rd.info.forEach((w) => d.append(el("div", "muted", w))); head.append(d); }
  $("prep-list").replaceChildren(head, ...items.map((i) => {
    const row = el("div", "line");
    row.style.cursor = i.panel ? "pointer" : "default";
    const left = el("span", "", `${i.ok ? "✅" : "⬜"} ${i.text}`);
    if (i.hint && !i.ok) left.append(el("div", "muted", i.hint));
    row.append(left);
    if (i.manual) {
      const b = el("button", "btn-option btn-small", i.ok ? "Ongedaan" : "Gedaan");
      b.onclick = (e) => { e.stopPropagation(); localStorage.setItem("quiz_prep_" + i.manual, i.ok ? "0" : "1"); renderPrep(S); };
      row.append(b);
    }
    if (i.panel) row.onclick = () => openPanel(i.panel);
    return row;
  }));
}
// ---------------- Teamoverzicht: wat doet elk team nu? ----------------
function renderTeamOverview(state) {
  const box = $("team-overview");
  box.replaceChildren(...state.teams.map((t) => {
    const c = el("span", "tov" + (t.now ? " " + t.now : "") + (t.connected ? "" : " off"));
    c.append(QuizFX.avatar(t.name, t.photo, "24px", t.color));
    const icons = (t.now === "answered" ? "✓ " : t.now === "waiting" ? "⏳ " : "") + (!t.baseOnline ? "📵 " : "") + (t.cheats ? `🕵️${t.cheats} ` : "");
    c.append(document.createTextNode(icons + t.name));
    c.title = `${t.name}: ${t.now === "answered" ? "heeft geantwoord" : t.now === "waiting" ? "nog bezig" : "—"}${t.baseOnline ? "" : " · basistelefoon offline!"}${t.cheats ? ` · ${t.cheats}× weggekeken` : ""}`;
    return c;
  }));
}
$("btn-unvoid").onclick = () => socket.emit("void_question", { mode: null });
$("btn-dismiss-alerts").onclick = () => socket.emit("alert_dismiss", { key: "all" });
$("btn-goto").onclick = () => { const id = $("goto-round").value; if (id && confirm("Naar deze ronde springen?")) socket.emit("goto_step", { stepId: id }); };
$("btn-reset").onclick = () => { if (confirm("Alles wissen en opnieuw beginnen? Alle teams en scores gaan verloren.")) socket.emit("reset_quiz"); };

const parseList = (txt) => String(txt).split(/[ ,;]+/).filter(Boolean).map(Number);
