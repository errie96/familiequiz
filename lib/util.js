// Kleine hulpfuncties die op meerdere plekken in de server gebruikt worden
const crypto = require('crypto');

const newId = (prefix) => prefix + crypto.randomBytes(6).toString('hex');
const cleanText = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Kleine letters, zonder accenten en leestekens, zonder lidwoord vooraan
function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(de|het|een|the|a|an) /, '');
}

function lev(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

// Gelijk, op een of twee typefouten na (bij langere woorden)
function fuzzyEq(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const len = Math.max(x.length, y.length);
  const tol = len >= 10 ? 2 : len >= 5 ? 1 : 0;
  return lev(x, y) <= tol;
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { newId, cleanText, norm, lev, fuzzyEq, shuffle };
