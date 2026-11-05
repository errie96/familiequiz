// Bediening (quizmaster) – Vragenlijst (Excel) uploaden en inlezen.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Vragenlijst uit Excel ----------------
$("quiz-reload").onclick = () => socket.emit("reload_quiz");
$("quiz-upload-btn").onclick = () => $("quiz-file").click();
$("quiz-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $("quiz-msg").textContent = "Uploaden…";
  socket.emit("upload_xlsx", await f.arrayBuffer(), (res) => {
    const what = res && res.kind === "library" ? `als Hitster-bibliotheek (${res.songs} nummers)` : "als vragenlijst";
    $("quiz-msg").textContent = res && res.ok ? `✔ ${f.name} is ingelezen ${what}${res.warnings ? ` (${res.warnings} waarschuwing(en), zie bovenin)` : ""}.` : "✘ " + ((res && res.message) || "Uploaden mislukte.");
  });
  e.target.value = "";
};
