// Leest questions.json en zet de hele quiz om in een lijst "stappen" (schermen) die de quizmaster
// een voor een doorloopt. Rondes zijn: meerkeuze (mc), fotoblur (blur), geheugen (memory),
// muziektijdlijn (hitster), prijzen (price), tekenen (draw), 30 seconds (thirty) en logo's (logo).
const fs = require('fs');

const DEFAULT_INTRO = {
  mc: 'Meerkeuzevragen. De basistelefoon dient het antwoord van het team in.',
  blur: 'Een foto wordt steeds scherper. Typ op de basistelefoon wat je ziet: één antwoord per foto. Hoe eerder goed, hoe meer punten; de quizmaster keurt de antwoorden.',
  memory: 'Vorig jaar schreven we dingen op een bord. Schrijf er zoveel mogelijk op via de basistelefoon! De quizmaster bepaalt wanneer de tijd om is en keurt alles goed of fout.',
  hitster: 'Leg elk liedje op de juiste plek in jullie tijdlijn. De basistelefoon plaatst, de rest van het team denkt mee.',
  price: 'Schat de prijzen van tien boodschappen: wat kosten ze nu, en wat kostten ze vroeger? Wie het dichtstbij zit, krijgt de meeste punten.',
  draw: 'Alle teams tekenen tegelijk, elk een ander woord. Iedereen komt een keer aan de beurt. De tekenaar tekent op de eigen telefoon, de rest van het team ziet het live en dient één antwoord in; de quizmaster keurt.',
  thirty: 'Eén teamlid legt in 30 seconden vijf dingen uit aan het eigen team. De quizmaster keurt goede antwoorden meteen goed; die kleuren groen op de tv.',
  logo: 'Welk logo zien we hier? Er ontbreken stukjes! Typ het merk op de basistelefoon: één antwoord per team. Hoe sneller goed, hoe meer punten.'
};

function normalizeMedia(media) {
  if (!media) return null;
  const m = typeof media === 'string' ? { kind: 'image', src: media } : { kind: 'image', ...media };
  if (!m.src) return null;
  if (!/^(https?:)?\/\//i.test(m.src) && !m.src.startsWith('/')) m.src = '/media/' + m.src.replace(/^\.?\/+/, '');
  return m;
}

// Muziek: categorie per decennium (automatisch) of uit de Excel-kolom "Categorie"
const decadeOf = (y) => (y < 1970 ? 'Jaren 60 en ouder' : y >= 2020 ? 'Jaren 20' : `Jaren ${String(Math.floor(y / 10) * 10).slice(2)}`);
const inCategory = (s, cat) => !cat || cat === 'Alles' || (s.category && s.category.toLowerCase() === String(cat).toLowerCase()) || decadeOf(s.year) === cat;
const hashOf = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

function loadContent(file, preParsed) {
  const warnings = [];
  let raw;
  try {
    raw = preParsed || JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { rounds: [], steps: [], songs: {}, warnings: [`questions.json kon niet gelezen worden: ${e.message}`] };
  }

  const steps = [];
  const rounds = [];
  const songs = {};
  const ids = new Set();
  const add = (step) => {
    let id = String(step.id);
    while (ids.has(id)) id += '_';
    ids.add(id);
    step.id = id;
    step.index = steps.length;
    steps.push(step);
    return step;
  };

  // Meerkeuzevraag (ook gebruikt voor foto- en logovragen)
  const mcStep = (q, extra) => {
    if (!q || !Array.isArray(q.options) || q.options.length < 2 || !Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) {
      warnings.push(`Vraag "${(q && (q.id || q.question)) || '?'}" is ongeldig (opties of answer) en wordt overgeslagen.`);
      return null;
    }
    return add({
      kind: 'mc', variant: 'text', test: false, explanation: q.explanation || null,
      question: q.question || '', options: q.options.map(String), answer: q.answer,
      media: normalizeMedia(q.media || q.imageUrl), time: q.time ?? null,
      ...extra, id: extra.idPrefix + (q.id || extra.n)
    });
  };

  // ---- Testvragen ----
  const test = raw.test || {};
  const testIntro = test.intro || {};
  add({
    id: 'test_intro', kind: 'info', round: 'test', emoji: testIntro.emoji || '🧪',
    title: testIntro.title || 'Eerst even testen',
    text: testIntro.text || 'We beginnen met drie makkelijke testvragen om te kijken of alles werkt. Ze tellen niet mee voor de uitslag.'
  });
  (test.questions || []).forEach((q, i) => mcStep(q, { round: 'test', test: true, idPrefix: 'test_', n: i + 1, category: 'Testvraag' }));
  const real = raw.start || {};
  add({
    id: 'real_start', kind: 'info', round: 'test', emoji: real.emoji || '🏁',
    title: real.title || 'Hier begint de echte quiz!',
    text: real.text || 'Vanaf nu telt alles mee. Veel succes!'
  });
  add({ id: 'joker', kind: 'joker', round: 'joker' });

  // ---- Rondes ----
  // Elke ronde: leuke tussenpagina ("Nu gaan we door naar…") met uitleg, dan een oefenronde (telt niet mee),
  // dan "Nu begint het echt!", dan de echte vragen.
  const isPractice = (x) => !!(x && (x.practice === true || x.oefen === true));
  const openQ = (q) => {
    if (!q) return null;
    const name = q.name || (Array.isArray(q.options) && Number.isInteger(q.answer) ? q.options[q.answer] : null);
    return name ? { name: String(name), alt: q.alt || [], media: normalizeMedia(q.media || q.imageUrl), question: q.question || '' } : null;
  };
  (raw.rounds || []).forEach((r, ri) => {
    const round = {
      id: r.id || `r${ri + 1}`, no: ri + 1, type: r.type, title: r.title || `Ronde ${ri + 1}`,
      points: Number.isInteger(r.points) ? r.points : null, intro: (r.extra ? 'Extra ronde! ' : '') + (r.intro || DEFAULT_INTRO[r.type] || ''), extra: !!r.extra, category: r.category || null
    };
    if (!DEFAULT_INTRO[round.type]) {
      warnings.push(`Ronde "${round.title}" heeft een onbekend type "${round.type}" en wordt overgeslagen.`);
      return;
    }
    rounds.push(round);
    add({ id: `${round.id}_intro`, kind: 'info', round: round.id, roundIntro: true, transition: true, emoji: r.emoji || '🎯', title: `Ronde ${round.no}: ${round.title}`, text: round.intro });

    const base = { round: round.id };
    let practiced = false;
    const realStart = () => {
      if (practiced) add({ id: `${round.id}_real`, kind: 'info', round: round.id, emoji: '🔥', title: 'Nu begint het echt!', text: 'De oefenronde is voorbij. Vanaf nu tellen de punten mee.' });
    };
    switch (round.type) {
      case 'mc': {
        const cats = r.categories || [{ name: '', questions: r.questions || [] }];
        const practiceCats = cats.filter((c) => /^oefen/i.test(c.name || ''));
        practiceCats.forEach((cat, ci) => (cat.questions || []).forEach((q, qi) => { if (mcStep(q, { ...base, test: true, category: 'Oefenvraag', idPrefix: `${round.id}_oefen${ci + 1}_`, n: qi + 1 })) practiced = true; }));
        realStart();
        cats.filter((c) => !/^oefen/i.test(c.name || '')).forEach((cat, ci) => {
          if (cat.name && (cat.questions || []).length) add({ id: `${round.id}_cat${ci + 1}`, kind: 'info', round: round.id, categoryIntro: true, transition: true, emoji: cat.emoji || '📚', title: cat.name, text: `${cat.questions.length} vragen in de categorie ${cat.name}.` });
          (cat.questions || []).forEach((q, qi) => mcStep(q, { ...base, category: cat.name || '', idPrefix: `${round.id}_c${ci + 1}_`, n: qi + 1 }));
        });
        break;
      }
      case 'blur':
      case 'logo': {
        // Open vraag (geen meerkeuze): het team typt één antwoord; de quizmaster keurt goed of fout.
        // Foto blur: hoe eerder (minder wazig) goed, hoe meer punten. Logo's: snelste goede antwoord de meeste punten.
        const variant = round.type;
        const list = [...(r.test ? [{ ...r.test, practice: true }] : []), ...(r.questions || [])];
        const mk = (q, i, test) => {
          const o = openQ(q);
          if (!o) return warnings.push(`${round.title}: vraag ${i + 1} heeft geen goed antwoord en wordt overgeslagen.`);
          add({ id: `${round.id}_${test ? 'oefen' : 'q'}${i + 1}`, kind: 'logo', variant, ...base, test, ...o, hide: typeof r.hide === 'number' ? r.hide : 0.5 });
          if (test) practiced = true;
        };
        list.filter(isPractice).forEach((q, i) => mk(q, i, true));
        realStart();
        list.filter((q) => !isPractice(q)).forEach((q, i) => mk(q, i, false));
        break;
      }
      case 'memory': {
        const items = (r.items || []).map((it) => (typeof it === 'string' ? { text: it, alt: [] } : { text: it.text, alt: it.alt || [] })).filter((it) => it.text);
        if (!items.length) warnings.push(`Ronde "${round.title}": er staan geen "items" in (wat stond er op het bord?).`);
        const pr = r.practice;
        if (pr && pr.prompt) {
          const pItems = (pr.items || []).map((it) => (typeof it === 'string' ? { text: it, alt: [] } : it));
          add({ id: `${round.id}_oefen`, kind: 'memory', ...base, test: true, prompt: pr.prompt, items: pItems });
          practiced = true;
        }
        realStart();
        add({ id: `${round.id}_memory`, kind: 'memory', ...base, prompt: r.prompt || 'Schrijf zoveel mogelijk op van wat jullie je herinneren!', items });
        break;
      }
      case 'hitster': {
        if (r.dynamic) {
          // Extra muziekronde: de liedjes (en startkaarten) zoekt de bediening tijdens het spel op Spotify, per categorie
          round.dynamic = true; round.category = r.category || 'original';
          round.startIds = []; round.pool = []; round.practicePool = []; round.yearBonus = Number.isInteger(r.yearBonus) ? r.yearBonus : 1;
          for (let k = 0; k < 40; k++) add({ id: `${round.id}_song${k + 1}`, kind: 'song', ...base, slot: k + 1, dynamic: true });
          break;
        }
        // Extra muziekronde met een categorie: alleen liedjes uit die categorie (of dat decennium)
        const list = (r.songs || []).filter((s) => s && s.title && Number.isInteger(s.year)).filter((s) => isPractice(s) || inCategory(s, r.category));
        list.forEach((s, i) => { songs[`${round.id}_s${i + 1}`] = { id: `${round.id}_s${i + 1}`, key: `${s.title}|${s.artist || ''}`.toLowerCase(), title: s.title, artist: s.artist || '', year: s.year, category: s.category || null, audio: normalizeMedia(s.audio) ? { ...normalizeMedia(s.audio), kind: 'audio' } : null, start: !!s.start, practice: isPractice(s) }; });
        const all = Object.values(songs).filter((s) => s.id.startsWith(round.id + '_'));
        const playable = all.filter((s) => !s.practice);
        const wanted = Number.isInteger(r.startCards) ? r.startCards : 2;
        let starters;
        if (r.category) {
          // Vaste (maar per ronde andere) keuze, zodat de startkaarten niet veranderen als er later rondes bijkomen
          starters = [...playable].sort((a, b) => hashOf(round.id + a.key) - hashOf(round.id + b.key)).slice(0, wanted);
        } else {
          starters = playable.filter((s) => s.start);
          if (starters.length < wanted) starters = [...starters, ...playable.filter((s) => !s.start).slice(0, wanted - starters.length)];
          starters = starters.slice(0, wanted);
        }
        round.startIds = starters.map((s) => s.id);
        round.yearBonus = Number.isInteger(r.yearBonus) ? r.yearBonus : 1;
        round.practicePool = all.filter((s) => s.practice).map((s) => s.id);
        round.practicePool.forEach((_, k) => add({ id: `${round.id}_oefen${k + 1}`, kind: 'song', ...base, test: true, slot: k + 1 }));
        if (round.practicePool.length) practiced = true;
        realStart();
        // De volgorde is willekeurig: elke muziekvraag kiest bij het starten een nog niet gespeeld liedje uit de pool
        round.pool = playable.filter((s) => !round.startIds.includes(s.id)).map((s) => s.id);
        round.pool.forEach((_, k) => add({ id: `${round.id}_song${k + 1}`, kind: 'song', ...base, slot: k + 1 }));
        if (playable.length <= wanted + 3) warnings.push(`Ronde "${round.title}": te weinig liedjes${r.category ? ' in categorie ' + r.category : ''}.`);
        break;
      }
      case 'price': {
        round.agoYears = r.agoYears || 15;
        const mk = (it, i, test) => {
          if (!it || !it.name || !Number.isFinite(it.now) || !Number.isFinite(it.ago)) return warnings.push(`Prijsvraag ${i + 1} mist name, now of ago.`);
          add({ id: `${round.id}_${test ? 'oefen' : 'p'}${i + 1}`, kind: 'price', ...base, test, name: it.name, unit: it.unit || '', emoji: it.emoji || '🛒', now: it.now, ago: it.ago, agoYears: round.agoYears });
          if (test) practiced = true;
        };
        (r.items || []).filter(isPractice).forEach((it, i) => mk(it, i, true));
        realStart();
        (r.items || []).filter((it) => !isPractice(it)).forEach((it, i) => mk(it, i, false));
        break;
      }
      case 'draw': {
        const words = (r.words || []).map((w) => (typeof w === 'string' ? { word: w, alt: [] } : { word: w.word, alt: w.alt || [], practice: isPractice(w) })).filter((w) => w.word);
        // Oefenronde: de quizmaster tekent zelf in de bediening, iedereen kijkt mee en raadt hardop
        words.filter((w) => w.practice).forEach((w, i) => { add({ id: `${round.id}_demo${i + 1}`, kind: 'demo_draw', ...base, test: true, word: w.word }); practiced = true; });
        realStart();
        add({ id: `${round.id}_draw`, kind: 'draw', ...base, words: words.filter((w) => !w.practice) });
        break;
      }
      case 'thirty': {
        const norm5 = (c) => (Array.isArray(c) ? c : c && c.words) || [];
        const all = (r.cards || []).filter((c) => norm5(c).length >= 5);
        // Oefenronde: de quizmaster legt zelf uit, de quizmaster keurt live goed
        all.filter(isPractice).forEach((c, i) => { add({ id: `${round.id}_demo${i + 1}`, kind: 'demo_thirty', ...base, test: true, words: norm5(c).slice(0, 5).map(String), seconds: r.seconds || null }); practiced = true; });
        realStart();
        const cards = all.filter((c) => !isPractice(c)).map((c) => norm5(c).slice(0, 5).map(String));
        if (!cards.length) warnings.push(`Ronde "${round.title}": geen kaarten met 5 woorden.`);
        add({ id: `${round.id}_thirty`, kind: 'thirty', ...base, cards, seconds: r.seconds || null });
        break;
      }
    }
  });

  // ---- Joker en slotvraag ----
  const f = raw.final;
  if (f && Array.isArray(f.options) && f.options.length >= 2 && Number.isInteger(f.answer) && f.answer >= 0 && f.answer < f.options.length) {
    add({ id: 'final', kind: 'final', round: 'final', category: f.category || 'Slotvraag', question: f.question || '', options: f.options.map(String), answer: f.answer, media: normalizeMedia(f.media), explanation: f.explanation || null });
  } else {
    warnings.push('De slotvraag ("final") ontbreekt of is ongeldig (opties/answer).');
  }
  // Beslissingsvragen (open, getal): alleen gesteld als na de slotvraag teams gelijk staan op de eerste plaats
  (raw.tiebreakers || []).forEach((t, i) => {
    if (!t || !Number.isFinite(t.answer)) return warnings.push(`Beslissingsvraag ${i + 1} mist een getal als "answer".`);
    add({ id: `tiebreak_${i + 1}`, kind: 'tiebreak', round: 'final', question: t.question || '', unit: t.unit || '', answer: t.answer, explanation: t.explanation || null });
  });
  // Geen gelijke stand? Dan dit scherm in plaats van de beslissingsvraag
  if (f) add({ id: 'no_tie', kind: 'info', round: 'final', noTie: true, emoji: '⚖️', title: 'Geen gelijke stand', text: 'Er staan geen teams gelijk op de eerste plaats. De beslissingsvraag is dus niet nodig: op naar de ontknoping!' });
  const w = raw.welcome || {};
  const welcome = { emoji: w.emoji || '🎉', title: w.title || 'Welkom bij de familiequiz!', text: w.text || 'Pak je telefoon erbij, zoek je team en maak je klaar voor een avond vol vragen, muziek en tekenwerk.' };
  return { rounds, steps, songs, warnings, welcome };
}

module.exports = { loadContent, decadeOf, inCategory };
