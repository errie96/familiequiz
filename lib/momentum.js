// Momentum na een ronde: korte, spannende meldingen voor de tv ("X stijgt 2 plaatsen!"), zonder punten en zonder te
// verklappen WIE er bovenaan staat. Een team dat nu eerste staat wordt nooit bij naam genoemd. Over de koppositie zelf
// mag wel iets gezegd worden, zolang er geen naam bij staat ("Twee teams delen de koppositie!").
// Puur: krijgt de totaalscores vóór en na de ronde (zelfde volgorde als names).
//   before = null bij de eerste gespeelde ronde; prev = de stand één ronde eerder (optioneel, voor "tweede ronde op rij");
//   variety = een getal dat per ronde verschilt (bijv. het aantal gespeelde rondes), zodat de meldingen afwisselen.

function ranksOf(scores) {
  return scores.map((v) => 1 + scores.filter((w) => w > v + 1e-9).length);
}
const COUNT = ['', '', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes'];

function momentumMessages({ names, before, after, prev = null, max = 2, variety = 0 }) {
  const n = names.length;
  if (n < 2 || !Array.isArray(after) || after.length !== n) return [];
  if (Math.max(...after) <= 0) return [];
  if (!before) return [{ emoji: '🏁', text: 'De eerste ronde is gespeeld: nog alles is mogelijk!' }];
  const rkA = ranksOf(after), rkB = ranksOf(before), rkP = Array.isArray(prev) && prev.length === n ? ranksOf(prev) : null;
  const notTop = (i) => rkA[i] > 1; // een team dat nu eerste staat noemen we niet: dat zou de koppositie verklappen
  const team = [], field = []; // meldingen over één team / over het hele veld
  const used = new Set();
  const say = (list, emoji, text, ...who) => { list.push({ emoji, text }); who.forEach((i) => used.add(i)); };

  // ---- over teams ----
  const climbs = names.map((_, i) => ({ i, d: rkB[i] - rkA[i] })).filter((c) => c.d > 0 && notTop(c.i)).sort((a, b) => b.d - a.d || after[b.i] - after[a.i]);
  if (climbs.length) {
    const c = climbs[0];
    if (c.d >= 2) say(team, '🚀', `${names[c.i]} stijgt ${c.d} plaatsen!`, c.i);
    else if (rkP && rkP[c.i] > rkB[c.i]) say(team, '🔥', `${names[c.i]} stijgt voor de tweede ronde op rij!`, c.i);
    else say(team, '📈', `${names[c.i]} klimt een plekje omhoog!`, c.i);
  }
  // comeback: was (alleen) laatste, nu niet meer
  const lastB = Math.max(...rkB);
  const lastOnes = rkB.map((r, i) => (r === lastB ? i : -1)).filter((i) => i >= 0);
  if (n >= 3 && lastOnes.length === 1 && rkA[lastOnes[0]] < Math.max(...rkA) && notTop(lastOnes[0]) && !used.has(lastOnes[0])) say(team, '💪', `${names[lastOnes[0]]} komt terug van de laatste plek!`, lastOnes[0]);
  // tweede ronde op rij gestegen (een ander team dan de grootste stijger)
  if (rkP) {
    const streak = climbs.find((c) => !used.has(c.i) && rkP[c.i] > rkB[c.i]);
    if (streak) say(team, '🔥', `${names[streak.i]} stijgt voor de tweede ronde op rij!`, streak.i);
  }
  // twee teams (geen van beide eerste) wisselen van plek
  outer: for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!notTop(i) || !notTop(j) || used.has(i) || used.has(j)) continue;
    if ((rkB[i] - rkB[j]) * (rkA[i] - rkA[j]) < 0 && Math.abs(rkA[i] - rkA[j]) === 1) { say(team, '🔄', `${names[i]} en ${names[j]} hebben stuivertje gewisseld!`, i, j); break outer; }
  }
  // beste score van deze ronde (niet de nummer 1, en alleen als het er echt één is)
  const gain = after.map((v, i) => v - before[i]);
  const best = Math.max(...gain);
  const bestOnes = gain.map((g, i) => (Math.abs(g - best) < 1e-9 ? i : -1)).filter((i) => i >= 0);
  if (best > 0 && bestOnes.length === 1 && notTop(bestOnes[0]) && !used.has(bestOnes[0])) say(team, '⭐', `${names[bestOnes[0]]} was deze ronde in bloedvorm!`, bestOnes[0]);

  // ---- over het veld (zonder namen) ----
  const leadA = rkA.filter((r) => r === 1).length;
  const leadersB = rkB.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0), leadersA = rkA.map((r, i) => (r === 1 ? i : -1)).filter((i) => i >= 0);
  if (leadA >= 2) say(field, '🤝', `${COUNT[leadA] || leadA} teams delen de koppositie!`);
  else if (leadersB.length === 1 && leadersA[0] !== leadersB[0]) say(field, '👑', 'Het is stuivertje wisselen aan kop!');
  const sorted = [...after].sort((a, b) => b - a);
  if (n >= 3 && sorted[0] > 0 && sorted[0] - sorted[2] <= sorted[0] * 0.05) say(field, '🔥', 'De top 3 staat heel dicht bij elkaar!');
  if (n >= 3 && sorted[0] > 0 && sorted[0] - sorted[n - 1] <= sorted[0] * 0.15) say(field, '🎯', 'Niemand is nog kansloos: het verschil is klein!');

  // ---- kiezen: eerst één melding over een team, dan één over het veld, daarna aanvullen ----
  const rot = (list) => (list.length ? [...list.slice(variety % list.length), ...list.slice(0, variety % list.length)] : list);
  const f = rot(field), t = team; // teams op volgorde van belang, het veld wisselt per ronde
  const out = [];
  for (let k = 0; out.length < max && (k < t.length || k < f.length); k++) {
    if (k < t.length && out.length < max) out.push(t[k]);
    if (k < f.length && out.length < max) out.push(f[k]);
  }
  if (!out.length) out.push({ emoji: '⚡', text: 'De volgorde is deze ronde flink door elkaar geschud!' });
  return out;
}

module.exports = { momentumMessages, ranksOf };
