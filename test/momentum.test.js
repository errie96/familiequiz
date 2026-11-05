// Momentum-meldingen na een ronde: wie stijgt, wie pakt de leiding — zonder punten
const test = require('node:test');
const assert = require('node:assert');
const { momentumMessages } = require('../lib/momentum');

const names = ['Zeegse Zuiperds', 'BalloerBatsers', 'De Slimmeriken', 'Assen Acht'];
const texts = (m) => m.map((x) => x.text);

test('eerste ronde: leider genoemd, nooit punten', () => {
  const m = momentumMessages({ names, before: null, after: [80, 60, 40, 20] });
  assert.deepEqual(texts(m), ['Zeegse Zuiperds pakt na de eerste ronde de leiding!']);
  assert.ok(m.every((x) => !/\d{2,}/.test(x.text)), 'geen punten in de tekst');
});

test('nieuwe leider en grootste stijger', () => {
  // vóór: A 1e, B 2e, C 3e, D 4e — na: C 1e, A 2e, D 3e, B 4e
  const m = momentumMessages({ names, before: [100, 90, 80, 70], after: [150, 120, 190, 140] });
  assert.equal(m[0].text, 'De Slimmeriken neemt de leiding over!');
  assert.equal(m[1].text, 'Assen Acht klimt een plekje omhoog!');
  assert.equal(m.length, 2, 'hooguit twee meldingen');
});

test('stijger van meerdere plaatsen en comeback', () => {
  const m = momentumMessages({ names, before: [200, 150, 100, 50], after: [250, 160, 120, 190], max: 3 });
  assert.equal(m[0].text, 'Assen Acht stijgt 2 plaatsen!');
  assert.ok(!texts(m).some((t) => /laatste plek/.test(t)), 'de stijger zelf krijgt geen tweede melding');
  assert.ok(texts(m).includes('Zeegse Zuiperds blijft bovenaan!'));
});

test('spannend aan de top en gedeelde leiding', () => {
  assert.ok(texts(momentumMessages({ names, before: [100, 50, 40, 30], after: [150, 148, 60, 40] })).includes('Het is superspannend aan de top!'));
  assert.equal(momentumMessages({ names, before: [100, 90, 40, 30], after: [150, 150, 60, 40] })[0].text, 'Er staan nu meerdere teams samen bovenaan!');
});

test('niets te melden zonder punten of met één team', () => {
  assert.deepEqual(momentumMessages({ names, before: null, after: [0, 0, 0, 0] }), []);
  assert.deepEqual(momentumMessages({ names: ['Solo'], before: null, after: [50] }), []);
});
