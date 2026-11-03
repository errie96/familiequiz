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
    const scripts = [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
      .map((match) => match[1])
      .filter((source) => source.trim());

    assert.ok(scripts.length > 0, file + ' should contain an inline script');
    scripts.forEach((source, index) => {
      assert.doesNotThrow(() => new vm.Script(source, { filename: file + '#script-' + index }));
    });
  }
});
