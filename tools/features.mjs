// Solo feature check: spellbook (P), quest log (L), merchants (buy / right-click sell / buyback / smith), area loot
// and Auto Loot, a duel with a SimPlayer, grey (tagged) mobs resetting, WoW movement (the camera turns with keyboard
// turns, jumps keep their momentum, walk toggle, no casting on the move), middle-click waypoints, the Social window
// and Log Out. usage: node tools/features.mjs [url] [--shots=dir]
import puppeteer from 'puppeteer-core';
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html';
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 1600, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 300)); });
page.on('pageerror', e => errs.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && __game.mode === 'title', { timeout: 90000 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const step = async (name, fn) => { const t = Date.now(); try { const r = await fn(); console.log(`✔ ${name} (${Date.now() - t}ms)`, r !== undefined ? JSON.stringify(r).slice(0, 420) : ''); return r; } catch (e) { console.log(`✘ ${name}: ${e.message.split('\n')[0]}`); errs.push(`[${name}] ${e.message}`); return null; } };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async n => { if (shots) await page.screenshot({ path: `${shots}/feat_${n}.png` }); };
const lines = re => ev(re => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => new RegExp(re).test(t)).slice(-3), re);

await step('enter the world as a level 5 mage', () => ev(async () => {
  const A = __game; A.startWorld({ name: 'Featura', cls: 'mage', race: 'human', sex: 'f', level: 5, created: Date.now() });
  await new Promise(r => setTimeout(r, 800)); return { mode: A.mode, lvl: A.game.player.level };
}));

await step('spellbook (P): abilities listed, click casts, drag places on the bar', async () => {
  await ev(() => { const A = __game, g = A.game, p = g.player; A.tp(70, 125); const w = g.spawnMob('wolf', p.pos.x + 10, p.pos.z, 3); w.brain.t = { ...w.brain.t, passive: true }; g.pc.setTarget(w); p.facing = Math.atan2(-10, 0); });
  await page.keyboard.press('p');
  await wait(300);
  return ev(() => {
    const A = __game, g = A.game, p = g.player, ui = A.ui;
    const rows = document.querySelectorAll('.evd-win-spellbook .sbrow').length, locked = document.querySelectorAll('.evd-win-spellbook .sbrow.locked').length;
    p.gcd = 0; ui.emit('spellbookCast', 'fireBlast');
    const cast = p.cdLeft('fireBlast') > 0;
    const before = g.pc.bar.slice(0, 10);
    ui.emit('barPlace', 9, 'fireBlast');
    ui.emit('barMove', 0, -1);
    return { open: ui.spellbook.isOpen, rows, locked, castFromBook: cast, before, after: g.pc.bar.slice(0, 10), saved: A.game.pc.custom };
  });
});

await step('a lit proc ignores its cooldown and costs nothing (Fire Blast + Heating Up, Pyroblast + Hot Streak)', () => ev(() => {
  const A = __game, g = A.game, p = g.player, cb = g.combat, w = p.target;
  p.level = 10; g.levelStats(p); p.power = p.powerMax; w.hpMax = w.hp = 1e7; // a sturdy dummy
  p.gcd = 0; p.cooldowns.set('fireBlast', 6);
  const blocked = cb.canCast(p, 'fireBlast', w).ok;
  p.addAura('heatingUp', p);
  const mana0 = p.power, lit = cb.canCast(p, 'fireBlast', w).ok, fb = cb.cast(p, 'fireBlast', w);
  const fbFree = p.power === mana0;
  p.removeAura('heatingUp'); p.addAura('hotStreak', p); p.gcd = 0;
  const mana1 = p.power, pyro = cb.cast(p, 'pyroblast', w);
  return { fireBlastOnCooldown: !blocked, litFireBlastCasts: lit && fb, fireBlastFree: fbFree, pyroInstant: pyro && !p.casting, pyroFree: p.power === mana1, hotStreakUsed: !p.hasAura('hotStreak') };
}));

await step('quest log (L): the quest shows; abandon removes it', async () => {
  await ev(() => { __game.ui.spellbook.close(); __game.game.acceptQuest('wolves'); });
  await page.keyboard.press('l');
  await wait(300);
  const shown = await ev(() => ({ open: __game.ui.questLog.isOpen, list: [...document.querySelectorAll('.evd-win-quests .qlq')].map(e => e.textContent), page: document.querySelector('.evd-win-quests .qlpage')?.textContent.slice(0, 80) }));
  await ev(() => document.querySelector('.evd-win-quests .qlfoot .evd-btn').click());
  await wait(200);
  await ev(() => [...document.querySelectorAll('.evd-popup button')].find(b => b.textContent === 'Abandon')?.click());
  await wait(300);
  return { ...shown, afterAbandon: await ev(() => __game.game.player.quests.map(q => q.id)), said: await lines('abandoned') };
});

await step('docked windows sit side by side (Character + Spellbook + Quest Log)', async () => {
  await page.keyboard.press('c'); await page.keyboard.press('p'); await wait(300);
  const r = await ev(() => ['character', 'spellbook', 'quests'].map(id => { const e = document.querySelector('.evd-win-' + id); const b = e.getBoundingClientRect(); return [id, Math.round(b.left), Math.round(b.right), !!e.offsetParent]; }));
  await shot('docked');
  await ev(() => { while (__game.ui.closeTop()) { /* */ } });
  return r;
});

await step('merchant: browse, buy, right-click to sell, buy back, sell junk, walk away', async () => {
  await ev(() => { const A = __game, g = A.game, p = g.player, n = g.npcs.pym; A.tp(n.pos.x + 1.5, n.pos.z + 2); p.gold = 5000; g.interact(n); });
  await wait(400);
  await ev(() => [...document.querySelectorAll('.evd-quest .qo')].find(o => /browse your goods/.test(o.textContent))?.click());
  await wait(400);
  await shot('merchant');
  return ev(async () => {
    const A = __game, g = A.game, p = g.player, ui = A.ui, out = { open: ui.merchant.isOpen, bags: ui.bags.isOpen, stock: [...document.querySelectorAll('.evd-win-merchant .mrow')].map(e => e.textContent.slice(0, 22)) };
    const pots = g.countItem('potionHealth'), gold0 = p.gold;
    ui.emit('merchantBuy', 0, 1);
    out.bought = { pots: g.countItem('potionHealth') - pots, paid: gold0 - p.gold };
    g.addItem('wolfPelt', 3); const i = p.bags.findIndex(b => b.id === 'wolfPelt'), gold1 = p.gold;
    ui.emit('useItem', i, null);
    out.sold = { pelts: g.countItem('wolfPelt'), got: p.gold - gold1, buyback: g.buybackList.length };
    ui.emit('merchantBuyback', 0);
    out.boughtBack = g.countItem('wolfPelt');
    const q = p.bags.findIndex(b => b.id === 'hearthstone'); ui.emit('useItem', q, null);
    out.hearthKept = g.countItem('hearthstone');
    g.addItem('junkFang', 4); ui.emit('merchantSellJunk'); out.junkLeft = g.countItem('junkFang');
    A.tp(p.pos.x + 40, p.pos.z); await new Promise(r => setTimeout(r, 400));
    out.closedWhenFar = !ui.merchant.isOpen;
    return out;
  });
});

await step('the blacksmith forges gear for your class', async () => {
  await ev(() => { const A = __game, g = A.game, n = g.npcs.smith; A.tp(n.pos.x + 1.5, n.pos.z + 2); g.player.gold = 200000; g.interact(n); });
  await wait(400);
  await ev(() => [...document.querySelectorAll('.evd-quest .qo')].find(o => /browse your goods/.test(o.textContent))?.click());
  await wait(400);
  return ev(() => { const A = __game, g = A.game, p = g.player, n0 = p.bags.length; const stock = A.hud.vendorStock.map(e => `${e.gear.slot}:${e.gear.cls}`); A.ui.emit('merchantBuy', 0, 1); const got = p.bags.slice(n0).map(b => b.gear?.name); A.ui.merchant.close(); return { stock, got, left: A.hud.vendorStock.length }; });
});

await step('area loot: one corpse opens every nearby corpse of yours', () => ev(async () => {
  const A = __game, g = A.game, p = g.player; A.tp(70, 125); await new Promise(r => setTimeout(r, 200));
  const ws = [0, 1, 2].map(i => g.spawnMob('wolf', p.pos.x + 3 + i * 1.5, p.pos.z + 3, 3));
  for (const w of ws) { g.combat.engage(p, w); g.combat.kill(w, p); w.loot = [{ id: 'wolfPelt', count: 1 }, { gold: 40 }]; w.lootable = true; }
  const pelts = g.countItem('wolfPelt');
  g.lootCorpse(ws[0], { auto: false }); await new Promise(r => setTimeout(r, 200));
  const win = { title: document.querySelector('.evd-loot .lt')?.textContent, rows: document.querySelectorAll('.evd-loot .li').length };
  for (let k = 0; k < 8; k++) { const r = document.querySelector('.evd-loot .li'); if (!r) break; r.click(); }
  return { win, gotPelts: g.countItem('wolfPelt') - pelts, allLooted: ws.every(w => !w.lootable), windowClosed: !A.ui.loot.isOpen };
}));

await step('Auto Loot (on by default): right-clicking a corpse takes it all, with the corpses around it', () => ev(async () => {
  const A = __game, g = A.game, p = g.player;
  const ws = [0, 1].map(i => g.spawnMob('wolf', p.pos.x - 3 - i * 1.5, p.pos.z - 2, 3));
  for (const w of ws) { g.combat.engage(p, w); g.combat.kill(w, p); w.loot = [{ id: 'wolfPelt', count: 1 }]; w.lootable = true; }
  const dx = ws[0].pos.x - p.pos.x, dz = ws[0].pos.z - p.pos.z; A.cam.yaw = Math.atan2(-dx, -dz); A.cam.pitch = 0.5; A.cam.distTarget = 6;
  await new Promise(r => setTimeout(r, 500));
  const v = ws[0].pos.clone(); v.y += 0.4; v.project(A.camera);
  const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight, pelts = g.countItem('wolfPelt');
  g.pc.click({ button: 2, x, y });
  return { setting: g.settings.autoLoot, gotPelts: g.countItem('wolfPelt') - pelts, windowOpened: A.ui.loot.isOpen, allLooted: ws.every(w => !w.lootable) };
}));

await step('a mob a SimPlayer tagged goes back to normal once it resets', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, s = g.social.sims.find(x => !x.dead);
  const w = g.spawnMob('wolf', p.pos.x + 20, p.pos.z + 20, 3); w.brain.t = { ...w.brain.t, passive: true };
  g.combat.engage(s, w); const tagged = w.tapper?.name || w.tapper?.id;
  A.hud.update(0); const grey = w.tapped;
  w.brain.evade(); w.pos.copy(w.home); await new Promise(r => setTimeout(r, 400)); A.hud.pushWorldSpace(0);
  return { taggedBy: tagged, greyForYou: grey, afterReset: { tapper: w.tapper, state: w.brain.state } };
}));

await step('duel a SimPlayer: countdown, fight, they yield at 1 health', () => ev(async () => {
  const A = __game, g = A.game, p = g.player; let s = null;
  for (const cand of g.social.sims.filter(x => !x.dead && !x.inCombat && !x.party).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos)).slice(0, 5)) {
    cand.persona.arch = 'tryhard'; cand.afk = false; A.tp(cand.pos.x + 6, cand.pos.z);
    g.duels.challenge(p, cand);
    for (let i = 0; i < 25 && !p.duel; i++) await new Promise(r => setTimeout(r, 200));
    if (p.duel) { s = cand; break; }
  }
  if (!s) throw new Error('no SimPlayer accepted');
  const flag = !!p.duel.flag.parent, early = p.isEnemy(s);
  for (let i = 0; i < 30 && !p.duel?.live; i++) await new Promise(r => setTimeout(r, 200));
  const live = { live: !!p.duel?.live, youVsThem: p.isEnemy(s), themVsYou: s.isEnemy(p), theyTargetYou: s.target === p };
  await new Promise(r => setTimeout(r, 1500));
  const fought = p.hp < p.hpMax || s.hp < s.hpMax;
  g.combat.damage(p, s, 999999, 'fire', { noMiss: true });
  await new Promise(r => setTimeout(r, 300));
  return { sim: s.name, flag, enemyBeforeCountdown: early, live, fought, after: { simDead: s.dead, simHp: Math.round(s.hp), duel: !!p.duel, enemyNow: p.isEnemy(s) }, flagGone: !p.duel };
}));
console.log('   chat:', JSON.stringify(await lines('in a duel|challenged')));

await step('keyboard turning carries the camera (and not while you hold it with the left button)', () => ev(() => {
  const A = __game, g = A.game, p = g.player, I = A.input, cam = A.cam; A.manual = true; A.tp(60, 118);
  cam.yaw = p.facing; const f0 = p.facing, y0 = cam.yaw;
  I.keys.add('KeyA'); for (let i = 0; i < 30; i++) A.frame(1 / 60); I.keys.delete('KeyA');
  const out = { charTurned: +(p.facing - f0).toFixed(2), camTurned: +(cam.yaw - y0).toFixed(2) };
  const f1 = p.facing, y1 = cam.yaw; I.buttons = 1;
  I.keys.add('KeyD'); for (let i = 0; i < 30; i++) A.frame(1 / 60); I.keys.delete('KeyD'); I.buttons = 0;
  out.holdingCamera = { char: +(p.facing - f1).toFixed(2), cam: +(cam.yaw - y1).toFixed(2) };
  A.manual = false; return out;
}));

await step('a jump keeps its momentum: no steering (or stopping) in the air', () => ev(() => {
  const A = __game, g = A.game, p = g.player, I = A.input; A.manual = true; A.tp(60, 118);
  for (let i = 0; i < 10; i++) A.frame(1 / 60);
  p.facing = 0; A.cam.yaw = 0;
  I.keys.add('KeyW'); for (let i = 0; i < 20; i++) A.frame(1 / 60);
  const z0 = p.pos.z, y0 = p.pos.y; I.pressed.add('Space'); A.frame(1 / 60);
  I.keys.delete('KeyW'); I.keys.add('KeyS'); // try to stop and back up mid-air
  let air = 0, top = 0; for (let i = 0; i < 120 && !p.grounded; i++) { A.frame(1 / 60); air++; top = Math.max(top, p.pos.y - y0); }
  I.keys.delete('KeyS'); A.manual = false;
  return { airTime: +(air / 60).toFixed(2), height: +top.toFixed(2), carriedForward: +(z0 - p.pos.z).toFixed(1) };
}));

await step('walk toggle (Num /) and no casting on the move', () => ev(() => {
  const A = __game, g = A.game, p = g.player, I = A.input; A.manual = true;
  I.pressed.add('NumpadDivide'); A.frame(1 / 60);
  const z0 = p.pos.z; I.keys.add('KeyW'); for (let i = 0; i < 60; i++) A.frame(1 / 60);
  const walked = +(z0 - p.pos.z).toFixed(2);
  I.pressed.add('NumpadDivide'); A.frame(1 / 60);
  const z1 = p.pos.z; for (let i = 0; i < 60; i++) A.frame(1 / 60);
  const ran = +(z1 - p.pos.z).toFixed(2);
  p.gcd = 0; const w = g.spawnMob('wolf', p.pos.x, p.pos.z - 15, 3); g.pc.setTarget(w);
  const castOnTheMove = g.pc.castSpell('fireball');
  I.keys.delete('KeyW'); A.frame(1 / 60); A.manual = false;
  return { walkedPerSec: walked, ranPerSec: ran, castOnTheMove, error: [...document.querySelectorAll('.evd-err, [class*=err]')].map(e => e.textContent).find(t => /moving/.test(t)) || null };
}));

await step('middle-click the ground: a waypoint (beam, minimap pin, world map pin); again to clear', async () => {
  await ev(() => { const A = __game; A.cam.pitch = 0.45; });
  await wait(400);
  const placed = await ev(() => {
    const A = __game, g = A.game, p = g.player;
    g.pc.click({ button: 1, x: innerWidth / 2, y: innerHeight * 0.72 });
    const w = A.waypoints.list.get(p);
    return { placed: !!w, dist: w ? Math.round(Math.hypot(w.x - p.pos.x, w.z - p.pos.z)) : null, minimap: A.waypoints.markers().filter(m => m.kind === 'wp').length };
  });
  await wait(300);
  await shot('waypoint');
  const beam = await ev(() => ({ beam: [...__game.waypoints.meshes.values()].some(m => m.parent && m.visible), label: document.querySelector('.evd-wpl')?.textContent }));
  await page.keyboard.press('m'); await wait(300);
  const map = await ev(() => document.querySelectorAll('.evd-win-map .mm.wp').length);
  await page.keyboard.press('m');
  await ev(() => { const A = __game, w = A.waypoints.list.get(A.game.player); A.waypoints.place(w.x + 2, w.z); });
  return { ...placed, ...beam, worldMapPins: map, cleared: await ev(() => !__game.waypoints.list.size) };
});

await step('Social window (O): nearby players; invite one', async () => {
  await ev(() => __game.tp(10, 150));
  await wait(300);
  await page.keyboard.press('o'); await wait(1300);
  const open = await ev(() => ({ open: __game.ui.social.isOpen, rows: document.querySelectorAll('.evd-win-social .socrow').length }));
  for (let k = 0; k < 4; k++) {
    await ev(k => { const b = [...document.querySelectorAll('.evd-win-social .socrow button')].filter(x => x.textContent === 'Invite' && !x.disabled)[k]; b?.click(); }, k);
    await wait(4200);
    if (await ev(() => !!__game.game.player.party)) break;
  }
  await wait(1200);
  await shot('social');
  const after = await ev(() => ({ party: __game.game.player.party?.all.map(m => m.name), leader: __game.game.player.party?.leader?.name, frames: document.querySelectorAll('.evd-party > *:not([style*="display: none"])').length }));
  await ev(() => [...document.querySelectorAll('.evd-win-social button')].find(b => b.textContent === 'Leave Party')?.click());
  await wait(300);
  return { ...open, ...after, leftParty: await ev(() => !__game.game.player.party) };
});

await step('Game Menu: Log Out goes to the title; Continue comes back with your bar layout', async () => {
  await ev(() => { const A = __game; while (A.ui.closeTop()) { /* */ } const p = A.game.player; p.inCombat = false; A.ui.settings.open(); });
  await wait(200);
  const buttons = await ev(() => [...document.querySelectorAll('.evd-win-settings .sgame button')].map(b => b.textContent));
  await ev(() => [...document.querySelectorAll('.evd-win-settings .sgame button')].find(b => b.textContent === 'Log Out').click());
  await wait(600);
  const out = await ev(() => ({ mode: __game.mode, player: !!__game.game.player }));
  await ev(() => __game.ui.emit('login:enter')); await wait(500);
  await ev(() => [...document.querySelectorAll('.evd-popup button')].find(b => b.textContent === 'Continue')?.click());
  await wait(1500);
  return { buttons, out, back: await ev(() => ({ mode: __game.mode, name: __game.game.player?.name, bar: __game.game.pc.bar.slice(0, 10) })) };
});

console.log(`\n${errs.length} error(s)`); for (const e of errs.slice(0, 12)) console.log(' ', e);
await Promise.race([browser.close(), wait(5000)]);
process.exit(errs.length ? 1 : 0);
