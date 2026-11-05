#!/usr/bin/env node
// Controleert of de quiz klaar is om zonder internet te draaien (lokaal op een laptop).
// Gebruik: npm run offline-check
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.join(__dirname, '..');
let problems = 0;
const ok = (t) => console.log('  ✔ ' + t);
const bad = (t) => { problems++; console.log('  ✘ ' + t); };
const warn = (t) => console.log('  ⚠ ' + t);

console.log('\nFamiliequiz: klaar voor spelen zonder internet?\n');
console.log('1. Programma');
const major = Number(process.versions.node.split('.')[0]);
major >= 18 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node} is te oud (minstens 18 nodig)`);
for (const dep of ['express', 'socket.io']) {
  fs.existsSync(path.join(root, 'node_modules', dep, 'package.json')) ? ok(`${dep} is geïnstalleerd`) : bad(`${dep} ontbreekt: draai één keer "npm install" terwijl je nog internet hebt`);
}
fs.existsSync(path.join(root, 'package-lock.json')) ? ok('package-lock.json aanwezig (vaste versies)') : warn('geen package-lock.json: draai "npm install" en zet het bestand in GitHub');
ok('QR-code, lettertype en confetti zitten in de app zelf (geen internet nodig)');

console.log('\n2. Vragenlijst en bestanden');
let raw = null;
try {
  const { fromExcel } = require(path.join(root, 'lib', 'fromExcel'));
  const file = [path.join(root, 'data', 'vragenlijst.xlsx'), path.join(root, 'vragenlijst.xlsx')].find((f) => fs.existsSync(f));
  raw = file ? fromExcel(file, path.join(root, 'questions.json')).raw : JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
  ok(`vragenlijst ingelezen (${file ? path.basename(file) : 'questions.json'})`);
} catch (e) { bad('vragenlijst kon niet gelezen worden: ' + e.message); }
if (raw) {
  const refs = [];
  JSON.stringify(raw, (k, v) => { if (['src', 'image', 'file', 'audio', 'media', 'imageUrl'].includes(k) && typeof v === 'string') refs.push(v); return v; });
  const local = refs.filter((r) => !/^https?:/i.test(r));
  const missing = local.filter((r) => !fs.existsSync(path.join(root, 'public', r.startsWith('/') ? r.slice(1) : (r.startsWith('media/') ? r : 'media/' + r))));
  const online = refs.filter((r) => /^https?:/i.test(r));
  missing.length ? bad(`${missing.length} foto's/logo's/geluiden ontbreken in public/media/ (bijv. ${missing.slice(0, 3).join(', ')})`) : ok(`alle ${local.length} lokale bestanden zijn aanwezig`);
  if (online.length) bad(`${online.length} bestanden staan op internet (http…): zet ze in public/media/ en verwijs daar naar`);
  const music = (raw.rounds || []).filter((r) => r.type === 'hitster');
  for (const r of music) {
    const songs = r.songs || [];
    const withAudio = songs.filter((s) => s.audio).length;
    withAudio === songs.length ? ok(`muziekronde: alle ${songs.length} liedjes hebben een eigen audiobestand`) : warn(`muziekronde: ${songs.length - withAudio} van de ${songs.length} liedjes hebben geen eigen audiobestand (kolom Audio). Zonder internet kunnen die niet afgespeeld worden.`);
  }
}
warn('extra muziekrondes (Hitster-playlists), Spotify, iTunes, Primera-lijsten en de jaarcheck werken alleen met internet');

console.log('\n3. Netwerk');
const ips = [];
for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if ((i.family === 'IPv4' || i.family === 4) && !i.internal) ips.push(i.address);
const port = process.env.PORT || 3000;
ips.length ? ok(`spelers verbinden met: ${ips.map((a) => `http://${a}:${port}`).join('  of  ')}`) : bad('geen netwerk gevonden: verbind de laptop met de wifi (of zet een hotspot aan)');
console.log('\nTips: zet op de telefoons de mobiele data uit, anders kiezen ze soms 4G/5G in plaats van de wifi zonder internet.');
console.log('Zet op de laptop de slaapstand uit en sluit hem aan op de stroom.\n');
console.log(problems ? `✘ ${problems} punt(en) om eerst op te lossen.\n` : '✔ Klaar om zonder internet te spelen.\n');
process.exit(problems ? 1 : 0);
