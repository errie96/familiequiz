// QR-code maken zonder extra pakketten of internet (byte-modus, foutcorrectie M, versie 1 t/m 10).
// Genoeg voor een webadres als http://192.168.1.23:3000. Uitvoer: SVG.
const EC_M = { // versie: [ec-codewoorden per blok, [aantal blokken, datacodewoorden], ...]
  1: [10, [1, 16]], 2: [16, [1, 28]], 3: [26, [1, 44]], 4: [18, [2, 32]], 5: [24, [2, 43]],
  6: [16, [4, 27]], 7: [18, [4, 31]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]], 10: [26, [4, 43], [1, 44]]
};
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const REMAINDER = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0, 10: 0 };

// ---- Galoisveld GF(256) en Reed-Solomon ----
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
function rsRemainder(data, n) {
  const gen = rsGenerator(n);
  const res = [...data, ...new Array(n).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (c) for (let j = 0; j < gen.length; j++) res[i + j] ^= gmul(gen[j], c);
  }
  return res.slice(data.length);
}

function dataCapacity(v) { const t = EC_M[v]; return t.slice(1).reduce((s, [n, d]) => s + n * d, 0); }

function encode(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const bits = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (bits <= dataCapacity(v) * 8) { version = v; break; }
  }
  if (!version) throw new Error('Tekst te lang voor de QR-code');
  // bitstroom
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCapacity(version) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; data.length < cap / 8; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  // blokken + foutcorrectie, daarna verweven
  const [ecLen, ...groups] = EC_M[version];
  const blocks = [];
  let off = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) { const blk = data.slice(off, off + d); off += d; blocks.push({ d: blk, e: rsRemainder(blk, ecLen) }); }
  const out = [];
  const maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ecLen; i++) for (const b of blocks) out.push(b.e[i]);
  return { version, codewords: out };
}

function buildMatrix(version, codewords, mask) {
  const size = 17 + version * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null)); // null = nog vrij
  const fn = Array.from({ length: size }, () => new Array(size).fill(false)); // functiepatronen
  const set = (r, c, v) => { m[r][c] = v ? 1 : 0; fn[r][c] = true; };
  const finder = (r0, c0) => {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const rr = r0 + r, cc = c0 + c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(rr, cc, on);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version];
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, 1); // donkere module
  // gereserveerde plekken voor formaat- en versie-informatie
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 0); set(size - 1 - i, 8, 0); }
  if (version >= 7) for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { set(i, size - 11 + j, 0); set(size - 11 + j, i, 0); }
  // data plaatsen (zigzag van rechtsonder)
  const bits = [];
  codewords.forEach((cw) => { for (let i = 7; i >= 0; i--) bits.push((cw >> i) & 1); });
  for (let i = 0; i < REMAINDER[version]; i++) bits.push(0);
  let bi = 0, upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const r = upward ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (fn[r][c]) continue;
        let v = bi < bits.length ? bits[bi++] : 0;
        if (MASKS[mask](r, c)) v ^= 1;
        m[r][c] = v;
      }
    }
    upward = !upward;
  }
  // formaatinformatie (foutcorrectie M = 00)
  let fmt = (0b00 << 3) | mask;
  let rem = fmt << 10;
  for (let i = 14; i >= 10; i--) if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  fmt = ((fmt << 10) | rem) ^ 0x5412;
  const fb = (i) => (fmt >> i) & 1;
  // eerste kopie (rond de zoeker linksboven)
  for (let i = 0; i <= 5; i++) m[i][8] = fb(i);
  m[7][8] = fb(6); m[8][8] = fb(7); m[8][7] = fb(8);
  for (let i = 9; i < 15; i++) m[8][14 - i] = fb(i);
  // tweede kopie (rechtsboven en linksonder)
  for (let i = 0; i < 8; i++) m[8][size - 1 - i] = fb(i);
  for (let i = 8; i < 15; i++) m[size - 15 + i][8] = fb(i);
  m[size - 8][8] = 1; // altijd donker
  // versie-informatie (vanaf versie 7)
  if (version >= 7) {
    let rv = version << 12;
    for (let i = 17; i >= 12; i--) if ((rv >> i) & 1) rv ^= 0x1f25 << (i - 12);
    const vi = (version << 12) | rv;
    for (let i = 0; i < 18; i++) {
      const bit = (vi >> i) & 1, a = Math.floor(i / 3), b = size - 11 + (i % 3);
      m[a][b] = bit; m[b][a] = bit;
    }
  }
  return m;
}
const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];
function penalty(m) {
  const n = m.length;
  let p = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    let run = 1;
    for (let j = 1; j < n; j++) {
      const a = pass ? m[j][i] : m[i][j], b = pass ? m[j - 1][i] : m[i][j - 1];
      if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const v = m[i][j]; if (v === m[i + 1][j] && v === m[i][j + 1] && v === m[i + 1][j + 1]) p += 3; }
  const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) {
    let h1 = true, h2 = true, v1 = true, v2 = true;
    for (let k = 0; k < 11; k++) { if (m[i][j + k] !== pat[k]) h1 = false; if (m[i][j + k] !== pat2[k]) h2 = false; if (m[j + k][i] !== pat[k]) v1 = false; if (m[j + k][i] !== pat2[k]) v2 = false; }
    p += 40 * (h1 + h2 + v1 + v2);
  }
  const dark = m.flat().reduce((s, v) => s + v, 0);
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}
function matrix(text) {
  const { version, codewords } = encode(text);
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = buildMatrix(version, codewords, mask); const p = penalty(m); if (p < bestP) { bestP = p; best = m; } }
  return best;
}
function svg(text, { margin = 4, dark = '#000', light = '#fff' } = {}) {
  const m = matrix(text), n = m.length + margin * 2;
  let path = '';
  m.forEach((row, r) => row.forEach((v, c) => { if (v) path += `M${c + margin} ${r + margin}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}
module.exports = { matrix, svg, encode };
