---
name: quiz-audit
description: Voer een grondige, alleen-lezen audit uit van de Familiequiz op betrouwbaarheid, architectuur, beveiliging, UX en technische risico's.
---

# Familiequiz audit

Voer standaard een alleen-lezen audit uit. Wijzig geen bestanden tenzij de gebruiker daarna expliciet om implementatie vraagt.

1. Lees `CLAUDE.md`, `README.md`, `DRAAIBOEK.md`, `package.json` en relevante tests.
2. Breng server, speler, tv, bediening, Excel-inleeslogica, Spotify/Hitster en opslag in kaart.
3. Traceer bevindingen naar concrete bestanden en functies; verzin geen problemen.
4. Beoordeel betrouwbaarheid, foutafhandeling, reconnect/herstel, beveiliging, toegankelijkheid, mobiele UX, tv-UX en offlinegedrag.
5. Rangschik bevindingen op ernst: kritiek, hoog, middel, laag.
6. Geef per bevinding: bewijs, impact tijdens een quizavond, reproduceerbare stap, aanbevolen oplossing en benodigde regressietest.
7. Controleer bestaande tests en noteer ontbrekende testdekking.
8. Sluit af met een geprioriteerd verbeterplan. Maak geen brede refactorvoorstellen als een kleine fix volstaat.
