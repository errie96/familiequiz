// Testvragen: iedereen antwoordt op zijn eigen telefoon; bij gewone vragen alleen de basistelefoon
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;

test('een testvraag is pas binnen als elke verbonden telefoon heeft geantwoord', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a1 = await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  const alfa = remote().teams[0].teamId;
  const a2 = await phone(app, 'a2', { join: alfa, label: 'Arie' });
  const a3 = await phone(app, 'a3', { join: alfa, label: 'Ali' });
  const b1 = await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  await a2.call('approve_base'); await a3.call('approve_base');
  host.send('host_main', { key: remote().controls.key });
  const q = T.steps.find((x) => x.kind === 'mc' && x.round === 'test');
  app.advanceUntil(() => T.cur() === q && T.ss(q).status === 'open');
  // elke telefoon mag indienen
  for (const p of [a1, a2, a3, b1]) { assert.equal(p.state().view.isBase, true); assert.equal(p.state().view.everyone, true); }
  assert.equal((await a2.call('submit_answer', { stepId: q.id, value: 1 })).ok, true, 'ook een gewoon teamlid');
  assert.equal(a2.state().view.answered, true);
  assert.equal(a1.state().view.answered, false, 'ieder zijn eigen antwoord');
  assert.equal(app.tvState().step.teams.find((t) => t.name === 'Alfa').answered, false, 'team nog niet compleet');
  assert.match(remote().controls.main.hint, /Alfa \(Anna, Ali\)/, 'de bediening ziet wie er nog ontbreekt');
  assert.equal((await a1.call('submit_answer', { stepId: q.id, value: q.answer })).ok, true);
  assert.equal(T.ss(q).answers[alfa].v, q.answer, 'het antwoord van de basistelefoon geldt als teamantwoord');
  assert.equal((await b1.call('submit_answer', { stepId: q.id, value: 0 })).ok, true);
  assert.equal(T.ss(q).status, 'open', 'Ali ontbreekt nog');
  assert.equal((await a3.call('submit_answer', { stepId: q.id, value: 2 })).ok, true);
  assert.equal(T.ss(q).status, 'closed', 'iedereen binnen: de vraag sluit');
  assert.equal((await a3.call('submit_answer', { stepId: q.id, value: 3 })).ok, false, 'daarna niet meer');
});

test('een telefoon die wegvalt houdt de testvraag niet tegen', async () => {
  const q2 = T.steps.filter((x) => x.kind === 'mc' && x.round === 'test')[1];
  app.advanceUntil(() => T.cur() === q2 && T.ss(q2).status === 'open');
  const dev = Object.values(T.devices).find((d) => d.label === 'Ali');
  dev.connected = false;
  const byLabel = (label) => Object.values(T.devices).find((d) => d.label === label);
  T.ss(q2).personal = { [byLabel('Anna').deviceId]: { v: 0, t: 1 }, [byLabel('Arie').deviceId]: { v: 0, t: 1 }, [byLabel('Bas').deviceId]: { v: 0, t: 1 } };
  assert.equal(T.hasAnswered(Object.values(T.teams).find((t) => t.name === 'Alfa'), q2), true);
});

test('bij een gewone vraag dient alleen de basistelefoon in', async () => {
  const q = T.steps.find((x) => x.kind === 'mc' && !x.test && x.round !== 'test');
  host.send('goto_step', { stepId: q.id });
  app.advanceUntil(() => T.ss(q).status === 'open');
  const view = app.last('a2').view;
  assert.equal(view.isBase, false);
  assert.equal(view.everyone, undefined);
});
