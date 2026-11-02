// Zet het ingevulde Excel-werkblad (zie vragenlijst.xlsx) om naar de structuur van questions.json.
// De Excel overschrijft de inhoud; wat in Excel ontbreekt (bv. een heel tabblad) blijft uit questions.json.
const fs = require('fs');
const { readXlsx } = require('./xlsx');
const { shuffle } = require('./util');

const FIRST = 4; // rij 5 (index 4): eerste gegevensregel op elk tabblad
const txt = (v) => (v === undefined || v === null ? '' : String(v).trim());
const list = (v) => txt(v).split(',').map((x) => x.trim()).filter(Boolean);
function num(v) {
  if (typeof v === 'number') return v;
  const n = Number(txt(v).replace('€', '').replace(/\s/g, '').replace(',', '.'));
  return txt(v) !== '' && Number.isFinite(n) ? n : null;
}
const yes = (v) => /^(ja|j|yes|y|true|1|x)$/i.test(txt(v));

function fromExcel(file, baseFile) {
  // file mag een pad of een Buffer zijn
  const warnings = [];
  const sheets = readXlsx(file);
  const raw = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  const rows = (name) => (sheets[name] || []).slice(FIRST);
  const has = (name) => {
    if (!sheets[name]) { warnings.push(`Tabblad "${name}" ontbreekt in de Excel: de standaardinhoud wordt gebruikt.`); return false; }
    return true;
  };

  // meerkeuzevraag uit 4+ kolommen: vraag, goed, fout1..3 (vanaf kolom q)
  const mc = (r, q, where) => {
    const question = txt(r[q]), good = txt(r[q + 1]);
    const wrong = [r[q + 2], r[q + 3], r[q + 4]].map(txt).filter(Boolean);
    if (!question && !good) return null;
    if (!question || !good || !wrong.length) { warnings.push(`${where}: vraag "${question || '?'}" mist een vraag, goed antwoord of foute antwoorden en is overgeslagen.`); return null; }
    const options = shuffle([good, ...wrong]);
    return { question, options, answer: options.indexOf(good) };
  };
  const rd = (id) => raw.rounds.find((x) => x.id === id);

  if (has('Rondes')) {
    for (const r of rows('Rondes')) {
      const round = rd(txt(r[0]));
      if (!round) continue;
      if (txt(r[1])) round.title = txt(r[1]);
      if (txt(r[2])) round.emoji = txt(r[2]);
      const intro = txt(r[3]);
      if (!intro || /^\(standaardtekst\)$/i.test(intro)) delete round.intro; else round.intro = intro;
      if (num(r[4]) > 0) round.seconds = num(r[4]);
      if (num(r[5]) > 0) round.points = num(r[5]);
    }
  }

  if (has('Test')) {
    const qs = rows('Test').map((r, i) => mc(r.slice(0), 0, `Test regel ${i + 5}`)).filter(Boolean);
    if (qs.length) raw.test.questions = qs;
    rows('Test').forEach((r, i) => { const q = qs.find((x) => x.question === txt(r[0])); if (q && txt(r[5])) q.explanation = txt(r[5]); });
  }

  if (has('R1 Meerkeuze')) {
    const cats = [];
    rows('R1 Meerkeuze').forEach((r, i) => {
      const q = mc(r, 1, `R1 regel ${i + 5}`);
      if (!q) return;
      const name = txt(r[0]) || 'Overig';
      let c = cats.find((x) => x.name === name);
      if (!c) cats.push((c = { name, questions: [] }));
      if (txt(r[6])) q.explanation = txt(r[6]);
      c.questions.push(q);
    });
    if (cats.length) rd('r1').categories = cats;
  }

  if (has('R2 Foto blur')) {
    const real = [];
    let test = null;
    rows('R2 Foto blur').forEach((r, i) => {
      const q = mc(r, 1, `R2 regel ${i + 5}`);
      if (!q) return;
      if (txt(r[6])) q.media = { kind: 'image', src: txt(r[6]) };
      else warnings.push(`R2 regel ${i + 5}: geen bestandsnaam voor de foto.`);
      if (txt(r[7])) q.explanation = txt(r[7]);
      if (yes(r[0]) && !test) test = q; else real.push(q);
    });
    const r2 = rd('r2');
    if (real.length || test) { r2.questions = real; if (test) r2.test = test; else delete r2.test; }
  }

  if (has('R3 Geheugen')) {
    const items = [];
    let seconds = null, prompt = null;
    for (const r of rows('R3 Geheugen')) {
      const a = txt(r[0]);
      if (/^schrijftijd/i.test(a)) { if (num(r[1]) > 0) seconds = num(r[1]); continue; }
      if (/^opdrachttekst/i.test(a)) { if (txt(r[1])) prompt = txt(r[1]); continue; }
      if (a) items.push({ text: a, alt: list(r[1]) });
    }
    const r3 = rd('r3');
    if (items.length) r3.items = items;
    if (seconds) r3.seconds = seconds;
    if (prompt) r3.prompt = prompt;
  }

  if (has('R4 Muziek')) {
    const songs = [];
    rows('R4 Muziek').forEach((r, i) => {
      if (!txt(r[0])) return;
      const year = num(r[2]);
      if (!Number.isInteger(year)) return warnings.push(`R4 regel ${i + 5}: "${txt(r[0])}" heeft geen geldig jaar en is overgeslagen.`);
      const s = { title: txt(r[0]), artist: txt(r[1]), year };
      if (yes(r[3])) s.start = true;
      if (txt(r[4])) s.audio = txt(r[4]);
      songs.push(s);
    });
    if (songs.length) { const r4 = rd('r4'); r4.songs = songs; r4.startCards = Math.max(1, songs.filter((s) => s.start).length) || 2; }
  }

  if (has('R5 Prijzen')) {
    const items = [];
    rows('R5 Prijzen').forEach((r, i) => {
      if (!txt(r[0])) return;
      const now = num(r[2]), ago = num(r[3]);
      if (now === null || ago === null) return warnings.push(`R5 regel ${i + 5}: "${txt(r[0])}" mist een prijs en is overgeslagen.`);
      items.push({ name: txt(r[0]), unit: txt(r[1]), now, ago });
    });
    if (items.length) { const base = rd('r5').items; rd('r5').items = items.map((it) => ({ emoji: (base.find((b) => b.name === it.name) || {}).emoji || '🛒', ...it })); }
  }

  if (has('R6 Tekenen')) {
    const words = rows('R6 Tekenen').filter((r) => txt(r[0])).map((r) => ({ word: txt(r[0]), alt: list(r[1]) }));
    if (words.length) rd('r6').words = words;
  }

  if (has('R7 30 Seconds')) {
    const cards = [];
    rows('R7 30 Seconds').forEach((r, i) => {
      const w = [r[1], r[2], r[3], r[4], r[5]].map(txt);
      if (!w.some(Boolean)) return;
      if (w.some((x) => !x)) return warnings.push(`R7 kaart op regel ${i + 5} heeft geen 5 woorden en is overgeslagen.`);
      cards.push(w);
    });
    if (cards.length) rd('r7').cards = cards;
  }

  if (has("R8 Logo's")) {
    const qs = [];
    rows("R8 Logo's").forEach((r, i) => {
      const good = txt(r[0]), wrong = [r[1], r[2], r[3]].map(txt).filter(Boolean);
      if (!good) return;
      if (!wrong.length) return warnings.push(`R8 regel ${i + 5}: "${good}" mist foute opties en is overgeslagen.`);
      if (!txt(r[4])) warnings.push(`R8 regel ${i + 5}: geen bestandsnaam voor het logo van ${good}.`);
      const options = shuffle([good, ...wrong]);
      qs.push({ question: 'Welk logo is dit?', options, answer: options.indexOf(good), media: { kind: 'image', src: txt(r[4]) } });
    });
    if (qs.length) rd('r8').questions = qs;
  }

  if (has('Slotvraag')) {
    const sh = sheets['Slotvraag'];
    const fr = sh[4] || [];
    const f = mc(fr, 1, 'Slotvraag');
    if (f) raw.final = { category: txt(fr[0]) || 'Slotvraag', ...f, explanation: txt(fr[6]) || undefined };
    const tb = [];
    for (let i = 8; i < sh.length; i++) {
      const r = sh[i] || [];
      if (!txt(r[1])) continue;
      const a = num(r[2]);
      if (a === null) { warnings.push(`Beslissingsvraag op regel ${i + 1} mist een getal als antwoord.`); continue; }
      tb.push({ question: txt(r[1]), answer: a, unit: txt(r[3]), explanation: txt(r[4]) || undefined });
    }
    raw.tiebreakers = tb;
  }
  return { raw, warnings };
}

module.exports = { fromExcel };
