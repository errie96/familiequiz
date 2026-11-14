---
name: quiz-regression
description: Ontwerp en voer regressietests uit voor wijzigingen aan de Familiequiz, inclusief speler, tv, bediening, rondes, teams, score, reconnect en offline.
---

# Familiequiz regressietest

Doel: aantonen dat een wijziging geen bestaande quizfunctionaliteit breekt.

1. Lees de projectregels en identificeer de gewijzigde codepaden.
2. Bekijk bestaande tests in `test/` en hergebruik de bestaande teststijl.
3. Maak eerst een testmatrix voor relevante flows: aanmelden, teams, quizstart, rondewissel, timer/pauze, joker, score, undo, reconnect/herstel, Hitster en offline waar relevant.
4. Voeg gerichte tests toe vóór of samen met de fix.
5. Voer `npm run check` uit. Gebruik `npm run offline-check` als offline/vendor/netwerk geraakt is.
6. Als Playwright beschikbaar is, test de echte UI op localhost met testdata en controleer speler-, tv- en bedieningsschermen.
7. Rapporteer exact welke commando's zijn uitgevoerd en de resultaten. Als een test niet uitvoerbaar is, zeg dat expliciet.
8. Verwijder of verzwak geen bestaande tests om een wijziging groen te krijgen zonder een inhoudelijke reden en uitleg.
