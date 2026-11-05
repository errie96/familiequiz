// Bediening (quizmaster) – Spotify: inloggen en liedjes afspelen via de bediening.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Spotify: de bediening logt in en start de liedjes ----------------
const SP_BROWSER = "__browser__";
let spBrowserId = null, spLast = null, spPlaying = false, spWasPaused = false;
$("sp-redirect").textContent = QuizSpotify.redirect();
const spStatus = (t, warn) => { $("sp-status").textContent = t || ""; $("sp-status").style.color = warn ? "#fbbf24" : ""; };
const spTarget = () => { const v = $("sp-device").value; return v === SP_BROWSER ? spBrowserId : v || null; };
async function spDevices() {
  const r = await QuizSpotify.devices();
  const sel = $("sp-device");
  const keep = localStorage.getItem("sp_device") || sel.value || SP_BROWSER;
  sel.replaceChildren();
  if (spBrowserId) sel.append(new Option("Deze browser (Familiequiz bediening)", SP_BROWSER));
  r.list.filter((d) => d.id !== spBrowserId).forEach((d) => sel.append(new Option(`${d.name} (${d.type})${d.is_active ? " ●" : ""}`, d.id)));
  if (!sel.options.length) sel.append(new Option("Geen apparaat gevonden: open Spotify en tik op ↻", ""));
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : sel.options[0].value;
  if (r.status === 401) spStatus("Spotify-login verlopen: ontkoppel en verbind opnieuw.", true);
  else if (r.status !== 200) spStatus("Apparaten ophalen mislukte (status " + r.status + ").", true);
  else spStatus(spTarget() ? "Klaar. Tik op Test om te controleren." : "Verbonden, maar er is nog geen apparaat. Open Spotify op het apparaat bij de speakers en tik op ↻.", !spTarget());
}
// Extra muziekronde: de bediening zoekt startkaarten en liedjes op (Spotify, anders iTunes) en geeft ze aan de server
let trackBusy = {}, trackStatus = "";
// Jaartallen uit de Hitster-lijsten controleren (eerste uitgave) voordat het antwoord getoond wordt
const verifyBusy = new Set();
async function verifyForPanel(p) {
  for (const v of p.verify || []) {
    if (verifyBusy.has(v.songId)) continue;
    verifyBusy.add(v.songId);
    let year = v.year;
    if (QuizSpotify.connected()) { try { year = await QuizSpotify.firstYear(v); } catch (e) { year = v.year; } }
    socket.emit("verify_year", { songId: v.songId, year });
  }
}
async function fetchForPanel(p) {
  // Eerst de Hitster-playlist; lukt dat niet, dan laat de server de Hitster-Excel gebruiken
  const viaPlaylist = !!p.playlist;
  const getTrack = (exclude) => viaPlaylist ? QuizSpotify.fromPlaylist(p.playlist, exclude) : QuizSpotify.randomTrack(p.category, exclude, null);
  const giveUp = (why) => {
    trackStatus = `Hitster-playlist lukt niet (${why}). Terugvallen op de Hitster-Excel…`;
    socket.emit("playlist_failed", { roundId: p.roundId, reason: why }, () => { trackBusy = {}; renderPanel(S); });
  };
  if (viaPlaylist && !QuizSpotify.connected()) { if (!trackBusy["fail" + p.roundId]) { trackBusy["fail" + p.roundId] = true; giveUp("Spotify is niet verbonden"); } return; }
  if (p.needStart && !trackBusy["start" + p.roundId]) {
    trackBusy["start" + p.roundId] = true;
    trackStatus = viaPlaylist ? "Startkaarten uit de Hitster-playlist pakken…" : "Startkaarten zoeken…";
    const exclude = [...p.exclude];
    const tracks = [];
    for (let n = 0; n < p.needStart; n++) {
      const track = await getTrack(exclude);
      if (!track) break;
      tracks.push(track);
      exclude.push(QuizSpotify.keyOf(track));
    }
    if (tracks.length) {
      socket.emit("provide_start", { roundId: p.roundId, tracks }, (res) => {
        if (!res || !res.ok) {
          trackBusy["start" + p.roundId] = true; // voorkom een automatische retry-lus; handmatig opnieuw zoeken blijft mogelijk
          trackStatus = `Geen unieke startkaarten gevonden. ${QuizSpotify.lastError()} Tik op Opnieuw zoeken.`;
        } else {
          delete trackBusy["start" + p.roundId];
          trackStatus = res.remaining ? "Nog niet alle startkaarten gevonden; de resterende worden gezocht…" : "Startkaarten uit de online muziekbibliotheek zijn klaar.";
        }
        renderPanel(S);
      });
    } else if (viaPlaylist) {
      giveUp(QuizSpotify.lastError() || "geen startkaarten gevonden");
      return;
    } else {
      trackStatus = `Geen startkaarten gevonden. ${QuizSpotify.lastError()} Tik op Opnieuw zoeken.`;
      delete trackBusy["start" + p.roundId];
      renderPanel(S);
    }
  }
  if (p.needSong && !trackBusy[p.stepId]) {
    trackBusy[p.stepId] = true;
    trackStatus = viaPlaylist ? "Liedje uit de Hitster-playlist pakken…" : "Hitster-Excel is op: online een liedje zoeken…";
    const exclude = [...p.exclude];
    let accepted = false;
    for (let attempt = 0; attempt < (/^battle/.test(p.category) ? 10 : 3) && !accepted; attempt++) {
      const track = await getTrack(exclude);
      if (!track) break;
      const result = await new Promise((resolve) => socket.emit("provide_track", { stepId: p.stepId, track }, resolve));
      if (result && result.ok) accepted = true;
      else exclude.push(QuizSpotify.keyOf(track));
    }
    if (!accepted && viaPlaylist) { giveUp(QuizSpotify.lastError() || "geen nieuw nummer in de playlist"); return; }
    if (!accepted) {
      trackBusy[p.stepId] = true; // handmatige herhaalactie voorkomt dat dezelfde mislukte zoekopdracht blijft lopen
      trackStatus = `Geen nieuw passend liedje gevonden. ${QuizSpotify.lastError()} Tik op Opnieuw zoeken, of sla dit liedje over.`;
    } else {
      delete trackBusy[p.stepId];
      trackStatus = "Nieuw liedje gevonden.";
    }
    renderPanel(S);
  }
}

async function spPlay(song) {
  if (!QuizSpotify.connected()) return;
  const dev = spTarget();
  if (!dev) return spStatus("Geen afspeelapparaat gekozen: open Spotify op een apparaat en tik op ↻.", true);
  const item = song.uri ? { uri: song.uri, name: song.title } : await QuizSpotify.find(song.title, song.artist);
  if (!item) return spStatus(`"${song.title}" niet gevonden in Spotify: speel het zelf af.`, true);
  const r = await QuizSpotify.play(item.uri, dev);
  if ([200, 202, 204].includes(r.status)) { spPlaying = true; spStatus(`▶️ Speelt: ${item.name}`); }
  else if (r.status === 401) spStatus("Spotify-login verlopen: ontkoppel en verbind opnieuw.", true);
  else if (r.status === 403) spStatus("Spotify weigert afspelen: Premium nodig, of dit account staat niet onder User Management.", true);
  else if (r.status === 404) spStatus("Apparaat niet bereikbaar: open Spotify op dat apparaat (of kies Deze browser) en tik op ↻.", true);
  else spStatus("Afspelen mislukte (status " + r.status + ").", true);
}
function spStop() { if (QuizSpotify.connected() && spTarget()) QuizSpotify.pause(spTarget()); spPlaying = false; }
function spRefreshUi() {
  const on = QuizSpotify.connected();
  $("sp-connect").classList.toggle("hidden", on);
  $("sp-tools").classList.toggle("hidden", !on);
  $("sp-badge").textContent = on ? "● verbonden" : "○ niet verbonden";
  if (!on) spStatus("Nog niet verbonden. Doe dit vooraf, vóór de quiz begint.");
}
$("sp-connect").onclick = () => QuizSpotify.login().catch((e) => { $("spotify-panel").open = true; spStatus(e.message, true); });
$("sp-refresh").onclick = spDevices;
$("sp-device").onchange = () => localStorage.setItem("sp_device", $("sp-device").value);
$("sp-test").onclick = () => spPlay({ title: "Bohemian Rhapsody", artist: "Queen" });
$("sp-stop").onclick = spStop;
$("sp-disconnect").onclick = () => { QuizSpotify.disconnect(); spRefreshUi(); };
// Afspelen in deze browser mag pas na een klik (regels van de browser)
document.addEventListener("click", () => QuizSpotify.activate());
(async () => {
  const r = await QuizSpotify.handleRedirect();
  if (r) $("spotify-panel").open = true;
  spRefreshUi();
  if (r && !r.ok) spStatus(`Koppelen mislukt: ${r.message}. Staat ${QuizSpotify.redirect()} als Redirect-URI in je Spotify-app?`, true);
  if (!QuizSpotify.connected()) return;
  spBrowserId = await QuizSpotify.startPlayer("Familiequiz bediening", (ok, text) => { if (!ok) spStatus(text + " Kies dan een ander apparaat.", true); });
  spDevices();
})();
// Bij elke muziekvraag het liedje starten; stoppen bij pauze of een ander scherm
function spOnState(st) {
  if (!QuizSpotify.connected()) return;
  const song = st.step && st.step.kind === "song" && st.panel && st.panel.type === "song" && st.panel.song && !st.panel.song.hasAudio ? st.panel.song : null;
  if (!song || st.paused) {
    if (spPlaying) spStop();
    if (!song) spLast = null;
  } else if (spLast !== st.step.id) { spLast = st.step.id; spPlay(song); }
  else if (spWasPaused && !spPlaying) { spPlay(song); }
  spWasPaused = st.paused;
}
const spSong = () => (S && S.panel && S.panel.type === "song" ? S.panel.song : null);
