// Automatische reservekopieën van alle belangrijke bestanden: stand, geschiedenis, teamfoto's, playlists,
// de vragenlijst en de Hitster-bibliotheek. Elke kopie is een map in data/backups/<datum-tijd>-<reden>/.
// Alleen als er iets veranderd is wordt een nieuwe kopie gemaakt. Bewaard: de laatste 40 kopieën
// en daarnaast per dag de laatste kopie van de afgelopen 30 dagen.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { zip } = require('./zip');

function createBackups({ dir, sources, keep = 40, keepDays = 30, log }) {
  let lastHash = null;
  const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const current = () => sources().filter((s) => s.file && fs.existsSync(s.file)).map((s) => ({ name: s.name, file: s.file }));
  function hashOf(files) {
    const h = crypto.createHash('sha256');
    for (const f of files) { h.update(f.name); h.update(fs.readFileSync(f.file)); }
    return h.digest('hex');
  }
  function list() {
    let ids = [];
    try { ids = fs.readdirSync(dir).filter((d) => /^\d{8}-\d{6}-[a-z0-9-]+$/.test(d)).sort().reverse(); } catch (e) { return []; }
    return ids.map((id) => {
      let files = [];
      try { files = fs.readdirSync(path.join(dir, id)).map((n) => ({ name: n, size: fs.statSync(path.join(dir, id, n)).size })); } catch (e) { /* weg */ }
      const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(.*)$/.exec(id);
      return { id, at: m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null, reason: m ? m[7] : '', files };
    });
  }
  function prune() {
    const all = list();
    const keepIds = new Set(all.slice(0, keep).map((b) => b.id));
    const perDay = new Map();
    const limit = Date.now() - keepDays * 86400e3;
    for (const b of all) { const day = b.id.slice(0, 8); if (!perDay.has(day) && b.at && new Date(b.at).getTime() > limit) perDay.set(day, b.id); }
    perDay.forEach((id) => keepIds.add(id));
    for (const b of all) if (!keepIds.has(b.id)) { try { fs.rmSync(path.join(dir, b.id), { recursive: true, force: true }); } catch (e) { /* later */ } }
  }
  function snapshot(reason = 'auto', { force = false } = {}) {
    try {
      const files = current();
      if (!files.length) return null;
      const hash = hashOf(files);
      if (!force && hash === lastHash) return null;
      lastHash = hash;
      const base = `${stamp()}-${String(reason).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 30)}`;
      let id = base;
      for (let n = 2; fs.existsSync(path.join(dir, id)); n++) id = `${base}-${n}`; // twee kopieën in dezelfde seconde
      const target = path.join(dir, id);
      fs.mkdirSync(target, { recursive: true });
      for (const f of files) fs.copyFileSync(f.file, path.join(target, f.name));
      prune();
      if (log) log.info('backup', { id, files: files.map((f) => f.name) });
      return id;
    } catch (e) {
      if (log) log.error('backup_failed', { reason, message: e.message });
      return null;
    }
  }
  function zipOf(id) {
    if (id === 'nu') {
      const files = {};
      for (const f of current()) files[f.name] = fs.readFileSync(f.file);
      return Object.keys(files).length ? zip(files) : null;
    }
    if (!/^\d{8}-\d{6}-[a-z0-9-]+$/.test(id)) return null;
    const folder = path.join(dir, id);
    if (!fs.existsSync(folder)) return null;
    const files = {};
    for (const n of fs.readdirSync(folder)) files[n] = fs.readFileSync(path.join(folder, n));
    return zip(files);
  }
  return { snapshot, list, zipOf };
}
module.exports = { createBackups };
