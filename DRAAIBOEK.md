# Familiequiz – draaiboek voor de quizmasters

Bijgewerkt: 3 november 2026

## In het kort

De familiequiz begint met drie testvragen, daarna een teamfoto, en bestaat verder uit een joker, acht rondes, een slotvraag met inzet en eventueel een beslissingsvraag. Elke ronde is evenveel waard: standaard 100 punten. Tijdens het spel ziet niemand de totaalstand (tenzij de quizmaster de tussenstand aanzet); de uitslag komt pas aan het einde.

Er zijn drie schermen, alle drie in de browser:

| Scherm | Adres | Wie | Wat |
| --- | --- | --- | --- |
| Tv | /host.html | Iedereen kijkt mee | Vragen, foto's, logo's, timer, spiekmeldingen. Geen knoppen. |
| Telefoon | / (hoofdadres) | Elke speler | Team kiezen en antwoorden geven. |
| Bediening | /bediening.html | Quizmasters, met toegangscode | Alles bedienen: volgende scherm, beoordelen, pauze, noodknoppen. |

Elk team heeft één **basistelefoon**. Alleen die dient antwoorden in. De andere teamleden kijken mee op hun eigen telefoon en overleggen. Uitzonderingen: bij tekenen komt iedereen aan de beurt (tekent de basistelefoon zelf, dan vult een ander teamlid tijdelijk het antwoord in) en bij 30 Seconds legt iedereen een keer uit.

De quizmaster heeft één grote knop die steeds zegt wat de volgende stap is (bijvoorbeeld "Volgende", "Start schrijven" of "Toon het antwoord"). Kan het nog niet, dan staat eronder op welke teams wordt gewacht.

## Voorbereiding

Alle vragen en opdrachten staan in **vragenlijst.xlsx**, met een tabblad per ronde. Tot vlak voor de start kun je die nog wijzigen; na de start niet meer. De nummers voor extra muziekrondes staan apart in **Hitster-bibliotheek.xlsx**; zo is de vragenlijst eenvoudig door anderen te gebruiken.

**Vooraf, in de dagen ervoor**

1. Vul de Excel in. Gele cellen zijn invullen of aanpassen, oranje cellen zijn nog voorbeelden of schattingen. De indeling van de tabbladen blijft hetzelfde. Alle vaste teksten op tv en telefoons (welkomstpagina, tussenpagina's, joker, slotvraag, einde, pauze…) staan in het tabblad Teksten; de uitleg per ronde in het tabblad Rondes.
2. Zet de foto's (ronde 2), logo's (ronde 8) en eventuele geluidsbestanden in de map public/media/, met de bestandsnamen uit de Excel.
3. Koppel Spotify voor de muziekronde in de bediening. Nodig: Spotify Premium, http://127.0.0.1:3000/bediening.html als Redirect-URI in de Spotify-app en het account onder User Management. Open de bediening via http://127.0.0.1:3000/bediening.html (of https op Render, niet via het netwerkadres) en tik bij Spotify op "Verbind met Spotify". Kies daarna waar de muziek klinkt: "Deze browser" (de bediening op een laptop aan de speakers) of een ander Spotify-apparaat, zoals je telefoon met de Spotify-app open. Probeer "Test".

**Op de avond zelf**

1. Start de server. Lokaal met npm start; op Render ruim van tevoren de tv-pagina openen, want het gratis plan heeft een minuut nodig om wakker te worden.
2. Open op de tv /host.html en druk één keer op OK of klik op het scherm. Anders blokkeert de browser het geluid. Het tv-scherm past zich aan het formaat van de tv of beamer aan: past iets niet, dan wordt het scherm automatisch kleiner gemaakt. De tv vraagt zelf om niet in slaap te vallen; zet op een laptop voor de zekerheid ook de slaapstand en schermbeveiliging uit. Valt de verbinding weg, dan staat rechtsboven op de tv een rode melding tot hij terug is.
3. Open op je telefoon /bediening.html en vul de toegangscode in (alleen de eerste keer; daarna onthoudt het toestel een sessie, niet de code). Rechtsboven in de bediening staat "📺 Tv verbonden" (groen) of "Tv niet verbonden!" (rood): zo zie je meteen of de tv nog meedoet. Controleer in het blokje Vragenlijst (Excel) dat de juiste versie is ingelezen. Nieuwe Excel? Upload hem daar, of vervang het bestand en tik op "Opnieuw inlezen".
4. Kijk bovenin de bediening naar waarschuwingen, bijvoorbeeld een vraag zonder foute antwoorden of een liedje zonder jaar (die vragen worden overgeslagen), of een foto, logo of geluidsbestand dat ontbreekt in public/media/ (📁, per ronde).
5. Op de tv staat eerst de welkomstpagina (tekst uit de Excel, tabblad Teksten). Vul in de bediening bij Teams eerst het maximale aantal teams in (verplicht), tik dan op "Toon het aanmeldscherm" en laat de spelers de QR-code scannen. Is het maximum bereikt, of is de quiz eenmaal begonnen, dan kan niemand meer een nieuw team maken, alleen nog aansluiten bij een bestaand team. Eenmaal begonnen is begonnen. Iedereen vult eerst de eigen naam in en maakt dan een team, of sluit aan bij een bestaand team. Wie het team aanmaakt, is eerst de basistelefoon; het team kan samen een andere telefoon kiezen.
6. Kies in de bediening het thema (bijvoorbeeld Kerst of Winter) en zet de rondes in de gewenste volgorde (blokje Rondes). Instellingen en de rondevolgorde kun je alleen vóór de start aanpassen; het thema altijd.

## Het verloop, scherm voor scherm

De volgorde ligt vast. Elk scherm hieronder komt na een druk op de grote knop van de bediening.

1. **Welkomstpagina en lobby.** Eerst de welkomstpagina; na een druk op de knop het aanmeldscherm met de QR-code en de aangemelde teams. De quizmaster start met "Start de quiz" zodra alle teams binnen zijn.
2. **Rondeoverzicht en uitleg per ronde.** Eerst alle rondes op een rij, daarna per ronde een uitlegscherm.
3. **Infoscherm: Eerst even testen.** Uitleg dat er drie testvragen komen die niet meetellen.
4. **Drie testvragen.** Makkelijke meerkeuzevragen. Zo zien jullie of elke basistelefoon kan antwoorden en of de spiekmeldingen werken.
5. **Teamfoto.** Na de testvragen (als duidelijk is dat alles werkt) maakt elke basistelefoon de teamfoto: de groene knop opent direct de camera, "Uit galerij" kiest een bestaande foto, "Overslaan" kan ook. De tv toont alle teams met een groen vinkje zodra de foto binnen is. De grote knop wordt pas "Volgende" als alle teams klaar zijn; met "Toch doorgaan" ga je eerder verder. Daarvoor en daarna kan een team de foto niet aanpassen (de quizmaster kan er in de bediening een verwijderen).
6. **Joker.** Elk team kiest op de basistelefoon de ronde waarin het verwacht het best te scoren. Die ronde telt aan het eind dubbel. De tv laat zien op welke ronde elk team de joker zet. Je kunt pas verder als iedereen gekozen heeft.
7. **Infoscherm: Hier begint de echte quiz.** Vanaf nu telt alles mee.
8. **Ronde 1 tot en met 8.** Elke ronde begint met een tussenpagina: "Nu gaan we door naar…", tromgeroffel, en dan springt de rondenaam in beeld met uitleg en "Hier kun je 100 punten verdienen". Daarna volgt een oefenronde die niet meetelt, het scherm "Nu begint het echt!" en dan de echte vragen. Bij ronde 1 komt er ook een tussenpagina voor elke nieuwe categorie. Volgorde en aantal rondes stel je vooraf in de bediening in.
9. **Slotvraag** met inzet.
10. **Beslissingsvraag**, alleen bij een gelijke stand op de eerste plaats. Anders verschijnt het scherm "Geen gelijke stand".
11. **Einde:** ontknoping, overzicht per ronde en nakijken.

Bovenaan de tv staan steeds de rondenaam, "Vraag x van y" en de punten van de ronde. Bij test- en oefenvragen staat "Testvraag" of "Oefenvraag". Loopt er een timer, dan staat die erbij en loopt er een balk bovenaan het scherm.

## De acht rondes

Per ronde: wat er op de tv staat, wat de telefoons doen en wat de quizmaster doet. Antwoorden en scores per team blijven tot het einde verborgen; alleen het goede antwoord zelf wordt soms direct getoond.

### Ronde 1: Meerkeuzevragen

Eerst een oefenvraag, dan vijftig vragen in vijf categorieën van tien: algemene kennis, nieuws 2026, lokaal nieuws Drenthe 2026, sport en social media. Voor elke categorie komt een tussenpagina.

- **Tv:** categorie, vraag en vier antwoorden A tot D, plus welke teams al geantwoord hebben.
- **Telefoon:** de basistelefoon kiest een antwoord en tikt op Indienen.
- **Quizmaster:** zodra alle teams geantwoord hebben, wordt de knop "Volgende". Het goede antwoord wordt pas bij het nakijken aan het einde getoond.
- **Punten:** elke goede vraag telt even zwaar; 50 goed is 100 punten.

### Ronde 2: Foto blur

Eerst een oefenfoto, dan tien foto's. Geen meerkeuze: elk team typt één antwoord.

- **Tv:** een wazige foto en hoeveel punten een goed antwoord nu nog oplevert.
- **Telefoon:** de basistelefoon typt wat er op de foto staat. Eén poging per foto.
- **Quizmaster:** tikt op "Scherper maken" om de foto stap voor stap scherper te maken (zes stappen). Als alle teams geantwoord hebben, toont de tv de scherpe foto en het goede antwoord. In de bediening keurt de quizmaster elk antwoord goed of fout (er staat al een voorstel).
- **Punten:** hoe eerder goed, hoe meer: 10, 8, 6, 4, 3 of 2 punten, afhankelijk van de stap waarop het team antwoordde. Fout is 0.

### Ronde 3: Het geheugen van vorig jaar

Vorig jaar is er iets op een bord geschreven; de teams schrijven op wat ze nog weten.

- **Quizmaster:** tikt op "Start schrijven". Er loopt geen klok: de quizmaster tikt op "Tijd is om" wanneer hij dat wil. Eerst is er een oefenopdracht (bijvoorbeeld Drentse gemeenten).
- **Telefoon:** alleen de basistelefoon schrijft de antwoorden op, één per keer. De teamgenoten zien de lijst mee.
- **Beoordelen:** antwoorden die lijken op wat er op het bord stond, worden automatisch goed voorgesteld (typefouten mogen). De quizmaster zet per antwoord goed of fout en tikt op "Nakijken klaar".
- **Tv:** tijdens het schrijven alleen hoeveel elk team al heeft opgeschreven. Na het nakijken: wat er op het bord stond.
- **Punten:** aantal goede antwoorden ten opzichte van het aantal dingen op het bord.

### Ronde 4: Muziek, de tijdlijn

Zoals Hitster. Alle teams beginnen met dezelfde twee startkaarten (jaartal, titel en artiest zichtbaar). Eerst één oefenliedje (telt niet mee; de kaart komt niet in de tijdlijn). De liedjes komen in willekeurige volgorde. De ronde stopt zodra een team 10 kaarten in de tijdlijn heeft (instelbaar).

- **Quizmaster:** bij elk liedje start de bediening het nummer vanzelf via Spotify, op het gekozen apparaat. Houd de bediening open. Bij de vraag staan knoppen "Opnieuw afspelen" en "Muziek stoppen". Zonder Spotify kan het ook met een geluidsbestand, of je speelt het zelf af.
- **Telefoon:** de basistelefoon tikt op de plek in de tijdlijn waar het liedje hoort en kan optioneel het exacte jaartal invullen. Teamgenoten zien de tijdlijn maar kunnen niet plaatsen.
- **Onthullen:** als alle teams geplaatst hebben, ziet elk team op de eigen telefoon het jaartal, de titel en of de kaart goed lag. De tv toont het antwoord niet. Een goed gelegde kaart komt in de tijdlijn van dat team; een fout gelegde kaart vervalt. Heeft een team 10 kaarten, dan meldt de tv dat de muziekronde voorbij is (zonder teamnaam) en worden de overige liedjes overgeslagen.
- **Punten:** 1 per goed gelegde kaart, plus 1 bonus voor een exact goed jaartal, gemeten tegen het aantal gespeelde liedjes.

### Ronde 5: Prijzen van vroeger en nu

Eerst een oefenproduct, dan tien boodschappen. Per product schat het team de prijs van nu én van 15 jaar geleden.

- **Telefoon:** de basistelefoon vult beide prijzen in.
- **Tv:** product en hoeveelheid; na alle antwoorden de echte prijzen.
- **Punten:** per prijs krijgt het team dat het dichtstbij zit 5 punten, het tweede 3, het derde 2 en het vierde 1. Gelijk is gelijk.

### Ronde 6: Tekenen

Alle teams tekenen tegelijk, elk een ander woord.

- **Quizmaster:** doet eerst zelf een oefenbeurt: hij tekent in de bediening, de tekening verschijnt live op de tv en iedereen raadt hardop. Daarna tikt hij op "Start beurt". Per team wordt willekeurig een teamlid gekozen dat nog niet getekend heeft, ook de basistelefoon.
- **Telefoon van de tekenaar:** toont het woord en een tekenvlak met kleuren, dik/dun, terug en wissen. Elke lijn verschijnt direct op de telefoons van de teamgenoten.
- **Basistelefoon:** ziet de tekening live en dient één antwoord in; een tweede poging kan niet. Tekent de basistelefoon zelf, dan vult een ander teamlid tijdelijk het antwoord in.
- **Einde van de beurt:** pas als elk team een antwoord heeft ingediend; er loopt geen klok. De tv toont daarna de tekeningen met de woorden.
- **Beoordelen:** de quizmaster ziet in de bediening per team de tekening, het woord en het antwoord, zet goed of fout (er staat een voorstel) en bevestigt. Bij het nakijken aan het einde staan de tekeningen er ook bij.
- **Herhalen:** net zo lang tot iedereen één keer getekend heeft. Een team met één telefoon kan niet meedoen.
- **Punten:** elk goed antwoord telt even zwaar, ongeacht de snelheid.

### Ronde 7: 30 Seconds

De teams zijn om de beurt aan de beurt. Binnen elk team is iedereen één keer de uitlegger, ook de basistelefoon.

- **Quizmaster:** doet eerst zelf een oefenbeurt (de woorden staan in de bediening). Daarna toont de knop wie er aan de beurt is; tik op Start.
- **Telefoon van de uitlegger:** toont vijf woorden en de timer van 30 seconden. Het eigen team raadt hardop; andere teams mogen niet meeroepen.
- **Beoordelen:** de quizmaster tikt een woord aan zodra het goed geraden is, al tijdens de beurt. Na de tijd controleert hij en bevestigt.
- **Tv:** wie er aan de beurt is, een grote aftelklok en vijf vakjes; een goedgekeurd woord verschijnt meteen groen.
- **Punten:** 1 per goed geraden woord, gemeten tegen het aantal beurten van dat team.

### Ronde 8: Logo's

Eerst een oefenlogo. Op de tv staat een logo waarvan de helft van de stukjes is afgedekt. Er zijn geen antwoordopties.

- **Telefoon:** de basistelefoon typt het merk. Eén antwoord per team.
- **Tv:** na alle antwoorden het volledige logo met de merknaam.
- **Beoordelen:** de antwoorden staan in de bediening op volgorde van binnenkomst, met een voorstel goed of fout. De quizmaster keurt achteraf; dat verandert de volgorde niet.
- **Punten:** het snelste goede antwoord krijgt 10, dan 8, 6, 4 en 2. Fout is 0.

## Slotvraag, beslissingsvraag en het einde

### Slotvraag

Een meerkeuzevraag waarop teams eigen punten inzetten.

1. **Inzetten.** De tv toont alleen de categorie. De basistelefoon kiest een inzet van 0 tot maximaal 100 punten (snelknoppen 0, kwart, half, alles). Teams kennen hun stand niet, daarom een vast maximum; dat pas je aan bij Instellingen. Tot de vraag verschijnt mag de inzet nog veranderen.
2. **De vraag.** De quizmaster tikt op "Toon de vraag". De basistelefoon kiest een antwoord.
3. **Het antwoord.** Na "Toon het antwoord" ziet iedereen het goede antwoord, maar nog niet wie wat gewonnen of verloren heeft.

Goed is de inzet erbij, fout is de inzet kwijt.

### Beslissingsvraag (alleen bij gelijke stand)

Staan na de slotvraag twee of meer teams gelijk op de eerste plaats, dan volgt automatisch een open vraag. Is er geen gelijke stand, dan verschijnt het scherm "Geen gelijke stand: de beslissingsvraag is niet nodig" en gaat het door naar de ontknoping.

- Alleen de gelijke teams doen mee; de andere teams zien dat ze niet meedoen.
- De basistelefoon vult een getal in, bijvoorbeeld "Hoe lang is de Afsluitdijk?".
- Het team dat het dichtstbij zit, krijgt 1 punt en wint daarmee.
- Zitten ze even ver weg, dan volgt de volgende beslissingsvraag. Er staan er drie klaar.

### Het einde

1. **Ontknoping.** De quizmaster tikt op "Start de ontknoping" en daarna per plek op "Onthul plek …". De tv onthult de ranglijst van de laatste naar de eerste plaats, één plek per druk, zodat er tussendoor prijzen uitgereikt kunnen worden. Elke plek komt eerst een paar seconden groot in beeld met tromgeroffel, de teamfoto, de naam en de punten; daarna schuift het team in de ranglijst. De winnaar staat langer in beeld en krijgt daarna de banner met foto, fanfare en confetti.
2. **Punten per ronde.** Met "Punten per ronde op tv" ziet iedereen per team de score per ronde, waar de joker zat, de slotvraag en het totaal.
3. **Nakijken.** Met "Nakijken (alles)" ga je pagina voor pagina door alle rondes. Per vraag staat per team het antwoord, met een groen vinkje of een rood kruis.

De knop "Stand" toont op de tv de eindstand als lijst.

**Na de ontknoping** zijn er in de bediening extra knoppen voor de tv:

- **🏅 Prijsjes op tv**: de app reikt zelf awards uit, één kaart tegelijk met tromgeroffel. Per soort ronde het beste team (bijvoorbeeld Beste tekenaars, Muziekkenners), en daarnaast Snelle jongens (vaakst als eerste geantwoord), Durfallen (hoogste inzet bij de slotvraag), Jokermeesters, Spiekkoningen, Net niet (tweede plaats) en Volhouders (laatste plaats).
- **📷 Fotoalbum op tv**: een diavoorstelling met alle teamfoto's en tekeningen van de avond. Leuk om op de achtergrond te laten lopen.
- **📤 Uitslag delen**: maakt een plaatje van de eindstand met teamfoto's om in de familie-app te zetten. Spelers hebben dezelfde knop op hun telefoon.

Op het aanmeldscherm staat bij een volgende quiz een **Hall of fame** met de winnaars van eerdere jaren.

## Punten en spelregels

Elke ronde levert maximaal 100 punten op, hoeveel vragen er ook in zitten. Een team krijgt het percentage van het maximum dat het haalt: 30 van de 50 meerkeuzevragen goed is 60 punten. Bij tekenen en 30 Seconds wordt per team gerekend, zodat grote en kleine teams eerlijk tegen elkaar spelen. Oefenvragen tellen nooit mee. Zo is elke ronde even zwaar en is de joker eerlijk, ook bij extra rondes (die zijn ook 100 punten waard).

| Onderdeel | Hoe je punten scoort | Wie antwoordt |
| --- | --- | --- |
| Testvragen | Tellen niet mee | Basistelefoon |
| R1 Meerkeuze | Elke goede vraag even zwaar | Basistelefoon |
| R2 Foto blur | 10, 8, 6, 4, 3 of 2, hoe eerder hoe meer | Basistelefoon, één poging |
| R3 Geheugen | Goede antwoorden t.o.v. wat er op het bord stond | Basistelefoon |
| R4 Muziek | 1 per goed gelegde kaart, +1 voor exact jaartal | Basistelefoon |
| R5 Prijzen | Per prijs: dichtstbij 5, dan 3, 2, 1 | Basistelefoon |
| R6 Tekenen | Elk goed antwoord even zwaar | Basistelefoon, één antwoord |
| R7 30 Seconds | 1 per goed geraden woord | Eigen team, hardop |
| R8 Logo's | Snelste goed 10, dan 8, 6, 4, 2 | Basistelefoon, één antwoord |
| Joker | De gekozen ronde telt dubbel | Basistelefoon, vóór ronde 1 |
| Slotvraag | Inzet erbij of eraf | Basistelefoon |
| Beslissingsvraag | +1 voor wie het dichtstbij zit | Alleen gelijke teams |

De punten per ronde, de blur-, prijs- en logopunten, de maximale inzet en de tijd van 30 Seconds staan in de bediening onder Instellingen.

## Spiekmeldingen, pauze en noodknoppen

**Spiekmeldingen.** Verlaat een speler tijdens een vraag de quiz-app of vergrendelt die het scherm, dan verschijnt links onderin de tv een kleine melding: "Naam (Team): scherm vergrendeld of app verlaten". Bij de quizmaster piept de telefoon en staat dezelfde melding bovenin. De melding blijft staan tot de speler weer naar de quiz kijkt. Tikken op de melding in de bediening verbergt hem. Bij tekenen en 30 Seconds is er geen controle.

**Instellingen op de telefoon.** Rechtsboven op elke telefoon staat een tandwiel ⚙️. Daar kan een speler de tekst groter maken (handig voor oudere spelers), hoog contrast aanzetten, trillen of 'scherm aan houden' uitzetten en de eigen naam wijzigen. Er staat ook een korte uitleg van het spel. Het menu openen telt niet als spieken.

**Telefoon zonder verbinding.** Valt de wifi van een speler weg, dan krijgt die telefoon een rode balk "Verbinding kwijt" en zijn de knoppen uitgeschakeld tot hij terug is. Een team ziet na indienen een balk "✅ Ingediend!" in de eigen teamkleur (Android-telefoons trillen ook kort bij een nieuwe vraag en bij indienen).

**Pauze.** De pauzeknop zet de quiz stil: timers stoppen, de tv en telefoons tonen een pauzescherm. Valt de server uit, dan blijft alles bewaard en staat de quiz na het herstarten op pauze. Telefoons sluiten vanzelf weer aan.

**Bediening tijdens het spel.** De grote knop en de rij teams blijven bovenaan staan als je naar beneden scrolt. In die rij zie je per team: ✓ heeft geantwoord, ⏳ nog bezig, 📵 basistelefoon offline, 🕵️ aantal keer weggekeken. Ingrijpende acties (vorige stap, vraag laten vervallen of goed rekenen, overslaan, springen, reset) vragen eerst om bevestiging. De noodknoppen staan apart in een rood omkaderd blok.

**Telefoons.** Na indienen verschijnt "✅ Ingediend!". Valt de wifi weg, dan blijft het antwoord bewaard en gaat het na het herverbinden vanzelf alsnog, zolang de vraag nog openstaat.

**Reservekopieën en logboek.** In het blok 🛟 maakt de app elke 5 minuten (en bij start, einde, uploads en vóór een reset) een kopie van alles: stand, geschiedenis, teamfoto's, playlists, vragenlijst en Hitster-bibliotheek. Download na de quiz een zip. Gaat er iets mis, kijk dan in het logboek: daar staat wat er gebeurde en welke fout er was.

**Noodknoppen** in de bediening:

- **Dubbel tikken is veilig:** de grote knop is na een tik even geblokkeerd en een tik die bij een vorig scherm hoort wordt genegeerd. Ook als beide quizmasters tegelijk drukken, wordt er dus nooit een scherm overgeslagen.
- **Foutje in de quiz:** gaat er in de software iets mis, dan verschijnt bovenin de bediening "Foutje opgevangen …" en loopt de quiz gewoon door. Probeer de actie zo nodig opnieuw.
- **Alle bediening-toestellen uitloggen:** als iemand de toegangscode heeft afgekeken; daarna moet iedereen de code opnieuw invoeren.
- **Toch afsluiten zonder te wachten:** als een telefoon hangt en je niet op alle teams wilt wachten.
- **Vorige stap, of springen naar een ronde.**
- **Deze stap overslaan.**
- **Antwoord van een team wissen:** het team mag opnieuw antwoorden.
- **Meerkeuzevraag voor iedereen goed rekenen, of laten vervallen.**
- **+10 seconden** bij een lopende timer.
- **Teams beheren:** team hernoemen of verwijderen, spelers hernoemen, naar een ander team verplaatsen of als basistelefoon aanwijzen (knop ⭐ basis bij een speler).
- **Basistelefoon offline (lege batterij, weggelopen):** in het blok Teams verschijnt bij dat team een rode melding met per verbonden teamgenoot een knop "⭐ … wordt basis". Eén tik en die telefoon dient vanaf nu de antwoorden in; het team krijgt daar een melding van. Is er geen andere telefoon verbonden, laat dan iemand opnieuw de QR-code scannen en aansluiten bij het team. Komt de oude telefoon terug, dan kun je hem op dezelfde manier weer basis maken.
- **Alle spiekmeldingen wissen.**
- **Quiz helemaal opnieuw:** wist alle teams en scores.

## Thema, rondevolgorde en scores

**Teamkleuren.** Elk team krijgt bij het aanmelden automatisch een eigen kleur. Die kleur komt overal terug: rond de teamfoto, in de bolletjes "wie heeft geantwoord" (die oplichten zodra een team indient), in de balken na elke ronde, in de ranglijst en bovenin op de telefoons.

**Thema.** In de bediening (blokje Thema) kies je Standaard, Winter, Kerst, Oud & nieuw, Zomer of Halloween. Het thema verandert de kleuren en decoratie op de tv en alle telefoons, met bijvoorbeeld vallende sneeuw bij Winter en Kerst. Dat kan altijd, ook tijdens de quiz.

**Rondevolgorde.** In het blokje Rondes zet je vóór de start de rondes in de gewenste volgorde en zet je rondes aan of uit.

**Extra rondes.** Onder het rondeplan kun je 30 Seconds, tekenen of de muziek nog een keer laten spelen, vooraf of later tijdens de quiz. Tijdens de quiz komt de extra ronde direct na de huidige ronde. Een extra ronde is net zoveel punten waard als elke andere ronde en heeft geen oefenronde. Bij een extra muziekronde kies je een Hitster-editie (Battle of the Generations in drie tijdvakken: t/m 1984, 1985–2004, 2005–2025) of een eigen lijst (80s & 90s, 00s & 10s). Eerst komen de liedjes en startkaarten uit de officiële Hitster-playlist van die editie op Spotify (de bediening moet met Spotify verbonden zijn). Lukt dat niet, bijvoorbeeld omdat Spotify niet verbonden is of de bediening dicht is, dan schakelt de ronde na hooguit 20 seconden vanzelf over op de Hitster-Excel (Hitster-bibliotheek.xlsx, één tabblad per editie); de keuzelijst toont hoeveel nummers daar klaarstaan. Zijn die ook op, dan zoekt de bediening zelf op Spotify; zonder Spotify-koppeling wordt een iTunes-fragment van 30 seconden op de tv afgespeeld. Laat Spotify verbonden: dan controleert de bediening bij elk nummer het jaartal (eerste uitgave) voordat het antwoord getoond wordt. Bij de Excel gaat een eigen (geüploade) bibliotheek voor de meegeleverde; R4 Muziek wordt nooit gebruikt. De vaste muziekronde (R4) komt altijd uit de vragenlijst. De tijdlijnen beginnen opnieuw, en liedjes, tekenwoorden en 30 Seconds-kaarten die al gespeeld zijn komen niet nog een keer. Een extra ronde die nog niet begonnen is, kun je weer verwijderen.

**Scores voor de quizmasters.** Alleen in het blokje Scores zien de quizmasters tijdens het spel de stand per ronde, met de joker erbij. Bij Teams staan geen punten.

**De stand blijft geheim.** Bij "Dit was ronde…" ziet iedereen alleen de punten van die ronde; de totaalstand blijft geheim tot de ontknoping. Bij de prijzenronde komen de bedragen niet op de tv; die zie je bij het nakijken.

**Spiekgeluid.** Onder Instellingen kun je het alarmgeluid bij spiekmeldingen apart uitzetten op de tv en op je eigen bediening. De melding zelf blijft zichtbaar.

**Pauze.** Tijdens de pauze loopt op de tv een diavoorstelling met alle teamfoto's.

**Oefenen met testteams.** In het blok Teams voegt "+3 testteams" robots toe (🤖 Robot Appel, Peer, …). Ze maken geen foto, kiezen een joker en geven zelf antwoorden: willekeurig en ongeveer de helft goed. Zo kunnen de quizmasters samen de hele quiz doorlopen, inclusief beoordelen, de muziekronde en de ontknoping, zonder telefoons. Toevoegen kan alleen vóór de start; een oefenquiz met testteams komt niet in de quizgeschiedenis. Verwijder de testteams (of gebruik Reset) voordat de echte quiz begint.

## Nog te doen voor de avond

- [ ] Geheugenronde: de voorbeeldregels vervangen door wat er vorig jaar echt op het bord stond.
- [ ] Prijzen: de huidige prijzen en die van 15 jaar geleden controleren; het zijn nu schattingen.
- [ ] Nieuws- en Drenthe-vragen 2026 nalopen, vooral de perroncontroles van Arriva en de BBB-coalitiebreuk.
- [ ] Foto's voor ronde 2 en logo's voor ronde 8 verzamelen en in public/media/ zetten (de bediening toont welke bestanden nog ontbreken).
- [ ] Liedjeslijst voor ronde 4 afmaken: 2 startkaarten en minstens 25 liedjes, met het juiste jaar.
- [ ] Genoeg tekenwoorden (ronde 6) en 30 Seconds-kaarten (ronde 7) voor het aantal spelers.
- [ ] Spotify koppelen in de bediening, het afspeelapparaat kiezen en een muziekvraag testen.
- [ ] Hitster-lijsten klaarzetten (bediening, blok 🎶, met Spotify verbonden): eventueel Lijsten bijwerken en Aanvullen, dan Jaartallen controleren (± 20 minuten), daarna de Excel downloaden en in de projectmap/GitHub zetten.
- [ ] Een extra muziekronde testen met Spotify verbonden (de officiële playlists zijn al gekoppeld; controleer in blok 🎶 of ze werken).
- [ ] Oefenvragen per ronde nalopen (kolom Oefen? in de Excel).
- [ ] Oefenquiz met testteams doorlopen met beide quizmasters (tv + bediening), daarna testteams verwijderen.
- [ ] Online: een lange toegangscode instellen (HOST_PIN, bijv. drie woorden met streepjes).
- [ ] Na de quiz: in het blok 🛟 een zip van alles downloaden en bewaren.
- [ ] Generale repetitie met een paar echte telefoons (iPhone en Android), tv en bediening; ook een teamfoto maken.
- [ ] Voor de avond op Render: betaald plan met schijf aanzetten, anders gaat de stand bij een herstart verloren.
