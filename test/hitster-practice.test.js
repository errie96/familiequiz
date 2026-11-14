// Oefenliedje in de muziekronde: iedereen krijgt dezelfde twee jaartallen en er worden nog geen
// eigen startkaarten per team uitgedeeld (anders zijn er te veel kaarten nodig).
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;

test('oefenliedje: alle teams dezelfde twee kaarten, geen startkaarten uitgedeeld', async (t) => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  host.send('host_main', { key: remote().controls.key });
  const step = T.steps.find((x) => x.kind === 'song' && x.test);
  if (!step) return t.skip('geen oefenliedje in de quiz');
  host.send('goto_step', { stepId: step.id });
  const tv = app.tvState().step;
  const alfa = tv.teams.find((x) => x.name === 'Alfa').timeline.map((c) => c.id);
  const beta = tv.teams.find((x) => x.name === 'Beta').timeline.map((c) => c.id);
  assert.equal(alfa.length, 2);
  assert.deepEqual(alfa, beta, 'iedereen dezelfde twee jaartallen');
  for (const team of Object.values(T.teams)) assert.ok(!(team.timelines && team.timelines[step.round]), 'nog geen eigen tijdlijn uitgedeeld');
  assert.equal(a.state().view.timeline.length, 2);
  assert.equal((await a.call('place_card', { stepId: step.id, slot: 1 })).ok, true);
});
