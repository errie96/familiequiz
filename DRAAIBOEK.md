# Familiequiz – draaiboek voor de quizmasters

Bijgewerkt: 2 november 2026

## In het kort

De familiequiz bestaat uit drie testvragen, een joker, acht rondes, een slotvraag met inzet en eventueel een beslissingsvraag. Elke ronde is evenveel waard: standaard 100 punten. Tijdens het spel ziet niemand een tussenstand; de uitslag komt pas aan het einde.

Er zijn drie schermen, alle drie in de browser:

| Scherm | Adres | Wie | Wat |
| --- | --- | --- | --- |
| Tv | /host.html | Iedereen kijkt mee | Vragen, foto's, logo's, timer, spiekmeldingen. Geen knoppen. |
| Telefoon | / (hoofdadres) | Elke speler | Team kiezen en antwoorden geven. |
| Bediening | /bediening.html | Quizmasters, met pincode | Alles bedienen: volgende scherm, beoordelen, pauze, noodknoppen. |

Elk team heeft één **basistelefoon**. Alleen die dient antwoorden in. De andere teamleden kijken mee op hun eigen telefoon en overleggen. Uitzonderingen: bij de geheugenronde mag iedereen meeschrijven, bij tekenen tekent een ander teamlid en bij 30 Seconds legt iedereen een keer uit.

De quizmaster heeft één grote knop die steeds zegt wat de volgende stap is (bijvoorbeeld "Volgende", "Start schrijven" of "Toon het antwoord"). Kan het nog niet, dan staat eronder op welke teams wordt gewacht.

## Voorbereiding

Alle vragen en opdrachten staan in **vragenlijst.xlsx**, met een tabblad per ronde. Tot vlak voor de start kun je die nog wijzigen; na de start niet meer.

**Vooraf, in de dagen ervoor**

1. Vul de Excel in. Gele cellen zijn invullen of aanpassen, oranje cellen zijn nog voorbeelden of schattingen. De indeling van de tabbladen blijft hetzelfde.
2. Zet de foto's (ronde 2), logo's (ronde 8) en eventuele geluidsbestanden in de map public/media/, met de bestandsnamen uit de Excel.
3. Koppel Spotify voor de muziekronde in de bediening. Nodig: Spotify Premium, http://127.0.0.1:3000/bediening.html als Redirect-URI in de Spotify-app en het account onder User Management. Open de bediening via http://127.0.0.1:3000/bediening.html (of https op Render, niet via het netwerkadres) en tik bij Spotify op "Verbind met Spotify". Kies daarna waar de muziek klinkt: "Deze browser" (de bediening op een laptop aan de speakers) of een ander Spotify-apparaat, zoals je telefoon met de Spotify-app open. Probeer "Test".

**Op de avond zelf**

1. Start de server. Lokaal met npm start; op Render ruim van tevoren de tv-pagina openen, want het gratis plan heeft een minuut nodig om wakker te worden.
2. Open op de tv /host.html en druk één keer op OK of klik op het scherm. Anders blokkeert de browser het geluid.
3. Open op je telefoon /bediening.html en vul de pincode in. Controleer in het blokje Vragenlijst (Excel) dat de juiste versie is ingelezen. Nieuwe Excel? Upload hem daar, of vervang het bestand en tik op "Opnieuw inlezen".
4. Kijk bovenin de bediening naar waarschuwingen, bijvoorbeeld een vraag zonder foute antwoorden of een liedje zonder jaar. Die vragen worden overgeslagen.
5. Laat de spelers de QR-code op de tv scannen. Iedereen vult eerst de eigen naam in en maakt dan een team, of sluit aan bij een bestaand team. Wie het team aanmaakt, is eerst de basistelefoon; het team kan samen een andere telefoon kiezen.
6. Instellingen zoals punten per ronde en speeltijden kun je alleen vóór de start aanpassen, in de bediening onder Instellingen.

## Het verloop, scherm voor scherm

De volgorde ligt vast. Elk scherm hieronder komt na een druk op de grote knop van de bediening.

1. **Lobby.** De tv toont de QR-code en de aangemelde teams. De quizmaster start met "Start de quiz" zodra alle teams binnen zijn.
2. **Infoscherm: Eerst even testen.** Uitleg dat er drie testvragen komen die niet meetellen.
3. **Drie testvragen.** Makkelijke meerkeuzevragen. Zo zien jullie of elke basistelefoon kan antwoorden en of de spiekmeldingen werken.
4. **Infoscherm: Hier begint de echte quiz.** Vanaf nu telt alles mee.
5. **Joker.** Elk team kiest op de basistelefoon de ronde waarin het verwacht het best te scoren. Die ronde telt aan het eind dubbel. De tv laat alleen zien welke teams gekozen hebben, niet wat. Je kunt pas verder als iedereen gekozen heeft.
6. **Ronde 1 tot en met 8.** Elke ronde begint met een introscherm: de rondenaam, een korte uitleg en "Hier kun je 100 punten verdienen". Daarna volgen de vragen of opdrachten. Na de laatste vraag van een ronde gaat het direct door naar de volgende ronde.
7. **Slotvraag** met inzet.
8. **Beslissingsvraag**, alleen bij een gelijke stand op de eerste plaats.
9. **Einde:** ontknoping, overzicht per ronde en nakijken.

Bovenaan de tv staan steeds de rondenaam, "Vraag x van y" en de punten van de ronde. Bij de testvragen staat "Testvraag". Loopt er een timer, dan staat die erbij en loopt er een balk bovenaan het scherm.

## De acht rondes

Per ronde: wat er op de tv staat, wat de telefoons doen en wat de quizmaster doet. Antwoorden en scores per team blijven tot het einde verborgen; alleen het goede antwoord zelf wordt soms direct getoond.

### Ronde 1: Meerkeuzevragen

Vijftig vragen in vijf categorieën van tien: algemene kennis, nieuws 2026, lokaal nieuws Drenthe 2026, sport en social media.

- **Tv:** categorie, vraag en vier antwoorden A tot D, plus welke teams al geantwoord hebben.
- **Telefoon:** de basistelefoon kiest een antwoord en tikt op Indienen.
- **Quizmaster:** zodra alle teams geantwoord hebben, wordt de knop "Volgende". Het goede antwoord wordt pas bij het nakijken aan het einde getoond.
- **Punten:** elke goede vraag telt even zwaar; 50 goed is 100 punten.

### Ronde 2: Foto blur

Eerst één testvraag, dan het tussenscherm "Nu de echte foto's!", dan tien foto's.

- **Tv:** een wazige foto, vier antwoorden en hoeveel punten een goed antwoord nu nog oplevert.
- **Telefoon:** de basistelefoon kiest één antwoord. Eén poging per vraag.
- **Quizmaster:** tikt op "Scherper maken" om de foto stap voor stap scherper te maken (zes stappen). Als alle teams geantwoord hebben, toont de tv de scherpe foto en het goede antwoord.
- **Punten:** hoe eerder goed, hoe meer: 10, 8, 6, 4, 3 of 2 punten, afhankelijk van de stap waarop het team antwoordde. Fout is 0.

### Ronde 3: Het geheugen van vorig jaar

Vorig jaar is er iets op een bord geschreven; de teams schrijven op wat ze nog weten.

- **Quizmaster:** tikt op "Start schrijven" (standaard 120 seconden). Daarna "Stop met schrijven".
- **Telefoon:** iedereen in het team mag meeschrijven, één ding per keer. Iedereen ziet de lijst van het team.
- **Beoordelen:** antwoorden die lijken op wat er op het bord stond, worden automatisch goed voorgesteld (typefouten mogen). De quizmaster zet per antwoord goed of fout en tikt op "Nakijken klaar".
- **Tv:** tijdens het schrijven alleen hoeveel elk team al heeft opgeschreven. Na het nakijken: wat er op het bord stond.
- **Punten:** aantal goede antwoorden ten opzichte van het aantal dingen op het bord.

### Ronde 4: Muziek, de tijdlijn

Zoals Hitster. Alle teams beginnen met dezelfde twee startkaarten (jaartal, titel en artiest zichtbaar). De liedjes komen in willekeurige volgorde. De ronde stopt zodra een team 10 kaarten in de tijdlijn heeft (instelbaar).

- **Quizmaster:** bij elk liedje start de bediening het nummer vanzelf via Spotify, op het gekozen apparaat. Houd de bediening open. Bij de vraag staan knoppen "Opnieuw afspelen" en "Muziek stoppen". Zonder Spotify kan het ook met een geluidsbestand, of je speelt het zelf af.
- **Telefoon:** de basistelefoon tikt op de plek in de tijdlijn waar het liedje hoort en kan optioneel het exacte jaartal invullen. Teamgenoten zien de tijdlijn maar kunnen niet plaatsen.
- **Onthullen:** als alle teams geplaatst hebben, ziet elk team op de eigen telefoon het jaartal, de titel en of de kaart goed lag. De tv toont het antwoord niet. Een goed gelegde kaart komt in de tijdlijn van dat team; een fout gelegde kaart vervalt. Heeft een team 10 kaarten, dan meldt de tv dat de muziekronde voorbij is (zonder teamnaam) en worden de overige liedjes overgeslagen.
- **Punten:** 1 per goed gelegde kaart, plus 1 bonus voor een exact goed jaartal, gemeten tegen het aantal gespeelde liedjes.

### Ronde 5: Prijzen van vroeger en nu

Tien boodschappen. Per product schat het team de prijs van nu én van 15 jaar geleden.

- **Telefoon:** de basistelefoon vult beide prijzen in.
- **Tv:** product en hoeveelheid; na alle antwoorden de echte prijzen.
- **Punten:** per prijs krijgt het team dat het dichtstbij zit 5 punten, het tweede 3, het derde 2 en het vierde 1. Gelijk is gelijk.

### Ronde 6: Tekenen

Alle teams tekenen tegelijk, elk een ander woord.

- **Quizmaster:** tikt op "Start beurt". Per team wordt willekeurig een teamlid gekozen dat nog niet getekend heeft. De basistelefoon tekent nooit.
- **Telefoon van de tekenaar:** toont het woord en een tekenvlak met kleuren, dik/dun, terug en wissen. Elke lijn verschijnt direct op de telefoons van de teamgenoten.
- **Basistelefoon:** ziet de tekening live en dient één antwoord in. Een tweede poging kan niet.
- **Einde van de beurt:** als alle teams geantwoord hebben, de tijd om is (standaard 75 seconden) of de quizmaster stopt. De tv toont de tekeningen met de woorden.
- **Beoordelen:** antwoorden worden automatisch voorgesteld; de quizmaster zet goed of fout en bevestigt.
- **Herhalen:** net zo lang tot elk teamlid behalve de basistelefoon één keer getekend heeft. Een team met één telefoon kan niet meedoen.
- **Punten:** elk goed antwoord telt even zwaar, ongeacht de snelheid.

### Ronde 7: 30 Seconds

De teams zijn om de beurt aan de beurt. Binnen elk team is iedereen één keer de uitlegger, ook de basistelefoon.

- **Quizmaster:** de knop toont wie er aan de beurt is; tik op Start.
- **Telefoon van de uitlegger:** toont vijf woorden en de timer van 30 seconden. Het eigen team raadt hardop; andere teams mogen niet meeroepen.
- **Beoordelen:** na de tijd tikt de quizmaster de goed geraden woorden aan en bevestigt.
- **Tv:** wie er aan de beurt is en een grote aftelklok; daarna de vijf woorden.
- **Punten:** 1 per goed geraden woord, gemeten tegen het aantal beurten van dat team.

### Ronde 8: Logo's

Op de tv staat een logo waarvan de helft van de stukjes is afgedekt. Er zijn geen antwoordopties.

- **Telefoon:** de basistelefoon typt het merk. Eén antwoord per team.
- **Tv:** na alle antwoorden het volledige logo met de merknaam.
- **Beoordelen:** de antwoorden staan in de bediening op volgorde van binnenkomst, met een voorstel goed of fout. De quizmaster keurt achteraf; dat verandert de volgorde niet.
- **Punten:** het snelste goede antwoord krijgt 10, dan 8, 6, 4 en 2. Fout is 0.

## Slotvraag, beslissingsvraag en het einde

### Slotvraag

Een meerkeuzevraag waarop teams eigen punten inzetten.

1. **Inzetten.** De tv toont alleen de categorie. De basistelefoon kiest een inzet tussen 0 en het eigen totaal (met snelknoppen 0, kwart, half en alles). Tot de vraag verschijnt mag de inzet nog veranderen.
2. **De vraag.** De quizmaster tikt op "Toon de vraag". De basistelefoon kiest een antwoord.
3. **Het antwoord.** Na "Toon het antwoord" ziet iedereen het goede antwoord, maar nog niet wie wat gewonnen of verloren heeft.

Goed is de inzet erbij, fout is de inzet kwijt.

### Beslissingsvraag (alleen bij gelijke stand)

Staan na de slotvraag twee of meer teams gelijk op de eerste plaats, dan volgt automatisch een open vraag. Is er geen gelijke stand, dan wordt dit scherm overgeslagen.

- Alleen de gelijke teams doen mee; de andere teams zien dat ze niet meedoen.
- De basistelefoon vult een getal in, bijvoorbeeld "Hoe lang is de Afsluitdijk?".
- Het team dat het dichtstbij zit, krijgt 1 punt en wint daarmee.
- Zitten ze even ver weg, dan volgt de volgende beslissingsvraag. Er staan er drie klaar.

### Het einde

1. **Ontknoping.** De quizmaster tikt op "Start de ontknoping". De tv onthult de ranglijst van de laatste naar de eerste plaats, met tromgeroffel, fanfare en confetti voor de winnaar.
2. **Punten per ronde.** Met "Punten per ronde op tv" ziet iedereen per team de score per ronde, waar de joker zat, de slotvraag en het totaal.
3. **Nakijken.** Met "Nakijken (alles)" ga je pagina voor pagina door alle rondes. Per vraag staat per team het antwoord, met een groen vinkje of een rood kruis.

De knop "Stand" toont op de tv de eindstand als lijst.

## Punten en spelregels

Elke ronde levert maximaal 100 punten op, hoeveel vragen er ook in zitten. Een team krijgt het percentage van het maximum dat het haalt: 30 van de 50 meerkeuzevragen goed is 60 punten. Bij tekenen en 30 Seconds wordt per team gerekend, zodat grote en kleine teams eerlijk tegen elkaar spelen.

| Onderdeel | Hoe je punten scoort | Wie antwoordt |
| --- | --- | --- |
| Testvragen | Tellen niet mee | Basistelefoon |
| R1 Meerkeuze | Elke goede vraag even zwaar | Basistelefoon |
| R2 Foto blur | 10, 8, 6, 4, 3 of 2, hoe eerder hoe meer | Basistelefoon, één poging |
| R3 Geheugen | Goede antwoorden t.o.v. wat er op het bord stond | Hele team schrijft mee |
| R4 Muziek | 1 per goed gelegde kaart, +1 voor exact jaartal | Basistelefoon |
| R5 Prijzen | Per prijs: dichtstbij 5, dan 3, 2, 1 | Basistelefoon |
| R6 Tekenen | Elk goed antwoord even zwaar | Basistelefoon, één antwoord |
| R7 30 Seconds | 1 per goed geraden woord | Eigen team, hardop |
| R8 Logo's | Snelste goed 10, dan 8, 6, 4, 2 | Basistelefoon, één antwoord |
| Joker | De gekozen ronde telt dubbel | Basistelefoon, vóór ronde 1 |
| Slotvraag | Inzet erbij of eraf | Basistelefoon |
| Beslissingsvraag | +1 voor wie het dichtstbij zit | Alleen gelijke teams |

De punten per ronde, de blur- en prijspunten, de logopunten en de speeltijden staan in de bediening onder Instellingen.

## Spiekmeldingen, pauze en noodknoppen

**Spiekmeldingen.** Verlaat een speler tijdens een vraag de quiz-app of vergrendelt die het scherm, dan verschijnt links onderin de tv een kleine melding: "Naam (Team): scherm vergrendeld of app verlaten". Bij de quizmaster piept de telefoon en staat dezelfde melding bovenin. De melding blijft staan tot de speler weer naar de quiz kijkt. Tikken op de melding in de bediening verbergt hem. Bij tekenen en 30 Seconds is er geen controle.

**Pauze.** De pauzeknop zet de quiz stil: timers stoppen, de tv en telefoons tonen een pauzescherm. Valt de server uit, dan blijft alles bewaard en staat de quiz na het herstarten op pauze. Telefoons sluiten vanzelf weer aan.

**Noodknoppen** in de bediening:

- **Toch afsluiten zonder te wachten:** als een telefoon hangt en je niet op alle teams wilt wachten.
- **Vorige stap, of springen naar een ronde.**
- **Deze stap overslaan.**
- **Antwoord van een team wissen:** het team mag opnieuw antwoorden.
- **Meerkeuzevraag voor iedereen goed rekenen, of laten vervallen.**
- **+10 seconden** bij een lopende timer.
- **Teams beheren:** team hernoemen of verwijderen, spelers hernoemen, naar een ander team verplaatsen of als basistelefoon aanwijzen.
- **Alle spiekmeldingen wissen.**
- **Quiz helemaal opnieuw:** wist alle teams en scores.

## Nog te doen voor de avond

- [ ] Geheugenronde: de voorbeeldregels vervangen door wat er vorig jaar echt op het bord stond.
- [ ] Prijzen: de huidige prijzen en die van 15 jaar geleden controleren; het zijn nu schattingen.
- [ ] Nieuws- en Drenthe-vragen 2026 nalopen, vooral de perroncontroles van Arriva en de BBB-coalitiebreuk.
- [ ] Foto's voor ronde 2 en logo's voor ronde 8 verzamelen en in public/media/ zetten.
- [ ] Liedjeslijst voor ronde 4 afmaken: 2 startkaarten en minstens 25 liedjes, met het juiste jaar.
- [ ] Genoeg tekenwoorden (ronde 6) en 30 Seconds-kaarten (ronde 7) voor het aantal spelers.
- [ ] Spotify koppelen in de bediening, het afspeelapparaat kiezen en een muziekvraag testen.
- [ ] Generale repetitie met een paar telefoons, tv en bediening.
- [ ] Voor de avond op Render: betaald plan met schijf aanzetten, anders gaat de stand bij een herstart verloren.
