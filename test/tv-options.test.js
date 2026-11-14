// Tv: de antwoordopties worden niet bij elke nieuwe stand opnieuw opgebouwd (dat liet ze even wegvallen en terugkomen)
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');
const { loadPage } = require('../test-helpers/ui-runner');

const app = startServer({});
const { T, host, remote, tvState } = app;

test('meerkeuze op de tv: dezelfde opties blijven staan als er een team antwoordt; bij een ander antwoord wel opnieuw', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  host.send('host_main', { key: remote().controls.key });
  const mc = T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text');
  host.send('goto_step', { stepId: mc.id });
  T.ss(mc).status = 'open';
  host.send('set_show_answers', { mc: false }); // zorgt voor een nieuwe stand
  const st = tvState();
  assert.equal(st.step.status, 'open');

  const ui = loadPage('host.html');
  ui.fire('connect'); ui.fire('tv_ok', {});
  ui.fire('state_update', st);
  const box = () => ui.ctx.document.getElementById('mc-options');
  const g1 = box().firstChild;
  assert.ok(g1, 'de opties staan er');
  // een team antwoordt: de stand verandert, de opties blijven hetzelfde element
  const st2 = { ...st, step: { ...st.step, teams: st.step.teams.map((t, i) => (i === 0 ? { ...t, done: true } : t)) } };
  ui.fire('state_update', st2);
  ui.fire('state_update', st2);
  assert.strictEqual(box().firstChild, g1, 'niet opnieuw opgebouwd');
  // het goede antwoord wordt getoond: nu wel opnieuw (met ring en dimmen)
  ui.fire('state_update', { ...st2, step: { ...st2.step, status: 'closed', answer: mc.answer } });
  assert.notStrictEqual(box().firstChild, g1, 'bij een ander antwoord opnieuw opgebouwd');
  ui.done();
  assert.deepEqual(ui.errors, []);
});

test('antwoorden vliegen precies één keer per vraag binnen (ook na de leestijd en nieuwe standen)', async () => {
  host.send('goto_step', { stepId: T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text').id });
  const mc = T.steps.find((x) => x.kind === 'mc' && !x.test && x.variant === 'text');
  const mc2 = T.steps.filter((x) => x.kind === 'mc' && !x.test && x.variant === 'text')[1];
  T.ss(mc).status = 'open';
  host.send('set_show_answers', { mc: false });
  const base = tvState();
  const ui = loadPage('host.html');
  const doc = ui.ctx.document;
  let calls = 0;
  const orig = doc.createElement.bind(doc);
  doc.createElement = (tag) => { const e = orig(tag); e.animate = () => { calls++; return {}; }; return e; };
  ui.fire('connect'); ui.fire('tv_ok', {});
  const withStatus = (st, status, extra = {}) => ({ ...st, step: { ...st.step, status, ...extra } });
  ui.fire('state_update', withStatus(base, 'reading'));
  assert.equal(calls, 0, 'tijdens het lezen vliegt er nog niets');
  ui.fire('state_update', withStatus(base, 'open'));
  assert.equal(calls, base.step.options.length, 'bij het tonen (open) vliegen alle opties binnen');
  ui.fire('state_update', withStatus(base, 'open'));
  ui.fire('state_update', withStatus(base, 'open', { teams: base.step.teams.map((t) => ({ ...t, done: true })) }));
  ui.fire('state_update', withStatus(base, 'closed', { answer: mc.answer }));
  assert.equal(calls, base.step.options.length, 'nieuwe standen, openen en sluiten laten niets opnieuw vliegen');
  // een andere vraag: wel weer
  T.ss(mc2).status = 'open';
  host.send('goto_step', { stepId: mc2.id });
  const next = tvState();
  ui.fire('state_update', withStatus(next, 'reading'));
  ui.fire('state_update', withStatus(next, 'open'));
  assert.equal(calls, base.step.options.length + next.step.options.length, 'een nieuwe vraag vliegt weer binnen');
  ui.done();
  assert.deepEqual(ui.errors, []);
});
