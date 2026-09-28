// Guest side of co-op. The host's browser simulates the world; this browser mirrors it. Units arrive as spawns and
// compact rows (net/host.js) and are eased toward the host's positions; events are replayed on the local bus so the
// HUD, effects and sounds work unchanged. The local player still moves locally (no input lag) and reports its
// position; casts, attacks and chat go to the host, which resolves them and streams the results back. Quests, XP,
// bags and loot stay in this browser's own save, so a friend keeps their character.
import * as THREE from 'three';
import { bus } from '../game/events.js';
import { Unit } from '../game/unit.js';
import { SPELLS, AURAS, GCD } from '../game/data/spells.js';
import { ITEMS } from '../game/items.js';
import { GuestTransport } from './peer.js';
import { dec, spellIn } from './codec.js';

const SEND_EVERY = 1 / 15;
const OTHER = { name: 'someone else', kind: 'other' };  // tapper stand-in: somebody outside your group
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
const EMOTES = { dance: 'dance', wave: 'wave', cheer: 'cheer', laugh: 'laugh', lol: 'laugh', bow: 'bow', point: 'point', roar: 'roar', kneel: 'kneel', salute: 'bow', hug: 'wave', flex: 'roar', cry: 'kneel' };
const VERBS = { dance: 'dances', wave: 'waves', cheer: 'cheers', laugh: 'laughs', lol: 'laughs', bow: 'bows', point: 'points', roar: 'roars', kneel: 'kneels', salute: 'salutes', hug: 'hugs everyone', flex: 'flexes', cry: 'cries' };

export class GuestSession {
  constructor(app, code, { onOpen, onError } = {}) {
    this.app = app; this.code = code;
    this.units = new Map(); this.myId = null; this.hostId = null; this.hostName = 'your friend';
    this.sendT = 0; this.statsSig = ''; this.joined = false; this.retries = 0;
    this.first = { onOpen, onError };
    this.connect();
    this.resolve = id => (id === this.myId ? this.p : this.units.get(id));
  }
  connect() {
    this.net?.close();
    this.net = new GuestTransport(this.code, this.p?.name || 'Adventurer', {
      onOpen: () => {
        if (!this.joined) { this.first.onOpen?.(); return; }
        // back after a drop (the host refreshed, a flaky network): say hello again and get a fresh copy of the world
        this.retries = 0; this.helloSent = false; this.hello();
        this.app.ui.alerts.raidWarning(`Reconnected to ${this.hostName}'s world`, '#40ff80');
        this.app.guestBadge?.set(`In ${this.hostName}'s world`);
      },
      onMessage: m => this.onMessage(m),
      onClose: reason => this.lost(reason),
      onError: msg => { if (!this.joined) this.first.onError?.(msg); else if (this.retrying) this.retry(); else this.app.ui.alerts.error(msg); },
    });
  }
  // keep knocking on the same room for two minutes: a refreshed host reopens it with the same code
  retry() {
    clearTimeout(this.retryT);
    if (this.retries++ > 40) { this.retrying = false; this.app.guestBadge?.set('Disconnected'); bus.emit('chat', { ch: 'system', text: `${this.hostName}'s world didn't come back. Reload the page to play on your own or join again.` }); return; }
    this.retryT = setTimeout(() => this.connect(), 3000);
  }
  get g() { return this.app.game; }
  get p() { return this.g.player; }
  get raid() { return this.app.mode === 'raid' ? this.app.raid : null; }

  lost() {
    if (this.closed || this.retrying) { if (this.retrying) this.retry(); return; }
    this.retrying = true; this.retries = 0;
    this.app.ui.alerts.raidWarning(`Lost ${this.hostName}'s world. Reconnecting…`, '#ffb040');
    bus.emit('chat', { ch: 'system', text: `Lost the connection to ${this.hostName}'s world (did they refresh?). Your character is saved; reconnecting for the next two minutes.` });
    this.clearUnits();
    this.app.guestLost?.();
    if (this.app.mode === 'raid') this.app.guestRaidLeave?.();
    this.retry();
  }

  // ---------------------------------------------------------------- messages from the host
  onMessage(m) {
    switch (m.t) {
      case 'hi': this.hostName = m.host || this.hostName; this.hello(); return;
      case 'welcome': this.retrying = false; this.welcomed(m); return;
      case 's': this.snapshot(m); return;
      case 'e': for (const [type, data] of m.l) this.event(type, data); return;
      case 'force': this.force(m); return;
      case 'raid': this.app.guestRaidEnter?.(m); return;
      case 'raid_end': this.app.guestRaidLeave?.(m); return;
      case 'raid_result': this.app.guestRaidResult?.(m); return;
      case 'loot_won': this.lootWon(m.item); return;
      case 'inspect': this.app.interact?.showInspect(m.data); return;
      case 'trade': this.app.interact?.onTrade(this.resolve(m.from), m.m); return;
      case 'full': this.app.ui.alerts.error('That world is full (4 friends max).'); return;
    }
  }
  hello() {
    const p = this.p; if (!p || this.helloSent) return; // once: 'hi' and entering the world can both ask
    this.helloSent = true;
    this.net.send({ t: 'hello', ch: { name: p.name, cls: p.cls, race: p.race, sex: p.sex, level: p.level, appearance: p.appearance, equip: p.equip, look: p.gearLook || 0 } });
  }
  welcomed(m) {
    this.clearUnits();
    this.joined = true;
    this.myId = m.you; this.hostId = m.host; this.hostName = m.hostName || this.hostName;
    if (m.tod !== undefined) this.app.world.tod = m.tod;
    if (m.pos && !m.raid) this.teleport(m.pos[0], m.pos[1]);
    this.app.ui.alerts.raidWarning(`You joined ${this.hostName}'s world`, '#40ff80');
    bus.emit('chat', { ch: 'system', text: `Joined ${this.hostName}'s world. Their browser runs the realm; yours keeps your character. Humans online: 2.` });
    this.statsSig = '';
    if (m.raid) bus.emit('chat', { ch: 'system', text: `${this.hostName} is in the raid right now. You'll join the next one when they come back out.` });
  }

  // ---------------------------------------------------------------- snapshots
  snapshot(m) {
    for (const s of m.sp || []) this.spawn(s);
    for (const id of m.de || []) this.despawn(id);
    for (const row of m.u || []) this.apply(row);
    if (m.me) this.applyMe(m.me);
    if (m.pa !== undefined) this.party(m.pa);
    if (m.rs && this.raid?.applyRaid) this.raid.applyRaid(m.rs, this);
    if (m.tod !== undefined && Math.abs(this.app.world.tod - m.tod) > 0.01) this.app.world.tod = m.tod;
  }
  spawn(s) {
    if (this.units.has(s.id)) return;
    const u = new Unit({ name: s.n, kind: s.k, hostile: s.h, level: s.lv, cls: s.cls, race: s.race, sex: s.sex, guild: s.g, template: s.tpl,
      elite: s.el, rare: s.ra, boss: s.bo, pos: new THREE.Vector3(s.x, s.y, s.z), facing: s.f, radius: s.rad });
    u.netId = s.id; u.mirror = true; u.title = s.ti; u.npcId = s.npc; u.powerType = s.pt ?? u.powerType;
    u.hpMax = s.hm; u.hp = s.hp; u.meter = { dmg: 0, heal: 0, taken: 0 };
    u.net = { x: s.x, y: s.y, z: s.z, f: s.f };
    const owner = this.raid || this.g;
    if (s.spec) owner.addModel(u, s.spec);
    if (s.ht) u.height = s.ht;
    owner.sim.add(u);
    this.units.set(s.id, u);
  }
  despawn(id) {
    const u = this.units.get(id); if (!u) return;
    this.units.delete(id);
    this.raid?.sim.remove(u); this.g.sim.remove(u);
    if (this.p?.target === u) (this.raid?.pc || this.g.pc)?.setTarget(null);
    u.model?.dispose?.();
  }
  clearUnits() { for (const id of [...this.units.keys()]) this.despawn(id); }
  apply(row) {
    const [id, x, y, z, f, hp, hm, spd, fl, tgt, cid, ct, cd, lv, au, pw, st] = row;
    const u = this.units.get(id); if (!u) return;
    Object.assign(u.net, { x, y, z, f });
    u.hp = hp; u.hpMax = hm; u.level = lv; u.power = pw;
    const dead = !!(fl & 1);
    if (dead !== u.dead) { u.dead = dead; if (!dead) { u.stateAnim.dead = false; u.model?.revive?.(); } }
    u.inCombat = !!(fl & 2);
    u.tapper = fl & 8 ? this.p : fl & 16 ? OTHER : null;
    const a = u.stateAnim;
    a.speed = spd; a.sit = !!(fl & 32); a.swimming = u.swimming = !!(fl & 64); a.combat = !!(fl & 2);
    u.flying = !!(fl & 256); u.afk = !!(fl & 512); u.ghost = !!(fl & 1024);
    if (st) { a.flying = !!st[0]; a.enraged = !!st[1]; a.altitude = st[2]; a.turn = st[3]; u.altitude = st[2]; }
    u.target = tgt ? this.resolve(tgt) || null : null;
    u.casting = cid ? { id: cid, spell: spellIn(cid, u.casting?.id === cid ? u.casting.spell : null), t: ct, dur: cd, channel: !!(fl & 4), target: u.target } : null;
    u.auras = au ? String(au).split(',').map(s => { const [aid, sk, rem, dur] = s.split(':'); return { id: aid, def: AURAS[aid] || { name: aid }, stacks: +sk, rem: +rem, dur: +dur, opts: {} }; }) : [];
  }
  applyMe(me) {
    const p = this.p; if (!p) return;
    if (!p.ghost) {
      p.hp = me.hp; p.hpMax = me.hm;
      if (me.dead && !p.dead) { p.dead = true; p.hp = 0; }
      else if (!me.dead && p.dead) { p.dead = false; p.stateAnim.dead = false; p.model?.revive?.(); if (this.raid) this.app.ui.death?.hide?.(); }
    }
    p.power = me.pw; p.powerMax = me.pm; p.inCombat = !!me.ic;
    if (!p.casting?.custom) p.casting = me.cast ? { id: me.cast[0], spell: spellIn(me.cast[0]), t: me.cast[1], dur: me.cast[2], channel: !!me.cast[3], target: this.resolve(me.cast[4]) } : null;
    p.gcd = me.gcd; p.gcdMax = me.gm;
    const local = ['hearth', 'potion'].filter(k => p.cooldowns.has(k)).map(k => [k, p.cooldowns.get(k)]);
    p.cooldowns = new Map([...Object.entries(me.cds), ...local]);
    const keep = p.auras.filter(a => a.id === 'ghost');
    p.auras = [...keep, ...me.au.map(([id, rem, dur, sk, abs, src]) => ({ id, def: AURAS[id] || { name: id }, rem, dur, stacks: sk, absorb: abs, src: this.resolve(src), opts: {} }))];
    p.autoAttack = !!me.aa;
  }
  party(list) {
    const soc = this.g.social, ids = list ? String(list).split(',').map(Number) : [];
    const members = ids.map(id => this.units.get(id)).filter(Boolean);
    if (!members.length) { soc.party = null; if (this.p) this.p.party = null; }
    else { soc.party = { members, leaderIsPlayer: false }; if (this.p) this.p.party = soc.party; for (const m of members) m.party = soc.party; }
    bus.emit('party_changed', { party: soc.party });
  }

  // ---------------------------------------------------------------- events
  event(type, data) {
    if (type === 'anim') { const u = this.resolve(data.unit?.$u); u?.model?.play?.(data.name); return; }
    const d = dec(data, this.resolve);
    if (!d) return;                                    // mentions a unit we haven't been sent
    if ('spellInline' in d || d.id !== undefined || d.spellId !== undefined) d.spell = spellIn(d.id ?? d.spellId, d.spellInline);
    if (type === 'death' && d.unit) { d.unit.dead = true; if (d.unit === this.p) this.p.hp = 0; }
    if (type === 'aura_apply' || type === 'aura_remove') d.aura = { ...d.aura, def: AURAS[d.aura?.id] || { name: d.aura?.id } };
    d.$net = 1;
    bus.emit(type, d);
  }

  // ---------------------------------------------------------------- host commands
  force(m) {
    const p = this.p; if (!p) return;
    if (m.dash) { p.dash = { from: p.pos.clone(), to: new THREE.Vector3(m.x, 0, m.z), t: 0, dur: m.dash, knock: !!m.knock }; return; }
    this.teleport(m.x, m.z);
    if (m.face !== undefined) { p.facing = m.face; this.app.cam.yaw = m.face; }
  }
  teleport(x, z) {
    const p = this.p; if (!p) return;
    const h = this.raid ? this.raid.lair.heightAt(x, z) : this.g.world.heightAt(x, z);
    p.pos.set(x, h, z); p.vy = 0; p.dash = null; this.app.cam._first = true;
  }
  lootWon(item) {
    if (!item) return;
    if (item.mount) this.g.hasMount = true; else this.g.addGear(item);
    this.app.ui.alerts.raidWarning(`You won ${item.name}!`, '#a335ee');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const u of this.units.values()) {
      const n = u.net; if (!n) continue;
      const dx = n.x - u.pos.x, dz = n.z - u.pos.z;
      if (dx * dx + dz * dz > 100) { u.pos.set(n.x, n.y, n.z); u.facing = n.f; continue; } // teleports snap
      u.pos.x += dx * k; u.pos.y += (n.y - u.pos.y) * k; u.pos.z += dz * k;
      let df = n.f - u.facing; df = Math.atan2(Math.sin(df), Math.cos(df)); u.facing += df * k;
    }
    this.tickLocal(dt);
    this.sendT -= dt;
    const p = this.p;
    if (p && this.joined && this.sendT <= 0) {
      this.sendT = SEND_EVERY;
      const a = p.stateAnim;
      this.net.send({ t: 'st', x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), f: r2(p.facing), a: [r1(a.speed || 0), r1(a.strafe || 0), a.grounded ? 1 : 0, r1(a.vy || 0), a.swimming ? 1 : 0, a.sit ? 1 : 0, a.combat ? 1 : 0] });
      const sig = `${p.level}|${p.gearLook}|${Object.values(p.equip || {}).map(i => i?.uid ?? i?.name ?? '').join(',')}`;
      if (sig !== this.statsSig) { if (this.statsSig) this.net.send({ t: 'stats', level: p.level, equip: p.equip, look: p.gearLook || 0 }); this.statsSig = sig; }
    }
  }
  // between snapshots: count down the player's timers so bars and sweeps stay smooth; run local-only casts (hearth)
  tickLocal(dt) {
    const p = this.p; if (!p) return;
    if (p.gcd > 0) p.gcd = Math.max(0, p.gcd - dt);
    for (const [key, v] of p.cooldowns) { if (v <= dt) p.cooldowns.delete(key); else p.cooldowns.set(key, v - dt); }
    for (const a of p.auras) a.rem -= dt;
    const c = p.casting;
    if (c) {
      c.t += dt;
      if (c.custom && c.t >= c.dur) { p.casting = null; bus.emit('cast_stop', { unit: p, spell: c.spell, id: c.id, reason: 'success' }); c.custom(); }
    }
  }

  // ---------------------------------------------------------------- local actions → host
  netId(u) { return u === this.p ? 'me' : u?.netId || 0; }
  /** Route a Combat's casts through the host (called for the world and again for each mirrored raid). */
  hookCombat(cb) {
    const self = this, canCast = cb.canCast.bind(cb), interrupt = cb.interrupt.bind(cb);
    cb.cast = (u, sid, target = u.target, point = null) => {
      if (u !== self.p) return false;
      const sp = SPELLS[sid]; if (!sp) return false;
      if (sp.target === 'ally') target = target && !u.isEnemy(target) && !target.dead ? target : u;
      if (sp.target === 'self' || sp.target === 'none') target = u;
      if (sp.target === 'ground' && !point) point = u.target && !u.target.dead ? u.target.pos.clone() : u.pos.clone();
      const chk = canCast(u, sid, target, point);
      if (!chk.ok) { if (!chk.silent) bus.emit('error', { unit: u, msg: chk.err }); return false; }
      if ((sp.target === 'enemy' || sp.target === 'ally') && target !== u) cb.faceTarget(u, target);
      if (sp.target === 'ally' && target !== u && !target.netId) target = u; // local NPCs don't exist on the host
      self.net.send({ t: 'cast', id: sid, tgt: self.netId(target), pt: point ? [r1(point.x), r1(point.z)] : undefined });
      if (!sp.offGcd) { u.gcd = sp.gcd ?? GCD; u.gcdMax = u.gcd; }
      return true;
    };
    cb.interrupt = (u, reason) => {
      if (u !== self.p || !u.casting || u.casting.custom) return interrupt(u, reason);
      self.net.send({ t: 'int' });
      interrupt(u, reason);
    };
  }
  /** Tell the host about targeting and auto-attack (world and raid controllers). */
  hookController(pc) {
    const self = this, setTarget = pc.setTarget.bind(pc), startAttack = pc.startAttack.bind(pc);
    pc.setTarget = t => { const was = self.p.target; setTarget(t); if (was !== t) self.net.send({ t: 'tgt', tgt: self.netId(t) }); };
    pc.startAttack = () => { startAttack(); const t = self.p.target; if (self.p.autoAttack && t) self.net.send({ t: 'atk', tgt: self.netId(t), on: 1 }); };
  }
  hook() {
    const g = this.g, soc = g.social, self = this;
    this.hookCombat(g.combat); this.hookController(g.pc);
    // items whose effects live on the host (the item itself leaves your bags here)
    const useItem = g.useItem.bind(g);
    g.useItem = itemId => {
      const def = ITEMS[itemId], before = g.countItem(itemId);
      useItem(itemId);
      if (def?.use && g.countItem(itemId) < before && ['healPotion', 'manaPotion', 'eat', 'drink'].includes(def.use)) self.net.send({ t: 'item', use: def.use });
    };
    const resurrect = g.resurrect.bind(g);
    g.resurrect = () => { const was = self.p.ghost; resurrect(); if (was && !self.p.ghost) self.net.send({ t: 'rev', x: r1(self.p.pos.x), z: r1(self.p.pos.z) }); };
    // chat: show your own line here, let the host post it to everyone else
    const playerChat = soc.playerChat.bind(soc);
    soc.playerChat = (raw, defaultCh = 'say') => {
      raw = String(raw || '').trim(); if (!raw) return;
      let ch = defaultCh, text = raw, to = null;
      if (raw.startsWith('/')) {
        const [c0, ...rest] = raw.slice(1).split(' '), c = c0.toLowerCase();
        const map = { s: 'say', say: 'say', y: 'yell', yell: 'yell', p: 'party', party: 'party', '1': 'general', '2': 'trade', '4': 'lfg', ra: 'raid', raid: 'raid' };
        if (map[c]) { ch = map[c]; text = rest.join(' '); }
        else if (['w', 'whisper', 't', 'tell', 'msg'].includes(c)) { ch = 'whisper'; to = rest[0]; text = rest.slice(1).join(' '); }
        else if (c === 'r' || c === 'reply') { ch = 'whisper'; to = self.lastWhisper; text = rest.join(' '); if (!to) return; }
        else if (EMOTES[c]) {
          self.p.model?.play?.(EMOTES[c]);
          bus.emit('chat', { ch: 'emote', text: `${self.p.name} ${VERBS[c]}.` });
          self.net.send({ t: 'emote', anim: EMOTES[c], text: `${VERBS[c]}.` });
          return;
        } else return playerChat(raw, defaultCh); // /roll, /played, /help… answered here
      }
      if (!text) return;
      if (ch === 'whisper') { if (!to) return; bus.emit('chat', { ch: 'whisper_out', from: self.p.name, to, text }); self.net.send({ t: 'chat', ch, to, text }); return; }
      bus.emit('chat', { ch, from: self.p.name, unit: self.p, cls: self.p.cls, text });
      if (ch === 'say' || ch === 'yell') bus.emit('bubble', { unit: self.p, text });
      self.net.send({ t: 'chat', ch, text });
    };
    this.offChat = bus.on('chat', e => { if (e.$net && e.ch === 'whisper' && e.from) self.lastWhisper = e.from; });
  }
  dispose() { this.closed = true; clearTimeout(this.retryT); this.net?.close(); this.clearUnits(); this.offChat?.(); }
}
