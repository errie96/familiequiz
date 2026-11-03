'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cleanText, norm, fuzzyEq, shuffle } = require('../lib/util');
const { loadContent } = require('../lib/content');

test('cleanText trims, collapses whitespace and respects the limit', () => {
  assert.equal(cleanText('  Familie   Quiz\n2026  ', 30), 'Familie Quiz 2026');
  assert.equal(cleanText('abcdef', 3), 'abc');
});

test('norm removes accents, punctuation and leading articles', () => {
  assert.equal(norm('  De Ééndagsvlieg!  '), 'eendagsvlieg');
  assert.equal(norm('The Rolling-Stones'), 'rolling stones');
});

test('fuzzyEq accepts exact and small typos but not unrelated short words', () => {
  assert.equal(fuzzyEq('Beyoncé', 'Beyonce'), true);
  assert.equal(fuzzyEq('Amsterdam', 'Amsterdm'), true);
  assert.equal(fuzzyEq('kat', 'hond'), false);
  assert.equal(fuzzyEq('', ''), false);
});

test('shuffle returns a permutation without mutating the input', () => {
  const input = [1, 2, 3, 4, 5];
  const copy = [...input];
  const result = shuffle(input);
  assert.deepEqual(input, copy);
  assert.equal(result.length, input.length);
  assert.deepEqual([...result].sort(), [...input].sort());
});

test('the checked-in quiz content compiles into unique steps and includes a final question', () => {
  const file = path.join(__dirname, '..', 'questions.json');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = loadContent(null, raw);

  assert.ok(result.rounds.length > 0, 'at least one round should load');
  assert.ok(result.steps.length > 0, 'at least one step should load');
  assert.ok(result.steps.some((step) => step.kind === 'final'), 'the final question should load');

  const ids = result.steps.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length, 'step ids must be unique');
  assert.ok(result.steps.every((step) => typeof step.id === 'string' && step.id.length > 0));
});

test('invalid question entries are skipped with a warning instead of crashing', () => {
  const result = loadContent(null, {
    test: { questions: [{ question: 'Ongeldig?', options: ['A', 'B'], answer: 9 }] },
    rounds: [],
    final: { question: 'Slotvraag?', options: ['A', 'B'], answer: 0 },
    tiebreakers: []
  });

  assert.ok(result.steps.some((step) => step.kind === 'final'));
  assert.ok(result.warnings.some((warning) => warning.includes('ongeldig')));
});

const os = require('node:os');
const { writeJsonWithBackup, readJsonWithBackup, removeStateFiles } = require('../lib/state-store');

function temporaryStateFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiequiz-state-'));
  return { dir, file: path.join(dir, 'data', 'state.json') };
}

test('state snapshots are written as valid JSON and previous versions are backed up', (t) => {
  const { dir, file } = temporaryStateFile();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeJsonWithBackup(file, { version: 2, teams: { a: 'Team A' } });
  writeJsonWithBackup(file, { version: 2, teams: { b: 'Team B' } });

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).teams, { b: 'Team B' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).teams, { a: 'Team A' });
  assert.equal(readJsonWithBackup(file).source, 'primary');
});

test('a corrupt primary state file recovers from the last valid backup', (t) => {
  const { dir, file } = temporaryStateFile();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  writeJsonWithBackup(file, { version: 2, teams: { a: 'Team A' } });
  writeJsonWithBackup(file, { version: 2, teams: { b: 'Team B' } });
  fs.writeFileSync(file, '{ invalid json');

  const recovered = readJsonWithBackup(file);
  assert.equal(recovered.source, 'backup');
  assert.deepEqual(recovered.data.teams, { a: 'Team A' });
});

test('missing or corrupt primary and backup files return no snapshot', (t) => {
  const { dir, file } = temporaryStateFile();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(readJsonWithBackup(file), null);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ broken');
  fs.writeFileSync(file + '.bak', '{ also broken');
  assert.equal(readJsonWithBackup(file), null);
});

test('fresh reset removes primary, temporary and backup state files', (t) => {
  const { dir, file } = temporaryStateFile();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const candidate of [file, file + '.tmp', file + '.bak', file + '.bak.tmp']) {
    fs.writeFileSync(candidate, '{}');
  }
  removeStateFiles(file);
  for (const candidate of [file, file + '.tmp', file + '.bak', file + '.bak.tmp']) {
    assert.equal(fs.existsSync(candidate), false);
  }
});
