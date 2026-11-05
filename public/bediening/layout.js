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
  menu.innerHTML = '<div id="menu-head"><h2 style="margin:0; flex:1; font-size:20px;">⚙️ Instellingen en beheer</h2><button id="menu-close" class="btn-option" style="width:auto; margin:0;">✕ Sluiten</button></div><div id="menu-index"></div>';
  const MENU_IDS = ["teams-panel", "plan-panel", "settings-panel", "spotify-panel", "playlists-panel", "quiz-panel", "theme-panel", "scores-panel", "history-panel", "backup-panel", "emergency-panel", "btn-reset"];
  const nodes = [...card.children];
  card.append(main, menu);
  nodes.forEach((n) => { if (n === header) return; if (MENU_IDS.includes(n.id)) return; main.append(n); });
  card.insertBefore(header, main);
  MENU_IDS.forEach((id) => { const n = q(id); if (n) menu.append(n); });
  if (q("teams-panel")) q("teams-panel").open = false;
  // inhoudsopgave van het menu
  const index = q("menu-index");
  MENU_IDS.filter((id) => q(id) && q(id).tagName === "DETAILS").forEach((id) => {
    const sum = q(id).querySelector("summary");
    const b = document.createElement("button");
    b.className = "btn-option";
    b.textContent = (sum ? sum.childNodes[0].textContent : id).trim();
    b.onclick = () => { MENU_IDS.forEach((x) => { const d = q(x); if (d && d.tagName === "DETAILS" && x !== id) d.open = false; }); q(id).open = true; q(id).scrollIntoView({ behavior: "smooth", block: "start" }); };
    index.append(b);
  });
  const openMenu = (id) => { menu.classList.add("open"); if (id && q(id)) { q(id).open = true; setTimeout(() => q(id).scrollIntoView({ behavior: "smooth", block: "start" }), 50); } };
  q("tb-menu").onclick = () => openMenu();
  q("menu-close").onclick = () => menu.classList.remove("open");
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
    { title: "7. Thema en spelregels", intro: "Kies een thema en controleer de punten, tijden en het spiekgeluid.", panels: ["theme-panel", "settings-panel"], done: "theme" },
    { title: "8. Klaar om te beginnen", intro: "Overzicht van alles hierboven. Alles groen? Sluit dit menu en tik op de grote knop om het aanmeldscherm op de tv te zetten. Alles is later nog aan te passen via ⚙️ Instellingen.", panels: ["prep-panel"], last: true }
  ];
  let step = 0, borrowed = [];
  function giveBack() { borrowed.forEach(({ node, parent, next }) => parent.insertBefore(node, next)); borrowed = []; }
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
    if (wizard.classList.contains("open")) renderExtra();
    if (state.phase !== "LOBBY" && wizard.classList.contains("open")) close();
    const seen = Number(localStorage.getItem("quiz_wizard_seen") || 0);
    if (!autoOpened && state.phase === "LOBBY" && !state.teams.length && Date.now() - seen > 12 * 3600e3) { autoOpened = true; step = 0; wizard.classList.add("open"); render(); }
    autoOpened = true;
  });
})();
