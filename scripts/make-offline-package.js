#!/usr/bin/env node
// Maakt één zip met de hele quiz inclusief node_modules, om op een laptop zonder internet uit te pakken.
// Gebruik (met internet, na "npm install"): npm run pakket   →   familiequiz-offline.zip
// Op de quizlaptop: Node.js installeren, zip uitpakken, dubbelklik op start-lokaal (of: npm start).
const fs = require('fs');
const path = require('path');
const { zip } = require('../lib/zip');
const root = path.join(__dirname, '..');
if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) { console.error('Eerst "npm install" draaien (met internet).'); process.exit(1); }
const skip = new Set(['.git', 'data', 'familiequiz-offline.zip']);
const files = {};
(function walk(dir, rel) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!rel && skip.has(f.name)) continue;
    const p = path.join(dir, f.name), r = rel ? `${rel}/${f.name}` : f.name;
    if (f.isDirectory()) walk(p, r);
    else if (f.isFile()) files[`familiequiz/${r}`] = fs.readFileSync(p);
  }
})(root, '');
const out = path.join(root, 'familiequiz-offline.zip');
fs.writeFileSync(out, zip(files));
console.log(`✔ ${out} (${Object.keys(files).length} bestanden, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
