// Leest questions.json en zet de hele quiz om in een lijst "stappen" (schermen) die de quizmaster
// een voor een doorloopt. Rondes zijn: meerkeuze (mc), fotoblur (blur), geheugen (memory),
// muziektijdlijn (hitster), prijzen (price), tekenen (draw), 30 seconds (thirty) en logo's (logo).
const fs = require('fs');

const DEFAULT_INTRO = {
  mc: 'Meerkeuzevragen. De basistelefoon dient het antwoord van het team in.',
  blur: 'Een foto wordt steeds scherper. Hoe eerder jullie het goede antwoord geven, hoe meer punten.',
  memory: 'Vorig jaar schreven we dingen op een bord. Schrijf er zoveel mogelijk op! De quizmaster keurt alles goed of fout.',
  hitster: 'Leg elk liedje op de juiste plek in jullie tijdlijn. De basistelefoon plaatst, de rest van het team denkt mee.',
  price: 'Schat de prijzen van tien boodschappen: wat kosten ze nu, en wat kostten ze vroeger? Wie het dichtstbij zit, krijgt de meeste punten.',
  draw: 'Eén teamlid tekent aan de tafel van de quizmaster, de rest van het team raadt mee op de telefoon.',
  thirty: 'Eén teamlid legt in 30 seconden vijf dingen uit aan het eigen team. De quizmaster keurt de antwoorden goed.',
  logo: 'Welk logo zien we hier? Er ontbreken stukjes!'
};

function normalizeMedia(media) {
  if (!media) return null;
  const m = typeof media === 'string' ? { kind: 'image', src: media } : { kind: 'image', ...media };
  if (!m.src) return null;
  if (!/^(https?:)?\/\//i.test(m.src) && !m.src.startsWith('/')) m.src = '/media/' + m.src.replace(/^\.?\/+/, '');
  return m;
}

function loadContent(file) {
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
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

  // ---- Rondes ----
  (raw.rounds || []).forEach((r, ri) => {
    const round = {
      id: r.id || `r${ri + 1}`, no: ri + 1, type: r.type, title: r.title || `Ronde ${ri + 1}`,
      points: Number.isInteger(r.points) ? r.points : null, intro: r.intro || DEFAULT_INTRO[r.type] || ''
    };
    if (!DEFAULT_INTRO[round.type]) {
      warnings.push(`Ronde "${round.title}" heeft een onbekend type "${round.type}" en wordt overgeslagen.`);
      return;
    }
    rounds.push(round);
    add({ id: `${round.id}_intro`, kind: 'info', round: round.id, roundIntro: true, emoji: r.emoji || '🎯', title: `Ronde ${round.no}: ${round.title}`, text: round.intro });

    const base = { round: round.id };
    switch (round.type) {
      case 'mc':
        (r.categories || [{ name: '', questions: r.questions || [] }]).forEach((cat, ci) => {
          (cat.questions || []).forEach((q, qi) => mcStep(q, { ...base, category: cat.name || '', idPrefix: `${round.id}_c${ci + 1}_`, n: qi + 1 }));
        });
        break;
      case 'blur':
        if (r.test) {
          mcStep(r.test, { ...base, variant: 'blur', test: true, category: 'Testvraag', idPrefix: `${round.id}_test_`, n: 1 });
          add({ id: `${round.id}_real`, kind: 'info', round: round.id, emoji: '📸', title: 'Nu de echte foto\'s!', text: 'De testvraag is voorbij. Vanaf nu tellen de punten mee.' });
        }
        (r.questions || []).forEach((q, i) => mcStep(q, { ...base, variant: 'blur', idPrefix: `${round.id}_`, n: i + 1 }));
        break;
      case 'logo':
        (r.questions || []).forEach((q, i) =>
          mcStep(q, { ...base, variant: 'logo', hide: typeof r.hide === 'number' ? r.hide : 0.5, idPrefix: `${round.id}_`, n: i + 1 }));
        break;
      case 'memory': {
        const items = (r.items || []).map((it) => (typeof it === 'string' ? { text: it, alt: [] } : { text: it.text, alt: it.alt || [] })).filter((it) => it.text);
        if (!items.length) warnings.push(`Ronde "${round.title}": er staan geen "items" in (wat stond er op het bord?).`);
        add({ id: `${round.id}_memory`, kind: 'memory', ...base, prompt: r.prompt || 'Schrijf zoveel mogelijk op van wat jullie je herinneren!', items, seconds: r.seconds || null });
        break;
      }
      case 'hitster': {
        const list = (r.songs || []).filter((s) => s && s.title && Number.isInteger(s.year));
        list.forEach((s, i) => { songs[`${round.id}_s${i + 1}`] = { id: `${round.id}_s${i + 1}`, title: s.title, artist: s.artist || '', year: s.year, audio: normalizeMedia(s.audio) ? { ...normalizeMedia(s.audio), kind: 'audio' } : null, start: !!s.start }; });
        const all = Object.values(songs).filter((s) => s.id.startsWith(round.id + '_'));
        let starters = all.filter((s) => s.start);
        const wanted = Number.isInteger(r.startCards) ? r.startCards : 2;
        if (starters.length < wanted) starters = [...starters, ...all.filter((s) => !s.start).slice(0, wanted - starters.length)];
        starters = starters.slice(0, wanted);
        round.startIds = starters.map((s) => s.id);
        all.filter((s) => !round.startIds.includes(s.id)).forEach((s) => add({ id: `${round.id}_${s.id}`, kind: 'song', ...base, songId: s.id }));
        if (all.length <= wanted) warnings.push(`Ronde "${round.title}": te weinig liedjes.`);
        break;
      }
      case 'price':
        (r.items || []).forEach((it, i) => {
          if (!it || !it.name || !Number.isFinite(it.now) || !Number.isFinite(it.ago)) return warnings.push(`Prijsvraag ${i + 1} mist name, now of ago.`);
          add({ id: `${round.id}_p${i + 1}`, kind: 'price', ...base, name: it.name, unit: it.unit || '', emoji: it.emoji || '🛒', now: it.now, ago: it.ago, agoYears: r.agoYears || 15 });
        });
        round.agoYears = r.agoYears || 15;
        break;
      case 'draw': {
        const words = (r.words || []).map((w) => (typeof w === 'string' ? { word: w, alt: [] } : { word: w.word, alt: w.alt || [] })).filter((w) => w.word);
        add({ id: `${round.id}_draw`, kind: 'draw', ...base, words, seconds: r.seconds || null });
        break;
      }
      case 'thirty': {
        const cards = (r.cards || []).filter((c) => Array.isArray(c) && c.length >= 5).map((c) => c.slice(0, 5).map(String));
        if (!cards.length) warnings.push(`Ronde "${round.title}": geen kaarten met 5 woorden.`);
        add({ id: `${round.id}_thirty`, kind: 'thirty', ...base, cards, seconds: r.seconds || null });
        break;
      }
    }
    add({ id: `${round.id}_result`, kind: 'roundresult', ...base });
  });

  // ---- Joker en slotvraag ----
  add({ id: 'joker', kind: 'joker', round: 'joker' });
  const f = raw.final;
  if (f && Array.isArray(f.options) && Number.isInteger(f.answer)) {
    add({ id: 'final', kind: 'final', round: 'final', category: f.category || 'Slotvraag', question: f.question || '', options: f.options.map(String), answer: f.answer, media: normalizeMedia(f.media), explanation: f.explanation || null });
  } else {
    warnings.push('De slotvraag ("final") ontbreekt of is ongeldig.');
  }
  return { rounds, steps, songs, warnings };
}

module.exports = { loadContent };
