// Vraagtypen: per type staat hier hoe de vraag er op de telefoon, op de tv en bij
// het nakijken uitziet. Een nieuw type (schatting, volgorde, ...) voeg je toe door:
//   1. hier een object met player / tv / review te maken en aan "kinds" te koppelen
//   2. in server.js bij ANSWER_KINDS te beschrijven hoe het antwoord gecontroleerd wordt
window.QuizQ = (function () {
  const LETTERS = ["A", "B", "C", "D", "E", "F"];

  // Eén stijl voor tv, telefoon en bediening; groottes schalen mee met het scherm
  const style = document.createElement("style");
  style.textContent = `
    .qgrid { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(8px, 1.2vw, 20px); }
    @media (max-width: 600px) { .qgrid { grid-template-columns: 1fr; } }
    .qo { background: #334155; color: #fff; border-radius: 10px; padding: clamp(10px, 1.4vw, 24px);
          font-size: clamp(16px, 2.2vw, 40px); text-align: left; }
    .qo .letter { color: #38bdf8; margin-right: 0.4em; }
    .qo.correct { background: #15803d; border: 2px solid #4ade80; font-weight: bold; }
    .qo .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; font-weight: normal; }
    .qo .chip { background: rgba(0,0,0,0.35); border-radius: 999px; padding: 2px 12px; font-size: 0.65em; }
    .qo .chip.joker::after { content: " 🃏"; }
  `;
  document.head.appendChild(style);

  const choice = {
    // Telefoon: knoppen om uit te kiezen. Geeft { setSelected, setLocked } terug.
    player(q, box, onSelect) {
      box.replaceChildren();
      const buttons = q.options.map((opt, idx) => {
        const b = document.createElement("button");
        b.className = "btn-option";
        b.textContent = `${LETTERS[idx] || idx + 1}: ${opt}`;
        b.onclick = () => onSelect(idx);
        box.appendChild(b);
        return b;
      });
      return {
        setSelected(value) {
          buttons.forEach((b, i) => { b.style.background = i === value ? "#2563eb" : ""; });
        },
        setLocked(locked) {
          buttons.forEach((b) => { b.disabled = locked; });
        }
      };
    },

    // Tv: grote antwoordblokken
    tv(q, box) {
      box.replaceChildren();
      const grid = document.createElement("div");
      grid.className = "qgrid";
      q.options.forEach((opt, idx) => {
        const div = document.createElement("div");
        div.className = "qo";
        const letter = document.createElement("b");
        letter.className = "letter";
        letter.textContent = LETTERS[idx] || idx + 1;
        div.append(letter, document.createTextNode(opt));
        grid.appendChild(div);
      });
      box.appendChild(grid);
    },

    // Nakijken: goede antwoord groen, per optie welke teams die kozen
    review(q, details, box) {
      box.replaceChildren();
      const grid = document.createElement("div");
      grid.className = "qgrid";
      q.options.forEach((opt, idx) => {
        const div = document.createElement("div");
        const isCorrect = idx === details.answer;
        div.className = "qo" + (isCorrect ? " correct" : "");
        const letter = document.createElement("b");
        letter.className = "letter";
        letter.textContent = LETTERS[idx] || idx + 1;
        div.append(letter, document.createTextNode(opt));
        if (isCorrect) {
          const mark = document.createElement("b");
          mark.textContent = "  ✅";
          div.appendChild(mark);
        }
        const chosen = (details.teamAnswers || []).filter((a) => a.value === idx);
        if (chosen.length) {
          const chips = document.createElement("div");
          chips.className = "chips";
          chosen.forEach((a) => {
            const chip = document.createElement("span");
            chip.className = "chip" + (a.joker ? " joker" : "");
            chip.textContent = a.name;
            chips.appendChild(chip);
          });
          div.appendChild(chips);
        }
        grid.appendChild(div);
      });
      box.appendChild(grid);
    }
  };

  // Koppeling type -> weergave (zelfde namen als "type" in questions.json)
  const kinds = { multiple_choice: choice, audio: choice, location: choice };
  const of = (q) => kinds[q.type] || choice;

  return {
    renderPlayer: (q, box, onSelect) => of(q).player(q, box, onSelect),
    renderTV: (q, box) => of(q).tv(q, box),
    renderReview: (q, details, box) => of(q).review(q, details, box)
  };
})();
