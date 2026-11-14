# Claude Desktop startpakket — Familiequiz

Dit pakket is afgestemd op de aangeleverde Familiequiz-projectstructuur.

## Inhoud
- `CLAUDE.md`: vaste projectinstructies. Plaats dit bestand in de hoofdmap van de quiz.
- `mcp-config.example.json`: voorbeeldconfiguratie voor Playwright en lokale projectbestanden.
- `skills/*.zip`: vier losse custom skills. Upload elke ZIP afzonderlijk in Claude via Customize > Skills > + > Create skill > Upload a skill.

## Belangrijk over Claude Desktop
Claude Desktop Chat kan plugins, skills en remote connectors gebruiken. Lokale MCP-tools kunnen via Desktop Extensions of de lokale MCP-configuratie beschikbaar worden gemaakt. Sommige plugin-onderdelen (zoals hooks/subagents en lokale plugin-MCP-servers) werken alleen in Cowork of Claude Code, niet in de gewone Chat-tab. Voor code wijzigen/testen in de lokale map heb je expliciete lokale bestandstoegang nodig.

## Aanbevolen installatievolgorde
1. Maak een volledige kopie/backup van je huidige quizmap.
2. Plaats `CLAUDE.md` in de projecthoofdmap.
3. Installeer de Playwright MCP via de Claude Desktop Extensions-directory als die daar beschikbaar is; anders gebruik je de voorbeeldconfiguratie.
4. Geef de Filesystem MCP uitsluitend toegang tot de quiz-projectmap. Gebruik geen brede toegang tot je hele gebruikersprofiel.
5. Upload de vier skills afzonderlijk.
6. Verbind GitHub alleen als je de repository daadwerkelijk gebruikt.
7. Open de projectmap via Claude Desktop / Cowork als beschikbare werkruimte, of voeg de README, CLAUDE.md en relevante bestanden toe aan de chat. Controleer welke lokale bestanden Claude werkelijk kan benaderen.

## Windows-configuratie
Open `%APPDATA%\\Claude\\claude_desktop_config.json` via Win+R of Verkenner. Voeg de `mcpServers`-inhoud uit `mcp-config.example.json` toe. Vervang `D:\\PROJECTPAD\\familiequiz-main` door het echte absolute pad naar de projectmap. Bewaar eerst een kopie van de bestaande configuratie. Sluit Claude Desktop volledig af en start opnieuw.

Als je bestaande config al `mcpServers` bevat, voeg dan alleen de twee server-objecten toe; overschrijf de bestaande servers niet.

## Beveiliging
- Gebruik geen MCP-server die willekeurige shell-commando's uitvoert zonder duidelijke noodzaak.
- Geef filesystem alleen toegang tot de projectmap.
- Zet secrets, `.env`, `pincode.txt` en runtime-data niet in GitHub.
- Laat Claude wijzigingen eerst als diff beoordelen en voer tests uit vóór gebruik tijdens een quizavond.

## Testprompt
"Lees eerst CLAUDE.md en README.md. Breng de architectuur in kaart. Wijzig nog niets. Geef een overzicht van de belangrijkste modules, spelstromen, testcommando's en de vijf grootste technische risico's. Verifieer elk punt in de broncode."
