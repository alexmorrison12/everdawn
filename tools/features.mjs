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
  return ev(() => { const A = __game, g = A.game, p = g.player, n0 = p.bags.length; const stock = A.hud.vendorStock.map(e => e.gear ? `${e.gear.slot}:${e.gear.cls}` : e.id); A.ui.emit('merchantBuy', 0, 1); const got = p.bags.slice(n0).map(b => b.gear?.name); A.ui.merchant.close(); return { stock, got, left: A.hud.vendorStock.length }; });
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

await step('hold both mouse buttons to run; \\ toggles autorun', async () => {
  await ev(() => { const A = __game; while (A.ui.closeTop()) { /* */ } A.tp(60, 118); A.game.player.facing = 0; A.cam.yaw = 0; });
  await wait(300);
  const z0 = await ev(() => __game.game.player.pos.z);
  await page.mouse.move(800, 420); await page.mouse.down({ button: 'left' }); await page.mouse.down({ button: 'right' });
  await wait(900);
  const held = await ev(() => __game.input.buttons);
  await page.mouse.up({ button: 'right' }); await page.mouse.up({ button: 'left' });
  const z1 = await ev(() => __game.game.player.pos.z);
  await page.keyboard.press('Backslash'); await wait(700);
  const auto = await ev(() => ({ on: __game.game.pc.autorun, z: __game.game.player.pos.z }));
  await page.keyboard.press('Backslash'); await wait(100);
  return { buttons: held, ranWithBothButtons: +(z0 - z1).toFixed(1), autorun: auto.on, autorunMoved: +(z1 - auto.z).toFixed(1), off: await ev(() => !__game.game.pc.autorun) };
});

await step('character sheet shows estimated DPS; tooltips show what an item would change', async () => {
  await ev(() => { const g = __game.game, p = g.player; g.addGear(g.premadeGear(p.cls).weapon, false); g.addGear(g.premadeGear('warrior').chest, false); });
  await page.keyboard.press('c'); await page.keyboard.press('b'); await wait(500);
  return ev(() => {
    const A = __game, p = A.game.player, cells = A.ui.bags.cells.filter(c => c._item);
    const est = [...document.querySelectorAll('.evd-win-character .sg')].find(g => /Training Dummy/.test(g.textContent))?.textContent;
    const mine = cells.find(c => c._item.classes?.[0] === 'Mage' && c._item.slot), other = cells.find(c => c._item.classes?.[0] === 'Warrior');
    const tip = mine ? A.ui.itemExtra(mine._item) : null;
    return { sheet: est, upgrade: tip?.map(l => l.text), otherClass: other ? A.ui.itemExtra(other._item) : 'n/a' };
  });
});

await step('quest items you no longer need disappear', () => ev(() => {
  const g = __game.game; g.addItem('candle', 5); g.addItem('spiderSilk', 3); g.checkQuestObjectives();
  return { candles: g.countItem('candle'), silk: g.countItem('spiderSilk') };
}));

await step('drag an item out of your bags into the world to destroy it; drag within bags to move it', async () => {
  await ev(() => { const A = __game; A.game.addItem('wolfPelt', 2); A.hud.bagsDirty = true; A.ui.character.close(); if (!A.ui.bags.isOpen) A.ui.bags.open(); });
  await wait(400);
  const pos = await ev(() => { const A = __game, cells = A.ui.bags.cells, i = A.game.player.bags.findIndex(b => b.id === 'wolfPelt'); const r = cells[i].getBoundingClientRect(), e = cells[i + 2 < cells.length ? 15 : 0].getBoundingClientRect(); return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, ex: e.x + e.width / 2, ey: e.y + e.height / 2 }; });
  // move it to the last (empty) slot
  await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await page.mouse.move(pos.x + 20, pos.y + 5, { steps: 3 }); await page.mouse.move(pos.ex, pos.ey, { steps: 6 }); await page.mouse.up();
  await wait(300);
  const moved = await ev(() => __game.game.player.bags.findIndex(b => b.id === 'wolfPelt'));
  const p2 = await ev(i => { const r = __game.ui.bags.cells[i].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, moved);
  await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await page.mouse.move(p2.x - 30, p2.y, { steps: 3 }); await page.mouse.move(700, 450, { steps: 8 }); await page.mouse.up();
  await wait(300);
  const asked = await ev(() => [...document.querySelectorAll('.evd-popup')].map(e => e.textContent).find(t => /destroy/.test(t)));
  await ev(() => [...document.querySelectorAll('.evd-popup button')].find(b => b.textContent === 'Yes')?.click());
  await wait(200);
  return { from: pos.i, movedTo: moved, asked, pelts: await ev(() => __game.game.countItem('wolfPelt')) };
});

await step('professions: mining (needs a pick), herbalism, skill-ups; minimap tracking', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, pr = A.prof, sleep = ms => new Promise(r => setTimeout(r, ms));
  const counts = { copper: pr.nodes.filter(n => n.node === 'copper').length, tin: pr.nodes.filter(n => n.node === 'tin').length, emberite: pr.nodes.filter(n => n.node === 'emberite').length, herbs: pr.nodes.filter(n => n.prof === 'herbalism').length };
  const vein = pr.nodes.find(n => n.node === 'copper'); A.tp(vein.pos.x + 2, vein.pos.z + 1); await sleep(300);
  pr.interact(vein); await sleep(200);
  const noPick = [...document.querySelectorAll('.evd-err, [class*=err]')].map(e => e.textContent).find(t => /Mining Pick/.test(t)) || null;
  g.addItem('miningPick', 1); p.casting = null;
  pr.interact(vein); await sleep(3700);
  const ore = g.countItem('copperOre'), mining = pr.skill('mining');
  const herb = pr.nodes.find(n => n.node === 'peacebloom' || n.node === 'silverleaf'); A.tp(herb.pos.x + 1.5, herb.pos.z); await sleep(300); p.casting = null;
  pr.interact(herb); await sleep(2700);
  A.ui.emit('minimapTracking'); const track = A.hud.tracking;
  return { counts, noPick, ore, mining, herbs: g.countItem('peacebloom') + g.countItem('silverleaf'), herbalism: pr.skill('herbalism'), veinGone: !pr.nodes.includes(vein), tracking: track, tracked: pr.tracked(track).length };
}));

await step('fishing: buy a pole from Gil, cast at the lake, wait for the splash, reel it in', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, pr = A.prof, sleep = ms => new Promise(r => setTimeout(r, ms));
  const gil = g.npcs.gil; A.tp(gil.pos.x + 1, gil.pos.z + 1.5); p.gold += 1000; await sleep(300);
  const stock = g.stock('gil').map(e => e.id); g.buy('fishingPole', 1, 150);
  let cast = false;
  for (let k = 0; k < 16 && !cast; k++) { p.facing = k / 16 * Math.PI * 2; p.casting = null; cast = !!pr.fish(); }
  let bit = false; for (let i = 0; i < 90 && pr.bob; i++) { await sleep(200); if (pr.bob?.bit) { bit = true; break; } }
  const before = ['trout', 'sunfish', 'oldBoot', 'pearl'].reduce((n, id) => n + g.countItem(id), 0);
  pr.reel(); await sleep(200);
  const caught = ['trout', 'sunfish', 'oldBoot', 'pearl'].reduce((n, id) => n + g.countItem(id), 0) - before;
  return { gilSells: stock, cast, bit, caught, fishing: pr.skill('fishing'), bobberGone: !pr.bob, why: cast ? undefined : { inCombat: p.inCombat, swimming: p.swimming, pole: !!pr.tool('fishing'), at: [Math.round(p.pos.x), Math.round(p.pos.z)] } };
}));

await step('crafting: campfire + cooking, alchemy anywhere, blacksmithing at the forge', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, pr = A.prof, sleep = ms => new Promise(r => setTimeout(r, ms));
  A.tp(60, 118); await sleep(200); p.casting = null; p.inCombat = false;
  g.addItem('trout', 2);
  pr.campfire(); await sleep(2300);
  const fire = pr.fires.length;
  pr.craft('cookedTrout', 2); await sleep(4900);
  g.addItem('peacebloom', 1); g.addItem('silverleaf', 1); const pots = g.countItem('potionHealth');
  pr.craft('minorHealing', 1); await sleep(2300);
  const forge = A.world.settle.lights.forges[0]; A.tp(forge.x + 2, forge.z + 2); await sleep(300); p.casting = null;
  g.addItem('copperOre', 6); const n0 = p.bags.length;
  pr.craft('copperCirclet', 1); await sleep(3400);
  const made = [...p.bags.map(b => b.gear?.name), p.equip.head?.name].filter(n => n && /Copper/.test(n));
  return { fire, cooked: g.countItem('cookedTrout'), brewed: g.countItem('potionHealth') - pots, forged: made, skills: { ...p.skills } };
}));

await step('the Quartermaster sells for Ember Marks; mounts, a pet and fireworks work', () => ev(async () => {
  const A = __game, g = A.game, p = g.player, sleep = ms => new Promise(r => setTimeout(r, ms));
  const q = g.npcs.quartermaster; A.tp(q.pos.x + 1.5, q.pos.z + 2); p.marks = 80; await sleep(300);
  g.interact(q); await sleep(300);
  [...document.querySelectorAll('.evd-quest .qo')].find(o => /browse your goods/.test(o.textContent))?.click(); await sleep(300);
  const rows = [...document.querySelectorAll('.evd-win-merchant .mrow')].map(r => r.textContent.slice(0, 40));
  const stock = A.hud.vendorStock, gi = stock.findIndex(e => e.gear), si = stock.findIndex(e => e.id === 'striderReins'), pi = stock.findIndex(e => e.id === 'emberling'), fi = stock.findIndex(e => e.id === 'firework');
  A.ui.emit('merchantBuy', gi, 1); A.ui.emit('merchantBuy', si, 1); A.ui.emit('merchantBuy', pi, 1); A.ui.emit('merchantBuy', fi, 1);
  const bought = { marksLeft: p.marks, gear: p.bags.filter(b => b.gear?.name.startsWith('Maw-Tested')).length, reins: g.countItem('striderReins'), whistle: g.countItem('emberling'), fireworks: g.countItem('firework') };
  A.ui.merchant.close();
  g.useItem('firework'); g.useItem('emberling'); await sleep(300);
  const pet = !!A.companions.pet;
  A.tp(60, 118); await sleep(200); p.inCombat = false; p.casting = null;
  g.useItem('striderReins'); await sleep(1800);
  const mounted = p.mount;
  A.manual = true; p.facing = 0; A.cam.yaw = 0; const z0 = p.pos.z; A.input.keys.add('KeyW'); for (let i = 0; i < 60; i++) A.frame(1 / 60); A.input.keys.delete('KeyW'); A.frame(1 / 60); A.manual = false;
  const speed = +(z0 - p.pos.z).toFixed(1);
  const seat = +(p.model.root.position.y - p.pos.y).toFixed(2);
  await sleep(300);
  if (window.__shot) await window.__shot();
  g.useItem('striderReins'); await sleep(100);
  return { merchantRows: rows.slice(0, 3), bought, fireworksLeft: g.countItem('firework'), pet, mounted, runSpeed: speed, riderLifted: seat, dismounted: !p.mount };
}));

await step('the whole paper doll: new slots fill, click takes a piece off, rings pick a finger, off-hand vs staff, tabard on the model, Shoot', async () => {
  await ev(() => { const A = __game; if (!A.ui.character.isOpen) A.ui.toggle('character'); });
  const r = await ev(async () => {
    const A = __game, g = A.game, p = g.player, sleep = ms => new Promise(r => setTimeout(r, ms));
    const fresh = e => ({ ...e.gear, stats: { ...e.gear.stats }, uid: 900000 + Math.floor(Math.random() * 99999), _ui: undefined });
    const qm = g.stock('quartermaster').filter(e => e.gear && e.gear.cls);
    for (const e of qm) g.addGear(fresh(e)); // better than nothing: each goes on
    const ring = qm.find(e => e.gear.slot === 'finger'); g.addGear(fresh(ring)); // a second ring: the other finger
    await sleep(400);
    const doll = document.querySelectorAll('.evd-win-character .evd-slot').length;
    const worn = Object.entries(p.equip).filter(([, v]) => v).map(([k]) => k);
    // click the neck slot: it comes off into the bags
    const n0 = p.bags.length, neck = p.equip.neck?.name;
    document.querySelector('.evd-win-character .evd-slot[data-slot="neck"]').click();
    await sleep(300);
    const off = { neckGone: !p.equip.neck, inBags: p.bags.length === n0 + 1 && p.bags.at(-1).gear?.name === neck, dollEmpty: document.querySelector('.evd-win-character .evd-slot[data-slot="neck"]').classList.contains('ph') };
    // right-click it in the bags: back on
    A.ui.emit('useItem', p.bags.length - 1, null); await sleep(200);
    off.backOn = p.equip.neck?.name === neck;
    // a two-handed staff takes the off-hand with it; an off-hand pushes the staff off
    const book = p.equip.offhand || p.bags.find(b => b.gear?.slot === 'offhand')?.gear, weapon = p.equip.weapon;
    const staff = { ...weapon, uid: 990001, name: 'Test Staff', twoHand: true, _ui: undefined };
    if (!p.equip.offhand) g.equip(book); // (it stayed in the bags while a two-hander was on: this puts the two-hander away)
    p.bags.push({ gear: staff, count: 1 }); g.equip(staff); await sleep(300);
    const hands = { staffOn: p.equip.weapon === staff, offhandToBags: !p.equip.offhand && p.bags.some(b => b.gear === book), dimmed: document.querySelector('.evd-win-character .evd-slot[data-slot="offhand"]').classList.contains('dim') };
    g.equip(book); hands.bookOn = p.equip.offhand === book; hands.staffToBags = p.equip.weapon !== staff && p.bags.some(b => b.gear === staff);
    // a tabard and a shirt from Clothier Odette (anyone can wear them): the model wears the tabard
    p.gold += 50000;
    const odette = g.stock('clothierOdette'), tab = odette.find(e => e.gear.slot === 'tabard').gear, shirt = odette.find(e => e.gear.slot === 'shirt').gear;
    g.buyGear(tab, 1000); g.buyGear(shirt, 100); g.equip(tab); g.equip(shirt); await sleep(300);
    const looks = { tabard: p.equip.tabard?.name, shirt: p.equip.shirt?.name, modelTabard: /"tabard":\{"emblem":"lion"/.test(p.lookKey || ''), tabardIcon: document.querySelector('.evd-win-character .evd-slot[data-slot="tabard"] img')?.src.length > 1000 };
    // the wand: Shoot went on the bar and fires it
    const w = g.spawnMob('wolf', p.pos.x + 12, p.pos.z, 3); w.brain.t = { ...w.brain.t, passive: true }; g.pc.setTarget(w); p.gcd = 0; p.casting = null;
    const hp0 = w.hp, shot = g.combat.cast(p, 'shoot', w); await sleep(1200);
    const shoot = { onBar: g.pc.bar.includes('shoot'), wand: p.equip.ranged?.name, cast: shot, hurt: w.hp < hp0 };
    g.combat.kill(w, p);
    return { doll, worn: worn.join(','), rings: [p.equip.finger1?.name, p.equip.finger2?.name].map(n => n?.slice(11, 30)), off, hands, looks, shoot };
  });
  await shot('paperdoll');
  await ev(() => __game.ui.toggle('character'));
  return r;
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
