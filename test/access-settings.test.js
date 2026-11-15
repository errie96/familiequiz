// Aanmeldadres (QR-code) en wifi-QR: eigen adres instellen (bijv. Tailscale Funnel), ook tijdens de quiz, en weer leeg.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('../test-helpers/harness');
const { cleanPublicUrl } = require('../lib/settings');
const network = require('../lib/network');

test('adres controleren: alleen http(s), zonder / aan het eind', () => {
  assert.equal(cleanPublicUrl('https://quiz.voorbeeld.ts.net/'), 'https://quiz.voorbeeld.ts.net');
  assert.equal(cleanPublicUrl('  '), '');
  assert.equal(cleanPublicUrl('quiz.voorbeeld.ts.net'), null);
  assert.equal(cleanPublicUrl('javascript:alert(1)'), null);
  assert.equal(cleanPublicUrl('https://a b.nl'), null);
  assert.equal(network.getJoinUrl(3000, 'https://quiz.voorbeeld.ts.net'), 'https://quiz.voorbeeld.ts.net');
  assert.match(network.getJoinUrl(3000, ''), /^http/);
});

test('bediening zet het aanmeldadres en de wifi-QR; tv en bediening zien het meteen', async () => {
  const app = startServer({});
  const { host, tvState, remote, T } = app;
  let res = await host.call('set_access', { publicUrl: 'https://quiz.voorbeeld.ts.net/', showWifi: false });
  assert.equal(res.ok, true);
  assert.equal(T.G.settings.publicUrl, 'https://quiz.voorbeeld.ts.net');
  assert.equal(tvState().joinUrl, 'https://quiz.voorbeeld.ts.net');
  assert.equal(tvState().showWifi, false);
  assert.equal(remote().joinUrl, 'https://quiz.voorbeeld.ts.net');
  // ongeldig adres: geweigerd, het oude blijft
  res = await host.call('set_access', { publicUrl: 'geen adres' });
  assert.equal(res.ok, false);
  assert.equal(T.G.settings.publicUrl, 'https://quiz.voorbeeld.ts.net');
  // leeg = weer het wifi-adres van de laptop, wifi-QR weer aan
  res = await host.call('set_access', { publicUrl: '', showWifi: true });
  assert.equal(res.ok, true);
  assert.notEqual(tvState().joinUrl, 'https://quiz.voorbeeld.ts.net');
  assert.equal(tvState().showWifi, true);
  // een telefoon (geen bediening) mag dit niet
  const p = app.connect('x');
  res = await p.call('set_access', { publicUrl: 'https://kwaad.example' });
  assert.notEqual(T.G.settings.publicUrl, 'https://kwaad.example');
});
