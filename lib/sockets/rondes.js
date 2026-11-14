// Bediening: per ronde (beoordelen, muziek, tekenen, 30 Seconds, ...)
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    G,
    LOG,
    MAX_PAUSE_CHARS,
    PHOTO_DIR,
    REACTIONS,
    UNDO_LIMIT,
    addDynSong,
    applyOp,
    baseContext,
    cleanOp,
    cleanTrack,
    crypto,
    cur,
    deviceOf,
    dynamicStartIds,
    dynamicStartReady,
    ensureTimeline,
    failPlaylist,
    fs,
    inEra,
    io,
    isRemote,
    originalUploadKey,
    path,
    pauseOriginalFile,
    pausePhotos,
    pushUndo,
    reactionsAllowed,
    scheduleSave,
    setTeamPhoto,
    ss,
    sync,
    teamOriginalFile,
    timer,
    timerRun,
    timerStop,
    usedSongKeys,
    validPhoto
  } = api;
  // ---------- Bediening: per ronde ----------
  socket.on('blur_next', ({ all } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || !((step.kind === 'mc' || step.kind === 'logo') && step.variant === 'blur')) return;
    const s = ss(step);
    if (s.status !== 'open') return;
    s.blurStep = all ? G.settings.blurPoints.length - 1 : Math.min(G.settings.blurPoints.length - 1, s.blurStep + 1);
    sync();
  });
  socket.on('demo_ops', ({ ops } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'demo_draw' || ss(step).status !== 'drawing' || !Array.isArray(ops)) return;
    const clean = ops.slice(0, 40).map(cleanOp).filter(Boolean);
    clean.forEach((op) => applyOp(ss(step).strokes, op));
    io.to('tv_room').emit('demo_ops', { ops: clean });
    scheduleSave();
  });
  socket.on('provide_track', ({ stepId, track } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, reason: 'not_host' });
    const step = G.steps.find((x) => x.id === stepId);
    if (!step || !step.dynamic) return reply({ ok: false, reason: 'invalid_step' });
    const s = ss(step);
    if (s.songId) return reply({ ok: true, already: true });
    const t = cleanTrack(track);
    if (!t) return reply({ ok: false, reason: 'invalid_track' });
    if (usedSongKeys().includes(`${t.title}|${t.artist}`.toLowerCase())) return reply({ ok: false, reason: 'duplicate' });
    if (!inEra(G.roundById[step.round] && G.roundById[step.round].category, t.year)) return reply({ ok: false, reason: 'wrong_era' });
    s.songId = `${step.id}_t`;
    addDynSong(s.songId, t);
    if (s.status === 'loading' && dynamicStartReady(step.round)) { s.status = 'open'; Object.values(G.teams).forEach((tm) => ensureTimeline(tm, step.round)); }
    reply({ ok: true });
    sync();
  });
  // De bediening kan geen nummers uit de playlist halen: terugvallen op de Hitster-Excel
  socket.on('playlist_failed', ({ roundId, reason } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!G.roundById[roundId] || !G.roundById[roundId].dynamic) return reply({ ok: false });
    failPlaylist(roundId, reason);
    reply({ ok: true });
    sync();
  });
  socket.on('provide_start', ({ roundId, tracks } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket) || !G.roundById[roundId] || !G.roundById[roundId].dynamic || !Array.isArray(tracks)) return reply({ ok: false, reason: 'invalid_round' });
    const round = G.roundById[roundId];
    const need = Math.max(0, (round.startCards || 2) - dynamicStartIds(roundId).length);
    if (!need) return reply({ ok: true, already: true, accepted: 0 });
    const used = new Set(usedSongKeys());
    const clean = tracks.map(cleanTrack).filter(Boolean).filter((track) => {
      const key = `${track.title}|${track.artist}`.toLowerCase();
      if (used.has(key) || !inEra(round.category, track.year)) return false;
      used.add(key);
      return true;
    }).slice(0, need);
    const current = G.dynStart[roundId] || [];
    const ids = clean.map((track, i) => { const id = `${roundId}_online_start${current.length + i + 1}`; addDynSong(id, track); return id; });
    G.dynStart[roundId] = [...current, ...ids];
    const step = cur();
    if (step && step.kind === 'song' && step.round === roundId) {
      const state = ss(step);
      Object.values(G.teams).forEach((team) => ensureTimeline(team, roundId));
      if (state.status === 'loading' && state.songId && dynamicStartReady(roundId)) state.status = 'open';
    }
    reply({ ok: ids.length > 0, accepted: ids.length, remaining: Math.max(0, need - ids.length), reason: ids.length ? null : 'no_unique_tracks' });
    sync();
  });
  // Vaste teamfoto: de basistelefoon kan hem op elk moment instellen, vervangen of weghalen
  socket.on('set_team_photo', ({ dataUrl } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return reply({ ok: false, message: 'Je zit niet (meer) in een team.' });
    if (team.baseDeviceId !== device.deviceId) return reply({ ok: false, message: 'Alleen de basistelefoon kan de teamfoto aanpassen.' });
    const now = cur();
    if (G.phase !== 'PLAY' || G.paused || !now || now.kind !== 'teamphoto') return reply({ ok: false, message: 'De teamfoto maken we samen op het teamfotomoment, na de testvragen.' });
    if (dataUrl !== null && !validPhoto(dataUrl)) return reply({ ok: false, message: 'De foto is ongeldig of te groot. Kies een kleinere foto.' });
    setTeamPhoto(team.teamId, dataUrl);
    reply(dataUrl ? { ok: true, original: originalUploadKey(teamOriginalFile(team.teamId)) } : { ok: true });
    sync();
  });
  // Emoji-reacties van spelers naar de tv: alleen bij uitlegschermen, tussen de rondes en tijdens de pauze
  socket.on('react', ({ emoji } = {}) => {
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team || !REACTIONS.includes(emoji) || !reactionsAllowed()) return;
    const now = Date.now();
    device.reactAt = (device.reactAt || []).filter((t) => now - t < 30000);
    if (device.reactAt.length >= 15 || (device.reactAt.length && now - device.reactAt[device.reactAt.length - 1] < 800)) return; // niet spammen
    device.reactAt.push(now);
    G.reactionCount = (G.reactionCount || 0) + 1; // voor "De avond in cijfers"
    io.to('tv_room').emit('reaction', { emoji, team: team.name, color: team.color || null });
  });
  // Pauzefoto: elke speler mag tijdens de pauze een foto maken; direct op de tv en bewaard in data/fotos/
  // Een pauzefoto opslaan (van een speler of van de quizmaster): kleine versie voor de tv, origineel volgt via een eenmalige sleutel
  function savePausePhoto(dataUrl, teamName, label, reply) {
    if (G.phase !== 'PLAY' || !G.paused) return reply({ ok: false, message: "Pauzefoto's kunnen alleen tijdens de pauze." });
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_PAUSE_CHARS || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) return reply({ ok: false, message: 'De foto is ongeldig of te groot.' });
    if (pausePhotos.length >= 500) return reply({ ok: false, message: "Het fotoalbum is vol." });
    const day = new Date().toISOString().slice(0, 10);
    const stamp = new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour12: false }).replace(/:/g, '');
    const slug = String(teamName).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 30) || 'team';
    const file = `${stamp}-${slug}-${crypto.randomBytes(3).toString('hex')}.jpg`;
    try {
      fs.mkdirSync(path.join(PHOTO_DIR, day), { recursive: true });
      fs.writeFileSync(path.join(PHOTO_DIR, day, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    } catch (e) { return reply({ ok: false, message: 'Opslaan is niet gelukt.' }); }
    const entry = { file: `${day}/${file}`, team: teamName, label, at: Date.now() };
    pausePhotos.push(entry);
    LOG.info('pauzefoto', { team: teamName, speler: label });
    reply({ ok: true, original: originalUploadKey(pauseOriginalFile(entry)) });
    sync();
  }
  socket.on('pause_photo', ({ dataUrl } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return reply({ ok: false, message: 'Je zit niet (meer) in een team.' });
    savePausePhoto(dataUrl, team.name, device.label, reply);
  });
  // De quizmaster (laptop of telefoonbediening) kan tijdens de pauze ook een foto maken; die staat bij "Quizmaster"
  socket.on('host_pause_photo', ({ dataUrl } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    savePausePhoto(dataUrl, 'Quizmaster', '', reply);
  });
  socket.on('teamphoto_skip', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'teamphoto');
    if (!c || !c.isBase) return reply({ ok: false, message: 'Alleen de basistelefoon kan dit.' });
    c.s.skipped[c.team.teamId] = true;
    reply({ ok: true });
    sync();
  });
  socket.on('remove_team_photo', ({ teamId } = {}) => {
    if (!isRemote(socket) || !G.teams[teamId]) return;
    setTeamPhoto(teamId, null);
    sync();
  });
  socket.on('song_replay', () => {
    if (!isRemote(socket)) return;
    io.to('tv_room').emit('play_audio');
  });
  socket.on('song_pause', () => {
    if (!isRemote(socket)) return;
    G.musicPaused = true;
    io.to('tv_room').emit('pause_audio');
    sync();
  });
  // Muziek pauze / verder (knop in de bediening en de telefoonbediening). Spotify speelt op de laptop-bediening:
  // die volgt 'music.paused' in de stand; iTunes-fragmenten en eigen bestanden spelen op de tv.
  socket.on('music_toggle', ({ paused: want } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'song') return;
    G.musicPaused = typeof want === 'boolean' ? want : !G.musicPaused;
    io.to('tv_room').emit(G.musicPaused ? 'pause_audio' : 'resume_audio');
    sync();
  });
  socket.on('memory_judge', ({ teamId, entryId, ok } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'memory') return;
    const e = (ss(step).entries[teamId] || []).find((x) => x.id === entryId);
    if (e && e.ok !== !!ok) {
      pushUndo(G.undoHistory, { type: 'memory_judge', stepId: step.id, teamId, entryId, before: e.ok, label: 'beoordeling geheugen' }, UNDO_LIMIT);
      e.ok = !!ok;
      sync();
    }
  });
  socket.on('thirty_toggle', ({ index } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || !Number.isInteger(index) || index < 0 || index > 4) return;
    const s = ss(step);
    if (step.kind === 'demo_thirty') {
      if (s.status === 'ready') return;
      pushUndo(G.undoHistory, { type: 'thirty_toggle', stepId: step.id, index, before: s.ok[index], demo: true, label: 'oefenronde 30 Seconds' }, UNDO_LIMIT);
      s.ok[index] = !s.ok[index];
      return sync();
    }
    if (step.kind !== 'thirty') return;
    const turn = s.turns[s.turn];
    if (!turn || !['running', 'judging', 'result'].includes(s.status)) return;
    pushUndo(G.undoHistory, { type: 'thirty_toggle', stepId: step.id, index, before: turn.ok[index], demo: false, turnIndex: s.turn, label: '30 Seconds-beoordeling' }, UNDO_LIMIT);
    turn.ok[index] = !turn.ok[index];
    sync();
  });
  // 30 Seconds: vóór de eerste beurt het aantal vertellers per team kiezen (0 = iedereen legt één keer uit)
  socket.on('thirty_per', ({ per } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'thirty' || !Number.isInteger(per) || per < 0 || per > 10) return;
    const s = ss(step);
    if (api.thirtyStarted(s)) return;
    if (per === 0) api.planThirty(step); else api.startThirtySelect(step, per);
    LOG.info('dertig_vertellers', { perTeam: per });
    sync();
  });
  // 30 Seconds: de basistelefoon tikt aan wie er gaan uitleggen (picks = lijst memberId's; null = opnieuw kiezen)
  socket.on('thirty_pick', ({ stepId, picks } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = api.deviceOf(socket);
    const team = device && G.teams[device.teamId];
    const step = cur();
    if (!team || !step || step.kind !== 'thirty' || step.id !== stepId) return reply({ ok: false, reason: 'not_open' });
    const s = ss(step);
    if (s.status !== 'select') return reply({ ok: false, reason: 'not_open' });
    if (team.baseDeviceId !== device.deviceId) return reply({ ok: false, reason: 'not_base', message: 'Alleen de basistelefoon kiest de vertellers.' });
    if (picks === null) { delete s.picks[team.teamId]; reply({ ok: true }); return sync(); }
    const members = api.teamDevices(team);
    const ids = Array.isArray(picks) ? picks.map((m) => (members.find((d) => d.memberId === m) || {}).deviceId) : null;
    if (!api.thirtyPickValid(team, s.per, ids)) return reply({ ok: false, reason: 'invalid', message: members.length < s.per ? `Kies ${s.per} beurten: iedereen minstens één keer, en tik aan wie nog een keer mag.` : `Kies precies ${s.per} ${s.per === 1 ? 'verteller' : 'vertellers'}.` });
    s.picks[team.teamId] = ids;
    reply({ ok: true });
    sync();
  });
  // 30 Seconds, noodknop: stop na deze rondgang (elk team even vaak geweest); nog een keer = terugdraaien
  socket.on('thirty_cut', ({ on } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'thirty') return;
    if (api.thirtyCut(step, !!on)) { LOG.warn('dertig_ingekort', { aan: !!on }); sync(); }
  });
  // Quizmaster keurt een antwoord goed of fout (tekenen en logo's)
  socket.on('draw_judge', ({ teamId, ok } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'draw') return;
    const s = ss(step);
    const turn = s.turns[s.turn];
    if (!turn || !turn.words[teamId] || s.status === 'ready') return;
    if (turn.ok[teamId] !== !!ok) {
      pushUndo(G.undoHistory, { type: 'draw_judge', stepId: step.id, teamId, turnIndex: s.turn, before: turn.ok[teamId], label: 'tekenantwoord' }, UNDO_LIMIT);
      turn.ok[teamId] = !!ok;
      sync();
    }
  });
  socket.on('logo_judge', ({ teamId, ok } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'logo') return;
    const s = ss(step);
    if (!s.answers[teamId]) return;
    if (s.judged[teamId] !== !!ok) {
      pushUndo(G.undoHistory, { type: 'logo_judge', stepId: step.id, teamId, beforePresent: Object.prototype.hasOwnProperty.call(s.judged, teamId), before: s.judged[teamId], label: 'logo-beoordeling' }, UNDO_LIMIT);
      s.judged[teamId] = !!ok;
      sync();
    }
  });
  socket.on('add_time', () => {
    if (!isRemote(socket) || !timer.tag) return;
    const wasRunning = !!timer.handle;
    timerStop();
    timer.remainingMs += 10000;
    timer.totalMs = Math.max(timer.totalMs, timer.remainingMs);
    if (wasRunning && !G.paused) timerRun();
    sync();
  });

};
