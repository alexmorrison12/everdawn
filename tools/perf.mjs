// Frame-time probe: loads the world, then records real rAF frame intervals for a few seconds, optionally with CPU
// throttling to approximate a phone. usage: node tools/perf.mjs [url] [--cpu=4] [--w=844 --h=390]
import puppeteer from 'puppeteer-core';
const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html?cls=warrior';
const cpu = +arg('cpu', 1), W = +arg('w', 1600), H = +arg('h', 900);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: +arg('dpr', 1), isMobile: W < 1000, hasTouch: W < 1000 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && (window.__game.mode === 'world' || window.__game.mode === 'raid'), { timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));
const cdp = await page.createCDPSession();
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const r = await page.evaluate(() => new Promise(res => {
  const ts = []; let last = performance.now();
  const f = t => { ts.push(t - last); last = t; if (ts.length < 240) requestAnimationFrame(f); else res(ts); };
  requestAnimationFrame(f);
}));
const s = r.slice(10).sort((a, b) => a - b), q = p => s[Math.floor(s.length * p)].toFixed(1);
const st = await page.evaluate(() => ({ q: __game.renderer.quality, scale: +(__game.renderer.scale || 1).toFixed(2), ...(__game.stats?.() || {}) }));
console.log(JSON.stringify({ cpu, size: `${W}x${H}`, p50: q(0.5), p90: q(0.9), p99: q(0.99), fps: (1000 / s[Math.floor(s.length / 2)]).toFixed(0), ...st }));
await browser.close();
