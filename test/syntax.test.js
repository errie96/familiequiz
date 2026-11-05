'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

test('server and browser inline scripts have valid JavaScript syntax', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(server, { filename: 'server.js' }));

  for (const file of ['public/index.html', 'public/host.html', 'public/bediening.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter((source) => source.trim());

    // de bediening laadt haar code uit losse bestanden (public/bediening/*.js)
    if (file === 'public/bediening.html') {
      for (const f of fs.readdirSync(path.join(root, 'public', 'bediening')).filter((x) => x.endsWith('.js'))) scripts.push(fs.readFileSync(path.join(root, 'public', 'bediening', f), 'utf8'));
    }
    assert.ok(scripts.length > 0, file + ' should contain scripts');
    scripts.forEach((source, index) => {
      assert.doesNotThrow(() => new vm.Script(source, { filename: file + '#script-' + index }));
    });
  }
});
