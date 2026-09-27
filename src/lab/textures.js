import { terrainLayers } from '../engine/paint.js';
const t0 = performance.now();
const layers = terrainLayers(512);
console.log('paint ms', Math.round(performance.now() - t0));
const names = ['grass', 'dirt', 'rock', 'farm', 'cobble', 'forest', 'sand', 'ash'];
const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 800; document.body.appendChild(cv);
const ctx = cv.getContext('2d');
layers.forEach((l, i) => {
  const img = new ImageData(new Uint8ClampedArray(l.toRGBA()), 512, 512);
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 512; tmp.getContext('2d').putImageData(img, 0, 0);
  const x = (i % 4) * 400, y = Math.floor(i / 4) * 400;
  // draw 2x2 tiled at 200px to check seams
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ctx.drawImage(tmp, x + a * 200, y + b * 200, 200, 200);
  ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(names[i], x + 6, y + 18);
});
window.__done = true;
