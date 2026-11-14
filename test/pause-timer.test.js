// Pauzetimer: alleen tijdens de pauze, optellen, wissen, en weg bij hervatten
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

test('pauzetimer instellen, verlengen en wissen; verdwijnt bij hervatten', async () => {
  const app = startServer();
  const { host, tvState, remote, advanceUntil, T } = app;
  host.send('set_max_teams', { n: 2 });
  await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  advanceUntil((r) => r.phase === 'PLAY');

  host.send('set_pause_timer', { minutes: 10 });
  assert.equal(T.pauseUntil, null, 'zonder pauze geen timer');

  host.send('toggle_pause');
  const t0 = Date.now();
  host.send('set_pause_timer', { minutes: 10 });
  const tv = tvState().pauseTimer;
  assert.ok(Math.abs(tv.until - (t0 + 10 * 60e3)) < 2000);
  assert.match(tv.label, /^\d{1,2}:\d{2}$/);
  assert.deepEqual(remote().pauseTimer, tv, 'bediening ziet hetzelfde');
  assert.deepEqual(app.last('a').pauseTimer, tv, 'telefoon ziet hetzelfde');

  host.send('set_pause_timer', { minutes: 5, add: true });
  assert.ok(Math.abs(tvState().pauseTimer.until - (t0 + 15 * 60e3)) < 2000, '5 minuten erbij');

  host.send('set_pause_timer', { minutes: 0 });
  assert.equal(tvState().pauseTimer, null, 'timer weg');

  host.send('set_pause_timer', { minutes: 20 });
  host.send('toggle_pause');
  assert.equal(tvState().pauseTimer, null, 'bij hervatten is de timer weg');
  assert.equal(T.pauseUntil, null);
});
