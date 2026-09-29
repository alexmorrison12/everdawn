// Co-op check: two separate headless browsers, one hosts and one joins by room code (real WebRTC via the public
// PeerJS service). Verifies the guest sees the host's world, both see each other, and the guest's casts resolve on
// the host with kill credit. usage: node tools/coop.mjs [url] [--shots=dir] [--raid]
import puppeteer from 'puppeteer-core';
const url = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5199/index.html';
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const RAID = process.argv.includes('--raid'), LOOT = process.argv.includes('--loot'); // --loot: raid loot rolls with a friend, a requeue, Ember Marks
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
}, RAID || LOOT ? 10 : 4));
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
}, code, RAID || LOOT ? 10 : 4));
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
} else if (process.argv.includes('--party')) {
  const lines = (P, re) => P.evaluate(re => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => new RegExp(re).test(t)).slice(-3), re);
  const groups = async () => ({
    host: await H.evaluate(() => { const pt = __game.game.player.party; return pt ? { lead: pt.leader?.name, all: pt.all.map(m => m.name + (m.offline ? '(off)' : '')) } : null; }),
    guest: await Gp.evaluate(() => { const pt = __game.game.player.party; return pt ? { lead: pt.leader?.name, all: pt.all.map(m => m.name) } : null; }),
  });
  const clickPopup = (P, label) => P.evaluate(label => { const b = [...document.querySelectorAll('.evd-popup button')].find(x => x.textContent === label); b?.click(); return !!b; }, label);
  const hostOnGuest = 'const A = __game, h = [...A.guest.units.values()].find(u => u.name === "Hostia");';
  await step('guest leaves the group (/leave)', async () => {
    await Gp.evaluate(() => __game.game.social.playerChat('/leave'));
    await wait(1500);
    return { ...(await groups()), hostSaw: await lines(H, 'Guestor leaves'), guestSaw: await lines(Gp, 'leave the group') };
  });
  await step('party chat needs a group', async () => {
    await Gp.evaluate(() => __game.game.social.playerChat('/p anyone there?'));
    await wait(1000);
    return { guest: await lines(Gp, "aren't in a group"), hostHeard: (await lines(H, 'anyone there')).length };
  });
  await step('host tags a wolf: grey for the ungrouped guest; free again after it resets', async () => {
    await H.evaluate(() => __game.tp(70, 125));
    await Gp.evaluate(() => { const p = __game.game.player; p.pos.set(72, __game.world.heightAt(72, 127), 127); });
    await wait(1200);
    const id = await H.evaluate(() => { const A = __game, g = A.game, p = g.player, w = g.spawnMob('wolf', p.pos.x + 12, p.pos.z + 4, 3); w.brain.t = { ...w.brain.t, passive: true }; g.combat.engage(p, w); A.wolf = w; return w.id; });
    await wait(1200);
    const tagged = await Gp.evaluate(id => { const w = __game.guest.units.get(id); return { tapper: w?.tapper?.name ?? null }; }, id);
    await H.evaluate(() => { const w = __game.wolf; w.brain.evade(); w.pos.copy(w.home); });
    await wait(1500);
    const after = await Gp.evaluate(id => { const w = __game.guest.units.get(id); return { tapper: w?.tapper?.name ?? null }; }, id);
    return { whileTagged: tagged, afterReset: after, hostSide: await H.evaluate(() => __game.wolf.tapper?.name ?? null) };
  });
  await step('guest invites the host; the host accepts', async () => {
    await Gp.evaluate(new Function(hostOnGuest + 'A.interact.partyOp("invite", h);'));
    await wait(1500);
    const popup = await clickPopup(H, 'Accept');
    await wait(1500);
    return { popup, ...(await groups()) };
  });
  await step('guest promotes the host; the host removes the guest', async () => {
    await Gp.evaluate(new Function(hostOnGuest + 'A.interact.partyOp("promote", h);'));
    await wait(1200);
    const mid = await groups();
    await H.evaluate(() => { const A = __game; A.interact.partyOp('kick', A.net.proxies()[0]); });
    await wait(1500);
    return { afterPromote: mid, afterKick: await groups(), guestSaw: await lines(Gp, 'removed from the group') };
  });
  await step('host invites the guest back; the guest accepts', async () => {
    await H.evaluate(() => { const A = __game; A.interact.partyOp('invite', A.net.proxies()[0]); });
    await wait(1500);
    const popup = await clickPopup(Gp, 'Accept');
    await wait(1500);
    return { popup, ...(await groups()) };
  });
  await step('guest invites a SimPlayer into the group', async () => {
    for (let k = 0; k < 4; k++) {
      await Gp.evaluate(k => { const A = __game, p = A.game.player; const s = [...A.guest.units.values()].filter(u => u.kind === 'sim' && !u.dead && !u.party).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[k]; A.interact.partyOp('invite', s); }, k);
      await wait(4500);
      if ((await H.evaluate(() => __game.game.player.party?.size || 0)) >= 3) break;
    }
    return groups();
  });
  await step('waypoints: each sees the other\'s; clearing works', async () => {
    await Gp.evaluate(() => { const p = __game.game.player; __game.waypoints.place(p.pos.x + 30, p.pos.z - 20); });
    await H.evaluate(() => { const p = __game.game.player; __game.waypoints.place(p.pos.x - 25, p.pos.z + 10); });
    await wait(1500);
    const seen = {
      host: await H.evaluate(() => [...__game.waypoints.list.values()].map(w => w.unit.name + (__game.waypoints.visible(w.unit) ? '' : '(hidden)'))),
      guest: await Gp.evaluate(() => [...__game.waypoints.list.values()].map(w => w.unit.name + (__game.waypoints.visible(w.unit) ? '' : '(hidden)'))),
      guestMinimap: await Gp.evaluate(() => __game.waypoints.markers().filter(m => m.kind === 'wp').length),
    };
    await Gp.evaluate(() => { const p = __game.game.player; __game.waypoints.place(p.pos.x + 30, p.pos.z - 20); }); // same spot again: take it down
    await wait(1200);
    return { ...seen, hostAfterClear: await H.evaluate(() => [...__game.waypoints.list.values()].map(w => w.unit.name)) };
  });
  await step('guest refreshes: offline in the group, then back in its slot', async () => {
    await Gp.reload({ waitUntil: 'load' });
    await wait(1500);
    const during = await H.evaluate(() => __game.game.player.party?.all.map(m => m.name + (m.offline ? '(off)' : '')));
    for (let i = 0; i < 60; i++) { const ok = await Gp.evaluate(() => !!(window.__game && __game.guest?.myId && __game.mode === 'world')).catch(() => false); if (ok) break; await wait(1000); }
    await wait(3000);
    return { during, after: await groups(), hostSaw: await lines(H, 'offline|back online') };
  });
  await step('duel: guest challenges the host; countdown; fireballs; the host yields at 1 health', async () => {
    await Gp.evaluate(new Function(hostOnGuest + 'A.game.player.pos.set(h.pos.x + 12, h.pos.y, h.pos.z); A.interact.duelOp("challenge", h);'));
    await wait(1500);
    const popup = await clickPopup(H, 'Accept');
    await wait(1200);
    const counting = await Gp.evaluate(new Function(hostOnGuest + 'const p = A.game.player; return { duel: !!p.duel, enemyYet: p.isEnemy(h) };'));
    await wait(3500);
    const live = await Gp.evaluate(new Function(hostOnGuest + 'const p = A.game.player; return { live: !!p.duel?.live, enemy: p.isEnemy(h), flag: !!p.duel?.flag?.parent };'));
    const hp0 = await H.evaluate(() => __game.game.player.hp);
    await Gp.evaluate(new Function(hostOnGuest + 'const p = A.game.player; A.game.pc.setTarget(h); p.gcd = 0; p.casting = null; A.game.combat.cast(p, "fireBlast", h);'));
    await wait(1500);
    const hp1 = await H.evaluate(() => __game.game.player.hp);
    await H.evaluate(() => { const A = __game; A.game.combat.damage(A.net.proxies()[0], A.game.player, 999999, 'fire', { noMiss: true }); });
    await wait(1500);
    const end = await H.evaluate(() => { const p = __game.game.player; return { hp: p.hp, dead: p.dead, duel: !!p.duel }; });
    return { popup, counting, live, hostHpDrop: Math.round(hp0 - hp1), end, guestSaw: await lines(Gp, 'in a duel'), guestAfter: await Gp.evaluate(() => ({ duel: !!__game.game.player.duel, flags: (() => { let n = 0; __game.world.scene.traverse(o => { if (o.geometry?.type === 'PlaneGeometry' && o.material?.color?.getHex?.() === 0xb01818) n++; }); return n; })() })) };
  });
  await step('mounts show up for the other player', async () => {
    await Gp.evaluate(async () => { const A = __game, g = A.game, p = g.player; g.addItem('striderReins'); p.inCombat = false; p.casting = null; g.useItem('striderReins'); await new Promise(r => setTimeout(r, 1900)); });
    await wait(800);
    const hostSees = await H.evaluate(() => __game.net.proxies()[0]?.mount || null);
    await H.evaluate(async () => { const A = __game, g = A.game, p = g.player; g.addItem('drakeReins'); p.inCombat = false; p.casting = null; g.useItem('drakeReins'); await new Promise(r => setTimeout(r, 1900)); });
    await wait(800);
    const guestSees = await Gp.evaluate(() => [...__game.guest.units.values()].find(u => u.name === 'Hostia')?.mount || null);
    return { hostSeesGuestOn: hostSees, guestSeesHostOn: guestSees };
  });
  await step('leaderboards: each sees the other\'s kills (and the realm\'s AI raiders)', async () => {
    const day = await H.evaluate(() => __game.dragon.day);
    await Gp.evaluate(day => { const e = { day, at: Date.now(), name: 'Guestor', cls: 'mage', race: 'elf', role: 'ranged', killTime: 201, dps: 612, hps: 0, attempts: 1, deaths: 0, parse: 99 }; const db = JSON.parse(localStorage.getItem('everdawn.v1')); db.kills.push(e); localStorage.setItem('everdawn.v1', JSON.stringify(db)); __game.guest.net.send({ t: 'kills', l: [e] }); }, day);
    await wait(1200);
    return H.evaluate(async () => { const m = await import('/src/meta/meta.js').catch(() => null); return null; }).then(async () => ({
      hostBoard: await H.evaluate(() => { const db = JSON.parse(localStorage.getItem('everdawn.v1')); return (db.friendKills || []).map(k => k.name); }),
    }));
  });
  await step('host stops hosting: the guest is told and can go back to the title', async () => {
    await H.evaluate(() => __game.stopHosting());
    await wait(2500);
    const told = await Gp.evaluate(() => ({ closed: !!__game.guest?.closed, popup: [...document.querySelectorAll('.evd-popup')].some(e => /closed their world/.test(e.textContent)) }));
    await clickPopup(Gp, 'Return to Title');
    await Gp.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => {});
    await Gp.waitForFunction(() => window.__game && __game.mode === 'title', { timeout: 90000 }).catch(() => {});
    return { told, guestMode: await Gp.evaluate(() => __game.mode), host: await H.evaluate(() => ({ net: !!__game.net, mode: __game.mode, party: __game.game.player.party?.size || 0 })) };
  });
  await step('host logs out to the title and back in', async () => {
    const out = await H.evaluate(() => { __game.logout(); return { mode: __game.mode, player: !!__game.game.player }; });
    await wait(800);
    await H.evaluate(() => __game.ui.emit('login:enter'));
    await wait(600);
    await H.evaluate(() => document.querySelector('.evd-login .chars .cbtns .evd-btn.primary')?.click());
    await wait(2500);
    return { out, back: await H.evaluate(() => ({ mode: __game.mode, name: __game.game.player?.name, sims: __game.game.sim.units.filter(u => u.kind === 'player').length })) };
  });
  await shot(H, 'host_party');
} else if (process.argv.includes('--zones')) {
  await step('host travels to the Crownlands: the guest comes along', async () => {
    await H.evaluate(async () => { await __game.travelTo('crown'); });
    for (let i = 0; i < 40; i++) { if (await Gp.evaluate(() => __game.game.zoneId === 'crown' && !__game.traveling && !__game.guest.paused)) break; await wait(500); }
    await wait(3000);
    return {
      host: await H.evaluate(() => ({ zone: __game.game.zoneId, proxies: __game.net.proxies().map(p => [p.name, Math.round(p.pos.x), Math.round(p.pos.z)]) })),
      guest: await Gp.evaluate(() => { const A = __game, g = A.game, h = [...A.guest.units.values()].find(u => u.name === 'Hostia'); return { zone: g.zoneId, at: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)], units: A.guest.units.size, host: h ? [Math.round(h.pos.x), Math.round(h.pos.z)] : null, crownMobs: [...A.guest.units.values()].filter(u => u.template === 'prowler' || u.template === 'greymask').length, npcs: Object.keys(g.npcs).length }; }),
    };
  });
  await step('the guest can\'t lead the group through a gate', async () => {
    const r = await Gp.evaluate(async () => { const ok = await __game.travelTo('vale'); return { ok, zone: __game.game.zoneId }; });
    return { ...r, said: await Gp.evaluate(() => [...document.querySelectorAll('.evd-err, [class*=err]')].map(e => e.textContent).find(t => /leads the group/.test(t)) || null) };
  });
  await step('host goes home; the guest follows back to the Vale', async () => {
    await H.evaluate(async () => { await __game.travelTo('vale'); });
    for (let i = 0; i < 40; i++) { if (await Gp.evaluate(() => __game.game.zoneId === 'vale' && !__game.traveling && !__game.guest.paused)) break; await wait(500); }
    await wait(2500);
    return Gp.evaluate(() => { const A = __game; return { zone: A.game.zoneId, units: A.guest.units.size, host: !![...A.guest.units.values()].find(u => u.name === 'Hostia'), wolves: [...A.guest.units.values()].filter(u => u.template === 'wolf').length }; });
  });
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
} else if (LOOT) {
  await step('host enters the raid with the guest', async () => {
    await H.evaluate(() => { __game.enterRaid(); });
    await wait(5000);
    return { guest: await Gp.evaluate(() => ({ mode: __game.mode, mirror: !!__game.raid?.mirror, raiders: __game.raid?.raiders.length })) };
  });
  await step('queue again: the friend is in the new raid on their own screen, frames and damage meter included', async () => {
    await H.evaluate(() => { __game.raid.totalT = 900; }); await wait(800); // a long first raid (the next one's clock starts at 0)
    await H.evaluate(() => __game.ui.emit('results:queue'));
    await wait(9000);
    await H.evaluate(() => { const pr = __game.net.proxies()[0]; pr.meter.dmg = 4321; });
    await wait(1500);
    const host = await H.evaluate(() => ({ mode: __game.mode, raiders: __game.raid.raiders.length, friendIn: __game.raid.raiders.includes(__game.net.proxies()[0]) }));
    const guest = await Gp.evaluate(() => ({ mode: __game.mode, mirror: !!__game.raid?.mirror, raiders: __game.raid?.raiders.length, meInRoster: !!__game.raid?.raiders.includes(__game.game.player), myDmg: Math.round(__game.game.player.meter?.dmg || 0) }));
    if (guest.raiders !== host.raiders || guest.myDmg !== 4321) throw new Error(`guest raid view out of date: ${JSON.stringify({ host, guest })}`);
    return { host, guest };
  });
  const loot = await step('the dragon dies: both get Need / Greed / Pass windows; nothing rolls until both chose', async () => {
    const marks0 = await Gp.evaluate(() => __game.game.player.marks || 0);
    await H.evaluate(() => { const A = __game, r = A.raid; r.state = 'combat'; r.fightStart = r.totalT - 90; r.combat.kill(r.boss, A.game.player); });
    await Gp.waitForFunction(() => document.querySelectorAll('.evd-roll').length > 0, { timeout: 20000 });
    await H.waitForFunction(() => document.querySelectorAll('.evd-roll').length > 0, { timeout: 20000 });
    await wait(500);
    const items = await Gp.evaluate(() => [...document.querySelectorAll('.evd-roll .rn')].map(e => e.textContent));
    const bags0 = await Gp.evaluate(() => __game.game.player.bags.filter(b => b.gear).length + Object.values(__game.game.player.equip).filter(Boolean).length);
    // the friend picks Need where they can, Greed otherwise; nothing has rolled yet (the host hasn't chosen)
    await Gp.evaluate(() => { for (const r of document.querySelectorAll('.evd-roll')) { const need = r.querySelector('.rbtn.need'); (need.disabled ? r.querySelector('.rbtn.greed') : need).click(); } });
    await wait(1200);
    const early = await H.evaluate(() => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => /won:/.test(t)).length);
    await H.evaluate(() => { for (const r of document.querySelectorAll('.evd-roll')) r.querySelector('.rbtn.pass').click(); });
    await wait(2500);
    const chat = p => p.evaluate(() => [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => /selected|won:|passed on|receive loot/.test(t)));
    const hc = await chat(H), gc = await chat(Gp);
    const guestWins = hc.filter(t => /Guestor won:/.test(t)).length;
    const bags1 = await Gp.evaluate(() => __game.game.player.bags.filter(b => b.gear).length + Object.values(__game.game.player.equip).filter(Boolean).length);
    await wait(3000);
    const marks1 = await Gp.evaluate(() => __game.game.player.marks || 0);
    const res = {
      items: items.length, rolledBeforeHostChose: early,
      host: { youPassed: hc.filter(t => /^You passed on/.test(t)).length, friendNamed: hc.filter(t => /^Guestor (selected|won)/.test(t)).length, youWon: hc.filter(t => /^You won/.test(t)).length },
      guest: { youSelected: gc.filter(t => /^You selected/.test(t)).length, hostNamed: gc.filter(t => /^Hostia passed on/.test(t)).length, youWon: gc.filter(t => /^You won/.test(t)).length, received: gc.filter(t => /^You receive loot/.test(t)).length, wrongYou: gc.filter(t => /^You passed on/.test(t)).length },
      guestWins, gotItems: bags1 - bags0, marks: marks1 - marks0, results: await Gp.evaluate(() => [...document.querySelectorAll('.evd-roll .rw')].map(e => e.textContent)),
    };
    if (early) throw new Error('an item rolled before the host chose');
    if (res.guest.youSelected !== items.length || res.guest.wrongYou || res.host.youPassed !== items.length) throw new Error('chat names wrong: ' + JSON.stringify(res));
    if (res.guest.youWon !== guestWins || res.gotItems !== guestWins || res.guest.received !== guestWins) throw new Error('won items missing: ' + JSON.stringify(res));
    if (res.marks !== 5) throw new Error('no Ember Marks for the friend: ' + JSON.stringify(res));
    // the friend's victory screen lists what they won
    await Gp.waitForFunction(n => document.querySelectorAll('.rloot .rli').length === n && document.querySelector('.rloot')?.offsetParent, { timeout: 20000 }, guestWins).catch(() => {});
    res.resultsLoot = await Gp.evaluate(() => [...document.querySelectorAll('.rloot .rli, .rloot .rnone')].map(e => e.textContent));
    if (res.resultsLoot.length !== Math.max(1, guestWins) || (guestWins && /rolled better|Rolling/.test(res.resultsLoot[0]))) throw new Error('results screen loot wrong: ' + JSON.stringify(res.resultsLoot));
    return res;
  });
  await shot(Gp, 'guest_loot'); await shot(H, 'host_loot');
} else if (!RAID) {
  await step('the friend talks to an innkeeper: health and mana back to full (on the host too)', async () => {
    await H.evaluate(() => { const pr = __game.net.proxies()[0]; pr.hp = 20; pr.power = 5; pr.inCombat = false; });
    await Gp.evaluate(async () => { const A = __game, g = A.game, p = g.player, m = [...A.guest.units.values()].find(u => u.npcId === 'maribel') || g.npcs.maribel; p.pos.set(m.pos.x + 1.5, p.pos.y, m.pos.z + 2); await new Promise(r => setTimeout(r, 600)); p.inCombat = false; p.hp = 20; p.power = 5; g.interact(m); A.ui.questDialog.close(); });
    await wait(1500);
    const host = await H.evaluate(() => { const pr = __game.net.proxies()[0]; return { hp: `${pr.hp}/${pr.hpMax}`, mana: `${pr.power}/${pr.powerMax}` }; });
    const guest = await Gp.evaluate(() => { const p = __game.game.player; return { hp: `${p.hp}/${p.hpMax}`, mana: `${p.power}/${p.powerMax}` }; });
    const full = x => x.split('/')[0] === x.split('/')[1];
    if (!full(host.hp) || !full(host.mana) || !full(guest.hp)) throw new Error('not restored: ' + JSON.stringify({ host, guest }));
    return { host, guest };
  });
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
