// Beveiliging van de bediening: toegangscode, bescherming tegen raden, sessies en limieten per verbinding.
const crypto = require('crypto');
const fs = require('fs');

// ---------- toegangscode ----------
const WORDS = ['appel', 'beer', 'bloem', 'boot', 'duin', 'egel', 'fiets', 'gans', 'haven', 'kaas', 'kerk', 'koe', 'maan', 'mol', 'molen', 'muis', 'peer', 'pier', 'polder', 'regen', 'ster', 'tulp', 'uil', 'vos', 'wind', 'zon'];
const generateCode = () => `${WORDS[crypto.randomInt(WORDS.length)]}-${WORDS[crypto.randomInt(WORDS.length)]}-${crypto.randomInt(100, 1000)}`;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
function sameCode(a, b) {
  // hoofdletters, spaties en streepjes maken niet uit; vergelijken in constante tijd
  const norm = (x) => String(x || '').trim().toLowerCase().replace(/[\s-]+/g, '');
  return crypto.timingSafeEqual(sha(norm(a)), sha(norm(b)));
}

// ---------- bescherming tegen herhaald proberen ----------
// Per adres: na 5 fouten 1 minuut wachten, na 10 fouten 5 minuten, na 15 fouten 30 minuten, daarna 2 uur.
// Daarnaast een algemene rem: meer dan 50 fouten in 10 minuten (van alle adressen samen) = iedereen 5 minuten wachten.
function createGuard() {
  const byIp = new Map();
  let global = [];
  let globalLockUntil = 0;
  const lockFor = (n) => (n >= 20 ? 2 * 3600e3 : n >= 15 ? 30 * 60e3 : n >= 10 ? 5 * 60e3 : n >= 5 ? 60e3 : 0);
  return {
    blocked(ip) {
      const now = Date.now();
      if (now < globalLockUntil) return Math.ceil((globalLockUntil - now) / 1000);
      const e = byIp.get(ip);
      return e && now < e.until ? Math.ceil((e.until - now) / 1000) : 0;
    },
    fail(ip) {
      const now = Date.now();
      const e = byIp.get(ip) || { count: 0, until: 0, last: 0 };
      if (now - e.last > 24 * 3600e3) e.count = 0;
      e.count++; e.last = now; e.until = now + lockFor(e.count);
      byIp.set(ip, e);
      global = global.filter((t) => now - t < 10 * 60e3); global.push(now);
      if (global.length > 50) globalLockUntil = now + 5 * 60e3;
      return { count: e.count, waitSec: Math.ceil(lockFor(e.count) / 1000) };
    },
    success(ip) { byIp.delete(ip); }
  };
}

// ---------- sessies: na één keer inloggen hoeft de code niet op het toestel bewaard te worden ----------
function createSessions(file, ttlMs = 36 * 3600e3) {
  let store = {};
  try { store = JSON.parse(fs.readFileSync(file, 'utf8')).sessions || {}; } catch (e) { store = {}; }
  const save = () => { try { fs.writeFileSync(file, JSON.stringify({ version: 1, sessions: store })); } catch (e) { /* niet fataal */ } };
  const clean = () => { const now = Date.now(); for (const [k, v] of Object.entries(store)) if (!v || v.exp < now) delete store[k]; };
  return {
    create() { clean(); const token = crypto.randomBytes(24).toString('base64url'); store[sha(token).toString('hex')] = { exp: Date.now() + ttlMs }; save(); return token; },
    valid(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return false;
      const k = sha(token).toString('hex');
      const v = store[k];
      if (!v || v.exp < Date.now()) return false;
      v.exp = Date.now() + ttlMs; // verlengen bij gebruik
      return true;
    },
    revokeAll() { store = {}; save(); },
    count() { clean(); return Object.keys(store).length; }
  };
}

// ---------- limieten per verbinding ----------
// Hoeveel berichten per 10 seconden, en hoe groot een bericht mag zijn, per soort actie.
const LIMITS = {
  draw_ops: { per10s: 400, bytes: 64e3 }, demo_ops: { per10s: 400, bytes: 64e3 },
  upload_xlsx: { per10s: 2, bytes: 5e6 }, set_team_photo: { per10s: 3, bytes: 260e3 }, pause_photo: { per10s: 4, bytes: 700e3 }, react: { per10s: 12, bytes: 200 },
  provide_track: { per10s: 20, bytes: 20e3 }, provide_start: { per10s: 10, bytes: 60e3 },
  library_year_results: { per10s: 20, bytes: 300e3 }, library_add_tracks: { per10s: 20, bytes: 600e3 },
  register_remote: { per10s: 5, bytes: 1e3 }, player_blurred: { per10s: 30, bytes: 1e3 }, player_back: { per10s: 30, bytes: 1e3 },
  default: { per10s: 60, bytes: 16e3 }
};
function payloadBytes(args) {
  let n = 0;
  for (const a of args) {
    if (typeof a === 'function') continue;
    if (Buffer.isBuffer(a) || a instanceof ArrayBuffer || ArrayBuffer.isView(a)) n += a.byteLength;
    else { try { n += Buffer.byteLength(JSON.stringify(a) || ''); } catch (e) { n += 1e9; } }
  }
  return n;
}
function createRateLimiter() {
  return (socket, event, args) => {
    const lim = LIMITS[event] || LIMITS.default;
    const size = payloadBytes(args);
    if (size > lim.bytes) return { ok: false, reason: 'too_big', size, max: lim.bytes };
    const now = Date.now();
    const box = (socket.data.rate = socket.data.rate || {});
    const r = (box[event] = box[event] || { t: now, n: 0 });
    if (now - r.t > 10e3) { r.t = now; r.n = 0; }
    r.n++;
    // de ingelogde bediening is vertrouwd: ruimere grens (alleen bedoeld tegen een op hol geslagen toestel)
    if (r.n > lim.per10s * (socket.data.role === 'remote' ? 10 : 1)) return { ok: false, reason: 'too_many', count: r.n };
    return { ok: true };
  };
}

// Acties die alleen de ingelogde bediening mag doen (extra controle bovenop de controle in elke actie zelf)
const REMOTE_ONLY = new Set(['add_bots', 'add_extra', 'add_time', 'alert_dismiss', 'blur_next', 'clear_answer', 'demo_ops', 'draw_judge', 'end_view', 'goto_step',
  'host_force', 'host_main', 'library_add_tracks', 'library_checklist', 'library_year_results', 'lobby_stage', 'logo_judge', 'memory_judge', 'move_player',
  'prev_step', 'provide_start', 'provide_track', 'reload_quiz', 'remove_bots', 'remove_extra', 'remove_team', 'remove_team_photo', 'rename_player',
  'rename_team', 'reset_quiz', 'review_close', 'review_nav', 'review_open', 'set_base', 'set_max_teams', 'set_plan', 'set_playlists', 'set_cheat_sound', 'song_judge', 'adjust_score',
  'set_theme', 'skip_step', 'song_pause', 'song_replay', 'thirty_toggle', 'toggle_pause', 'toggle_standings', 'toggle_positions', 'undo_last', 'update_hitster', 'update_settings',
  'upload_xlsx', 'verify_year', 'void_question', 'playlist_failed', 'backup_now', 'backup_list', 'log_tail', 'logout_all', 'team_overview']);
// Acties van de quizmaster die in het logboek komen
const LOGGED = new Set(['host_force', 'skip_step', 'prev_step', 'goto_step', 'reset_quiz', 'undo_last', 'void_question', 'remove_team', 'move_player', 'set_base',
  'rename_team', 'rename_player', 'upload_xlsx', 'reload_quiz', 'update_settings', 'update_hitster', 'add_extra', 'remove_extra', 'set_plan', 'add_bots',
  'remove_bots', 'clear_answer', 'logout_all', 'backup_now', 'set_playlists', 'remove_team_photo']);

module.exports = { generateCode, sameCode, createGuard, createSessions, createRateLimiter, REMOTE_ONLY, LOGGED };
