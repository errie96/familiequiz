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
$("bk-now").onclick = () => socket.emit("backup_now", null, (res) => { alert(res && res.ok ? "✔ Kopie gemaakt." : "Er was niets veranderd sinds de vorige kopie, of het lukte niet."); loadBackups(); });
$("log-refresh").onclick = loadLog;
$("log-level").onchange = loadLog;
$("backup-panel").addEventListener("toggle", () => { if ($("backup-panel").open) { loadBackups(); loadLog(); } });
