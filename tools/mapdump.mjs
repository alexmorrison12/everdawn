// Renders a top-down debug map of the zone (hillshade + masks + 50 m grid) to a PNG via BMP + sips.
import { Heightfield, M } from '../src/world/heightfield.js';
import fs from 'fs'; import { execSync } from 'child_process';
const out = process.argv[2] || 'map.png';
const x0 = +(process.argv[3] ?? -300), z0 = +(process.argv[4] ?? -320), size = +(process.argv[5] ?? 620), px = +(process.argv[6] ?? 1240);
const hf = new Heightfield(7); await hf.build();
const W = px, H = px, buf = Buffer.alloc(54 + W * H * 3);
buf.write('BM'); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
buf.writeInt32LE(W, 18); buf.writeInt32LE(-H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(W * H * 3, 34);
const extra = JSON.parse(process.argv[7] || '[]'); // [[x,z,r,g,b], ...] markers
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = x0 + i / W * size, z = z0 + j / H * size;
  const h = hf.heightAt(x, z), n = hf.normalAt(x, z);
  const shade = Math.max(0.35, 0.55 + (-n[0] * 0.6 - n[2] * 0.5) * 0.9 + n[1] * 0.2);
  let r = 90, g = 150, b = 60;
  if (h < 0) { r = 40; g = 110; b = 170; }
  const road = hf.maskAt(x, z, M.ROAD), farm = hf.maskAt(x, z, M.FARM), cob = hf.maskAt(x, z, M.COBBLE), forest = hf.maskAt(x, z, M.FOREST);
  const mixc = (c, t) => { r += (c[0] - r) * t; g += (c[1] - g) * t; b += (c[2] - b) * t; };
  mixc([40, 90, 40], forest * 0.7); mixc([150, 110, 60], farm); mixc([170, 130, 90], road); mixc([150, 150, 150], cob);
  if (h > 25) mixc([140, 130, 120], Math.min(1, (h - 25) / 60));
  r *= shade; g *= shade; b *= shade;
  const gx = ((x % 50) + 50) % 50, gz = ((z % 50) + 50) % 50, step = size / W;
  if (gx < step || gz < step) { const major = (((x % 100) + 100) % 100 < step) || (((z % 100) + 100) % 100 < step); r = g = b = major ? 255 : 200; if (Math.abs(x) < step || Math.abs(z) < step) { r = 255; g = 60; b = 60; } }
  for (const [mx, mz, mr, mg, mb, rad = 3] of extra) if ((x - mx) ** 2 + (z - mz) ** 2 < rad * rad) { r = mr; g = mg; b = mb; }
  const k = 54 + (j * W + i) * 3; buf[k] = Math.max(0, Math.min(255, b)); buf[k + 1] = Math.max(0, Math.min(255, g)); buf[k + 2] = Math.max(0, Math.min(255, r));
}
fs.writeFileSync(out + '.bmp', buf);
execSync(`sips -s format png "${out}.bmp" --out "${out}" >/dev/null 2>&1`); fs.unlinkSync(out + '.bmp');
console.log('wrote', out, 'x0', x0, 'z0', z0, 'size', size);
