# Familiequiz

Teams spelen op hun telefoon, de vragen staan op de tv en de quizmaster bedient alles vanaf een eigen telefoon.

Het volledige spelverloop voor de quizmasters staat in **DRAAIBOEK.md** (één bestand; geen losse Word-kopie meer, zodat er nooit twee versies zijn).

## Waar staat wat

| Plek | Wat | Aanpassen? |
|---|---|---|
| `vragenlijst.xlsx` | Alle vragen, rondes, teksten (ook naam en opening) en de families die meedoen | Ja, dit is de plek voor de inhoud |
| `Hitster-bibliotheek.xlsx` | De Hitster-lijsten voor extra muziekrondes | Via de bediening (blok 🎶) of zelf |
| `public/media/` | Foto's, logo's, liedjes, geluiden, huisstijl, muziek en wifi-QR; zie `public/media/README.txt` | Ja, elk soort bestand in zijn eigen map |
| `DRAAIBOEK.md` | Spelverloop en de voorbereidingslijst | Ja |
| `config.json` | Standaardinstellingen (punten, tijden); in de bediening aan te passen vóór de start | Zelden |
| `pincode.txt` | Toegangscode van de bediening (gaat niet naar GitHub) | Ja |
| `questions.json` | Reservequiz als de Excel onleesbaar is, en basis voor tabbladen die in de Excel ontbreken | Nee, niet gebruiken voor eigen vragen |
| `data/` | Wordt door de server zelf gemaakt: stand, uploads, reservekopieën, logboek, foto's (gaat niet naar GitHub) | Nee, niet met de hand |
| `server.js`, `lib/`, `public/*.html`, `public/js/`, `public/bediening/` | De app zelf | Nee |
| `scripts/`, `test/`, `test-helpers/`, `.github/` | Hulpscripts en tests | Nee |

Let op: een Excel die je in de bediening uploadt, komt in `data/` te staan. Staan er dan twee versies (in de projectmap en in `data/`), dan gebruikt de quiz de nieuwste; de bediening toont in het blok *Vragenlijst (Excel)* welk bestand is ingelezen. Pas bij voorkeur alleen `vragenlijst.xlsx` in de projectmap aan en tik op *Opnieuw inlezen*.



## Nieuw in deze versie
- **Persoonlijk aanmelden en teams maken**: staat er iets in het nieuwe Excel-tabblad *Families* (familie + aantal personen), dan vult iedereen op de telefoon naam, familie en leeftijd in. De bediening toont per familie wie er is (jong naar oud, met teller) en maakt met *🎲 Maak teams* even grote teams met leeftijden en families gespreid; verplaatsen, opnieuw verdelen en laatkomers indelen kan. De basistelefoon kiest daarna teamnaam en kleur. Leeg tabblad = teams maken zichzelf, zoals voorheen. Zie DRAAIBOEK.md, *Aanmelden en teams maken*.
- **Beslissingsvraag uit de leeftijden**: bij een gelijke stand is de eerste schatvraag "Hoe oud zijn alle deelnemers bij elkaar?"; het antwoord rekent de quiz zelf uit.
- **30 Seconds korter kunnen maken**: vóór de ronde kiest de bediening het aantal vertellers per team; de basistelefoon tikt aan wie (bij een klein team: wie een tweede keer mag). Plus de noodknop *Stop na deze rondgang*.
- **Aftelklok vóór de start** stel je in de bediening in (5/10/15/30 min, +5, weg), net als de pauzetimer. De vaste starttijd in de Excel is vervallen.
- **Logoronde**: het kader neemt de verhouding van elk logo over (breed, vierkant of hoog), zoals bij foto blur.
- **De avond in cijfers**: extra scherm na de ontknoping (knop in de bediening).
- **Voorbeeldplaatjes in de Excel**: tabblad *Voorbeelden* laat met genummerde schermfoto's zien waar elke tekst uit *Teksten* in beeld komt; in *Teksten* staat per regel bij welk plaatje en nummer hij hoort.
- **Rustiger tv-beeld**: inhoud staat niet meer tegen de bovenrand geplakt maar net boven het midden; antwoorden en woordtegels zijn groter.
- **Steviger bij storingen**: aanmeldingen overleven een herstart; elk scherm krijgt zijn stand apart (een fout bij één telefoon blokkeert de rest niet); een speler kan op een andere telefoon zijn plek overnemen door dezelfde naam in te vullen. DRAAIBOEK.md heeft een *noodkaart*.
- **Afwerking tv en telefoons**: de opening is een eigen stap (eerst 6 s opening, dan pas het testscherm); korte logo-flits bij elke nieuwe ronde (uit te zetten) en het logo groot op het pauze- en eindscherm; "Pauze!" en de timer vast bovenaan bij foto's of een dilemma; logo's in de logoronde onvervormd in een vast kader; meerkeuze-antwoorden direct achter de vraag, en bij *antwoord meteen tonen* 2 s wachten waarna de teamfoto's naar het gekozen vakje vliegen; de tijdbalk in een eigen strook; prijsjes schermvullend; overwinningskaarten waarop alles past; zeven nieuwe momentum-meldingen; oefentekenen op bediening2; trillen op Android (spelers en bediening2); de quiz als app op het beginscherm, alleen vóór het aanmelden.
- **Pauzetimer**: tijdens de pauze in de bediening of bediening2 instellen wanneer jullie verder gaan (5/10/15/20 min, +5 min, weg). Tv en telefoons tonen "We gaan verder om … · nog mm:ss", met een belletje als de tijd om is; hervatten blijft handwerk.
- **Opening, jingle en achtergrondmuziek**: bij *Start de quiz* vliegt het logo groot in beeld met een jingle (`public/media/muziek/opening.wav`, tekst `opening.tekst` in de Excel). Vóór de start en in de pauze speelt zachte achtergrondmuziek (`achtergrond.wav`). Eigen muziek: zet `opening.mp3` / `achtergrond.mp3` in die map (mp3 gaat voor wav; `npm run standaard-muziek` maakt de standaardbestanden opnieuw). In de bediening (🎛️ Tijdens de quiz): achtergrondmuziek aan/uit en *Opening testen*. De tv meldt of hij geluid heeft; het "druk op OK"-balkje staat alleen nog vóór de start in beeld. Teamnamen worden niet meer midden in een woord afgebroken, en de stap-voor-stap voorbereiding en checklist in de bediening zijn uitgebreid (tv-geluid, naam/logo/wifi, opening en muziek, draaiboek).
- **Naam, logo en aftelklok**: de naam, ondertitel, korte naam (onder het app-icoon) staan bovenaan het tabblad *Teksten* in de Excel; `{quiznaam}` in een tekst wordt overal vervangen door de naam. Het logo en het app-icoon zijn bestanden in `public/media/huisstijl/` (eigen `logo.png` gaat voor `logo.svg`; zie `LEES-MIJ.txt` daar). Het logo staat op de welkomstpagina, het aanmeldscherm, linksboven tijdens de quiz, op de telefoons en op het uitslagplaatje. Vóór de start telt een klok af naar de starttijd (tv en telefoons, met de klok van de laptop). Valt de verbinding weg, dan toont de tv na 1,5 seconde een rustige kaart met het logo in plaats van een rood balkje.
- **Welkomstpagina** op de tv vóór het aanmeldscherm (tekst in de Excel, tabblad *Teksten*). In de bediening: "Toon het aanmeldscherm".
- **Alle vaste teksten in de Excel** (tabblad *Teksten*): welkomstpagina, tussenpagina's, joker, foto blur, muziek, tekenen, 30 Seconds, slotvraag, einde, pauze enz. Pas de kolom *Tekst* aan; {punten}, {team} e.d. vult de quiz zelf in. De uitleg per ronde staat in het tabblad *Rondes*. Daarna in de bediening *Excel uploaden* of *Opnieuw inlezen*: de nieuwe teksten staan meteen op tv en telefoons. Dat kan tot de start van de quiz.
- **Thema's** (Standaard, Winter, Kerst, Oud & nieuw, Zomer, Halloween): bediening → *Thema*, op elk moment.
- **Quizgeschiedenis**: afgeronde quizzen worden automatisch bewaard met datum, winnaar, eindstand en punten per ronde. De quizmaster vindt de laatste 50 quizzen terug in bediening → *Quizgeschiedenis*. De geschiedenis blijft bestaan als je een nieuwe quiz start en heeft een eigen reservekopie.
- **Hitster-bibliotheek (los bestand) en -playlists**: de nummers voor extra muziekrondes staan in een apart bestand, `Hitster-bibliotheek.xlsx`, los van `vragenlijst.xlsx`. Zo kan iedereen de vragenlijst gebruiken zonder iets aan de bibliotheek te veranderen. **Volgorde bij een extra muziekronde:** eerst de officiële Hitster-playlist van die editie op Spotify (via de bediening). Lukt dat niet (Spotify niet verbonden, playlist niet bereikbaar of op, of binnen 20 seconden geen nummer), dan valt de ronde terug op de Hitster-Excel: eerst een eigen (geüploade) bibliotheek, dan de meegeleverde `Hitster-bibliotheek.xlsx` voor dezelfde categorie, en pas daarna vrij zoeken op Spotify. Nooit R4 Muziek. Laat het meegeleverde bestand dus altijd in de projectmap staan. Plaats het bestand naast de vragenlijst, upload het in de bediening (de bediening herkent zelf of een upload een vragenlijst of een bibliotheek is) of wijs het aan met `HITSTER_XLSX`. Het bestand heeft per Hitster-editie een eigen tabblad (*Hitster - Original*, *- 100% NL*, *- Guilty Pleasures*, *- Summer Party*, *- Rock*, *- Urban & Hiphop*, *- Movies & TV*, *- Christmas*, *- Celebration*, *- Bingo*, *- Flying Mic*), Battle of the Generations in drie tabbladen/tijdvakken (t/m 1984, 1985–2004, 2005–2025) en twee eigen lijsten (80s & 90s, 00s & 10s): ruim 3.200 nummers. De tabbladnaam bepaalt de categorie. De playlistlinks zijn al ingevuld (tabblad *Bronnen*, te wijzigen in *🎶 Hitster-playlists per editie*). Kolom *Jaar check = Ja*: het jaartal komt uit de Spotify-lijst en kan een remaster- of verzameljaar zijn; met Spotify verbonden zoekt de bediening bij het afspelen het jaar van de eerste uitgave op (alleen een vroeger jaar wordt overgenomen, gecorrigeerde jaren worden onthouden). Bij Battle wordt een nummer dat na controle buiten het tijdvak valt overgeslagen. Nummers uit R4 Muziek en eerdere rondes komen nooit dubbel.
- **Volgorde start**: aanmelden → rondeoverzicht en uitleg → 3 testvragen → teamfoto → *Hier begint de echte quiz* → joker → ronde 1. Bij de start van elke ronde staat erbij hoe je de punten verdient.
- **Teamfoto**: na de testvragen (kijken of alles werkt) het vaste teamfotomoment. Alleen dan kan de basistelefoon een foto maken (groene knop = camera; kiezen uit de galerij kan niet); daarvoor en daarna is de teamfoto niet te wijzigen (de quizmaster kan er wel een verwijderen). De foto komt terug bij *Dit was ronde …*, bij de ontknoping, op de winnaarsbanner en in een diavoorstelling op de tv tijdens de pauze. Tijdens de pauze kan iedereen ook een **pauzefoto** maken: die komt direct op de tv en wordt bewaard in `data/fotos/<datum>/`; in de bediening download je alle foto's van de avond als zip, op ware grootte: de telefoon stuurt na de kleine tv-versie het origineel na (`POST /origineel/<sleutel>`, eenmalige sleutel, max. 15 MB, opnieuw opgeslagen als JPEG zonder locatiegegevens), bewaard in `data/fotos/origineel/`. Teamfoto's worden bewaard in `data/teamphotos.json`.
- **Hitster-lijsten bijwerken**: het tabblad *Bronnen* in `Hitster-bibliotheek.xlsx` bevat per tabblad de link naar de complete liedjeslijst (Primera) en de officiële Spotify-playlist. Bijwerken kan op twee manieren:
  - in de bediening: *🎶 Hitster-playlists per editie* → *🔄 Lijsten bijwerken* (vóór de start). De server haalt de pagina's op, zet de nieuwe lijsten klaar en toont per tabblad wat er nieuw of weg is. Met *⬇️ Download Excel* haal je het bijgewerkte bestand op om in je projectmap/GitHub te zetten;
  - op je eigen computer: `npm run update-hitster` werkt `Hitster-bibliotheek.xlsx` in de projectmap bij (het oude bestand blijft bewaard als `.backup.xlsx`).
  Eigen aanvullingen (Bron = *Eigen*), zelf aangepaste jaartallen (Jaar check leeg), startkaarten en audio blijven staan. Nieuwe editie toevoegen: maak een tabblad *Hitster - <naam>* en zet de link in *Bronnen*. Een playlistlink in *Bronnen* wordt automatisch gebruikt, tenzij je in de bediening zelf een andere hebt ingesteld.
- **Jaartallen controleren**: bediening → *🎶 Hitster-playlists* → *✔ Jaartallen controleren*. Met Spotify verbonden zoekt de bediening voor alle nummers met *Jaar check = Ja* (of één categorie) het jaar van de eerste uitgave op en schrijft dat in de Hitster-Excel; gecontroleerde nummers krijgen een lege Jaar check. Alles duurt zo'n 15–20 minuten, stoppen en later verder gaan kan. Daarna *⬇️ Download Excel* om het bestand te bewaren. Zo hangt de quizavond niet meer af van de controle tijdens het spelen.
- **Aanvullen uit de Hitster-playlists**: *➕ Aanvullen* haalt per editie de officiële playlist van het Hitster-account op Spotify (open.spotify.com/user/ta8hnikdhdctwuvkj2nl9itix) op en voegt ontbrekende nummers toe aan het tabblad. *🔎 Zoek de Hitster-playlists automatisch* kijkt eerst in de playlists van dat account.
- **Muziekronde**: stopt zodra één team het ingestelde aantal kaarten heeft (bediening → Instellingen → *Muziek: stoppen bij zoveel kaarten*, standaard 10, 3–50; vóór de start aan te passen).
- **Instellingen op de telefoon** (⚙️ rechtsboven): tekstgrootte, hoog contrast, oplichten bij een nieuwe vraag (scherm flitst kort in de teamkleur) en je eigen naam (alleen vóór de start; daarna alleen via de quizmaster). Het scherm blijft altijd aan. De keuzes worden per telefoon onthouden; het menu openen telt niet als spieken.
- **Na de ontknoping** (bediening, blok einde):
  - *🏅 Prijsjes op tv*: awards die de app zelf berekent, één voor één onthuld: per soort ronde de beste (Bollebozen, Arendsogen, Olifantengeheugen, Muziekkenners, Prijzenkenners, Beste tekenaars, Kletskampioenen, Merkenkenners), plus Snelle jongens (vaakst als eerste geantwoord), Durfallen (hoogste inzet slotvraag), Jokermeesters, Spiekkoningen, Net niet en Volhouders.
  - *📷 Fotoalbum op tv*: diavoorstelling met alle teamfoto's (met eindplaats) en alle tekeningen van de avond.
  - *📤 Uitslag delen*: een mooi plaatje van de eindstand met teamfoto's, te delen via WhatsApp e.d. (of te downloaden). Spelers kunnen dit ook zelf vanaf hun telefoon.
- **Hall of fame**: op het aanmeldscherm staan de winnaars van eerdere quizzen (uit de quizgeschiedenis; oefenquizzen met testteams tellen niet mee).
- **Stand blijft geheim**: bij *Dit was ronde …* staan alleen de teams (geen punten, geen volgorde). Met *🏅 Posities op tv* zet de quizmaster de tussenstand op de tv: alleen posities, nooit punten. Bij de prijzenronde komen de bedragen niet op de tv (die zie je bij het nakijken).
- **Hitster-punten**: per liedje 5 voor de goede plek, jaartal met speling (exact 5, 1 jaar ernaast 3, 2 jaar 2, 3 jaar 1) en bonus voor titel (2) en artiest (2). De app doet een voorstel (tikfouten, hoofdletters en *feat.* tellen goed), de quizmaster keurt in de bediening goed of af. Alles is aan te passen bij Instellingen (0 = niet vragen).
- **Emoji-reacties**: bij uitlegschermen, *Dit was ronde* en in de pauze staat op de telefoons een balk met 😂 😱 👏 🎉 ❤️ 🔥 🤯 💩; de emoji's zweven over de tv (met een stipje in de teamkleur). Niet tijdens vragen, en per telefoon beperkt tegen spammen.
- **Bediening extra's**: sneltoetsen op de laptop (spatie = grote knop, ← = vorige stap, P = pauze, M = muziek stoppen), een blok *⏭ Hierna* met de volgende vraag, het antwoord en het weetje, punten corrigeren (−5/−1/+1/+5 per team in *📊 Scores*, ongedaan te maken met ↶) en bij logo's/foto blur een gelijkenis-percentage per antwoord.
- **Awards**: nieuw zijn *Grootste comeback*, *Snelste foute antwoord* en *Jokerpech*.
- **Tv-cursor**: verborgen, maar zichtbaar zodra je de muis beweegt (na 2 seconden weer weg).
- **QR-adres**: virtuele netwerkkaarten (Docker, WSL, VirtualBox, VMware, Tailscale, ZeroTier, VPN) worden overgeslagen; het echte wifi-adres (192.168.x.x) krijgt voorrang.
- **Teamkleur kiezen**: bij het aanmelden kiest elk team een vrije kleur; de telefoon van het team kleurt subtiel mee.
- **Tekenronde**: de tekeningen verschijnen live op de tv; bij de uitslag met woord, geraden antwoord en ✔/✘.
- **Foto blur**: het fotokader op de tv neemt de verhouding van de foto over.
- **Spiekmelding met wachttijd**: pas als een telefoon tijdens een vraag langer weg is dan de wachttijd (standaard 1 s, in de bediening in te stellen: meteen, 1, 2, 3 of 5 s). Ook het wegvallen van de verbinding tijdens een vraag telt. `CHEAT_GRACE_MS` (ms) overschrijft de instelling, voor tests.
- **Geluid via tv of bediening**: instelling *🔊 Quizgeluiden via*. Bij "bediening" stuurt de tv elk geluid en audiofragment door (`tv_sound` → `quiz_sound`) en speelt alleen het toestel waarop het gekozen is af.
- **Spiekgeluid**: in de bediening (Instellingen) apart uit te zetten op de tv en op het eigen bediening-toestel; de meldingen zelf blijven zichtbaar.
- **Bediening**: vaste knoppen bovenaan (grote knop, vorige, pauze, posities, teamoverzicht); alle instellingen onder *⚙️ Instellingen* (op een laptop altijd rechts); *🚨* naar de noodknoppen. Werkt op telefoon, tablet en laptop.
- **Voorbereiding (🧭)**: vóór de start een stap-voor-stap menu (tv, vragenlijst, rondes, teams, Spotify, Hitster, thema en spelregels, eindcontrole) met daarna de checklist (tv verbonden, aantal teams, rondevolgorde, Spotify en afspeelapparaat, Hitster-playlists, vragenlijst, foto's en logo's, toegangscode, thema). De rondevolgorde ligt na de start vast; extra rondes toevoegen kan wel.
- **Geen nieuwe teams na de start**: eenmaal begonnen is begonnen; aansluiten bij een bestaand team kan wel.
- **Testteams**: bediening → *Teams* → *+3 testteams*: robots die zelf antwoorden, om de quiz zonder telefoons te oefenen. Niet in de quizgeschiedenis.
- **Basistelefoon offline**: in de bediening verschijnt bij het team een melding met een knop om een andere verbonden telefoon basis te maken.
- **Betrouwbaarheid**: dubbel tikken in de bediening slaat nooit een scherm over (elke klik hoort bij één toestand); een fout in één actie wordt opgevangen en gemeld in de bediening in plaats van de server te laten crashen; telefoons tonen een rode balk als de verbinding weg is; tv en bediening blijven wakker (Wake Lock, met reserve) en de bediening toont of de tv verbonden is.
- **Uiterlijk**: vaste teamkleur per team (overal terug), teambolletjes met foto die oplichten bij indienen, een ontknoping met elke plek groot in beeld, "✅ Ingediend!" in teamkleur op de telefoon (plus een korte flits in de teamkleur), een duidelijke aftelbalk (groen → oranje → rood, pulserend met tik in de laatste 5 seconden) en het lettertype Poppins voor titels, meegeleverd in `public/fonts/` (SIL Open Font License).
- **Controle op bestanden**: ontbreekt een foto, logo of geluidsbestand uit de vragenlijst in `public/media/`, dan staat bovenin de bediening per ronde welke bestanden missen.
- **Quizflow**: na de QR-aanmelding maakt elk team eerst een **teamfoto** (de basistelefoon maakt hem, overslaan kan); de quizmaster gaat verder als alle teams klaar zijn. Daarna verschijnt het rondeoverzicht en daarna de uitleg per ronde. Vervolgens komen de testvragen, de jokerkeuze met aparte knop *indienen* en de start van de quiz. Na elke ronde verschijnt *Dit was ronde …*.
- **Rondevolgorde**: bediening → *Rondes*: volgorde en aan/uit (vóór de start).
- **Extra rondes**: 30 Seconds, tekenen of muziek nog een keer, ook tijdens de quiz (komt direct na de huidige ronde). Geen herhaling van liedjes, woorden of kaarten.
- **Extra muziekronde**: kies een categorie zoals in de Hitster-app (Original, Guilty Pleasures, Rock Classics, Nederpop, Summer Party, 80s & 90s, 00s & 10s). De bediening zoekt de liedjes en startkaarten automatisch op Spotify (jaartal + genre); zonder Spotify een iTunes-fragment van 30 seconden op de tv. De eerste muziekronde komt altijd uit de Excel.
- **Elk schermformaat**: het tv-scherm schaalt zichzelf kleiner als een tekst of tabel niet past (tv, beamer, laptop). Telefoons en bediening breken lange woorden af en scrollen.
- **Spotify-regels 2026**: Spotify staat voor apps in ontwikkelmodus sinds maart 2026 maximaal 10 zoekresultaten per keer toe, geeft geen populariteit meer en artiesten alleen nog één voor één. De zoekfunctie houdt daar rekening mee.
- **Juiste muziekcategorie**: bij een extra muziekronde telt een gevonden nummer alleen als het jaartal in de categorie valt én de artiest bij Spotify het juiste genre heeft (rock, nederpop, guilty pleasures, summer). Met Spotify gekoppeld wordt alleen Spotify gebruikt; iTunes alleen zonder koppeling (ook gecontroleerd op jaartal en genre).
- **Maximaal aantal teams**: bediening → *Teams*. Verplicht vóór het aanmeldscherm; daarna kan niemand meer een extra team maken (wel aansluiten).
- **Scores voor de quizmasters**: alleen in bediening → *Scores*. Spelers en tv zien de stand pas aan het einde.
- **Oefenronde bij elk spel** (kolom *Oefen?* in de Excel; bij meerkeuze categorie "Oefenvraag"). Bij tekenen en 30 Seconds doet de quizmaster de oefenbeurt zelf (tekenen in de bediening, live op de tv).
- **Tussenpagina's** met animatie: "Nu gaan we door naar…" bij elke ronde en elke categorie.
- **Joker** vóór ronde 1; de tv toont waarop elk team de joker zet.
- **Foto blur** is een open vraag; de quizmaster keurt goed/fout. **Geheugen**: geen klok, alleen de basistelefoon schrijft.
- **Per ronde eerst een oefenvraag**: ronde → *Eerst een oefenvraag* → oefenvraag → *Nu begint het echt!* → de echte vragen (teksten `oefen.intro.titel/tekst` en `oefen.klaar.titel/tekst`).
- **Spotify speelt het origineel**: remixen, live-versies, karaoke, covers en dergelijke worden overgeslagen; bij meerdere treffers wint de beste titel- en artiestmatch, met voorkeur voor het jaar van het origineel.
- **Momentum-meldingen verklappen niets over de koppositie**: alleen "X stijgt N plaatsen" en "X komt terug van de laatste plek" (nooit over de nummer 1), of een neutrale melding. Uit te zetten bij *Tijdens de quiz*.
- **Logo's**: het aantal logo's is instelbaar (standaard 10, de eerste N uit de Excel; de ronde blijft 100 punten waard).
- **Antwoorden direct tonen of pas bij het nakijken**: schakelaars bij *Tijdens de quiz* voor meerkeuze en voor foto's/logo's (standaard: meerkeuze pas bij het nakijken, foto's en logo's direct).
- **Testvragen (meerkeuze)**: zijn alle antwoorden binnen, dan wordt het juiste antwoord pas getoond als de quizmaster op *🎯 Toon het goede antwoord* drukt; daarna *Volgende*. Oefenfoto's en oefenlogo's tonen het antwoord direct, ook als *antwoord direct tonen* uit staat.
- **Pauzefoto's van de quizmaster**: op de telefoonbediening staat tijdens de pauze de knop *📸 Pauzefoto maken* (achtercamera). De foto komt op de fotomuur van de tv (onder de naam *Quizmaster*), in het album en op ware grootte in de foto-zip.
- **Knoppen zonder functie zijn grijs**: in beide bedieningen is een knop uitgeschakeld (grijs) zolang hij niets kan doen: *Vorige* op de eerste stap, *grote knop* en *doorgaan* tijdens een pauze of het nakijken, *Ongedaan maken* zonder actie, *Pauzedilemma* zonder dilemma's, *Overwinningskaarten* vóór de ontknoping, en de bladerknoppen van het nakijken aan het begin en het eind.
- **Bovenste regel van de tv**: ronde links, vraagnummer in het midden, punten rechts; is de tekst te lang voor zijn vak, dan schaalt hij zichzelf kleiner.
- **Instellingen in twee groepen**: *Tijdens de quiz* (geluid, spiekmelding, momentum, antwoorden tonen) is altijd te wijzigen; de spelregels en de vragenlijst staan alleen in de voorbereiding en verdwijnen uit het menu zodra de quiz start.
- **Schermovergangen**: één vaste, rustige overgang tussen alle tv-schermen (het ronde-gordijn is weg: de uitlegpagina van de ronde is de overgang). De timerbalk loopt vloeiend. Foute antwoorden dimmen en het goede antwoord krijgt een ring en glans.
- **Finale**: de tv dimt met een spotlight, de punten tellen in 1 seconde op, bij plek 1 staat alleen de winnaar in beeld (de laatste twee teams staan daarvoor samen in beeld), daarna een podium met drie blokken.
- **Overwinningskaarten**: na de ontknoping tekent de tv per team een kaart (naam, eindscore, plaats, statistieken; de winnaar is *Familiequiz Kampioen*). Elke telefoon toont de eigen kaart om te screenshotten; de kaarten komen in `data/fotos/kaarten/` en in de foto-zip (knop *🏆 Overwinningskaarten maken* in de bediening om opnieuw te maken).
- **Prijsjes als badges** op de telefoon (zodra de prijsjes op de tv staan) en een trofee-animatie met geluid op de tv.
- **Pauzedilemma's**: tabblad *Dilemma's* in de Excel (Dilemma · Optie A · Optie B). Tijdens een pauze pusht de quizmaster met *🤔 Volgend pauzedilemma* (laptop en telefoonbediening) een dilemma: elke telefoon kiest A of B (veranderen mag), de tv toont live balkjes, geen punten. *📸 Foto's weer tonen* brengt de fotomuur terug.
- **Soundboard**: eigen geluiden uploaden met *⬆️ Eigen geluid toevoegen* (mp3/wav/ogg/m4a, max 4 MB). Een bestand met de naam van een quizgeluid (`drumroll`, `applause`, `sadTrombone`, `cheer`, `buzzer`, `ding`, `fanfare`, `whoosh`, `reveal`, …) vervangt dat geluid overal in de quiz.
- **30 Seconds** goedkeuren kan ook op de telefoonbediening.
- **Basistelefoon kiezen en bevestigen**: bij het maken van het team is de maker de basistelefoon. Iedereen die aansluit tikt op *✔ Akkoord* (of stelt een ander voor; dan moet het hele team akkoord gaan). De quiz kan pas starten als in elk team iedereen akkoord is; de bediening toont wie nog moet. (*Toch starten* kan als het echt nodig is.) Wisselen kan daarna alleen buiten de rondes: op tussenpagina's, uitleg, *Dit was ronde*, joker en teamfoto. Een lopend voorstel vervalt als een ronde begint. De quizmaster kan in noodgevallen altijd een basis aanwijzen (⭐ in de bediening).
- **Na de testvragen**: een dia "De test lijkt geslaagd! ✅ – Alles werkt. We gaan nu verder!" (teksten `testklaar.titel` en `testklaar.tekst`, aan te passen via het tabblad *Teksten*).
- **Eigen extra pagina's**: tabblad *Pagina's* in `vragenlijst.xlsx` met de kolommen Waar · Emoji · Titel · Tekst. Waar = *voor testvragen*, *na testvragen*, *na teamfoto*, *na uitleg*, *na joker*, *voor ronde 3*, *na ronde 3* of *voor slotvraag*. Na het opslaan in de bediening *Opnieuw inlezen*. Een onbekende plek geeft een waarschuwing.
- **Meerkeuze in twee stappen**: eerst 2 seconden alleen de vraag, dan vliegen de antwoorden binnen (A en C van links, B en D van rechts, met een oplopende plop) en kan er meteen geantwoord worden. De tijd is vast en niet meer in te stellen. Met *⏩ Antwoorden nu openen* sla je het wachten over; tijdens de pauze staat het stil.
- **Soundboard** (bediening, onder de knoppen): 🥁 Tromgeroffel, 👏 Applaus, 🎺 Wah-wah-waah (sad trombone), 🎉 Gejuich, ❌ Zoemer, 🔔 Belletje en 🎺 Fanfare. Eigen geluiden: zet mp3/wav/ogg/m4a-bestanden in `public/media/sounds/`; ze verschijnen binnen 10 seconden als extra knop (bestandsnaam = knoptekst). Speelt af op de tv, of op de bediening als *Geluid via* daarop staat.
- **Podium-ontknoping**: van de laatste plek omhoog, plek voor plek. Zijn er nog twee teams over, dan staan die samen groot op de tv ("Wie wordt er eerste?", op naam gesorteerd zodat de plek niets verraadt). Bij *🥁 Onthul de winnaar!* trillen beide kaarten tijdens 3 seconden tromgeroffel, daarna licht de winnaar op (🏆) en zakt de ander weg (🥈), met gejuich en confetti, en volgt de eindstand met de winnaarsbanner.
- **Pauze**: zolang de quiz op pauze staat, werken de grote knop en *Vorige* niet (ook niet via sneltoetsen of de telefoonbediening).
- **Muziek pauze/verder**: tijdens een muziekvraag in de bediening, op de telefoonbediening en met de toets M. Spotify gaat verder waar hij was; een iTunes-fragment of eigen bestand op de tv ook.
- **Effecten op de tv**: vragen vliegen binnen (met whoosh), een plop per team dat indient (elk team eigen toon), confetti en applaus als iedereen het goed heeft en "oeeeh" als niemand het goed heeft, een opgaande onthulling bij muziek/prijzen/logo's, rode pulserende rand en hartslag in de laatste seconden, belletje en binnenstuiterend kaartje bij een nieuw team, fototoestel-klik en flits bij een nieuwe teamfoto, applaus bij "Dit was ronde…". Alle geluiden worden zelf gemaakt (geen internet nodig) en volgen de instelling *Geluid via*.
- **Telefoonbediening** (`/bediening2.html`): alleen de belangrijkste knoppen (grote knop, vorige, pauze, ongedaan maken, muziek pauze/verder, nakijken bladeren) plus spiekmeldingen en klok; zelfde toegangscode. QR-code in de bediening onder *📱 Bediening ook op je telefoon*. De bediening op de laptop is ingedeeld voor 1920×1080: tijdens de quiz links de knoppen, rechts het paneel van de huidige stap.
- **Tekenen**: iedereen tekent een keer (ook de basis; dan vult een ander het antwoord in). De tekenaars worden vóór elke beurt aangewezen (tv en telefoon tonen wie), het woord komt pas bij de start. Beurt eindigt als elk team heeft ingediend. Tekeningen staan bij het beoordelen en nakijken.
- **30 Seconds**: woorden live goedkeuren; ze kleuren meteen groen op de tv. Iedereen legt één keer uit: wie later aansluit komt achteraan in de rij, en wie even niet verbonden is schuift één keer door naar achteren.
- **Slotvraag**: inzet maximaal 100 punten (instelbaar). Geen gelijke stand → scherm "Geen gelijke stand".
- **Ontknoping** plek voor plek: elke druk onthult de volgende plek (tijd voor prijzen).

## Starten
    npm install
    npm start          # hervat een eventuele vorige quiz (staat dan op pauze)
    npm run fresh      # begint altijd schoon
    npm run vendor     # optioneel: mooiere confetti lokaal opslaan (QR-code en confetti werken ook zonder)

| Scherm | Adres | Voor wie |
|---|---|---|
| Telefoon | `/` | elk team (basistelefoon) en teamgenoten |
| Tv | `/host.html` | de tv, alleen weergave (één keer op OK drukken voor geluid) |
| Bediening | `/bediening.html` | de quizmaster, met toegangscode: uit `HOST_PIN`, anders uit het bestand `pincode.txt` naast server.js (niet in git), anders lokaal `1234`. Wijzigt de code, dan moet elk toestel opnieuw inloggen. |
| Telefoonbediening | `/bediening2.html` | alleen de belangrijkste knoppen, zelfde toegangscode |

## Verloop
Teamfoto → rondeoverzicht en uitleg → testvragen (tellen niet) → "Hier begint de echte quiz" → joker inzetten → ronde 1 t/m 8 → slotvraag → (beslissingsvraag bij gelijke stand) → ontknoping → nakijken.
Tijdens het spel zijn er **geen uitslagen** te zien. Pas als alle rondes klaar zijn volgen de ontknoping, het overzicht per ronde en **Nakijken**: per team het antwoord met groen vinkje of rood kruis.

## Punten
Elke ronde is evenveel waard (`roundPoints`, standaard 100), ongeacht het aantal vragen of de grootte van het team.
Een team scoort dus een percentage van het maximum. Per ronde te overschrijven met `"points"` in questions.json.
- **Joker**: vóór ronde 1 kiest de basistelefoon van elk team de ronde waarin het team verwacht het best te scoren; die ronde telt dubbel.
- **Slotvraag**: meerkeuze met inzet (0 tot je totaal). Goed = inzet erbij, fout = inzet kwijt.
- **Beslissingsvraag**: alleen als na de slotvraag teams gelijk staan op de eerste plaats. Die teams schatten een getal (`tiebreakers` in questions.json); wie het dichtstbij zit krijgt 1 punt en wint. Staan ze dan nog gelijk, dan volgt de volgende vraag. Geen gelijke stand = geen open vraag.
- **Muziek**: de basistelefoon legt het liedje in de tijdlijn en kan optioneel het exacte jaartal invullen: dat levert bonuspunten op (`yearBonus`, standaard 1 extra punt per liedje, op te geven bij de ronde).
- **Foto blur** (`blurPoints`): hoe eerder goed, hoe meer punten. **Prijzen** (`pricePoints`): dichtstbij krijgt het meest.

## Vragen invullen in Excel (aanbevolen)
Alle vragen en opdrachten staan in **`vragenlijst.xlsx`** (een tabblad per ronde, uitleg op het tabblad *Lees mij*).
De server leest dit bestand zelf in; er is geen extra pakket voor nodig. Tot vlak voor de start kun je nog wijzigen:
- **Via de bediening** (blokje *Vragenlijst (Excel)*): kies *Excel uploaden*. Het bestand wordt meteen gecontroleerd en ingelezen. Waarschuwingen (bv. een vraag zonder foute antwoorden, een liedje zonder jaar) staan bovenin de bediening.
- Of vervang `vragenlijst.xlsx` in de projectmap en tik op *Opnieuw inlezen*.
- Staan beide, dan wint het nieuwste bestand.
- Na de start van de quiz kan dit niet meer. Foto's, logo's en audio zet je in `public/media/` (zie `public/media/README.txt`).
- Bij elke keer inlezen worden de antwoordvolgordes (A/B/C/D) opnieuw gehusseld.
- Ontbreekt de Excel, dan wordt `questions.json` gebruikt (ook voor wat niet in de Excel staat, zoals de teksten bij de testvragen).

## Rondes (technisch: questions.json)
| type | wat |
|---|---|
| `mc` | meerkeuze, met `categories` |
| `blur` | foto wordt scherper per klik van de quizmaster; `test` = testvraag vooraf |
| `memory` | `items` = wat op het bord stond; het hele team typt mee, quizmaster keurt bij |
| `hitster` | `songs` met `title`, `artist`, `year`, optioneel `audio` en `start: true` (startkaarten) |
| `price` | `items` met `now` en `ago` (prijs nu en `agoYears` jaar geleden) |
| `draw` | alle teams tegelijk, elk een ander woord. Een willekeurig teamlid (nooit de basistelefoon) tekent op de eigen telefoon, het team ziet het live. De basistelefoon geeft één antwoord; de quizmaster keurt goed/fout (voorstel staat al klaar). Ieder teamlid behalve de basis tekent één keer. `words` (met optioneel `alt` voor andere goede spellingen); teams moeten uit minstens 2 spelers bestaan |
| `thirty` | `cards`: lijsten van 5 woorden |
| `logo` | open vraag: logo met stukjes afgedekt (`hide`, standaard 0.5); `name` en `alt` (ook goed). Eén antwoord per team. Goede antwoorden krijgen punten op volgorde van snelheid (`logoPoints`, standaard 10, 8, 6, 4, 2); de quizmaster keurt achteraf goed/fout, dat verandert de volgorde niet. |

**Controleer vóór gebruik**: de prijzen zijn schattingen, `items` bij het geheugenbord zijn voorbeelden,
foto's/logo's/audio moeten nog in `public/media/` (zie daar de README).
Liedjes zonder `audio`: koppel Spotify (hieronder) of speel het liedje zelf af.

## Spotify koppelen (vooraf, in de bediening)
De bediening (host) logt in bij Spotify en start bij elke muziekvraag zelf het liedje.
1. Eenmalig in je Spotify-app (developer dashboard): voeg `http://127.0.0.1:3000/bediening.html` toe als Redirect URI
   en zet het Spotify-account onder *User Management*. Spotify Premium is nodig.
2. Open de bediening via `http://127.0.0.1:3000/bediening.html` (op de laptop waar de server draait).
   Via het netwerkadres (192.168…) staat Spotify inloggen niet toe.
3. Klap *Spotify* open, tik op **Verbind met Spotify** en log in.
4. Kies waar de muziek klinkt: **Deze browser** (de bediening op een laptop, aangesloten op de speakers) of een ander Spotify-apparaat
   (bijvoorbeeld je telefoon met de Spotify-app open, of een speaker). Probeer **Test**.
5. Houd de bediening open tijdens de muziekronde. Bij de muziekvraag staan de knoppen *Opnieuw afspelen* en *Muziek stoppen*.
Afspelen in de browser zelf werkt op een computer (Chrome, Edge, Firefox), niet in een telefoonbrowser; kies op een telefoon de Spotify-app als apparaat.
De Client ID staat in `public/shared.js` (`QuizSpotify`).

## Opslaan en herstellen
De lopende stand staat in `data/state.json` (teamfoto's in `data/teamphotos.json`). Bij de start van de quiz worden de vragen vastgezet in `data/quiz-vast.json`: na een herstart midden in de quiz komen de vragen daar vandaan, niet opnieuw uit de Excel, en wordt het juiste scherm op naam teruggezocht. Een Excel die intussen is aangepast, nog open staat of beschadigd is, kan de lopende quiz dus niet meer door elkaar gooien. `npm start` en start-lokaal lopen via `scripts/run.js`: die start de server na een crash vanzelf opnieuw (na 5 crashes binnen een minuut stopt hij, zodat je de fout kunt lezen); de vorige geldige stand blijft als `data/state.json.bak` beschikbaar als reservekopie. Als het hoofd-bestand ontbreekt of beschadigd is, probeert de server die reservekopie te herstellen. Een bewuste reset wist ook deze reservekopie. Afgeronde quizzen staan apart in `data/history.json` (met `data/history.json.bak` als reservekopie); een nieuwe quiz of reset wist de geschiedenis niet. Na een herstart staat een lopende quiz op pauze.
(zet `HOST_PIN` op een lange code, bijv. drie woorden met streepjes, en voor een echte avond plan `starter` met schijf). Niet pushen tijdens de quiz.

## Noodknoppen (bediening)
Antwoord wissen, afsluiten zonder te wachten, vraag laten vervallen of voor iedereen goed rekenen, stap overslaan/terug,
springen naar een ronde, +10 seconden, team of speler hernoemen/verplaatsen/verwijderen, andere basistelefoon aanwijzen.

## Beveiliging, reservekopieën en logboek

**Toegang tot de bediening**
- De toegangscode (`HOST_PIN`) mag lang zijn en letters, cijfers en streepjes bevatten, bijvoorbeeld `tulp-molen-482`. Hoofdletters, spaties en streepjes maken bij het invoeren niet uit. Online zonder `HOST_PIN`? Dan kiest de server zelf een code als `zon-haven-317`, bewaart die in `data/host-code.txt` en toont hem in het serverlog.
- Na één keer inloggen krijgt het toestel een sessiesleutel (36 uur geldig, verlengd bij gebruik); de code zelf wordt niet op het toestel bewaard. *🚨 Noodknoppen → Alle bediening-toestellen uitloggen* maakt alle sessies ongeldig.
- Bescherming tegen raden: na 5 foute codes 1 minuut wachten, na 10 fouten 5 minuten, na 15 fouten 30 minuten, daarna 2 uur (per adres). Bij meer dan 50 fouten in 10 minuten wacht iedereen 5 minuten. Codes worden in constante tijd vergeleken.
- Elke actie die binnenkomt wordt centraal gecontroleerd: quizmaster-acties alleen vanaf een ingelogde bediening, een maximum aantal berichten per 10 seconden en een maximale grootte per soort bericht (bijv. teamfoto 260 kB, Excel 5 MB). Geweigerde acties komen in het logboek.
- Bestanden: downloads (bibliotheek, reservekopieën, logboek) werken alleen met het geheime adres uit de bediening; vreemde bestandsnamen worden geweigerd; geüploade Excel-bestanden worden beschermd uitgepakt (maximaal 40 MB per onderdeel). De server stuurt veiligheidsheaders mee.

**Reservekopieën** (`data/backups/`)
- Automatisch elke 5 minuten (alleen als er iets veranderd is), bij het opstarten, bij de start en het einde van de quiz, na een upload en vóór een reset. Gekopieerd: `state.json`, `history.json`, `teamphotos.json`, `playlists.json`, de gebruikte `vragenlijst.xlsx` en `Hitster-bibliotheek.xlsx`.
- Bewaard: de laatste 40 kopieën en per dag de laatste van de afgelopen 30 dagen.
- Automatisch: bij de start, aan het begin van elke ronde, vóór de slotvraag, aan het einde, vóór een reset en elke 5 minuten. Kopieën van de start, rondes, slotvraag en einde blijven 3 dagen bewaard, ook als er veel automatische kopieën bij komen.
- In de bediening (*🛟 Reservekopieën en logboek*): nu een kopie maken, alles als zip downloaden, een eerdere kopie downloaden, of met *↩️ terugzetten* de stand van dat moment terugzetten. De huidige stand wordt dan eerst zelf als kopie bewaard (`voor-terugzetten`), de server start kort opnieuw op en de quiz staat daarna op pauze. Dit werkt als de quiz is gestart met start-lokaal of `npm start`. Teruggezet worden de stand, teamfoto's, playlists en vastgezette vragen; de quizgeschiedenis en het fotoalbum blijven zoals ze zijn.

**Logboek** (`data/logs/quiz-JJJJ-MM-DD.log`, 14 dagen bewaard)
- Elke regel is JSON: verbindingen (telefoon, tv, bediening), inlogpogingen, ingrijpende acties van de quizmaster, geweigerde of te grote berichten, fouten (met stacktrace), reservekopieën, start en einde van de quiz.
- In de bediening te bekijken (alles, alleen waarschuwingen of alleen fouten) en per dag te downloaden.

**Herstel bij verbindingsverlies (telefoons)**
- Rode balk met hoe lang de verbinding al weg is; na terugkeer de melding "Weer verbonden, je zit nog in je team".
- Antwoorden worden eerst op de telefoon bewaard. Komt er geen bevestiging, dan worden ze na het herverbinden stil alsnog verstuurd, zolang dezelfde vraag nog openstaat (anders volgt een melding dat het te laat was).
- Hoort een telefoon niet meer bij een team (quiz gereset of team verwijderd), dan krijgt hij een duidelijke uitleg en kan hij zich opnieuw aanmelden.

## Tests en kwaliteit

- `npm run check` = syntaxcontrole van alle code (ook de scripts in de HTML-pagina's) én alle tests. GitHub Actions draait dit bij elke push.
- `npm test` bevat naast de losse onderdelen:
  - **complete scenario's** (`test/integration-*.test.js`): aanmelden, testvraag, teamfoto, joker en een echte vraag met punten; telefoons die wegvallen en terugkomen; een herstart van de server midden in een vraag; een reset met een oude reservekopie (de oude stand mag nooit terugkomen); een complete quiz met drie testteams tot en met de ontknoping en de awards;
  - **geheimhouding**: tv en telefoons krijgen tijdens het spel nergens punten te zien, *Dit was ronde* zonder punten/volgorde, prijzenronde zonder bedragen op de tv;
  - **scorematrix** (`test/scoring.test.js`): per vraagtype goed/fout/geen antwoord, maximum, vervallen vraag, iedereen goed, joker, gelijke stand, slotvraag.
- Het testharnas (`test-helpers/`) start de echte server met nep-netwerk, zodat alles zonder browser getest wordt.

**Startklaar-controle**: vóór de start controleert de server de quiz. *Fouten* (bijv. een ronde zonder vragen, te weinig tekenwoorden of liedjes, een kapotte slotvraag) blokkeren de startknop; met *⚠️ Toch starten* kan het alsnog. *Waarschuwingen* (bijv. ontbrekende foto's) en *informatie* (wat er geladen is) staan in de 🧭 Voorbereiding.

**Late kans bij wegvallende verbinding**: valt de basistelefoon van een team weg tijdens een open meerkeuzevraag en sluit de vraag intussen, dan mag alléén dat team na terugkomst nog antwoorden. De vraag gaat niet voor iedereen opnieuw open, en een team dat verbonden bleef maar niet antwoordde krijgt geen extra kans.

## Zonder internet spelen (lokaal op een laptop)

De quiz draait volledig op de laptop; telefoons en tv verbinden via de wifi met de laptop. Internet is niet nodig.

**Eén keer vooraf, met internet**
1. Node.js installeren (nodejs.org) en in de projectmap `npm install` draaien. Zet het `package-lock.json` dat daarbij ontstaat in GitHub: dan worden overal exact dezelfde versies gebruikt (GitHub Actions gebruikt dan `npm ci`). De versies van Express en Socket.IO staan bovendien vast in `package.json` (en via `.npmrc` blijven nieuwe pakketten ook vast staan).
2. `npm run offline-check`: controleert Node.js, de pakketten, de vragenlijst, alle foto's/logo's en audiobestanden, en toont het adres voor de telefoons.
3. Muziek zonder internet: zet mp3-bestanden in `public/media/` en vul in de vragenlijst bij R4 Muziek de kolom *Audio* in. Spotify, iTunes, de Hitster-playlists en extra muziekrondes werken alleen met internet.
4. Op een andere laptop spelen? `npm run pakket` maakt `familiequiz-offline.zip` met alles erin (ook de pakketten). Daar alleen Node.js installeren en uitpakken.

**Op de avond**
- Dubbelklik `start-lokaal.bat` (Windows) of `start-lokaal.command` (Mac), of draai `npm run lokaal`. De controle draait eerst, daarna start de server en opent de bediening.
- Laptop en telefoons op hetzelfde wifi-netwerk (een router zonder internet of een hotspot van de laptop is prima). Zet op de telefoons de **mobiele data uit**, anders kiezen ze soms 4G/5G en vinden ze de laptop niet.
- De QR-code op de tv maakt de server zelf (geen internet nodig) en wijst naar het adres van de laptop, bijv. `http://192.168.1.23:3000`. Lettertype en confetti zitten ook in de app.
- De bediening ziet zelf of er internet is (🌐 *geen internet* rechtsboven) en waarschuwt in de startklaar-controle voor muziek zonder audiobestand.

## Code-indeling

**Server.** De spelstand (teams, toestellen, fase, stap, pauze, instellingen, ...) staat in één gedeeld object `G` (`lib/game.js`). `server.js` bevat de spelregels, de stappen, de scores en wat elk scherm te zien krijgt. De acties (socket-berichten) staan per onderwerp in `lib/sockets/`: `schermen.js` (bediening en tv aanmelden), `teams.js` (team maken of aansluiten), `antwoorden.js` (alles wat spelers insturen, plus spiekmeldingen), `spelverloop.js` (grote knop, pauze, vorige, nakijken, einde), `rondes.js` (beoordelen per ronde) en `beheer.js` (noodknoppen, instellingen, teams, vragenlijst, Spotify/Hitster, geluid). Ze krijgen de functies van de server via één `api`-object. Overige losse onderdelen in `lib/`: `settings.js` (standaardinstellingen en controle), `network.js` (het juiste netwerkadres voor de QR-code), `photo-store.js` (pauzefoto's, teamfoto's, originelen en het archief per quiz), `review.js` (de nakijkpagina's), `momentum.js`, `https-guard.js`, `security.js`, `state-store.js`, `backup.js`, `content.js`, `fromExcel.js`, `texts.js` en `logger.js`. Fouten die de quiz bewust opvangt, komen als `opgevangen_fout` in het logboek. De server stuurt een scherm alleen een nieuwe stand als er voor dat scherm echt iets veranderd is.

**Tv en telefoon.** `public/host.html` en `public/index.html` bevatten alleen de opmaak; de code staat in `public/js/tv.js` en `public/js/speler.js`. De telefoonbediening is `public/bediening2.html`.

### Bediening

`public/bediening.html` bevat alleen nog de opmaak. De code staat in `public/bediening/`: `core.js` (verbinding, inloggen, spiekmeldingen), `controls.js` (vaste knoppen), `backups.js`, `prep.js` (checklist, teamoverzicht), `hitster.js`, `panel.js` (stap-paneel), `teams.js`, `quizfile.js`, `spotify.js`, `settings.js` (scores, thema, rondeplan), `main.js` (verwerken van elke nieuwe stand) en `layout.js`/`layout.css` (kopbalk, menu, voorbereiding). Het zijn gewone scripts in een vaste volgorde. `test/ui-smoke.test.js` laadt bediening, tv en telefoon in een nep-browser en haalt alle standen van een complete quiz erdoorheen; een JavaScript-fout in een van de schermen laat de test falen.

