'use strict';
const express = require('express');
const http = require('http');
const fs = require('fs');
const G = require('./lib/game'); // gedeelde spelstand (zie lib/game.js)
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { loadContent, decadeOf } = require('./lib/content');
const { fromExcel, libraryFromExcel, isQuizWorkbook } = require('./lib/fromExcel');
const { updateLibrary, editLibrary } = require('./lib/hitster-update');
const { newId, cleanText, norm, lev, fuzzyEq, shuffle } = require('./lib/util');
const { writeJsonWithBackup, readJsonWithBackup, removeStateFiles } = require('./lib/state-store');
const { pushUndo, applyUndoEntry } = require('./lib/undo');
const { HISTORY_VERSION, DEFAULT_LIMIT: HISTORY_LIMIT, createHistoryEntry, appendHistory, isHistorySnapshot } = require('./lib/quiz-history');

const PORT = process.env.PORT || 3000;
const ON_RENDER = !!process.env.RENDER;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const { createLogger } = require('./lib/logger');
const { generateCode, sameCode, createGuard, createSessions, createRateLimiter, REMOTE_ONLY, LOGGED } = require('./lib/security');
const { createBackups } = require('./lib/backup');
const { momentumMessages } = require('./lib/momentum');
const LOG = createLogger(path.join(DATA_DIR, 'logs'));
// Fouten die de quiz bewust opvangt (hij loopt gewoon door) toch in het logboek zetten, zodat je achteraf kunt zien
// wat er misging. "Bestand bestaat niet" (ENOENT) is meestal normaal en wordt niet gelogd.
const quiet = (where) => (e) => { if (e && e.code !== 'ENOENT') LOG.warn('opgevangen_fout', { waar: where, fout: String((e && e.message) || e).slice(0, 200) }); };

// Toegangscode voor bediening.html (HOST_PIN). Mag lang zijn, ook met letters en streepjes.
// Niet ingesteld? Lokaal 1234; online een willekeurige code als "tulp-molen-482", bewaard in data/host-code.txt.
const HOST_CODE_FILE = path.join(DATA_DIR, 'host-code.txt');
// Toegangscode: 1) omgevingsvariabele HOST_PIN, 2) het bestand pincode.txt naast server.js (staat niet in git),
// 3) lokaal 1234 / online een willekeurige code. Geldt voor de bediening én de telefoonbediening (bediening2).
G.HOST_PIN = String(process.env.HOST_PIN || '').trim();
if (!G.HOST_PIN) { try { G.HOST_PIN = fs.readFileSync(path.join(__dirname, 'pincode.txt'), 'utf8').split(/\r?\n/)[0].trim(); } catch (e) { G.HOST_PIN = ''; } }
G.pinWasGenerated = false;
if (!G.HOST_PIN) {
  if (ON_RENDER || process.env.NODE_ENV === 'production') {
    try { G.HOST_PIN = fs.readFileSync(HOST_CODE_FILE, 'utf8').trim(); } catch (e) { G.HOST_PIN = ''; }
    if (!G.HOST_PIN) { G.HOST_PIN = generateCode(); try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(HOST_CODE_FILE, G.HOST_PIN + '\n'); } catch (e) { quiet('toegangscode opslaan')(e); } }
    G.pinWasGenerated = true;
  } else G.HOST_PIN = '1234';
}
if ((ON_RENDER || process.env.NODE_ENV === 'production') && G.HOST_PIN.length < 8 && !G.pinWasGenerated) LOG.warn('host_pin_kort', { lengte: G.HOST_PIN.length, advies: 'gebruik minstens 8 tekens, bijvoorbeeld drie woorden met streepjes' });
const pinGuard = createGuard();
const sessions = createSessions(path.join(DATA_DIR, 'sessions.json'));
// Andere toegangscode dan de vorige keer? Dan moet elk toestel opnieuw inloggen (oude sessies vervallen)
(() => {
  const file = path.join(DATA_DIR, 'pin-check.txt');
  const now = crypto.createHash('sha256').update('familiequiz:' + G.HOST_PIN).digest('hex');
  let before = null;
  try { before = fs.readFileSync(file, 'utf8').trim(); } catch (e) { /* eerste keer */ }
  if (before !== now) {
    if (before) { sessions.revokeAll(); LOG.info('toegangscode_gewijzigd', { advies: 'alle toestellen loggen opnieuw in' }); }
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(file, now + '\n'); } catch (e) { quiet('pin-check opslaan')(e); }
  }
})();
const rateLimit = createRateLimiter();
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const PHOTOS_FILE = path.join(DATA_DIR, 'teamphotos.json'); // teamfoto's apart, zodat state.json klein blijft
const MAX_PHOTO_CHARS = 200000;
const REACTIONS = ['😂', '😱', '👏', '🎉', '❤️', '🔥', '🤯', '💩'];
// Pauzefoto's: spelers mogen tijdens de pauze foto's maken; die komen direct op de tv en worden bewaard in
// data/fotos/<datum>/ zodat ze na de quiz gedeeld kunnen worden (download als zip in de bediening)
const MAX_PAUSE_CHARS = 650000;
// Foto-opslag (pauzefoto's, teamfoto's, originelen, archief per quiz): zie lib/photo-store.js
const photoStore = require('./lib/photo-store').createPhotoStore({ dataDir: DATA_DIR, log: LOG, teamName: (id) => (G.teams[id] ? G.teams[id].name : null) });
const {
  PHOTO_DIR, ORIG_DIR, TEAM_ARCHIVE, MAX_ORIGINAL_BYTES, pausePhotos, originalUploads,
  archiveAllPhotos, loadPausePhotos, pausePhotoUrl, originalUploadKey, teamOriginalFile, pauseOriginalFile,
  safeId, archivedTeamPhotos, archiveTeamPhoto, readOriginal, removeOriginal
} = photoStore;
const FRESH = process.argv.includes('--fresh') || process.env.FRESH === '1';

const MAX_TEAM_NAME = 24;
const MAX_LABEL = 16;
const MAX_DEVICES_PER_TEAM = 8;
const DRAW_MAX = 10;   // maximaal aantal punten (ruw) per tekenbeurt
const THIRTY_MAX = 5;  // maximaal aantal punten (ruw) per 30-secondsbeurt

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingInterval: 10000, pingTimeout: 8000 });
// Veiligheidsheaders: geen inladen in andermans site, geen raden van bestandstypes, camera alleen voor deze site
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin', 'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()' });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'ignore', index: 'index.html' }));

// ---------------------------------------------------------------
// Adressen voor de QR-code
// ---------------------------------------------------------------
// Het adres zelf zoeken staat in lib/network.js (route naar de router, virtuele netwerkkaarten overslaan)
const network = require('./lib/network');
const pickLanAddress = network.pickLanAddress;
const getLanAddress = network.getLanAddress;
const getJoinUrl = () => network.getJoinUrl(PORT);
app.get('/api/join-url', (req, res) => res.json({ url: getJoinUrl() }));
// QR-code van het aanmeldadres: door de server zelf gemaakt, dus ook zonder internet
app.get('/qr.svg', (req, res) => {
  const { svg } = require('./lib/qr');
  res.set('Cache-Control', 'no-store').type('image/svg+xml').send(svg(getJoinUrl()));
});
// QR-code voor de telefoonbediening (bediening2.html): scannen met de telefoon van de quizmaster
app.get('/qr-bediening2.svg', (req, res) => {
  const { svg } = require('./lib/qr');
  res.set('Cache-Control', 'no-store').type('image/svg+xml').send(svg(`${getJoinUrl()}/bediening2.html`));
});
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.get('/download/Hitster-bibliotheek.xlsx', (req, res) => {
  if (req.query.t !== DOWNLOAD_TOKEN) return res.status(403).type('text').send('Geen toegang');
  const file = currentLibraryFile();
  if (!file) return res.status(404).type('text').send('Geen Hitster-bibliotheek gevonden');
  res.set('Content-Disposition', 'attachment; filename="Hitster-bibliotheek.xlsx"').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(fs.readFileSync(file));
});
// Reservekopieën en logboek downloaden (alleen met het geheime adres uit de bediening)
app.get('/download/backup/:id.zip', (req, res) => {
  if (req.query.t !== DOWNLOAD_TOKEN) return res.status(403).type('text').send('Geen toegang');
  const buf = backups.zipOf(req.params.id === 'nu' ? (backupNow('download'), 'nu') : req.params.id);
  if (!buf) return res.status(404).type('text').send('Reservekopie niet gevonden');
  res.set('Content-Disposition', `attachment; filename="familiequiz-backup-${req.params.id}.zip"`).type('application/zip').send(buf);
});
app.get('/download/log/:file', (req, res) => {
  if (req.query.t !== DOWNLOAD_TOKEN) return res.status(403).type('text').send('Geen toegang');
  const buf = LOG.read(req.params.file);
  if (!buf) return res.status(404).type('text').send('Logboek niet gevonden');
  res.set('Content-Disposition', `attachment; filename="${req.params.file}"`).type('text/plain').send(buf);
});
// Pauzefoto's (namen zijn willekeurig en worden streng gecontroleerd)
app.get('/pauzefoto/:day/:file', (req, res) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day) || !/^[\w-]+\.jpg$/.test(req.params.file)) return res.status(404).end();
  const f = path.join(PHOTO_DIR, req.params.day, req.params.file);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('image/jpeg').send(fs.readFileSync(f));
});
// Alle foto's van de avond (teamfoto's + pauzefoto's) als zip
app.get('/download/fotos.zip', (req, res) => {
  if (req.query.t !== DOWNLOAD_TOKEN) return res.status(403).type('text').send('Geen toegang');
  const { zip } = require('./lib/zip');
  const files = {};
  const slug = (s) => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'team';
  // Origineel (ware grootte) als dat binnen is, anders de kleine tv-versie
  // Teamfoto's: alle bewaarde (ook van eerdere avonden of van vóór een reset), plus de huidige als die nog niet bewaard was
  const archived = archivedTeamPhotos();
  for (const a of archived) { try { files[`teamfotos/${a.day}_${a.slug}.jpg`] = readOriginal(teamOriginalFile(a.teamId)) || fs.readFileSync(path.join(TEAM_ARCHIVE, a.day, a.file)); } catch (e) { quiet('foto-zip teamfoto')(e); } }
  for (const [teamId, p] of Object.entries(G.teamPhotos)) {
    if (archived.some((a) => a.teamId === safeId(teamId))) continue;
    files[`teamfotos/${slug(G.teams[teamId] ? G.teams[teamId].name : teamId)}.jpg`] = readOriginal(teamOriginalFile(teamId)) || Buffer.from(p.dataUrl.split(',')[1], 'base64');
  }
  for (const p of pausePhotos) { try { files[`pauzefotos/${p.file.replace('/', '_')}`] = readOriginal(pauseOriginalFile(p)) || fs.readFileSync(path.join(PHOTO_DIR, p.file)); } catch (e) { quiet('foto-zip pauzefoto')(e); } }
  if (!Object.keys(files).length) return res.status(404).type('text').send("Nog geen foto's");
  res.set('Content-Disposition', `attachment; filename="familiequiz-fotos-${new Date().toISOString().slice(0, 10)}.zip"`).type('application/zip').send(zip(files));
});
// Teamfoto als los plaatje: zo hoeft de foto niet bij elke update opnieuw mee naar tv en telefoons
app.get('/teamfoto/:teamId', (req, res) => {
  const photo = G.teamPhotos[req.params.teamId];
  if (!photo) return res.status(404).end();
  const buf = Buffer.from(photo.dataUrl.split(',')[1], 'base64');
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type('image/jpeg').send(buf);
});

// Origineel van een team- of pauzefoto (ware grootte), met de eenmalige sleutel uit het socket-antwoord
app.post('/origineel/:key', (req, res) => {
  const key = String(req.params.key || '');
  const job = /^[a-f0-9]{32}$/.test(key) ? originalUploads.get(key) : null;
  if (!job || job.expires < Date.now()) return res.status(403).type('text').send('Geen geldige uploadsleutel');
  originalUploads.delete(key); // eenmalig
  if (Number(req.headers && req.headers['content-length']) > MAX_ORIGINAL_BYTES) return res.status(413).type('text').send('Foto te groot');
  const chunks = [];
  let size = 0;
  req.on('data', (c) => { size += c.length; if (size <= MAX_ORIGINAL_BYTES) chunks.push(c); });
  req.on('error', () => { /* verbinding weg: dan blijft de kleine versie in het album */ });
  req.on('end', () => {
    if (size > MAX_ORIGINAL_BYTES) return res.status(413).type('text').send('Foto te groot');
    const buf = Buffer.concat(chunks);
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return res.status(400).type('text').send('Geen JPEG');
    try {
      const full = path.join(ORIG_DIR, job.file);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, buf);
    } catch (e) { return res.status(500).type('text').send('Opslaan mislukt'); }
    LOG.info('foto_origineel', { bestand: job.file, kb: Math.round(buf.length / 1024) });
    res.status(204).end();
  });
});

// ---------------------------------------------------------------
// Instellingen (config.json = standaard; de quizmaster past ze in de lobby aan)
// ---------------------------------------------------------------
// Standaardwaarden en controle van instellingen: zie lib/settings.js
const { DEFAULT_SETTINGS, THEMES, sanitizeSettings } = require('./lib/settings');
G.settings = { ...DEFAULT_SETTINGS };
try {
  G.settings = sanitizeSettings(JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')), DEFAULT_SETTINGS);
} catch (e) { quiet('config.json lezen')(e); } // geen config.json: standaardwaarden

// ---------------------------------------------------------------
// Inhoud
// ---------------------------------------------------------------
// De vragen komen uit vragenlijst.xlsx (de nieuwste van: geüpload via de bediening, in de projectmap, of QUIZ_XLSX).
// Staat er geen Excel, of is hij onleesbaar, dan wordt questions.json gebruikt.
const XLSX_UPLOAD = path.join(DATA_DIR, 'vragenlijst.xlsx');
const XLSX_LOCAL = path.join(__dirname, 'vragenlijst.xlsx');
// De Hitster-bibliotheek staat los van de vragenlijst: Hitster-bibliotheek.xlsx (geüpload, in de projectmap of HITSTER_XLSX)
const LIB_UPLOAD = path.join(DATA_DIR, 'Hitster-bibliotheek.xlsx');
const LIB_LOCAL = path.join(__dirname, 'Hitster-bibliotheek.xlsx');
G.librarySource = null;
G.libraryUpdate = null; // laatste update van de Hitster-lijsten (rapport per tabblad)
// Het bestand dat nu als (eigen) Hitster-bibliotheek dient
function currentLibraryFile() {
  const own = [process.env.HITSTER_XLSX, LIB_UPLOAD].filter((f) => f && fs.existsSync(f));
  own.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return own[0] || (fs.existsSync(LIB_LOCAL) ? LIB_LOCAL : null);
}
// Downloadlink voor de (bijgewerkte) bibliotheek: alleen de bediening krijgt dit geheime adres
const DOWNLOAD_TOKEN = require('crypto').randomUUID();
// De vragenlijst die nu gebruikt wordt (zelfde volgorde als bij het inlezen)
const currentQuizFile = () => [process.env.QUIZ_XLSX, path.join(DATA_DIR, 'vragenlijst.xlsx'), path.join(__dirname, 'vragenlijst.xlsx')].filter((f) => f && fs.existsSync(f))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
// ---------- Reservekopieën ----------
const backups = createBackups({
  dir: path.join(DATA_DIR, 'backups'),
  log: LOG,
  sources: () => [
    { name: 'state.json', file: path.join(DATA_DIR, 'state.json') },
    { name: 'history.json', file: path.join(DATA_DIR, 'history.json') },
    { name: 'teamphotos.json', file: path.join(DATA_DIR, 'teamphotos.json') },
    { name: 'playlists.json', file: path.join(DATA_DIR, 'playlists.json') },
    { name: 'vragenlijst.xlsx', file: currentQuizFile() },
    { name: 'Hitster-bibliotheek.xlsx', file: currentLibraryFile() }
  ]
});
function backupNow(reason, force = false) { try { saveNow(); } catch (e) { quiet('opslaan voor reservekopie')(e); } return backups.snapshot(reason, { force }); }
function loadLibrary(extra) {
  // Extra muziekrondes vallen ALTIJD terug op de Hitster-Excel (nooit op de liedjes van R4 Muziek):
  // 1) een geüpload of via HITSTER_XLSX aangewezen bibliotheek, 2) per categorie aangevuld met de meegeleverde
  // Hitster-bibliotheek.xlsx uit de projectmap (voor categorieën die in het eigen bestand ontbreken).
  const bronnen = [];
  const read = (file) => {
    try {
      const r = libraryFromExcel(file);
      extra.push(...r.warnings.slice(0, 10));
      bronnen.push(...(r.bronnen || []));
      return r.library;
    } catch (e) { extra.push(`De Hitster-bibliotheek ${path.basename(file)} kon niet gelezen worden (${e.message}).`); return []; }
  };
  const own = [process.env.HITSTER_XLSX, LIB_UPLOAD].filter((f) => f && fs.existsSync(f) && path.resolve(f) !== path.resolve(LIB_LOCAL));
  own.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const primary = own.length ? read(own[0]) : [];
  const bundled = fs.existsSync(LIB_LOCAL) ? read(LIB_LOCAL) : [];
  // Hitster-tabbladen in de vragenlijst zelf (oudere bestanden) tellen als eigen lijst
  const mine = [...(G.baseRaw.hitsterLibrary || []), ...primary];
  const mineCats = new Set(mine.map((song) => song.category));
  const seen = new Set();
  // Categorieën uit het eigen bestand: eerst die nummers, daarna (als reserve) de meegeleverde nummers van dezelfde categorie
  const merged = [...mine, ...bundled.map((song) => (mineCats.has(song.category) ? { ...song, reserve: true } : song))].filter((song) => {
    const k = `${song.category}|${song.title}|${song.artist}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const parts = [];
  if (own.length) parts.push(path.basename(own[0]) + (own[0] === LIB_UPLOAD ? ' (geüpload)' : ''));
  if (bundled.length) parts.push(own.length ? 'met de meegeleverde Hitster-bibliotheek.xlsx als aanvulling' : 'Hitster-bibliotheek.xlsx');
  G.librarySource = merged.length ? { file: parts.join(', '), count: merged.length } : null;
  if (!merged.length) extra.push('Geen Hitster-bibliotheek gevonden: extra muziekrondes zoeken direct op Spotify. Zet Hitster-bibliotheek.xlsx terug in de projectmap.');
  G.baseRaw.hitsterLibrary = merged;
  // Playlists uit het tabblad Bronnen (eigen bestand gaat voor de meegeleverde)
  G.excelPlaylists = {};
  for (const b of [...bronnen].reverse()) if (b.playlist && HITSTER_CATS[b.category]) G.excelPlaylists[b.category] = b.playlist;
  rebuildPlaylists();
}
const JSON_BASE = path.join(__dirname, 'questions.json');
// content, rounds, steps, songs, roundById: zie G (lib/game.js)
G.baseRaw = null; // inhoud zoals ingelezen (Excel/JSON), vóór het rondeplan
G.quizSource = { kind: 'json', file: 'questions.json', loadedAt: null };
// Extra rondes: een spel nog een keer spelen (30 Seconds, tekenen, muziek met eventueel een categorie).
// Ze staan in het rondeplan als { id: 'r7x1', base: 'r7', category }.
const EXTRA_TYPES = ['thirty', 'draw', 'hitster'];
const notPractice = (x) => !(x && (x.practice || x.oefen));
function planOrder() {
  const plan = G.settings.roundPlan || [];
  const list = (G.baseRaw && G.baseRaw.rounds) || [];
  const byId = Object.fromEntries(list.map((r) => [r.id, r]));
  const valid = plan.filter((p) => (p.base ? byId[p.base] && EXTRA_TYPES.includes(byId[p.base].type) : byId[p.id]));
  const missing = list.filter((r) => !valid.some((p) => p.id === r.id)).map((r) => ({ id: r.id, on: true }));
  return [...valid, ...missing];
}
// Categorieën voor een extra muziekronde (zoals in de Hitster-app); de liedjes zoekt de bediening op Spotify
// Categorieën = de Nederlandse Hitster-edities (plus twee eigen decennia-categorieën)
const HITSTER_CATS = {
  original: 'Hitster Original', refresh: 'Hitster Original Refresh', nederpop: 'Hitster 100% NL', top40: 'Hitster Top 40 NL',
  guilty: 'Hitster Guilty Pleasures', summer: 'Hitster Summer Party', rock: 'Hitster Rock', hiphop: 'Hitster Urban & Hiphop',
  soundtracks: 'Hitster Movies & TV Soundtracks', christmas: 'Hitster Christmas', celebration: 'Hitster Celebration', bingo: 'Hitster Bingo',
  battle1: 'Hitster Battle: t/m 1984', battle2: 'Hitster Battle: 1985–2004', battle3: 'Hitster Battle: 2005–2025',
  flyingmic: 'Hitster Flying Mic', '80s90s': '80s & 90s (eigen lijst)', '00s10s': '00s & 10s (eigen lijst)'
};
// Tijdvakken van Battle of the Generations: nummers buiten het tijdvak worden overgeslagen
const ERA_RANGE = { battle1: [1900, 1984], battle2: [1985, 2004], battle3: [2005, 2100] };
const inEra = (cat, year) => !ERA_RANGE[cat] || (year >= ERA_RANGE[cat][0] && year <= ERA_RANGE[cat][1]);
// Officiële Hitster-playlists (van de liedjeslijsten van Primera); in de bediening te wijzigen
const DEFAULT_PLAYLISTS = {
  original: '321iL49aeqqqtKfrQLO91I', nederpop: '6plvDP2Wfm32ZliZ8ZfszH', guilty: '2JSmyZbQzHwBztJAlATde4', summer: '2hJrEVC4F2JGDpuUZKJzLF',
  rock: '2SHUg7ATjUKt11XTS6cqyp', hiphop: '35y8diwRzYjfNUvcvtvRXx', soundtracks: '7Az33NkIvFxjSR2vfxpXyt', christmas: '1TUhoIBbCFCCyDM4ELKdUE',
  celebration: '0xkEvV9nuXz8F7ud4HC2IL', bingo: '4wEfXjSyGPI22nPftvtl30', flyingmic: '5Ef8SeoJP0sjpuiGdOjTVA'
};
// Jaartallen die de bediening via Spotify heeft gecorrigeerd (eerste uitgave), en nummers buiten een tijdvak
G.yearFixes = {};   // songKey -> jaar
G.rejectedKeys = [];
// Spotify-playlist per categorie (de officiële Hitster-playlists). Apart bewaard, zodat een reset ze niet wist.
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
// Playlists: standaard (ingebouwd) < tabblad Bronnen van de Hitster-bibliotheek < zelf ingesteld in de bediening
G.excelPlaylists = {};      // categorie -> playlist-id uit het tabblad Bronnen
G.playlistOverrides = {};   // categorie -> { id, name, total } of null (= bewust geen playlist)
G.hitsterPlaylists = {};
function rebuildPlaylists() {
  G.hitsterPlaylists = {};
  for (const [cat, id] of Object.entries(DEFAULT_PLAYLISTS)) G.hitsterPlaylists[cat] = { id, name: 'Officiële Hitster-playlist', total: null };
  for (const [cat, id] of Object.entries(G.excelPlaylists)) G.hitsterPlaylists[cat] = { id, name: 'Officiële Hitster-playlist (uit Hitster-bibliotheek)', total: null };
  for (const [cat, p] of Object.entries(G.playlistOverrides)) { if (p) G.hitsterPlaylists[cat] = p; else delete G.hitsterPlaylists[cat]; }
}
const playlistIdOf = (v) => { const m = /(?:playlist[/:])?([A-Za-z0-9]{22})(?:\?|$)/.exec(String(v || '').trim()); return m ? m[1] : null; };
try {
  const saved = JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
  const stored = saved && (saved.version === 2 ? saved.overrides : saved.playlists) || {};
  for (const [cat, p] of Object.entries(stored)) {
    if (!HITSTER_CATS[cat]) continue;
    if (p === null) G.playlistOverrides[cat] = null;
    else if (p && playlistIdOf(p.id) && !(saved.version !== 2 && DEFAULT_PLAYLISTS[cat] === playlistIdOf(p.id))) G.playlistOverrides[cat] = { id: playlistIdOf(p.id), name: String(p.name || '').slice(0, 120), total: Number(p.total) || null };
  }
} catch (e) { quiet('playlists lezen')(e); }
rebuildPlaylists();
function savePlaylists() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify({ version: 2, overrides: G.playlistOverrides }, null, 2)); }
  catch (e) { console.error('Playlists opslaan mislukt:', e.message); }
}
const extraTitle = (p, b) => (b.type === 'hitster' ? `Muziek: ${HITSTER_CATS[p.category] || HITSTER_CATS.original}` : `${b.title} (extra ronde)`);
function extraRaw(p, b) {
  const r = JSON.parse(JSON.stringify(b));
  r.id = p.id; r.extra = true; r.title = extraTitle(p, b);
  // Geen oefenronde meer bij een extra ronde
  if (r.type === 'draw') r.words = (r.words || []).filter(notPractice);
  if (r.type === 'thirty') r.cards = (r.cards || []).filter(notPractice);
  if (r.type === 'hitster') {
    const category = HITSTER_CATS[p.category] ? p.category : 'original';
    const fallback = (G.baseRaw.hitsterLibrary || []).map((song) => ({ ...song, category: song.category || 'original' }));
    r.songs = fallback.filter((song) => song.category === category); // alleen deze categorie; daarna Spotify
    // De 2e, 3e … extra ronde in dezelfde categorie krijgt andere startkaarten dan de vorige
    const byIdAll = Object.fromEntries((G.baseRaw.rounds || []).map((x) => [x.id, x]));
    const same = planOrder().filter((x) => x.base && byIdAll[x.base] && byIdAll[x.base].type === 'hitster' && (HITSTER_CATS[x.category] ? x.category : 'original') === category);
    r.startOffset = Math.max(0, same.findIndex((x) => x.id === p.id));
    // Liedjes uit de gewone muziekronde(s) nooit als startkaart gebruiken
    r.excludeKeys = (G.baseRaw.rounds || []).filter((x) => x.type === 'hitster').flatMap((x) => (x.songs || []).map((song) => `${song.title}|${song.artist || ''}`.toLowerCase()));
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
const roundStarted = (id) => G.phase !== 'LOBBY' && G.steps.some((x, i) => x.round === id && i <= G.stepIndex);
function planView() {
  const byId = Object.fromEntries(((G.baseRaw && G.baseRaw.rounds) || []).map((r) => [r.id, r]));
  return planOrder().map((p) => {
    const b = byId[p.base || p.id];
    return { id: p.id, base: p.base || null, category: p.category || null, extra: !!p.base, type: b.type, on: p.on, started: roundStarted(p.id), title: p.base ? extraTitle(p, b) : b.title };
  });
}
// Welke rondes kun je extra spelen, en welke muziekcategorieën zijn er (met aantal liedjes)?
function extraOptions() {
  const list = (G.baseRaw && G.baseRaw.rounds) || [];
  return {
    rounds: list.filter((r) => EXTRA_TYPES.includes(r.type)).map((r) => ({ id: r.id, title: r.title, type: r.type })),
    categories: Object.entries(HITSTER_CATS).map(([id, name]) => {
      const n = ((G.baseRaw && G.baseRaw.hitsterLibrary) || []).filter((song) => (song.category || 'original') === id).length;
      const label = G.hitsterPlaylists[id]
        ? `eerst Hitster-playlist${n ? `, daarna ${n} uit de Excel` : ', daarna Spotify zoeken'}`
        : (n ? `${n} uit de Excel, daarna Spotify zoeken` : 'Spotify zoeken');
      return { id, name: `${name} · ${label}`, count: n };
    })
  };
}
function replan(order) {
  const curId = cur() ? cur().id : null;
  G.settings.roundPlan = order.map((p) => ({ id: p.id, on: p.on !== false, base: p.base || undefined, category: p.category || undefined }));
  compileQuiz(G.content.warnings.filter((w) => !/Ronde/.test(w)));
  if (curId) { const i = G.steps.findIndex((x) => x.id === curId); if (i >= 0) G.stepIndex = i; }
  if (G.phase === 'LOBBY') { G.ssAll = {}; G.undoHistory = []; Object.values(G.teams).forEach((t) => { t.timelines = {}; t.jokerRound = null; }); }
}
G.dynSongs = {};  // liedjes die de bediening online vindt (id -> liedje)
G.dynStart = {};  // rondeId -> online startkaarten
// Extra muziekrondes: eerst de officiële Hitster-playlist op Spotify, pas als die niet lukt (geen Spotify-verbinding,
// playlist niet bereikbaar of op) de Hitster-Excel. Per ronde onthouden we of de playlist is mislukt.
G.playlistFailed = {}; // rondeId -> reden
const playlistFirst = (round) => !!(round && round.dynamic && G.hitsterPlaylists[round.category] && !G.playlistFailed[round.id]);
function failPlaylist(roundId, reason) {
  if (G.playlistFailed[roundId]) return;
  G.playlistFailed[roundId] = String(reason || 'onbekend').slice(0, 200);
  LOG.warn('playlist_terugval_excel', { ronde: roundId, reden: G.playlistFailed[roundId] });
  const step = cur();
  if (step && step.kind === 'song' && step.round === roundId) {
    const s = ss(step);
    Object.values(G.teams).forEach((team) => ensureTimeline(team, roundId));
    if (s.status === 'loading' && songOf(step) && dynamicStartReady(roundId)) s.status = 'open';
  }
}
G.teamPhotos = {};  // teamId -> { dataUrl, v }: vaste teamfoto, bewaard in data/teamphotos.json
const validPhoto = (d) => typeof d === 'string' && d.length <= MAX_PHOTO_CHARS && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(d);
// Vaste teamkleur: elk team krijgt bij het aanmelden de eerste vrije kleur uit dit palet
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4', '#eab308', '#8b5cf6'];
function pickColor() {
  const used = new Set(Object.values(G.teams).map((t) => t.color));
  return TEAM_COLORS.find((c) => !used.has(c)) || TEAM_COLORS[Object.keys(G.teams).length % TEAM_COLORS.length];
}
// Kleur en foto per teamnaam: tv en telefoons zoeken daarmee overal de juiste kleur en foto op
const teamStyle = () => Object.fromEntries(Object.values(G.teams).map((t) => [t.name, { color: t.color || '#64748b', photo: photoUrl(t.teamId) }]));
const photoUrl = (teamId) => (G.teamPhotos[teamId] ? `/teamfoto/${encodeURIComponent(teamId)}?v=${G.teamPhotos[teamId].v}` : null);
function savePhotos() {
  try { writeJsonWithBackup(PHOTOS_FILE, { version: 1, photos: G.teamPhotos }); }
  catch (e) { console.error('Teamfoto\'s opslaan mislukt:', e.message); }
}
function loadPhotos() {
  if (FRESH) { try { removeStateFiles(PHOTOS_FILE); } catch (e) { /* bestond niet */ } return; }
  const saved = readJsonWithBackup(PHOTOS_FILE, (x) => x && x.version === 1 && x.photos && typeof x.photos === 'object');
  const photos = saved && saved.data ? saved.data.photos : {};
  G.teamPhotos = {};
  for (const [teamId, p] of Object.entries(photos)) if (G.teams[teamId] && p && validPhoto(p.dataUrl)) G.teamPhotos[teamId] = { dataUrl: p.dataUrl, v: Number(p.v) || Date.now() };
  // Teamfoto's van vóór deze versie ook los bewaren, zodat ze een reset overleven
  const archived = new Set(archivedTeamPhotos().map((a) => a.teamId));
  for (const [teamId, p] of Object.entries(G.teamPhotos)) if (!archived.has(safeId(teamId))) archiveTeamPhoto(teamId, p.dataUrl);
}
function setTeamPhoto(teamId, dataUrl) {
  removeOriginal(teamOriginalFile(teamId)); // oud origineel weg; een nieuwe foto stuurt zijn eigen origineel
  if (dataUrl) G.teamPhotos[teamId] = { dataUrl, v: Date.now() };
  else delete G.teamPhotos[teamId];
  savePhotos();
  archiveTeamPhoto(teamId, dataUrl);
}
function addDynSong(id, t) {
  const song = {
    id, key: `${t.title}|${t.artist}`.toLowerCase(), title: t.title, artist: t.artist, year: t.year, dynamic: true,
    uri: t.uri || null, audio: t.previewUrl ? { kind: 'audio', src: t.previewUrl } : null
  };
  G.dynSongs[id] = song;
  G.songs[id] = song;
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
  G.steps.forEach((x) => { const id = x.kind === 'song' && G.ssAll[x.id] && G.ssAll[x.id].songId; if (id && G.songs[id]) keys.add(G.songs[id].key); });
  Object.values(G.roundById).forEach((round) => { if (!playlistFirst(round)) (round.startIds || []).forEach((id) => { if (G.songs[id]) keys.add(G.songs[id].key); }); });
  Object.values(G.dynStart).flat().forEach((id) => { if (G.songs[id]) keys.add(G.songs[id].key); });
  G.rejectedKeys.forEach((k) => keys.add(k));
  return [...keys];
}
function compileQuiz(extraWarnings) {
  const result = loadContent(null, applyPlan(G.baseRaw));
  result.warnings = [...(extraWarnings || []).filter((w) => !w.startsWith(MEDIA_WARNING)), ...result.warnings];
  G.content = result;
  ({ rounds: G.rounds, steps: G.steps, songs: G.songs } = result);
  Object.assign(G.songs, G.dynSongs);
  for (const song of Object.values(G.songs)) if (song && G.yearFixes[song.key]) { song.year = G.yearFixes[song.key]; song.verified = true; }
  G.roundById = Object.fromEntries(G.rounds.map((r) => [r.id, r]));
  G.content.warnings.push(...missingMediaWarnings());
}
// Controle: staan alle foto's, logo's en geluidsbestanden uit de vragenlijst echt in public/media/?
const MEDIA_WARNING = '📁 ';
// Wifi-QR voor het welkomstscherm (plaatje dat de quizmaster zelf neerzet); kort onthouden om niet steeds te kijken
G.wifiQrCache = { at: 0, ok: false };
function wifiQrPresent() {
  if (Date.now() - G.wifiQrCache.at < 10000) return G.wifiQrCache.ok;
  const ok = ['png', 'jpg', 'jpeg'].some((x) => { try { return fs.statSync(path.join(__dirname, 'public', 'media', `wifi-qr.${x}`)).isFile(); } catch (e) { return false; } });
  G.wifiQrCache = { at: Date.now(), ok };
  return ok;
}
function missingMediaWarnings() {
  const missing = new Map(); // ronde -> Set(bestanden)
  const check = (src, where) => {
    if (typeof src !== 'string' || !src || /^(https?:|data:)/i.test(src)) return;
    const file = path.join(__dirname, 'public', decodeURIComponent(src.split('?')[0]).replace(/^\/+/, ''));
    if (!file.startsWith(path.join(__dirname, 'public')) || fs.existsSync(file)) return;
    if (!missing.has(where)) missing.set(where, new Set());
    missing.get(where).add(src.replace(/^\/media\//, ''));
  };
  const nameOf = (roundId) => (G.roundById[roundId] ? `Ronde ${G.roundById[roundId].no}: ${G.roundById[roundId].title}` : roundId === 'test' ? 'Testvragen' : roundId === 'final' ? 'Slotvraag' : 'Quiz');
  for (const step of G.steps) {
    const media = step.media || null;
    if (media) check(media.src || media.image || media.file, nameOf(step.round));
  }
  for (const song of Object.values(G.songs)) {
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
      G.baseRaw = raw;
      result = { warnings };
      G.quizSource = { kind: 'excel', file: path.basename(candidates[0]) + (candidates[0] === XLSX_UPLOAD ? ' (geüpload)' : ''), loadedAt: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) };
    } catch (e) {
      extra.push(`De Excel kon niet gelezen worden (${e.message}). questions.json is gebruikt.`);
    }
  }
  if (!result) {
    G.baseRaw = JSON.parse(fs.readFileSync(JSON_BASE, 'utf8'));
    result = { warnings: [] };
    G.quizSource = { kind: 'json', file: 'questions.json', loadedAt: new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }) };
  }
  loadLibrary(extra);
  compileQuiz([...extra, ...result.warnings]);
  G.content.warnings.forEach((w) => console.warn('Waarschuwing:', w));
}
loadQuiz();
const roundPoints = (round) => round.points ?? G.settings.roundPoints;

// ---------------------------------------------------------------
// Spelstatus
// ---------------------------------------------------------------
G.teams = {};      // teamId -> { teamId, name, seq, baseDeviceId, jokerRound, timeline, proposal }
G.devices = {};    // deviceId -> { deviceId, memberId, teamId, label, seq, socketId, connected }
G.phase = 'LOBBY'; // LOBBY | PLAY | END
G.stepIndex = 0;
G.paused = false;
G.showStandings = false;
G.showPositions = false; // tussenstand op de tv (nooit punten): false | 'list' (posities) | 'race' (balkenrace)
G.review = null;   // { scope: rondeId | 'all', page }
G.reveal = 'idle'; // einduitslag: idle -> stepping (plek voor plek) -> done
G.revealN = 0;     // aantal onthulde plekken (van laag naar hoog)
G.lobbyStage = 'welcome'; // lobby: eerst de welkomstpagina, dan het aanmeldscherm met QR-code
G.endView = 'ranking'; // ranking | breakdown | awards | album (op de tv na de ontknoping)
const END_VIEWS = ['ranking', 'breakdown', 'awards', 'album'];
// Gegevens voor de awards: hoe vaak een team als eerste antwoordde en bij hoeveel vragen er gespiekt werd
G.musicPaused = false; // muziek van de huidige muziekvraag op pauze gezet door de quizmaster
G.awardStats = {}; // teamId -> { firsts, cheatSteps: [stepId] }
const statOf = (teamId) => (G.awardStats[teamId] = G.awardStats[teamId] || { firsts: 0, cheatSteps: [] });
function noteAnswer(s, teamId) { if (Object.keys(s.answers || {}).length === 1) statOf(teamId).firsts++; }
G.ssAll = {};      // stepId -> dynamische status van die stap
G.alerts = {};     // deviceId -> spiekmelding (blijft staan tot de speler terug is)
G.seq = 0;
G.undoHistory = [];
const UNDO_LIMIT = 30;
G.gameId = null;
G.historyEntries = [];

const timer = { tag: null, totalMs: 0, remainingMs: 0, startedAt: 0, handle: null };

const byName = (a, b) => a.name.localeCompare(b.name, 'nl');
const bySeq = (a, b) => a.seq - b.seq;
const cur = () => (G.phase === 'PLAY' ? G.steps[G.stepIndex] : null);

function ss(step) {
  if (!G.ssAll[step.id]) {
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
    G.ssAll[step.id] = init[step.kind] ? JSON.parse(JSON.stringify(init[step.kind])) : {};
  }
  return G.ssAll[step.id];
}

const teamDevices = (team) => Object.values(G.devices).filter((d) => d.teamId === team.teamId).sort(bySeq);
const connectedDevices = (team) => teamDevices(team).filter((d) => d.connected);
const teamConnected = (team) => { const b = G.devices[team.baseDeviceId]; return !!(b && b.connected); };
const activeTeams = () => Object.values(G.teams).filter(teamConnected);
function notifyTeam(team, text) {
  for (const d of teamDevices(team)) if (d.connected && d.socketId) io.to(d.socketId).emit('team_notice', { text });
}
const labelTaken = (team, label, except = null) => teamDevices(team).some((d) => d.deviceId !== except && d.label.toLowerCase() === label.toLowerCase());
const findTeamByName = (name, except = null) => Object.values(G.teams).find((t) => t.teamId !== except && t.name.toLowerCase() === name.toLowerCase());

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
  if (!G.paused) timerRun();
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
  const max = step.variant === 'blur' ? G.settings.blurPoints[0] : 1;
  if (s.voided === 'void') return { ok: null, raw: 0, max: 0, a: null };
  const a = s.answers[team.teamId] || null;
  const ok = s.voided === 'all_correct' || (!!a && a.v === step.answer);
  let raw = 0;
  if (ok) raw = step.variant === 'blur' ? G.settings.blurPoints[Math.min(a ? a.step : 0, G.settings.blurPoints.length - 1)] : 1;
  return { ok, raw, max, a };
}

function priceAwards(step) {
  const s = ss(step);
  const out = {};
  for (const key of ['now', 'ago']) {
    const list = Object.entries(s.answers)
      .filter(([tid, a]) => G.teams[tid] && Number.isFinite(a[key]))
      .map(([tid, a]) => ({ tid, d: Math.abs(a[key] - step[key]) }))
      .sort((x, y) => x.d - y.d);
    let rank = 0;
    list.forEach((e, i) => {
      if (i > 0 && e.d > list[i - 1].d + 1e-9) rank = i;
      (out[e.tid] = out[e.tid] || {})[key] = { v: s.answers[e.tid][key], rank, pts: G.settings.pricePoints[rank] || 0 };
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
  const good = Object.entries(s.answers).filter(([id]) => G.teams[id] && s.judged[id]).sort((a, b) => a[1].at - b[1].at);
  const out = {};
  if (step.variant === 'blur') good.forEach(([id, a]) => { out[id] = G.settings.blurPoints[Math.min(a.step || 0, G.settings.blurPoints.length - 1)]; });
  else good.forEach(([id], i) => { out[id] = G.settings.logoPoints[Math.min(i, G.settings.logoPoints.length - 1)]; });
  return out;
}
const openMax = (step) => (step.variant === 'blur' ? G.settings.blurPoints[0] : G.settings.logoPoints[0]);
// Hoeveel lijkt een antwoord op het goede antwoord? 0-100% (voor de quizmaster bij het nakijken)
function similarity(text, answers) {
  const x = norm(text);
  if (!x) return 0;
  return Math.max(0, ...answers.filter(Boolean).map((a) => { const y = norm(a); if (!y) return 0; if (x === y) return 100; if (y.length >= 4 && x.includes(y)) return 95; return Math.round((1 - lev(x, y) / Math.max(x.length, y.length)) * 100); }));
}
const logoMatches = (step, text) => [step.name, ...(step.alt || [])].some((w) => fuzzyEq(w, text) || (norm(w).length >= 4 && norm(text).includes(norm(w))));
const thirtyPlanTurns = (s, team) => (s.order ? s.order.filter((o) => o.teamId === team.teamId).length : teamDevices(team).length);

// Ruwe score en maximum van een team in een ronde
function roundRaw(team, round) {
  const list = G.steps.filter((s) => s.round === round.id);
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
      // Pas na de onthulling tellen maximum én punten mee; de titel/artiest-bonus hoort er ook bij
      // (anders kan niemand 100% halen en heeft goedkeuren door de quizmaster geen effect)
      if (s.status === 'revealed') {
        const a = songAward(step, team.teamId);
        max += a.max;
        raw += a.place + a.year + a.title + a.artist;
      }
    } else if (step.kind === 'price') {
      max += G.settings.pricePoints[0] * 2;
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
// Uitleg bij de start van een ronde: hoe verdien je hier punten? (de som wordt omgerekend naar de punten van de ronde)
// Hitster per liedje: punten voor de goede plek + punten voor het jaartal met speling
// (standaard 5 voor de plek; jaartal exact 5, 1 jaar ernaast 3, 2 jaar ernaast 2, 3 jaar ernaast 1)
function songAward(step, teamId) {
  const s = ss(step);
  const round = G.roundById[step.round];
  const withYear = !round || (round.yearBonus ?? 1) !== 0;
  const yp = withYear ? G.settings.hitsterYearPoints : [];
  const tp = G.settings.hitsterTitlePoints || 0, ap = G.settings.hitsterArtistPoints || 0;
  const out = { place: 0, year: 0, title: 0, artist: 0, diff: null, max: G.settings.hitsterPlacePoints + (yp[0] || 0) + tp + ap };
  const r = s.results && s.results[teamId];
  // bonus voor titel en artiest: door de quizmaster goedgekeurd (staat los van de plek in de tijdlijn)
  const j = s.judge && s.judge[teamId];
  if (j && j.title) out.title = tp;
  if (j && j.artist) out.artist = ap;
  if (!r) return out;
  if (r.ok) out.place = G.settings.hitsterPlacePoints;
  const song = G.songs[s.songId];
  if (withYear && Number.isInteger(r.yearGuess) && song) {
    out.diff = Math.abs(r.yearGuess - song.year);
    out.year = yp[out.diff] || 0;
  } else if (withYear && r.exact && r.yearGuess === undefined) out.year = yp[0] || 0; // oude opslag zonder gok
  return out;
}
function scoringText(round) {
  if (!round) return null;
  const P = roundPoints(round);
  const list = (a) => a.join(' · ');
  switch (round.type) {
    case 'mc': return `Elke goede vraag telt even zwaar. Alles goed = ${P} punten.`;
    case 'blur': return `Hoe eerder je het goede antwoord geeft (hoe waziger de foto), hoe meer punten: ${list(G.settings.blurPoints)} per foto.`;
    case 'logo': return `Het eerste goede antwoord krijgt de meeste punten: ${list(G.settings.logoPoints)} voor het 1e, 2e, 3e… goede team.`;
    case 'price': return `Per product twee schattingen (nu en vroeger). Wie het dichtstbij zit krijgt de meeste punten: ${list(G.settings.pricePoints)}.`;
    case 'memory': return 'Elk goed onthouden item levert punten op. Hoe meer je je herinnert, hoe meer punten.';
    case 'hitster': {
      const bonus = round.yearBonus ?? 1;
      const yp = G.settings.hitsterYearPoints;
      const ta = G.settings.hitsterTitlePoints || G.settings.hitsterArtistPoints ? ` Bonus: ${G.settings.hitsterTitlePoints} voor de goede titel en ${G.settings.hitsterArtistPoints} voor de goede artiest.` : '';
      return bonus ? `Per liedje: ${G.settings.hitsterPlacePoints} punten voor de goede plek in de tijdlijn, en voor het jaartal ${yp[0]} punten als het exact klopt${yp.slice(1).map((p, i) => p ? `, ${p} bij ${i + 1} jaar ernaast` : '').join('')}.${ta} Wie als eerste ${G.settings.hitsterTarget} kaarten heeft, stopt de ronde.`
        : `Per liedje: punten voor de goede plek in de tijdlijn. Wie als eerste ${G.settings.hitsterTarget} kaarten heeft, stopt de ronde.`;
    }
    case 'draw': return 'Elke goed geraden tekening levert punten op voor het team.';
    case 'thirty': return 'Elk goed uitgelegd woord levert een punt op voor je team.';
    default: return null;
  }
}
function roundScore(team, round) {
  const { raw, max } = roundRaw(team, round);
  return max > 0 ? Math.round((raw / max) * roundPoints(round)) : 0;
}
const jokerFactor = (team, round) => (team.jokerRound === round.id ? 2 : 1);

const finalStep = () => G.steps.find((s) => s.kind === 'final') || null;
function totalBeforeFinal(team) {
  return G.rounds.reduce((sum, r) => sum + roundScore(team, r) * jokerFactor(team, r), 0);
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
  for (const st of G.steps) {
    if (st.kind !== 'tiebreak') continue;
    const s = ss(st);
    if (s.status === 'revealed' && s.winners && s.winners.includes(team.teamId)) b += 1;
  }
  return b;
}
// adjust = handmatige correcties van de quizmaster (+1/−1 enz.)
const scoreOf = (team) => totalBeforeFinal(team) + finalDelta(team) + tiebreakBonus(team) + (team.adjust || 0);
// Teams die na de slotvraag (en eerdere beslissingsvragen) gedeeld eerste staan
function tiedLeaders() {
  const list = Object.values(G.teams).map((t) => ({ id: t.teamId, score: scoreOf(t) }));
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
  const d = Object.entries(s.answers).filter(([id, v]) => (s.teams || []).includes(id) && G.teams[id] && Number.isFinite(v)).map(([id, v]) => [id, Math.abs(v - step.answer)]);
  if (!d.length) return [];
  const best = Math.min(...d.map((x) => x[1]));
  return d.filter((x) => x[1] <= best + 1e-9).map((x) => x[0]);
}

function ranking() {
  const list = Object.values(G.teams).map((t) => ({ teamId: t.teamId, name: t.name, photo: photoUrl(t.teamId), color: t.color || null, score: scoreOf(t) })).sort((a, b) => b.score - a.score || byName(a, b));
  list.forEach((item) => { item.rank = 1 + list.filter((o) => o.score > item.score).length; });
  return list;
}
function breakdown() {
  const f = finalStep();
  return {
    rounds: G.rounds.map((r) => ({ id: r.id, title: `R${r.no}`, full: r.title, max: roundPoints(r) })),
    rows: Object.values(G.teams).map((t) => ({
      name: t.name, teamId: t.teamId,
      rounds: G.rounds.map((r) => ({ pts: roundScore(t, r), joker: t.jokerRound === r.id })),
      final: f && ss(f).status === 'revealed' ? finalDelta(t) : null,
      adjust: t.adjust || 0,
      total: scoreOf(t)
    })).sort((a, b) => b.total - a.total || byName(a, b))
  };
}
// Status van een team bij de huidige stap: 'answered', 'waiting' of null (er hoeft niets)
const WAIT_KINDS = new Set(['mc', 'logo', 'price', 'song', 'joker', 'final', 'tiebreak', 'teamphoto']);
function teamNow(t) {
  const step = G.phase === 'PLAY' ? cur() : null;
  if (!step || !WAIT_KINDS.has(step.kind)) return null;
  const s = ss(step);
  const open = ['open', 'question', 'wager'].includes(s.status) || step.kind === 'joker' || step.kind === 'teamphoto';
  if (!open) return null;
  if (step.kind === 'tiebreak' && !(s.teams || []).includes(t.teamId)) return null;
  return hasAnswered(t, step) ? 'answered' : 'waiting';
}
// ---------- Internet aanwezig? (voor Spotify, iTunes en het bijwerken van de Hitster-lijsten) ----------
G.internet = null; // null = nog niet gecontroleerd
function checkInternet() {
  require('dns').lookup('api.spotify.com', (err) => {
    const now = !err;
    if (now !== G.internet) { if (G.internet !== null) LOG.info(now ? 'internet_terug' : 'internet_weg', {}); G.internet = now; try { broadcastState(); } catch (e) { quiet('stand versturen (internet)')(e); } }
  });
}
// ---------- Startklaar? Fouten (quiz kan niet veilig starten), waarschuwingen en informatie ----------
const PLAY_KINDS = ['mc', 'logo', 'price', 'memory', 'song', 'draw', 'thirty'];
function readiness() {
  const errors = [], warnings = [], info = [];
  if (!G.rounds.length) errors.push('Er staan geen rondes in het rondeplan.');
  for (const r of G.rounds) {
    const list = G.steps.filter((x) => x.round === r.id && !x.test && PLAY_KINDS.includes(x.kind));
    const label = `Ronde ${r.no} (${r.title})`;
    if (r.dynamic) { info.push(`${label}: extra muziekronde, nummers uit playlist/Hitster-Excel`); continue; }
    if (!list.length) { errors.push(`${label} heeft geen vragen.`); continue; }
    const mem = list.find((x) => x.kind === 'memory');
    if (mem && !(mem.items || []).length) errors.push(`${label}: er staan geen items op het geheugenbord.`);
    const draw = list.find((x) => x.kind === 'draw');
    if (draw && (draw.words || []).length < 3) errors.push(`${label}: te weinig tekenwoorden (${(draw.words || []).length}).`);
    const thirty = list.find((x) => x.kind === 'thirty');
    if (thirty && (thirty.cards || []).length < 2) errors.push(`${label}: te weinig 30 Seconds-kaarten (${(thirty.cards || []).length}).`);
    if (r.type === 'hitster') {
      const need = (r.startCards || 2) + 1;
      if ((r.startIds || []).length + (r.pool || []).length < need) errors.push(`${label}: te weinig liedjes (minstens ${need} nodig).`);
    }
    const n = draw ? `${(draw.words || []).length} tekenwoorden` : thirty ? `${(thirty.cards || []).length} kaarten` : mem ? `${(mem.items || []).length} items` : `${list.length} ${list.length === 1 ? 'vraag' : 'vragen'}`;
    info.push(`${label}: ${n}`);
  }
  const f = finalStep();
  if (!f) warnings.push('Er is geen slotvraag.');
  else if (!Array.isArray(f.options) || f.options.length < 2 || !Number.isInteger(f.answer)) errors.push('De slotvraag heeft geen geldige antwoorden.');
  const tests = G.steps.filter((x) => x.round === 'test' && x.kind === 'mc').length;
  if (!tests) warnings.push('Er zijn geen testvragen: je kunt vooraf niet controleren of alle telefoons werken.');
  else info.push(`${tests} testvragen`);
  for (const w of G.content.warnings || []) warnings.push(w.startsWith(MEDIA_WARNING) ? w : `⚠️ ${w}`);
  if (!G.librarySource) warnings.push('Geen Hitster-bibliotheek gevonden: extra muziekrondes zoeken direct op Spotify.');
  if (G.internet === false) {
    // Zonder internet speelt muziek alleen af met eigen audiobestanden (kolom Audio in de Excel)
    const music = G.rounds.filter((r) => r.type === 'hitster' && !r.dynamic);
    for (const r of music) {
      const ids = [...(r.startIds || []), ...(r.pool || [])];
      const noAudio = ids.filter((id) => G.songs[id] && !G.songs[id].audio).length;
      if (noAudio) warnings.push(`🌐 Geen internet: ronde ${r.no} (${r.title}) heeft ${noAudio} liedjes zonder eigen audiobestand. Die kunnen niet afgespeeld worden (Spotify en iTunes werken niet).`);
    }
    if (G.rounds.some((r) => r.dynamic)) warnings.push('🌐 Geen internet: extra muziekrondes werken alleen met eigen audiobestanden; Spotify-playlists en zoeken werken niet.');
    info.push('🌐 Offline: Spotify, iTunes, Primera-lijsten en de jaarcheck werken niet. De rest van de quiz werkt gewoon.');
  }
  return { ok: !errors.length, errors, warnings, info };
}
// Tussenstand op de tv, zonder punten: als lijst met posities, of als balkenrace die per gespeelde ronde
// laat zien hoe teams elkaar inhalen (de balken zijn verhoudingen t.o.v. de koploper, geen getallen)
function positionsPayload(mode) {
  const list = ranking().map((r) => ({ rank: r.rank, name: r.name, photo: r.photo, color: r.color }));
  if (mode !== 'race') return { mode: 'list', list };
  const played = G.rounds.filter((r) => { const last = G.steps.filter((x) => x.round === r.id).pop(); return last && last.index < G.stepIndex; });
  const all = Object.values(G.teams);
  const cum = all.map((t) => { let sum = 0; return played.map((r) => (sum += roundScore(t, r) * jokerFactor(t, r))); });
  const top = Math.max(1, ...cum.map((c) => c[c.length - 1] || 0));
  return {
    mode: 'race', list,
    rounds: played.map((r) => `Na ronde ${r.no}`),
    series: all.map((t, i) => ({ name: t.name, color: t.color || null, photo: photoUrl(t.teamId), values: cum[i].map((v) => Math.round((v / top) * 1000) / 10) }))
  };
}
// Momentum na een ronde ("X stijgt 2 plaatsen!"): vergelijk de stand vóór en na deze ronde, zonder punten te tonen
function momentumFor(round) {
  if (G.settings.momentum === false || !round) return [];
  const all = Object.values(G.teams);
  const first = G.steps.find((x) => x.round === round.id);
  if (!first || all.length < 2) return [];
  const playedBefore = G.rounds.filter((r) => { const last = G.steps.filter((x) => x.round === r.id).pop(); return r.id !== round.id && last && last.index < first.index; });
  const total = (t, list) => list.reduce((sum, r) => sum + roundScore(t, r) * jokerFactor(t, r), 0);
  return momentumMessages({
    names: all.map((t) => t.name),
    before: playedBefore.length ? all.map((t) => total(t, playedBefore)) : null,
    after: all.map((t) => total(t, [...playedBefore, round])),
    roundPoints: G.settings.roundPoints
  });
}
// Mogen spelers nu emoji's sturen? Bij uitlegschermen, 'Dit was ronde…' en tijdens de pauze
function reactionsAllowed() {
  if (G.phase !== 'PLAY') return false;
  if (G.paused) return true;
  const step = cur();
  return !!step && (step.kind === 'info' || step.kind === 'roundresult');
}
// Vooruitkijken voor de quizmaster: wat komt er hierna (en het weetje erbij), zodat je het alvast kunt aankondigen
// Korte omschrijving van een stap voor de quizmaster (bediening en telefoonbediening): waar, wat en het antwoord.
// current = true: ook muziek en tekenen inhoudelijk (titel/woorden), want dat speelt nu.
function stepSummary(st, current) {
  if (!st) return null;
  const round = G.roundById[st.round];
  const where = round ? `Ronde ${round.no}: ${round.title}` : st.round === 'test' ? 'Testvragen' : st.round === 'briefing' ? 'Uitleg van de rondes' : '';
  if (st.kind === 'mc' || st.kind === 'final') return { where, what: st.question || st.category || 'Meerkeuzevraag', extra: st.explanation || null, answer: Array.isArray(st.options) ? st.options[st.answer] : null };
  if (st.kind === 'tiebreak') return { where: 'Beslissingsvraag', what: st.question, answer: `${st.answer}${st.unit ? ' ' + st.unit : ''}` };
  if (st.kind === 'logo') return { where, what: `${st.variant === 'blur' ? 'Foto' : 'Logo'}: ${st.name}`, extra: st.explanation || null, answer: st.name };
  if (st.kind === 'price') return { where, what: `Prijs: ${st.name}`, extra: null };
  if (current && st.kind === 'song') { const song = songOf(st); return { where, what: song ? `Muziek: ${song.title} – ${song.artist}` : 'Muziek: liedje wordt gezocht…', answer: song ? String(song.year) : null }; }
  if (['memory', 'draw', 'thirty', 'song', 'joker', 'teamphoto'].includes(st.kind)) return { where, what: { memory: 'Geheugenbord', draw: 'Tekenen', thirty: '30 Seconds', song: 'Muziek: volgend liedje', joker: 'Joker inzetten', teamphoto: 'Teamfoto maken' }[st.kind], extra: null };
  if (st.kind === 'info') return { where, what: st.roundIntro ? `Nieuwe ronde: ${round ? round.title : ''}` : (st.title || 'Uitleg'), extra: st.roundIntro && round ? scoringText(round) : null };
  if (st.kind === 'roundresult') return { where, what: 'Einde van de ronde (Dit was ronde…)', extra: null };
  return { where, what: st.title || st.kind, extra: null };
}
function upNext() {
  for (let i = G.stepIndex + 1; i < Math.min(G.steps.length, G.stepIndex + 8); i++) {
    const st = G.steps[i];
    const round = G.roundById[st.round];
    const where = round ? `Ronde ${round.no}: ${round.title}` : st.round === 'test' ? 'Testvragen' : st.round === 'briefing' ? 'Uitleg van de rondes' : '';
    if (st.kind === 'mc' || st.kind === 'final') return { where, what: st.question || st.category || 'Meerkeuzevraag', extra: st.explanation || null, answer: Array.isArray(st.options) ? st.options[st.answer] : null };
    if (st.kind === 'logo') return { where, what: `${st.variant === 'blur' ? 'Foto' : 'Logo'}: ${st.name}`, extra: st.explanation || null };
    if (st.kind === 'price') return { where, what: `Prijs: ${st.name}`, extra: null };
    if (['memory', 'draw', 'thirty', 'song', 'joker', 'teamphoto'].includes(st.kind)) return { where, what: { memory: 'Geheugenbord', draw: 'Tekenen', thirty: '30 Seconds', song: 'Muziek: volgend liedje', joker: 'Joker inzetten', teamphoto: 'Teamfoto maken' }[st.kind], extra: null };
    if (st.kind === 'info' && st.roundIntro) return { where, what: `Nieuwe ronde: ${round ? round.title : ''}`, extra: round ? scoringText(round) : null };
    if (st.kind === 'roundresult') return { where, what: 'Einde van de ronde (Dit was ronde…)', extra: null };
  }
  return null;
}
// ---------- Awards na de ontknoping ----------
const ROUND_AWARD = {
  mc: ['🧠', 'Bollebozen'], blur: ['🦅', 'Arendsogen'], logo: ['🏷️', 'Merkenkenners'], memory: ['🐘', 'Olifantengeheugen'],
  hitster: ['🎵', 'Muziekkenners'], price: ['💰', 'Prijzenkenners'], draw: ['🎨', 'Beste tekenaars'], thirty: ['🗣️', 'Kletskampioenen']
};
function awards() {
  const list = Object.values(G.teams);
  if (list.length < 2) return [];
  const out = [];
  const best = (fn, min = 1) => {
    const vals = list.map((t) => ({ t, v: fn(t) })).filter((x) => Number.isFinite(x.v) && x.v >= min);
    if (!vals.length) return null;
    const top = Math.max(...vals.map((x) => x.v));
    const winners = vals.filter((x) => x.v === top).map((x) => x.t);
    return winners.length < list.length ? { teams: winners, v: top } : null; // iedereen gelijk = geen award
  };
  const team = (t) => ({ name: t.name, photo: photoUrl(t.teamId), color: t.color || null });
  const add = (emoji, title, r, detail) => { if (r) out.push({ emoji, title, teams: r.teams.map(team), detail: detail(r.v) }); };
  // per ronde: het team met de meeste punten (per soort ronde, extra rondes tellen mee)
  const byKind = {};
  G.rounds.forEach((r) => { const k = r.type === 'mc' && r.variant === 'blur' ? 'blur' : r.type === 'logo' && r.variant === 'blur' ? 'blur' : r.type; (byKind[k] = byKind[k] || []).push(r); });
  for (const [kind, rs] of Object.entries(byKind)) {
    const a = ROUND_AWARD[kind];
    if (!a) continue;
    add(a[0], a[1], best((t) => rs.reduce((sum, r) => sum + roundScore(t, r), 0)), (v) => `${v} punten in ${rs.length > 1 ? 'deze rondes' : rs[0].title}`);
  }
  add('⚡', 'Snelle jongens', best((t) => statOf(t.teamId).firsts), (v) => `${v}× als eerste geantwoord`);
  const f = finalStep();
  if (f) {
    const fs_ = ss(f);
    add('🎲', 'Durfallen', best((t) => (fs_.wagers ? Number(fs_.wagers[t.teamId]) : NaN)), (v) => `${v} punten ingezet op de slotvraag`);
  }
  add('🃏', 'Jokermeesters', best((t) => { const r = G.rounds.find((x) => x.id === t.jokerRound); return r ? roundScore(t, r) : NaN; }), (v) => `${v} punten in hun jokerronde`);
  // Grootste comeback: van een lage plek na de eerste rondes naar een veel betere plek aan het eind
  const played = G.rounds.filter((r) => list.some((t) => roundScore(t, r) > 0));
  if (played.length >= 3) {
    const early = played.slice(0, Math.ceil(played.length / 3));
    const rankAt = (fn) => { const vals = list.map((t) => ({ t, v: fn(t) })); const pos = new Map(); vals.forEach((x) => pos.set(x.t.teamId, 1 + vals.filter((y) => y.v > x.v).length)); return pos; };
    const before = rankAt((t) => early.reduce((sum, r) => sum + roundScore(t, r) * jokerFactor(t, r), 0));
    const after = rankAt((t) => scoreOf(t));
    add('🚀', 'Grootste comeback', best((t) => before.get(t.teamId) - after.get(t.teamId)), (v) => `${v} ${v === 1 ? 'plek' : 'plekken'} gestegen sinds het begin`);
  }
  // Snelste foute antwoord: het vaakst als eerste geantwoord bij een meerkeuzevraag… en dan fout
  const firstWrong = {};
  for (const step of G.steps.filter((x) => x.kind === 'mc' && !x.test)) {
    const st = ss(step);
    const first = Object.entries(st.answers || {}).filter(([id, a]) => G.teams[id] && a && a.t).sort((a, b) => a[1].t - b[1].t)[0];
    if (first && first[1].v !== step.answer && !st.voided) firstWrong[first[0]] = (firstWrong[first[0]] || 0) + 1;
  }
  add('🏃', 'Snelste foute antwoord', best((t) => firstWrong[t.teamId] || 0), (v) => `${v}× als eerste geantwoord… en net mis`);
  // Jokerpech: de jokerronde werd de slechtste ronde van het team
  const pech = list.filter((t) => { const jr = G.rounds.find((x) => x.id === t.jokerRound); if (!jr || played.length < 2) return false; const mine = roundScore(t, jr); return played.every((r) => r.id === jr.id || roundScore(t, r) >= mine) && played.some((r) => r.id !== jr.id && roundScore(t, r) > mine); });
  if (pech.length && pech.length < list.length) out.push({ emoji: '🙈', title: 'Jokerpech', teams: pech.map(team), detail: 'de jokerronde werd net hun slechtste ronde' });
  add('🕵️', 'Spiekkoningen', best((t) => statOf(t.teamId).cheatSteps.length), (v) => `${v}× betrapt bij het wegkijken`);
  const rk = ranking();
  const second = rk.filter((x) => x.rank === 2), firstScore = rk.length ? rk[0].score : 0;
  if (second.length && second.length < list.length) out.push({ emoji: '😅', title: 'Net niet', teams: second.map((x) => team(G.teams[x.teamId])), detail: `maar ${firstScore - second[0].score} punten tekort voor de winst` });
  const lastRank = rk.length ? rk[rk.length - 1].rank : 0;
  const last = rk.filter((x) => x.rank === lastRank && x.rank > 2);
  if (last.length && last.length < list.length) out.push({ emoji: '💪', title: 'Volhouders', teams: last.map((x) => team(G.teams[x.teamId])), detail: 'tot het eind gestreden, volgend jaar beter!' });
  return out;
}
// ---------- Fotoalbum: teamfoto's en tekeningen van de avond ----------
function album() {
  const slides = [];
  const rk = ranking();
  for (const r of rk) if (G.teamPhotos[r.teamId]) slides.push({ kind: 'photo', name: r.name, photo: photoUrl(r.teamId), color: G.teams[r.teamId] ? G.teams[r.teamId].color : null, rank: r.rank });
  for (const p of pausePhotos.slice(-60)) slides.push({ kind: 'pause', name: p.team, photo: pausePhotoUrl(p), color: null, label: p.label });
  for (const step of G.steps.filter((x) => x.kind === 'draw')) {
    const s = ss(step);
    (s.turns || []).forEach((turn) => {
      if (!turn || !turn.done) return;
      for (const t of Object.values(G.teams)) {
        const strokes = turn.strokes[t.teamId];
        if (!turn.words[t.teamId] || !strokes || !strokes.length) continue;
        const d = G.devices[turn.drawers[t.teamId]];
        slides.push({ kind: 'drawing', name: t.name, color: t.color || null, drawer: d ? d.label : '', word: turn.words[t.teamId].word, ok: !!turn.ok[t.teamId], strokes });
      }
    });
  }
  return slides;
}
// ---------- Hall of fame: winnaars van eerdere quizzen (uit de quizgeschiedenis) ----------
const hallOfFame = () => G.historyEntries.filter((e) => e && Array.isArray(e.winners) && e.winners.length).slice(0, 6)
  .map((e) => ({ date: e.completedAt, winners: e.winners, teams: e.teamCount || null }));
function roundStandings(round) {
  return Object.values(G.teams).map((t) => ({
    name: t.name,
    teamId: t.teamId,
    photo: photoUrl(t.teamId),
    color: t.color || null,
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
    case 'teamphoto': return !!G.teamPhotos[id] || !!s.skipped[id];
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
    if (s.songId && G.songs[s.songId]) return G.songs[s.songId];
    const round = G.roundById[step.round];
    if (playlistFirst(round)) { if (!s.waitSince) s.waitSince = Date.now(); return null; } // de bediening haalt een nummer uit de playlist
    const used = new Set(usedSongKeys());
    const primary = (round && round.pool || []).filter((id) => G.songs[id] && !used.has(G.songs[id].key));
    const fallback = (round && round.fallbackPool || []).filter((id) => G.songs[id] && !used.has(G.songs[id].key));
    const pool = primary.length ? primary : fallback;
    if (pool.length) { s.songId = pool[Math.floor(Math.random() * pool.length)]; return G.songs[s.songId]; }
    return null;
  }
  if (!s.songId || !G.songs[s.songId]) {
    const round = G.roundById[step.round];
    const pool = (round && (step.test ? round.practicePool : round.pool)) || [];
    const used = new Set(G.steps.filter((x) => x.kind === 'song' && x.id !== step.id).map((x) => G.ssAll[x.id] && G.ssAll[x.id].songId).filter((id) => G.songs[id]).map((id) => G.songs[id].key));
    const starts = new Set(((round && round.startIds) || []).map((id) => G.songs[id].key));
    const free = pool.filter((id) => !used.has(G.songs[id].key) && !starts.has(G.songs[id].key));
    s.songId = free.length ? free[Math.floor(Math.random() * free.length)] : pool[0];
  }
  return G.songs[s.songId];
}
// Heeft een team het doel (standaard 10 kaarten) gehaald? Dan stopt de muziekronde.
const hitsterDone = (roundId) => Object.values(G.teams).some((t) => t.timelines && t.timelines[roundId] && t.timelines[roundId].length >= G.settings.hitsterTarget);

function revealSong(step) {
  const s = ss(step);
  if (s.status === 'revealed') return;
  const song = songOf(step);
  s.results = {};
  for (const team of Object.values(G.teams)) {
    const slot = s.placements[team.teamId];
    if (slot === undefined) continue;
    const tl = ensureTimeline(team, step.round);
    const left = slot > 0 ? G.songs[tl[slot - 1]] : null;
    const right = slot < tl.length ? G.songs[tl[slot]] : null;
    const ok = (!left || left.year <= song.year) && (!right || song.year <= right.year);
    const guess = s.years[team.teamId];
    s.results[team.teamId] = { slot, ok, yearGuess: guess === undefined ? null : guess, exact: guess === song.year };
    if (ok && !step.test) tl.splice(slot, 0, song.id); // oefenliedje: alleen kijken of het goed lag
  }
  // titel en artiest: alvast een voorstel (lijkt het genoeg?); de quizmaster kan het in de bediening aanpassen
  s.judge = {};
  for (const [teamId, g] of Object.entries(s.guesses || {})) s.judge[teamId] = { title: looksLike(g.title, song.title), artist: looksLike(g.artist, song.artist), auto: true };
  s.status = 'revealed';
}

// Lijkt een ingevuld antwoord genoeg op het goede antwoord? (hoofdletters, leestekens, "the", toevoegingen
// tussen haakjes en kleine tikfouten maken niet uit)
function looksLike(guess, answer) {
  const n = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\(.*?\)|\[.*?\]/g, ' ')
    .replace(/\b(feat|ft)\b.*$/, ' ').replace(/^the\s+/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const g = n(guess), a = n(answer);
  if (!g || !a) return false;
  if (g === a) return true;
  // meerdere artiesten: één van de namen goed is genoeg
  if (a.includes(' and ') && a.split(' and ').some((part) => part.trim() && looksLike(guess, part))) return true;
  if (g.length >= 4 && (a.includes(g) || g.includes(a)) && Math.min(g.length, a.length) / Math.max(g.length, a.length) > 0.6) return true;
  // kleine tikfouten: hoogstens 1 fout per 5 letters
  const d = (x, y) => { const m = Array.from({ length: x.length + 1 }, (_, i) => [i]); for (let j = 1; j <= y.length; j++) m[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return m[x.length][y.length]; };
  return d(g, a) <= Math.max(1, Math.floor(a.length / 5));
}
// Elke muziekronde heeft een eigen tijdlijn per team (een extra ronde begint opnieuw met startkaarten)
function dynamicStartIds(roundId) {
  const round = G.roundById[roundId];
  const online = G.dynStart[roundId] || [];
  if (playlistFirst(round)) return [...online]; // startkaarten komen uit de playlist
  // terugval: eerst wat er al uit de playlist kwam, aangevuld met de startkaarten uit de Excel
  const seen = new Set(online.map((id) => G.songs[id] && G.songs[id].key));
  const fromExcel = (round && round.startIds || []).filter((id) => G.songs[id] && !seen.has(G.songs[id].key));
  return [...online, ...fromExcel].slice(0, Math.max(online.length, (round && round.startCards) || 2));
}
function dynamicStartReady(roundId) {
  const round = G.roundById[roundId];
  return !round || dynamicStartIds(roundId).length >= (round.startCards || 2);
}
function ensureTimeline(team, roundId) {
  team.timelines = team.timelines || {};
  if (!team.timelines[roundId]) {
    const round = G.roundById[roundId];
    const start = round && round.dynamic ? dynamicStartIds(roundId) : round && round.startIds;
    if (round && round.dynamic && !dynamicStartReady(roundId)) return [];
    team.timelines[roundId] = start ? [...start].filter((id) => G.songs[id]).sort((a, b) => G.songs[a].year - G.songs[b].year) : [];
  }
  return team.timelines[roundId];
}

function settle() {
  if (G.paused || G.phase !== 'PLAY') return;
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

// Viel de basistelefoon weg tijdens een open meerkeuzevraag en is de vraag intussen gesloten, dan mag
// alléén dat team nog antwoorden (een 'late kans'). De vraag gaat niet voor iedereen opnieuw open, en een
// team dat de hele tijd verbonden was (of pas later online kwam) krijgt geen extra kans.
function reopenIfMissed(team) {
  const step = cur();
  if (!team || !step || step.kind !== 'mc' || step.variant !== 'text' || G.settings.timerEnabled) return;
  const s = ss(step);
  if (s.status !== 'closed' || s.voided || !teamConnected(team) || s.answers[team.teamId]) return;
  if (!(s.dropped && s.dropped[team.teamId])) return;
  s.late = s.late || {};
  s.late[team.teamId] = true;
  LOG.info('late_kans', { team: team.name, vraag: step.id });
}
// Basistelefoon valt weg tijdens een open meerkeuzevraag: onthouden (voor de late kans hierboven)
function noteDropped(device) {
  const team = device && G.teams[device.teamId];
  const step = cur();
  if (!team || team.baseDeviceId !== device.deviceId || !step || step.kind !== 'mc') return;
  const s = ss(step);
  if (s.status === 'open' && !s.answers[team.teamId]) (s.dropped = s.dropped || {})[team.teamId] = true;
}

// ---------------------------------------------------------------
// Stappen betreden
// ---------------------------------------------------------------
function startMcTimer(step) {
  if (!G.settings.timerEnabled || step.variant !== 'text') return;
  const secs = step.time ?? G.settings.defaultTime;
  if (secs > 0) timerStart(secs * 1000, 'mc');
}
// Leestijd bij meerkeuze: eerst de vraag ('reading'), dan de antwoorden zichtbaar ('showing'), dan open (de klok start
// dan pas). Tijdens de pauze staat het stil.
let readTimer = null;
const isReading = (s) => s.status === 'reading' || s.status === 'showing';
function scheduleOpen(step) {
  clearTimeout(readTimer);
  const s = ss(step);
  if (!isReading(s)) return;
  if (G.paused) return; // bij hervatten opnieuw ingepland
  readTimer = setTimeout(() => {
    try {
      const st = ss(step);
      if (cur() !== step || !isReading(st) || G.paused) return;
      if (st.status === 'reading' && G.settings.previewSeconds > 0) {
        st.status = 'showing'; // nu de antwoorden in beeld, nog even niet kiezen
        st.readUntil = Date.now() + G.settings.previewSeconds * 1000;
        scheduleOpen(step);
      } else openAnswers(step);
      sync();
    } catch (e) { reportError('leestijd', e); }
  }, Math.max(0, (s.readUntil || 0) - Date.now()));
}
function openAnswers(step) {
  const s = ss(step);
  if (!isReading(s)) return;
  clearTimeout(readTimer);
  s.status = 'open';
  s.readDone = true;
  delete s.readUntil; delete s.readLeft;
  startMcTimer(step);
}
// Pauze tijdens de leestijd: resterende tijd bewaren; bij hervatten weer verder tellen
function pauseReading(on) {
  const step = cur();
  if (!step || step.kind !== 'mc') return;
  const s = ss(step);
  if (!isReading(s)) return;
  if (on) { s.readLeft = Math.max(0, (s.readUntil || 0) - Date.now()); clearTimeout(readTimer); }
  else { s.readUntil = Date.now() + (s.readLeft ?? 0); delete s.readLeft; scheduleOpen(step); }
}
function enterStep() {
  G.musicPaused = false; // nieuwe stap: muziek speelt weer gewoon
  timerClear();
  G.review = null;
  G.showStandings = false;
  const step = cur();
  if (!step) return;
  const s = ss(step);
  // Meerkeuze: eerst alleen de vraag (leestijd), pas daarna antwoorden. Alleen de eerste keer; bij terugbladeren
  // naar een vraag die al open was niet opnieuw. Na een herstart midden in de leestijd loopt die gewoon verder.
  // Volgorde: 'reading' (alleen de vraag) → 'showing' (antwoorden in beeld, nog niet kiezen) → 'open'.
  if (step.kind === 'mc' && step.variant === 'text' && s.status === 'open' && !s.readDone && !Object.keys(s.answers).length) {
    if (G.settings.readSeconds > 0) { s.status = 'reading'; s.readUntil = Date.now() + G.settings.readSeconds * 1000; }
    else if (G.settings.previewSeconds > 0) { s.status = 'showing'; s.readUntil = Date.now() + G.settings.previewSeconds * 1000; }
  }
  if (step.kind === 'mc' && (s.status === 'reading' || s.status === 'showing')) scheduleOpen(step);
  if (step.kind === 'mc' && s.status === 'open') startMcTimer(step);
  if (step.kind === 'draw' && !s.plan) planDraw(step);
  if (step.kind === 'thirty' && !s.order) planThirty(step);
  if (step.kind === 'song') {
    if (step.dynamic) {
      const song = songOf(step); // probeer eerst de Excel-bibliotheek
      s.status = song && dynamicStartReady(step.round) ? 'open' : 'loading';
    }
    Object.values(G.teams).forEach((t) => ensureTimeline(t, step.round));
  }
  if (step.kind === 'tiebreak' && !s.teams) s.teams = tiedLeaders();
  // Spiekmeldingen horen bij vragen; bij andere schermen weer opruimen
  if (!cheatSensitive(step)) G.alerts = {};
}
const cheatSensitive = (step) => ['mc', 'price', 'song', 'memory', 'final', 'tiebreak', 'logo'].includes(step.kind);

// Spiekmelding pas na een korte wachttijd: even de meldingenbalk omlaag trekken, een WhatsApp-pop-up of het
// bedieningspaneel van de iPhone geeft dan geen alarm. Is de telefoon binnen de wachttijd terug, dan gebeurt er niets.
// De wachttijd stelt de quizmaster in (0–5 s, standaard 1 s); CHEAT_GRACE_MS (ms) overschrijft dat, voor tests.
const cheatGraceMs = () => (process.env.CHEAT_GRACE_MS !== undefined ? Math.max(0, Number(process.env.CHEAT_GRACE_MS) || 0) : Math.max(0, Math.min(5, Number(G.settings.cheatGrace ?? 1))) * 1000);
// Telefoon is weg tijdens een vraag (app verlaten, scherm op slot of verbinding weg): na de wachttijd melden
function startCheatWait(device, step) {
  if (!device || !step || !cheatSensitive(step) || G.paused || G.phase !== 'PLAY' || !G.teams[device.teamId]) return;
  if (G.alerts[device.deviceId] || cheatPending[device.deviceId]) return; // al gemeld of al aan het wachten
  const deviceId = device.deviceId, stepId = step.id;
  const wait = cheatGraceMs();
  if (!wait) return raiseCheat(deviceId, stepId);
  cheatPending[deviceId] = setTimeout(() => {
    try { raiseCheat(deviceId, stepId); } catch (e) { reportError('spiekmelding', e); }
  }, wait);
}
const cheatPending = {}; // deviceId -> timer
function cancelCheat(deviceId) {
  if (cheatPending[deviceId]) { clearTimeout(cheatPending[deviceId]); delete cheatPending[deviceId]; }
}
function raiseCheat(deviceId, stepId) {
  delete cheatPending[deviceId];
  const step = cur();
  const device = G.devices[deviceId];
  const team = device && G.teams[device.teamId];
  // intussen naar een andere vraag, op pauze, of telefoon/team weg? Dan geen melding
  if (!step || step.id !== stepId || !cheatSensitive(step) || G.paused || G.phase !== 'PLAY' || !team) return;
  const cs = statOf(team.teamId).cheatSteps;
  if (!cs.includes(step.id)) cs.push(step.id);
  G.alerts[deviceId] = {
    key: deviceId, teamName: team.name, label: device.label,
    reason: 'away',
    timestamp: new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' })
  };
  io.to('remote_room').emit('cheat_beep', G.alerts[deviceId]);
  broadcastState();
}

const tiebreakPlayed = () => G.steps.some((x) => x.kind === 'tiebreak' && G.ssAll[x.id] && (G.ssAll[x.id].teams || []).length);
function finishQuiz() {
  if (G.phase === 'END') return;
  G.phase = 'END'; G.reveal = 'idle'; G.endView = 'ranking'; G.review = null; G.showStandings = false; G.showPositions = false; timerClear();
  LOG.info('quiz_einde', {}); setTimeout(() => backupNow('einde'), 500);
  archiveFinishedQuiz();
}
function next() {
  if (G.stepIndex + 1 >= G.steps.length) return finishQuiz();
  G.stepIndex++;
  enterStep();
  // Beslissingsvragen alleen stellen als er echt een gelijke stand op de eerste plaats is
  while (G.phase === 'PLAY' && ((cur().kind === 'tiebreak' && !(ss(cur()).teams || []).length) || (cur().kind === 'song' && !cur().test && hitsterDone(cur().round)) || (cur().noTie && tiebreakPlayed()))) {
    if (G.stepIndex + 1 >= G.steps.length) return finishQuiz();
    G.stepIndex++;
    enterStep();
  }
}

// ---------------------------------------------------------------
// Ronde: geheugen
// ---------------------------------------------------------------
function startWriting(step) {
  const s = ss(step);
  s.status = 'writing';
  Object.values(G.teams).forEach((t) => { if (!s.entries[t.teamId]) s.entries[t.teamId] = []; });
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
  Object.values(G.teams).forEach((t) => { members[t.teamId] = teamDevices(t).map((d) => d.deviceId); });
  s.plan = { members };
  s.turn = 0;
  s.turns = [];
  s.used = [];
  s.drew = {};
  s.status = 'ready';
  s.total = Math.max(0, ...Object.values(G.teams).map((t) => drawPlanTurns(s, t)));
  if (!s.total) s.status = 'result';
  else assignDrawTurn(step); // tekenaars meteen aanwijzen, zodat ze zich kunnen klaarmaken vóór de start
}
// Teams die deze beurt meedoen: er tekent iemand en de basistelefoon is verbonden
function eligibleDrawTeams(step, turn) {
  return Object.values(G.teams).filter((t) => turn && turn.drawers[t.teamId] && G.devices[turn.drawers[t.teamId]] && G.devices[turn.answerers[t.teamId]] && G.devices[turn.answerers[t.teamId]].connected);
}
// Beurt voorbereiden: per team een tekenaar en een woord kiezen. De status blijft 'ready': tv en telefoons laten
// zien wie er gaat tekenen (het woord nog niet), en de quizmaster start de beurt als iedereen klaar is.
function assignDrawTurn(step) {
  const s = ss(step);
  s.drew = s.drew || {};
  const pool = step.words.length ? step.words : [{ word: 'Fiets', alt: [] }];
  const usedElsewhere = new Set(G.steps.filter((x) => x.kind === 'draw' && x.id !== step.id).flatMap((x) => ((G.ssAll[x.id] && G.ssAll[x.id].turns) || []).flatMap((t) => (t ? Object.values(t.words).map((w) => w.word) : []))));
  let free = pool.map((_, i) => i).filter((i) => !s.used.includes(i) && !usedElsewhere.has(pool[i].word));
  if (!free.length) free = pool.map((_, i) => i).filter((i) => !s.used.includes(i));
  if (!free.length) { s.used = []; free = pool.map((_, i) => i); }
  const turn = { words: {}, drawers: {}, answerers: {}, strokes: {}, answers: {}, ok: {}, done: false };
  const picks = shuffle(free);
  let k = 0;
  for (const team of Object.values(G.teams).sort(bySeq)) {
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
}
function startDrawTurn(step) {
  const s = ss(step);
  if (!s.turns[s.turn]) assignDrawTurn(step);
  const turn = s.turns[s.turn];
  // Is een aangewezen tekenaar intussen weg (telefoon uit of uit het team)? Dan iemand anders die nog niet tekende
  for (const team of Object.values(G.teams)) {
    const cur = turn.drawers[team.teamId];
    if (!cur || (G.devices[cur] && G.devices[cur].connected)) continue;
    const done = (s.drew[team.teamId] || []).filter((id) => id !== cur);
    const alt = teamDevices(team).find((d) => d.connected && d.deviceId !== cur && !done.includes(d.deviceId));
    if (!alt) continue;
    s.drew[team.teamId] = [...done, alt.deviceId];
    turn.drawers[team.teamId] = alt.deviceId;
    const others = teamDevices(team).filter((d) => d.deviceId !== alt.deviceId);
    turn.answerers[team.teamId] = alt.deviceId !== team.baseDeviceId ? team.baseDeviceId : ((others.find((d) => d.connected) || others[0]) || {}).deviceId;
  }
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
  const lists = Object.values(G.teams).sort(bySeq).map((t) => ({ t, members: teamDevices(t) }));
  const maxM = Math.max(0, ...lists.map((l) => l.members.length));
  s.order = [];
  for (let k = 0; k < maxM; k++) for (const l of lists) if (l.members[k]) s.order.push({ teamId: l.t.teamId, deviceId: l.members[k].deviceId });
  const usedCards = new Set(G.steps.filter((x) => x.kind === 'thirty' && x.id !== step.id).flatMap((x) => ((G.ssAll[x.id] && G.ssAll[x.id].turns) || []).map((t) => t && t.words.join('|'))));
  const idx = step.cards.map((_, i) => i);
  s.cardOrder = [...shuffle(idx.filter((i) => !usedCards.has(step.cards[i].join('|')))), ...shuffle(idx.filter((i) => usedCards.has(step.cards[i].join('|'))))];
  s.turn = 0;
  s.turns = [];
  s.status = s.order.length ? 'ready' : 'finished';
}
// Naar de volgende 30 Seconds-beurt. Iedereen komt aan de beurt: spelers die later aansloten komen achteraan
// in de rij, en is de volgende uitlegger even niet verbonden, dan schuift die (één keer) door naar achteren.
function advanceThirty(step) {
  const s = ss(step);
  s.turn++;
  const inOrder = new Set(s.order.map((o) => o.deviceId));
  for (const t of Object.values(G.teams).sort(bySeq)) for (const d of teamDevices(t)) if (!inOrder.has(d.deviceId)) { s.order.push({ teamId: t.teamId, deviceId: d.deviceId }); inOrder.add(d.deviceId); }
  s.requeued = s.requeued || [];
  for (let guard = 0; guard < 50 && s.turn < s.order.length; guard++) {
    const o = s.order[s.turn];
    const d = G.devices[o.deviceId];
    if (!d || !G.teams[d.teamId]) { s.order.splice(s.turn, 1); continue; } // speler is weg uit de quiz
    if (d.teamId !== o.teamId) o.teamId = d.teamId; // van team gewisseld
    if (d.connected || s.requeued.includes(o.deviceId)) break;
    if (!s.order.slice(s.turn + 1).some((x) => G.devices[x.deviceId] && G.devices[x.deviceId].connected)) break;
    s.order.push(...s.order.splice(s.turn, 1));
    s.requeued.push(o.deviceId);
  }
  if (s.turn < s.order.length) s.status = 'ready';
  else { s.turn = Math.max(0, s.order.length - 1); s.status = 'result'; } // niemand meer over: ronde kan afgesloten
}
function startThirty(step) {
  const s = ss(step);
  const o = s.order[s.turn];
  const card = step.cards[s.cardOrder[s.turn % Math.max(1, s.cardOrder.length)]] || ['?', '?', '?', '?', '?'];
  s.turns.push({ teamId: o.teamId, deviceId: o.deviceId, words: card, ok: [false, false, false, false, false], done: false });
  s.status = 'running';
  timerStart((step.seconds || G.settings.thirtySeconds) * 1000, 'thirty');
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
// Nakijken-pagina's: zie lib/review.js (krijgt de live spelstand via getters)
const { reviewPages } = require('./lib/review').createReview({
  state: () => ({ rounds: G.rounds, teams: G.teams, steps: G.steps, devices: G.devices }),
  byName, ss: (st) => ss(st), logoAwards: (st) => logoAwards(st), mcAward: (...a) => mcAward(...a), songOf: (st) => songOf(st),
  songAward: (...a) => songAward(...a), priceAwards: (st) => priceAwards(st), finalDelta: (...a) => finalDelta(...a), finalStep: () => finalStep()
});

// ---------------------------------------------------------------
// Opslaan en hervatten
// ---------------------------------------------------------------
G.saveTimer = null;
function loadHistory() {
  const saved = readJsonWithBackup(HISTORY_FILE, isHistorySnapshot);
  G.historyEntries = saved ? saved.data.entries.slice(0, HISTORY_LIMIT) : [];
  if (saved && saved.source === 'backup') console.warn('De quizgeschiedenis is hersteld uit de reservekopie.');
}
function saveHistory() {
  writeJsonWithBackup(HISTORY_FILE, { version: HISTORY_VERSION, entries: G.historyEntries });
}
function archiveFinishedQuiz() {
  if (!G.gameId || G.historyEntries.some((entry) => entry.gameId === G.gameId)) return;
  if (Object.values(G.teams).some((t) => t.bot)) return; // oefenquiz met testteams niet in de geschiedenis
  const entry = createHistoryEntry({
    gameId: G.gameId,
    completedAt: new Date().toISOString(),
    quiz: G.quizSource,
    theme: G.settings.theme,
    ranking: ranking(),
    breakdown: breakdown()
  });
  G.historyEntries = appendHistory(G.historyEntries, entry, HISTORY_LIMIT);
  try { saveHistory(); }
  catch (error) { console.error('Quizgeschiedenis opslaan mislukt:', error.message); }
}

function scheduleSave() {
  if (G.saveTimer) return;
  G.saveTimer = setTimeout(() => { G.saveTimer = null; saveNow(); }, 250);
}
function saveNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const snapshot = {
      version: 2, savedAt: new Date().toISOString(),
      phase: G.phase, stepIndex: G.stepIndex, paused: G.paused, reveal: G.reveal, revealN: G.revealN, lobbyStage: G.lobbyStage, endView: G.endView, settings: G.settings, seq: G.seq, ssAll: G.ssAll, dynSongs: G.dynSongs, dynStart: G.dynStart, gameId: G.gameId, yearFixes: G.yearFixes, rejectedKeys: G.rejectedKeys, awardStats: G.awardStats, playlistFailed: G.playlistFailed,
      timer: { tag: timer.tag, totalMs: timer.totalMs, remainingMs: Math.round(remainingNow()) },
      teams: G.teams,
      undoHistory: G.undoHistory,
      devices: Object.fromEntries(Object.entries(G.devices).map(([id, d]) => [id, { deviceId: d.deviceId, memberId: d.memberId, teamId: d.teamId, label: d.label, seq: d.seq, ...(d.bot ? { bot: true } : {}) }]))
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
  if (!data || data.version !== 2 || typeof data.teams !== 'object' || !G.steps.length) return false;

  G.teams = {};
  for (const t of Object.values(data.teams)) {
    if (!t || !t.teamId || !t.name) continue;
    G.teams[t.teamId] = { teamId: t.teamId, name: t.name, seq: t.seq || ++G.seq, baseDeviceId: t.baseDeviceId, jokerRound: t.jokerRound || null, timelines: t.timelines && typeof t.timelines === 'object' ? t.timelines : {}, proposal: null, color: TEAM_COLORS.includes(t.color) ? t.color : null, adjust: Number.isFinite(t.adjust) ? t.adjust : 0, ...(t.bot ? { bot: true } : {}) };
  }
  G.devices = {};
  for (const d of Object.values(data.devices || {})) {
    if (!d || !G.teams[d.teamId]) continue;
    G.devices[d.deviceId] = { deviceId: d.deviceId, memberId: d.memberId || newId('m_'), teamId: d.teamId, label: d.label || 'Telefoon', seq: d.seq || ++G.seq, socketId: d.bot ? `bot_${d.deviceId}` : null, connected: !!d.bot, ...(d.bot ? { bot: true } : {}) };
  }
  for (const t of Object.values(G.teams)) if (!t.color) t.color = pickColor();
  for (const t of Object.values(G.teams)) {
    if (!G.devices[t.baseDeviceId]) { const first = teamDevices(t)[0]; if (first) t.baseDeviceId = first.deviceId; }
  }
  G.seq = Math.max(G.seq, data.seq || 0, ...Object.values(G.teams).map((t) => t.seq), ...Object.values(G.devices).map((d) => d.seq));
  G.settings = sanitizeSettings(data.settings, G.settings);
  // Oude standaard voor het jaartal (5-3-1-1) bijwerken naar de nieuwe (5-3-2-1): 2 jaar ernaast geeft nu 2 punten
  if (JSON.stringify(G.settings.hitsterYearPoints) === '[5,3,1,1]') G.settings.hitsterYearPoints = [5, 3, 2, 1];
  // Leestijd uit de vorige versie (5 s in één keer) omzetten naar de nieuwe indeling: 2 s vraag + 2 s antwoorden
  if (data.settings && data.settings.previewSeconds === undefined && G.settings.readSeconds === 5) G.settings.readSeconds = 2;
  G.yearFixes = data.yearFixes && typeof data.yearFixes === 'object' ? data.yearFixes : {};
  G.rejectedKeys = Array.isArray(data.rejectedKeys) ? data.rejectedKeys.filter((k) => typeof k === 'string') : [];
  for (const song of Object.values(G.songs)) if (song && G.yearFixes[song.key]) { song.year = G.yearFixes[song.key]; song.verified = true; }
  G.gameId = typeof data.gameId === 'string' ? data.gameId : null;
  G.dynSongs = data.dynSongs && typeof data.dynSongs === 'object' ? data.dynSongs : {};
  G.dynStart = data.dynStart && typeof data.dynStart === 'object' ? data.dynStart : {};
  G.playlistFailed = data.playlistFailed && typeof data.playlistFailed === 'object' ? data.playlistFailed : {};
  compileQuiz(G.content.warnings);
  G.ssAll = data.ssAll && typeof data.ssAll === 'object' ? data.ssAll : {};
  G.undoHistory = Array.isArray(data.undoHistory) ? data.undoHistory.slice(-UNDO_LIMIT) : [];
  G.phase = ['LOBBY', 'PLAY', 'END'].includes(data.phase) ? data.phase : 'LOBBY';
  // Oude opgeslagen quizzen van vóór de geschiedenisfunctie krijgen alsnog een sessie-ID.
  if (G.phase !== 'LOBBY' && !G.gameId) G.gameId = crypto.randomUUID();
  G.stepIndex = Math.min(Math.max(Number.isInteger(data.stepIndex) ? data.stepIndex : 0, 0), G.steps.length - 1);
  G.reveal = ['idle', 'stepping', 'done'].includes(data.reveal) ? data.reveal : 'idle';
  G.revealN = Number.isInteger(data.revealN) ? data.revealN : 0;
  G.lobbyStage = data.lobbyStage === 'join' ? 'join' : 'welcome';
  G.endView = END_VIEWS.includes(data.endView) ? data.endView : 'ranking';
  G.awardStats = data.awardStats && typeof data.awardStats === 'object' ? data.awardStats : {};
  if (data.timer && data.timer.tag) { timer.tag = data.timer.tag; timer.totalMs = Number(data.timer.totalMs) || 0; timer.remainingMs = Number(data.timer.remainingMs) || 0; }
  // Teams komen pas langzaam terug na een herstart: begin dus op pauze
  G.paused = G.phase === 'PLAY';
  return Object.keys(G.teams).length > 0 || G.phase !== 'LOBBY';
}

// ---------------------------------------------------------------
// Wat welk scherm te zien krijgt
// ---------------------------------------------------------------
function progressOf(step) {
  if (!step) return null;
  if (step.test) return { label: step.round === 'test' ? 'Testvraag' : 'Oefenvraag' };
  const items = G.steps.filter((s) => s.round === step.round && ['mc', 'song', 'price', 'logo'].includes(s.kind) && !s.test);
  const i = items.findIndex((s) => s.id === step.id);
  return i >= 0 ? { n: i + 1, total: items.length } : null;
}

function teamChips(step) {
  return Object.values(G.teams).map((t) => ({ teamId: t.teamId, name: t.name, connected: teamConnected(t), answered: hasAnswered(t, step) })).sort(byName);
}
function mcResultTeams(step) {
  return Object.values(G.teams).map((t) => { const a = mcAward(step, t); return { name: t.name, ok: a.ok, pts: a.raw, answered: !!a.a }; }).sort(byName);
}

// Alles wat de tv (openbaar) over de huidige stap mag tonen
function publicStep(step) {
  const s = ss(step);
  const base = { kind: step.kind, id: step.id, round: step.round };
  switch (step.kind) {
    case 'info':
      return { ...base, emoji: step.emoji, title: step.title, text: step.text, transition: !!step.transition, categoryIntro: !!step.categoryIntro, roundIntro: !!step.roundIntro, points: step.roundIntro ? roundPoints(G.roundById[step.round]) : null, roundNo: step.roundIntro ? G.roundById[step.round].no : null, scoring: step.roundIntro ? scoringText(G.roundById[step.round]) : null };
    case 'mc': {
      const showAnswer = s.status === 'closed' && revealsOnClose(step);
      return {
        ...base, variant: step.variant, test: step.test, category: step.category, question: step.question, options: step.options, media: step.media,
        status: s.status, blurStep: s.blurStep, blurMax: G.settings.blurPoints.length - 1, blurPoints: step.variant === 'blur' ? G.settings.blurPoints : null, hide: step.hide,
        answer: showAnswer ? step.answer : null, results: null, explanation: showAnswer ? step.explanation : null,
        teams: teamChips(step), timer: s.status === 'open' ? timerInfo('mc') : null,
        readMs: s.status === 'reading' || s.status === 'showing' ? Math.max(0, G.paused ? (s.readLeft ?? 0) : (s.readUntil || 0) - Date.now()) : null
      };
    }
    case 'memory': {
      const entries = s.entries;
      const out = { ...base, status: s.status, prompt: step.prompt, timer: timerInfo('memory'), teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, count: (entries[t.teamId] || []).length })) };
      if (s.status === 'done') {
        out.items = step.items.map((i) => i.text);
      }
      return out;
    }
    case 'song': {
      const song = songOf(step);
      if (!song || s.status === 'loading') return { ...base, status: 'loading', target: G.settings.hitsterTarget, teams: [] };
      const out = { ...base, status: s.status, audio: song.audio, target: G.settings.hitsterTarget, done: s.status === 'revealed' && hitsterDone(step.round), placed: Object.keys(s.placements).filter((id) => G.teams[id]).length, active: activeTeams().length,
        teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, cards: ensureTimeline(t, step.round).length, answered: hasAnswered(t, step), connected: teamConnected(t) })) };
      return out; // het antwoord staat alleen op de telefoons, niet op de tv
    }
    case 'price': {
      // De bedragen komen bewust niet op de tv (ook niet na het sluiten): die blijven voor het nakijken
      return { ...base, status: s.status, name: step.name, unit: step.unit, emoji: step.emoji, agoYears: step.agoYears, teams: teamChips(step) };
    }
    case 'draw': {
      const turn = s.turns[s.turn];
      const out = { ...base, status: s.status, turn: s.turn + 1, total: s.total || 0, teams: [] };
      if (turn) {
        out.teams = Object.values(G.teams).sort(byName).map((t) => ({
          name: t.name, drawer: turn.drawers[t.teamId] && G.devices[turn.drawers[t.teamId]] ? G.devices[turn.drawers[t.teamId]].label : null,
          answered: !!turn.answers[t.teamId],
          word: (s.status === 'judging' || s.status === 'result') && turn.words[t.teamId] ? turn.words[t.teamId].word : null,
          // tekeningen live op de tv (het woord blijft geheim tot de uitslag)
          strokes: ['drawing', 'judging', 'result'].includes(s.status) && turn.words[t.teamId] ? turn.strokes[t.teamId] || [] : null,
          guess: (s.status === 'judging' || s.status === 'result') && turn.answers[t.teamId] ? turn.answers[t.teamId].text : null,
          ok: s.status === 'result' && turn.ok ? !!turn.ok[t.teamId] : null
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
        blurStep: s.blurStep || 0, blurMax: G.settings.blurPoints.length - 1, blurPoints: G.settings.blurPoints,
        name: s.status === 'closed' ? step.name : null
      };
    case 'thirty': {
      const o = s.order && s.order[s.turn];
      const turn = s.turns[s.turn];
      // Tijdens de beurt alleen de goedgekeurde woorden (groen); daarna alle vijf
      const words = !turn ? null : s.status === 'running' ? turn.words.map((w, i) => (turn.ok[i] ? w : null)) : turn.words;
      return {
        ...base, status: s.status, turn: s.turn + 1, total: s.order ? s.order.length : 0, timer: timerInfo('thirty'),
        team: o && G.teams[o.teamId] ? G.teams[o.teamId].name : null,
        explainer: o && G.devices[o.deviceId] ? G.devices[o.deviceId].label : null,
        words, ok: turn ? turn.ok : null
      };
    }
    case 'roundresult': {
      const round = G.roundById[step.round];
      // Geen punten en geen volgorde: alle teams op alfabet. Punten zien we pas bij de ontknoping.
      const next = G.rounds.find((r) => r.no === round.no + 1);
      return { ...base, title: `Dit was ronde ${round.no}: ${round.title}`, next: next ? `${next.emoji || ''} ${next.title}`.trim() : null,
        momentum: momentumFor(round),
        teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, photo: photoUrl(t.teamId), color: t.color || null })) };
    }
    case 'teamphoto':
      return { ...base, teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, photo: photoUrl(t.teamId), skipped: !!s.skipped[t.teamId], connected: teamConnected(t) })) };
    case 'joker':
      return { ...base, chosen: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, done: s.choices[t.teamId] !== undefined, round: t.jokerRound && G.roundById[t.jokerRound] ? `Ronde ${G.roundById[t.jokerRound].no}: ${G.roundById[t.jokerRound].title}` : null })) };
    case 'final': {
      const out = { ...base, status: s.status, category: step.category, maxWager: G.settings.finalMaxWager, teams: teamChips(step) };
      if (s.status !== 'wager') { out.question = step.question; out.options = step.options; out.media = step.media; }
      if (s.status === 'revealed') { out.answer = step.answer; out.explanation = step.explanation; }
      return out;
    }
    case 'tiebreak': {
      const tied = (s.teams || []).map((id) => G.teams[id]).filter(Boolean);
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
        blurStep: s.blurStep, blurMax: G.settings.blurPoints.length - 1, media: step.media, explanation: step.explanation,
        teams: Object.values(G.teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, connected: teamConnected(t), answered: !!s.answers[t.teamId], value: s.answers[t.teamId] ? s.answers[t.teamId].v : null }))
      };
    case 'memory':
      return {
        type: 'memory', status: s.status, items: step.items.map((i) => i.text),
        teams: Object.values(G.teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, entries: (s.entries[t.teamId] || []).map((e) => ({ id: e.id, text: e.text, ok: e.ok })) }))
      };
    case 'song': {
      const song = songOf(step);
      if (!song || s.status === 'loading') {
        const round = G.roundById[step.round];
        return { type: 'song', status: 'loading', dynamic: true, stepId: step.id, roundId: step.round, category: round.category, categoryName: HITSTER_CATS[round.category],
          playlist: playlistFirst(round) ? G.hitsterPlaylists[round.category].id : null,
          playlistFailed: G.playlistFailed[round.id] || null,
          needSong: !s.songId, needStart: Math.max(0, (round.startCards || 2) - dynamicStartIds(step.round).length), exclude: usedSongKeys() };
      }
      const round = G.roundById[step.round];
      const verify = round && round.dynamic ? [...dynamicStartIds(step.round), song.id].filter((id) => G.songs[id] && G.songs[id].check && !G.songs[id].verified)
        .map((id) => ({ songId: id, title: G.songs[id].title, artist: G.songs[id].artist, year: G.songs[id].year })) : [];
      return { type: 'song', verify, uri: song.uri || null, target: G.settings.hitsterTarget, cards: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, n: ensureTimeline(t, step.round).length })), status: s.status, song: { id: step.id, uri: song.uri || null, title: song.title, artist: song.artist, year: song.year, hasAudio: !!song.audio, spotify: `https://open.spotify.com/search/${encodeURIComponent(song.title + ' ' + song.artist)}` }, placed: Object.keys(s.placements).length,
        bonusOn: !!(G.settings.hitsterTitlePoints || G.settings.hitsterArtistPoints),
        bonus: s.status === 'revealed' ? Object.values(G.teams).sort(byName).map((t) => { const g = (s.guesses || {})[t.teamId] || {}, j = (s.judge || {})[t.teamId] || {}; return { teamId: t.teamId, name: t.name, title: g.title || '', artist: g.artist || '', titleOk: !!j.title, artistOk: !!j.artist }; }) : null };
    }
    case 'price':
      return { type: 'price', status: s.status, name: step.name, unit: step.unit, now: step.now, ago: step.ago, agoYears: step.agoYears };
    case 'draw': {
      const turn = s.turns[s.turn];
      const small = Object.values(G.teams).filter((t) => (s.plan ? drawPlanTurns(s, t) : 0) < 1).map((t) => t.name);
      return {
        type: 'draw', status: s.status, turn: s.turn + 1, total: s.total || 0, smallTeams: small,
        teams: turn ? Object.values(G.teams).sort(byName).filter((t) => turn.words[t.teamId]).map((t) => ({
          teamId: t.teamId, name: t.name, word: turn.words[t.teamId].word, drawer: G.devices[turn.drawers[t.teamId]] ? G.devices[turn.drawers[t.teamId]].label : '?',
          answerer: G.devices[turn.answerers[t.teamId]] ? G.devices[turn.answerers[t.teamId]].label : '?',
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
        team: o && G.teams[o.teamId] ? G.teams[o.teamId].name : null, explainer: o && G.devices[o.deviceId] ? G.devices[o.deviceId].label : null,
        words: turn ? turn.words : null, ok: turn ? turn.ok : null
      };
    }
    case 'demo_draw':
      return { type: 'demo_draw', status: s.status, word: step.word };
    case 'demo_thirty':
      return { type: 'demo_thirty', status: s.status, words: step.words, ok: s.ok };
    case 'logo': {
      const aw = logoAwards(step);
      const order = Object.entries(s.answers).filter(([id]) => G.teams[id]).sort((a, b) => a[1].at - b[1].at).map(([id]) => id);
      return {
        type: 'logo', variant: step.variant, test: !!step.test, status: s.status, name: step.name, alt: step.alt, media: step.media,
        blurStep: s.blurStep || 0, blurMax: G.settings.blurPoints.length - 1,
        teams: Object.values(G.teams).sort(byName).map((t) => {
          const a = s.answers[t.teamId];
          return { teamId: t.teamId, name: t.name, connected: teamConnected(t), answer: a ? a.text : null, place: a ? order.indexOf(t.teamId) + 1 : null, ok: !!s.judged[t.teamId], pts: aw[t.teamId] || 0, sim: a ? similarity(a.text, [step.name, ...(step.alt || [])]) : null };
        })
      };
    }
    case 'teamphoto':
      return { type: 'teamphoto', teams: Object.values(G.teams).sort(byName).map((t) => ({ teamId: t.teamId, name: t.name, photo: photoUrl(t.teamId), skipped: !!s.skipped[t.teamId], connected: teamConnected(t) })) };
    case 'joker':
      return { type: 'joker', teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, round: t.jokerRound ? G.roundById[t.jokerRound].title : null })) };
    case 'final':
      return {
        type: 'final', status: s.status, answer: step.answer, options: step.options, question: step.question,
        teams: Object.values(G.teams).sort(byName).map((t) => ({ name: t.name, wager: s.wagers[t.teamId] ?? null, max: G.settings.finalMaxWager, answer: s.answers[t.teamId] ?? null }))
      };
    case 'tiebreak':
      return {
        type: 'tiebreak', status: s.status, answer: step.answer, unit: step.unit, question: step.question,
        teams: (s.teams || []).map((id) => G.teams[id]).filter(Boolean).map((t) => ({ name: t.name, guess: s.answers[t.teamId] ?? null }))
      };
    default:
      return null;
  }
}

// Sleutel van "waar staan we nu": een klik die bij een eerdere toestand hoort (dubbele tik, of de
// andere quizmaster was net eerder) wordt genegeerd, zodat er nooit per ongeluk een scherm wordt overgeslagen.
function actionKey() {
  const step = cur();
  const s = step ? ss(step) : {};
  return [G.phase, G.stepIndex, G.lobbyStage, G.reveal, G.revealN, G.endView, step ? step.id : '', s.status || '', s.turn ?? '', mainAction().label].join('|');
}
// Vangnet: een fout in één actie mag nooit de hele quiz platleggen
const serverErrors = [];
function reportError(where, error) {
  LOG.error('fout', { waar: where, melding: String((error && error.message) || error), stack: error && error.stack ? String(error.stack).split('\n').slice(0, 6).join(' | ') : null });
  serverErrors.push({ where, message: String((error && error.message) || error).slice(0, 160).replace(/\.+$/, ''), at: new Date().toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' }) });
  if (serverErrors.length > 5) serverErrors.shift();
  try { io.to('remote_room').emit('host_error', { message: `Er ging iets mis bij "${where}". De quiz loopt door; probeer het zo nodig opnieuw.` }); } catch (e) { /* niets */ }
}
const tvCount = () => { const room = io.sockets && io.sockets.adapter && io.sockets.adapter.rooms && io.sockets.adapter.rooms.get('tv_room'); return room ? room.size : 0; };

// De hoofdknop van de quizmaster: label, of hij werkt, en wat hij doet
function mainAction() {
  const none = (label, hint) => ({ label, enabled: false, hint: hint || '', run: null });
  const go = (label, run, hint) => ({ label, enabled: true, hint: hint || '', run });
  if (G.phase === 'LOBBY') {
    if (!G.steps.length) return none('Geen quiz geladen', 'Controleer questions.json');
    if (!G.settings.maxTeams) return none('📱 Toon het aanmeldscherm (QR-code)', 'Vul eerst bij Teams in hoeveel teams er maximaal mee mogen doen.');
    if (G.lobbyStage === 'welcome') return go('📱 Toon het aanmeldscherm (QR-code)', () => { G.lobbyStage = 'join'; });
    if (!Object.keys(G.teams).length) return none('▶️ Start de quiz', 'Er is nog geen team aangemeld.');
    const ready = readiness();
    if (!ready.ok) return none('▶️ Start de quiz', `Niet startklaar: ${ready.errors[0]}${ready.errors.length > 1 ? ` (en nog ${ready.errors.length - 1})` : ''}`);
    return go('▶️ Start de quiz', startQuiz);
  }
  if (G.phase === 'END') {
    const list = ranking();
    if (G.reveal === 'idle') return go('🥁 Start de ontknoping', () => { G.reveal = 'stepping'; G.revealN = 0; });
    if (G.reveal === 'stepping' && G.revealN < list.length) {
      const nextTeam = list[list.length - 1 - G.revealN];
      const last = G.revealN === list.length - 1;
      return go(last ? '🏆 Onthul de winnaar!' : `🎖️ Onthul plek ${nextTeam.rank}`, () => { G.revealN++; if (G.revealN >= list.length) G.reveal = 'done'; },
        last ? 'Tromgeroffel…' : 'Reik eventueel eerst de prijs uit voor de vorige plek.');
    }
    return go('🔍 Nakijken: alle rondes', () => { G.review = { scope: 'all', page: 0 }; });
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
      if (hitsterDone(step.round)) return go(`🏁 Muziekronde klaar (${G.settings.hitsterTarget} kaarten) ▶️`, next, 'Een team heeft de tijdlijn vol; de overige liedjes worden overgeslagen.');
      if (!G.steps.slice(G.stepIndex + 1).some((x) => x.kind === 'song' && x.round === step.round)) return go('Volgende ▶️', next, `De liedjes zijn op voordat een team ${G.settings.hitsterTarget} kaarten had.`);
      return go('Volgend liedje ▶️', next);
    case 'mc':
    case 'price':
      if (s.status === 'reading' || s.status === 'showing') return go('⏩ Antwoorden nu openen', () => openAnswers(step), s.status === 'reading' ? 'Eerst staat alleen de vraag in beeld, daarna de antwoorden.' : 'De antwoorden staan in beeld; zo meteen kan er gekozen worden.');
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
      if (s.status === 'ready') return go(`▶️ Start beurt ${s.turn + 1} van ${s.total}: tekenaars krijgen hun woord`, () => startDrawTurn(step), s.turns[s.turn] ? `Tekenaars: ${Object.values(G.teams).filter((t) => s.turns[s.turn].drawers[t.teamId]).map((t) => `${t.name}: ${G.devices[s.turns[s.turn].drawers[t.teamId]] ? G.devices[s.turns[s.turn].drawers[t.teamId]].label : '?'}`).join(', ')}` : '');
      if (s.status === 'drawing') return none('⏳ Wachten tot elk team een antwoord heeft ingediend…', `Nog niet ingediend: ${eligibleDrawTeams(step, s.turns[s.turn]).filter((t) => !s.turns[s.turn].answers[t.teamId]).map((t) => t.name).join(', ') || '–'}`);
      if (s.status === 'judging') return go('✅ Beoordeling bevestigen', () => { s.turns[s.turn].done = true; s.status = 'result'; });
      if (s.status === 'result' && s.turn + 1 < (s.total || 0)) return go(`👉 Tekenaars voor beurt ${s.turn + 2} van ${s.total}`, () => { s.turn++; s.status = 'ready'; assignDrawTurn(step); }, 'De tekenaars zien het op hun telefoon en kunnen zich klaarmaken; daarna start je de beurt.');
      return go('Ronde afsluiten ▶️', next);
    case 'thirty':
      if (s.status === 'ready') return go(`▶️ Start: ${G.teams[s.order[s.turn].teamId] ? G.teams[s.order[s.turn].teamId].name : '?'}`, () => startThirty(step));
      if (s.status === 'running') return go('⏹️ Stop (tijd om)', () => stopThirty(step));
      if (s.status === 'judging') return go('✅ Uitslag bevestigen', () => { s.turns[s.turn].done = true; s.status = 'result'; });
      if (s.status === 'result' && s.turn + 1 < s.order.length) return go(`Volgende beurt (${s.turn + 2} van ${s.order.length}) ▶️`, () => advanceThirty(step));
      return go('Ronde afsluiten ▶️', next);
    case 'demo_draw':
      if (s.status === 'ready') return go(`▶️ Start oefenbeurt: jij tekent "${step.word}"`, () => { s.status = 'drawing'; s.strokes = []; }, 'Teken in de bediening; de tekening verschijnt live op de tv. Iedereen raadt hardop.');
      if (s.status === 'drawing') return go('✅ Onthul het woord', () => { s.status = 'result'; });
      return go('Volgende ▶️', next);
    case 'demo_thirty':
      if (s.status === 'ready') return go('▶️ Start oefenbeurt (jij legt uit, 30 s)', () => { s.status = 'running'; timerStart((step.seconds || G.settings.thirtySeconds) * 1000, 'demo'); }, 'Leg de vijf woorden uit; tik goede antwoorden meteen aan.');
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
function startQuiz() { G.gameId = crypto.randomUUID(); G.phase = 'PLAY'; G.stepIndex = 0; enterStep(); LOG.info('quiz_gestart', { teams: Object.keys(G.teams).length }); setTimeout(() => backupNow('start'), 500); }
function forceAction() {
  // Vóór de start: niet startklaar, maar de quizmaster wil toch beginnen
  if (G.phase === 'LOBBY') return G.lobbyStage === 'join' && Object.keys(G.teams).length && G.settings.maxTeams && !readiness().ok ? { label: '⚠️ Toch starten (niet startklaar)', run: () => { LOG.warn('start_ondanks_fouten', { fouten: readiness().errors }); startQuiz(); } } : null;
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

// Alleen versturen als er echt iets veranderd is (per tv-groep, bedieningsgroep en per telefoon). Scheelt veel
// verkeer: veel acties veranderen maar voor één scherm iets. Komt er iemand bij of gaat er iemand weg, dan
// verandert de groepsgrootte en wordt de stand sowieso opnieuw gestuurd; een nieuwe telefoon heeft een nieuw id.
const lastSent = new Map();
function sendState(target, payload) {
  let key = target;
  if (target === 'tv_room' || target === 'remote_room') {
    const room = io.sockets && io.sockets.adapter && io.sockets.adapter.rooms && io.sockets.adapter.rooms.get(target);
    key = `${target}#${room ? room.size : 0}`;
  }
  const json = JSON.stringify(payload);
  if (lastSent.get(target) === key + '|' + json) return;
  lastSent.set(target, key + '|' + json);
  if (lastSent.size > 500) lastSent.clear(); // oude telefoon-ids opruimen
  io.to(target).emit('state_update', payload);
}
function forgetSent(target) { lastSent.delete(target); } // na (her)aanmelden: altijd de hele stand opnieuw sturen
function broadcastState() {
  const step = cur();
  const pages = G.review ? reviewPages(G.review.scope) : null;
  if (G.review && pages) G.review.page = Math.min(Math.max(G.review.page, 0), Math.max(0, pages.length - 1));
  const reviewPayload = G.review ? { scope: G.review.scope, page: G.review.page, total: pages.length, data: pages[G.review.page] || null } : null;
  const round = step && G.roundById[step.round];

  const common = {
    phase: G.phase, paused: G.paused, showStandings: G.showStandings, review: reviewPayload, teamStyle: teamStyle(),
    header: {
      round: round ? `Ronde ${round.no}: ${round.title}` : step && step.round === 'test' ? 'Testronde' : step && step.round === 'briefing' ? 'Uitleg van de rondes' : step && step.kind === 'joker' ? 'Joker' : step && step.kind === 'teamphoto' ? 'Teamfoto' : step && step.kind === 'final' ? 'Slotvraag' : step && step.kind === 'tiebreak' ? 'Beslissingsvraag' : 'Familiequiz',
      progress: progressOf(step), points: round && step.kind !== 'info' && step.kind !== 'roundresult' && !step.test ? roundPoints(round) : null
    },
    standings: G.phase === 'END' ? ranking() : null,
    alerts: Object.values(G.alerts),
    theme: G.settings.theme, lobbyStage: G.lobbyStage, welcome: G.content.welcome, texts: G.content.texts,
    end: G.phase === 'END' ? { reveal: G.reveal, revealN: G.revealN, endView: G.endView, scores: G.reveal !== 'idle' ? ranking() : null, breakdown: G.reveal === 'done' ? breakdown() : null,
      awards: G.reveal === 'done' && G.endView === 'awards' ? awards() : null, album: null, gameDate: new Date().toISOString() } : null,
    hallOfFame: G.phase === 'LOBBY' ? hallOfFame() : null
  };

  sendState('tv_room', {
    ...common,
    cheatSound: G.settings.tvCheatSound !== false,
    soundOut: G.settings.soundOut || 'tv',
    pausePhotos: G.phase === 'PLAY' && G.paused ? pausePhotos.slice(-80).map((p) => ({ url: pausePhotoUrl(p), team: p.team, label: p.label, at: p.at })) : null,
    positions: G.phase === 'PLAY' && G.showPositions ? positionsPayload(G.showPositions) : null,
    end: common.end && G.reveal === 'done' && G.endView === 'album' ? { ...common.end, album: album() } : common.end, // tekeningen alleen naar de tv
    step: step ? publicStep(step) : null,
    teamList: Object.values(G.teams).map((t) => ({ name: t.name, photo: photoUrl(t.teamId), connected: teamConnected(t), members: teamDevices(t).length })).sort(byName),
    maxTeams: G.settings.maxTeams
  });

  const main = mainAction();
  const force = forceAction();
  sendState('remote_room', {
    ...common,
    step: step ? publicStep(step) : null,
    panel: step ? hostPanel(step) : null,
    controls: { key: actionKey(), main: { label: main.label, enabled: main.enabled, hint: main.hint }, force: force ? { label: force.label } : null, undo: { enabled: G.undoHistory.length > 0, label: G.undoHistory.length ? `↶ Ongedaan maken: ${G.undoHistory[G.undoHistory.length - 1].label}` : '↶ Niets om ongedaan te maken' } },
    teams: Object.values(G.teams).map((t) => ({
      teamId: t.teamId, name: t.name, bot: !!t.bot, adjust: t.adjust || 0, color: t.color || null, photo: photoUrl(t.teamId), connected: teamConnected(t), joker: t.jokerRound && G.roundById[t.jokerRound] ? G.roundById[t.jokerRound].title : null, score: scoreOf(t),
      // wat doet dit team nu? (voor het teamoverzicht in de bediening)
      now: teamNow(t), cheats: statOf(t.teamId).cheatSteps.length, baseOnline: !!(G.devices[t.baseDeviceId] && G.devices[t.baseDeviceId].connected),
      members: teamDevices(t).map((d) => ({ deviceId: d.deviceId, label: d.label, role: d.deviceId === t.baseDeviceId ? 'base' : 'member', connected: d.connected }))
    })).sort(byName),
    rounds: G.rounds.map((r) => ({ id: r.id, no: r.no, title: r.title, introId: `${r.id}_intro` })),
    settings: G.settings, settingsLocked: G.phase !== 'LOBBY',
    stepNo: G.stepIndex + 1, stepTotal: G.steps.length,
    warnings: [...G.content.warnings, ...(wifiQrPresent() ? [] : ['📶 Nog geen wifi-QR voor het welkomstscherm: zet het plaatje in public/media/wifi-qr.png (of .jpg).']), ...serverErrors.map((e) => `⚠️ Foutje opgevangen (${e.at}, ${e.where}): ${e.message}. De quiz loopt door.`)],
    tvCount: tvCount(),
    hitsterCats: HITSTER_CATS,
    hitsterPlaylists: G.hitsterPlaylists,
    libraryDownload: `/download/Hitster-bibliotheek.xlsx?t=${DOWNLOAD_TOKEN}`,
    downloadToken: DOWNLOAD_TOKEN,
    pinIsDefault: G.HOST_PIN === '1234', onlineHost: ON_RENDER,
    readiness: G.phase === 'LOBBY' ? readiness() : null,
    upNext: G.phase === 'PLAY' ? upNext() : null,
    current: G.phase === 'PLAY' ? stepSummary(cur(), true) : null,
    music: G.phase === 'PLAY' && cur() && cur().kind === 'song' ? { paused: G.musicPaused } : null,
    internet: G.internet, photoCount: pausePhotos.length + new Set([...archivedTeamPhotos().map((a) => a.teamId), ...Object.keys(G.teamPhotos).map(safeId)]).size,
    showPositions: G.showPositions,
    libraryUpdate: G.libraryUpdate,
    quiz: { ...G.quizSource, steps: G.steps.length, rounds: G.rounds.length, library: G.librarySource, librarySongs: (G.baseRaw.hitsterLibrary || []).length },
    plan: planView(), extraOptions: extraOptions(), themes: THEMES,
    hostScores: G.phase !== 'LOBBY' ? breakdown() : null, // alleen voor de quizmasters
    history: G.historyEntries // alleen in de beveiligde bediening; nooit naar tv of spelers
  });

  Object.values(G.devices).forEach((d) => {
    if (!d.connected || !d.socketId) return;
    const t = G.teams[d.teamId];
    if (!t) return;
    const isBase = t.baseDeviceId === d.deviceId;
    sendState(d.socketId, {
      phase: G.phase, paused: G.paused, showStandings: false, reviewing: !!G.review, theme: G.settings.theme, texts: G.content.texts,
      standings: null,
      roundName: common.header.round,
      timer: null,
      view: G.phase === 'PLAY' ? phoneView(step, t, d, isBase) : G.phase === 'END' ? { type: 'end', share: G.reveal === 'done' ? ranking().map((r) => ({ rank: r.rank, name: r.name, photo: r.photo, color: r.color, score: r.score })) : null } : { type: 'lobby' },
      me: {
        memberId: d.memberId, teamId: t.teamId, teamName: t.name, color: t.color || '#64748b', photo: photoUrl(t.teamId), label: d.label, role: isBase ? 'base' : 'member',
        baseLabel: G.devices[t.baseDeviceId] ? G.devices[t.baseDeviceId].label : '', proposal: proposalFor(t, d),
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
      return { ...base, emoji: step.emoji, title: step.title, text: step.text, scoring: step.roundIntro ? scoringText(G.roundById[step.round]) : null };
    case 'mc': {
      const a = s.answers[id];
      return {
        ...base, variant: step.variant, test: step.test, category: step.category, question: step.question, options: step.options,
        media: step.variant === 'text' ? step.media : null, status: s.status === 'closed' && s.late && s.late[id] && !a ? 'open' : s.status, answered: !!a, given: a ? a.v : null,
        timer: s.status === 'open' ? timerInfo('mc') : null
      };
    }
    case 'memory':
      return { ...base, status: s.status, test: !!step.test, prompt: step.prompt, entries: (s.entries[id] || []).map((e) => ({ id: e.id, text: e.text, by: e.by })) };
    case 'song': {
      if (s.status === 'loading') return { ...base, status: 'loading', timeline: [], placed: null, target: G.settings.hitsterTarget };
      const tl = ensureTimeline(team, step.round).map((sid) => ({ id: sid, year: G.songs[sid].year, title: G.songs[sid].title, artist: G.songs[sid].artist }));
      const r = s.results && s.results[id];
      return { ...base, test: !!step.test, status: s.status, timeline: tl, placed: s.placements[id] !== undefined ? s.placements[id] : null, yearGuess: s.years[id] ?? null, result: r ? { ok: r.ok, exact: r.exact, yearGuess: r.yearGuess, diff: songAward(step, id).diff } : null,
        target: G.settings.hitsterTarget,
        askTitleArtist: !!(G.settings.hitsterTitlePoints || G.settings.hitsterArtistPoints) && !step.test,
        guess: (s.guesses || {})[id] || null,
        bonus: s.status === 'revealed' && (s.judge || {})[id] ? { title: !!s.judge[id].title, artist: !!s.judge[id].artist } : null,
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
        answererLabel: turn && G.devices[turn.answerers[id]] ? G.devices[turn.answerers[id]].label : null,
        word: role === 'drawer' && turn && s.status !== 'ready' ? turn.words[id].word : null, // pas bij de start
        drawerLabel: turn && turn.drawers[id] && G.devices[turn.drawers[id]] ? G.devices[turn.drawers[id]].label : null,
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
        team: o && G.teams[o.teamId] ? G.teams[o.teamId].name : null, explainer: o && G.devices[o.deviceId] ? G.devices[o.deviceId].label : null,
        words: role === 'explainer' && turn && (s.status === 'running' || s.status === 'judging') ? turn.words : null
      };
    }
    case 'teamphoto':
      return { ...base, photo: photoUrl(id), skipped: !!s.skipped[id] };
    case 'joker':
      return { ...base, rounds: G.rounds.map((r) => ({ id: r.id, title: `Ronde ${r.no}: ${r.title}` })), chosen: team.jokerRound, submitted: s.choices[id] !== undefined };
    case 'final': {
      const a = s.answers[id];
      return {
        ...base, status: s.status, category: step.category, maxWager: G.settings.finalMaxWager, wager: s.wagers[id] ?? null,
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
  const candidate = p && G.devices[p.candidateId];
  if (!candidate) return null;
  const proposer = G.devices[p.proposerId];
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
  const candidate = G.devices[p.candidateId];
  if (!candidate || candidate.teamId !== team.teamId || !candidate.connected) { team.proposal = null; return; }
  if (connectedDevices(team).every((d) => p.approvals.includes(d.deviceId))) {
    team.baseDeviceId = candidate.deviceId;
    team.proposal = null;
    notifyTeam(team, `${candidate.label} is nu de basistelefoon van het team.`);
  }
}
function sync() {
  Object.values(G.teams).forEach(evaluateProposal);
  settle();
  broadcastState();
  scheduleBots();
}

// ---------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------
const isRemote = (socket) => socket.data.role === 'remote';
function deviceOf(socket) {
  const d = G.devices[socket.data.deviceId];
  return d && d.socketId === socket.id ? d : null;
}
// Inloggen op de bediening: met de toegangscode (beschermd tegen raden) of met een eerder uitgegeven sessie
function clientIp(socket) {
  const h = socket.handshake || {};
  const fwd = h.headers && h.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return h.address || 'onbekend';
}
function checkPin(socket, pin) {
  const ip = clientIp(socket);
  const wait = pinGuard.blocked(ip);
  if (wait) { socket.emit('auth_denied', { locked: true, waitSec: wait }); LOG.warn('login_geblokkeerd', { ip, wachtSec: wait }); return false; }
  if (typeof pin === 'string' && pin.length <= 100 && sameCode(pin, G.HOST_PIN)) { pinGuard.success(ip); return true; }
  const f = pinGuard.fail(ip);
  LOG.warn('login_mislukt', { ip, poging: f.count });
  socket.emit('auth_denied', { locked: f.waitSec > 0, waitSec: f.waitSec });
  socket.data.pinFails = (socket.data.pinFails || 0) + 1;
  if (socket.data.pinFails >= 5) socket.disconnect(true);
  return false;
}
function attachSocket(socket, device) {
  forgetSent(socket.id);
  device.socketId = socket.id;
  device.connected = true;
  socket.data.deviceId = device.deviceId;
}
function removeTeam(teamId) {
  const team = G.teams[teamId];
  if (!team) return;
  for (const d of teamDevices(team)) {
    if (d.socketId) {
      const s = io.sockets.sockets.get(d.socketId);
      if (s) { s.data.deviceId = null; s.emit('kicked'); }
    }
    delete G.alerts[d.deviceId];
    delete G.devices[d.deviceId];
  }
  Object.values(G.ssAll).forEach((s) => {
    ['answers', 'placements', 'entries', 'wagers', 'choices'].forEach((k) => { if (s[k]) delete s[k][teamId]; });
  });
  if (G.teamPhotos[teamId]) setTeamPhoto(teamId, null);
  delete G.teams[teamId];
}

// Alleen de basistelefoon mag antwoorden doorgeven
function baseContext(socket, kind) {
  const device = deviceOf(socket);
  const team = device && G.teams[device.teamId];
  const step = cur();
  if (!team || !step || step.kind !== kind || G.paused) return null;
  return { device, team, step, s: ss(step), isBase: team.baseDeviceId === device.deviceId };
}

const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

io.on('connection', onConnection);
const summarize = (args) => { try { const a = args.find((x) => typeof x !== 'function'); const j = JSON.stringify(a); return j && j.length > 200 ? j.slice(0, 200) + '…' : j; } catch (e) { return null; } };
// Tekenen: een tekenactie van de telefoon (of de quizmaster) controleren en toepassen
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

// Alles wat de losse socket-bestanden (lib/sockets/*) nodig hebben, in één object
function socketApi() {
  return {
    pauseReading,
    DATA_DIR,
    END_VIEWS,
    EXTRA_TYPES,
    G,
    HITSTER_CATS,
    JSON_BASE,
    LIB_UPLOAD,
    LOG,
    MAX_DEVICES_PER_TEAM,
    MAX_LABEL,
    MAX_PAUSE_CHARS,
    MAX_TEAM_NAME,
    PHOTOS_FILE,
    PHOTO_DIR,
    REACTIONS,
    STATE_FILE,
    TEAM_COLORS,
    THEMES,
    UNDO_LIMIT,
    XLSX_UPLOAD,
    actionKey,
    addBots,
    addDynSong,
    applyOp,
    applyUndoEntry,
    archiveAllPhotos,
    attachSocket,
    backupNow,
    backups,
    baseContext,
    botSockets,
    broadcastState,
    byName,
    cancelCheat,
    cheatSensitive,
    checkPin,
    cleanOp,
    cleanText,
    cleanTrack,
    clientIp,
    connectedDevices,
    crypto,
    cur,
    currentLibraryFile,
    deviceOf,
    drawGuessOk,
    dynamicStartIds,
    dynamicStartReady,
    editLibrary,
    ensureTimeline,
    enterStep,
    failPlaylist,
    findTeamByName,
    forceAction,
    forgetSent,
    fromExcel,
    fs,
    inEra,
    io,
    isQuizWorkbook,
    isRemote,
    labelTaken,
    libraryFromExcel,
    loadQuiz,
    logoMatches,
    mainAction,
    newId,
    next,
    norm,
    noteAnswer,
    noteDropped,
    notifyTeam,
    num,
    originalUploadKey,
    path,
    pauseOriginalFile,
    pausePhotos,
    pickColor,
    planOrder,
    playlistIdOf,
    pushUndo,
    reactionsAllowed,
    rebuildPlaylists,
    removeStateFiles,
    removeTeam,
    reopenIfMissed,
    replan,
    reportError,
    roundStarted,
    sanitizeSettings,
    savePlaylists,
    scheduleSave,
    serverErrors,
    sessions,
    setTeamPhoto,
    songOf,
    ss,
    startCheatWait,
    sync,
    teamDevices,
    teamOriginalFile,
    timer,
    timerClear,
    timerRun,
    timerStop,
    updateLibrary,
    usedSongKeys,
    validPhoto
  };
}

function onConnection(socket) {
  const api = socketApi(); // functies en spelstand voor lib/sockets/*
  // Elke actie apart afvangen: een fout wordt gemeld in de bediening en de quiz gaat gewoon door
  const rawOn = socket.on.bind(socket);
  socket.on = (event, handler) => rawOn(event, (...args) => {
    const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (event !== 'disconnect' && socket.data.role !== 'bot') {
      // 1) alleen de ingelogde bediening mag quizmaster-acties doen
      if (REMOTE_ONLY.has(event) && socket.data.role !== 'remote') {
        LOG.warn('geweigerd_geen_bediening', { actie: event, ip: clientIp(socket) });
        if (cb) cb({ ok: false, message: 'Geen toegang.' });
        return;
      }
      // 2) niet te veel en niet te grote berichten
      const rl = rateLimit(socket, event, args);
      if (!rl.ok) {
        if (!socket.data.rateWarned || Date.now() - socket.data.rateWarned > 10e3) { socket.data.rateWarned = Date.now(); LOG.warn('limiet', { actie: event, reden: rl.reason, ip: clientIp(socket), device: socket.data.deviceId || null }); }
        if (cb) cb({ ok: false, message: rl.reason === 'too_big' ? 'Dit is te groot om te versturen.' : 'Even rustig aan: probeer het zo opnieuw.' });
        return;
      }
      // 3) ingrijpende acties van de quizmaster komen in het logboek
      if (LOGGED.has(event)) LOG.info('actie', { actie: event, data: event === 'upload_xlsx' ? '(bestand)' : summarize(args) });
    }
    if (args[0] === null) args[0] = undefined; // null-berichten krijgen de standaardwaarden in plaats van een fout
    try { return handler(...args); }
    catch (error) {
      reportError(event, error);
      const cb = args[args.length - 1];
      if (typeof cb === 'function') { try { cb({ ok: false, message: 'Er ging iets mis. Probeer het opnieuw.' }); } catch (e) { /* niets */ } }
      try { broadcastState(); } catch (e) { quiet('stand versturen na fout')(e); }
    }
  });
  require('./lib/sockets/schermen')(socket, api);
  require('./lib/sockets/teams')(socket, api);
  require('./lib/sockets/antwoorden')(socket, api);
  require('./lib/sockets/spelverloop')(socket, api);
  require('./lib/sockets/rondes')(socket, api);
  require('./lib/sockets/beheer')(socket, api);
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
  const s = { id: `bot_${deviceId}`, data: { deviceId, role: 'bot' }, handshake: { address: 'bot', headers: {} }, conn: { remoteAddress: 'bot' }, on: (e, f) => { h[e] = f; }, emit() {}, join() {}, leave() {}, disconnect() {} };
  onConnection(s);
  return (botSockets[deviceId] = { s, h });
}
function addBots(n) {
  for (let i = 0; i < n; i++) {
    const name = '🤖 ' + (BOT_NAMES.find((b) => !findTeamByName('🤖 ' + b)) || `Robot ${Object.keys(G.teams).length + 1}`);
    const team = { teamId: newId('t_'), name, seq: ++G.seq, baseDeviceId: null, jokerRound: null, timelines: {}, proposal: null, bot: true, color: pickColor() };
    G.teams[team.teamId] = team;
    for (let k = 0; k < 2; k++) { // twee "spelers", zodat tekenen en 30 Seconds ook werken
      const d = { deviceId: newId('d_'), memberId: newId('m_'), teamId: team.teamId, label: `Robot ${k + 1}`, seq: ++G.seq, socketId: null, connected: true, bot: true };
      d.socketId = `bot_${d.deviceId}`; // robots hebben een eigen nep-verbinding
      G.devices[d.deviceId] = d;
      if (!k) team.baseDeviceId = d.deviceId;
    }
  }
  if (G.settings.maxTeams && Object.keys(G.teams).length > G.settings.maxTeams) G.settings.maxTeams = Object.keys(G.teams).length;
  if (!G.settings.maxTeams) G.settings.maxTeams = Object.keys(G.teams).length;
}
const botTimers = {};
function scheduleBots() {
  if (G.phase !== 'PLAY' || G.paused) return;
  for (const team of Object.values(G.teams)) {
    if (!team.bot || botTimers[team.teamId]) continue;
    botTimers[team.teamId] = setTimeout(() => { delete botTimers[team.teamId]; if (G.teams[team.teamId]) botAct(team); }, 1200 + Math.floor(Math.random() * 3500));
  }
}
function botAct(team) {
  const step = cur();
  if (!step || G.paused) return;
  const s = ss(step), id = team.teamId, base = G.devices[team.baseDeviceId];
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
      if (s.status === 'open' && s.placements[id] === undefined) {
        const song = G.songs[s.songId] || {};
        call(base, 'place_card', { stepId: step.id, slot: rnd(ensureTimeline(team, step.round).length + 1), year: song.year ? song.year + rnd(5) - 2 : undefined, title: lucky ? song.title : 'Geen idee', artist: Math.random() < 0.5 ? song.artist : undefined });
      }
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
      const who = turn && G.devices[turn.answerers[id]];
      if (turn && turn.words[id] && !turn.answers[id] && who) call(who, 'draw_guess', { text: lucky ? turn.words[id].word : 'Huis' });
      break;
    }
    case 'joker': if (s.choices[id] === undefined && G.rounds.length) call(base, 'joker_choose', { roundId: G.rounds[rnd(G.rounds.length)].id }); break;
    case 'final':
      if (s.status === 'wager' && s.wagers[id] === undefined) call(base, 'final_wager', { amount: rnd(G.settings.finalMaxWager + 1) });
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
// Laatste vangnet (bijv. een fout in een timer): melden, opslaan en doorgaan in plaats van crashen
process.on('uncaughtException', (error) => { reportError('server', error); try { saveNow(); } catch (e) { quiet('noodopslag')(e); } });
process.on('unhandledRejection', (error) => reportError('server', error));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  // Via een voorpost die https-pogingen op dit http-adres meteen afbreekt (zie lib/https-guard.js)
  const { createGuard } = require('./lib/https-guard');
  createGuard(server).listen(PORT, () => {
    const url = getJoinUrl();
    console.log(`Quiz server actief op http://localhost:${PORT}`);
    console.log(`Telefoons (zelfde wifi):  ${url}`);
    console.log(`Tv-scherm:                ${url}/host.html`);
    console.log(`Bediening:                ${url}/bediening.html`);
    console.log(`Pincode bediening:        ${G.HOST_PIN}`);
    if (G.pinWasGenerated) {
      console.log(`Let op: HOST_PIN is niet ingesteld. Deze code is willekeurig gekozen en bewaard in ${HOST_CODE_FILE}.`);
      console.log('Zet liever zelf HOST_PIN in de instellingen van Render (bijv. drie woorden met streepjes).');
    }
    // Waakhond: komt er binnen 20 seconden geen nummer uit de playlist (bijv. bediening dicht), dan de Excel
    setInterval(() => {
      const step = G.phase === 'PLAY' && !G.paused ? cur() : null;
      if (!step || step.kind !== 'song' || !step.dynamic) return;
      const round = G.roundById[step.round], s = ss(step);
      if (playlistFirst(round) && s.status === 'loading' && s.waitSince && Date.now() - s.waitSince > 20000) { failPlaylist(round.id, "geen nummer uit de playlist binnen 20 seconden"); sync(); }
    }, 3000);
    LOG.info('server_gestart', { poort: PORT, render: ON_RENDER, hersteld: !!restored });
    backupNow('opstart');
    checkInternet(); setInterval(checkInternet, 60e3); // elke minuut: is er internet?
    setInterval(() => backupNow('auto'), 5 * 60e3); // elke 5 minuten, alleen als er iets veranderd is
    console.log(`${G.steps.length} schermen geladen in ${G.rounds.length} rondes.`);
    if (restored) {
      console.log(`Vorige quiz hersteld uit ${STATE_FILE}: ${Object.keys(G.teams).length} teams. De quiz staat op pauze.`);
      console.log('Hervat met de pauzeknop, of begin opnieuw met Reset.');
    }
  });
}
module.exports = { server, io };
// Alleen voor de tests (QUIZ_TEST=1): directe toegang tot de spelstatus en de puntentelling
if (process.env.QUIZ_TEST === '1') {
  module.exports.__test = {
    get steps() { return G.steps; }, get rounds() { return G.rounds; }, get teams() { return G.teams; }, get devices() { return G.devices; },
    get songs() { return G.songs; }, get phase() { return G.phase; }, get stepIndex() { return G.stepIndex; }, get roundById() { return G.roundById; },
    settings: G.settings, ss, cur, roundScore, roundRaw, scoreOf, ranking, totalBeforeFinal, finalDelta, tiebreakBonus, jokerFactor, awards,
    momentumFor: (r) => momentumFor(r), reviewPages: (x) => reviewPages(x), PHOTO_DIR, playlistFirst: (r) => playlistFirst(r), failPlaylist: (id, why) => failPlaylist(id, why), originalUploads, ORIG_DIR,
    priceAwards, logoAwards, mcAward, songAward, looksLike, pickLanAddress, upNext: () => upNext(), saveNow, readiness: () => readiness()
  };
}
