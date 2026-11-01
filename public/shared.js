// Gedeelde hulpfuncties voor alle pagina's
// (geluiden, confetti, media, aftelklok en de onthulling van de einduitslag)
window.QuizFX = (function () {
  // Eén AudioContext hergebruiken; browsers laten er maar een paar tegelijk toe
  let ctx = null;
  function audio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }
  // Moet vanuit een klik of toetsdruk aangeroepen worden (tv-scherm)
  function unlockAudio() {
    audio();
  }

  const style = document.createElement("style");
  style.textContent = `
    .rank-card { transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); transform: translateY(20px); opacity: 0; }
    .rank-card.show { transform: translateY(0); opacity: 1; }
    @keyframes pulse { 0% { transform: scale(0.98); } 100% { transform: scale(1.02); } }
  `;
  document.head.appendChild(style);

  function drumHit() {
    const c = audio();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.frequency.setValueAtTime(150, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.15);
  }

  function fanfare() {
    const c = audio();
    if (!c) return;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const t = c.currentTime + idx * 0.12;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  function alarm(isLocked) {
    const c = audio();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = isLocked ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(isLocked ? 350 : 500, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isLocked ? 200 : 900, c.currentTime + 0.25);
    gain.gain.setValueAtTime(0.25, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.25);
  }

  function launchConfetti() {
    if (typeof confetti !== "function") return;
    const end = Date.now() + 7000;
    const interval = setInterval(() => {
      if (Date.now() >= end) return clearInterval(interval);
      confetti({
        particleCount: 50,
        spread: 360,
        startVelocity: 30,
        origin: { x: Math.random(), y: Math.random() - 0.2 }
      });
    }, 250);
  }

  // Aftelklok. info = { remainingMs, totalMs, running } of null.
  // onTick krijgt { secs, fraction, running } (of null om te verbergen).
  const clocks = {};
  function countdown(key, info, onTick) {
    if (clocks[key]) {
      clearInterval(clocks[key]);
      delete clocks[key];
    }
    if (!info) return onTick(null);
    const total = info.totalMs || 1;
    const end = Date.now() + info.remainingMs;
    const tick = () => {
      const left = info.running ? Math.max(0, end - Date.now()) : info.remainingMs;
      onTick({ secs: Math.ceil(left / 1000), fraction: Math.min(1, left / total), running: info.running });
      if (left <= 0 && clocks[key]) {
        clearInterval(clocks[key]);
        delete clocks[key];
      }
    };
    tick();
    if (info.running) clocks[key] = setInterval(tick, 250);
  }

  // Plaatje of audio in een vak zetten. media = { kind: 'image' | 'audio', src }.
  function renderMedia(box, media, opts) {
    box.replaceChildren();
    if (!media || !media.src) return null;
    const options = opts || {};
    if (media.kind === "image") {
      const img = document.createElement("img");
      img.src = media.src;
      img.className = "media-img";
      if (options.imgStyle) img.style.cssText = options.imgStyle;
      box.appendChild(img);
      return img;
    }
    if (media.kind === "audio") {
      const a = document.createElement("audio");
      a.controls = true;
      a.autoplay = !!options.autoplay;
      a.src = media.src;
      box.appendChild(a);
      return a;
    }
    return null;
  }

  // Eén regel in de ranglijst
  function rankRow(player) {
    const li = document.createElement("li");
    li.className = "rank-card";
    li.style.padding = "0.6em 0.9em";
    li.style.borderRadius = "8px";
    li.style.marginBottom = "8px";

    const isWinner = player.rank === 1;
    let badge = `#${player.rank}`;
    if (player.rank === 1) {
      badge = "🥇 WINNAAR";
      li.style.background = "#2563eb";
      li.style.border = "2px solid #60a5fa";
    } else if (player.rank === 2) {
      badge = "🥈 #2";
      li.style.background = "#1e293b";
    } else if (player.rank === 3) {
      badge = "🥉 #3";
      li.style.background = "#1e293b";
    } else {
      li.style.background = "#0f172a";
    }

    const label = document.createElement("span");
    const b = document.createElement("b");
    b.textContent = badge;
    label.append(b, document.createTextNode("\u00a0 " + player.name));

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
    winnerText.textContent =
      `🏆 ${winners.join(" & ")} ${winners.length > 1 ? "WINNEN" : "WINT"} DE FAMILIEQUIZ! 🏆`;
    banner.classList.remove("hidden");
  }

  // Onthult de ranglijst van laatste naar eerste plaats (of meteen, met instant).
  // scores: [{ name, score, rank }] gesorteerd van hoog naar laag.
  // Geeft een functie terug waarmee je de onthulling kunt annuleren.
  function runReveal(scores, opts) {
    const { table, banner, winnerText, onFinish, instant } = opts;
    table.replaceChildren();
    banner.classList.add("hidden");

    if (instant) {
      scores.forEach((player) => {
        const li = rankRow(player);
        li.classList.add("show");
        table.appendChild(li);
      });
      showWinners(scores, banner, winnerText);
      if (onFinish) onFinish();
      return () => {};
    }

    const timers = [];
    const reversed = [...scores].reverse();
    reversed.forEach((player, i) => {
      timers.push(
        setTimeout(() => {
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
        }, (i + 1) * 2200)
      );
    });
    return () => timers.forEach(clearTimeout);
  }

  return { unlockAudio, drumHit, fanfare, alarm, launchConfetti, countdown, renderMedia, runReveal };
})();
