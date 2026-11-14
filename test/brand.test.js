// Naam, logo, app-icoon en aftelklok: uit de Excel en uit public/media/huisstijl/
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');
const { readXlsx } = require('../lib/xlsx');
const { withQuizName, DEFAULTS } = require('../lib/texts');
const path = require('path');

const app = startServer();
const { T, routes, remote } = app;

test('starttijd wordt herkend in alle gangbare schrijfwijzen, ook als Excel er een tijd van maakt', () => {
  for (const [input, label] of [['19:30', '19:30'], ['19.30', '19:30'], ['19u30', '19:30'], ['1930', '19:30'], ['20', '20:00'], ['20 uur', '20:00'], ['0.8125', '19:30'], ['0,8125', '19:30'], [0.5, '12:00']]) {
    assert.equal((T.parseStartTime(input) || {}).label, label, `invoer ${input}`);
  }
  for (const input of ['', '-', 'straks', '25:00', '19:75']) assert.equal(T.parseStartTime(input), null, `invoer ${input}`);
});

test('naam, ondertitel, starttijd en logo komen uit de Excel en public/media/huisstijl/', () => {
  const b = T.brandInfo();
  assert.equal(b.name, 'Familiequiz');
  assert.equal(b.subtitle, 'Kerst 2026');
  assert.equal(b.start, null, 'geen vaste starttijd meer: de klok komt uit de bediening');
  assert.match(b.logo, /^\/media\/huisstijl\/logo\.svg\?v=\d+$/);
  assert.match(b.icon, /^\/media\/huisstijl\/app-icoon\.png\?v=\d+$/);
  assert.equal(b.showName, true);
});

test('de vragenlijst bevat de nieuwe instellingen bovenaan het tabblad Teksten', () => {
  const rows = readXlsx(path.join(__dirname, '..', 'vragenlijst.xlsx')).Teksten;
  const keys = rows.map((r) => r && r[1]).filter(Boolean);
  for (const k of ['quiz.naam', 'quiz.ondertitel', 'quiz.kortenaam', 'quiz.logo.naam', 'aftel.over', 'aftel.om', 'aftel.bijna', 'tv.verbinding.titel', 'tv.verbinding.tekst']) assert.ok(keys.includes(k), k);
  assert.equal(keys.indexOf('quiz.naam'), 1, 'direct onder de kopregel');
});

test('{quiznaam} en {QUIZNAAM} worden overal ingevuld', () => {
  const t = withQuizName({ ...DEFAULTS, 'quiz.naam': 'Kerstquiz' });
  assert.equal(t['welkom.titel'], 'Welkom bij de Kerstquiz!');
  assert.equal(t['lobby.titel'], 'Kerstquiz');
  assert.equal(t['einde.winnaar'], '🏆 {winnaar} WINT DE KERSTQUIZ! 🏆');
});

test('tv en telefoons krijgen naam en logo mee in de stand', () => {
  const st = remote();
  assert.equal(st.brand.name, 'Familiequiz');
  assert.ok(st.brand.logo);
  assert.ok(st.texts['aftel.over']);
  assert.ok(T.readiness().info.some((x) => /Naam: Familiequiz/.test(x)));
});

test('manifest voor het app-icoon gebruikt de korte naam en app-icoon.png', () => {
  let body = null;
  const res = { type() { return res; }, send(b) { body = b; return res; } };
  routes['/manifest.webmanifest']({ query: {} }, res);
  const m = JSON.parse(body);
  assert.equal(m.short_name, 'Familiequiz');
  assert.equal(m.display, 'standalone', 'vóór het aanmelden: als app');
  routes['/manifest.webmanifest']({ query: { mode: 'browser' } }, res);
  assert.equal(JSON.parse(body).display, 'browser', 'na het aanmelden opent het icoon gewoon de browser');
  assert.match(m.icons[0].src, /app-icoon\.png/);
});
