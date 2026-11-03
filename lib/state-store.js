'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write a JSON snapshot atomically and keep the previous valid snapshot as a
 * recovery copy. The backup is rotated only when the current file is valid.
 */
function writeJsonWithBackup(file, value) {
  const dir = path.dirname(file);
  const tmp = file + '.tmp';
  const backup = file + '.bak';
  const backupTmp = backup + '.tmp';

  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tmp, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(tmp, 0o600);

    const current = parseFile(file);
    if (current && typeof current === 'object') {
      fs.copyFileSync(file, backupTmp);
      fs.renameSync(backupTmp, backup);
    }

    fs.renameSync(tmp, file);
  } catch (error) {
    for (const candidate of [tmp, backupTmp]) {
      try { fs.unlinkSync(candidate); } catch { /* temporary file may not exist */ }
    }
    throw error;
  }
}

/**
 * Prefer the newest snapshot. If it is missing or corrupt, fall back to the
 * last known-good backup. Returns null when neither file contains valid JSON.
 */
function readJsonWithBackup(file, validate = null) {
  const usable = (value) => value && typeof value === 'object' && (!validate || validate(value));
  const primary = parseFile(file);
  if (usable(primary)) return { data: primary, source: 'primary' };

  const backup = parseFile(file + '.bak');
  if (usable(backup)) return { data: backup, source: 'backup' };

  return null;
}

function removeStateFiles(file) {
  for (const candidate of [file, file + '.tmp', file + '.bak', file + '.bak.tmp']) {
    try { fs.unlinkSync(candidate); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { writeJsonWithBackup, readJsonWithBackup, removeStateFiles };
