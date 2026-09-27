// Shared UI helpers: DOM creation, diffed setters (touch the DOM only when a value changes),
// formatting, and the colour tables every component agrees on.

// ---------------------------------------------------------------- DOM
/** h('div', 'cls a b', parent?, text?) → element */
export function h(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
/** Parse a small HTML string into a single element (for static templates only). */
export function tpl(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
/** querySelector shortcut that also indexes [data-r] refs: refs(root) → { name: el } */
export function refs(root) {
  const o = {};
  root.querySelectorAll('[data-r]').forEach(e => { o[e.dataset.r] = e; });
  return o;
}

// Diffed setters. State is cached on the element itself (expando), so repeated per-frame calls
// with unchanged values are a couple of property compares and never touch layout or style.
export function setText(el, v) {
  v = v == null ? '' : '' + v;
  if (el._t !== v) { el._t = v; el.textContent = v; }
}
export function setHTML(el, v) {
  if (el._h !== v) { el._h = v; el.innerHTML = v; }
}
export function setCls(el, cls, on) {
  on = !!on;
  const k = '_c_' + cls;
  if (el[k] !== on) { el[k] = on; el.classList.toggle(cls, on); }
}
/** Swap one class out of a group (e.g. reaction-hostile/neutral/friendly). */
export function setVariant(el, prefix, v) {
  if (el._v === v) return;
  if (el._v != null) el.classList.remove(prefix + el._v);
  el._v = v;
  if (v != null && v !== '') el.classList.add(prefix + v);
}
export function show(el, on) {
  on = !!on;
  if (el._s !== on) { el._s = on; el.style.display = on ? '' : 'none'; }
}
export function setStyle(el, prop, v) {
  const k = '_st_' + prop;
  if (el[k] !== v) { el[k] = v; el.style.setProperty(prop, v); }
}
/** Horizontal bar fill via compositor-only transform. frac is clamped and quantised to 1/1000. */
export function setFill(el, frac) {
  frac = frac > 1 ? 1 : frac > 0 ? Math.round(frac * 1000) / 1000 : 0;
  if (el._f !== frac) { el._f = frac; el.style.transform = `scaleX(${frac})`; }
}
export function setSrc(img, url) {
  if (img._src !== url) { img._src = url; if (img.tagName === 'IMG') img.src = url || ''; else img.style.backgroundImage = url ? `url("${url}")` : 'none'; }
}
export function setAttr(el, name, v) {
  const k = '_a_' + name;
  if (el[k] !== v) { el[k] = v; if (v == null) el.removeAttribute(name); else el.setAttribute(name, v); }
}
/** Restart a CSS animation class (forces a style flush on that one element only). */
export function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // intentional: restart keyframes
  el.classList.add(cls);
}

// ---------------------------------------------------------------- numbers & time
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
/** 950 → "950", 12345 → "12.3K", 1234567 → "1.23M" */
export function fmtShort(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a < 1000) return '' + n;
  if (a < 10000) return (n / 1000).toFixed(2).replace(/\.?0+$/, '') + 'K';
  if (a < 1e6) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
}
/** Seconds → "1:05", "12:34", "1:02:03" */
export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
  return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}
/** Aura/cooldown remaining time → short label ("2h", "5m", "43", "2.4") */
export function fmtCD(sec) {
  if (sec >= 3600) return Math.ceil(sec / 3600) + 'h';
  if (sec >= 60) return Math.ceil(sec / 60) + 'm';
  if (sec >= 3) return '' + Math.ceil(sec);
  return sec.toFixed(1);
}
/** Aura remaining time for the buff bar ("5 m", "43 s", "1 h") */
export function fmtAura(sec) {
  if (sec >= 3600) return Math.ceil(sec / 3600) + ' h';
  if (sec >= 60) return Math.ceil(sec / 60) + ' m';
  return Math.ceil(sec) + ' s';
}
/** copper → {g, s, c} */
export function splitMoney(copper) {
  copper = Math.max(0, Math.floor(copper));
  return { g: Math.floor(copper / 10000), s: Math.floor(copper / 100) % 100, c: copper % 100 };
}

// ---------------------------------------------------------------- colours
export const RARITY = {
  poor: '#9d9d9d', common: '#ffffff', uncommon: '#1eff00', rare: '#0070dd', epic: '#a335ee', legendary: '#ff8000',
  artifact: '#e6cc80', heirloom: '#00ccff',
};
export const RARITY_ORDER = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
export function rarityColor(r) { return RARITY[typeof r === 'number' ? RARITY_ORDER[r] : r] || RARITY.common; }
export function rarityName(r) { return typeof r === 'number' ? RARITY_ORDER[r] || 'common' : (r || 'common'); }

export const CLASS_COLORS = {
  warrior: '#c69b6d', mage: '#3fc7eb', priest: '#ffffff', rogue: '#fff468', hunter: '#aad372',
  paladin: '#f48cba', druid: '#ff7c0a', shaman: '#0070dd', warlock: '#8788ee',
};
export const CLASS_NAMES = {
  warrior: 'Warrior', mage: 'Mage', priest: 'Priest', rogue: 'Rogue', hunter: 'Hunter',
  paladin: 'Paladin', druid: 'Druid', shaman: 'Shaman', warlock: 'Warlock',
};
export function classColor(cls) { return CLASS_COLORS[cls] || '#ffd100'; }

export const REACTION = {
  hostile: { text: '#ff3a2a', band: '#b0120c' },
  neutral: { text: '#ffe23a', band: '#b08a0a' },
  friendly: { text: '#3dff4a', band: '#16861b' },
  player: { text: '#6fb3ff', band: '#1650a8' },
  tapped: { text: '#a8a8a8', band: '#6a6a6a' }, // someone else's kill: no credit for you
};

export const POWER_COLORS = { mana: '#1f63e8', rage: '#d51c1c', energy: '#f2d21b', focus: '#e0852c' };

export const SCHOOL_COLORS = {
  physical: '#ffffff', holy: '#ffe680', fire: '#ff8a1c', nature: '#5dff4d', frost: '#8fd6ff',
  shadow: '#b784ff', arcane: '#ff8cff',
};

export const DISPEL_COLORS = { magic: '#3399ff', curse: '#9933ff', disease: '#996600', poison: '#009900', none: '#cc0000', bleed: '#cc0000' };

/** Warcraft-Logs style parse colours */
export function parseColor(p) {
  if (p >= 100) return '#e5cc80';
  if (p >= 99) return '#e268a8';
  if (p >= 95) return '#ff8000';
  if (p >= 75) return '#a335ee';
  if (p >= 50) return '#0070ff';
  if (p >= 25) return '#1eff00';
  return '#9d9d9d';
}

/** Level-difficulty ("con") colour of a unit relative to the player. */
export function conColor(level, playerLevel) {
  if (level == null || playerLevel == null || level === '??' || level < 0) return '#ff1a1a';
  const d = level - playerLevel;
  if (d >= 5) return '#ff1a1a';
  if (d >= 3) return '#ff8040';
  if (d >= -2) return '#ffff00';
  const grey = playerLevel <= 5 ? 0 : playerLevel - 5 - Math.floor(playerLevel / 10);
  if (level <= grey) return '#9d9d9d';
  return '#40c040';
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex, a) { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = v => clamp(Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f), 0, 255);
  return '#' + [m(r), m(g), m(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join('');
}

export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Tiny seeded RNG (mulberry32) for procedural art.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
