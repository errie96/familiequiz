// Bediening (quizmaster) – Reservekopieën en logboek.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Reservekopieën en logboek ----------------
const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
function loadBackups() {
  socket.emit("backup_list", null, (res) => {
    const box = $("bk-list");
    if (!res || !res.ok) return;
    box.replaceChildren(...(res.list.length ? res.list.map((b) => {
      const row = el("div", "line");
      const a = el("a", "lnk", "⬇️ zip"); a.href = `/download/backup/${b.id}.zip?t=${S.downloadToken}`;
      row.append(el("span", "", `${fmtTime(b.at)} · ${b.reason} · ${b.files.length} bestanden`), a);
      if (b.files.some((f) => f.name === "state.json")) {
        const r = el("button", "lnk", "↩️ terugzetten");
        r.type = "button";
        r.style.cssText = "margin-left:8px; padding:3px 10px; font-size:12px; width:auto; min-height:0; display:inline-block;";
        r.onclick = () => restoreBackup(b);
        row.append(r);
      }
      return row;
    }) : [el("div", "", "Nog geen reservekopieën.")]));
  });
}
function loadLog() {
  socket.emit("log_tail", { level: $("log-level").value }, (res) => {
    if (!res || !res.ok) return;
    $("log-list").replaceChildren(...res.entries.slice().reverse().map((e) => {
      const { t, level, event, ...rest } = e;
      const extra = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
      return el("div", "log-line " + level, `${fmtTime(t)} ${level === "error" ? "✘" : level === "warn" ? "⚠" : "·"} ${event}${extra}`);
    }));
    $("log-files").replaceChildren(el("span", "", "Download logboek: "), ...res.files.map((f) => { const a = el("a", "lnk", f.replace(/^quiz-|\.log$/g, "") + " "); a.href = `/download/log/${f}?t=${S.downloadToken}`; return a; }));
  });
}
// Een kopie terugzetten: eerst bevestigen, dan zet de server de stand terug en start zichzelf opnieuw op.
// De huidige stand wordt eerst zelf als kopie bewaard ("voor-terugzetten"), dus ook dit is terug te draaien.
function restoreBackup(b) {
  const sure = confirm(`Stand terugzetten naar ${fmtTime(b.at)} (${b.reason})?\n\n` +
    "Alles wat daarna gebeurd is, is dan niet meer zichtbaar in de quiz. De huidige stand wordt eerst bewaard als kopie \"voor-terugzetten\".\n\n" +
    "De server start opnieuw op (ongeveer 5 seconden). Daarna staat de quiz op pauze en verbinden alle telefoons en de tv vanzelf opnieuw.");
  if (!sure) return;
  socket.emit("backup_restore", { id: b.id }, (res) => {
    if (!res || !res.ok) return alert("✘ " + ((res && res.message) || "Terugzetten lukte niet."));
    alert("✔ Teruggezet. De server start nu opnieuw op; even wachten tot alles weer verbonden is." + (res.note ? "\n\n" + res.note : ""));
  });
}
$("bk-now").onclick = () => socket.emit("backup_now", null, (res) => { alert(res && res.ok ? "✔ Kopie gemaakt." : "Er was niets veranderd sinds de vorige kopie, of het lukte niet."); loadBackups(); });
$("log-refresh").onclick = loadLog;
$("log-level").onchange = loadLog;
$("backup-panel").addEventListener("toggle", () => { if ($("backup-panel").open) { loadBackups(); loadLog(); } });
