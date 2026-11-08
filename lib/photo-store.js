// Foto-opslag: pauzefoto's, teamfoto's (los bewaard), originelen op ware grootte en het archief per quiz.
// Alles onder data/fotos/. createPhotoStore geeft functies terug die server.js gebruikt.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createPhotoStore({ dataDir, log, teamName }) {
  const DATA_DIR = dataDir;
  const quiet = (where) => (e) => { if (e && e.code !== 'ENOENT') log.warn('opgevangen_fout', { waar: where, fout: String((e && e.message) || e).slice(0, 200) }); };
  const PHOTO_DIR = path.join(DATA_DIR, 'fotos');
  const pausePhotos = []; // { file: 'datum/naam.jpg', team, label, at } (altijd dezelfde lijst: in place aanpassen)
  // Nieuwe quiz: alle foto's van de vorige quiz (pauzefoto's, teamfoto's en originelen) naar data/fotos/archief/<datum_tijd>/,
  // zodat het album en de foto-zip weer leeg beginnen. Er wordt niets weggegooid.
  function archiveAllPhotos() {
    let entries = [];
    try { entries = fs.readdirSync(PHOTO_DIR).filter((n) => n !== 'archief'); } catch (e) { return null; }
    if (!entries.length) return null;
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    const dest = path.join(PHOTO_DIR, 'archief', stamp);
    fs.mkdirSync(dest, { recursive: true });
    let moved = 0;
    for (const n of entries) {
      try { fs.renameSync(path.join(PHOTO_DIR, n), path.join(dest, n)); moved++; } catch (e) { log.warn('foto_archiveren_mislukt', { bestand: n, fout: e.message }); }
    }
    pausePhotos.length = 0;
    archiveCache = null;
    log.info('fotos_gearchiveerd', { map: path.relative(dataDir, dest), onderdelen: moved });
    return dest;
  }
  function loadPausePhotos() {
    pausePhotos.length = 0;
    try {
      for (const day of fs.readdirSync(PHOTO_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
        for (const f of fs.readdirSync(path.join(PHOTO_DIR, day)).filter((x) => /^[\w-]+\.jpg$/.test(x)).sort()) {
          const m = /^\d{6}-(.+?)-[a-z0-9]{6}\.jpg$/.exec(f);
          pausePhotos.push({ file: `${day}/${f}`, team: m ? m[1].replace(/_/g, ' ') : '', label: '', at: day });
        }
      }
    } catch (e) { quiet('pauzefoto\'s lezen')(e); }
  }
  const pausePhotoUrl = (p) => `/pauzefoto/${p.file}`;
  // Foto's op ware grootte voor het album: de tv en telefoons krijgen een kleine versie (snel), en de telefoon stuurt
  // daarna het origineel apart via een gewone HTTP-upload (niet via Socket.IO). Bewaard in data/fotos/origineel/;
  // alleen op te halen via de foto-zip in de bediening (met token), nooit publiek.
  const ORIG_DIR = path.join(PHOTO_DIR, 'origineel');
  const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
  const originalUploads = new Map(); // sleutel -> { file, expires }: eenmalig, 10 minuten geldig
  function originalUploadKey(relFile) {
    const now = Date.now();
    for (const [k, v] of originalUploads) if (v.expires < now) originalUploads.delete(k);
    const key = crypto.randomBytes(16).toString('hex');
    originalUploads.set(key, { file: relFile, expires: now + 10 * 60 * 1000 });
    return key;
  }
  const teamOriginalFile = (teamId) => `teamfotos/${String(teamId).replace(/[^\w-]/g, '')}.jpg`;
  const pauseOriginalFile = (p) => `pauze/${p.file}`;
  // Teamfoto's ook los bewaren in data/fotos/teamfotos/<datum>/, zodat ze in de foto-zip blijven staan,
  // ook na een reset van de quiz of een nieuwe testavond (de quiz zelf bewaart ze in teamphotos.json)
  const TEAM_ARCHIVE = path.join(PHOTO_DIR, 'teamfotos');
  const safeId = (id) => String(id).replace(/[^\w-]/g, '');
  const nameSlug = (n) => String(n || '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'team';
  let archiveCache = null; // lijst van bewaarde teamfoto's; opnieuw lezen na een wijziging
  function archivedTeamPhotos() {
    if (archiveCache) return archiveCache;
    const out = [];
    try {
      for (const day of fs.readdirSync(TEAM_ARCHIVE).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
        for (const f of fs.readdirSync(path.join(TEAM_ARCHIVE, day)).filter((x) => /^[\w-]+--[\w-]+\.jpg$/.test(x)).sort()) {
          const m = /^(.+)--([\w-]+)\.jpg$/.exec(f);
          out.push({ day, file: f, slug: m[1], teamId: m[2] });
        }
      }
    } catch (e) { quiet('teamfoto-archief lezen')(e); }
    archiveCache = out;
    return out;
  }
  function archiveTeamPhoto(teamId, dataUrl) {
    archiveCache = null;
    // eerst oude versies van dit team weg (opnieuw gemaakt of verwijderd door de quizmaster)
    for (const a of archivedTeamPhotos()) if (a.teamId === safeId(teamId)) { try { fs.unlinkSync(path.join(TEAM_ARCHIVE, a.day, a.file)); } catch (e) { quiet('oude teamfoto weghalen')(e); } }
    if (!dataUrl) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      fs.mkdirSync(path.join(TEAM_ARCHIVE, day), { recursive: true });
      fs.writeFileSync(path.join(TEAM_ARCHIVE, day, `${nameSlug(teamName(teamId) || 'team')}--${safeId(teamId)}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
    } catch (e) { log.warn('teamfoto_bewaren_mislukt', { fout: e.message }); }
    archiveCache = null;
  }
  function readOriginal(rel) { try { return fs.readFileSync(path.join(ORIG_DIR, rel)); } catch (e) { return null; } }
  function removeOriginal(rel) { try { fs.unlinkSync(path.join(ORIG_DIR, rel)); } catch (e) { quiet('origineel weghalen')(e); } }

  loadPausePhotos();
  return {
    PHOTO_DIR, ORIG_DIR, TEAM_ARCHIVE, MAX_ORIGINAL_BYTES, pausePhotos, originalUploads,
    archiveAllPhotos, loadPausePhotos, pausePhotoUrl, originalUploadKey, teamOriginalFile, pauseOriginalFile,
    safeId, archivedTeamPhotos, archiveTeamPhoto, readOriginal, removeOriginal
  };
}

module.exports = { createPhotoStore };
