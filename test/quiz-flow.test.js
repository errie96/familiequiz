'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadContent } = require('../lib/content');
const { fromExcel } = require('../lib/fromExcel');

const question = {
  question: 'Testvraag?',
  options: ['Goed', 'Fout'],
  answer: 0
};

test('pregame order shows round overview and explanations before tests and joker', () => {
  const { steps } = loadContent(null, {
    test: { questions: [question] },
    start: { title: 'Start' },
    rounds: [{
      id: 'r1',
      type: 'mc',
      title: 'Algemene kennis',
      categories: [{ name: 'Algemeen', questions: [question] }]
    }],
    final: { category: 'Slot', options: ['A', 'B'], answer: 0 }
  });

  const ids = steps.map((step) => step.id);
  assert.equal(ids[0], 'teamphoto'); // teamfoto direct na het aanmelden
  assert.equal(ids[1], 'rounds_overview');
  assert.equal(ids[2], 'round_guide_1');
  assert.ok(ids.indexOf('teamphoto') < ids.indexOf('test_1'));
  assert.ok(ids.indexOf('test_intro') < ids.indexOf('test_1'));
  assert.ok(ids.indexOf('test_1') < ids.indexOf('joker'));
  assert.ok(ids.indexOf('joker') < ids.indexOf('real_start'));
  assert.ok(ids.indexOf('real_start') < ids.indexOf('r1_intro'));
  assert.ok(ids.indexOf('r1_result') > ids.indexOf('r1_c1_1'));
});

test('memory round defaults to the new wording', () => {
  const { rounds } = loadContent(null, {
    rounds: [{ id: 'r3', type: 'memory', items: ['Een antwoord'] }]
  });
  assert.equal(rounds[0].title, 'Ronde 1');
  assert.match(rounds[0].intro, /Geheugenronde/);
});

test('extra Hitster rounds only use songs from their own category before searching online', () => {
  const { rounds } = loadContent(null, {
    rounds: [{
      id: 'music-extra',
      type: 'hitster',
      dynamic: true,
      category: 'rock',
      startCards: 2,
      songs: [
        { title: 'Rock start', artist: 'Band A', year: 1980, category: 'rock', start: true },
        { title: 'Rock track', artist: 'Band B', year: 1990, category: 'rock' },
        { title: 'Rock track 2', artist: 'Band C', year: 2001, category: 'rock' },
        { title: 'Standard fallback', artist: 'Artist D', year: 2000, category: 'original', start: true }
      ]
    }]
  });
  const round = rounds[0];
  assert.equal(round.dynamic, true);
  assert.equal(round.startIds.length, 2);
  assert.equal(round.pool.length, 1);
  assert.equal(round.fallbackPool.length, 0);
  assert.ok(!round.startIds.some((id) => /lib4$/.test(id)));
});

test('each round receives a wrap-up step after its content', () => {
  const { steps } = loadContent(null, {
    rounds: [
      { id: 'r1', type: 'mc', categories: [{ name: 'A', questions: [question] }] },
      { id: 'r2', type: 'memory', items: ['Een antwoord'] }
    ]
  });
  const ids = steps.map((step) => step.id);
  assert.ok(ids.indexOf('r1_result') > ids.indexOf('r1_c1_1'));
  assert.ok(ids.indexOf('r2_result') > ids.indexOf('r2_memory'));
});

test('Hitster Excel template imports the category and standard music libraries', () => {
  const workbook = path.join(__dirname, '..', 'Hitster-bibliotheek.xlsx');
  const base = path.join(__dirname, '..', 'questions.json');
  const { raw } = fromExcel(workbook, base);
  const library = raw.hitsterLibrary;
  assert.ok(library.length >= 50);
  assert.ok(library.some((song) => song.category === 'original'));
  assert.ok(library.some((song) => song.category === 'rock'));
  assert.ok(library.some((song) => song.category === 'guilty'));
  assert.ok(library.some((song) => song.category === 'nederpop'));
});
