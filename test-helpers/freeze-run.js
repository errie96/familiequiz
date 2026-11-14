// Hulpscript voor de tests van "vragen vastzetten" en "reservekopie terugzetten".
// Draait één fase in een eigen proces (zoals een echte herstart) en print het resultaat als JSON.
// Gebruik: node freeze-run.js <fase> <datamap> [json-invoer]
const { startServer, phone } = require('./harness');
const [phaseName, dataDir, input] = process.argv.slice(2);
const arg = input ? JSON.parse(input) : {};
const out = (o) => { process.stdout.write('RESULT ' + JSON.stringify(o) + '\n'); process.exit(0); };

(async () => {
  const fresh = phaseName === 'start' || phaseName === 'restore-start';
  const app = startServer({ dataDir, fresh });
  const { T, host, advanceUntil } = app;
  const toFirstQuestion = () => {
    advanceUntil((r) => r.phase === 'PLAY');
    advanceUntil((r) => r.step.kind === 'teamphoto'); host.send('host_force');
    advanceUntil((r) => r.step.kind === 'joker'); host.send('host_force');
    advanceUntil((r) => r.step.kind === 'mc' && !r.step.test && T.ss(T.cur()).status === 'open');
  };
  const alfaScore = () => T.roundScore(Object.values(T.teams).find((t) => t.name === 'Alfa'), T.roundById.r1);

  if (fresh) {
    host.send('set_max_teams', { n: 2 });
    const a = await phone(app, 'a', { team: 'Alfa', label: 'Ann' });
    await phone(app, 'b', { team: 'Beta', label: 'Bas' });
    toFirstQuestion();
    const q = T.cur();
    if (phaseName === 'start') {
      await a.call('submit_answer', { stepId: q.id, value: q.answer });
      T.saveNow();
      return out({ stepId: q.id, question: q.question, frozen: require('fs').existsSync(T.FROZEN_FILE) });
    }
    // restore-start: kopie van het begin van ronde 1 zoeken, daarna verder spelen en die kopie terugzetten
    const round = T.backups.list().find((b) => /^ronde-1(-\d+)?$/.test(b.reason));
    await a.call('submit_answer', { stepId: q.id, value: q.answer });
    advanceUntil(() => T.ss(q).status !== 'open'); // vraag sluiten: Alfa krijgt punten
    const before = alfaScore();
    T.saveNow();
    const res = T.restoreBackup(round ? round.id : 'bestaat-niet');
    return out({ roundBackup: round ? round.id : null, files: round ? round.files.map((f) => f.name) : [], scoreBefore: before, res, restartRequested: T.restartRequested, questionId: q.id });
  }

  if (phaseName === 'resume') {
    const q = T.cur();
    return out({ phase: T.phase, stepId: q && q.id, question: q && q.question, answered: q ? Object.keys(T.ss(q).answers || {}).length : -1, frozenSource: !!(T.quizSource && T.quizSource.frozen), notes: T.restoreNotes });
  }
  if (phaseName === 'after-restore') {
    const q = T.steps.find((s) => s.id === arg.questionId);
    const backups = T.backups.list().map((b) => b.reason);
    return out({ phase: T.phase, paused: app.remote() ? app.remote().paused : null, step: T.cur() && T.cur().id, answered: q ? Object.keys((T.ss(q).answers) || {}).length : -1, score: alfaScore(), teams: Object.values(T.teams).map((t) => t.name).sort(), backups });
  }
})().catch((e) => { process.stdout.write('ERROR ' + e.stack + '\n'); process.exit(1); });
