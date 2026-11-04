'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadContent } = require('../lib/content');
const { fromExcel } = require('../lib/fromExcel');

const question = {
  question: 'Testvraag?',
  options: ['Goed', 'Fout'],
  answer: 0
};

test('pregame order shows round overview and explanations before tests and joker', () => {
  const { steps } = loadContent(null, {
    test: { questions: [question] },
    start: { title: 'Start' },
    rounds: [{
      id: 'r1',
      type: 'mc',
      title: 'Algemene kennis',
      categories: [{ name: 'Algemeen', questions: [question] }]
    }],
    final: { category: 'Slot', options: ['A', 'B'], answer: 0 }
  });

  const ids = steps.map((step) => step.id);
  assert.equal(ids[0], 'rounds_overview');
  assert.equal(ids[1], 'round_guide_1');
  // teamfoto pas na de testvragen (eerst kijken of alles werkt), vóór de joker
  assert.ok(ids.indexOf('test_1') < ids.indexOf('teamphoto'));
  assert.ok(ids.indexOf('teamphoto') < ids.indexOf('joker'));
  assert.ok(ids.indexOf('test_intro') < ids.indexOf('test_1'));
  assert.ok(ids.indexOf('test_1') < ids.indexOf('joker'));
  assert.ok(ids.indexOf('joker') < ids.indexOf('real_start'));
  assert.ok(ids.indexOf('real_start') < ids.indexOf('r1_intro'));
  assert.ok(ids.indexOf('r1_result') > ids.indexOf('r1_c1_1'));
});

test('memory round defaults to the new wording', () => {
  const { rounds } = loadContent(null, {
    rounds: [{ id: 'r3', type: 'memory', items: ['Een antwoord'] }]
  });
  assert.equal(rounds[0].title, 'Ronde 1');
  assert.match(rounds[0].intro, /Geheugenronde/);
});

test('extra Hitster rounds only use songs from their own category before searching online', () => {
  const { rounds } = loadContent(null, {
    rounds: [{
      id: 'music-extra',
      type: 'hitster',
      dynamic: true,
      category: 'rock',
      startCards: 2,
      songs: [
        { title: 'Rock start', artist: 'Band A', year: 1980, category: 'rock', start: true },
        { title: 'Rock track', artist: 'Band B', year: 1990, category: 'rock' },
        { title: 'Rock track 2', artist: 'Band C', year: 2001, category: 'rock' },
        { title: 'Standard fallback', artist: 'Artist D', year: 2000, category: 'original', start: true }
      ]
    }]
  });
  const round = rounds[0];
  assert.equal(round.dynamic, true);
  assert.equal(round.startIds.length, 2);
  assert.equal(round.pool.length, 1);
  assert.equal(round.fallbackPool.length, 0);
  assert.ok(!round.startIds.some((id) => /lib4$/.test(id)));
});

test('each round receives a wrap-up step after its content', () => {
  const { steps } = loadContent(null, {
    rounds: [
      { id: 'r1', type: 'mc', categories: [{ name: 'A', questions: [question] }] },
      { id: 'r2', type: 'memory', items: ['Een antwoord'] }
    ]
  });
  const ids = steps.map((step) => step.id);
  assert.ok(ids.indexOf('r1_result') > ids.indexOf('r1_c1_1'));
  assert.ok(ids.indexOf('r2_result') > ids.indexOf('r2_memory'));
});

test('Hitster Excel template imports the category and standard music libraries', () => {
  const workbook = path.join(__dirname, '..', 'Hitster-bibliotheek.xlsx');
  const base = path.join(__dirname, '..', 'questions.json');
  const { raw } = fromExcel(workbook, base);
  const library = raw.hitsterLibrary;
  assert.ok(library.length >= 50);
  assert.ok(library.some((song) => song.category === 'original'));
  assert.ok(library.some((song) => song.category === 'rock'));
  assert.ok(library.some((song) => song.category === 'guilty'));
  assert.ok(library.some((song) => song.category === 'nederpop'));
});

test('a second extra music round in the same category gets different start cards', () => {
  const songs = ['A', 'B', 'C', 'D', 'E', 'F'].map((t, i) => ({ title: t, artist: 'X', year: 1980 + i, category: 'nederpop', start: i < 2 }));
  const make = (id, startOffset) => loadContent(null, { rounds: [{ id, type: 'hitster', dynamic: true, category: 'nederpop', startCards: 2, startOffset, songs, excludeKeys: ['f|x'] }] }).rounds[0];
  const first = make('r4x1', 0), second = make('r4x2', 1);
  const keys = (round) => round.startIds.map((id) => id.replace(/^.*_lib/, ''));
  assert.equal(first.startIds.length, 2);
  assert.equal(second.startIds.length, 2);
  assert.deepEqual(keys(first), ['1', '2']); // eerst de nummers met Startkaart = Ja
  assert.ok(keys(second).every((k) => !keys(first).includes(k) && k !== '6')); // andere kaarten, nooit een uitgesloten nummer
});

test('the Hitster library is a separate workbook with one tab per edition, Battle split into three eras', () => {
  const { libraryFromExcel, isQuizWorkbook } = require('../lib/fromExcel');
  const file = (f) => require('path').join(__dirname, '..', f);
  const { library } = libraryFromExcel(file('Hitster-bibliotheek.xlsx'));
  const by = (cat) => library.filter((song) => song.category === cat);
  assert.ok(isQuizWorkbook(file('vragenlijst.xlsx')) && !isQuizWorkbook(file('Hitster-bibliotheek.xlsx'))); // los van elkaar
  for (const cat of ['original', 'nederpop', 'guilty', 'summer', 'rock', 'hiphop', 'soundtracks', 'christmas', 'celebration', 'bingo', 'flyingmic']) assert.ok(by(cat).length > 100, cat);
  assert.ok(by('battle1').every((s) => s.year <= 1984));
  assert.ok(by('battle2').every((s) => s.year >= 1985 && s.year <= 2004));
  assert.ok(by('battle3').every((s) => s.year >= 2005));
  assert.ok(by('guilty').some((s) => s.check)); // jaartallen uit de Spotify-lijst worden gecontroleerd
});

test('extra music rounds use own songs first and the bundled Hitster Excel as reserve, never R4', () => {
  const songs = [
    { title: 'Eigen A', artist: 'X', year: 1990, category: 'christmas' },
    { title: 'Eigen B', artist: 'X', year: 1991, category: 'christmas' },
    { title: 'Eigen C', artist: 'X', year: 1992, category: 'christmas' },
    { title: 'Reserve D', artist: 'Y', year: 1980, category: 'christmas', reserve: true },
    { title: 'Reserve E', artist: 'Y', year: 1981, category: 'christmas', reserve: true }
  ];
  const round = loadContent(null, { rounds: [{ id: 'r4x1', type: 'hitster', dynamic: true, category: 'christmas', startCards: 2, songs }] }).rounds[0];
  assert.equal(round.startIds.length, 2);
  assert.equal(round.pool.length, 1);          // het derde eigen nummer
  assert.equal(round.fallbackPool.length, 2);  // daarna de reserve uit de meegeleverde bibliotheek
});

test('a Primera song page is parsed from its first table and titles are cleaned', () => {
  const { parseSongTable, cleanTitle, cleanArtist } = require('../lib/hitster-update');
  const html = '<p>intro</p><table><tr><th>Jaartal</th><th>Nummer</th><th>Artiest</th></tr>'
    + '<tr><td>2006</td><td>Hey Jude</td><td>The Beatles</td></tr><tr><td>1975</td><td>Rock &amp; Roll</td><td>A;B;C</td></tr></table>'
    + '<table><tr><th>Jaartal</th><th>Nummer</th><th>Artiest</th></tr><tr><td>1999</td><td>Alleen tijdvak</td><td>X</td></tr></table>';
  const songs = parseSongTable(html);
  assert.equal(songs.length, 2);
  assert.equal(songs[1].title, 'Rock & Roll');
  assert.equal(cleanTitle('Hotel California - 2013 Remaster'), 'Hotel California');
  assert.equal(cleanTitle('Theme - From "Bonanza"'), 'Theme - From "Bonanza"');
  assert.equal(cleanArtist('A;B;C'), 'A, B & C');
});

test('the library workbook has a Bronnen tab with a source link and playlist per edition', () => {
  const { libraryFromExcel } = require('../lib/fromExcel');
  const { bronnen } = libraryFromExcel(require('path').join(__dirname, '..', 'Hitster-bibliotheek.xlsx'));
  assert.ok(bronnen.filter((b) => /^https:\/\/www\.primera\.nl\//.test(b.url)).length >= 14);
  assert.equal(bronnen.find((b) => b.category === 'christmas').playlist, '1TUhoIBbCFCCyDM4ELKdUE');
});

test('checked years and playlist additions are written into the library workbook', () => {
  const fs = require('fs');
  const { editLibrary } = require('../lib/hitster-update');
  const { libraryFromExcel } = require('../lib/fromExcel');
  const file = require('path').join(__dirname, '..', 'Hitster-bibliotheek.xlsx');
  const { buf, report } = editLibrary(fs.readFileSync(file), {
    flyingmic: { years: [{ title: 'Hey Jude', artist: 'The Beatles', year: 1968, ok: true }] },
    battle1: { add: [{ title: 'Oud Nummer', artist: 'A', year: 1970 }, { title: 'Te Nieuw', artist: 'B', year: 2010 }] }
  });
  assert.equal(report.fixed, 1);
  assert.equal(report.added, 1); // 2010 valt buiten het tijdvak t/m 1984
  const lib = libraryFromExcel(buf).library;
  const jude = lib.find((s) => s.category === 'flyingmic' && s.title === 'Hey Jude');
  assert.equal(jude.year, 1968);
  assert.ok(!jude.check);
  assert.ok(lib.some((s) => s.category === 'battle1' && s.title === 'Oud Nummer' && s.check));
});

test('access code: long codes, forgiving spacing, and lockout after repeated wrong tries', () => {
  const { sameCode, createGuard, generateCode } = require('../lib/security');
  assert.ok(sameCode(' Tulp Molen 482 ', 'tulp-molen-482'));
  assert.ok(!sameCode('tulp-molen-483', 'tulp-molen-482'));
  assert.match(generateCode(), /^[a-z]+-[a-z]+-\d{3}$/);
  const g = createGuard();
  for (let i = 0; i < 4; i++) g.fail('1.1.1.1');
  assert.equal(g.blocked('1.1.1.1'), 0);
  g.fail('1.1.1.1');
  assert.ok(g.blocked('1.1.1.1') > 0);      // na 5 fouten even wachten
  assert.equal(g.blocked('2.2.2.2'), 0);     // ander adres heeft er geen last van
});

test('sessions replace the stored access code and can all be revoked', () => {
  const os = require('os'), path = require('path'), fs = require('fs');
  const { createSessions } = require('../lib/security');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fq-')), 'sessions.json');
  const s = createSessions(file);
  const t = s.create();
  assert.ok(s.valid(t));
  assert.ok(!s.valid('x'.repeat(32)));
  assert.ok(createSessions(file).valid(t)); // blijft geldig na een herstart
  s.revokeAll();
  assert.ok(!s.valid(t));
});

test('rate limiter blocks floods and oversized messages', () => {
  const { createRateLimiter } = require('../lib/security');
  const limit = createRateLimiter();
  const socket = { data: {} };
  let blocked = 0;
  for (let i = 0; i < 80; i++) if (!limit(socket, 'list_teams', [{}]).ok) blocked++;
  assert.equal(blocked, 20);
  assert.equal(limit({ data: {} }, 'rename_self', [{ name: 'x'.repeat(20000) }]).reason, 'too_big');
});

test('backups only copy when something changed, keep a zip, and refuse odd ids', () => {
  const os = require('os'), path = require('path'), fs = require('fs');
  const { createBackups } = require('../lib/backup');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-'));
  const file = path.join(dir, 'state.json');
  fs.writeFileSync(file, '{"a":1}');
  const b = createBackups({ dir: path.join(dir, 'backups'), sources: () => [{ name: 'state.json', file }] });
  assert.ok(b.snapshot('test'));
  assert.equal(b.snapshot('test'), null);           // niets veranderd
  fs.writeFileSync(file, '{"a":2}');
  assert.ok(b.snapshot('test'));
  assert.equal(b.list().length, 2);
  assert.ok(b.zipOf(b.list()[0].id).length > 20);
  assert.equal(b.zipOf('../../etc'), null);
});

test('the logger writes JSON lines and never lets data overwrite the event name', () => {
  const os = require('os'), path = require('path'), fs = require('fs');
  const { createLogger } = require('../lib/logger');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-'));
  const log = createLogger(dir, { echo: false });
  log.warn('limiet', { event: 'nep', actie: 'host_main' });
  const [entry] = log.recent(10, 'warn');
  assert.equal(entry.event, 'limiet');
  assert.equal(log.read('../geheim'), null);
  assert.equal(JSON.parse(log.read(log.files()[0]).toString().trim()).actie, 'host_main');
});
