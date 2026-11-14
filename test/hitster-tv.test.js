// Muziekronde: de tijdlijnen staan op de tv, een ingediende kaart ligt dicht, en het antwoord komt pas
// na "Toon het antwoord" van de quizmaster (niet meer vanzelf zodra iedereen heeft ingediend).
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;

test('kaarten liggen dicht op de tv tot de quizmaster ze omdraait; goed blijft liggen, fout vervalt', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
  const b = await phone(app, 'b', { team: 'Beta', label: 'Bas' });
  host.send('host_main', { key: remote().controls.key });
  assert.equal(T.phase, 'PLAY');
  const step = T.steps.find((x) => x.kind === 'song' && !x.test);
  host.send('goto_step', { stepId: step.id });
  let tv = app.tvState().step;
  assert.equal(tv.status, 'open');
  assert.equal(tv.song, null, 'het liedje is nog geheim');
  assert.equal(tv.teams.length, 2);
  assert.ok(tv.teams[0].timeline.length >= 1 && tv.teams[0].timeline[0].year, 'de startkaarten liggen open op de tv');
  assert.equal(tv.teams[0].slot, null);

  const song = T.G.songs[T.ss(step).songId];
  const lineOf = (name) => Object.values(T.teams).find((t) => t.name === name).timelines[step.round].map((id) => T.G.songs[id]);
  const tl = lineOf('Alfa').map((x) => x.year), tlB = lineOf('Beta').map((x) => x.year);
  // elk team heeft zijn eigen twee startkaarten, en die komen niet meer als liedje voorbij
  assert.equal(tl.length, 2); assert.equal(tlB.length, 2);
  const keysA = lineOf('Alfa').map((x) => x.key), keysB = lineOf('Beta').map((x) => x.key);
  assert.ok(!keysA.some((k) => keysB.includes(k)), 'geen dezelfde startkaart bij twee teams');
  assert.ok(![...keysA, ...keysB].includes(song.key), 'een startkaart is niet het liedje');
  assert.notDeepEqual(tv.teams.find((t) => t.name === 'Alfa').timeline.map((c) => c.id), tv.teams.find((t) => t.name === 'Beta').timeline.map((c) => c.id));
  const goodSlot = tl.filter((y) => y <= song.year).length;
  // een plek die zeker fout is voor Beta: vóór een kaart die ouder is, of achter een kaart die nieuwer is
  const badSlot = tlB[0] < song.year ? 0 : tlB[tlB.length - 1] > song.year ? tlB.length : null;
  assert.equal((await a.call('place_card', { stepId: step.id, slot: goodSlot })).ok, true);
  tv = app.tvState().step;
  assert.equal(tv.teams.find((t) => t.name === 'Alfa').slot, goodSlot, 'dichte kaart op de gekozen plek');
  assert.equal(tv.teams.find((t) => t.name === 'Beta').slot, null);
  assert.equal(remote().controls.main.enabled, false, 'wachten op Beta');
  assert.equal((await b.call('place_card', { stepId: step.id, slot: badSlot === null ? 0 : badSlot })).ok, true);

  // iedereen heeft ingediend: nog steeds dicht, de knop wordt "Toon het antwoord"
  assert.equal(T.ss(step).status, 'open', 'niet vanzelf onthuld');
  assert.equal(app.tvState().step.song, null);
  assert.match(remote().controls.main.label, /Toon het antwoord/);
  assert.equal(a.state().view.result, null, 'ook de telefoon weet het nog niet');
  host.send('host_main', { key: remote().controls.key });

  tv = app.tvState().step;
  assert.equal(tv.status, 'revealed');
  assert.equal(tv.song.year, song.year);
  const alfa = tv.teams.find((t) => t.name === 'Alfa'), beta = tv.teams.find((t) => t.name === 'Beta');
  assert.deepEqual(alfa.result, { ok: true, slot: goodSlot });
  assert.equal(alfa.timeline[goodSlot].id, song.id, 'goed: de kaart ligt in de tijdlijn');
  assert.equal(alfa.timeline.length, tl.length + 1);
  if (badSlot !== null) {
    assert.equal(beta.result.ok, false);
    assert.equal(beta.timeline.length, tlB.length, 'fout: de kaart vervalt');
  }
  assert.equal(a.state().view.result.ok, true);
});
