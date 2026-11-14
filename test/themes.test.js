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

test('elk thema (behalve standaard) heeft kleuren in themes.css en een naam in de bediening', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'themes.css'), 'utf8');
  const names = fs.readFileSync(path.join(__dirname, '..', 'public', 'bediening', 'settings.js'), 'utf8');
  for (const t of THEMES.filter((x) => x !== 'standaard')) {
    assert.match(css, new RegExp(`body\\[data-theme="${t}"\\] \\{[^}]*--primary:`), `kleuren voor ${t}`);
    assert.match(names, new RegExp(`\\b${t}: "`), `naam voor ${t}`);
  }
});
