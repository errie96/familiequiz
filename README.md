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
| Bediening | `/bediening.html` | de quizmaster; pincode standaard `1234` |

Een andere pincode: `HOST_PIN=5678 npm start`.

Op de tv moet één keer op OK of een toets gedrukt worden, anders blokkeert de browser het geluid.

## Teams

E�n telefoon maakt het team aan en is de **basistelefoon**: alleen die dient antwoorden in.
Teamgenoten kiezen "Aansluiten bij team" en zien de vraag mee. Via "Basis overnemen" kan een
teamlid de basis overnemen, bijvoorbeeld als de eerste telefoon leeg is.

## Opslaan

De stand wordt steeds bewaard in `data/state.json`. Valt de server of een telefoon uit, dan
komen teams vanzelf terug. Na een herstart van de server staat de quiz op **pauze**, zodat
niemand tijd verliest; hervat met de pauzeknop. Met `npm run fresh` of Reset begin je opnieuw.

## Instellingen

Standaardwaarden staan in `config.json`; de quizmaster kan ze vóór de start in de bediening
aanpassen.

- `timerEnabled`, `defaultTime`: tijdslimiet per vraag (per vraag te overschrijven met `"time"`, `0` = geen limiet)
- `speedBonus`, `speedBonusMax`: extra punten voor snel én goed antwoorden (alleen met timer)
- `defaultPoints`: punten per goede vraag (per ronde of vraag te overschrijven met `"points"`)
- `jokersPerTeam`: aantal jokers (dubbele punten voor één vraag) per team; `0` = uit

## Vragen (`questions.json`)

    {
      "round": 1,
      "roundName": "Ronde 1: Typisch Drenthe",
      "points": 10,                        // optioneel: punten voor de hele ronde
      "questions": [{
        "id": "q1",
        "type": "multiple_choice",         // multiple_choice, audio of location
        "question": "Welke locatie zien we hier?",
        "media": { "kind": "image", "src": "images/hunebed.jpg" },   // optioneel; zie public/media/
        "options": ["A", "B", "C", "D"],
        "answer": 0,
        "time": 20,                        // optioneel
        "points": 10,                      // optioneel
        "explanation": "Leuk weetje bij het nakijken"                // optioneel
      }]
    }

(Haal de `//`-opmerkingen weg als je dit overneemt; JSON kent geen opmerkingen.)

## Noodknoppen (in de bediening)

- Antwoord van een team wissen (het team mag opnieuw antwoorden)
- +10 seconden (met timer)
- Vraag voor iedereen goed rekenen, of laten vervallen
- Team hernoemen of verwijderen

## Nieuwe vraagtypen toevoegen

1. `public/qtypes.js`: hoe de vraag op telefoon, tv en bij het nakijken getoond wordt.
2. `server.js`, `ANSWER_KINDS`: hoe een antwoord gecontroleerd wordt.

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
    git commit -m "Teams, tv-scherm, bediening, opslaan en Render"
    git push

Verwijder in de repository eerst de oude bestanden die niet meer bestaan: `public/scoreboard.html` en `.gitignore.txt`
(het goede bestand heet `.gitignore`). Draai `npm install` één keer lokaal en commit ook `package-lock.json`.
