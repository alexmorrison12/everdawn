// Co-op check: two separate headless browsers, one hosts and one joins by room code (real WebRTC via the public
// PeerJS service). Verifies the guest sees the host's world, both see each other, and the guest's casts resolve on
// the host with kill credit. usage: node tools/coop.mjs [url] [--shots=dir] [--raid]
import puppeteer from 'puppeteer-core';
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html';
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const RAID = process.argv.includes('--raid');
const launch = () => puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 900000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const [bh, bg] = await Promise.all([launch(), launch()]);
const errs = [];
const open = async (b, tag, u) => {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('pageerror', e => errs.push(`${tag} pageerror: ${e.message}`));
  p.on('dialog', d => { console.log(`  (${tag}: "${d.type()}" dialog accepted)`); d.accept(); }); // the Leave-site warning
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`${tag}: ${m.text().slice(0, 300)}`); });
  await p.goto(u, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__game && window.__game.mode === 'title', { timeout: 90000 });
  await p.evaluate(() => localStorage.clear());
  return p;
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const step = async (name, fn) => { const t = Date.now(); try { const r = await fn(); console.log(`✔ ${name} (${Date.now() - t}ms)`, r !== undefined ? JSON.stringify(r).slice(0, 400) : ''); return r; } catch (e) { console.log(`✘ ${name}: ${e.message.split('\n')[0]}`); errs.push(`[${name}] ${e.message}`); return null; } };
const shot = async (p, n) => { if (shots) await p.screenshot({ path: `${shots}/coop_${n}.png` }); };

const H = await open(bh, 'host', url), Gp = await open(bg, 'guest', url);
const code = await step('host opens a world', () => H.evaluate(async lv => {
  const A = __game; A.hostWanted = true; A.startWorld({ name: 'Hostia', cls: 'warrior', race: 'orc', sex: 'f', level: lv, created: Date.now() });
  for (let i = 0; i < 100 && !A.net?.code; i++) await new Promise(r => setTimeout(r, 200));
  return A.net?.code;
}, RAID ? 10 : 4));
if (!code) { console.log('no room code', errs); process.exit(1); }
await step('guest joins by code', () => Gp.evaluate(async (code, lv) => {
  const A = __game; let err = null, ok = false;
  A.joinFriend(code, { ok: () => { ok = true; }, fail: m => { err = m; } });
  for (let i = 0; i < 150 && !ok && !err; i++) await new Promise(r => setTimeout(r, 200));
  if (err) throw new Error(err);
  A.ui.screen(null);
  A.startWorld({ name: 'Guestor', cls: 'mage', race: 'elf', sex: 'm', level: lv, created: Date.now() });
  for (let i = 0; i < 100 && !A.guest.myId; i++) await new Promise(r => setTimeout(r, 200));
  return { mirror: A.game.mirror, myId: A.guest.myId, host: A.guest.hostName };
}, code, RAID ? 10 : 4));
await wait(2500);
await step('debug host session', () => H.evaluate(() => { const n = __game.net; return { guests: [...n.guests.values()].map(g => ({ id: g.id, name: g.name, proxy: g.proxy?.name, known: g.known.size })), conns: n.net.conns.size, errs: n.badge.note }; }));
await step('debug proxy model on host', () => H.evaluate(() => { const pr = __game.net.proxies()[0]; const m = pr?.model; return m ? { parent: m.root.parent?.type, sceneIsWorld: m.root.parent === __game.world.scene, visible: m.root.visible, pos: m.root.position.toArray().map(Math.round), unitPos: pr.pos.toArray().map(Math.round), height: pr.height, meshes: (() => { let n = 0; m.root.traverse(o => { if (o.isMesh) n++; }); return n; })(), spec: JSON.stringify(m.spec).slice(0, 120) } : null; }));
await step('debug guest session', () => Gp.evaluate(() => { const s = __game.guest; return { open: s.net.open, myId: s.myId, units: s.units.size, joined: s.joined, mode: __game.mode }; }));
await step('guest sees the host and the realm', () => Gp.evaluate(() => {
  const A = __game, g = A.game, units = [...A.guest.units.values()];
  const host = units.find(u => u.name === 'Hostia');
  return { units: units.length, host: !!host, hostKind: host?.kind, hostDist: host ? Math.round(host.pos.distanceTo(g.player.pos)) : null, sims: units.filter(u => u.kind === 'sim').length, mobs: units.filter(u => u.kind === 'mob').length, party: g.player.party?.members.map(m => m.name) };
}));
await step('host sees the guest', () => H.evaluate(() => {
  const A = __game, pr = A.net.proxies()[0];
  return { proxy: pr?.name, kind: pr?.kind, cls: pr?.cls, dist: pr ? Math.round(pr.pos.distanceTo(A.game.player.pos)) : null, party: A.game.player.party?.members.map(m => m.name) };
}));
// guest walks a few metres: the host should see it
await step('guest movement reaches host', async () => {
  const before = await H.evaluate(() => { const pr = __game.net.proxies()[0]; return [pr.pos.x, pr.pos.z]; });
  await Gp.evaluate(() => { const p = __game.game.player; p.pos.x += 6; p.pos.z += 2; });
  await wait(700);
  const after = await H.evaluate(() => { const pr = __game.net.proxies()[0]; return [pr.pos.x, pr.pos.z]; });
  return { moved: Math.round(Math.hypot(after[0] - before[0], after[1] - before[1]) * 10) / 10 };
});
await step('host movement reaches guest', async () => {
  await H.evaluate(() => { const p = __game.game.player; p.pos.x += 5; });
  await wait(900);
  return Gp.evaluate(() => { const A = __game, h = [...A.guest.units.values()].find(u => u.name === 'Hostia'); return { hostX: Math.round(h.pos.x), hostNetX: Math.round(h.net.x) }; });
});
await step('chat both ways', async () => {
  await Gp.evaluate(() => __game.game.social.playerChat('/p hello from the guest'));
  await H.evaluate(() => __game.game.social.playerChat('/p hi guest!'));
  await wait(1200);
  const h = await H.evaluate(() => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => /guest/.test(t)).slice(-2));
  const g = await Gp.evaluate(() => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => /guest/.test(t)).slice(-2));
  return { host: h, guest: g };
});
if (process.argv.includes('--social')) {
  await step('host sells an item to a SimPlayer', () => H.evaluate(async () => {
    const A = __game, g = A.game, p = g.player, I = A.interact;
    const s = g.social.sims.filter(x => !x.dead).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
    A.tp(s.pos.x + 2, s.pos.z + 2); await new Promise(r => setTimeout(r, 200));
    g.addGear(g.premadeGear('mage').chest, false); const gold0 = p.gold, bag = p.bags.find(b => b.gear);
    I.startTrade(s); I.trade.mine.items.push({ ref: bag }); I.changed();
    for (let i = 0; i < 30 && !I.trade.okTheirs; i++) await new Promise(r => setTimeout(r, 200));
    const offer = I.trade.theirs.gold; I.acceptTrade(); await new Promise(r => setTimeout(r, 200));
    return { sim: s.name, offer, goldGained: p.gold - gold0, itemGone: !p.bags.includes(bag), tradeOpen: !!I.trade };
  }));
  await step('guest inspects the host', async () => {
    await Gp.evaluate(() => { const A = __game, h = [...A.guest.units.values()].find(u => u.name === 'Hostia'); A.interact.inspect(h); });
    await wait(1200);
    return Gp.evaluate(() => document.querySelector('.evd-pinspect')?.textContent.slice(0, 90));
  });
  await step('guest and host trade a potion for gold', async () => {
    await Gp.evaluate(() => { const A = __game; A.interact.closeWindow(); const h = [...A.guest.units.values()].find(u => u.name === 'Hostia'); A.game.player.pos.copy(h.pos).x += 2; A.interact.startTrade(h); });
    await wait(1500);
    const popup = await H.evaluate(() => { const b = [...document.querySelectorAll('.evd-popup button')].find(x => x.textContent === 'Trade'); b?.click(); return !!b; });
    await wait(1500);
    const g0 = await Gp.evaluate(() => { const A = __game, I = A.interact, p = A.game.player; const bag = p.bags.find(b => b.id === 'potionHealth'); I.trade.mine.items.push({ ref: bag }); I.changed(); return { gold: p.gold, pots: A.game.countItem('potionHealth') }; });
    const h0 = await H.evaluate(() => { const A = __game, I = A.interact, p = A.game.player; p.gold += 20000; I.trade.mine.gold = 10000; I.changed(); return { gold: p.gold, pots: A.game.countItem('potionHealth') }; });
    await wait(1500);
    await Gp.evaluate(() => __game.interact.acceptTrade());
    await H.evaluate(() => __game.interact.acceptTrade());
    await wait(1500);
    const g1 = await Gp.evaluate(() => ({ gold: __game.game.player.gold, pots: __game.game.countItem('potionHealth'), open: !!__game.interact.trade }));
    const h1 = await H.evaluate(() => ({ gold: __game.game.player.gold, pots: __game.game.countItem('potionHealth'), open: !!__game.interact.trade }));
    return { popup, guest: { goldDelta: g1.gold - g0.gold, potsDelta: g1.pots - g0.pots, open: g1.open }, host: { goldDelta: h1.gold - h0.gold, potsDelta: h1.pots - h0.pots, open: h1.open } };
  });
  await shot(H, 'host_social'); await shot(Gp, 'guest_social');
} else if (process.argv.includes('--refresh')) {
  await step('host refreshes; comes back to the same room; the guest reconnects', async () => {
    const before = await H.evaluate(() => __game.net.code);
    await H.reload({ waitUntil: 'load' });
    await H.waitForFunction(() => window.__game && __game.mode === 'world' && __game.net?.code, { timeout: 120000 });
    const after = await H.evaluate(() => ({ mode: __game.mode, code: __game.net.code, name: __game.game.player.name }));
    for (let i = 0; i < 40; i++) { if (await H.evaluate(() => __game.net.proxies().length)) break; await wait(1000); }
    await wait(2500);
    const host = await H.evaluate(() => ({ proxies: __game.net.proxies().map(p => p.name) }));
    const guest = await Gp.evaluate(() => ({ joined: __game.guest.joined, retrying: !!__game.guest.retrying, units: __game.guest.units.size, host: [...__game.guest.units.values()].some(u => u.name === 'Hostia') }));
    return { before, after, host, guest };
  });
  await step('guest refreshes; rejoins by itself', async () => {
    await Gp.reload({ waitUntil: 'load' });
    for (let i = 0; i < 60; i++) { const ok = await Gp.evaluate(() => !!(window.__game && __game.guest?.myId && __game.mode === 'world')).catch(() => false); if (ok) break; await wait(1000); }
    await wait(2500);
    return { guest: await Gp.evaluate(() => ({ mode: __game.mode, name: __game.game.player?.name, units: __game.guest?.units.size })), host: await H.evaluate(() => __game.net.proxies().map(p => p.name)) };
  });
} else if (!RAID) {
  // bring a wolf to both players and let the guest kill it with fireballs
  // out past the village guards, so the kill is ours
  await H.evaluate(() => { const A = __game; A.tp(70, 125); });
  await Gp.evaluate(() => { const p = __game.game.player; p.pos.set(72, __game.world.heightAt(72, 127), 127); });
  await wait(1500);
  const wolfId = await step('host spawns a wolf near both', () => H.evaluate(() => {
    const A = __game, g = A.game, p = g.player, w = g.spawnMob('wolf', p.pos.x + 14, p.pos.z + 4, 3);
    w.brain.t = { ...w.brain.t, aggro: 0 }; return w.id;
  }));
  await wait(1200);
  await step('guest targets the wolf and casts', () => Gp.evaluate(async id => {
    const A = __game, g = A.game, p = g.player, w = A.guest.units.get(id);
    if (!w) throw new Error('guest never received the wolf');
    g.pc.setTarget(w);
    const casts = [];
    const seen = [];
    const origEmit = A.game.onDeath.bind(A.game); A.game.onDeath = e => { seen.push({ unit: e.unit?.name, tapperIsMe: e.unit?.tapper === p, tapper: e.unit?.tapper?.name ?? null, inSim: g.sim.units.includes(e.unit), hostile: e.unit?.hostile, tpl: e.unit?.template }); return origEmit(e); };
    for (let i = 0; i < 12 && !w.dead; i++) { p.gcd = 0; p.casting = null; casts.push(g.combat.cast(p, 'fireball', w)); await new Promise(r => setTimeout(r, 2600)); if (i === 0) seen.push({ afterFirst: true, tapperIsMe: w.tapper === p, hp: w.hp }); }
    await new Promise(r => setTimeout(r, 800));
    return { casts: casts.filter(Boolean).length, wolfDead: w.dead, xp: p.xp, lootable: !!w.lootable, hp: w.hp, seen };
  }, wolfId));
  await H.evaluate(() => { const A = __game, p = A.game.player, pr = A.net.proxies()[0]; const dx = pr.pos.x - p.pos.x, dz = pr.pos.z - p.pos.z; A.cam.yaw = Math.atan2(-dx, -dz) + Math.PI; A.cam.pitch = 0.25; A.cam.distTarget = 9; });
  await Gp.evaluate(() => { const A = __game, p = A.game.player, h = [...A.guest.units.values()].find(u => u.name === 'Hostia'); const dx = h.pos.x - p.pos.x, dz = h.pos.z - p.pos.z; A.cam.yaw = Math.atan2(-dx, -dz) + Math.PI; A.cam.pitch = 0.25; A.cam.distTarget = 9; });
  await wait(1200);
  await shot(Gp, 'guest_world'); await shot(H, 'host_world');
} else {
  await step('host enters the raid with the guest', async () => {
    await H.evaluate(() => { __game.enterRaid(); });
    await wait(4000);
    return { host: await H.evaluate(() => ({ mode: __game.mode, raiders: __game.raid.raiders.map(m => m.name + ':' + m.kind) })), guest: await Gp.evaluate(() => ({ mode: __game.mode, mirror: !!__game.raid?.mirror, units: __game.guest.units.size, pos: [Math.round(__game.game.player.pos.x), Math.round(__game.game.player.pos.z)] })) };
  });
  await step('host bot-plays the raid while the guest bot fights (mirrored)', async () => {
    // the guest's character auto-casts at the dragon while the host's raid runs in real time
    await Gp.evaluate(() => { const A = __game; A.coopBot = setInterval(() => {
      const r = A.raid, p = A.game.player; if (!r || !r.boss?.netId || p.dead || r.state !== 'combat') return;
      const b = r.boss, dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > 24) { p.pos.x += dx / d * 3; p.pos.z += dz / d * 3; p.pos.y = r.lair.heightAt(p.pos.x, p.pos.z); p.stateAnim.speed = 7; return; } // walk into range (the guest owns its position)
      p.stateAnim.speed = 0; r.pc.setTarget(b); if (!p.casting && p.gcd <= 0) r.combat.cast(p, 'fireball', b);
    }, 400); });
    // run the host's raid ~5x real time in chunks, yielding so the guest's messages keep arriving
    const midShot = (async () => { await wait(22000); await shot(Gp, 'guest_raid_mid'); await shot(H, 'host_raid_mid'); })();
    const res = await H.evaluate(async () => {
      const A = __game, r = A.raid; A.botPlayer(0.85); await new Promise(res => setTimeout(res, 50));
      const log = []; let last = '';
      for (let i = 0; i < 2000 && r.state !== 'victory'; i++) {
        for (let k = 0; k < 15; k++) { if (r.state === 'readycheck' && r.playerReady === undefined) { r.playerReady = true; r.afterReady([]); } A.frame(1 / 30); }
        if (r.state !== last) { log.push(`${Math.round(r.totalT)}s ${r.state} boss ${Math.round(r.boss.hpPct * 100)}% alive ${r.raiders.filter(m => !m.dead).length}`); last = r.state; }
        await new Promise(res => setTimeout(res, 0));
      }
      for (let k = 0; k < 30; k++) A.frame(1 / 30);
      A.manual = false;
      const g = r.raiders.find(m => m.kind === 'remote');
      return { log: log.slice(-3), guestDmg: Math.round(g?.meter.dmg || 0), guestAlive: !g?.dead };
    });
    await wait(11000);
    const g = await Gp.evaluate(() => ({ mode: __game.mode, state: __game.raid?.state, result: !!__game.raid?.result, myDmg: Math.round(__game.game.player.meter?.dmg || 0), screen: [...document.querySelectorAll('.evd-results, [class*=results]')].some(e => e.offsetParent), raidFrames: __game.raid?.raiders.length }));
    return { host: res, guest: g };
  });
  await shot(Gp, 'guest_raid');
  await step('host leaves the raid; the guest comes back to the Vale with them', async () => {
    await H.evaluate(() => { __game.ui.screen(null); __game.leaveRaid(); });
    await wait(2500);
    return { host: await H.evaluate(() => ({ mode: __game.mode, proxyInWorld: __game.game.sim.units.includes(__game.net.proxies()[0]) })), guest: await Gp.evaluate(() => ({ mode: __game.mode, units: __game.guest.units.size, pos: [Math.round(__game.game.player.pos.x), Math.round(__game.game.player.pos.z)] })) };
  });
}
console.log(`\n${errs.length} error(s)`); for (const e of errs.slice(0, 15)) console.log(' ', e);
await Promise.race([Promise.all([bh.close(), bg.close()]), new Promise(r => setTimeout(r, 5000))]);
process.exit(errs.length ? 1 : 0);
