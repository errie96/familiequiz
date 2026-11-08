// Instellingen van de quiz: standaardwaarden en controle van wat de bediening of config.json aanlevert.
'use strict';

const DEFAULT_SETTINGS = {
  roundPoints: 100,          // te verdienen punten per ronde (alle rondes even zwaar)
  timerEnabled: false,       // tijdslimiet bij meerkeuzevragen
  defaultTime: 20,           // seconden (of "time" bij de vraag zelf)
  readSeconds: 2,            // meerkeuze: eerst zoveel seconden alleen de vraag
  previewSeconds: 2,         // meerkeuze: daarna zoveel seconden de antwoorden in beeld, pas dan antwoorden; 0 = meteen
  blurPoints: [10, 8, 6, 4, 3, 2], // punten per blurstap: hoe eerder goed, hoe meer
  pricePoints: [5, 3, 2, 1], // punten voor dichtstbij, tweede, derde, ...
  logoPoints: [10, 8, 6, 4, 2], // logo's: punten voor het eerste, tweede, ... goede antwoord
  hitsterTarget: 10,         // muziekronde stopt zodra een team zoveel kaarten in de tijdlijn heeft
  hitsterPlacePoints: 5,     // Hitster: punten voor de goede plek in de tijdlijn
  hitsterYearPoints: [5, 3, 2, 1], // Hitster: punten voor het jaartal: exact, 1, 2 of 3 jaar ernaast (verder ernaast = 0)
  hitsterTitlePoints: 2,     // Hitster-bonus: titel goed (de quizmaster keurt goed); 0 = niet vragen
  hitsterArtistPoints: 2,    // Hitster-bonus: artiest goed (de quizmaster keurt goed); 0 = niet vragen
  maxTeams: 0,               // maximaal aantal teams (0 = nog niet ingesteld); de host vult dit vooraf in
  finalMaxWager: 100,        // slotvraag: maximale inzet (teams kennen hun stand niet)
  tvCheatSound: true,        // alarmgeluid op de tv bij een spiekmelding
  momentum: true,             // na elke ronde korte meldingen op de tv ("X stijgt 2 plaatsen!"), zonder punten
  cheatGrace: 1,              // seconden wachten voordat een spiekmelding komt (0 = meteen)
  soundOut: 'tv',             // waar de quizgeluiden klinken: 'tv' of 'bediening'
  theme: 'standaard',        // uiterlijk: standaard, winter, kerst, oudennieuw, zomer, halloween
  roundPlan: null,           // volgorde, aan/uit en "in 2 delen" per ronde (wordt in de bediening ingesteld)
  memorySeconds: 120,
  drawSeconds: 75,
  thirtySeconds: 30
};
const THEMES = ['standaard', 'winter', 'kerst', 'oudennieuw', 'zomer', 'halloween'];
function sanitizeSettings(input, base) {
  const out = { ...base };
  const src = input && typeof input === 'object' ? input : {};
  const int = (k, min, max) => { if (Number.isInteger(src[k]) && src[k] >= min && src[k] <= max) out[k] = src[k]; };
  const list = (k, len) => {
    if (Array.isArray(src[k]) && src[k].length >= 1 && src[k].length <= len && src[k].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) out[k] = src[k];
  };
  if (typeof src.timerEnabled === 'boolean') out.timerEnabled = src.timerEnabled;
  if (typeof src.tvCheatSound === 'boolean') out.tvCheatSound = src.tvCheatSound;
  if (typeof src.momentum === 'boolean') out.momentum = src.momentum;
  if (['tv', 'bediening'].includes(src.soundOut)) out.soundOut = src.soundOut;
  int('cheatGrace', 0, 5);
  int('roundPoints', 10, 1000);
  int('defaultTime', 5, 300);
  int('readSeconds', 0, 30);
  int('previewSeconds', 0, 30);
  int('memorySeconds', 20, 900);
  int('drawSeconds', 15, 300);
  int('thirtySeconds', 10, 120);
  int('hitsterTarget', 3, 50);
  int('hitsterPlacePoints', 0, 100);
  int('hitsterTitlePoints', 0, 100);
  int('hitsterArtistPoints', 0, 100);
  int('maxTeams', 0, 50);
  int('finalMaxWager', 0, 100000);
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  if (Array.isArray(src.roundPlan)) out.roundPlan = src.roundPlan.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, on: x.on !== false, base: typeof x.base === 'string' ? x.base : undefined, category: typeof x.category === 'string' && x.category ? x.category.slice(0, 40) : undefined })).slice(0, 40);
  list('blurPoints', 10);
  list('pricePoints', 8);
  list('logoPoints', 10);
  list('hitsterYearPoints', 10);
  return out;
}

module.exports = { DEFAULT_SETTINGS, THEMES, sanitizeSettings };
