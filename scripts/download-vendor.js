// Downloadt de twee externe scripts naar public/vendor/, zodat de quiz ook zonder internet werkt.
// Gebruik: npm run vendor   (eenmalig, met internet)
const https = require('https');
const fs = require('fs');
const path = require('path');

const FILES = [
  ['qrcode.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'],
  ['confetti.browser.min.js', 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js']
];
const target = path.join(__dirname, '..', 'public', 'vendor');
fs.mkdirSync(target, { recursive: true });

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} voor ${url}`));
      }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  for (const [name, url] of FILES) {
    try {
      await download(url, path.join(target, name));
      console.log('OK  ', name);
    } catch (e) {
      console.error('MISLUKT', name, '-', e.message);
      process.exitCode = 1;
    }
  }
})();
