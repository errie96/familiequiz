// Extra's: adres voor de QR-code, puntencorrectie, emoji-reacties, vooruitkijken en nieuwe awards.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer();
const { T, host, advanceUntil, remote } = app;

test('QR-adres: echte wifi (192.168.x) gaat voor Docker, WSL, VirtualBox en Tailscale', () => {
  const v4 = (address) => [{ family: 'IPv4', internal: false, address }];
  assert.equal(T.pickLanAddress({ docker0: v4('172.17.0.1'), 'vEthernet (WSL)': v4('172.25.32.1'), tailscale0: v4('100.101.1.2'), 'Wi-Fi': v4('192.168.1.23') }), '192.168.1.23');
  assert.equal(T.pickLanAddress({ 'VirtualBox Host-Only': v4('192.168.56.1'), en0: v4('10.0.0.12') }), '10.0.0.12');
  assert.equal(T.pickLanAddress({ lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), null);
});

let a, b;
test('voorbereiding: twee teams, quiz gestart', async () => {
  host.send('set_max_teams', { n: 2 });
  a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  b = await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  advanceUntil((r) => r.phase === 'PLAY');
  assert.equal(T.phase, 'PLAY');
});

test('emoji-reacties: alleen bij uitlegschermen, tussen rondes en in de pauze; niet spammen', async () => {
  const reactions = () => app.emitted.filter((e) => e.room === 'tv_room' && e.e === 'reaction').length;
  advanceUntil((r) => r.step.kind === 'info');
  a.send('react', { emoji: '😂' });
  assert.equal(reactions(), 1);
  a.send('react', { emoji: '😂' }); // te snel achter elkaar
  assert.equal(reactions(), 1);
  b.send('react', { emoji: '<script>' }); // geen geldige emoji
  assert.equal(reactions(), 1);
  advanceUntil((r) => r.step.kind === 'mc' && T.ss(T.cur()).status === 'open');
  b.send('react', { emoji: '👏' }); // tijdens een vraag niet
  assert.equal(reactions(), 1);
  host.send('toggle_pause');
  b.send('react', { emoji: '👏' }); // in de pauze wel
  assert.equal(reactions(), 2);
  host.send('toggle_pause');
});

test('vooruitkijken: de bediening ziet wat er hierna komt', () => {
  const nx = remote().upNext;
  assert.ok(nx && nx.what);
});

test('puntencorrectie: +1/−5, telt mee in de stand en is ongedaan te maken', () => {
  const alfa = Object.values(T.teams).find((t) => t.name === 'Alfa');
  const before = T.scoreOf(alfa);
  host.send('adjust_score', { teamId: alfa.teamId, delta: 1 });
  host.send('adjust_score', { teamId: alfa.teamId, delta: -5 });
  assert.equal(T.scoreOf(alfa), before - 4);
  host.send('undo_last');
  assert.equal(T.scoreOf(alfa), before + 1);
  host.send('adjust_score', { teamId: alfa.teamId, delta: 999 }); // te groot: genegeerd
  assert.equal(T.scoreOf(alfa), before + 1);
  // spelers kunnen dit niet
  a.send('adjust_score', { teamId: alfa.teamId, delta: 5 });
  assert.equal(T.scoreOf(alfa), before + 1);
});

test('nieuwe awards worden berekend zonder fouten', () => {
  const list = T.awards();
  assert.ok(Array.isArray(list));
});
