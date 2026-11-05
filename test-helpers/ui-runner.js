// Rooktest voor de webpagina's zonder browser: laadt de scripts van een pagina in een nep-DOM en voert
// echte standen van de server door de pagina heen. Vangt fouten als "x is not defined" of "cannot read
// properties of undefined" op die anders pas op de quizavond in de browser zouden opvallen.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeDom(errors) {
  const byId = new Map();
  // "Alles"-object voor onbekende eigenschappen: aanroepbaar, en levert zichzelf weer op
  const anything = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : k === 'length' ? 0 : anything),
    apply: () => anything, construct: () => anything, set: () => true
  });
  function makeEl(tag, id) {
    const el = {
      tagName: String(tag || 'div').toUpperCase(), id: id || '', children: [], childNodes: [], parentNode: null, firstChild: null, lastChild: null, nextSibling: null,
      style: new Proxy({ setProperty() {}, removeProperty() {} }, { set: (o, k, v) => { o[k] = v; return true; } }),
      dataset: {}, className: '', textContent: '', innerHTML: '', value: '', checked: false, disabled: false, open: false, hidden: false,
      href: '', src: '', title: '', type: '', files: [], width: 300, height: 150, offsetWidth: 300, offsetHeight: 60, clientWidth: 300, clientHeight: 150,
      scrollHeight: 100, naturalWidth: 400, naturalHeight: 300, options: [], selectedIndex: 0,
      classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; }, contains(c) { return this._s.has(c); } },
      append(...n) { n.forEach((x) => { if (x && typeof x === 'object') { this.children.push(x); x.parentNode = this; } }); this.firstChild = this.children[0] || null; this.lastChild = this.children[this.children.length - 1] || null; },
      appendChild(n) { this.append(n); return n; }, prepend(...n) { this.append(...n); },
      replaceChildren(...n) { this.children = []; this.append(...n); }, removeChild(n) { this.children = this.children.filter((x) => x !== n); this.firstChild = this.children[0] || null; return n; },
      insertBefore(n) { this.append(n); return n; }, remove() { if (this.parentNode) this.parentNode.removeChild(this); },
      contains() { return false; }, closest() { return null; }, matches() { return false; },
      querySelector(sel) { return makeEl('div'); }, querySelectorAll() { return []; }, getElementsByTagName() { return []; },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] ?? null; }, removeAttribute() {},
      focus() {}, blur() {}, click() {}, select() {}, scrollIntoView() {}, scrollTo() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 }; },
      getContext() { return anything; }, toDataURL() { return 'data:image/png;base64,'; }, toBlob(cb) { cb(null); }, captureStream() { return anything; },
      play() { return Promise.resolve(); }, pause() {}, load() {}, showModal() {}, close() {}, animate() { return anything; }
    };
    return new Proxy(el, { get: (o, k) => (k in o ? o[k] : typeof k === 'symbol' ? undefined : anything), set: (o, k, v) => { o[k] = v; return true; } });
  }
  const body = makeEl('body'), head = makeEl('head'), docEl = makeEl('html');
  const document = {
    body, head, documentElement: docEl, hidden: false, visibilityState: 'visible', activeElement: null, readyState: 'complete',
    getElementById(id) { if (!byId.has(id)) byId.set(id, makeEl('div', id)); return byId.get(id); },
    createElement: (t) => makeEl(t), createTextNode: (t) => makeEl('#text'), createElementNS: (ns, t) => makeEl(t),
    querySelector: (sel) => (sel === '.card' ? (byId.get('__card') || (byId.set('__card', makeEl('div', '__card')), byId.get('__card'))) : null),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
    fonts: { load: async () => [], ready: Promise.resolve() }
  };
  // de .card bevat de kopbalk (h1) zodat het indelingsscript zijn werk kan doen
  const card = document.querySelector('.card');
  const header = makeEl('div'); const h1 = makeEl('h1'); header.append(h1); card.append(header, makeEl('div'));
  card.querySelector = (sel) => (sel === 'h1' ? h1 : null);
  return { document, makeEl };
}

function loadPage(file, { remote = false } = {}) {
  const errors = [];
  const root = path.join(__dirname, '..', 'public');
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const { document, makeEl: makeElRef } = makeDom(errors);
  const handlers = {};
  const emitted = [];
  const socket = {
    connected: true, id: 'test',
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, ...args) { emitted.push({ ev, args }); const cb = args.find((a) => typeof a === 'function'); if (cb && ev === 'list_teams') cb({ teams: [], maxTeams: 4, full: false }); },
    timeout() { return socket; }, volatile: null
  };
  socket.volatile = socket;
  const store = new Map();
  const timers = new Set();
  const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { errors.push(`timer: ${e.message}`); } };
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    document, navigator: { vibrate() {}, userAgent: 'test', clipboard: { writeText: async () => {} } },
    location: { origin: 'http://localhost:3000', href: 'http://localhost:3000/' + file, search: '', hostname: 'localhost', protocol: 'http:', pathname: '/' + file, reload() {} },
    history: { replaceState() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ url: 'http://192.168.1.2:3000' }), text: async () => '' }),
    setTimeout: (f, ms, ...a) => { const t = setTimeout(guard(f), Math.min(ms || 0, 5), ...a); timers.add(t); return t; },
    clearTimeout: (t) => clearTimeout(t), setInterval: (f) => { const t = setInterval(guard(f), 1000000); timers.add(t); return t; }, clearInterval: (t) => clearInterval(t),
    requestAnimationFrame: (f) => { const t = setTimeout(guard(() => f(0)), 1); timers.add(t); return t; }, cancelAnimationFrame: () => {},
    alert() {}, confirm: () => true, prompt: () => '1234',
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }), getComputedStyle: () => ({ getPropertyValue: () => '' }),
    ResizeObserver: class { observe() {} disconnect() {} }, IntersectionObserver: class { observe() {} disconnect() {} },
    CSS: { escape: (s) => String(s) }, Image: class { set src(v) { this._s = v; } }, Audio: class { play() { return Promise.resolve(); } pause() {} },
    URL: Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }), URLSearchParams, Blob: class {}, File: class {}, FileReader: class {},
    crypto: require('crypto').webcrypto, TextEncoder, btoa, atob, performance: { now: () => Date.now() },
    io: () => socket, Option: function (text, value) { const o = makeElRef('option'); o.text = text; o.value = value; return o; }, Date, Math, JSON, Promise, Array, Object, String, Number, Boolean, Set, Map, WeakMap, RegExp, Error, Symbol, Intl, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // scripts in volgorde: <script src="..."> uit de eigen map en inline <script>
  const scripts = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const m of scripts) {
    const src = /src="([^"]+)"/.exec(m[1] || '');
    let code, name;
    if (src) {
      if (/socket\.io|^https?:/.test(src[1])) continue;
      name = src[1].replace(/^\//, '');
      const p = path.join(root, name);
      if (!fs.existsSync(p)) { errors.push(`script ontbreekt: ${name}`); continue; }
      code = fs.readFileSync(p, 'utf8');
    } else { code = m[2]; name = `${file} (inline)`; }
    try { vm.runInContext(code, ctx, { filename: name }); } catch (e) { errors.push(`${name}: ${e.message}`); }
  }
  const fire = (ev, data) => (handlers[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { errors.push(`${ev}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); } });
  const done = () => { timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); };
  return { errors, fire, emitted, handlers, ctx, done };
}
module.exports = { loadPage };
