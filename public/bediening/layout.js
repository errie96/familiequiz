// Bediening (quizmaster) – Indeling: kopbalk, menu ⚙️ en de stap-voor-stap voorbereiding 🧭.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
(() => {
  const card = document.querySelector(".card");
  const q = (id) => document.getElementById(id);
  // --- vaste kopbalk ---
  const header = card.firstElementChild.nextElementSibling && card.querySelector("h1").parentElement;
  header.id = "topbar";
  const tools = document.createElement("span");
  tools.style.cssText = "display:flex; gap:6px;";
  tools.innerHTML = '<button id="tb-wizard" class="btn-option tb-btn">🧭 Voorbereiding</button><button id="tb-menu" class="btn-option tb-btn">⚙️ Instellingen</button><button id="tb-sos" class="btn-option tb-btn" style="border:2px solid #dc2626;">🚨</button>';
  header.append(tools);
  // --- hoofdkolom: alles wat je tijdens het spelen nodig hebt ---
  const main = document.createElement("div");
  main.id = "main-col";
  // --- menu: alle instellingen en beheer ---
  const menu = document.createElement("aside");
  menu.id = "menu";
  menu.innerHTML = '<div id="menu-head"><button id="menu-back" class="btn-option" style="width:auto; margin:0;">⬅️ Alles</button><h2 id="menu-title" style="margin:0; flex:1; font-size:20px;">⚙️ Instellingen en beheer</h2><button id="menu-close" class="btn-option" style="width:auto; margin:0;">✕ Sluiten</button></div><div id="menu-index"></div>';
  const MENU_IDS = ["teams-panel", "plan-panel", "live-panel", "settings-panel", "spotify-panel", "playlists-panel", "quiz-panel", "theme-panel", "scores-panel", "history-panel", "backup-panel", "emergency-panel", "btn-reset"];
  const nodes = [...card.children];
  card.append(main, menu);
  nodes.forEach((n) => { if (n === header) return; if (MENU_IDS.includes(n.id)) return; main.append(n); });
  card.insertBefore(header, main);
  // Twee vakken in de hoofdkolom: links de knoppen (en spiekmeldingen), rechts wat er nu speelt (paneel, nakijken,
  // einde). Op een smal scherm staan ze gewoon onder elkaar, in dezelfde volgorde als voorheen.
  // Drie vakken: links meldingen en "hierna", in het midden de knoppen (centraal), rechts het paneel van de stap
  const left = document.createElement("div"); left.id = "play-left";
  const center = document.createElement("div"); center.id = "play-center";
  const right = document.createElement("div"); right.id = "play-right";
  const SIDE_IDS = ["cheat-alerts", "warnings", "up-next"];
  [...main.children].forEach((n) => (SIDE_IDS.includes(n.id) ? left : n.id === "main-controls" ? center : right).append(n));
  main.append(left, center, right);
  // QR-code voor de telefoonbediening pas laden als iemand het blokje opent
  if (q("phone-remote")) q("phone-remote").addEventListener("toggle", () => {
    if (!q("phone-remote").open) return;
    q("phone-remote-qr").src = "/qr-bediening2.svg?t=" + Date.now();
    fetch("/api/join-url").then((r) => r.json()).then((d) => { q("phone-remote-url").textContent = d.url + "/bediening2.html"; }).catch(() => {});
  });
  MENU_IDS.forEach((id) => { const n = q(id); if (n) menu.append(n); });
  if (q("teams-panel")) q("teams-panel").open = false;
  // inhoudsopgave van het menu
  const index = q("menu-index");
  MENU_IDS.filter((id) => q(id) && q(id).tagName === "DETAILS").forEach((id) => {
    const sum = q(id).querySelector("summary");
    const b = document.createElement("button");
    b.className = "btn-option";
    b.textContent = (sum ? sum.childNodes[0].textContent : id).replace(/\(.*$/, "").trim(); // zonder tellers als "(0 van 2)"
    b.onclick = () => showPanel(id);
    index.append(b);
  });
  // Het menu toont eerst alleen de tegels; een tegel opent alleen dat ene blok (met "⬅️ Alles" terug)
  function showPanel(id) {
    MENU_IDS.forEach((x) => { const d = q(x); if (d) d.classList.toggle("menu-active", x === id); });
    if (id && q(id)) { menu.dataset.view = id; if (q(id).tagName === "DETAILS") q(id).open = true; menu.scrollTop = 0; }
    else delete menu.dataset.view;
  }
  q("menu-back").onclick = () => showPanel(null);
  const openMenu = (id) => { menu.classList.add("open"); showPanel(id || null); };
  q("tb-menu").onclick = () => openMenu();
  q("menu-close").onclick = () => { menu.classList.remove("open"); showPanel(null); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("open")) { menu.classList.remove("open"); showPanel(null); } });
  q("tb-sos").onclick = () => openMenu("emergency-panel");
  // hoogte van de kopbalk doorgeven, zodat de grote knop er netjes onder blijft staan
  const setTop = () => document.documentElement.style.setProperty("--topbar-h", header.offsetHeight + "px");
  setTop(); if (window.ResizeObserver) new ResizeObserver(setTop).observe(header);
  // brede schermen: twee kolommen
  const wide = () => document.body.classList.toggle("wide", window.innerWidth >= 1100);
  wide(); window.addEventListener("resize", wide);
  // bestaande "spring naar blok"-links uit de checklist laten het menu openen
  window.openPanel = (id) => {
    if (wizard.classList.contains("open")) { const i = STEPS.findIndex((st) => (st.panels || []).includes(id)); if (i >= 0) { step = i; render(); } return; }
    openMenu(id);
  };

  // --- stap-voor-stap voorbereiding ---
  const wizard = document.createElement("div");
  wizard.id = "wizard";
  wizard.innerHTML = '<div class="wz-inner"><div style="display:flex; align-items:center; gap:8px;"><h2 id="wz-title" style="margin:0; flex:1;"></h2><button id="wz-close" class="btn-option" style="width:auto; margin:0;">Later</button></div><div id="wz-steps"></div><p id="wz-intro" class="muted" style="font-size:15px; line-height:1.5;"></p><div id="wz-extra"></div><div id="wz-body"></div><div id="wz-nav"><button id="wz-prev" class="btn-option" style="text-align:center;">⬅️ Vorige</button><button id="wz-next" class="btn-primary">Volgende ➡️</button></div></div>';
  document.body.append(wizard);
  const STEPS = [
    { title: "1. Tv aansluiten", intro: "Open op de tv (of de laptop aan de tv) het adres /host.html. Hieronder zie je of de tv verbonden is. Zet op een laptop ook de slaapstand uit.", extra: "tv" },
    { title: "2. Vragenlijst", intro: "Controleer of de juiste vragenlijst is ingelezen en of er waarschuwingen zijn (bijv. ontbrekende foto's of logo's). Upload hier eventueel een nieuwe Excel.", panels: ["quiz-panel"], extra: "warnings" },
    { title: "3. Rondes en volgorde", intro: "Bepaal welke rondes er zijn en in welke volgorde. Na de start ligt dit vast; een extra ronde (bijv. muziek) toevoegen kan tijdens de quiz wel.", panels: ["plan-panel"], done: "plan" },
    { title: "4. Teams", intro: "Stel het maximale aantal teams in. Wil je eerst oefenen? Voeg testteams toe (en verwijder ze daarna weer).", panels: ["teams-panel"] },
    { title: "5. Spotify", intro: "Verbind met Spotify, kies het apparaat bij de speakers en tik op Test. Nodig voor de muziekrondes.", panels: ["spotify-panel"] },
    { title: "6. Hitster-muziek", intro: "Controleer de Hitster-playlists per editie. Optioneel: lijsten bijwerken, aanvullen en jaartallen controleren.", panels: ["playlists-panel"] },
    { title: "7. Thema, geluid en spelregels", intro: "Kies een thema, waar het geluid klinkt, en controleer de punten en tijden.", panels: ["theme-panel", "live-panel", "settings-panel"], done: "theme" },
    { title: "8. Klaar om te beginnen", intro: "Overzicht van alles hierboven. Alles groen? Sluit dit menu en tik op de grote knop om het aanmeldscherm op de tv te zetten. Alles is later nog aan te passen via ⚙️ Instellingen.", panels: ["prep-panel"], last: true }
  ];
  let step = 0, borrowed = [];
  // Blokken terugzetten op hun eigen plek. In omgekeerde volgorde: staan twee geleende blokken in het menu direct
  // na elkaar (zoals Geluid en Instellingen), dan moet het tweede eerst terug, anders bestaat het ankerpunt nog niet.
  function giveBack() {
    borrowed.slice().reverse().forEach(({ node, parent, next }) => {
      if (next && next.parentNode === parent) parent.insertBefore(node, next); else parent.appendChild(node);
    });
    borrowed = [];
  }
  function render() {
    giveBack();
    const st = STEPS[step];
    q("wz-title").textContent = "🧭 " + st.title;
    q("wz-intro").textContent = st.intro;
    q("wz-steps").replaceChildren(...STEPS.map((_, i) => { const s = document.createElement("span"); s.className = i < step ? "done" : i === step ? "now" : ""; return s; }));
    const body = q("wz-body");
    (st.panels || []).forEach((id) => { const n = q(id); if (!n) return; borrowed.push({ node: n, parent: n.parentNode, next: n.nextSibling }); n.classList.remove("hidden"); if (n.tagName === "DETAILS") n.open = true; body.append(n); });
    if (st.done) localStorage.setItem("quiz_prep_" + st.done, "1"); // deze stap gezien = afgevinkt
    q("wz-prev").disabled = step === 0;
    q("wz-next").textContent = st.last ? "✅ Klaar, naar de bediening" : "Volgende ➡️";
    renderExtra();
  }
  function renderExtra() {
    const st = STEPS[step], box = q("wz-extra");
    if (st.extra === "tv") {
      const ok = typeof S !== "undefined" && S && S.tvCount > 0;
      box.innerHTML = `<div class="qbox" style="font-size:20px; text-align:center; border:2px solid ${ok ? "#22c55e" : "#ef4444"};">${ok ? "📺 ✅ De tv is verbonden" : "📺 ⏳ Nog geen tv verbonden…"}</div>`;
    } else if (st.extra === "warnings") {
      const rd = (typeof S !== "undefined" && S && S.readiness) || { ok: true, errors: [], warnings: [] };
      const esc = (x) => String(x).replace(/[<>&]/g, "");
      box.innerHTML = `<div class="qbox" style="border:2px solid ${rd.ok ? "#22c55e" : "#ef4444"}; font-size:14px;"><b style="font-size:17px;">${rd.ok ? "✅ Quiz is startklaar" : "❌ Quiz kan niet starten"}</b>${rd.errors.map((e) => `<br>❌ ${esc(e)}`).join("")}${rd.warnings.length ? `<br><br>⚠️ ${rd.warnings.length} waarschuwing(en):<br>${rd.warnings.slice(0, 10).map(esc).join("<br>")}` : ""}</div>`;
    } else box.replaceChildren();
  }
  function close() { giveBack(); wizard.classList.remove("open"); localStorage.setItem("quiz_wizard_seen", String(Date.now())); }
  q("wz-prev").onclick = () => { if (step > 0) { step--; render(); } };
  q("wz-next").onclick = () => { if (STEPS[step].last) return close(); step++; render(); };
  q("wz-close").onclick = close;
  q("tb-wizard").onclick = () => { step = 0; wizard.classList.add("open"); render(); };
  // live bijwerken (tv-status, waarschuwingen) en automatisch openen vóór de start
  let autoOpened = false;
  socket.on("state_update", (state) => {
    q("tb-wizard").classList.toggle("hidden", state.phase !== "LOBBY");
    // Tijdens de quiz alleen de bediening zelf; instellingen via ⚙️ (ook op een groot scherm niet meer vast in beeld)
    document.body.classList.toggle("playing", state.phase !== "LOBBY");
    if (wizard.classList.contains("open")) renderExtra();
    if (state.phase !== "LOBBY" && wizard.classList.contains("open")) close();
    const seen = Number(localStorage.getItem("quiz_wizard_seen") || 0);
    if (!autoOpened && state.phase === "LOBBY" && !state.teams.length && Date.now() - seen > 12 * 3600e3) { autoOpened = true; step = 0; wizard.classList.add("open"); render(); }
    autoOpened = true;
  });
})();
