// Logboek: elke regel is een JSON-object in data/logs/quiz-JJJJ-MM-DD.log (14 dagen bewaard).
// Zo is achteraf terug te zien wat er gebeurde: verbindingen, acties van de quizmaster, fouten, back-ups.
const fs = require('fs');
const path = require('path');

function createLogger(dir, { keepDays = 14, echo = true } = {}) {
  const recent = []; // laatste regels voor de bediening
  const fileFor = (d) => path.join(dir, `quiz-${d.toISOString().slice(0, 10)}.log`);
  let lastPrune = 0;
  function prune() {
    if (Date.now() - lastPrune < 3600e3) return;
    lastPrune = Date.now();
    try {
      const limit = Date.now() - keepDays * 86400e3;
      for (const f of fs.readdirSync(dir)) {
        const m = /^quiz-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
        if (m && new Date(m[1]).getTime() < limit) fs.unlinkSync(path.join(dir, f));
      }
    } catch (e) { /* map bestaat (nog) niet */ }
  }
  function write(level, event, data) {
    const entry = { ...(data || {}), t: new Date().toISOString(), level, event };
    recent.push(entry);
    if (recent.length > 300) recent.shift();
    if (echo && level !== 'debug') {
      const line = `[${entry.t.slice(11, 19)}] ${level.toUpperCase()} ${event}${data ? ' ' + JSON.stringify(data) : ''}`;
      (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line.length > 400 ? line.slice(0, 400) + '…' : line);
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(fileFor(new Date()), JSON.stringify(entry) + '\n');
      prune();
    } catch (e) { /* loggen mag de quiz nooit stoppen */ }
  }
  return {
    info: (event, data) => write('info', event, data),
    warn: (event, data) => write('warn', event, data),
    error: (event, data) => write('error', event, data),
    recent: (n = 100, minLevel = 'info') => {
      const order = { debug: 0, info: 1, warn: 2, error: 3 };
      return recent.filter((e) => order[e.level] >= order[minLevel]).slice(-n);
    },
    files: () => { try { return fs.readdirSync(dir).filter((f) => /^quiz-.*\.log$/.test(f)).sort().reverse(); } catch (e) { return []; } },
    read: (file) => { if (!/^quiz-\d{4}-\d{2}-\d{2}\.log$/.test(file)) return null; try { return fs.readFileSync(path.join(dir, file)); } catch (e) { return null; } }
  };
}
module.exports = { createLogger };
