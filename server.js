const express = require('express');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const createHandlers = require('./rounds');

const PORT = process.env.PORT || 3000;
const ON_RENDER = !!process.env.RENDER;

let HOST_PIN = String(process.env.HOST_PIN || '').trim();
let pinWasGenerated = false;
if (!HOST_PIN) {
  if (ON_RENDER) { HOST_PIN = String(crypto.randomInt(100000, 1000000)); pinWasGenerated = true; }
  else HOST_PIN = '1234';
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const FRESH = process.argv.includes('--fresh') || process.env.FRESH === '1';

const MAX_TEAM_NAME = 24;
const MAX_LABEL = 16;
const MAX_DEVICES_PER_TEAM = 8;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------
// Join-URL voor de QR-code
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
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// ---------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------
const DEFAULT_SETTINGS = {
  timerEnabled: false, // tijdslimiet bij meerkeuzevragen
  defaultTime: 20,     // seconden voor vragen zonder eigen "time"
  roundMax: 100        // te verdienen punten per ronde (per ronde te overschrijven met "points")
};
function sanitizeSettings(input, base) {
  const out = { ...base };
  const src = input && typeof input === 'object' ? input : {};
  if (typeof src.timerEnabled === 'boolean') out.timerEnabled = src.timerEnabled;
  const int = (k, min, max) => { if (Number.isInteger(src[k]) && src[k] >= min && src[k] <= max) out[k] = src[k]; };
  int('defaultTime', 5, 300);
  int('roundMax', 10, 1000);
  return out;
}
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = sanitizeSettings(JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), DEFAULT_SETTINGS);
} catch (e) { /* geen config.json */ }

// ---------------------------------------------------------------
// Spelstatus
// ---------------------------------------------------------------
let teams = {};
let devices = {};
let steps = [];          // het hele programma, plat: info-schermen, vragen, nakijken, jokers...
let rounds = [];
let stepIndexBySid = {};
let stepState = {};      // sid -> status van die stap (fase, tekenstreken, enz.)
let currentIndex = 0;
let gameState = 'LOBBY'; // LOBBY, PLAY, PAUSED, STANDINGS, END
let stateBeforePause = 'PLAY';
let revealState = 'idle';
let breakdownShown = false;
let voided = {};

const timer = { sid: null, totalMs: 0, remainingMs: 0, startedAt: 0, handle: null, active: false };

const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
const newId = (prefix) => prefix + crypto.randomBytes(6).toString('hex');
const cleanName = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const currentStep = () => steps[currentIndex] || null;
const getSS = (st) => (stepState[st.sid] = stepState[st.sid] || {});
const teamDevices = (team) => Object.values(devices).filter((d) => d.teamId === team.teamId);
const teamConnected = (team) => { const b = devices[team.baseDeviceId]; return !!(b && b.connected); };
const activeTeams = () => Object.values(teams).filter(teamConnected);
const connectedDevices = (team) => teamDevices(team).filter((d) => d.connected);
function notifyTeam(team, text) {
  for (const d of teamDevices(team)) if (d.connected && d.socketId) io.to(d.socketId).emit('team_notice', { text });
}
const labelTaken = (team, label, except = null) =>
  teamDevices(team).some((d) => d.deviceId !== except && d.label.toLowerCase() === label.toLowerCase());
const findTeamByName = (name, except = null) =>
  Object.values(teams).find((t) => t.teamId !== except && t.name.toLowerCase() === name.toLowerCase());

function proposalFor(team, device) {
  const p = team.proposal;
  const candidate = p && devices[p.candidateId];
  if (!candidate) return null;
  const proposer = devices[p.proposerId];
  const need = connectedDevices(team);
  return {
    candidateMemberId: candidate.memberId, candidateLabel: candidate.label, proposerLabel: proposer ? proposer.label : '',
    youApproved: p.approvals.includes(device.deviceId), youAreProposer: p.proposerId === device.deviceId,
    youAreCandidate: candidate.deviceId === device.deviceId,
    approved: need.filter((x) => p.approvals.includes(x.deviceId)).length, needed: need.length
  };
}

// ---------------------------------------------------------------
// Media
// ---------------------------------------------------------------
function normalizeMedia(q) {
  let media = q.media && typeof q.media === 'object' ? { ...q.media } : null;
  if (!media && q.imageUrl) media = { kind: 'image', src: q.imageUrl };
  if (!media && q.audioUrl) media = { kind: 'audio', src: q.audioUrl };
  if (!media || !media.src) return null;
  if (!/^(https?:)?\/\//i.test(media.src) && !media.src.startsWith('/')) media.src = '/media/' + media.src.replace(/^\.?\/+/, '');
  if (!Array.isArray(media.hide)) media.hide = null; // logo's: [[x%, y%, breedte%, hoogte%], ...] die verborgen worden
  return media;
}

// ---------------------------------------------------------------
// Engine voor de rondetypes (rounds.js)
// ---------------------------------------------------------------
const E = {
  settings: () => settings,
  teams: () => Object.values(teams),
  team: (id) => teams[id],
  active: activeTeams,
  devicesOf: teamDevices,
  isBase: (team, device) => team.baseDeviceId === device.deviceId,
  toTeam(team, event, payload, exceptDeviceId) {
    for (const d of teamDevices(team)) if (d.connected && d.socketId && d.deviceId !== exceptDeviceId) io.to(d.socketId).emit(event, payload);
  },
  byName,
  cleanText: cleanName,
  step: (i) => steps[i],
  ss: getSS,
  handler: (st) => H[st.rtype],
  timer: {
    sid: () => timer.sid,
    start(sid, ms) { timerStop(); timer.sid = sid; timer.totalMs = timer.remainingMs = ms; timer.active = true; },
    clear() { timerStop(); timer.active = false; timer.sid = null; timer.totalMs = 0; timer.remainingMs = 0; }
  },
  totalBefore: (team) => totalOf(team, { joker: true, final: false }),
  jokerChoices(team) {
    return rounds.filter((r) => r.jokerable).map((r) => ({ id: r.id, name: r.name, pts: roundScore(team, r) }));
  },
  jokerRoundCount: () => rounds.filter((r) => r.jokerable).length,
  roundName: (id) => (rounds.find((r) => r.id === id) || {}).name,
  roundTable(roundIdx) {
    const r = rounds[roundIdx];
    const rows = Object.values(teams).map((t) => ({ teamId: t.teamId, name: t.name, roundPts: roundScore(t, r), total: grandTotal(t) }));
    rows.sort((a, b) => b.roundPts - a.roundPts || byName(a, b));
    rows.forEach((x) => { x.rank = 1 + rows.filter((o) => o.roundPts > x.roundPts).length; });
    return { name: r.name, points: roundPoints(r), rows };
  }
};
const H = createHandlers(E);

// ---------------------------------------------------------------
// Programma opbouwen uit questions.json
// ---------------------------------------------------------------
const ROUND_EMOJI = { mc: '❓', logo: '🏷️', blur: '🔍', memory: '🧠', hitster: '🎵', prices: '🛒', draw: '✏️', thirty: '⏱️', final: '🎯' };
const DEFAULT_RULES = {
  mc: 'Meerkeuzevragen. Overleg samen, de basistelefoon dient het antwoord in.',
  logo: 'Raad het logo. Een deel van het logo is verborgen!',
  blur: 'Een plaatje wordt steeds scherper. Hoe eerder je het goede antwoord geeft, hoe meer punten. Een fout antwoord levert niets op en je kunt niet opnieuw.',
  memory: 'Vorig jaar schreven we dingen op een bord. Schrijf zoveel mogelijk op wat je nog weet. De quizmaster keurt jullie antwoorden goed of fout.',
  hitster: 'Leg de nummers in de juiste tijdlijn. Alleen de basistelefoon mag kaarten plaatsen.',
  prices: 'Wat kostte een boodschap vroeger en wat kost hij nu? Wie er het dichtst bij zit, krijgt de meeste punten.',
  draw: 'Per team tekent steeds één speler aan de tafel van de quizmaster. De rest van het team ziet de tekening live op de telefoon. Wie het goed raadt, verdient een punt. Iedereen is een keer tekenaar.',
  thirty: 'Eén speler legt vijf dingen uit aan het eigen team, in 30 seconden. De quizmaster keurt de goede antwoorden goed. De teams zijn om en om aan de beurt en iedereen is een keer uitlegger.',
  final: 'De slotvraag! Zet zoveel van je eigen punten in als je durft. Goed: je inzet wordt verdubbeld. Fout: je verliest je inzet.'
};
const REVIEW_TYPES = ['mc', 'logo'];

function buildProgram() {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8')); }
  catch (e) { console.error('Fout bij inladen questions.json:', e.message); }
  const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.rounds) ? raw.rounds : [];
  steps = []; rounds = [];
  const add = (st) => { st.index = steps.length; steps.push(st); return st; };
  const usedSids = new Set();
  const uniqueSid = (s) => { let x = s, n = 2; while (usedSids.has(x)) x = `${s}_${n++}`; usedSids.add(x); return x; };
  let jokerAdded = false;
  let reviewGroup = 0;
  const addJoker = () => {
    if (jokerAdded || !rounds.some((r) => r.jokerable)) return;
    jokerAdded = true;
    add({ sid: uniqueSid('joker'), kind: 'joker', rtype: 'joker', roundIdx: -1, label: 'Jokers' });
  };

  list.forEach((r, ri) => {
    if (!r || r.enabled === false) return;
    const type = H[r.type] && !['info', 'round_end', 'review', 'joker'].includes(r.type) ? r.type : 'mc';
    const h = H[type];
    const round = {
      id: String(r.id || `r${ri + 1}`), idx: rounds.length, type, raw: r,
      name: r.name || r.roundName || `Ronde ${ri + 1}`,
      counts: r.counts !== false, normalized: type !== 'final'
    };
    round.jokerable = round.counts && round.normalized && r.joker !== false;
    if (type === 'final') addJoker();
    rounds.push(round);
    const reveal = REVIEW_TYPES.includes(type) ? (r.reveal || 'after_each') : 'after_each';

    add({ sid: uniqueSid(`${round.id}:intro`), kind: 'info', rtype: 'info', roundIdx: round.idx,
      item: { emoji: (r.intro && r.intro.emoji) || r.emoji || ROUND_EMOJI[type], title: (r.intro && r.intro.title) || round.name,
        text: (r.intro && r.intro.text) || r.rules || DEFAULT_RULES[type], points: round.counts && round.normalized ? roundPoints(round) : null, counts: round.counts } });

    const makeItems = (rawItems, practice) => {
      const items = [];
      rawItems.forEach((it, i) => {
        const prepped = h.prep({ ...it, media: normalizeMedia(it) }, round);
        if (!prepped) { console.warn(`Waarschuwing: item ${i + 1} in "${round.name}" is ongeldig en wordt overgeslagen.`); return; }
        items.push(prepped);
      });
      return items;
    };
    const mkSteps = (items, practice) => items.map((item, i) => add({
      sid: uniqueSid(`${round.id}:${practice ? 'p' : ''}${item.id || i + 1}`), kind: 'item', rtype: type, roundIdx: round.idx,
      practice, item, itemNo: i + 1, itemTotal: items.length, revealNow: reveal === 'after_each'
    }));

    if (Array.isArray(r.practice) && r.practice.length) {
      const pItems = makeItems(r.practice, true);
      mkSteps(pItems, true);
      add({ sid: uniqueSid(`${round.id}:real`), kind: 'info', rtype: 'info', roundIdx: round.idx,
        item: { emoji: '🚀', title: (r.realIntro && r.realIntro.title) || 'Nu de échte vragen!', text: (r.realIntro && r.realIntro.text) || 'De oefenronde is voorbij. Vanaf nu tellen de punten mee.', points: roundPoints(round) } });
    }

    const rawItems = h.roundItems ? h.roundItems(r) : (Array.isArray(r.items) ? r.items : []);
    const items = makeItems(rawItems, false);
    if (type === 'hitster' && !items.length) items.push(h.prep({}));
    const itemSteps = mkSteps(items, false);

    // Nakijken-schermen (alleen meerkeuze/logo): na elke categorie of na de ronde
    if (reveal === 'after_category' || reveal === 'after_round') {
      let group = [];
      const flush = (label) => {
        if (!group.length) return;
        const g = ++reviewGroup;
        add({ sid: uniqueSid(`${round.id}:rev${g}`), kind: 'info', rtype: 'info', roundIdx: round.idx, reviewGroup: g,
          item: { emoji: '📝', title: `Nakijken${label ? ': ' + label : ''}`, text: 'We lopen de vragen nog even langs. Kijk op het grote scherm wat jullie antwoord was.' } });
        group.forEach((s, i) => add({ sid: uniqueSid(`${s.sid}:review`), kind: 'review', rtype: 'review', roundIdx: round.idx, ref: s.index, reviewGroup: g, itemNo: i + 1, itemTotal: group.length }));
        group = [];
      };
      itemSteps.forEach((s, i) => {
        group.push(s);
        const next = itemSteps[i + 1];
        const endOfGroup = !next || (reveal === 'after_category' && (next.item.category || '') !== (s.item.category || ''));
        if (endOfGroup) flush(reveal === 'after_category' ? s.item.category : round.name);
      });
    }

    if (round.counts && round.normalized) {
      add({ sid: uniqueSid(`${round.id}:end`), kind: 'round_end', rtype: 'round_end', roundIdx: round.idx });
    }
    if (r.outro) {
      add({ sid: uniqueSid(`${round.id}:outro`), kind: 'info', rtype: 'info', roundIdx: round.idx,
        item: { emoji: r.outro.emoji || '🚀', title: r.outro.title || '', text: r.outro.text || '' } });
    }
  });
  addJoker();
  stepIndexBySid = {};
  steps.forEach((s) => { stepIndexBySid[s.sid] = s.index; });
}

// ---------------------------------------------------------------
// Punten
// ---------------------------------------------------------------
const roundPoints = (r) => (Number.isFinite(r.raw.points) ? r.raw.points : settings.roundMax);

function stepDone(st) {
  if (gameState === 'END') return true;
  if (st.index < currentIndex) return true;
  if (st.index > currentIndex || gameState === 'LOBBY') return false;
  const h = H[st.rtype];
  return h.done ? !!h.done(st, getSS(st)) : false;
}

function roundScore(team, round) {
  if (!round.normalized || !round.counts) return 0;
  let num = 0, den = 0;
  for (const st of steps) {
    if (st.roundIdx !== round.idx || st.kind !== 'item' || st.practice) continue;
    if (voided[st.sid] === 'void') continue;
    const sc = H[st.rtype].score(st, getSS(st), team);
    den += sc.max;
    if (voided[st.sid] === 'all_correct') num += sc.max;
    else if (stepDone(st)) num += sc.points;
  }
  return den ? Math.round((roundPoints(round) * num) / den) : 0;
}

function jokerApplied() {
  const js = steps.find((s) => s.kind === 'joker');
  return !!js && stepDone(js);
}

function totalOf(team, o = {}) {
  let sum = 0;
  for (const r of rounds) {
    if (!r.normalized || !r.counts) continue;
    const v = roundScore(team, r);
    sum += o.joker && team.joker === r.id ? v * 2 : v;
  }
  if (o.final) {
    for (const st of steps) {
      if (st.kind === 'item' && st.rtype === 'final' && !st.practice && stepDone(st) && voided[st.sid] !== 'void') sum += H.final.score(st, getSS(st), team).points;
    }
  }
  return sum;
}
const grandTotal = (team) => totalOf(team, { joker: jokerApplied(), final: true });

function ranking() {
  const list = Object.values(teams).map((t) => ({ teamId: t.teamId, name: t.name, score: grandTotal(t) })).sort((a, b) => b.score - a.score || byName(a, b));
  list.forEach((x) => { x.rank = 1 + list.filter((o) => o.score > x.score).length; });
  return list;
}

function breakdown() {
  const counted = rounds.filter((r) => r.normalized && r.counts);
  const finals = steps.filter((s) => s.kind === 'item' && s.rtype === 'final' && !s.practice);
  const rows = ranking().map((x) => {
    const t = teams[x.teamId];
    return { name: x.name, rank: x.rank, total: x.score,
      rounds: counted.map((r) => ({ pts: roundScore(t, r), joker: t.joker === r.id })),
      final: finals.length ? finals.reduce((n, s) => n + H.final.score(s, getSS(s), t).points, 0) : null };
  });
  return { rounds: counted.map((r) => r.name), hasFinal: finals.length > 0, rows };
}

// ---------------------------------------------------------------
// Timer
// ---------------------------------------------------------------
const currentRemaining = () => (timer.handle ? Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt)) : timer.remainingMs);
function timerStop() {
  if (timer.handle) {
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  }
}
function onTimeUp() {
  timer.handle = null;
  timer.remainingMs = 0;
  timer.active = false;
  const st = currentStep();
  if (gameState === 'PLAY' && st && timer.sid === st.sid) {
    const h = H[st.rtype];
    if (h.timeUp) h.timeUp(st, getSS(st));
  }
  sync();
}
function timerEnsure() {
  const st = currentStep();
  if (gameState !== 'PLAY' || !st || !timer.active || timer.sid !== st.sid) return timerStop();
  if (!timer.handle && timer.remainingMs > 0) {
    timer.startedAt = Date.now();
    timer.handle = setTimeout(onTimeUp, timer.remainingMs);
  }
}
function timerInfo() {
  const st = currentStep();
  if (gameState === 'LOBBY' || !st || timer.sid !== st.sid || !timer.totalMs) return null;
  return { remainingMs: Math.round(currentRemaining()), totalMs: timer.totalMs, running: !!timer.handle };
}

// ---------------------------------------------------------------
// Opslaan en hervatten
// ---------------------------------------------------------------
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 250);
}
function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const st = currentStep();
    const snapshot = {
      version: 2, savedAt: new Date().toISOString(), gameState, stateBeforePause, revealState, breakdownShown,
      sid: st ? st.sid : null, settings, voided, stepState,
      timer: { sid: timer.sid, totalMs: timer.totalMs, remainingMs: Math.round(currentRemaining()), active: timer.active },
      teams,
      devices: Object.fromEntries(Object.entries(devices).map(([id, d]) => [id, { deviceId: d.deviceId, memberId: d.memberId, teamId: d.teamId, label: d.label }]))
    };
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) { console.error('Opslaan mislukt:', e.message); }
}
function loadSaved() {
  if (FRESH) { try { fs.unlinkSync(STATE_FILE); } catch (e) { /* bestond niet */ } return false; }
  let data;
  try { data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { return false; }
  if (!data || data.version !== 2 || typeof data.teams !== 'object' || !steps.length) return false;
  teams = {};
  for (const t of Object.values(data.teams)) {
    if (!t || !t.teamId || !t.name) continue;
    teams[t.teamId] = { teamId: t.teamId, name: t.name, answers: t.answers || {}, joker: t.joker || null, baseDeviceId: t.baseDeviceId };
  }
  devices = {};
  for (const d of Object.values(data.devices || {})) {
    if (!d || !teams[d.teamId]) continue;
    devices[d.deviceId] = { deviceId: d.deviceId, memberId: d.memberId || newId('m_'), teamId: d.teamId, label: d.label || 'Telefoon', socketId: null, connected: false, away: null };
  }
  for (const t of Object.values(teams)) {
    if (!devices[t.baseDeviceId]) { const first = teamDevices(t)[0]; if (first) t.baseDeviceId = first.deviceId; }
  }
  settings = sanitizeSettings(data.settings, settings);
  voided = data.voided && typeof data.voided === 'object' ? data.voided : {};
  stepState = data.stepState && typeof data.stepState === 'object' ? data.stepState : {};
  currentIndex = stepIndexBySid[data.sid] ?? 0;
  revealState = ['idle', 'running', 'done'].includes(data.revealState) ? data.revealState : 'idle';
  breakdownShown = !!data.breakdownShown;
  stateBeforePause = 'PLAY';
  gameState = ['LOBBY', 'PLAY', 'PAUSED', 'STANDINGS', 'END'].includes(data.gameState) ? data.gameState : 'LOBBY';
  if (gameState === 'PLAY' || gameState === 'STANDINGS') gameState = 'PAUSED'; // na een herstart: eerst even pauze
  if (data.timer && typeof data.timer === 'object') {
    timer.sid = data.timer.sid ?? null;
    timer.totalMs = Number(data.timer.totalMs) || 0;
    timer.remainingMs = Number(data.timer.remainingMs) || 0;
    timer.active = !!data.timer.active;
  }
  return Object.keys(teams).length > 0 || gameState !== 'LOBBY';
}

// ---------------------------------------------------------------
// Status naar de schermen sturen
// ---------------------------------------------------------------
const inItemStep = () => { const st = currentStep(); return gameState === 'PLAY' && !!st && st.kind === 'item'; };

function awayList() {
  if (!inItemStep()) return [];
  return Object.values(devices).filter((d) => d.away).map((d) => ({
    deviceId: d.deviceId, teamName: (teams[d.teamId] || {}).name || '', label: d.label, reason: d.away.reason, since: d.away.since
  }));
}

function stepMeta(st) {
  const r = rounds[st.roundIdx];
  const meta = { sid: st.sid, kind: st.kind, rtype: st.rtype, index: st.index, roundName: r ? r.name : 'Familiequiz',
    roundPoints: r && r.counts && r.normalized ? roundPoints(r) : null,
    practice: !!st.practice || (!!r && !r.counts && st.kind === 'item'),
    itemNo: st.itemNo || null, itemTotal: st.itemTotal || null, category: (st.item && st.item.category) || null,
    reviewGroup: st.reviewGroup || null };
  if (st.kind === 'item' && r && r.counts && !st.practice) {
    const max = H[st.rtype].max ? H[st.rtype].max(st.item, r) : 0;
    const total = steps.filter((s) => s.roundIdx === r.idx && s.kind === 'item' && !s.practice).reduce((n, s) => n + (H[s.rtype].max ? H[s.rtype].max(s.item, r) : 0), 0);
    if (max && total) meta.worth = Math.round((roundPoints(r) * max * 10) / total) / 10;
  }
  return meta;
}

function broadcastState() {
  const st = currentStep();
  const ss = st ? getSS(st) : null;
  const h = st ? H[st.rtype] : null;
  const inPlay = gameState === 'PLAY' && !!st;
  const active = activeTeams();
  const showScores = gameState === 'END';
  const meta = st && gameState !== 'LOBBY' && gameState !== 'END' ? stepMeta(st) : null;
  const prog = inPlay && h.progress ? h.progress(st, ss) : null;
  const viewFor = (who) => (inPlay ? { sid: st.sid, rtype: st.rtype, ...h.view(st, ss, who) } : null);
  const mainBtn = inPlay ? (h.label ? h.label(st, ss) : { label: 'Volgende ➡️' }) : null;
  const away = awayList();
  const standingsList = gameState === 'STANDINGS' ? ranking() : null;

  const common = {
    gameState, meta, totalSteps: steps.length, timer: timerInfo(), standings: standingsList, revealState,
    away, progress: prog ? { done: prog.done, total: prog.total, text: prog.text || null } : null
  };
  const teamList = Object.values(teams).map((t) => ({
    teamId: t.teamId, name: t.name, connected: teamConnected(t),
    answered: inPlay && st.kind === 'item' && h.answered ? !!h.answered(st, ss, t) : false, members: teamDevices(t).length
  })).sort(byName);

  io.to('tv_room').emit('state_update', {
    ...common, view: viewFor({ role: 'tv' }), teamList,
    finalScores: showScores && revealState !== 'idle' ? ranking() : null,
    breakdown: showScores && breakdownShown ? breakdown() : null
  });

  io.to('remote_room').emit('state_update', {
    ...common, view: viewFor({ role: 'host' }),
    host: mainBtn ? { ...mainBtn, waiting: prog ? prog.waiting || [] : [], canForce: inPlay && !(h.done && h.done(st, ss)) } : null,
    targetSid: st ? (st.kind === 'review' ? steps[st.ref].sid : st.sid) : null,
    voided: st ? voided[st.kind === 'review' ? steps[st.ref].sid : st.sid] || null : null,
    rounds: rounds.map((r) => ({ idx: r.idx, name: r.name, first: (steps.find((s) => s.roundIdx === r.idx) || {}).index })),
    teams: Object.values(teams).map((t) => ({
      teamId: t.teamId, name: t.name, connected: teamConnected(t),
      answered: inPlay && st.kind === 'item' && h.answered ? !!h.answered(st, ss, t) : false,
      joker: t.joker ? E.roundName(t.joker) : null,
      members: teamDevices(t).map((d) => ({ deviceId: d.deviceId, label: d.label, role: d.deviceId === t.baseDeviceId ? 'base' : 'member', connected: d.connected }))
    })).sort(byName),
    settings, settingsLocked: gameState !== 'LOBBY',
    finalScores: showScores ? ranking() : null, breakdownShown, hasBreakdown: showScores,
    canGoBack: inPlay && currentIndex > 0
  });

  Object.values(devices).forEach((d) => {
    if (!d.connected || !d.socketId) return;
    const t = teams[d.teamId];
    if (!t) return;
    const isBase = t.baseDeviceId === d.deviceId;
    io.to(d.socketId).emit('state_update', {
      gameState, meta, timer: inPlay ? timerInfo() : null, standings: standingsList, view: viewFor({ role: 'phone', team: t, device: d, isBase }),
      me: {
        memberId: d.memberId, teamId: t.teamId, teamName: t.name, label: d.label, role: isBase ? 'base' : 'member',
        baseLabel: devices[t.baseDeviceId] ? devices[t.baseDeviceId].label : '',
        proposal: proposalFor(t, d),
        members: teamDevices(t).map((m) => ({ memberId: m.memberId, label: m.label, role: m.deviceId === t.baseDeviceId ? 'base' : 'member', connected: m.connected }))
      }
    });
  });
  scheduleSave();
}

function enterStep() {
  const st = currentStep();
  if (!st) return;
  const h = H[st.rtype];
  if (h.enter) h.enter(st, getSS(st));
}

function advance() {
  timerStop();
  timer.active = false; timer.sid = null; timer.totalMs = 0; timer.remainingMs = 0;
  if (currentIndex + 1 >= steps.length) {
    currentIndex = steps.length;
    gameState = 'END';
    revealState = 'idle';
    breakdownShown = false;
  } else {
    currentIndex++;
    enterStep();
  }
}

function evaluateProposal(team) {
  const p = team.proposal;
  if (!p) return;
  const candidate = devices[p.candidateId];
  if (!candidate || candidate.teamId !== team.teamId || !candidate.connected) { team.proposal = null; return; }
  if (connectedDevices(team).every((d) => p.approvals.includes(d.deviceId))) {
    team.baseDeviceId = candidate.deviceId;
    team.proposal = null;
    notifyTeam(team, `${candidate.label} is nu de basistelefoon van het team.`);
  }
}

function sync() {
  Object.values(teams).forEach(evaluateProposal);
  const st = currentStep();
  if (gameState === 'PLAY' && st && H[st.rtype].check) H[st.rtype].check(st, getSS(st));
  // Spiekmeldingen verdwijnen zodra er geen vraag meer open staat
  if (!inItemStep()) Object.values(devices).forEach((d) => { d.away = null; });
  timerEnsure();
  broadcastState();
}

// ---------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------
const isRemote = (socket) => socket.data.role === 'remote';
function deviceOf(socket) {
  const d = devices[socket.data.deviceId];
  return d && d.socketId === socket.id ? d : null;
}

const PIN_MAX_FAILS = 20;
const PIN_WINDOW_MS = 10 * 60 * 1000;
const pinFailures = new Map();
function clientIp(socket) {
  const h = socket.handshake || {};
  const fwd = h.headers && h.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return h.address || 'onbekend';
}
function checkPin(socket, pin) {
  const ip = clientIp(socket);
  const entry = pinFailures.get(ip);
  if (entry && Date.now() < entry.resetAt && entry.count >= PIN_MAX_FAILS) { socket.emit('auth_denied', { locked: true }); return false; }
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
function removeTeam(teamId) {
  const team = teams[teamId];
  if (!team) return;
  for (const d of teamDevices(team)) {
    if (d.socketId) {
      const s = io.sockets.sockets.get(d.socketId);
      if (s) { s.data.deviceId = null; s.emit('kicked'); }
    }
    delete devices[d.deviceId];
  }
  delete teams[teamId];
}

io.on('connection', (socket) => {
  socket.on('register_remote', ({ pin } = {}) => {
    if (!checkPin(socket, pin)) return;
    socket.data.role = 'remote';
    socket.join('remote_room');
    socket.emit('remote_confirmed');
    broadcastState();
  });
  socket.on('register_tv', () => {
    socket.data.role = 'tv';
    socket.join('tv_room');
    socket.emit('tv_ok');
    broadcastState();
  });

  // ---------- Telefoons: team maken of aansluiten ----------
  socket.on('hello', ({ deviceId, visible } = {}) => {
    const device = typeof deviceId === 'string' ? devices[deviceId] : null;
    if (!device || !teams[device.teamId]) return socket.emit('need_join');
    attachSocket(socket, device);
    if (visible !== false) device.away = null;
    socket.emit('session', { deviceId: device.deviceId });
    sync();
  });
  socket.on('list_teams', (_, cb) => {
    if (typeof cb !== 'function') return;
    cb({ teams: Object.values(teams).map((t) => ({ teamId: t.teamId, name: t.name, members: teamDevices(t).length })).sort(byName) });
  });
  socket.on('create_team', ({ teamName, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (gameState === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    const myName = cleanName(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const name = cleanName(teamName, MAX_TEAM_NAME);
    if (!name) return reply({ ok: false, message: 'Vul een teamnaam in.' });
    if (findTeamByName(name)) return reply({ ok: false, message: `De teamnaam "${name}" is al in gebruik.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: null, label: myName, socketId: null, connected: false, away: null };
    const team = { teamId: newId('t_'), name, answers: {}, joker: null, baseDeviceId: device.deviceId };
    device.teamId = team.teamId;
    teams[team.teamId] = team;
    devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });
  socket.on('join_team', ({ teamId, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (gameState === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    const myName = cleanName(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const team = teams[teamId];
    if (!team) return reply({ ok: false, message: 'Dat team bestaat niet meer.' });
    if (teamDevices(team).length >= MAX_DEVICES_PER_TEAM) return reply({ ok: false, message: 'Dit team zit vol.' });
    if (labelTaken(team, myName)) return reply({ ok: false, message: `In dit team zit al iemand die ${myName} heet. Voeg bijvoorbeeld een letter toe.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: team.teamId, label: myName, socketId: null, connected: false, away: null };
    devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });

  socket.on('propose_base', ({ memberId } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return reply({ ok: false });
    const candidate = memberId ? teamDevices(team).find((d) => d.memberId === memberId) : device;
    if (!candidate || candidate.teamId !== team.teamId || !candidate.connected) return reply({ ok: false, message: 'Die telefoon is niet verbonden.' });
    if (team.baseDeviceId === candidate.deviceId) return reply({ ok: false, message: `${candidate.label} is al de basistelefoon.` });
    team.proposal = { candidateId: candidate.deviceId, proposerId: device.deviceId, approvals: [device.deviceId] };
    reply({ ok: true });
    sync();
  });
  socket.on('respond_base', ({ approve } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    const p = team && team.proposal;
    if (!p) return reply({ ok: false });
    if (approve) {
      if (!p.approvals.includes(device.deviceId)) p.approvals.push(device.deviceId);
    } else {
      team.proposal = null;
      const base = devices[team.baseDeviceId];
      notifyTeam(team, p.proposerId === device.deviceId
        ? `${device.label} heeft het voorstel ingetrokken.`
        : `${device.label} is niet akkoord. De basistelefoon blijft ${base ? base.label : 'zoals hij was'}.`);
    }
    reply({ ok: true });
    sync();
  });
  socket.on('leave_team', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return reply({ ok: false });
    if (team.baseDeviceId === device.deviceId) return reply({ ok: false, message: 'De basistelefoon kan het team niet verlaten. Kies eerst samen een andere basistelefoon.' });
    if (team.proposal && (team.proposal.candidateId === device.deviceId || team.proposal.proposerId === device.deviceId)) team.proposal = null;
    delete devices[device.deviceId];
    socket.data.deviceId = null;
    reply({ ok: true });
    sync();
  });

  // ---------- Antwoorden en spelerinvoer (per rondetype) ----------
  socket.on('step_submit', ({ sid, payload } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    const st = currentStep();
    if (!team || !st || gameState !== 'PLAY') return reply({ ok: false, reason: 'not_open' });
    if (sid !== st.sid) return reply({ ok: false, reason: 'wrong_question' });
    const h = H[st.rtype];
    if (!h.submit) return reply({ ok: false, reason: 'not_open' });
    const res = h.submit(st, getSS(st), team, device, payload || {}) || { ok: false };
    reply(res);
    if (res.ok) sync();
  });
  socket.on('step_event', ({ sid, type, data } = {}) => {
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    const st = currentStep();
    if (!team || !st || gameState !== 'PLAY' || sid !== st.sid || !H[st.rtype].event) return;
    H[st.rtype].event(st, getSS(st), team, device, type, data);
    if (type === 'clear') scheduleSave();
  });
  socket.on('step_fetch', ({ sid } = {}, cb) => {
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    const st = currentStep();
    if (typeof cb !== 'function' || !team || !st || sid !== st.sid || !H[st.rtype].fetch) return;
    cb(H[st.rtype].fetch(st, getSS(st), team, device));
  });

  // ---------- Anti-spiek: melding blijft staan tot de speler terug is ----------
  socket.on('player_blurred', ({ reason } = {}) => {
    if (!inItemStep()) return;
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return;
    const r = reason === 'locked' ? 'locked' : 'app_switch';
    const isNew = !device.away;
    const upgraded = !isNew && device.away.reason !== 'locked' && r === 'locked';
    if (isNew) device.away = { reason: r, since: Date.now() };
    else if (upgraded) device.away.reason = 'locked';
    else return;
    const alert = { teamName: team.name, label: device.label, reason: device.away.reason, timestamp: new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' }) };
    io.to('remote_room').emit('cheat_warning', alert);
    broadcastState();
  });
  socket.on('player_returned', () => {
    const device = deviceOf(socket);
    if (device && device.away) { device.away = null; broadcastState(); }
  });

  // ---------- Bediening: spelverloop ----------
  socket.on('next_question', () => {
    if (!isRemote(socket)) return;
    if (gameState === 'LOBBY') {
      if (!steps.length) return socket.emit('host_error', { message: 'Er is geen programma geladen. Controleer questions.json.' });
      if (!Object.keys(teams).length) return socket.emit('host_error', { message: 'Er is nog geen team aangemeld.' });
      currentIndex = 0;
      gameState = 'PLAY';
      enterStep();
    } else if (gameState === 'PLAY') {
      const st = currentStep();
      const h = H[st.rtype];
      const r = h.next ? h.next(st, getSS(st)) : 'step';
      if (r && r.error) return socket.emit('host_error', { message: r.error });
      if (r === 'step') advance();
    } else return;
    sync();
  });
  // Noodknop: stap afsluiten of toch doorgaan zonder te wachten
  socket.on('force_next', () => {
    if (!isRemote(socket) || gameState !== 'PLAY') return;
    const st = currentStep();
    const h = H[st.rtype];
    if (h.done && !h.done(st, getSS(st)) && h.force) h.force(st, getSS(st));
    else advance();
    sync();
  });
  socket.on('prev_question', () => {
    if (!isRemote(socket) || gameState !== 'PLAY' || currentIndex === 0) return;
    timerStop(); timer.active = false; timer.sid = null; timer.totalMs = 0; timer.remainingMs = 0;
    currentIndex--;
    enterStep();
    sync();
  });
  socket.on('skip_review', () => {
    if (!isRemote(socket) || gameState !== 'PLAY') return;
    const st = currentStep();
    if (!st || !st.reviewGroup) return;
    let i = currentIndex;
    while (i < steps.length && steps[i].reviewGroup === st.reviewGroup) i++;
    currentIndex = Math.min(i, steps.length) - 1;
    advance();
    sync();
  });
  socket.on('goto_round', ({ idx } = {}) => {
    if (!isRemote(socket) || gameState === 'LOBBY') return;
    const first = steps.find((s) => s.roundIdx === idx);
    if (!first) return;
    timerStop(); timer.active = false; timer.sid = null; timer.totalMs = 0; timer.remainingMs = 0;
    currentIndex = first.index;
    gameState = 'PLAY';
    revealState = 'idle';
    enterStep();
    sync();
  });
  socket.on('step_action', ({ type, payload } = {}) => {
    if (!isRemote(socket) || gameState !== 'PLAY') return;
    const st = currentStep();
    const h = H[st.rtype];
    if (h.action) h.action(st, getSS(st), type, payload || {});
    sync();
  });
  socket.on('toggle_pause', () => {
    if (!isRemote(socket)) return;
    if (gameState === 'PAUSED') { gameState = stateBeforePause; io.emit('resumed'); }
    else if (gameState === 'PLAY') { stateBeforePause = 'PLAY'; gameState = 'PAUSED'; io.emit('paused'); }
    else return;
    sync();
  });
  socket.on('toggle_standings', () => {
    if (!isRemote(socket)) return;
    if (gameState === 'STANDINGS') gameState = 'PLAY';
    else if (gameState === 'PLAY') gameState = 'STANDINGS';
    else return;
    sync();
  });

  // ---------- Bediening: ontknoping ----------
  socket.on('start_reveal', () => {
    if (!isRemote(socket) || gameState !== 'END' || revealState !== 'idle') return;
    revealState = 'running';
    broadcastState();
  });
  socket.on('reveal_done', () => {
    if ((!isRemote(socket) && socket.data.role !== 'tv') || revealState !== 'running') return;
    revealState = 'done';
    broadcastState();
  });
  socket.on('toggle_breakdown', () => {
    if (!isRemote(socket) || gameState !== 'END' || revealState !== 'done') return;
    breakdownShown = !breakdownShown;
    broadcastState();
  });

  socket.on('update_settings', (partial) => {
    if (!isRemote(socket)) return;
    if (gameState !== 'LOBBY') return socket.emit('host_error', { message: 'Instellingen kunnen alleen vóór de start worden gewijzigd.' });
    settings = sanitizeSettings(partial, settings);
    sync();
  });

  // ---------- Bediening: noodknoppen ----------
  socket.on('add_time', () => {
    if (!isRemote(socket) || gameState !== 'PLAY') return;
    const st = currentStep();
    if (!st || timer.sid !== st.sid) return;
    timerStop();
    timer.remainingMs += 10000;
    timer.totalMs = Math.max(timer.totalMs, timer.remainingMs);
    timer.active = true;
    const h = H[st.rtype];
    const ss = getSS(st);
    if (h.reopen && h.done && h.done(st, ss)) h.reopen(st, ss);
    sync();
  });
  socket.on('clear_answer', ({ teamId } = {}) => {
    if (!isRemote(socket) || gameState !== 'PLAY') return;
    const team = teams[teamId];
    const st = currentStep();
    if (!team || !st || st.kind !== 'item') return;
    const h = H[st.rtype];
    const ss = getSS(st);
    delete team.answers[st.sid];
    if (ss.done) delete ss.done[team.teamId];
    if (h.reopen && h.done && h.done(st, ss)) h.reopen(st, ss);
    sync();
  });
  socket.on('void_question', ({ sid, mode } = {}) => {
    if (!isRemote(socket) || gameState === 'LOBBY') return;
    if (stepIndexBySid[sid] === undefined) return;
    if (mode === 'void' || mode === 'all_correct') voided[sid] = mode;
    else if (mode === null) delete voided[sid];
    else return;
    sync();
  });
  socket.on('rename_team', ({ teamId, name } = {}) => {
    if (!isRemote(socket)) return;
    const team = teams[teamId];
    const clean = cleanName(name, MAX_TEAM_NAME);
    if (!team || !clean) return;
    if (findTeamByName(clean, teamId)) return socket.emit('host_error', { message: `De teamnaam "${clean}" is al in gebruik.` });
    team.name = clean;
    sync();
  });
  socket.on('rename_player', ({ deviceId, name } = {}) => {
    if (!isRemote(socket)) return;
    const device = devices[deviceId];
    const team = device && teams[device.teamId];
    const clean = cleanName(name, MAX_LABEL);
    if (!team || !clean) return;
    if (labelTaken(team, clean, device.deviceId)) return socket.emit('host_error', { message: `In team ${team.name} zit al iemand die ${clean} heet.` });
    device.label = clean;
    sync();
  });
  socket.on('move_player', ({ deviceId, teamId } = {}) => {
    if (!isRemote(socket)) return;
    const device = devices[deviceId];
    const from = device && teams[device.teamId];
    const to = teams[teamId];
    if (!device || !from || !to || from === to) return;
    if (teamDevices(from).length <= 1) return socket.emit('host_error', { message: `${device.label} is de enige telefoon van team ${from.name}. Verplaats eerst iemand anders, of verwijder het team.` });
    if (teamDevices(to).length >= MAX_DEVICES_PER_TEAM) return socket.emit('host_error', { message: `Team ${to.name} zit vol.` });
    if (labelTaken(to, device.label)) return socket.emit('host_error', { message: `In team ${to.name} zit al iemand die ${device.label} heet. Wijzig eerst een van de namen.` });
    const wasBase = from.baseDeviceId === device.deviceId;
    device.teamId = to.teamId;
    from.proposal = null; to.proposal = null;
    if (wasBase) {
      const rest = teamDevices(from);
      const next = rest.find((d) => d.connected) || rest[0];
      from.baseDeviceId = next.deviceId;
      notifyTeam(from, `${device.label} is verplaatst. ${next.label} is nu de basistelefoon.`);
    } else notifyTeam(from, `${device.label} is verplaatst naar een ander team.`);
    if (device.connected && device.socketId) io.to(device.socketId).emit('team_notice', { text: `De quizmaster heeft je verplaatst naar team ${to.name}.` });
    notifyTeam(to, `${device.label} is toegevoegd aan jullie team.`);
    sync();
  });
  socket.on('set_base', ({ deviceId } = {}) => {
    if (!isRemote(socket)) return;
    const device = devices[deviceId];
    const team = device && teams[device.teamId];
    if (!team) return;
    team.baseDeviceId = device.deviceId;
    team.proposal = null;
    notifyTeam(team, `De quizmaster heeft ${device.label} aangewezen als basistelefoon.`);
    sync();
  });
  socket.on('remove_team', ({ teamId } = {}) => {
    if (!isRemote(socket) || !teams[teamId]) return;
    removeTeam(teamId);
    sync();
  });
  socket.on('reset_quiz', () => {
    if (!isRemote(socket)) return;
    gameState = 'LOBBY'; stateBeforePause = 'PLAY'; currentIndex = 0;
    revealState = 'idle'; breakdownShown = false;
    voided = {}; teams = {}; devices = {}; stepState = {};
    timerStop(); timer.active = false; timer.sid = null; timer.totalMs = 0; timer.remainingMs = 0;
    io.emit('quiz_reset');
    broadcastState();
  });

  socket.on('disconnect', () => {
    const device = devices[socket.data.deviceId];
    if (device && device.socketId === socket.id) { device.connected = false; sync(); }
  });
});

// ---------------------------------------------------------------
// Opstarten
// ---------------------------------------------------------------
buildProgram();
const restored = loadSaved();

function shutdown() { saveNow(); process.exit(0); }
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
  console.log(`${steps.length} stappen geladen in ${rounds.length} rondes.`);
  if (restored) {
    console.log(`Vorige quiz hersteld uit ${STATE_FILE}: ${Object.keys(teams).length} teams, status ${gameState}.`);
    console.log('Teams komen vanzelf terug. Hervat de quiz met de pauzeknop, of begin opnieuw met Reset.');
  }
});
