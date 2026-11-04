// Hitster-bibliotheek bijwerken vanaf de links in het tabblad "Bronnen".
// Werkt zonder extra pakketten: het xlsx-bestand (een zip) wordt uitgepakt, alleen de rijen van de
// bijgewerkte tabbladen worden opnieuw geschreven (opmaak, kolombreedtes en keuzelijsten blijven staan)
// en het geheel wordt weer ingepakt.
const zlib = require('zlib');
const { readXlsx, unzip } = require('./xlsx');

const HEADER = 3, FIRST = 4; // rij 4: kolomnamen, rij 5: eerste nummer
const txt = (v) => (v === undefined || v === null ? '' : String(v).trim());

const { zip } = require('./zip');

// ---------- liedjeslijst van een webpagina halen ----------
const decodeHtml = (s) => s.replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, '...').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/\s+/g, ' ').trim();
// Eerste tabel met kolommen Jaartal / Nummer / Artiest (bij Battle staat daarna nog een tabel per tijdvak: die slaan we over)
function parseSongTable(html) {
  const tables = String(html).match(/<table[\s\S]*?<\/table>/gi) || [];
  for (const table of tables) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(decodeHtml));
    const headIdx = rows.findIndex((r) => r.some((c) => /jaar/i.test(c)) && r.some((c) => /nummer|titel|song/i.test(c)));
    if (headIdx < 0) continue;
    const head = rows[headIdx].map((c) => c.toLowerCase());
    const cy = head.findIndex((c) => /jaar/.test(c)), ct = head.findIndex((c) => /nummer|titel|song/.test(c)), ca = head.findIndex((c) => /artiest|artist/.test(c));
    const songs = rows.slice(headIdx + 1).map((r) => ({ year: parseInt(r[cy], 10), title: r[ct] || '', artist: r[ca] || '' }))
      .filter((s) => Number.isInteger(s.year) && s.year > 1800 && s.title);
    if (songs.length) return songs;
  }
  return [];
}

// ---------- opschonen (zelfde regels als bij de eerste import) ----------
const GENERIC = new Set(['theme', 'main title', 'titles', 'prologue', 'prelude', 'main theme']);
const SUFFIX = /(remaster|radio|edit\b|version|\bmix\b|mono|re-?issue|\blive\b|single|soundtrack|from ["“]|from the|official|bonus|original)/i;
function cleanTitle(t) {
  t = String(t).replace(/[“”]/g, '"').replace(/[’‘]/g, "'").trim();
  const i = t.indexOf(' - ');
  if (i > 0) { const base = t.slice(0, i).trim(), suf = t.slice(i + 3); if (SUFFIX.test(suf) && !GENERIC.has(base.toLowerCase())) t = base; }
  return t.replace(/\s*[([](feat\.|ft\.|with )[^)\]]*[)\]]/gi, '').trim();
}
function cleanArtist(a) {
  const parts = String(a).split(/\s*;\s*/).map((p) => p.trim()).filter(Boolean).slice(0, 3);
  return parts.length <= 1 ? (parts[0] || '') : parts.length === 2 ? parts.join(' & ') : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}
const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9à-ÿ]/g, '');
const keyOf = (title, artist) => `${norm(title)}|${norm(String(artist).split(/ & |, /)[0])}`;
const eraOf = (tab) => (/t-?m 1984|t\/m 1984/i.test(tab) ? [0, 1984] : /1985-2004/.test(tab) ? [1985, 2004] : /2005-20\d\d/.test(tab) ? [2005, 2100] : null);

// ---------- sheet-xml herschrijven ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => String.fromCharCode(65 + i);
function rewriteSheet(xml, rows, ncols) {
  const m = /<sheetData>([\s\S]*?)<\/sheetData>|<sheetData\/>/.exec(xml);
  if (!m) throw new Error('sheetData niet gevonden');
  const inner = m[1] || '';
  const allRows = inner.match(/<row\b[\s\S]*?(?:<\/row>|\/>)/g) || [];
  const keep = allRows.filter((r) => { const n = parseInt((/\br="(\d+)"/.exec(r) || [])[1], 10); return n <= FIRST; });
  // stijl per kolom overnemen van de eerste gegevensrij
  const sample = allRows.find((r) => parseInt((/\br="(\d+)"/.exec(r) || [])[1], 10) === FIRST + 1) || '';
  const styleOf = (c) => { const re = new RegExp(`<c r="${colName(c)}${FIRST + 1}"[^>]*?\\bs="(\\d+)"`); const s = re.exec(sample); return s ? ` s="${s[1]}"` : ''; };
  const styles = Array.from({ length: ncols }, (_, c) => styleOf(c));
  const body = rows.map((row, i) => {
    const r = FIRST + 1 + i;
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r}`;
      if (v === null || v === undefined || v === '') return styles[c] ? `<c r="${ref}"${styles[c]}/>` : '';
      if (typeof v === 'number') return `<c r="${ref}"${styles[c]}><v>${v}</v></c>`;
      return `<c r="${ref}"${styles[c]} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r}">${cells}</row>`;
  }).join('');
  const last = FIRST + rows.length;
  return xml.replace(m[0], `<sheetData>${keep.join('')}${body}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:${colName(ncols - 1)}${Math.max(last, FIRST + 1)}"/>`)
    .replace(/<autoFilter[^>]*\/>/, '')
    .replace(/sqref="([A-Z])5:\1\d+"/g, (_, col) => `sqref="${col}5:${col}${last + 500}"`);
}

// ---------- bijwerken ----------
async function updateLibrary(buf, { fetchFn = fetch, today = new Date().toISOString().slice(0, 10) } = {}) {
  const files = unzip(buf);
  const sheets = readXlsx(buf);
  const get = (name) => files[name].toString('utf8');
  // bladnaam -> pad van het sheet-xml
  const rels = {};
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]*)"/.exec(m[1]), target = /Target="([^"]*)"/.exec(m[1]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const pathOf = {};
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[1]), rid = /r:id="([^"]*)"/.exec(m[1]);
    if (name && rid) pathOf[name[1].replace(/&amp;/g, '&')] = rels[rid[1]];
  }
  if (!sheets.Bronnen) throw new Error('Het tabblad "Bronnen" ontbreekt in de Hitster-bibliotheek.');
  const head = (sheets.Bronnen[HEADER] || []).map((h) => txt(h).toLowerCase());
  const cTab = head.findIndex((h) => /tabblad/.test(h)), cUrl = head.findIndex((h) => /link|lijst|bron/.test(h) && !/spotify/.test(h)), cDate = head.findIndex((h) => /bijgewerkt/.test(h));
  const bronnen = sheets.Bronnen.slice(FIRST).map((r, i) => ({ row: i, tab: txt((r || [])[cTab]), url: txt((r || [])[cUrl]) })).filter((b) => b.tab && /^https?:\/\//i.test(b.url));
  const cache = {};
  const report = [];
  const updated = new Set();
  for (const b of bronnen) {
    if (!sheets[b.tab] || !pathOf[b.tab]) { report.push({ tab: b.tab, error: 'tabblad bestaat niet' }); continue; }
    try {
      if (!cache[b.url]) {
        const res = await fetchFn(b.url, { headers: { 'User-Agent': 'Mozilla/5.0 (familiequiz)', Accept: 'text/html' } });
        if (!res.ok) throw new Error(`pagina gaf status ${res.status}`);
        cache[b.url] = parseSongTable(await res.text());
      }
      const web = cache[b.url];
      if (web.length < 20) throw new Error(`te weinig nummers gevonden (${web.length}); is de pagina veranderd?`);
      // bestaande regels: eigen aanpassingen bewaren
      const sh = sheets[b.tab];
      const h = (sh[HEADER] || []).map((x) => txt(x).toLowerCase());
      const col = (re) => h.findIndex((x) => re.test(x));
      const cT = col(/^titel/), cA = col(/^artiest/), cY = col(/^jaar$|^jaar\b(?!.*check)/), cS = col(/^startkaart/), cC = col(/check|controle/), cB = col(/^bron/), cAu = col(/^audio/);
      const ncols = Math.max(h.length, 7);
      const existing = sh.slice(FIRST).filter((r) => r && txt(r[cT])).map((r) => ({ title: txt(r[cT]), artist: txt(r[cA]), year: Number(r[cY]), start: txt(r[cS]), check: txt(r[cC]), bron: txt(r[cB]), audio: txt(r[cAu]) }));
      const old = new Map(existing.map((e) => [keyOf(e.title, e.artist), e]));
      const era = eraOf(b.tab);
      const seen = new Set();
      const rows = [];
      let added = 0;
      for (const s of web) {
        const title = cleanTitle(s.title), artist = cleanArtist(s.artist);
        const k = keyOf(title, artist);
        if (seen.has(k)) continue;
        if (era && (s.year < era[0] || s.year > era[1])) continue;
        seen.add(k);
        const e = old.get(k);
        if (!e) added++;
        // Bestaat het nummer al? Dan blijven jaar (als zelf aangepast: Jaar check leeg), startkaart en audio zoals ze waren
        const year = e && !/^ja$/i.test(e.check) && Number.isInteger(e.year) ? e.year : s.year;
        const row = new Array(ncols).fill(null);
        row[cT] = title; row[cA] = artist; row[cY] = year;
        if (cS >= 0) row[cS] = e ? e.start || null : null;
        if (cC >= 0) row[cC] = e && !/^ja$/i.test(e.check) ? null : 'Ja';
        if (cB >= 0) row[cB] = 'Hitster';
        if (cAu >= 0) row[cAu] = e ? e.audio || null : null;
        rows.push(row);
      }
      // eigen aanvullingen blijven onderaan staan
      let own = 0;
      for (const e of existing) {
        if (!/^eigen$/i.test(e.bron) || seen.has(keyOf(e.title, e.artist))) continue;
        const row = new Array(ncols).fill(null);
        row[cT] = e.title; row[cA] = e.artist; row[cY] = Number.isInteger(e.year) ? e.year : null;
        if (cS >= 0) row[cS] = e.start || null; if (cC >= 0) row[cC] = e.check || null; if (cB >= 0) row[cB] = 'Eigen'; if (cAu >= 0) row[cAu] = e.audio || null;
        rows.push(row); own++;
      }
      const removed = existing.filter((e) => !/^eigen$/i.test(e.bron) && !seen.has(keyOf(e.title, e.artist))).length;
      files[pathOf[b.tab]] = Buffer.from(rewriteSheet(get(pathOf[b.tab]), rows, ncols), 'utf8');
      updated.add(b.row);
      report.push({ tab: b.tab, before: existing.length, after: rows.length, added, removed, own });
    } catch (e) {
      report.push({ tab: b.tab, error: e.message });
    }
  }
  // datum bijwerken in het tabblad Bronnen
  if (cDate >= 0 && updated.size) {
    const allRows = sheets.Bronnen.slice(FIRST).map((r) => Array.from({ length: Math.max(4, (r || []).length) }, (_, c) => (r && r[c] !== undefined && r[c] !== '' ? r[c] : null)));
    let rIdx = -1;
    const rows = allRows.filter((r) => r.some((v) => v !== null)).map((r) => { rIdx++; const out = [...r]; const b = bronnen.find((x) => x.row === rIdx); if (b && updated.has(b.row)) out[cDate] = today; return out; });
    files[pathOf.Bronnen] = Buffer.from(rewriteSheet(get(pathOf.Bronnen), rows, Math.max(4, head.length)), 'utf8');
  }
  delete files['xl/calcChain.xml'];
  return { buf: zip(files), report };
}

// ---------- losse aanpassingen: jaartallen gecontroleerd, nummers aangevuld uit een playlist ----------
// edits: { [categorie]: { years: [{ title, artist, year, ok }], add: [{ title, artist, year }] } }
function editLibrary(buf, edits) {
  const { catOf } = require('./fromExcel');
  const files = unzip(buf);
  const sheets = readXlsx(buf);
  const get = (name) => files[name].toString('utf8');
  const rels = {};
  for (const m of get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]*)"/.exec(m[1]), target = /Target="([^"]*)"/.exec(m[1]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const pathOf = {};
  for (const m of get('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[1]), rid = /r:id="([^"]*)"/.exec(m[1]);
    if (name && rid) pathOf[name[1].replace(/&amp;/g, '&')] = rels[rid[1]];
  }
  const report = { fixed: 0, verified: 0, added: 0, changes: [] };
  for (const tab of Object.keys(sheets).filter((n) => /^hitster\s*[-:–]/i.test(n))) {
    const e = edits[catOf(tab)];
    if (!e || !pathOf[tab]) continue;
    const sh = sheets[tab];
    const h = (sh[HEADER] || []).map((x) => txt(x).toLowerCase());
    const col = (re) => h.findIndex((x) => re.test(x));
    const cT = col(/^titel/), cA = col(/^artiest/), cY = col(/^jaar$|^jaar\b(?!.*check)/), cC = col(/check|controle/), cB = col(/^bron/);
    const ncols = Math.max(h.length, 7);
    const rows = sh.slice(FIRST).filter((r) => r && txt(r[cT])).map((r) => Array.from({ length: ncols }, (_, c) => (r[c] === undefined || r[c] === '' ? null : r[c])));
    const index = new Map(rows.map((r, i) => [keyOf(txt(r[cT]), txt(r[cA])), i]));
    let changed = false;
    for (const y of e.years || []) {
      const i = index.get(keyOf(y.title, y.artist));
      if (i === undefined || !y.ok) continue;
      const row = rows[i];
      if (Number.isInteger(y.year) && y.year >= 1900 && y.year < Number(row[cY])) { report.changes.push(`${row[cT]} (${row[cA]}): ${row[cY]} → ${y.year}`); row[cY] = y.year; report.fixed++; }
      if (cC >= 0 && row[cC]) { row[cC] = null; report.verified++; }
      changed = true;
    }
    const era = eraOf(tab);
    for (const t of e.add || []) {
      const title = cleanTitle(t.title), artist = cleanArtist(String(t.artist).replace(/, /g, ';'));
      const k = keyOf(title, artist);
      if (index.has(k) || !Number.isInteger(t.year) || (era && (t.year < era[0] || t.year > era[1]))) continue;
      const row = new Array(ncols).fill(null);
      row[cT] = title; row[cA] = artist; row[cY] = t.year;
      if (cC >= 0) row[cC] = 'Ja';
      if (cB >= 0) row[cB] = 'Hitster';
      index.set(k, rows.length);
      rows.push(row);
      report.added++; changed = true;
    }
    if (changed) files[pathOf[tab]] = Buffer.from(rewriteSheet(get(pathOf[tab]), rows, ncols), 'utf8');
  }
  delete files['xl/calcChain.xml'];
  return { buf: zip(files), report };
}

module.exports = { updateLibrary, editLibrary, parseSongTable, cleanTitle, cleanArtist };
