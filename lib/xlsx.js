// Minimale .xlsx-lezer zonder extra pakketten: een xlsx is een zip met xml-bestanden.
// Geeft { bladnaam: [[cel, cel, ...], ...] } terug (rij 1 = index 0, kolom A = index 0).
const fs = require('fs');
const zlib = require('zlib');

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Geen geldig xlsx-bestand (zip niet gevonden).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  let total = 0;
  if (count > 2000) throw new Error('Te veel onderdelen in dit bestand.');
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Beschadigd xlsx-bestand.');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + csize);
    // Bescherming tegen 'zipbommen': per onderdeel maximaal 40 MB uitgepakt, in totaal 120 MB
    files[name] = method === 0 ? data : zlib.inflateRawSync(data, { maxOutputLength: 40 * 1024 * 1024 });
    total += files[name].length;
    if (total > 120 * 1024 * 1024) throw new Error('Bestand is uitgepakt te groot.');
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const decode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&amp;/g, '&');
const textOf = (xml) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');
const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

function readXlsx(input) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  const files = unzip(buf);
  const get = (name) => (files[name] ? files[name].toString('utf8') : null);
  const shared = [];
  const sst = get('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rels = {};
  for (const m of (get('xl/_rels/workbook.xml.rels') || '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]*)"/.exec(m[1]), target = /Target="([^"]*)"/.exec(m[1]);
    if (id && target) rels[id[1]] = target[1].replace(/^\/?(xl\/)?/, 'xl/');
  }
  const sheets = {};
  for (const m of (get('xl/workbook.xml') || '').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = /name="([^"]*)"/.exec(m[1]), rid = /r:id="([^"]*)"/.exec(m[1]);
    if (!name || !rid || !rels[rid[1]]) continue;
    const xml = get(rels[rid[1]]);
    if (!xml) continue;
    const rows = [];
    for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rnum = /\br="(\d+)"/.exec(rm[1]);
      if (!rnum || !rm[2]) continue;
      const row = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/.exec(cm[1]);
        if (!ref || cm[2] === undefined) continue;
        const type = (/\bt="([^"]*)"/.exec(cm[1]) || [])[1];
        const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2]);
        let val = null;
        if (type === 'inlineStr') val = textOf(cm[2]);
        else if (v) {
          if (type === 's') val = shared[Number(v[1])] ?? null;
          else if (type === 'str') val = decode(v[1]);
          else if (type === 'b') val = v[1] === '1';
          else if (type === 'e') val = null;
          else val = Number(v[1]);
        }
        if (val !== null && val !== '') row[colIndex(ref[1])] = val;
      }
      rows[Number(rnum[1]) - 1] = row;
    }
    sheets[decode(name[1])] = Array.from(rows, (r) => r || []);
  }
  return sheets;
}

module.exports = { readXlsx, unzip };
