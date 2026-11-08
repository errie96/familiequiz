// Https-poging op het http-adres wordt direct verbroken; gewone http (en upgrade) werkt gewoon
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const net = require('node:net');
const { createGuard } = require('../lib/https-guard');

test('https-poging verbroken, http werkt', async () => {
  const srv = http.createServer((req, res) => res.end('ok'));
  const guard = createGuard(srv);
  await new Promise((r) => guard.listen(0, '127.0.0.1', r));
  const port = guard.address().port;

  // 1) gewone http-aanvraag
  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/healthz' }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject);
  });
  assert.equal(body, 'ok');

  // 2) begin van een TLS-handshake: de verbinding moet meteen dicht, zonder antwoord
  const got = await new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write(Buffer.from([0x16, 0x03, 0x01, 0x02, 0x00, 0x01])));
    let data = Buffer.alloc(0);
    s.on('data', (c) => (data = Buffer.concat([data, c])));
    s.on('close', () => resolve(data));
    s.on('error', () => {});
  });
  assert.equal(got.length, 0, 'geen (onzin)antwoord op een https-poging');

  await new Promise((r) => guard.close(r));
});

test('websocket-upgrade (Socket.IO) gaat ongehinderd door de voorpost', async () => {
  const srv = http.createServer();
  srv.on('upgrade', (req, socket) => { socket.end('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n'); });
  const guard = createGuard(srv);
  await new Promise((r) => guard.listen(0, '127.0.0.1', r));
  const port = guard.address().port;
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/socket.io/', headers: { Connection: 'Upgrade', Upgrade: 'websocket' } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 101);
  await new Promise((r) => guard.close(r));
});
