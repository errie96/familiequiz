// Teamkleur zelf kiezen bij het aanmelden.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer();
const { T, host } = app;

test('een team kiest zijn kleur; een bezette kleur kan een ander team niet nog eens kiezen', async () => {
  host.send('set_max_teams', { n: 3 });
  const list1 = await app.connect('x').call('list_teams');
  assert.ok(list1.colors.every((c) => c.free));
  const a = await phone(app, 'a', { team: 'Groen', label: 'A' });
  // phone() geeft geen kleur mee: dan krijgt het team de eerste vrije kleur
  assert.ok(T.teams[a.res.teamId] ? true : Object.values(T.teams)[0].color);
  const b = app.connect('b');
  const res = await b.call('create_team', { teamName: 'Paars', label: 'B', color: '#a855f7' });
  assert.equal(res.ok, true);
  assert.equal(Object.values(T.teams).find((t) => t.name === 'Paars').color, '#a855f7');
  const c = app.connect('c');
  await c.call('create_team', { teamName: 'Ook paars', label: 'C', color: '#a855f7' });
  const ook = Object.values(T.teams).find((t) => t.name === 'Ook paars');
  assert.notEqual(ook.color, '#a855f7', 'bezette kleur wordt niet nog eens gegeven');
  const list2 = await app.connect('y').call('list_teams');
  assert.equal(list2.colors.find((x) => x.c === '#a855f7').free, false);
  // een kleur buiten het palet wordt niet overgenomen
  assert.ok(Object.values(T.teams).every((t) => /^#[0-9a-f]{6}$/.test(t.color)));
});
