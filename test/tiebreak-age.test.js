// Beslissingsvraag: de leeftijdvraag staat in de Excel (antwoord "automatisch") op de plek waar hij gesteld wordt;
// wie het dichtst bij zit wint, bij gelijke afstand wie het snelst antwoordde.
const test = require('node:test');
const assert = require('node:assert');
const { loadContent } = require('../lib/content');
const { startServer, phone } = require('../test-helpers/harness');

const base = { test: { questions: [] }, rounds: [], final: { question: 'Slotvraag?', options: ['A', 'B'], answer: 0 } };

test('"automatisch" in de Excel: de leeftijdvraag staat op die plek, met de tekst uit de Excel', () => {
  const r = loadContent(null, { ...base, tiebreakers: [
    { question: 'Hoe lang is de Afsluitdijk?', answer: 32, unit: 'km' },
    { auto: 'age', question: 'Hoeveel jaar zijn alle {aantal} spelers samen?', unit: 'jaar' },
  ] });
  const tbs = r.steps.filter((s) => s.kind === 'tiebreak').map((s) => s.id);
  assert.deepEqual(tbs, ['tiebreak_1', 'tiebreak_leeftijd']);
  const age = r.steps.find((s) => s.id === 'tiebreak_leeftijd');
  assert.equal(age.questionTpl, 'Hoeveel jaar zijn alle {aantal} spelers samen?');
  assert.equal(age.auto, 'age');
});

test('zonder "automatisch" in de Excel komt de leeftijdvraag vooraan (zoals eerder)', () => {
  const r = loadContent(null, { ...base, tiebreakers: [{ question: 'Hoe lang?', answer: 32, unit: 'km' }] });
  assert.deepEqual(r.steps.filter((s) => s.kind === 'tiebreak').map((s) => s.id), ['tiebreak_leeftijd', 'tiebreak_1']);
});

test('even dichtbij: wie het snelst antwoordde krijgt het punt', async () => {
  const app = startServer({});
  const { T, host } = app;
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a = await phone(app, 'pa', { team: 'Snel', label: 'Ann' });
  const b = await phone(app, 'pb', { team: 'Traag', label: 'Bas' });
  assert.ok(a.res && a.res.ok, JSON.stringify(a.res));
  host.send('host_main', { key: app.remote().controls.key });
  assert.equal(T.phase, 'PLAY', JSON.stringify(app.remote().controls.main));
  const step = T.steps.find((s) => s.kind === 'tiebreak' && !s.auto);
  host.send('goto_step', { stepId: step.id });
  assert.equal(T.cur() && T.cur().id, step.id, `fase ${T.phase}`);
  const s = T.ss(step);
  assert.equal(s.teams.length, 2, 'beide teams staan gelijk (0 punten)');
  const d = 2;
  assert.equal((await a.call('submit_answer', { stepId: step.id, value: step.answer - d })).ok, true);
  await app.sleep(5);
  assert.equal((await b.call('submit_answer', { stepId: step.id, value: step.answer + d })).ok, true);
  app.advanceUntil(() => s.status === 'revealed');
  assert.deepEqual(s.winners.map((id) => T.teams[id].name), ['Snel']);
});
