// Scorematrix: per vraagtype controleren hoe de punten worden berekend (normaal, fout, geen antwoord,
// maximaal, gelijke stand, joker). De punten van een ronde worden altijd omgerekend naar 100.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');

const app = startServer();
const { T, host } = app;
host.send('add_bots', { n: 3 }); // drie teams (in de lobby doen de robots niets)
const [A, B, C] = Object.values(T.teams).sort((x, y) => x.seq - y.seq);
const P = T.settings.roundPoints;
const realSteps = (roundId, kind) => T.steps.filter((s) => s.round === roundId && !s.test && (!kind || s.kind === kind));
const score = (team, roundId) => T.roundScore(team, T.roundById[roundId]);
const pct = (raw, max) => Math.round((raw / max) * P);

test('meerkeuze: goed, fout, geen antwoord; open vragen tellen nog niet', () => {
  const qs = realSteps('r1', 'mc');
  const [q1] = qs;
  const s = T.ss(q1);
  s.answers = { [A.teamId]: { v: q1.answer }, [B.teamId]: { v: (q1.answer + 1) % q1.options.length } };
  s.status = 'open';
  assert.equal(score(A, 'r1'), 0, 'nog open: geen punten');
  s.status = 'closed';
  assert.equal(score(A, 'r1'), pct(1, qs.length));
  assert.equal(score(B, 'r1'), 0);
  assert.equal(score(C, 'r1'), 0);
});

test('meerkeuze: vraag laten vervallen en iedereen goed rekenen', () => {
  const qs = realSteps('r1', 'mc');
  const s2 = T.ss(qs[1]); s2.status = 'closed'; s2.voided = 'void';
  assert.equal(score(A, 'r1'), pct(1, qs.length - 1), 'vervallen vraag telt niet mee in het maximum');
  const s3 = T.ss(qs[2]); s3.status = 'closed'; s3.voided = 'all_correct';
  assert.equal(score(C, 'r1'), pct(1, qs.length - 1), 'ook zonder antwoord goed gerekend');
  assert.equal(score(A, 'r1'), pct(2, qs.length - 1));
});

test('joker: de gekozen ronde telt dubbel', () => {
  const before = T.totalBeforeFinal(A);
  A.jokerRound = 'r1';
  assert.equal(T.totalBeforeFinal(A), before + score(A, 'r1'));
  A.jokerRound = null;
});

test('foto blur: hoe eerder goed, hoe meer punten; niet goedgekeurd = 0', () => {
  const qs = realSteps('r2', 'logo');
  const s = T.ss(qs[0]);
  const bp = T.settings.blurPoints;
  s.answers = { [A.teamId]: { text: 'x', at: 1, step: 0 }, [B.teamId]: { text: 'x', at: 2, step: 2 }, [C.teamId]: { text: 'fout', at: 3, step: 0 } };
  s.judged = { [A.teamId]: true, [B.teamId]: true };
  s.status = 'closed';
  const max = bp[0] * qs.length;
  assert.equal(score(A, 'r2'), pct(bp[0], max));
  assert.equal(score(B, 'r2'), pct(bp[2], max));
  assert.equal(score(C, 'r2'), 0);
});

test("logo's: het snelste goede antwoord krijgt de meeste punten", () => {
  const qs = realSteps('r8', 'logo');
  const s = T.ss(qs[0]);
  const lp = T.settings.logoPoints;
  s.answers = { [A.teamId]: { text: 'x', at: 20 }, [B.teamId]: { text: 'x', at: 10 }, [C.teamId]: { text: 'x', at: 5 } };
  s.judged = { [A.teamId]: true, [B.teamId]: true }; // C was het snelst, maar fout
  s.status = 'closed';
  const aw = T.logoAwards(qs[0]);
  assert.equal(aw[B.teamId], lp[0]);
  assert.equal(aw[A.teamId], lp[1]);
  assert.equal(aw[C.teamId], undefined);
});

test('prijzen: dichtstbij wint, gelijke afstand deelt de plek', () => {
  const q = realSteps('r5', 'price')[0];
  const s = T.ss(q);
  const pp = T.settings.pricePoints;
  s.answers = { [A.teamId]: { now: q.now, ago: q.ago }, [B.teamId]: { now: q.now + 1, ago: q.ago * 3 }, [C.teamId]: { now: q.now - 1, ago: q.ago * 5 } };
  s.status = 'revealed';
  const aw = T.priceAwards(q);
  assert.equal(aw[A.teamId].now.pts, pp[0]);
  assert.equal(aw[B.teamId].now.pts, pp[1], 'B en C even ver: allebei tweede');
  assert.equal(aw[C.teamId].now.pts, pp[1]);
  assert.equal(aw[B.teamId].ago.pts, pp[1]);
  assert.equal(aw[C.teamId].ago.pts, pp[2]);
});

test('geheugen: elk goed item telt, maximaal het aantal items', () => {
  const q = realSteps('r3', 'memory')[0];
  const s = T.ss(q);
  const n = q.items.length;
  s.entries = { [A.teamId]: Array.from({ length: n + 3 }, (_, i) => ({ id: 'e' + i, text: 'x', ok: true })), [B.teamId]: [{ id: 'b', text: 'x', ok: true }, { id: 'c', text: 'y', ok: false }] };
  s.status = 'done';
  assert.equal(score(A, 'r3'), P, 'meer goede items dan er zijn: toch maximaal 100');
  assert.equal(score(B, 'r3'), pct(1, n));
  assert.equal(score(C, 'r3'), 0);
});

test('hitster: de helft voor de goede plek, de helft voor het exacte jaartal', () => {
  T.settings.hitsterTitlePoints = 0; T.settings.hitsterArtistPoints = 0; // eerst zonder titel/artiest-bonus
  const q = realSteps('r4', 'song')[0];
  const s = T.ss(q);
  s.status = 'revealed';
  s.results = { [A.teamId]: { ok: true, exact: true }, [B.teamId]: { ok: true, exact: false }, [C.teamId]: { ok: false, exact: false } };
  assert.equal(score(A, 'r4'), P);
  assert.equal(score(B, 'r4'), P / 2);
  assert.equal(score(C, 'r4'), 0);
});

test('hitster: jaartal met speling (exact 5, 1 jaar ernaast 3, 2 of 3 jaar ernaast 1)', () => {
  const qs = realSteps('r4', 'song');
  const q = qs[1];
  const s = T.ss(q);
  s.songId = s.songId || Object.keys(T.songs).find((id) => id.startsWith('r4_'));
  const year = T.songs[s.songId].year;
  s.status = 'revealed';
  s.results = { [A.teamId]: { ok: true, yearGuess: year + 1 }, [B.teamId]: { ok: false, yearGuess: year - 3 }, [C.teamId]: { ok: true, yearGuess: year + 4 } };
  const award = (t) => { const r = s.results[t.teamId]; const d = Math.abs(r.yearGuess - year); return (r.ok ? T.settings.hitsterPlacePoints : 0) + (T.settings.hitsterYearPoints[d] || 0); };
  assert.equal(award(A), 5 + 3);
  assert.equal(award(B), 0 + 1);
  assert.equal(award(C), 5 + 0);
  // de eerste vraag (vorige test): A 10, B 5, C 0 — samen met deze: max 2 x 10
  assert.equal(score(A, 'r4'), Math.round(((10 + 8) / 20) * P));
  assert.equal(score(B, 'r4'), Math.round(((5 + 1) / 20) * P));
  assert.equal(score(C, 'r4'), Math.round(((0 + 5) / 20) * P));
});

test('hitster-bonus: titel en artiest, voorstel van de app en goedkeuring door de quizmaster', () => {
  T.settings.hitsterTitlePoints = 2; T.settings.hitsterArtistPoints = 2;
  const q = realSteps('r4', 'song')[2];
  const s = T.ss(q);
  s.status = 'revealed'; s.results = {}; s.judge = { [A.teamId]: { title: true, artist: true }, [B.teamId]: { title: true, artist: false } };
  const award = T.songAward(q, A.teamId);
  assert.equal(award.max, 5 + 5 + 2 + 2);
  assert.equal(award.title + award.artist, 4);
  assert.equal(T.songAward(q, B.teamId).title + T.songAward(q, B.teamId).artist, 2);
  // de bonus moet ook in de rondescore terechtkomen (max per liedje is nu 5 + 5 + 2 + 2 = 14, drie liedjes onthuld)
  // A: liedje 1 plek 5 + jaar 5, liedje 2 plek 5 + jaar 3, liedje 3 titel 2 + artiest 2 = 22
  // B: liedje 1 plek 5, liedje 2 jaar 1, liedje 3 titel 2 = 8;  C: liedje 2 plek 5 = 5
  assert.equal(score(A, 'r4'), pct(22, 42), 'titel- en artiestbonus tellen mee in de ronde');
  assert.equal(score(B, 'r4'), pct(8, 42));
  assert.equal(score(C, 'r4'), pct(5, 42));
  // goedkeuren door de quizmaster verandert de score meteen
  s.judge[B.teamId].artist = true;
  assert.equal(score(B, 'r4'), pct(10, 42), 'artiest alsnog goedgekeurd');
  s.judge[B.teamId].artist = false;
  // vóór de onthulling telt een (voorlopige) beoordeling nog niet mee
  const q4 = realSteps('r4', 'song')[3];
  if (q4) {
    const s4 = T.ss(q4);
    s4.status = 'open'; s4.judge = { [C.teamId]: { title: true, artist: true } };
    assert.equal(score(C, 'r4'), pct(5, 42), 'nog niet onthuld: geen bonus en geen extra maximum');
    s4.judge = {};
  }
  // automatisch voorstel: kleine tikfouten, hoofdletters en toevoegingen maken niet uit
  assert.ok(T.looksLike('bohemian rapsody', 'Bohemian Rhapsody - Remastered 2011'.replace(/ - .*/, '')));
  assert.ok(T.looksLike('queen', 'Queen'));
  assert.ok(T.looksLike('Beyonce', 'Beyoncé & JAY-Z'));
  assert.ok(T.looksLike('Stayin Alive', "Stayin' Alive"));
  assert.ok(!T.looksLike('Hey Jude', 'Let It Be'));
  assert.ok(!T.looksLike('', 'Queen'));
});

test('tekenen: punten per goed geraden tekening; team met één speler doet niet mee', () => {
  const q = realSteps('r6', 'draw')[0];
  const s = T.ss(q);
  s.plan = { members: { [A.teamId]: ['a1', 'a2'], [B.teamId]: ['b1', 'b2'], [C.teamId]: ['c1'] } };
  s.turns = [{ done: true, ok: { [A.teamId]: true, [B.teamId]: false } }, { done: true, ok: { [A.teamId]: true, [B.teamId]: true } }];
  assert.equal(score(A, 'r6'), P);
  assert.equal(score(B, 'r6'), P / 2);
  assert.equal(score(C, 'r6'), 0);
});

test('30 Seconds: elk goed uitgelegd woord telt', () => {
  const q = realSteps('r7', 'thirty')[0];
  const s = T.ss(q);
  s.order = [{ teamId: A.teamId }, { teamId: A.teamId }, { teamId: B.teamId }];
  s.turns = [{ teamId: A.teamId, done: true, ok: [true, true, true, false, false] }, { teamId: A.teamId, done: true, ok: [true, true, false, false, false] }];
  assert.equal(score(A, 'r7'), 50);   // 5 van de 10
  assert.equal(score(B, 'r7'), 0);    // beurt nog niet gespeeld
});

test('slotvraag: inzet erbij als het goed is, eraf als het fout is', () => {
  const f = T.steps.find((s) => s.kind === 'final');
  const s = T.ss(f);
  s.wagers = { [A.teamId]: 50, [B.teamId]: 30 };
  s.answers = { [A.teamId]: f.answer, [B.teamId]: (f.answer + 1) % f.options.length };
  s.status = 'question';
  assert.equal(T.finalDelta(A), 0, 'pas na het onthullen');
  s.status = 'revealed';
  assert.equal(T.finalDelta(A), 50);
  assert.equal(T.finalDelta(B), -30);
  assert.equal(T.finalDelta(C), 0);
});

test('gelijke stand: zelfde punten = zelfde plek in de ranglijst', () => {
  const r = T.ranking();
  for (const x of r) for (const y of r) if (x.score === y.score) assert.equal(x.rank, y.rank);
  const ranks = r.map((x) => x.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('antwoordvolgorde A-D is na opnieuw inlezen van de Excel hetzelfde (veilig bij een herstart)', () => {
  const { fromExcel } = require('../lib/fromExcel');
  const file = require('path').join(__dirname, '..', 'vragenlijst.xlsx');
  const a = fromExcel(file, 'questions.json').raw, b = fromExcel(file, 'questions.json').raw;
  assert.deepEqual(a.rounds.find((r) => r.id === 'r1').categories, b.rounds.find((r) => r.id === 'r1').categories);
  assert.deepEqual(a.test, b.test);
});
