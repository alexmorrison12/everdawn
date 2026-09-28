// Check: from a fresh title, Jump to Raid lands in a built Lair (not an empty scene).
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5199/index.html';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message));
await p.goto(url, { waitUntil: 'load' });
await p.waitForFunction(() => window.__game && __game.mode === 'title', { timeout: 90000 });
console.log(await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Jump to Raid' && x.offsetParent); if (!b) return 'no button'; b.click(); return 'clicked'; }));
await new Promise(r => setTimeout(r, 1500));
console.log(await p.evaluate(() => [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent.trim()).slice(0, 12).join(' | ')));
if (await p.evaluate(() => __game.mode) === 'create') await p.evaluate(() => { const A = __game; A.ui.emit('create:submit', { ...A.ui.create.get(), name: 'Raidy', cls: 'warrior', race: 'orc', sex: 'male' }); });
await new Promise(r => setTimeout(r, 2000));
// pick through any class/role prompt by pressing the first primary button until we're in the raid
for (let i = 0; i < 6; i++) {
  const m = await p.evaluate(() => __game.mode); if (m === 'raid') break;
  await p.evaluate(() => { const b = [...document.querySelectorAll('.evd-popup button, [class*=popup] button, [class*=dialog] button')].find(x => x.offsetParent && !/cancel|close|back/i.test(x.textContent)); b?.click(); });
  await new Promise(r => setTimeout(r, 1500));
}
await new Promise(r => setTimeout(r, 5000));
console.log(JSON.stringify(await p.evaluate(() => { const A = __game, u = A.state?.units || A.units; let n = 0; A.scene?.traverse(o => { if (o.isMesh) n++; }); return { mode: A.mode, meshes: n, boss: !!A.raid?.boss, bossName: A.raid?.boss?.name, playerY: +A.player?.pos?.y?.toFixed?.(1) }; })));
await p.screenshot({ path: process.env.SHOT || '/tmp/jumpraid.png' });
console.log('errors', JSON.stringify(errs.slice(0, 5)));
await b.close(); process.exit(0);
