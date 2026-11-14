// Hulpscript: herstart tijdens het persoonlijk aanmelden (nog vóór de teams gemaakt zijn) en vlak daarna.
// Gebruik: node signup-restart-run.js <fase> <datamap>
const { startServer } = require('./harness');
const [phaseName, dataDir] = process.argv.slice(2);
const out = (o) => { process.stdout.write('RESULT ' + JSON.stringify(o) + '\n'); process.exit(0); };

(async () => {
  const app = startServer({ dataDir, fresh: phaseName === 'start', env: { QUIZ_SIGNUP: 'personal' } });
  const { T, host, remote } = app;
  if (phaseName === 'start') {
    host.send('set_max_teams', { n: 2 });
    host.send('host_main');
    host.send('set_start_timer', { minutes: 10 });
    const ids = [];
    for (const [label, age] of [['Ann', 40], ['Bas', 12], ['Cor', 70], ['Dee', 35]]) {
      const p = app.connect('p' + label);
      const res = await p.call('signup', { label, family: 'Jansen', age });
      ids.push(res.deviceId);
    }
    T.saveNow();
    return out({ ids, people: remote().signup.total });
  }
  // na de herstart: iedereen is nog aangemeld (zonder team), telefoons verbinden weer, teams maken werkt
  const before = { people: remote().signup.total, ages: Object.values(T.devices).map((d) => d.age).sort((a, b) => a - b), stage: remote().lobbyStage, clock: !!T.brandInfo().start };
  const first = Object.values(T.devices)[0];
  const p = app.connect('again');
  p.send('hello', { deviceId: first.deviceId });
  const view = app.last('again') && app.last('again').view ? app.last('again').view.type : null;
  await host.call('make_teams');
  return out({ ...before, view, teams: remote().signup.teams.length, unassigned: remote().signup.unassigned });
})();
