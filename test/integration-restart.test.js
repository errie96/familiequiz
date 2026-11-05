// Integratietest 3 en 4: herstart van de server midden in de quiz, en reset met een oude reservekopie.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');

function run(phase, dir, input) {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'test-helpers', 'restart-run.js'), phase, dir, input ? JSON.stringify(input) : ''], { encoding: 'utf8', timeout: 60000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  if (!line) throw new Error(`Fase ${phase} mislukt:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(line.slice(7));
}

test('scenario: server herstart midden in een vraag; stand, teams en antwoorden blijven, spelen gaat verder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-restart-'));
  const first = run('start', dir);
  assert.equal(first.score, 0);                // vraag staat nog open: nog geen punten
  const second = run('resume', dir, first);
  assert.equal(second.phase, 'PLAY');
  assert.equal(second.paused, true);           // na een herstart eerst veilig op pauze
  assert.equal(second.stepId, first.stepId);
  assert.deepEqual(second.teams, ['Alfa', 'Beta']);
  assert.equal(second.answered, 1);            // het antwoord van Alfa is bewaard
  assert.equal(second.betaOk, true);           // Beta kan na het herverbinden antwoorden
  assert.equal(second.closed, 'closed');
  assert.ok(second.alfaScore > 0);             // na het sluiten telt het goede antwoord van vóór de herstart
});

test('scenario: na een reset komt de oude stand nooit terug, ook niet uit een reservekopie', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-reset-'));
  const first = run('reset-start', dir);
  assert.equal(first.phase, 'LOBBY');
  assert.equal(first.teams, 0);
  const after = run('after-reset', dir);
  assert.equal(after.phase, 'LOBBY');
  assert.equal(after.teams, 0);
  assert.ok(after.backups.some((b) => /voor-reset/.test(b)), 'er is wel een kopie van vóór de reset bewaard');
});
