// Nakijken: de pagina's met tabellen per ronde (tv en bediening), ook de tijdlijn van de muziekronde
// en de prijzen van nu en vroeger. Krijgt de spelstand via ctx (zie server.js).
'use strict';

function createReview(ctx) {
  const L = ['A', 'B', 'C', 'D', 'E', 'F'];
  const clip = (t, n = 28) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

  function reviewPages(scope) {
      // live waarden uit de server (teams, stappen, rondes, toestellen veranderen tijdens de quiz)
      const { rounds, teams, steps, devices } = ctx.state();
      const { byName, ss, logoAwards, mcAward, songOf, songAward, priceAwards, finalDelta, finalStep } = ctx;
    const list = scope === 'all' ? rounds : rounds.filter((r) => r.id === scope);
    const pages = [];
    const teamList = Object.values(teams).sort(byName);
    const names = teamList.map((t) => t.name);
    for (const round of list) {
      const rs = steps.filter((s) => s.round === round.id);
      const title = `Ronde ${round.no}: ${round.title}`;
      if (round.type === 'logo' || round.type === 'blur') {
        const qs = rs.filter((x) => x.kind === 'logo' && !x.test && ss(x).status === 'closed');
        for (let k = 0; k < qs.length; k += 8) {
          pages.push({
            title, subtitle: '', columns: [round.type === 'blur' ? 'Foto' : 'Logo', ...names],
            rows: qs.slice(k, k + 8).map((q) => {
              const aw = logoAwards(q), st = ss(q);
              return [q.name, ...teamList.map((t) => (st.answers[t.teamId] ? { t: `${st.answers[t.teamId].text}${aw[t.teamId] ? '  +' + aw[t.teamId] : ''}`, ok: !!st.judged[t.teamId] } : { t: '–', ok: false }))];
            })
          });
        }
      } else if (['mc', 'blur'].includes(round.type)) {
        const qs = rs.filter((s) => s.kind === 'mc' && !s.test && ss(s).status === 'closed');
        const groups = [];
        qs.forEach((q) => {
          const key = q.category || '';
          let g = groups[groups.length - 1];
          if (!g || g.key !== key || g.items.length >= 8) { g = { key, items: [] }; groups.push(g); }
          g.items.push(q);
        });
        groups.forEach((g) => {
          pages.push({
            title, subtitle: g.key,
            columns: ['Vraag', 'Goed antwoord', ...names],
            rows: g.items.map((q) => [
              clip(q.question || q.options[q.answer], 60),
              `${L[q.answer]}: ${clip(q.options[q.answer], 24)}`,
              ...teamList.map((t) => {
                const a = mcAward(q, t);
                if (a.ok === null) return { t: 'vervallen' };
                if (!a.a) return { t: '–', ok: false };
                return { t: `${L[a.a.v]}: ${clip(q.options[a.a.v], 18)}`, ok: a.ok };
              })
            ])
          });
        });
      } else if (round.type === 'memory') {
        const step = rs.find((s) => s.kind === 'memory' && !s.test);
        const s = step && ss(step);
        if (s && s.status === 'done') {
          pages.push({ title, subtitle: 'Op het bord stond', columns: ['Antwoorden die goed waren'], rows: step.items.map((it) => [it.text]) });
          teamList.forEach((t) => {
            const entries = s.entries[t.teamId] || [];
            pages.push({
              title, subtitle: `${t.name}: ${entries.filter((e) => e.ok).length} van ${step.items.length} goed`,
              columns: ['Antwoord', 'Beoordeling'],
              rows: entries.length ? entries.map((e) => [e.text, { t: e.ok ? 'Goed' : 'Fout', ok: !!e.ok }]) : [['(niets opgeschreven)', '']]
            });
          });
        }
      } else if (round.type === 'hitster') {
        // De tijdlijn van alle gespeelde liedjes, van oud naar nieuw, met per team ✔ (goed gelegd) of ✘
        const played = rs.filter((s) => s.kind === 'song' && !s.test && ss(s).status === 'revealed')
          .map((st) => ({ st, song: songOf(st) })).filter((x) => x.song)
          .sort((a, b) => a.song.year - b.song.year || String(a.song.title).localeCompare(String(b.song.title)));
        for (let k = 0; k < played.length; k += 12) {
          pages.push({
            title, subtitle: played.length > 12 ? `Tijdlijn (${k + 1}–${Math.min(k + 12, played.length)} van ${played.length})` : 'Tijdlijn van alle gespeelde liedjes',
            columns: ['Jaar', 'Liedje', ...names],
            rows: played.slice(k, k + 12).map(({ st, song }) => {
              const res = ss(st).results || {};
              return [String(song.year), clip(`${song.title} – ${song.artist}`, 48), ...teamList.map((t) => {
                const r = res[t.teamId];
                if (!r) return { t: '–' };
                const a = songAward(st, t.teamId);
                const pts = a.place + a.year + a.title + a.artist;
                return { t: `${r.yearGuess ? 'jaar ' + r.yearGuess + ' · ' : ''}+${pts}`, ok: !!r.ok };
              })];
            })
          });
        }
      } else if (round.type === 'price') {
        // Per product de prijs van nu én van vroeger op één scherm (twee regels per product)
        const ps = rs.filter((s) => s.kind === 'price' && !s.test && ss(s).status === 'revealed');
        const euro = (n) => '€' + n.toFixed(2).replace('.', ',');
        const ago = `${round.agoYears} jaar geleden`;
        for (let k = 0; k < ps.length; k += 5) {
          const rows = [];
          ps.slice(k, k + 5).forEach((st) => {
            const aw = priceAwards(st);
            ['now', 'ago'].forEach((key) => {
              if (!Number.isFinite(st[key])) return;
              // Onder de productnaam het prijsverschil tussen toen en nu, zodat je de stijging meteen ziet
              const diff = Number.isFinite(st.now) && Number.isFinite(st.ago) ? st.now - st.ago : null;
              const diffText = diff === null ? '' : `${diff >= 0 ? '📈 +' : '📉 −'}${euro(Math.abs(diff))}${st.ago > 0 ? ` (${diff >= 0 ? '+' : '−'}${Math.round(Math.abs(diff) / st.ago * 100)}%)` : ''}`;
              rows.push([key === 'now' ? st.name + (st.unit ? ` (${st.unit})` : '') : diffText, key === 'now' ? 'Nu' : ago, euro(st[key]), ...teamList.map((t) => {
                const x = aw[t.teamId] && aw[t.teamId][key];
                return x ? { t: `${euro(x.v)}  +${x.pts}`, ok: x.rank === 0 } : { t: '–', ok: false };
              })]);
            });
          });
          pages.push({ title, subtitle: ps.length > 5 ? `Prijzen nu en ${ago} (${k + 1}–${Math.min(k + 5, ps.length)} van ${ps.length})` : `Prijzen nu en ${ago}`, columns: ['Product', 'Wanneer', 'Echte prijs', ...names], rows });
        }
      } else if (round.type === 'draw') {
        const step = rs.find((s) => s.kind === 'draw');
        const s = step && ss(step);
        if (s && s.turns.length) {
          // Eén pagina per beurt, met de tekeningen erbij
          s.turns.forEach((turn, i) => {
            if (!turn || !turn.done) return;
            const rows = [], images = [];
            teamList.forEach((t) => {
              if (!turn.words[t.teamId]) return;
              const d = devices[turn.drawers[t.teamId]];
              const a = turn.answers[t.teamId];
              rows.push([t.name, d ? d.label : '?', turn.words[t.teamId].word, { t: a ? a.text : '(geen antwoord)', ok: !!turn.ok[t.teamId] }]);
              images.push({ label: `${t.name}: ${turn.words[t.teamId].word}`, strokes: turn.strokes[t.teamId] || [], ok: !!turn.ok[t.teamId] });
            });
            pages.push({ title, subtitle: `Tekenbeurt ${i + 1}`, columns: ['Team', 'Tekenaar', 'Woord', 'Antwoord'], rows, images });
          });
        }
      } else if (round.type === 'thirty') {
        const step = rs.find((s) => s.kind === 'thirty');
        const s = step && ss(step);
        if (s && s.turns.length) {
          pages.push({
            title, subtitle: '30 seconds',
            columns: ['Team', 'Uitlegger', 'Goed', 'Woorden'],
            rows: s.turns.filter((t) => t.done).map((t) => [
              (teams[t.teamId] || { name: '?' }).name,
              (devices[t.deviceId] || { label: '?' }).label,
              { t: `${t.ok.filter(Boolean).length} van 5`, ok: t.ok.filter(Boolean).length >= 3 },
              t.words.map((w, i) => (t.ok[i] ? '✓ ' : '✗ ') + w).join(' · ')
            ])
          });
        }
      }
    }
    const f = finalStep();
    if (scope === 'all' && f && ss(f).status === 'revealed') {
      const fs2 = ss(f);
      pages.push({
        title: `Slotvraag: ${f.question}`, subtitle: `Goede antwoord: ${L[f.answer]}: ${f.options[f.answer]}`,
        columns: ['Team', 'Inzet', 'Antwoord', 'Punten'],
        rows: teamList.map((t) => {
          const a = fs2.answers[t.teamId];
          const d = finalDelta(t);
          return [t.name, String(fs2.wagers[t.teamId] || 0), a === undefined ? '–' : `${L[a]}: ${clip(f.options[a], 22)}`, { t: (d >= 0 ? '+' : '') + d, ok: d > 0 ? true : d < 0 ? false : null }];
        })
      });
    }
    if (scope === 'all') {
      for (const st of steps.filter((x) => x.kind === 'tiebreak')) {
        const ts = ss(st);
        if (ts.status !== 'revealed') continue;
        pages.push({
          title: `Beslissingsvraag: ${st.question}`, subtitle: `Goede antwoord: ${st.answer}${st.unit ? ' ' + st.unit : ''}`,
          columns: ['Team', 'Gok', 'Verschil', 'Uitslag'],
          rows: (ts.teams || []).map((id) => teams[id]).filter(Boolean).map((t) => {
            const a = ts.answers[t.teamId];
            const won = (ts.winners || []).includes(t.teamId);
            return [t.name, a === undefined ? '–' : String(a), a === undefined ? '–' : String(Math.abs(a - st.answer)), { t: won ? 'Wint (+1)' : 'Verliest', ok: won }];
          })
        });
      }
    }
    return pages;
  }

  return { reviewPages };
}

module.exports = { createReview };
