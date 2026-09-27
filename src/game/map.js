// Painted world map (baked once from the height field) + per-frame minimap composition with markers.
import { M } from '../world/heightfield.js';
import { PLACES, WATER_Y } from '../world/zone.js';
import { Simplex } from '../core/noise.js';

export const MAP_PX = 1024; // one pixel ≈ 1 m over the 1024 m zone (world -512..512)

export function bakeWorldMap(hf, settle, forest) {
  const S = MAP_PX, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const nz = new Simplex(5);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const x = i - 512, z = j - 512, h = hf.heightAt(x, z), n = hf.normalAt(x, z);
    const shade = Math.max(0.45, Math.min(1.25, 0.78 + (-n[0] * 0.55 - n[2] * 0.45) * 1.1));
    let r = 118, g = 150, b = 78;
    const paper = nz.noise2(x / 20, z / 20) * 6 + nz.noise2(x / 5, z / 5) * 3;
    const forestM = hf.maskAt(x, z, M.FOREST), road = hf.maskAt(x, z, M.ROAD), farm = hf.maskAt(x, z, M.FARM), cob = hf.maskAt(x, z, M.COBBLE), ash = hf.maskAt(x, z, M.ASH), web = hf.maskAt(x, z, M.WEB), sand = hf.maskAt(x, z, M.SAND);
    const mix = (c, t) => { r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t; };
    mix([78, 112, 56], forestM * 0.8); mix([96, 90, 110], web * 0.6); mix([176, 150, 84], farm); mix([214, 196, 150], sand * 0.8);
    if (h > 22) mix([150, 138, 118], Math.min(1, (h - 22) / 70)); if (h > 150) mix([236, 236, 240], Math.min(1, (h - 150) / 30));
    mix([70, 52, 46], ash * 0.9);
    r *= shade; g *= shade; b *= shade;
    mix([196, 160, 104], road * 0.95); mix([170, 164, 150], cob);
    if (h < WATER_Y) { const deep = Math.min(1, -h / 5); r = 70 - deep * 30; g = 136 - deep * 40; b = 170 - deep * 20; if (h > -0.7) { r += 40; g += 40; b += 30; } }
    const k = (j * S + i) * 4;
    d[k] = Math.max(0, Math.min(255, r + paper)); d[k + 1] = Math.max(0, Math.min(255, g + paper)); d[k + 2] = Math.max(0, Math.min(255, b + paper * 0.7)); d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // tree stamps for a painted look
  if (forest?.instances) {
    for (const t of forest.instances) {
      if (t.sp === 'bush') continue;
      const x = t.x + 512, y = t.z + 512, rr = t.sp === 'pine' ? 2.2 : 3.2;
      ctx.fillStyle = 'rgba(30,50,24,0.35)'; ctx.beginPath(); ctx.arc(x + 1, y + 1.2, rr, 0, 7); ctx.fill();
      ctx.fillStyle = t.sp === 'pine' ? 'rgba(44,84,54,0.85)' : t.sp === 'dead' ? 'rgba(80,70,64,0.8)' : 'rgba(62,108,48,0.85)'; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(140,180,90,0.35)'; ctx.beginPath(); ctx.arc(x - rr * 0.3, y - rr * 0.35, rr * 0.45, 0, 7); ctx.fill();
    }
  }
  // buildings (box colliders) as little roofs
  if (settle) for (const c of settle.colliders) {
    if (c.type !== 'box' || c.hw < 1.4) continue;
    ctx.save(); ctx.translate(c.x + 512, c.z + 512); ctx.rotate(-c.rot);
    ctx.fillStyle = 'rgba(40,24,16,0.5)'; ctx.fillRect(-c.hw + 0.8, -c.hd + 0.8, c.hw * 2, c.hd * 2);
    ctx.fillStyle = '#8a4a36'; ctx.fillRect(-c.hw, -c.hd, c.hw * 2, c.hd * 2);
    ctx.fillStyle = '#b8684a'; ctx.fillRect(-c.hw, -c.hd, c.hw * 2, c.hd);
    ctx.restore();
  }
  // vignette/paper edge
  const grd = ctx.createRadialGradient(512, 512, 300, 512, 512, 740);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,40,20,0.35)');
  ctx.fillStyle = grd; ctx.fillRect(0, 0, S, S);
  return cv;
}

export const AREAS = [
  { name: 'Dawnhollow', ...PLACES.village, r: 70 },
  { name: 'Goldfield Farms', x: -160, z: 105, r: 80 },
  { name: 'Whisperwood', x: 150, z: 55, r: 100 },
  { name: 'Mirrormere Lake', x: -70, z: -40, r: 80 },
  { name: 'Candlerock Mine', x: -168, z: -95, r: 55 },
  { name: 'Webwood Hollow', x: 165, z: -135, r: 70 },
  { name: 'Redcloak Ruins', x: 172, z: 190, r: 55 },
  { name: 'The Ember Road', x: 45, z: -180, r: 60 },
  { name: 'Ember Peak', x: 0, z: -330, r: 90 },
];
export function areaAt(x, z) {
  let best = null, bd = Infinity;
  for (const a of AREAS) { const d = Math.hypot(x - a.x, z - a.z) / a.r; if (d < 1 && d < bd) { bd = d; best = a; } }
  return best ? best.name : 'Everdawn Vale';
}

/** Draws the minimap (rotating with the camera) into ctx of size px, radius in metres. */
export function drawMinimap(ctx, px, mapCv, center, yaw, markers, radius = 90) {
  const s = px / (radius * 2);
  ctx.save();
  ctx.clearRect(0, 0, px, px);
  ctx.beginPath(); ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); ctx.clip();
  ctx.translate(px / 2, px / 2);
  ctx.rotate(yaw);
  ctx.scale(s, s);
  ctx.drawImage(mapCv, -(center.x + 512), -(center.z + 512));
  ctx.restore();
  // markers (world → minimap)
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const m of markers) {
    let dx = (m.x - center.x) * s, dz = (m.z - center.z) * s;
    const rx = dx * c - dz * sn, rz = dx * sn + dz * c;
    let x = px / 2 + rx, y = px / 2 + rz;
    const dist = Math.hypot(rx, rz), lim = px / 2 - 7;
    if (dist > lim) { if (!m.edge) continue; x = px / 2 + rx / dist * lim; y = px / 2 + rz / dist * lim; }
    drawMarker(ctx, m.kind, x, y, m.color);
  }
}

export function drawMarker(ctx, kind, x, y, color) {
  ctx.save();
  if (kind === 'quest' || kind === 'turnin') {
    ctx.font = 'bold 15px "Roboto Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(kind === 'quest' ? '!' : '?', x, y); ctx.fillStyle = '#ffd200'; ctx.fillText(kind === 'quest' ? '!' : '?', x, y);
  } else if (kind === 'area') { // quest objective area
    ctx.fillStyle = 'rgba(255,210,0,0.18)'; ctx.strokeStyle = 'rgba(255,210,0,0.6)'; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.stroke();
  } else if (kind === 'party') { ctx.fillStyle = '#6cf'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.stroke(); }
  else if (kind === 'corpse') { ctx.fillStyle = '#ddd'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('☠', x, y + 4); }
  else if (kind === 'hostile') { ctx.fillStyle = color || '#f33'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }
  else if (kind === 'poi') { ctx.fillStyle = color || '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); ctx.stroke(); }
  else if (kind === 'portal') { ctx.fillStyle = '#ff7a20'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

/** Minimap for the raid instance: the arena disc, hoard, nests, hazards and raiders. */
export function drawLairMinimap(ctx, px, raid, center, yaw) {
  const radius = 55, s = px / (radius * 2);
  ctx.save(); ctx.clearRect(0, 0, px, px);
  ctx.beginPath(); ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1a0e0a'; ctx.fillRect(0, 0, px, px);
  ctx.translate(px / 2, px / 2); ctx.rotate(yaw); ctx.scale(s, s); ctx.translate(-center.x, -center.z);
  const lava = '#' + raid.lair.lavaCol.getHexString();
  ctx.fillStyle = lava; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(0, 0, 62, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#4a3a34'; ctx.beginPath(); ctx.arc(0, 0, 46, 0, 7); ctx.fill();
  ctx.fillStyle = '#d0a040'; ctx.beginPath(); ctx.ellipse(0, -37, 10, 8, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a5a50'; for (const n of raid.lair.spots.nests) { ctx.beginPath(); ctx.arc(n.x, n.z, 8, 0, 7); ctx.fill(); }
  for (const h of raid.hazards.list) {
    ctx.fillStyle = h.kind === 'pool' ? 'rgba(255,120,40,0.55)' : 'rgba(255,40,20,0.45)';
    if (h.kind === 'circle' || h.kind === 'pool') { ctx.beginPath(); ctx.arc(h.pos.x, h.pos.z, h.radius, 0, 7); ctx.fill(); }
    else if (h.kind === 'line') { ctx.save(); ctx.translate(h.pos.x, h.pos.z); ctx.rotate(-h.dir); ctx.fillRect(-h.width / 2, -h.length, h.width, h.length); ctx.restore(); }
    else if (h.kind === 'cone') { ctx.beginPath(); ctx.moveTo(h.pos.x, h.pos.z); const a = -h.dir - Math.PI / 2; ctx.arc(h.pos.x, h.pos.z, h.length, a - h.angle / 2, a + h.angle / 2); ctx.closePath(); ctx.fill(); }
  }
  ctx.restore();
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const dot = (x, z, col, r) => { const dx = (x - center.x) * s, dz = (z - center.z) * s; const X = px / 2 + dx * c - dz * sn, Y = px / 2 + dx * sn + dz * c; ctx.fillStyle = col; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.arc(X, Y, r, 0, 7); ctx.fill(); ctx.stroke(); };
  for (const m of raid.raiders) if (!m.dead && m !== raid.player) dot(m.pos.x, m.pos.z, '#6cf', 2.6);
  for (const w of raid.whelps) if (!w.dead) dot(w.pos.x, w.pos.z, '#f84', 2);
  if (!raid.boss.dead) dot(raid.boss.pos.x, raid.boss.pos.z, '#f22', 6);
}
