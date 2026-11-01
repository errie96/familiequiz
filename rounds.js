'use strict';
// Server-kant van alle rondetypes. Elk type is één object met (optionele) methodes:
//   prep, max, enter, view, submit, event, action, next, label, check, timeUp, force,
//   score, done, answered, progress, result, fetch
// De motor (server.js) roept ze aan; hier staat alleen de spel-logica per rondetype.
// Een nieuw rondetype toevoegen = hier een object maken, bij H registreren en in public/rounds-ui.js tekenen.

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const toNum = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const euro = (n) => '€ ' + Number(n).toFixed(2).replace('.', ',');
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

module.exports = function createHandlers(E) {
  const H = {};
  const answeredBy = (step) => (t) => t.answers[step.sid] !== undefined;
  const allAnswered = (step) => { const a = E.active(); return a.length > 0 && a.every(answeredBy(step)); };
  const progressByAnswers = (step) => {
    const a = E.active();
    return { done: a.filter(answeredBy(step)).length, total: a.length, waiting: a.filter((t) => !answeredBy(step)(t)).map((t) => t.name) };
  };
  const waitMsg = (step) => { const w = progressByAnswers(step).waiting; return { error: w.length ? `Wacht nog op: ${w.join(', ')}.` : 'Wacht tot alle teams hebben geantwoord.' }; };
  const letterText = (it, v) => `${LETTERS[v] || v + 1}: ${it.options[v]}`;
  const sortedTeams = () => E.teams().sort(E.byName);
  const validChoice = (it) => it && typeof it.question === 'string' && Array.isArray(it.options) && it.options.length >= 2 &&
    Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length;

  // ---------------------------------------------------------------- info
  H.info = {
    done: () => true,
    score: () => ({ points: 0, max: 0 }),
    view: (step) => ({ key: step.sid, ...step.item }),
    label: () => ({ label: 'Volgende ➡️' }),
    next: () => 'step'
  };

  // ---------------------------------------------------------------- einde van een ronde: punten van deze ronde
  H.round_end = {
    done: () => true,
    score: () => ({ points: 0, max: 0 }),
    view(step, ss, who) {
      const table = E.roundTable(step.roundIdx);
      const v = { key: step.sid, roundName: table.name, points: table.points, rows: table.rows };
      if (who.role === 'phone') v.mine = table.rows.find((r) => r.teamId === who.team.teamId) || null;
      return v;
    },
    label: () => ({ label: 'Volgende ➡️' }),
    next: () => 'step'
  };

  // ---------------------------------------------------------------- nakijken (hergebruikt het resultaat van een vraag)
  H.review = {
    done: () => true,
    score: () => ({ points: 0, max: 0 }),
    view(step, ss, who) {
      const ref = E.step(step.ref);
      const result = E.handler(ref).result(ref, E.ss(ref));
      return { key: step.sid, result: who.role === 'phone' ? null : result, text: 'Kijk naar het tv-scherm.' };
    },
    label: () => ({ label: 'Volgende ➡️' }),
    next: () => 'step'
  };

  // ---------------------------------------------------------------- meerkeuze (ook geluid en locatie)
  const mc = {
    reopenable: true,
    prep: (it) => (validChoice(it) ? it : null),
    max: (it) => it.points ?? 1,
    enter(step, ss) {
      if (!ss.phase) ss.phase = 'open';
      if (ss.phase === 'open' && E.settings().timerEnabled && E.timer.sid() !== step.sid) {
        const secs = step.item.time ?? E.settings().defaultTime;
        if (secs > 0) E.timer.start(step.sid, secs * 1000);
      }
    },
    close(step, ss) { ss.phase = step.revealNow ? 'result' : 'closed'; E.timer.clear(); },
    check(step, ss) { if (ss.phase === 'open' && allAnswered(step)) mc.close(step, ss); },
    timeUp(step, ss) { if (ss.phase === 'open') mc.close(step, ss); },
    force(step, ss) { mc.close(step, ss); },
    reopen(step, ss) { ss.phase = 'open'; },
    done: (step, ss) => ss.phase === 'closed' || ss.phase === 'result',
    answered: (step, ss, t) => answeredBy(step)(t),
    progress: (step) => progressByAnswers(step),
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'open') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      const v = p && p.answer;
      if (!Number.isInteger(v) || v < 0 || v >= step.item.options.length) return { ok: false, reason: 'invalid' };
      if (answeredBy(step)(team)) return { ok: true, already: true };
      team.answers[step.sid] = v;
      return { ok: true };
    },
    score(step, ss, team) {
      const pts = step.item.points ?? 1;
      return { points: team.answers[step.sid] === step.item.answer ? pts : 0, max: pts };
    },
    result(step) {
      const it = step.item;
      return {
        question: it.question, category: it.category || null, explanation: it.explanation || null,
        media: it.media ? { ...it.media, hide: null } : null, options: it.options, answer: it.answer,
        correctText: letterText(it, it.answer),
        rows: sortedTeams().map((t) => {
          const v = t.answers[step.sid];
          return { teamId: t.teamId, name: t.name, text: v === undefined ? 'geen antwoord' : letterText(it, v),
            mark: v === undefined ? 'none' : v === it.answer ? 'ok' : 'bad' };
        })
      };
    },
    view(step, ss, who) {
      const it = step.item;
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase, question: it.question, options: it.options, media: it.media, category: it.category || null };
      if (who.role === 'phone') {
        if (v.media && v.media.kind === 'audio') v.media = null; // geluid komt van het tv-scherm
        const given = who.team.answers[step.sid];
        v.isBase = who.isBase;
        v.given = given === undefined ? null : given;
        if (ss.phase === 'result') {
          const r = mc.result(step);
          v.mine = (r.rows.find((x) => x.teamId === who.team.teamId) || {}).mark || null;
          v.correctText = r.correctText;
        }
      } else {
        if (who.role === 'host') v.answer = it.answer;
        if (ss.phase === 'result') v.result = mc.result(step);
      }
      return v;
    },
    next: (step, ss) => (ss.phase === 'open' ? waitMsg(step) : 'step'),
    label: (step, ss) => (ss.phase === 'open' ? { label: '⏳ Wachten op de teams...', disabled: true } : { label: 'Volgende ➡️' })
  };
  H.mc = mc;
  H.logo = { ...mc, prep: (it) => (validChoice(it) && it.media && it.media.kind === 'image' ? it : null) };

  // ---------------------------------------------------------------- foto blur
  const DEFAULT_LEVEL_POINTS = [10, 8, 6, 4, 2, 1];
  H.blur = {
    reopenable: true,
    prep(it, round) {
      if (!validChoice(it) || !it.media || it.media.kind !== 'image') return null;
      const lp = Array.isArray(it.levelPoints) && it.levelPoints.length > 1 ? it.levelPoints : (round.raw.levelPoints || DEFAULT_LEVEL_POINTS);
      it.levelPoints = lp.map(Number);
      return it;
    },
    max: (it) => it.levelPoints[0],
    enter(step, ss) { if (!ss.phase) { ss.phase = 'open'; ss.level = 0; } },
    check(step, ss) { if (ss.phase === 'open' && allAnswered(step)) ss.phase = 'result'; },
    force(step, ss) { ss.phase = 'result'; },
    reopen(step, ss) { ss.phase = 'open'; },
    done: (step, ss) => ss.phase === 'result',
    answered: (step, ss, t) => answeredBy(step)(t),
    progress: (step) => progressByAnswers(step),
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'open') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      const v = p && p.answer;
      if (!Number.isInteger(v) || v < 0 || v >= step.item.options.length) return { ok: false, reason: 'invalid' };
      if (answeredBy(step)(team)) return { ok: true, already: true };
      team.answers[step.sid] = { value: v, level: ss.level };
      return { ok: true };
    },
    score(step, ss, team) {
      const a = team.answers[step.sid];
      const lp = step.item.levelPoints;
      return { points: a && a.value === step.item.answer ? lp[Math.min(a.level, lp.length - 1)] : 0, max: lp[0] };
    },
    clearer(step, ss) {
      if (ss.phase !== 'open') return;
      if (ss.level < step.item.levelPoints.length - 1) ss.level++;
      else ss.phase = 'result';
    },
    action(step, ss, type) {
      if (type === 'clearer') H.blur.clearer(step, ss);
      else if (type === 'reveal') ss.phase = 'result';
    },
    next(step, ss) {
      if (ss.phase === 'open') { H.blur.clearer(step, ss); return 'stay'; }
      return 'step';
    },
    label(step, ss) {
      if (ss.phase !== 'open') return { label: 'Volgende ➡️' };
      const L = step.item.levelPoints.length;
      return ss.level < L - 1 ? { label: `🔍 Duidelijker maken (${ss.level + 1}/${L})` } : { label: '✅ Toon het antwoord' };
    },
    result(step) {
      const it = step.item;
      return {
        question: it.question, explanation: it.explanation || null, media: it.media, options: it.options, answer: it.answer,
        correctText: letterText(it, it.answer), sharp: true,
        rows: sortedTeams().map((t) => {
          const a = t.answers[step.sid];
          const pts = H.blur.score(step, null, t).points;
          return { teamId: t.teamId, name: t.name, points: pts,
            text: !a ? 'geen antwoord' : `${letterText(it, a.value)}  (bij stap ${a.level + 1})`,
            mark: !a ? 'none' : a.value === it.answer ? 'ok' : 'bad' };
        })
      };
    },
    view(step, ss, who) {
      const it = step.item;
      const L = it.levelPoints.length;
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase, question: it.question, options: it.options, media: it.media,
        level: ss.phase === 'result' ? L - 1 : ss.level, levels: L, pointsNow: it.levelPoints[Math.min(ss.level, L - 1)] };
      if (who.role === 'phone') {
        const a = who.team.answers[step.sid];
        v.isBase = who.isBase;
        v.given = a ? a.value : null;
        if (ss.phase === 'result') {
          const r = H.blur.result(step);
          v.mine = (r.rows.find((x) => x.teamId === who.team.teamId) || {}).mark || null;
          v.correctText = r.correctText;
        }
      } else {
        if (who.role === 'host') v.answer = it.answer;
        if (ss.phase === 'result') v.result = H.blur.result(step);
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- geheugen: teams schrijven op, de quizmaster keurt goed of fout
  const MEM_MAX_LINES = 60;
  H.memory = {
    prep(it) { return it && typeof it.prompt === 'string' ? it : null; },
    max: (it) => Math.max(1, it.total || (it.key || []).length || 10),
    enter(step, ss) {
      if (!ss.phase) { ss.phase = 'writing'; ss.done = {}; }
      if (ss.phase === 'writing' && step.item.time > 0 && E.timer.sid() !== step.sid) E.timer.start(step.sid, step.item.time * 1000);
    },
    lines: (step, team) => team.answers[step.sid] || [],
    check(step, ss) {
      if (ss.phase !== 'writing') return;
      const a = E.active();
      if (a.length && a.every((t) => ss.done[t.teamId])) { ss.phase = 'judging'; E.timer.clear(); }
    },
    timeUp(step, ss) { if (ss.phase === 'writing') ss.phase = 'judging'; },
    force(step, ss) { ss.phase = 'result'; E.timer.clear(); },
    done: (step, ss) => ss.phase === 'result',
    answered: (step, ss, t) => !!(ss.done && ss.done[t.teamId]),
    progress(step, ss) {
      const a = E.active();
      return { done: a.filter((t) => ss.done && ss.done[t.teamId]).length, total: a.length, waiting: a.filter((t) => !(ss.done && ss.done[t.teamId])).map((t) => t.name) };
    },
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'writing') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      const lines = (team.answers[step.sid] = team.answers[step.sid] || []);
      if (p.op === 'add') {
        const text = E.cleanText(p.text, 80);
        if (!text) return { ok: false, reason: 'invalid' };
        if (lines.length >= MEM_MAX_LINES) return { ok: false, reason: 'too_many' };
        lines.push({ t: text, ok: null });
        ss.done[team.teamId] = false;
      } else if (p.op === 'remove' && Number.isInteger(p.i) && lines[p.i]) {
        lines.splice(p.i, 1);
      } else if (p.op === 'done') {
        ss.done[team.teamId] = !!p.value;
      } else return { ok: false, reason: 'invalid' };
      return { ok: true };
    },
    action(step, ss, type, p) {
      if (type === 'judge' && ss.phase !== 'writing') {
        const team = E.team(p.teamId);
        const line = team && (team.answers[step.sid] || [])[p.i];
        if (line) line.ok = p.ok === true ? true : p.ok === false ? false : null;
      } else if (type === 'judge_all' && ss.phase !== 'writing') {
        const team = E.team(p.teamId);
        if (team) (team.answers[step.sid] || []).forEach((l) => { l.ok = p.ok === true; });
      }
    },
    next(step, ss) {
      if (ss.phase === 'writing') { ss.phase = 'judging'; E.timer.clear(); return 'stay'; }
      if (ss.phase === 'judging') { ss.phase = 'result'; return 'stay'; }
      return 'step';
    },
    label(step, ss) {
      return ss.phase === 'writing' ? { label: '⏹️ Stop met schrijven' } : ss.phase === 'judging' ? { label: '📣 Toon de uitslag' } : { label: 'Volgende ➡️' };
    },
    score(step, ss, team) {
      const max = H.memory.max(step.item);
      const n = H.memory.lines(step, team).filter((l) => l.ok === true).length;
      return { points: Math.min(n, max), max };
    },
    result(step) {
      return {
        question: step.item.prompt, correctText: (step.item.key || []).length ? (step.item.key || []).join(' · ') : null,
        rows: sortedTeams().map((t) => {
          const lines = H.memory.lines(step, t);
          const n = lines.filter((l) => l.ok === true).length;
          return { teamId: t.teamId, name: t.name, points: n, text: `${n} goed`, mark: null,
            lines: lines.map((l) => ({ text: l.t, mark: l.ok === true ? 'ok' : l.ok === false ? 'bad' : 'none' })) };
        })
      };
    },
    view(step, ss, who) {
      const it = step.item;
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase, prompt: it.prompt, total: H.memory.max(it) };
      if (who.role === 'phone') {
        v.isBase = who.isBase;
        v.lines = H.memory.lines(step, who.team).map((l) => l.t);
        v.done = !!(ss.done && ss.done[who.team.teamId]);
        if (ss.phase === 'result') v.result = H.memory.result(step);
      } else {
        v.counts = sortedTeams().map((t) => ({ name: t.name, n: H.memory.lines(step, t).length, done: !!(ss.done && ss.done[t.teamId]) }));
        if (who.role === 'host') {
          v.key_list = it.key || [];
          if (ss.phase !== 'writing') v.judging = sortedTeams().map((t) => ({ teamId: t.teamId, name: t.name, lines: H.memory.lines(step, t).map((l) => ({ t: l.t, ok: l.ok })) }));
        }
        if (ss.phase === 'result') v.result = H.memory.result(step);
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- prijzen van vroeger
  const priceFields = ['now', 'then'];
  function pricePoints(step, field) {
    const it = step.item;
    const given = E.teams().filter((t) => t.answers[step.sid] && Number.isFinite(t.answers[step.sid][field]));
    const err = (t) => Math.abs(t.answers[step.sid][field] - it[field]);
    const out = {};
    given.forEach((t) => {
      const rank = given.filter((o) => err(o) < err(t) - 1e-9).length;
      out[t.teamId] = Math.round((it.maxPer * (given.length - rank)) / given.length);
    });
    return out;
  }
  H.prices = {
    reopenable: true,
    prep(it, round) {
      if (!it || !it.product || toNum(it.now) === null || toNum(it.then) === null) return null;
      it.now = toNum(it.now); it.then = toNum(it.then);
      it.maxPer = Number.isInteger(it.maxPer) ? it.maxPer : (round.raw.maxPer || 5);
      it.question = `${it.product}${it.unit ? ' (' + it.unit + ')' : ''}`;
      it.years = round.raw.yearsAgo || 15;
      return it;
    },
    max: (it) => it.maxPer * 2,
    enter(step, ss) { if (!ss.phase) ss.phase = 'open'; },
    check(step, ss) { if (ss.phase === 'open' && allAnswered(step)) ss.phase = 'result'; },
    force(step, ss) { ss.phase = 'result'; },
    reopen(step, ss) { ss.phase = 'open'; },
    done: (step, ss) => ss.phase === 'result',
    answered: (step, ss, t) => answeredBy(step)(t),
    progress: (step) => progressByAnswers(step),
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'open') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      const now = toNum(p && p.now), then = toNum(p && p.then);
      if (now === null || then === null || now < 0 || then < 0 || now > 100000 || then > 100000) return { ok: false, reason: 'invalid' };
      if (answeredBy(step)(team)) return { ok: true, already: true };
      team.answers[step.sid] = { now, then };
      return { ok: true };
    },
    score(step, ss, team) {
      let points = 0;
      if (team.answers[step.sid]) priceFields.forEach((f) => { points += pricePoints(step, f)[team.teamId] || 0; });
      return { points, max: step.item.maxPer * 2 };
    },
    result(step) {
      const it = step.item;
      const pn = pricePoints(step, 'now'), pt = pricePoints(step, 'then');
      return {
        question: it.question, correctText: `Nu ${euro(it.now)}  ·  ${it.years} jaar geleden ${euro(it.then)}`,
        rows: sortedTeams().map((t) => {
          const a = t.answers[step.sid];
          return { teamId: t.teamId, name: t.name, mark: null, points: (pn[t.teamId] || 0) + (pt[t.teamId] || 0),
            text: a ? `Nu ${euro(a.now)} (${pn[t.teamId] || 0} pt)  ·  Toen ${euro(a.then)} (${pt[t.teamId] || 0} pt)` : 'geen antwoord' };
        })
      };
    },
    next: (step, ss) => (ss.phase === 'open' ? waitMsg(step) : 'step'),
    label: (step, ss) => (ss.phase === 'open' ? { label: '⏳ Wachten op de teams...', disabled: true } : { label: 'Volgende ➡️' }),
    view(step, ss, who) {
      const it = step.item;
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase, product: it.product, unit: it.unit || null, years: it.years, media: it.media || null };
      if (who.role === 'phone') {
        const a = who.team.answers[step.sid];
        v.isBase = who.isBase; v.given = a || null;
        if (ss.phase === 'result') v.result = H.prices.result(step);
      } else {
        if (who.role === 'host') { v.actual = { now: it.now, then: it.then }; }
        if (ss.phase === 'result') v.result = H.prices.result(step);
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- tekenen
  const DRAW_MAX_POINTS = 20000;
  H.draw = {
    roundItems: (r) => [{ id: 'draw', words: Array.isArray(r.words) ? r.words : [], time: r.time || 75 }],
    prep(it) {
      it.words = (it.words || []).map((w) => (typeof w === 'string' ? { word: w, alt: [] } : { word: String(w.word || ''), alt: (w.alt || []).map(String) })).filter((w) => w.word);
      return it.words.length ? it : null;
    },
    max: () => 0,
    prepare(step, ss) {
      ss.cur = {};
      sortedTeams().forEach((t) => {
        const d = E.devicesOf(t)[ss.turn];
        if (!d) return;
        const w = ss.pool[ss.wi++ % ss.pool.length];
        ss.cur[t.teamId] = { drawerId: d.deviceId, drawerLabel: d.label, word: w.word, alt: w.alt, strokes: [], guessed: [] };
      });
    },
    enter(step, ss) {
      if (ss.phase) return;
      const teams = E.teams();
      ss.pool = shuffle(step.item.words); ss.wi = 0; ss.turn = 0; ss.points = {}; ss.maxByTeam = {};
      ss.turns = Math.max(1, ...teams.map((t) => E.devicesOf(t).length));
      teams.forEach((t) => { const n = E.devicesOf(t).length; ss.maxByTeam[t.teamId] = n * Math.max(0, n - 1); });
      H.draw.prepare(step, ss);
      ss.phase = 'ready';
    },
    pending(ss) {
      let n = 0;
      Object.entries(ss.cur || {}).forEach(([tid, c]) => {
        const team = E.team(tid);
        if (!team) return;
        n += E.devicesOf(team).filter((d) => d.connected && d.deviceId !== c.drawerId && !c.guessed.includes(d.deviceId)).length;
      });
      return n;
    },
    endTurn(ss) { ss.phase = 'turn_end'; E.timer.clear(); },
    check(step, ss) { if (ss.phase === 'drawing' && H.draw.pending(ss) === 0) H.draw.endTurn(ss); },
    timeUp(step, ss) { if (ss.phase === 'drawing') H.draw.endTurn(ss); },
    force(step, ss) { ss.phase = 'result'; E.timer.clear(); },
    done: (step, ss) => ss.phase === 'result',
    progress(step, ss) {
      if (ss.phase !== 'drawing') return null;
      return { done: 0, total: 0, waiting: [], text: `${H.draw.pending(ss)} spelers moeten nog raden` };
    },
    submit(step, ss, team, device, p) {
      const c = ss.cur && ss.cur[team.teamId];
      if (ss.phase !== 'drawing' || !c) return { ok: false, reason: 'not_open' };
      if (c.drawerId === device.deviceId) return { ok: false, reason: 'drawer' };
      if (c.guessed.includes(device.deviceId)) return { ok: true, already: true, correct: true };
      const g = norm(p && p.guess);
      if (!g) return { ok: false, reason: 'invalid' };
      const correct = [c.word, ...c.alt].some((w) => norm(w) === g);
      if (correct) {
        c.guessed.push(device.deviceId);
        ss.points[team.teamId] = (ss.points[team.teamId] || 0) + 1;
      }
      return { ok: true, correct };
    },
    event(step, ss, team, device, type, p) {
      const c = ss.cur && ss.cur[team.teamId];
      if (ss.phase !== 'drawing' || !c || c.drawerId !== device.deviceId) return;
      if (type === 'clear') {
        c.strokes = [];
        E.toTeam(team, 'step_event_in', { sid: step.sid, turn: ss.turn, type: 'clear' }, device.deviceId);
      } else if (type === 'stroke' && p && Array.isArray(p.p)) {
        const total = c.strokes.reduce((n, s) => n + s.p.length, 0);
        if (total > DRAW_MAX_POINTS) return;
        const pts = p.p.slice(0, 200).map((q) => [Math.min(1, Math.max(0, +q[0] || 0)), Math.min(1, Math.max(0, +q[1] || 0))]);
        let s = c.strokes.find((x) => x.id === p.id);
        if (!s) { s = { id: String(p.id).slice(0, 20), c: String(p.c || '#ffffff').slice(0, 9), w: Math.min(24, Math.max(1, +p.w || 4)), p: [] }; c.strokes.push(s); }
        s.p.push(...pts);
        E.toTeam(team, 'step_event_in', { sid: step.sid, turn: ss.turn, type: 'stroke', data: { id: s.id, c: s.c, w: s.w, p: pts } }, device.deviceId);
      }
    },
    fetch(step, ss, team) { const c = ss.cur && ss.cur[team.teamId]; return { strokes: c ? c.strokes : [], turn: ss.turn }; },
    next(step, ss) {
      if (ss.phase === 'ready') { ss.phase = 'drawing'; E.timer.start(step.sid, step.item.time * 1000); return 'stay'; }
      if (ss.phase === 'drawing') { H.draw.endTurn(ss); return 'stay'; }
      if (ss.phase === 'turn_end') {
        if (ss.turn + 1 < ss.turns) { ss.turn++; H.draw.prepare(step, ss); ss.phase = 'ready'; } else ss.phase = 'result';
        return 'stay';
      }
      return 'step';
    },
    label(step, ss) {
      if (ss.phase === 'ready') return { label: `▶️ Start tekenbeurt ${ss.turn + 1} van ${ss.turns}` };
      if (ss.phase === 'drawing') return { label: '⏹️ Beurt afsluiten' };
      if (ss.phase === 'turn_end') return { label: ss.turn + 1 < ss.turns ? 'Volgende tekenbeurt ➡️' : '🏁 Tekenronde afronden' };
      return { label: 'Volgende ➡️' };
    },
    score(step, ss, team) {
      const n = E.devicesOf(team).length;
      return { points: (ss.points && ss.points[team.teamId]) || 0, max: ss.maxByTeam && ss.maxByTeam[team.teamId] !== undefined ? ss.maxByTeam[team.teamId] : n * Math.max(0, n - 1) };
    },
    teamsView(ss, withWord) {
      return sortedTeams().map((t) => {
        const c = ss.cur && ss.cur[t.teamId];
        const r = { teamId: t.teamId, name: t.name, drawer: c ? c.drawerLabel : null, guessed: c ? c.guessed.length : 0, points: (ss.points && ss.points[t.teamId]) || 0 };
        if (withWord && c) r.word = c.word;
        return r;
      });
    },
    view(step, ss, who) {
      const v = { key: `${step.sid}:${ss.turn}:${ss.phase}`, phase: ss.phase, turn: ss.turn + 1, turns: ss.turns, time: step.item.time };
      if (who.role === 'phone') {
        const c = ss.cur && ss.cur[who.team.teamId];
        v.me = !c ? 'idle' : c.drawerId === who.device.deviceId ? 'drawer' : 'guesser';
        v.drawerLabel = c ? c.drawerLabel : null;
        if (c && v.me === 'drawer' && ss.phase === 'drawing') v.word = c.word;
        if (c && ss.phase === 'turn_end') v.word = c.word;
        v.guessedMe = !!(c && c.guessed.includes(who.device.deviceId));
        v.guessedCount = c ? c.guessed.length : 0;
        v.points = (ss.points && ss.points[who.team.teamId]) || 0;
      } else {
        const showWords = who.role === 'host' || ss.phase === 'turn_end' || ss.phase === 'result';
        v.teams = H.draw.teamsView(ss, showWords);
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- 30 seconds
  H.thirty = {
    roundItems: (r) => [{ id: 'thirty', cards: (r.cards || []).filter((c) => Array.isArray(c) && c.length).map((c) => c.slice(0, 5).map(String)), time: r.time || 30 }],
    prep: (it) => (it.cards.length ? it : null),
    max: () => 0,
    words(step, ss) { return ss.pool[ss.turn % ss.pool.length]; },
    enter(step, ss) {
      if (ss.phase) return;
      const teams = sortedTeams();
      const maxN = Math.max(0, ...teams.map((t) => E.devicesOf(t).length));
      ss.order = [];
      for (let k = 0; k < maxN; k++) teams.forEach((t) => { const d = E.devicesOf(t)[k]; if (d) ss.order.push({ teamId: t.teamId, deviceId: d.deviceId, label: d.label }); });
      ss.maxByTeam = {}; ss.points = {};
      teams.forEach((t) => { ss.maxByTeam[t.teamId] = E.devicesOf(t).length * 5; });
      ss.pool = shuffle(step.item.cards); ss.turn = 0; ss.turns = ss.order.length;
      ss.marks = [false, false, false, false, false];
      ss.phase = ss.turns ? 'ready' : 'result';
    },
    toJudge(ss) { ss.phase = 'judge'; E.timer.clear(); },
    timeUp(step, ss) { if (ss.phase === 'running') H.thirty.toJudge(ss); },
    force(step, ss) { ss.phase = 'result'; E.timer.clear(); },
    done: (step, ss) => ss.phase === 'result',
    finishTurn(step, ss) {
      const cur = ss.order[ss.turn];
      if (cur) ss.points[cur.teamId] = (ss.points[cur.teamId] || 0) + ss.marks.filter(Boolean).length;
      ss.turn++; ss.marks = [false, false, false, false, false];
      ss.phase = ss.turn < ss.turns ? 'ready' : 'result';
    },
    action(step, ss, type, p) {
      if (type === 'mark' && (ss.phase === 'running' || ss.phase === 'judge') && Number.isInteger(p.i) && p.i >= 0 && p.i < 5) ss.marks[p.i] = !!p.ok;
      else if (type === 'skip_turn' && ss.phase !== 'result') { ss.marks = [false, false, false, false, false]; ss.turn++; E.timer.clear(); ss.phase = ss.turn < ss.turns ? 'ready' : 'result'; }
    },
    next(step, ss) {
      if (ss.phase === 'ready') { ss.phase = 'running'; E.timer.start(step.sid, step.item.time * 1000); return 'stay'; }
      if (ss.phase === 'running') { H.thirty.toJudge(ss); return 'stay'; }
      if (ss.phase === 'judge') { H.thirty.finishTurn(step, ss); return 'stay'; }
      return 'step';
    },
    label(step, ss) {
      if (ss.phase === 'ready') return { label: `▶️ Start beurt ${ss.turn + 1} van ${ss.turns}` };
      if (ss.phase === 'running') return { label: '⏹️ Tijd is om, nakijken' };
      if (ss.phase === 'judge') return { label: ss.turn + 1 < ss.turns ? '✔️ Opslaan en volgende beurt ➡️' : '✔️ Opslaan en afronden' };
      return { label: 'Volgende ➡️' };
    },
    score(step, ss, team) {
      return { points: (ss.points && ss.points[team.teamId]) || 0, max: ss.maxByTeam && ss.maxByTeam[team.teamId] !== undefined ? ss.maxByTeam[team.teamId] : E.devicesOf(team).length * 5 };
    },
    view(step, ss, who) {
      const cur = ss.order && ss.order[ss.turn];
      const v = { key: `${step.sid}:${ss.turn}:${ss.phase}`, phase: ss.phase, turn: ss.turn + 1, turns: ss.turns, time: step.item.time,
        teamName: cur ? (E.team(cur.teamId) || {}).name : null, explainer: cur ? cur.label : null, marksCount: ss.marks ? ss.marks.filter(Boolean).length : 0,
        scores: sortedTeams().map((t) => ({ name: t.name, points: (ss.points && ss.points[t.teamId]) || 0 })) };
      const words = cur ? H.thirty.words(step, ss) : [];
      if (who.role === 'phone') {
        v.me = cur && cur.deviceId === who.device.deviceId ? 'explainer' : cur && cur.teamId === who.team.teamId ? 'guesser' : 'other';
        if (v.me === 'explainer' && (ss.phase === 'running' || ss.phase === 'judge')) { v.words = words; v.marks = ss.marks; }
      } else if (who.role === 'host') { v.words = words; v.marks = ss.marks; }
      else if (ss.phase === 'judge') { v.words = words; v.marks = ss.marks; }
      return v;
    }
  };

  // ---------------------------------------------------------------- slotvraag met inzet
  H.final = {
    reopenable: true,
    prep: (it) => (validChoice(it) ? it : null),
    max: () => 0,
    enter(step, ss) { if (!ss.phase) ss.phase = 'open'; },
    check(step, ss) { if (ss.phase === 'open' && allAnswered(step)) ss.phase = 'result'; },
    force(step, ss) { ss.phase = 'result'; },
    reopen(step, ss) { ss.phase = 'open'; },
    done: (step, ss) => ss.phase === 'result',
    answered: (step, ss, t) => answeredBy(step)(t),
    progress: (step) => progressByAnswers(step),
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'open') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      const total = E.totalBefore(team);
      if (!Number.isInteger(p && p.answer) || p.answer < 0 || p.answer >= step.item.options.length) return { ok: false, reason: 'invalid' };
      if (!Number.isInteger(p.wager) || p.wager < 0 || p.wager > total) return { ok: false, reason: 'bad_wager' };
      if (answeredBy(step)(team)) return { ok: true, already: true };
      team.answers[step.sid] = { answer: p.answer, wager: p.wager };
      return { ok: true };
    },
    score(step, ss, team) {
      const a = team.answers[step.sid];
      return { points: a ? (a.answer === step.item.answer ? a.wager : -a.wager) : 0, max: 0 };
    },
    result(step) {
      const it = step.item;
      return {
        question: it.question, explanation: it.explanation || null, options: it.options, answer: it.answer, correctText: letterText(it, it.answer),
        rows: sortedTeams().map((t) => {
          const a = t.answers[step.sid];
          const d = H.final.score(step, null, t).points;
          return { teamId: t.teamId, name: t.name, points: d, delta: true,
            text: a ? `${letterText(it, a.answer)}  ·  inzet ${a.wager}` : 'geen antwoord',
            mark: a ? (a.answer === it.answer ? 'ok' : 'bad') : 'none' };
        })
      };
    },
    next: (step, ss) => (ss.phase === 'open' ? waitMsg(step) : 'step'),
    label: (step, ss) => (ss.phase === 'open' ? { label: '⏳ Wachten op de teams...', disabled: true } : { label: 'Volgende ➡️' }),
    view(step, ss, who) {
      const it = step.item;
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase, question: it.question, options: it.options, media: it.media || null };
      if (who.role === 'phone') {
        const a = who.team.answers[step.sid];
        v.isBase = who.isBase; v.total = E.totalBefore(who.team); v.given = a || null;
        if (ss.phase === 'result') { const r = H.final.result(step); const row = r.rows.find((x) => x.teamId === who.team.teamId); v.mine = row ? row.mark : null; v.delta = row ? row.points : 0; v.correctText = r.correctText; }
      } else {
        if (who.role === 'host') v.answer = it.answer;
        if (ss.phase === 'result') v.result = H.final.result(step);
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- joker inzetten
  H.joker = {
    enter(step, ss) { if (!ss.phase) ss.phase = 'open'; },
    check(step, ss) {
      if (ss.phase !== 'open') return;
      const a = E.active();
      if (!E.jokerRoundCount() || (a.length && a.every((t) => t.joker))) ss.phase = 'result';
    },
    force(step, ss) { ss.phase = 'result'; },
    done: (step, ss) => ss.phase === 'result',
    score: () => ({ points: 0, max: 0 }),
    answered: (step, ss, t) => !!t.joker,
    progress(step) { const a = E.active(); return { done: a.filter((t) => t.joker).length, total: a.length, waiting: a.filter((t) => !t.joker).map((t) => t.name) }; },
    submit(step, ss, team, device, p) {
      if (ss.phase !== 'open') return { ok: false, reason: 'not_open' };
      if (!E.isBase(team, device)) return { ok: false, reason: 'not_base' };
      if (team.joker) return { ok: false, reason: 'already' };
      if (!E.jokerChoices(team).some((c) => c.id === (p && p.roundId))) return { ok: false, reason: 'invalid' };
      team.joker = p.roundId;
      return { ok: true };
    },
    action(step, ss, type, p) {
      if (type === 'clear_joker') { const t = E.team(p.teamId); if (t) { t.joker = null; ss.phase = 'open'; } }
    },
    next: (step, ss) => (ss.phase === 'open' ? { error: `Wacht nog op: ${H.joker.progress(step).waiting.join(', ')}.` } : 'step'),
    label: (step, ss) => (ss.phase === 'open' ? { label: '⏳ Wachten op de jokers...', disabled: true } : { label: 'Volgende ➡️' }),
    view(step, ss, who) {
      const v = { key: step.sid + ':' + ss.phase, phase: ss.phase,
        teams: sortedTeams().map((t) => ({ teamId: t.teamId, name: t.name, chosen: !!t.joker, round: who.role === 'host' ? (E.roundName(t.joker) || null) : null })) };
      if (who.role === 'phone') {
        v.isBase = who.isBase; v.choices = E.jokerChoices(who.team);
        v.chosen = who.team.joker ? E.roundName(who.team.joker) : null;
      }
      return v;
    }
  };

  // ---------------------------------------------------------------- muziekronde (Hitster): komt later, zie README
  H.hitster = {
    prep: () => ({}),
    max: () => 1,
    enter(step, ss) { if (!ss.phase) ss.phase = 'result'; },
    done: () => true,
    score: () => ({ points: 0, max: 1 }),
    view: (step) => ({ key: step.sid, title: 'Muziekronde', text: 'Deze ronde wordt nog toegevoegd.' }),
    label: () => ({ label: 'Volgende ➡️' }),
    next: () => 'step'
  };

  return H;
};
