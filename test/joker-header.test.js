// Joker-melding rechtsboven op de tv: alleen de teams die in déze ronde hun joker hebben ingezet
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

test('de tv krijgt per ronde de teams met hun joker mee, en niets in rondes zonder joker', async () => {
  const app = startServer();
  const { T, host, advanceUntil, tvState } = app;
  host.send('set_max_teams', { n: 2 });
  await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  advanceUntil((r) => r.phase === 'PLAY');
  advanceUntil((r) => r.step.kind === 'teamphoto'); host.send('host_force');
  advanceUntil((r) => r.step.kind === 'joker');
  const [alfa, beta] = ['Alfa', 'Beta'].map((n) => Object.values(T.teams).find((t) => t.name === n));
  alfa.jokerRound = 'r1'; beta.jokerRound = 'r2';
  host.send('host_force');
  advanceUntil((r) => r.step.kind === 'mc' && !r.step.test);
  assert.deepEqual(tvState().header.jokers.map((j) => j.name), ['Alfa']);
  assert.ok(tvState().header.jokers[0].color);
  alfa.jokerRound = 'r3';
  host.send('set_max_teams', { n: 2 }); // nieuwe stand laten sturen
  assert.deepEqual(tvState().header.jokers, []);
});
