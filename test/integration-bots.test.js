// Integratietest: een complete quiz met drie testteams (robots) van begin tot einde, inclusief ontknoping.
// De timers lopen versneld, zodat de hele avond in een paar seconden voorbij is.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer({ fastTimers: true });
const { T, host, remote, tvState, sleep } = app;

test('complete quiz met robots: alle stappen, ontknoping, awards en geen quizgeschiedenis', { timeout: 120000 }, async () => {
  host.send('add_bots', { n: 3 });
  host.send('host_main'); // aanmeldscherm
  host.send('host_main'); // start
  assert.equal(remote().phase, 'PLAY');
  const kinds = new Set();
  const momentum = [];
  for (let i = 0; i < 4000 && remote().phase === 'PLAY'; i++) {
    await sleep(15); // robots de tijd geven om te antwoorden
    const r = remote();
    kinds.add(r.step.kind);
    const tvStep = tvState() && tvState().step;
    if (tvStep && tvStep.kind === 'roundresult') momentum.push(tvStep.momentum);
    if (r.controls.main.enabled) host.send('host_main');
    else if (r.controls.force) host.send('host_force');
  }
  assert.equal(remote().phase, 'END');
  for (const k of ['teamphoto', 'joker', 'mc', 'logo', 'memory', 'song', 'price', 'draw', 'thirty', 'roundresult', 'final']) assert.ok(kinds.has(k), `stap ${k} is langsgekomen`);
  // momentum-meldingen na de rondes: altijd een lijst, hooguit twee, en minstens één ronde met een melding
  assert.ok(momentum.length && momentum.every((m) => Array.isArray(m) && m.length <= 2), 'momentum bij elke rondeuitslag');
  assert.ok(momentum.some((m) => m.length > 0), 'minstens één momentum-melding');
  // nakijken: muziekronde als tijdlijn (oud → nieuw), prijzen nu en vroeger samen op één scherm
  const pages = T.reviewPages('all');
  const tl = pages.filter((p) => /Tijdlijn/.test(p.subtitle));
  assert.ok(tl.length, 'tijdlijn bij de muziekronde');
  const years = tl.flatMap((p) => p.rows.map((r) => Number(r[0])));
  assert.deepEqual(years, [...years].sort((a, b) => a - b), 'liedjes op volgorde van jaar');
  const pr = pages.filter((p) => /^Prijzen nu en/.test(p.subtitle));
  assert.ok(pr.length && pr[0].columns.includes('Wanneer'), 'prijzen nu en vroeger op één scherm');
  assert.ok(pr[0].rows.some((r) => r[1] === 'Nu') && pr[0].rows.some((r) => /jaar geleden/.test(r[1])));
  // ontknoping: plek voor plek tot het einde
  for (let i = 0; i < 20 && remote().end.reveal !== 'done'; i++) host.send('host_main');
  assert.equal(remote().end.reveal, 'done');
  const scores = remote().end.scores;
  assert.equal(scores.length, 3);
  assert.ok(scores.every((s, i) => i === 0 || s.score <= scores[i - 1].score), 'ranglijst van hoog naar laag');
  host.send('end_view', { view: 'awards' });
  assert.ok(tvState().end.awards.length >= 3, 'er worden prijsjes uitgereikt');
  host.send('end_view', { view: 'album' });
  assert.ok(Array.isArray(tvState().end.album));
  assert.equal(remote().end.album, null, 'het album gaat alleen naar de tv');
});
