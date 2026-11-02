# Familiequiz

Teams spelen op hun telefoon, de vragen staan op de tv en de quizmaster bedient alles vanaf een eigen telefoon.

## Starten
    npm install
    npm start          # hervat een eventuele vorige quiz (staat dan op pauze)
    npm run fresh      # begint altijd schoon
    npm run vendor     # eenmalig, met internet: QR- en confetti-script lokaal opslaan

| Scherm | Adres | Voor wie |
|---|---|---|
| Telefoon | `/` | elk team (basistelefoon) en teamgenoten |
| Tv | `/host.html` | de tv, alleen weergave (één keer op OK drukken voor geluid) |
| Bediening | `/bediening.html` | de quizmaster, pincode standaard `1234` (`HOST_PIN=...` om te wijzigen) |

## Verloop
Testvragen (tellen niet) → "Hier begint de echte quiz" → joker inzetten → ronde 1 t/m 8 → slotvraag → (beslissingsvraag bij gelijke stand) → ontknoping → nakijken.
Tijdens het spel zijn er **geen uitslagen** te zien. Pas als alle rondes klaar zijn volgen de ontknoping, het overzicht per ronde en **Nakijken**: per team het antwoord met groen vinkje of rood kruis.

## Punten
Elke ronde is evenveel waard (`roundPoints`, standaard 100), ongeacht het aantal vragen of de grootte van het team.
Een team scoort dus een percentage van het maximum. Per ronde te overschrijven met `"points"` in questions.json.
- **Joker**: vóór ronde 1 kiest de basistelefoon van elk team de ronde waarin het team verwacht het best te scoren; die ronde telt dubbel.
- **Slotvraag**: meerkeuze met inzet (0 tot je totaal). Goed = inzet erbij, fout = inzet kwijt.
- **Beslissingsvraag**: alleen als na de slotvraag teams gelijk staan op de eerste plaats. Die teams schatten een getal (`tiebreakers` in questions.json); wie het dichtstbij zit krijgt 1 punt en wint. Staan ze dan nog gelijk, dan volgt de volgende vraag. Geen gelijke stand = geen open vraag.
- **Muziek**: de basistelefoon legt het liedje in de tijdlijn en kan optioneel het exacte jaartal invullen: dat levert bonuspunten op (`yearBonus`, standaard 1 extra punt per liedje, op te geven bij de ronde).
- **Foto blur** (`blurPoints`): hoe eerder goed, hoe meer punten. **Prijzen** (`pricePoints`): dichtstbij krijgt het meest.

## Vragen invullen in Excel (aanbevolen)
Alle vragen en opdrachten staan in **`vragenlijst.xlsx`** (een tabblad per ronde, uitleg op het tabblad *Lees mij*).
De server leest dit bestand zelf in; er is geen extra pakket voor nodig. Tot vlak voor de start kun je nog wijzigen:
- **Via de bediening** (blokje *Vragenlijst (Excel)*): kies *Excel uploaden*. Het bestand wordt meteen gecontroleerd en ingelezen. Waarschuwingen (bv. een vraag zonder foute antwoorden, een liedje zonder jaar) staan bovenin de bediening.
- Of vervang `vragenlijst.xlsx` op de server (of push naar GitHub en laat Render opnieuw deployen) en tik op *Opnieuw inlezen*.
- Staan beide, dan wint het nieuwste bestand. Op het gratis Render-plan verdwijnt een upload bij een herstart; zet voor de echte avond een schijf aan (zie `render.yaml`) of zet het bestand in de repository.
- Na de start van de quiz kan dit niet meer. Foto's, logo's en audio zet je in `public/media/` (op Render: in de repository).
- Bij elke keer inlezen worden de antwoordvolgordes (A/B/C/D) opnieuw gehusseld.
- Ontbreekt de Excel, dan wordt `questions.json` gebruikt (ook voor wat niet in de Excel staat, zoals de teksten bij de testvragen).

## Rondes (technisch: questions.json)
| type | wat |
|---|---|
| `mc` | meerkeuze, met `categories` |
| `blur` | foto wordt scherper per klik van de quizmaster; `test` = testvraag vooraf |
| `memory` | `items` = wat op het bord stond; het hele team typt mee, quizmaster keurt bij |
| `hitster` | `songs` met `title`, `artist`, `year`, optioneel `audio` en `start: true` (startkaarten) |
| `price` | `items` met `now` en `ago` (prijs nu en `agoYears` jaar geleden) |
| `draw` | alle teams tegelijk, elk een ander woord. Een willekeurig teamlid (nooit de basistelefoon) tekent op de eigen telefoon, het team ziet het live. De basistelefoon geeft één antwoord; de quizmaster keurt goed/fout (voorstel staat al klaar). Ieder teamlid behalve de basis tekent één keer. `words` (met optioneel `alt` voor andere goede spellingen); teams moeten uit minstens 2 spelers bestaan |
| `thirty` | `cards`: lijsten van 5 woorden |
| `logo` | open vraag: logo met stukjes afgedekt (`hide`, standaard 0.5); `name` en `alt` (ook goed). Eén antwoord per team. Goede antwoorden krijgen punten op volgorde van snelheid (`logoPoints`, standaard 10, 8, 6, 4, 2); de quizmaster keurt achteraf goed/fout, dat verandert de volgorde niet. |

**Controleer vóór gebruik**: de prijzen zijn schattingen, `items` bij het geheugenbord zijn voorbeelden,
foto's/logo's/audio moeten nog in `public/media/` (zie daar de README).
Liedjes zonder `audio`: koppel Spotify (hieronder) of speel het liedje zelf af.

## Spotify koppelen (vooraf, op de computer aan de tv)
De muziek speelt af in de browser van het tv-scherm (Spotify Web Playback SDK), net als in de Hitster-app.
1. Eenmalig in je Spotify-app (developer dashboard): voeg `http://127.0.0.1:3000/host.html` toe als Redirect URI
   (en voor Render ook `https://<jouw-naam>.onrender.com/host.html`), en zet het Spotify-account onder *User Management*. Spotify Premium is nodig.
2. Open op de computer aan de tv `http://127.0.0.1:3000/host.html` (niet het netwerkadres) in Chrome, Edge of Firefox.
   Een smart-tv-browser kan meestal geen Spotify afspelen.
3. Klik in de lobby op **Spotify koppelen** en log in. Daarna staat er "Spotify-speler klaar". Druk één keer op OK/klik om het geluid toe te staan.
4. Bij elke muziekvraag start de tv het liedje zelf. In de bediening zie je wat er speelt, met knoppen *Opnieuw afspelen* en *Muziek stoppen*.
   Gaat er iets mis, dan staat de melding van de tv in de bediening (blokje Spotify en bij de muziekvraag).
De Client ID staat in `public/shared.js` (`QuizSpotify`).

## Opslaan en Render
De stand staat in `data/state.json`; na een herstart staat de quiz op pauze. Online draaien via Render: zie `render.yaml`
(zet `HOST_PIN`, en voor een echte avond plan `starter` met schijf). Niet pushen tijdens de quiz.

## Noodknoppen (bediening)
Antwoord wissen, afsluiten zonder te wachten, vraag laten vervallen of voor iedereen goed rekenen, stap overslaan/terug,
springen naar een ronde, +10 seconden, team of speler hernoemen/verplaatsen/verwijderen, andere basistelefoon aanwijzen.
