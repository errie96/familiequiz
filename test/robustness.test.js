// Robuustheid van het opslaan: kort vastgehouden bestanden (Windows), mislukte opslag melden, sessies na herstart.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');

test('hernoemen probeert het opnieuw als een bestand heel even vastzit (EPERM/EBUSY)', () => {
  const store = require('../lib/state-store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fq-rename-'));
  const file = path.join(dir, 'state.json');
  const real = fs.renameSync;
  let fails = 2;
  fs.renameSync = (a, b) => { if (fails-- > 0) { const e = new Error('vast'); e.code = 'EPERM'; throw e; } return real(a, b); };
  try { store.writeJsonWithBackup(file, { version: 2, ok: true }); } finally { fs.renameSync = real; }
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 2, ok: true });
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), [], 'geen tijdelijke bestanden achtergebleven');
});

test('hernoemen geeft het na een paar pogingen op, en bij andere fouten meteen', () => {
  const { renameWithRetry } = require('../lib/state-store');
  const real = fs.renameSync;
  let calls = 0;
  fs.renameSync = () => { calls++; const e = new Error('x'); e.code = 'EBUSY'; throw e; };
  try { assert.throws(() => renameWithRetry('a', 'b', 3)); } finally { fs.renameSync = real; }
  assert.equal(calls, 3);
  calls = 0;
  fs.renameSync = () => { calls++; const e = new Error('x'); e.code = 'ENOENT'; throw e; };
  try { assert.throws(() => renameWithRetry('a', 'b', 3)); } finally { fs.renameSync = real; }
  assert.equal(calls, 1);
});

test('een verlengde bediening-sessie blijft na een herstart geldig', () => {
  const { createSessions } = require('../lib/security');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fq-sess-')), 'sessions.json');
  const ttl = 2 * 3600e3;
  const a = createSessions(file, ttl);
  const token = a.create();
  // sessie flink ouder maken, dan gebruiken: moet ook op schijf verlengd worden
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = Object.keys(store.sessions)[0];
  store.sessions[key].exp = Date.now() + 60e3;
  fs.writeFileSync(file, JSON.stringify(store));
  const b = createSessions(file, ttl);
  assert.equal(b.valid(token), true);
  const c = createSessions(file, ttl); // "herstart"
  const exp = JSON.parse(fs.readFileSync(file, 'utf8')).sessions[key].exp;
  assert.ok(exp > Date.now() + ttl - 60e3, 'nieuwe vervaltijd staat op schijf');
  assert.equal(c.valid(token), true);
});

test('lukt opslaan niet (bijv. schijf vol of map op slot), dan krijgt de bediening een melding', () => {
  const { startServer } = require('../test-helpers/harness');
  const app = startServer();
  const { T, dir, emitted } = app;
  T.saveNow();
  const stateFile = path.join(dir, 'state.json');
  fs.rmSync(stateFile, { force: true });
  fs.mkdirSync(path.join(stateFile, 'blokkade'), { recursive: true }); // een map op de plek van het bestand: hernoemen faalt
  const before = emitted.length;
  T.saveNow();
  T.saveNow(); // tweede fout binnen een minuut: niet nog eens melden
  const msgs = emitted.slice(before).filter((e) => e.room === 'remote_room' && e.e === 'host_error');
  assert.equal(msgs.length, 1);
  assert.match(msgs[0].d.message, /opslaan/);
});
