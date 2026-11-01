const express = require('express');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
// Pincode voor de host- en scoreboardpagina. Standaard 1234.
// Wil je een andere, start dan met: HOST_PIN=5678 node server.js
const HOST_PIN = String(process.env.HOST_PIN || '1234').trim();
const DEFAULT_POINTS = 10;

const app = express();
const server = http.createServer(app);
const io = new Server(server); // zelfde origin, dus geen CORS nodig

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------
// Join-URL voor de QR-code (localhost werkt niet op telefoons)
// ---------------------------------------------------------------
function getLanAddress() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      const isV4 = i.family === 'IPv4' || i.family === 4;
      if (isV4 && !i.internal && !i.address.startsWith('169.254.')) found.push(i.address);
    }
  }
  const isPrivate = (a) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
  return found.find(isPrivate) || found[0] || null;
}

function getJoinUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const ip = getLanAddress();
  return `http://${ip || 'localhost'}:${PORT}`;
}

app.get('/api/join-url', (req, res) => res.json({ url: getJoinUrl() }));

// ---------------------------------------------------------------
// Quizvragen inladen en controleren
// ---------------------------------------------------------------
let rawRounds = [];
try {
  const parsed = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8'));
  if (Array.isArray(parsed)) rawRounds = parsed;
  else console.error('questions.json moet een lijst met rondes zijn.');
} catch (e) {
  console.error('Fout bij inladen questions.json:', e.message);
}

// Vlakke lijst van alle vragen; de quiz loopt hier met één index doorheen
const allQuestions = [];
const seenIds = new Set();
rawRounds.forEach((round, rIdx) => {
  const list = Array.isArray(round.questions) ? round.questions : [];
  list.forEach((q, qIdx) => {
    let id = q.id ? String(q.id) : `r${rIdx + 1}q${qIdx + 1}`;
    if (seenIds.has(id)) {
      const unique = `${id}_${allQuestions.length + 1}`;
      console.warn(`Waarschuwing: id "${id}" komt dubbel voor, hernoemd naar "${unique}".`);
      id = unique;
    }
    seenIds.add(id);

    if (!Array.isArray(q.options) || q.options.length < 2) {
      console.warn(`Waarschuwing: vraag "${id}" heeft minder dan 2 opties en wordt overgeslagen.`);
      return;
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      console.warn(`Waarschuwing: vraag "${id}" heeft een ongeldig "answer" en wordt overgeslagen.`);
      return;
    }
    allQuestions.push({
      ...q,
      id,
      roundName: round.roundName || `Ronde ${rIdx + 1}`,
      rIdx,
      qIdx
    });
  });
});

// ---------------------------------------------------------------
// Spelstatus
// ---------------------------------------------------------------
let players = {};
let currentIndex = 0;
let reviewIndex = 0;
let gameState = 'LOBBY'; // LOBBY, QUESTION, WAITING_NEXT, PAUSED, END, REVIEW
let stateBeforePause = 'QUESTION';

function currentQuestion() {
  return allQuestions[currentIndex] || null;
}

// Vraag zonder het goede antwoord (en zonder audio voor spelers)
function publicQuestion(q, { forPlayer = false } = {}) {
  if (!q) return null;
  const { answer, rIdx, qIdx, ...rest } = q;
  if (forPlayer) delete rest.audioUrl;
  return rest;
}

function hasAnswered(player, q = currentQuestion()) {
  return !!q && player.answers[q.id] !== undefined;
}

function connectedPlayers() {
  return Object.values(players).filter((p) => p.connected);
}

// De score wordt altijd uit de gegeven antwoorden berekend: nooit dubbel of verloren
function scoreOf(player) {
  let total = 0;
  for (const q of allQuestions) {
    if (player.answers[q.id] === q.answer) total += q.points ?? DEFAULT_POINTS;
  }
  return total;
}

function finalScores() {
  const list = Object.values(players)
    .map((p) => ({ name: p.name, score: scoreOf(p) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'nl'));
  list.forEach((item) => {
    item.rank = 1 + list.filter((o) => o.score > item.score).length;
  });
  return list;
}

// Als alle verbonden spelers hebben geantwoord -> WAITING_NEXT
function settleQuestion() {
  if (gameState !== 'QUESTION') return;
  const active = connectedPlayers();
  if (active.length > 0 && active.every((p) => hasAnswered(p))) {
    gameState = 'WAITING_NEXT';
  }
}

function broadcastState() {
  const q = currentQuestion();
  const active = connectedPlayers();
  const inPlay = ['QUESTION', 'WAITING_NEXT', 'PAUSED'].includes(gameState);
  const showScores = gameState === 'END' || gameState === 'REVIEW';
  const roundName = gameState === 'LOBBY' || !q ? 'Familiequiz' : q.roundName;

  // Host: ziet de vraag, de voortgang en bij het nakijken ook de antwoorden
  io.to('host_room').emit('state_update', {
    gameState,
    roundName,
    currentQuestion: inPlay ? publicQuestion(q) : null,
    questionNumber: currentIndex + 1,
    totalQuestions: allQuestions.length,
    answeredCount: inPlay ? active.filter((p) => hasAnswered(p)).length : 0,
    connectedCount: active.length,
    reviewQuestion: gameState === 'REVIEW' ? allQuestions[reviewIndex] : null,
    reviewProgress: { current: reviewIndex + 1, total: allQuestions.length },
    playerList: Object.values(players).map((p) => ({
      name: p.name,
      connected: p.connected,
      answered: inPlay && hasAnswered(p)
    })),
    finalScores: showScores ? finalScores() : null
  });

  // Scoreboard: alleen de einduitslag, en pas als de quiz klaar is
  io.to('scoreboard_room').emit('state_update', {
    gameState,
    roundName,
    finalScores: showScores ? finalScores() : null
  });

  // Spelers: alleen hun eigen status, nooit scores, antwoorden of andermans id
  Object.values(players).forEach((p) => {
    if (!p.connected || !p.socketId) return;
    io.to(p.socketId).emit('state_update', {
      gameState,
      roundName,
      currentQuestion: gameState === 'QUESTION' ? publicQuestion(q, { forPlayer: true }) : null,
      me: { answered: inPlay && hasAnswered(p) }
    });
  });
}

function sync() {
  settleQuestion();
  broadcastState();
}

// ---------------------------------------------------------------
// Hulpfuncties voor sockets
// ---------------------------------------------------------------
function isHost(socket) {
  return socket.data.role === 'host';
}

function playerOf(socket) {
  const p = players[socket.data.playerId];
  return p && p.socketId === socket.id ? p : null;
}

function checkPin(socket, pin) {
  if (typeof pin === 'string' && pin.trim() === HOST_PIN) return true;
  socket.data.pinFails = (socket.data.pinFails || 0) + 1;
  socket.emit('auth_denied');
  if (socket.data.pinFails >= 5) socket.disconnect(true);
  return false;
}

function attachSocket(socket, player) {
  player.socketId = socket.id;
  player.connected = true;
  socket.data.playerId = player.playerId;
}

// Speler die terugkomt terwijl de vraag al "klaar" was, mag alsnog antwoorden
function reopenIfMissed(player) {
  const q = currentQuestion();
  if (gameState === 'WAITING_NEXT' && q && !hasAnswered(player, q)) {
    gameState = 'QUESTION';
  }
}

io.on('connection', (socket) => {
  // 1. Host (met pincode)
  socket.on('register_host', ({ pin } = {}) => {
    if (!checkPin(socket, pin)) return;
    socket.data.role = 'host';
    socket.join('host_room');
    socket.emit('host_confirmed');
    broadcastState();
  });

  // 2. Scoreboard (ook met pincode, anders kunnen spelers de uitslag meelezen)
  socket.on('register_scoreboard', ({ pin } = {}) => {
    if (!checkPin(socket, pin)) return;
    socket.join('scoreboard_room');
    socket.emit('host_confirmed');
    broadcastState();
  });

  // 3. Speler login / sessieherstel
  socket.on('init_player', ({ playerId, name } = {}) => {
    const existing = typeof playerId === 'string' ? players[playerId] : null;
    if (existing) {
      attachSocket(socket, existing);
      socket.emit('session_restored', { playerId: existing.playerId, name: existing.name });
      reopenIfMissed(existing);
      return sync();
    }

    const clean = typeof name === 'string' ? name.trim().slice(0, 20) : '';
    if (!clean) return socket.emit('join_error', { message: 'Vul een naam in.' });

    // Zelfde naam: als die speler offline is, neemt de nieuwe verbinding de plek over
    const sameName = Object.values(players).find(
      (p) => p.name.toLowerCase() === clean.toLowerCase()
    );
    if (sameName) {
      if (sameName.connected) {
        return socket.emit('join_error', { message: `De naam "${clean}" is al in gebruik.` });
      }
      attachSocket(socket, sameName);
      socket.emit('joined', { playerId: sameName.playerId, name: sameName.name });
      reopenIfMissed(sameName);
      return sync();
    }

    if (gameState === 'END' || gameState === 'REVIEW') {
      return socket.emit('join_error', { message: 'De quiz is al afgelopen.' });
    }

    const player = {
      playerId: 'p_' + crypto.randomBytes(8).toString('hex'),
      socketId: null,
      name: clean,
      answers: {},
      connected: false,
      lastAlertTime: 0
    };
    players[player.playerId] = player;
    attachSocket(socket, player);
    socket.emit('joined', { playerId: player.playerId, name: player.name });
    sync();
  });

  // 4. Antwoord indienen (speler wordt herkend aan de socket, niet aan het bericht)
  socket.on('submit_answer', ({ questionId, answerIndex } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const player = playerOf(socket);
    const q = currentQuestion();

    if (!player || !q || gameState !== 'QUESTION') return reply({ ok: false, reason: 'not_open' });
    if (questionId !== q.id) return reply({ ok: false, reason: 'wrong_question' });
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= q.options.length) {
      return reply({ ok: false, reason: 'invalid' });
    }
    if (hasAnswered(player, q)) return reply({ ok: true, already: true });

    player.answers[q.id] = answerIndex;
    reply({ ok: true });
    sync();
  });

  // 5. Anti-spiek: alleen tijdens een open vraag
  socket.on('player_blurred', ({ reason } = {}) => {
    if (gameState !== 'QUESTION') return;
    const player = playerOf(socket);
    if (!player) return;

    const now = Date.now();
    if (now - player.lastAlertTime < 3500) return;
    player.lastAlertTime = now;

    io.to('host_room').emit('cheat_warning', {
      playerName: player.name,
      reason: reason === 'locked' ? 'locked' : 'app_switch',
      timestamp: new Date().toLocaleTimeString('nl-NL')
    });
  });

  // 6. Host: volgende vraag (of start)
  socket.on('next_question', () => {
    if (!isHost(socket)) return;

    if (gameState === 'LOBBY') {
      if (allQuestions.length === 0) {
        return socket.emit('host_error', { message: 'Er zijn geen geldige vragen geladen. Controleer questions.json.' });
      }
      currentIndex = 0;
      gameState = 'QUESTION';
    } else if (gameState === 'QUESTION' || gameState === 'WAITING_NEXT') {
      if (currentIndex + 1 >= allQuestions.length) {
        gameState = 'END';
      } else {
        currentIndex++;
        gameState = 'QUESTION';
      }
    } else {
      return;
    }
    sync();
  });

  // 7. Host: vorige vraag. Gegeven antwoorden blijven staan, dus niets telt dubbel.
  socket.on('prev_question', () => {
    if (!isHost(socket)) return;
    if ((gameState === 'QUESTION' || gameState === 'WAITING_NEXT') && currentIndex > 0) {
      currentIndex--;
      gameState = 'QUESTION';
      sync();
    }
  });

  // 8. Host: gezamenlijk nakijken na de ontknoping
  socket.on('start_review', () => {
    if (!isHost(socket) || gameState !== 'END') return;
    gameState = 'REVIEW';
    reviewIndex = 0;
    broadcastState();
  });

  socket.on('next_review_question', () => {
    if (!isHost(socket) || gameState !== 'REVIEW') return;
    if (reviewIndex < allQuestions.length - 1) {
      reviewIndex++;
    } else {
      gameState = 'END';
    }
    broadcastState();
  });

  socket.on('prev_review_question', () => {
    if (!isHost(socket) || gameState !== 'REVIEW' || reviewIndex === 0) return;
    reviewIndex--;
    broadcastState();
  });

  socket.on('back_to_scores', () => {
    if (!isHost(socket) || gameState !== 'REVIEW') return;
    gameState = 'END';
    broadcastState();
  });

  // 9. Host: pauze aan/uit. Hervatten gaat terug naar de status van vóór de pauze.
  socket.on('toggle_pause', () => {
    if (!isHost(socket)) return;

    if (gameState === 'PAUSED') {
      gameState = stateBeforePause;
      io.emit('resumed');
    } else if (gameState === 'QUESTION' || gameState === 'WAITING_NEXT') {
      stateBeforePause = gameState;
      gameState = 'PAUSED';
      io.emit('paused');
    } else {
      return;
    }
    sync();
  });

  // 10. Host: volledige reset
  socket.on('reset_quiz', () => {
    if (!isHost(socket)) return;

    gameState = 'LOBBY';
    stateBeforePause = 'QUESTION';
    currentIndex = 0;
    reviewIndex = 0;
    players = {};

    io.emit('quiz_reset');
    broadcastState();
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    const player = players[socket.data.playerId];
    if (player && player.socketId === socket.id) {
      player.connected = false;
      sync();
    }
  });
});

server.listen(PORT, () => {
  console.log(`Quiz server actief op http://localhost:${PORT}`);
  console.log(`Spelers (zelfde wifi) gaan naar: ${getJoinUrl()}`);
  console.log(`Host-pagina: ${getJoinUrl()}/host.html`);
  console.log(`Host-pincode: ${HOST_PIN}`);
  console.log(`${allQuestions.length} vragen geladen in ${rawRounds.length} rondes.`);
});
