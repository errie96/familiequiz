// Soundboard: eigen geluiden uploaden (alleen met sessie) en vaste namen vervangen de ingebouwde geluiden
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('../test-helpers/harness');

const app = startServer({});
const { routes, remote, host } = app;
const DIR = path.join(__dirname, '..', 'public', 'media', 'sounds');
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(2000, 3)]);

function upload(name, buf, token) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.query = { naam: name }; req.headers = { 'x-host-token': token, 'content-length': String(buf.length) };
    const res = { code: 200, status(c) { this.code = c; return this; }, type() { return this; }, send() { resolve(this.code); }, end() { resolve(this.code); } };
    routes['/geluid-upload'](req, res);
    setImmediate(() => { req.emit('data', buf); req.emit('end'); });
  });
}

test('geluid uploaden: zonder sessie niet, met sessie wel; vaste naam vervangt het ingebouwde geluid', async () => {
  const made = [];
  try {
    assert.equal(await upload('gejuich.mp3', MP3, 'x'.repeat(30)), 403, 'zonder geldige sessie');
    const token = await new Promise((resolve) => { const h = app.connect('h2', 'remote'); h.send('register_remote', { pin: 'Erjan231' }); const f = app.emitted.filter((e) => e.room === 'h2' && e.e === 'remote_confirmed').pop(); resolve(f && f.d && f.d.token); });
    assert.ok(token, 'sessiesleutel van de bediening');
    assert.equal(await upload('niet.mp3', Buffer.from('geen audio!!'), token), 400, 'alleen echte audio');
    assert.equal(await upload('Mijn Gejuich!.mp3', MP3, token), 204);
    made.push('Mijn Gejuich.mp3');
    assert.ok(fs.existsSync(path.join(DIR, 'Mijn Gejuich.mp3')));
    assert.equal(await upload('drumroll.mp3', MP3, token), 204);
    made.push('drumroll.mp3');
    host.send('end_view', {}); // sync
    const r = remote();
    assert.equal(r.soundFiles.drumroll, '/media/sounds/drumroll.mp3', 'vervangt het ingebouwde tromgeroffel');
    assert.ok(r.soundboard.custom.some((x) => x.file === 'Mijn Gejuich.mp3'), 'eigen geluid als extra knop');
    assert.ok(!r.soundboard.custom.some((x) => x.file === 'drumroll.mp3'), 'een vervanger krijgt geen aparte knop');
  } finally { made.forEach((f) => { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) { /* weg */ } }); }
});
