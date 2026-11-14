// Instellingen van de quiz: standaardwaarden en controle van wat de bediening of config.json aanlevert.
'use strict';

const DEFAULT_SETTINGS = {
  roundPoints: 100,          // te verdienen punten per ronde (alle rondes even zwaar)
  timerEnabled: false,       // tijdslimiet bij meerkeuzevragen
  defaultTime: 20,           // seconden (of "time" bij de vraag zelf)
  readSeconds: 0,            // meerkeuze: zoveel seconden alleen de vraag; 0 = antwoorden direct erachteraan (vast; alleen voor tests)
  blurPoints: [10, 8, 6, 4, 3, 2], // punten per blurstap: hoe eerder goed, hoe meer
  pricePoints: [5, 3, 2, 1], // punten voor dichtstbij, tweede, derde, ...
  logoPoints: [10, 8, 6, 4, 2], // logo's: punten voor het eerste, tweede, ... goede antwoord
  logoCount: 10,             // logo-ronde: zoveel logo's spelen (de eerste N uit de Excel); de ronde blijft altijd 100 punten waard
  hitsterStartCards: 2,      // muziekronde: aantal eigen startkaarten per team
  hitsterTarget: 10,         // muziekronde stopt zodra een team zoveel kaarten in de tijdlijn heeft
  hitsterPlacePoints: 5,     // Hitster: punten voor de goede plek in de tijdlijn
  hitsterYearPoints: [5, 3, 2, 1], // Hitster: punten voor het jaartal: exact, 1, 2 of 3 jaar ernaast (verder ernaast = 0)
  hitsterTitlePoints: 2,     // Hitster-bonus: titel goed (de quizmaster keurt goed); 0 = niet vragen
  hitsterArtistPoints: 2,    // Hitster-bonus: artiest goed (de quizmaster keurt goed); 0 = niet vragen
  maxTeams: 0,               // maximaal aantal teams (0 = nog niet ingesteld); de host vult dit vooraf in
  finalMaxWager: 100,        // slotvraag: maximale inzet (teams kennen hun stand niet)
  tvCheatSound: true,        // alarmgeluid op de tv bij een spiekmelding
  showAnswers: { mc: false, logo: true }, // antwoord direct na de vraag op de tv tonen (anders pas bij het nakijken)
  momentum: true,             // na elke ronde korte meldingen op de tv ("X stijgt 2 plaatsen!"), zonder punten
  cheatGrace: 1,              // seconden wachten voordat een spiekmelding komt (0 = meteen)
  soundOut: 'tv',             // waar de quizgeluiden klinken: 'tv' of 'bediening'
  theme: 'standaard',        // uiterlijk: zie THEMES hieronder (kleuren in public/themes.css)
  roundPlan: null,           // volgorde, aan/uit en "in 2 delen" per ronde (wordt in de bediening ingesteld)
  memorySeconds: 120,
  drawSeconds: 75,
  thirtySeconds: 30,
  signup: 'auto',             // aanmelden: 'auto' (persoonlijk als er families in de Excel staan), 'personal' of 'teams'
  keepKidsAge: 0,             // teams maken: kinderen t/m deze leeftijd bij een volwassen gezinslid houden (0 = niet)
  thirtyPer: 0                // 30 Seconds: aantal vertellers per team (0 = iedereen legt één keer uit)
};
const THEMES = ['standaard', 'winter', 'kerst', 'oudennieuw', 'zomer', 'halloween', 'tvshow', 'feest', 'sinterklaas', 'disco'];
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
  if (src.showAnswers && typeof src.showAnswers === 'object') {
    out.showAnswers = { ...(base.showAnswers || { mc: false, logo: true }) };
    for (const k of ['mc', 'logo']) if (typeof src.showAnswers[k] === 'boolean') out.showAnswers[k] = src.showAnswers[k];
  }
  if (['tv', 'bediening'].includes(src.soundOut)) out.soundOut = src.soundOut;
  int('cheatGrace', 0, 5);
  int('roundPoints', 10, 1000);
  int('defaultTime', 5, 300);
  int('readSeconds', 0, 30);
  int('memorySeconds', 20, 900);
  int('drawSeconds', 15, 300);
  int('thirtySeconds', 10, 120);
  int('thirtyPer', 0, 10);
  int('hitsterTarget', 3, 50);
  int('hitsterStartCards', 1, 5);
  int('hitsterPlacePoints', 0, 100);
  int('hitsterTitlePoints', 0, 100);
  int('hitsterArtistPoints', 0, 100);
  int('maxTeams', 0, 50);
  int('finalMaxWager', 0, 100000);
  if (THEMES.includes(src.theme)) out.theme = src.theme;
  if (['auto', 'personal', 'teams'].includes(src.signup)) out.signup = src.signup;
  int('keepKidsAge', 0, 17);
  if (Array.isArray(src.roundPlan)) out.roundPlan = src.roundPlan.filter((x) => x && typeof x.id === 'string').map((x) => ({ id: x.id, on: x.on !== false, base: typeof x.base === 'string' ? x.base : undefined, category: typeof x.category === 'string' && x.category ? x.category.slice(0, 40) : undefined })).slice(0, 40);
  list('blurPoints', 10);
  list('pricePoints', 8);
  list('logoPoints', 10);
  int('logoCount', 1, 60);
  list('hitsterYearPoints', 10);
  return out;
}

module.exports = { DEFAULT_SETTINGS, THEMES, sanitizeSettings };
