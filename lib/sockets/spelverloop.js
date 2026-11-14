// Bediening: spelverloop, nakijken en einduitslag
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    END_VIEWS,
    G,
    LOG,
    actionKey,
    pauseReading,
    enterStep,
    forceAction,
    io,
    isRemote,
    mainAction,
    openingBusy,
    next,
    sync,
    timerRun,
    timerStop
  } = api;
  // ---------- Bediening: spelverloop ----------
  socket.on('host_main', ({ key } = {}) => {
    if (!isRemote(socket)) return;
    if (G.review) return;
    if (G.paused && G.phase === 'PLAY') return socket.emit('host_error', { message: 'De quiz staat op pauze. Zet hem eerst weer aan (▶️ Verder).' });
    if (openingBusy()) return socket.emit('host_error', { message: 'De opening loopt nog op de tv. Nog een paar seconden…' });
    if (key !== undefined && key !== actionKey()) return; // dubbele tik of iemand anders was net eerder: negeren
    const a = mainAction();
    if (!a.enabled || !a.run) return socket.emit('host_error', { message: a.hint || 'Dat kan nu nog niet.' });
    a.run();
    sync();
  });
  socket.on('host_force', ({ key } = {}) => {
    if (!isRemote(socket)) return;
    if (G.paused && G.phase === 'PLAY') return socket.emit('host_error', { message: 'De quiz staat op pauze. Zet hem eerst weer aan (▶️ Verder).' });
    if (key !== undefined && key !== actionKey()) return;
    const f = forceAction();
    if (!f) return;
    f.run();
    sync();
  });
  socket.on('toggle_pause', () => {
    if (!isRemote(socket) || G.phase !== 'PLAY') return;
    G.paused = !G.paused;
    G.pauseUntil = null; // een nieuwe pauze begint zonder timer; bij hervatten is hij klaar
    if (G.paused) timerStop(); else timerRun();
    pauseReading(G.paused); // leestijd bij meerkeuze staat ook stil
    if (G.paused && G.dilemma) { G.dilemma.visible = false; G.dilemma.votes = {}; } // een pauze begint zonder dilemma; de quizmaster pusht het
    io.emit(G.paused ? 'paused' : 'resumed');
    sync();
  });
  // Pauzetimer: "we gaan verder om …" op de tv en de telefoons. minutes = vanaf nu; add = erbij optellen; 0 = weg.
  // De quiz gaat niet vanzelf verder: de quizmaster drukt zelf op Hervat.
  socket.on('set_pause_timer', ({ minutes, add } = {}) => {
    if (!isRemote(socket) || G.phase !== 'PLAY' || !G.paused) return;
    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m <= 0) G.pauseUntil = null;
    else {
      const from = add && G.pauseUntil && G.pauseUntil > Date.now() ? G.pauseUntil : Date.now();
      G.pauseUntil = Math.min(from + Math.min(m, 120) * 60e3, Date.now() + 180 * 60e3);
    }
    LOG.info('pauzetimer', { tot: G.pauseUntil ? new Date(G.pauseUntil).toISOString() : null });
    sync();
  });
  // Aftelklok vóór de start (welkomstscherm en telefoons): zelfde bediening als de pauzetimer
  socket.on('set_start_timer', ({ minutes, add } = {}) => {
    if (!isRemote(socket) || G.phase !== 'LOBBY') return;
    const m = Math.round(Number(minutes));
    if (!Number.isFinite(m) || m <= 0) G.startUntil = null;
    else {
      const from = add && G.startUntil && G.startUntil > Date.now() ? G.startUntil : Date.now();
      G.startUntil = Math.min(from + Math.min(m, 180) * 60e3, Date.now() + 240 * 60e3);
    }
    api.resetBrandCache();
    LOG.info('startklok', { tot: G.startUntil ? new Date(G.startUntil).toISOString() : null });
    sync();
  });
  // Tussenstand op de tv: alleen de posities (wie staat waar), nooit de punten
  socket.on('toggle_positions', ({ mode: wanted } = {}) => {
    if (!isRemote(socket) || G.phase !== 'PLAY') return;
    const mode = ['list', 'race'].includes(wanted) ? wanted : 'list';
    G.showPositions = G.showPositions === mode ? false : mode;
    sync();
  });
  socket.on('toggle_standings', () => {
    if (!isRemote(socket) || G.phase !== 'END') return;
    G.showStandings = !G.showStandings;
    sync();
  });
  socket.on('goto_step', ({ stepId } = {}) => {
    if (!isRemote(socket) || G.phase === 'LOBBY') return;
    const i = G.steps.findIndex((s) => s.id === stepId);
    if (i < 0) return;
    G.phase = 'PLAY';
    G.stepIndex = i;
    enterStep();
    sync();
  });
  socket.on('skip_step', () => {
    if (!isRemote(socket) || G.phase !== 'PLAY' || G.paused) return;
    next();
    sync();
  });
  socket.on('prev_step', () => {
    if (!isRemote(socket) || G.phase !== 'PLAY' || G.stepIndex === 0) return;
    if (G.paused) return socket.emit('host_error', { message: 'De quiz staat op pauze. Zet hem eerst weer aan (▶️ Verder).' });
    G.stepIndex--;
    enterStep();
    sync();
  });

  // ---------- Bediening: nakijken en einduitslag ----------
  socket.on('review_open', () => {
    if (!isRemote(socket) || G.phase !== 'END') return;
    G.review = { scope: 'all', page: 0 };
    sync();
  });
  socket.on('review_nav', ({ dir } = {}) => {
    if (!isRemote(socket) || !G.review) return;
    G.review.page += dir > 0 ? 1 : -1;
    sync();
  });
  socket.on('review_close', () => {
    if (!isRemote(socket)) return;
    G.review = null;
    sync();
  });
  socket.on('end_view', ({ view } = {}) => {
    if (!isRemote(socket) || G.phase !== 'END') return;
    G.endView = END_VIEWS.includes(view) ? view : 'ranking';
    sync();
  });
  socket.on('reveal_done', () => {
    if ((!isRemote(socket) && socket.data.role !== 'tv') || G.reveal !== 'running') return;
    G.reveal = 'done';
    sync();
  });

};
