// Testharnas: start de echte server.js in dit proces, maar met nep-Express en nep-Socket.IO.
// Zo kunnen we complete scenario's naspelen (telefoons, tv, bediening) zonder netwerk of browser.
// Elk testbestand draait in een eigen proces (node --test), dus elke test krijgt een verse server.
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');

function startServer({ dataDir, fresh = true, fastTimers = false, env = {} } = {}) {
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'fq-test-'));
  const realTimeout = global.setTimeout;
  if (fastTimers) global.setTimeout = (f, ms, ...a) => realTimeout(f, Math.min(ms || 0, 60) / 20, ...a);
  const routes = {};
  const emitted = [];
  let connHandler = null;
  const fakeExpress = () => ({ use() {}, get(p, h) { routes[p] = h; }, post(p, h) { routes[p] = h; }, disable() {} });
  fakeExpress.static = () => () => {};
  fakeExpress.json = () => () => {};
  class FakeServer {
    constructor() { this.sockets = { sockets: new Map(), adapter: { rooms: new Map() } }; }
    on(ev, h) { if (ev === 'connection') connHandler = h; }
    to(room) { return { emit: (e, d) => emitted.push({ room, e, d }) }; }
    emit(e, d) { emitted.push({ room: '*', e, d }); }
  }
  const orig = Module._load;
  Module._load = function (req, ...a) {
    if (req === 'express') return fakeExpress;
    if (req === 'socket.io') return { Server: FakeServer };
    return orig.call(this, req, ...a);
  };
  Object.assign(process.env, { DATA_DIR: dir, QUIZ_TEST: '1', ...env });
  if (fresh && !process.argv.includes('--fresh')) process.argv.push('--fresh');
  if (!fresh) process.argv = process.argv.filter((a) => a !== '--fresh');
  const root = path.join(__dirname, '..');
  process.chdir(root);
  const server = require(path.join(root, 'server.js'));
  const T = server.__test;

  // een nep-verbinding (telefoon, tv of bediening)
  function connect(id, role, ip = '10.0.0.' + (1 + Math.floor(Math.random() * 200))) {
    const h = {};
    const sock = { id, data: { role }, handshake: { address: ip, headers: {} }, on: (e, f) => { h[e] = f; }, emit: (e, d) => emitted.push({ room: id, e, d }), join() {}, leave() {}, disconnect() { sock.gone = true; } };
    connHandler(sock);
    // aanroepen met een belofte: await c.call('event', data) geeft het antwoord (callback) terug
    const call = (ev, data) => new Promise((resolve) => {
      if (!h[ev]) return resolve({ missing: true });
      let done = false;
      h[ev](data, (res) => { if (!done) { done = true; resolve(res); } });
      realTimeout(() => { if (!done) { done = true; resolve(undefined); } }, 200); // actie zonder antwoord
    });
    const send = (ev, data) => { if (h[ev]) h[ev](data); };
    return { sock, h, call, send, id };
  }
  const last = (room, ev = 'state_update') => { for (let i = emitted.length - 1; i >= 0; i--) if (emitted[i].room === room && emitted[i].e === ev) return emitted[i].d; return null; };
  const host = connect('host', 'remote');
  const tv = connect('tv');
  tv.send('register_tv');
  const remote = () => last('remote_room');
  const tvState = () => last('tv_room');
  // De grote knop indrukken (of 'toch doorgaan' als hij nog niet mag), tot een voorwaarde klopt
  function advanceUntil(pred, max = 400) {
    for (let i = 0; i < max; i++) {
      const r = remote();
      if (pred(r)) return r;
      if (r.controls.main.enabled) host.send('host_main');
      else if (r.controls.force) host.send('host_force');
      else return r;
    }
    throw new Error('advanceUntil: voorwaarde niet bereikt');
  }
  const sleep = (ms) => new Promise((r) => realTimeout(r, ms));
  return { T, dir, routes, emitted, connect, last, host, tv, remote, tvState, advanceUntil, sleep, server };
}

// Een telefoon die een team aanmaakt of aansluit
async function phone(app, id, { team, label, join } = {}) {
  const p = app.connect(id);
  const res = join ? await p.call('join_team', { teamId: join, label }) : await p.call('create_team', { teamName: team, label });
  return { ...p, res, state: () => app.last(id) };
}

module.exports = { startServer, phone };
