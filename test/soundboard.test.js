// Soundboard in de bediening: vaste geluiden en eigen bestanden, naar de tv of naar de bediening
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer({});
const { host, remote, emitted } = app;
const lastEmit = (e) => emitted.filter((x) => x.e === e).slice(-1)[0];

test('soundboard: geluid naar de tv, of naar de bediening als het geluid daar hoort', () => {
  const sb = remote().soundboard;
  assert.deepEqual(sb.builtin.map((x) => x.name).slice(0, 4), ['drumroll', 'applause', 'sadTrombone', 'cheer']);
  host.send('soundboard', { name: 'drumroll' });
  assert.equal(lastEmit('sfx').room, 'tv_room');
  assert.equal(lastEmit('sfx').d.name, 'drumroll');
  const n = emitted.filter((x) => x.e === 'sfx').length;
  host.send('soundboard', { name: 'iets-anders' });
  host.send('soundboard', { file: '../../server.js' });
  assert.equal(emitted.filter((x) => x.e === 'sfx').length, n, 'onbekende geluiden en bestanden worden genegeerd');
  host.send('set_sound_out', { where: 'bediening' });
  host.send('soundboard', { name: 'cheer' });
  assert.equal(lastEmit('quiz_sound').room, 'remote_room');
  assert.equal(lastEmit('quiz_sound').d.name, 'cheer');
});
