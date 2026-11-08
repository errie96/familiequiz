// Rooktest van de drie schermen (bediening, tv, telefoon) zonder browser: een complete quiz wordt
// gespeeld, en elke soort stand die de server verstuurt wordt door de echte pagina-scripts gehaald.
// Faalt als een pagina daarbij een JavaScript-fout geeft.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, phone } = require('../test-helpers/harness');
const { loadPage } = require('../test-helpers/ui-runner');

const app = startServer({ fastTimers: true });
const { host, remote, sleep, emitted } = app;

// één stand per soort scherm (stap + status + pauze + einde), zodat elke weergave minstens één keer langskomt
function sample(room) {
  const seen = new Map();
  for (const e of emitted) {
    if (e.room !== room || e.e !== 'state_update') continue;
    const d = e.d;
    const st = d.step || d.view || {};
    const key = [d.phase, d.paused, d.lobbyStage, st.kind || st.type, st.status, d.end && d.end.reveal, d.end && d.end.endView, d.showPositions, !!d.review].join('|');
    if (!seen.has(key)) seen.set(key, d);
  }
  return [...seen.values()];
}

test('complete quiz spelen en alle standen verzamelen', { timeout: 120000 }, async () => {
  host.send('set_max_teams', { n: 4 });
  const p = await phone(app, 'speler', { team: 'Oma', label: 'Oma' });
  assert.equal(p.res.ok, true);
  host.send('add_bots', { n: 2 });
  host.send('host_main'); host.send('host_main');
  for (let i = 0; i < 4000 && remote().phase === 'PLAY'; i++) {
    await sleep(15);
    const r = remote();
    if (i === 300) { host.send('toggle_pause'); await sleep(5); host.send('toggle_pause'); }
    if (i === 400) { host.send('toggle_positions', { mode: 'list' }); await sleep(5); host.send('toggle_positions', { mode: 'race' }); await sleep(5); host.send('toggle_positions', { mode: 'race' }); }
    if (r.controls.main.enabled) host.send('host_main'); else if (r.controls.force) host.send('host_force');
  }
  for (let i = 0; i < 20 && remote().end && remote().end.reveal !== 'done'; i++) host.send('host_main');
  for (const v of ['awards', 'album', 'breakdown', 'ranking']) host.send('end_view', { view: v });
  assert.equal(remote().phase, 'END');
});

for (const [page, room, extra] of [['bediening.html', 'remote_room', ['remote_confirmed']], ['bediening2.html', 'remote_room', ['remote_confirmed']], ['host.html', 'tv_room', ['tv_ok']], ['index.html', 'speler', ['session']]]) {
  test(`${page}: laadt en verwerkt alle standen zonder JavaScript-fouten`, async () => {
    const ui = loadPage(page);
    ui.fire('connect');
    extra.forEach((ev) => ui.fire(ev, ev === 'session' ? { deviceId: 'x' } : {}));
    const states = sample(room);
    assert.ok(states.length > 20, `genoeg verschillende standen (${states.length})`);
    for (const s of states) ui.fire('state_update', s);
    await new Promise((r) => setTimeout(r, 50)); // timers (animaties) laten lopen
    ui.done();
    assert.deepEqual(ui.errors, []);
  });
}
