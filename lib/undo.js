'use strict';

function pushUndo(history, entry, limit = 30) {
  history.push(entry);
  if (history.length > limit) history.splice(0, history.length - limit);
}

function applyUndoEntry(entry, steps, states) {
  if (!entry || !Array.isArray(steps) || !states) return false;
  const step = steps.find((item) => item.id === entry.stepId);
  const state = step && states[entry.stepId];
  if (!step || !state) return false;

  switch (entry.type) {
    case 'memory_judge': {
      const answer = (state.entries && state.entries[entry.teamId] || []).find((item) => item.id === entry.entryId);
      if (!answer) return false;
      answer.ok = entry.before;
      return true;
    }
    case 'thirty_toggle': {
      if (entry.demo) {
        if (!Array.isArray(state.ok) || entry.index >= state.ok.length) return false;
        state.ok[entry.index] = entry.before;
        return true;
      }
      const turn = state.turns && state.turns[entry.turnIndex];
      if (!turn || !Array.isArray(turn.ok) || entry.index >= turn.ok.length) return false;
      turn.ok[entry.index] = entry.before;
      return true;
    }
    case 'draw_judge': {
      const turn = state.turns && state.turns[entry.turnIndex];
      if (!turn || !turn.words || !Object.prototype.hasOwnProperty.call(turn.words, entry.teamId)) return false;
      turn.ok[entry.teamId] = entry.before;
      return true;
    }
    case 'logo_judge':
      if (!state.answers || !state.answers[entry.teamId]) return false;
      if (entry.beforePresent) state.judged[entry.teamId] = entry.before;
      else delete state.judged[entry.teamId];
      return true;
    case 'void_question':
      state.voided = entry.before;
      return true;
    case 'clear_answer':
      if (entry.answerPresent) state.answers[entry.teamId] = entry.answer;
      else delete state.answers[entry.teamId];
      if (entry.judgedPresent) state.judged[entry.teamId] = entry.judged;
      else if (state.judged) delete state.judged[entry.teamId];
      state.status = entry.status;
      return true;
    default:
      return false;
  }
}

module.exports = { pushUndo, applyUndoEntry };
