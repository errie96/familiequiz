// Foto's op ware grootte: kleine versie via de socket, origineel apart via HTTP; de zip gebruikt het origineel
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, phone } = require('../test-helpers/harness');

const app = startServer({});
const { T, routes, advanceUntil, sleep } = app;
const tinyJpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64');

function post(key, buf, headers = {}) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.params = { key }; req.headers = { 'content-length': String(buf.length), ...headers };
    const res = { code: 200, status(c) { this.code = c; return this; }, type() { return this; }, send() { resolve(this.code); }, end() { resolve(this.code); } };
    routes['/origineel/:key'](req, res);
    setImmediate(() => { req.emit('data', buf); req.emit('end'); });
  });
}
function zipNames() {
  return new Promise((resolve) => {
    const res = { set() { return this; }, status() { return this; }, type() { return this; }, send(b) { resolve(Buffer.isBuffer(b) ? b : Buffer.from(String(b))); } };
    // het downloadtoken staat niet in de test; lees het uit de route zelf door een geldige query te simuleren
    routes['/download/fotos.zip']({ query: { t: app.remote().downloadToken } }, res);
  });
}

test('teamfoto: origineel komt via eenmalige sleutel binnen en gaat in de foto-zip', async () => {
  app.host.send('set_max_teams', { n: 3 });
  const a = await phone(app, 'p1', { team: 'Zeegse Zuiperds', label: 'Anna' });
  await phone(app, 'p2', { team: 'BalloerBatsers', label: 'Bas' });
  advanceUntil((r) => r.phase === 'PLAY');
  advanceUntil((r) => r.step.kind === 'teamphoto');
  const res = await a.call('set_team_photo', { dataUrl: tinyJpeg });
  assert.equal(res.ok, true);
  assert.match(res.original, /^[a-f0-9]{32}$/, 'sleutel voor het origineel');

  const original = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.alloc(5000, 7)]);
  assert.equal(await post('0'.repeat(32), original), 403, 'onbekende sleutel geweigerd');
  assert.equal(await post(res.original, Buffer.from('geen jpeg')), 400, 'geen JPEG geweigerd');
  // sleutel is na een poging verbruikt: nieuwe foto voor een nieuwe sleutel
  const res2 = await a.call('set_team_photo', { dataUrl: tinyJpeg });
  assert.equal(await post(res2.original, original), 204);
  assert.equal(await post(res2.original, original), 403, 'eenmalig');
  const file = path.join(T.ORIG_DIR, 'teamfotos', `${app.remote().teams.find((t) => t.name === 'Zeegse Zuiperds').teamId}.jpg`);
  assert.equal(fs.readFileSync(file).length, original.length);

  const zipBuf = await zipNames();
  const day = new Date().toISOString().slice(0, 10);
  assert.ok(zipBuf.includes(Buffer.from(`teamfotos/${day}_Zeegse_Zuiperds.jpg`)), 'teamfoto in de zip (met datum)');
  // zip is gedeflate; controleer de ongecomprimeerde grootte in de centrale map: die van het origineel
  const cd = zipBuf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.equal(zipBuf.readUInt32LE(cd + 24), original.length, 'het origineel, niet de kleine versie');

  // nieuwe teamfoto: het oude origineel verdwijnt (anders komt een verkeerde foto in het album)
  await a.call('set_team_photo', { dataUrl: tinyJpeg });
  assert.equal(fs.existsSync(file), false);

  // na een reset van de quiz blijven de teamfoto's in de foto-zip staan
  app.host.send('reset_quiz', { confirm: true });
  const afterReset = await zipNames();
  assert.ok(afterReset.includes(Buffer.from(`teamfotos/${day}_Zeegse_Zuiperds.jpg`)), 'teamfoto overleeft een reset');
  await sleep(1);
});
