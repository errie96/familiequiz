// Bediening (quizmaster) – Basis: verbinding, hulpjes, inloggen en spiekmeldingen.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
const socket = io();
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---------------- Pincode ----------------
function setStatus(text, color) { $("connection-status").textContent = text; $("connection-status").style.color = color; }
// Na één keer inloggen bewaart dit toestel alleen een sessiesleutel (nooit de code zelf)
localStorage.removeItem("quiz_host_pin"); // oude versies bewaarden de code: weghalen
function registerRemote(askCode) {
  const token = localStorage.getItem("quiz_host_token");
  if (token && !askCode) return socket.emit("register_remote", { token });
  const pin = (prompt("Toegangscode voor de bediening:") || "").trim();
  if (pin) socket.emit("register_remote", { pin });
  else setStatus("● Geen toegangscode. Ververs de pagina.", "#ef4444");
}
socket.on("connect", () => registerRemote(false));
QuizFX.wantAwake(); // bediening-telefoon mag niet in slaap vallen
socket.on("remote_confirmed", (data) => {
  if (data && data.token) localStorage.setItem("quiz_host_token", data.token);
  setStatus("● Verbonden", "#4ade80");
});
socket.on("auth_denied", (data) => {
  if (data && data.expired) { localStorage.removeItem("quiz_host_token"); setStatus("● Opnieuw inloggen", "#f59e0b"); return registerRemote(true); }
  if (data && data.locked) {
    const min = Math.max(1, Math.round((data.waitSec || 60) / 60));
    setStatus("● Te veel foute pogingen", "#ef4444");
    alert(`Te veel foute toegangscodes. Probeer het over ${min} minuut${min > 1 ? "en" : ""} opnieuw.`);
    return;
  }
  alert("Onjuiste toegangscode.");
  registerRemote(true);
});
socket.on("disconnect", () => setStatus("○ Verbinding verbroken...", "#ef4444"));
socket.on("host_error", (data) => alert(data.message));

// ---------------- Spiekmeldingen (blijven staan tot de speler terug is) ----------------
socket.on("cheat_beep", (a) => {
  if (!soundMe) return; // geluid uitgezet voor dit toestel
  QuizFX.alarm(false);
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
});
function renderAlerts(list) {
  const box = $("cheat-alerts");
  box.replaceChildren();
  (list || []).forEach((a) => {
    const d = el("div", "alert-box");
    d.style.backgroundColor = "#dc2626";
    d.style.fontSize = "12px"; d.style.padding = "6px 10px"; d.style.margin = "0 0 4px";
    d.append("⚠️ ", Object.assign(el("u"), { textContent: `${a.teamName} · ${a.label}` }), ` : scherm vergrendeld of app verlaten (${a.timestamp}, tik om te verbergen)`);
    d.onclick = () => socket.emit("alert_dismiss", { key: a.key });
    box.appendChild(d);
  });
}
