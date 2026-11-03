'use strict';
const express = require('express');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { loadContent, decadeOf } = require('./lib/content');
const { fromExcel } = require('./lib/fromExcel');
const { newId, cleanText, norm, fuzzyEq, shuffle } = require('./lib/util');
const { writeJsonWithBackup, readJsonWithBackup, removeStateFiles } = require('./lib/state-store');
const { pushUndo, applyUndoEntry } = require('./lib/undo');
const { HISTORY_VERSION, DEFAULT_LIMIT: HISTORY_LIMIT, createHistoryEntry, appendHistory, isHistorySnapshot } = require('./lib/quiz-history');

const PORT = process.env.PORT || 3000;
const ON_RENDER = !!process.env.RENDER;

// Pincode voor bediening.html. Lokaal standaard 1234; op Render zelf instellen via HOST_PIN.
let HOST_PIN = String(process.env.HOST_PIN || '').trim();
let pinWasGenerated = false;
if (!HOST_PIN) {
  if (ON_RENDER) { HOST_PIN = String(crypto.randomInt(100000, 1000000)); pinWasGenerated = true; }
  else HOST_PIN = '1234';
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'teamphotos.json'); // teamfoto's apart, zodat state.json klein blijft
const MAX_PHOTO_CHARS = 200000;
const FRESH = process.argv.includes('--fresh') || process.env.FRESH === '1';

const MAX_TEAM_NAME = 24;
const MAX_LABEL = 16;
const MAX_DEVICES_PER_TEAM = 8;
const DRAW_MAX = 10;   // maximaal aantal punten (ruw) per tekenbeurt
const THIRTY_MAX = 5;  // maximaal aantal punten (ruw) per 30-secondsbeurt

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------
// Adressen voor de QR-code
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
// Teamfoto als los plaatje: zo hoeft de foto niet bij elke update opnieuw mee naar tv en telefoons
app.get('/teamfoto/:teamId', (req, res) => {
  const photo = teamPhotos[req.params.teamId];
  if (!photo) return res.status(404).end();
  const buf = Buffer.from(photo.dataUrl.split(',')[1], 'base64');
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('image/jpeg').send(buf);
});

// ---------------------------------------------------------------
// Instellingen (config.json = standaard; de quizmaster past ze in de lobby aan)
// ---------------------------------------------------------------
const DEFAULT_SETTINGS = {
  roundPoints: 100,          // te verdienen punten per ronde (alle rondes even zwaar)
  timerEnabled: false,       // tijdslimiet bij meerkeuzevragen
  defaultTime: 20,           // seconden (of "time" bij de vraag zelf)
  blurPoints: [10, 8, 6, 4, 3, 2], // punten per blurstap: hoe eerder goed, hoe meer
  pricePoints: [5, 3, 2, 1], // punten voor dichtstbij, tweede, derde, ...
  logoPoints: [10, 8, 6, 4, 2], // logo's: punten voor het eerste, tweede, ... goede antwoord
  hitsterTarget: 10,         // muziekronde stopt zodra een team zoveel kaarten in de tijdlijn heeft
  maxTeams: 0,               // maximaal aantal teams (0 = nog niet ingesteld); de host vult dit vooraf in
  finalMaxWager: 100,        // slotvraag: maximale inzet (teams kennen hun stand niet)
  showRoundTotals: false,    // na elke ronde op de tv ook het totaal (tussenstand) tonen; altijd te wijzigen
  theme: 'standaard',        // uiterlijk: standaard, winter, kerst, oudennieuw, zomer, halloween
  roundPlan: null,           // volgorde, aan/uit en "in 2 delen" per ronde (wordt in de bediening ingesteld)
  memorySeconds: 120,
  drawSeconds: 75,
  thirtySeconds: 30
};
const THEMES = ['standaard', 'winter', 'kerst', 'oudennieuw', 'zomer', 'halloween'];
function sanitizeSettings(input, base) {
  const out = { ...base };
  const src = input && typeof input === 'object' ? input : {};
  const int = (k, min, max) => { if (Number.isInteger(src[k]) && src[k] >= min && src[k] <= max) out[k] = src[k]; };
  const list = (k, len) => {
    if (Array.isArray(src[k]) && src[k].length >= 1 && src[k].length <= len && src[k].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) out[k] = src[k];
  };
  if (typeof src.timerEnabled === 'boolean') out.timerEnabled = src.timerEnabled;
  if (typeof src.showRoundTotals === 'boolean') out.showRoundTotals = src.showRoundTotals;
  int('roundPoints', 10, 1000);
  int('defaultTime', 5, 300);
  int('memorySeconds', 20, 900);
  int('drawSeconds', 15, 300);
  int('thirtySeconds', 10, 120);
  int('hitsterTarget', 3, 50);
  int('maxTeams', 0, 50);
  int('finalMaxWager', 0, 100000);
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  if (Array.isArray(src.roundPlan)) out.roundPlan = src.roundPlan.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, on: x.on !== false, base: typeof x.base === 'string' ? x.base : undefined, category: typeof x.category === 'string' && x.category ? x.category.slice(0, 40) : undefined })).slice(0, 40);
  list('blurPoints', 10);
  list('pricePoints', 8);
  list('logoPoints', 10);
  return out;
}
let settings = { ...DEFAULT_SETTINGS };
try {
  settings = sanitizeSettings(JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), DEFAULT_SETTINGS);
} catch (e) { /* geen config.json: standaardwaarden */ }

// ---------------------------------------------------------------
// Inhoud
// ---------------------------------------------------------------
// De vragen komen uit vragenlijst.xlsx (de nieuwste van: geüpload via de bediening, in de projectmap, of QUIZ_XLSX).
// Staat er geen Excel, of is hij onleesbaar, dan wordt questions.json gebruikt.
const XLSX_UPLOAD = path.join(DATA_DIR, 'vragenlijst.xlsx');
const XLSX_LOCAL = path.join(__dirname, 'vragenlijst.xlsx');
const JSON_BASE = path.join(__dirname, 'questions.json');
let content, rounds, steps, songs, roundById;
let baseRaw = null; // inhoud zoals ingelezen (Excel/JSON), vóór het rondeplan
let quizSource = { kind: 'json', file: 'questions.json', loadedAt: null };
// Extra rondes: een spel nog een keer spelen (30 Seconds, tekenen, muziek met eventueel een categorie).
// Ze staan in het rondeplan als { id: 'r7x1', base: 'r7', category }.
const EXTRA_TYPES = ['thirty', 'draw', 'hitster'];
const notPractice = (x) => !(x && (x.practice || x.oefen));
function planOrder() {
  const plan = settings.roundPlan || [];
  const list = (baseRaw && baseRaw.rounds) || [];
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  const valid = plan.filter((p) => (p.base ? byId[p.base] && EXTRA_TYPES.includes(byId[p.base].type) : byId[p.id]));
  const missing = list.filter((r) => !valid.some((p) => p.id === r.id)).map((r) => ({ id: r.id, on: true }));
  return [...valid, ...missing];
}
// Categorieën voor een extra muziekronde (zoals in de Hitster-app); de liedjes zoekt de bediening op Spotify
const HITSTER_CATS = {
  original: 'Original (klassiekers & wereldhits)', guilty: 'Guilty Pleasures (fout & meezingers)', rock: 'Rock Classics',
  nederpop: 'Nederpop (100% Nederlands)', summer: 'Summer Party', '80s90s': '80s & 90s', '00s10s': '00s & 10s'
};
const extraTitle = (p, b) => (b.type === 'hitster' ? `Muziek: ${HITSTER_CATS[p.category] || HITSTER_CATS.original}` : `${b.title} (extra ronde)`);
function extraRaw(p, b) {
  const r = JSON.parse(JSON.stringify(b));
  r.id = p.id; r.extra = true; r.title = extraTitle(p, b);
  // Geen oefenronde meer bij een extra ronde
  if (r.type === 'draw') r.words = (r.words || []).filter(notPractice);
  if (r.type === 'thirty') r.cards = (r.cards || []).filter(notPractice);
  if (r.type === 'hitster') {
    const category = HITSTER_CATS[p.category] ? p.category : 'original';
    const fallback = (baseRaw.hitsterLibrary || (baseRaw.rounds.find((round) => round.type === 'hitster') || {}).songs || []).map((song) => ({ ...song, category: song.category || 'original' }));
    r.songs = fallback.filter((song) => song.category === category); // alleen deze categorie; daarna Spotify
    // De 2e, 3e … extra ronde in dezelfde categorie krijgt andere startkaarten dan de vorige
    const byIdAll = Object.fromEntries((baseRaw.rounds || []).map((x) => [x.id, x]));
    const same = planOrder().filter((x) => x.base && byIdAll[x.base] && byIdAll[x.base].type === 'hitster' && (HITSTER_CATS[x.category] ? x.category : 'original') === category);
    r.startOffset = Math.max(0, same.findIndex((x) => x.id === p.id));
    // Liedjes uit de gewone muziekronde(s) nooit als startkaart gebruiken
    r.excludeKeys = (baseRaw.rounds || []).filter((x) => x.type === 'hitster').flatMap((x) => (x.songs || []).map((song) => `${song.title}|${song.artist || ''}`.toLowerCase()));
    r.dynamic = true;
    r.category = category;
  }
  return r;
}
function applyPlan(raw) {
  const out = JSON.parse(JSON.stringify(raw));
  const byId = Object.fromEntries((raw.rounds || []).map((r) => [r.id, r]));
  out.rounds = planOrder().filter((p) => p.on).map((p) => (p.base ? extraRaw(p, byId[p.base]) : JSON.parse(JSON.stringify(byId[p.id]))));
  return out;
}
const roundStarted = (id) => phase !== 'LOBBY' && steps.some((x, i) => x.round === id && i <= stepIndex);
function planView() {
  const byId = Object.fromEntries(((baseRaw && baseRaw.rounds) || []).map((r) => [r.id, r]));
  return planOrder().map((p) => {
    const b = byId[p.base || p.id];
    return { id: p.id, base: p.base || null, category: p.category || null, extra: !!p.base, type: b.type, on: p.on, started: roundStarted(p.id), title: p.base ? extraTitle(p, b) : b.title };
  });
}
// Welke rondes kun je extra spelen, en welke muziekcategorieën zijn er (met aantal liedjes)?
function extraOptions() {
  const list = (baseRaw && baseRaw.rounds) || [];
  return {
    rounds: list.filter((r) => EXTRA_TYPES.includes(r.type)).map((r) => ({ id: r.id, title: r.title, type: r.type })),
    categories: Object.entries(HITSTER_CATS).map(([id, name]) => {
      const n = ((baseRaw && baseRaw.hitsterLibrary) || []).filter((song) => (song.category || 'original') === id).length;
      return { id, name: `${name} · ${n ? n + ' nummers uit de lijst, daarna Spotify' : 'alleen Spotify'}`, count: n };
    })
  };
}
function replan(order) {
  const curId = cur() ? cur().id : null;
  settings.roundPlan = order.map((p) => ({ id: p.id, on: p.on !== false, base: p.base || undefined, category: p.category || undefined }));
  compileQuiz(content.warnings.filter((w) => !/Ronde/.test(w)));
  if (curId) { const i = steps.findIndex((x) => x.id === curId); if (i >= 0) stepIndex = i; }
  if (phase === 'LOBBY') { ssAll = {}; undoHistory = []; Object.values(teams).forEach((t) => { t.timelines = {}; t.jokerRound = null; }); }
}
let dynSongs = {};  // liedjes die de bediening online vindt (id -> liedje)
let dynStart = {};  // rondeId -> online startkaarten
let teamPhotos = {};  // teamId -> { dataUrl, v }: vaste teamfoto, bewaard in data/teamphotos.json
const validPhoto = (d) => typeof d === 'string' && d.length <= MAX_PHOTO_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d);
const photoUrl = (teamId) => (teamPhotos[teamId] ? `/teamfoto/${encodeURIComponent(teamId)}?v=${teamPhotos[teamId].v}` : null);
function savePhotos() {
  try { writeJsonWithBackup(PHOTOS_FILE, { version: 1, photos: teamPhotos }); }
  catch (e) { console.error('Teamfoto\'s opslaan mislukt:', e.message); }
}
function loadPhotos() {
  if (FRESH) { try { removeStateFiles(PHOTOS_FILE); } catch (e) { /* bestond niet */ } return; }
  const saved = readJsonWithBackup(PHOTOS_FILE, (x) => x && x.version === 1 && x.photos && typeof x.photos === 'object');
  const photos = saved && saved.data ? saved.data.photos : {};
  teamPhotos = {};
  for (const [teamId, p] of Object.entries(photos)) if (teams[teamId] && p && validPhoto(p.dataUrl)) teamPhotos[teamId] = { dataUrl: p.dataUrl, v: Number(p.v) || Date.now() };
}
function setTeamPhoto(teamId, dataUrl) {
  if (dataUrl) teamPhotos[teamId] = { dataUrl, v: Date.now() };
  else delete teamPhotos[teamId];
  savePhotos();
}
function addDynSong(id, t) {
  const song = {
    id, key: `${t.title}|${t.artist}`.toLowerCase(), title: t.title, artist: t.artist, year: t.year, dynamic: true,
    uri: t.uri || null, audio: t.previewUrl ? { kind: 'audio', src: t.previewUrl } : null
  };
  dynSongs[id] = song;
  songs[id] = song;
  return song;
}
function cleanTrack(t) {
  if (!t || typeof t !== 'object') return null;
  const title = cleanText(t.title, 150), artist = cleanText(t.artist, 150);
  const year = Number(t.year);
  if (!title || !Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return {
    title, artist, year,
    uri: typeof t.uri === 'string' && /^spotify:track:[A-Za-z0-9]{10,40}$/.test(t.uri) ? t.uri : null,
    previewUrl: typeof t.previewUrl === 'string' && /^https:\/\/[^\s"'<>]{8,500}$/.test(t.previewUrl) ? t.previewUrl : null
  };
}
// Alle liedjes die al gebruikt zijn (gespeeld of als startkaart), zodat er niets dubbel komt
function usedSongKeys() {
  const keys = new Set();
  steps.forEach((x) => { const id = x.kind === 'song' && ssAll[x.id] && ssAll[x.id].songId; if (id && songs[id]) keys.add(songs[id].key); });
  Object.values(roundById).forEach((round) => (round.startIds || []).forEach((id) => { if (songs[id]) keys.add(songs[id].key); }));
  Object.values(dynStart).flat().forEach((id) => { if (songs[id]) keys.add(songs[id].key); });
  return [...keys];
}
function compileQuiz(extraWarnings) {
  const result = loadContent(null, applyPlan(baseRaw));
  result.warnings = [...(extraWarnings || []).filter((w) => !w.startsWith(MEDIA_WARNING)), ...result.warnings];
  content = result;
  ({ rounds, steps, songs } = result);
  Object.assign(songs, dynSongs);
  roundById = Object.fromEntries(rounds.map((r) => [r.id, r]));
  content.warnings.push(...missingMediaWarnings());
}
// Controle: staan alle foto's, logo's en geluidsbestanden uit de vragenlijst echt in public/media/?
const MEDIA_WARNING = '📁 ';
function missingMediaWarnings() {
  const missing = new Map(); // ronde -> Set(bestanden)
  const check = (src, where) => {
    if (typeof src !== 'string' || !src || /^(https?:|data:)/i.test(src)) return;
    const file = path.join(__dirname, 'public', decodeURIComponent(src.split('?')[0]).replace(/^\/+/, ''));
    if (!file.startsWith(path.join(__dirname, 'public')) || fs.existsSync(file)) return;
    if (!missing.has(where)) missing.set(where, new Set());
    missing.get(where).add(src.replace(/^\/media\//, ''));
  };
  const nameOf = (roundId) => (roundById[roundId] ? `Ronde ${roundById[roundId].no}: ${roundById[roundId].title}` : roundId === 'test' ? 'Testvragen' : roundId === 'final' ? 'Slotvraag' : 'Quiz');
  for (const step of steps) {
    const media = step.media || null;
    if (media) check(media.src || media.image || media.file, nameOf(step.round));
  }
  for (const song of Object.values(songs)) {
    if (song && song.audio && !song.dynamic) check(song.audio.src, 'Muziek');
  }
  return [...missing].map(([where, files]) => `${MEDIA_WARNING}${where}: ${files.size} ${files.size === 1 ? 'bestand ontbreekt' : 'bestanden ontbreken'} in public/media/: ${[...files].slice(0, 12).join(', ')}${files.size > 12 ? ', …' : ''}`);
}
function loadQuiz() {
  const candidates = [process.env.QUIZ_XLSX, XLSX_UPLOAD, XLSX_LOCAL].filter((f) => f && fs.existsSync(f));
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  let result = null;
  const extra = [];
  if (candidates.length) {
    try {
      const { raw, warnings } = fromExcel(candidates[0], JSON_BASE);
      baseRaw = raw;
      result = { warnings };
      quizSource = { kind: 'excel', file: path.basename(candidates[0]) + (candidates[0] === XLSX_UPLOAD ? ' (geüpload)' : ''), loadedAt: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) };
    } catch (e) {
      extra.push(`De Excel kon niet gelezen worden (${e.message}). questions.json is gebruikt.`);
    }
  }
  if (!result) {
    baseRaw = JSON.parse(fs.readFileSync(JSON_BASE, 'utf8'));
    result = { warnings: [] };
    quizSource = { kind: 'json', file: 'questions.json', loadedAt: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) };
  }
  compileQuiz([...extra, ...result.warnings]);
  content.warnings.forEach((w) => console.warn('Waarschuwing:', w));
}
loadQuiz();
const roundPoints = (round) => round.points ?? settings.roundPoints;

// ---------------------------------------------------------------
// Spelstatus
// ---------------------------------------------------------------
let teams = {};      // teamId -> { teamId, name, seq, baseDeviceId, jokerRound, timeline, proposal }
let devices = {};    // deviceId -> { deviceId, memberId, teamId, label, seq, socketId, connected }
let phase = 'LOBBY'; // LOBBY | PLAY | END
let stepIndex = 0;
let paused = false;
let showStandings = false;
let review = null;   // { scope: rondeId | 'all', page }
let reveal = 'idle'; // einduitslag: idle -> stepping (plek voor plek) -> done
let revealN = 0;     // aantal onthulde plekken (van laag naar hoog)
let lobbyStage = 'welcome'; // lobby: eerst de welkomstpagina, dan het aanmeldscherm met QR-code
let endView = 'ranking'; // ranking | breakdown (op de tv na de ontknoping)
let ssAll = {};      // stepId -> dynamische status van die stap
let alerts = {};     // deviceId -> spiekmelding (blijft staan tot de speler terug is)
let seq = 0;
let undoHistory = [];
const UNDO_LIMIT = 30;
let gameId = null;
let historyEntries = [];

const timer = { tag: null, totalMs: 0, remainingMs: 0, startedAt: 0, handle: null };

const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
const bySeq = (a, b) => a.seq - b.seq;
const cur = () => (phase === 'PLAY' ? steps[stepIndex] : null);

function ss(step) {
  if (!ssAll[step.id]) {
    const init = {
      mc: { status: 'open', answers: {}, blurStep: 0, voided: null },
      memory: { status: 'idle', entries: {} },
      song: { status: 'open', placements: {}, years: {}, results: null },
      tiebreak: { status: 'open', teams: null, answers: {}, winners: null },
      price: { status: 'open', answers: {} },
      draw: { status: 'ready', turn: 0, turns: [], plan: null, used: [] },
      thirty: { status: 'ready', turn: 0, turns: [], order: null, cardOrder: [] },
      joker: { choices: {} },
      teamphoto: { skipped: {} },
      logo: { status: 'open', answers: {}, judged: {}, blurStep: 0 },
      demo_draw: { status: 'ready', strokes: [] },
      demo_thirty: { status: 'ready', ok: [false, false, false, false, false] },
      final: { status: 'wager', wagers: {}, answers: {} }
    };
    ssAll[step.id] = init[step.kind] ? JSON.parse(JSON.stringify(init[step.kind])) : {};
  }
  return ssAll[step.id];
}

const teamDevices = (team) => Object.values(devices).filter((d) => d.teamId === team.teamId).sort(bySeq);
const connectedDevices = (team) => teamDevices(team).filter((d) => d.connected);
const teamConnected = (team) => { const b = devices[team.baseDeviceId]; return !!(b && b.connected); };
const activeTeams = () => Object.values(teams).filter(teamConnected);
function notifyTeam(team, text) {
  for (const d of teamDevices(team)) if (d.connected && d.socketId) io.to(d.socketId).emit('team_notice', { text });
}
const labelTaken = (team, label, except = null) => teamDevices(team).some((d) => d.deviceId !== except && d.label.toLowerCase() === label.toLowerCase());
const findTeamByName = (name, except = null) => Object.values(teams).find((t) => t.teamId !== except && t.name.toLowerCase() === name.toLowerCase());

// ---------------------------------------------------------------
// Timer (draait op de server; pauze bevriest hem)
// ---------------------------------------------------------------
function remainingNow() {
  return timer.handle ? Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt)) : timer.remainingMs;
}
function timerStop() {
  if (timer.handle) {
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.startedAt));
  }
}
function timerClear() { timerStop(); timer.tag = null; timer.totalMs = 0; timer.remainingMs = 0; }
function timerRun() {
  if (timer.handle || !timer.tag) return;
  timer.startedAt = Date.now();
  timer.handle = setTimeout(() => {
    const tag = timer.tag;
    timer.handle = null;
    timer.remainingMs = 0;
    onTimerEnd(tag);
    sync();
  }, Math.max(0, timer.remainingMs));
}
function timerStart(ms, tag) {
  timerClear();
  timer.tag = tag;
  timer.totalMs = timer.remainingMs = ms;
  if (!paused) timerRun();
}
function timerInfo(tag) {
  if (!timer.tag || (tag && timer.tag !== tag) || !timer.totalMs) return null;
  return { remainingMs: Math.round(remainingNow()), totalMs: timer.totalMs, running: !!timer.handle };
}
function onTimerEnd(tag) {
  const step = cur();
  if (!step) return;
  if (tag === 'mc' && step.kind === 'mc') { if (ss(step).status === 'open') closeStep(step); }
  else if (tag === 'memory' && step.kind === 'memory') stopWriting(step);
  else if (tag === 'draw' && step.kind === 'draw') endDrawTurn(step);
  else if (tag === 'thirty' && step.kind === 'thirty') stopThirty(step);
  else if (tag === 'demo' && step.kind === 'demo_thirty') ss(step).status = 'result';
}

// ---------------------------------------------------------------
// Scores
// ---------------------------------------------------------------
function mcAward(step, team) {
  const s = ss(step);
  const max = step.variant === 'blur' ? settings.blurPoints[0] : 1;
  if (s.voided === 'void') return { ok: null, raw: 0, max: 0, a: null };
  const a = s.answers[team.teamId] || null;
  const ok = s.voided === 'all_correct' || (!!a && a.v === step.answer);
  let raw = 0;
  if (ok) raw = step.variant === 'blur' ? settings.blurPoints[Math.min(a ? a.step : 0, settings.blurPoints.length - 1)] : 1;
  return { ok, raw, max, a };
}

function priceAwards(step) {
  const s = ss(step);
  const out = {};
  for (const key of ['now', 'ago']) {
    const list = Object.entries(s.answers)
      .filter(([tid, a]) => teams[tid] && Number.isFinite(a[key]))
      .map(([tid, a]) => ({ tid, d: Math.abs(a[key] - step[key]) }))
      .sort((x, y) => x.d - y.d);
    let rank = 0;
    list.forEach((e, i) => {
      if (i > 0 && e.d > list[i - 1].d + 1e-9) rank = i;
      (out[e.tid] = out[e.tid] || {})[key] = { v: s.answers[e.tid][key], rank, pts: settings.pricePoints[rank] || 0 };
    });
  }
  return out;
}

// Tekenen: de basistelefoon tekent niet, dus elk ander teamlid tekent één keer
const drawPlanTurns = (s, team) => {
  const list = s.plan && s.plan.members[team.teamId];
  return list && list.length >= 2 ? list.length : 0;
};
// Logo's: alle goede antwoorden op volgorde van snelheid; de eerste krijgt het meest
// Foto blur: punten volgens de blurstap waarop het team antwoordde (hoe eerder, hoe meer)
function logoAwards(step) {
  const s = ss(step);
  const good = Object.entries(s.answers).filter(([id]) => teams[id] && s.judged[id]).sort((a, b) => a[1].at - b[1].at);
  const out = {};
  if (step.variant === 'blur') good.forEach(([id, a]) => { out[id] = settings.blurPoints[Math.min(a.step || 0, settings.blurPoints.length - 1)]; });
  else good.forEach(([id], i) => { out[id] = settings.logoPoints[Math.min(i, settings.logoPoints.length - 1)]; });
  return out;
}
const openMax = (step) => (step.variant === 'blur' ? settings.blurPoints[0] : settings.logoPoints[0]);
const logoMatches = (step, text) => [step.name, ...(step.alt || [])].some((w) => fuzzyEq(w, text) || (norm(w).length >= 4 && norm(text).includes(norm(w))));
const thirtyPlanTurns = (s, team) => (s.order ? s.order.filter((o) => o.teamId === team.teamId).length : teamDevices(team).length);

// Ruwe score en maximum van een team in een ronde
function roundRaw(team, round) {
  const list = steps.filter((s) => s.round === round.id);
  let raw = 0, max = 0;
  for (const step of list) {
    if (step.test) continue; // oefenrondes tellen nooit mee
    const s = ss(step);
    if (step.kind === 'mc' && !step.test) {
      const a = mcAward(step, team);
      max += a.max;
      if (s.status === 'closed') raw += a.raw;
    } else if (step.kind === 'memory') {
      max += step.items.length;
      if (s.status === 'done') raw += Math.min(step.items.length, (s.entries[team.teamId] || []).filter((e) => e.ok).length);
    } else if (step.kind === 'song') {
      const bonus = (roundById[step.round] && roundById[step.round].yearBonus) ?? 1;
      if (s.status === 'revealed') max += 1 + bonus;
      const r = s.results && s.results[team.teamId];
      if (r) raw += (r.ok ? 1 : 0) + (r.exact ? bonus : 0);
    } else if (step.kind === 'price') {
      max += settings.pricePoints[0] * 2;
      if (s.status === 'revealed') {
        const aw = priceAwards(step)[team.teamId];
        if (aw) raw += (aw.now ? aw.now.pts : 0) + (aw.ago ? aw.ago.pts : 0);
      }
    } else if (step.kind === 'logo') {
      max += openMax(step);
      if (s.status === 'closed') raw += logoAwards(step)[team.teamId] || 0;
    } else if (step.kind === 'draw') {
      max += drawPlanTurns(s, team) * DRAW_MAX;
      s.turns.forEach((t) => { if (t.done && t.ok && t.ok[team.teamId]) raw += DRAW_MAX; });
    } else if (step.kind === 'thirty') {
      max += thirtyPlanTurns(s, team) * THIRTY_MAX;
      s.turns.forEach((t) => { if (t.teamId === team.teamId && t.done) raw += t.ok.filter(Boolean).length; });
    }
  }
  return { raw, max };
}
function roundScore(team, round) {
  const { raw, max } = roundRaw(team, round);
  return max > 0 ? Math.round((raw / max) * roundPoints(round)) : 0;
}
const jokerFactor = (team, round) => (team.jokerRound === round.id ? 2 : 1);

const finalStep = () => steps.find((s) => s.kind === 'final') || null;
function totalBeforeFinal(team) {
  return rounds.reduce((sum, r) => sum + roundScore(team, r) * jokerFactor(team, r), 0);
}
function finalDelta(team) {
  const f = finalStep();
  if (!f) return 0;
  const s = ss(f);
  if (s.status !== 'revealed') return 0;
  const wager = s.wagers[team.teamId] || 0;
  const a = s.answers[team.teamId];
  return a !== undefined && a === f.answer ? wager : -wager;
}
// Beslissingsvraag: elk gewonnen duel levert 1 punt op, zodat de gelijke stand doorbroken wordt
function tiebreakBonus(team) {
  let b = 0;
  for (const st of steps) {
    if (st.kind !== 'tiebreak') continue;
    const s = ss(st);
    if (s.status === 'revealed' && s.winners && s.winners.includes(team.teamId)) b += 1;
  }
  return b;
}
const scoreOf = (team) => totalBeforeFinal(team) + finalDelta(team) + tiebreakBonus(team);
// Teams die na de slotvraag (en eerdere beslissingsvragen) gedeeld eerste staan
function tiedLeaders() {
  const list = Object.values(teams).map((t) => ({ id: t.teamId, score: scoreOf(t) }));
  if (list.length < 2) return [];
  const best = Math.max(...list.map((x) => x.score));
  const top = list.filter((x) => x.score === best);
  return top.length > 1 ? top.map((x) => x.id) : [];
}
function activeFor(step) {
  const s = ss(step);
  if (step.kind === 'tiebreak') return activeTeams().filter((t) => (s.teams || []).includes(t.teamId));
  return activeTeams();
}
function tiebreakWinners(step) {
  const s = ss(step);
  const d = Object.entries(s.answers).filter(([id, v]) => (s.teams || []).includes(id) && teams[id] && Number.isFinite(v)).map(([id, v]) => [id, Math.abs(v - step.answer)]);
  if (!d.length) return [];
  const best = Math.min(...d.map((x) => x[1]));
  return d.filter((x) => x[1] <= best + 1e-9).map((x) => x[0]);
}

function ranking() {
  const list = Object.values(teams).map((t) => ({ teamId: t.teamId, name: t.name, photo: photoUrl(t.teamId), score: scoreOf(t) })).sort((a, b) => b.score - a.score || byName(a, b));
  list.forEach((item) => { item.rank = 1 + list.filter((o) => o.score > item.score).length; });
  return list;
}
function breakdown() {
  const f = finalStep();
  return {
    rounds: rounds.map((r) => ({ id: r.id, title: `R${r.no}`, full: r.title, max: roundPoints(r) })),
    rows: Object.values(teams).map((t) => ({
      name: t.name,
      rounds: rounds.map((r) => ({ pts: roundScore(t, r), joker: t.jokerRound === r.id })),
      final: f && ss(f).status === 'revealed' ? finalDelta(t) : null,
      total: scoreOf(t)
    })).sort((a, b) => b.total - a.total || byName(a, b))
  };
}
function roundStandings(round) {
  return Object.values(teams).map((t) => ({
    name: t.name,
    teamId: t.teamId,
    photo: photoUrl(t.teamId),
    round: roundScore(t, round),
    total: scoreOf(t)
  })).sort((a, b) => b.round - a.round || byName(a, b));
}

// ---------------------------------------------------------------
// Antwoorden en voortgang
// ---------------------------------------------------------------
function hasAnswered(team, step) {
  const s = ss(step);
  const id = team.teamId;
  switch (step.kind) {
    case 'mc': return !!s.answers[id];
    case 'price': return !!s.answers[id];
    case 'logo': return !!s.answers[id];
    case 'song': return s.placements[id] !== undefined;
    case 'joker': return s.choices[id] !== undefined;
    case 'teamphoto': return !!teamPhotos[id] || !!s.skipped[id];
    case 'final': return s.status === 'wager' ? s.wagers[id] !== undefined : s.answers[id] !== undefined;
    case 'tiebreak': return s.answers[id] !== undefined;
    default: return false;
  }
}
const waitingFor = (step) => activeFor(step).filter((t) => !hasAnswered(t, step)).map((t) => t.name);

// Reveal = direct na het sluiten tonen we het antwoord (bij gewone meerkeuze pas bij het nakijken)
const revealsOnClose = (step) => step.kind !== 'mc' || step.variant !== 'text';

function closeStep(step) {
  const s = ss(step);
  if (step.kind === 'mc') {
    s.status = 'closed';
    timerClear();
  } else if (step.kind === 'logo') {
    s.status = 'closed';
  } else if (step.kind === 'price') {
    s.status = 'revealed';
  } else if (step.kind === 'song') {
    revealSong(step);
  } else if (step.kind === 'final' && s.status === 'question') {
    s.status = 'closed';
  } else if (step.kind === 'tiebreak' && s.status === 'open') {
    s.status = 'closed';
  }
}

// Het liedje van een muziekvraag: bij de eerste keer willekeurig gekozen uit de nog niet gespeelde liedjes
function songOf(step) {
  const s = ss(step);
  if (step.dynamic) {
    if (s.songId && songs[s.songId]) return songs[s.songId];
    const round = roundById[step.round];
    const used = new Set(usedSongKeys());
    const primary = (round && round.pool || []).filter((id) => songs[id] && !used.has(songs[id].key));
    const fallback = (round && round.fallbackPool || []).filter((id) => songs[id] && !used.has(songs[id].key));
    const pool = primary.length ? primary : fallback;
    if (pool.length) { s.songId = pool[Math.floor(Math.random() * pool.length)]; return songs[s.songId]; }
    return null;
  }
  if (!s.songId || !songs[s.songId]) {
    const round = roundById[step.round];
    const pool = (round && (step.test ? round.practicePool : round.pool)) || [];
    const used = new Set(steps.filter((x) => x.kind === 'song' && x.id !== step.id).map((x) => ssAll[x.id] && ssAll[x.id].songId).filter((id) => songs[id]).map((id) => songs[id].key));
    const starts = new Set(((round && round.startIds) || []).map((id) => songs[id].key));
    const free = pool.filter((id) => !used.has(songs[id].key) && !starts.has(songs[id].key));
    s.songId = free.length ? free[Math.floor(Math.random() * free.length)] : pool[0];
  }
  return songs[s.songId];
}
// Heeft een team het doel (standaard 10 kaarten) gehaald? Dan stopt de muziekronde.
const hitsterDone = (roundId) => Object.values(teams).some((t) => t.timelines && t.timelines[roundId] && t.timelines[roundId].length >= settings.hitsterTarget);

function revealSong(step) {
  const s = ss(step);
  if (s.status === 'revealed') return;
  const song = songOf(step);
  s.results = {};
  for (const team of Object.values(teams)) {
    const slot = s.placements[team.teamId];
    if (slot === undefined) continue;
    const tl = ensureTimeline(team, step.round);
    const left = slot > 0 ? songs[tl[slot - 1]] : null;
    const right = slot < tl.length ? songs[tl[slot]] : null;
    const ok = (!left || left.year <= song.year) && (!right || song.year <= right.year);
    const guess = s.years[team.teamId];
    s.results[team.teamId] = { slot, ok, yearGuess: guess === undefined ? null : guess, exact: guess === song.year };
    if (ok && !step.test) tl.splice(slot, 0, song.id); // oefenliedje: alleen kijken of het goed lag
  }
  s.status = 'revealed';
}

// Elke muziekronde heeft een eigen tijdlijn per team (een extra ronde begint opnieuw met startkaarten)
function dynamicStartIds(roundId) {
  const round = roundById[roundId];
  return [...(round && round.startIds || []), ...(dynStart[roundId] || [])];
}
function dynamicStartReady(roundId) {
  const round = roundById[roundId];
  return !round || dynamicStartIds(roundId).length >= (round.startCards || 2);
}
function ensureTimeline(team, roundId) {
  team.timelines = team.timelines || {};
  if (!team.timelines[roundId]) {
    const round = roundById[roundId];
    const start = round && round.dynamic ? dynamicStartIds(roundId) : round && round.startIds;
    if (round && round.dynamic && !dynamicStartReady(roundId)) return [];
    team.timelines[roundId] = start ? [...start].filter((id) => songs[id]).sort((a, b) => songs[a].year - songs[b].year) : [];
  }
  return team.timelines[roundId];
}

function settle() {
  if (paused || phase !== 'PLAY') return;
  const step = cur();
  if (!step) return;
  const s = ss(step);
  const active = activeTeams();
  if (!active.length) return;
  if (step.kind === 'tiebreak' && s.status === 'open') {
    const a = activeFor(step);
    if (a.length && a.every((t) => hasAnswered(t, step))) closeStep(step);
  }
  if (['mc', 'price', 'song', 'logo'].includes(step.kind) && s.status === 'open') {
    if (active.every((t) => hasAnswered(t, step))) closeStep(step);
  } else if (step.kind === 'final' && s.status === 'question') {
    if (active.every((t) => hasAnswered(t, step))) closeStep(step);
  }
  if (step.kind === 'draw' && s.status === 'drawing') {
    const turn = s.turns[s.turn];
    const eligible = eligibleDrawTeams(step, turn);
    if (turn && eligible.length && eligible.every((t) => turn.answers[t.teamId])) endDrawTurn(step);
  }
}

// Een team dat terugkomt terwijl de vraag al "klaar" was, mag alsnog antwoorden (alleen zonder tijdslimiet)
function reopenIfMissed(team) {
  const step = cur();
  if (!step || step.kind !== 'mc' || step.variant !== 'text' || settings.timerEnabled) return;
  const s = ss(step);
  if (s.status === 'closed' && teamConnected(team) && !s.answers[team.teamId]) s.status = 'open';
}

// ---------------------------------------------------------------
// Stappen betreden
// ---------------------------------------------------------------
function enterStep() {
  timerClear();
  review = null;
  showStandings = false;
  const step = cur();
  if (!step) return;
  const s = ss(step);
  if (step.kind === 'mc' && s.status === 'open' && settings.timerEnabled) {
    const secs = step.time ?? settings.defaultTime;
    if (secs > 0 && step.variant === 'text') timerStart(secs * 1000, 'mc');
  }
  if (step.kind === 'draw' && !s.plan) planDraw(step);
  if (step.kind === 'thirty' && !s.order) planThirty(step);
  if (step.kind === 'song') {
    if (step.dynamic) {
      const song = songOf(step); // probeer eerst de Excel-bibliotheek
      s.status = song && dynamicStartReady(step.round) ? 'open' : 'loading';
    }
    Object.values(teams).forEach((t) => ensureTimeline(t, step.round));
  }
  if (step.kind === 'tiebreak' && !s.teams) s.teams = tiedLeaders();
  // Spiekmeldingen horen bij vragen; bij andere schermen weer opruimen
  if (!cheatSensitive(step)) alerts = {};
}
const cheatSensitive = (step) => ['mc', 'price', 'song', 'memory', 'final', 'tiebreak', 'logo'].includes(step.kind);

const tiebreakPlayed = () => steps.some((x) => x.kind === 'tiebreak' && ssAll[x.id] && (ssAll[x.id].teams || []).length);
function finishQuiz() {
  if (phase === 'END') return;
  phase = 'END'; reveal = 'idle'; endView = 'ranking'; review = null; showStandings = false; timerClear();
  archiveFinishedQuiz();
}
function next() {
  if (stepIndex + 1 >= steps.length) return finishQuiz();
  stepIndex++;
  enterStep();
  // Beslissingsvragen alleen stellen als er echt een gelijke stand op de eerste plaats is
  while (phase === 'PLAY' && ((cur().kind === 'tiebreak' && !(ss(cur()).teams || []).length) || (cur().kind === 'song' && !cur().test && hitsterDone(cur().round)) || (cur().noTie && tiebreakPlayed()))) {
    if (stepIndex + 1 >= steps.length) return finishQuiz();
    stepIndex++;
    enterStep();
  }
}

// ---------------------------------------------------------------
// Ronde: geheugen
// ---------------------------------------------------------------
function startWriting(step) {
  const s = ss(step);
  s.status = 'writing';
  Object.values(teams).forEach((t) => { if (!s.entries[t.teamId]) s.entries[t.teamId] = []; });
}
function acceptedForms(item) { return [item.text, ...(item.alt || [])]; }
function entryMatches(text, item) {
  const n = norm(text);
  return acceptedForms(item).some((form) => {
    const f = norm(form);
    return fuzzyEq(text, form) || (f.length >= 4 && n.includes(f));
  });
}
function autoJudge(step) {
  const s = ss(step);
  for (const entries of Object.values(s.entries)) {
    const used = new Set();
    for (const e of entries) {
      const idx = step.items.findIndex((it, i) => !used.has(i) && entryMatches(e.text, it));
      if (idx >= 0) { used.add(idx); e.ok = true; } else e.ok = false;
    }
  }
}
function stopWriting(step) {
  const s = ss(step);
  if (s.status !== 'writing') return;
  timerClear();
  autoJudge(step);
  s.status = 'judging';
}

// ---------------------------------------------------------------
// Ronde: tekenen
// ---------------------------------------------------------------
function planDraw(step) {
  const s = ss(step);
  const members = {};
  Object.values(teams).forEach((t) => { members[t.teamId] = teamDevices(t).map((d) => d.deviceId); });
  s.plan = { members };
  s.turn = 0;
  s.turns = [];
  s.used = [];
  s.drew = {};
  s.status = 'ready';
  s.total = Math.max(0, ...Object.values(teams).map((t) => drawPlanTurns(s, t)));
  if (!s.total) s.status = 'result';
}
// Teams die deze beurt meedoen: er tekent iemand en de basistelefoon is verbonden
function eligibleDrawTeams(step, turn) {
  return Object.values(teams).filter((t) => turn && turn.drawers[t.teamId] && devices[turn.drawers[t.teamId]] && devices[turn.answerers[t.teamId]] && devices[turn.answerers[t.teamId]].connected);
}
function startDrawTurn(step) {
  const s = ss(step);
  s.drew = s.drew || {};
  const pool = step.words.length ? step.words : [{ word: 'Fiets', alt: [] }];
  const usedElsewhere = new Set(steps.filter((x) => x.kind === 'draw' && x.id !== step.id).flatMap((x) => ((ssAll[x.id] && ssAll[x.id].turns) || []).flatMap((t) => (t ? Object.values(t.words).map((w) => w.word) : []))));
  let free = pool.map((_, i) => i).filter((i) => !s.used.includes(i) && !usedElsewhere.has(pool[i].word));
  if (!free.length) free = pool.map((_, i) => i).filter((i) => !s.used.includes(i));
  if (!free.length) { s.used = []; free = pool.map((_, i) => i); }
  const turn = { words: {}, drawers: {}, answerers: {}, strokes: {}, answers: {}, ok: {}, done: false };
  const picks = shuffle(free);
  let k = 0;
  for (const team of Object.values(teams).sort(bySeq)) {
    if (drawPlanTurns(s, team) <= s.turn) continue;
    // Willekeurig iemand die nog niet getekend heeft (ook de basistelefoon komt aan de beurt)
    const done = s.drew[team.teamId] || [];
    const options = teamDevices(team).filter((d) => !done.includes(d.deviceId));
    const pool2 = options.filter((d) => d.connected).length ? options.filter((d) => d.connected) : options;
    if (!pool2.length) continue;
    const drawer = pool2[Math.floor(Math.random() * pool2.length)];
    s.drew[team.teamId] = [...done, drawer.deviceId];
    const idx = picks[k++ % picks.length];
    s.used.push(idx);
    turn.drawers[team.teamId] = drawer.deviceId;
    // Wie dient het antwoord in? De basistelefoon, behalve als die zelf tekent: dan tijdelijk een ander teamlid
    const others = teamDevices(team).filter((d) => d.deviceId !== drawer.deviceId);
    turn.answerers[team.teamId] = drawer.deviceId !== team.baseDeviceId ? team.baseDeviceId : ((others.find((d) => d.connected) || others[0]) || {}).deviceId;
    turn.words[team.teamId] = pool[idx];
    turn.strokes[team.teamId] = [];
  }
  s.turns[s.turn] = turn;
  s.status = 'drawing';
}
// Na de beurt: de quizmaster keurt de antwoorden (voorgevuld met wat automatisch lijkt te kloppen)
function endDrawTurn(step) {
  const s = ss(step);
  if (s.status !== 'drawing') return;
  timerClear();
  s.status = 'judging';
}
function drawGuessOk(entry, text) {
  return [entry.word, ...(entry.alt || [])].some((w) => fuzzyEq(w, text));
}

// ---------------------------------------------------------------
// Ronde: 30 seconds
// ---------------------------------------------------------------
function planThirty(step) {
  const s = ss(step);
  const lists = Object.values(teams).sort(bySeq).map((t) => ({ t, members: teamDevices(t) }));
  const maxM = Math.max(0, ...lists.map((l) => l.members.length));
  s.order = [];
  for (let k = 0; k < maxM; k++) for (const l of lists) if (l.members[k]) s.order.push({ teamId: l.t.teamId, deviceId: l.members[k].deviceId });
  const usedCards = new Set(steps.filter((x) => x.kind === 'thirty' && x.id !== step.id).flatMap((x) => ((ssAll[x.id] && ssAll[x.id].turns) || []).map((t) => t && t.words.join('|'))));
  const idx = step.cards.map((_, i) => i);
  s.cardOrder = [...shuffle(idx.filter((i) => !usedCards.has(step.cards[i].join('|')))), ...shuffle(idx.filter((i) => usedCards.has(step.cards[i].join('|'))))];
  s.turn = 0;
  s.turns = [];
  s.status = s.order.length ? 'ready' : 'finished';
}
function startThirty(step) {
  const s = ss(step);
  const o = s.order[s.turn];
  const card = step.cards[s.cardOrder[s.turn % Math.max(1, s.cardOrder.length)]] || ['?', '?', '?', '?', '?'];
  s.turns.push({ teamId: o.teamId, deviceId: o.deviceId, words: card, ok: [false, false, false, false, false], done: false });
  s.status = 'running';
  timerStart((step.seconds || settings.thirtySeconds) * 1000, 'thirty');
}
function stopThirty(step) {
  const s = ss(step);
  if (s.status !== 'running') return;
  timerClear();
  s.status = 'judging';
}

// ---------------------------------------------------------------
// Nakijken: pagina's met tabellen (voor tv en bediening)
// ---------------------------------------------------------------
const L = ['A', 'B', 'C', 'D', 'E', 'F'];
const clip = (t, n = 28) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

function reviewPages(scope) {
  const list = scope === 'all' ? rounds : rounds.filter((r) => r.id === scope);
  const pages = [];
  const teamList = Object.values(teams).sort(byName);
  const names = teamList.map((t) => t.name);
  for (const round of list) {
    const rs = steps.filter((s) => s.round === round.id);
    const title = `Ronde ${round.no}: ${round.title}`;
    if (round.type === 'logo' || round.type === 'blur') {
      const qs = rs.filter((x) => x.kind === 'logo' && !x.test && ss(x).status === 'closed');
      for (let k = 0; k < qs.length; k += 8) {
        pages.push({
          title, subtitle: '', columns: [round.type === 'blur' ? 'Foto' : 'Logo', ...names],
          rows: qs.slice(k, k + 8).map((q) => {
            const aw = logoAwards(q), st = ss(q);
            return [q.name, ...teamList.map((t) => (st.answers[t.teamId] ? { t: `${st.answers[t.teamId].text}${aw[t.teamId] ? '  +' + aw[t.teamId] : ''}`, ok: !!st.judged[t.teamId] } : { t: '–', ok: false }))];
          })
        });
      }
    } else if (['mc', 'blur'].includes(round.type)) {
      const qs = rs.filter((s) => s.kind === 'mc' && !s.test && ss(s).status === 'closed');
      const groups = [];
      qs.forEach((q) => {
        const key = q.category || '';
        let g = groups[groups.length - 1];
        if (!g || g.key !== key || g.items.length >= 8) { g = { key, items: [] }; groups.push(g); }
        g.items.push(q);
      });
      groups.forEach((g) => {
        pages.push({
          title, subtitle: g.key,
          columns: ['Vraag', 'Goed antwoord', ...names],
          rows: g.items.map((q) => [
            clip(q.question || q.options[q.answer], 60),
            `${L[q.answer]}: ${clip(q.options[q.answer], 24)}`,
            ...teamList.map((t) => {
              const a = mcAward(q, t);
              if (a.ok === null) return { t: 'vervallen' };
              if (!a.a) return { t: '–', ok: false };
              return { t: `${L[a.a.v]}: ${clip(q.options[a.a.v], 18)}`, ok: a.ok };
            })
          ])
        });
      });
    } else if (round.type === 'memory') {
      const step = rs.find((s) => s.kind === 'memory' && !s.test);
      const s = step && ss(step);
      if (s && s.status === 'done') {
        pages.push({ title, subtitle: 'Op het bord stond', columns: ['Antwoorden die goed waren'], rows: step.items.map((it) => [it.text]) });
        teamList.forEach((t) => {
          const entries = s.entries[t.teamId] || [];
          pages.push({
            title, subtitle: `${t.name}: ${entries.filter((e) => e.ok).length} van ${step.items.length} goed`,
            columns: ['Antwoord', 'Beoordeling'],
            rows: entries.length ? entries.map((e) => [e.text, { t: e.ok ? 'Goed' : 'Fout', ok: !!e.ok }]) : [['(niets opgeschreven)', '']]
          });
        });
      }
    } else if (round.type === 'hitster') {
      const ss2 = rs.filter((s) => s.kind === 'song' && !s.test && ss(s).status === 'revealed');
      if (ss2.length) {
        pages.push({
          title, subtitle: 'Liedjes in de tijdlijn',
          columns: ['Liedje', 'Jaar', ...names],
          rows: ss2.map((st) => {
            const song = songOf(st);
            const res = ss(st).results || {};
            return [`${song.title} – ${song.artist}`, String(song.year), ...teamList.map((t) => (res[t.teamId] ? { t: `plek ${res[t.teamId].slot + 1}${res[t.teamId].yearGuess ? ' · jaar ' + res[t.teamId].yearGuess : ''}${res[t.teamId].exact ? ' ★ exact' : ''}`, ok: res[t.teamId].ok } : { t: '–', ok: false }))];
          })
        });
      }
    } else if (round.type === 'price') {
      const ps = rs.filter((s) => s.kind === 'price' && !s.test && ss(s).status === 'revealed');
      const euro = (n) => '€' + n.toFixed(2).replace('.', ',');
      for (const key of ['now', 'ago']) {
        if (!ps.length) break;
        pages.push({
          title, subtitle: key === 'now' ? 'Prijs nu' : `Prijs ${round.agoYears} jaar geleden`,
          columns: ['Product', 'Echte prijs', ...names],
          rows: ps.map((st) => {
            const aw = priceAwards(st);
            return [st.name + (st.unit ? ` (${st.unit})` : ''), euro(st[key]), ...teamList.map((t) => {
              const x = aw[t.teamId] && aw[t.teamId][key];
              return x ? { t: `${euro(x.v)}  +${x.pts}`, ok: x.rank === 0 } : { t: '–', ok: false };
            })];
          })
        });
      }
    } else if (round.type === 'draw') {
      const step = rs.find((s) => s.kind === 'draw');
      const s = step && ss(step);
      if (s && s.turns.length) {
        // Eén pagina per beurt, met de tekeningen erbij
        s.turns.forEach((turn, i) => {
          if (!turn || !turn.done) return;
          const rows = [], images = [];
          teamList.forEach((t) => {
            if (!turn.words[t.teamId]) return;
            const d = devices[turn.drawers[t.teamId]];
            const a = turn.answers[t.teamId];
            rows.push([t.name, d ? d.label : '?', turn.words[t.teamId].word, { t: a ? a.text : '(geen antwoord)', ok: !!turn.ok[t.teamId] }]);
            images.push({ label: `${t.name}: ${turn.words[t.teamId].word}`, strokes: turn.strokes[t.teamId] || [], ok: !!turn.ok[t.teamId] });
          });
          pages.push({ title, subtitle: `Tekenbeurt ${i + 1}`, columns: ['Team', 'Tekenaar', 'Woord', 'Antwoord'], rows, images });
        });
      }
    } else if (round.type === 'thirty') {
      const step = rs.find((s) => s.kind === 'thirty');
      const s = step && ss(step);
      if (s && s.turns.length) {
        pages.push({
          title, subtitle: '30 seconds',
          columns: ['Team', 'Uitlegger', 'Goed', 'Woorden'],
          rows: s.turns.filter((t) => t.done).map((t) => [
            (teams[t.teamId] || { name: '?' }).name,
            (devices[t.deviceId] || { label: '?' }).label,
            { t: `${t.ok.filter(Boolean).length} van 5`, ok: t.ok.filter(Boolean).length >= 3 },
            t.words.map((w, i) => (t.ok[i] ? '✓ ' : '✗ ') + w).join(' · ')
          ])
        });
      }
    }
  }
  const f = finalStep();
  if (scope === 'all' && f && ss(f).status === 'revealed') {
    const fs2 = ss(f);
    pages.push({
      title: `Slotvraag: ${f.question}`, subtitle: `Goede antwoord: ${L[f.answer]}: ${f.options[f.answer]}`,
      columns: ['Team', 'Inzet', 'Antwoord', 'Punten'],
      rows: teamList.map((t) => {
        const a = fs2.answers[t.teamId];
        const d = finalDelta(t);
        return [t.name, String(fs2.wagers[t.teamId] || 0), a === undefined ? '–' : `${L[a]}: ${clip(f.options[a], 22)}`, { t: (d >= 0 ? '+' : '') + d, ok: d > 0 ? true : d < 0 ? false : null }];
      })
    });
  }
  if (scope === 'all') {
    for (const st of steps.filter((x) => x.kind === 'tiebreak')) {
      const ts = ss(st);
      if (ts.status !== 'revealed') continue;
      pages.push({
        title: `Beslissingsvraag: ${st.question}`, subtitle: `Goede antwoord: ${st.answer}${st.unit ? ' ' + st.unit : ''}`,
        columns: ['Team', 'Gok', 'Verschil', 'Uitslag'],
        rows: (ts.teams || []).map((id) => teams[id]).filter(Boolean).map((t) => {
          const a = ts.answers[t.teamId];
          const won = (ts.winners || []).includes(t.teamId);
          return [t.name, a === undefined ? '–' : String(a), a === undefined ? '–' : String(Math.abs(a - st.answer)), { t: won ? 'Wint (+1)' : 'Verliest', ok: won }];
        })
      });
    }
  }
  return pages;
}

// ---------------------------------------------------------------
// Opslaan en hervatten
// ---------------------------------------------------------------
let saveTimer = null;
function loadHistory() {
  const saved = readJsonWithBackup(HISTORY_FILE, isHistorySnapshot);
  historyEntries = saved ? saved.data.entries.slice(0, HISTORY_LIMIT) : [];
  if (saved && saved.source === 'backup') console.warn('De quizgeschiedenis is hersteld uit de reservekopie.');
}
function saveHistory() {
  writeJsonWithBackup(HISTORY_FILE, { version: HISTORY_VERSION, entries: historyEntries });
}
function archiveFinishedQuiz() {
  if (!gameId || historyEntries.some((entry) => entry.gameId === gameId)) return;
  if (Object.values(teams).some((t) => t.bot)) return; // oefenquiz met testteams niet in de geschiedenis
  const entry = createHistoryEntry({
    gameId,
    completedAt: new Date().toISOString(),
    quiz: quizSource,
    theme: settings.theme,
    ranking: ranking(),
    breakdown: breakdown()
  });
  historyEntries = appendHistory(historyEntries, entry, HISTORY_LIMIT);
  try { saveHistory(); }
  catch (error) { console.error('Quizgeschiedenis opslaan mislukt:', error.message); }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 250);
}
function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      version: 2, savedAt: new Date().toISOString(),
      phase, stepIndex, paused, reveal, revealN, lobbyStage, endView, settings, seq, ssAll, dynSongs, dynStart, gameId,
      timer: { tag: timer.tag, totalMs: timer.totalMs, remainingMs: Math.round(remainingNow()) },
      teams,
      undoHistory,
      devices: Object.fromEntries(Object.entries(devices).map(([id, d]) => [id, { deviceId: d.deviceId, memberId: d.memberId, teamId: d.teamId, label: d.label, seq: d.seq, ...(d.bot ? { bot: true } : {}) }]))
    };
    writeJsonWithBackup(STATE_FILE, snapshot);
  } catch (e) {
    console.error('Opslaan mislukt:', e.message);
  }
}
function loadSaved() {
  if (FRESH) { removeStateFiles(STATE_FILE); return false; }
  const saved = readJsonWithBackup(STATE_FILE, (snapshot) => snapshot.version === 2 && snapshot.teams && typeof snapshot.teams === 'object');
  if (!saved) return false;
  const data = saved.data;
  if (saved.source === 'backup') console.warn('Het hoofd-opslagbestand is ongeldig; de vorige geldige reservekopie wordt hersteld.');
  if (!data || data.version !== 2 || typeof data.teams !== 'object' || !steps.length) return false;

  teams = {};
  for (const t of Object.values(data.teams)) {
    if (!t || !t.teamId || !t.name) continue;
    teams[t.teamId] = { teamId: t.teamId, name: t.name, seq: t.seq || ++seq, baseDeviceId: t.baseDeviceId, jokerRound: t.jokerRound || null, timelines: t.timelines && typeof t.timelines === 'object' ? t.timelines : {}, proposal: null, ...(t.bot ? { bot: true } : {}) };
  }
  devices = {};
  for (const d of Object.values(data.devices || {})) {
    if (!d || !teams[d.teamId]) continue;
    devices[d.deviceId] = { deviceId: d.deviceId, memberId: d.memberId || newId('m_'), teamId: d.teamId, label: d.label || 'Telefoon', seq: d.seq || ++seq, socketId: d.bot ? `bot_${d.deviceId}` : null, connected: !!d.bot, ...(d.bot ? { bot: true } : {}) };
  }
  for (const t of Object.values(teams)) {
    if (!devices[t.baseDeviceId]) { const first = teamDevices(t)[0]; if (first) t.baseDeviceId = first.deviceId; }
  }
  seq = Math.max(seq, data.seq || 0, ...Object.values(teams).map((t) => t.seq), ...Object.values(devices).map((d) => d.seq));
  settings = sanitizeSettings(data.settings, settings);
  gameId = typeof data.gameId === 'string' ? data.gameId : null;
  dynSongs = data.dynSongs && typeof data.dynSongs === 'object' ? data.dynSongs : {};
  dynStart = data.dynStart && typeof data.dynStart === 'object' ? data.dynStart : {};
  compileQuiz(content.warnings);
  ssAll = data.ssAll && typeof data.ssAll === 'object' ? data.ssAll : {};
  undoHistory = Array.isArray(data.undoHistory) ? data.undoHistory.slice(-UNDO_LIMIT) : [];
  phase = ['LOBBY', 'PLAY', 'END'].includes(data.phase) ? data.phase : 'LOBBY';
  // Oude opgeslagen quizzen van vóór de geschiedenisfunctie krijgen alsnog een sessie-ID.
  if (phase !== 'LOBBY' && !gameId) gameId = crypto.randomUUID();
  stepIndex = Math.min(Math.max(Number.isInteger(data.stepIndex) ? data.stepIndex : 0, 0), steps.length - 1);
  reveal = ['idle', 'stepping', 'done'].includes(data.reveal) ? data.reveal : 'idle';
  revealN = Number.isInteger(data.revealN) ? data.revealN : 0;
  lobbyStage = data.lobbyStage === 'join' ? 'join' : 'welcome';
  endView = data.endView === 'breakdown' ? 'breakdown' : 'ranking';
  if (data.timer && data.timer.tag) { timer.tag = data.timer.tag; timer.totalMs = Number(data.timer.totalMs) || 0; timer.remainingMs = Number(data.timer.remainingMs) || 0; }
  // Teams komen pas langzaam terug na een herstart: begin dus op pauze
  paused = phase === 'PLAY';
  return Object.keys(teams).length > 0 || phase !== 'LOBBY';
}

// ---------------------------------------------------------------
// Wat welk scherm te zien krijgt
// ---------------------------------------------------------------
function progressOf(step) {
  if (!step) return null;
  if (step.test) return { label: step.round === 'test' ? 'Testvraag' : 'Oefenvraag' };
  const items = steps.filter((s) => s.round === step.round && ['mc', 'song', 'price', 'logo'].includes(s.kind) && !s.test);
  const i = items.findIndex((s) => s.id === step.id);
  return i >= 0 ? { n: i + 1, total: items.length } : null;
}

function teamChips(step) {
  return Object.values(teams).map((t) => ({ teamId: t.teamId, name: t.name, connected: teamConnected(t), answered: hasAnswered(t, step) })).sort(byName);
}
function mcResultTeams(step) {
  return Object.values(teams).map((t) => { const a = mcAward(step, t); return { name: t.name, ok: a.ok, pts: a.raw, answered: !!a.a }; }).sort(byName);
}

// Alles wat de tv (openbaar) over de huidige stap mag tonen
function publicStep(step) {
  const s = ss(step);
  const base = { kind: step.kind, id: step.id, round: step.round };
  switch (step.kind) {
    case 'info':
      return { ...base, emoji: step.emoji, title: step.title, text: step.text, transition: !!step.transition, categoryIntro: !!step.categoryIntro, roundIntro: !!step.roundIntro, points: step.roundIntro ? roundPoints(roundById[step.round]) : null, roundNo: step.roundIntro ? roundById[step.round].no : null };
    case 'mc': {
      const showAnswer = s.status === 'closed' && revealsOnClose(step);
      return {
        ...base, variant: step.variant, test: step.test, category: step.category, question: step.question, options: step.options, media: step.media,
        status: s.status, blurStep: s.blurStep, blurMax: settings.blurPoints.length - 1, blurPoints: step.variant === 'blur' ? settings.blurPoints : null, hide: step.hide,
        answer: showAnswer ? step.answer : null, results: null, explanation: showAnswer ? step.explanation : null,
        teams: teamChips(step), timer: s.status === 'open' ? timerInfo('mc') : null
      };
    }
    case 'memory': {
      const entries = s.entries;
      const out = { ...base, status: s.status, prompt: step.prompt, timer: timerInfo('memory'), teams: Object.values(teams).sort(byName).map((t) => ({ name: t.name, count: (entries[t.teamId] || []).length })) };
      if (s.status === 'done') {
        out.items = step.items.map((i) => i.text);
      }
      return out;
    }
    case 'song': {
      const song = songOf(step);
      if (!song || s.status === 'loading') return { ...base, status: 'loading', target: settings.hitsterTarget, teams: [] };
      const out = { ...base, status: s.status, audio: song.audio, target: settings.hitsterTarget, done: s.status === 'revealed' && hitsterDone(step.round), placed: Object.keys(s.placements).filter((id) => teams[id]).length, active: activeTeams().length,
        teams: Object.values(teams).sort(byName).map((t) => ({ name: t.name, cards: ensureTimeline(t, step.round).length, answered: hasAnswered(t, step), connected: teamConnected(t) })) };
      return out; // het antwoord staat alleen op de telefoons, niet op de tv
    }
    case 'price': {
      const out = { ...base, status: s.status, name: step.name, unit: step.unit, emoji: step.emoji, agoYears: step.agoYears, teams: teamChips(step) };
      if (s.status === 'revealed') {
        out.truth = { now: step.now, ago: step.ago };
      }
      return out;
    }
    case 'draw': {
      const turn = s.turns[s.turn];
      const out = { ...base, status: s.status, turn: s.turn + 1, total: s.total || 0, teams: [] };
      if (turn) {
        out.teams = Object.values(teams).sort(byName).map((t) => ({
          name: t.name, drawer: turn.drawers[t.teamId] && devices[turn.drawers[t.teamId]] ? devices[turn.drawers[t.teamId]].label : null,
          answered: !!turn.answers[t.teamId],
          word: (s.status === 'judging' || s.status === 'result') && turn.words[t.teamId] ? turn.words[t.teamId].word : null,
          strokes: s.status === 'judging' || s.status === 'result' ? turn.strokes[t.teamId] || [] : null
        }));
      }
      return out;
    }
    case 'demo_draw':
      return { ...base, status: s.status, word: s.status === 'result' ? step.word : null, strokes: s.status !== 'ready' ? s.strokes : null };
    case 'demo_thirty':
      return { ...base, status: s.status, timer: timerInfo('thirty'), words: s.status === 'result' ? step.words : step.words.map((w, i) => (s.ok[i] ? w : null)), ok: s.ok };
    case 'logo':
      return {
        ...base, variant: step.variant, test: !!step.test, question: step.question, status: s.status, media: step.media, hide: step.hide, teams: teamChips(step),
        blurStep: s.blurStep || 0, blurMax: settings.blurPoints.length - 1, blurPoints: settings.blurPoints,
        name: s.status === 'closed' ? step.name : null
      };
    case 'thirty': {
      const o = s.order && s.order[s.turn];
      const turn = s.turns[s.turn];
      // Tijdens de beurt alleen de goedgekeurde woorden (groen); daarna alle vijf
      const words = !turn ? null : s.status === 'running' ? turn.words.map((w, i) => (turn.ok[i] ? w : null)) : turn.words;
      return {
        ...base, status: s.status, turn: s.turn + 1, total: s.order ? s.order.length : 0, timer: timerInfo('thirty'),
        team: o && teams[o.teamId] ? teams[o.teamId].name : null,
        explainer: o && devices[o.deviceId] ? devices[o.deviceId].label : null,
        words, ok: turn ? turn.ok : null
      };
    }
    case 'roundresult': {
      const round = roundById[step.round];
      const rows = roundStandings(round).map((r) => (settings.showRoundTotals ? r : { ...r, total: null }));
      return { ...base, title: `Dit was ronde ${round.no}: ${round.title}`, max: roundPoints(round), showTotals: !!settings.showRoundTotals, rows };
    }
    case 'teamphoto':
      return { ...base, teams: Object.values(teams).sort(byName).map((t) => ({ name: t.name, photo: photoUrl(t.teamId), skipped: !!s.skipped[t.teamId], connected: teamConnected(t) })) };
    case 'joker':
      return { ...base, chosen: Object.values(teams).sort(byName).map((t) => ({ name: t.name, done: s.choices[t.teamId] !== undefined, round: t.jokerRound && roundById[t.jokerRound] ? `Ronde ${roundById[t.jokerRound].no}: ${roundById[t.jokerRound].title}` : null })) };
    case 'final': {
      const out = { ...base, status: s.status, category: step.category, maxWager: settings.finalMaxWager, teams: teamChips(step) };
      if (s.status !== 'wager') { out.question = step.question; out.options = step.options; out.media = step.media; }
      if (s.status === 'revealed') { out.answer = step.answer; out.explanation = step.explanation; }
      return out;
    }
    case 'tiebreak': {
      const tied = (s.teams || []).map((id) => teams[id]).filter(Boolean);
      const out = { ...base, status: s.status, question: step.question, unit: step.unit, teams: tied.map((t) => ({ name: t.name, answered: s.answers[t.teamId] !== undefined, connected: teamConnected(t) })) };
      if (s.status === 'revealed') { out.answer = step.answer; out.explanation = step.explanation; }
      return out;
    }
    default:
      return base;
  }
}

// Wat de quizmaster extra ziet: antwoorden, woorden, knoppen
function hostPanel(step) {
  const s = ss(step);
  switch (step.kind) {
    case 'mc':
      return {
        type: 'mc', variant: step.variant, answer: step.answer, options: step.options, question: step.question, voided: s.voided, status: s.status,
        blurStep: s.blurStep, blurMax: settings.blurPoints.length - 1, media: step.media, explanation: step.explanation,
        teams: Object.values(teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, connected: teamConnected(t), answered: !!s.answers[t.teamId], value: s.answers[t.teamId] ? s.answers[t.teamId].v : null }))
      };
    case 'memory':
      return {
        type: 'memory', status: s.status, items: step.items.map((i) => i.text),
        teams: Object.values(teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, entries: (s.entries[t.teamId] || []).map((e) => ({ id: e.id, text: e.text, ok: e.ok })) }))
      };
    case 'song': {
      const song = songOf(step);
      if (!song || s.status === 'loading') {
        const round = roundById[step.round];
        return { type: 'song', status: 'loading', dynamic: true, stepId: step.id, roundId: step.round, category: round.category, categoryName: HITSTER_CATS[round.category],
          needSong: !s.songId, needStart: Math.max(0, (round.startCards || 2) - dynamicStartIds(step.round).length), exclude: usedSongKeys() };
      }
      return { type: 'song', uri: song.uri || null, target: settings.hitsterTarget, cards: Object.values(teams).sort(byName).map((t) => ({ name: t.name, n: ensureTimeline(t, step.round).length })), status: s.status, song: { id: step.id, uri: song.uri || null, title: song.title, artist: song.artist, year: song.year, hasAudio: !!song.audio, spotify: `https://open.spotify.com/search/${encodeURIComponent(song.title + ' ' + song.artist)}` }, placed: Object.keys(s.placements).length };
    }
    case 'price':
      return { type: 'price', status: s.status, name: step.name, unit: step.unit, now: step.now, ago: step.ago, agoYears: step.agoYears };
    case 'draw': {
      const turn = s.turns[s.turn];
      const small = Object.values(teams).filter((t) => (s.plan ? drawPlanTurns(s, t) : 0) < 1).map((t) => t.name);
      return {
        type: 'draw', status: s.status, turn: s.turn + 1, total: s.total || 0, smallTeams: small,
        teams: turn ? Object.values(teams).sort(byName).filter((t) => turn.words[t.teamId]).map((t) => ({
          teamId: t.teamId, name: t.name, word: turn.words[t.teamId].word, drawer: devices[turn.drawers[t.teamId]] ? devices[turn.drawers[t.teamId]].label : '?',
          answerer: devices[turn.answerers[t.teamId]] ? devices[turn.answerers[t.teamId]].label : '?',
          answer: turn.answers[t.teamId] ? turn.answers[t.teamId].text : null, ok: !!turn.ok[t.teamId],
          strokes: s.status === 'judging' || s.status === 'result' ? turn.strokes[t.teamId] || [] : null
        })) : []
      };
    }
    case 'thirty': {
      const o = s.order && s.order[s.turn];
      const turn = s.turns[s.turn];
      return {
        type: 'thirty', status: s.status, turn: s.turn + 1, total: s.order ? s.order.length : 0,
        team: o && teams[o.teamId] ? teams[o.teamId].name : null, explainer: o && devices[o.deviceId] ? devices[o.deviceId].label : null,
        words: turn ? turn.words : null, ok: turn ? turn.ok : null
      };
    }
    case 'demo_draw':
      return { type: 'demo_draw', status: s.status, word: step.word };
    case 'demo_thirty':
      return { type: 'demo_thirty', status: s.status, words: step.words, ok: s.ok };
    case 'logo': {
      const aw = logoAwards(step);
      const order = Object.entries(s.answers).filter(([id]) => teams[id]).sort((a, b) => a[1].at - b[1].at).map(([id]) => id);
      return {
        type: 'logo', variant: step.variant, test: !!step.test, status: s.status, name: step.name, alt: step.alt, media: step.media,
        blurStep: s.blurStep || 0, blurMax: settings.blurPoints.length - 1,
        teams: Object.values(teams).sort(byName).map((t) => {
          const a = s.answers[t.teamId];
          return { teamId: t.teamId, name: t.name, connected: teamConnected(t), answer: a ? a.text : null, place: a ? order.indexOf(t.teamId) + 1 : null, ok: !!s.judged[t.teamId], pts: aw[t.teamId] || 0 };
        })
      };
    }
    case 'teamphoto':
      return { type: 'teamphoto', teams: Object.values(teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, photo: photoUrl(t.teamId), skipped: !!s.skipped[t.teamId], connected: teamConnected(t) })) };
    case 'joker':
      return { type: 'joker', teams: Object.values(teams).sort(byName).map((t) => ({ name: t.name, round: t.jokerRound ? roundById[t.jokerRound].title : null })) };
    case 'final':
      return {
        type: 'final', status: s.status, answer: step.answer, options: step.options, question: step.question,
        teams: Object.values(teams).sort(byName).map((t) => ({ name: t.name, wager: s.wagers[t.teamId] ?? null, max: settings.finalMaxWager, answer: s.answers[t.teamId] ?? null }))
      };
    case 'tiebreak':
      return {
        type: 'tiebreak', status: s.status, answer: step.answer, unit: step.unit, question: step.question,
        teams: (s.teams || []).map((id) => teams[id]).filter(Boolean).map((t) => ({ name: t.name, guess: s.answers[t.teamId] ?? null }))
      };
    default:
      return null;
  }
}

// De hoofdknop van de quizmaster: label, of hij werkt, en wat hij doet
function mainAction() {
  const none = (label, hint) => ({ label, enabled: false, hint: hint || '', run: null });
  const go = (label, run, hint) => ({ label, enabled: true, hint: hint || '', run });
  if (phase === 'LOBBY') {
    if (!steps.length) return none('Geen quiz geladen', 'Controleer questions.json');
    if (!settings.maxTeams) return none('📱 Toon het aanmeldscherm (QR-code)', 'Vul eerst bij Teams in hoeveel teams er maximaal mee mogen doen.');
    if (lobbyStage === 'welcome') return go('📱 Toon het aanmeldscherm (QR-code)', () => { lobbyStage = 'join'; });
    if (!Object.keys(teams).length) return none('▶️ Start de quiz', 'Er is nog geen team aangemeld.');
    return go('▶️ Start de quiz', () => { gameId = crypto.randomUUID(); phase = 'PLAY'; stepIndex = 0; enterStep(); });
  }
  if (phase === 'END') {
    const list = ranking();
    if (reveal === 'idle') return go('🥁 Start de ontknoping', () => { reveal = 'stepping'; revealN = 0; });
    if (reveal === 'stepping' && revealN < list.length) {
      const nextTeam = list[list.length - 1 - revealN];
      const last = revealN === list.length - 1;
      return go(last ? '🏆 Onthul de winnaar!' : `🎖️ Onthul plek ${nextTeam.rank}`, () => { revealN++; if (revealN >= list.length) reveal = 'done'; },
        last ? 'Tromgeroffel…' : 'Reik eventueel eerst de prijs uit voor de vorige plek.');
    }
    return go('🔍 Nakijken: alle rondes', () => { review = { scope: 'all', page: 0 }; });
  }
  const step = cur();
  const s = ss(step);
  const wait = () => { const w = waitingFor(step); return w.length ? `Wacht nog op: ${w.join(', ')}` : 'Wacht op de teams…'; };
  switch (step.kind) {
    case 'info':
    case 'roundresult':
      return go('Volgende ▶️', next);
    case 'song':
      if (s.status === 'loading') return none('🔎 Liedje zoeken op Spotify…', 'De bediening zoekt automatisch een nummer in deze categorie (Spotify moet verbonden zijn; anders een iTunes-fragment).');
      if (s.status === 'open') return none('⏳ Wachten op de teams…', wait());
      if (step.test) return go('Volgende ▶️', next);
      if (hitsterDone(step.round)) return go(`🏁 Muziekronde klaar (${settings.hitsterTarget} kaarten) ▶️`, next, 'Een team heeft de tijdlijn vol; de overige liedjes worden overgeslagen.');
      if (!steps.slice(stepIndex + 1).some((x) => x.kind === 'song' && x.round === step.round)) return go('Volgende ▶️', next, `De liedjes zijn op voordat een team ${settings.hitsterTarget} kaarten had.`);
      return go('Volgend liedje ▶️', next);
    case 'mc':
    case 'price':
      if (s.status === 'open') return none('⏳ Wachten op de teams…', wait());
      return go('Volgende ▶️', next);
    case 'logo':
      if (s.status === 'open') return none('⏳ Wachten op de teams…', wait());
      return go('Volgende ▶️', next, 'Controleer eerst de antwoorden hieronder (✔ / ✘).');
    case 'memory':
      if (s.status === 'idle') return go('▶️ Start schrijven', () => startWriting(step));
      if (s.status === 'writing') return go('⏹️ Tijd is om: stop met schrijven', () => stopWriting(step), 'Er loopt geen klok: jij bepaalt wanneer de tijd om is.');
      if (s.status === 'judging') return go('✅ Nakijken klaar', () => { s.status = 'done'; });
      return go('Volgende ▶️', next);
    case 'draw':
      if (s.status === 'ready') return go(`▶️ Start beurt ${s.turn + 1} van ${s.total}`, () => startDrawTurn(step));
      if (s.status === 'drawing') return none('⏳ Wachten tot elk team een antwoord heeft ingediend…', `Nog niet ingediend: ${eligibleDrawTeams(step, s.turns[s.turn]).filter((t) => !s.turns[s.turn].answers[t.teamId]).map((t) => t.name).join(', ') || '–'}`);
      if (s.status === 'judging') return go('✅ Beoordeling bevestigen', () => { s.turns[s.turn].done = true; s.status = 'result'; });
      if (s.status === 'result' && s.turn + 1 < (s.total || 0)) return go(`▶️ Volgende beurt (${s.turn + 2} van ${s.total})`, () => { s.turn++; s.status = 'ready'; });
      return go('Ronde afsluiten ▶️', next);
    case 'thirty':
      if (s.status === 'ready') return go(`▶️ Start: ${teams[s.order[s.turn].teamId] ? teams[s.order[s.turn].teamId].name : '?'}`, () => startThirty(step));
      if (s.status === 'running') return go('⏹️ Stop (tijd om)', () => stopThirty(step));
      if (s.status === 'judging') return go('✅ Uitslag bevestigen', () => { s.turns[s.turn].done = true; s.status = 'result'; });
      if (s.status === 'result' && s.turn + 1 < s.order.length) return go('Volgende beurt ▶️', () => { s.turn++; s.status = 'ready'; });
      return go('Ronde afsluiten ▶️', next);
    case 'demo_draw':
      if (s.status === 'ready') return go(`▶️ Start oefenbeurt: jij tekent "${step.word}"`, () => { s.status = 'drawing'; s.strokes = []; }, 'Teken in de bediening; de tekening verschijnt live op de tv. Iedereen raadt hardop.');
      if (s.status === 'drawing') return go('✅ Onthul het woord', () => { s.status = 'result'; });
      return go('Volgende ▶️', next);
    case 'demo_thirty':
      if (s.status === 'ready') return go('▶️ Start oefenbeurt (jij legt uit, 30 s)', () => { s.status = 'running'; timerStart((step.seconds || settings.thirtySeconds) * 1000, 'demo'); }, 'Leg de vijf woorden uit; tik goede antwoorden meteen aan.');
      if (s.status === 'running') return go('⏹️ Stop', () => { timerClear(); s.status = 'result'; });
      return go('Volgende ▶️', next);
    case 'teamphoto': {
      const w = activeTeams().filter((t) => !hasAnswered(t, step)).map((t) => t.name);
      return w.length ? none('📸 Teams maken hun teamfoto…', `Wacht nog op: ${w.join(', ')}`) : go('Volgende ▶️', next);
    }
    case 'joker': {
      const w = activeTeams().filter((t) => !hasAnswered(t, step)).map((t) => t.name);
      return w.length ? none('⏳ Teams kiezen hun joker…', `Wacht nog op: ${w.join(', ')}`) : go('Volgende ▶️', next);
    }
    case 'final':
      if (s.status === 'wager') {
        const w = activeTeams().filter((t) => s.wagers[t.teamId] === undefined).map((t) => t.name);
        return w.length ? none('⏳ Teams zetten in…', `Wacht nog op: ${w.join(', ')}`) : go('❓ Toon de vraag', () => { s.status = 'question'; });
      }
      if (s.status === 'question') return none('⏳ Wachten op antwoorden…', wait());
      if (s.status === 'closed') return go('🎯 Toon het antwoord', () => { s.status = 'revealed'; });
      return go('🏁 Verder', next);
    case 'tiebreak':
      if (s.status === 'open') return none('⏳ Gelijke teams schatten…', wait());
      if (s.status === 'closed') return go('🎯 Toon het antwoord', () => { s.winners = tiebreakWinners(step); s.status = 'revealed'; });
      return go('🏁 Verder', next);
  }
  return none('…');
}

// Knoppen die alleen bij sommige stappen horen
function forceAction() {
  const step = cur();
  if (!step) return null;
  const s = ss(step);
  if (step.kind === 'song' && s.status === 'loading') return { label: '⏭️ Dit liedje overslaan', run: next };
  if (['mc', 'price', 'song', 'logo'].includes(step.kind) && s.status === 'open') return { label: '⏭️ Toch afsluiten zonder te wachten', run: () => closeStep(step) };
  if (step.kind === 'joker' || step.kind === 'teamphoto') return { label: '⏭️ Toch doorgaan', run: next };
  if (step.kind === 'draw' && s.status === 'drawing') return { label: '⏭️ Beurt toch stoppen (niet iedereen heeft ingediend)', run: () => endDrawTurn(step) };
  if (step.kind === 'final' && s.status === 'wager') return { label: '⏭️ Toch de vraag tonen', run: () => { s.status = 'question'; } };
  if (step.kind === 'final' && s.status === 'question') return { label: '⏭️ Toch afsluiten', run: () => closeStep(step) };
  if (step.kind === 'tiebreak' && s.status === 'open') return { label: '⏭️ Toch afsluiten', run: () => closeStep(step) };
  return null;
}

function broadcastState() {
  const step = cur();
  const pages = review ? reviewPages(review.scope) : null;
  if (review && pages) review.page = Math.min(Math.max(review.page, 0), Math.max(0, pages.length - 1));
  const reviewPayload = review ? { scope: review.scope, page: review.page, total: pages.length, data: pages[review.page] || null } : null;
  const round = step && roundById[step.round];

  const common = {
    phase, paused, showStandings, review: reviewPayload,
    header: {
      round: round ? `Ronde ${round.no}: ${round.title}` : step && step.round === 'test' ? 'Testronde' : step && step.kind === 'joker' ? 'Joker' : step && step.kind === 'teamphoto' ? 'Teamfoto' : step && step.kind === 'final' ? 'Slotvraag' : step && step.kind === 'tiebreak' ? 'Beslissingsvraag' : 'Familiequiz',
      progress: progressOf(step), points: round && step.kind !== 'info' && step.kind !== 'roundresult' && !step.test ? roundPoints(round) : null
    },
    standings: phase === 'END' ? ranking() : null,
    alerts: Object.values(alerts),
    theme: settings.theme, lobbyStage, welcome: content.welcome, texts: content.texts,
    end: phase === 'END' ? { reveal, revealN, endView, scores: reveal !== 'idle' ? ranking() : null, breakdown: reveal === 'done' ? breakdown() : null } : null
  };

  io.to('tv_room').emit('state_update', {
    ...common,
    step: step ? publicStep(step) : null,
    teamList: Object.values(teams).map((t) => ({ name: t.name, photo: photoUrl(t.teamId), connected: teamConnected(t), members: teamDevices(t).length })).sort(byName),
    maxTeams: settings.maxTeams
  });

  const main = mainAction();
  const force = forceAction();
  io.to('remote_room').emit('state_update', {
    ...common,
    step: step ? publicStep(step) : null,
    panel: step ? hostPanel(step) : null,
    controls: { main: { label: main.label, enabled: main.enabled, hint: main.hint }, force: force ? { label: force.label } : null, undo: { enabled: undoHistory.length > 0, label: undoHistory.length ? `↶ Ongedaan maken: ${undoHistory[undoHistory.length - 1].label}` : '↶ Niets om ongedaan te maken' } },
    teams: Object.values(teams).map((t) => ({
      teamId: t.teamId, name: t.name, bot: !!t.bot, photo: photoUrl(t.teamId), connected: teamConnected(t), joker: t.jokerRound ? roundById[t.jokerRound].title : null, score: scoreOf(t),
      members: teamDevices(t).map((d) => ({ deviceId: d.deviceId, label: d.label, role: d.deviceId === t.baseDeviceId ? 'base' : 'member', connected: d.connected }))
    })).sort(byName),
    rounds: rounds.map((r) => ({ id: r.id, no: r.no, title: r.title, introId: `${r.id}_intro` })),
    settings, settingsLocked: phase !== 'LOBBY',
    stepNo: stepIndex + 1, stepTotal: steps.length,
    warnings: content.warnings,
    quiz: { ...quizSource, steps: steps.length, rounds: rounds.length },
    plan: planView(), extraOptions: extraOptions(), themes: THEMES,
    hostScores: phase !== 'LOBBY' ? breakdown() : null, // alleen voor de quizmasters
    history: historyEntries // alleen in de beveiligde bediening; nooit naar tv of spelers
  });

  Object.values(devices).forEach((d) => {
    if (!d.connected || !d.socketId) return;
    const t = teams[d.teamId];
    if (!t) return;
    const isBase = t.baseDeviceId === d.deviceId;
    io.to(d.socketId).emit('state_update', {
      phase, paused, showStandings: false, reviewing: !!review, theme: settings.theme, texts: content.texts,
      standings: null,
      roundName: common.header.round,
      timer: null,
      view: phase === 'PLAY' ? phoneView(step, t, d, isBase) : phase === 'END' ? { type: 'end' } : { type: 'lobby' },
      me: {
        memberId: d.memberId, teamId: t.teamId, teamName: t.name, photo: photoUrl(t.teamId), label: d.label, role: isBase ? 'base' : 'member',
        baseLabel: devices[t.baseDeviceId] ? devices[t.baseDeviceId].label : '', proposal: proposalFor(t, d),
        members: teamDevices(t).map((m) => ({ memberId: m.memberId, label: m.label, role: m.deviceId === t.baseDeviceId ? 'base' : 'member', connected: m.connected }))
      }
    });
  });
  scheduleSave();
}

function phoneView(step, team, device, isBase) {
  const s = ss(step);
  const id = team.teamId;
  const base = { type: step.kind, id: step.id, isBase, cheat: cheatSensitive(step) };
  switch (step.kind) {
    case 'info':
      return { ...base, emoji: step.emoji, title: step.title, text: step.text };
    case 'mc': {
      const a = s.answers[id];
      return {
        ...base, variant: step.variant, test: step.test, category: step.category, question: step.question, options: step.options,
        media: step.variant === 'text' ? step.media : null, status: s.status, answered: !!a, given: a ? a.v : null,
        timer: s.status === 'open' ? timerInfo('mc') : null
      };
    }
    case 'memory':
      return { ...base, status: s.status, test: !!step.test, prompt: step.prompt, entries: (s.entries[id] || []).map((e) => ({ id: e.id, text: e.text, by: e.by })) };
    case 'song': {
      if (s.status === 'loading') return { ...base, status: 'loading', timeline: [], placed: null, target: settings.hitsterTarget };
      const tl = ensureTimeline(team, step.round).map((sid) => ({ id: sid, year: songs[sid].year, title: songs[sid].title, artist: songs[sid].artist }));
      const r = s.results && s.results[id];
      return { ...base, test: !!step.test, status: s.status, timeline: tl, placed: s.placements[id] !== undefined ? s.placements[id] : null, yearGuess: s.years[id] ?? null, result: r ? { ok: r.ok, exact: r.exact, yearGuess: r.yearGuess } : null,
        target: settings.hitsterTarget,
        song: s.status === 'revealed' ? (({ title, artist, year }) => ({ title, artist, year }))(songOf(step)) : null };
    }
    case 'price': {
      const a = s.answers[id];
      return { ...base, test: !!step.test, status: s.status, name: step.name, unit: step.unit, emoji: step.emoji, agoYears: step.agoYears, answered: !!a, given: a || null };
    }
    case 'draw': {
      const turn = s.turns[s.turn];
      // drawer = tekent, guesser = basistelefoon (geeft het antwoord), watcher = kijkt mee
      let role = 'idle';
      if (turn && turn.drawers[id]) role = turn.drawers[id] === device.deviceId ? 'drawer' : turn.answerers[id] === device.deviceId ? 'guesser' : 'watcher';
      const a = turn && turn.answers[id];
      return {
        ...base, status: s.status, role, answered: !!a, given: a ? a.text : null, turn: s.turn + 1, total: s.total || 0,
        answererLabel: turn && devices[turn.answerers[id]] ? devices[turn.answerers[id]].label : null,
        word: role === 'drawer' && turn ? turn.words[id].word : null,
        drawerLabel: turn && turn.drawers[id] && devices[turn.drawers[id]] ? devices[turn.drawers[id]].label : null,
        answerWord: (s.status === 'judging' || s.status === 'result') && turn && turn.words[id] ? turn.words[id].word : null
      };
    }
    case 'demo_draw':
    case 'demo_thirty':
      return { ...base, status: s.status };
    case 'logo': {
      const a = s.answers[id];
      return { ...base, variant: step.variant, test: !!step.test, question: step.question, status: s.status, answered: !!a, given: a ? a.text : null };
    }
    case 'thirty': {
      const o = s.order && s.order[s.turn];
      const turn = s.turns[s.turn];
      let role = 'other';
      if (o && o.teamId === id) role = o.deviceId === device.deviceId ? 'explainer' : 'teammate';
      return {
        ...base, status: s.status, role, turn: s.turn + 1, total: s.order ? s.order.length : 0, timer: timerInfo('thirty'),
        team: o && teams[o.teamId] ? teams[o.teamId].name : null, explainer: o && devices[o.deviceId] ? devices[o.deviceId].label : null,
        words: role === 'explainer' && turn && (s.status === 'running' || s.status === 'judging') ? turn.words : null
      };
    }
    case 'teamphoto':
      return { ...base, photo: photoUrl(id), skipped: !!s.skipped[id] };
    case 'joker':
      return { ...base, rounds: rounds.map((r) => ({ id: r.id, title: `Ronde ${r.no}: ${r.title}` })), chosen: team.jokerRound, submitted: s.choices[id] !== undefined };
    case 'final': {
      const a = s.answers[id];
      return {
        ...base, status: s.status, category: step.category, maxWager: settings.finalMaxWager, wager: s.wagers[id] ?? null,
        question: s.status !== 'wager' ? step.question : null, options: s.status !== 'wager' ? step.options : null,
        answered: a !== undefined, given: a !== undefined ? a : null
      };
    }
    case 'tiebreak': {
      const a = s.answers[id];
      return { ...base, status: s.status, question: step.question, unit: step.unit, inGame: (s.teams || []).includes(id), answered: a !== undefined, given: a !== undefined ? a : null };
    }
  }
  return base;
}

function proposalFor(team, device) {
  const p = team.proposal;
  const candidate = p && devices[p.candidateId];
  if (!candidate) return null;
  const proposer = devices[p.proposerId];
  const need = connectedDevices(team);
  return {
    candidateMemberId: candidate.memberId, candidateLabel: candidate.label, proposerLabel: proposer ? proposer.label : '',
    youApproved: p.approvals.includes(device.deviceId), youAreProposer: p.proposerId === device.deviceId, youAreCandidate: candidate.deviceId === device.deviceId,
    approved: need.filter((x) => p.approvals.includes(x.deviceId)).length, needed: need.length
  };
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
  settle();
  broadcastState();
  scheduleBots();
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
    delete alerts[d.deviceId];
    delete devices[d.deviceId];
  }
  Object.values(ssAll).forEach((s) => {
    ['answers', 'placements', 'entries', 'wagers', 'choices'].forEach((k) => { if (s[k]) delete s[k][teamId]; });
  });
  if (teamPhotos[teamId]) setTeamPhoto(teamId, null);
  delete teams[teamId];
}

// Alleen de basistelefoon mag antwoorden doorgeven
function baseContext(socket, kind) {
  const device = deviceOf(socket);
  const team = device && teams[device.teamId];
  const step = cur();
  if (!team || !step || step.kind !== kind || paused) return null;
  return { device, team, step, s: ss(step), isBase: team.baseDeviceId === device.deviceId };
}

const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

io.on('connection', onConnection);
function onConnection(socket) {
  // ---------- Schermen registreren ----------
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
    const n = Object.keys(teams).length;
    const started = phase !== 'LOBBY';
    cb({ teams: Object.values(teams).filter((t) => !t.bot).map((t) => ({ teamId: t.teamId, name: t.name, members: teamDevices(t).length })).sort(byName), maxTeams: settings.maxTeams, started, full: started || (!!settings.maxTeams && n >= settings.maxTeams) });
  });
  socket.on('create_team', ({ teamName, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (phase === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    if (phase !== 'LOBBY') return reply({ ok: false, message: 'De quiz is al begonnen: er kunnen geen nieuwe teams meer bij. Sluit aan bij een bestaand team.' });
    const myName = cleanText(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const name = cleanText(teamName, MAX_TEAM_NAME);
    if (!name) return reply({ ok: false, message: 'Vul een teamnaam in.' });
    if (findTeamByName(name)) return reply({ ok: false, message: `De teamnaam "${name}" is al in gebruik.` });
    if (!settings.maxTeams) return reply({ ok: false, message: 'De quizmaster heeft het aantal teams nog niet ingesteld. Even geduld!' });
    if (Object.keys(teams).length >= settings.maxTeams) return reply({ ok: false, message: `Er doen al ${settings.maxTeams} teams mee (het maximum). Sluit aan bij een bestaand team.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: null, label: myName, seq: ++seq, socketId: null, connected: false };
    const team = { teamId: newId('t_'), name, seq: ++seq, baseDeviceId: device.deviceId, jokerRound: null, timelines: {}, proposal: null };
    device.teamId = team.teamId;
    teams[team.teamId] = team;
    devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });
  socket.on('join_team', ({ teamId, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (phase === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    const myName = cleanText(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const team = teams[teamId];
    if (!team) return reply({ ok: false, message: 'Dat team bestaat niet meer.' });
    if (teamDevices(team).length >= MAX_DEVICES_PER_TEAM) return reply({ ok: false, message: 'Dit team zit vol.' });
    if (labelTaken(team, myName)) return reply({ ok: false, message: `In dit team zit al iemand die ${myName} heet. Voeg bijvoorbeeld een letter toe.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: team.teamId, label: myName, seq: ++seq, socketId: null, connected: false };
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
    if (!candidate || !candidate.connected) return reply({ ok: false, message: 'Die telefoon is niet verbonden.' });
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
    if (approve) { if (!p.approvals.includes(device.deviceId)) p.approvals.push(device.deviceId); }
    else {
      team.proposal = null;
      const base = devices[team.baseDeviceId];
      notifyTeam(team, p.proposerId === device.deviceId ? `${device.label} heeft het voorstel ingetrokken.` : `${device.label} is niet akkoord. De basistelefoon blijft ${base ? base.label : 'zoals hij was'}.`);
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
    delete alerts[device.deviceId];
    delete devices[device.deviceId];
    socket.data.deviceId = null;
    reply({ ok: true });
    sync();
  });

  // ---------- Antwoorden: meerkeuze, foto's en logo's ----------
  socket.on('submit_answer', ({ stepId, value } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const step = cur();
    if (step && step.kind === 'final') return submitFinalAnswer(socket, stepId, value, reply);
    if (step && step.kind === 'tiebreak') return submitTiebreak(socket, value, reply);
    const c = baseContext(socket, 'mc');
    if (!c || c.s.status !== 'open') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    if (stepId !== c.step.id) return reply({ ok: false, reason: 'wrong_question' });
    if (!Number.isInteger(value) || value < 0 || value >= c.step.options.length) return reply({ ok: false, reason: 'invalid' });
    if (c.s.answers[c.team.teamId]) return reply({ ok: true, already: true });
    c.s.answers[c.team.teamId] = { v: value, step: c.s.blurStep, t: Date.now() };
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
    reply({ ok: true });
    sync();
  });

  // ---------- Muziek: kaart in de tijdlijn leggen ----------
  socket.on('place_card', ({ stepId, slot, year } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'song');
    if (!c || c.s.status !== 'open') return reply({ ok: false, reason: 'not_open' });
    if (!c.isBase) return reply({ ok: false, reason: 'not_base' });
    const tl = ensureTimeline(c.team, c.step.round);
    if (stepId !== c.step.id || !Number.isInteger(slot) || slot < 0 || slot > tl.length) return reply({ ok: false, reason: 'invalid' });
    if (c.s.placements[c.team.teamId] !== undefined) return reply({ ok: true, already: true });
    c.s.placements[c.team.teamId] = slot;
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) c.s.years[c.team.teamId] = year;
    reply({ ok: true });
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
  const cleanOp = (op) => {
    if (!op || typeof op !== 'object') return null;
    if (op.t === 'u' || op.t === 'x') return { t: op.t };
    if (op.t !== 'p' || typeof op.id !== 'string' || op.id.length > 20 || !Array.isArray(op.p)) return null;
    const pts = op.p.slice(0, 200).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [Math.min(1000, Math.max(0, Math.round(p[0]))), Math.min(1000, Math.max(0, Math.round(p[1])))]);
    if (!pts.length) return null;
    return { t: 'p', id: op.id, c: /^#[0-9a-f]{6}$/i.test(op.c) ? op.c : '#000000', w: num(op.w, 1, 40) ? Math.round(op.w) : 4, p: pts };
  };
  function applyOp(strokes, op) {
    if (op.t === 'x') strokes.length = 0;
    else if (op.t === 'u') strokes.pop();
    else {
      let st = strokes.find((x) => x.id === op.id);
      if (!st) { if (strokes.length >= 300) return; st = { id: op.id, c: op.c, w: op.w, p: [] }; strokes.push(st); }
      if (st.p.length < 4000) st.p.push(...op.p);
    }
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
    scheduleSave();
  });
  // Nieuwe of herstelde telefoon vraagt de hele tekening op
  socket.on('draw_get', (_, cb) => {
    if (typeof cb !== 'function') return;
    const device = deviceOf(socket);
    const step = cur();
    const team = device && teams[device.teamId];
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
    c.s.judged[c.team.teamId] = logoMatches(c.step, clean); // voorstel; de quizmaster beslist
    reply({ ok: true });
    sync();
  });

  // ---------- Joker en slotvraag ----------
  socket.on('joker_choose', ({ roundId } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'joker');
    if (!c || !c.isBase) return reply({ ok: false });
    if (!roundById[roundId]) return reply({ ok: false });
    c.team.jokerRound = roundId;
    c.s.choices[c.team.teamId] = roundId;
    reply({ ok: true });
    sync();
  });
  socket.on('final_wager', ({ amount } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const c = baseContext(socket, 'final');
    if (!c || !c.isBase || c.s.status !== 'wager') return reply({ ok: false });
    const max = settings.finalMaxWager;
    if (!Number.isInteger(amount) || amount < 0 || amount > max) return reply({ ok: false, message: `Je kunt tussen 0 en ${max} punten inzetten.` });
    c.s.wagers[c.team.teamId] = amount;
    reply({ ok: true });
    sync();
  });

  // ---------- Anti-spiek: de melding blijft staan tot de speler terug is ----------
  socket.on('player_blurred', ({ reason, t } = {}) => {
    const step = cur();
    if (!step || !cheatSensitive(step) || paused) return;
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return;
    if (Number.isFinite(t) && device.lastBackT && t < device.lastBackT) return; // te laat aangekomen bericht
    alerts[device.deviceId] = {
      key: device.deviceId, teamName: team.name, label: device.label,
      reason: 'away',
      timestamp: new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' })
    };
    io.to('remote_room').emit('cheat_beep', alerts[device.deviceId]);
    broadcastState();
  });
  socket.on('player_back', ({ t } = {}) => {
    const device = deviceOf(socket);
    if (!device) return;
    if (Number.isFinite(t)) device.lastBackT = t;
    if (alerts[device.deviceId]) { delete alerts[device.deviceId]; broadcastState(); }
  });

  // ---------- Bediening: spelverloop ----------
  socket.on('host_main', () => {
    if (!isRemote(socket)) return;
    if (review) return;
    const a = mainAction();
    if (!a.enabled || !a.run) return socket.emit('host_error', { message: a.hint || 'Dat kan nu nog niet.' });
    a.run();
    sync();
  });
  socket.on('host_force', () => {
    if (!isRemote(socket)) return;
    const f = forceAction();
    if (!f) return;
    f.run();
    sync();
  });
  socket.on('toggle_pause', () => {
    if (!isRemote(socket) || phase !== 'PLAY') return;
    paused = !paused;
    if (paused) timerStop(); else timerRun();
    io.emit(paused ? 'paused' : 'resumed');
    sync();
  });
  socket.on('toggle_standings', () => {
    if (!isRemote(socket) || phase !== 'END') return;
    showStandings = !showStandings;
    sync();
  });
  socket.on('goto_step', ({ stepId } = {}) => {
    if (!isRemote(socket) || phase === 'LOBBY') return;
    const i = steps.findIndex((s) => s.id === stepId);
    if (i < 0) return;
    phase = 'PLAY';
    stepIndex = i;
    enterStep();
    sync();
  });
  socket.on('skip_step', () => {
    if (!isRemote(socket) || phase !== 'PLAY') return;
    next();
    sync();
  });
  socket.on('prev_step', () => {
    if (!isRemote(socket) || phase !== 'PLAY' || stepIndex === 0) return;
    stepIndex--;
    enterStep();
    sync();
  });

  // ---------- Bediening: nakijken en einduitslag ----------
  socket.on('review_open', () => {
    if (!isRemote(socket) || phase !== 'END') return;
    review = { scope: 'all', page: 0 };
    sync();
  });
  socket.on('review_nav', ({ dir } = {}) => {
    if (!isRemote(socket) || !review) return;
    review.page += dir > 0 ? 1 : -1;
    sync();
  });
  socket.on('review_close', () => {
    if (!isRemote(socket)) return;
    review = null;
    sync();
  });
  socket.on('end_view', ({ view } = {}) => {
    if (!isRemote(socket) || phase !== 'END') return;
    endView = view === 'breakdown' ? 'breakdown' : 'ranking';
    sync();
  });
  socket.on('reveal_done', () => {
    if ((!isRemote(socket) && socket.data.role !== 'tv') || reveal !== 'running') return;
    reveal = 'done';
    sync();
  });

  // ---------- Bediening: per ronde ----------
  socket.on('blur_next', ({ all } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || !((step.kind === 'mc' || step.kind === 'logo') && step.variant === 'blur')) return;
    const s = ss(step);
    if (s.status !== 'open') return;
    s.blurStep = all ? settings.blurPoints.length - 1 : Math.min(settings.blurPoints.length - 1, s.blurStep + 1);
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
    const step = steps.find((x) => x.id === stepId);
    if (!step || !step.dynamic) return reply({ ok: false, reason: 'invalid_step' });
    const s = ss(step);
    if (s.songId) return reply({ ok: true, already: true });
    const t = cleanTrack(track);
    if (!t) return reply({ ok: false, reason: 'invalid_track' });
    if (usedSongKeys().includes(`${t.title}|${t.artist}`.toLowerCase())) return reply({ ok: false, reason: 'duplicate' });
    s.songId = `${step.id}_t`;
    addDynSong(s.songId, t);
    if (s.status === 'loading' && dynamicStartReady(step.round)) { s.status = 'open'; Object.values(teams).forEach((tm) => ensureTimeline(tm, step.round)); }
    reply({ ok: true });
    sync();
  });
  socket.on('provide_start', ({ roundId, tracks } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket) || !roundById[roundId] || !roundById[roundId].dynamic || !Array.isArray(tracks)) return reply({ ok: false, reason: 'invalid_round' });
    const round = roundById[roundId];
    const need = Math.max(0, (round.startCards || 2) - dynamicStartIds(roundId).length);
    if (!need) return reply({ ok: true, already: true, accepted: 0 });
    const used = new Set(usedSongKeys());
    const clean = tracks.map(cleanTrack).filter(Boolean).filter((track) => {
      const key = `${track.title}|${track.artist}`.toLowerCase();
      if (used.has(key)) return false;
      used.add(key);
      return true;
    }).slice(0, need);
    const current = dynStart[roundId] || [];
    const ids = clean.map((track, i) => { const id = `${roundId}_online_start${current.length + i + 1}`; addDynSong(id, track); return id; });
    dynStart[roundId] = [...current, ...ids];
    const step = cur();
    if (step && step.kind === 'song' && step.round === roundId) {
      const state = ss(step);
      Object.values(teams).forEach((team) => ensureTimeline(team, roundId));
      if (state.status === 'loading' && state.songId && dynamicStartReady(roundId)) state.status = 'open';
    }
    reply({ ok: ids.length > 0, accepted: ids.length, remaining: Math.max(0, need - ids.length), reason: ids.length ? null : 'no_unique_tracks' });
    sync();
  });
  // Vaste teamfoto: de basistelefoon kan hem op elk moment instellen, vervangen of weghalen
  socket.on('set_team_photo', ({ dataUrl } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && teams[device.teamId];
    if (!team) return reply({ ok: false, message: 'Je zit niet (meer) in een team.' });
    if (team.baseDeviceId !== device.deviceId) return reply({ ok: false, message: 'Alleen de basistelefoon kan de teamfoto aanpassen.' });
    if (dataUrl !== null && !validPhoto(dataUrl)) return reply({ ok: false, message: 'De foto is ongeldig of te groot. Kies een kleinere foto.' });
    setTeamPhoto(team.teamId, dataUrl);
    reply({ ok: true });
    sync();
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
    if (!isRemote(socket) || !teams[teamId]) return;
    setTeamPhoto(teamId, null);
    sync();
  });
  socket.on('song_replay', () => {
    if (!isRemote(socket)) return;
    io.to('tv_room').emit('play_audio');
  });
  socket.on('song_pause', () => {
    if (!isRemote(socket)) return;
    io.to('tv_room').emit('pause_audio');
  });
  socket.on('memory_judge', ({ teamId, entryId, ok } = {}) => {
    if (!isRemote(socket)) return;
    const step = cur();
    if (!step || step.kind !== 'memory') return;
    const e = (ss(step).entries[teamId] || []).find((x) => x.id === entryId);
    if (e && e.ok !== !!ok) {
      pushUndo(undoHistory, { type: 'memory_judge', stepId: step.id, teamId, entryId, before: e.ok, label: 'beoordeling geheugen' }, UNDO_LIMIT);
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
      pushUndo(undoHistory, { type: 'thirty_toggle', stepId: step.id, index, before: s.ok[index], demo: true, label: 'oefenronde 30 Seconds' }, UNDO_LIMIT);
      s.ok[index] = !s.ok[index];
      return sync();
    }
    if (step.kind !== 'thirty') return;
    const turn = s.turns[s.turn];
    if (!turn || !['running', 'judging', 'result'].includes(s.status)) return;
    pushUndo(undoHistory, { type: 'thirty_toggle', stepId: step.id, index, before: turn.ok[index], demo: false, turnIndex: s.turn, label: '30 Seconds-beoordeling' }, UNDO_LIMIT);
    turn.ok[index] = !turn.ok[index];
    sync();
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
      pushUndo(undoHistory, { type: 'draw_judge', stepId: step.id, teamId, turnIndex: s.turn, before: turn.ok[teamId], label: 'tekenantwoord' }, UNDO_LIMIT);
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
      pushUndo(undoHistory, { type: 'logo_judge', stepId: step.id, teamId, beforePresent: Object.prototype.hasOwnProperty.call(s.judged, teamId), before: s.judged[teamId], label: 'logo-beoordeling' }, UNDO_LIMIT);
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
    if (wasRunning && !paused) timerRun();
    sync();
  });

  // ---------- Bediening: noodknoppen ----------
  socket.on('set_max_teams', ({ n } = {}) => {
    if (!isRemote(socket) || phase === 'END') return;
    if (!Number.isInteger(n) || n < 1 || n > 50) return socket.emit('host_error', { message: 'Kies een aantal tussen 1 en 50.' });
    settings.maxTeams = n;
    sync();
  });
  socket.on('set_theme', ({ theme } = {}) => {
    if (!isRemote(socket) || !THEMES.includes(theme)) return;
    settings.theme = theme;
    sync();
  });
  socket.on('set_plan', ({ plan } = {}) => {
    if (!isRemote(socket)) return;
    if (phase !== 'LOBBY') return socket.emit('host_error', { message: 'De volgorde kan alleen vóór de start worden aangepast. Een extra ronde toevoegen kan wel.' });
    const clean = sanitizeSettings({ roundPlan: plan }, settings).roundPlan || [];
    replan(clean);
    sync();
  });
  socket.on('add_extra', ({ base, category } = {}) => {
    if (!isRemote(socket)) return;
    if (phase === 'END') return socket.emit('host_error', { message: 'De quiz is al afgelopen.' });
    const b = ((baseRaw && baseRaw.rounds) || []).find((r) => r.id === base);
    if (!b || !EXTRA_TYPES.includes(b.type)) return;
    const order = planOrder();
    let n = 1;
    while (order.some((p) => p.id === `${base}x${n}`)) n++;
    const entry = { id: `${base}x${n}`, base, on: true, category: b.type === 'hitster' ? (HITSTER_CATS[category] ? category : 'original') : undefined };
    // Tijdens de quiz komt de extra ronde direct na de huidige ronde; anders achteraan
    let pos = order.length;
    if (phase === 'PLAY' && cur()) { const k = order.findIndex((p) => p.id === cur().round); if (k >= 0) pos = k + 1; }
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
    if (!isRemote(socket) || phase !== 'LOBBY') return;
    lobbyStage = stage === 'join' ? 'join' : 'welcome';
    sync();
  });
  socket.on('update_settings', (partial) => {
    if (!isRemote(socket)) return;
    if (phase !== 'LOBBY') return socket.emit('host_error', { message: 'Instellingen kunnen alleen vóór de start worden gewijzigd.' });
    settings = sanitizeSettings(partial, settings);
    sync();
  });
  // Vragenlijst opnieuw inlezen of een nieuw Excel-bestand uploaden (alleen voor de start)
  socket.on('reload_quiz', () => {
    if (!isRemote(socket)) return;
    if (phase !== 'LOBBY') return socket.emit('host_error', { message: 'De vragen kunnen alleen vóór de start opnieuw worden ingelezen.' });
    loadQuiz();
    ssAll = {};
    undoHistory = [];
    Object.values(teams).forEach((t) => { t.timelines = {}; });
    sync();
  });
  socket.on('upload_xlsx', (data, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!isRemote(socket)) return reply({ ok: false, message: 'Geen toegang.' });
    if (phase !== 'LOBBY') return reply({ ok: false, message: 'Uploaden kan alleen vóór de start.' });
    let buf;
    try { buf = Buffer.isBuffer(data) ? data : Buffer.from(data); } catch (e) { return reply({ ok: false, message: 'Ongeldig bestand.' }); }
    if (!buf.length || buf.length > 5e6) return reply({ ok: false, message: 'Het bestand is leeg of te groot (max 5 MB).' });
    try {
      fromExcel(buf, JSON_BASE);
    } catch (e) {
      return reply({ ok: false, message: `Dit is geen leesbaar .xlsx-bestand (${e.message}).` });
    }
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(XLSX_UPLOAD, buf);
    } catch (e) { return reply({ ok: false, message: 'Opslaan mislukte: ' + e.message }); }
    loadQuiz();
    ssAll = {};
    Object.values(teams).forEach((t) => { t.timelines = {}; });
    reply({ ok: true, warnings: content.warnings.length });
    sync();
  });
  socket.on('clear_answer', ({ teamId } = {}) => {
    if (!isRemote(socket)) return;
    const team = teams[teamId];
    const step = cur();
    if (!team || !step || !['mc', 'price', 'final', 'tiebreak', 'logo'].includes(step.kind)) return;
    const s = ss(step);
    const allowed = step.kind === 'final' || step.kind === 'tiebreak'
      ? s.status === 'question' || s.status === 'open'
      : s.status === 'open' || (step.kind === 'mc' && s.status === 'closed');
    if (allowed && (Object.prototype.hasOwnProperty.call(s.answers || {}, teamId) || Object.prototype.hasOwnProperty.call(s.judged || {}, teamId))) {
      pushUndo(undoHistory, { type: 'clear_answer', stepId: step.id, teamId,
        answerPresent: Object.prototype.hasOwnProperty.call(s.answers || {}, teamId), answer: s.answers && s.answers[teamId],
        judgedPresent: Object.prototype.hasOwnProperty.call(s.judged || {}, teamId), judged: s.judged && s.judged[teamId],
        status: s.status, label: `antwoord van ${teams[teamId] ? teams[teamId].name : 'team'} herstellen` }, UNDO_LIMIT);
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
      if (s.voided !== mode) { pushUndo(undoHistory, { type: 'void_question', stepId: step.id, before: s.voided ?? null, label: 'vraagbeoordeling' }, UNDO_LIMIT); s.voided = mode; }
    } else if (mode === null) {
      if (s.voided !== null) { pushUndo(undoHistory, { type: 'void_question', stepId: step.id, before: s.voided ?? null, label: 'vraagbeoordeling' }, UNDO_LIMIT); s.voided = null; }
    } else return;
    sync();
  });
  socket.on('undo_last', () => {
    if (!isRemote(socket)) return;
    const entry = undoHistory[undoHistory.length - 1];
    if (!entry) return socket.emit('host_error', { message: 'Er is niets om ongedaan te maken.' });
    if (!applyUndoEntry(entry, steps, ssAll)) return socket.emit('host_error', { message: 'Deze correctie kan niet meer worden teruggedraaid.' });
    undoHistory.pop();
    sync();
  });
  socket.on('alert_dismiss', ({ key } = {}) => {
    if (!isRemote(socket)) return;
    if (key === 'all') alerts = {}; else delete alerts[key];
    sync();
  });
  socket.on('rename_team', ({ teamId, name } = {}) => {
    if (!isRemote(socket)) return;
    const team = teams[teamId];
    const clean = cleanText(name, MAX_TEAM_NAME);
    if (!team || !clean) return;
    if (findTeamByName(clean, teamId)) return socket.emit('host_error', { message: `De teamnaam "${clean}" is al in gebruik.` });
    team.name = clean;
    sync();
  });
  socket.on('rename_player', ({ deviceId, name } = {}) => {
    if (!isRemote(socket)) return;
    const device = devices[deviceId];
    const team = device && teams[device.teamId];
    const clean = cleanText(name, MAX_LABEL);
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
    from.proposal = null;
    to.proposal = null;
    if (wasBase) {
      const rest = teamDevices(from);
      const nextBase = rest.find((d) => d.connected) || rest[0];
      from.baseDeviceId = nextBase.deviceId;
      notifyTeam(from, `${device.label} is verplaatst. ${nextBase.label} is nu de basistelefoon.`);
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
    phase = 'LOBBY'; stepIndex = 0; paused = false; showStandings = false; review = null; reveal = 'idle'; revealN = 0; lobbyStage = 'welcome'; endView = 'ranking';
    ssAll = {}; teams = {}; devices = {}; alerts = {}; dynSongs = {}; dynStart = {}; teamPhotos = {}; Object.keys(botSockets).forEach((k) => delete botSockets[k]); undoHistory = []; gameId = null;
    timerClear();
    // Een reset is bewust definitief: voorkom dat een oude reservekopie de vorige quiz terugzet.
    try { removeStateFiles(STATE_FILE); removeStateFiles(PHOTOS_FILE); } catch (e) { console.error('Opschonen van quizopslag mislukt:', e.message); }
    io.emit('quiz_reset');
    broadcastState();
  });

  socket.on('disconnect', () => {
    const device = devices[socket.data.deviceId];
    if (device && device.socketId === socket.id) {
      device.connected = false;
      sync();
    }
  });
  // Instelling die altijd mag wijzigen: tussenstand na elke ronde op de tv
  socket.on('set_round_totals', ({ on } = {}) => {
    if (!isRemote(socket)) return;
    settings.showRoundTotals = !!on;
    sync();
  });
  // Testteams (robots) om de quiz te oefenen zonder echte telefoons
  socket.on('add_bots', ({ n } = {}) => {
    if (!isRemote(socket)) return;
    if (phase !== 'LOBBY') return socket.emit('host_error', { message: 'Testteams kun je alleen vóór de start toevoegen.' });
    addBots(Number.isInteger(n) ? Math.min(Math.max(n, 1), 6) : 3);
    sync();
  });
  socket.on('remove_bots', () => {
    if (!isRemote(socket)) return;
    Object.values(teams).filter((t) => t.bot).forEach((t) => removeTeam(t.teamId));
    sync();
  });
}

// ---------------------------------------------------------------
// Testteams: robots die zelf (willekeurig, soms goed) antwoorden.
// Ze gebruiken precies dezelfde routes als echte telefoons, dus de hele quiz is zo te oefenen.
// ---------------------------------------------------------------
const BOT_NAMES = ['Robot Appel', 'Robot Peer', 'Robot Kiwi', 'Robot Banaan', 'Robot Mango', 'Robot Citroen'];
const botSockets = {};
function botSocket(deviceId) {
  if (botSockets[deviceId]) return botSockets[deviceId];
  const h = {};
  const s = { id: `bot_${deviceId}`, data: { deviceId }, handshake: { address: 'bot', headers: {} }, conn: { remoteAddress: 'bot' }, on: (e, f) => { h[e] = f; }, emit() {}, join() {}, leave() {}, disconnect() {} };
  onConnection(s);
  return (botSockets[deviceId] = { s, h });
}
function addBots(n) {
  for (let i = 0; i < n; i++) {
    const name = '🤖 ' + (BOT_NAMES.find((b) => !findTeamByName('🤖 ' + b)) || `Robot ${Object.keys(teams).length + 1}`);
    const team = { teamId: newId('t_'), name, seq: ++seq, baseDeviceId: null, jokerRound: null, timelines: {}, proposal: null, bot: true };
    teams[team.teamId] = team;
    for (let k = 0; k < 2; k++) { // twee "spelers", zodat tekenen en 30 Seconds ook werken
      const d = { deviceId: newId('d_'), memberId: newId('m_'), teamId: team.teamId, label: `Robot ${k + 1}`, seq: ++seq, socketId: null, connected: true, bot: true };
      d.socketId = `bot_${d.deviceId}`; // robots hebben een eigen nep-verbinding
      devices[d.deviceId] = d;
      if (!k) team.baseDeviceId = d.deviceId;
    }
  }
  if (settings.maxTeams && Object.keys(teams).length > settings.maxTeams) settings.maxTeams = Object.keys(teams).length;
  if (!settings.maxTeams) settings.maxTeams = Object.keys(teams).length;
}
const botTimers = {};
function scheduleBots() {
  if (phase !== 'PLAY' || paused) return;
  for (const team of Object.values(teams)) {
    if (!team.bot || botTimers[team.teamId]) continue;
    botTimers[team.teamId] = setTimeout(() => { delete botTimers[team.teamId]; if (teams[team.teamId]) botAct(team); }, 1200 + Math.floor(Math.random() * 3500));
  }
}
function botAct(team) {
  const step = cur();
  if (!step || paused) return;
  const s = ss(step), id = team.teamId, base = devices[team.baseDeviceId];
  if (!base) return;
  const rnd = (n) => Math.floor(Math.random() * Math.max(1, n));
  const lucky = Math.random() < 0.5;
  const call = (dev, ev, payload) => { const b = botSocket(dev.deviceId); if (b.h[ev]) b.h[ev](payload, () => {}); };
  switch (step.kind) {
    case 'teamphoto': if (!hasAnswered(team, step)) call(base, 'teamphoto_skip', null); break;
    case 'mc': if (s.status === 'open' && !s.answers[id]) call(base, 'submit_answer', { stepId: step.id, value: lucky ? step.answer : rnd(step.options.length) }); break;
    case 'logo': if (s.status === 'open' && !s.answers[id]) call(base, 'submit_text', { stepId: step.id, text: lucky ? step.name : 'Geen idee' }); break;
    case 'price':
      if (s.status === 'open' && !s.answers[id]) {
        const guess = (v) => Math.max(0.1, Math.round((Number(v) || 1) * (0.6 + Math.random() * 0.8) * 100) / 100);
        call(base, 'submit_price', { stepId: step.id, now: guess(step.now), ago: guess(step.ago) });
      }
      break;
    case 'song':
      if (s.status === 'open' && s.placements[id] === undefined) call(base, 'place_card', { stepId: step.id, slot: rnd(ensureTimeline(team, step.round).length + 1) });
      break;
    case 'memory':
      if (s.status === 'writing' && !(s.entries[id] || []).length) {
        const items = step.items || [];
        if (items.length) call(base, 'memory_add', { text: items[rnd(items.length)].text });
        call(base, 'memory_add', { text: `Robotgok ${1 + rnd(99)}` });
      }
      break;
    case 'draw': {
      const turn = s.status === 'drawing' && s.turns[s.turn];
      const who = turn && devices[turn.answerers[id]];
      if (turn && turn.words[id] && !turn.answers[id] && who) call(who, 'draw_guess', { text: lucky ? turn.words[id].word : 'Huis' });
      break;
    }
    case 'joker': if (s.choices[id] === undefined && rounds.length) call(base, 'joker_choose', { roundId: rounds[rnd(rounds.length)].id }); break;
    case 'final':
      if (s.status === 'wager' && s.wagers[id] === undefined) call(base, 'final_wager', { amount: rnd(settings.finalMaxWager + 1) });
      else if (s.status === 'question' && s.answers[id] === undefined) call(base, 'submit_answer', { stepId: step.id, value: lucky ? step.answer : rnd(step.options.length) });
      break;
    case 'tiebreak':
      if (s.status === 'open' && (s.teams || []).includes(id) && s.answers[id] === undefined) call(base, 'submit_answer', { value: Math.round((Number(step.answer) || 100) * (0.7 + Math.random() * 0.6)) });
      break;
  }
}

// ---------------------------------------------------------------
// Opstarten
// ---------------------------------------------------------------
loadHistory();
const restored = loadSaved();
loadPhotos();
function shutdown() { saveNow(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
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
    console.log(`${steps.length} schermen geladen in ${rounds.length} rondes.`);
    if (restored) {
      console.log(`Vorige quiz hersteld uit ${STATE_FILE}: ${Object.keys(teams).length} teams. De quiz staat op pauze.`);
      console.log('Hervat met de pauzeknop, of begin opnieuw met Reset.');
    }
  });
}
module.exports = { server, io };
