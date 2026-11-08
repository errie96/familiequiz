// Bediening (quizmaster) – Vaste knoppen van de quizmaster.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Knoppen ----------------
let S = null;
// Elke klik stuurt mee bij welke toestand hij hoort; de knop is daarna even geblokkeerd tot de nieuwe stand binnen is.
// Zo slaat een dubbele tik (of twee quizmasters tegelijk) nooit een scherm over.
let clickLock = null;
function lockedEmit(event, btn) {
  if (!S || btn.disabled) return;
  btn.disabled = true;
  clearTimeout(clickLock);
  clickLock = setTimeout(() => { if (S) btn.disabled = false; }, 2500); // vangnet als er geen update komt
  socket.emit(event, { key: S.controls.key });
}
$("btn-main").onclick = () => lockedEmit("host_main", $("btn-main"));
$("btn-force").onclick = () => lockedEmit("host_force", $("btn-force"));
$("btn-undo").onclick = () => {
  if (S && S.controls && S.controls.undo && S.controls.undo.enabled && confirm("Laatste correctie ongedaan maken?")) socket.emit("undo_last");
};
$("btn-pause").onclick = () => socket.emit("toggle_pause");
$("btn-music").onclick = () => socket.emit("music_toggle", { paused: !(S && S.music && S.music.paused) });
// Sneltoetsen (handig op een laptop). Niet tijdens typen in een veld, en niet als een menu open staat.
//   Spatie = grote knop · ← = vorige stap · P = pauze · M = muziek stoppen
document.addEventListener("keydown", (e) => {
  const t = e.target || {};
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName || "") || t.isContentEditable) return;
  if (document.getElementById("wizard") && document.getElementById("wizard").classList.contains("open")) return;
  if (document.getElementById("menu") && document.getElementById("menu").classList.contains("open")) return; // instellingen open
  if (e.code === "Space") { e.preventDefault(); $("btn-main").click(); }
  else if (e.code === "ArrowLeft") { e.preventDefault(); $("btn-prev").click(); }
  else if (e.code === "KeyP") $("btn-pause").click();
  else if (e.code === "KeyM") { if (S && S.music) $("btn-music").click(); else { if (typeof spStop === "function") spStop(); socket.emit("song_pause"); } }
});
$("btn-positions").onclick = () => socket.emit("toggle_positions", { mode: "list" });
$("btn-race").onclick = () => socket.emit("toggle_positions", { mode: "race" });
$("btn-standings").onclick = () => socket.emit("toggle_standings");
$("btn-prev").onclick = () => { if (confirm("Terug naar de vorige stap?")) socket.emit("prev_step"); };
$("btn-review").onclick = () => socket.emit("review_open");
$("btn-time").onclick = () => socket.emit("add_time");
$("btn-welcome").onclick = () => socket.emit("lobby_stage", { stage: "welcome" });
$("rv-prev").onclick = () => socket.emit("review_nav", { dir: -1 });
$("rv-next").onclick = () => socket.emit("review_nav", { dir: 1 });
$("rv-close").onclick = () => socket.emit("review_close");
$("end-break").onclick = () => socket.emit("end_view", { view: "breakdown" });
$("end-rank").onclick = () => socket.emit("end_view", { view: "ranking" });
$("end-awards").onclick = () => socket.emit("end_view", { view: "awards" });
$("end-album").onclick = () => socket.emit("end_view", { view: "album" });
$("end-share").onclick = async () => {
  const list = S && S.end && S.end.scores;
  if (!list || S.end.reveal !== "done") { $("end-share-msg").textContent = "Eerst de ontknoping afmaken, anders verklap je de uitslag."; return; }
  $("end-share-msg").textContent = "Plaatje maken…";
  const date = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const blob = await QuizFX.resultImage({ title: "Familiequiz", subtitle: date, rows: list });
  const how = await QuizFX.shareImage(blob, `familiequiz-uitslag-${new Date().toISOString().slice(0, 10)}.png`, "De uitslag van de familiequiz! 🏆");
  $("end-share-msg").textContent = how === "shared" ? "✔ Gedeeld." : how === "downloaded" ? "✔ Plaatje gedownload." : "";
};
$("btn-skip").onclick = () => { if (confirm("Deze stap overslaan?")) socket.emit("skip_step"); };
$("btn-all-correct").onclick = () => { if (confirm("Deze meerkeuzevraag voor alle teams goed rekenen?")) socket.emit("void_question", { mode: "all_correct" }); };
$("btn-void").onclick = () => { if (confirm("Deze meerkeuzevraag laten vervallen (niemand krijgt punten)?")) socket.emit("void_question", { mode: "void" }); };
$("btn-logout-all").onclick = () => { if (confirm("Alle bediening-toestellen uitloggen? Daarna moet iedereen de toegangscode opnieuw invoeren.")) socket.emit("logout_all"); };

// ---------------- Soundboard: vaste geluiden + eigen bestanden uit public/media/sounds/ ----------------
let sbKey = null;
function renderSoundboard(sb) {
  if (!sb) return;
  const key = JSON.stringify(sb);
  if (key === sbKey) return;
  sbKey = key;
  const box = $("sb-buttons");
  box.replaceChildren();
  const add = (label, payload) => {
    const b = el("button", "btn-option", label);
    b.style.cssText = "margin:0; padding:10px 6px; font-size:15px; text-align:center;";
    b.onclick = () => socket.emit("soundboard", payload);
    box.append(b);
  };
  sb.builtin.forEach((x) => add(x.label, { name: x.name }));
  sb.custom.forEach((x) => add(x.label, { file: x.file }));
}
