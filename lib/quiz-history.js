'use strict';

const HISTORY_VERSION = 1;
const DEFAULT_LIMIT = 50;

function createHistoryEntry({ gameId, completedAt, quiz, theme, ranking, breakdown }) {
  if (typeof gameId !== 'string' || !gameId) throw new TypeError('gameId is required');
  const ranked = Array.isArray(ranking) ? ranking : [];
  const detail = breakdown && typeof breakdown === 'object' ? breakdown : { rounds: [], rows: [] };
  const winners = ranked.filter((team) => team.rank === 1).map((team) => team.name);

  return {
    gameId,
    completedAt: completedAt || new Date().toISOString(),
    theme: typeof theme === 'string' ? theme : 'standaard',
    quiz: {
      file: quiz && typeof quiz.file === 'string' ? quiz.file : 'Onbekende vragenlijst',
      kind: quiz && typeof quiz.kind === 'string' ? quiz.kind : 'unknown',
      rounds: Number.isInteger(quiz && quiz.rounds) ? quiz.rounds : (detail.rounds || []).length,
      steps: Number.isInteger(quiz && quiz.steps) ? quiz.steps : null
    },
    winners,
    teamCount: ranked.length,
    ranking: ranked.map((team) => ({
      name: String(team.name || 'Team'),
      score: Number.isFinite(team.score) ? team.score : 0,
      rank: Number.isInteger(team.rank) ? team.rank : null
    })),
    breakdown: {
      rounds: (detail.rounds || []).map((round) => ({
        id: String(round.id || ''),
        title: String(round.title || ''),
        full: String(round.full || ''),
        max: Number.isFinite(round.max) ? round.max : 0
      })),
      rows: (detail.rows || []).map((row) => ({
        name: String(row.name || 'Team'),
        rounds: (row.rounds || []).map((round) => ({
          pts: Number.isFinite(round.pts) ? round.pts : 0,
          joker: !!round.joker
        })),
        final: Number.isFinite(row.final) ? row.final : null,
        total: Number.isFinite(row.total) ? row.total : 0
      }))
    }
  };
}

function appendHistory(entries, entry, limit = DEFAULT_LIMIT) {
  const previous = Array.isArray(entries) ? entries : [];
  const unique = previous.filter((item) => item && item.gameId !== entry.gameId);
  return [entry, ...unique].slice(0, Math.max(1, limit));
}

function isHistorySnapshot(value) {
  return !!value && typeof value === 'object' &&
    value.version === HISTORY_VERSION && Array.isArray(value.entries) &&
    value.entries.every((entry) => entry && typeof entry.gameId === 'string' && Array.isArray(entry.ranking));
}

module.exports = { HISTORY_VERSION, DEFAULT_LIMIT, createHistoryEntry, appendHistory, isHistorySnapshot };
