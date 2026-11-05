#!/usr/bin/env node
// Controleert de syntax van alle JavaScript: losse .js-bestanden én de <script>-blokken in de HTML-pagina's.
// Gebruik: npm run syntax (onderdeel van npm run check).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'data', 'vendor']);
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(f.name)) files.push(p);
  }
})(root);
let errors = 0, checked = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const parts = file.endsWith('.html')
    ? [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    : [src.replace(/^#!.*\n/, '')];
  parts.forEach((code, i) => {
    checked++;
    try {
      // Node-modules als functie-body controleren (require/module bestaan dan gewoon)
      new vm.Script(file.endsWith('.html') ? code : `(function (exports, require, module, __filename, __dirname) {${code}\n})`, { filename: path.relative(root, file) + (file.endsWith('.html') ? ` (script ${i + 1})` : '') });
    } catch (e) {
      errors++;
      console.error(`✘ ${path.relative(root, file)}${file.endsWith('.html') ? ` (script ${i + 1})` : ''}: ${e.message}`);
    }
  });
}
console.log(errors ? `✘ ${errors} syntaxfout(en) in ${checked} stukken code` : `✔ Syntax in orde (${checked} stukken code in ${files.length} bestanden)`);
process.exit(errors ? 1 : 0);
