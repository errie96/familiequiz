// Robots melden zich aan zoals echte deelnemers: met een familie (uit de lijst, anders "Robot") en een leeftijd;
// de eerste robot per team is volwassen. Robots tellen niet mee bij het maken van de teams.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer({});
const { T, host } = app;

test('robots hebben een familie en een leeftijd', () => {
  host.send('add_bots', { n: 3 });
  const fams = ((T.G.content && T.G.content.families) || []).map((f) => f.name);
  const bots = Object.values(T.devices).filter((d) => d.bot);
  assert.equal(bots.length, 6, 'twee robots per team');
  for (const d of bots) {
    assert.ok(d.family, 'familie ingevuld');
    if (fams.length) assert.ok(fams.includes(d.family), `familie ${d.family} komt uit de lijst`);
    else assert.equal(d.family, 'Robot');
    assert.ok(Number.isInteger(d.age) && d.age >= 6 && d.age <= 70, `leeftijd ${d.age}`);
  }
  for (const t of Object.values(T.teams).filter((x) => x.bot)) {
    const base = T.devices[t.baseDeviceId];
    assert.ok(base.age >= 18, 'eerste robot is volwassen');
  }
});
