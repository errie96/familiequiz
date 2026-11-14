---
name: quiz-release
description: Bereid een veilige release van de Familiequiz voor: tests uitvoeren, wijzigingen controleren en een complete distributie-ZIP maken.
---

# Familiequiz release

Maak alleen een release wanneer de gebruiker daarom vraagt.

1. Controleer `git status` en bekijk de volledige diff.
2. Voer `npm run check` uit; voer `npm run offline-check` uit als relevant.
3. Controleer dat quizinhoud en configuratie bewust zijn opgenomen.
4. Sluit `node_modules/`, `.git/`, `data/`, logs, caches, tijdelijke bestanden, secrets en `pincode.txt` uit, tenzij de gebruiker uitdrukkelijk anders vraagt.
5. Behoud `vragenlijst.xlsx`, `Hitster-bibliotheek.xlsx`, publieke assets en documentatie wanneer deze onderdeel zijn van de distributie.
6. Controleer de ZIP na het maken: lijst inhoud, controleer essentiële bestanden en controleer dat gevoelige bestanden ontbreken.
7. Lever een changelog, testresultaten en resterende aandachtspunten.
8. Claim nooit dat de ZIP getest is als alleen de ZIP-inhoud is gecontroleerd.
