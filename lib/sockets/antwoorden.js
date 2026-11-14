// Spelers: antwoorden, prijzen, muziek, geheugen, tekenen, joker/slotvraag en spiekmeldingen
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    G,
    applyOp,
    baseContext,
    broadcastState,
    cancelCheat,
    cheatSensitive,
    cleanOp,
    cleanText,
    connectedDevices,
    cur,
    deviceOf,
    drawGuessOk,
    timelineFor,
    io,
    isRemote,
    logoMatches,
    newId,
    norm,
    noteAnswer,
    num,
    scheduleSave,
    ss,
    startCheatWait,
    sync
  } = api;
  // ---------- Antwoorden: meerkeuze, foto's en logo's ----------
  socket.on('submit_answer', ({ stepId, value } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const step = cur();
    if (step && step.kind === 'final') return submitFinalAnswer(socket, stepId, value, reply);
    if (step && step.kind === 'tiebreak') return submitTiebreak(socket, value, reply);
    const c = baseContext(socket, 'mc');
    const late = !!(c && c.s.status === 'closed' && c.s.late && c.s.late[c.team.teamId]);
    if (!c || (c.s.status !== 'open' && !late)) return reply({ ok: false, reason: 'not_open' });
    // Testvraag: elke telefoon dient zijn eigen antwoord in. Het antwoord van de basistelefoon geldt als teamantwoord
    // (voor de vinkjes op de tv); heeft die nog niet geantwoord, dan het eerste antwoord van het team.
    if (api.everyoneAnswers(c.step)) {
      if (stepId !== c.step.id) return reply({ ok: false, reason: 'wrong_question' });
      if (!Number.isInteger(value) || value < 0 || value >= c.step.options.length) return reply({ ok: false, reason: 'invalid' });
      c.s.personal = c.s.personal || {};
      if (c.s.personal[c.device.deviceId]) return reply({ ok: true, already: true });
      c.s.personal[c.device.deviceId] = { v: value, t: Date.now() };
      if (c.isBase || !c.s.answers[c.team.teamId]) c.s.answers[c.team.teamId] = { v: value, step: c.s.blurStep, t: Date.now() };
      reply({ ok: true });
      return sync();
    }
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (stepId !== c.step.id) return reply({ ok: false, reason: 'wrong_question' });
    if (!Number.isInteger(value) || value < 0 || value >= c.step.options.length) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId]) return reply({ ok: true, already: true });
    if (late) delete c.s.late[c.team.teamId];
    c.s.answers[c.team.teamId] = { v: value, step: c.s.blurStep, t: Date.now() };
    noteAnswer(c.s, c.team.teamId);
    reply({ ok: true });
    sync();
  });
  function submitFinalAnswer(sock, stepId, value, reply) {
    const c = baseContext(sock, 'final');
    if (!c || c.s.status !== 'question') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (!Number.isInteger(value) || value < 0 || value >= c.step.options.length) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId] !== undefined) return reply({ ok: true, already: true });
    c.s.answers[c.team.teamId] = value;
    reply({ ok: true });
    sync();
  }
  function submitTiebreak(sock, value, reply) {
    const c = baseContext(sock, 'tiebreak');
    if (!c || c.s.status !== 'open' || !(c.s.teams || []).includes(c.team.teamId)) return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (!Number.isFinite(value) || Math.abs(value) > 1e12) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId] !== undefined) return reply({ ok: true, already: true });
    c.s.answers[c.team.teamId] = value;
    (c.s.at || (c.s.at = {}))[c.team.teamId] = Date.now(); // bij gelijke afstand wint wie het eerst antwoordde
    reply({ ok: true });
    sync();
  }

  // ---------- Prijzen ----------
  socket.on('submit_price', ({ stepId, now, ago } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'price');
    if (!c || c.s.status !== 'open') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (stepId !== c.step.id) return reply({ ok: false, reason: 'wrong_question' });
    if (!num(now, 0, 100000) || !num(ago, 0, 100000)) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId]) return reply({ ok: true, already: true });
    c.s.answers[c.team.teamId] = { now: Math.round(now * 100) / 100, ago: Math.round(ago * 100) / 100 };
    noteAnswer(c.s, c.team.teamId);
    reply({ ok: true });
    sync();
  });

  // ---------- Muziek: kaart in de tijdlijn leggen ----------
  socket.on('place_card', ({ stepId, slot, year, title, artist } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'song');
    if (!c || c.s.status !== 'open') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    const tl = timelineFor(c.team, c.step);
    if (stepId !== c.step.id || !Number.isInteger(slot) || slot < 0 || slot > tl.length) return reply({ ok: false, reason: 'invalid' });
    if (c.s.placements[c.team.teamId] !== undefined) return reply({ ok: true, already: true });
    c.s.placements[c.team.teamId] = slot;
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) c.s.years[c.team.teamId] = year;
    const tTitle = cleanText(title, 80), tArtist = cleanText(artist, 80);
    if (tTitle || tArtist) (c.s.guesses = c.s.guesses || {})[c.team.teamId] = { title: tTitle, artist: tArtist };
    reply({ ok: true });
    sync();
  });

  // Hitster-bonus: quizmaster keurt titel/artiest goed of af (na het onthullen)
  socket.on('song_judge', ({ stepId, teamId, field, ok } = {}) => {
    const step = cur();
    if (!isRemote(socket) || !step || step.kind !== 'song' || step.id !== stepId || !['title', 'artist'].includes(field) || !G.teams[teamId]) return;
    const s = ss(step);
    if (s.status !== 'revealed') return;
    s.judge = s.judge || {};
    s.judge[teamId] = { ...(s.judge[teamId] || {}), [field]: !!ok, auto: false };
    sync();
  });

  // ---------- Geheugen: samen opschrijven ----------
  socket.on('memory_add', ({ text } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'memory');
    if (!c || c.s.status !== 'writing') return reply({ ok: false });
    if (!c.isBase) return reply({ ok: false, message: 'Alleen de basistelefoon kan antwoorden indienen.' });
    const clean = cleanText(text, 60);
    if (!clean) return reply({ ok: false });
    const list = (c.s.entries[c.team.teamId] = c.s.entries[c.team.teamId] || []);
    if (list.length >= 80) return reply({ ok: false, message: 'Dat zijn er genoeg!' });
    if (list.some((e) => norm(e.text) === norm(clean))) return reply({ ok: false, message: 'Dat staat er al.' });
    list.push({ id: newId('e_'), text: clean, by: c.device.label, ok: null });
    reply({ ok: true });
    sync();
  });
  socket.on('memory_remove', ({ id } = {}) => {
    const c = baseContext(socket, 'memory');
    if (!c || c.s.status !== 'writing' || !c.isBase) return;
    const list = c.s.entries[c.team.teamId] || [];
    const i = list.findIndex((e) => e.id === id);
    if (i >= 0) { list.splice(i, 1); sync(); }
  });

  // ---------- Tekenen ----------
  function drawTurnFor(sock) {
    const c = baseContext(sock, 'draw');
    if (!c || c.s.status !== 'drawing') return null;
    const turn = c.s.turns[c.s.turn];
    return turn ? { ...c, turn } : null;
  }
  socket.on('draw_ops', ({ ops } = {}) => {
    const c = drawTurnFor(socket);
    if (!c || !Array.isArray(ops)) return;
    if (c.turn.drawers[c.team.teamId] !== c.device.deviceId) return;
    const clean = ops.slice(0, 40).map(cleanOp).filter(Boolean);
    if (!clean.length) return;
    const strokes = c.turn.strokes[c.team.teamId];
    clean.forEach((op) => applyOp(strokes, op));
    for (const d of connectedDevices(c.team)) if (d.deviceId !== c.device.deviceId && d.socketId) io.to(d.socketId).emit('draw_ops', { ops: clean });
    io.to('tv_room').emit('draw_ops_tv', { team: c.team.name, turn: ss(cur()).turn, ops: clean }); // live meekijken op de tv
    scheduleSave();
  });
  // Nieuwe of herstelde telefoon vraagt de hele tekening op
  socket.on('draw_get', (_, cb) => {
    if (typeof cb !== 'function') return;
    const device = deviceOf(socket);
    const step = cur();
    const team = device && G.teams[device.teamId];
    if (!team || !step || step.kind !== 'draw') return cb({ strokes: [] });
    const s = ss(step);
    const turn = s.turns[s.turn];
    cb({ strokes: turn && turn.strokes[team.teamId] ? turn.strokes[team.teamId] : [] });
  });
  socket.on('draw_guess', ({ text } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = drawTurnFor(socket);
    if (!c) return reply({ ok: false, reason: 'not_open' });
    const id = c.team.teamId;
    if (!c.turn.words[id]) return reply({ ok: false, reason: 'not_open' });
    if (c.turn.answerers[id] !== c.device.deviceId) return reply({ ok: false, reason: 'not_base' });
    if (c.turn.answers[id]) return reply({ ok: true, already: true });
    const clean = cleanText(text, 40);
    if (!clean) return reply({ ok: false, reason: 'invalid' });
    c.turn.answers[id] = { text: clean, at: Date.now() };
    c.turn.ok[id] = drawGuessOk(c.turn.words[id], clean); // voorstel; de quizmaster beslist
    reply({ ok: true });
    sync();
  });
  socket.on('submit_text', ({ stepId, text } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'logo');
    if (!c || c.s.status !== 'open') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (stepId !== c.step.id) return reply({ ok: false, reason: 'wrong_question' });
    const clean = cleanText(text, 40);
    if (!clean) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId]) return reply({ ok: true, already: true });
    c.s.answers[c.team.teamId] = { text: clean, at: Date.now(), step: c.s.blurStep || 0 };
    noteAnswer(c.s, c.team.teamId);
    c.s.judged[c.team.teamId] = logoMatches(c.step, clean); // voorstel; de quizmaster beslist
    reply({ ok: true });
    sync();
  });

  // ---------- Joker en slotvraag ----------
  socket.on('joker_choose', ({ roundId } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'joker');
    if (!c || !c.isBase) return reply({ ok: false });
    if (!G.roundById[roundId]) return reply({ ok: false });
    c.team.jokerRound = roundId;
    c.s.choices[c.team.teamId] = roundId;
    reply({ ok: true });
    sync();
  });
  socket.on('final_wager', ({ amount } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'final');
    if (!c || !c.isBase || c.s.status !== 'wager') return reply({ ok: false });
    const max = G.settings.finalMaxWager;
    if (!Number.isInteger(amount) || amount < 0 || amount > max) return reply({ ok: false, message: `Je kunt tussen 0 en ${max} punten inzetten.` });
    c.s.wagers[c.team.teamId] = amount;
    reply({ ok: true });
    sync();
  });

  // ---------- Anti-spiek: de melding blijft staan tot de speler terug is ----------
  socket.on('player_blurred', ({ reason, t } = {}) => {
    const step = cur();
    if (!step || !cheatSensitive(step) || G.paused) return;
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return;
    if (Number.isFinite(t) && device.lastBackT && t < device.lastBackT) return; // te laat aangekomen bericht
    startCheatWait(device, step);
  });
  socket.on('player_back', ({ t } = {}) => {
    const device = deviceOf(socket);
    if (!device) return;
    cancelCheat(device.deviceId); // binnen de wachttijd terug: geen melding
    if (Number.isFinite(t)) device.lastBackT = t;
    if (G.alerts[device.deviceId]) { delete G.alerts[device.deviceId]; broadcastState(); }
  });

  // Pauzedilemma: elke telefoon kan stemmen (A of B), en tot het volgende dilemma nog van mening veranderen
  socket.on('vote_dilemma', ({ choice } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    if (!device || !G.teams[device.teamId]) return reply({ ok: false });
    if (!(G.paused && G.dilemma && G.dilemma.visible) || !['a', 'b'].includes(choice)) return reply({ ok: false });
    G.dilemma.votes[device.deviceId] = choice;
    reply({ ok: true });
    sync();
  });
};
