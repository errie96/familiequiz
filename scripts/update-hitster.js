#!/usr/bin/env node
// Werk de Hitster-bibliotheek bij vanaf de links in het tabblad "Bronnen".
// Gebruik: npm run update-hitster            (werkt Hitster-bibliotheek.xlsx in de projectmap bij)
//          node scripts/update-hitster.js pad/naar/bestand.xlsx
const fs = require('fs');
const path = require('path');
const { updateLibrary } = require('../lib/hitster-update');

(async () => {
  const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'Hitster-bibliotheek.xlsx'));
  if (!fs.existsSync(file)) { console.error(`Bestand niet gevonden: ${file}`); process.exit(1); }
  console.log(`Bijwerken: ${file}`);
  const { buf, report } = await updateLibrary(fs.readFileSync(file));
  fs.copyFileSync(file, file.replace(/\.xlsx$/i, '.backup.xlsx'));
  fs.writeFileSync(file, buf);
  for (const r of report) {
    console.log(r.error ? `  ✘ ${r.tab}: ${r.error}` : `  ✔ ${r.tab}: ${r.after} nummers (${r.added} nieuw, ${r.removed} weg, ${r.own} eigen)`);
  }
  console.log('Klaar. Het oude bestand staat ernaast als .backup.xlsx.');
})().catch((e) => { console.error('Bijwerken mislukt:', e.message); process.exit(1); });
