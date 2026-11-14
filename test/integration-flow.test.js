// Integratietest 1: een echte speelronde met telefoons, van aanmelden tot punten — en de geheimhouding.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer();
const { T, host, remote, tvState, advanceUntil } = app;
const teamOf = (name) => Object.values(T.teams).find((t) => t.name === name);
const stepState = (id) => T.ss(T.steps.find((s) => s.id === id));

test('scenario: aanmelden, testvraag, teamfoto, joker en een echte vraag met punten', async () => {
  host.send('set_max_teams', { n: 3 });
  const oma = await phone(app, 'p1', { team: 'Oma', label: 'Oma' });
  assert.equal(oma.res.ok, true);
  const omaTeam = teamOf('Oma');
  const opa = await phone(app, 'p2', { join: omaTeam.teamId, label: 'Opa' });
  assert.equal(opa.res.ok, true);
  const neven = await phone(app, 'p3', { team: 'Neven', label: 'Kees' });
  assert.equal(neven.res.ok, true);

  // aanmeldscherm, startklaar en starten
  advanceUntil((r) => r.phase === 'PLAY');
  // na de start kan er geen nieuw team meer bij
  const laat = await phone(app, 'p4', { team: 'Te laat', label: 'X' });
  assert.equal(laat.res.ok, false);

  // testvraag: iedereen antwoordt op zijn eigen telefoon (ook wie niet de basistelefoon is)
  advanceUntil((r) => r.step.id === 'test_1' && stepState('test_1').status === 'open');
  const q = T.steps.find((s) => s.id === 'test_1');
  assert.equal((await opa.call('submit_answer', { stepId: q.id, value: (q.answer + 1) % q.options.length })).ok, true);
  assert.equal((await oma.call('submit_answer', { stepId: q.id, value: q.answer })).ok, true);
  assert.equal(stepState('test_1').status, 'open', 'het andere team moet nog');
  assert.equal((await neven.call('submit_answer', { stepId: q.id, value: (q.answer + 1) % q.options.length })).ok, true);
  assert.equal(stepState('test_1').status, 'closed'); // elke telefoon geantwoord = vanzelf dicht

  // teamfoto pas na de testvragen; daarna niet meer te wijzigen
  advanceUntil((r) => r.step.kind === 'teamphoto');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
  assert.equal((await oma.call('set_team_photo', { dataUrl: jpeg })).ok, true);
  assert.equal((await neven.call('teamphoto_skip')).ok, true);

  // eerst "hier begint de echte quiz", dan de joker
  advanceUntil((r) => r.step.kind === 'joker');
  const order = T.steps.map((s) => s.id);
  assert.ok(order.indexOf('real_start') < order.indexOf('joker'));
  assert.equal((await oma.call('set_team_photo', { dataUrl: jpeg })).ok, false);
  assert.equal((await oma.call('joker_choose', { roundId: 'r1' })).ok, true);
  assert.equal((await neven.call('joker_choose', { roundId: 'r2' })).ok, true);

  // eerste echte vraag van ronde 1
  advanceUntil((r) => r.step.kind === 'mc' && !r.step.test && r.step.round === 'r1' && stepState(r.step.id).status === 'open');
  const q1 = T.cur();
  await oma.call('submit_answer', { stepId: q1.id, value: q1.answer });
  await neven.call('submit_answer', { stepId: q1.id, value: (q1.answer + 1) % q1.options.length });
  const r1 = T.roundById.r1;
  const omaR1 = T.roundScore(teamOf('Oma'), r1), nevenR1 = T.roundScore(teamOf('Neven'), r1);
  assert.ok(omaR1 > 0, 'goed antwoord levert punten op');
  assert.equal(nevenR1, 0);
  // joker op ronde 1 telt dubbel
  assert.equal(T.totalBeforeFinal(teamOf('Oma')), omaR1 * 2);
});

test('geheim: tv en telefoons krijgen tijdens het spel nergens punten te zien', async () => {
  const tvJson = JSON.stringify(tvState());
  assert.ok(!/"score"\s*:/.test(tvJson), 'geen score op de tv');
  for (const id of ['p1', 'p2', 'p3']) assert.ok(!/"score"\s*:/.test(JSON.stringify(app.last(id))), `geen score op telefoon ${id}`);
  // "Dit was ronde": alleen teams, geen punten en geen volgorde
  host.send('goto_step', { stepId: 'r1_result' });
  const rr = tvState().step;
  assert.equal(rr.kind, 'roundresult');
  assert.ok(!/"(round|total|score|max)"\s*:\s*\d/.test(JSON.stringify(rr)));
  assert.deepEqual(rr.teams.map((t) => t.name), ['Neven', 'Oma']); // alfabetisch
  // tussenstand: alleen posities
  host.send('toggle_positions', { mode: 'list' });
  const pos = tvState().positions;
  assert.equal(pos.mode, 'list');
  assert.equal(pos.list[0].name, 'Oma');
  assert.ok(pos.list.every((p) => p.score === undefined));
  // balkenrace: verhoudingen per gespeelde ronde, geen punten
  host.send('toggle_positions', { mode: 'race' });
  const race = tvState().positions;
  assert.equal(race.mode, 'race');
  assert.ok(race.series.every((t) => t.values.every((v) => v >= 0 && v <= 100)));
  assert.ok(!/"score"\s*:/.test(JSON.stringify(race)));
  host.send('toggle_positions', { mode: 'race' });
  assert.equal(tvState().positions, null);
});

test('geheim: bij de prijzenronde komen geen bedragen op de tv', async () => {
  host.send('goto_step', { stepId: 'r5_intro' });
  advanceUntil((r) => r.step.kind === 'price' && !r.step.test && T.ss(T.cur()).status === 'open');
  host.send('host_force'); // sluiten zonder te wachten
  const p = tvState().step;
  assert.equal(p.status, 'revealed');
  assert.equal(p.truth, undefined);
  const step = T.cur();
  assert.ok(!JSON.stringify(p).includes(String(step.now)) || String(step.now).length < 3);
});

test('startklaar: de meegeleverde vragenlijst heeft geen blokkerende fouten', () => {
  const r = T.readiness();
  assert.deepEqual(r.errors, []);
  assert.ok(r.info.some((x) => /Ronde 1/.test(x)));
});
