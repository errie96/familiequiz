// Bediening: noodknoppen, instellingen, teams, vragenlijst, Spotify/Hitster, geluid
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    DATA_DIR,
    EXTRA_TYPES,
    G,
    HITSTER_CATS,
    JSON_BASE,
    LIB_UPLOAD,
    LOG,
    MAX_DEVICES_PER_TEAM,
    MAX_LABEL,
    MAX_TEAM_NAME,
    PHOTOS_FILE,
    STATE_FILE,
    THEMES,
    UNDO_LIMIT,
    XLSX_UPLOAD,
    addBots,
    applyUndoEntry,
    archiveAllPhotos,
    backupNow,
    botSockets,
    broadcastState,
    cleanText,
    cleanTrack,
    cur,
    currentLibraryFile,
    deviceOf,
    editLibrary,
    findTeamByName,
    fromExcel,
    fs,
    inEra,
    io,
    isQuizWorkbook,
    isRemote,
    labelTaken,
    libraryFromExcel,
    loadQuiz,
    noteDropped,
    notifyTeam,
    planOrder,
    playlistIdOf,
    pushUndo,
    rebuildPlaylists,
    removeStateFiles,
    removeTeam,
    replan,
    reportError,
    roundStarted,
    sanitizeSettings,
    savePlaylists,
    serverErrors,
    songOf,
    ss,
    startCheatWait,
    sync,
    teamDevices,
    timerClear,
    updateLibrary
  } = api;
  // ---------- Bediening: noodknoppen ----------
  socket.on('set_max_teams', ({ n } = {}) => {
    if (!isRemote(socket) || G.phase === 'END') return;
    if (!Number.isInteger(n) || n < 1 || n > 50) return socket.emit('host_error', { message: 'Kies een aantal tussen 1 en 50.' });
    G.settings.maxTeams = n;
    sync();
  });
  socket.on('set_theme', ({ theme } = {}) => {
    if (!isRemote(socket) || !THEMES.includes(theme)) return;
    G.settings.theme = theme;
    sync();
  });
  socket.on('set_plan', ({ plan } = {}) => {
    if (!isRemote(socket)) return;
    if (G.phase !== 'LOBBY') return socket.emit('host_error', { message: 'De volgorde kan alleen vóór de start worden aangepast. Een extra ronde toevoegen kan wel.' });
    const clean = sanitizeSettings({ roundPlan: plan }, G.settings).roundPlan || [];
    replan(clean);
    sync();
  });
  socket.on('add_extra', ({ base, category } = {}) => {
    if (!isRemote(socket)) return;
    if (G.phase === 'END') return socket.emit('host_error', { message: 'De quiz is al afgelopen.' });
    const b = ((G.baseRaw && G.baseRaw.rounds) || []).find((r) => r.id === base);
    if (!b || !EXTRA_TYPES.includes(b.type)) return;
    const order = planOrder();
    let n = 1;
    while (order.some((p) => p.id === `${base}x${n}`)) n++;
    const entry = { id: `${base}x${n}`, base, on: true, category: b.type === 'hitster' ? (HITSTER_CATS[category] ? category : 'original') : undefined };
    // Tijdens de quiz komt de extra ronde direct na de huidige ronde; anders achteraan
    let pos = order.length;
    if (G.phase === 'PLAY' && cur()) { const k = order.findIndex((p) => p.id === cur().round); if (k >= 0) pos = k + 1; }
    order.splice(pos, 0, entry);
    replan(order);
    sync();
  });
  socket.on('remove_extra', ({ id } = {}) => {
    if (!isRemote(socket)) return;
    const order = planOrder();
    const p = order.find((x) => x.id === id && x.base);
    if (!p) return;
    if (roundStarted(id)) return socket.emit('host_error', { message: 'Deze ronde is al begonnen.' });
    replan(order.filter((x) => x.id !== id));
    sync();
  });
  socket.on('lobby_stage', ({ stage } = {}) => {
    if (!isRemote(socket) || G.phase !== 'LOBBY') return;
    G.lobbyStage = stage === 'join' ? 'join' : 'welcome';
    sync();
  });
  socket.on('update_settings', (partial) => {
    if (!isRemote(socket)) return;
    if (G.phase !== 'LOBBY') return socket.emit('host_error', { message: 'Instellingen kunnen alleen vóór de start worden gewijzigd.' });
    G.settings = sanitizeSettings(partial, G.settings);
    sync();
  });
  // Vragenlijst opnieuw inlezen of een nieuw Excel-bestand uploaden (alleen voor de start)
  socket.on('reload_quiz', () => {
    if (!isRemote(socket)) return;
    if (G.phase !== 'LOBBY') return socket.emit('host_error', { message: 'De vragen kunnen alleen vóór de start opnieuw worden ingelezen.' });
    loadQuiz();
    G.ssAll = {};
    G.undoHistory = [];
    Object.values(G.teams).forEach((t) => { t.timelines = {}; });
    sync();
  });
  socket.on('upload_xlsx', (data, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'Uploaden kan alleen vóór de start.' });
    let buf;
    try { buf = Buffer.isBuffer(data) ? data : Buffer.from(data); } catch (e) { return reply({ ok: false, message: 'Ongeldig bestand.' }); }
    if (!buf.length || buf.length > 5e6) return reply({ ok: false, message: 'Het bestand is leeg of te groot (max 5 MB).' });
    // Vragenlijst of Hitster-bibliotheek? Dat zien we aan de tabbladen.
    let kind;
    try {
      if (isQuizWorkbook(buf)) { fromExcel(buf, JSON_BASE); kind = 'quiz'; }
      else {
        const lib = libraryFromExcel(buf);
        if (!lib.library.length) return reply({ ok: false, message: 'Dit bestand bevat geen vragenlijst en ook geen Hitster-tabbladen ("Hitster - <categorie>").' });
        kind = 'library';
      }
    } catch (e) {
      return reply({ ok: false, message: `Dit is geen leesbaar .xlsx-bestand (${e.message}).` });
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(kind === 'quiz' ? XLSX_UPLOAD : LIB_UPLOAD, buf);
    } catch (e) { return reply({ ok: false, message: 'Opslaan mislukte: ' + e.message }); }
    loadQuiz();
    G.ssAll = {};
    Object.values(G.teams).forEach((t) => { t.timelines = {}; });
    backupNow('upload');
    reply({ ok: true, kind, songs: G.librarySource ? G.librarySource.count : 0, warnings: G.content.warnings.length });
    sync();
  });
  socket.on('clear_answer', ({ teamId } = {}) => {
    if (!isRemote(socket)) return;
    const team = G.teams[teamId];
    const step = cur();
    if (!team || !step || !['mc', 'price', 'final', 'tiebreak', 'logo'].includes(step.kind)) return;
    const s = ss(step);
    const allowed = step.kind === 'final' || step.kind === 'tiebreak'
      ? s.status === 'question' || s.status === 'open'
      : s.status === 'open' || (step.kind === 'mc' && s.status === 'closed');
    if (allowed && (Object.prototype.hasOwnProperty.call(s.answers || {}, teamId) || Object.prototype.hasOwnProperty.call(s.judged || {}, teamId))) {
      pushUndo(G.undoHistory, { type: 'clear_answer', stepId: step.id, teamId,
        answerPresent: Object.prototype.hasOwnProperty.call(s.answers || {}, teamId), answer: s.answers && s.answers[teamId],
        judgedPresent: Object.prototype.hasOwnProperty.call(s.judged || {}, teamId), judged: s.judged && s.judged[teamId],
        status: s.status, label: `antwoord van ${G.teams[teamId] ? G.teams[teamId].name : 'team'} herstellen` }, UNDO_LIMIT);
      delete s.answers[teamId];
      if (s.judged) delete s.judged[teamId];
      if (step.kind === 'mc' && s.status === 'closed') s.status = 'open';
    }
    sync();
  });
  socket.on('void_question', ({ mode } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'mc') return;
    const s = ss(step);
    if (mode === 'void' || mode === 'all_correct') {
      if (s.voided !== mode) { pushUndo(G.undoHistory, { type: 'void_question', stepId: step.id, before: s.voided ?? null, label: 'vraagbeoordeling' }, UNDO_LIMIT); s.voided = mode; }
    } else if (mode === null) {
      if (s.voided !== null) { pushUndo(G.undoHistory, { type: 'void_question', stepId: step.id, before: s.voided ?? null, label: 'vraagbeoordeling' }, UNDO_LIMIT); s.voided = null; }
    } else return;
    sync();
  });
  // Handmatige correctie van de punten (bijv. na een discussie): +1/−1/+5/−5, met logboek en ongedaan maken
  socket.on('adjust_score', ({ teamId, delta } = {}) => {
    const team = G.teams[teamId];
    const d = Number(delta);
    if (!isRemote(socket) || !team || !Number.isInteger(d) || d === 0 || Math.abs(d) > 50) return;
    team.adjust = (team.adjust || 0) + d;
    pushUndo(G.undoHistory, { type: 'adjust', teamId, delta: d, label: `${d > 0 ? '+' : ''}${d} voor ${team.name}` });
    LOG.info('correctie', { team: team.name, punten: d, totaalCorrectie: team.adjust });
    sync();
  });
  socket.on('undo_last', () => {
    if (!isRemote(socket)) return;
    const entry = G.undoHistory[G.undoHistory.length - 1];
    if (!entry) return socket.emit('host_error', { message: 'Er is niets om ongedaan te maken.' });
    if (entry.type === 'adjust') {
      if (!G.teams[entry.teamId]) return socket.emit('host_error', { message: 'Dit team bestaat niet meer.' });
      G.teams[entry.teamId].adjust = (G.teams[entry.teamId].adjust || 0) - entry.delta;
      G.undoHistory.pop();
      return sync();
    }
    if (!applyUndoEntry(entry, G.steps, G.ssAll)) return socket.emit('host_error', { message: 'Deze correctie kan niet meer worden teruggedraaid.' });
    G.undoHistory.pop();
    sync();
  });
  socket.on('alert_dismiss', ({ key } = {}) => {
    if (!isRemote(socket)) return;
    if (key === 'all') G.alerts = {}; else delete G.alerts[key];
    sync();
  });
  socket.on('rename_team', ({ teamId, name } = {}) => {
    if (!isRemote(socket)) return;
    const team = G.teams[teamId];
    const clean = cleanText(name, MAX_TEAM_NAME);
    if (!team || !clean) return;
    if (findTeamByName(clean, teamId)) return socket.emit('host_error', { message: `De teamnaam "${clean}" is al in gebruik.` });
    team.name = clean;
    sync();
  });
  // Speler past zijn eigen naam aan (instellingen op de telefoon)
  socket.on('rename_self', ({ name } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    const clean = cleanText(name, MAX_LABEL);
    if (!team) return reply({ ok: false, message: 'Je zit niet (meer) in een team.' });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'Je naam kan niet meer veranderen nu de quiz is begonnen. Vraag het de quizmaster.' });
    if (!clean) return reply({ ok: false, message: 'Vul een naam in.' });
    if (labelTaken(team, clean, device.deviceId)) return reply({ ok: false, message: `In jullie team heet al iemand ${clean}.` });
    device.label = clean;
    reply({ ok: true });
    sync();
  });
  socket.on('rename_player', ({ deviceId, name } = {}) => {
    if (!isRemote(socket)) return;
    const device = G.devices[deviceId];
    const team = device && G.teams[device.teamId];
    const clean = cleanText(name, MAX_LABEL);
    if (!team || !clean) return;
    if (labelTaken(team, clean, device.deviceId)) return socket.emit('host_error', { message: `In team ${team.name} zit al iemand die ${clean} heet.` });
    device.label = clean;
    sync();
  });
  socket.on('move_player', ({ deviceId, teamId } = {}) => {
    if (!isRemote(socket)) return;
    const device = G.devices[deviceId];
    const from = device && G.teams[device.teamId];
    const to = G.teams[teamId];
    if (!device || !from || !to || from === to) return;
    if (teamDevices(from).length <= 1) return socket.emit('host_error', { message: `${device.label} is de enige telefoon van team ${from.name}. Verplaats eerst iemand anders, of verwijder het team.` });
    if (teamDevices(to).length >= MAX_DEVICES_PER_TEAM) return socket.emit('host_error', { message: `Team ${to.name} zit vol.` });
    if (labelTaken(to, device.label)) return socket.emit('host_error', { message: `In team ${to.name} zit al iemand die ${device.label} heet. Wijzig eerst een van de namen.` });
    const wasBase = from.baseDeviceId === device.deviceId;
    device.teamId = to.teamId;
    from.proposal = null;
    to.proposal = null;
    if (wasBase) {
      const rest = teamDevices(from);
      const nextBase = rest.find((d) => d.connected) || rest[0];
      from.baseDeviceId = nextBase.deviceId;
      from.baseApprovals = rest.map((d) => d.deviceId); // door de quizmaster geregeld
      notifyTeam(from, `${device.label} is verplaatst. ${nextBase.label} is nu de basistelefoon.`);
    } else notifyTeam(from, `${device.label} is verplaatst naar een ander team.`);
    if (device.connected && device.socketId) io.to(device.socketId).emit('team_notice', { text: `De quizmaster heeft je verplaatst naar team ${to.name}.` });
    notifyTeam(to, `${device.label} is toegevoegd aan jullie team.`);
    sync();
  });
  socket.on('set_base', ({ deviceId } = {}) => {
    if (!isRemote(socket)) return;
    const device = G.devices[deviceId];
    const team = device && G.teams[device.teamId];
    if (!team) return;
    team.baseDeviceId = device.deviceId;
    team.proposal = null;
    team.baseApprovals = teamDevices(team).map((d) => d.deviceId); // de quizmaster beslist: geldt voor het hele team
    notifyTeam(team, `De quizmaster heeft ${device.label} aangewezen als basistelefoon.`);
    sync();
  });
  socket.on('remove_team', ({ teamId } = {}) => {
    if (!isRemote(socket) || !G.teams[teamId]) return;
    removeTeam(teamId);
    sync();
  });
  socket.on('reset_quiz', () => {
    if (!isRemote(socket)) return;
    backupNow('voor-reset', true); // eerst een kopie: een reset is anders definitief
    G.phase = 'LOBBY'; G.stepIndex = 0; G.paused = false; G.showStandings = false; G.review = null; G.reveal = 'idle'; G.revealN = 0; G.lobbyStage = 'welcome'; G.endView = 'ranking';
    G.ssAll = {}; G.teams = {}; G.devices = {}; G.alerts = {}; G.dynSongs = {}; G.dynStart = {}; G.playlistFailed = {}; G.teamPhotos = {}; G.rejectedKeys = []; G.awardStats = {}; Object.keys(botSockets).forEach((k) => delete botSockets[k]); serverErrors.length = 0; G.undoHistory = []; G.gameId = null;
    timerClear();
    // Een reset is bewust definitief: voorkom dat een oude reservekopie de vorige quiz terugzet.
    try { removeStateFiles(STATE_FILE); removeStateFiles(PHOTOS_FILE); } catch (e) { console.error('Opschonen van quizopslag mislukt:', e.message); }
    try { archiveAllPhotos(); } catch (e) { reportError('foto-archief', e); } // nieuw, leeg album
    io.emit('quiz_reset');
    broadcastState();
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'tv') { setTimeout(broadcastState, 50); LOG.warn('tv_weg', {}); } // bediening ziet meteen dat de tv weg is
    const device = G.devices[socket.data.deviceId];
    if (device && device.socketId === socket.id && G.teams[device.teamId]) LOG.info('telefoon_weg', { team: G.teams[device.teamId].name, speler: device.label, basis: G.teams[device.teamId].baseDeviceId === device.deviceId });
    if (device && device.socketId === socket.id) {
      noteDropped(device);
      device.connected = false;
      // Verbinding weg tijdens een vraag telt ook als 'weg' (een vergrendelde telefoon stuurt soms geen bericht meer);
      // komt de telefoon binnen de wachttijd terug, dan vervalt de melding vanzelf
      if (!device.bot) startCheatWait(device, cur());
      sync();
    }
  });
  // Instelling die altijd mag wijzigen: tussenstand na elke ronde op de tv
  // Hitster-playlist per categorie instellen (link of id); leeg = weghalen
  socket.on('set_playlists', ({ playlists } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false });
    for (const [cat, p] of Object.entries(playlists || {})) {
      if (!HITSTER_CATS[cat]) continue;
      const id = p && playlistIdOf(typeof p === 'string' ? p : p.id);
      if (!id) { G.playlistOverrides[cat] = null; continue; }
      if (G.hitsterPlaylists[cat] && G.hitsterPlaylists[cat].id === id && !(p && p.name)) continue; // ongewijzigd
      G.playlistOverrides[cat] = { id, name: String((p && p.name) || '').slice(0, 120) || 'Zelf ingesteld', total: Number(p && p.total) || null };
    }
    rebuildPlaylists();
    savePlaylists();
    reply({ ok: true });
    sync();
  });
  // Jaartal controleren: de bediening zoekt via Spotify het jaar van de eerste uitgave op (alleen nummers met "Jaar check")
  socket.on('verify_year', ({ songId, year } = {}) => {
    if (!isRemote(socket)) return;
    const song = G.songs[songId];
    if (!song || song.verified) return;
    const y = Number(year);
    if (Number.isInteger(y) && y >= 1900 && y < song.year) {
      song.year = y;
      G.yearFixes[song.key] = y;
      // Startkaarten opnieuw op volgorde leggen
      for (const team of Object.values(G.teams)) for (const tl of Object.values(team.timelines || {})) if (tl.includes(songId)) tl.sort((a, b) => G.songs[a].year - G.songs[b].year);
    }
    song.verified = true;
    // Battle of the Generations: valt het echte jaar buiten het tijdvak, dan een ander nummer
    const step = cur();
    const round = step && G.roundById[step.round];
    if (step && step.kind === 'song' && step.dynamic && round && !inEra(round.category, song.year)) {
      const s = ss(step);
      if (s.songId === songId && !Object.keys(s.placements).length && s.status !== 'revealed') {
        G.rejectedKeys.push(song.key);
        s.songId = null;
        if (!songOf(step)) s.status = 'loading';
      }
    }
    sync();
  });
  // ---- Jaartallen vooraf controleren en lijsten aanvullen uit de Hitster-playlists ----
  // De bediening doet de Spotify-zoekopdrachten; de server schrijft de uitkomst in de Hitster-Excel.
  socket.on('library_checklist', ({ category } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    const file = currentLibraryFile();
    if (!file) return reply({ ok: false, message: 'Geen Hitster-bibliotheek gevonden.' });
    const { library } = libraryFromExcel(file);
    const list = library.filter((song) => song.check && (!category || category === 'all' || song.category === category))
      .map((song) => ({ category: song.category, title: song.title, artist: song.artist, year: song.year }));
    reply({ ok: true, list, total: library.length });
  });
  const writeLibraryEdits = (edits) => {
    const file = currentLibraryFile();
    if (!file) throw new Error('Geen Hitster-bibliotheek gevonden.');
    const { buf, report } = editLibrary(fs.readFileSync(file), edits);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LIB_UPLOAD, buf);
    return report;
  };
  socket.on('library_year_results', ({ results, done } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    const edits = {};
    for (const r of Array.isArray(results) ? results.slice(0, 500) : []) {
      if (!r || !HITSTER_CATS[r.category] || typeof r.title !== 'string') continue;
      (edits[r.category] = edits[r.category] || { years: [] }).years.push({ title: r.title, artist: String(r.artist || ''), year: Number(r.year), ok: !!r.ok });
      // ook meteen in de lopende quiz gebruiken
      const key = `${r.title}|${r.artist || ''}`.toLowerCase();
      if (r.ok && Number.isInteger(Number(r.year))) for (const song of Object.values(G.songs)) if (song && song.key === key && Number(r.year) < song.year) { song.year = Number(r.year); G.yearFixes[key] = song.year; }
    }
    try {
      const report = writeLibraryEdits(edits);
      if (done && G.phase === 'LOBBY') loadQuiz();
      reply({ ok: true, report });
    } catch (e) { reply({ ok: false, message: e.message }); }
    if (done) sync();
  });
  socket.on('library_add_tracks', ({ category, tracks } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'Aanvullen kan alleen vóór de start.' });
    if (!HITSTER_CATS[category]) return reply({ ok: false, message: 'Onbekende categorie.' });
    const list = (Array.isArray(tracks) ? tracks.slice(0, 2000) : []).map(cleanTrack).filter(Boolean);
    try {
      const report = writeLibraryEdits({ [category]: { add: list } });
      loadQuiz();
      reply({ ok: true, report });
    } catch (e) { reply({ ok: false, message: e.message }); }
    sync();
  });
  // Hitster-lijsten bijwerken vanaf de links in het tabblad Bronnen
  socket.on('update_hitster', async (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'Bijwerken kan alleen vóór de start van de quiz.' });
    if (G.libraryUpdate && G.libraryUpdate.busy) return reply({ ok: false, message: 'Er loopt al een update.' });
    const file = currentLibraryFile();
    if (!file) return reply({ ok: false, message: 'Geen Hitster-bibliotheek gevonden om bij te werken.' });
    G.libraryUpdate = { busy: true, at: null, report: [] };
    sync();
    try {
      const { buf, report } = await updateLibrary(fs.readFileSync(file));
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(LIB_UPLOAD, buf);
      G.libraryUpdate = { busy: false, at: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }), report };
      if (G.phase === 'LOBBY') loadQuiz();
      reply({ ok: true, report });
    } catch (e) {
      G.libraryUpdate = { busy: false, at: null, report: [], error: e.message };
      reply({ ok: false, message: e.message });
    }
    sync();
  });
  // Geluid van spiekmeldingen op de tv aan/uit (altijd te wijzigen)
  socket.on('set_cheat_sound', ({ tv } = {}) => {
    if (!isRemote(socket)) return;
    G.settings.tvCheatSound = !!tv;
    sync();
  });
  // Wachttijd voor spiekmeldingen (0–5 s) en waar de quizgeluiden klinken: altijd te wijzigen
  socket.on('set_cheat_grace', ({ seconds } = {}) => {
    if (!isRemote(socket) || !Number.isInteger(seconds) || seconds < 0 || seconds > 5) return;
    G.settings.cheatGrace = seconds;
    sync();
  });
  socket.on('set_sound_out', ({ where } = {}) => {
    if (!isRemote(socket) || !['tv', 'bediening'].includes(where)) return;
    G.settings.soundOut = where;
    if (where === 'tv') io.to('remote_room').emit('quiz_sound', { name: 'media_pause' }); // bediening stopt een lopend fragment
    LOG.info('geluid_naar', { waar: where });
    sync();
  });
  // De tv speelt een geluid af terwijl de geluiden naar de bediening moeten: doorsturen naar de bediening(en)
  const TV_SOUNDS = new Set(['buzzer', 'triumph', 'ding', 'whoosh', 'drumHit', 'fanfare', 'tick', 'pop', 'chime', 'shutter', 'aww', 'reveal', 'heartbeat', 'applause', 'media_play', 'media_pause']);
  socket.on('tv_sound', ({ name, args, src, at } = {}) => {
    if (socket.data.role !== 'tv' || G.settings.soundOut !== 'bediening' || !TV_SOUNDS.has(name)) return;
    const now = Date.now(); // niet spammen: hooguit 12 geluiden per 2 seconden per tv
    socket.data.soundAt = (socket.data.soundAt || []).filter((t) => now - t < 2000);
    if (socket.data.soundAt.length >= 12) return;
    socket.data.soundAt.push(now);
    const payload = { name, args: Array.isArray(args) ? args.slice(0, 3).filter((x) => ['number', 'boolean', 'string'].includes(typeof x) && String(x).length < 40) : [] };
    if (name === 'media_play') {
      if (typeof src !== 'string' || src.length > 500 || !/^(https:\/\/|\/media\/)/.test(src)) return;
      payload.src = src; payload.at = Number.isFinite(at) ? Math.max(0, Math.min(at, 3600)) : 0;
    }
    io.to('remote_room').emit('quiz_sound', payload);
  });
  // Momentum-meldingen op de tv aan/uit (altijd te wijzigen)
  socket.on('set_momentum', ({ on } = {}) => {
    if (!isRemote(socket)) return;
    G.settings.momentum = !!on;
    sync();
  });
  // Testteams (robots) om de quiz te oefenen zonder echte telefoons
  socket.on('add_bots', ({ n } = {}) => {
    if (!isRemote(socket)) return;
    if (G.phase !== 'LOBBY') return socket.emit('host_error', { message: 'Testteams kun je alleen vóór de start toevoegen.' });
    addBots(Number.isInteger(n) ? Math.min(Math.max(n, 1), 6) : 3);
    sync();
  });
  socket.on('remove_bots', () => {
    if (!isRemote(socket)) return;
    Object.values(G.teams).filter((t) => t.bot).forEach((t) => removeTeam(t.teamId));
    sync();
  });
};
