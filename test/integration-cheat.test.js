// Spiekmelding met wachttijd: kort wegkijken (meldingenbalk, pop-up) geeft geen alarm, echt weggaan wel.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const GRACE = 150; // korte wachttijd zodat de test snel is
const app = startServer({ env: { CHEAT_GRACE_MS: String(GRACE) } });
const { T, remote, advanceUntil, emitted, sleep } = app;
const beeps = () => emitted.filter((x) => x.room === 'remote_room' && x.e === 'cheat_beep').length;

test('spiekmelding pas na de wachttijd, en niet als de telefoon op tijd terug is', async () => {
  app.host.send('set_max_teams', { n: 3 });
  const a = await phone(app, 'p1', { team: 'Zeegse Zuiperds', label: 'Anna' });
  await phone(app, 'p2', { team: 'BalloerBatsers', label: 'Bas' });
  assert.equal(a.res.ok, true);
  advanceUntil((r) => r.phase === 'PLAY');
  advanceUntil((r) => r.step.kind === 'mc' && T.ss(T.cur()).status === 'open');

  // 1) even weg en snel terug: geen melding
  a.send('player_blurred', { reason: 'app_switch', t: 1000 });
  await sleep(GRACE / 3);
  a.send('player_back', { t: 1100 });
  await sleep(GRACE * 2);
  assert.equal(beeps(), 0, 'kort weg: geen piep');
  assert.equal(remote().alerts.length, 0, 'kort weg: geen melding in de bediening');

  // 2) langer weg: na de wachttijd wel een melding
  a.send('player_blurred', { reason: 'locked', t: 2000 });
  assert.equal(remote().alerts.length, 0, 'meteen na weggaan nog geen melding');
  await sleep(GRACE * 2);
  assert.equal(beeps(), 1, 'na de wachttijd één piep');
  assert.equal(remote().alerts.length, 1);
  assert.equal(remote().alerts[0].label, 'Anna');

  // nogmaals weg terwijl de melding al staat: geen tweede piep
  a.send('player_blurred', { reason: 'locked', t: 2100 });
  await sleep(GRACE * 2);
  assert.equal(beeps(), 1, 'geen dubbele melding');

  // terug: melding verdwijnt
  a.send('player_back', { t: 2200 });
  assert.equal(remote().alerts.length, 0);

  // 3) weg, maar de vraag is intussen voorbij (quizmaster gaat door): geen melding achteraf
  a.send('player_blurred', { reason: 'locked', t: 3000 });
  app.host.send('toggle_pause');
  await sleep(GRACE * 2);
  assert.equal(beeps(), 1, 'op pauze gezet tijdens de wachttijd: geen melding');
  app.host.send('toggle_pause');
});
