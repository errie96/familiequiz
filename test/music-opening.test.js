// Jingle, achtergrondmuziek, opening en tv-geluid
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer();

test('standaard-jingle en achtergrondmuziek worden gevonden en meegestuurd', () => {
  const m = app.T.musicState();
  assert.match(m.opening, /^\/media\/muziek\/opening\.wav\?v=\d+$/);
  assert.match(m.background, /^\/media\/muziek\/achtergrond\.wav\?v=\d+$/);
  assert.equal(m.on, true);
  assert.deepEqual(app.remote().ambience, m);
  assert.ok(app.T.readiness().info.some((x) => /Opening: public\/media\/muziek\/opening\.wav/.test(x)));
});

test('achtergrondmuziek aan/uit en opening testen vanuit de bediening', () => {
  const { host, emitted } = app;
  host.send('set_music', { on: false });
  assert.equal(app.remote().ambience.on, false);
  host.send('set_music', { on: true });
  assert.equal(app.remote().ambience.on, true);
  const before = emitted.length;
  host.send('test_opening');
  const sent = emitted.slice(before).filter((e) => e.e === 'opening').map((e) => e.room).sort();
  assert.deepEqual(sent, ['remote_room', 'tv_room']);
});

test('bij de start van de quiz komt de opening op de tv', async () => {
  const { host, emitted, advanceUntil } = app;
  host.send('set_max_teams', { n: 2 });
  await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  const before = emitted.length;
  advanceUntil((r) => r.phase === 'PLAY');
  assert.ok(emitted.slice(before).some((e) => e.e === 'opening' && e.room === 'tv_room'));
});
