#!/usr/bin/env node
// Bewaker voor de quizavond: start server.js en start hem automatisch opnieuw als hij stopt.
//  - Na een crash: na 1 seconde opnieuw starten. De quiz komt terug op pauze, telefoons verbinden vanzelf.
//  - Na "Terugzetten" in de bediening (afsluitcode 75): meteen opnieuw starten met de teruggezette stand.
//  - Gewoon gestopt (Ctrl+C of afsluitcode 0): de bewaker stopt ook.
//  - Crasht hij steeds opnieuw (5 keer binnen een minuut), dan stopt de bewaker, zodat je de fout kunt lezen.
// Gebruikt door start-lokaal.command, start-lokaal.bat en "npm start".
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const RESTART_CODE = 75;
const SERVER = path.join(__dirname, '..', 'server.js');
const MAX_CRASHES = 5;
const WINDOW_MS = 60e3;

// --fresh (alles wissen) alleen bij de allereerste start, nooit bij een automatische herstart
function argsFor(run, args) {
  return run === 0 ? args : args.filter((a) => a !== '--fresh');
}

function main() {
  const args = process.argv.slice(2);
  let run = 0;
  let stopping = false;
  let child = null;
  const crashes = [];

  const start = () => {
    child = spawn(process.execPath, [SERVER, ...argsFor(run, args)], {
      stdio: 'inherit',
      env: { ...process.env, FAMILIEQUIZ_HERSTART: '1' }
    });
    run++;
    child.on('exit', (code, signal) => {
      child = null;
      if (stopping || code === 0) return process.exit(0);
      if (code === RESTART_CODE) {
        console.log('\n↩️  Reservekopie teruggezet: de quiz start opnieuw op…\n');
        return start();
      }
      const now = Date.now();
      crashes.push(now);
      while (crashes.length && now - crashes[0] > WINDOW_MS) crashes.shift();
      if (crashes.length >= MAX_CRASHES) {
        console.error(`\n✘ De server is ${crashes.length} keer binnen een minuut gestopt. De automatische herstart is uitgezet.`);
        console.error('  Lees de foutmelding hierboven, of kijk in data/logs/. Start daarna opnieuw.');
        return process.exit(1);
      }
      console.error(`\n⚠️  De server stopte onverwacht (${signal || 'code ' + code}). Over 1 seconde opnieuw starten; de quiz komt terug op pauze.\n`);
      setTimeout(start, 1000);
    });
  };

  // Ctrl+C: de server krijgt het signaal zelf ook (zelfde terminal), slaat op en stopt. Wij wachten daarop.
  // Pas na 3 seconden hard afsluiten als hij dan nog loopt (zodat hij rustig kan opslaan, ook op Windows).
  const stop = (sig, graceMs) => {
    stopping = true;
    if (!child) return process.exit(0);
    const c = child;
    setTimeout(() => { try { c.kill(sig); } catch (e) { /* al weg */ } }, graceMs).unref();
  };
  process.on('SIGINT', () => stop('SIGINT', 3000));
  process.on('SIGTERM', () => stop('SIGTERM', 0));
  start();
}

if (require.main === module) main();
module.exports = { argsFor, RESTART_CODE };
