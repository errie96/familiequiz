# Familiequiz – draaiboek voor de quizmasters

Bijgewerkt: 3 november 2026

## In het kort

De familiequiz begint met drie testvragen, daarna een teamfoto en de uitleg van alle rondes, en bestaat verder uit een joker, acht rondes, een slotvraag met inzet en eventueel een beslissingsvraag. Elke ronde is evenveel waard: standaard 100 punten. Tijdens het spel ziet niemand de totaalstand (tenzij de quizmaster de tussenstand aanzet); de uitslag komt pas aan het einde.

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
3. Koppel Spotify voor de muziekronde in de bediening. Nodig: Spotify Premium, http://127.0.0.1:3000/bediening.html als Redirect-URI in de Spotify-app en het account onder User Management. Open de bediening via http://127.0.0.1:3000/bediening.html (niet via het netwerkadres) en tik bij Spotify op "Verbind met Spotify". Kies daarna waar de muziek klinkt: "Deze browser" (de bediening op een laptop aan de speakers) of een ander Spotify-apparaat, zoals je telefoon met de Spotify-app open. Probeer "Test".

**Op de avond zelf**

1. Start de server: dubbelklik op *start-lokaal* (of `npm start`). Valt de server onverwacht uit, dan start hij vanzelf opnieuw op.
2. Open op de tv /host.html en druk één keer op OK of klik op het scherm. Anders blokkeert de browser het geluid. Het tv-scherm past zich aan het formaat van de tv of beamer aan: past iets niet, dan wordt het scherm automatisch kleiner gemaakt. De tv vraagt zelf om niet in slaap te vallen; zet op een laptop voor de zekerheid ook de slaapstand en schermbeveiliging uit. Valt de verbinding weg, dan toont de tv na 1,5 seconde een rustige kaart met het logo ("Even geduld…") tot hij terug is.
3. Open op je telefoon /bediening.html en vul de toegangscode in (alleen de eerste keer; daarna onthoudt het toestel een sessie, niet de code). Rechtsboven in de bediening staat "📺 Tv verbonden" (groen) of "Tv niet verbonden!" (rood): zo zie je meteen of de tv nog meedoet. Controleer in het blokje Vragenlijst (Excel) dat de juiste versie is ingelezen. Nieuwe Excel? Upload hem daar, of vervang het bestand en tik op "Opnieuw inlezen".
4. Kijk bovenin de bediening naar waarschuwingen, bijvoorbeeld een vraag zonder foute antwoorden of een liedje zonder jaar (die vragen worden overgeslagen), of een foto, logo of geluidsbestand dat ontbreekt in public/media/ (📁, per ronde).
5. Op de tv staat eerst de welkomstpagina (tekst uit de Excel, tabblad Teksten). Vul in de bediening bij Teams eerst het maximale aantal teams in (verplicht), tik dan op "Toon het aanmeldscherm" en laat de spelers de QR-code scannen. Is het maximum bereikt, of is de quiz eenmaal begonnen, dan kan niemand meer een nieuw team maken, alleen nog aansluiten bij een bestaand team. Eenmaal begonnen is begonnen. Iedereen vult eerst de eigen naam in en maakt dan een team, of sluit aan bij een bestaand team. Wie het team aanmaakt, is eerst de basistelefoon; het team kan samen een andere telefoon kiezen.
6. Kies in de bediening het thema (bijvoorbeeld Kerst of Winter) en zet de rondes in de gewenste volgorde (blokje Rondes). Instellingen en de rondevolgorde kun je alleen vóór de start aanpassen; het thema altijd.

## Het verloop, scherm voor scherm

De volgorde ligt vast. Elk scherm hieronder komt na een druk op de grote knop van de bediening.

1. **Welkomstpagina en lobby.** Eerst de welkomstpagina; na een druk op de knop het aanmeldscherm met de QR-code. De aftelklok ("De quiz begint over …") zet je zelf aan met de knoppen ⏱️ onder de grote knop (5, 10, 15 of 30 minuten, *➕ 5 min erbij*, *✖ Klok weg*); er is geen vaste starttijd meer. Hoe het aanmelden gaat, staat hieronder bij *Aanmelden en teams maken*. De quizmaster start met "Start de quiz" zodra de teams klaar zijn.
2. **Infoscherm: Eerst even testen.** Uitleg dat er drie testvragen komen die niet meetellen.
3. **Drie testvragen.** Makkelijke meerkeuzevragen die **iedereen op zijn eigen telefoon** beantwoordt (dus niet alleen de basistelefoon). Zo zie je vóór de start of elke telefoon meedoet en of de spiekmeldingen werken. Een team krijgt zijn vinkje op de tv als al zijn verbonden telefoons hebben geantwoord; in de bediening staat bij het wachten wie er nog ontbreekt, bijv. *De Kerstballen (Tim, Eva)*. Daarna dient alleen de basistelefoon nog antwoorden in.
4. **Teamfoto.** Na de testvragen (als duidelijk is dat alles werkt) maakt elke basistelefoon de teamfoto: de groene knop opent direct de camera (een bestaande foto uit de galerij kiezen kan niet), "Overslaan" kan ook. De tv toont alle teams met een groen vinkje zodra de foto binnen is. De grote knop wordt pas "Volgende" als alle teams klaar zijn; met "Toch doorgaan" ga je eerder verder. Daarvoor en daarna kan een team de foto niet aanpassen (de quizmaster kan er in de bediening een verwijderen).
5. **Rondeoverzicht en uitleg per ronde.** Eerst alle rondes op een rij, daarna per ronde een uitlegscherm. Zo weet iedereen wat er komt vóór de joker gekozen wordt.
6. **Infoscherm: Hier begint de echte quiz.** Vanaf nu telt alles mee.
7. **Joker.** Elk team kiest op de basistelefoon de ronde waarin het verwacht het best te scoren. Die ronde telt aan het eind dubbel. De tv laat zien op welke ronde elk team de joker zet. Je kunt pas verder als iedereen gekozen heeft.
8. **Ronde 1 tot en met 8.** Elke ronde begint met een tussenpagina: "Nu gaan we door naar…", tromgeroffel, en dan springt de rondenaam in beeld met uitleg, "Hier kun je 100 punten verdienen" en 🎯 hoe je die punten verdient (bijv. bij Hitster: de helft voor de goede plek in de tijdlijn, de helft voor het exacte jaartal). Daarna volgt een oefenronde die niet meetelt, het scherm "Nu begint het echt!" en dan de echte vragen. Bij ronde 1 komt er ook een tussenpagina voor elke nieuwe categorie. Volgorde en aantal rondes stel je vooraf in de bediening in.
9. **Slotvraag** met inzet.
10. **Beslissingsvraag**, alleen bij een gelijke stand op de eerste plaats. Anders verschijnt het scherm "Geen gelijke stand".
11. **Einde:** ontknoping, overzicht per ronde en nakijken.

Bovenaan de tv staan steeds de rondenaam, "Vraag x van y" en de punten van de ronde. Bij test- en oefenvragen staat "Testvraag" of "Oefenvraag". Loopt er een timer, dan staat die erbij en loopt er een balk bovenaan het scherm.

## Aanmelden en teams maken

Er zijn twee manieren; de app kiest zelf op basis van de Excel (in de bediening bij 👥 Teams kun je het ook vastzetten).

**Persoonlijk aanmelden (standaard zodra er families in het tabblad *Families* van de Excel staan).**

1. *Vooraf:* zet in het tabblad **Families** elke familie met het aantal personen, en vul in de bediening bij 👥 Teams het **aantal teams** in.
2. *Op de avond:* iedereen scant de QR-code en vult drie dingen in: **naam**, **familie** (aantikken uit de lijst) en **leeftijd**. Daarna staat er "Je bent aangemeld" tot de teams gemaakt zijn. Op de tv staat per familie wie er al is, met een teller (bijv. *Jansen 5 / 6*); leeftijden komen nooit op de tv.
3. *Bediening:* de blauwe knop **👥 Aanmeldingen en teams** (onder de grote knop) opent het overzicht: per familie de namen van jong naar oud, en bovenaan "Aangemeld: 15 van 17". Tik een naam aan om de leeftijd, naam of familie te verbeteren of de aanmelding te verwijderen.
4. Is iedereen er, tik dan op **🎲 Maak teams**. De app maakt even grote teams en spreidt leeftijden en families zo goed mogelijk. Bevalt het niet: **🎲 Opnieuw verdelen**, of tik een naam aan en kies een ander team. Wil je dat jonge kinderen bij een ouder blijven, vul dan vóór het verdelen een leeftijd in bij "Kinderen t/m deze leeftijd bij een volwassen gezinslid houden".
5. Elk team krijgt een voorlopige naam (Team 1, Team 2 …) en een basistelefoon (een volwassene). Op die telefoon vult het team zijn **eigen teamnaam** in en kiest het een kleur; de anderen tikken op *Akkoord* voor de basistelefoon (of stellen een andere voor). De tv toont de teams met alle namen.
6. De startknop wordt pas actief als iedereen is ingedeeld en elk team een naam heeft ("⚠️ Toch starten" kan altijd).

*Laatkomers* melden zich op dezelfde manier aan, ook als de quiz al loopt. In de bediening verschijnt dan een oranje knop "⚠️ 1 laatkomer zonder team": tik de naam aan en kies een team.

**Zelf teams maken (als het tabblad Families leeg is).** Zoals voorheen: iemand maakt op zijn telefoon een team aan (teamnaam en kleur), de rest sluit aan.

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

- **Tv:** een wazige foto en hoeveel punten een goed antwoord nu nog oplevert. Het fotokader past zich aan de foto aan (staand, liggend of vierkant).
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

Zoals Hitster. Elk team begint met **twee eigen startkaarten** (jaartal, titel en artiest zichtbaar); geen twee teams hebben dezelfde. De liedjes met *Startkaart = JA* in de Excel worden als eerste uitgedeeld, de rest komt willekeurig uit de liedjeslijst (een paar jaar uit elkaar). Een startkaart wordt daarna niet meer als liedje gedraaid: bij 5 teams gaan er dus 10 liedjes van de lijst af. Het aantal startkaarten per team stel je in bij ⚙️ Instellingen (*Muziek: eigen startkaarten per team*). Eerst één oefenliedje (telt niet mee; de kaart komt niet in de tijdlijn). De liedjes komen in willekeurige volgorde. De ronde stopt zodra een team 10 kaarten in de tijdlijn heeft (instelbaar).

- **Quizmaster:** bij elk liedje start de bediening het nummer vanzelf via Spotify, op het gekozen apparaat. Houd de bediening open. Bij de vraag staan knoppen "Opnieuw afspelen" en "Muziek stoppen". Zonder Spotify kan het ook met een geluidsbestand, of je speelt het zelf af.
- **Telefoon:** de basistelefoon tikt op de plek in de tijdlijn waar het liedje hoort en kan optioneel het jaartal, de titel en de artiest invullen. Teamgenoten zien de tijdlijn maar kunnen niet plaatsen.
- **Tv:** de tijdlijn van elk team ligt als een rij kaarten op de tv, zoals bij het echte spel: het jaartal groot, de artiest erboven en de titel eronder, met ernaast hoeveel kaarten het team heeft. Zodra een team heeft ingediend, valt er helemaal aan de rechterkant van het scherm een **dichte kaart** (achterkant met het quizlogo), los van de tijdlijn. Twee seconden nadat alle teams hebben ingediend, schuiven de dichte kaarten naar de plek die elk team koos. Bij **Toon het antwoord** draaien ze om.
- **Onthullen:** als alle teams hebben ingediend, wordt de grote knop (ook in bediening2) **🎯 Toon het antwoord (kaarten draaien om)**. Er wordt dus niets meer vanzelf onthuld. Na de druk op de knop draaien de kaarten team voor team om en staat het liedje (titel, artiest, jaartal) bovenaan: een goed gelegde kaart krijgt een groene rand en blijft liggen, een fout gelegde kaart krijgt een rode rand en valt van tafel. Elk team ziet het ook op de eigen telefoon. Wil je niet op een team wachten: "Toch afsluiten". Heeft een team 10 kaarten, dan meldt de tv dat de muziekronde voorbij is en worden de overige liedjes overgeslagen.
- **Goed om te weten:** op de tv is te zien hoeveel kaarten elk team heeft en waar een team zijn dichte kaart legt (pas zodra iedereen heeft ingediend, zodat niemand kan afkijken). Omdat elk team andere startkaarten heeft, zegt de plek van een ander team weinig over je eigen tijdlijn.
- **Punten (per liedje, aan te passen bij Instellingen):** 5 voor een goed gelegde kaart; jaartal met speling: exact 5, 1 jaar ernaast 3, 2 jaar ernaast 2, 3 jaar ernaast 1; bonus 2 voor de goede titel en 2 voor de goede artiest. Alles wordt omgerekend naar de punten van de ronde.
- **Titel en artiest goedkeuren:** na het onthullen staat in de bediening per team wat er is ingevuld, met een voorstel van de app (kleine tikfouten, hoofdletters en toevoegingen als "feat." tellen gewoon goed). Tik op ✔/✘ om het voorstel aan te passen; de spelers zien daarna op hun telefoon of titel en artiest goed waren.

### Ronde 5: Prijzen van vroeger en nu

Eerst een oefenproduct, dan tien boodschappen. Per product schat het team de prijs van nu én van 15 jaar geleden.

- **Telefoon:** de basistelefoon vult beide prijzen in.
- **Tv:** product en hoeveelheid; na alle antwoorden de echte prijzen. De bedragen (zowel de schattingen als de echte prijzen) komen niet op de tv; die zie je bij het nakijken.
- **Punten:** per prijs krijgt het team dat het dichtstbij zit 5 punten, het tweede 3, het derde 2 en het vierde 1. Gelijk is gelijk.

### Ronde 6: Tekenen

Alle teams tekenen tegelijk, elk een ander woord.

- **Quizmaster:** doet eerst zelf een oefenbeurt: hij tekent in de bediening, de tekening verschijnt live op de tv en iedereen raadt hardop. Daarna tikt hij op "Start beurt". Per team wordt willekeurig een teamlid gekozen dat nog niet getekend heeft, ook de basistelefoon.
- **Eerst de tekenaars, dan de start:** vóór elke beurt staat al vast wie er tekent. De tv toont per team de tekenaar, en op de telefoon van de tekenaar staat "Jij bent de tekenaar!". Zo kan die zich klaarmaken. Pas als de quizmaster de beurt start, verschijnt het woord. Is een tekenaar intussen weg, dan neemt een teamgenoot die nog niet tekende het over.
- **Telefoon van de tekenaar:** toont het woord en een tekenvlak met kleuren, dik/dun, terug en wissen. Elke lijn verschijnt direct op de telefoons van de teamgenoten.
- **Basistelefoon:** ziet de tekening live en dient één antwoord in; een tweede poging kan niet. Tekent de basistelefoon zelf, dan vult een ander teamlid tijdelijk het antwoord in.
- **Einde van de beurt:** pas als elk team een antwoord heeft ingediend; er loopt geen klok. De tv toont daarna de tekeningen met de woorden.
- **Beoordelen:** de quizmaster ziet in de bediening per team de tekening, het woord en het antwoord, zet goed of fout (er staat een voorstel) en bevestigt. Bij het nakijken aan het einde staan de tekeningen er ook bij.
- **Herhalen:** net zo lang tot iedereen één keer getekend heeft. Een team met één telefoon kan niet meedoen.
- **Punten:** elk goed antwoord telt even zwaar, ongeacht de snelheid.

### Ronde 7: 30 Seconds

De teams zijn om de beurt aan de beurt; er is steeds maar één verteller tegelijk bezig. Standaard is binnen elk team iedereen één keer de uitlegger. Omdat dat lang kan duren, kun je het aantal vertellers per team beperken.

- **Aantal vertellers kiezen (vóór de eerste beurt):** in het paneel van de ronde staat *Aantal vertellers per team* met knoppen *Iedereen*, *1 per team*, *2 per team* … en bij elke knop de geschatte duur. Kies je een aantal, dan tikt de **basistelefoon** van elk team aan wie er gaan uitleggen (in de volgorde van de beurten). De tv laat zien welke teams al gekozen hebben; zodra iedereen klaar is, zet de grote knop de beurten klaar. Wil je niet wachten: "⏭️ Toch doorgaan", dan kiest de app voor de teams die nog niet kozen. Je kunt het aantal ook vooraf vastzetten bij ⚙️ Instellingen (*30 Seconds: vertellers per team*).
- **Ongelijke teams:** is een team kleiner dan het aantal beurten, dan legt iedereen van dat team uit en tikt de basistelefoon aan wie een tweede keer mag. Zo heeft elk team evenveel beurten.
- **Noodknop bij uitlopen:** *⏱️ Loopt het uit? Stop na deze rondgang* (onder de woorden in de bediening). De lopende rondgang wordt afgemaakt, zodat elk team even vaak is geweest; de rest vervalt. Nog een keer tikken draait het terug.

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

Staan na de slotvraag twee of meer teams gelijk op de eerste plaats, dan volgt automatisch een open vraag. Teams vullen een getal in; wie het dichtst bij zit krijgt 1 punt. Zitten teams even dichtbij, dan wint wie het snelst antwoordde. De vragen en de volgorde staan in de Excel, tabblad Slotvraag. De eerste is **"Hoe oud zijn alle {aantal} deelnemers van vanavond bij elkaar opgeteld?"** met als antwoord *automatisch*: de quiz telt zelf de leeftijden op die bij het aanmelden zijn ingevuld (je ziet het totaal in de bediening; quizmasters melden zich niet aan en tellen niet mee). Zijn er geen leeftijden (teams zelf gemaakt), dan wordt deze vraag overgeslagen en volgen meteen de vragen uit de Excel. Is er geen gelijke stand, dan verschijnt het scherm "Geen gelijke stand: de beslissingsvraag is niet nodig" en gaat het door naar de ontknoping.

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
- **📤 Uitslag delen**: maakt een plaatje van de eindstand met teamfoto's om in de familie-app te zetten. Spelers hebben dezelfde knop op hun telefoon. Kan de telefoon niet delen (bijvoorbeeld via http op het thuisnetwerk), dan verschijnt het plaatje groot: lang indrukken om het te bewaren of te delen.

Op het aanmeldscherm staat bij een volgende quiz een **Hall of fame** met de winnaars van eerdere jaren.

**De avond in cijfers.** Na de ontknoping staat in de bediening, naast *Prijsjes* en *Fotoalbum*, de knop **📊 De avond in cijfers op tv**: tegels met onder meer het aantal deelnemers, de leeftijden bij elkaar, hoe lang de quiz duurde, hoeveel procent van de meerkeuzevragen goed ging, het aantal geraden woorden, tekeningen, emoji's en spiekmeldingen. Een cijfer waar niets over te melden valt, blijft weg.

## Punten en spelregels

Elke ronde levert maximaal 100 punten op, hoeveel vragen er ook in zitten. Een team krijgt het percentage van het maximum dat het haalt: 30 van de 50 meerkeuzevragen goed is 60 punten. Bij tekenen en 30 Seconds wordt per team gerekend, zodat grote en kleine teams eerlijk tegen elkaar spelen. Oefenvragen tellen nooit mee. Zo is elke ronde even zwaar en is de joker eerlijk, ook bij extra rondes (die zijn ook 100 punten waard).

| Onderdeel | Hoe je punten scoort | Wie antwoordt |
| --- | --- | --- |
| Testvragen | Tellen niet mee | Iedereen, op de eigen telefoon |
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

**Geluid via de tv of de bediening.** In de bediening bij 📊 Scores kies je "🔊 Quizgeluiden via: De tv / Deze bediening". Bij "Deze bediening" speelt de tv niets af en klinken tromgeroffel, belletjes, fanfare en muziekfragmenten op het toestel waarop je dat koos (tik daar één keer op het scherm om geluid toe te staan). Spotify kies je apart bij 🎧 Spotify.

**Spiekmeldingen.** Verlaat een speler tijdens een vraag de quiz-app of vergrendelt die het scherm en blijft die langer weg dan de wachttijd (standaard 1 seconde, in te stellen in de bediening), dan verschijnt links onderin de tv een kleine melding: "Naam (Team): scherm vergrendeld of app verlaten". Bij de quizmaster piept de telefoon en staat dezelfde melding bovenin. De melding blijft staan tot de speler weer naar de quiz kijkt. Even de meldingenbalk omlaag trekken of een pop-up wegtikken binnen de wachttijd geeft geen melding. Valt de verbinding van een telefoon weg tijdens een vraag, dan telt dat ook als weg. Tikken op de melding in de bediening verbergt hem. Bij tekenen en 30 Seconds is er geen controle.

**Instellingen op de telefoon.** Bij het aanmelden staat op elke telefoon een korte uitleg van dit menu. Rechtsboven op elke telefoon staat een tandwiel ⚙️. Daar kan een speler de tekst groter maken (handig voor oudere spelers), hoog contrast aanzetten, het oplichten bij een nieuwe vraag aan- of uitzetten en, alleen vóór de start, de eigen naam wijzigen. Daarna kan alleen de quizmaster een naam aanpassen. Het scherm blijft altijd aan. Het menu openen telt niet als spieken.

**Telefoon zonder verbinding.** Valt de wifi van een speler weg, dan krijgt die telefoon een rode balk "Verbinding kwijt" en zijn de knoppen uitgeschakeld tot hij terug is. Een team ziet na indienen een balk "✅ Ingediend!" in de eigen teamkleur (het scherm licht ook kort op in de teamkleur bij een nieuwe vraag en bij indienen; trillen werkt op veel telefoons niet vanuit een website).

**Pauze.** De pauzeknop zet de quiz stil: timers stoppen, de tv en telefoons tonen een pauzescherm. Valt de server uit, dan blijft alles bewaard en staat de quiz na het herstarten op pauze. Telefoons sluiten vanzelf weer aan.

**Pauzescherm.** Zonder foto's staat het logo groot boven "Pauze!". Zodra er pauzefoto's of een dilemma in beeld zijn, staat "Pauze!" met de timer vast bovenaan en krijgen de foto's of het dilemma de rest van het scherm.

**Pauzetimer.** Tijdens de pauze stel je in de bediening (onder de pauzeknop) of in bediening2 in wanneer jullie verder gaan: 5, 10, 15 of 20 minuten, *➕ 5 min erbij* of *✖ Timer weg*. Op de tv en alle telefoons staat dan "We gaan verder om 20:45 · nog 12:34". Is de tijd om, dan klinkt er een belletje en staat er "We gaan zo weer verder!". De quiz gaat niet vanzelf verder: jullie drukken zelf op *Hervat*. Bij hervatten verdwijnt de timer; een volgende pauze begint zonder timer. De teksten staan in de Excel (tabblad Teksten: pauze.timer, pauze.timer.nog, pauze.timer.voorbij).

**Indeling van de bediening.** Bovenaan staan altijd de vaste knoppen: de grote knop, vorige, pauze, posities op tv en het teamoverzicht. Alles wat je vooraf instelt staat onder **⚙️ Instellingen** (op een laptop altijd rechts in beeld). **🧭 Voorbereiding** loopt vóór de start stap voor stap door alles wat geregeld moet zijn: tv, vragenlijst, rondevolgorde, teams, Spotify, Hitster-muziek, thema en spelregels, en een eindcontrole. Dit menu opent vanzelf bij een nieuwe quiz en kan altijd opnieuw. **🚨** springt direct naar de noodknoppen. Werkt op telefoon, tablet en laptop.

**Handig tijdens het spel.** Op een laptop werken sneltoetsen: spatie = grote knop, ← = vorige stap, P = pauze, M = muziek stoppen. Onder het stap-paneel staat *⏭ Hierna* met de volgende vraag, het antwoord en het weetje, zodat je alvast kunt vertellen. Discussie over een antwoord? In *📊 Scores* kun je per team punten corrigeren (−5, −1, +1, +5); met ↶ draai je de laatste correctie terug. Bij logo's en foto blur staat achter elk antwoord hoeveel het lijkt op het goede antwoord (groen vanaf 80%).

**Emoji-reacties.** Bij uitlegschermen, *Dit was ronde* en in de pauze kunnen spelers emoji's naar de tv sturen; die zweven over het scherm. Tijdens vragen kan het niet.

**Bediening tijdens het spel.** De grote knop en de rij teams blijven bovenaan staan als je naar beneden scrolt. In die rij zie je per team: ✓ heeft geantwoord, ⏳ nog bezig, 📵 basistelefoon offline, 🕵️ aantal keer weggekeken. Ingrijpende acties (vorige stap, vraag laten vervallen of goed rekenen, overslaan, springen, reset) vragen eerst om bevestiging. De noodknoppen staan apart in een rood omkaderd blok.

**Startklaar.** Vóór de start controleert de app de quiz. Bij een echte fout (bijvoorbeeld een ronde zonder vragen) staat de startknop uit met de reden erbij; met "⚠️ Toch starten" kan het alsnog. In 🧭 Voorbereiding staat "✅ Quiz is startklaar" of welke fouten en waarschuwingen er zijn.

**Wegvallende telefoon tijdens een vraag.** Valt de basistelefoon van een team weg en gaat de vraag intussen dicht, dan mag alleen dat team na terugkomst nog antwoorden. Andere teams kunnen niets meer wijzigen.

**Telefoons.** Na indienen verschijnt "✅ Ingediend!". Valt de wifi weg, dan blijft het antwoord bewaard en gaat het na het herverbinden vanzelf alsnog, zolang de vraag nog openstaat.

**Reservekopieën en logboek.** In het blok 🛟 maakt de app een kopie van alles (stand, geschiedenis, teamfoto's, playlists, vastgezette vragen, vragenlijst en Hitster-bibliotheek): bij de start, aan het begin van elke ronde, vóór de slotvraag, aan het einde, vóór een reset en elke 5 minuten. Download na de quiz een zip. Gaat er iets mis, kijk dan in het logboek: daar staat wat er gebeurde en welke fout er was.

**Terugzetten.** Is er iets misgegaan (verkeerde knop, punten door elkaar), klap dan 🛟 open en kies bij de kopie van het begin van de ronde *↩️ terugzetten*. De server start kort opnieuw op (ongeveer 5 seconden), daarna staat de quiz op pauze aan het begin van die ronde en sluiten de telefoons en de tv vanzelf weer aan. Druk op pauze om verder te gaan. De stand van vlak vóór het terugzetten blijft bewaard als kopie `voor-terugzetten`, dus ook terugzetten is terug te draaien.

**Vragen staan vast.** Vanaf de start leest de quiz de Excel niet meer opnieuw in, ook niet na een herstart. Aanpassingen aan de vragenlijst tijdens de quiz tellen dus pas bij de volgende quiz. Start de quiz altijd met start-lokaal (dubbelklik); valt de server uit, dan start hij vanzelf opnieuw op.

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

## Als er iets misgaat: noodkaart

| Wat zie je | Wat doe je |
| --- | --- |
| **Laptop of server valt uit** (stroom, vastgelopen) | Start opnieuw met *start-lokaal* (dubbelklik). Alles is bewaard: teams, aanmeldingen, antwoorden en de stand. De quiz staat daarna op pauze; tv en telefoons verbinden vanzelf. Tik op de pauzeknop om verder te gaan. |
| **Server crasht** | De bewaker start hem binnen een paar seconden zelf opnieuw. Wacht even en ga verder na de pauze. |
| **"Foutje opgevangen …" bovenin de bediening** | De quiz loopt door. Sinds deze versie krijgt elk scherm zijn stand apart: gaat er iets mis bij één telefoon of bij de tv, dan werken de andere schermen gewoon. Probeer de actie opnieuw; helpt dat niet, sla de stap over (🚨). |
| **Tv toont niets of loopt achter** | Ververs de pagina op de tv (/host.html) en druk één keer op OK voor het geluid. De stand komt direct terug. |
| **Eén telefoon doet het niet** | Pagina verversen of de QR-code opnieuw scannen: de telefoon wordt herkend. Andere telefoon nodig (leeg, kapot)? Scan daarop de QR-code en vul dezelfde naam in: de telefoon vraagt "ben jij dat?" en neemt de plek in het team over. |
| **Basistelefoon leeg of weg** | 👥 Teams → bij dat team "⭐ … wordt basis". |
| **Wifi valt weg** | Telefoons tonen een rode balk en verbinden vanzelf zodra de wifi terug is; ingevulde antwoorden worden dan alsnog verstuurd. Blijft het mis: zet de quiz op pauze tot de wifi er weer is. |
| **Verkeerde knop, punten door elkaar** | ↶ Ongedaan maken (onder de grote knop), punten corrigeren bij 📊 Scores, of 🛟 → kopie van het begin van de ronde → *↩️ terugzetten*. |
| **Teams verkeerd verdeeld** | Vóór de start: *🎲 Opnieuw verdelen* of iemand aantikken en verplaatsen. Vlak voor het verdelen maakt de app een reservekopie. |
| **Het loopt uit** | 30 Seconds: minder vertellers per team of *Stop na deze rondgang*. Verder: ronde overslaan via 🚨 → *Spring naar een ronde*. |
| **Laptop helemaal kapot** | Kopieer de map `data/` (staat in de quizmap) naar dezelfde map op een andere laptop met de quiz erop en start daar *start-lokaal*. Het adres (QR-code) is dan anders: laat iedereen opnieuw scannen en zijn **eigen naam** opnieuw invullen. De telefoon vraagt dan "Er is al een … aangemeld, ben jij dat?"; met OK gaat die speler verder in zijn eigen team, met de stand van vóór de storing. Dit werkt alleen bij persoonlijk aanmelden en is niet op een tweede laptop getest: probeer het vooraf één keer als je hierop wilt kunnen terugvallen. |

Test de eerste drie regels één keer vooraf: trek tijdens een oefenquiz de stekker eruit (of sluit het zwarte venster) en kijk hoe alles terugkomt. Dat geeft rust op de avond zelf.

## Thema, rondevolgorde en scores

**Teamkleuren.** Elk team kiest bij het aanmelden zelf een kleur (al gekozen kleuren zijn niet meer beschikbaar). Het telefoonscherm van het team kleurt daarna subtiel mee. Die kleur komt overal terug: rond de teamfoto, in de bolletjes "wie heeft geantwoord" (die oplichten zodra een team indient), in de balken na elke ronde, in de ranglijst en bovenin op de telefoons.

**Thema.** In de bediening (blokje Thema) kies je Standaard, Winter, Kerst, Oud & nieuw, Zomer of Halloween. Het thema verandert de kleuren en decoratie op de tv en alle telefoons, met bijvoorbeeld vallende sneeuw bij Winter en Kerst. Dat kan altijd, ook tijdens de quiz.

**Rondevolgorde.** In het blokje Rondes zet je vóór de start de rondes in de gewenste volgorde en zet je rondes aan of uit.

**Extra rondes.** Onder het rondeplan kun je 30 Seconds, tekenen of de muziek nog een keer laten spelen, vooraf of later tijdens de quiz. Tijdens de quiz komt de extra ronde direct na de huidige ronde. Een extra ronde is net zoveel punten waard als elke andere ronde en heeft geen oefenronde. Bij een extra muziekronde kies je een Hitster-editie (Battle of the Generations in drie tijdvakken: t/m 1984, 1985–2004, 2005–2025) of een eigen lijst (80s & 90s, 00s & 10s). Eerst komen de liedjes en startkaarten uit de officiële Hitster-playlist van die editie op Spotify (de bediening moet met Spotify verbonden zijn). Lukt dat niet, bijvoorbeeld omdat Spotify niet verbonden is of de bediening dicht is, dan schakelt de ronde na hooguit 20 seconden vanzelf over op de Hitster-Excel (Hitster-bibliotheek.xlsx, één tabblad per editie); de keuzelijst toont hoeveel nummers daar klaarstaan. Zijn die ook op, dan zoekt de bediening zelf op Spotify; zonder Spotify-koppeling wordt een iTunes-fragment van 30 seconden op de tv afgespeeld. Laat Spotify verbonden: dan controleert de bediening bij elk nummer het jaartal (eerste uitgave) voordat het antwoord getoond wordt. Bij de Excel gaat een eigen (geüploade) bibliotheek voor de meegeleverde; R4 Muziek wordt nooit gebruikt. De vaste muziekronde (R4) komt altijd uit de vragenlijst. De tijdlijnen beginnen opnieuw, en liedjes, tekenwoorden en 30 Seconds-kaarten die al gespeeld zijn komen niet nog een keer. Een extra ronde die nog niet begonnen is, kun je weer verwijderen.

**Scores voor de quizmasters.** Alleen in het blokje Scores zien de quizmasters tijdens het spel de stand per ronde, met de joker erbij. Bij Teams staan geen punten.

**Momentum-meldingen.** Bij "Dit was ronde…" verschijnen op de tv één of twee korte meldingen, zoals "🚀 BalloerBatsers stijgt 2 plaatsen!", "👑 … neemt de leiding over!" of "🔥 Het is superspannend aan de top!". Nooit punten, wel wie stijgt en wie bovenaan staat. Uit te zetten in de bediening bij 📊 Scores (📣 Momentum-meldingen op de tv), ook tijdens de quiz.

**De stand blijft geheim.** Bij "Dit was ronde…" staan alleen de teams (met foto), zonder punten en zonder volgorde. Wil je tussendoor spanning? Met **🏅 Posities op tv** in de bediening zet je de tussenstand op de tv: alleen wie op welke plek staat, nooit de punten. Nogmaals tikken haalt hem weg. Bij de prijzenronde komen de bedragen niet op de tv; die zie je bij het nakijken.

**Spiekgeluid.** Onder Instellingen kun je het alarmgeluid bij spiekmeldingen apart uitzetten op de tv en op je eigen bediening. De melding zelf blijft zichtbaar.

**Pauze.** Tijdens de pauze staat op de tv een fotomuur met tot 12 foto's tegelijk: de nieuwste pauzefoto's eerst, aangevuld met de teamfoto's. Zijn er meer, dan wisselt er om de paar seconden één foto. Iedereen kan op de telefoon een **pauzefoto** maken: die verschijnt meteen vooraan op de muur (met "Nieuw!") en wordt bewaard (map data/fotos/). Na de quiz download je in de bediening alle foto's van de avond (teamfoto's en pauzefoto's) als zip, bijvoorbeeld om in de familie-app te delen. De tv toont een kleine versie, maar in de zip staan de foto's op ware grootte (tot 4096 pixels, zonder locatiegegevens): de telefoon stuurt het origineel na het maken op de achtergrond na. Lukt dat niet (wifi weg), dan staat de kleine versie in de zip. Start je een nieuwe quiz (Reset), dan gaan alle foto's van de vorige quiz naar de map `data/fotos/archief/<datum_tijd>/` en begint het album leeg. Er wordt niets weggegooid.

**Oefenen met testteams.** In het blok Teams voegt "+3 testteams" robots toe (🤖 Robot Appel, Peer, …). Ze maken geen foto, kiezen een joker en geven zelf antwoorden: willekeurig en ongeveer de helft goed. Zo kunnen de quizmasters samen de hele quiz doorlopen, inclusief beoordelen, de muziekronde en de ontknoping, zonder telefoons. Toevoegen kan alleen vóór de start; een oefenquiz met testteams komt niet in de quizgeschiedenis. Verwijder de testteams (of gebruik Reset) voordat de echte quiz begint.

## Zo loopt het op de tv (handig om te weten)

- **Opening.** Na *Start de quiz* speelt eerst 6 seconden de opening (logo, jingle). Pas daarna komt "Eerst even testen"; de grote knop doet in die 6 seconden niets.
- **Logo-flits.** Aan het begin van elke ronde komt het logo anderhalve seconde groot in beeld. Uitzetten: bediening, blok 🎛️ Tijdens de quiz, *✨ Logo-flits*.
- **Meerkeuze.** De antwoorden vliegen direct achter de vraag aan. Staat *antwoord meteen tonen* aan, dan blijft het na het laatste antwoord nog 2 seconden spannend; daarna kleurt het goede antwoord groen en vliegen de teamfoto's naar het vakje dat elk team koos.
- **Klok.** De gekleurde tijdbalk heeft een eigen strook helemaal bovenaan. Bij 30 Seconds en tekenen staat alleen het grote getal in beeld.
- **Momentum.** Na elke ronde hooguit twee meldingen: één over een team (nooit het team dat eerste staat) en één over het veld, zonder namen ("Twee teams delen de koppositie!").
- **Oefentekenen.** De quizmaster kan de oefentekening ook op bediening2 (telefoon) maken.
- **Trillen.** Android-telefoons trillen bij een nieuwe vraag (uit te zetten in het menu ⚙️); een iPhone licht alleen op. Bediening2 trilt bij een spiekmelding en als de grote knop weer kan.

## Voorbereiding: alles wat vooraf moet

Werk deze lijst van boven naar beneden af. In de bediening staat onder 🧭 Voorbereiding ook een checklist; die controleert een deel hiervan automatisch (tv verbonden, tv-geluid, wifi-QR, foto's en logo's, Spotify) en de rest vink je daar met *Gedaan* af.

### 1. Techniek (nu, ruim voor kerst)

- [ ] Eén keer `npm install` draaien terwijl je internet hebt, en het nieuwe bestand `package-lock.json` in GitHub zetten. Daarna niet meer opnieuw installeren.
- [ ] De projectmap op de laptop zelf zetten, bijv. `C:\familiequiz` of `~/familiequiz`, niet in OneDrive, iCloud of Dropbox (die zetten bestanden soms even vast).
- [ ] Windows: bij de firewallvraag van Node.js kiezen voor **privénetwerk**, en de thuiswifi in Windows als privénetwerk instellen. Anders kunnen de telefoons de laptop niet bereiken.
- [ ] Router: de ASUS RT-AC88U als repeater met de wifinaam "FamilieQuiz" testen met een paar telefoons.
- [ ] In de hoofdrouter een vast adres (DHCP-reservering) voor de laptop instellen. Anders kan het adres in de QR-code halverwege veranderen.
- [ ] `npm run offline-check` draaien: alles groen behalve wat je bewust niet gebruikt.
- [ ] Spotify koppelen in de bediening (Premium, redirect-adres http://127.0.0.1:3000/bediening.html in de Spotify-app), afspeelapparaat kiezen en *Test*.
- [ ] Hitster-lijsten klaarzetten (blok 🎶, met Spotify verbonden): eventueel *Lijsten bijwerken* en *Aanvullen*, dan *Jaartallen controleren* (± 20 minuten), daarna de Excel downloaden en in de projectmap/GitHub zetten.
- [ ] Een extra muziekronde testen (de officiële playlists zijn al gekoppeld; controleer in blok 🎶 of ze werken).

### 2. Uiterlijk: naam, logo, geluid en wifi

- [ ] Excel, tabblad *Teksten*, bovenaan: `quiz.naam`, `quiz.ondertitel`, `quiz.kortenaam` (onder het app-icoon) en `opening.tekst`. De aftelklok op het welkomstscherm zet je op de avond zelf aan in de bediening (⏱️ 5/10/15/30 min, net als de pauzetimer); er is geen vaste starttijd meer.
- [ ] Logo en app-icoon: laten staan, of eigen `logo.png` en `app-icoon.png` in `public/media/huisstijl/` zetten (zie LEES-MIJ.txt daar). Staat de naam al in het logo, zet dan `quiz.logo.naam` op *nee*.
- [ ] Jingle en achtergrondmuziek: de standaardbestanden staan in `public/media/muziek/`. Eigen muziek? Zet daar `opening.mp3` en/of `achtergrond.mp3` neer (zie LEES-MIJ.txt). Beluisteren met *🎬 Opening testen* in het blok 🎛️ Tijdens de quiz.
- [ ] Wifi-QR maken (wifinaam "FamilieQuiz" en het wachtwoord) en opslaan als `public/media/wifi-qr.png`. Die komt rechts op het welkomstscherm.
- [ ] Thema kiezen (bijv. Kerst) en op de tv bekijken of het logo daarop goed uitkomt.

### 3. Inhoud van de quiz (Excel en mediabestanden)

- [ ] Foto's voor ronde 2 en logo's voor ronde 8 in `public/media/` zetten, met de bestandsnamen uit de Excel. De startklaar-lijst in de bediening toont wat nog ontbreekt.
- [ ] Rondelengte nalopen: ronde 1 heeft nu 50 vragen. Rondes van 8 tot 12 vragen houden het tempo erin; de punten per ronde blijven gewoon 100.
- [ ] Geheugenronde: de voorbeeldregels vervangen door wat er vorig jaar echt op het bord stond.
- [ ] Prijzen: de huidige prijzen en die van 15 jaar geleden controleren; het zijn nu schattingen.
- [ ] Nieuws- en Drenthe-vragen 2026 nalopen, vooral de perroncontroles van Arriva en de BBB-coalitiebreuk.
- [ ] Liedjeslijst voor ronde 4 afmaken: minstens 25 liedjes plus 2 per team voor de startkaarten, met het juiste jaar.
- [ ] Genoeg tekenwoorden (ronde 6) en 30 Seconds-kaarten (ronde 7) voor het aantal spelers.
- [ ] Oefenvragen per ronde nalopen (kolom *Oefen?* in de Excel).
- [ ] Alle vragen op spelling en feiten nalopen, binnen elke ronde van makkelijk naar moeilijk, en zoveel mogelijk een weetje invullen (dat staat in de bediening onder ⏭ Hierna, zodat de presentator iets te vertellen heeft).

### 4. De week ervoor

- [ ] Laptop: Windows Update of macOS-updates een week pauzeren, slaapstand en schermbeveiliging uit.
- [ ] Tv: beeldinstelling op *Volledig* / *Just Scan* (anders vallen de randen weg), en het geluid via een soundbar of speaker.
- [ ] Generale repetitie met een paar echte telefoons (iPhone en Android), tv, bediening en bediening2: aanmelden, teamfoto, een paar rondes, de opening, de pauze met achtergrondmuziek.
- [ ] Tijdens de generale repetitie ook: in 🛟 de kopie van "ronde-1" terugzetten en controleren dat alles weer verbindt.
- [ ] Volumes afstemmen: jingle, achtergrondmuziek, quizgeluiden en Spotify ongeveer even hard.
- [ ] Taakverdeling met de co-quizmaster: wie bedient de laptop en keurt antwoorden, wie presenteert met de telefoonbediening.
- [ ] Prijs regelen (beker of medailles) en eventueel kaartjes voor op tafel printen met de wifinaam en "scan de QR-code op de tv".

### 5. Op de dag, ruim voor de start

- [ ] Laptop aan de lader, *start-lokaal* dubbelklikken (start de server en houdt hem in de lucht).
- [ ] Tv: `/host.html` openen en één keer op OK drukken (de checklist meldt "🔊 Tv heeft geluid").
- [ ] Bediening op de laptop openen; de checklist onder 🧭 Voorbereiding helemaal groen maken.
- [ ] In de bediening het maximale aantal teams invullen, thema en rondevolgorde controleren.
- [ ] Spelers vragen om automatisch vergrendelen op 5 minuten of *nooit* te zetten.
- [ ] Wie de quiz als app op zijn telefoon wil: dat kan alleen vóór het aanmelden, via *📲 Quiz als app op je telefoon zetten* op het aanmeldscherm. Daarna de quiz openen via het nieuwe icoon en dáár aanmelden.

### 6. Vlak voor de start

- [ ] Op de tv: welkomstpagina met aftelklok, wifi-QR en zachte achtergrondmuziek.
- [ ] *Toon het aanmeldscherm*; wachten tot alle teams binnen zijn en hun basistelefoon bevestigd hebben.
- [ ] Licht dimmen, dan *Start de quiz*: de opening met logo en jingle verschijnt op de tv.

### 7. Na de quiz

- [ ] In 🛟 een zip van alles downloaden en bewaren, en de foto-zip voor het familiealbum.

**Bediening op je telefoon (bediening2).** Naast de bediening op de laptop kun je een telefoon als afstandsbediening gebruiken: open in de bediening (links onder de knoppen) het blokje **📱 Bediening ook op je telefoon** en scan de QR-code, of open `…:3000/bediening2.html`. Inloggen met dezelfde toegangscode. Hierop staan alleen de belangrijkste knoppen: de grote knop, doorgaan, vorige stap, pauze, ongedaan maken, muziek stoppen, bladeren bij het nakijken, plus de spiekmeldingen (met piep) en de klok. Beoordelen (30 Seconds, logo's, tekenen), Spotify en instellingen blijven op de laptop. Laat de bediening op de laptop open: daar speelt de muziek.

**Toegangscode.** De bediening en de telefoonbediening vragen allebei dezelfde code. Die staat in het bestand `pincode.txt` naast server.js (dit bestand gaat niet mee naar GitHub). Pas je de code daar aan, dan moet elk toestel na het herstarten van de quiz opnieuw inloggen.

**Nieuw: oefenvraag, finale, kaarten, dilemma's en soundboard.** Elke ronde begint met de uitlegpagina, dan *Eerst een oefenvraag*, de oefenvraag, *Nu begint het echt!* en de echte vragen. Bij de ontknoping dimt de tv met een spotlight; de laatste twee teams staan samen in beeld, daarna alleen de winnaar, en dan het podium. Elk team krijgt een overwinningskaart (op de telefoon om te screenshotten; ook in de foto-zip). Tijdens een pauze kun je met *Volgend pauzedilemma* een dilemma uit het tabblad *Dilemma's* naar alle schermen sturen (geen punten). In het soundboard kun je eigen geluiden uploaden, of een bestand met de naam `drumroll.mp3` / `applause.mp3` neerzetten om het ingebouwde geluid te vervangen. De meldingen na een ronde noemen nooit wie bovenaan staat. Bij *Tijdens de quiz* kies je of antwoorden direct of pas bij het nakijken getoond worden; de spelregels zelf staan alleen in de voorbereiding.
