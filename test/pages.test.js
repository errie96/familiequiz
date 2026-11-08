// Eigen extra pagina's (tabblad "Pagina's") en de dia "De test lijkt geslaagd" na de testvragen
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { fromExcel } = require('../lib/fromExcel');
const { loadContent } = require('../lib/content');

const root = path.join(__dirname, '..');
const { raw } = fromExcel(path.join(root, 'vragenlijst.xlsx'), path.join(root, 'questions.json'));

test('na de testvragen: "De test lijkt geslaagd", dan de teamfoto', () => {
  const ids = loadContent(null, raw).steps.map((s) => s.id);
  assert.equal(ids[ids.indexOf('test_done') - 1], 'test_3');
  assert.equal(ids[ids.indexOf('test_done') + 1], 'teamphoto');
});

test('eigen pagina\'s komen op de gekozen plek; een onbekende plek geeft een waarschuwing', () => {
  const pages = [
    { where: 'Na ronde 2', emoji: '🍕', title: 'Tijd voor eten!', text: 'Over 20 minuten verder.' },
    { where: 'voor de slotvraag', title: 'Laatste kans!' },
    { where: 'na teamfoto', title: 'Wat een plaatjes' },
    { where: 'ergens', title: 'Foute plek' }
  ];
  const c = loadContent(null, { ...raw, pages });
  const ids = c.steps.map((s) => s.id);
  const after = (id) => ids[ids.indexOf(id) - 1];
  assert.equal(after('page_1'), 'r2_result');
  assert.equal(ids[ids.indexOf('page_1') + 1], 'r3_intro');
  assert.equal(ids[ids.indexOf('page_2') + 1], 'final');
  assert.equal(after('page_3'), 'teamphoto');
  assert.ok(!ids.includes('page_4'));
  assert.ok(c.warnings.some((w) => /Foute plek/.test(w)));
  const p = c.steps.find((s) => s.id === 'page_1');
  assert.deepEqual([p.kind, p.emoji, p.title], ['info', '🍕', 'Tijd voor eten!']);
});
