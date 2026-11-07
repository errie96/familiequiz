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

// ---------------- Quizgeluiden via de bediening (instelling "Quizgeluiden via") ----------------
let soundOut = "tv";
const soundHere = () => localStorage.getItem("quiz_sound_here") === "on";
const quizAudio = new Audio(); // één element hergebruiken: na de eerste tik mag het altijd afspelen (iPhone)
quizAudio.preload = "auto";
let quizAudioUnlocked = false;
const SILENT_WAV = "data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"; // 0,1 s stilte om het afspelen vrij te geven
function unlockQuizSound() {
  QuizFX.unlockAudio();
  if (quizAudioUnlocked) return;
  quizAudioUnlocked = true;
  try { quizAudio.src = SILENT_WAV; quizAudio.dataset.src = ""; quizAudio.muted = true; const p = quizAudio.play(); if (p) p.then(() => { quizAudio.pause(); quizAudio.muted = false; }).catch(() => { quizAudio.muted = false; }); } catch (e) { quizAudio.muted = false; }
}
document.addEventListener("click", unlockQuizSound);
document.addEventListener("touchend", unlockQuizSound, { passive: true });
socket.on("quiz_sound", (m) => {
  if (!m) return;
  if (m.name === "media_pause") { quizAudio.pause(); return; }
  if (soundOut !== "bediening" || !soundHere()) return;
  if (m.name === "media_play") {
    if (quizAudio.dataset.src !== m.src) { quizAudio.src = m.src; quizAudio.dataset.src = m.src; }
    try { if (Math.abs((quizAudio.currentTime || 0) - (m.at || 0)) > 1) quizAudio.currentTime = m.at || 0; } catch (e) { /* nog niet geladen */ }
    quizAudio.muted = false;
    quizAudio.play().catch(() => setStatus("🔇 Tik één keer op de bediening om geluid toe te staan", "#f59e0b"));
    return;
  }
  if (typeof QuizFX[m.name] === "function" && ["buzzer", "triumph", "ding", "whoosh", "drumHit", "fanfare", "tick"].includes(m.name)) QuizFX[m.name](...(m.args || []));
});

// ---------------- Spiekmeldingen (blijven staan tot de speler terug is) ----------------
socket.on("cheat_beep", (a) => {
  if (!soundMe) return; // geluid uitgezet voor dit toestel
  QuizFX.alarm(false);
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
