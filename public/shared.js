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
  // Vrolijke "ding" bij een goed antwoord en een "whoosh" bij een nieuwe ronde
  // Eindsignaal als de tijd op is, en een triomfantelijk slotakkoord voor de winnaar
  function buzzer() {
    const c = audio(); if (!c) return;
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = "sawtooth"; osc.frequency.setValueAtTime(220, c.currentTime); osc.frequency.linearRampToValueAtTime(140, c.currentTime + 0.6);
    gain.gain.setValueAtTime(0.18, c.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.65);
    osc.connect(gain); gain.connect(c.destination); osc.start(); osc.stop(c.currentTime + 0.66);
  }
  function triumph() {
    const c = audio(); if (!c) return;
    fanfare();
    const t0 = c.currentTime + 0.8;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => { // groot slotakkoord (C-groot)
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = "triangle"; osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0); gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.2);
      osc.connect(gain); gain.connect(c.destination); osc.start(t0); osc.stop(t0 + 2.3);
    });
  }
  function ding() {
    const c = audio(); if (!c) return;
    [880, 1320].forEach((f, i) => {
      const osc = c.createOscillator(), gain = c.createGain(), t0 = c.currentTime + i * 0.12;
      osc.type = "triangle"; osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0); gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
      osc.connect(gain); gain.connect(c.destination); osc.start(t0); osc.stop(t0 + 0.42);
    });
  }
  function whoosh() {
    const c = audio(); if (!c) return;
    const len = Math.floor(c.sampleRate * 0.7), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = c.createBufferSource(), filt = c.createBiquadFilter(), gain = c.createGain();
    src.buffer = buf; filt.type = "bandpass"; filt.frequency.setValueAtTime(400, c.currentTime); filt.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.6);
    gain.gain.value = 0.25; src.connect(filt); filt.connect(gain); gain.connect(c.destination); src.start();
  }
  // Eigen confetti (zonder internet of extra bibliotheek): gekleurde snippers die over het scherm dwarrelen
  function simpleConfetti(ms = 7000) {
    const c = document.createElement("canvas");
    c.style.cssText = "position:fixed; inset:0; width:100vw; height:100vh; pointer-events:none; z-index:90;";
    document.body.appendChild(c);
    const g = c.getContext("2d");
    const fit = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    fit();
    const colors = ["#f43f5e", "#fbbf24", "#22c55e", "#3b82f6", "#a855f7", "#f97316", "#ffffff"];
    const parts = [];
    const spawn = (n) => { for (let i = 0; i < n; i++) parts.push({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.3, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, col: colors[Math.floor(Math.random() * colors.length)] }); };
    const end = Date.now() + ms;
    spawn(160);
    const tick = () => {
      g.clearRect(0, 0, c.width, c.height);
      if (Date.now() < end && parts.length < 400) spawn(6);
      parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].y > c.height + 30) parts.splice(i, 1);
      if (Date.now() < end + 4000 && parts.length) requestAnimationFrame(tick); else c.remove();
    };
    requestAnimationFrame(tick);
  }
  function launchConfetti() {
    if (typeof confetti !== "function") return simpleConfetti();
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
      // Het kader krijgt de verhouding van de foto zelf (staand, liggend of vierkant), binnen de ruimte op het scherm
      wrap.style.cssText = "width:min(60vw,900px); height:min(34vh,480px); margin:0 auto;";
      const img = document.createElement("img");
      img.onload = () => {
        const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
        wrap.style.cssText = `aspect-ratio:${ratio}; height:auto; width:min(80vw, ${ratio >= 1 ? "1100px" : "560px"}, calc(52vh * ${ratio.toFixed(3)})); margin:0 auto;`;
        img.style.cssText += "width:100%; height:100%; object-fit:contain;";
      };
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
    // Duidelijk eindklassement: goud, zilver en brons vallen meteen op
    if (player.rank === 1) { badge = "🥇 WINNAAR"; li.style.background = "linear-gradient(90deg, #b45309, #f59e0b)"; li.style.border = "3px solid #fde68a"; li.style.fontSize = "1.25em"; li.style.boxShadow = "0 0 2vw rgba(251,191,36,0.55)"; }
    else if (player.rank === 2) { badge = "🥈 #2"; li.style.background = "linear-gradient(90deg, #475569, #94a3b8)"; li.style.fontSize = "1.1em"; }
    else if (player.rank === 3) { badge = "🥉 #3"; li.style.background = "linear-gradient(90deg, #7c2d12, #c2410c)"; li.style.fontSize = "1.05em"; }
    else li.style.background = "#0f172a";
    const label = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = badge;
    label.style.cssText = "display:inline-flex; align-items:center; gap:0.5em;";
    label.append(b);
    label.append(avatar(player.name, player.photo, isWinner ? "2.4em" : "1.8em", player.color));
    if (player.color) li.style.borderLeft = `0.45em solid ${player.color}`;
    label.append(document.createTextNode(player.name));
    const pts = document.createElement("b");
    pts.textContent = `${player.score} pt`;
    pts.style.color = isWinner ? "#fff" : player.rank <= 3 ? "#fef3c7" : "#38bdf8";
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

  // Scherm wakker houden (tv, bediening en telefoons). Wake Lock werkt alleen via https of localhost; op het
  // lokale wifi-adres (http://192.168...) dus niet. Dan als reserve een onzichtbaar, stil "filmpje" dat de browser
  // wakker houdt. Opnieuw aanvragen zodra het scherm weer zichtbaar is, en bij elke tik (video mag pas na een tik).
  let wakeLock = null, wakeVideo = null, wakeTick = null, wakeListeners = false;
  async function keepAwake() {
    if (!keepAwake.wanted) return;
    try {
      if ("wakeLock" in navigator) {
        if (!wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
        if (!keepAwake.wanted) releaseAwake(); // intussen uitgezet
        return;
      }
    } catch (e) { /* niet toegestaan: reserve hieronder */ }
    try {
      if (!wakeVideo) {
        const c = document.createElement("canvas"); c.width = c.height = 2;
        const g = c.getContext("2d");
        wakeTick = setInterval(() => { g.fillStyle = Date.now() % 2000 < 1000 ? "#000" : "#010101"; g.fillRect(0, 0, 2, 2); }, 1000);
        wakeVideo = document.createElement("video");
        wakeVideo.muted = true; wakeVideo.playsInline = true; wakeVideo.setAttribute("playsinline", ""); wakeVideo.setAttribute("muted", "");
        wakeVideo.style.cssText = "position:fixed; width:1px; height:1px; opacity:0.01; pointer-events:none; bottom:0; right:0;";
        if (c.captureStream) wakeVideo.srcObject = c.captureStream(1);
        document.body.appendChild(wakeVideo);
      }
      if (wakeVideo.paused) await wakeVideo.play();
    } catch (e) { /* lukt niet zonder tik: bij de volgende tik opnieuw */ }
  }
  function releaseAwake() {
    keepAwake.wanted = false;
    if (wakeLock) { const l = wakeLock; wakeLock = null; l.release().catch(() => {}); }
    if (wakeVideo) { try { wakeVideo.pause(); wakeVideo.srcObject = null; wakeVideo.remove(); } catch (e) { /* niets */ } wakeVideo = null; }
    if (wakeTick) { clearInterval(wakeTick); wakeTick = null; }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && keepAwake.wanted) keepAwake(); });
  // Mag vaak aangeroepen worden: de luisteraars voor "opnieuw bij een tik" worden maar één keer toegevoegd
  function wantAwake() {
    keepAwake.wanted = true;
    keepAwake();
    if (wakeListeners) return;
    wakeListeners = true;
    const again = () => { if (keepAwake.wanted) keepAwake(); };
    document.addEventListener("click", again, { passive: true });
    document.addEventListener("touchend", again, { passive: true });
    document.addEventListener("keydown", again);
  }

  // Foto van de telefoon verkleinen tot een lichte JPEG (data-URL) voor de server
  async function compressPhoto(file, maxSide = 800, square = false, maxChars = 200000) {
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
    if (dataUrl.length > maxChars * 0.9) dataUrl = canvas.toDataURL("image/jpeg", 0.45);
    if (dataUrl.length > maxChars) throw new Error("De foto is nog te groot. Kies een kleinere foto.");
    return dataUrl;
  }
  // Foto op ware grootte voor het album: opnieuw opgeslagen als JPEG (90%), zodat de rotatie klopt en de
  // locatiegegevens (GPS in EXIF) er niet in zitten. Maximaal 4096 px: groter lukt een iPhone-canvas niet.
  async function fullPhoto(file) {
    const image = await createImageBitmap(file);
    try {
      for (const maxSide of [4096, 3072, 2048]) {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
        canvas.width = canvas.height = 0; // geheugen vrijgeven
        if (blob && blob.size > 0 && blob.size < 15 * 1024 * 1024) return blob;
      }
    } finally { if (image.close) image.close(); }
    throw new Error("Foto op ware grootte lukte niet");
  }
  // Stuur het origineel na (op de achtergrond). Mislukt het, dan blijft de kleine versie in het album staan.
  async function uploadOriginal(file, key) {
    if (!file || !key) return false;
    try {
      const blob = await fullPhoto(file);
      const r = await fetch(`/origineel/${encodeURIComponent(key)}`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      return r.ok;
    } catch (e) { return false; }
  }
  // Geluiden kunnen op de tv of op de bediening klinken. De tv zet een "route": geeft die false terug, dan speelt
  // het geluid hier niet (de tv stuurt het dan door naar de bediening). Ook interne aanroepen gaan via de route.
  let soundRoute = null;
  function setSoundRoute(fn) { soundRoute = typeof fn === "function" ? fn : null; }
  const routed = (name, fn) => function (...args) {
    try { if (soundRoute && soundRoute(name, args) === false) return; } catch (e) { /* dan gewoon hier */ }
    return fn.apply(this, args);
  };
  buzzer = routed("buzzer", buzzer); triumph = routed("triumph", triumph); ding = routed("ding", ding);
  whoosh = routed("whoosh", whoosh); drumHit = routed("drumHit", drumHit); fanfare = routed("fanfare", fanfare); tick = routed("tick", tick);

  // Trillen. Android: de Vibration API. iPhone kent die niet; sinds iOS 18 geeft Safari wel een korte "tik"
  // (haptische feedback) bij een schakelaar (<input switch>). Die truc gebruiken we als reserve: één tik per puls.
  let hapticLabel = null;
  function iosTap() {
    try {
      if (!hapticLabel) {
        hapticLabel = document.createElement("label");
        hapticLabel.setAttribute("aria-hidden", "true");
        hapticLabel.style.cssText = "position:fixed; left:-9999px; top:0; width:1px; height:1px; overflow:hidden; opacity:0;";
        const sw = document.createElement("input");
        sw.type = "checkbox"; sw.setAttribute("switch", ""); sw.tabIndex = -1;
        hapticLabel.appendChild(sw);
        document.body.appendChild(hapticLabel);
      }
      hapticLabel.click();
    } catch (e) { /* geen trillen mogelijk */ }
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function haptic(pattern) {
    const p = Array.isArray(pattern) ? pattern : [pattern || 60];
    try { if (navigator.vibrate && !isIOS) { navigator.vibrate(p); return; } } catch (e) { /* reserve hieronder */ }
    if (!isIOS) return;
    let t = 0;
    p.forEach((ms, i) => { if (i % 2 === 0) setTimeout(iosTap, t); t += ms; });
  }

  // Rond teamfotootje (of de eerste letter van de teamnaam als er geen foto is)
  function avatar(name, photo, size, color) {
    const a = document.createElement(photo ? "img" : "span");
    a.className = "team-avatar";
    a.style.cssText = `width:${size};height:${size};border-radius:50%;object-fit:cover;flex:none;display:inline-flex;align-items:center;justify-content:center;background:${color || "#475569"};color:#fff;font-weight:bold;font-size:calc(${size} * 0.45);vertical-align:middle;box-sizing:border-box;${color ? `border:max(2px, calc(${size} * 0.06)) solid ${color};` : ""}`;
    if (photo) { a.src = photo; a.alt = ""; }
    else a.textContent = (Array.from(String(name || "?").trim())[0] || "?").toUpperCase(); // Array.from: ook emoji als eerste teken
    return a;
  }
  // ---------- Uitslag als plaatje (om te delen in de familie-app) ----------
  const loadImg = (src) => new Promise((resolve) => { if (!src) return resolve(null); const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
  async function resultImage({ title, subtitle, rows }) {
    try { await document.fonts.load("bold 60px Quizfont"); } catch (e) { /* standaardletter */ }
    const W = 1080, rowH = 150, top = 330, H = Math.min(2400, top + rows.length * rowH + 140);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#1e1b4b"); bg.addColorStop(1, "#0f172a");
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const font = (px) => `bold ${px}px Quizfont, "Segoe UI", Roboto, sans-serif`;
    g.textAlign = "center"; g.fillStyle = "#fbbf24"; g.font = font(78); g.fillText("🏆 " + (title || "Familiequiz"), W / 2, 130);
    g.fillStyle = "#cbd5e1"; g.font = font(40); g.fillText(subtitle || "", W / 2, 200);
    g.fillStyle = "#38bdf8"; g.font = font(44); g.fillText("Einduitslag", W / 2, 280);
    const imgs = await Promise.all(rows.map((r) => loadImg(r.photo)));
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      if (y + rowH > H - 100) return;
      g.fillStyle = r.rank === 1 ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.06)";
      g.beginPath(); (g.roundRect ? g.roundRect(60, y, W - 120, rowH - 20, 26) : g.rect(60, y, W - 120, rowH - 20)); g.fill();
      g.fillStyle = r.color || "#475569"; g.fillRect(60, y, 14, rowH - 20);
      g.textAlign = "left"; g.font = font(54); g.fillStyle = "#fff";
      g.fillText(r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : `#${r.rank}`, 100, y + 82);
      const cx = 270, cy = y + (rowH - 20) / 2, rad = 50;
      g.save(); g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.closePath();
      if (imgs[i]) {
        g.clip();
        const im = imgs[i], side = Math.min(im.width, im.height);
        g.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, cx - rad, cy - rad, rad * 2, rad * 2);
      } else {
        g.fillStyle = r.color || "#475569"; g.fill();
        g.fillStyle = "#fff"; g.font = font(48); g.textAlign = "center"; g.fillText((Array.from(r.name || "?")[0] || "?").toUpperCase(), cx, cy + 17);
      }
      g.restore();
      g.strokeStyle = r.color || "#94a3b8"; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      g.textAlign = "left"; g.fillStyle = "#fff"; g.font = font(46);
      let name = r.name; while (g.measureText(name).width > 520 && name.length > 3) name = name.slice(0, -2) + "…";
      g.fillText(name, 350, y + 80);
      g.textAlign = "right"; g.fillStyle = "#fbbf24"; g.font = font(50); g.fillText(`${r.score}`, W - 100, y + 82);
    });
    g.textAlign = "center"; g.fillStyle = "#64748b"; g.font = font(30); g.fillText("Familiequiz · bedankt voor het meespelen!", W / 2, H - 50);
    return new Promise((resolve) => c.toBlob(resolve, "image/png"));
  }
  // Delen via het deelmenu van de telefoon (WhatsApp e.d.); kan dat niet, dan downloaden
  async function shareImage(blob, filename, text) {
    const file = new File([blob], filename, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Familiequiz", text }); return "shared"; }
    } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return "downloaded";
  }

  return { buzzer, triumph, ding, whoosh, resultImage, shareImage, wantAwake, releaseAwake, compressPhoto, uploadOriginal, setSoundRoute, haptic, avatar, setTexts, t, unlockAudio, drumHit, fanfare, alarm, tick, launchConfetti, countdown, letter, renderMedia, placeholder, renderBlur, blurPx, renderLogo, paintStrokes, renderTable, euro, runReveal, rankRow, showWinners, applyTheme };
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
    return { status: r.status, json, retryAfter: Number(r.headers && r.headers.get && r.headers.get("retry-after")) || 0 };
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
    "00s10s": { years: [2000, 2019], genres: null },
    // Overige Hitster-edities: als hun playlist op is (of ontbreekt) wordt hiermee gezocht
    refresh: { years: [1960, 2025], genres: null },
    top40: { years: [1965, 2025], genres: ["dutch pop", "nederpop", "dance pop", "pop"] },
    hiphop: { years: [1985, 2025], genres: ["hip hop", "rap", "dutch hip hop"] },
    soundtracks: { years: [1960, 2025], genres: ["soundtrack", "movie tunes", "show tunes"] },
    christmas: { years: [1950, 2025], genres: ["christmas"] },
    celebration: { years: [1960, 2025], genres: ["dance pop", "disco", "party"] },
    bingo: { years: [1960, 2025], genres: null },
    battle1: { years: [1950, 1984], genres: null }, battle2: { years: [1985, 2004], genres: null }, battle3: { years: [2005, 2025], genres: null },
    flyingmic: { years: [1960, 2025], genres: null }
  };
  const CATEGORY_SEARCH = {
    original: ["top hits", "billboard classics", "pop classics", "world hits"],
    guilty: ["guilty pleasures", "meezingers", "90s party hits", "eurodance", "boybands hits"],
    rock: ["rock classics", "hard rock hits", "alternative rock classics", "guitar anthems"],
    nederpop: ["nederpop hits", "nederlandstalig", "top 40 nederland", "dutch hits"],
    summer: ["summer hits", "zomerhits", "latin pop hits", "beach party"],
    "80s90s": ["80s pop hits", "90s smash hits", "80s greatest", "90s dance"],
    "00s10s": ["2000s radio hits", "2010s pop anthems", "top hits 2010"],
    refresh: ["top hits", "pop classics"], top40: ["top 40 nederland", "dutch hits"], hiphop: ["hip hop classics", "rap hits"],
    soundtracks: ["movie soundtrack hits", "film music"], christmas: ["christmas hits", "kerst hits"], celebration: ["party hits", "feest hits"],
    bingo: ["top hits", "party hits"], battle1: ["60s hits", "70s hits", "oldies"], battle2: ["80s hits", "90s hits"], battle3: ["2010s hits", "2020s hits"], flyingmic: ["meezingers", "sing along hits"]
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
    hiphop: /(hip hop|rap|trap|drill|grime|r&b|urban)/i,
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
  // ---------- Officiële Hitster-playlists ----------
  // Playlist één keer helemaal ophalen (per bediening-sessie bewaard). Spotify heeft het eindpunt /items
  // (nieuw) en /tracks (oud); we proberen beide, zodat het blijft werken.
  const playlistCache = {};
  async function playlistTracks(id) {
    if (playlistCache[id]) return playlistCache[id];
    const list = [];
    for (const kind of ["items", "tracks"]) {
      list.length = 0;
      let offset = 0, total = 1, failed = null;
      while (offset < total && offset < 2000) {
        const r = await api("GET", `/playlists/${id}/${kind}?market=NL&limit=50&offset=${offset}`);
        if (r.status !== 200 || !r.json) { failed = r.status; break; }
        total = r.json.total || 0;
        for (const it of r.json.items || []) {
          const t = it && (it.track || it.item);
          if (!t || t.type === "episode" || t.is_local || !t.uri || !t.name || !t.artists || !t.album || !t.album.release_date) continue;
          list.push({ title: t.name, artist: t.artists.slice(0, 2).map((a) => a.name).join(", "), firstArtist: t.artists[0].name,
            year: parseInt(t.album.release_date.slice(0, 4), 10), uri: t.uri, albumType: t.album.album_type, albumName: t.album.name || "" });
        }
        if (!(r.json.items || []).length) break;
        offset += (r.json.items || []).length;
      }
      if (!failed && list.length) return (playlistCache[id] = [...list]);
      if (failed === 401) { lastError = "Spotify-login verlopen: ontkoppel en verbind opnieuw."; return null; }
      if (failed) lastError = `Spotify geeft deze playlist niet vrij (fout ${failed}). Tip: kopieer de Hitster-playlist in Spotify naar een eigen playlist en plak die link.`;
    }
    return null;
  }
  // Hitster gebruikt het jaar van de eerste uitgave. Spotify geeft vaak het jaar van een remaster of verzamelalbum:
  // daarom zoeken we het vroegste jaar van hetzelfde nummer van dezelfde artiest.
  const norm = (x) => String(x || "").toLowerCase().replace(/\(.*?\)|\[.*?\]|-.*remaster.*$|- .*version.*$/g, "").replace(/[^a-z0-9à-ÿ ]/g, "").replace(/\s+/g, " ").trim();
  async function earliestYear(t) {
    try {
      const title = norm(t.title);
      const r = await api("GET", `/search?type=track&limit=10&market=NL&q=${encodeURIComponent(`track:"${title}" artist:"${t.firstArtist || t.artist}"`)}`);
      const items = (r.json && r.json.tracks && r.json.tracks.items) || [];
      const years = items.filter((i) => i && i.album && i.album.release_date && norm(i.name) === title && i.artists.some((a) => norm(a.name) === norm(t.firstArtist || t.artist)))
        .map((i) => parseInt(i.album.release_date.slice(0, 4), 10)).filter((y) => y > 1900);
      return years.length ? Math.min(t.year, ...years) : t.year;
    } catch (e) { return t.year; }
  }
  // Jaartal controleren voor de knop "Jaartallen controleren": { ok, year }. Bij te veel verzoeken (429) even wachten.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function checkYear(t) {
    const title = norm(t.title), first = String(t.artist || "").split(/ & |, /)[0];
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await api("GET", `/search?type=track&limit=10&market=NL&q=${encodeURIComponent(`track:"${title}" artist:"${first}"`)}`);
      if (r.status === 429) { await sleep(Math.min(60, r.retryAfter || 5 * (attempt + 1)) * 1000); continue; }
      if (r.status === 401) { lastError = "Spotify-login verlopen: ontkoppel en verbind opnieuw."; return { ok: false, year: t.year, stop: true }; }
      if (r.status !== 200) return { ok: false, year: t.year };
      const items = (r.json && r.json.tracks && r.json.tracks.items) || [];
      const years = items.filter((i) => i && i.album && i.album.release_date && norm(i.name) === title && i.artists.some((a) => norm(a.name) === norm(first)))
        .map((i) => parseInt(i.album.release_date.slice(0, 4), 10)).filter((y) => y > 1900);
      // Niets gevonden? Dan is het jaar niet te controleren: niet als gecontroleerd markeren
      return years.length ? { ok: true, year: Math.min(t.year, ...years) } : { ok: false, year: t.year };
    }
    return { ok: false, year: t.year };
  }
  // Alle playlists van het officiële Hitster-account op Spotify
  const HITSTER_USER = "ta8hnikdhdctwuvkj2nl9itix";
  async function hitsterAccountPlaylists() {
    const all = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const r = await api("GET", `/users/${HITSTER_USER}/playlists?limit=50&offset=${offset}`);
      if (r.status !== 200 || !r.json) break;
      all.push(...(r.json.items || []).filter((p) => p && p.id));
      if (!r.json.next) break;
    }
    return all;
  }
  async function playlistTrack(id, exclude) {
    const all = await playlistTracks(id);
    if (!all) return null;
    const free = all.filter((t) => !exclude.has(keyOf(t)));
    if (!free.length) { lastError = "Alle nummers uit deze Hitster-playlist zijn al gebruikt."; return null; }
    const t = pick(free);
    const year = await earliestYear(t);
    const title = t.title.replace(/\s+-\s+.*(remaster|version|mono|stereo).*$/i, "").replace(/\s*[([][^)\]]*(remaster|version)[^)\]]*[)\]]/i, "").trim();
    return { title, artist: t.artist, year, uri: t.uri, source: "hitster" };
  }
  // Officiële Hitster-playlists automatisch opzoeken (account HITSTER), met voorkeur voor de Nederlandse versie
  const EDITION_QUERY = {
    original: "HITSTER Nederlands", refresh: "HITSTER Original Refresh", nederpop: "HITSTER 100% NL", top40: "HITSTER Top 40 NL",
    guilty: "HITSTER Guilty Pleasures", summer: "HITSTER Summer Party", rock: "HITSTER Rock", hiphop: "HITSTER Hip Hop",
    soundtracks: "HITSTER Soundtracks", christmas: "HITSTER Christmas", celebration: "HITSTER Celebration", bingo: "HITSTER Bingo",
    battle1: "HITSTER Battle of the Generations", battle2: "HITSTER Battle of the Generations", battle3: "HITSTER Battle of the Generations", flyingmic: "HITSTER Flying Mic"
  };
  const FOREIGN = /(deutsch|german|\bde\b|\buk\b|\bus\b|usa|english|fran[cç]ais|\bfr\b|espa[nñ]ol|svenska|norsk|dansk|suomi|polski|italiano|portugu|ö|österreich|schweiz|vlaams|belgi)/i;
  async function findHitsterPlaylists(cats) {
    const found = {};
    // Eerst de playlists van het officiële Hitster-account zelf; lukt dat niet, dan zoeken
    const account = await hitsterAccountPlaylists();
    for (const cat of cats) {
      const q = EDITION_QUERY[cat];
      if (!q) continue;
      let items = account;
      if (!items.length) {
        const r = await api("GET", `/search?type=playlist&limit=10&market=NL&q=${encodeURIComponent(q)}`);
        if (r.status === 401) { lastError = "Spotify-login verlopen: ontkoppel en verbind opnieuw."; break; }
        items = ((r.json && r.json.playlists && r.json.playlists.items) || []).filter((p) => p && p.id && p.owner && (p.owner.id === HITSTER_USER || /hitster/i.test((p.owner.display_name || "") + " " + (p.owner.id || ""))));
      }
      const words = q.toLowerCase().replace("hitster", "").split(/\s+/).filter((w) => w.length > 1 && w !== "nl");
      const scored = items.map((p) => {
        const name = (p.name || "").toLowerCase();
        let score = words.filter((w) => name.includes(w)).length * 3;
        if (/(\bnl\b|nederland|dutch)/i.test(name)) score += 2;
        if (FOREIGN.test(name)) score -= 4;
        if (cat === "original" && /(refresh|guilty|rock|summer|bingo|christmas|hip hop|soundtrack|100%|top 40|celebration|battle|flying)/i.test(name)) score -= 5;
        return { p, score };
      }).sort((a, b) => b.score - a.score);
      if (scored.length && scored[0].score > 0) {
        const p = scored[0].p;
        found[cat] = { id: p.id, name: p.name, total: (p.tracks && p.tracks.total) || (p.items && p.items.total) || null };
      }
    }
    return found;
  }

  // Alleen uit de playlist (extra muziekronde: eerst de playlist, daarna beslist de server over de Excel)
  async function fromPlaylist(id, excludeKeys) {
    if (!connected()) { lastError = "Spotify is niet verbonden in de bediening."; return null; }
    return playlistTrack(id, new Set(excludeKeys || []));
  }
  // Eerst de Hitster-playlist van de categorie (als die is ingesteld), dan Spotify zoeken, anders een iTunes-fragment
  async function randomTrack(cat, excludeKeys, playlist) {
    const exclude = new Set(excludeKeys || []);
    if (playlist && connected()) {
      const t = await playlistTrack(playlist, exclude);
      if (t) return t;
    }
    // Eerst Spotify (volledig nummer, categorie gecontroleerd); lukt dat niet, dan een iTunes-fragment
    if (connected()) {
      const t = await spotifyTrack(cat, exclude);
      if (t) return t;
    }
    const it = await itunesTrack(cat, exclude);
    if (!it && !lastError) lastError = "iTunes vond ook niets (geen internet?).";
    return it;
  }

  // Jaar van de eerste uitgave voor een nummer uit de Excel (artiest = eerste naam)
  const firstYear = (t) => earliestYear({ ...t, firstArtist: String(t.artist || '').split(/ & |, /)[0] });
  return { fromPlaylist, checkYear, hitsterAccountPlaylists, firstYear, findHitsterPlaylists, playlistTracks, connected, login, handleRedirect, find, play, pause, resume, devices, disconnect, startPlayer, activate, redirect, randomTrack, keyOf, lastError: () => lastError };
})();
