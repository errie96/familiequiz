// Tekenaar vooraf aangewezen, 30 Seconds voor iedereen, geluid via de bediening, delen op de telefoon
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({ env: { CHEAT_GRACE_MS: '0' } });
const { T, host, remote, tvState, last, emitted } = app;
const tid = (n) => remote().teams.find((t) => t.name === n).teamId;
const view = (p) => last(p.id).view;
const P = {};

test('tekenen: tekenaar staat vast vóór de start, het woord komt pas bij de start', async () => {
  host.send('set_max_teams', { n: 3 });
  host.send('host_main');
  const a1 = await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  P.a1 = a1;
  const a2 = await phone(app, 'a2', { join: tid('Alfa'), label: 'Arie' });
  await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  await phone(app, 'b2', { join: tid('Beta'), label: 'Bea' });
  assert.equal((await a2.call('rename_self', { name: 'Ariejan' })).ok, true, 'vóór de start mag een speler zijn naam wijzigen');
  host.send('host_main'); // start de quiz
  const r = await a2.call('rename_self', { name: 'Stiekem' });
  assert.equal(r.ok, false, 'na de start niet meer');
  const draw = T.steps.find((x) => x.kind === 'draw');
  host.send('goto_step', { stepId: draw.id });
  assert.equal(T.ss(draw).status, 'ready');
  const roles = [view(a1), view(a2)].map((v) => v.role).sort();
  assert.deepEqual(roles, ['drawer', 'guesser'], 'in "klaar" staat de tekenaar al vast');
  const drawerView = [view(a1), view(a2)].find((v) => v.role === 'drawer');
  assert.equal(drawerView.word, null, 'het woord blijft geheim tot de start');
  assert.ok(tvState().step.teams.every((t) => t.drawer), 'de tv toont wie er tekent');
  host.send('host_main'); // start de beurt
  assert.equal(T.ss(draw).status, 'drawing');
  assert.ok([view(a1), view(a2)].find((v) => v.role === 'drawer').word, 'nu ziet de tekenaar het woord');
});

test('30 Seconds: wie later aansluit komt ook aan de beurt', async () => {
  const thirty = T.steps.find((x) => x.kind === 'thirty');
  host.send('goto_step', { stepId: thirty.id });
  const s = T.ss(thirty);
  assert.equal(s.order.length, 4);
  const late = await phone(app, 'b3', { join: tid('Beta'), label: 'Bram' });
  assert.ok(late.res.ok);
  for (let i = 0; i < 40 && remote().step.id === thirty.id; i++) {
    const main = remote().controls.main;
    if (/Ronde afsluiten/.test(main.label)) break;
    host.send('host_main');
  }
  const explainers = new Set(s.turns.map((t) => t.deviceId));
  assert.equal(s.order.length, 5, 'de laatkomer staat in de rij');
  assert.equal(explainers.size, 5, 'alle vijf spelers hebben uitgelegd');
});

test('geluid via de bediening: de tv stuurt geluiden door, anders niet', () => {
  const before = emitted.filter((x) => x.e === 'quiz_sound').length;
  app.tv.send('tv_sound', { name: 'ding' });
  assert.equal(emitted.filter((x) => x.e === 'quiz_sound').length, before, 'standaard klinkt alles op de tv');
  host.send('set_sound_out', { where: 'bediening' });
  assert.equal(tvState().soundOut, 'bediening');
  app.tv.send('tv_sound', { name: 'ding' });
  app.tv.send('tv_sound', { name: 'media_play', src: '/media/audio/test.mp3', at: 2 });
  app.tv.send('tv_sound', { name: 'media_play', src: 'javascript:alert(1)' });
  const got = emitted.filter((x) => x.e === 'quiz_sound' && x.room === 'remote_room').slice(-2).map((x) => x.d);
  assert.equal(got[0].name, 'ding');
  assert.equal(got[1].src, '/media/audio/test.mp3', 'alleen eigen media of https');
  host.send('set_sound_out', { where: 'tv' });
});

test('spiekmelding ook als de verbinding wegvalt tijdens een vraag', () => {
  const mc = T.steps.find((x) => x.kind === 'mc' && !x.test);
  host.send('goto_step', { stepId: mc.id });
  assert.equal(remote().alerts.length, 0);
  P.a1.h.disconnect(); // scherm op slot zonder dat het 'weg'-bericht nog verstuurd werd
  assert.equal(remote().alerts.length, 1, 'melding na het wegvallen van de verbinding');
  assert.equal(remote().alerts[0].label, 'Anna');
});

test('delen op de telefoon: na de ontknoping krijgt de telefoon de uitslag', () => {
  const b1v = () => last('b1').view;
  host.send('goto_step', { stepId: T.steps[T.steps.length - 1].id });
  for (let i = 0; i < 30 && remote().phase !== 'END'; i++) { const r = remote(); if (r.controls.main.enabled) host.send('host_main'); else if (r.controls.force) host.send('host_force'); }
  assert.equal(remote().phase, 'END');
  assert.equal(b1v().type, 'end');
  assert.equal(b1v().share, null, 'vóór de ontknoping nog geen uitslag');
  for (let i = 0; i < 20 && remote().end.reveal !== 'done'; i++) host.send('host_main');
  assert.ok(Array.isArray(b1v().share) && b1v().share.length === 2, 'uitslag om te delen');
  assert.ok(b1v().share.every((r) => r.name && Number.isFinite(r.score)));
});
