// Pauzedilemma's: alleen tijdens een pauze, iedereen kan stemmen, geen punten
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { host, remote, tvState, last } = app;

test('pauzedilemma: volgende pushen, stemmen, verdeling zien', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a = await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  const b = await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  host.send('host_main', { key: remote().controls.key }); // start
  assert.ok(remote().dilemma.count >= 10, 'dilemma\'s uit de Excel');
  host.send('next_dilemma');
  assert.equal(tvState().dilemma, null, 'buiten de pauze geen dilemma');
  host.send('toggle_pause');
  host.send('next_dilemma');
  const d = tvState().dilemma;
  assert.ok(d && d.text && d.a && d.b, 'de tv toont het dilemma');
  assert.equal(d.total, 0);
  assert.equal(last('a1').dilemma.counts, null, 'vóór het stemmen geen uitslag op de telefoon');
  assert.equal((await a.call('vote_dilemma', { choice: 'a' })).ok, true);
  assert.equal((await b.call('vote_dilemma', { choice: 'b' })).ok, true);
  assert.equal((await b.call('vote_dilemma', { choice: 'x' })).ok, false, 'alleen A of B');
  assert.deepEqual(tvState().dilemma.counts, { a: 1, b: 1 });
  assert.equal(last('a1').dilemma.mine, 'a');
  assert.deepEqual(last('a1').dilemma.counts, { a: 1, b: 1 }, 'na het stemmen zie je de verdeling');
  // omdraaien mag
  await a.call('vote_dilemma', { choice: 'b' });
  assert.deepEqual(tvState().dilemma.counts, { a: 0, b: 2 });
  host.send('hide_dilemma');
  assert.equal(tvState().dilemma, null, 'foto\'s weer tonen');
  // een nieuwe pauze begint zonder dilemma
  host.send('toggle_pause'); host.send('toggle_pause');
  assert.equal(tvState().dilemma, null);
});

test('"Vorige" kan alleen als er een vorige stap is (voor de knoppen van beide bedieningen)', () => {
  host.send('goto_step', { stepId: app.T.steps[3].id });
  assert.equal(remote().canPrev, true, 'midden in de quiz kan het');
  host.send('goto_step', { stepId: app.T.steps[0].id });
  assert.equal(remote().canPrev, false, 'op de eerste stap niet');
});

test('de quizmaster kan tijdens de pauze een pauzefoto maken (bediening2); buiten de pauze niet', async () => {
  const tiny = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64');
  if (remote().paused) host.send('toggle_pause'); // begin zonder pauze
  const before = (tvState().pausePhotos || []).length;
  const buiten = await host.call('host_pause_photo', { dataUrl: tiny });
  assert.equal(buiten.ok, false, 'niet buiten de pauze');
  host.send('toggle_pause');
  assert.equal((await host.call('host_pause_photo', { dataUrl: 'geen foto' })).ok, false, 'alleen een echte jpeg');
  const res = await host.call('host_pause_photo', { dataUrl: tiny });
  assert.equal(res.ok, true);
  assert.match(res.original, /^[a-f0-9]{32}$/, 'sleutel voor het origineel op ware grootte');
  const fotos = tvState().pausePhotos;
  assert.equal(fotos.length, before + 1, 'de foto staat op de fotomuur van de tv');
  assert.equal(fotos[fotos.length - 1].team, 'Quizmaster');
  host.send('toggle_pause');
});
