const express = require('express');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const ON_RENDER = !!process.env.RENDER; // Render zet deze variabele zelf

// Pincode voor de bedieningspagina (bediening.html).
// Lokaal is de standaard 1234 (andere code: HOST_PIN=5678 node server.js).
// Op internet (Render) is 1234 niet veilig: zet daar zelf HOST_PIN in de instellingen.
// Is die niet gezet, dan kiest de server een willekeurige code en toont hem in de logs.
let HOST_PIN = String(process.env.HOST_PIN || '').trim();
let pinWasGenerated = false;
if (!HOST_PIN) {
  if (ON_RENDER) {
    HOST_PIN = String(crypto.randomInt(100000, 1000000));
    pinWasGenerated = true;
  } else {
    HOST_PIN = '1234';
  }
}
// Hier wordt de spelstatus bewaard, zodat een herstart of crash niets kost.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
// Schone start zonder bewaarde quiz: node server.js --fresh
const FRESH = process.argv.includes('--fresh') || process.env.FRESH === '1';

const MAX_TEAM_NAME = 24;
const MAX_LABEL = 16;
const MAX_DEVICES_PER_TEAM = 8;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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
  const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (publicUrl) return publicUrl.replace(/\/+$/, '');
  return `http://${getLanAddress() || 'localhost'}:${PORT}`;
}

app.get('/api/join-url', (req, res) => res.json({ url: getJoinUrl() }));
app.get('/healthz', (req, res) => res.type('text').send('ok')); // voor de healthcheck van Render

// ---------------------------------------------------------------
// Instellingen (config.json = standaard; de quizmaster kan ze in de lobby aanpassen)
// ---------------------------------------------------------------
const DEFAULT_SETTINGS = {
  timerEnabled: false, // tijdslimiet per vraag (veld "time" in questions.json, anders defaultTime)
  defaultTime: 20,     // seconden voor vragen zonder eigen "time" (0 in de vraag = geen limiet)
  speedBonus: false,   // extra punten voor snel en goed antwoorden (alleen met timer)
  speedBonusMax: 5,    // maximale bonus bij een direct antwoord
  defaultPoints: 10,   // punten per goede vraag (per ronde of vraag te overschrijven met "points")
  jokersPerTeam: 0     // aantal jokers (dubbele punten) per team; 0 = uit
};

function sanitizeSettings(input, base) {
  const out = { ...base };
  const src = input && typeof input === 'object' ? input : {};
  const bool = (k) => { if (typeof src[k] === 'boolean') out[k] = src[k]; };
  const int = (k, min, max) => { if (Number.isInteger(src[k]) && src[k] >= min && src[k] <= max) out[k] = src[k]; };
  bool('timerEnabled');
  bool('speedBonus');
  int('defaultTime', 5, 300);
  int('speedBonusMax', 0, 50);
  int('defaultPoints', 1, 100);
  int('jokersPerTeam', 0, 5);
  return out;
}

let settings = { ...DEFAULT_SETTINGS };
try {
  settings = sanitizeSettings(
    JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')),
    DEFAULT_SETTINGS
  );
} catch (e) {
  /* geen config.json: standaardwaarden */
}

// ---------------------------------------------------------------
// Vraagtypen: hoe een antwoord gecontroleerd wordt.
// Nieuwe typen (schatting, volgorde, ...) voeg je hier toe.
// ---------------------------------------------------------------
const ANSWER_KINDS = {
  choice: {
    // Geldig antwoord: de index van een optie
    validate: (q, v) => Number.isInteger(v) && v >= 0 && v < q.options.length,
    check: (q, v) => v === q.answer,
    validateQuestion: (q) =>
      Array.isArray(q.options) && q.options.length >= 2 &&
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length
  }
};
const TYPE_TO_KIND = { multiple_choice: 'choice', audio: 'choice', location: 'choice' };
function answerKind(q) {
  return ANSWER_KINDS[TYPE_TO_KIND[q.type] || 'choice'];
}

// Media: { kind: 'image' | 'audio', src } of de oude velden imageUrl / audioUrl.
// Een src zonder http of / ervoor komt uit public/media/ (bv. "audio/nummer1.mp3").
function normalizeMedia(q) {
  let media = q.media && typeof q.media === 'object' ? { ...q.media } : null;
  if (!media && q.imageUrl) media = { kind: 'image', src: q.imageUrl };
  if (!media && q.audioUrl) media = { kind: 'audio', src: q.audioUrl };
  if (!media || !media.src) return null;
  if (!/^(https?:)?\/\//i.test(media.src) && !media.src.startsWith('/')) {
    media.src = '/media/' + media.src.replace(/^\.?\/+/, '');
  }
  return media;
}

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

const allQuestions = []; // vlakke lijst; de quiz loopt hier met één index doorheen
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

    if (!answerKind(q).validateQuestion(q)) {
      console.warn(`Waarschuwing: vraag "${id}" is ongeldig (opties of answer) en wordt overgeslagen.`);
      return;
    }
    allQuestions.push({
      ...q,
      id,
      media: normalizeMedia(q),
      roundName: round.roundName || `Ronde ${rIdx + 1}`,
      roundPoints: Number.isInteger(round.points) ? round.points : null,
      rIdx,
      qIdx
    });
  });
});

// ---------------------------------------------------------------
// Spelstatus
// ---------------------------------------------------------------
let teams = {};   // teamId -> { teamId, name, answers, bonus, jokers, baseDeviceId }
let devices = {}; // deviceId -> { deviceId, teamId, label, socketId, connected, lastAlertTime }
let currentIndex = 0;
let reviewIndex = 0;
let gameState = 'LOBBY'; // LOBBY, QUESTION, WAITING_NEXT, PAUSED, STANDINGS, END, REVIEW
let stateBeforePause = 'QUESTION';
let stateBeforeStandings = 'QUESTION';
let revealState = 'idle'; // idle -> running -> done (de ontknoping op het tv-scherm)
let voided = {};          // vraag-id -> 'void' (telt niet) | 'all_correct' (iedereen goed)

const timer = { qid: null, totalMs: 0, remainingMs: 0, startedAt: 0, handle: null };

const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
const newId = (prefix) => prefix + crypto.randomBytes(6).toString('hex');
const cleanName = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function currentQuestion() {
  return allQuestions[currentIndex] || null;
}
function pointsFor(q) {
  return q.points ?? q.roundPoints ?? settings.defaultPoints;
}
function hasAnswered(team, q = currentQuestion()) {
  return !!q && team.answers[q.id] !== undefined;
}
function teamDevices(team) {
  return Object.values(devices).filter((d) => d.teamId === team.teamId);
}
// Een team telt mee zolang de basistelefoon verbonden is
function teamConnected(team) {
  const base = devices[team.baseDeviceId];
  return !!(base && base.connected);
}
function activeTeams() {
  return Object.values(teams).filter(teamConnected);
}
function jokersUsed(team) {
  return Object.keys(team.jokers).filter((qid) => voided[qid] !== 'void').length;
}
function findTeamByName(name, exceptId = null) {
  const lower = name.toLowerCase();
  return Object.values(teams).find((t) => t.teamId !== exceptId && t.name.toLowerCase() === lower);
}

// ---------------------------------------------------------------
// Punten: altijd berekend uit de gegeven antwoorden
// ---------------------------------------------------------------
function questionScore(team, q) {
  const mode = voided[q.id];
  if (mode === 'void') return 0;
  const given = team.answers[q.id];
  const correct = mode === 'all_correct' || (given !== undefined && answerKind(q).check(q, given));
  if (!correct) return 0;
  let pts = pointsFor(q) + (team.bonus[q.id] || 0);
  if (team.jokers[q.id]) pts *= 2;
  return pts;
}

function scoreOf(team, upToIndex = allQuestions.length - 1) {
  let total = 0;
  for (let i = 0; i <= upToIndex && i < allQuestions.length; i++) {
    total += questionScore(team, allQuestions[i]);
  }
  return total;
}

function ranking(upToIndex = allQuestions.length - 1) {
  const list = Object.values(teams)
    .map((t) => ({ teamId: t.teamId, name: t.name, score: scoreOf(t, upToIndex) }))
    .sort((a, b) => b.score - a.score || byName(a, b));
  list.forEach((item) => {
    item.rank = 1 + list.filter((o) => o.score > item.score).length;
  });
  return list;
}

function finalScores() {
  return ranking();
}

// Tussenstand telt alleen afgesloten vragen, zodat hij geen antwoorden verklapt
function standings() {
  const upTo = stateBeforeStandings === 'WAITING_NEXT' ? currentIndex : currentIndex - 1;
  return ranking(upTo);
}

function reviewDetails() {
  const q = allQuestions[reviewIndex];
  if (!q) return null;
  const teamAnswers = Object.values(teams)
    .map((t) => {
      const v = t.answers[q.id];
      return {
        name: t.name,
        value: v === undefined ? null : v,
        correct: v !== undefined && answerKind(q).check(q, v),
        joker: !!t.jokers[q.id]
      };
    })
    .sort(byName);
  return {
    id: q.id,
    type: q.type,
    question: q.question,
    options: q.options,
    media: q.media,
    answer: q.answer,
    explanation: q.explanation || null,
    roundName: q.roundName,
    voided: voided[q.id] || null,
    teamAnswers,
    correctCount: teamAnswers.filter((a) => a.correct).length,
    totalTeams: teamAnswers.length
  };
}

// Wat welk scherm van een vraag te zien krijgt
function baseQuestion(q) {
  return { id: q.id, type: q.type, question: q.question, options: q.options, media: q.media, roundName: q.roundName };
}
function playerQuestion(q) {
  const v = baseQuestion(q);
  if (v.media && v.media.kind === 'audio') v.media = null; // het geluid komt van het tv-scherm
  return v;
}
function remoteQuestion(q) {
  return { ...baseQuestion(q), answer: q.answer, points: pointsFor(q), time: q.time ?? null, explanation: q.explanation || null };
}

// ---------------------------------------------------------------
// Timer (optioneel, loopt op de server)
// ---------------------------------------------------------------
function questionSeconds(q) {
  return q.time ?? settings.defaultTime;
}
function currentRemaining() {
  return timer.handle ? Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt)) : timer.remainingMs;
}
function timerStop() {
  if (timer.handle) {
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  }
}
function timerReset() {
  timerStop();
  timer.qid = null;
  timer.totalMs = 0;
  timer.remainingMs = 0;
}
function onTimeUp() {
  timer.handle = null;
  timer.remainingMs = 0;
  if (gameState === 'QUESTION') {
    gameState = 'WAITING_NEXT';
    sync();
  }
}
// Zorgt dat de timer klopt bij de huidige status (start, pauzeert, hervat)
function timerEnsure() {
  const q = currentQuestion();
  if (!settings.timerEnabled || gameState !== 'QUESTION' || !q || !questionSeconds(q)) return timerStop();
  if (timer.qid !== q.id) {
    timerStop();
    timer.qid = q.id;
    timer.totalMs = timer.remainingMs = questionSeconds(q) * 1000;
  }
  if (!timer.handle) {
    timer.startedAt = Date.now();
    timer.handle = setTimeout(onTimeUp, Math.max(0, timer.remainingMs));
  }
}
function timerExpired(q) {
  return settings.timerEnabled && timer.qid === q.id && !timer.handle && timer.remainingMs <= 0;
}
function timerInfo() {
  const q = currentQuestion();
  if (!settings.timerEnabled || !q || timer.qid !== q.id || !timer.totalMs) return null;
  return { remainingMs: Math.round(currentRemaining()), totalMs: timer.totalMs, running: !!timer.handle };
}

// ---------------------------------------------------------------
// Opslaan en hervatten
// ---------------------------------------------------------------
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 250);
}

function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      version: 1,
      savedAt: new Date().toISOString(),
      gameState,
      stateBeforePause,
      stateBeforeStandings,
      currentIndex,
      reviewIndex,
      revealState,
      settings,
      voided,
      timer: { qid: timer.qid, totalMs: timer.totalMs, remainingMs: Math.round(currentRemaining()) },
      teams,
      devices: Object.fromEntries(
        Object.entries(devices).map(([id, d]) => [id, { deviceId: d.deviceId, teamId: d.teamId, label: d.label }])
      )
    };
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, STATE_FILE); // atomisch: een halve schrijfactie kan het bestand niet beschadigen
  } catch (e) {
    console.error('Opslaan mislukt:', e.message);
  }
}

function loadSaved() {
  if (FRESH) {
    try { fs.unlinkSync(STATE_FILE); } catch (e) { /* bestond niet */ }
    return false;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    return false;
  }
  if (!data || data.version !== 1 || typeof data.teams !== 'object' || !allQuestions.length) return false;

  const states = ['LOBBY', 'QUESTION', 'WAITING_NEXT', 'PAUSED', 'STANDINGS', 'END', 'REVIEW'];
  const playing = ['QUESTION', 'WAITING_NEXT'];
  const clamp = (n) => Math.min(Math.max(Number.isInteger(n) ? n : 0, 0), allQuestions.length - 1);

  teams = {};
  for (const t of Object.values(data.teams)) {
    if (!t || !t.teamId || !t.name) continue;
    teams[t.teamId] = {
      teamId: t.teamId,
      name: t.name,
      answers: t.answers || {},
      bonus: t.bonus || {},
      jokers: t.jokers || {},
      baseDeviceId: t.baseDeviceId
    };
  }
  devices = {};
  for (const d of Object.values(data.devices || {})) {
    if (!d || !teams[d.teamId]) continue;
    devices[d.deviceId] = { deviceId: d.deviceId, teamId: d.teamId, label: d.label || 'Telefoon', socketId: null, connected: false, lastAlertTime: 0 };
  }
  for (const t of Object.values(teams)) {
    if (!devices[t.baseDeviceId]) {
      const first = teamDevices(t)[0];
      if (first) t.baseDeviceId = first.deviceId;
    }
  }

  settings = sanitizeSettings(data.settings, settings);
  voided = data.voided && typeof data.voided === 'object' ? data.voided : {};
  currentIndex = clamp(data.currentIndex);
  reviewIndex = clamp(data.reviewIndex);
  revealState = ['idle', 'running', 'done'].includes(data.revealState) ? data.revealState : 'idle';
  stateBeforeStandings = playing.includes(data.stateBeforeStandings) ? data.stateBeforeStandings : 'QUESTION';
  stateBeforePause = playing.includes(data.stateBeforePause) ? data.stateBeforePause : 'QUESTION';

  gameState = states.includes(data.gameState) ? data.gameState : 'LOBBY';
  // Na een herstart komen teams pas langzaam terug: begin dus op pauze
  if (gameState === 'STANDINGS') {
    stateBeforePause = stateBeforeStandings;
    gameState = 'PAUSED';
  } else if (playing.includes(gameState)) {
    stateBeforePause = gameState;
    gameState = 'PAUSED';
  }

  if (data.timer && typeof data.timer === 'object') {
    timer.qid = data.timer.qid ?? null;
    timer.totalMs = Number(data.timer.totalMs) || 0;
    timer.remainingMs = Number(data.timer.remainingMs) || 0;
  }
  return Object.keys(teams).length > 0 || gameState !== 'LOBBY';
}

// ---------------------------------------------------------------
// Status naar de schermen sturen
// ---------------------------------------------------------------
// Alle verbonden teams hebben geantwoord -> WAITING_NEXT
function settleQuestion() {
  if (gameState !== 'QUESTION') return;
  const active = activeTeams();
  if (active.length > 0 && active.every((t) => hasAnswered(t))) gameState = 'WAITING_NEXT';
}

function broadcastState() {
  const q = currentQuestion();
  const active = activeTeams();
  const inPlay = ['QUESTION', 'WAITING_NEXT', 'PAUSED'].includes(gameState);
  const showScores = gameState === 'END' || gameState === 'REVIEW';
  const roundName = gameState === 'LOBBY' || !q ? 'Familiequiz' : q.roundName;
  const standingsList = gameState === 'STANDINGS' ? standings() : null;
  const standingsAfter = gameState === 'STANDINGS'
    ? (stateBeforeStandings === 'WAITING_NEXT' ? currentIndex + 1 : currentIndex)
    : null;
  const timerNow = timerInfo();
  const answeredCount = inPlay ? active.filter((t) => hasAnswered(t)).length : 0;
  const reviewProgress = { current: reviewIndex + 1, total: allQuestions.length };

  const common = {
    gameState,
    roundName,
    questionNumber: currentIndex + 1,
    totalQuestions: allQuestions.length,
    answeredCount,
    activeCount: active.length,
    timer: timerNow,
    standings: standingsList,
    standingsAfter,
    revealState
  };

  const teamList = Object.values(teams)
    .map((t) => ({
      teamId: t.teamId,
      name: t.name,
      connected: teamConnected(t),
      answered: inPlay && hasAnswered(t),
      members: teamDevices(t).length
    }))
    .sort(byName);

  // Tv-scherm: openbaar, dus alleen wat op dat moment getoond mag worden
  io.to('tv_room').emit('state_update', {
    ...common,
    currentQuestion: inPlay && q ? baseQuestion(q) : null,
    teamList,
    reviewQuestion: gameState === 'REVIEW' ? reviewDetails() : null,
    reviewProgress,
    finalScores: showScores && revealState !== 'idle' ? finalScores() : null
  });

  // Bediening: ziet ook het goede antwoord en de instellingen
  io.to('remote_room').emit('state_update', {
    ...common,
    currentQuestion: inPlay && q ? remoteQuestion(q) : null,
    voided: q ? voided[q.id] || null : null,
    teams: Object.values(teams)
      .map((t) => ({
        teamId: t.teamId,
        name: t.name,
        connected: teamConnected(t),
        answered: inPlay && hasAnswered(t),
        jokersUsed: jokersUsed(t),
        members: teamDevices(t).map((d) => ({
          label: d.label,
          role: d.deviceId === t.baseDeviceId ? 'base' : 'member',
          connected: d.connected
        }))
      }))
      .sort(byName),
    settings,
    settingsLocked: gameState !== 'LOBBY',
    reviewQuestion: gameState === 'REVIEW' ? reviewDetails() : null,
    reviewProgress,
    finalScores: showScores ? finalScores() : null
  });

  // Telefoons: alleen de eigen teamstatus, nooit scores of antwoorden
  Object.values(devices).forEach((d) => {
    if (!d.connected || !d.socketId) return;
    const t = teams[d.teamId];
    if (!t) return;
    const answered = inPlay && !!q && hasAnswered(t, q);
    io.to(d.socketId).emit('state_update', {
      gameState,
      roundName,
      currentQuestion: gameState === 'QUESTION' && q ? playerQuestion(q) : null,
      timer: gameState === 'QUESTION' ? timerNow : null,
      standings: standingsList,
      settings: { jokersPerTeam: settings.jokersPerTeam, timerEnabled: settings.timerEnabled },
      me: {
        teamId: t.teamId,
        teamName: t.name,
        label: d.label,
        role: t.baseDeviceId === d.deviceId ? 'base' : 'member',
        baseLabel: devices[t.baseDeviceId] ? devices[t.baseDeviceId].label : '',
        answered,
        givenAnswer: answered ? t.answers[q.id] : null,
        jokerActive: answered && !!t.jokers[q.id],
        jokersLeft: Math.max(0, settings.jokersPerTeam - jokersUsed(t)),
        members: teamDevices(t).map((m) => ({
          label: m.label,
          role: m.deviceId === t.baseDeviceId ? 'base' : 'member',
          connected: m.connected
        }))
      }
    });
  });

  scheduleSave();
}

function sync() {
  settleQuestion();
  timerEnsure();
  broadcastState();
}

// ---------------------------------------------------------------
// Hulpfuncties voor sockets
// ---------------------------------------------------------------
const isRemote = (socket) => socket.data.role === 'remote';

function deviceOf(socket) {
  const d = devices[socket.data.deviceId];
  return d && d.socketId === socket.id ? d : null;
}

// Foute pincodes tellen per IP-adres (achter de Render-proxy uit x-forwarded-for)
const PIN_MAX_FAILS = 20;
const PIN_WINDOW_MS = 10 * 60 * 1000;
const pinFailures = new Map(); // ip -> { count, resetAt }

function clientIp(socket) {
  const h = socket.handshake || {};
  const fwd = h.headers && h.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return h.address || 'onbekend';
}

function checkPin(socket, pin) {
  const ip = clientIp(socket);
  const entry = pinFailures.get(ip);
  if (entry && Date.now() < entry.resetAt && entry.count >= PIN_MAX_FAILS) {
    socket.emit('auth_denied', { locked: true });
    return false;
  }
  if (typeof pin === 'string' && pin.trim() === HOST_PIN) return true;

  const now = Date.now();
  const fresh = !entry || now >= entry.resetAt;
  pinFailures.set(ip, { count: (fresh ? 0 : entry.count) + 1, resetAt: fresh ? now + PIN_WINDOW_MS : entry.resetAt });

  socket.data.pinFails = (socket.data.pinFails || 0) + 1;
  socket.emit('auth_denied', { locked: false });
  if (socket.data.pinFails >= 5) socket.disconnect(true);
  return false;
}

function attachSocket(socket, device) {
  device.socketId = socket.id;
  device.connected = true;
  socket.data.deviceId = device.deviceId;
}

// Team dat terugkomt terwijl de vraag al "klaar" was, mag alsnog antwoorden
// (behalve als de tijd om is)
function reopenIfMissed(team) {
  const q = currentQuestion();
  if (gameState === 'WAITING_NEXT' && q && teamConnected(team) && !hasAnswered(team, q) && !timerExpired(q)) {
    gameState = 'QUESTION';
  }
}

function removeTeam(teamId) {
  const team = teams[teamId];
  if (!team) return;
  for (const d of teamDevices(team)) {
    if (d.socketId) {
      const s = io.sockets.sockets.get(d.socketId);
      if (s) {
        s.data.deviceId = null;
        s.emit('kicked');
      }
    }
    delete devices[d.deviceId];
  }
  delete teams[teamId];
}

io.on('connection', (socket) => {
  // ---------- Schermen registreren ----------
  socket.on('register_remote', ({ pin } = {}) => {
    if (!checkPin(socket, pin)) return;
    socket.data.role = 'remote';
    socket.join('remote_room');
    socket.emit('remote_confirmed');
    broadcastState();
  });

  // Het tv-scherm toont alleen wat zichtbaar mag zijn, dus geen pincode nodig
  socket.on('register_tv', () => {
    socket.data.role = 'tv';
    socket.join('tv_room');
    socket.emit('tv_ok');
    broadcastState();
  });

  // ---------- Telefoons: team maken of aansluiten ----------
  socket.on('hello', ({ deviceId } = {}) => {
    const device = typeof deviceId === 'string' ? devices[deviceId] : null;
    if (!device || !teams[device.teamId]) return socket.emit('need_join');
    attachSocket(socket, device);
    socket.emit('session', { deviceId: device.deviceId });
    reopenIfMissed(teams[device.teamId]);
    sync();
  });

  socket.on('list_teams', (_, cb) => {
    if (typeof cb !== 'function') return;
    cb({
      teams: Object.values(teams)
        .map((t) => ({ teamId: t.teamId, name: t.name, members: teamDevices(t).length }))
        .sort(byName)
    });
  });

  socket.on('create_team', ({ teamName, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (gameState === 'END' || gameState === 'REVIEW') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    const name = cleanName(teamName, MAX_TEAM_NAME);
    if (!name) return reply({ ok: false, message: 'Vul een teamnaam in.' });
    if (findTeamByName(name)) return reply({ ok: false, message: `De teamnaam "${name}" is al in gebruik.` });

    const device = { deviceId: newId('d_'), teamId: null, label: cleanName(label, MAX_LABEL) || 'Basis', socketId: null, connected: false, lastAlertTime: 0 };
    const team = { teamId: newId('t_'), name, answers: {}, bonus: {}, jokers: {}, baseDeviceId: device.deviceId };
    device.teamId = team.teamId;
    teams[team.teamId] = team;
    devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });

  socket.on('join_team', ({ teamId, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (gameState === 'END' || gameState === 'REVIEW') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    const team = teams[teamId];
    if (!team) return reply({ ok: false, message: 'Dat team bestaat niet meer.' });
    const members = teamDevices(team);
    if (members.length >= MAX_DEVICES_PER_TEAM) return reply({ ok: false, message: 'Dit team zit vol.' });

    const device = {
      deviceId: newId('d_'),
      teamId: team.teamId,
      label: cleanName(label, MAX_LABEL) || `Teamlid ${members.length}`,
      socketId: null,
      connected: false,
      lastAlertTime: 0
    };
    devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });

  // Een teamlid neemt de basis over (bijvoorbeeld als de basistelefoon leeg is)
  socket.on('make_base', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return reply({ ok: false });
    team.baseDeviceId = device.deviceId;
    reply({ ok: true });
    sync();
  });

  socket.on('leave_team', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return reply({ ok: false });
    if (team.baseDeviceId === device.deviceId) {
      return reply({ ok: false, message: 'De basistelefoon kan het team niet verlaten. Geef eerst de basis aan een teamlid ("Basis overnemen" op die telefoon).' });
    }
    delete devices[device.deviceId];
    socket.data.deviceId = null;
    reply({ ok: true });
    sync();
  });

  // ---------- Antwoorden: alleen via de basistelefoon van het team ----------
  socket.on('submit_answer', ({ questionId, answer, joker } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    const q = currentQuestion();

    if (!team || !q || gameState !== 'QUESTION') return reply({ ok: false, reason: 'not_open' });
    if (team.baseDeviceId !== device.deviceId) return reply({ ok: false, reason: 'not_base' });
    if (questionId !== q.id) return reply({ ok: false, reason: 'wrong_question' });
    const kind = answerKind(q);
    if (!kind.validate(q, answer)) return reply({ ok: false, reason: 'invalid' });
    if (hasAnswered(team, q)) return reply({ ok: true, already: true });

    if (joker) {
      if (settings.jokersPerTeam - jokersUsed(team) <= 0) return reply({ ok: false, reason: 'no_joker' });
      team.jokers[q.id] = true;
    }
    team.answers[q.id] = answer;

    // Snelheidsbonus: alleen voor een goed antwoord, naar verhouding van de resterende tijd
    if (settings.timerEnabled && settings.speedBonus && timer.qid === q.id && timer.totalMs > 0 && kind.check(q, answer)) {
      team.bonus[q.id] = Math.round(settings.speedBonusMax * Math.min(1, currentRemaining() / timer.totalMs));
    }
    reply({ ok: true });
    sync();
  });

  // ---------- Anti-spiek: tijdens een open vraag, ook na het indienen ----------
  socket.on('player_blurred', ({ reason } = {}) => {
    if (gameState !== 'QUESTION' && gameState !== 'WAITING_NEXT') return;
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return;

    const now = Date.now();
    if (now - device.lastAlertTime < 3500) return;
    device.lastAlertTime = now;

    io.to('remote_room').emit('cheat_warning', {
      teamName: team.name,
      label: device.label,
      role: team.baseDeviceId === device.deviceId ? 'base' : 'member',
      reason: reason === 'locked' ? 'locked' : 'app_switch',
      timestamp: new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' })
    });
  });

  // ---------- Bediening: spelverloop ----------
  socket.on('next_question', () => {
    if (!isRemote(socket)) return;

    if (gameState === 'LOBBY') {
      if (allQuestions.length === 0) {
        return socket.emit('host_error', { message: 'Er zijn geen geldige vragen geladen. Controleer questions.json.' });
      }
      if (Object.keys(teams).length === 0) {
        return socket.emit('host_error', { message: 'Er is nog geen team aangemeld.' });
      }
      currentIndex = 0;
      gameState = 'QUESTION';
    } else if (gameState === 'QUESTION' || gameState === 'WAITING_NEXT') {
      if (currentIndex + 1 >= allQuestions.length) {
        gameState = 'END';
        revealState = 'idle';
      } else {
        currentIndex++;
        gameState = 'QUESTION';
      }
    } else {
      return;
    }
    sync();
  });

  // Gegeven antwoorden blijven staan, dus terugbladeren telt nooit dubbel
  socket.on('prev_question', () => {
    if (!isRemote(socket)) return;
    if ((gameState === 'QUESTION' || gameState === 'WAITING_NEXT') && currentIndex > 0) {
      currentIndex--;
      gameState = 'QUESTION';
      sync();
    }
  });

  socket.on('toggle_pause', () => {
    if (!isRemote(socket)) return;
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

  socket.on('toggle_standings', () => {
    if (!isRemote(socket)) return;
    if (gameState === 'STANDINGS') {
      gameState = stateBeforeStandings;
    } else if (gameState === 'QUESTION' || gameState === 'WAITING_NEXT') {
      stateBeforeStandings = gameState;
      gameState = 'STANDINGS';
    } else {
      return;
    }
    sync();
  });

  // ---------- Bediening: ontknoping en nakijken ----------
  socket.on('start_reveal', () => {
    if (!isRemote(socket) || gameState !== 'END' || revealState !== 'idle') return;
    revealState = 'running';
    broadcastState();
  });

  // Het tv-scherm meldt dat de ontknoping klaar is (de bediening mag overslaan)
  socket.on('reveal_done', () => {
    if ((!isRemote(socket) && socket.data.role !== 'tv') || revealState !== 'running') return;
    revealState = 'done';
    broadcastState();
  });

  socket.on('start_review', () => {
    if (!isRemote(socket) || gameState !== 'END') return;
    if (revealState !== 'done' && Object.keys(teams).length > 0) return;
    gameState = 'REVIEW';
    reviewIndex = 0;
    broadcastState();
  });

  socket.on('next_review_question', () => {
    if (!isRemote(socket) || gameState !== 'REVIEW') return;
    if (reviewIndex < allQuestions.length - 1) reviewIndex++;
    else gameState = 'END';
    broadcastState();
  });

  socket.on('prev_review_question', () => {
    if (!isRemote(socket) || gameState !== 'REVIEW' || reviewIndex === 0) return;
    reviewIndex--;
    broadcastState();
  });

  socket.on('back_to_scores', () => {
    if (!isRemote(socket) || gameState !== 'REVIEW') return;
    gameState = 'END';
    broadcastState();
  });

  // ---------- Bediening: instellingen (alleen in de lobby) ----------
  socket.on('update_settings', (partial) => {
    if (!isRemote(socket)) return;
    if (gameState !== 'LOBBY') {
      return socket.emit('host_error', { message: 'Instellingen kunnen alleen vóór de start worden gewijzigd.' });
    }
    settings = sanitizeSettings(partial, settings);
    sync();
  });

  // ---------- Bediening: noodknoppen ----------
  socket.on('add_time', () => {
    if (!isRemote(socket) || !settings.timerEnabled) return;
    const q = currentQuestion();
    if (!q || (gameState !== 'QUESTION' && gameState !== 'WAITING_NEXT') || !questionSeconds(q)) return;
    timerStop();
    if (timer.qid !== q.id) {
      timer.qid = q.id;
      timer.totalMs = 0;
      timer.remainingMs = 0;
    }
    timer.remainingMs += 10000;
    timer.totalMs = Math.max(timer.totalMs, timer.remainingMs);
    if (gameState === 'WAITING_NEXT') gameState = 'QUESTION'; // wordt teruggezet als iedereen al klaar is
    sync();
  });

  // Antwoord van een team wissen, zodat het opnieuw kan antwoorden (bijv. verkeerd getikt)
  socket.on('clear_answer', ({ teamId } = {}) => {
    if (!isRemote(socket)) return;
    const team = teams[teamId];
    const q = currentQuestion();
    if (!team || !q || (gameState !== 'QUESTION' && gameState !== 'WAITING_NEXT')) return;

    delete team.answers[q.id];
    delete team.bonus[q.id];
    delete team.jokers[q.id];

    if (gameState === 'WAITING_NEXT') {
      gameState = 'QUESTION';
      if (settings.timerEnabled && questionSeconds(q)) {
        timerStop();
        if (timer.qid !== q.id) {
          timer.qid = q.id;
          timer.totalMs = 0;
          timer.remainingMs = 0;
        }
        timer.remainingMs = Math.max(timer.remainingMs, 15000);
        timer.totalMs = Math.max(timer.totalMs, timer.remainingMs);
      }
    }
    sync();
  });

  // Foute of dubbelzinnige vraag: 'void' (telt voor niemand), 'all_correct' (iedereen goed) of null (normaal)
  socket.on('void_question', ({ qid, mode } = {}) => {
    if (!isRemote(socket) || gameState === 'LOBBY') return;
    if (!allQuestions.some((q) => q.id === qid)) return;
    if (mode === 'void' || mode === 'all_correct') voided[qid] = mode;
    else if (mode === null) delete voided[qid];
    else return;
    sync();
  });

  socket.on('rename_team', ({ teamId, name } = {}) => {
    if (!isRemote(socket)) return;
    const team = teams[teamId];
    const clean = cleanName(name, MAX_TEAM_NAME);
    if (!team || !clean) return;
    if (findTeamByName(clean, teamId)) {
      return socket.emit('host_error', { message: `De teamnaam "${clean}" is al in gebruik.` });
    }
    team.name = clean;
    sync();
  });

  socket.on('remove_team', ({ teamId } = {}) => {
    if (!isRemote(socket) || !teams[teamId]) return;
    removeTeam(teamId);
    sync();
  });

  // ---------- Bediening: volledige reset ----------
  socket.on('reset_quiz', () => {
    if (!isRemote(socket)) return;
    gameState = 'LOBBY';
    stateBeforePause = 'QUESTION';
    stateBeforeStandings = 'QUESTION';
    currentIndex = 0;
    reviewIndex = 0;
    revealState = 'idle';
    voided = {};
    teams = {};
    devices = {};
    timerReset();
    io.emit('quiz_reset');
    broadcastState();
  });

  // ---------- Verbinding weg ----------
  socket.on('disconnect', () => {
    const device = devices[socket.data.deviceId];
    if (device && device.socketId === socket.id) {
      device.connected = false;
      sync();
    }
  });
});

// ---------------------------------------------------------------
// Opstarten
// ---------------------------------------------------------------
const restored = loadSaved();

function shutdown() {
  saveNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  const url = getJoinUrl();
  console.log(`Quiz server actief op http://localhost:${PORT}`);
  console.log(`Telefoons (zelfde wifi):  ${url}`);
  console.log(`Tv-scherm:                ${url}/host.html`);
  console.log(`Bediening:                ${url}/bediening.html`);
  console.log(`Pincode bediening:        ${HOST_PIN}`);
  if (pinWasGenerated) {
    console.log('Let op: HOST_PIN is niet ingesteld, dus deze code is willekeurig gekozen en verandert bij elke start.');
    console.log('Zet HOST_PIN in de instellingen van Render om hem vast te leggen.');
  }
  console.log(`${allQuestions.length} vragen geladen in ${rawRounds.length} rondes.`);
  if (restored) {
    console.log(`Vorige quiz hersteld uit ${STATE_FILE}: ${Object.keys(teams).length} teams, status ${gameState}.`);
    console.log('Teams komen vanzelf terug. Hervat de quiz met de pauzeknop, of begin opnieuw met Reset.');
  }
});
