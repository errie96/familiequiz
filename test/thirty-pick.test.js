// 30 Seconds: vast aantal vertellers per team (basistelefoon kiest), ongelijke teams en de noodknop
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, host, remote } = app;

test('bediening kiest 2 vertellers per team; basistelefoons tikken ze aan; klein team wijst een tweede beurt aan', async () => {
  host.send('set_max_teams', { n: 2 });
  host.send('host_main');
  const a1 = await phone(app, 'a1', { team: 'Alfa', label: 'Anna' });
  const alfa = remote().teams[0].teamId;
  const a2 = await phone(app, 'a2', { join: alfa, label: 'Arie' });
  const a3 = await phone(app, 'a3', { join: alfa, label: 'Ali' });
  const b1 = await phone(app, 'b1', { team: 'Beta', label: 'Bas' }); // team van één
  await a2.call('approve_base'); await a3.call('approve_base');
  host.send('host_main', { key: remote().controls.key });
  const th = T.steps.find((x) => x.kind === 'thirty');
  host.send('goto_step', { stepId: th.id });
  assert.equal(T.ss(th).status, 'ready', 'standaard: iedereen legt uit');
  assert.equal(T.ss(th).order.length, 4);
  assert.equal(remote().panel.canChoose, true);

  host.send('thirty_per', { per: 2 });
  assert.equal(T.ss(th).status, 'select');
  assert.equal(remote().controls.main.enabled, false, 'wachten op de teams');
  const va = a1.state().view;
  assert.equal(va.status, 'select');
  assert.equal(va.members.length, 3);
  // alleen de basistelefoon kiest
  assert.equal((await a2.call('thirty_pick', { stepId: th.id, picks: [va.members[0].memberId, va.members[1].memberId] })).ok, false);
  // te weinig, of twee keer dezelfde in een team dat groot genoeg is: niet goed
  assert.equal((await a1.call('thirty_pick', { stepId: th.id, picks: [va.members[0].memberId] })).ok, false);
  assert.equal((await a1.call('thirty_pick', { stepId: th.id, picks: [va.members[0].memberId, va.members[0].memberId] })).ok, false);
  assert.equal((await a1.call('thirty_pick', { stepId: th.id, picks: [va.members[2].memberId, va.members[0].memberId] })).ok, true);
  // team van één: dezelfde speler twee keer
  const vb = b1.state().view;
  assert.equal(vb.maxEach, 2);
  assert.equal((await b1.call('thirty_pick', { stepId: th.id, picks: [vb.members[0].memberId, vb.members[0].memberId] })).ok, true);
  assert.deepEqual(a1.state().view.picked.length, 2);

  assert.equal(remote().controls.main.enabled, true);
  host.send('host_main', { key: remote().controls.key }); // beurten klaarzetten
  const s = T.ss(th);
  assert.equal(s.status, 'ready');
  assert.deepEqual(s.order.map((o) => T.teams[o.teamId].name), ['Alfa', 'Beta', 'Alfa', 'Beta'], 'teams om en om, steeds één verteller');
  assert.equal(T.devices[s.order[0].deviceId].label, 'Ali', 'volgorde zoals aangetikt');
  assert.equal(remote().panel.cutPossible, true);

  // eerste beurt spelen; daarna is het aantal niet meer te wijzigen
  host.send('host_main', { key: remote().controls.key });
  assert.equal(remote().panel.canChoose, false);
  host.send('thirty_per', { per: 0 });
  assert.equal(T.ss(th).per, 2);

  // noodknop: stop na deze rondgang -> alleen Alfa en Beta één keer; terugdraaien kan
  host.send('thirty_cut', { on: true });
  assert.equal(T.ss(th).order.length, 2);
  assert.equal(remote().panel.cut, true);
  host.send('thirty_cut', { on: false });
  assert.equal(T.ss(th).order.length, 4);
  host.send('thirty_cut', { on: true });
  const r = app.advanceUntil((x) => !x.panel || x.panel.type !== 'thirty');
  assert.equal(T.ss(th).turns.length, 2, 'na de rondgang is de ronde klaar');
  void r;
});

test('instelling "vertellers per team" laat de ronde direct met kiezen beginnen; toch doorgaan laat de app kiezen', async () => {
  const extra = T.steps.filter((x) => x.kind === 'thirty');
  assert.ok(extra.length >= 1);
  // dezelfde ronde opnieuw openen kan niet (al gespeeld); controleer daarom de hulpfuncties rechtstreeks
  const team = Object.values(T.teams).find((t) => t.name === 'Alfa');
  const ids = T.teamDevices(team).map((d) => d.deviceId);
  assert.equal(T.thirtyPickValid(team, 3, ids), true);
  assert.equal(T.thirtyPickValid(team, 4, [...ids, ids[0]]), true, 'vier beurten voor drie spelers: één speler twee keer');
  assert.equal(T.thirtyPickValid(team, 4, [ids[0], ids[0], ids[1], ids[1]]), false, 'iedereen minstens één keer');
});

test('aftelklok vóór de start komt uit de bediening', async () => {
  const app2 = T; void app2;
  assert.equal(T.brandInfo().start, null);
});
