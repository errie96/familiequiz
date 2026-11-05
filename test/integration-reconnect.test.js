// Integratietest 2: telefoons die wegvallen en terugkomen.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer();
const { T, host, advanceUntil, connect } = app;
const teamOf = (name) => Object.values(T.teams).find((t) => t.name === name);

let a, b, c;
test('voorbereiding: drie teams en de eerste echte vraag staat open', async () => {
  host.send('set_max_teams', { n: 3 });
  a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  b = await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  c = await phone(app, 'c', { team: 'Gamma', label: 'Gijs' });
  advanceUntil((r) => r.phase === 'PLAY');
  advanceUntil((r) => r.step.kind === 'teamphoto');
  host.send('host_force');
  advanceUntil((r) => r.step.kind === 'joker');
  host.send('host_force');
  advanceUntil((r) => r.step.kind === 'mc' && !r.step.test && T.ss(T.cur()).status === 'open');
  assert.equal(T.cur().round, 'r1');
});

test('telefoon valt weg en komt terug: hij zit nog in zijn team en kan antwoorden', async () => {
  const q = T.cur();
  const deviceId = a.res.deviceId;
  a.send('disconnect');
  assert.equal(T.devices[deviceId].connected, false);
  // dezelfde telefoon maakt een nieuwe verbinding en meldt zich met zijn bewaarde id
  const a2 = connect('a2');
  a2.send('hello', { deviceId });
  assert.equal(T.devices[deviceId].connected, true);
  assert.equal((await a2.call('submit_answer', { stepId: q.id, value: q.answer })).ok, true);
  // een onbekende telefoon krijgt netjes "opnieuw aanmelden"
  const x = connect('x');
  x.send('hello', { deviceId: 'bestaat-niet' });
  const msg = app.emitted.filter((e) => e.room === 'x' && e.e === 'need_join').pop();
  assert.equal(msg.d.reason, 'unknown');
  a = a2;
});

test('late kans: alleen het team dat wegviel mag na het sluiten nog antwoorden', async () => {
  // volgende vraag
  advanceUntil((r) => r.step.kind === 'mc' && T.cur().id !== 'r1_c1_1' && T.ss(T.cur()).status === 'open');
  const q = T.cur();
  // Gamma valt weg; Alfa en Beta antwoorden -> vraag gaat vanzelf dicht
  const gid = c.res.deviceId;
  c.send('disconnect');
  await a.call('submit_answer', { stepId: q.id, value: q.answer });
  await b.call('submit_answer', { stepId: q.id, value: q.answer });
  assert.equal(T.ss(q).status, 'closed');
  // Gamma komt terug: mag nog antwoorden, maar de vraag gaat niet voor iedereen open
  const c2 = connect('c2');
  c2.send('hello', { deviceId: gid });
  assert.equal(T.ss(q).status, 'closed');
  assert.equal(app.last('c2').view.status, 'open', 'Gamma ziet de vraag open');
  assert.equal((await c2.call('submit_answer', { stepId: q.id, value: q.answer })).ok, true);
  assert.equal(T.ss(q).answers[teamOf('Gamma').teamId].v, q.answer);
  // de late kans is daarna weg
  assert.ok(!(T.ss(q).late || {})[teamOf('Gamma').teamId]);
  c = c2;
});

test('geen late kans voor een team dat verbonden bleef maar niet antwoordde', async () => {
  advanceUntil((r) => r.step.kind === 'mc' && T.ss(T.cur()).status === 'open' && !Object.keys(T.ss(T.cur()).answers).length);
  const q = T.cur();
  await a.call('submit_answer', { stepId: q.id, value: q.answer });
  host.send('host_force'); // quizmaster sluit zonder te wachten op Beta en Gamma
  assert.equal(T.ss(q).status, 'closed');
  // Beta "komt terug" zonder dat hij wegviel: geen extra kans
  const bid = b.res.deviceId;
  const b2 = connect('b2');
  b2.send('hello', { deviceId: bid });
  assert.equal((await b2.call('submit_answer', { stepId: q.id, value: q.answer })).reason, 'not_open');
});
