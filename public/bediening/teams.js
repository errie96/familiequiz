// Bediening (quizmaster) – Teams beheren.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Teams beheren ----------------
function openMove(device, from) {
  const dlg = $("move-dialog");
  $("move-title").textContent = `${device.label}: verplaatsen naar…`;
  const list = $("move-list");
  list.replaceChildren();
  S.teams.filter((t) => t.teamId !== from.teamId).forEach((t) => {
    const b = el("button", "btn-option", t.name);
    b.onclick = () => { socket.emit("move_player", { deviceId: device.deviceId, teamId: t.teamId }); dlg.classList.add("hidden"); };
    list.appendChild(b);
  });
  dlg.classList.remove("hidden");
}
$("move-cancel").onclick = () => $("move-dialog").classList.add("hidden");

$("max-teams-save").onclick = () => socket.emit("set_max_teams", { n: Number($("max-teams").value) });
function renderTeams(state) {
  $("team-count").textContent = state.settings.maxTeams ? `${state.teams.length} van ${state.settings.maxTeams}` : state.teams.length;
  if (document.activeElement !== $("max-teams")) $("max-teams").value = state.settings.maxTeams || "";
  $("max-teams").style.outline = state.settings.maxTeams ? "" : "2px solid #fbbf24";
  const box = $("team-list");
  box.replaceChildren();
  state.teams.forEach((t) => {
    const d = el("div", "team");
    const head = el("div", "head");
    const title = el("b", "", `${t.connected ? "●" : "○"} ${t.name}${t.joker ? " · 🃏 " + t.joker : ""}`);
    title.prepend(QuizFX.avatar(t.name, t.photo, "28px", t.color), " ");
    head.append(title);
    const acts = el("span");
    const rn = el("button", "btn-option btn-small", "✏️"); rn.onclick = () => { const n = prompt("Nieuwe teamnaam:", t.name); if (n) socket.emit("rename_team", { teamId: t.teamId, name: n }); };
    const rm = el("button", "btn-option btn-small", "🗑"); rm.onclick = () => { if (confirm(`Team ${t.name} verwijderen?`)) socket.emit("remove_team", { teamId: t.teamId }); };
    acts.append(rn, rm);
    if (t.photo) { const rp = el("button", "btn-option btn-small", "🖼✕"); rp.title = "Teamfoto verwijderen"; rp.onclick = () => { if (confirm(`Teamfoto van ${t.name} verwijderen?`)) socket.emit("remove_team_photo", { teamId: t.teamId }); }; acts.prepend(rp); }
    head.append(acts);
    d.append(head);
    // Basistelefoon weg (bijv. lege batterij)? Dan direct een andere telefoon van het team als basis kunnen aanwijzen
    const baseM = t.members.find((m) => m.role === "base");
    const backups = t.members.filter((m) => m.role !== "base" && m.connected);
    if (!t.bot && baseM && !baseM.connected) {
      const warn = el("div", "members");
      warn.style.cssText = "background:#7f1d1d; border-radius:8px; padding:6px 8px; margin:4px 0;";
      warn.append(`⚠️ Basistelefoon (${baseM.label}) is offline. `);
      if (backups.length) backups.forEach((m) => { const b = el("button", "btn-option btn-small", `⭐ ${m.label} wordt basis`); b.onclick = () => socket.emit("set_base", { deviceId: m.deviceId }); warn.append(b); });
      else warn.append("Er is geen andere telefoon van dit team verbonden: laat iemand opnieuw aansluiten.");
      d.append(warn);
    }
    t.members.forEach((m) => {
      const row = el("div", "members");
      row.append(`${m.connected ? "●" : "○"} ${m.label}${m.role === "base" ? " ⭐" : ""} `);
      const a = el("button", "btn-option btn-small", "naam"); a.onclick = () => { const n = prompt("Nieuwe naam:", m.label); if (n) socket.emit("rename_player", { deviceId: m.deviceId, name: n }); };
      const b = el("button", "btn-option btn-small", "→ team"); b.onclick = () => openMove(m, t);
      row.append(a, b);
      if (m.role !== "base") { const c = el("button", "btn-option btn-small", "⭐ basis"); c.onclick = () => socket.emit("set_base", { deviceId: m.deviceId }); row.append(c); }
      d.append(row);
    });
    box.append(d);
  });
}
