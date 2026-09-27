// End-to-end smoke test in headless Chrome: drives the whole game loop and reports console errors.
// usage: node tools/e2e.mjs [url] [--shots=dir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5199/index.html';
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,900', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errors = [], logs = [];
page.on('console', m => { const t = `[${m.type()}] ${m.text()}`; if (m.type() === 'error' && !/Failed to load resource/.test(t)) errors.push(t); if (m.type() === 'warn') logs.push(t); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', { timeout: 60000 });
const step = async (name, fn, arg) => {
  const t0 = Date.now();
  try { const r = await page.evaluate(fn, arg); console.log(`✔ ${name} (${Date.now() - t0}ms)`, r !== undefined ? JSON.stringify(r).slice(0, 300) : ''); return r; }
  catch (e) { console.log(`✘ ${name}: ${e.message.split('\n')[0]}`); errors.push(`[step ${name}] ${e.message}`); return null; }
};
const shot = async n => { if (shots) await page.screenshot({ path: `${shots}/e2e_${n}.png` }); };
await shot('title');
await step('create screen', async () => { const e = __game; e.ui.emit('login:enter'); await new Promise(r => setTimeout(r, 400)); return e.mode; });
await step('create character', async () => { const e = __game; e.ui.create.setName?.('Testina'); e.ui.emit('create:submit', { ...e.ui.create.get(), name: 'Testina', cls: 'mage', race: 'elf', sex: 'female' }); await new Promise(r => setTimeout(r, 400)); return { mode: e.mode, name: e.game.player?.name, cls: e.game.player?.cls }; });
await shot('world');
await step('accept quest via dialog', async () => { const e = __game, g = e.game, n = g.npcs.dunmore; e.tp(n.pos.x + 1.5, n.pos.z + 2); e.step(5); g.interact(n); e.step(5); const btn = [...document.querySelectorAll('button')].find(b => /accept/i.test(b.textContent) && b.offsetParent); btn?.click(); e.step(5); return g.player.quests.map(q => q.id); });
await step('kill + loot wolves', async () => {
  const e = __game, g = e.game, p = g.player; let kills = 0;
  for (const u of g.sim.units) { if (kills >= 6) break; if (u.template === 'wolf' && !u.dead && !u.tapper) { e.tp(u.pos.x + 2, u.pos.z + 2); g.combat.engage(p, u); g.combat.kill(u, p); e.step(2); if (u.lootable) { g.lootCorpse(u); e.step(2); document.querySelectorAll('.evd-loot .row, .evd-loot [data-i]').forEach(x => x.click()); g.lootAll(u); } kills++; } }
  e.step(10); return { kills, xp: p.xp, lvl: p.level, quest: p.quests.map(q => q.progress) };
});
await step('turn in with reward choice', async () => { const e = __game, g = e.game, n = g.npcs.dunmore; e.tp(n.pos.x + 1.5, n.pos.z + 2); e.step(5); g.interact(n); e.step(5); const ch = document.querySelector('.qr.pick'); ch?.click(); const btn = [...document.querySelectorAll('button')].find(b => /complete/i.test(b.textContent) && b.offsetParent); btn?.click(); e.step(10); return { done: [...g.player.questsDone], lvl: g.player.level, equip: Object.values(g.player.equip).filter(Boolean).map(i => i.name) }; });
await shot('turnin');
await step('level to 10 + abilities', async () => { const e = __game, g = e.game; g.giveXP(20000); e.step(10); return { lvl: g.player.level, bar: g.pc.bar.filter(Boolean) }; });
await step('cast every ability at a target', async () => { const e = __game, g = e.game, p = g.player; const w = g.spawnMob('wolf', p.pos.x + 12, p.pos.z, 9); w.brain.t = { ...w.brain.t, passive: true }; g.pc.setTarget(w); const res = {}; for (const id of g.pc.bar.filter(Boolean)) { if (id.startsWith('item:')) continue; p.gcd = 0; p.cooldowns.clear(); p.power = p.powerMax; p.casting = null; res[id] = g.combat.cast(p, id, w); e.step(160); } return res; });
await step('hearthstone', async () => { const e = __game, g = e.game, p = g.player; p.inCombat = false; for (const u of g.sim.units) if (u.hostile) u.threat.clear(); p.casting = null; p.cooldowns.clear(); g.pc.setTarget(null); e.tp(-100, 0); g.useItem('hearthstone'); e.step(360); return { x: Math.round(p.pos.x), z: Math.round(p.pos.z) }; });
await step('die, release, resurrect', async () => { const e = __game, g = e.game, p = g.player; g.combat.kill(p, null); e.step(30); g.releaseSpirit(); e.step(10); const ghost = p.ghost; p.pos.copy(p.corpsePos); e.step(60); g.resurrect(); e.step(10); return { ghost, alive: !p.dead && !p.ghost, hp: p.hp }; });
await step('social: dance + whisper + invite', async () => { const e = __game, g = e.game; g.social.playerChat('/dance'); g.social.playerChat('/who'); const s = g.social.sims[0]; g.social.playerChat(`/w ${s.name} are you a bot?`); g.social.playerChat(`/invite ${s.name}`); e.step(60 * 6); return { party: g.player.party?.members.length || 0 }; });
await step('enter raid via portal', async () => { const e = __game, g = e.game; e.tp(0, -272); e.step(90); const btn = [...document.querySelectorAll('button')].find(b => /enter/i.test(b.textContent) && b.offsetParent); if (btn) btn.click(); else e.enterRaid(); await new Promise(r => setTimeout(r, 400)); return e.mode; });
await shot('raid');
await step('raid fight (bot)', async () => { const e = __game; const r = await e.simRaid(900, 0.85); return r.log.slice(-3); });
await step('results screen', async () => { const e = __game; await new Promise(r => setTimeout(r, 9800)); return { screen: e.mode, results: !!document.querySelector('[class*=results]') }; });
await shot('results');
await step('share card', async () => { const e = __game; await e.shareCard(); const c = document.querySelector('canvas[width="1200"]'); return !!c; });
await shot('share');
await step('return to vale', async () => { const e = __game; document.querySelectorAll('div').forEach(d => { if (d.style.zIndex === '9999') d.remove(); }); e.leaveRaid(); e.manual = true; e.step(60); return { mode: e.mode, y: Math.round(e.game.player.pos.y) }; });
await shot('back');
console.log(`\n${errors.length} error(s)`);
for (const er of errors.slice(0, 20)) console.log(er);
if (logs.length) console.log(`${logs.length} warning(s); first: ${logs.slice(0, 5).join(' | ')}`);
await browser.close();
