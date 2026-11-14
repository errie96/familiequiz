// Teams maken uit de persoonlijke aanmeldingen: even grote teams, leeftijden en families zo goed mogelijk gespreid.
// people: [{ id, age (getal of null), family (tekst) }]  ->  lijst van teams, elk een lijst id's
'use strict';

const band = (age) => (age == null ? 2 : age < 12 ? 0 : age < 18 ? 1 : age < 35 ? 2 : age < 55 ? 3 : 4);
const norm = (s) => String(s || '').trim().toLowerCase();

function cost(teams, people) {
  // lager = beter: gezinsleden bij elkaar en scheve leeftijdsgroepen kosten punten
  let c = 0;
  const bands = [0, 1, 2, 3, 4];
  for (const t of teams) {
    const fam = {};
    for (const p of t) if (norm(p.family)) fam[norm(p.family)] = (fam[norm(p.family)] || 0) + 1;
    for (const n of Object.values(fam)) c += (n - 1) * n * 5;
  }
  for (const b of bands) {
    const counts = teams.map((t) => t.filter((p) => band(p.age) === b).length);
    c += (Math.max(...counts) - Math.min(...counts)) ** 2 * 3;
  }
  const ages = teams.map((t) => { const a = t.filter((p) => p.age != null); return a.length ? a.reduce((x, p) => x + p.age, 0) / a.length : null; }).filter((x) => x != null);
  if (ages.length > 1) c += (Math.max(...ages) - Math.min(...ages)) / 4;
  void people;
  return c;
}

function makeTeams(people, count, { keepKidsAge = 0, random = Math.random } = {}) {
  const n = Math.max(1, Math.min(Math.round(count) || 1, people.length || 1));
  const known = people.filter((p) => p.age != null).map((p) => p.age).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor(known.length / 2)] : 30;
  // van oud naar jong uitdelen, steeds aan het kleinste team: zo krijgt elk team uit elke "laag" iemand
  const sorted = people.map((p) => ({ ...p, _k: (p.age == null ? median : p.age) + random() * 0.5 })).sort((a, b) => b._k - a._k);
  const teams = Array.from({ length: n }, () => []);
  for (const p of sorted) {
    const min = Math.min(...teams.map((t) => t.length));
    let best = null, bestScore = Infinity;
    teams.forEach((t, i) => {
      // jonge kinderen bij een volwassen gezinslid houden mag één plek scheefgroei kosten
      const kid = keepKidsAge > 0 && p.age != null && p.age <= keepKidsAge;
      const withAdult = kid && t.some((q) => norm(q.family) && norm(q.family) === norm(p.family) && q.age != null && q.age >= 18);
      if (t.length > min + (withAdult ? 1 : 0)) return;
      let s = (t.length - min) * 40;
      s += t.filter((q) => norm(q.family) && norm(q.family) === norm(p.family)).length * (kid ? 0 : 20);
      s += t.filter((q) => band(q.age) === band(p.age)).length * 6;
      if (kid) s += withAdult ? -100 : 30;
      s += random();
      if (s < bestScore) { bestScore = s; best = i; }
    });
    teams[best].push(p);
  }
  // Daarna verbeteren door te ruilen (zelfde teamgrootte blijft): minder gezinsleden bij elkaar, leeftijden gelijker
  const kidOk = (team, p) => !(keepKidsAge > 0 && p.age != null && p.age <= keepKidsAge) || team.some((q) => q !== p && norm(q.family) === norm(p.family) && q.age != null && q.age >= 18) || !people.some((q) => norm(q.family) === norm(p.family) && q.age != null && q.age >= 18);
  const kidsOk = () => teams.every((t) => t.every((p) => kidOk(t, p)));
  const startOk = kidsOk();
  let current = cost(teams, people);
  for (let round = 0; round < 6; round++) {
    let improved = false;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let i = 0; i < teams[a].length; i++) for (let j = 0; j < teams[b].length; j++) {
      const x = teams[a][i], y = teams[b][j];
      teams[a][i] = y; teams[b][j] = x;
      const c = cost(teams, people);
      if (c < current - 1e-9 && (!startOk || kidsOk())) { current = c; improved = true; }
      else { teams[a][i] = x; teams[b][j] = y; }
    }
    if (!improved) break;
  }
  // willekeurige teamvolgorde, binnen een team van jong naar oud
  for (let i = teams.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [teams[i], teams[j]] = [teams[j], teams[i]]; }
  return teams.map((t) => t.sort((p, q) => (p.age ?? 999) - (q.age ?? 999)).map((p) => p.id));
}

module.exports = { makeTeams, band };
