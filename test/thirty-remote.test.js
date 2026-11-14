// 30 Seconds: woorden goedkeuren kan ook op de telefoonbediening (zelfde events als de laptop)
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;

test('30 Seconds: woorden zijn in de stand voor de bedieningen en goed te keuren', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a = await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  const a2 = await phone(app, 'a2', { join: remote().teams[0].teamId, label: 'Arie' });
  await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  const b2 = await phone(app, 'b2', { join: remote().teams.find((t) => t.name === 'Beta').teamId, label: 'Bea' });
  await a2.call('approve_base'); await b2.call('approve_base'); // het hele team moet akkoord zijn met de basistelefoon
  host.send('host_main', { key: remote().controls.key }); // start
  const th = T.steps.find((x) => x.kind === 'thirty');
  host.send('goto_step', { stepId: th.id });
  assert.equal(T.ss(th).status, 'ready');
  host.send('host_main', { key: remote().controls.key }); // start de beurt
  const p = remote().panel;
  assert.equal(p && p.type, 'thirty');
  assert.equal(p.words.length, 5);
  host.send('thirty_toggle', { index: 0 });
  assert.equal(remote().panel.ok[0], true, 'woord goedgekeurd');
  void a;
});
