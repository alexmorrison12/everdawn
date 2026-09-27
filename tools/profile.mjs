// CPU profile of boot → title: prints the functions with the most self time.
// usage: node tools/profile.mjs [url] [--top=25]
import puppeteer from 'puppeteer-core';
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html';
const top = +((process.argv.find(a => a.startsWith('--top=')) || '--top=25').slice(6));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', { timeout: 90000 });
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
console.log(`total sampled ${(total / 1000).toFixed(0)} ms`);
for (const [k, v] of rows) console.log(`${(v / 1000).toFixed(0).padStart(6)} ms  ${k.slice(0, 110)}`);
await browser.close();
