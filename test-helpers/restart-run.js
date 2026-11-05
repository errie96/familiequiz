// Hulpscript voor de herstart-tests: draait één fase in een eigen proces en print het resultaat als JSON.
// Gebruik: node restart-run.js <fase> <datamap> [json-invoer]
const { startServer, phone } = require('./harness');
const [phaseName, dataDir, input] = process.argv.slice(2);
const arg = input ? JSON.parse(input) : {};
const out = (o) => { process.stdout.write('RESULT ' + JSON.stringify(o) + '\n'); process.exit(0); };

(async () => {
  const fresh = phaseName === 'start' || phaseName === 'reset-start';
  const app = startServer({ dataDir, fresh });
  const { T, host, advanceUntil, connect } = app;
  const toFirstQuestion = () => {
    advanceUntil((r) => r.phase === 'PLAY');
    advanceUntil((r) => r.step.kind === 'teamphoto'); host.send('host_force');
    advanceUntil((r) => r.step.kind === 'joker'); host.send('host_force');
    advanceUntil((r) => r.step.kind === 'mc' && !r.step.test && T.ss(T.cur()).status === 'open');
  };
  if (phaseName === 'start' || phaseName === 'reset-start') {
    host.send('set_max_teams', { n: 2 });
    const a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
    const b = await phone(app, 'b', { team: 'Beta', label: 'Bas' });
    toFirstQuestion();
    const q = T.cur();
    await a.call('submit_answer', { stepId: q.id, value: q.answer });
    if (phaseName === 'reset-start') {
      host.send('reset_quiz');
      T.saveNow();
      return out({ phase: T.phase, teams: Object.keys(T.teams).length });
    }
    T.saveNow();
    return out({ stepId: q.id, answer: q.answer, a: a.res.deviceId, b: b.res.deviceId, score: T.roundScore(Object.values(T.teams).find((t) => t.name === 'Alfa'), T.roundById.r1) });
  }
  if (phaseName === 'resume') {
    const q = T.cur();
    const paused = app.remote() ? app.remote().paused : null;
    const before = { phase: T.phase, paused, stepId: q && q.id, teams: Object.values(T.teams).map((t) => t.name).sort(), answered: Object.keys(T.ss(q).answers).length };
    if (paused) host.send('toggle_pause'); // na een herstart staat de quiz veilig op pauze; de quizmaster hervat
    // Beta's telefoon meldt zich opnieuw en speelt verder
    host.send('set_max_teams', { n: 2 }); // zorgt dat de bediening een actuele stand krijgt
    const b = connect('b-again');
    b.send('hello', { deviceId: arg.b });
    const res = await b.call('submit_answer', { stepId: q.id, value: q.answer });
    const alfa = Object.values(T.teams).find((t) => t.name === 'Alfa');
    return out({ ...before, betaOk: res && res.ok, closed: T.ss(q).status, alfaScore: T.roundScore(alfa, T.roundById.r1) });
  }
  if (phaseName === 'after-reset') {
    const fs = require('fs'), path = require('path');
    const backups = fs.existsSync(path.join(dataDir, 'backups')) ? fs.readdirSync(path.join(dataDir, 'backups')) : [];
    return out({ phase: T.phase, teams: Object.keys(T.teams).length, backups });
  }
})().catch((e) => { process.stdout.write('ERROR ' + e.stack + '\n'); process.exit(1); });
