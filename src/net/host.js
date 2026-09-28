// Host side of co-op. This browser runs the one true simulation: every mob, SimPlayer and spell resolves here. Each
// friend (guest) gets an avatar here (kind 'remote'); their own browser moves it and asks to cast, and this session
// streams back what they need: the units near them (spawns, then compact rows of whatever changed), their own
// avatar's combat state, and the events that make fights look and sound right.
import * as THREE from 'three';
import { bus } from '../game/events.js';
import { Unit } from '../game/unit.js';
import { SPELLS } from '../game/data/spells.js';
import { HostTransport } from './peer.js';
import { PUBLIC_URL } from '../meta/remote.js';
import { enc, unitSpawn } from './codec.js';
import { lobbyStyles } from './lobby.js';
import { Party } from '../game/party.js';
import { MOUNT_BY_CODE } from '../game/companions.js';
import { firework } from '../game/game.js';
import { addFriendKills, knownKills } from '../meta/meta.js';

const RANGE = 150;                 // how far around a guest units are streamed
const SNAP_EVERY = 1 / 12;         // seconds between state snapshots
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

// events every nearby guest sees; events only the guest they concern sees; raid-wide events while in the raid
const WORLD = new Set(['damage', 'heal', 'miss', 'swing', 'spell_go', 'spell_hit', 'cast_start', 'cast_stop', 'death', 'aura_apply', 'aura_remove',
  'fx', 'fx_projectile', 'fx_cone', 'fx_ground', 'fx_ground_stop', 'sound', 'say', 'bubble', 'emote', 'evade', 'anim']);
const OWNER = new Set(['charge', 'blink', 'proc', 'error', 'duel_state']);
const PARTY = new Set(['waypoint']);        // events only the unit's group sees
const RAIDWIDE = new Set(['raid_warning', 'boss_timer', 'boss_phase', 'raid_state', 'zone_text', 'music', 'fade', 'shake', 'raid_roster']);
const CHAT_NEAR = { say: 45, emote: 45, yell: 160 };
const CHAT_ALL = new Set(['general', 'trade', 'lfg', 'localdefense', 'party', 'raid', 'rw', 'loot']);

export class HostSession {
  constructor(app, code = null) {
    this.app = app; this.code = null;
    this.guests = new Map();       // relay id → { id, name, proxy, known: Map(unitId → row signature), out: [], snapT }
    this.byProxy = new Map();      // proxy unit → guest
    this.lost = new Map();         // name → { party, at }: a friend who dropped (a refresh) gets their group back
    this.acc = 0; this.todT = 0;
    this.net = new HostTransport({
      onOpen: code => {
        const again = code === this.wanted;
        this.code = code; this.badge.note = null; this.badge.render();
        app.rememberSession?.({ role: 'host', code });
        bus.emit('chat', { ch: 'system', text: again ? `Your world is open again: room ${code}. Friends reconnect on their own.` : `Your world is open. Room code: ${code}. Share the invite link from the badge at the top.` });
      },
      onWait: c => { this.badge.note = `Reopening room ${c}…`; this.badge.render(); },
      onJoin: (id, name) => this.join(id, name),
      onLeave: id => this.leave(id),
      onMessage: (id, m) => { const gst = this.guests.get(id); if (gst) this.onGuest(gst, m); },
      onError: msg => { this.badge.note = msg; this.badge.render(); this.app.ui.alerts.error(msg); },
    }, code);
    this.wanted = code;
    // tap the bus: after local listeners run, relay what guests need
    const emit = bus.emit;
    this.untap = () => { bus.emit = emit; };
    bus.emit = (type, data) => { emit.call(bus, type, data); if (this.guests.size) { try { this.onEvent(type, data); } catch (e) { console.warn('[host]', type, e); } } };
    this.badge = new HostBadge(app, this);
    // your whispers to a friend go to their browser
    const soc = app.game.social, playerChat = soc.playerChat.bind(soc);
    soc.playerChat = (raw, ch) => {
      const m = /^\/(?:w|whisper|t|tell|msg)\s+(\S+)\s+([\s\S]+)/i.exec(String(raw || '').trim());
      const gst = m && [...this.guests.values()].find(g => g.proxy && g.proxy.name.toLowerCase() === m[1].toLowerCase());
      if (!gst) return playerChat(raw, ch);
      bus.emit('chat', { ch: 'whisper_out', from: this.me.name, to: gst.proxy.name, text: m[2] });
      this.queue(gst, 'chat', { ch: 'whisper', from: this.me.name, cls: this.me.cls, text: m[2].slice(0, 240), to: 'you' });
    };
  }
  get g() { return this.app.game; }
  get raiding() { return this.app.mode === 'raid' && this.app.raid; }
  get sim() { return this.raiding ? this.app.raid.sim : this.g.sim; }
  get me() { return this.g.player; }

  // ---------------------------------------------------------------- connections
  get invite() { if (!this.code) return null; const base = PUBLIC_URL || (location.origin + location.pathname); return `${base.replace(/[?#].*$/, '')}?join=${this.code}`; }
  send(gst, m) { this.net.send(gst.id, m); }

  join(id, name) {
    if (this.guests.has(id)) return;
    const gst = { id, name, proxy: null, known: new Map(), out: [] };
    this.guests.set(id, gst);
    this.send(gst, { t: 'hi', host: this.me?.name });   // ask for their character
    this.badge.render();
  }
  leave(id) {
    const gst = this.guests.get(id); if (!gst) return;
    this.guests.delete(id);
    if (gst.proxy) this.removeProxy(gst);
    this.badge.render();
  }

  // ---------------------------------------------------------------- guest requests
  onGuest(gst, m) {
    const p = gst.proxy, cb = this.combat;
    switch (m.t) {
      case 'hello': this.welcome(gst, m.ch); return;
      case 'st': if (p && !p.dead) this.move(p, m); return;
      case 'cast': {
        if (!p) return;
        const t = m.tgt === 'me' ? p : this.unit(m.tgt), sp = SPELLS[m.id]; if (!sp) return;
        const point = m.pt ? new THREE.Vector3(m.pt[0], this.ground(m.pt[0], m.pt[1]), m.pt[1]) : null;
        if (sp.melee && t) cb.faceTarget(p, t);
        if (t && t !== p) p.target = t;
        cb.cast(p, m.id, t || p.target, point);
        return;
      }
      case 'atk': if (!p) return; p.target = this.unit(m.tgt) || p.target; p.autoAttack = !!m.on && !!p.target && p.isEnemy(p.target); if (p.autoAttack) p.swingT = Math.min(p.swingT, 0.3); return;
      case 'tgt': if (!p) return; p.target = this.unit(m.tgt) || null; if (!p.target || !p.isEnemy(p.target)) p.autoAttack = false; return;
      case 'int': if (p?.casting) cb.interrupt(p, 'Interrupted'); return;
      case 'item': this.useItem(p, m.use, m.id); return;
      case 'rev': this.revive(p, m); return;
      case 'stats': this.stats(p, m); return;
      case 'chat': this.chat(gst, m); return;
      case 'emote': if (p && !p.dead) { p.model?.play?.(m.anim); if (m.text) this.g.social.post('emote', null, `${p.name} ${m.text}`, { unit: p, $from: gst.id }); } return;
      case 'bye': this.leave(gst.id); return;
      case 'party': this.partyOp(gst, m); return;
      case 'resync': gst.known.clear(); gst.pa = null; return; // their world just loaded: send everything again
      case 'kills': if (addFriendKills(m.l)) for (const o of this.guests.values()) if (o !== gst && o.proxy) this.send(o, { t: 'kills', l: m.l }); return; // leaderboard entries: keep, pass on
      case 'duel': {
        if (!p) return;
        const d = this.g.duels;
        if (m.op === 'challenge') d.challenge(p, this.who(m));
        else if (m.op === 'accept') d.accept(p); else if (m.op === 'decline') d.decline(p); else if (m.op === 'yield') d.forfeit(p);
        return;
      }
      case 'wp': if (p) bus.emit('waypoint', m.clear ? { unit: p, clear: true, $from: gst.id } : { unit: p, x: +m.x || 0, z: +m.z || 0, ping: !!m.ping, $from: gst.id }); return;
      case 'inspect': { const u = this.unit(m.id); if (u && this.app.interact) this.send(gst, { t: 'inspect', data: this.app.interact.inspectData(u) }); return; }
      case 'trade': {
        if (!p) return;
        if (m.to === this.me?.id) { this.app.interact?.onTrade(p, m.m); return; }
        const other = [...this.guests.values()].find(o => o.proxy && o.proxy.id === m.to);
        if (other) this.send(other, { t: 'trade', from: p.id, m: m.m });
        return;
      }
    }
  }
  /** A friend's group requests: the same Social calls the host's own buttons make. */
  partyOp(gst, m) {
    const p = gst.proxy, soc = this.g.social; if (!p) return;
    const who = this.who(m);
    switch (m.op) {
      case 'invite': if (!who) soc.tell(p, m.name ? `No player named '${m.name}' is currently playing.` : 'Invite whom?'); else soc.invite(p, who); return;
      case 'accept': soc.acceptInvite(p); return;
      case 'decline': soc.declineInvite(p); return;
      case 'leave': if (p.party) soc.leave(p); else soc.tell(p, "You aren't in a group."); return;
      case 'kick': soc.kick(p, who); return;
      case 'promote': soc.promote(p, who); return;
    }
  }
  /** The unit a request names: by id, else by name (players, friends and SimPlayers). */
  who(m) {
    if (m.id) { const u = this.unit(m.id) || (m.id === this.me?.id ? this.me : null) || this.partyUnits().find(x => x.id === m.id); if (u) return u; }
    return m.name ? this.g.social.findPlayer(m.name) || this.partyUnits().find(x => x.name.toLowerCase() === String(m.name).toLowerCase()) || null : null;
  }
  partyUnits() { return [...new Set([this.me, ...this.proxies()].flatMap(u => u?.party?.all || []))]; } // incl. friends who are offline
  partyInvite(to, from) { const gst = this.byProxy.get(to); if (gst) this.send(gst, { t: 'pinv', from: from.name }); }
  duelInvite(to, from) { const gst = this.byProxy.get(to); if (gst) this.send(gst, { t: 'dreq', from: from.name }); }
  get combat() { return this.raiding ? this.app.raid.combat : this.g.combat; }
  ground(x, z) { return this.raiding ? this.app.raid.lair.heightAt(x, z) : this.g.world.heightAt(x, z); }
  unit(id) { if (!id) return null; for (const u of this.sim.units) if (u.id === id) return u; return null; }

  welcome(gst, ch) {
    if (!ch || !ch.cls) return;
    if (gst.proxy) { this.send(gst, { t: 'welcome', you: gst.proxy.id, host: this.me?.id, hostName: this.me?.name, tod: this.app.world.tod, zone: this.app.zoneId, pos: [r1(gst.proxy.pos.x), r1(gst.proxy.pos.z)], raid: this.raiding ? this.raidInfo() : null }); return; }
    const g = this.g, host = this.me;
    // join beside the host (or by the portal while the host is raiding)
    const base = this.raiding ? this.app.raid.worldPos : host?.pos || new THREE.Vector3(10, 0, 150);
    const a = Math.random() * Math.PI * 2, x = base.x + Math.cos(a) * 3, z = base.z + Math.sin(a) * 3;
    const u = new Unit({ name: ch.name, kind: 'remote', hostile: false, level: ch.level || 1, cls: ch.cls, race: ch.race, sex: ch.sex, pos: new THREE.Vector3(x, g.world.heightAt(x, z), z) });
    u.remote = gst.id; u.appearance = ch.appearance || {}; u.equip = ch.equip || {};
    g.levelStats(u); u.hp = u.hpMax; u.power = u.powerType === 'rage' ? 0 : u.powerMax;
    g.addModel(u, ['humanoid', { race: u.race, sex: u.sex, cls: u.cls, ...u.appearance, gearTier: ch.look || 0, seed: u.appearance.seed ?? 7 }]);
    g.sim.add(u);
    gst.proxy = u; gst.known.clear(); this.byProxy.set(u, gst);
    // back from a refresh: rejoin the group they dropped out of. Arriving for the first time: group up with the host
    // (a full group makes room by dropping a SimPlayer). Either can leave or invite later like any other group.
    const soc = g.social, lost = this.lost.get(u.name); this.lost.delete(u.name);
    const was = lost?.unit, party0 = was?.offline && was.party;
    if (party0) { // take the offline slot back
      party0.all[party0.all.indexOf(was)] = u; u.party = party0; was.party = null;
      if (party0.leader === was) party0.leader = u;
      soc.tellParty(party0, `${u.name} is back online.`); soc.changed();
    } else if (host && !lost) {
      let party = host.party;
      if (!party) { party = new Party(host); host.party = party; }
      if (party.full) { const sim = party.all.find(m => m.kind === 'sim'); if (sim) soc.leave(sim); }
      if (!party.full) soc.join(party, u);
    }
    this.app.ui.alerts.info(`${u.name} has joined your world!`);
    bus.emit('sound', { name: 'questComplete' });
    this.send(gst, { t: 'welcome', you: u.id, host: host?.id, hostName: host?.name, tod: this.app.world.tod, zone: this.app.zoneId, pos: [r1(x), r1(z)], raid: this.raiding ? this.raidInfo() : null });
    this.send(gst, { t: 'kills', l: knownKills(this.app.dragon.day) }); // today's boards include each other
    this.badge.render();
  }
  removeProxy(gst) {
    const u = gst.proxy; if (!u) return;
    const soc = this.g.social;
    this.g.duels?.forfeit(u);
    this.app.waypoints?.remove(u);
    for (const [to, inv] of soc.invites) if (to === u || inv.from === u) soc.invites.delete(to);
    this.lost.set(u.name, { unit: u, at: performance.now() }); // back after a refresh: grouped as they were, not auto-grouped again
    if (u.party && this.closing) soc.leave(u, true); // the world is closing: nobody is coming back
    else if (u.party) { // like WoW, a friend who drops stays in the group (offline) for a while: a refresh puts them back in their slot
      const party = u.party;
      u.offline = true;
      if (party.leader === u) { const next = party.humans().find(m => !m.offline); if (next) { party.leader = next; soc.tellParty(party, `${next.name} is now the group leader.`); } }
      soc.tellParty(party, `${u.name} has gone offline.`); soc.changed();
      setTimeout(() => { if (u.offline && u.party) soc.leave(u); }, 180000);
    }
    this.app.companions?.setMount(u, null);
    for (const s of [this.g.sim, this.app.raid?.sim]) s?.remove(u);
    if (this.app.raid) this.app.raid.raiders = this.app.raid.raiders.filter(m => m !== u);
    for (const m of this.sim.units) { m.threat?.delete(u); if (m.target === u) m.target = null; }
    soc.post('system', null, `${u.name} has left the game.`);
    this.byProxy.delete(u); gst.proxy = null;
  }
  move(p, m) {
    p.pos.set(m.x, m.y, m.z); p.facing = m.f;
    const a = m.a || [];
    Object.assign(p.stateAnim, { speed: a[0] || 0, strafe: a[1] || 0, grounded: !!a[2], vy: a[3] || 0, swimming: !!a[4], sit: !!a[5], combat: !!a[6] || p.inCombat });
    p.swimming = !!a[4]; p.grounded = !!a[2];
    const mt = MOUNT_BY_CODE[a[7]] || null; if ((p.mount || null) !== mt) this.app.companions?.setMount(p, mt);
    if ((a[0] || a[1]) && p.casting && !p.casting.channel) this.combat.interrupt(p, 'Interrupted');
  }
  useItem(p, use, id) {
    if (!p || p.dead) return;
    if (use === 'eatWell') { if (!p.inCombat) { p.addAura('eating', p); p.addAura('wellFed', p); } return; }
    if (use === 'elixir') { p.addAura(id === 'potionEmber' ? 'emberTonic' : 'mawElixir', p); return; }
    if (use === 'firework') { firework(this.combat, p.pos); return; }
    if (use === 'healPotion') this.combat.heal(p, p, 40 + p.level * 18);
    else if (use === 'manaPotion') p.gain(50 + p.level * 22);
    else if (use === 'eat' || use === 'drink') { if (!p.inCombat) p.addAura(use === 'eat' ? 'eating' : 'drinking', p); }
  }
  revive(p, m) {
    if (!p || !p.dead) return;
    p.dead = false; p.hp = Math.round(p.hpMax * 0.5); if (p.powerType === 'mana') p.power = Math.round(p.powerMax * 0.5);
    p.auras = []; p.stateAnim.dead = false; p.model?.revive?.();
    if (m.x !== undefined) { p.pos.set(m.x, this.ground(m.x, m.z), m.z); }
    bus.emit('fx', { name: 'resurrect', pos: p.pos.clone() });
  }
  stats(p, m) {
    if (!p) return;
    if (m.level) p.level = m.level;
    if (m.equip) p.equip = m.equip;
    this.g.levelStats(p);
    if (m.look !== undefined && m.look !== p.gearLook) { p.gearLook = m.look; p.model?.setGear?.(`${p.cls}:${m.look}`); }
  }
  chat(gst, m) {
    const p = gst.proxy; if (!p || !m.text) return;
    const text = String(m.text).slice(0, 240), soc = this.g.social, host = this.me;
    if (m.ch === 'whisper') {
      const to = String(m.to || '').toLowerCase();
      if (host && to === host.name.toLowerCase()) { soc.post('whisper', p, text, { to: 'you' }); soc.lastWhisperFrom = p; bus.emit('sound', { name: 'whisper' }); return; }
      const other = [...this.guests.values()].find(o => o.proxy && o.name.toLowerCase() === to);
      if (other) { this.queue(other, 'chat', { ch: 'whisper', from: p.name, cls: p.cls, text, to: 'you' }); return; }
      const sim = soc.findSim?.(m.to);
      if (sim) { soc.replyTo?.(p, 'whisper_out', text, sim); return; }
      this.queue(gst, 'chat', { ch: 'system', text: `No player named '${m.to}' is currently playing.` });
      return;
    }
    const ch = ['say', 'yell', 'party', 'general', 'trade', 'lfg', 'raid'].includes(m.ch) ? m.ch : 'say';
    if (ch === 'party' && !p.party) { soc.tell(p, "You aren't in a group."); return; }
    soc.post(ch, p, text, { $from: gst.id });
    if (ch === 'say' || ch === 'yell') bus.emit('bubble', { unit: p, text, $from: gst.id });
    soc.replyTo?.(p, ch, text);
  }

  // ---------------------------------------------------------------- events → guests
  onEvent(type, d) {
    if (!d || d.$net) return;
    if (type === 'chat') return this.onChat(d);
    if (OWNER.has(type)) { const gst = this.byProxy.get(d.unit); if (gst) this.queue(gst, type, d); return; }
    if (PARTY.has(type)) { const u = d.unit; for (const gst of this.guests.values()) if (gst.proxy && gst.id !== d.$from && gst.proxy !== u && u?.party && gst.proxy.party === u.party) this.queue(gst, type, d); return; }
    const raid = this.raiding;
    if (raid && RAIDWIDE.has(type)) { for (const gst of this.guests.values()) if (gst.proxy) this.queue(gst, type, d); return; }
    if (!WORLD.has(type)) return;
    if (type === 'sound' && !d.pos && !raid) return;           // host UI sounds stay here
    const at = d.pos?.isVector3 ? d.pos : (d.unit || d.dst || d.src)?.pos;
    for (const gst of this.guests.values()) {
      const me = gst.proxy; if (!me || gst.id === d.$from) continue;
      if (type === 'anim' && d.unit === me) continue;             // their own browser animates them
      const mine = d.unit === me || d.src === me || d.dst === me || d.target === me;
      if (mine || raid || !at || Math.hypot(at.x - me.pos.x, at.z - me.pos.z) < RANGE) this.queue(gst, type, d);
    }
  }
  onChat(d) {
    if (d.$toGuest) { const gst = this.guests.get(d.$toGuest); if (gst?.proxy) this.queue(gst, 'chat', { ...d, to: 'you', hideLocal: undefined, $toGuest: undefined }); return; }
    if (d.hideLocal || d.$local) return;
    for (const gst of this.guests.values()) {
      if (!gst.proxy || gst.id === d.$from) continue;
      if (d.ch === 'party' && !(d.unit?.party && d.unit.party === gst.proxy.party)) continue; // party chat stays in the group
      const near = CHAT_NEAR[d.ch];
      if (near) { const at = d.unit?.pos; if (at && Math.hypot(at.x - gst.proxy.pos.x, at.z - gst.proxy.pos.z) > near && !this.raiding) continue; }
      else if (!CHAT_ALL.has(d.ch)) continue;                    // system, whispers, guild: the host's own
      this.queue(gst, 'chat', d);
    }
  }
  queue(gst, type, d) {
    // spells travel by id (the guest has the same table); only ad-hoc casts carry their name and icon
    let src = d;
    if (type === 'chat' && d.unit && d.unit !== gst.proxy && !gst.known.has(d.unit.id)) src = { ...d, unit: undefined }; // a speaker they can't see
    if (d.spell) { const { spell, ...rest } = d; src = rest; const sid = d.id ?? d.spellId; if (!(sid && SPELLS[sid])) src.spellInline = { name: spell.name, icon: spell.icon, anim: spell.anim }; }
    const data = enc(src);
    if (!data) return;
    delete data.$from;
    gst.out.push([type, data]);
  }

  // ---------------------------------------------------------------- snapshots
  update(dt) {
    for (const gst of this.guests.values()) if (gst.out.length) { this.send(gst, { t: 'e', l: gst.out }); gst.out = []; }
    this.acc += dt; this.todT -= dt;
    if (this.acc < SNAP_EVERY) return;
    this.acc = 0;
    const tod = this.todT <= 0 ? r2(this.app.world.tod) : undefined; if (tod !== undefined) this.todT = 5;
    for (const gst of this.guests.values()) if (gst.proxy) this.snapshot(gst, tod);
  }
  snapshot(gst, tod) {
    const me = gst.proxy, host = this.me, out = { t: 's' }, sp = [], rows = [], seen = new Set();
    const party = me.party;
    for (const u of this.sim.units) {
      if (u === me || u.kind === 'critter' || u.kind === 'node' || u.kind === 'object' || (u.kind === 'npc' && !this.raiding)) continue; // ore, herbs and bobbers are each player's own
      const d = Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z);
      if (d > RANGE && !(party && u.party === party) && u !== host && !this.raiding) continue;
      seen.add(u.id);
      if (!gst.known.has(u.id)) { sp.push(unitSpawn(u)); gst.known.set(u.id, ''); }
      const row = this.row(u, me), sig = row.join('|');
      if (gst.known.get(u.id) !== sig) { rows.push(row); gst.known.set(u.id, sig); }
    }
    const gone = []; for (const id of gst.known.keys()) if (!seen.has(id)) { gone.push(id); gst.known.delete(id); }
    if (sp.length) out.sp = sp;
    if (rows.length) out.u = rows;
    if (gone.length) out.de = gone;
    out.me = this.meState(me);
    const pa = party ? `${party.leader?.id || 0};${party.all.map(m => m.id).join(',')}` : '';
    if (pa !== gst.pa) { out.pa = pa; gst.pa = pa; }
    if (tod !== undefined) out.tod = tod;
    if (this.raiding) { const rs = this.raidState(gst); if (rs) out.rs = rs; }
    this.send(gst, out);
  }
  // roster, roles, meter and phase for a guest's raid frames and damage meter (twice a second)
  raidState(gst) {
    const r = this.app.raid, now = r.totalT;
    if (gst.rsT !== undefined && now - gst.rsT < 0.5) return null;
    gst.rsT = now;
    const rs = { st: r.state, att: r.attempt, ph: r.boss.brain?.phase || 0, dur: r.fightStart !== undefined && (r.state === 'combat' || r.state === 'victory') ? r1((r.result ? r.result.killTime : now - r.fightStart)) : 0, bo: r.boss.id, le: r.leader?.id || 0,
      mt: r.raiders.map(m => [m.id, Math.round(m.meter.dmg), Math.round(m.meter.heal)]) };
    const ro = r.raiders.map(m => [m.id, m.raidRole]), sig = JSON.stringify(ro);
    if (sig !== gst.roSig) { rs.ro = ro; gst.roSig = sig; }
    return rs;
  }
  // [id, x, y, z, facing, hp, hpMax, speed, flags, target, castId, castT, castDur, level, auras, power]
  row(u, me) {
    const tapGroup = !!u.tapper && (u.tapper === me || (!!me.party && u.tapper === me.party)); // "yours" means this friend's (or their group's)
    const flags = (u.dead ? 1 : 0) | (u.inCombat ? 2 : 0) | (u.casting?.channel ? 4 : 0) | (tapGroup ? 8 : 0) | (u.tapper && !tapGroup ? 16 : 0)
      | (u.stateAnim.sit ? 32 : 0) | (u.swimming ? 64 : 0) | (u.flying ? 256 : 0) | (u.afk ? 512 : 0) | (u.ghost ? 1024 : 0) | (u.mount === 'strider' ? 2048 : u.mount === 'drake' ? 4096 : 0);
    const c = u.casting;
    const au = u.auras.length ? u.auras.map(a => `${a.id}:${a.stacks || 1}:${Math.ceil(a.rem)}:${Math.round(a.dur)}`).join(',') : 0;
    const row = [u.id, r1(u.pos.x), r1(u.pos.y), r1(u.pos.z), r2(u.facing), Math.round(u.hp), u.hpMax, r1(u.stateAnim.speed || 0), flags, u.target?.id || 0,
      c ? c.id : 0, c ? r1(c.t) : 0, c ? r1(c.dur) : 0, u.level, au, u.powerMax ? Math.round(u.power) : 0];
    if (u.boss) { const a = u.stateAnim; row.push([a.flying ? 1 : 0, a.enraged ? 1 : 0, r1(a.altitude || 0), r1(a.turn || 0)]); } // the dragon's flight
    return row;
  }
  meState(p) {
    const c = p.casting, cds = {};
    for (const [k, v] of p.cooldowns) cds[k] = r1(v);
    return {
      hp: Math.round(p.hp), hm: p.hpMax, pw: Math.round(p.power), pm: p.powerMax, dead: p.dead ? 1 : 0, ic: p.inCombat ? 1 : 0,
      cast: c ? [c.id, r2(c.t), r2(c.dur), c.channel ? 1 : 0, c.target?.id || 0] : 0, gcd: r2(p.gcd), gm: r2(p.gcdMax || 1.5), cds,
      au: p.auras.map(a => [a.id, r1(a.rem), r1(a.dur), a.stacks || 1, Math.round(a.absorb || 0), a.src?.id || 0]), aa: p.autoAttack ? 1 : 0,
      du: p.duel ? [(p.duel.a === p ? p.duel.b : p.duel.a).id, p.duel.live ? 1 : 0, r1(p.duel.x), r1(p.duel.z)] : 0,
    };
  }

  // ---------------------------------------------------------------- the raid, together
  raidInfo() { const r = this.app.raid; return r ? { dragon: { ...r.dragon }, attempt: r.attempt } : null; }
  /** The host is travelling to another zone: friends come along (their browsers load it too). */
  zoneStart(zone, arrive) {
    let i = 0;
    for (const gst of this.guests.values()) {
      if (!gst.proxy) continue;
      const a = (i++ / 4) * Math.PI * 2, x = arrive.x + Math.cos(a) * 3, z = arrive.z + Math.sin(a) * 3;
      this.send(gst, { t: 'zone', id: zone, x: r1(x), z: r1(z), f: r2(arrive.facing ?? 0) });
    }
  }
  zoneDone() {
    for (const u of this.proxies()) { const gst = this.byProxy.get(u); if (gst) gst.known.clear(); }
    this.resetKnown();
  }
  /** Host entered the raid with its friends in the roster: move every guest into their mirrored lair. */
  raidStart() {
    const r = this.app.raid; this.resultSent = false; this.raidLive = true;
    this.resetKnown();
    for (const gst of this.guests.values()) {
      if (!gst.proxy) continue;
      if (!r.raiders.includes(gst.proxy)) { this.send(gst, { t: 'e', l: [['chat', { ch: 'system', text: `${this.me.name} is raiding without you (the raid formed before you arrived).` }]] }); continue; }
      this.send(gst, { t: 'raid', dragon: { ...r.dragon }, attempt: r.attempt });
      this.force(gst.proxy, gst.proxy.pos.x, gst.proxy.pos.z, { face: gst.proxy.facing });
    }
  }
  /** After a wipe the raid lines up at the entrance again: guests' own browsers own their positions. */
  raidReset() { if (this.raidLive) for (const u of this.proxies()) this.force(u, u.pos.x, u.pos.z, { face: u.facing }); }
  /** A knockback or charge the raid applied to a friend: they play it out locally. */
  forceDash(u, d) { this.force(u, d.to.x, d.to.z, { dash: r2(d.dur), knock: d.knock ? 1 : 0 }); }
  raidVictory(result) {
    if (this.resultSent) return; this.resultSent = true;
    const res = { killTime: result.killTime, attempts: result.attempts, meter: result.meter.map(m => ({ name: m.name, cls: m.cls, dmg: m.dmg, heal: m.heal, dead: m.dead, avoidable: m.avoidable })) };
    for (const gst of this.guests.values()) if (gst.proxy && this.app.raid?.raiders.includes(gst.proxy)) this.send(gst, { t: 'raid_result', res });
  }
  giveLoot(u, item) { const gst = this.byProxy.get(u); if (gst) this.send(gst, { t: 'loot_won', item }); }
  /** Host left the raid: friends come back to the Vale beside the portal. */
  raidEnd(base) {
    this.resetKnown(); this.raidLive = false;
    let i = 0;
    for (const gst of this.guests.values()) {
      const u = gst.proxy; if (!u) continue;
      this.app.raid?.sim.remove(u);
      if (!this.g.sim.units.includes(u)) this.g.sim.add(u);
      this.app.world.scene.add(u.model.root);
      const a = (i++ / 3) * Math.PI - Math.PI / 2, x = base.x + Math.cos(a) * 3, z = base.z + 3 + Math.sin(a) * 2;
      u.pos.set(x, this.g.world.heightAt(x, z), z); u.dead = false; u.hp = Math.max(u.hp, u.hpMax * 0.5); u.auras = []; u.stateAnim.dead = false; u.model?.revive?.();
      u.dash = null; u.target = null; u.autoAttack = false; u.casting = null;
      this.send(gst, { t: 'raid_end' });
      this.force(u, x, z, { face: 0 });
    }
  }
  broadcast(m) { for (const gst of this.guests.values()) if (gst.proxy) this.send(gst, m); }
  proxies() { return [...this.guests.values()].map(g => g.proxy).filter(Boolean); }
  resetKnown() { for (const gst of this.guests.values()) { gst.known.clear(); gst.pa = null; } }
  force(u, x, z, extra = {}) { const gst = this.byProxy.get(u); if (gst) this.send(gst, { t: 'force', x: r1(x), z: r1(z), ...extra }); }
  /** Stop hosting: tell friends the world is closing (so they stop trying to reconnect) and take their avatars away. */
  close() {
    this.closing = true;
    this.broadcast({ t: 'closing', host: this.me?.name });
    for (const gst of [...this.guests.values()]) this.leave(gst.id);
    setTimeout(() => this.dispose(), 400);
  }
  dispose() { if (this.disposed) return; this.disposed = true; this.untap(); this.net.close(); this.badge.remove(); }
}

// A small corner badge: who's here and the invite link to share.
class HostBadge {
  constructor(app, s) {
    lobbyStyles();
    this.app = app; this.s = s; this.note = null;
    const el = this.el = document.createElement('div');
    el.className = 'evd-netbadge';
    el.innerHTML = '<b>Hosting</b><span class="code"></span><span class="who"></span><button type="button">Copy invite link</button><span class="msg"></span>';
    el.querySelector('button').addEventListener('click', () => this.copy());
    document.body.appendChild(el);
    this.render();
  }
  render() {
    const s = this.s, here = [...s.guests.values()].filter(g => g.proxy).map(g => g.proxy.name);
    this.el.querySelector('.code').textContent = s.code ? `Room ${s.code}` : 'Opening…';
    this.el.querySelector('.who').textContent = this.note || (here.length ? `${here.join(', ')} ${here.length === 1 ? 'is' : 'are'} here` : s.code ? 'Waiting for friends' : '');
    this.el.querySelector('button').hidden = !s.code;
  }
  copy() {
    const url = this.s.invite; if (!url) return;
    const m = this.el.querySelector('.msg');
    navigator.clipboard?.writeText(url).then(() => { m.textContent = 'Copied'; setTimeout(() => { m.textContent = ''; }, 1800); }, () => { m.textContent = url; });
  }
  remove() { this.el.remove(); }
}
