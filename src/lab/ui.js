// UI lab: every component with fake live data.
//   ?screen=hud | raid | dialogs | panels | map | help | settings | death | login | create | results | loading | share | icons | art
import { UI, iconURL, renderShareCard } from '../ui/ui.js';
import { ICON_IDS, iconCanvas } from '../ui/icons.js';
import * as A from '../ui/art.js';

const q = new URLSearchParams(location.search);
const SCREEN = q.get('screen') || 'hud';
const R = Math.random;
const pick = a => a[Math.floor(R() * a.length)];
document.body.style.cssText = 'margin:0;background:#101318;overflow:hidden';

// ------------------------------------------------------------------ backdrop: a simple painted "world" gradient
const bg = document.createElement('canvas');
bg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
document.body.appendChild(bg);
function paintBG() {
  bg.width = innerWidth; bg.height = innerHeight;
  const x = bg.getContext('2d'), W = bg.width, H = bg.height;
  const sky = x.createLinearGradient(0, 0, 0, H);
  const raid = SCREEN === 'raid';
  if (raid) { sky.addColorStop(0, '#1a0806'); sky.addColorStop(0.5, '#4a1a0c'); sky.addColorStop(0.62, '#8a3a14'); sky.addColorStop(1, '#1a0a06'); }
  else { sky.addColorStop(0, '#5a86c0'); sky.addColorStop(0.45, '#a8c8e0'); sky.addColorStop(0.58, '#d8e0c8'); sky.addColorStop(0.6, '#7a9a4a'); sky.addColorStop(1, '#3a5a22'); }
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  const hills = (y, amp, col, seed) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, H); for (let px = 0; px <= W; px += 10) x.lineTo(px, y + Math.sin(px * 0.004 + seed) * amp + Math.sin(px * 0.011 + seed * 2) * amp * 0.4); x.lineTo(W, H); x.fill(); };
  if (raid) { hills(H * 0.55, 30, '#2a0c06', 1); hills(H * 0.64, 20, '#3a1208', 2); const g = x.createRadialGradient(W * 0.5, H * 0.72, 10, W * 0.5, H * 0.72, W * 0.5); g.addColorStop(0, 'rgba(255,120,30,.45)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  else { hills(H * 0.5, 26, '#7a8aa8', 1); hills(H * 0.56, 22, '#5a7a4a', 2); hills(H * 0.64, 18, '#4a6a30', 3); }
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)'); x.fillStyle = v; x.fillRect(0, 0, W, H);
}
paintBG(); addEventListener('resize', paintBG);

// ------------------------------------------------------------------ galleries (no UI instance)

function gallery() {
  document.body.style.overflow = 'auto'; bg.remove();
  document.body.style.cssText = 'margin:0;padding:10px;background:#2a2520;color:#ddd;font:11px sans-serif;overflow:auto';
  if (SCREEN === 'icons') {
    const sz = +(q.get('size') || 64), zoom = +(q.get('zoom') || 1);
    const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; document.body.appendChild(wrap);
    for (const id of ICON_IDS()) {
      const d = document.createElement('div'); d.style.cssText = `width:${Math.max(sz * zoom, 64) + 8}px;text-align:center`;
      const img = document.createElement('img'); img.src = iconURL(id, sz, q.get('rarity') || undefined); img.style.cssText = `width:${sz * zoom}px;height:${sz * zoom}px;display:block;margin:auto`;
      d.append(img, id); wrap.appendChild(d);
    }
  } else {
    const add = html => { const d = document.createElement('div'); d.innerHTML = html; d.style.cssText = 'display:inline-block;margin:8px;vertical-align:top'; document.body.appendChild(d); };
    for (const k of ['bronze', 'thin', 'heavy', 'silver']) { const f = A.frameBorder(k); add(`<div style="width:200px;height:120px;border:${f.width}px solid transparent;border-image:url(${f.url}) ${f.slice} / ${f.width}px stretch;background:url(${A.leatherTex()});background-clip:padding-box"></div>${k}`); }
    add(`<div style="width:256px;height:256px;background:url(${A.parchmentTex()})"></div>`);
    add(`<div style="width:256px;height:256px;background:url(${A.stoneTex()})"></div>`);
    for (const k of ['elite', 'rare', 'rareelite', 'boss']) { const o = A.eliteOrnament(k, 36); add(`<div style="position:relative;width:${o.w}px;height:${o.h}px;background:#223"><div style="position:absolute;left:${o.cx - 36}px;top:${o.cy - 36}px;width:72px;height:72px;border-radius:50%;background:#654"></div><img src="${A.portraitRing(72)}" style="position:absolute;left:${o.cx - 36}px;top:${o.cy - 36}px;width:72px"><img src="${o.url}" style="position:absolute;inset:0;width:${o.w}px"></div>${k}`); }
    add(`<img src="${A.endCap('left')}" style="width:132px"><img src="${A.endCap('right')}" style="width:132px">`);
    add(`<img src="${A.logoCrest()}" style="width:500px">`);
    add(['available', 'complete', 'incomplete', 'daily', 'low'].map(t => `<img src="${A.questMarkURL(t)}" style="width:22px;margin:4px">`).join('') + '<br>' + A.MARKERS.map(t => `<img src="${A.markerURL(t)}" style="width:32px;margin:2px">`).join(''));
    add(['crown', 'rested', 'combat', 'skull', 'mail', 'track', 'close', 'dice', 'gear', 'lock', 'arrowL', 'arrowR', 'plus', 'minus', 'ready', 'notready', 'waiting', 'need', 'greed', 'pass', 'shield', 'male', 'female', 'star'].map(t => `<img title="${t}" src="${A.glyphURL(t)}" style="width:24px;margin:2px">`).join(''));
  }
}

// ------------------------------------------------------------------ fake data
const ITEMS = {
  greymawFang: { id: 'greymawFang', name: "Greymaw's Fang", icon: 'dagger', rarity: 'rare', bind: 'pickup', slot: 'One-Hand', type: 'Dagger', damage: { min: 14, max: 27, speed: 1.6 }, stats: [{ stat: 'Agility', value: 4 }, { stat: 'Stamina', value: 3 }], durability: [55, 55], reqLevel: 7, flavor: 'Still smells of wolf.', sell: 1245 },
  cleaver: { id: 'cleaver', name: 'Drakefang Cleaver', icon: 'axe', rarity: 'epic', bind: 'pickup', unique: true, slot: 'Two-Hand', type: 'Axe', damage: { min: 71, max: 108, speed: 3.4 }, stats: [{ stat: 'Strength', value: 14 }, { stat: 'Stamina', value: 11 }], equip: ['Improves your chance to get a critical strike by 1%.'], chance: ['Sears the target for 45 to 60 Fire damage.'], durability: [100, 100], reqLevel: 10, itemLevel: 28, flavor: 'Forged in the Ember Maw. Returned with a strongly worded letter.', sell: 18830 },
  reins: { id: 'reins', name: 'Reins of the Ember Drake', icon: 'drakeReins', rarity: 'epic', bind: 'pickup', unique: true, type: 'Mount', use: ['Teaches you how to summon this mount. This is a very fast mount.'], reqLevel: 10, flavor: 'Approximately 1% of dragons agreed to this.', sell: 0 },
  staff: { id: 'staff', name: 'Staff of the Last Light', icon: 'staff', rarity: 'epic', bind: 'pickup', slot: 'Two-Hand', type: 'Staff', damage: { min: 58, max: 88, speed: 3.0 }, stats: [{ stat: 'Intellect', value: 16 }, { stat: 'Spirit', value: 9 }, { stat: 'Stamina', value: 8 }], equip: ['Increases damage and healing done by magical spells and effects by up to 18.'], reqLevel: 10, itemLevel: 28, sell: 17260 },
  robe: { id: 'robe', name: 'Robe of Dawnhollow', icon: 'robe', rarity: 'uncommon', bind: 'equip', slot: 'Chest', type: 'Cloth', armor: 42, stats: [{ stat: 'Intellect', value: 6 }, { stat: 'Spirit', value: 3 }], durability: [60, 60], reqLevel: 6, sell: 523 },
  helm: { id: 'helm', name: 'Redcloak Hood', icon: 'helm', rarity: 'uncommon', slot: 'Head', type: 'Mail', armor: 118, stats: [{ stat: 'Stamina', value: 5 }], sell: 410, bind: 'equip' },
  pelt: { id: 'pelt', name: 'Wolf Pelt', icon: 'wolfPelt', rarity: 'common', sell: 45, flavor: '' },
  fang: { id: 'fang', name: 'Chipped Fang', icon: 'junkFang', rarity: 'poor', sell: 12 },
  hide: { id: 'hide', name: 'Tattered Hide', icon: 'junkHide', rarity: 'poor', sell: 8 },
  haunch: { id: 'haunch', name: 'Boar Haunch', icon: 'boarHaunch', rarity: 'common', questItem: true, bind: 'Quest Item' },
  candle: { id: 'candle', name: 'Kobold Candle', icon: 'candle', rarity: 'common', questItem: true, flavor: 'You no take candle!' },
  silk: { id: 'silk', name: 'Webwood Silk', icon: 'spiderSilk', rarity: 'common', questItem: true },
  letter: { id: 'letter', name: 'Sealed Letter', icon: 'letter', rarity: 'common', questItem: true, flavor: 'Addressed to "Brandt, the one by the lake".' },
  potion: { id: 'potion', name: 'Minor Healing Potion', icon: 'potionHealth', rarity: 'common', use: ['Restores 70 to 90 health.'], sell: 5 },
  mpotion: { id: 'mpotion', name: 'Minor Mana Potion', icon: 'potionMana', rarity: 'common', use: ['Restores 140 to 180 mana.'], sell: 10 },
  bread: { id: 'bread', name: 'Freshly Baked Bread', icon: 'food', rarity: 'common', use: ['Restores 243 health over 21 sec. Must remain seated while eating.'], sell: 2 },
  water: { id: 'water', name: 'Refreshing Spring Water', icon: 'drink', rarity: 'common', use: ['Restores 151 mana over 18 sec. Must remain seated while drinking.'], sell: 1 },
  ring: { id: 'ring', name: 'Band of Mirrormere', icon: 'ring', rarity: 'rare', slot: 'Finger', stats: [{ stat: 'Intellect', value: 5 }, { stat: 'Spirit', value: 4 }], sell: 2000, bind: 'equip' },
  trinket: { id: 'trinket', name: 'Waxbeard\'s Lucky Charm', icon: 'trinket', rarity: 'rare', slot: 'Trinket', use: ['Increases spell damage by up to 29 for 15 sec. (2 Min Cooldown)'], sell: 1500, bind: 'pickup', unique: true },
  scale: { id: 'scale', name: 'Smoldering Dragon Scale', icon: 'dragonScale', rarity: 'epic', flavor: 'Warm to the touch. Still angry.', sell: 50000 },
  gem: { id: 'gem', name: 'Emberheart Ruby', icon: 'gem', rarity: 'rare', sell: 7500 },
  net: { id: 'net', name: 'Frayed Fishing Net', icon: 'fishingNet', rarity: 'poor', sell: 18 },
  sword: { id: 'sword', name: 'Vale Guard Longsword', icon: 'sword', rarity: 'uncommon', slot: 'One-Hand', type: 'Sword', damage: { min: 11, max: 21, speed: 2.1 }, stats: [{ stat: 'Strength', value: 3 }], sell: 880, bind: 'equip' },
  shield: { id: 'shield', name: 'Dawnguard Heater', icon: 'shield', rarity: 'rare', slot: 'Off Hand', type: 'Shield', armor: 402, stats: [{ stat: 'Stamina', value: 6 }], sell: 2200, bind: 'equip' },
  boots: { id: 'boots', name: 'Candlerock Boots', icon: 'boots', rarity: 'uncommon', slot: 'Feet', type: 'Leather', armor: 38, stats: [{ stat: 'Agility', value: 3 }], sell: 400, bind: 'equip' },
  gloves: { id: 'gloves', name: 'Webwood Handwraps', icon: 'gloves', rarity: 'uncommon', slot: 'Hands', type: 'Cloth', armor: 18, stats: [{ stat: 'Intellect', value: 3 }], sell: 300, bind: 'equip' },
  cloak: { id: 'cloak', name: 'Redcloak Mantle', icon: 'cloak', rarity: 'rare', slot: 'Back', type: 'Cloth', armor: 22, stats: [{ stat: 'Stamina', value: 4 }], sell: 900, bind: 'equip' },
  belt: { id: 'belt', name: 'Farmhand\'s Belt', icon: 'belt', rarity: 'common', slot: 'Waist', type: 'Leather', armor: 14, sell: 90 },
  legs: { id: 'legs', name: 'Lakeside Leggings', icon: 'legs', rarity: 'uncommon', slot: 'Legs', type: 'Cloth', armor: 30, stats: [{ stat: 'Intellect', value: 4 }], sell: 450, bind: 'equip' },
  shoulders: { id: 'shoulders', name: 'Pauldrons of the Vale', icon: 'shoulders', rarity: 'uncommon', slot: 'Shoulder', type: 'Plate', armor: 190, sell: 700, bind: 'equip' },
  hearth: { id: 'hearth', name: 'Homestone', icon: 'hearthstone', rarity: 'common', use: ['Returns you to Dawnhollow. Speak to an Innkeeper in a different place to change your home location.'], bind: 'pickup', unique: true },
};
const NAMES = [['Tankenstein', 'warrior', 'tank'], ['Ironmaw', 'warrior', 'tank'], ['Mendwell', 'priest', 'healer'], ['Bubbleheal', 'paladin', 'healer'], ['Healsforreal', 'priest', 'healer'],
  ['Pewpewlazor', 'mage', 'dps'], ['Stabbyjoe', 'rogue', 'dps'], ['Arrowdynamic', 'hunter', 'dps'], ['Critikal', 'rogue', 'dps'], ['Frostbyte', 'mage', 'dps'],
  ['Grumbolt', 'warrior', 'dps'], ['Dotsalot', 'priest', 'dps'], ['Sneakers', 'rogue', 'dps'], ['Hawkshot', 'hunter', 'dps'], ['Velarys', 'mage', 'dps'],
  ['Lightbringr', 'paladin', 'dps'], ['Thundergrip', 'warrior', 'dps'], ['Kaelthys', 'mage', 'dps'], ['Bearsy', 'hunter', 'dps'], ['Moonpetal', 'priest', 'healer']];
const PLAYER = { name: 'Aldric', cls: 'mage', level: 7, race: 'Human' };

function paintPortrait(cv, kind = 'human', seed = 1) {
  const x = cv.getContext('2d'), S = cv.width, s = S / 100;
  x.save(); x.scale(s, s);
  const r = (a, b) => a + ((Math.sin(seed * 12.9898 + a * 78.233) * 43758.5453) % 1 + 1) % 1 * (b - a);
  if (kind === 'wolf' || kind === 'boar') {
    const g = x.createRadialGradient(50, 35, 5, 50, 50, 70); g.addColorStop(0, '#6a7a5a'); g.addColorStop(1, '#1a2012'); x.fillStyle = g; x.fillRect(0, 0, 100, 100);
    const fur = kind === 'wolf' ? ['#c8c4bc', '#7a766e', '#3a3834'] : ['#b88a5a', '#7a4a24', '#2a1608'];
    x.fillStyle = fur[2]; x.beginPath(); x.moveTo(20, 30); x.lineTo(30, 4); x.lineTo(42, 26); x.lineTo(58, 26); x.lineTo(70, 4); x.lineTo(80, 30); x.lineTo(84, 70); x.lineTo(50, 100); x.lineTo(16, 70); x.closePath(); x.fill();
    const hg = x.createRadialGradient(44, 40, 4, 50, 55, 50); hg.addColorStop(0, fur[0]); hg.addColorStop(0.6, fur[1]); hg.addColorStop(1, fur[2]);
    x.fillStyle = hg; x.beginPath(); x.moveTo(24, 32); x.lineTo(32, 10); x.lineTo(43, 28); x.lineTo(57, 28); x.lineTo(68, 10); x.lineTo(76, 32); x.lineTo(78, 64); x.lineTo(50, 94); x.lineTo(22, 64); x.closePath(); x.fill();
    x.fillStyle = '#1a1a1a'; x.beginPath(); x.ellipse(50, 84, 9, 6, 0, 0, 7); x.fill();
    x.fillStyle = '#ffd040'; for (const ex of [38, 62]) { x.beginPath(); x.ellipse(ex, 50, 5, 3.2, ex < 50 ? 0.3 : -0.3, 0, 7); x.fill(); x.fillStyle = '#000'; x.fillRect(ex - 0.8, 47, 1.6, 6); x.fillStyle = '#ffd040'; }
  } else if (kind === 'dragon') {
    x.drawImage(iconCanvas('dragon', 128, { element: 'ember' }), -6, -6, 112, 112);
  } else {
    const skin = kind === 'orc' ? ['#8ac070', '#4a7a3a'] : kind === 'dwarf' ? ['#f0c0a0', '#b07a5a'] : ['#f4c8a8', '#b8866a'];
    const hair = pick(['#3a2210', '#e8c870', '#8a2a10', '#1a1a1a', '#c8c8c8']);
    const g = x.createLinearGradient(0, 0, 0, 100); g.addColorStop(0, `hsl(${r(0, 360)},30%,32%)`); g.addColorStop(1, '#0a0a10'); x.fillStyle = g; x.fillRect(0, 0, 100, 100);
    x.fillStyle = `hsl(${r(0, 360)},45%,30%)`; x.beginPath(); x.ellipse(50, 108, 46, 34, 0, 0, 7); x.fill();
    const fg = x.createRadialGradient(44, 44, 4, 50, 52, 30); fg.addColorStop(0, skin[0]); fg.addColorStop(1, skin[1]);
    x.fillStyle = fg; x.beginPath(); x.ellipse(50, 52, 21, 26, 0, 0, 7); x.fill();
    x.fillStyle = hair; x.beginPath(); x.ellipse(50, 34, 24, 16, 0, Math.PI, 0); x.fill(); x.fillRect(26, 33, 7, 24); x.fillRect(67, 33, 7, 24);
    x.fillStyle = '#1a1210'; x.beginPath(); x.ellipse(42, 52, 3, 2, 0, 0, 7); x.ellipse(58, 52, 3, 2, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(80,30,20,.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(44, 66); x.quadraticCurveTo(50, 69, 56, 66); x.stroke();
    if (kind === 'dwarf') { x.fillStyle = hair; x.beginPath(); x.moveTo(30, 60); x.quadraticCurveTo(50, 110, 70, 60); x.fill(); }
  }
  x.restore();
}
function paintMinimap(cv, t) {
  const x = cv.getContext('2d'), S = cv.width;
  x.fillStyle = '#4a6a2a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { const px = (i * 97.13) % S, py = (i * 57.77 + i * i * 0.13) % S; x.fillStyle = i % 3 ? 'rgba(90,130,50,.5)' : 'rgba(40,70,20,.5)'; x.fillRect(px, py, 6, 6); }
  x.fillStyle = 'rgba(70,120,190,.9)'; x.beginPath(); x.ellipse(60, 70, 50, 34, 0.4, 0, 7); x.fill();
  x.strokeStyle = '#b89a6a'; x.lineWidth = 7; x.beginPath(); x.moveTo(0, 170); x.bezierCurveTo(80, 150, 160, 190, 256, 120); x.stroke();
  x.strokeStyle = '#8a7048'; x.lineWidth = 1; x.stroke();
  x.fillStyle = '#2a3a1a'; for (let i = 0; i < 30; i++) { x.beginPath(); x.arc(170 + (i * 13) % 80, 20 + (i * 29) % 90, 7, 0, 7); x.fill(); }
  x.fillStyle = '#8a6a4a'; for (const [bx, by] of [[110, 190], [126, 200], [100, 206], [140, 186]]) x.fillRect(bx, by, 11, 9);
  for (const [px, py, c] of [[80, 120, '#ffd100'], [190, 150, '#ffd100']]) { x.fillStyle = c; x.font = 'bold 18px Georgia'; x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeText('!', px, py); x.fillText('!', px, py); }
  x.fillStyle = '#ff3a2a'; for (let i = 0; i < 4; i++) { const a = t * 0.3 + i * 1.7; x.beginPath(); x.arc(160 + Math.cos(a) * 30, 100 + Math.sin(a) * 20, 3.5, 0, 7); x.fill(); }
  x.fillStyle = '#6ac8ff'; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(118 + i * 12, 140 - i * 6, 3.5, 0, 7); x.fill(); }
}
function paintWorldMap(cv) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const blob = (cx, cy, rx, ry, col, n = 30) => { for (let i = 0; i < n; i++) { x.fillStyle = col; x.globalAlpha = 0.08; x.beginPath(); x.ellipse(cx + (R() - 0.5) * rx * 0.6, cy + (R() - 0.5) * ry * 0.6, rx * (0.5 + R() * 0.5), ry * (0.5 + R() * 0.5), R() * 3, 0, 7); x.fill(); } x.globalAlpha = 1; };
  // mountain ring
  x.lineWidth = 2; x.strokeStyle = 'rgba(90,60,30,.55)';
  for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2, rr = 0.46 + Math.sin(i * 1.7) * 0.02; const px = W / 2 + Math.cos(a) * W * rr, py = H / 2 + Math.sin(a) * H * (rr + 0.02); x.beginPath(); x.moveTo(px - 12, py + 8); x.lineTo(px, py - 12); x.lineTo(px + 12, py + 8); x.stroke(); }
  blob(W * 0.22, H * 0.55, 150, 110, '#c8b040');      // goldfield
  blob(W * 0.78, H * 0.45, 170, 140, '#2a5a1a', 40);  // whisperwood
  blob(W * 0.36, H * 0.42, 90, 70, '#3a7ac0', 40);    // mirrormere
  blob(W * 0.22, H * 0.22, 110, 80, '#6a5a4a');       // candlerock
  blob(W * 0.76, H * 0.2, 120, 80, '#4a4a3a');        // webwood
  blob(W * 0.74, H * 0.78, 120, 80, '#8a3a2a');       // redcloak
  blob(W * 0.5, H * 0.08, 90, 50, '#d04010', 40);     // ember peak
  // roads
  x.strokeStyle = 'rgba(120,80,40,.7)'; x.lineWidth = 4; x.setLineDash([10, 6]);
  x.beginPath(); x.moveTo(W * 0.5, H * 0.78); x.bezierCurveTo(W * 0.45, H * 0.5, W * 0.55, H * 0.3, W * 0.5, H * 0.1); x.stroke();
  x.beginPath(); x.moveTo(W * 0.5, H * 0.7); x.lineTo(W * 0.22, H * 0.55); x.moveTo(W * 0.5, H * 0.7); x.lineTo(W * 0.78, H * 0.5); x.stroke(); x.setLineDash([]);
  // village
  x.fillStyle = 'rgba(90,50,20,.8)'; for (let i = 0; i < 9; i++) x.fillRect(W * 0.47 + (i % 3) * 16, H * 0.74 + Math.floor(i / 3) * 14, 11, 9);
  // compass
  x.save(); x.translate(W * 0.92, H * 0.86); x.strokeStyle = 'rgba(90,50,20,.8)'; x.fillStyle = 'rgba(90,50,20,.8)'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, -44); x.lineTo(7, 0); x.lineTo(0, 44); x.lineTo(-7, 0); x.closePath(); x.fill(); x.font = 'bold 18px Georgia'; x.textAlign = 'center'; x.fillText('N', 0, -50); x.restore();
}

const CHAT = [
  ['general', 'Grumbolt', 'warrior', 'anyone know where Old Greymaw spawns? been circling whisperwood for 20 min'],
  ['general', 'Sneakers', 'rogue', 'he spawns when you stop looking for him'],
  ['trade', 'Hawkshot', 'hunter', 'WTS {0} 5g OBO, pst'],
  ['trade', 'Velarys', 'mage', 'WTB portal to anywhere that is not this inn'],
  ['lfg', 'Tankenstein', 'warrior', 'LF2M Candlerock Mine, need heals + dps, have candles'],
  ['say', 'Stabbyjoe', 'rogue', 'you no take candle!'],
  ['yell', 'Pewpewlazor', 'mage', 'TRAIN TO DAWNHOLLOW, RUN!!!'],
  ['guild', 'Mendwell', 'priest', 'grats on 7 Aldric :)'],
  ['party', 'Bubbleheal', 'paladin', 'oom, drinking'],
  ['party', 'Critikal', 'rogue', 'brb'],
  ['whisperIn', 'Dotsalot', 'priest', 'hey can u make me water? i can pay in exposure'],
  ['emote', 'Bearsy', 'hunter', 'dances on the mailbox.'],
  ['general', 'Kaelthys', 'mage', 'is it just me or has lastlight been really full lately'],
  ['general', 'Arrowdynamic', 'hunter', 'there are 2847 of us and none of us sleep'],
  ['trade', 'Frostbyte', 'mage', 'LF enchanter, will provide mats and emotional support'],
  ['general', 'Lightbringr', 'paladin', 'what time is the dragon tonight'],
  ['general', 'Thundergrip', 'warrior', 'dragon is always at 8. it is always 8.'],
  ['lfg', 'Ironmaw', 'warrior', 'LFM Ember Maw, 9/10 need 1 human. yes you. the real one.'],
  ['say', 'Moonpetal', 'priest', 'does anyone else hear music coming from the lake'],
  ['general', 'Healsforreal', 'priest', 'linking my new dagger for no reason: {0}'],
];
const LOOTMSG = [['{0} ', 'loot'], ['You receive loot: {0}.', 'loot'], ['Stabbyjoe receives loot: {0}.', 'loot'], ['You receive item: {0}x2.', 'loot']];

// ------------------------------------------------------------------ run the UI
function run() {
  const tInit = performance.now();
  const ui = window.ui = new UI({ getItem: id => ITEMS[id], actionKeys: true, player: { name: PLAYER.name, cls: 'mage', clsName: 'mage', race: 'human' } });
  window.__initMs = Math.round(performance.now() - tInit);
  const log = (...a) => console.log('[ui-event]', ...a);
  ui.on('chat', (ch, text, target) => { ui.chat.add({ ch: ch === 'whisperOut' ? 'whisperOut' : ch, from: ch === 'whisperOut' ? target : PLAYER.name, fromCls: ch === 'whisperOut' ? null : PLAYER.cls, text }); });
  ui.on('command', (c, a) => { if (c === 'roll') ui.chat.system(`${PLAYER.name} rolls ${1 + Math.floor(R() * 100)} (1-100)`); else if (c === 'dance') ui.chat.add({ ch: 'textEmote', text: `${PLAYER.name} bursts into dance.` }); else ui.chat.system(`Unknown command: /${c}`); });
  for (const ev of ['action', 'target', 'micro', 'panel', 'loot', 'roll', 'settings', 'login:enter', 'login:raid', 'create:submit', 'results:share', 'questAccept', 'playerClick', 'itemClick']) ui.on(ev, (...a) => log(ev, ...a));
  ui.on('results:share', () => showShare(ui));
  ui.on('settings', () => {});

  let last = performance.now();
  const sim = SIMS[SCREEN] ? SIMS[SCREEN](ui) : SIMS.hud(ui);
  // perf probe: ?perf=1 logs avg ms for (game→UI pushes + ui.update) and DOM mutation records per frame
  const perf = q.get('perf') ? { n: 0, ms: 0, upd: 0, mut: 0, obs: new MutationObserver(r => { perf.mut += r.length; }) } : null;
  if (perf) perf.obs.observe(ui.root, { subtree: true, childList: true, attributes: true, characterData: true });
  window.__perf = () => perf && { frames: perf.n, msPushAndUpdate: +(perf.ms / perf.n).toFixed(3), msUpdateOnly: +(perf.upd / perf.n).toFixed(3), mutationsPerFrame: +(perf.mut / perf.n).toFixed(1) };
  const loop = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    const t0 = performance.now();
    sim && sim(dt, ui.now);
    const t1 = performance.now();
    ui.update(dt);
    if (perf && ui.now > 3) { perf.n++; perf.ms += performance.now() - t0; perf.upd += performance.now() - t1; }
    else if (perf) perf.mut = 0;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- shared HUD sim pieces
function mageBar(ui, t, st) {
  const slots = [
    { icon: 'fireball', spell: { name: 'Fireball', rank: 4, cost: '95 Mana', range: '35 yd range', castTime: '3 sec cast', desc: 'Hurls a fiery ball that causes 92 to 118 Fire damage and an additional 12 Fire damage over 6 sec.' } },
    { icon: 'frostbolt', spell: { name: 'Frostbolt', rank: 3, cost: '65 Mana', range: '30 yd range', castTime: '2.5 sec cast', desc: 'Launches a bolt of frost at the enemy, causing 44 to 50 Frost damage and slowing movement speed by 40% for 7 sec.' } },
    { icon: 'fireBlast', cd: st.cd.fireBlast, spell: { name: 'Fire Blast', rank: 2, cost: '75 Mana', range: '20 yd range', castTime: 'Instant', cooldown: '8 sec cooldown', desc: 'Blasts the enemy for 57 to 71 Fire damage.' } },
    { icon: 'frostNova', cd: st.cd.frostNova, spell: { name: 'Frost Nova', cost: '55 Mana', castTime: 'Instant', cooldown: '25 sec cooldown', desc: 'Blasts enemies near the caster for 21 to 24 Frost damage and freezes them in place for up to 8 sec.' } },
    { icon: 'blink', cd: st.cd.blink, spell: { name: 'Blink', cost: '42 Mana', castTime: 'Instant', cooldown: '15 sec cooldown', desc: 'Teleports the caster 20 yards forward. Your raid leader will ask why you did that.' } },
    { icon: 'flamestrike', noResource: st.mana < 180, spell: { name: 'Flamestrike', cost: '195 Mana', range: '30 yd range', castTime: '3 sec cast', desc: 'Calls down a pillar of fire, burning all enemies within the area for 55 to 71 Fire damage.' } },
    { icon: 'pyroblast', proc: st.proc, spell: { name: 'Pyroblast', cost: '125 Mana', castTime: st.proc ? 'Instant (Hot Streak!)' : '6 sec cast', desc: 'Hurls an immense fiery boulder that causes 148 to 195 Fire damage.' } },
    { icon: 'arcaneMissiles', outOfRange: st.oor, spell: { name: 'Arcane Missiles', cost: '85 Mana', range: '30 yd range', castTime: 'Channeled', desc: 'Launches Arcane Missiles at the enemy, causing 26 Arcane damage each second for 3 sec.' } },
    { icon: 'iceBarrier', cd: st.cd.iceBarrier, active: st.barrier, spell: { name: 'Ice Barrier', cost: '160 Mana', castTime: 'Instant', cooldown: '30 sec cooldown', desc: 'Instantly shields you, absorbing 438 damage. Lasts 1 min.' } },
    { icon: 'potionMana', count: 3, spell: { name: 'Minor Mana Potion', desc: 'Restores 140 to 180 mana.' } },
    { icon: 'hearthstone', cd: st.cd.hearth, spell: { name: 'Homestone', castTime: '10 sec cast', cooldown: '1 hour cooldown', desc: 'Returns you to Dawnhollow.' } },
    { icon: 'drink', count: 12, spell: { name: 'Refreshing Spring Water', desc: 'Restores 151 mana over 18 sec.' } },
  ];
  for (let i = 0; i < 12; i++) ui.actionBar.setSlot(i, slots[i]);
}
function cdObj(end, dur, now) { const r = end - now; return r > 0 ? { remaining: r, duration: dur } : null; }

function chatSpam(ui, st, dt) {
  st.chatT -= dt;
  if (st.chatT <= 0) {
    st.chatT = 1.2 + R() * 2.4;
    const [ch, from, cls, text] = CHAT[st.chatI++ % CHAT.length];
    ui.chat.add({ ch, from, fromCls: cls, text, items: [ITEMS.greymawFang] });
    if (R() < 0.25) { const it = pick([ITEMS.pelt, ITEMS.fang, ITEMS.greymawFang, ITEMS.robe, ITEMS.silk]); ui.chat.add({ ch: 'loot', text: pick(['You receive loot: {0}.', 'Critikal receives loot: {0}.', 'Bearsy won: {0}']), items: [it] }); }
    if (R() < 0.3) ui.chat.add({ ch: 'combat', text: pick(['Your Fireball hits Timber Wolf for 104 Fire.', 'Timber Wolf hits you for 12.', 'Your Frostbolt crits Old Greymaw for 97 Frost.', 'You gain 120 experience.', 'Timber Wolf dies.']) });
  }
}

const SIMS = {
  // ================================================================ HUD (questing)
  hud(ui) {
    paintPortrait(ui.player.portrait, 'human', 3);
    paintPortrait(ui.target.portrait, 'wolf', 5);
    paintPortrait(ui.tot.portrait, 'human', 3);
    const party = [['Tankenstein', 'warrior', 'tank', 'dwarf'], ['Mendwell', 'priest', 'healer', 'human'], ['Stabbyjoe', 'rogue', 'dps', 'orc'], ['Arrowdynamic', 'hunter', 'dps', 'elf']];
    party.forEach((p, i) => paintPortrait(ui.party.portrait(i), p[3], i + 7));
    const st = { t: 0, hp: 1180, hpMax: 1340, mana: 2150, manaMax: 2600, thp: 1420, thpMax: 1860, cd: { fireBlast: 0, frostNova: 0, blink: 0, iceBarrier: 0, hearth: 0 }, proc: false, oor: false, barrier: true, casting: 0, castEnd: 0, chatT: 0, chatI: 0, xp: 2340, nextFx: 0, php: [1, 1, 1, 1], kill: 0 };
    st.cd.frostNova = 14; st.cd.hearth = 1300; st.cd.blink = 3.5;
    const cdDur = { fireBlast: 8, frostNova: 25, blink: 15, iceBarrier: 30, hearth: 3600 };
    ui.minimap.set({ zone: 'Everdawn Vale', subzone: 'Whisperwood', zoneType: 'contested', x: 62.4, y: 41.8, mail: true, time: '20:47', dayPhase: 0.3 });
    ui.tracker.set(quests(4, 6));
    for (let i = 0; i < 16; i++) chatSpam(ui, { chatT: 0, chatI: i }, 0);
    ui.chat.add({ ch: 'system', text: 'Welcome to Lastlight. Population: FULL (2,847). Humans online: 1.' });
    ui.alerts.zone('Whisperwood', 'Everdawn Vale', 'contested', '(Contested Territory)');
    let stateT = 0;
    return (dt, now) => {
      st.t += dt; stateT += dt;
      // regen / damage
      st.mana = Math.min(st.manaMax, st.mana + 14 * dt);
      st.hp = Math.max(200, Math.min(st.hpMax, st.hp + (Math.sin(st.t * 0.9) > 0.7 ? -60 : 8) * dt));
      // cast cycle: fireball every ~3.4s, plus pyroblast on proc
      if (!st.casting && now > st.castEnd + 0.3) {
        const pyro = st.proc && R() < 0.5;
        st.casting = pyro ? 'Pyroblast' : 'Fireball'; st.castDur = pyro ? 0.01 : 2.5; st.castEnd = now + st.castDur;
        if (!pyro) ui.castBar.start({ name: 'Fireball', icon: 'fireball', duration: 2.5 }); else { st.proc = false; }
        ui.actionBar.press(pyro ? 6 : 0);
      }
      if (st.casting && now >= st.castEnd) {
        const pyro = st.casting === 'Pyroblast';
        st.casting = 0; st.mana -= pyro ? 0 : 95;
        if (R() < 0.08) ui.castBar.interrupt(); else ui.castBar.succeed();
        ui.actionBar.gcd(1.5);
        const crit = R() < 0.3 || pyro;
        const dmg = Math.round((pyro ? 170 : 104) * (0.9 + R() * 0.2) * (crit ? 1.5 : 1));
        ui.fct.add({ anchor: 'greymaw', amount: dmg, type: 'spell', school: 'fire', crit });
        st.thp -= dmg;
        if (crit && R() < 0.6) { st.proc = true; }
        if (st.thp <= 0) { st.thp = st.thpMax; ui.fct.add({ anchor: 'player', text: '+120 XP', type: 'xp' }); st.xp += 120; if (st.kill++ % 2 === 0) ui.alerts.info('Timber Wolf slain: 5/6'); }
      }
      // periodic incidental events
      st.nextFx -= dt;
      if (st.nextFx <= 0) {
        st.nextFx = 0.35 + R() * 0.5;
        const r = R();
        if (r < 0.28) ui.fct.add({ anchor: 'player', amount: 8 + Math.floor(R() * 20), type: 'incoming', crit: R() < 0.15 });
        else if (r < 0.4) ui.fct.add({ anchor: 'player', amount: 60 + Math.floor(R() * 60), type: 'heal', crit: R() < 0.2 });
        else if (r < 0.55) ui.fct.add({ anchor: 'wolf2', amount: 20 + Math.floor(R() * 30), type: 'damage' });
        else if (r < 0.62) ui.fct.add({ anchor: 'greymaw', text: pick(['Miss', 'Dodge', 'Parry', 'Resist', 'Immune']), type: 'miss' });
        else if (r < 0.7) ui.fct.add({ anchor: 'greymaw', amount: 12, type: 'spell', school: 'frost' });
        if (R() < 0.04) ui.alerts.error(pick(['Not enough mana', 'Out of range.', 'You are facing the wrong way!', 'Spell is not ready yet.']));
      }
      // cooldowns cycle
      for (const k in st.cd) if (st.cd[k] <= now && k !== 'hearth' && R() < 0.004) st.cd[k] = now + cdDur[k];
      st.oor = Math.sin(st.t * 0.4) > 0.6;
      if (stateT > 9 && !st.proc) { st.proc = true; stateT = 0; }
      const cd = {}; for (const k in st.cd) cd[k] = cdObj(st.cd[k], cdDur[k], now);
      mageBar(ui, st.t, { cd, proc: st.proc, oor: st.oor, mana: st.mana, barrier: st.barrier });
      ui.xpBar.set({ xp: st.xp % 4500, xpMax: 4500, rested: 900, level: 7 });
      ui.player.set({ name: PLAYER.name, level: 7, hp: Math.round(st.hp), hpMax: st.hpMax, power: Math.round(st.mana), powerMax: st.manaMax, powerType: 'mana', combat: true, rested: false, leader: true });
      const cast = Math.sin(st.t * 0.5) > 0.3 ? { name: 'Howl of Terror', icon: 'battleShout', duration: 2, elapsed: (st.t % 2), interruptible: true } : null;
      ui.target.set({ id: 'greymaw', name: 'Old Greymaw', level: 8, playerLevel: 7, reaction: 'hostile', classification: 'rareelite', hp: Math.max(0, Math.round(st.thp)), hpMax: st.thpMax, creatureType: 'Beast',
        auras: [{ id: 'fr', icon: 'charge', name: 'Frenzy', desc: 'Attack speed increased by 30%.', remaining: 6 - (st.t % 6), duration: 6 }, { id: 'ign', icon: 'fireball', name: 'Fireball', desc: '12 Fire damage every 2 sec.', remaining: 6 - (st.t % 6), duration: 6, debuff: true, mine: true, type: 'magic' }, { id: 'chill', icon: 'frostbolt', name: 'Frostbolt', desc: 'Movement slowed by 40%.', remaining: 7 - (st.t * 1.3 % 7), duration: 7, debuff: true, mine: true, type: 'magic' }, { id: 'rend', icon: 'rend', name: 'Rend', desc: 'Bleeding for 9 damage every 3 sec.', remaining: 15 - (st.t % 15), duration: 15, debuff: true, stacks: 3 }],
        cast });
      ui.tot.set({ id: 'player', name: PLAYER.name, hp: st.hp, hpMax: st.hpMax, isPlayer: true, cls: 'mage' });
      ui.party.set(party.map(([name, cls, role], i) => {
        const hpMax = [1880, 1120, 1240, 1300][i], f = 0.55 + 0.45 * Math.abs(Math.sin(st.t * (0.3 + i * 0.17) + i));
        return { id: name, name, cls, role, level: 7 + (i % 2), hp: Math.round(hpMax * f), hpMax, power: cls === 'warrior' ? Math.round(40 + 40 * Math.sin(st.t + i)) : 800, powerMax: cls === 'warrior' ? 100 : 1100, powerType: cls === 'warrior' ? 'rage' : cls === 'rogue' ? 'energy' : 'mana', leader: false, debuff: i === 2 ? 'poison' : null, inRange: i !== 3, auras: i === 2 ? [{ id: 'p', icon: 'spiderSilk', name: 'Webwood Venom', debuff: true, type: 'poison', remaining: 12 - (st.t % 12), duration: 12 }] : [] };
      }));
      ui.auras.set([
        { id: 'ib', icon: 'iceBarrier', name: 'Ice Barrier', desc: 'Absorbs 438 damage.', remaining: 58 - (st.t % 58), duration: 60 },
        { id: 'renew', icon: 'renew', name: 'Renew', desc: 'Heals 45 damage every 3 sec.', remaining: 15 - (st.t % 15), duration: 15 },
        { id: 'bs', icon: 'battleShout', name: 'Battle Shout', desc: 'Attack power increased by 55.', remaining: 120 - (st.t % 120), duration: 120 },
        { id: 'fed', icon: 'food', name: 'Well Fed', desc: 'Stamina and Spirit increased by 6.', remaining: 840 - st.t, duration: 900 },
        { id: 'rest', icon: 'prayer', name: 'Blessing of the Last Light', desc: 'Experience gained increased by 10%. Lastlight thanks you for logging in.', remaining: 3540 - st.t, duration: 3600 },
      ], [{ id: 'pain', icon: 'wordOfPain', name: 'Word of Pain', desc: '14 Shadow damage every 3 sec.', type: 'magic', remaining: 18 - (st.t % 18), duration: 18 }]);
      const W = innerWidth, H = innerHeight;
      const units = [
        { id: 'greymaw', x: W * 0.52 + Math.sin(st.t * 0.7) * 20, y: H * 0.43, depth: 20, name: 'Old Greymaw', level: 8, playerLevel: 7, reaction: 'hostile', classification: 'rareelite', hp: st.thp, hpMax: st.thpMax, target: true, marker: 'skull', scale: 1.08, cast },
        { id: 'wolf2', x: W * 0.35, y: H * 0.5 + Math.sin(st.t) * 4, depth: 26, name: 'Timber Wolf', level: 6, playerLevel: 7, reaction: 'hostile', hp: 420 - (st.t * 20 % 300), hpMax: 520, marker: 'cross', dim: true, scale: 0.92 },
        { id: 'wolf3', x: W * 0.68, y: H * 0.52, depth: 34, name: 'Timber Wolf', level: 5, playerLevel: 7, reaction: 'hostile', hp: 520, hpMax: 520, dim: true, scale: 0.84 },
        { id: 'kobold', x: W * 0.78, y: H * 0.47, depth: 40, name: 'Kobold Candlemancer', level: 7, playerLevel: 7, reaction: 'hostile', hp: 380, hpMax: 480, dim: true, scale: 0.78, cast: { name: 'Wax Bolt', icon: 'candle', progress: (st.t * 0.4) % 1, interruptible: true } },
        { id: 'boar', x: W * 0.22, y: H * 0.56, depth: 30, name: 'Bristleback Boar', level: 3, playerLevel: 7, reaction: 'neutral', hp: 180, hpMax: 180, dim: true, scale: 0.86 },
        { id: 'npc', x: W * 0.42, y: H * 0.36, depth: 45, name: 'Warden Elspeth', guild: 'Whisperwood Warden', reaction: 'friendly', quest: 'complete', scale: 0.76, hp: 1, hpMax: 1 },
        { id: 'sim', x: W * 0.6, y: H * 0.36, depth: 50, name: 'Stabbyjoe', guild: 'Eternal Dawn', isPlayer: true, cls: 'rogue', reaction: 'friendly', scale: 0.72, hp: 1, hpMax: 1 },
        { id: 'npc2', x: W * 0.3, y: H * 0.38, depth: 55, name: 'Fisherman Brandt', reaction: 'friendly', quest: 'available', scale: 0.7, hp: 1, hpMax: 1 },
      ];
      ui.nameplates.update(units);
      for (const u of units) ui.fct.anchor(u.id, u.x, u.y - 96 * (u.scale || 1));
      ui.fct.anchor('player', W * 0.5, H * 0.62);
      if (Math.floor(st.t * 0.25) % 2 === 0) ui.meter.set({ damage: meterRows(party, st.t, 'damage'), healing: meterRows(party, st.t, 'healing'), duration: st.t + 34, segment: 'Old Greymaw' });
      if (st.t % 1 < dt) paintMinimap(ui.minimap.canvas, st.t);
      ui.minimap.set({ zone: 'Everdawn Vale', subzone: 'Whisperwood', zoneType: 'contested', x: 62.4 + Math.sin(st.t * 0.1), y: 41.8, mail: true, time: '20:47', facing: st.t * 0.3, dayPhase: 0.3 });
      ui.tracker.set(quests(Math.min(6, 4 + Math.floor(st.t / 7)), 6));
      chatSpam(ui, st, dt);
    };
  },

  // ================================================================ RAID
  raid(ui) {
    paintPortrait(ui.player.portrait, 'human', 3);
    paintPortrait(ui.target.portrait, 'dragon', 1);
    paintPortrait(ui.tot.portrait, 'dwarf', 9);
    const st = { t: 0, hp: 2400, hpMax: 2900, mana: 3100, manaMax: 4200, boss: 0.672, chatT: 0, chatI: 0, rw: 3, fx: 0 };
    const members = NAMES.map(([name, cls, role], i) => ({ id: name, name, cls, role, group: Math.floor(i / 5) + 1, base: R() * 6 }));
    members[5] = { id: 'you', name: PLAYER.name, cls: 'mage', role: 'dps', group: 2, base: 1, you: true };
    ui.bossTimers.start({ id: 'breath', name: 'Deep Breath', duration: 30, remaining: 7.5, icon: 'fireBlast', kind: 'important', countdown: 3 });
    ui.bossTimers.start({ id: 'tail', name: 'Tail Swipe', duration: 12, remaining: 9, icon: 'whirlwind', kind: 'target' });
    ui.bossTimers.start({ id: 'whelps', name: 'Whelp Wave (2)', duration: 45, remaining: 24, icon: 'dragonScale', kind: 'add' });
    ui.bossTimers.start({ id: 'pools', name: 'Ember Pools', duration: 20, remaining: 15, icon: 'flamestrike', kind: 'move' });
    ui.bossTimers.start({ id: 'enrage', name: 'Berserk', duration: 360, remaining: 214, icon: 'execute', kind: 'phase' });
    ui.minimap.set({ zone: 'The Ember Maw', zoneType: 'hostile', x: 50.2, y: 33.1, time: '20:14' });
    ui.alerts.zone('The Ember Maw', 'Ember Peak', 'hostile');
    for (let i = 0; i < 10; i++) ui.chat.add({ ch: pick(['raid', 'raid', 'raidLeader', 'party']), from: pick(NAMES)[0], fromCls: pick(NAMES)[1], text: pick(['healers watch tank', 'MOVE OUT OF FIRE', 'who pulled', 'dps check at 65%, dont stop', 'rez me pls', 'tank swap on 3 stacks', 'if we wipe im blaming the human', 'nice parse lol', 'omg whelps', 'hunters kill whelps!!']) });
    ui.chat.add({ ch: 'bossEmote', from: 'Ignareth the Ember Tyrant', text: 'takes a deep breath...' });
    ui.chat.add({ ch: 'npcYell', from: 'Ignareth the Ember Tyrant', text: 'Your kind has been dead for years. You simply have not noticed!' });
    return (dt, now) => {
      st.t += dt;
      st.boss = Math.max(0.05, st.boss - dt * 0.0012);
      st.mana = Math.min(st.manaMax, st.mana + 10 * dt);
      const raid = members.map((m, i) => {
        const f = m.you ? st.hp / st.hpMax : 0.35 + 0.65 * Math.abs(Math.sin(st.t * 0.25 + m.base));
        const hpMax = m.role === 'tank' ? 5200 : m.cls === 'priest' || m.cls === 'mage' ? 2600 : 3000;
        return {
          id: m.id, name: m.name, cls: m.cls, role: m.role, group: m.group, hp: Math.round(hpMax * f), hpMax,
          power: 1500 + Math.round(1200 * Math.sin(st.t * 0.2 + i)), powerMax: 3000, powerType: m.cls === 'warrior' ? 'rage' : m.cls === 'rogue' ? 'energy' : 'mana',
          dead: i === 12, ghost: i === 17, offline: i === 19, inRange: !(i === 8 || i === 14), selected: i === 0, aggro: i === 0,
          debuff: i === 3 ? 'magic' : i === 9 ? 'poison' : i === 15 ? 'curse' : i === 7 ? 'disease' : null,
          absorb: i === 0 || i === 6 ? 900 : 0, leader: i === 1, marker: i === 0 ? 'star' : i === 1 ? 'square' : null,
          auras: i === 3 ? [{ id: 'd', icon: 'wordOfPain', debuff: true, type: 'magic', remaining: 8, duration: 10 }] : i === 9 ? [{ id: 'd', icon: 'spiderSilk', debuff: true, type: 'poison', remaining: 8, duration: 10 }] : null,
        };
      });
      ui.raid.set(raid);
      ui.party.set([]);
      ui.player.set({ name: PLAYER.name, level: 10, hp: st.hp, hpMax: st.hpMax, power: Math.round(st.mana), powerMax: st.manaMax, powerType: 'mana', combat: true });
      const bossCast = { name: 'Incinerate', icon: 'pyroblast', duration: 3, elapsed: st.t % 4, interruptible: false };
      ui.target.set({ id: 'boss', name: 'Ignareth the Ember Tyrant', level: '??', reaction: 'hostile', classification: 'boss', hp: Math.round(st.boss * 2840000), hpMax: 2840000, powerMax: 0, creatureType: 'Dragonkin',
        auras: [{ id: 'a', icon: 'fireball', name: 'Ignite', debuff: true, mine: true, remaining: 4 - (st.t % 4), duration: 4, stacks: 5 }, { id: 'b', icon: 'rend', name: 'Sunder', debuff: true, stacks: 5, remaining: 25, duration: 30 }, { id: 'c', icon: 'wordOfPain', name: 'Word of Pain', debuff: true, remaining: 12, duration: 18 }, { id: 'e', icon: 'flamestrike', name: 'Ember Aura', remaining: null }],
        cast: (st.t % 4) < 3 ? bossCast : null });
      ui.tot.set({ id: 'Tankenstein', name: 'Tankenstein', hp: raid[0].hp, hpMax: raid[0].hpMax, isPlayer: true, cls: 'warrior' });
      mageBar(ui, st.t, { cd: {}, proc: Math.sin(st.t * 0.6) > 0.5, oor: false, mana: st.mana, barrier: false });
      ui.xpBar.set({ xp: 0, xpMax: 1, max: true });
      ui.auras.set([{ id: 'ai', icon: 'arcaneMissiles', name: 'Arcane Brilliance', remaining: 1700, duration: 1800 }, { id: 'fort', icon: 'aegis', name: 'Power Word: Fortitude', remaining: 1500, duration: 1800 }, { id: 'bs', icon: 'battleShout', name: 'Battle Shout', remaining: 88, duration: 120 }], [{ id: 'burn', icon: 'fireBlast', name: 'Searing Embers', type: 'magic', remaining: 5 - (st.t % 5), duration: 5, stacks: 2 }]);
      const dmg = raid.filter(m => !m.dead && m.role !== 'healer').map((m, i) => ({ name: m.name, cls: m.cls, total: Math.round((m.role === 'tank' ? 600 : 900 + (i * 97 % 400)) * (st.t + 190)), isPlayer: m.id === 'you' }));
      const heal = raid.filter(m => m.role === 'healer').map((m, i) => ({ name: m.name, cls: m.cls, total: Math.round((1100 + i * 170) * (st.t + 190)) }));
      ui.meter.set({ damage: dmg, healing: heal, duration: st.t + 190, segment: 'Ignareth' });
      const W = innerWidth, H = innerHeight;
      const units = [
        { id: 'boss', x: W * 0.5, y: H * 0.3, depth: 10, name: 'Ignareth the Ember Tyrant', level: '??', reaction: 'hostile', classification: 'boss', hp: st.boss, hpMax: 1, target: true, marker: 'skull', scale: 1.15, cast: (st.t % 4) < 3 ? { ...bossCast, progress: (st.t % 4) / 3 } : null },
        ...[0, 1, 2].map(i => ({ id: 'whelp' + i, x: W * (0.36 + i * 0.12) + Math.sin(st.t + i) * 30, y: H * 0.5 + Math.cos(st.t * 1.3 + i) * 10, depth: 20 + i, name: 'Ember Whelp', level: 9, playerLevel: 10, reaction: 'hostile', hp: 0.3 + 0.7 * Math.abs(Math.sin(st.t * 0.3 + i)), hpMax: 1, dim: true, scale: 0.85, marker: i === 1 ? 'cross' : i === 2 ? 'moon' : null })),
      ];
      ui.nameplates.update(units);
      for (const u of units) ui.fct.anchor(u.id, u.x, u.y - 40);
      st.fx -= dt;
      if (st.fx <= 0) { st.fx = 0.18 + R() * 0.3; ui.fct.add({ anchor: R() < 0.7 ? 'boss' : 'whelp' + Math.floor(R() * 3), amount: 200 + Math.floor(R() * 900), type: 'spell', school: pick(['fire', 'frost', 'arcane', 'physical', 'shadow', 'nature']), crit: R() < 0.25 }); }
      st.rw -= dt;
      if (st.rw <= 0) { st.rw = 9; ui.alerts.raidWarning(pick(['DEEP BREATH — MOVE TO THE SIDES!', 'WHELPS INCOMING — AOE THEM DOWN', 'TANK SWAP NOW', 'SPREAD OUT FOR EMBER POOLS'])); }
      for (const [id, name, dur, icon, kind, cd] of [['breath', 'Deep Breath', 30, 'fireBlast', 'important', 3], ['tail', 'Tail Swipe', 12, 'whirlwind', 'target', 0], ['pools', 'Ember Pools', 20, 'flamestrike', 'move', 0], ['whelps', 'Whelp Wave', 45, 'dragonScale', 'add', 0]]) if (!ui.bossTimers.bars.has(id)) ui.bossTimers.start({ id, name, duration: dur, icon, kind, countdown: cd });
      chatSpam(ui, st, dt);
      if (st.t % 1 < dt) { const x = ui.minimap.canvas.getContext('2d'); x.fillStyle = '#3a1408'; x.fillRect(0, 0, 256, 256); const g = x.createRadialGradient(128, 110, 10, 128, 128, 120); g.addColorStop(0, '#ff6a1a'); g.addColorStop(1, 'rgba(60,10,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); x.fillStyle = '#6ac8ff'; for (let i = 0; i < 19; i++) { x.beginPath(); x.arc(128 + Math.cos(i) * (40 + i * 2), 150 + Math.sin(i * 1.3) * 30, 3.2, 0, 7); x.fill(); } }
    };
  },

  // ================================================================ DIALOGS
  dialogs(ui) {
    const hud = SIMS.hud(ui);
    ui.questDialog.open({
      mode: 'offer', npc: { name: 'Warden Elspeth', portraitIcon: 'raceElf' }, title: 'Wolves at the Door',
      text: 'The Timber Wolves of Whisperwood have grown bold, $N. Three farmers lost sheep this week, and old Tobin lost his left boot — though he swears it was the wolves.\n\nThin their numbers before they reach Dawnhollow. Six should make the rest think twice.',
      objectivesText: 'Slay 6 Timber Wolves in Whisperwood, then return to Warden Elspeth.',
      rewards: { choice: [{ item: ITEMS.greymawFang }, { item: ITEMS.robe }, { item: ITEMS.boots }], items: [{ item: ITEMS.potion, count: 5 }], money: 3550, xp: 450 },
    });
    ui.popups.partyInvite('Stabbyjoe', a => ui.chat.system(a ? 'You have joined the group.' : 'You decline the invitation.'));
    ui.popups.readyCheck('Tankenstein', a => ui.chat.system(a ? 'You are Ready.' : 'You are Not Ready.'), 30);
    ui.loot.open({ title: 'Timber Wolf', icon: 'wolfPelt', x: 560, y: 360, entries: [{ money: 1734 }, { item: ITEMS.pelt, count: 2 }, { item: ITEMS.greymawFang }, { item: ITEMS.fang }, { item: ITEMS.haunch, quest: true }] });
    ui.rolls.add({ id: 1, item: ITEMS.cleaver, duration: 60 });
    ui.rolls.add({ id: 2, item: ITEMS.reins, duration: 60 });
    ui.rolls.choose(2, 'need');
    ui.rolls.result(2, { rolls: [{ name: 'Aldric', cls: 'mage', type: 'need', roll: 87 }, { name: 'Critikal', cls: 'rogue', type: 'need', roll: 42 }, { name: 'Stabbyjoe', cls: 'rogue', type: 'greed', roll: 99 }, { name: 'Mendwell', cls: 'priest', type: 'pass', roll: 0 }], winner: 'Aldric' }, 999);
    setTimeout(() => ui.alerts.levelUp(8, { abilities: [{ name: 'Frost Nova', icon: 'frostNova' }], stats: ['+2 Intellect', '+1 Spirit', '+18 Health', '+30 Mana'] }), 300);
    setTimeout(() => ui.alerts.achievement({ name: 'The Last Human', desc: 'Log in to Lastlight while 2,847 SimPlayers are online.', points: 10, icon: 'hearthstone' }), 600);
    let t = 0, shown = false;
    return (dt, now) => {
      hud(dt, now); t += dt;
      if (t > 0.5 && !shown) { shown = true; ui.tooltip.showAt(innerWidth * 0.62, innerHeight * 0.12, { type: 'item', item: ITEMS.cleaver, playerLevel: 7 }); }
    };
  },

  // ================================================================ PANELS
  panels(ui) {
    const hud = SIMS.hud(ui);
    ui.character.set({ name: 'Aldric', level: 7, race: 'Human', cls: 'mage', guild: 'Eternal Dawn', slots: { head: ITEMS.helm, shoulder: ITEMS.shoulders, back: ITEMS.cloak, chest: ITEMS.robe, hands: ITEMS.gloves, waist: ITEMS.belt, legs: ITEMS.legs, feet: ITEMS.boots, finger1: ITEMS.ring, trinket1: ITEMS.trinket, mainhand: ITEMS.staff },
      statGroups: [{ title: 'Attributes', stats: [{ label: 'Strength', value: 24 }, { label: 'Agility', value: 27 }, { label: 'Stamina', value: 41, color: '#1eff00' }, { label: 'Intellect', value: 88, color: '#1eff00', tip: 'Increases mana by 880 and spell crit by 1.6%.' }, { label: 'Spirit', value: 51 }, { label: 'Armor', value: 312 }] },
        { title: 'Spell', stats: [{ label: 'Spell Power', value: 38 }, { label: 'Crit Chance', value: '6.21%' }, { label: 'Hit Chance', value: '+2%' }, { label: 'Mana Regen', value: '31 / 5s' }, { label: 'Haste', value: '0%' }, { label: 'Parse (avg)', value: '87', color: '#a335ee' }] }] });
    paintPortrait(ui.character.modelCanvas, 'human', 3);
    const x = ui.character.modelCanvas.getContext('2d'); x.clearRect(0, 0, 512, 512); x.save(); x.translate(36, -40);
    const g = x.createLinearGradient(0, 100, 0, 560); g.addColorStop(0, 'rgba(120,60,160,.9)'); g.addColorStop(1, 'rgba(40,10,60,.9)');
    x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(220, 560, 110, 22, 0, 0, 7); x.fill();
    x.fillStyle = g; x.beginPath(); x.moveTo(150, 190); x.lineTo(290, 190); x.lineTo(330, 560); x.lineTo(110, 560); x.closePath(); x.fill();
    x.fillStyle = '#f0c8a8'; x.beginPath(); x.ellipse(220, 140, 42, 52, 0, 0, 7); x.fill();
    x.fillStyle = '#3a2210'; x.beginPath(); x.ellipse(220, 110, 46, 32, 0, Math.PI, 0); x.fill();
    x.restore(); x.fillStyle = 'rgba(255,255,255,.12)'; x.font = '600 18px sans-serif'; x.textAlign = 'center'; x.fillText('(game renders model here)', 256, 505);
    ui.character.open();
    ui.bags.set({ money: 1234567, slots: [{ item: ITEMS.potion, count: 5 }, { item: ITEMS.mpotion, count: 3 }, { item: ITEMS.bread, count: 12 }, { item: ITEMS.water, count: 20 }, { item: ITEMS.hearth }, { item: ITEMS.pelt, count: 7 }, { item: ITEMS.greymawFang }, { item: ITEMS.cleaver }, { item: ITEMS.scale }, { item: ITEMS.gem }, { item: ITEMS.letter }, { item: ITEMS.candle, count: 4 }, { item: ITEMS.fang, count: 3 }, { item: ITEMS.net }, null, null] });
    ui.bags.open();
    return hud;
  },
  map(ui) {
    const hud = SIMS.hud(ui);
    paintWorldMap(ui.worldMap.canvas);
    ui.worldMap.setLabels([
      { name: 'Dawnhollow', x: 0.5, y: 0.72, kind: 'town' }, { name: 'Goldfield Farms', x: 0.22, y: 0.55, levels: '1-3' }, { name: 'Whisperwood', x: 0.78, y: 0.45, levels: '2-5' },
      { name: 'Mirrormere Lake', x: 0.36, y: 0.42, levels: '3-6' }, { name: 'Candlerock Mine', x: 0.22, y: 0.22, levels: '4-7' }, { name: 'Webwood Hollow', x: 0.76, y: 0.2, levels: '5-8' },
      { name: 'Redcloak Ruins', x: 0.74, y: 0.8, levels: '6-9', kind: 'danger' }, { name: 'Ember Peak', x: 0.5, y: 0.1, levels: 'Raid', kind: 'danger' }, { name: 'Ember Road', x: 0.53, y: 0.3, kind: 'poi' },
    ]);
    ui.worldMap.setPlayer(0.66, 0.45, 0.8);
    ui.worldMap.setMarkers([{ x: 0.72, y: 0.4, type: 'complete', label: 'Wolves at the Door' }, { x: 0.33, y: 0.47, type: 'available', label: 'Mail Call' }, { x: 0.2, y: 0.25, type: 'incomplete', label: 'Not the Candle!' }, { x: 0.5, y: 0.06, type: 'boss', label: 'The Ember Maw' }, { x: 0.62, y: 0.47, type: 'party', cls: 'warrior' }, { x: 0.64, y: 0.5, type: 'party', cls: 'priest' }]);
    ui.worldMap.open();
    return hud;
  },
  help(ui) { const hud = SIMS.hud(ui); ui.help.open(); return hud; },
  settings(ui) { const hud = SIMS.hud(ui); ui.settings.open(); return hud; },
  death(ui) {
    const hud = SIMS.hud(ui);
    ui.death.show({ releaseDelay: 0 });
    ui.popups.resurrect('Mendwell', a => ui.chat.system(a ? 'Resurrected!' : 'Declined.'), 60);
    return (dt, now) => { hud(dt, now); ui.player.set({ name: PLAYER.name, level: 7, hp: 0, hpMax: 1340, power: 0, powerMax: 2600, powerType: 'mana', dead: true }); };
  },

  // ================================================================ SCREENS
  login(ui) {
    ui.screen('login');
    ui.login.set({ population: 2847, humans: 1, dragon: { name: 'Ignareth the Ember Tyrant', element: 'ember', affix: 'Molten Floor', affixDesc: 'The arena floor periodically erupts. Standing still is a choice.', worldFirst: null, resetIn: '3h 12m' }, leaderboard: LB });
    if (q.get('realms')) ui.login.openRealms();
    return null;
  },
  create(ui) { ui.screen('create'); ui.create.setName('Aldric'); return null; },
  results(ui) {
    ui.screen('results');
    ui.results.set({ victory: true, bossName: 'Ignareth the Ember Tyrant', dragon: { name: 'Ignareth the Ember Tyrant', element: 'ember', affix: 'Molten Floor' }, time: 272, dps: 1284, hps: 0, parse: +(q.get('parse') || 97), name: 'Aldric', cls: 'mage', rank: { pos: 12, of: 1840, board: 'Top Parse' }, deaths: 1, worldFirst: true, personalBest: true, loot: [ITEMS.staff, ITEMS.scale] });
    return null;
  },
  loading(ui) {
    ui.screen('loading');
    let p = 0;
    return dt => { p = (p + dt * 0.12) % 1.05; ui.loading.set({ zone: 'Everdawn Vale', progress: p, stage: p < 0.3 ? 'Painting terrain…' : p < 0.6 ? 'Waking 2,847 SimPlayers…' : p < 0.9 ? 'Teaching kobolds about candles…' : 'Entering world' }); };
  },
  share(ui) { ui.setHUDVisible(false); showShare(ui); return null; },
};
const LB = {
  worldFirst: [{ rank: 1, name: 'Nightlurker', cls: 'rogue', value: '00:14 UTC', parse: 96 }, { rank: 2, name: 'Pyrelight', cls: 'mage', value: '00:31 UTC', parse: 88 }, { rank: 3, name: 'Holdfast', cls: 'warrior', value: '01:02 UTC', parse: 71 }, { rank: 4, name: 'Aldric', cls: 'mage', value: '20:47 UTC', parse: 97, isYou: true }, { rank: 5, name: 'Solace', cls: 'priest', value: '21:15 UTC', parse: 45 }],
  fastestKill: [{ rank: 1, name: 'Holdfast', cls: 'warrior', value: '3:41', parse: 99 }, { rank: 2, name: 'Pyrelight', cls: 'mage', value: '3:58', parse: 100 }, { rank: 3, name: 'Nightlurker', cls: 'rogue', value: '4:05', parse: 93 }, { rank: 4, name: 'Aldric', cls: 'mage', value: '4:32', parse: 97, isYou: true }, { rank: 5, name: 'Mendwell', cls: 'priest', value: '4:49', parse: 62 }, { rank: 6, name: 'Brakka', cls: 'warrior', value: '5:10', parse: 30 }, { rank: 7, name: 'Solace', cls: 'priest', value: '5:31', parse: 12 }],
  topParse: [{ rank: 1, name: 'Pyrelight', cls: 'mage', value: '1,402 DPS', parse: 100 }, { rank: 2, name: 'Holdfast', cls: 'warrior', value: '1,377 DPS', parse: 99.4 }, { rank: 3, name: 'Aldric', cls: 'mage', value: '1,284 DPS', parse: 97, isYou: true }, { rank: 4, name: 'Nightlurker', cls: 'rogue', value: '1,190 DPS', parse: 91 }, { rank: 5, name: 'Solace', cls: 'priest', value: '988 HPS', parse: 78 }, { rank: 6, name: 'Brakka', cls: 'warrior', value: '901 DPS', parse: 55 }, { rank: 7, name: 'Tumble', cls: 'mage', value: '720 DPS', parse: 33 }, { rank: 8, name: 'Oakshield', cls: 'warrior', value: '512 DPS', parse: 14 }],
  speedrun: [{ rank: 1, name: 'Nightlurker', cls: 'rogue', value: '41:07', parse: 99 }, { rank: 2, name: 'Pyrelight', cls: 'mage', value: '44:30', parse: 95 }, { rank: 3, name: 'Holdfast', cls: 'warrior', value: '47:12', parse: 80 }],
};
function quests(have, need) {
  return [
    { id: 1, title: 'Wolves at the Door', level: 5, complete: have >= need, objectives: [{ text: 'Timber Wolf slain', have, need }] },
    { id: 2, title: 'Bacon Bits', level: 3, complete: true, objectives: [{ text: 'Boar Haunch', have: 6, need: 6 }] },
    { id: 6, title: 'Old Greymaw', level: 7, objectives: [{ text: 'Slay Old Greymaw', have: 0, need: 1 }] },
    { id: 5, title: 'Not the Candle!', level: 6, objectives: [{ text: 'Candlerock Kobold slain', have: 3, need: 8 }, { text: 'Kobold Candle', have: 1, need: 5 }] },
    { id: 3, title: 'Mail Call', level: 4, objectives: [{ text: 'Deliver the letter to Fisherman Brandt' }] },
  ];
}
function meterRows(party, t, mode) {
  const base = [['Aldric', 'mage', 1], ...party.map(p => [p[0], p[1], 0])];
  if (mode === 'healing') return [{ name: 'Mendwell', cls: 'priest', total: Math.round(310 * (t + 34)) }, { name: 'Aldric', cls: 'mage', total: Math.round(20 * (t + 34)), isPlayer: true }];
  return base.map(([name, cls, you], i) => ({ name, cls, total: Math.round([160, 95, 40, 140, 120][i] * (t + 34) * (1 + 0.1 * Math.sin(t * 0.3 + i))), isPlayer: !!you }));
}
function showShare(ui) {
  ui.fontsReady.then(() => {
    const c = renderShareCard({ name: 'Aldric', cls: 'mage', race: 'Human', level: 10, guild: 'Eternal Dawn', dragonName: 'Ignareth the Ember Tyrant', element: q.get('element') || 'ember', affix: 'Molten Floor', parse: +(q.get('parse') || 97), time: 272, dps: 1284, rank: { pos: 12, of: 1840 }, date: '2026-09-27', worldFirst: true, url: 'everdawn · lastlight' });
    c.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);max-width:94vw;max-height:94vh;box-shadow:0 20px 60px rgba(0,0,0,.8);z-index:100';
    c.addEventListener('click', () => c.remove());
    document.body.appendChild(c);
  });
}

// ------------------------------------------------------------------ go
if (SCREEN === 'icons' || SCREEN === 'art') gallery(); else run();
