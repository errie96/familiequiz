// Integratietests: (1) de vragen worden bij de start vastgezet, zodat een aangepaste of kapotte Excel een lopende
// quiz na een herstart niet door elkaar gooit; (2) een reservekopie van het begin van een ronde terugzetten.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const { unzip } = require('../lib/xlsx');
const { zip } = require('../lib/zip');

function run(phase, dir, input, env = {}) {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'test-helpers', 'freeze-run.js'), phase, dir, input ? JSON.stringify(input) : ''], { encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) throw new Error(`Fase ${phase} mislukt:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(line.slice(7));
}
const escapeXml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

test('scenario: Excel wordt tijdens de quiz aangepast en de server herstart; de quiz gaat verder met de vragen van de start', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-freeze-'));
  const xlsx = path.join(dir, 'eigen-vragenlijst.xlsx');
  fs.copyFileSync(path.join(__dirname, '..', 'vragenlijst.xlsx'), xlsx);
  const env = { QUIZ_XLSX: xlsx };
  const first = run('start', path.join(dir, 'data'), null, env);
  assert.equal(first.frozen, true, 'bij de start zijn de vragen vastgezet');

  // De quizmaster past de vraag aan in de Excel (of de Excel raakt beschadigd)
  const files = unzip(fs.readFileSync(xlsx));
  const needle = escapeXml(first.question.replace(/[^\x20-\x7e][\s\S]*$/, '')); // tot het eerste bijzondere teken (bijv. ë)
  const part = Object.keys(files).find((n) => n.endsWith('.xml') && files[n].toString('utf8').includes(needle));
  assert.ok(part, 'de vraagtekst staat in de Excel');
  files[part] = Buffer.from(files[part].toString('utf8').split(needle).join('GEWIJZIGDE VRAAG'), 'utf8');
  fs.writeFileSync(xlsx, zip(files));

  const second = run('resume', path.join(dir, 'data'), null, env);
  assert.equal(second.phase, 'PLAY');
  assert.equal(second.stepId, first.stepId);
  assert.equal(second.question, first.question, 'de vraag van de start, niet de aangepaste');
  assert.equal(second.answered, 1, 'het antwoord van vóór de herstart telt nog');
  assert.equal(second.frozenSource, true);

  // En met een kapotte Excel ook
  fs.writeFileSync(xlsx, 'geen excel');
  const third = run('resume', path.join(dir, 'data'), null, env);
  assert.equal(third.stepId, first.stepId);
  assert.equal(third.question, first.question);
});

test('scenario: kopie van het begin van ronde 1 terugzetten; latere antwoorden en punten zijn weg, quiz staat op pauze', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-restore-'));
  const first = run('restore-start', dir);
  assert.ok(first.roundBackup, 'er is een kopie gemaakt aan het begin van ronde 1');
  assert.ok(first.files.includes('quiz-vast.json'), 'de vastgezette vragen zitten in de kopie');
  assert.ok(first.scoreBefore > 0, 'Alfa had al punten in ronde 1');
  assert.equal(first.res.ok, true, JSON.stringify(first.res));
  assert.equal(first.restartRequested, true);

  const after = run('after-restore', dir, { questionId: first.questionId });
  assert.equal(after.phase, 'PLAY');
  assert.equal(after.paused, true);
  assert.deepEqual(after.teams, ['Alfa', 'Beta']);
  assert.equal(after.answered, 0, 'het antwoord van ná de kopie is weg');
  assert.equal(after.score, 0);
  assert.ok(after.backups.some((b) => /^voor-terugzetten/.test(b)), 'de stand van vóór het terugzetten is zelf ook bewaard');
});

test('terugzetten weigert een onbekende kopie', () => {
  const r = require('../lib/backup').createBackups({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'fq-bk-')), sources: () => [] });
  assert.throws(() => r.restore('../../etc', os.tmpdir(), ['state.json']));
  assert.equal(r.has('20260101-000000-x', 'state.json'), false);
});

test('bewaker: --fresh alleen bij de eerste start, nooit bij een automatische herstart', () => {
  const { argsFor } = require('../scripts/run');
  assert.deepEqual(argsFor(0, ['--fresh']), ['--fresh']);
  assert.deepEqual(argsFor(1, ['--fresh', '--x']), ['--x']);
});
