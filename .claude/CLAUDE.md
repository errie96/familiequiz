# Familiequiz — projectregels voor Claude

## Projectdoel
Dit project is een lokale/webgebaseerde familiequiz. Teams spelen op hun telefoon, vragen en spelstatus worden op de tv getoond en de quizmaster bedient de quiz via een aparte telefoon/tablet.

## Projectstructuur en belangrijke bestanden
- `server.js`, `lib/`: server- en backendlogica.
- `public/index.html`, `public/host.html`, `public/bediening.html`, `public/bediening2.html`: schermen.
- `public/js/`: speler- en tv-logica.
- `public/bediening/`: bediening, teams, instellingen, Spotify/Hitster, backups en UI.
- `vragenlijst.xlsx`: inhoud, vragen, rondes, teksten en families. Dit is de primaire bron voor quizinhoud.
- `Hitster-bibliotheek.xlsx`: aparte Hitster-bibliotheek; niet samenvoegen met de vragenlijst.
- `questions.json`: fallback/reservequiz; niet gebruiken als primaire plek voor eigen vragen.
- `DRAAIBOEK.md`: actuele speluitleg en voorbereiding.
- `data/`: runtimegegevens, uploads, foto's, historie en backups. Niet handmatig wijzigen of opnemen in releases.
- `test/`: Node test suite.
- `package.json`: scripts en dependencies.

## Harde regels
1. Verwijder of hernoem geen bestaande ronde, functie, route, event, Excel-tabblad of bedieningselement zonder expliciete toestemming.
2. Behoud bestaand spelgedrag en bestaande interfaces tussen speler, tv, bediening en server.
3. Onderzoek eerst de relevante code, tests, README en DRAAIBOEK voordat je wijzigingen voorstelt.
4. Maak vóór grotere wijzigingen een kort plan met bestanden, risico's en tests.
5. Maak kleine, gerichte wijzigingen. Geen onnodige herstructurering tijdens een bugfix.
6. Wijzig `vragenlijst.xlsx`, `Hitster-bibliotheek.xlsx`, `questions.json`, `pincode.txt` en runtimebestanden niet tenzij de opdracht dat uitdrukkelijk vraagt.
7. Toon nooit PIN-codes, tokens, Spotify secrets of andere geheimen in antwoorden, logs, screenshots of commits.
8. Behandel uploads, gebruikersnamen, foto's en quizdata als privé. Gebruik alleen testdata bij tests.
9. Verander geen dependency-versies of lockfiles zonder reden en leg de reden uit.
10. Claim nooit dat iets getest is als het commando niet daadwerkelijk is uitgevoerd.

## Test- en kwaliteitsworkflow
- Controleer eerst `node --version` (project vereist Node.js 20 of hoger).
- Installeer dependencies alleen indien nodig met `npm install`.
- Na codewijzigingen: `npm run check`.
- Controleer offlinefunctionaliteit met `npm run offline-check` wanneer de wijziging netwerk/vendor/offline raakt.
- Test de relevante flows aanvullend: quiz starten, aanmelden, teams, ronde-overgangen, pauze/hervatten, jokers, score/undo, reconnect/herstel, Hitster fallback, tv en bediening.
- Gebruik browserautomatisering met Playwright waar mogelijk. Test bij voorkeur op localhost en gebruik testdata.
- Controleer de git diff op onbedoelde wijzigingen, secrets, data/ en gegenereerde bestanden.
- Rapporteer altijd: gewijzigde bestanden, uitgevoerde commando's, geslaagde/mislukte tests, resterende risico's.

## Hitster-regels
Volg de bestaande projectdocumentatie en implementatie. De officiële Spotify-playlist heeft voorrang waar die beschikbaar is; daarna de juiste Hitster-Excelbibliotheek; vrij zoeken op Spotify is pas de laatste fallback. Voorkom dubbele nummers en respecteer categorie-/editiegrenzen. Verander deze volgorde niet zonder expliciete opdracht.

## Release
Maak alleen een release/ZIP als daarom gevraagd wordt. Neem broncode, benodigde publieke assets en meegeleverde quizbestanden op. Sluit `node_modules/`, `.git/`, `data/`, lokale logs, tijdelijke bestanden, secrets en persoonlijke PIN-configuratie uit, tenzij expliciet anders gevraagd. Controleer de uiteindelijke ZIP-inhoud en geef een korte changelog.
