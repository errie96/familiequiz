'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pushUndo, applyUndoEntry } = require('../lib/undo');

test('undo history is bounded and keeps the newest entries', () => {
  const history = [];
  for (let i = 0; i < 35; i++) pushUndo(history, { id: i }, 30);
  assert.equal(history.length, 30);
  assert.equal(history[0].id, 5);
  assert.equal(history.at(-1).id, 34);
});

test('undo restores a quizmaster judgement without changing other answers', () => {
  const steps = [{ id: 'r1_q1', kind: 'memory' }];
  const states = {
    r1_q1: { entries: { teamA: [{ id: 'entry1', ok: true }, { id: 'entry2', ok: false }] } }
  };
  const applied = applyUndoEntry({
    type: 'memory_judge', stepId: 'r1_q1', teamId: 'teamA', entryId: 'entry1', before: null
  }, steps, states);

  assert.equal(applied, true);
  assert.equal(states.r1_q1.entries.teamA[0].ok, null);
  assert.equal(states.r1_q1.entries.teamA[1].ok, false);
});

test('undo restores the previous 30 Seconds mark', () => {
  const steps = [{ id: 'r1_thirty', kind: 'thirty' }];
  const states = { r1_thirty: { turns: [{ ok: [true, false, true] }] } };
  assert.equal(applyUndoEntry({
    type: 'thirty_toggle', stepId: 'r1_thirty', index: 1, before: true, demo: false, turnIndex: 0
  }, steps, states), true);
  assert.deepEqual(states.r1_thirty.turns[0].ok, [true, true, true]);
});

test('undo restores a removed answer and the prior question status', () => {
  const steps = [{ id: 'r1_q1', kind: 'mc' }];
  const states = { r1_q1: { answers: {}, status: 'open' } };
  assert.equal(applyUndoEntry({
    type: 'clear_answer', stepId: 'r1_q1', teamId: 'teamA',
    answerPresent: true, answer: { v: 2, step: 0, t: 123 },
    judgedPresent: false, status: 'closed'
  }, steps, states), true);
  assert.deepEqual(states.r1_q1.answers.teamA, { v: 2, step: 0, t: 123 });
  assert.equal(states.r1_q1.status, 'closed');
});

test('undo refuses stale entries whose step or target no longer exists', () => {
  assert.equal(applyUndoEntry({ type: 'memory_judge', stepId: 'gone' }, [], {}), false);
});
