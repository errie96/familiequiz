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

// ---------------- Persoonlijk aanmelden: overzicht per familie, teams maken, mensen indelen ----------------
function openPerson(p, su) {
  const dlg = $("move-dialog");
  $("move-title").textContent = `${p.label}${p.age != null ? ` (${p.age})` : ""} · ${p.family || "geen familie"}`;
  const list = $("move-list");
  list.replaceChildren();
  const close = () => dlg.classList.add("hidden");
  (su.teams || []).filter((t) => t.teamId !== p.teamId).forEach((t) => {
    const b = el("button", "btn-option", `→ ${t.name} (${t.size})`);
    b.onclick = () => { socket.emit("assign_person", { deviceId: p.deviceId, teamId: t.teamId }); close(); };
    list.appendChild(b);
  });
  const age = el("button", "btn-option", "✏️ Leeftijd wijzigen");
  age.onclick = () => { const v = prompt(`Leeftijd van ${p.label}:`, p.age != null ? p.age : ""); if (v !== null && /^\d{1,3}$/.test(v.trim())) socket.emit("edit_person", { deviceId: p.deviceId, age: Number(v.trim()) }); close(); };
  const name = el("button", "btn-option", "✏️ Naam wijzigen");
  name.onclick = () => { const v = prompt("Nieuwe naam:", p.label); if (v) socket.emit("edit_person", { deviceId: p.deviceId, name: v }); close(); };
  const fams = su.families.filter((f) => f.expected !== null || f.name !== "Overig").map((f) => f.name);
  const fam = el("button", "btn-option", "✏️ Andere familie");
  fam.onclick = () => { const v = prompt(`Familie van ${p.label} (${fams.join(", ")}):`, p.family || ""); if (v) socket.emit("edit_person", { deviceId: p.deviceId, family: v }); close(); };
  const rm = el("button", "btn-option", "🗑 Aanmelding verwijderen");
  rm.style.color = "#fca5a5";
  rm.onclick = () => { if (confirm(`${p.label} verwijderen? Die telefoon moet zich dan opnieuw aanmelden.`)) socket.emit("remove_person", { deviceId: p.deviceId }); close(); };
  list.append(age, name, fam, rm);
  dlg.classList.remove("hidden");
}
function renderSignup(state) {
  const box = $("signup-box");
  const su = state.signup;
  const lobby = state.phase === "LOBBY";
  $("max-teams-label").textContent = su ? "Aantal teams" : "Maximaal aantal teams";
  box.classList.toggle("hidden", !su && !lobby);
  if (box.contains(document.activeElement) && ["INPUT", "SELECT"].includes(document.activeElement.tagName)) return; // niet onder het typen verversen
  box.replaceChildren();
  // Manier van aanmelden (alleen vóór de start te wisselen, en alleen zolang er nog niemand is)
  if (lobby && state.signupSetting) {
    const row = el("div", "setting"); row.style.border = "none";
    const lab = el("label", "", ""); lab.append(el("b", "", "Aanmelden"));
    const sel = el("select");
    [["auto", `Automatisch (${state.signupSetting.families ? "persoonlijk: families in de Excel" : "zelf teams: geen families in de Excel"})`], ["personal", "Persoonlijk: naam, familie en leeftijd; ik maak de teams"], ["teams", "Zelf teams maken op de telefoon"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; sel.append(o); });
    sel.value = state.signupSetting.mode;
    sel.style.maxWidth = "60%";
    sel.onchange = () => socket.emit("set_signup", { mode: sel.value });
    row.append(lab, sel);
    box.append(row);
  }
  if (!su) return;
  const head = el("div", "qbox");
  const done = su.expected != null && su.total >= su.expected;
  head.append(el("b", "", `🙋 Aangemeld: ${su.total}${su.expected != null ? ` van ${su.expected}` : ""}${done ? " ✅ iedereen is er" : ""}`));
  if (su.unassigned && su.teamsMade) { const w = el("div", "", `⚠️ ${su.unassigned} nog zonder team: tik de naam aan en kies een team.`); w.style.color = "#fbbf24"; head.append(w); }
  su.families.forEach((f) => {
    const line = el("div"); line.style.cssText = "margin:8px 0 2px; display:flex; flex-wrap:wrap; gap:6px; align-items:center;";
    const full = f.expected != null && f.present >= f.expected;
    const t = el("b", "", `${f.name} ${f.present}${f.expected != null ? "/" + f.expected : ""}${full ? " ✅" : ""}`);
    t.style.cssText = "min-width:110px;" + (f.expected != null && f.present > f.expected ? " color:#fbbf24;" : "");
    line.append(t);
    if (!f.people.length) line.append(el("span", "muted", "nog niemand"));
    f.people.forEach((p) => {
      const b = el("button", "btn-option btn-small", `${p.connected ? "" : "○ "}${p.label}${p.age != null ? ` (${p.age})` : ""}`);
      b.title = p.team ? `Team: ${p.team}` : "Nog geen team";
      b.style.cssText = "margin:0;" + (su.teamsMade && !p.teamId ? " outline:2px solid #fbbf24;" : "") + (p.connected ? "" : " opacity:.6;");
      b.onclick = () => openPerson(p, su);
      line.append(b);
    });
    head.append(line);
  });
  box.append(head);
  if (lobby) {
    const ctl = el("div", "qbox");
    const n = state.settings.maxTeams || 0;
    const per = n && su.total ? (su.total / Math.min(n, su.total)) : 0;
    ctl.append(el("b", "", "🎲 Teams maken"), el("div", "muted", n ? `${Math.min(n, su.total)} teams van ${Math.floor(per)}${per % 1 ? "–" + Math.ceil(per) : ""} spelers: leeftijden en families zo goed mogelijk gespreid. Vul hierboven een ander aantal teams in om het te veranderen.` : "Vul eerst hierboven het aantal teams in."));
    const kids = el("div", "setting"); kids.style.border = "none";
    const kl = el("label", "", "Kinderen t/m deze leeftijd bij een volwassen gezinslid houden (0 = niet)");
    const ki = el("input"); ki.type = "number"; ki.min = 0; ki.max = 17; ki.value = su.keepKidsAge || 0; ki.style.width = "70px";
    ki.onchange = () => socket.emit("set_signup", { keepKidsAge: Math.max(0, Math.min(17, Math.round(Number(ki.value)) || 0)) });
    kids.append(kl, ki);
    const row = el("div", "row");
    const make = el("button", "btn-primary", su.teamsMade ? "🎲 Opnieuw verdelen" : `🎲 Maak teams${done ? "" : su.expected != null ? ` (nog niet iedereen: ${su.total}/${su.expected})` : ""}`);
    make.style.margin = "0";
    make.disabled = !n || !su.total;
    make.onclick = () => { if (!su.teamsMade || confirm("Alle teams opnieuw verdelen? Teamnamen en teamfoto's vervallen.")) socket.emit("make_teams", null, () => {}); };
    row.append(make);
    if (su.teamsMade) { const undo = el("button", "btn-option", "Teams opheffen"); undo.style.cssText = "margin:0; text-align:center;"; undo.onclick = () => { if (confirm("Alle teams opheffen? Iedereen blijft aangemeld.")) socket.emit("unmake_teams"); }; row.append(undo); }
    ctl.append(kids, row);
    box.append(ctl);
  }
  if (su.teamsMade) {
    const ov = el("div", "qbox");
    ov.append(el("b", "", "Indeling"), el("div", "muted", "Tik hierboven een naam aan om iemand te verplaatsen. ⭐ = basistelefoon."));
    su.teams.forEach((t) => {
      const line = el("div"); line.style.cssText = `margin:6px 0; padding-left:8px; border-left:4px solid ${t.color || "#64748b"};`;
      line.append(el("b", "", `${t.name}${t.named ? "" : " (nog geen eigen naam)"} · ${t.size}${t.avgAge != null ? ` · gem. ${t.avgAge} jr` : ""}`));
      line.append(el("div", "muted", t.members.map((m) => `${m.base ? "⭐ " : ""}${m.label}${m.age != null ? ` ${m.age}` : ""}${m.family ? ` (${m.family})` : ""}`).join(" · ")));
      ov.append(line);
    });
    box.append(ov);
  }
}

$("max-teams-save").onclick = () => socket.emit("set_max_teams", { n: Number($("max-teams").value) });
function renderTeams(state) {
  renderSignup(state);
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
