// Mobile smoke test: emulated phone (touch + coarse pointer). Portrait title, landscape world with the touch stick,
// camera drag, tap-to-talk, and the portrait rotate notice. usage: node tools/mobile.mjs [--shots=dir]
import puppeteer from 'puppeteer-core';
const SP = (process.argv.find(a => a.startsWith('--shots=')) || '--shots=.').slice(8);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:5199/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', { timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: `${SP}/m_title.png` });
// enter world as a quick-started character, rotate to landscape
await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => { const e = __game; e.ui.emit('login:enter'); });
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: `${SP}/m_create.png` });
await page.evaluate(() => { const e = __game; e.ui.emit('create:submit', { ...e.ui.create.get(), name: 'Thumbs', cls: 'warrior', race: 'dwarf', sex: 'male' }); });
await new Promise(r => setTimeout(r, 2500));
// touch the stick zone and push up for 1.5 s
const before = await page.evaluate(() => { const p = __game.game.player; const hit = document.elementFromPoint(120, 300); return [p.pos.x, p.pos.z, __game.cam.yaw, hit && (hit.className || hit.tagName), hit && getComputedStyle(hit).pointerEvents]; });
await page.evaluate(() => { window.__zlog = []; const z = document.querySelector('.evd-stick-zone'); for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel']) window.addEventListener(t, e => __zlog.push(t + ':' + (e.pointerType || '') + ':' + (e.target.className || e.target.tagName) + ':' + Math.round(e.clientX ?? e.touches?.[0]?.clientX ?? -1) + ',' + Math.round(e.clientY ?? e.touches?.[0]?.clientY ?? -1)), true); });
await page.touchscreen.touchStart(120, 300);
for (let i = 0; i < 10; i++) { await page.touchscreen.touchMove(120 + i * 1.5, 300 - i * 6); await new Promise(r => setTimeout(r, 16)); }
await new Promise(r => setTimeout(r, 1500));
const holding = await page.evaluate(() => ({ log: __zlog.slice(0, 12), stick: { ...__game.input.stick }, id: __game.touch.stickId, pos: [__game.game.player.pos.x, __game.game.player.pos.z] }));
await page.screenshot({ path: `${SP}/m_stick.png` });
await page.touchscreen.touchEnd();
const after = await page.evaluate(() => { const p = __game.game.player; return [p.pos.x, p.pos.z, __game.input.touch, document.body.className]; });
// one-finger camera drag on the right half
const yaw0 = await page.evaluate(() => __game.cam.yaw);
await page.touchscreen.touchStart(600, 200);
for (let i = 0; i < 10; i++) { await page.touchscreen.touchMove(600 - i * 12, 200); await new Promise(r => setTimeout(r, 16)); }
await page.touchscreen.touchEnd();
await new Promise(r => setTimeout(r, 300));
const yaw1 = await page.evaluate(() => __game.cam.yaw);
// tap the marshal to talk (walk there first)
const talk = await page.evaluate(async () => { const e = __game, g = e.game, n = g.npcs.dunmore; e.tp(n.pos.x + 1.5, n.pos.z + 3); await new Promise(r => setTimeout(r, 600)); const v = n.pos.clone(); v.y += n.height * 0.55; v.project(e.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; });
await page.touchscreen.tap(talk[0], talk[1]);
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: `${SP}/m_talk.png` });
const dialog = await page.evaluate(() => !![...document.querySelectorAll('button')].find(b => /accept/i.test(b.textContent) && b.offsetParent));
// portrait while playing → rotate notice
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: `${SP}/m_rotate.png` });
console.log(JSON.stringify({ before, holding, after, yaw0, yaw1, dialog, errs: errs.slice(0, 5) }));
await browser.close();
