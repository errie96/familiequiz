// Bediening (quizmaster) – Hitster: playlists, jaartallen controleren, lijsten aanvullen en bijwerken.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Hitster-playlists ----------------
const plInfo = (p) => p ? `${p.name || "playlist"}${p.total ? " · " + p.total + " nummers" : ""}` : "geen playlist: vrij zoeken op Spotify";
function renderPlaylists(state) {
  const box = $("pl-rows");
  const cats = state.hitsterCats || {};
  const pls = state.hitsterPlaylists || {};
  const n = Object.keys(pls).length;
  $("pl-badge").textContent = n ? `(${n} gekoppeld)` : "(nog geen)";
  const key = JSON.stringify([cats, pls]);
  if (box.dataset.key === key || box.contains(document.activeElement)) return;
  box.dataset.key = key;
  box.replaceChildren();
  Object.entries(cats).forEach(([id, name]) => {
    if (/eigen lijst/.test(name)) return;
    const row = el("div"); row.style.margin = "8px 0";
    const label = el("div", "", name); label.style.fontWeight = "bold";
    const input = el("input"); input.type = "text"; input.placeholder = "Spotify-playlistlink"; input.dataset.cat = id;
    input.value = pls[id] ? `https://open.spotify.com/playlist/${pls[id].id}` : "";
    const info = el("div", "muted", plInfo(pls[id])); info.style.fontSize = "12px";
    row.append(label, input, info);
    box.append(row);
  });
}
// ---------- Jaartallen controleren ----------
const emitP = (ev, data) => new Promise((resolve) => socket.emit(ev, data, (res) => resolve(res || {})));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let ycStop = false, ycBusy = false;
function fillYcCategories(state) {
  const sel = $("yc-cat");
  const key = JSON.stringify(state.hitsterCats || {});
  if (sel.dataset.key === key) return;
  sel.dataset.key = key;
  sel.replaceChildren(new Option("Alle categorieën", "all"), ...Object.entries(state.hitsterCats || {}).filter(([, n]) => !/eigen lijst/.test(n)).map(([id, n]) => new Option(n, id)));
}
$("yc-stop").onclick = () => { ycStop = true; $("yc-progress").textContent = "Stoppen na dit nummer…"; };
$("yc-start").onclick = async () => {
  if (ycBusy) return;
  if (!QuizSpotify.connected()) { $("yc-progress").textContent = "Verbind eerst met Spotify (blok 🎵 Spotify)."; return; }
  ycBusy = true; ycStop = false;
  $("yc-start").classList.add("hidden"); $("yc-stop").classList.remove("hidden");
  const changes = [];
  let fixed = 0, verified = 0, notFound = 0;
  try {
    const res = await emitP("library_checklist", { category: $("yc-cat").value });
    if (!res.ok) { $("yc-progress").textContent = "✘ " + (res.message || "Lijst ophalen mislukte."); return; }
    const list = res.list;
    if (!list.length) { $("yc-progress").textContent = "✔ Alles in deze categorie is al gecontroleerd."; return; }
    const started = Date.now();
    let batch = [];
    for (let i = 0; i < list.length; i++) {
      if (ycStop) break;
      const v = list[i];
      const r = await QuizSpotify.checkYear(v);
      if (r.stop) { $("yc-report").textContent = "✘ " + QuizSpotify.lastError(); break; }
      if (!r.ok) notFound++;
      batch.push({ ...v, year: r.year, ok: r.ok });
      const left = Math.round(((Date.now() - started) / (i + 1)) * (list.length - i - 1) / 60000);
      $("yc-progress").textContent = `Bezig: ${i + 1} van ${list.length} · ${fixed} jaartallen verbeterd${left ? ` · nog ongeveer ${left} min` : ""}`;
      if (batch.length >= 40) {
        const out = await emitP("library_year_results", { results: batch, done: false });
        batch = [];
        if (out.ok) { fixed += out.report.fixed; verified += out.report.verified; changes.push(...out.report.changes); }
        $("yc-report").replaceChildren(...changes.slice(-40).reverse().map((c) => el("div", "", c)));
      }
      await pause(120);
    }
    const out = await emitP("library_year_results", { results: batch, done: true });
    if (out.ok) { fixed += out.report.fixed; verified += out.report.verified; changes.push(...out.report.changes); }
    $("yc-progress").textContent = `${ycStop ? "⏹ Gestopt" : "✔ Klaar"}: ${verified} nummers gecontroleerd, ${fixed} jaartallen verbeterd${notFound ? `, ${notFound} niet gevonden op Spotify (die houden Jaar check = Ja)` : ""}. Download de Excel om het te bewaren.`;
    $("yc-report").replaceChildren(...changes.slice(-200).reverse().map((c) => el("div", "", c)));
  } finally {
    ycBusy = false;
    $("yc-start").classList.remove("hidden"); $("yc-stop").classList.add("hidden");
  }
};
// ---------- Aanvullen uit de playlists van het Hitster-account ----------
let plFillBusy = false;
$("pl-fill").onclick = async () => {
  if (plFillBusy) return;
  plFillBusy = true;
  if (!QuizSpotify.connected()) { $("pl-fill-report").textContent = "Verbind eerst met Spotify (blok 🎵 Spotify)."; return; }
  $("pl-fill").disabled = true;
  const lines = [];
  try {
    for (const [cat, p] of Object.entries(S.hitsterPlaylists || {})) {
      $("pl-fill-report").textContent = `Bezig: ${S.hitsterCats[cat] || cat}…`;
      const tracks = await QuizSpotify.playlistTracks(p.id);
      if (!tracks) { lines.push(`✘ ${S.hitsterCats[cat] || cat}: ${QuizSpotify.lastError()}`); continue; }
      const res = await emitP("library_add_tracks", { category: cat, tracks: tracks.map((t) => ({ title: t.title, artist: t.artist, year: t.year })) });
      lines.push(res.ok ? `✔ ${S.hitsterCats[cat] || cat}: ${res.report.added} nummers toegevoegd (playlist: ${tracks.length})` : `✘ ${S.hitsterCats[cat] || cat}: ${res.message}`);
      $("pl-fill-report").replaceChildren(...lines.map((t) => el("div", "", t)));
    }
    lines.push("Tip: draai daarna Jaartallen controleren voor de nieuwe nummers, en download de Excel.");
    $("pl-fill-report").replaceChildren(...lines.map((t) => el("div", "", t)));
  } finally { plFillBusy = false; $("pl-fill").disabled = false; }
};
$("lib-update").onclick = () => {
  if (!confirm("Alle Hitster-lijsten opnieuw ophalen via de links in het tabblad Bronnen?")) return;
  $("lib-update").disabled = true;
  $("lib-report").textContent = "Bezig met ophalen… (dit duurt even)";
  socket.emit("update_hitster", null, (res) => {
    $("lib-update").disabled = false;
    if (!res || !res.ok) $("lib-report").textContent = "✘ " + ((res && res.message) || "Bijwerken mislukte.");
  });
};
function renderLibraryUpdate(state) {
  $("lib-download").href = state.libraryDownload || "#";
  $("lib-update").disabled = state.phase !== "LOBBY" || !!(state.libraryUpdate && state.libraryUpdate.busy);
  const u = state.libraryUpdate;
  if (!u || u.busy) return;
  if (u.error) { $("lib-report").textContent = "✘ " + u.error; return; }
  const ok = u.report.filter((r) => !r.error), bad = u.report.filter((r) => r.error);
  const lines = [`✔ Bijgewerkt op ${u.at}: ${ok.length} tabbladen.`,
    ...ok.filter((r) => r.added || r.removed).map((r) => `• ${r.tab}: ${r.added} nieuw, ${r.removed} weg (${r.after} totaal)`),
    ...bad.map((r) => `✘ ${r.tab}: ${r.error}`),
    "Tip: download de Excel en zet hem in je projectmap/GitHub, dan blijft de update ook na een herstart bewaard."];
  $("lib-report").replaceChildren(...lines.map((t) => el("div", "", t)));
}
$("pl-save").onclick = () => {
  const playlists = {};
  $("pl-rows").querySelectorAll("input[data-cat]").forEach((i) => { playlists[i.dataset.cat] = i.value.trim() || null; });
  socket.emit("set_playlists", { playlists }, (res) => { $("pl-status").textContent = res && res.ok ? "✅ Opgeslagen." : "Opslaan mislukt."; $("pl-rows").dataset.key = ""; renderPlaylists(S); });
};
$("pl-find").onclick = async () => {
  if (!QuizSpotify.connected()) { $("pl-status").textContent = "Verbind eerst met Spotify (blok 🎵 Spotify)."; return; }
  $("pl-find").disabled = true;
  $("pl-status").textContent = "Zoeken op Spotify… (dit duurt een paar seconden)";
  try {
    const cats = Object.keys(S.hitsterCats || {}).filter((c) => !/eigen lijst/.test(S.hitsterCats[c]));
    const found = await QuizSpotify.findHitsterPlaylists(cats);
    const n = Object.keys(found).length;
    if (!n) { $("pl-status").textContent = `Geen Hitster-playlists gevonden. ${QuizSpotify.lastError()} Plak de links dan zelf.`; return; }
    socket.emit("set_playlists", { playlists: found }, () => {
      const missing = cats.filter((c) => !found[c]).map((c) => S.hitsterCats[c]);
      $("pl-status").textContent = `✅ ${n} van ${cats.length} gevonden en opgeslagen. Controleer de namen hieronder.${missing.length ? " Niet gevonden: " + missing.join(", ") + "." : ""}`;
      $("pl-rows").dataset.key = "";
    });
  } finally { $("pl-find").disabled = false; }
};
// Spiekgeluid: tv (voor iedereen) en deze bediening (alleen dit toestel)
let soundMe = localStorage.getItem("quiz_cheat_sound") !== "off";
$("s-sound-me").checked = soundMe;
$("s-sound-me").onchange = () => { soundMe = $("s-sound-me").checked; localStorage.setItem("quiz_cheat_sound", soundMe ? "on" : "off"); };
$("s-sound-tv").onchange = () => socket.emit("set_cheat_sound", { tv: $("s-sound-tv").checked });
$("s-momentum").onchange = () => socket.emit("set_momentum", { on: $("s-momentum").checked });
$("bots-add").onclick = () => socket.emit("add_bots", { n: 3 });
$("bots-remove").onclick = () => { if (confirm("Alle testteams verwijderen?")) socket.emit("remove_bots"); };
$("btn-save-settings").onclick = () => socket.emit("update_settings", {
  roundPoints: Number($("s-round").value), timerEnabled: $("s-timer").checked, defaultTime: Number($("s-time").value),
  finalMaxWager: Number($("s-wager").value), thirtySeconds: Number($("s-thirty").value),
  blurPoints: parseList($("s-blur").value), pricePoints: parseList($("s-price").value), logoPoints: parseList($("s-logo").value), hitsterTarget: Number($("s-hitster").value), hitsterPlacePoints: Number($("s-hplace").value), hitsterYearPoints: parseList($("s-hyear").value), hitsterTitlePoints: Number($("s-htitle").value), hitsterArtistPoints: Number($("s-hartist").value)
});
