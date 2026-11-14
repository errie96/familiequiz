// Momentum-meldingen na een ronde: wie stijgt, wie pakt de leiding — zonder punten
const test = require('node:test');
const assert = require('node:assert');
const { momentumMessages } = require('../lib/momentum');

const names = ['Zeegse Zuiperds', 'BalloerBatsers', 'De Slimmeriken', 'Assen Acht'];
const texts = (m) => m.map((x) => x.text);

test('eerste ronde: neutrale melding, nooit punten of leiding', () => {
  const m = momentumMessages({ names, before: null, after: [80, 60, 40, 20] });
  assert.equal(m.length, 1);
  assert.ok(!/leiding|bovenaan|\d{2,}/.test(m[0].text), 'geen koppositie of punten');
});

test('nooit iets over de leiding of de top, en de nummer 1 wordt niet genoemd', () => {
  // vóór: A 1e, B 2e, C 3e, D 4e — na: C 1e, A 2e, D 3e, B 4e (C neemt de leiding over, maar dat zeggen we niet)
  const m = momentumMessages({ names, before: [100, 90, 80, 70], after: [150, 120, 190, 140], max: 3 });
  const all = texts(m).join(' ');
  assert.ok(!/leiding|bovenaan/i.test(all));
  assert.ok(all.includes('Het is stuivertje wisselen aan kop!'), 'wel: dát de kop wisselt, zonder naam');
  assert.ok(!all.includes('De Slimmeriken'), 'de nieuwe nummer 1 komt niet voor');
  assert.ok(m.length >= 1 && m.length <= 3);
});

test('stijger (niet de nummer 1) en comeback worden wel gemeld', () => {
  const m = momentumMessages({ names, before: [200, 150, 100, 50], after: [250, 160, 120, 190], max: 3 });
  // Assen Acht (4e → 2e) stijgt 2 plaatsen; Zeegse Zuiperds blijft eerste en wordt niet genoemd
  assert.equal(m[0].text, 'Assen Acht stijgt 2 plaatsen!');
  assert.ok(!texts(m).join(' ').includes('Zeegse Zuiperds'));
});

test('niets te melden zonder punten of met één team', () => {
  assert.deepEqual(momentumMessages({ names, before: null, after: [0, 0, 0, 0] }), []);
  assert.deepEqual(momentumMessages({ names: ['Solo'], before: null, after: [50] }), []);
});

test('meldingen over het veld noemen nooit een naam; over een team nooit de nummer 1', () => {
  // twee teams gedeeld eerste, klein verschil
  const m = momentumMessages({ names, before: [100, 95, 90, 85], after: [150, 150, 140, 135], max: 6 });
  const all = texts(m);
  assert.ok(all.includes('Twee teams delen de koppositie!'));
  assert.ok(all.includes('Niemand is nog kansloos: het verschil is klein!'));
  for (const line of all) assert.ok(!line.includes('Zeegse Zuiperds') && !line.includes('BalloerBatsers'), `geen koploper bij naam: ${line}`);
});

test('stuivertje wisselen, bloedvorm en tweede ronde op rij', () => {
  // C en D wisselen (3e/4e), niemand anders verschuift
  let m = momentumMessages({ names, before: [300, 200, 100, 90], after: [350, 240, 110, 130], max: 6 });
  assert.ok(texts(m).some((x) => /stuivertje gewisseld|klimt een plekje/.test(x)));
  // B heeft de beste rondescore maar staat niet eerste
  m = momentumMessages({ names, before: [300, 100, 90, 80], after: [320, 190, 100, 90], max: 6 });
  assert.ok(texts(m).includes('BalloerBatsers was deze ronde in bloedvorm!'));
  // D: 4e → 3e → 2e
  m = momentumMessages({ names, prev: [100, 90, 80, 70], before: [200, 180, 150, 160], after: [300, 250, 200, 260], max: 6 });
  assert.ok(texts(m).includes('Assen Acht stijgt voor de tweede ronde op rij!'));
});

test('standaard hooguit twee meldingen: één over een team en één over het veld', () => {
  const m = momentumMessages({ names, before: [100, 95, 90, 85], after: [150, 150, 140, 146] });
  assert.equal(m.length, 2);
});
