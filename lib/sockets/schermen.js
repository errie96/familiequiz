// Schermen registreren (bediening, tv) en de speler-telefoons die team maken of aansluiten
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    cardsAvailable,
    issueCardKeys,
    LOG,
    backupNow,
    backups,
    restoreBackup,
    emitOpening,
    broadcastState,
    checkPin,
    clientIp,
    forgetSent,
    io,
    sessions
  } = api;
  // ---------- Schermen registreren ----------
  socket.on('register_remote', ({ pin, token } = {}) => {
    let newToken = null;
    if (!(token && sessions.valid(token))) {
      if (token && !pin) return socket.emit('auth_denied', { expired: true });
      if (!checkPin(socket, pin)) return;
      newToken = sessions.create();
    }
    socket.data.role = 'remote';
    socket.join('remote_room');
    forgetSent('remote_room');
    LOG.info('bediening_ingelogd', { ip: clientIp(socket), via: newToken ? 'code' : 'sessie' });
    socket.emit('remote_confirmed', newToken ? { token: newToken } : {});
    broadcastState();
  });
  // De tv meldt dat het geluid aan staat (na één druk op OK); de bediening ziet dat in de checklist
  socket.on('tv_audio', ({ ok } = {}) => {
    if (socket.data.role !== 'tv') return;
    const was = !!socket.data.audioOk;
    socket.data.audioOk = ok === true;
    if (was !== socket.data.audioOk) { LOG.info('tv_geluid', { aan: socket.data.audioOk }); broadcastState(); }
  });
  // Bediening: achtergrondmuziek aan/uit en de opening testen
  socket.on('set_music', ({ on } = {}) => { api.G.musicOn = on !== false; LOG.info('achtergrondmuziek', { aan: api.G.musicOn }); broadcastState(); });
  socket.on('test_opening', () => emitOpening());
  socket.on('set_logo_sting', ({ on } = {}) => { api.G.logoSting = on !== false; broadcastState(); });
  // Klok gelijkzetten: tv en telefoons rekenen de aftelklok uit met de tijd van de quizlaptop, niet met hun eigen klok
  socket.on('clock', (_, cb) => { if (typeof cb === 'function') cb(Date.now()); });
  // ---- Reservekopieën en logboek in de bediening ----
  socket.on('backup_now', (_, cb) => { const id = backupNow('handmatig', true); if (typeof cb === 'function') cb({ ok: !!id, id }); });
  socket.on('backup_list', (_, cb) => { if (typeof cb === 'function') cb({ ok: true, list: backups.list().slice(0, 40) }); });
  // Een reservekopie terugzetten: de server zet de bestanden terug en start zichzelf opnieuw op (via scripts/run.js).
  // Daarna staat de quiz op pauze, precies zoals na een gewone herstart; telefoons, tv en bediening verbinden vanzelf opnieuw.
  socket.on('backup_restore', ({ id } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    reply(restoreBackup(String(id || '')));
  });
  socket.on('log_tail', ({ level } = {}, cb) => {
    if (typeof cb !== 'function') return;
    cb({ ok: true, entries: LOG.recent(150, ['info', 'warn', 'error'].includes(level) ? level : 'info'), files: LOG.files().slice(0, 14) });
  });
  // Alle bediening-toestellen uitloggen (bijv. als iemand de code heeft afgekeken)
  socket.on('logout_all', () => {
    sessions.revokeAll();
    for (const s of io.sockets.sockets.values()) if (s.data.role === 'remote') { s.emit('auth_denied', { expired: true }); s.data.role = null; s.leave('remote_room'); }
  });
  socket.on('register_tv', () => {
    LOG.info('tv_verbonden', { ip: clientIp(socket) });
    socket.data.role = 'tv';
    socket.join('tv_room');
    forgetSent('tv_room');
    socket.emit('tv_ok');
    broadcastState();
  });

  // De tv vraagt uploadsleutels voor de overwinningskaarten (alleen als de ontknoping klaar is)
  socket.on('card_keys', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (socket.data.role !== 'tv' || !cardsAvailable()) return reply({ ok: false });
    reply({ ok: true, cards: issueCardKeys() });
  });
};
