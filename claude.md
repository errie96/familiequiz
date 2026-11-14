# Familiequiz Ontwikkelrichtlijnen

## Architectuur & Stack
- **Backend:** Node.js, Express, WebSockets (`lib/sockets/`)
- **Frontend:** Vanilla HTML/CSS/JS (`public/`), Poppins fonts
- **Schermen:**
  - `public/index.html` (Speler interface)
  - `public/host.html` (Presentator overzicht)[cite: 1]
  - `public/bediening.html` & `public/bediening2.html` (Regiepaneel)[cite: 1]
  - `public/js/tv.js` (Centraal TV-scherm)[cite: 1]
- **Gegevensbronnen:** 
  - `vragenlijst.xlsx` ingelezen via `lib/fromExcel.js`[cite: 1]
  - `Hitster-bibliotheek.xlsx` beheerd via `lib/hitster-update.js`[cite: 1]
  - `questions.json` en `config.json`[cite: 1]

## Ontwikkelregels
- Start lokaal: `npm start` of `./start-lokaal.command`[cite: 1]
- Testen uitvoeren: `npm test`[cite: 1]
- Wijzigingen in spelstatussen moeten altijd compatibel zijn met `lib/state-store.js` en alle actieve socket-verbindingen in `lib/sockets/`[cite: 1].