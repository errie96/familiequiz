// Schermen registreren (bediening, tv) en de speler-telefoons die team maken of aansluiten
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    LOG,
    backupNow,
    backups,
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
  // ---- Reservekopieën en logboek in de bediening ----
  socket.on('backup_now', (_, cb) => { const id = backupNow('handmatig', true); if (typeof cb === 'function') cb({ ok: !!id, id }); });
  socket.on('backup_list', (_, cb) => { if (typeof cb === 'function') cb({ ok: true, list: backups.list().slice(0, 40) }); });
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

};
