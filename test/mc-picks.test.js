// Meerkeuze met "antwoord meteen tonen": de tv krijgt per team het gekozen vakje; logo-flits aan/uit
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

test('na het laatste antwoord weet de tv welk vakje elk team koos (alleen als het antwoord getoond wordt)', async () => {
  const app = startServer();
  const { T, host, tvState, advanceUntil, remote } = app;
  host.send('set_max_teams', { n: 2 });
  host.send('update_settings', { showAnswers: { mc: true, logo: true } });
  const a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  const b = await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  advanceUntil((r) => r.phase === 'PLAY');
  advanceUntil((r) => r.step.kind === 'teamphoto'); host.send('host_force');
  advanceUntil((r) => r.step.kind === 'joker'); host.send('host_force');
  advanceUntil((r) => r.step.kind === 'mc' && !r.step.test && T.ss(T.cur()).status === 'open');
  const q = T.cur();
  assert.equal(tvState().step.picks, null, 'tijdens de vraag is er niets te zien');
  await a.call('submit_answer', { stepId: q.id, value: q.answer });
  await b.call('submit_answer', { stepId: q.id, value: (q.answer + 1) % q.options.length });
  assert.equal(T.ss(q).status, 'closed');
  assert.deepEqual(tvState().step.picks, [{ name: 'Alfa', choice: q.answer }, { name: 'Beta', choice: (q.answer + 1) % q.options.length }]);

  host.send('set_logo_sting', { on: false });
  assert.equal(remote().ambience.sting, false);
  host.send('set_logo_sting', { on: true });
  assert.equal(tvState().ambience.sting, true);
});
