# Familiequiz

Een quiz voor de hele familie: teams spelen op hun telefoon, de vragen staan op de tv en
de quizmaster bedient alles vanaf een eigen telefoon.

## Starten

    npm install
    npm start            # hervat een eventuele vorige quiz (zie "Opslaan")
    npm run fresh        # begint altijd schoon
    npm run vendor       # eenmalig, met internet: slaat QR- en confetti-script lokaal op

Zet de server en alle telefoons op hetzelfde wifi. De console toont de juiste adressen.

| Scherm | Adres | Voor wie |
|---|---|---|
| Telefoon | `/` | elk team (basistelefoon) en teamgenoten |
| Tv | `/host.html` | de grote tv; alleen weergave, geen knoppen |
| Bediening | `/bediening.html` | de quizmaster; pincode standaard `1234` (`HOST_PIN=5678 npm start`) |

Op de tv moet één keer op OK of een toets gedrukt worden, anders blokkeert de browser het geluid.

## Het programma van de avond

De volgorde staat in `questions.json` (een lijst `rounds`). Elke ronde begint met een infoscherm met de
spelregels en het aantal te verdienen punten. **Elke ronde levert maximaal evenveel punten op (standaard 100)**,
ook als het ene onderdeel veel en het andere weinig vragen heeft: de motor rekent alles om. Dat aantal staat
bij Instellingen (`roundMax`) of per ronde in `"points"`.

| # | Ronde | Type | Hoe het werkt |
|---|---|---|---|
| – | Testvragen | `mc`, `counts: false` | 3 makkelijke vragen, tellen niet mee, daarna het scherm "Hier begint de echte quiz!" |
| 1 | Meerkeuze | `mc` | 5 onderwerpen; na elk onderwerp samen nakijken (`reveal`) |
| 2 | Foto blur | `blur` | quizmaster tikt op het plaatje = scherper; hoe eerder goed, hoe meer punten; eerst een testvraag |
| 3 | Geheugen | `memory` | basistelefoon schrijft op wat op het bord stond; quizmaster keurt elk antwoord goed/fout |
| 4 | Muziek (Hitster) | `hitster` | **staat uit, wordt gebouwd zodra de Hitster-bestanden er zijn** |
| 5 | Prijzen van vroeger | `prices` | prijs nu en 15 jaar geleden schatten; dichtstbij = meeste punten |
| 6 | Tekenen | `draw` | per beurt tekent één speler per team; teamgenoten zien het live en typen het antwoord |
| 7 | 30 seconds | `thirty` | één speler legt 5 woorden uit in 30 sec; quizmaster tikt aan wat goed is; teams om en om |
| 8 | Logo's | `logo` | logo met weggelaten stukken |
| – | Jokers | automatisch | elk team zet 1 joker in op 1 ronde (die ronde telt dubbel); vóór de slotvraag |
| – | Slotvraag | `final` | je zet eigen punten in: goed = inzet erbij, fout = inzet eraf |

Na elke ronde komt een uitslagscherm met de punten van die ronde. Op het eind: ontknoping van de winnaar en,
met een druk op de knop, een overzicht per ronde (met de jokers).

**Resultaatschermen**: bij elk nakijken en elke uitslag staat per team wat het antwoord was, met een groene vink
(goed) of rood kruis (fout), of een streepje bij geen antwoord.

**Spiekmeldingen** ("andere app geopend" of "scherm vergrendeld") staan op de tv en de bediening
**totdat de speler weer naar de quiz kijkt**. Ze verdwijnen ook bij pauze of tussen de vragen.

## Teams

Op de telefoon vul je **eerst je eigen naam** in en kies je daarna een team (nieuw of aansluiten).
E�n telefoon is de **basistelefoon** en dient alles in (bij het tekenen en uitleggen doen alle teamleden mee).
Het hele team kiest de basis: een teamlid stelt een telefoon voor en alle verbonden teamleden moeten akkoord gaan.

## Opslaan

De stand wordt steeds bewaard in `data/state.json`. Valt de server of een telefoon uit, dan komen teams vanzelf
terug. Na een herstart staat de quiz op **pauze**. Met `npm run fresh` of Reset begin je opnieuw.

## questions.json

    { "rounds": [ { "id": "r1", "type": "mc", "name": "Ronde 1: Meerkeuze", ... } ] }

Gedeelde velden per ronde: `id`, `type`, `name`, `points` (optioneel), `counts` (`false` = telt niet mee),
`enabled` (`false` = ronde overslaan), `intro` (`{emoji, title, text}`), `outro` (extra infoscherm erna),
`practice` (oefenitems die niet meetellen, gevolgd door "nu de échte vragen"), `joker` (`false` = niet voor joker).

**mc / logo**
    { "id": "ak1", "category": "Algemene kennis", "question": "...", "options": ["A","B","C","D"], "answer": 1,
      "media": { "kind": "image", "src": "images/..jpg" }, "time": 20, "explanation": "..." }
Ronde-veld `reveal`: `after_each` (direct het antwoord tonen), `after_category` (nakijken na elk onderwerp),
`after_round`. Voor een logo: `"media": { "src": "images/logos/01.png", "hide": [[x, y, breedte, hoogte]] }`
(procenten van het plaatje die worden weggehaald; bij het resultaat zie je het hele logo).

**blur**: zelfde als mc met `media` (plaatje). `levelPoints` (standaard `[10,8,6,4,2,1]`): punten per scherpte-stap.

**memory**: `{ "id": "m1", "prompt": "...", "total": 10, "time": 180, "key": ["antwoord 1", ...] }`
`total` = hoeveel dingen er op het bord stonden (bepaalt de punten per goed antwoord); `key` is alleen een spiekbriefje
voor de quizmaster.

**prices**: `{ "product": "Brood", "unit": "1 stuk", "now": 2.69, "then": 1.60 }`, ronde-velden `yearsAgo` (15) en `maxPer`.
Per prijs krijgt het dichtstbijzijnde team het maximum, de rest naar verhouding minder.

**draw**: ronde-velden `words` (lijst woorden, of `{ "word": "Hunebed", "alt": ["hunebedden"] }`) en `time` (seconden per beurt).
**thirty**: ronde-veld `cards` (lijst van kaartjes met 5 woorden) en `time` (30).
**final**: een gewone meerkeuzevraag; de inzet kiest elk team zelf.

## Nieuw rondetype toevoegen

1. `rounds.js`: een object met de spellogica (`prep`, `view`, `submit`, `score`, `next`, ...), registreren in `H`.
2. `public/rounds-ui.js`: hoe het er op telefoon (`phone`), tv (`tv`) en bediening (`host`) uitziet.

## Hitster (ronde 4)

De ronde staat klaar in het programma (`"enabled": false` in `questions.json`) en in `rounds.js` staat een lege `H.hitster`.
Zodra de Hitster-bestanden zijn toegevoegd, bouw ik de tijdlijn (basistelefoon legt, teamleden kijken mee) in dezelfde opzet.

## Noodknoppen (in de bediening)

Stap afsluiten of doorgaan zonder te wachten, +10 seconden (met timer), antwoord van een team wissen,
vraag voor iedereen goed rekenen of laten vervallen, naar een ronde springen, team of speler hernoemen/verplaatsen/verwijderen,
zelf een basistelefoon aanwijzen, joker van een team wissen (bij de jokerstap).

## Draaien op Render (via GitHub)

Zo staat de quiz op internet, zodat teams niet op hetzelfde wifi hoeven te zitten.

1. Zet deze map in je GitHub-repository en push (zie hieronder).
2. Ga naar Render, kies **New → Blueprint** en selecteer de repository. Render leest `render.yaml`.
3. Vul bij `HOST_PIN` een pincode in van minimaal 6 cijfers. Dat is de code voor `/bediening.html`.
4. Klaar: de quiz staat op `https://<jouw-naam>.onrender.com`. Telefoons gaan naar die link,
   de tv naar `/host.html`, de quizmaster naar `/bediening.html`. De QR-code op de tv wijst vanzelf naar de juiste link.

(Zonder Blueprint kan ook: **New → Web Service**, build `npm install`, start `npm start`, plus de variabele `HOST_PIN`.)

Zet je geen `HOST_PIN`, dan kiest de server op Render zelf een willekeurige code en toont die in de logs.
Lokaal is de standaardcode `1234`.

### Betrouwbaar draaien (voor de echte avond)

Een gratis Render-service heeft een tijdelijk bestandssysteem en slaapt na 15 minuten zonder verkeer.
Render kan hem bovendien op elk moment herstarten. Dan is `data/state.json` weg en moeten teams opnieuw beginnen.
Voor een avond waarop het niet mis mag:

1. Zet in `render.yaml` het plan op `starter` en haal de `#` weg bij het `disk`-blok en bij `DATA_DIR`.
2. Push en laat Render de Blueprint opnieuw toepassen.

Met een betaalde service met schijf blijft de stand bewaard bij een herstart, en gaat de quiz na een herstart op pauze.
Je kunt de service na afloop weer terugzetten op gratis of verwijderen.

Verder:

- **Warm opstarten:** op het gratis plan duurt de eerste keer laden na het slapen 30 tot 60 seconden.
  Open de tv-pagina dus ruim van tevoren.
- **Niet pushen tijdens de quiz:** elke push start een nieuwe deploy en verbreekt alle verbindingen. Zet auto-deploy
  desnoods uit in de instellingen van de service.
- De tv-pagina heeft geen pincode. Hij toont alleen wat op dat moment getoond mag worden.

### Naar GitHub pushen

    git add -A
    git commit -m "Rondes, jokers, tekenen, 30 seconds en meer"
    git push

Verwijder in de repository eerst de oude bestanden die niet meer bestaan: `public/qtypes.js`, `public/scoreboard.html` en `.gitignore.txt`
(het goede bestand heet `.gitignore`). Draai `npm install` één keer lokaal en commit ook `package-lock.json`.
