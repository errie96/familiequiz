// teams
// Wordt per verbinding aangeroepen vanuit onConnection (server.js); krijgt de functies en de spelstand via api.
'use strict';

module.exports = function register(socket, api) {
  const {
    baseApprovals,
    baseChangeAllowed,
    G,
    LOG,
    MAX_DEVICES_PER_TEAM,
    MAX_LABEL,
    MAX_TEAM_NAME,
    TEAM_COLORS,
    attachSocket,
    byName,
    cleanText,
    clientIp,
    deviceOf,
    findTeamByName,
    labelTaken,
    newId,
    notifyTeam,
    pickColor,
    reopenIfMissed,
    sync,
    teamDevices
  } = api;
  // ---------- Telefoons: team maken of aansluiten ----------
  socket.on('hello', ({ deviceId } = {}) => {
    const device = typeof deviceId === 'string' ? G.devices[deviceId] : null;
    // Persoonlijk aangemeld en nog niet ingedeeld: gewoon weer verbinden (wachtscherm)
    if (device && !G.teams[device.teamId] && api.personalMode() && !device.bot) {
      attachSocket(socket, device);
      socket.emit('session', { deviceId: device.deviceId });
      return sync();
    }
    if (!device || !G.teams[device.teamId]) {
      // Onbekende telefoon (team verwijderd of quiz gereset): netjes opnieuw laten aanmelden, met uitleg
      if (typeof deviceId === 'string' && deviceId) LOG.info('telefoon_onbekend', { ip: clientIp(socket) });
      return socket.emit('need_join', { reason: typeof deviceId === 'string' && deviceId ? 'unknown' : 'new' });
    }
    const wasOffline = !device.connected;
    attachSocket(socket, device);
    LOG.info(wasOffline ? 'telefoon_terug' : 'telefoon_verbonden', { team: G.teams[device.teamId].name, speler: device.label });
    socket.emit('session', { deviceId: device.deviceId });
    reopenIfMissed(G.teams[device.teamId]);
    sync();
  });
  // ---------- Persoonlijk aanmelden: naam, familie en leeftijd; de bediening maakt de teams ----------
  socket.on('signup_info', (_, cb) => {
    if (typeof cb !== 'function') return;
    cb({ personal: api.personalMode(), families: api.familyList().map((f) => f.name), started: G.phase !== 'LOBBY', ended: G.phase === 'END' });
  });
  socket.on('signup', ({ label, family, age, token, reclaim } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!api.personalMode()) return reply({ ok: false, message: 'Aanmelden gaat hier per team. Ververs de pagina.' });
    if (G.phase === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    if (api.deviceOf(socket)) return reply({ ok: true, deviceId: socket.data.deviceId, already: true });
    // Dezelfde telefoon probeert het nog een keer (het antwoord kwam niet aan door een hapering): geen dubbele aanmelding
    const again = typeof token === 'string' && token.length >= 8 && token.length <= 64 ? api.people().find((d) => d.signupToken === token) : null;
    if (again) { attachSocket(socket, again); reply({ ok: true, deviceId: again.deviceId, already: true }); return sync(); }
    const myName = cleanText(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul je naam in.' });
    const fams = api.familyList();
    const fam = fams.find((f) => api.norm(f.name) === api.norm(family));
    if (fams.length && !fam) return reply({ ok: false, message: 'Kies je familie uit de lijst.' });
    const famName = fam ? fam.name : cleanText(family, 30);
    const n = typeof age === 'string' && age.trim() !== '' ? Number(age) : age;
    if (!Number.isInteger(n) || n < 0 || n > 110) return reply({ ok: false, message: 'Vul je leeftijd in (een heel getal).' });
    if (api.people().length >= 300) return reply({ ok: false, message: 'Er zijn al heel veel aanmeldingen. Vraag de quizmaster.' });
    // Zelfde naam als iemand die nu NIET verbonden is (andere telefoon, browsergegevens gewist, andere laptop):
    // dan mag deze telefoon die plek overnemen, met team en al. Is die persoon wel verbonden, dan is het een dubbele naam.
    const same = api.people().find((d) => api.norm(d.label) === api.norm(myName));
    if (same && !same.connected) {
      if (reclaim !== true) return reply({ ok: false, reclaim: true, message: `Er is al een ${same.label}${same.family ? ` (familie ${same.family})` : ''} aangemeld, maar die telefoon is nu niet verbonden. Ben jij dat? Dan ga je verder waar je was.` });
      attachSocket(socket, same);
      LOG.info('plek_overgenomen', { speler: same.label, ip: clientIp(socket) });
      reply({ ok: true, deviceId: same.deviceId, already: true });
      return sync();
    }
    if (api.personTaken(myName)) return reply({ ok: false, message: `Er is al een ${myName} aangemeld. Zet er een letter achter (bijv. ${myName.slice(0, 13)} B), dan kunnen we jullie uit elkaar houden.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: null, label: myName, family: famName, age: n, seq: ++G.seq, socketId: null, connected: false, ...(typeof token === 'string' && token.length >= 8 && token.length <= 64 ? { signupToken: token } : {}) };
    G.devices[device.deviceId] = device;
    attachSocket(socket, device);
    LOG.info('aangemeld', { speler: myName, familie: famName, leeftijd: n, ip: clientIp(socket) });
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });
  // De basistelefoon kiest (in de lobby) de teamnaam en de kleur van een team dat de bediening heeft gemaakt
  socket.on('team_setup', ({ name, color } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team || !api.personalMode()) return reply({ ok: false });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'De quiz is al begonnen: de teamnaam ligt vast. Vraag het de quizmaster.' });
    if (team.baseDeviceId !== device.deviceId) return reply({ ok: false, message: 'Alleen de basistelefoon kiest de teamnaam.' });
    if (name !== undefined) {
      const clean = cleanText(name, MAX_TEAM_NAME);
      if (!clean) return reply({ ok: false, message: 'Vul een teamnaam in.' });
      if (findTeamByName(clean, team.teamId)) return reply({ ok: false, message: `De teamnaam "${clean}" is al in gebruik.` });
      team.name = clean;
      delete team.autoName;
    }
    if (color !== undefined && color !== team.color) {
      if (!TEAM_COLORS.includes(color) || Object.values(G.teams).some((t) => t !== team && t.color === color)) return reply({ ok: false, message: 'Die kleur is net door een ander team gekozen.' });
      team.color = color;
    }
    reply({ ok: true });
    sync();
  });
  socket.on('list_teams', (_, cb) => {
    if (typeof cb !== 'function') return;
    const n = Object.keys(G.teams).length;
    const started = G.phase !== 'LOBBY';
    const used = new Set(Object.values(G.teams).map((t) => t.color));
    cb({ teams: Object.values(G.teams).filter((t) => !t.bot).map((t) => ({ teamId: t.teamId, name: t.name, members: teamDevices(t).length })).sort(byName), maxTeams: G.settings.maxTeams, started, full: started || (!!G.settings.maxTeams && n >= G.settings.maxTeams), colors: TEAM_COLORS.map((c) => ({ c, free: !used.has(c) })) });
  });
  socket.on('create_team', ({ teamName, label, color } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (G.phase === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    if (api.personalMode()) return reply({ ok: false, message: 'Meld je persoonlijk aan (naam, familie en leeftijd); de quizmaster maakt de teams. Ververs de pagina.' });
    if (G.phase !== 'LOBBY') return reply({ ok: false, message: 'De quiz is al begonnen: er kunnen geen nieuwe teams meer bij. Sluit aan bij een bestaand team.' });
    const myName = cleanText(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const name = cleanText(teamName, MAX_TEAM_NAME);
    if (!name) return reply({ ok: false, message: 'Vul een teamnaam in.' });
    if (findTeamByName(name)) return reply({ ok: false, message: `De teamnaam "${name}" is al in gebruik.` });
    if (!G.settings.maxTeams) return reply({ ok: false, message: 'De quizmaster heeft het aantal teams nog niet ingesteld. Even geduld!' });
    if (Object.keys(G.teams).length >= G.settings.maxTeams) return reply({ ok: false, message: `Er doen al ${G.settings.maxTeams} teams mee (het maximum). Sluit aan bij een bestaand team.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: null, label: myName, seq: ++G.seq, socketId: null, connected: false };
    // eigen teamkleur kiezen (uit het vaste palet, als hij nog vrij is), anders de eerste vrije kleur
    const free = TEAM_COLORS.includes(color) && !Object.values(G.teams).some((t) => t.color === color);
    const team = { teamId: newId('t_'), name, seq: ++G.seq, baseDeviceId: device.deviceId, jokerRound: null, timelines: {}, proposal: null, color: free ? color : pickColor() };
    device.teamId = team.teamId;
    G.teams[team.teamId] = team;
    G.devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });
  socket.on('join_team', ({ teamId, label } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (G.phase === 'END') return reply({ ok: false, message: 'De quiz is al afgelopen.' });
    if (api.personalMode()) return reply({ ok: false, message: 'Meld je persoonlijk aan (naam, familie en leeftijd); de quizmaster deelt je in. Ververs de pagina.' });
    const myName = cleanText(label, MAX_LABEL);
    if (!myName) return reply({ ok: false, message: 'Vul eerst je eigen naam in.' });
    const team = G.teams[teamId];
    if (!team) return reply({ ok: false, message: 'Dat team bestaat niet meer.' });
    if (teamDevices(team).length >= MAX_DEVICES_PER_TEAM) return reply({ ok: false, message: 'Dit team zit vol.' });
    if (labelTaken(team, myName)) return reply({ ok: false, message: `In dit team zit al iemand die ${myName} heet. Voeg bijvoorbeeld een letter toe.` });
    const device = { deviceId: newId('d_'), memberId: newId('m_'), teamId: team.teamId, label: myName, seq: ++G.seq, socketId: null, connected: false };
    G.devices[device.deviceId] = device;
    attachSocket(socket, device);
    reply({ ok: true, deviceId: device.deviceId });
    sync();
  });
  socket.on('propose_base', ({ memberId } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return reply({ ok: false });
    if (!baseChangeAllowed()) return reply({ ok: false, message: 'Tijdens een ronde kun je niet van basistelefoon wisselen. Dat kan weer vóór de volgende ronde.' });
    const candidate = memberId ? teamDevices(team).find((d) => d.memberId === memberId) : device;
    if (!candidate || !candidate.connected) return reply({ ok: false, message: 'Die telefoon is niet verbonden.' });
    if (team.baseDeviceId === candidate.deviceId) return reply({ ok: false, message: `${candidate.label} is al de basistelefoon.` });
    team.proposal = { candidateId: candidate.deviceId, proposerId: device.deviceId, approvals: [device.deviceId] };
    reply({ ok: true });
    sync();
  });
  // Akkoord met de huidige basistelefoon (nodig vóór de start: iedereen in het team moet akkoord zijn)
  socket.on('approve_base', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return reply({ ok: false });
    const ok = baseApprovals(team);
    if (!ok.includes(device.deviceId)) ok.push(device.deviceId);
    reply({ ok: true });
    sync();
  });
  socket.on('respond_base', ({ approve } = {}, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    const p = team && team.proposal;
    if (!p) return reply({ ok: false });
    if (approve && !baseChangeAllowed()) return reply({ ok: false, message: 'Tijdens een ronde kun je niet van basistelefoon wisselen.' });
    if (approve) { if (!p.approvals.includes(device.deviceId)) p.approvals.push(device.deviceId); }
    else {
      team.proposal = null;
      const base = G.devices[team.baseDeviceId];
      notifyTeam(team, p.proposerId === device.deviceId ? `${device.label} heeft het voorstel ingetrokken.` : `${device.label} is niet akkoord. De basistelefoon blijft ${base ? base.label : 'zoals hij was'}.`);
    }
    reply({ ok: true });
    sync();
  });
  socket.on('leave_team', (_, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    const device = deviceOf(socket);
    const team = device && G.teams[device.teamId];
    if (!team) return reply({ ok: false });
    if (api.personalMode()) return reply({ ok: false, message: 'De quizmaster heeft de teams gemaakt. Vraag de quizmaster om je te verplaatsen.' });
    if (team.baseDeviceId === device.deviceId) return reply({ ok: false, message: 'De basistelefoon kan het team niet verlaten. Kies eerst samen een andere basistelefoon.' });
    if (team.proposal && (team.proposal.candidateId === device.deviceId || team.proposal.proposerId === device.deviceId)) team.proposal = null;
    delete G.alerts[device.deviceId];
    delete G.devices[device.deviceId];
    socket.data.deviceId = null;
    reply({ ok: true });
    sync();
  });

};
