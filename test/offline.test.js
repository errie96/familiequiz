// Spelen zonder internet: QR-code uit de server zelf, controlescript en vaste versies.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawnSync } = require('child_process');
const { matrix, svg } = require('../lib/qr');

test('QR-code: juiste grootte, drie zoekvierkanten en altijd dezelfde uitkomst', () => {
  const m = matrix('http://192.168.1.23:3000');
  assert.equal(m.length, 25); // versie 2
  const finder = (r, c) => m[r][c] === 1 && m[r + 6][c + 6] === 1 && m[r + 3][c + 3] === 1 && m[r + 1][c + 1] === 0;
  assert.ok(finder(0, 0) && finder(0, m.length - 7) && finder(m.length - 7, 0));
  assert.deepEqual(matrix('http://192.168.1.23:3000'), m);
  assert.equal(matrix('https://example.com/' + 'x'.repeat(190)).length, 57); // versie 10
  assert.throws(() => matrix('x'.repeat(400)), /te lang/);
  assert.match(svg('http://10.0.0.2:3000'), /^<svg[^>]+viewBox="0 0 33 33"/);
});

test('de server levert de QR-code zelf (geen internet of extra bibliotheek nodig)', () => {
  const { startServer } = require('../test-helpers/harness');
  const app = startServer();
  let body = null, type = null;
  app.routes['/qr.svg']({}, { set() { return this; }, type(t) { type = t; return this; }, send(b) { body = b; } });
  assert.equal(type, 'image/svg+xml');
  assert.match(body, /<path d="M/);
});

test('offline-controle draait en laat netwerk en ontbrekende zaken zien', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'offline-check.js')], { encoding: 'utf8' });
  assert.match(r.stdout, /1\. Programma/);
  assert.match(r.stdout, /3\. Netwerk/);
});

test('afhankelijkheden staan vast op één versie (geen ^ of ~)', () => {
  const pkg = require('../package.json');
  for (const [name, v] of Object.entries(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${name}: ${v}`);
});
