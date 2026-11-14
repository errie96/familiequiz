---
name: hitster-manager
description: Analyseer en verbeter de Hitster-muziekrondes, Spotify-integratie, playlistselectie, Excel-bibliotheek, fallback en dubbele-nummervoorziening.
---

# Hitster beheer en diagnose

Werk alleen aan Hitster wanneer de opdracht dat betreft.

1. Lees de Hitster-sectie in `README.md` en relevante delen van `DRAAIBOEK.md`.
2. Inspecteer `Hitster-bibliotheek.xlsx` alleen-lezen tenzij de gebruiker expliciet om inhoudelijke aanpassing vraagt.
3. Traceer de bestaande selectievolgorde: officiële Spotify-playlist, passende Excel-bibliotheek, daarna vrij zoeken op Spotify volgens de projectregels.
4. Controleer categorie-/editie-mapping, lege/onbereikbare playlists, timeouts, rate limits, jaarcontrole, reeds gebruikte nummers en duplicaten met eerdere rondes.
5. Verander de fallbackvolgorde niet stilzwijgend.
6. Voeg regressietests toe voor iedere gevonden randvoorwaarde.
7. Rapporteer welke bron is gebruikt, waarom een fallback werd gekozen en hoe dubbele nummers worden voorkomen.
8. Verifieer de werking met mocks/testdata; gebruik geen echte Spotify-mutaties of accounts zonder expliciete toestemming.
