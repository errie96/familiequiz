// Aantal logo's in de logo-ronde is instelbaar; de ronde blijft 100 punten waard
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;
const logoSteps = () => T.steps.filter((s) => s.kind === 'logo' && !s.test && s.variant === 'logo').length;

test('logo-ronde: aantal instelbaar (standaard 10), te veel geeft een waarschuwing', () => {
  assert.equal(remote().settings.logoCount, 10);
  assert.equal(logoSteps(), 10);
  host.send('update_settings', { logoCount: 4 });
  assert.equal(logoSteps(), 4, 'na het instellen 4 logo\'s');
  host.send('update_settings', { logoCount: 40 });
  assert.equal(logoSteps(), 10, 'er staan er maar 10 in de Excel');
  assert.ok(remote().warnings.some((w) => /40 logo's gevraagd/.test(w)), 'waarschuwing bij te veel');
  host.send('update_settings', { logoCount: 10 });
});

test('antwoorden direct tonen of pas bij het nakijken (instelbaar, ook tijdens de quiz)', () => {
  const { tvState } = app;
  host.send('set_max_teams', { n: 2 });
  host.send('host_main'); host.send('add_bots', { n: 2 }); host.send('host_main');
  const mc = T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text');
  host.send('goto_step', { stepId: mc.id });
  T.ss(mc).status = 'closed';
  host.send('set_show_answers', { mc: false });
  assert.equal(tvState().step.answer, null, 'niet tonen: geen antwoord op de tv');
  host.send('set_show_answers', { mc: true });
  assert.equal(tvState().step.answer, mc.answer, 'tonen: wel het goede antwoord');
  host.send('set_show_answers', { mc: false });
  assert.equal(remote().settings.showAnswers.mc, false);
});

test('testvragen tonen het juiste antwoord, pas als de quizmaster erom vraagt (ook als antwoorden tonen uit staat)', () => {
  const { tvState } = app;
  const tq = T.steps.find((x) => x.kind === 'mc' && x.test && x.variant === 'text');
  host.send('set_show_answers', { mc: false, logo: false });
  host.send('goto_step', { stepId: tq.id });
  T.ss(tq).status = 'closed';
  host.send('set_show_answers', { mc: false }); // sync
  assert.equal(tvState().step.answer, null, 'testvraag, alle antwoorden binnen: het antwoord nog niet getoond');
  assert.match(remote().controls.main.label, /Toon het goede antwoord/, 'de quizmaster moet erom vragen');
  host.send('host_main', { key: remote().controls.key });
  assert.equal(tvState().step.answer, tq.answer, 'na de druk op de knop: het antwoord getoond');
  assert.match(remote().controls.main.label, /Volgende|volgende/, 'en daarna gaat het verder');
  const real = T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text');
  host.send('goto_step', { stepId: real.id });
  T.ss(real).status = 'closed';
  host.send('set_show_answers', { mc: false });
  assert.equal(tvState().step.answer, null, 'echte vraag: nog niet getoond');
  const oef = T.steps.find((x) => x.kind === 'logo' && x.test);
  host.send('goto_step', { stepId: oef.id });
  T.ss(oef).status = 'closed';
  host.send('set_show_answers', { logo: false });
  assert.equal(tvState().step.name, oef.name, 'oefenlogo: antwoord getoond');
  host.send('set_show_answers', { mc: false, logo: true });
});
