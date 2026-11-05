// Zet het ingevulde Excel-werkblad (vragenlijst.xlsx) om naar de structuur van questions.json.
// Kolommen worden op naam gezocht (rij 4), zodat de volgorde van kolommen niet uitmaakt.
// Wat in de Excel ontbreekt (bv. een heel tabblad) blijft uit questions.json.
const fs = require('fs');
const { readXlsx } = require('./xlsx');
const { shuffle } = require('./util');

const HEADER = 3; // rij 4 (index 3): kolomnamen
const FIRST = 4;  // rij 5 (index 4): eerste gegevensregel
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
  const has = (name) => {
    if (!sheets[name]) { warnings.push(`Tabblad "${name}" ontbreekt in de Excel: de standaardinhoud wordt gebruikt.`); return false; }
    return true;
  };
  // Rijen als objecten: get(/kolomnaam/) geeft de waarde in die kolom
  const table = (name) => {
    const sh = sheets[name] || [];
    const head = (sh[HEADER] || []).map((h) => txt(h).toLowerCase());
    const idx = (re) => head.findIndex((h) => re.test(h));
    return sh.slice(FIRST).map((r, i) => ({ r: r || [], line: i + FIRST + 1, get: (re) => { const k = idx(re); return k >= 0 ? (r || [])[k] : undefined; }, at: (k) => (r || [])[k] }));
  };
  const rd = (id) => raw.rounds.find((x) => x.id === id);
  const mc = (question, good, wrongs, where) => {
    question = txt(question); good = txt(good);
    const wrong = wrongs.map(txt).filter(Boolean);
    if (!question && !good) return null;
    if (!question || !good || !wrong.length) { warnings.push(`${where}: vraag "${question || '?'}" mist een vraag, goed antwoord of foute antwoorden en is overgeslagen.`); return null; }
    const options = shuffle([good, ...wrong], `${question}|${good}|${wrong.join('|')}`); // vaste volgorde (veilig bij herstart)
    return { question, options, answer: options.indexOf(good) };
  };
  const mcRow = (x, where) => mc(x.get(/^vraag/), x.get(/^goed/), [x.get(/^fout 1/), x.get(/^fout 2/), x.get(/^fout 3/)], where);

  // ---- Teksten: alle vaste teksten op tv en telefoon (kolom "Sleutel" + kolom "Tekst")
  if (sheets['Teksten']) {
    raw.texts = raw.texts || {};
    const rowsT = table('Teksten');
    const hasKey = rowsT.some((x) => txt(x.get(/^sleutel/)));
    for (const x of rowsT) {
      if (hasKey) {
        const key = txt(x.get(/^sleutel/)), val = txt(x.get(/^tekst/));
        if (key && val) raw.texts[key] = val;
        continue;
      }
      // Oude opzet (Onderdeel | Tekst)
      const label = txt(x.at(0)).toLowerCase(), val = txt(x.at(1));
      if (!val) continue;
      if (/welkom.*titel/.test(label)) raw.texts['welkom.titel'] = val;
      else if (/welkom.*tekst/.test(label)) raw.texts['welkom.tekst'] = val;
      else if (/welkom.*emoji/.test(label)) raw.texts['welkom.emoji'] = val;
      else if (/test.*titel/.test(label)) raw.texts['test.titel'] = val;
      else if (/test.*(uitleg|tekst)/.test(label)) raw.texts['test.tekst'] = val;
      else if (/start.*titel/.test(label)) raw.texts['start.titel'] = val;
      else if (/start.*tekst/.test(label)) raw.texts['start.tekst'] = val;
    }
  }

  if (has('Rondes')) {
    for (const x of table('Rondes')) {
      const round = rd(txt(x.get(/id/)));
      if (!round) continue;
      if (txt(x.get(/^titel/))) round.title = txt(x.get(/^titel/));
      if (txt(x.get(/^emoji/))) round.emoji = txt(x.get(/^emoji/));
      const intro = txt(x.get(/^uitleg/));
      if (!intro || /^\(standaardtekst\)$/i.test(intro)) delete round.intro; else round.intro = intro;
      if (num(x.get(/^seconden/)) > 0) round.seconds = num(x.get(/^seconden/));
    }
  }

  if (has('Test')) {
    const qs = table('Test').map((x) => { const q = mcRow(x, `Test regel ${x.line}`); if (q && txt(x.get(/toelichting/))) q.explanation = txt(x.get(/toelichting/)); return q; }).filter(Boolean);
    if (qs.length) raw.test.questions = qs;
  }

  if (has('R1 Meerkeuze')) {
    const cats = [];
    table('R1 Meerkeuze').forEach((x) => {
      const q = mcRow(x, `R1 regel ${x.line}`);
      if (!q) return;
      const name = txt(x.get(/^categorie/)) || 'Overig';
      let c = cats.find((k) => k.name === name);
      if (!c) cats.push((c = { name, questions: [] }));
      if (txt(x.get(/toelichting/))) q.explanation = txt(x.get(/toelichting/));
      c.questions.push(q);
    });
    if (cats.length) rd('r1').categories = cats;
  }

  // Foto blur: open vraag (oude meerkeuze-opzet met "Fout 1" wordt ook nog gelezen)
  if (has('R2 Foto blur')) {
    const qs = [];
    table('R2 Foto blur').forEach((x) => {
      const name = txt(x.get(/^goed/));
      if (!name) return;
      const src = txt(x.get(/bestand/));
      if (!src) warnings.push(`R2 regel ${x.line}: geen bestandsnaam voor de foto.`);
      qs.push({ question: txt(x.get(/^vraag/)), name, alt: list(x.get(/ook goed/)), media: { kind: 'image', src }, practice: yes(x.get(/oefen|test/)) });
    });
    if (qs.length) { const r2 = rd('r2'); r2.questions = qs; delete r2.test; }
  }

  if (has('R3 Geheugen')) {
    const items = [];
    let prompt = null, pPrompt = null, pItems = null;
    for (const x of table('R3 Geheugen')) {
      const a = txt(x.at(0));
      if (/^schrijftijd/i.test(a)) continue;
      if (/^opdrachttekst/i.test(a)) { if (txt(x.at(1))) prompt = txt(x.at(1)); continue; }
      if (/^oefenopdracht/i.test(a)) { if (txt(x.at(1))) pPrompt = txt(x.at(1)); continue; }
      if (/^oefen-?items/i.test(a)) { pItems = list(x.at(1)); continue; }
      if (a) items.push({ text: a, alt: list(x.at(1)) });
    }
    const r3 = rd('r3');
    if (items.length) r3.items = items;
    if (prompt) r3.prompt = prompt;
    if (pPrompt) r3.practice = { prompt: pPrompt, items: pItems || [] };
    if (/vorig jaar/i.test(r3.title || '')) r3.title = 'Geheugenronde';
    if (/vorig jaar/i.test(r3.intro || '')) r3.intro = 'Geheugenronde: onthoud de getoonde informatie en schrijf daarna samen zoveel mogelijk antwoorden op via de basistelefoon. De quizmaster bepaalt wanneer de tijd om is en keurt de antwoorden goed of fout.';
    if (/vorig jaar/i.test(r3.prompt || '')) r3.prompt = 'Wat kun je je herinneren? Schrijf zoveel mogelijk op!';
  }

  if (has('R4 Muziek')) {
    const songs = [];
    table('R4 Muziek').forEach((x) => {
      const title = txt(x.get(/^titel/));
      if (!title) return;
      const year = num(x.get(/^jaar/));
      if (!Number.isInteger(year)) return warnings.push(`R4 regel ${x.line}: "${title}" heeft geen geldig jaar en is overgeslagen.`);
      const s = { title, artist: txt(x.get(/^artiest/)), year };
      if (yes(x.get(/^startkaart/))) s.start = true;
      if (yes(x.get(/^oefen/))) s.practice = true;
      if (txt(x.get(/^audio/))) s.audio = txt(x.get(/^audio/));
      if (txt(x.get(/^categorie/))) s.category = txt(x.get(/^categorie/));
      songs.push(s);
    });
    if (songs.length) { const r4 = rd('r4'); r4.songs = songs; r4.startCards = Math.max(1, songs.filter((s) => s.start && !s.practice).length) || 2; }
  }

  // Hitster-tabbladen in de vragenlijst zelf (oudere bestanden) worden nog gelezen; normaal staat de
  // Hitster-bibliotheek in een apart bestand (Hitster-bibliotheek.xlsx), zie libraryFromSheets hieronder.
  const hitsterLibrary = libraryFromSheets(sheets, warnings);
  raw.hitsterLibrary = hitsterLibrary;

  if (has('R5 Prijzen')) {
    const items = [];
    const base = rd('r5').items || [];
    table('R5 Prijzen').forEach((x) => {
      const name = txt(x.get(/^product/));
      if (!name) return;
      const now = num(x.get(/^prijs nu/)), ago = num(x.get(/geleden/));
      if (now === null || ago === null) return warnings.push(`R5 regel ${x.line}: "${name}" mist een prijs en is overgeslagen.`);
      items.push({ emoji: (base.find((b) => b.name === name) || {}).emoji || '🛒', name, unit: txt(x.get(/^hoeveelheid/)), now, ago, practice: yes(x.get(/^oefen/)) });
    });
    if (items.length) rd('r5').items = items;
  }

  if (has('R6 Tekenen')) {
    const words = table('R6 Tekenen').filter((x) => txt(x.get(/^woord/))).map((x) => ({ word: txt(x.get(/^woord/)), alt: list(x.get(/ook goed/)), practice: yes(x.get(/^oefen/)) }));
    if (words.length) rd('r6').words = words;
  }

  if (has('R7 30 Seconds')) {
    const cards = [];
    table('R7 30 Seconds').forEach((x) => {
      const w = [1, 2, 3, 4, 5].map((n) => txt(x.get(new RegExp(`^woord ${n}`))));
      if (!w.some(Boolean)) return;
      if (w.some((v) => !v)) return warnings.push(`R7 kaart op regel ${x.line} heeft geen 5 woorden en is overgeslagen.`);
      cards.push({ words: w, practice: yes(x.get(/^oefen/)) });
    });
    if (cards.length) rd('r7').cards = cards;
  }

  if (has("R8 Logo's")) {
    const qs = [];
    table("R8 Logo's").forEach((x) => {
      const name = txt(x.get(/^merk/));
      if (!name) return;
      const src = txt(x.get(/bestand/));
      if (!src) warnings.push(`R8 regel ${x.line}: geen bestandsnaam voor het logo van ${name}.`);
      qs.push({ name, alt: list(x.get(/ook goed/)), media: { kind: 'image', src }, practice: yes(x.get(/^oefen/)) });
    });
    if (qs.length) rd('r8').questions = qs;
  }

  if (has('Slotvraag')) {
    const sh = sheets['Slotvraag'];
    const fr = sh[4] || [];
    const f = mc(fr[1], fr[2], [fr[3], fr[4], fr[5]], 'Slotvraag');
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
  if (raw.texts && /vorig jaar/i.test(raw.texts['uitleg.memory'] || '')) {
    raw.texts['uitleg.memory'] = 'Geheugenronde: onthoud de getoonde informatie en schrijf daarna samen zoveel mogelijk antwoorden op via de basistelefoon. De quizmaster bepaalt wanneer de tijd om is en keurt de antwoorden goed of fout.';
  }
  return { raw, warnings };
}


// ---- Hitster-bibliotheek (los bestand of tabbladen "Hitster - <categorie>") ----
const categoryAliases = {
  '': 'original', standaard: 'original', basis: 'original', algemeen: 'original', original: 'original',
  'guilty pleasures': 'guilty', guilty: 'guilty', 'rock classics': 'rock', rock: 'rock',
  nederpop: 'nederpop', 'summer party': 'summer', summer: 'summer',
  '80s & 90s': '80s90s', '80s/90s': '80s90s', '80s90s': '80s90s', '80s & 90s (eigen)': '80s90s',
  '00s & 10s': '00s10s', '00s/10s': '00s10s', '00s10s': '00s10s', '00s & 10s (eigen)': '00s10s',
  'original refresh': 'refresh', refresh: 'refresh', '100% nl': 'nederpop', 'top 40 nl': 'top40', 'top 40': 'top40', top40: 'top40',
  'hip hop': 'hiphop', hiphop: 'hiphop', 'urban & hiphop': 'hiphop', 'urban & hip hop': 'hiphop',
  soundtracks: 'soundtracks', 'movies & tv': 'soundtracks', 'movies & tv soundtracks': 'soundtracks',
  christmas: 'christmas', kerst: 'christmas', celebration: 'celebration', bingo: 'bingo',
  'flying mic': 'flyingmic', flyingmic: 'flyingmic',
  'battle t-m 1984': 'battle1', 'battle t/m 1984': 'battle1', battle1: 'battle1',
  'battle 1985-2004': 'battle2', battle2: 'battle2', 'battle 2005-2025': 'battle3', battle3: 'battle3'
};
const catOf = (name) => {
  const n = String(name || '').toLowerCase().replace(/^hitster\s*[-:–]?\s*/, '').replace(/\s+/g, ' ').trim();
  return categoryAliases[n] || n;
};
function libraryFromSheets(sheets, warnings) {
  const library = [];
  const readSheet = (sheetName, fixedCategory) => {
    const sh = sheets[sheetName] || [];
    const head = (sh[HEADER] || []).map((h) => txt(h).toLowerCase());
    const col = (re) => head.findIndex((h) => re.test(h));
    const cTitle = col(/^titel/), cArtist = col(/^artiest/), cYear = col(/^jaar$|^jaar\b(?!.*check)/), cStart = col(/^startkaart/),
      cCheck = col(/check|controle/), cAudio = col(/^audio/), cCat = col(/^categorie/);
    sh.slice(FIRST).forEach((r, i) => {
      const at = (k) => (k >= 0 && r ? r[k] : undefined);
      const title = txt(at(cTitle));
      if (!title) return;
      const year = num(at(cYear));
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        warnings.push(`${sheetName} regel ${i + FIRST + 1}: "${title}" heeft geen geldig jaar en is overgeslagen.`);
        return;
      }
      const song = { title, artist: txt(at(cArtist)), year, category: fixedCategory || catOf(txt(at(cCat))) || 'original' };
      if (yes(at(cStart))) song.start = true;
      if (yes(at(cCheck))) song.check = true; // jaar komt uit een Spotify-lijst: in de bediening controleren
      if (txt(at(cAudio))) song.audio = txt(at(cAudio));
      library.push(song);
    });
  };
  if (sheets['Hitster bibliotheek']) readSheet('Hitster bibliotheek', null);
  Object.keys(sheets).filter((name) => /^hitster\s*[-:–]/i.test(name)).forEach((name) => readSheet(name, catOf(name)));
  return library;
}
// Los bestand met alleen de Hitster-bibliotheek
function libraryFromExcel(file) {
  const warnings = [];
  const sheets = readXlsx(file);
  // Tabblad Bronnen: per tabblad de link naar de liedjeslijst en de officiële Spotify-playlist
  const bronnen = [];
  const b = sheets.Bronnen || [];
  const head = (b[HEADER] || []).map((h) => txt(h).toLowerCase());
  const cTab = head.findIndex((h) => /tabblad/.test(h)), cPl = head.findIndex((h) => /spotify|playlist/.test(h));
  const cUrl = head.findIndex((h) => /link|lijst/.test(h) && !/spotify|playlist/.test(h));
  b.slice(FIRST).forEach((r) => {
    const tab = txt((r || [])[cTab]);
    if (!tab) return;
    const pl = /playlist[/:]([A-Za-z0-9]{22})|^([A-Za-z0-9]{22})$/.exec(txt((r || [])[cPl]));
    bronnen.push({ tab, category: catOf(tab), url: txt((r || [])[cUrl]), playlist: pl ? pl[1] || pl[2] : null });
  });
  return { library: libraryFromSheets(sheets, warnings), warnings, sheetNames: Object.keys(sheets), bronnen };
}
// Is dit bestand een vragenlijst (heeft het de rondetabbladen)?
const isQuizWorkbook = (file) => Object.keys(readXlsx(file)).some((name) => /^R\d+ |^Lees mij$|^Slotvraag|^Teksten$/i.test(name));

module.exports = { fromExcel, libraryFromExcel, isQuizWorkbook, catOf };
