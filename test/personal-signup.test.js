// Persoonlijk aanmelden (naam, familie, leeftijd), teams maken in de bediening, teamnaam kiezen, laatkomers,
// herstel na een herstart en de automatische beslissingsvraag (leeftijden opgeteld)
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');
const { makeTeams } = require('../lib/teammaker');

const app = startServer({ env: { QUIZ_SIGNUP: 'personal' } });
const { T, host, remote } = app;

const FAMS = { Jansen: [68, 66, 40, 38, 12, 9], 'De Vries': [45, 44, 17, 15], Bakker: [35, 33, 6, 4] };
const phones = {};

test('het verdeelalgoritme maakt even grote teams en spreidt families en leeftijden', () => {
  const list = [];
  for (const [f, ages] of Object.entries(FAMS)) ages.forEach((age, i) => list.push({ id: `${f}${i}`, age, family: f }));
  for (let run = 0; run < 20; run++) {
    const teams = makeTeams(list, 4);
    assert.equal(teams.flat().length, list.length);
    assert.equal(new Set(teams.flat()).size, list.length, 'niemand dubbel');
    const sizes = teams.map((t) => t.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'even groot');
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    for (const t of teams) {
      const kids = t.filter((id) => byId[id].age < 18).length;
      assert.ok(kids >= 1 && kids <= 2, `kinderen gespreid (${sizes}; ${kids})`);
      const fam = {}; t.forEach((id) => { fam[byId[id].family] = (fam[byId[id].family] || 0) + 1; });
      assert.ok(Math.max(...Object.values(fam)) <= 2, 'hooguit twee van dezelfde familie');
    }
  }
  // jonge kinderen bij een volwassen gezinslid
  for (let run = 0; run < 10; run++) {
    const teams = makeTeams(list, 4, { keepKidsAge: 9 });
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    for (const t of teams) for (const id of t) if (byId[id].age <= 9) assert.ok(t.some((o) => byId[o].family === byId[id].family && byId[o].age >= 18), 'kind zit bij een volwassen gezinslid');
  }
});

test('aanmelden: naam, familie uit de lijst en leeftijd; dubbele namen en onbekende families worden geweigerd', async () => {
  T.G.content.families = [{ name: 'Jansen', count: 6 }, { name: 'De Vries', count: 4 }, { name: 'Bakker', count: 4 }];
  host.send('set_max_teams', { n: 3 });
  host.send('host_main'); // aanmeldscherm
  const p0 = app.connect('x0');
  const info = await p0.call('signup_info');
  assert.equal(info.personal, true);
  assert.deepEqual(info.families, ['Jansen', 'De Vries', 'Bakker']);
  assert.equal((await p0.call('create_team', { teamName: 'Zelf', label: 'Piet' })).ok, false, 'zelf een team maken kan niet');
  assert.equal((await p0.call('signup', { label: 'Piet', family: 'Onbekend', age: 30 })).ok, false);
  assert.equal((await p0.call('signup', { label: 'Piet', family: 'Jansen', age: 'dertig' })).ok, false);
  let n = 0;
  for (const [f, ages] of Object.entries(FAMS)) for (const age of ages) {
    const id = `p${n++}`;
    const p = app.connect(id);
    const res = await p.call('signup', { label: `${f.slice(0, 3)}${age}`, family: f, age });
    assert.equal(res.ok, true, JSON.stringify(res));
    phones[id] = { ...p, deviceId: res.deviceId, state: () => app.last(id) };
  }
  assert.equal((await p0.call('signup', { label: 'jan68', family: 'Jansen', age: 68 })).ok, false, 'naam bestaat al');
  const s = remote().signup;
  assert.equal(s.total, 14);
  assert.equal(s.expected, 14);
  assert.equal(s.complete, true);
  assert.deepEqual(s.families[0].people.map((x) => x.age), [9, 12, 38, 40, 66, 68], 'van jong naar oud per familie');
  assert.equal(phones.p0.state().view.type, 'signup_wait');
  assert.equal(remote().controls.main.enabled, false, 'eerst teams maken');
  // de tv ziet alleen namen, geen leeftijden
  const tvFam = app.tvState().signup.families[0];
  assert.equal(tvFam.present, 6);
  assert.equal(tvFam.people[0].age, undefined);
});

test('teams maken: even groot, basistelefoon is een volwassene, teams kiezen zelf naam en kleur', async () => {
  await host.call('make_teams');
  const s = remote().signup;
  assert.equal(s.teams.length, 3);
  assert.deepEqual(s.teams.map((t) => t.size).sort(), [4, 5, 5]);
  assert.equal(s.unassigned, 0);
  for (const t of s.teams) assert.ok(t.members.find((m) => m.base).age >= 18, 'basis is volwassen');
  assert.match(remote().controls.main.label, /naam/i, 'wachten op teamnamen');
  // opnieuw verdelen kan
  await host.call('make_teams');
  assert.equal(remote().signup.teams.length, 3);
  const teams = remote().signup.teams;
  let i = 0;
  for (const t of teams) {
    const base = Object.values(phones).find((p) => p.deviceId === t.members.find((m) => m.base).deviceId);
    const other = Object.values(phones).find((p) => p.deviceId === t.members.find((m) => !m.base).deviceId);
    assert.equal(base.state().me.setup.needsName, true);
    assert.equal((await other.call('team_setup', { name: 'Stiekem' })).ok, false, 'alleen de basistelefoon');
    assert.equal((await base.call('team_setup', { name: `Kanjers ${++i}` })).ok, true);
    for (const m of t.members) if (!m.base) await Object.values(phones).find((p) => p.deviceId === m.deviceId).call('approve_base');
  }
  assert.equal((await Object.values(phones).find((p) => p.deviceId === teams[1].members.find((m) => m.base).deviceId).call('team_setup', { name: 'Kanjers 1' })).ok, false, 'naam al in gebruik');
  assert.equal(remote().controls.main.enabled, true, remote().controls.main.hint);
  assert.match(remote().controls.main.label, /Start/);
});

test('een laatkomer meldt zich aan, de bediening deelt hem in; verwijderen en verplaatsen kan', async () => {
  const late = app.connect('late');
  const res = await late.call('signup', { label: 'Laat', family: 'Bakker', age: 50 });
  assert.equal(res.ok, true);
  assert.equal(remote().signup.unassigned, 1);
  assert.equal(remote().controls.main.enabled, false);
  const to = remote().signup.teams[0];
  host.send('assign_person', { deviceId: res.deviceId, teamId: to.teamId });
  assert.equal(remote().signup.unassigned, 0);
  assert.equal(app.last('late').me.teamId, to.teamId);
  await late.call('approve_base');
  // leeftijd corrigeren en iemand verwijderen
  host.send('edit_person', { deviceId: res.deviceId, age: 51 });
  assert.equal(T.devices[res.deviceId].age, 51);
  host.send('remove_person', { deviceId: res.deviceId });
  assert.equal(T.devices[res.deviceId], undefined);
  assert.equal(remote().controls.main.enabled, true);
});

test('aanmeldingen en teams overleven een herstart (opslag)', () => {
  T.saveNow();
  const fs = require('fs'), path = require('path');
  const saved = JSON.parse(fs.readFileSync(path.join(app.dir, 'state.json'), 'utf8'));
  const d = Object.values(saved.devices)[0];
  assert.ok(Number.isInteger(d.age) && d.family, 'leeftijd en familie staan in de opslag');
  assert.equal(Object.keys(saved.devices).length, 14);
});

test('beslissingsvraag: de leeftijden van alle deelnemers opgeteld, automatisch uitgerekend', () => {
  host.send('host_main', { key: remote().controls.key }); // start
  assert.equal(T.phase, 'PLAY');
  const tb = T.steps.find((x) => x.id === 'tiebreak_leeftijd');
  assert.ok(tb, 'de vraag bestaat');
  assert.ok(T.steps.indexOf(tb) < T.steps.findIndex((x) => x.id === 'tiebreak_1'), 'als eerste beslissingsvraag');
  host.send('goto_step', { stepId: tb.id });
  const sum = Object.values(FAMS).flat().reduce((a, b) => a + b, 0);
  assert.equal(tb.answer, sum);
  assert.match(tb.question, /14 deelnemers/);
});

test('herstart tijdens het aanmelden: aanmeldingen (zonder team), aanmeldscherm en aftelklok blijven', () => {
  const { spawnSync } = require('child_process');
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-signup-'));
  const run = (phase) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'test-helpers', 'signup-restart-run.js'), phase, dir], { encoding: 'utf8', timeout: 60000 });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
    if (!line) throw new Error(`Fase ${phase} mislukt:\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(line.slice(7));
  };
  assert.equal(run('start').people, 4);
  const after = run('resume');
  assert.equal(after.people, 4);
  assert.deepEqual(after.ages, [12, 35, 40, 70]);
  assert.equal(after.stage, 'join', 'het aanmeldscherm staat er nog');
  assert.equal(after.clock, true, 'de aftelklok loopt door');
  assert.equal(after.view, 'signup_wait', 'de telefoon komt terug op het wachtscherm');
  assert.equal(after.teams, 2);
  assert.equal(after.unassigned, 0);
});

test('andere telefoon, zelfde persoon: de plek (en het team) overnemen als de oude telefoon niet verbonden is', async () => {
  const app3 = app; // zelfde server: de quiz loopt inmiddels
  const victim = Object.values(T.devices).find((d) => !d.bot && T.teams[d.teamId]);
  const fresh = app3.connect('nieuw-toestel');
  // zolang de oude telefoon verbonden is: gewoon "naam bestaat al"
  let res = await fresh.call('signup', { label: victim.label, family: victim.family, age: victim.age });
  assert.equal(res.ok, false);
  assert.notEqual(res.reclaim, true);
  // oude telefoon valt weg
  victim.connected = false;
  res = await fresh.call('signup', { label: victim.label, family: victim.family, age: victim.age });
  assert.equal(res.reclaim, true, 'de telefoon vraagt: ben jij dat?');
  res = await fresh.call('signup', { label: victim.label, family: victim.family, age: victim.age, reclaim: true });
  assert.equal(res.ok, true);
  assert.equal(res.deviceId, victim.deviceId);
  assert.equal(app3.last('nieuw-toestel').me.teamId, victim.teamId, 'terug in het eigen team');
});
