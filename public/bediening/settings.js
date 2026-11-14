// Bediening (quizmaster) – Scores, thema, rondeplan en instellingen.
// Gewone scripts (geen modules): ze delen hun variabelen en worden in vaste volgorde geladen, zie bediening.html.
// ---------------- Scores, thema en rondeplan ----------------
function renderScores(st) {
  const b = st.hostScores;
  if (!b) return $("scores-table").replaceChildren(el("p", "muted", "Na de start verschijnen hier de scores."));
  const hasAdj = b.rows.some((r) => r.adjust);
  QuizFX.renderTable($("scores-table"), {
    columns: ["Team", ...b.rounds.map((r) => r.title), "Slot", ...(hasAdj ? ["Correctie"] : []), "Totaal"],
    rows: b.rows.map((r) => [r.name, ...r.rounds.map((x) => `${x.pts}${x.joker ? "🃏" : ""}`), r.final === null ? "–" : String(r.final), ...(hasAdj ? [r.adjust ? (r.adjust > 0 ? "+" : "") + r.adjust : "–"] : []), String(r.total)])
  });
  // Handmatige correctie (bijv. na een discussie): komt in het logboek en is ongedaan te maken
  const box = el("div");
  box.append(el("h4", "", "✏️ Punten corrigeren"));
  b.rows.forEach((r) => {
    const line = el("div", "line");
    line.append(el("span", "", `${r.name}${r.adjust ? ` (correctie ${r.adjust > 0 ? "+" : ""}${r.adjust})` : ""}`));
    const acts = el("span", "acts");
    [-5, -1, 1, 5].forEach((d) => {
      const btn = el("button", "btn-option btn-small", `${d > 0 ? "+" : ""}${d}`);
      btn.onclick = () => socket.emit("adjust_score", { teamId: r.teamId, delta: d });
      acts.append(btn);
    });
    line.append(acts);
    box.append(line);
  });
  box.append(el("p", "muted", "Ongedaan maken kan met ↶ (de laatste correctie wordt teruggedraaid)."));
  $("scores-table").append(box);
}
let renderedHistoryKey = null;
function renderHistory(entries) {
  const list = Array.isArray(entries) ? entries : [];
  $("history-count").textContent = `(${list.length})`;
  const key = list.map((entry) => entry.gameId).join("|");
  if (key === renderedHistoryKey) return;
  renderedHistoryKey = key;

  const box = $("history-list");
  box.replaceChildren();
  if (!list.length) {
    box.append(el("p", "muted", "Er is nog geen afgeronde quiz opgeslagen. De eerste verschijnt hier na de ontknoping."));
    return;
  }

  list.forEach((entry) => {
    const details = el("details", "qbox");
    const summary = el("summary");
    const date = new Date(entry.completedAt);
    const dateText = Number.isNaN(date.getTime()) ? String(entry.completedAt || "Onbekende datum") : date.toLocaleString("nl-NL");
    const winners = Array.isArray(entry.winners) ? entry.winners : [];
    const winnerText = winners.length > 1 ? `Gedeelde winst: ${winners.join(", ")}` : winners[0] || "Geen winnaar";
    summary.textContent = `${dateText} · ${winnerText} · ${entry.teamCount || 0} teams`;
    details.append(summary);

    const meta = el("p", "muted", `${entry.quiz && entry.quiz.file || "Vragenlijst onbekend"} · ${entry.quiz && entry.quiz.rounds || 0} rondes · Thema: ${entry.theme || "standaard"}`);
    details.append(meta);

    const table = el("div");
    table.style.overflow = "auto";
    table.style.fontSize = "13px";
    const rounds = entry.breakdown && Array.isArray(entry.breakdown.rounds) ? entry.breakdown.rounds : [];
    const rows = entry.breakdown && Array.isArray(entry.breakdown.rows) ? entry.breakdown.rows : [];
    const ranking = Array.isArray(entry.ranking) ? entry.ranking : [];
    QuizFX.renderTable(table, {
      columns: ["Plek", "Team", ...rounds.map((round) => round.title || round.full || "Ronde"), "Slot", "Totaal"],
      rows: ranking.map((team) => {
        const detail = rows.find((row) => row.name === team.name);
        const scores = detail && Array.isArray(detail.rounds) ? detail.rounds : [];
        return [
          team.rank ? `${team.rank}.` : "–",
          team.name,
          ...rounds.map((round, index) => {
            const score = scores[index];
            return score ? `${score.pts}${score.joker ? " 🃏" : ""}` : "–";
          }),
          detail && detail.final !== null ? String(detail.final) : "–",
          String(team.score)
        ];
      })
    });
    details.append(table);
    box.append(details);
  });
}
const THEME_NAMES = { standaard: "Standaard", winter: "❄️ Winter", kerst: "🎄 Kerst", oudennieuw: "🥂 Oud & nieuw", zomer: "☀️ Zomer", halloween: "🎃 Halloween", tvshow: "📺 Tv-show", feest: "🎈 Feest", sinterklaas: "🎁 Sinterklaas", disco: "🪩 Disco" };
function renderThemes(st) {
  $("theme-badge").textContent = THEME_NAMES[st.theme] || st.theme;
  const box = $("theme-list");
  if (box.childElementCount !== st.themes.length) {
    box.replaceChildren();
    st.themes.forEach((t) => { const bt = el("button", "btn-option btn-small", THEME_NAMES[t] || t); bt.dataset.t = t; bt.onclick = () => socket.emit("set_theme", { theme: t }); box.append(bt); });
  }
  box.querySelectorAll("button").forEach((bt) => { bt.style.outline = bt.dataset.t === st.theme ? "2px solid #fbbf24" : ""; });
}
// Concept van de rondevolgorde: pas na "opslaan" naar de server (alleen vóór de start)
let planDraft = [], planKey = "", planLocked = false;
function renderPlan(st) {
  planLocked = st.phase !== "LOBBY";
  $("plan-note").textContent = planLocked
    ? "De quiz is begonnen: de volgorde ligt vast. Een extra ronde kun je nog wel toevoegen; die komt direct na de huidige ronde."
    : "Zet de rondes in volgorde (▲▼) en zet ze aan of uit; daarna opslaan. Extra rondes kun je hieronder toevoegen, ook later tijdens de quiz.";
  $("plan-save").classList.toggle("hidden", planLocked);
  const key = JSON.stringify(st.plan);
  if (key !== planKey) { planKey = key; planDraft = st.plan.map((x) => ({ ...x })); }
  drawPlan();
  renderExtra(st);
}
function drawPlan() {
  const box = $("plan-list");
  box.replaceChildren();
  planDraft.forEach((r, i) => {
    const row = el("div", "line");
    const left = el("span", "", `${i + 1}. ${r.title}${r.extra ? " ✨" : ""}${r.started ? " (gespeeld)" : ""}`);
    if (!r.on) left.style.opacity = "0.45";
    const right = el("span");
    const mk = (label, fn, dis) => { const bt = el("button", "btn-option tg", label); bt.disabled = dis; bt.onclick = () => { fn(); drawPlan(); }; bt.style.marginLeft = "4px"; right.append(bt); };
    if (!planLocked) {
      mk("▲", () => { [planDraft[i - 1], planDraft[i]] = [planDraft[i], planDraft[i - 1]]; }, i === 0);
      mk("▼", () => { [planDraft[i + 1], planDraft[i]] = [planDraft[i], planDraft[i + 1]]; }, i === planDraft.length - 1);
      mk(r.on ? "aan" : "uit", () => { r.on = !r.on; });
    }
    if (r.extra && !r.started) {
      const del = el("button", "btn-option tg", "🗑");
      del.style.marginLeft = "4px";
      del.onclick = () => { if (confirm(`"${r.title}" verwijderen?`)) socket.emit("remove_extra", { id: r.id }); };
      right.append(del);
    }
    row.append(left, right);
    box.append(row);
  });
}
let extraKey = "";
function renderExtra(st) {
  const opt = st.extraOptions;
  const key = JSON.stringify(opt);
  if (key !== extraKey) {
    extraKey = key;
    const sel = $("extra-base");
    const keep = sel.value;
    sel.replaceChildren(...opt.rounds.map((r) => new Option(r.title, r.id)));
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
    const cat = $("extra-cat");
    cat.replaceChildren(...opt.categories.map((c) => new Option(c.name, c.id)));
  }
  const r = opt.rounds.find((x) => x.id === $("extra-base").value);
  $("extra-cat-row").classList.toggle("hidden", !(r && r.type === "hitster"));
  $("extra-add").disabled = st.phase === "END" || !opt.rounds.length;
  $("extra-note").textContent = "Speel 30 Seconds, tekenen of de muziek nog een keer. Een extra ronde is evenveel punten waard als elke andere ronde; er is geen oefenronde. Bij muziek kies je een categorie zoals in Hitster: de liedjes worden dan automatisch op Spotify gezocht (zonder Spotify: iTunes-fragmenten) en de tijdlijnen beginnen opnieuw.";
}
$("extra-base").onchange = () => { const r = S && S.extraOptions.rounds.find((x) => x.id === $("extra-base").value); $("extra-cat-row").classList.toggle("hidden", !(r && r.type === "hitster")); };
$("extra-add").onclick = () => {
  const base = $("extra-base").value;
  const r = S.extraOptions.rounds.find((x) => x.id === base);
  const category = r && r.type === "hitster" ? $("extra-cat").value : null;
  if (confirm(`Extra ronde toevoegen: ${r ? r.title : base}${category ? " (" + $("extra-cat").selectedOptions[0].textContent + ")" : ""}?`)) socket.emit("add_extra", { base, category });
};
$("plan-save").onclick = () => socket.emit("set_plan", { plan: planDraft.map((r) => ({ id: r.id, on: r.on, base: r.base || undefined, category: r.category || undefined })) });
