// Thema's: de nieuwe thema's zijn te kiezen, onbekende namen niet, en elk thema heeft een blok in themes.css.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { THEMES, DEFAULT_SETTINGS, sanitizeSettings } = require('../lib/settings');

test('nieuwe thema\'s worden geaccepteerd, onbekende niet', () => {
  for (const t of ['tvshow', 'feest', 'sinterklaas', 'disco', 'winter', 'halloween']) {
    assert.ok(THEMES.includes(t), t);
    assert.equal(sanitizeSettings({ theme: t }, DEFAULT_SETTINGS).theme, t);
  }
  assert.equal(sanitizeSettings({ theme: 'bestaatniet' }, DEFAULT_SETTINGS).theme, DEFAULT_SETTINGS.theme);
});

test('uiterlijk: standaard klassiek, alleen "klassiek" of "nieuw", wisselen kan altijd en tv en telefoons krijgen het mee', async () => {
  const { startServer, phone } = require('../test-helpers/harness');
  assert.equal(DEFAULT_SETTINGS.look, 'klassiek');
  assert.equal(sanitizeSettings({ look: 'raar' }, DEFAULT_SETTINGS).look, 'klassiek');
  const app = startServer({});
  app.host.send('set_look', { look: 'nieuw' });
  assert.equal(app.T.G.settings.look, 'nieuw');
  assert.equal(app.tvState().look, 'nieuw');
  app.host.send('set_look', { look: 'onzin' });
  assert.equal(app.T.G.settings.look, 'nieuw', 'onbekend uiterlijk wordt genegeerd');
  const p = app.connect('x');
  p.send('set_look', { look: 'klassiek' });
  assert.equal(app.T.G.settings.look, 'nieuw', 'een telefoon mag het niet wijzigen');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'look-nieuw.css'), 'utf8');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.split('{')[0].trim()).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d+%)/.test(s));
  const loose = rules.filter((sel) => !sel.split(',').every((x) => /data-look="nieuw"/.test(x)) && !/^\.mc-opt \.opt-l$|#tv-segs/.test(sel));
  assert.deepEqual(loose, [], 'alle regels van het nieuwe uiterlijk gelden alleen bij data-look="nieuw"');
  void phone;
});

test('elk thema (behalve standaard) heeft kleuren in themes.css en een naam in de bediening', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'themes.css'), 'utf8');
  const names = fs.readFileSync(path.join(__dirname, '..', 'public', 'bediening', 'settings.js'), 'utf8');
  for (const t of THEMES.filter((x) => x !== 'standaard')) {
    assert.match(css, new RegExp(`body\\[data-theme="${t}"\\] \\{[^}]*--primary:`), `kleuren voor ${t}`);
    assert.match(names, new RegExp(`\\b${t}: "`), `naam voor ${t}`);
  }
});
