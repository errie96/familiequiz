// Ontknoping als podium: van de laatste plek omhoog, dan de laatste twee samen, dan met tromgeroffel de winnaar
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer({ fastTimers: true });
const { T, host, remote, tvState, sleep } = app;

test('podium: plek 3, dan de laatste twee samen, dan de winnaar', async () => {
  host.send('add_bots', { n: 3 });
  host.send('host_main'); host.send('host_main');
  host.send('goto_step', { stepId: T.steps[T.steps.length - 1].id });
  for (let i = 0; i < 40 && remote().phase !== 'END'; i++) { await sleep(5); const r = remote(); if (r.controls.main.enabled) host.send('host_main', { key: r.controls.key }); else if (r.controls.force) host.send('host_force', { key: r.controls.key }); }
  assert.equal(remote().phase, 'END');
  // verschillende scores, zodat er een duidelijke 1, 2 en 3 is
  const ids = remote().teams.map((t) => t.teamId);
  host.send('adjust_score', { teamId: ids[0], delta: 30 });
  host.send('adjust_score', { teamId: ids[1], delta: 20 });
  host.send('adjust_score', { teamId: ids[2], delta: 10 });
  const press = () => host.send('host_main', { key: remote().controls.key });
  assert.match(remote().controls.main.label, /Start de ontknoping/);
  press();
  assert.match(remote().controls.main.label, /Onthul plek 3/);
  press();
  assert.equal(tvState().end.revealN, 1);
  assert.match(remote().controls.main.label, /laatste twee teams/);
  press();
  assert.equal(tvState().end.duo, true, 'de laatste twee samen op de tv');
  assert.equal(tvState().end.reveal, 'stepping');
  assert.match(remote().controls.main.label, /Onthul de winnaar/);
  press();
  assert.equal(tvState().end.reveal, 'done');
  assert.equal(tvState().end.duo, false);
  assert.equal(tvState().end.revealN, 3);
});
