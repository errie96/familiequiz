// Meerkeuze: eerst alleen de vraag, dan de antwoorden in beeld, dan pas kiezen; tijdens een pauze staat het stil
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote, sleep, last } = app;

test('leestijd: eerst alleen de vraag, daarna staan de antwoorden er en kan er meteen geantwoord worden', async () => {
  host.send('set_max_teams', { n: 3 });
  assert.equal(remote().settings.readSeconds, 0, 'standaard komen de antwoorden direct achter de vraag aan');
  assert.equal(remote().settings.previewSeconds, undefined, 'de tussenfase bestaat niet meer');
  host.send('update_settings', { readSeconds: 1 }); // alleen om de test sneller te maken
  host.send('host_main');
  const a = await phone(app, 'a', { team: 'Alfa', label: 'Anna' });
  host.send('host_main'); // start
  const mc = T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text');
  host.send('goto_step', { stepId: mc.id });
  assert.equal(T.ss(mc).status, 'reading', 'eerst lezen');
  assert.equal(last('a').view.status, 'reading', 'de telefoon weet dat het nog leestijd is');
  const early = await a.call('submit_answer', { stepId: mc.id, value: 0 });
  assert.equal(early.ok, false, 'tijdens de leestijd kan niemand antwoorden');
  assert.match(remote().controls.main.label, /Antwoorden nu openen/);

  // pauze: de leestijd staat stil
  host.send('toggle_pause');
  await sleep(1300);
  assert.equal(T.ss(mc).status, 'reading', 'tijdens de pauze gaat de vraag niet open');
  host.send('toggle_pause');
  await sleep(1300);
  assert.equal(T.ss(mc).status, 'open', 'na de leestijd staan de antwoorden er en kan er meteen geantwoord worden');
  assert.equal(last('a').view.status, 'open');
  assert.equal((await a.call('submit_answer', { stepId: mc.id, value: 0 })).ok, true);

  // terug naar deze vraag: geen nieuwe leestijd
  host.send('prev_step');
  host.send('goto_step', { stepId: mc.id });
  assert.notEqual(T.ss(mc).status, 'reading', 'geen tweede leestijd');
});

test('leestijd: de quizmaster kan de antwoorden meteen openen', () => {
  const mc2 = T.steps.filter((x) => x.kind === 'mc' && !x.test && x.variant === 'text')[1];
  host.send('goto_step', { stepId: mc2.id });
  assert.equal(T.ss(mc2).status, 'reading');
  host.send('host_main', { key: remote().controls.key });
  assert.equal(T.ss(mc2).status, 'open');
});
