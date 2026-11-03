// Gedeelde hulpfuncties voor alle pagina's: geluid, confetti, aftelklok, media (foto blur, logo's),
// tekeningen, tabellen met vinkjes en de onthulling van de einduitslag.
window.QuizFX = (function () {
  let ctx = null;
  function audio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function unlockAudio() { audio(); }

  const style = document.createElement("style");
  style.textContent = `
    .rank-card { transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); transform: translateY(20px); opacity: 0; }
    .rank-card.show { transform: translateY(0); opacity: 1; }
    @keyframes pulse { 0% { transform: scale(0.98); } 100% { transform: scale(1.02); } }
  `;
  document.head.appendChild(style);

  function drumHit() {
    const c = audio(); if (!c) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.frequency.setValueAtTime(150, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.15);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + 0.15);
  }
  function fanfare() {
    const c = audio(); if (!c) return;
    [261.63, 329.63, 392.0, 523.25, 659.25, 783.99].forEach((freq, idx) => {
      const t = c.currentTime + idx * 0.12;
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t); osc.stop(t + 0.6);
    });
  }
  function alarm(isLocked) {
    const c = audio(); if (!c) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = isLocked ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(isLocked ? 350 : 500, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isLocked ? 200 : 900, c.currentTime + 0.25);
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + 0.25);
  }
  // Korte pieptoon bij een goed antwoord of als de tijd bijna om is
  function tick() {
    const c = audio(); if (!c) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + 0.12);
  }
  function launchConfetti() {
    if (typeof confetti !== "function") return;
    const end = Date.now() + 7000;
    const interval = setInterval(() => {
      if (Date.now() >= end) return clearInterval(interval);
      confetti({ particleCount: 50, spread: 360, startVelocity: 30, origin: { x: Math.random(), y: Math.random() - 0.2 } });
    }, 250);
  }

  // Aftelklok. info = { remainingMs, totalMs, running } of null. onTick krijgt { secs, fraction, running } of null.
  const clocks = {};
  function countdown(key, info, onTick) {
    if (clocks[key]) { clearInterval(clocks[key]); delete clocks[key]; }
    if (!info) return onTick(null);
    const total = info.totalMs || 1;
    const end = Date.now() + info.remainingMs;
    const tickFn = () => {
      const left = info.running ? Math.max(0, end - Date.now()) : info.remainingMs;
      onTick({ secs: Math.ceil(left / 1000), fraction: Math.min(1, left / total), running: info.running });
      if (left <= 0 && clocks[key]) { clearInterval(clocks[key]); delete clocks[key]; }
    };
    tickFn();
    if (info.running) clocks[key] = setInterval(tickFn, 250);
  }

  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const letter = (i) => LETTERS[i] || String(i + 1);

  // Plaatje of audio in een vak zetten. media = { kind: 'image' | 'audio', src }.
  function renderMedia(box, media, opts) {
    box.replaceChildren();
    if (!media || !media.src) return null;
    const options = opts || {};
    if (media.kind === "audio") {
      const a = document.createElement("audio");
      a.controls = true;
      a.autoplay = !!options.autoplay;
      a.src = media.src;
      box.appendChild(a);
      return a;
    }
    const img = document.createElement("img");
    img.src = media.src;
    img.className = "media-img";
    if (options.imgStyle) img.style.cssText = options.imgStyle;
    img.onerror = () => { img.replaceWith(placeholder("📷", "Plaatje ontbreekt", "width:100%;height:200px;border-radius:8px;")); };
    box.appendChild(img);
    return img;
  }

  function placeholder(emoji, text, css) {
    const d = document.createElement("div");
    d.className = "ph";
    d.style.cssText = css || "";
    const e = document.createElement("div");
    e.className = "pic";
    e.style.fontSize = "3em";
    e.textContent = emoji;
    const t = document.createElement("div");
    t.className = "cap";
    t.style.cssText = "font-size:0.9rem; margin-top:0.5em; background:rgba(0,0,0,0.45); padding:0.2em 0.8em; border-radius:6px;";
    t.textContent = text;
    d.append(e, t);
    return d;
  }

  // Foto die steeds scherper wordt: step 0 = heel wazig, step = max: helemaal scherp
  function blurPx(step, max) {
    if (!max) return 0;
    const f = Math.max(0, 1 - step / max);
    return Math.round(46 * Math.pow(f, 1.6) * 10) / 10;
  }
  function renderBlur(box, media, step, max, label) {
    let wrap = box.querySelector(".blurbox");
    if (!wrap || wrap.dataset.src !== (media && media.src)) {
      box.replaceChildren();
      wrap = document.createElement("div");
      wrap.className = "blurbox";
      wrap.dataset.src = (media && media.src) || "";
      wrap.style.cssText = "width:min(60vw,900px); height:min(34vh,480px); margin:0 auto;";
      const img = document.createElement("img");
      img.src = media ? media.src : "";
      img.alt = "";
      img.onerror = () => { img.remove(); const ph = placeholder("📷", label || "Foto ontbreekt"); wrap.appendChild(ph); };
      wrap.appendChild(img);
      box.appendChild(wrap);
    }
    const target = wrap.querySelector("img") || wrap.querySelector(".ph .pic");
    if (target) target.style.filter = `blur(${blurPx(step, max)}px)`;
    return wrap;
  }

  // Logo met weggelaten stukjes: een raster waarvan een deel is afgedekt
  function seeded(seedStr) {
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function renderLogo(box, media, hide, revealed, label) {
    box.replaceChildren();
    const wrap = document.createElement("div");
    wrap.className = "blurbox logobox";
    wrap.style.cssText = "width:min(46vw,640px); height:min(36vh,420px); margin:0 auto; background:#fff;";
    box.appendChild(wrap);
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);
    const img = new Image();
    img.onload = () => {
      const W = 900, H = Math.round(900 * (img.height / img.width)) || 600;
      canvas.width = W; canvas.height = H;
      const c = canvas.getContext("2d");
      c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
      c.drawImage(img, 0, 0, W, H);
      if (!revealed) {
        const cols = 6, rows = Math.max(3, Math.round(6 * H / W));
        const rnd = seeded(media.src);
        const tiles = [];
        for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) tiles.push([q, r]);
        tiles.sort(() => rnd() - 0.5);
        const n = Math.round(tiles.length * hide);
        c.fillStyle = "#e2e8f0";
        tiles.slice(0, n).forEach(([q, r]) => c.fillRect(Math.floor(q * W / cols), Math.floor(r * H / rows), Math.ceil(W / cols), Math.ceil(H / rows)));
      }
    };
    img.onerror = () => { wrap.replaceChildren(placeholder("🏷️", label || "Logo ontbreekt")); };
    img.src = media ? media.src : "";
  }

  // Tekening (lijst streken met punten 0..1000) op een canvas schilderen
  function paintStrokes(canvas, strokes) {
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.lineCap = "round"; c.lineJoin = "round";
    (strokes || []).forEach((s) => {
      if (!s.p || !s.p.length) return;
      c.strokeStyle = s.c; c.fillStyle = s.c; c.lineWidth = (s.w * w) / 600;
      if (s.p.length === 1) { c.beginPath(); c.arc(s.p[0][0] * w / 1000, s.p[0][1] * h / 1000, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      c.beginPath();
      c.moveTo(s.p[0][0] * w / 1000, s.p[0][1] * h / 1000);
      for (let i = 1; i < s.p.length; i++) c.lineTo(s.p[i][0] * w / 1000, s.p[i][1] * h / 1000);
      c.stroke();
    });
  }

  const euro = (n) => "€" + Number(n).toFixed(2).replace(".", ",");

  // Tabel met vinkjes: columns = [..], rows = [[cel, ...]], cel = tekst of { t, ok }
  function renderTable(box, page) {
    box.replaceChildren();
    if (!page) return;
    const table = document.createElement("table");
    table.className = "rtable";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    page.columns.forEach((c) => { const th = document.createElement("th"); th.textContent = c; hr.appendChild(th); });
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    page.rows.forEach((row) => {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        if (cell && typeof cell === "object") {
          if (cell.ok === true) { td.className = "good"; const i = document.createElement("span"); i.className = "ico-ok"; i.textContent = "✔ "; td.append(i); }
          else if (cell.ok === false) { td.className = "bad"; const i = document.createElement("span"); i.className = "ico-no"; i.textContent = "✘ "; td.append(i); }
          else td.className = "dim";
          td.append(document.createTextNode(cell.t));
        } else td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    box.appendChild(table);
  }

  function rankRow(player) {
    const li = document.createElement("li");
    li.className = "rank-card";
    li.style.padding = "0.6em 0.9em";
    li.style.borderRadius = "8px";
    li.style.marginBottom = "8px";
    const isWinner = player.rank === 1;
    let badge = `#${player.rank}`;
    if (player.rank === 1) { badge = "🥇 WINNAAR"; li.style.background = "#2563eb"; li.style.border = "2px solid #60a5fa"; }
    else if (player.rank === 2) { badge = "🥈 #2"; li.style.background = "#1e293b"; }
    else if (player.rank === 3) { badge = "🥉 #3"; li.style.background = "#1e293b"; }
    else li.style.background = "#0f172a";
    const label = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = badge;
    label.style.cssText = "display:inline-flex; align-items:center; gap:0.5em;";
    label.append(b);
    if (player.photo) label.append(avatar(player.name, player.photo, isWinner ? "2.4em" : "1.8em"));
    label.append(document.createTextNode(player.name));
    const pts = document.createElement("b");
    pts.textContent = `${player.score} pt`;
    pts.style.color = isWinner ? "#fde047" : "#38bdf8";
    pts.style.fontSize = isWinner ? "1.2em" : "1em";
    li.append(label, pts);
    return li;
  }
  function showWinners(scores, banner, winnerText) {
    const winners = scores.filter((s) => s.rank === 1).map((s) => s.name);
    if (!winners.length) return;
    winnerText.textContent = TEXTS[winners.length > 1 ? "einde.winnaars" : "einde.winnaar"] ? t(winners.length > 1 ? "einde.winnaars" : "einde.winnaar", { winnaar: winners.join(" & ") }) : `🏆 ${winners.join(" & ")} ${winners.length > 1 ? "WINNEN" : "WINT"} DE FAMILIEQUIZ! 🏆`;
    banner.classList.remove("hidden");
  }
  // Onthult de ranglijst van laatste naar eerste plaats (of meteen, met instant)
  function runReveal(scores, opts) {
    const { table, banner, winnerText, onFinish, instant } = opts;
    table.replaceChildren();
    banner.classList.add("hidden");
    if (instant) {
      scores.forEach((player) => { const li = rankRow(player); li.classList.add("show"); table.appendChild(li); });
      showWinners(scores, banner, winnerText);
      if (onFinish) onFinish();
      return () => {};
    }
    const timers = [];
    const reversed = [...scores].reverse();
    reversed.forEach((player, i) => {
      timers.push(setTimeout(() => {
        drumHit();
        const li = rankRow(player);
        table.prepend(li);
        timers.push(setTimeout(() => li.classList.add("show"), 50));
        if (i === reversed.length - 1) {
          showWinners(scores, banner, winnerText);
          fanfare();
          launchConfetti();
          if (onFinish) onFinish();
        }
      }, (i + 1) * 2200));
    });
    return () => timers.forEach(clearTimeout);
  }

  // Thema: kleuren via themes.css, plus vallende sneeuw of fonkels
  const FX = { winter: ["❄", "❅", "❆"], kerst: ["❄", "❅", "✨"], oudennieuw: ["✨", "⭐", "🎆"], halloween: ["🦇", "🍂"], zomer: [] };
  let currentTheme = null;
  function applyTheme(theme) {
    theme = theme || "standaard";
    if (theme === currentTheme) return;
    currentTheme = theme;
    document.body.dataset.theme = theme;
    document.querySelectorAll(".fx-layer").forEach((x) => x.remove());
    const chars = FX[theme];
    if (!chars || !chars.length) return;
    const layer = document.createElement("div");
    layer.className = "fx-layer" + (theme === "oudennieuw" ? " twinkle" : "");
    const n = document.body.classList.contains("tv") ? 36 : 16;
    for (let i = 0; i < n; i++) {
      const f = document.createElement("span");
      f.textContent = chars[i % chars.length];
      f.style.left = Math.random() * 100 + "vw";
      f.style.fontSize = (10 + Math.random() * 22) + "px";
      if (theme === "oudennieuw") { f.style.top = Math.random() * 100 + "vh"; f.style.animationDuration = (1.5 + Math.random() * 3) + "s"; }
      else f.style.animationDuration = (8 + Math.random() * 12) + "s";
      f.style.animationDelay = (-Math.random() * 15) + "s";
      f.style.color = theme === "kerst" || theme === "winter" ? "#fff" : "";
      layer.appendChild(f);
    }
    document.body.prepend(layer);
  }

  // Teksten uit de Excel (tabblad Teksten); {naam} wordt ingevuld
  let TEXTS = {};
  const setTexts = (t) => { if (t) TEXTS = t; };
  const t = (key, vars) => String(TEXTS[key] ?? key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));

  // Foto van de telefoon verkleinen tot een lichte JPEG (data-URL) voor de server
  async function compressPhoto(file, maxSide = 800, square = false) {
    if (!file) throw new Error("Kies eerst een foto.");
    const image = await createImageBitmap(file);
    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if (square) { const side = Math.min(sw, sh); sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side; }
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    if (image.close) image.close();
    let dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    if (dataUrl.length > 180000) dataUrl = canvas.toDataURL("image/jpeg", 0.45);
    if (dataUrl.length > 200000) throw new Error("De foto is nog te groot. Kies een kleinere foto.");
    return dataUrl;
  }
  // Rond teamfotootje (of de eerste letter van de teamnaam als er geen foto is)
  function avatar(name, photo, size) {
    const a = document.createElement(photo ? "img" : "span");
    a.className = "team-avatar";
    a.style.cssText = `width:${size};height:${size};border-radius:50%;object-fit:cover;flex:none;display:inline-flex;align-items:center;justify-content:center;background:#475569;color:#fff;font-weight:bold;font-size:calc(${size} * 0.45);vertical-align:middle;`;
    if (photo) { a.src = photo; a.alt = ""; }
    else a.textContent = (String(name || "?").trim()[0] || "?").toUpperCase();
    return a;
  }
  return { compressPhoto, avatar, setTexts, t, unlockAudio, drumHit, fanfare, alarm, tick, launchConfetti, countdown, letter, renderMedia, placeholder, renderBlur, blurPx, renderLogo, paintStrokes, renderTable, euro, runReveal, rankRow, showWinners, applyTheme };
})();

// Spotify: inloggen (PKCE) en afspelen in deze browser met de Web Playback SDK, zoals in de Hitster-app.
// Wordt gebruikt door de bediening (host): die logt in en start de liedjes, in de eigen browser of op een gekozen Spotify-apparaat.
window.QuizSpotify = (function () {
  const CLIENT_ID = localStorage.getItem("sp_client") || "3fc7ebb5540449dc92fa1ee9f4e97fff";
  const SCOPE = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";
  const redirect = () => location.origin + location.pathname;
  // Oude tokens zonder "streaming"-rechten tellen niet: dan opnieuw koppelen
  const connected = () => !!localStorage.getItem("sp_refresh") && localStorage.getItem("sp_scope") === SCOPE;
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  async function login() {
    if (!window.crypto || !crypto.subtle) throw new Error("Koppelen kan alleen via http://127.0.0.1:3000/host.html of een https-adres.");
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    localStorage.setItem("sp_verifier", verifier);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: redirect(), scope: SCOPE, code_challenge_method: "S256", code_challenge: challenge });
    location.href = "https://accounts.spotify.com/authorize?" + q;
  }
  async function tokenRequest(params) {
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, ...params }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error_description || d.error || "token");
    localStorage.setItem("sp_access", d.access_token);
    localStorage.setItem("sp_exp", String(Date.now() + (d.expires_in - 60) * 1000));
    if (d.refresh_token) localStorage.setItem("sp_refresh", d.refresh_token);
  }
  // Na terugkomen van Spotify: ?code=... of ?error=... afhandelen
  async function handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code"), err = q.get("error");
    if (!code && !err) return null;
    history.replaceState(null, "", location.pathname);
    if (err) return { ok: false, message: err === "access_denied" ? "toegang geweigerd" : err };
    try {
      await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect(), code_verifier: localStorage.getItem("sp_verifier") || "" });
      localStorage.setItem("sp_scope", SCOPE);
      return { ok: true };
    } catch (e) { return { ok: false, message: e.message }; }
  }
  async function token() {
    if (!connected()) return null;
    if (Date.now() > Number(localStorage.getItem("sp_exp") || 0)) {
      try { await tokenRequest({ grant_type: "refresh_token", refresh_token: localStorage.getItem("sp_refresh") }); }
      catch (e) { return null; }
    }
    return localStorage.getItem("sp_access");
  }
  async function api(method, path, body) {
    const t = await token();
    if (!t) return { status: 401, json: null };
    const r = await fetch("https://api.spotify.com/v1" + path, { method, headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let json = null;
    try { json = await r.json(); } catch (e) { /* 204 zonder inhoud */ }
    return { status: r.status, json };
  }
  async function find(title, artist) {
    const clean = String(title).replace(/\(.*?\)/g, "").replace(/\.\.\./g, "").trim();
    for (const q of [`track:"${clean}" artist:"${artist}"`, `${clean} ${artist}`]) {
      const r = await api("GET", `/search?q=${encodeURIComponent(q)}&type=track&limit=1&market=NL`);
      const item = r.json && r.json.tracks && r.json.tracks.items && r.json.tracks.items[0];
      if (item) return item;
      if (r.status === 401 || r.status === 403) return null;
    }
    return null;
  }
  const play = (uri, deviceId) => api("PUT", "/me/player/play" + (deviceId ? "?device_id=" + deviceId : ""), { uris: [uri], position_ms: 0 });
  const pause = (deviceId) => api("PUT", "/me/player/pause" + (deviceId ? "?device_id=" + deviceId : ""));
  async function devices() { const r = await api("GET", "/me/player/devices"); return { status: r.status, list: (r.json && r.json.devices) || [] }; }
  function disconnect() { ["sp_access", "sp_refresh", "sp_exp", "sp_scope"].forEach((k) => localStorage.removeItem(k)); }

  // Speler in deze browser
  let player = null;
  function startPlayer(name, onStatus) {
    return new Promise((resolve) => {
      const go = () => {
        player = new window.Spotify.Player({ name, getOAuthToken: (cb) => token().then((t) => cb(t || "")), volume: 0.9 });
        player.addListener("ready", ({ device_id }) => { onStatus(true, "Spotify-speler klaar"); resolve(device_id); });
        player.addListener("not_ready", () => onStatus(false, "Spotify-speler offline (internet?)"));
        player.addListener("initialization_error", (e) => { onStatus(false, "Deze browser kan Spotify niet afspelen (" + e.message + "). Gebruik Chrome, Edge of Firefox op een computer."); resolve(null); });
        player.addListener("authentication_error", (e) => { onStatus(false, "Spotify-login niet geldig: koppel opnieuw (" + e.message + ")"); resolve(null); });
        player.addListener("account_error", (e) => { onStatus(false, "Spotify Premium is nodig (" + e.message + ")"); resolve(null); });
        player.addListener("playback_error", (e) => onStatus(false, "Afspeelfout: " + e.message));
        player.connect();
      };
      if (window.Spotify && window.Spotify.Player) return go();
      window.onSpotifyWebPlaybackSDKReady = go;
      const s = document.createElement("script");
      s.src = "https://sdk.scdn.co/spotify-player.js";
      s.onerror = () => { onStatus(false, "De Spotify-speler kon niet laden (geen internet?)"); resolve(null); };
      document.head.appendChild(s);
    });
  }
  // Moet vanuit een klik of toetsdruk (autoplay-regels van de browser)
  const activate = () => { try { if (player && player.activateElement) player.activateElement(); } catch (e) { /* oudere SDK */ } };
  const resume = () => { if (player) player.resume().catch(() => {}); };

  // ---- Willekeurig nummer per categorie, zoals in de Hitster-app ----
  const SP_CATEGORIES = {
    original: { years: [1960, 2024], genres: null },
    guilty:   { years: [1985, 2015], genres: ["eurodance", "europop", "boy band", "dance pop", "schlager"] },
    rock:     { years: [1965, 2020], genres: ["rock", "classic rock", "hard rock", "alternative rock", "grunge", "punk"] },
    nederpop: { years: [1965, 2024], genres: ["dutch pop", "nederpop", "dutch rock", "nederlandstalig"] },
    summer:   { years: [1980, 2024], genres: ["latin pop", "reggaeton", "tropical house", "dance pop"] },
    "80s90s": { years: [1980, 1999], genres: null },
    "00s10s": { years: [2000, 2019], genres: null }
  };
  const CATEGORY_SEARCH = {
    original: ["top hits", "billboard classics", "pop classics", "world hits"],
    guilty: ["guilty pleasures", "meezingers", "90s party hits", "eurodance", "boybands hits"],
    rock: ["rock classics", "hard rock hits", "alternative rock classics", "guitar anthems"],
    nederpop: ["nederpop hits", "nederlandstalig", "top 40 nederland", "dutch hits"],
    summer: ["summer hits", "zomerhits", "latin pop hits", "beach party"],
    "80s90s": ["80s pop hits", "90s smash hits", "80s greatest", "90s dance"],
    "00s10s": ["2000s radio hits", "2010s pop anthems", "top hits 2010"]
  };
  // Heruitgaven, live, covers enz. geven vaak een verkeerd jaartal
  const SP_SKIP = /(karaoke|tribute|instrumental|remaster|\blive\b|remix|version|sped up|slowed|cover)/i;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const keyOf = (t) => `${t.title}|${t.artist}`.toLowerCase();

  // Controle achteraf: past het nummer echt in de categorie? (jaartal én genre van de artiest)
  const GENRE_OK = {
    guilty: /(euro|dance pop|boy band|girl group|schlager|bubblegum|italo|eurodance|party|teen pop|europop)/i,
    rock: /(rock|metal|grunge|punk|britpop|new wave|hard rock|glam)/i,
    nederpop: /(dutch|nederpop|nederlands|levenslied|flemish|carnaval|volendam)/i,
    summer: /(latin|reggaeton|tropical|dancehall|moombahton|soca|calypso|bachata|salsa|samba|zomer|beach)/i
  };
  const MIN_POP = { original: 55, "80s90s": 45, "00s10s": 45 };
  const inYears = (cfg, y) => Number.isInteger(y) && y >= cfg.years[0] && y <= cfg.years[1];

  // Sinds maart 2026 (ontwikkelmodus): max. 10 zoekresultaten, geen popularity, artiesten alleen één voor één opvragen
  let lastError = "";
  const genreCache = new Map();
  async function artistGenre(id) {
    if (genreCache.has(id)) return genreCache.get(id);
    const r = await api("GET", `/artists/${id}`);
    const g = r.status === 200 && r.json ? (r.json.genres || []).join(" | ") : null;
    genreCache.set(id, g);
    return g;
  }
  async function spotifyCandidates(cfg, q, offset) {
    const r = await api("GET", `/search?type=track&limit=10&market=NL&offset=${offset}&q=${encodeURIComponent(q)}`);
    if (r.status === 401 || r.status === 403 || r.status === 429) { lastError = `Spotify weigert het zoeken (fout ${r.status}${r.status === 429 ? ": te veel verzoeken, even wachten" : r.status === 401 ? ": opnieuw verbinden" : ""}).`; return { stop: true, items: [] }; }
    if (r.status !== 200 || !r.json) { lastError = `Spotify gaf fout ${r.status} bij het zoeken.`; return { items: [] }; }
    const items = ((r.json.tracks && r.json.tracks.items) || []).filter((i) =>
      i && i.uri && i.name && i.artists && i.artists.length && i.album && i.album.release_date &&
      i.album.album_type !== "compilation" && i.is_playable !== false && !SP_SKIP.test(i.name + " " + i.album.name) &&
      inYears(cfg, parseInt(i.album.release_date.slice(0, 4), 10)));
    return { items };
  }
  const asTrack = (t) => ({ title: t.name, artist: t.artists.slice(0, 2).map((a) => a.name).join(", "), year: parseInt(t.album.release_date.slice(0, 4), 10), uri: t.uri, source: "spotify" });
  async function spotifyTrack(cat, exclude) {
    const cfg = SP_CATEGORIES[cat] || SP_CATEGORIES.original;
    const rule = GENRE_OK[cat];
    const unknown = [], mismatch = []; // reserves: genre onbekend (Spotify gaf er geen) of genre klopt niet
    lastError = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      // Eerst willekeurig jaar + genre (zoals in Hitster), daarna alleen genre op een willekeurige plek in de resultaten
      let q;
      if (attempt < 5 || !cfg.genres) { q = "year:" + rnd(cfg.years[0], cfg.years[1]); if (cfg.genres) q += ' genre:"' + pick(cfg.genres) + '"'; }
      else q = 'genre:"' + pick(cfg.genres) + '"';
      const res = await spotifyCandidates(cfg, q, attempt < 3 ? rnd(0, 40) : rnd(0, 150));
      if (res.stop) break;
      const items = res.items.filter((t) => !exclude.has(keyOf(asTrack(t))));
      if (!items.length) continue;
      if (!rule) return asTrack(pick(items));
      // Genre van de artiest controleren (hooguit 3 artiesten per poging, om Spotify niet te overvragen)
      for (const t of [...items].sort(() => Math.random() - 0.5).slice(0, 3)) {
        const g = await artistGenre(t.artists[0].id);
        if (g && rule.test(g)) return asTrack(t);
        (g ? mismatch : unknown).push(t);
      }
    }
    // Liever een nummer uit het juiste jaarbereik (gevonden met het genre-filter van Spotify) dan niets
    if (unknown.length) return asTrack(pick(unknown));
    // Geen nummer uit een aantoonbaar verkeerde artiestencategorie gebruiken.
    if (!lastError) lastError = "Spotify vond geen passend nummer in deze categorie.";
    return null;
  }
  const ITUNES_GENRE = { rock: /(rock|metal|alternative|punk)/i, summer: /(latin|reggae|dance|pop|electronic)/i, guilty: /(pop|dance|electronic|schlager)/i };
  async function itunesTrack(cat, exclude) {
    const cfg = SP_CATEGORIES[cat] || SP_CATEGORIES.original;
    const terms = CATEGORY_SEARCH[cat] || CATEGORY_SEARCH.original;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(pick(terms))}&entity=song&limit=50&country=NL`);
        const data = await res.json();
        const valid = (data.results || []).filter((i) => i.previewUrl && i.trackName && i.releaseDate && i.collectionType !== "Compilation" &&
            (!ITUNES_GENRE[cat] || ITUNES_GENRE[cat].test(i.primaryGenreName || "")))
          .map((i) => ({ title: i.trackName, artist: i.artistName, year: new Date(i.releaseDate).getFullYear(), previewUrl: i.previewUrl, source: "itunes" }))
          .filter((t) => inYears(cfg, t.year) && !exclude.has(keyOf(t)) && !SP_SKIP.test(t.title));
        if (valid.length) return pick(valid);
      } catch (e) { /* geen internet of iTunes onbereikbaar */ }
    }
    return null;
  }
  // Eerst Spotify (volledig nummer), anders een iTunes-fragment van 30 seconden
  async function randomTrack(cat, excludeKeys) {
    const exclude = new Set(excludeKeys || []);
    // Eerst Spotify (volledig nummer, categorie gecontroleerd); lukt dat niet, dan een iTunes-fragment
    if (connected()) {
      const t = await spotifyTrack(cat, exclude);
      if (t) return t;
    }
    const it = await itunesTrack(cat, exclude);
    if (!it && !lastError) lastError = "iTunes vond ook niets (geen internet?).";
    return it;
  }

  return { connected, login, handleRedirect, find, play, pause, resume, devices, disconnect, startPlayer, activate, redirect, randomTrack, keyOf, lastError: () => lastError };
})();
