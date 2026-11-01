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
Testvragen (tellen niet) → "Hier begint de echte quiz" → ronde 1 t/m 8 → joker inzetten → slotvraag → ontknoping → nakijken.
Tijdens het spel zijn er **geen uitslagen** te zien. Pas als alle rondes klaar zijn volgen de ontknoping, het overzicht per ronde en **Nakijken**: per team het antwoord met groen vinkje of rood kruis.

## Punten
Elke ronde is evenveel waard (`roundPoints`, standaard 100), ongeacht het aantal vragen of de grootte van het team.
Een team scoort dus een percentage van het maximum. Per ronde te overschrijven met `"points"` in questions.json.
- **Joker**: één per team, na ronde 8. De basistelefoon kiest een ronde; die ronde telt dubbel.
- **Slotvraag**: meerkeuze met inzet (0 tot je totaal). Goed = inzet erbij, fout = inzet kwijt.
- **Beslissingsvraag**: alleen als na de slotvraag teams gelijk staan op de eerste plaats. Die teams schatten een getal (`tiebreakers` in questions.json); wie het dichtstbij zit krijgt 1 punt en wint. Staan ze dan nog gelijk, dan volgt de volgende vraag. Geen gelijke stand = geen open vraag.
- **Muziek**: de basistelefoon legt het liedje in de tijdlijn en kan optioneel het exacte jaartal invullen: dat levert bonuspunten op (`yearBonus`, standaard 1 extra punt per liedje, op te geven bij de ronde).
- **Foto blur** (`blurPoints`): hoe eerder goed, hoe meer punten. **Prijzen** (`pricePoints`): dichtstbij krijgt het meest.

## Rondes (questions.json)
| type | wat |
|---|---|
| `mc` | meerkeuze, met `categories` |
| `blur` | foto wordt scherper per klik van de quizmaster; `test` = testvraag vooraf |
| `memory` | `items` = wat op het bord stond; het hele team typt mee, quizmaster keurt bij |
| `hitster` | `songs` met `title`, `artist`, `year`, optioneel `audio` en `start: true` (startkaarten) |
| `price` | `items` met `now` en `ago` (prijs nu en `agoYears` jaar geleden) |
| `draw` | de tekenaar tekent op de eigen telefoon, de streken verschijnen live bij de teamgenoten; `words` (met optioneel `alt` voor andere goede spellingen); teams moeten uit minstens 2 spelers bestaan |
| `thirty` | `cards`: lijsten van 5 woorden |
| `logo` | foto's met een deel afgedekt (`hide`, standaard 0.5) |

**Controleer vóór gebruik**: de prijzen zijn schattingen, `items` bij het geheugenbord zijn voorbeelden,
foto's/logo's/audio moeten nog in `public/media/` (zie daar de README).
Liedjes zonder `audio`: koppel Spotify (hieronder) of speel het liedje zelf af.

## Spotify koppelen (host, vooraf)
1. Je hebt Spotify Premium nodig. Zet in het developer dashboard van je Spotify-app de Redirect-URI die in de bediening staat (bij `Spotify`) bij *Redirect URIs*.
2. Open `http://127.0.0.1:3000/bediening.html` (lokaal) of de https-link op Render. Dit werkt niet via een gewoon netwerk-IP.
3. Klap `Spotify` open, tik op **Verbind met Spotify**, kies daarna het afspeelapparaat (Spotify moet daarop openstaan) en probeer **Test**.
4. Houd de bedieningspagina open tijdens de muziekronde: elk liedje start dan vanzelf op dat apparaat.
De Client ID kan in `public/bediening.html` (`SP.clientId`) of via `localStorage.sp_client` worden aangepast.

## Opslaan en Render
De stand staat in `data/state.json`; na een herstart staat de quiz op pauze. Online draaien via Render: zie `render.yaml`
(zet `HOST_PIN`, en voor een echte avond plan `starter` met schijf). Niet pushen tijdens de quiz.

## Noodknoppen (bediening)
Antwoord wissen, afsluiten zonder te wachten, vraag laten vervallen of voor iedereen goed rekenen, stap overslaan/terug,
springen naar een ronde, +10 seconden, team of speler hernoemen/verplaatsen/verwijderen, andere basistelefoon aanwijzen.
