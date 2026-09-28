// Zones check: walk the Kingsroad Pass from Everdawn Vale into the Crownlands, deliver Dunmore's orders to Captain
// Harlan in Aurelion, take a Crownlands quest and make progress, fly both ways by gryphon, hearth home from the capital,
// log out there and come back there, the zone's map, and frame times in the city. usage: node tools/zones.mjs [url] [--shots=dir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html';
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
page.on('pageerror', e => errs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && __game.mode === 'title', { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const step = async (name, fn) => { const t = Date.now(); try { const r = await fn(); console.log(`✔ ${name} (${Date.now() - t}ms)`, r !== undefined ? JSON.stringify(r).slice(0, 460) : ''); return r; } catch (e) { console.log(`✘ ${name}: ${e.message.split('\n')[0]}`); errs.push(`[${name}] ${e.message}`); return null; } };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async n => { if (shots) await page.screenshot({ path: `${shots}/zones_${n}.png` }); };
const until = (fn, ms = 20000) => page.waitForFunction(fn, { timeout: ms, polling: 200 });

await step('enter the Vale at level 6 and take Dunmore\'s orders for the capital', () => ev(async () => {
  const A = __game; A.startWorld({ name: 'Wanderra', cls: 'warrior', race: 'dwarf', sex: 'f', level: 6, created: Date.now() });
  await new Promise(r => setTimeout(r, 800));
  const g = A.game; g.acceptQuest('orders');
  return { zone: g.zoneId, quests: g.player.quests.map(q => q.id), orders: g.countItem('sealedOrders'), tal: !!g.npcs.flightDawn, harlanHere: !!g.npcs.captainHarlan };
}));

await step('walk east through the Kingsroad Pass: the Crownlands load', async () => {
  await ev(() => { const A = __game, p = A.game.player; A.tp(318, 64); p.facing = -Math.PI / 2; });
  await wait(300);
  await ev(() => { const A = __game; A.tp(333, 64); });
  await until(() => __game.game.zoneId === 'crown' && !__game.traveling && __game.ui.loading && !document.querySelector('.evd-loading:not([style*="display: none"])'), 30000).catch(() => {});
  await wait(1500);
  await shot('arrive');
  return ev(() => { const A = __game, g = A.game, p = g.player; return { zone: g.zoneId, at: [Math.round(p.pos.x), Math.round(p.pos.z)], npcs: Object.keys(g.npcs).length, sims: g.social.sims.length, mobs: g.sim.units.filter(u => u.kind === 'mob').length, nodes: A.prof.nodes.length, minimap: A.ui.minimap.zone?.textContent || document.querySelector('.evd-minimap .zn')?.textContent }; });
});

await step('deliver the orders to Captain Harlan; the Greymask quest opens up', () => ev(async () => {
  const A = __game, g = A.game, h = g.npcs.captainHarlan;
  A.tp(h.pos.x + 1.5, h.pos.z + 2); await new Promise(r => setTimeout(r, 300));
  g.interact(h); await new Promise(r => setTimeout(r, 300));
  const done = g.questComplete(g.player.quests.find(q => q.id === 'orders'));
  g.completeQuest('orders', null); A.ui.questDialog.close();
  await new Promise(r => setTimeout(r, 200));
  return { orderDone: done, completed: g.player.questsDone.has('orders'), ordersItemGone: g.countItem('sealedOrders') === 0, harlanMark: h.questMark };
}));

await step('a Crownlands quest: prowlers on the Kingsroad', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, m = g.npcs.widowMerrin;
  A.tp(m.pos.x + 1.5, m.pos.z + 2); await new Promise(r => setTimeout(r, 200));
  g.acceptQuest('prowlers');
  const wolves = g.sim.units.filter(u => u.template === 'prowler' && !u.dead).slice(0, 8);
  for (const w of wolves) { g.combat.engage(p, w); g.combat.kill(w, p); }
  await new Promise(r => setTimeout(r, 200));
  const a = p.quests.find(q => q.id === 'prowlers');
  return { prowlers: wolves.length, progress: a?.progress, complete: a && g.questComplete(a), xp: p.xp, level: p.level };
}));

await step('the city: the map, the people, frame times at the plaza', async () => {
  await ev(() => { const A = __game; A.tp(112, 16); A.game.player.facing = Math.PI; A.cam.yaw = Math.PI; A.cam.pitch = 0.25; });
  await wait(2500);
  const fps = await ev(async () => { const t = []; let last = performance.now(); for (let i = 0; i < 90; i++) { await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); t.push(n - last); last = n; } t.sort((a, b) => a - b); return { median: +t[45].toFixed(1), p90: +t[81].toFixed(1) }; });
  await shot('plaza');
  await page.keyboard.press('m'); await wait(500);
  const map = await ev(() => ({ title: document.querySelector('.evd-win-map .evd-title')?.textContent, labels: document.querySelectorAll('.evd-win-map .ml').length, area: __game.hud.lastArea }));
  await shot('map');
  await page.keyboard.press('m');
  return { frameMs: fps, map, simsInCity: await ev(() => __game.game.social.sims.filter(s => Math.hypot(s.pos.x - 120, s.pos.z) < 150).length) };
});

await step('fly to Dawnhollow with Gryphon Master Ingrid (50 copper), then back with Tal', async () => {
  await ev(() => { const A = __game, g = A.game, n = g.npcs.flightAurelion; g.player.gold = 500; A.tp(n.pos.x + 1.5, n.pos.z + 2); });
  await wait(300);
  await ev(() => { const g = __game.game; g.interact(g.npcs.flightAurelion); });
  await wait(300);
  await ev(() => [...document.querySelectorAll('.evd-quest .qo')].find(o => /Fly to/.test(o.textContent))?.click());
  await until(() => __game.game.zoneId === 'vale' && !__game.traveling, 30000);
  await wait(800);
  const inVale = await ev(() => ({ zone: __game.game.zoneId, gold: __game.game.player.gold, at: [Math.round(__game.game.player.pos.x), Math.round(__game.game.player.pos.z)], dunmore: !!__game.game.npcs.dunmore }));
  await ev(() => { const A = __game, g = A.game, n = g.npcs.flightDawn; A.tp(n.pos.x + 1.5, n.pos.z + 2); g.interact(n); });
  await wait(300);
  await ev(() => [...document.querySelectorAll('.evd-quest .qo')].find(o => /Fly to/.test(o.textContent))?.click());
  await until(() => __game.game.zoneId === 'crown' && !__game.traveling, 30000);
  await wait(800);
  return { inVale, backInCrown: await ev(() => ({ zone: __game.game.zoneId, gold: __game.game.player.gold, mobs: __game.game.sim.units.filter(u => u.kind === 'mob').length })) };
});

await step('hearthstone from the capital: home to Dawnhollow', async () => {
  await ev(() => { const g = __game.game, p = g.player; p.inCombat = false; p.cooldowns.delete('hearth'); p.casting = null; g.useItem('hearthstone'); });
  await until(() => __game.game.zoneId === 'vale' && !__game.traveling, 40000);
  await wait(500);
  return ev(() => ({ zone: __game.game.zoneId, at: [Math.round(__game.game.player.pos.x), Math.round(__game.game.player.pos.z)] }));
});

await step('log out in the Crownlands; Continue brings you back there', async () => {
  await ev(async () => { await __game.travelTo('crown'); });
  await wait(500);
  await ev(() => { const A = __game; A.game.player.inCombat = false; A.logout(); });
  await wait(800);
  const title = await ev(() => ({ mode: __game.mode, zone: __game.zoneId }));
  await ev(() => __game.ui.emit('login:enter')); await wait(500);
  await ev(() => [...document.querySelectorAll('.evd-popup button')].find(b => b.textContent === 'Continue')?.click());
  await until(() => __game.mode === 'world' && __game.game.zoneId === 'crown' && !__game.traveling, 40000).catch(() => {});
  await wait(800);
  return { title, back: await ev(() => ({ mode: __game.mode, zone: __game.game.zoneId, at: [Math.round(__game.game.player.pos.x), Math.round(__game.game.player.pos.z)] })) };
});

console.log(`\n${errs.length} error(s)`); for (const e of errs.slice(0, 12)) console.log(' ', e);
await Promise.race([browser.close(), wait(5000)]);
process.exit(errs.length ? 1 : 0);
