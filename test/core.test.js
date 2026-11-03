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
