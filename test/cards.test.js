// Overwinningskaarten: statistieken per team, upload als PNG, in de foto-zip, en op de telefoon van elk team
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({ fastTimers: true });
const { T, host, remote, tv, routes, last, sleep } = app;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(3000, 1)]);

function post(key, buf) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.params = { key }; req.headers = { 'content-length': String(buf.length) };
    const res = { code: 200, status(c) { this.code = c; return this; }, type() { return this; }, send() { resolve(this.code); }, end() { resolve(this.code); } };
    routes['/origineel/:key'](req, res);
    setImmediate(() => { req.emit('data', buf); req.emit('end'); });
  });
}
const zipBuf = () => new Promise((resolve) => {
  const res = { set() { return this; }, status() { return this; }, type() { return this; }, send(b) { resolve(Buffer.isBuffer(b) ? b : Buffer.from(String(b))); } };
  routes['/download/fotos.zip']({ query: { t: remote().downloadToken } }, res);
});

test('overwinningskaarten voor alle teams, op de telefoon en in de foto-zip', async () => {
  host.send('set_max_teams', { n: 3 });
  host.send('host_main');
  await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  await phone(app, 'b1', { team: 'Beta', label: 'Bas' });
  await phone(app, 'c1', { team: 'Gamma', label: 'Gijs' });
  host.send('host_main', { key: remote().controls.key });
  host.send('goto_step', { stepId: T.steps[T.steps.length - 1].id });
  for (let i = 0; i < 40 && remote().phase !== 'END'; i++) { await sleep(5); const r = remote(); if (r.controls.main.enabled) host.send('host_main', { key: r.controls.key }); else if (r.controls.force) host.send('host_force', { key: r.controls.key }); }
  assert.equal(remote().phase, 'END');
  const ids = remote().teams.map((t) => t.teamId);
  host.send('adjust_score', { teamId: ids[0], delta: 30 }); host.send('adjust_score', { teamId: ids[1], delta: 20 }); host.send('adjust_score', { teamId: ids[2], delta: 10 });

  assert.equal((await tv.call('card_keys')).ok, false, 'vóór de ontknoping geen kaarten');
  assert.equal(last('a1').view.card, null, 'ook niet op de telefoon (zou de spanning verklappen)');
  for (let i = 0; i < 12 && remote().end.reveal !== 'done'; i++) host.send('host_main', { key: remote().controls.key });
  assert.equal(remote().end.reveal, 'done');

  const alfa = last('a1').view.card;
  assert.equal(alfa.rank, 1);
  assert.equal(alfa.title.startsWith('Familiequiz Kampioen'), true, 'de winnaar is kampioen');
  assert.ok(alfa.stats.length >= 1 && Number.isFinite(alfa.score));
  assert.equal(last('c1').view.card.place, '3e plaats');

  // prijsjes als badges op de telefoon: pas als de quizmaster de prijsjes toont
  assert.equal(last('a1').view.badges, null, 'nog niet tijdens de ranglijst');
  host.send('end_view', { view: 'awards' });
  assert.ok(Array.isArray(last('a1').view.badges), 'badges zodra de prijsjes getoond worden');
  host.send('end_view', { view: 'ranking' });
  const res = await tv.call('card_keys');
  assert.equal(res && res.ok, true, JSON.stringify(res));
  assert.equal(res.cards.length, 3);
  assert.equal(await post(res.cards[0].key, Buffer.from('geen png')), 400, 'alleen PNG');
  for (const c of res.cards) assert.equal(await post(c.key, PNG), c.key === res.cards[0].key ? 403 : 204);
  const second = await tv.call('card_keys'); // opnieuw maken: nieuwe sleutels, oude kaarten weg
  for (const c of second.cards) assert.equal(await post(c.key, PNG), 204);
  const zip = await zipBuf();
  assert.ok(zip.includes(Buffer.from('kaarten/01-')), 'kaarten in de foto-zip');
  assert.ok(zip.includes(Buffer.from('kaarten/03-')));
});
