'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistoryEntry, appendHistory, isHistorySnapshot } = require('../lib/quiz-history');

const sample = () => createHistoryEntry({
  gameId: 'game-1',
  completedAt: '2026-11-03T19:00:00.000Z',
  quiz: { file: 'vragenlijst.xlsx', kind: 'excel', rounds: 8, steps: 100 },
  theme: 'winter',
  ranking: [
    { name: 'Team A', score: 125, rank: 1 },
    { name: 'Team B', score: 90, rank: 2 }
  ],
  breakdown: {
    rounds: [{ id: 'r1', title: 'R1', full: 'Algemene kennis', max: 100 }],
    rows: [
      { name: 'Team A', rounds: [{ pts: 100, joker: true }], final: 25, total: 125 },
      { name: 'Team B', rounds: [{ pts: 90, joker: false }], final: 0, total: 90 }
    ]
  }
});

test('history entry stores a compact ranking and round-by-round score breakdown', () => {
  const entry = sample();
  assert.deepEqual(entry.winners, ['Team A']);
  assert.equal(entry.teamCount, 2);
  assert.equal(entry.quiz.rounds, 8);
  assert.equal(entry.breakdown.rows[0].rounds[0].joker, true);
  assert.equal(entry.breakdown.rows[0].final, 25);
});

test('history archive keeps newest entries first and avoids duplicate games', () => {
  const first = sample();
  const second = { ...sample(), gameId: 'game-2', completedAt: '2026-11-04T19:00:00.000Z' };
  const entries = appendHistory([first], second);
  assert.deepEqual(entries.map((entry) => entry.gameId), ['game-2', 'game-1']);
  assert.deepEqual(appendHistory(entries, second).map((entry) => entry.gameId), ['game-2', 'game-1']);
});

test('history archive is capped at the configured retention limit', () => {
  const entries = Array.from({ length: 4 }, (_, i) => ({ gameId: String(i), ranking: [] }));
  assert.deepEqual(appendHistory(entries, { gameId: 'new', ranking: [] }, 3).map((entry) => entry.gameId), ['new', '3', '2']);
});

test('history snapshot validation rejects unsupported or malformed files', () => {
  assert.equal(isHistorySnapshot({ version: 1, entries: [sample()] }), true);
  assert.equal(isHistorySnapshot({ version: 2, entries: [] }), false);
  assert.equal(isHistorySnapshot({ version: 1, entries: [{}] }), false);
});
