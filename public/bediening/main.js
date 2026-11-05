// Bediening (quizmaster) – Hoofdlus: elke nieuwe stand van de server verwerken.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Hoofdlus ----------------
let settingsFilled = false;
socket.on("state_update", (state) => {
  S = state;
  renderAlerts(state.alerts);
  renderHistory(state.history);
  const w = $("warnings");
  w.classList.toggle("hidden", !state.warnings.length);
  w.textContent = state.warnings.length ? "⚠️ " + state.warnings.join(" · ") : "";

  clearTimeout(clickLock);
  $("btn-force").disabled = false;
  const tvOk = state.tvCount > 0;
  $("tv-status").textContent = tvOk ? `📺 Tv verbonden${state.tvCount > 1 ? " (" + state.tvCount + "×)" : ""}` : "📺 Tv niet verbonden!";
  $("tv-status").style.color = tvOk ? "#4ade80" : "#ef4444";
  $("tv-status").style.fontWeight = tvOk ? "normal" : "bold";
  // zonder internet: duidelijk melden (Spotify, iTunes en de Hitster-lijsten werken dan niet)
  if (state.internet === false) $("tv-status").textContent += " · 🌐 geen internet";
  const m = state.controls.main;
  $("btn-main").textContent = m.label;
  $("btn-main").disabled = !m.enabled || !!state.review;
  $("main-hint").textContent = state.review ? "Sluit eerst het nakijken." : m.hint || "";
  const f = state.controls.force;
  $("btn-force").classList.toggle("hidden", !f);
  if (f) $("btn-force").textContent = f.label;
  const undo = state.controls.undo || { enabled: false, label: "↶ Niets om ongedaan te maken" };
  $("btn-undo").textContent = undo.label;
  $("btn-undo").disabled = !undo.enabled || !!state.review;
  $("btn-pause").textContent = state.paused ? "▶️ Hervat" : "☕ Pauze";
  $("btn-positions").classList.toggle("hidden", state.phase !== "PLAY");
  $("btn-positions").textContent = state.showPositions === "list" ? "↩ Posities van tv" : "🏅 Posities op tv";
  $("btn-positions").style.background = state.showPositions === "list" ? "#0ea5e9" : "";
  $("btn-race").classList.toggle("hidden", state.phase !== "PLAY");
  $("btn-race").textContent = state.showPositions === "race" ? "↩ Balkenrace van tv" : "📈 Balkenrace op tv";
  $("btn-race").style.background = state.showPositions === "race" ? "#0ea5e9" : "";
  $("btn-pause").disabled = state.phase !== "PLAY";
  $("btn-prev").disabled = state.phase !== "PLAY";
  $("btn-standings").textContent = state.showStandings ? "↩ Terug" : "📊 Stand";
  $("btn-standings").classList.toggle("hidden", state.phase !== "END");
  $("btn-review").classList.toggle("hidden", state.phase !== "END");
  $("btn-time").classList.toggle("hidden", !(state.step && state.step.timer));
  $("status-line").textContent = state.phase === "LOBBY" ? `${state.teams.length} team(s) aangemeld`
    : state.phase === "END" ? "De quiz is afgelopen"
    : `${state.header.round} · stap ${state.stepNo} van ${state.stepTotal}${state.paused ? " · ⏸ PAUZE" : ""}`;

  // Nakijken
  $("review-nav").classList.toggle("hidden", !state.review);
  if (state.review) {
    $("review-info").textContent = state.review.data ? `${state.review.data.title}${state.review.data.subtitle ? " · " + state.review.data.subtitle : ""} (${state.review.page + 1} van ${state.review.total})` : "Er is hier nog niets om na te kijken.";
    $("rv-prev").disabled = state.review.page <= 0;
    $("rv-next").disabled = state.review.page >= state.review.total - 1;
    QuizFX.renderTable($("rv-table"), state.review.data);
    if (state.review.data && state.review.data.images) state.review.data.images.forEach((im) => {
      const wrap = el("div", "padwrap"); wrap.style.cssText = "width:150px; display:inline-block; margin:4px;";
      const cv = el("canvas"); wrap.append(cv); $("rv-table").append(wrap);
      requestAnimationFrame(() => QuizFX.paintStrokes(cv, im.strokes));
    });
  }

  renderPanel(state);
  // Hierna: de volgende vraag (en het weetje), zodat je hem alvast kunt aankondigen
  const nx = state.upNext;
  $("up-next").classList.toggle("hidden", !nx);
  if (nx) {
    $("up-next").replaceChildren(el("div", "muted", `⏭ Hierna${nx.where ? " · " + nx.where : ""}`), el("div", "", nx.what));
    $("up-next").children[1].style.fontWeight = "bold";
    if (nx.answer) $("up-next").append(el("div", "muted", `Antwoord: ${nx.answer}`));
    if (nx.extra) $("up-next").append(el("div", "muted", `💡 ${nx.extra}`));
  }
  if (state.panel && state.panel.type === "song" && state.panel.status === "loading") fetchForPanel(state.panel);
  if (state.panel && state.panel.type === "song" && state.panel.verify && state.panel.verify.length) verifyForPanel(state.panel);
  QuizFX.applyTheme(state.theme);
  $("btn-welcome").classList.toggle("hidden", !(state.phase === "LOBBY" && state.lobbyStage === "join"));
  renderScores(state);
  renderThemes(state);
  renderPlan(state);
  spOnState(state);
  $("quiz-badge").textContent = state.quiz.kind === "excel" ? "● uit Excel" : "○ questions.json";
  $("quiz-status").textContent = `Vragenlijst: ${state.quiz.file} · ingelezen ${state.quiz.loadedAt} · ${state.quiz.rounds} rondes, ${state.quiz.steps} schermen. `
    + (state.quiz.library ? `Hitster-bibliotheek: ${state.quiz.library.file} (${state.quiz.librarySongs} nummers).` : `⚠️ Geen Hitster-bibliotheek gevonden: zet Hitster-bibliotheek.xlsx terug in de projectmap (extra muziekrondes zoeken nu direct op Spotify).`);
  $("quiz-reload").disabled = $("quiz-upload-btn").disabled = state.settingsLocked;

  // Einde
  $("end-box").classList.toggle("hidden", state.phase !== "END");
  if (state.phase === "END") {
    const ul = $("end-list");
    ul.replaceChildren();
    ul.append(el("p", "muted", "De scores staan in het blok Scores hieronder."));
  }

  renderTeams(state);
  renderTeamOverview(state);
  $("bk-download").href = `/download/backup/nu.zip?t=${state.downloadToken}`;
  $("end-photos").href = `/download/fotos.zip?t=${state.downloadToken}`;
  $("end-photos").textContent = `⬇️ Alle foto's van de avond (${state.photoCount || 0}, zip)`;
  renderPlaylists(state);
  renderLibraryUpdate(state);
  fillYcCategories(state);
  $("pl-fill").disabled = state.phase !== "LOBBY" || plFillBusy;
  if (document.activeElement !== $("s-sound-tv")) $("s-sound-tv").checked = state.settings.tvCheatSound !== false;
  if (document.activeElement !== $("s-momentum")) $("s-momentum").checked = state.settings.momentum !== false;
  if (document.activeElement !== $("s-cheat-grace")) $("s-cheat-grace").value = String(state.settings.cheatGrace ?? 1);
  // Geluid via de bediening: alleen het toestel waarop dat gekozen is speelt af (anders hoor je het dubbel)
  soundOut = state.settings.soundOut || "tv";
  if (document.activeElement !== $("s-sound-out")) $("s-sound-out").value = soundOut === "bediening" && soundHere() ? "bediening" : "tv";
  $("s-sound-out").title = soundOut === "bediening" && !soundHere() ? "De geluiden klinken nu op een andere bediening." : "";
  renderPrep(state);
  const hasBots = state.teams.some((t) => t.bot);
  $("bots-add").disabled = state.phase !== "LOBBY";
  $("bots-remove").disabled = !hasBots;

  // Spring-naar-ronde lijst
  const sel = $("goto-round");
  const gotoKey = state.rounds.map((r) => r.introId + r.title).join("|");
  if (sel.dataset.key !== gotoKey) { // alleen opnieuw opbouwen als de rondes veranderen (anders springt je keuze terug)
    sel.dataset.key = gotoKey;
    sel.replaceChildren(new Option("Kies een ronde…", ""));
    sel.append(new Option("Testvragen (begin)", "test_intro"), new Option("Teamfoto", "teamphoto"), new Option("Uitleg van de rondes", "rounds_overview"));
    state.rounds.forEach((r) => sel.append(new Option(`Ronde ${r.no}: ${r.title}`, r.introId)));
    sel.append(new Option("Joker", "joker"), new Option("Slotvraag", "final"));
  }

  // Instellingen
  const locked = state.settingsLocked;
  $("settings-note").textContent = locked ? "De instellingen kunnen alleen vóór de start worden gewijzigd." : "Pas aan en sla op, voordat je de quiz start.";
  ["s-round", "s-timer", "s-time", "s-wager", "s-thirty", "s-blur", "s-price", "s-logo", "s-hitster", "s-hplace", "s-hyear", "s-htitle", "s-hartist", "btn-save-settings"].forEach((id) => { $(id).disabled = locked; });
  const ae = document.activeElement && document.activeElement.id;
  if (!settingsFilled || !ae || !ae.startsWith("s-")) {
    $("s-round").value = state.settings.roundPoints; $("s-timer").checked = state.settings.timerEnabled; $("s-time").value = state.settings.defaultTime;
    $("s-wager").value = state.settings.finalMaxWager; $("s-thirty").value = state.settings.thirtySeconds;
    $("s-blur").value = state.settings.blurPoints.join(", "); $("s-price").value = state.settings.pricePoints.join(", "); $("s-logo").value = state.settings.logoPoints.join(", "); $("s-hitster").value = state.settings.hitsterTarget;
    $("s-hplace").value = state.settings.hitsterPlacePoints; $("s-hyear").value = (state.settings.hitsterYearPoints || []).join(", "); $("s-htitle").value = state.settings.hitsterTitlePoints ?? 2; $("s-hartist").value = state.settings.hitsterArtistPoints ?? 2;
    settingsFilled = true;
  }
});
