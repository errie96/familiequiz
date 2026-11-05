// Momentum na een ronde: korte, spannende meldingen voor de tv ("X stijgt 2 plaatsen!") zonder punten te tonen.
// Puur: krijgt de totaalscores vóór en na de ronde (zelfde volgorde als names) en geeft hooguit `max` meldingen terug.
// before = null bij de eerste gespeelde ronde.

function ranksOf(scores) {
  return scores.map((v) => 1 + scores.filter((w) => w > v + 1e-9).length);
}

function momentumMessages({ names, before, after, roundPoints = 100, max = 2 }) {
  const n = names.length;
  if (n < 2 || !Array.isArray(after) || after.length !== n) return [];
  if (Math.max(...after) <= 0) return []; // nog niemand punten: niets te melden
  const rkA = ranksOf(after);
  const leadersA = rkA.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  const sorted = [...after].sort((a, b) => b - a);
  const closeTop = sorted[0] - sorted[1] <= roundPoints * 0.05; // top 2 binnen 5% van een ronde
  const out = [];
  const mentioned = new Set();
  const add = (emoji, text, i) => { if (out.length < max) { out.push({ emoji, text }); if (i !== undefined) mentioned.add(i); } };

  if (!before) {
    if (leadersA.length === 1) add('👑', `${names[leadersA[0]]} pakt na de eerste ronde de leiding!`, leadersA[0]);
    else add('🤝', 'Na de eerste ronde staan meerdere teams samen bovenaan!');
    if (closeTop && leadersA.length === 1) add('🔥', 'Maar het verschil is nog heel klein…');
    return out;
  }

  const rkB = ranksOf(before);
  const leadersB = rkB.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  const sameLeader = leadersA.length === 1 && leadersB.length === 1 && leadersA[0] === leadersB[0];

  // 1) wisseling aan de top
  if (leadersA.length === 1 && !sameLeader) add('👑', `${names[leadersA[0]]} neemt de leiding over!`, leadersA[0]);
  else if (leadersA.length > 1 && leadersB.length === 1) add('🤝', 'Er staan nu meerdere teams samen bovenaan!');

  // 2) grootste stijger (niet de nieuwe leider, die is al genoemd)
  const climbs = names.map((_, i) => ({ i, d: rkB[i] - rkA[i] })).filter((c) => c.d > 0 && !mentioned.has(c.i)).sort((a, b) => b.d - a.d || after[b.i] - after[a.i]);
  if (climbs.length) {
    const c = climbs[0];
    if (c.d >= 2) add('🚀', `${names[c.i]} stijgt ${c.d} plaatsen!`, c.i);
    else add('📈', `${names[c.i]} klimt een plekje omhoog!`, c.i);
  }

  // 3) comeback: was (alleen) laatste, nu niet meer
  const lastB = Math.max(...rkB);
  const lastOnes = rkB.map((r, i) => (r === lastB ? i : -1)).filter((i) => i >= 0);
  if (n >= 3 && lastOnes.length === 1 && rkA[lastOnes[0]] < Math.max(...rkA) && !mentioned.has(lastOnes[0])) add('💪', `${names[lastOnes[0]]} komt terug van de laatste plek!`, lastOnes[0]);

  // 4) spannend aan de top
  if (closeTop) add('🔥', 'Het is superspannend aan de top!');

  // 5) zelfde leider
  if (sameLeader && !mentioned.has(leadersA[0])) add('⚡', `${names[leadersA[0]]} blijft bovenaan!`, leadersA[0]);

  return out;
}

module.exports = { momentumMessages, ranksOf };
