// The realm's population: SimPlayer spawning, chat channels, reactions, parties, guild, duels, whispers, slash commands.
import * as THREE from 'three';
import { Unit } from './unit.js';
import { SimBrain } from './ai/sim.js';
import { CLASSES, RACES } from './data/classes.js';
import { NAME_PARTS, CURATED_NAMES, GUILDS, ARCHETYPES, LINES, REACT, WHISPERS, REPLIES, DEFAULT_REPLY } from './data/chat.js';
import { ITEMS } from './items.js';
import { PLACES } from '../world/zone.js';
import { bus } from './events.js';
import { RNG } from '../core/noise.js';
import { Voices } from './voices.js';
import { areaAt } from './map.js';
import { Party, isHuman } from './party.js';

const VIS_CLASSES = ['warrior', 'mage', 'priest', 'rogue', 'hunter', 'paladin', 'warrior', 'mage', 'priest'];
const RACE_KEYS = Object.keys(RACES);
const pick = (rng, a) => a[Math.floor(rng.next() * a.length)];

export class Social {
  constructor(game) {
    this.g = game;
    this.voices = new Voices();
    this.rng = new RNG((Date.now() / 1000) | 0);
    this.sims = [];
    this.names = new Set();
    this.chatT = 2.5; this.eerieT = 150 + this.rng.next() * 150; this.whisperT = 40 + this.rng.next() * 40; this.inviteT = 70 + this.rng.next() * 60;
    this.guild = null; this.guildOfferT = 120 + this.rng.next() * 90;
    this.invites = new Map(); // invitee → { from, t }: group invitations waiting for an answer
    this.queue = []; // delayed actions {t, fn}
    this.lastWhisperFrom = null;
    this.pendingPopup = null;
    bus.on('level_up', e => this.onPlayerLevel(e));
    bus.on('player_died', () => this.onPlayerDeath());
    bus.on('death', e => this.onDeath(e));
    bus.on('loot_item', e => { if (e.item && (e.item.rarity === 'epic' || e.item.rarity === 'rare')) this.react(e.item.rarity === 'epic' ? 'epic' : 'epic', 0.6); });
    const near = (u, r) => { const p = this.g.player; if (!p) return false; return !u?.pos || u === p || Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < r; };
    bus.on('say', e => { if (near(e.unit, e.yell ? 110 : 35)) { this.post(e.yell ? 'yell' : 'say', e.unit, e.text); bus.emit('bubble', { unit: e.unit, text: e.text, yell: e.yell }); } });
    bus.on('emote', e => { if (near(e.unit, 40)) this.post('emote', e.unit, e.text); });
  }

  // ------------------------------------------------------------ population
  makeName() {
    const rng = this.rng;
    for (let i = 0; i < 50; i++) {
      let n;
      if (rng.next() < 0.45) n = pick(rng, CURATED_NAMES);
      else { n = pick(rng, NAME_PARTS.pre) + pick(rng, NAME_PARTS.post); if (rng.next() < 0.12) n += Math.floor(rng.next() * 99); }
      n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
      if (rng.next() < 0.06) n = n.replace(/a/, 'á').replace(/e/, 'ë');
      if (!this.names.has(n) && n !== this.g.player?.name) { this.names.add(n); return n; }
    }
    return 'Player' + Math.floor(rng.next() * 9999);
  }

  spawnPopulation(n = 34) {
    for (let i = 0; i < n; i++) this.spawnSim();
    // a guild roster the player may join later
    this.guildName = pick(this.rng, GUILDS);
    const roster = this.sims.filter((_, i) => i % 3 === 0);
    for (const s of roster) s.guild = this.guildName;
    for (const s of this.sims) if (!s.guild && this.rng.next() < 0.45) s.guild = pick(this.rng, GUILDS.filter(x => x !== this.guildName));
  }

  spawnSim(o = {}) {
    const rng = this.rng, g = this.g;
    const cls = o.cls || pick(rng, VIS_CLASSES);
    const race = o.race || pick(rng, RACE_KEYS);
    const archKeys = Object.keys(ARCHETYPES);
    const arch = o.arch || pick(rng, archKeys);
    const level = o.level || Math.max(1, Math.min(10, Math.round(1 + rng.next() * 9.6)));
    let x, z, tries = 0;
    do { // spawn around town or on roads
      const a = rng.next() * 6.28, r = 20 + rng.next() * 200;
      x = PLACES.village.x + Math.cos(a) * r * 0.9; z = PLACES.village.z - 60 + Math.sin(a) * r; tries++;
    } while ((g.world.heightAt(x, z) < 0.8 || g.world.hf.slopeAt(x, z) > 0.4) && tries < 30);
    const u = new Unit({ name: o.name || this.makeName(), kind: 'sim', hostile: false, level, cls, race, sex: rng.next() < 0.42 ? 'f' : 'm', pos: new THREE.Vector3(x, g.world.heightAt(x, z), z) });
    u.persona = { arch, skill: ARCHETYPES[arch].skill * (0.7 + rng.next() * 0.3), chatty: ARCHETYPES[arch].chatty };
    u.role = cls === 'priest' || (cls === 'paladin' && rng.next() < 0.5) ? 'heal' : (cls === 'warrior' && rng.next() < 0.4) ? 'tank' : 'dps';
    u.gearTier = Math.min(3, Math.floor(level / 4 + rng.next() * 1.3));
    const statCls = CLASSES[cls].power === 'mana' && cls !== 'paladin' ? (cls === 'hunter' ? 'hunter' : cls) : 'warrior';
    u.cls = cls;
    this.statsFor(u, statCls);
    u.facing = rng.next() * 6.28;
    g.addModel(u, ['humanoid', { race, sex: u.sex, cls, gearTier: u.gearTier, seed: u.id * 97 }]);
    g.sim.add(u);
    u.brain = new SimBrain(u, g, this);
    this.sims.push(u);
    return u;
  }

  statsFor(u, statCls) {
    const c = CLASSES[statCls === 'hunter' ? 'mage' : statCls] || CLASSES.warrior, L = u.level;
    u.base.hp = (c.hpBase + c.hpPer * L) * (1 + u.gearTier * 0.08);
    u.base.mana = (c.manaBase || 60) + (c.manaPer || 15) * L;
    u.base.sp = 2 + L * 2.2 + u.gearTier * 3; u.base.ap = 10 + L * 4 + u.gearTier * 6; u.base.crit = 6;
    u.base.dmgMin = 4 + L * 2.8; u.base.dmgMax = 8 + L * 3.8; u.base.swing = u.cls === 'rogue' ? 2.0 : 2.8;
    u.base.armor = 40 + L * 18;
    u.powerType = u.cls === 'rogue' ? 'energy' : u.cls === 'warrior' ? 'rage' : 'mana';
    u.recalc(); u.hp = u.hpMax; u.power = u.powerType === 'rage' ? 0 : u.powerMax;
  }

  respawnSim(u) {
    const g = this.g;
    u.dead = false; u.brain.deadT = 0; u.hp = u.hpMax; u.auras = []; u.target = null; u.threat.clear(); u.inCombat = false;
    const x = 52 + (this.rng.next() - 0.5) * 6, z = 118 + (this.rng.next() - 0.5) * 6;
    u.pos.set(x, g.world.heightAt(x, z), z);
    u.stateAnim.dead = false; u.model?.revive?.();
    u.brain.choose();
    if (this.rng.next() < 0.3) this.post('general', u, pick(this.rng, ['that wolf came out of nowhere', 'rip me', 'corpse run time', 'who put that mob there', 'i was afk i swear']));
  }

  // ------------------------------------------------------------ chat
  fmt(text, from) {
    const rng = this.rng;
    const other = this.sims.length ? pick(rng, this.sims).name : 'someone';
    const items = Object.entries(ITEMS).filter(([, d]) => !d.use || d.rarity !== 'poor');
    const links = [];
    text = text.replace(/\{item\}/g, () => { const [id, d] = pick(rng, items); links.push({ id, name: d.name, rarity: d.rarity }); return `[${d.name}]`; });
    for (const m of text.matchAll(/\[([^\]]+)\]/g)) if (!links.find(l => l.name === m[1])) { const e = Object.entries(ITEMS).find(([, d]) => d.name === m[1]); if (e) links.push({ id: e[0], name: m[1], rarity: e[1].rarity }); }
    text = text.replace(/\{p\}/g, this.g.player?.name || 'friend').replace(/\{t\}/g, other).replace(/\{n\}/g, from?.name || '');
    return { text, links };
  }
  post(ch, from, text, extra = {}) {
    const { text: t, links } = this.fmt(text, from);
    bus.emit('chat', { ch, from: from?.name || from, unit: typeof from === 'object' ? from : null, cls: from?.cls, text: t, links, guild: from?.guild, ...extra });
  }
  later(t, fn) { this.queue.push({ t, fn }); }

  ambient() {
    const rng = this.rng, online = this.sims.filter(s => !s.dead);
    if (!online.length) return;
    // weighted by chattiness, but nobody holds the channel: the last few speakers sit the next lines out
    this.recentSpeakers ||= [];
    const fresh = online.length > 6 ? online.filter(x => !this.recentSpeakers.includes(x)) : online;
    let s = pick(rng, fresh); for (let i = 0; i < 4 && rng.next() > s.persona.chatty; i++) s = pick(rng, fresh);
    this.recentSpeakers.push(s); if (this.recentSpeakers.length > 5) this.recentSpeakers.shift();
    const pools = ARCHETYPES[s.persona.arch].pools;
    let pool = pick(rng, pools);
    let ch = 'general';
    if (pool === 'trade') ch = 'trade'; else if (pool === 'lfg') ch = 'lfg';
    if (rng.next() < 0.06) { pool = 'localdefense'; ch = 'localdefense'; }
    if (this.guild && s.guild === this.guild && rng.next() < 0.45) ch = 'guild';
    // avoid repeating anything said recently
    this.recent = this.recent || [];
    const src = LINES[pool] || LINES.general;
    let line = pick(rng, src);
    for (let k = 0; k < 12 && this.recent.includes(line); k++) line = pick(rng, src);
    if (this.recent.includes(line)) return;
    this.recent.push(line); if (this.recent.length > 70) this.recent.shift();
    if (line.startsWith('/')) { s.model?.play?.('dance'); s.dancing = true; const p = this.g.player; if (p && Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z) < 40) this.post('emote', s, `${s.name} bursts into dance.`); return; }
    this.post(ch, s, line);
    // conversations: questions get answers, sometimes trolls
    if (pool === 'question' && rng.next() < 0.85) {
      const answerer = pick(rng, online.filter(o => o !== s));
      if (answerer) this.later(2 + rng.next() * 5, () => this.post(ch, answerer, pick(rng, answerer.persona.arch === 'troll' ? LINES.troll : LINES.answer)));
      if (rng.next() < 0.35) { const b = pick(rng, online); this.later(6 + rng.next() * 5, () => this.post(ch, b, pick(rng, ['^', 'this', 'lol', 'also wondering', 'same q']))); }
    }
    if (line === 'LEEEEEROOOOOOY') this.later(1.5, () => this.post('general', pick(rng, online), pick(rng, ['omg', 'lol classic', 'at least he has chicken', 'every single time'])));
  }

  eerie() {
    const rng = this.rng, online = this.sims.filter(s => !s.dead);
    const s = pick(rng, online); if (!s) return;
    this.post(rng.next() < 0.5 ? 'general' : 'whisper', s, pick(rng, LINES.eerie), { to: 'you' });
  }

  react(kind, chance = 0.8, chans = null) {
    const rng = this.rng;
    const who = this.party ? this.party.members.filter(m => m.kind === 'sim') : []; // a friend's lines are their own
    const guildies = this.guild ? this.sims.filter(s => s.guild === this.guild && !s.dead) : [];
    const pool = [...who.map(w => ['party', w]), ...guildies.slice(0, 6).map(w => ['guild', w])];
    rng.shuffle(pool);
    let n = 0;
    for (const [ch, s] of pool) {
      if (rng.next() > chance / (1 + n * 0.8)) continue;
      n++;
      this.later(0.6 + rng.next() * 3.5 + n * 0.7, () => this.post(ch, s, pick(rng, REACT[kind])));
      if (n >= 4) break;
    }
  }

  onPlayerLevel(e) {
    this.react('ding', 0.95);
    if (!this.guild && !this.party && e.level >= 3 && this.rng.next() < 0.5) this.later(4, () => { const s = pick(this.rng, this.sims); this.post('general', s, `gz ${this.g.player.name}`); });
  }
  onPlayerDeath() { this.react('death', 0.9); }

  onDeath({ unit, killer }) {
    if (killer?.brain?.onKill) killer.brain.onKill();
    // KS drama: a SimPlayer was fighting this mob but the player landed the kill
    if (killer === this.g.player && unit.hostile) {
      const rival = this.sims.find(s => s.target === unit && !s.dead && s.party !== this.party);
      if (rival && this.rng.next() < 0.5) this.later(1 + this.rng.next() * 2, () => this.post('say', rival, pick(this.rng, REACT.ks)));
    }
    if (unit.kind === 'sim' && unit.party && this.party === unit.party && this.rng.next() < 0.6) this.later(2, () => this.post('party', unit, pick(this.rng, ['rip me', 'oops', 'my bad', 'lag', 'res pls'])));
  }

  // ------------------------------------------------------------ parties
  // This browser decides who is grouped with whom (solo, or hosting co-op); a friend's requests arrive from
  // net/host.js as the same calls, and `tell` reaches their chat through the host's relay.
  get party() { return this.g.player?.party || null; }
  set party(v) { if (this.g.player) this.g.player.party = v; }
  tell(u, text) {
    if (!u) return;
    if (u === this.g.player) this.post('system', null, text);
    else if (u.kind === 'remote' && u.remote) bus.emit('chat', { ch: 'system', text, hideLocal: true, $toGuest: u.remote });
  }
  tellParty(p, text, except = null) { for (const m of p.humans()) if (m !== except) this.tell(m, text); }
  /** A sim's whisper to a human (yours shows here, a friend's goes to their browser). */
  whisperTo(u, sim, text) {
    if (u === this.g.player) { this.post('whisper', sim, text, { to: 'you' }); this.lastWhisperFrom = sim; }
    else if (u?.kind === 'remote') this.post('whisper', sim, text, { to: u.name, hideLocal: true, $toGuest: u.remote });
  }

  invite(from, to) {
    if (!from || !to || to === from) return;
    const p = from.party;
    if (to.party && to.party === p) return this.tell(from, `${to.name} is already in your group.`);
    if (to.party) return this.tell(from, `${to.name} is already in a group.`);
    if (p?.full) return this.tell(from, 'Your party is full.');
    const pending = this.invites.get(to);
    if (pending && pending.from !== from) return this.tell(from, `${to.name} is considering another invitation.`);
    this.tell(from, `You have invited ${to.name} to join your group.`);
    this.invites.set(to, { from, t: 60 });
    if (to.kind === 'sim') {
      this.later(1 + this.rng.next() * 2.5, () => {
        if (this.invites.get(to)?.from !== from) return;
        if (!to.dead && this.rng.next() < (to.persona.arch === 'afk' ? 0.2 : 0.8)) { if (this.acceptInvite(to)) this.later(0.8, () => this.post('party', to, pick(this.rng, REACT.inviteYes))); }
        else { this.declineInvite(to); this.whisperTo(from, to, pick(this.rng, REACT.inviteNo)); }
      });
    } else if (to === this.g.player) bus.emit('popup', { kind: 'invite', from: from.name, onAccept: () => this.acceptInvite(to), onDecline: () => this.declineInvite(to) });
    else if (to.kind === 'remote') this.g.e?.net?.partyInvite?.(to, from);
  }
  acceptInvite(to) {
    const inv = this.invites.get(to); if (!inv) return false;
    this.invites.delete(to);
    const from = inv.from;
    if (to.party) { this.tell(to, 'You are already in a group.'); return false; }
    if (from.kind === 'remote' && !this.g.e?.net?.proxies?.().includes(from)) { this.tell(to, `${from.name} is no longer online.`); return false; }
    let p = from.party;
    if (!p) { p = new Party(from); from.party = p; }
    if (p.full) { this.tell(to, 'That group is full.'); return false; }
    this.join(p, to);
    return true;
  }
  declineInvite(to) {
    const inv = this.invites.get(to); if (!inv) return;
    this.invites.delete(to);
    this.tell(inv.from, `${to.name} declines your group invitation.`);
  }
  /** Put u in group p (leaving any other group first). A SimPlayer's group is led by the first human who joins it. */
  join(p, u, { quiet = false } = {}) {
    if (!p || u.party === p) return;
    if (u.party) this.leave(u, true);
    p.all.push(u); u.party = p;
    if (!isHuman(p.leader) && isHuman(u)) p.leader = u;
    if (!quiet) {
      for (const m of p.humans()) if (m !== u) this.tell(m, `${u.name} joins the party.`);
      if (isHuman(u)) this.tell(u, p.leader === u ? 'You are now the group leader.' : `You join ${p.leader.name}'s group.`);
    }
    for (const m of p.all) if (m.kind === 'sim' && m.brain?.act !== 'follow') m.brain?.set('follow');
    this.changed();
  }
  leave(u, quiet = false) {
    const p = u?.party; if (!p) return;
    p.all = p.all.filter(m => m !== u); u.party = null;
    this.invites.delete(u);
    if (u.kind === 'sim') u.brain?.choose();
    if (!quiet) { this.tell(u, 'You leave the group.'); this.tellParty(p, `${u.name} leaves the party.`); }
    if (p.all.length < 2 || !p.humans().some(m => !m.offline)) { this.disband(p, u); return; } // nobody left who is here
    if (p.leader === u) { p.leader = p.humans().find(m => !m.offline) || p.humans()[0]; this.tellParty(p, `${p.leader.name} is now the group leader.`); }
    this.changed();
  }
  disband(p, last = null) {
    const left = [...p.all];
    p.all = [];
    for (const m of left) { m.party = null; if (m.kind === 'sim') m.brain?.choose(); else this.tell(m, 'Your group has been disbanded.'); }
    // mobs the group had tagged stay tagged by whoever was left holding it (not by a group nobody is in)
    const heir = left.find(isHuman) || left[0] || last;
    for (const s of [this.g.sim, this.g.e?.raid?.sim]) for (const m of s?.units || []) if (m.tapper === p) m.tapper = heir;
    this.changed();
  }
  kick(by, u) {
    const p = by?.party;
    if (!u || !p || u.party !== p) return this.tell(by, `${u?.name || 'That player'} is not in your group.`);
    if (u === by) return this.leave(by);
    if (p.leader !== by) return this.tell(by, 'You are not the party leader.');
    this.tell(u, 'You have been removed from the group.');
    this.leave(u, true);
    if (p.all.length) this.tellParty(p, `${u.name} has been removed from the group.`);
  }
  promote(by, u) {
    const p = by?.party;
    if (!u || !p || u.party !== p) return this.tell(by, `${u?.name || 'That player'} is not in your group.`);
    if (p.leader !== by) return this.tell(by, 'You are not the party leader.');
    if (!isHuman(u)) return this.tell(by, `${u.name} doesn't want to lead.`);
    p.leader = u; this.tellParty(p, `${u.name} is now the group leader.`); this.changed();
  }
  changed() { bus.emit('party_changed', { party: this.party }); }
  invitePlayer(s) { // a SimPlayer invites you
    const p = this.g.player;
    if (!p || p.party || s.party || this.invites.has(p)) return;
    this.invites.set(p, { from: s, t: 60 });
    bus.emit('popup', { kind: 'invite', from: s.name, onAccept: () => { if (this.acceptInvite(p)) this.later(1.5, () => this.post('party', s, pick(this.rng, ['hi!', 'o/', 'lets gooo', 'ty for joining', 'what quest u on?']))); }, onDecline: () => { this.declineInvite(p); this.later(1, () => this.whisperTo(p, s, pick(this.rng, ['k', 'ok :(', 'np', 'rude']))); } });
  }
  playerInvite(name) {
    const p = this.g.player, s = this.findPlayer(name);
    if (!s || s === p) return this.post('system', null, name ? `No player named '${name}' is currently playing.` : 'Invite whom? Type /invite and a name, or right-click a player.');
    this.invite(p, s);
  }
  /** SimPlayers, co-op friends and you, by name (a unique prefix of three letters or more is enough). */
  findPlayer(name) {
    name = String(name || '').trim().toLowerCase(); if (!name) return null;
    const people = [this.g.player, ...this.sims, ...this.g.sim.units.filter(u => u.kind === 'remote')].filter(Boolean);
    return people.find(s => s.name.toLowerCase() === name) || (name.length >= 3 ? people.find(s => s.name.toLowerCase().startsWith(name)) : null) || null;
  }
  findSim(name) { name = (name || '').toLowerCase(); return this.sims.find(s => s.name.toLowerCase() === name) || this.sims.find(s => s.name.toLowerCase().startsWith(name) && name.length >= 3); }

  // ------------------------------------------------------------ player input
  playerChat(raw, defaultCh = 'say') {
    const p = this.g.player; raw = raw.trim(); if (!raw) return;
    let ch = defaultCh, text = raw, to = null;
    if (raw.startsWith('/')) {
      const [cmd0, ...rest] = raw.slice(1).split(' '); const cmd = cmd0.toLowerCase(); const arg = rest.join(' ');
      const EMOTES = { dance: 'dance', wave: 'wave', cheer: 'cheer', laugh: 'laugh', lol: 'laugh', bow: 'bow', point: 'point', roar: 'roar', kneel: 'kneel', sit: 'sit', hug: 'wave', salute: 'bow', flex: 'roar', cry: 'kneel' };
      if (EMOTES[cmd]) return this.playerEmote(cmd, EMOTES[cmd]);
      switch (cmd) {
        case 's': case 'say': ch = 'say'; text = arg; break;
        case 'y': case 'yell': ch = 'yell'; text = arg; break;
        case 'p': case 'party': if (!this.party) return this.post('system', null, 'You are not in a party.'); ch = 'party'; text = arg; break;
        case 'g': case 'guild': if (!this.guild) return this.post('system', null, 'You are not in a guild.'); ch = 'guild'; text = arg; break;
        case '1': ch = 'general'; text = arg; break;
        case '2': ch = 'trade'; text = arg; break;
        case '4': ch = 'lfg'; text = arg; break;
        case 'w': case 'whisper': case 't': case 'tell': case 'msg': { const [nm, ...m] = rest; to = this.findSim(nm); if (!to) return this.post('system', null, `No player named '${nm}' is currently playing.`); ch = 'whisper_out'; text = m.join(' '); break; }
        case 'r': case 'reply': to = this.lastWhisperFrom; if (!to) return; ch = 'whisper_out'; text = arg; break;
        case 'invite': case 'inv': return this.playerInvite(arg || this.g.player.target?.name);
        case 'leave': case 'leaveparty': if (!this.party) return this.post('system', null, 'You aren\'t in a group.'); return this.leave(p);
        case 'kick': case 'uninvite': case 'u': return this.kick(p, this.findPlayer(arg) || (arg ? null : p.target));
        case 'promote': case 'pr': return this.promote(p, this.findPlayer(arg) || (arg ? null : p.target));
        case 'logout': case 'camp': case 'quit': case 'exit': return this.g.e?.logout?.();
        case 'clearwaypoint': case 'cwp': return this.g.e?.waypoints?.clearMine();
        case 'who': return this.who(arg);
        case 'played': return this.post('system', null, `Total time played: ${(4380 + Math.floor(this.g.time / 86400))} days, 3 hours, ${Math.floor(this.g.time / 60)} minutes`);
        case 'roll': { const max = parseInt(arg) || 100; return this.post('system', null, `${p.name} rolls ${1 + Math.floor(this.rng.next() * max)} (1-${max})`); }
        case 'duel': { const t = arg ? this.findPlayer(arg) : p.target; if (!t) return this.post('system', null, arg ? `No player named '${arg}' is currently playing.` : 'Target a player to challenge them to a duel.'); return this.g.duels?.challenge(p, t); }
        case 'yield': case 'forfeit': return this.g.duels?.forfeit(p);
        case 'host': if (!this.g.e.startHosting?.()) this.post('system', null, this.g.e.net ? 'You are already hosting.' : 'Hosting is available on the web version of the game.'); return;
        case 'afk': return this.post('system', null, 'You are now AFK: Away from Keyboard');
        case 'help': case 'h': return this.post('system', null, 'Commands: /s /y /p /g /1 /2 /4 /w <name> /r /invite <name> /leave /kick <name> /promote <name> /duel <name> /yield /who /roll /played /host /logout /dance /wave /cheer /laugh /bow /point /roar /kneel');
        default: return this.post('system', null, `Unknown command: /${cmd}`);
      }
    }
    if (!text) return;
    this.post(ch, p, text, to ? { to: to.name } : {});
    if (ch === 'say' || ch === 'yell') bus.emit('bubble', { unit: p, text });
    // replies
    const lower = text.toLowerCase();
    const responders = ch === 'whisper_out' ? [to] : ch === 'party' ? (this.party?.members || []) : ch === 'guild' ? this.sims.filter(s => s.guild === this.guild) : ch === 'say' || ch === 'yell' ? this.g.sim.query(p.pos, ch === 'yell' ? 60 : 22).filter(u => u.kind === 'sim') : this.sims;
    const n = ch === 'whisper_out' ? 1 : Math.min(responders.length, 1 + Math.floor(this.rng.next() * (ch === 'general' ? 3 : 2)));
    const rs = this.rng.shuffle([...responders]).slice(0, n);
    // one responder may answer in their own words (Claude artifact viewers who allow it; see voices.js)
    const vch = ch === 'whisper_out' ? 'whisper' : ch === 'party' || ch === 'say' ? ch : null;
    const voiced = vch && this.voices.ready ? rs.find(s => s && !s.dead) : null;
    for (const s of rs) {
      if (!s || s.dead) continue;
      if (s !== voiced && ch !== 'whisper_out' && this.rng.next() < 0.35) continue;
      const rule = REPLIES.find(r => r.k.some(k => lower.includes(k)));
      const canned = pick(this.rng, rule ? rule.r : DEFAULT_REPLY);
      const rch = ch === 'whisper_out' ? 'whisper' : ch === 'yell' ? 'say' : ch;
      const deliver = reply => {
        if (s.dead) return;
        if (reply === '/dance' || reply === '*dances*') { s.model?.play?.('dance'); s.dancing = true; this.post('emote', s, `${s.name} dances with you.`); return; }
        this.post(rch, s, reply, rch === 'whisper' ? { to: 'you' } : {});
        if (rch === 'say') bus.emit('bubble', { unit: s, text: reply });
        if (rch === 'whisper') this.lastWhisperFrom = s;
      };
      if (s === voiced) {
        const t0 = performance.now();
        this.voices.reply(s, text, vch, this.voiceContext()).then(line => this.later(Math.max(0.3, 1.2 - (performance.now() - t0) / 1000), () => deliver(line || canned)));
      } else this.later(1.2 + this.rng.next() * 3 + rs.indexOf(s), () => deliver(canned));
      if (rule?.k.includes('duel') && ch === 'whisper_out') this.later(3, () => this.g.duels?.challenge(s, p));
    }
  }
  /** SimPlayers answer a co-op friend (net/host.js): the same canned rules as playerChat, addressed to them. */
  replyTo(speaker, ch, text, to) {
    const lower = String(text).toLowerCase();
    const responders = ch === 'whisper_out' ? [to] : ch === 'say' || ch === 'yell' ? this.g.sim.query(speaker.pos, ch === 'yell' ? 60 : 22).filter(u => u.kind === 'sim') : ch === 'general' || ch === 'trade' || ch === 'lfg' ? this.sims : ch === 'party' ? (speaker.party?.all || []).filter(u => u.kind === 'sim') : [];
    const n = ch === 'whisper_out' ? 1 : Math.min(responders.length, 1 + Math.floor(this.rng.next() * 2));
    for (const s of this.rng.shuffle([...responders]).slice(0, n)) {
      if (!s || s.dead || s.kind !== 'sim') continue;
      if (ch !== 'whisper_out' && this.rng.next() < 0.35) continue;
      const rule = REPLIES.find(r => r.k.some(k => lower.includes(k)));
      const reply = pick(this.rng, rule ? rule.r : DEFAULT_REPLY);
      this.later(1.2 + this.rng.next() * 3, () => {
        if (s.dead) return;
        if (reply === '/dance' || reply === '*dances*') { s.model?.play?.('dance'); this.post('emote', s, `${s.name} dances with ${speaker.name}.`); return; }
        if (ch === 'whisper_out') this.post('whisper', s, reply, { to: speaker.name, hideLocal: true, $toGuest: speaker.remote });
        else { const rch = ch === 'yell' ? 'say' : ch; this.post(rch, s, reply); if (rch === 'say') bus.emit('bubble', { unit: s, text: reply }); }
      });
    }
  }
  voiceContext() {
    const p = this.g.player, d = this.g.dragon, raid = this.g.e?.mode === 'raid';
    return { name: p.name, level: p.level, race: p.race, cls: p.cls, raid, zone: raid ? 'the Ember Maw' : areaAt(p.pos.x, p.pos.z), dragon: d ? `${d.name}, ${d.title}` : 'a dragon' };
  }

  playerEmote(cmd, anim) {
    const p = this.g.player, t = p.target;
    const texts = { dance: 'bursts into dance.', wave: 'waves.', cheer: 'cheers!', laugh: 'laughs.', lol: 'laughs.', bow: 'bows down graciously.', point: 'points over yonder.', roar: 'roars with bestial vigor.', kneel: 'kneels down.', sit: 'sits down.', hug: 'needs a hug!', salute: 'salutes.', flex: 'flexes. Impressive!', cry: 'cries.' };
    const tt = t && cmd !== 'dance' ? `${p.name} ${cmd}s at ${t.name}.` : `${p.name} ${texts[cmd] || 'emotes.'}`;
    this.post('emote', p, tt);
    p.model?.play?.(anim);
    if (anim === 'sit') this.g.pc.sitting = true;
    // nearby sims join in
    for (const s of this.g.sim.query(p.pos, 18)) {
      if (s.kind !== 'sim' || s.dead || s.inCombat) continue;
      const r = this.rng.next();
      if (cmd === 'dance' && r < 0.55) this.later(0.8 + r * 3, () => { s.model?.play?.('dance'); s.dancing = true; s.facing = Math.atan2(-(p.pos.x - s.pos.x), -(p.pos.z - s.pos.z)); if (this.rng.next() < 0.5) this.post('emote', s, `${s.name} dances with you.`); });
      else if ((cmd === 'wave' || cmd === 'cheer' || cmd === 'bow') && r < 0.45) this.later(0.6 + r * 2, () => { s.facing = Math.atan2(-(p.pos.x - s.pos.x), -(p.pos.z - s.pos.z)); s.model?.play?.(cmd === 'bow' ? 'bow' : 'wave'); this.post('emote', s, `${s.name} ${cmd === 'bow' ? 'bows' : 'waves'} at you.`); });
      else if (cmd === 'laugh' && r < 0.25) this.later(1, () => { s.model?.play?.('laugh'); this.post('emote', s, `${s.name} laughs.`); });
    }
  }

  who(filter) {
    const all = this.sims.filter(s => !filter || s.name.toLowerCase().includes(filter.toLowerCase())), list = all.slice(0, 12);
    this.post('system', null, `${all.length} player${all.length === 1 ? '' : 's'} online in Everdawn Vale (2,847 on Lastlight · 1 human)${all.length > list.length ? ` - showing ${list.length}` : ''}`);
    for (const s of list) this.post('system', null, `[${s.level} ${RACES[s.race].name} ${CLASSES[s.cls].name}] ${s.name}${s.guild ? ` <${s.guild}>` : ''} - Everdawn Vale`);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const rng = this.rng, p = this.g.player;
    if (!p) { for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); } } return; }
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); } }
    this.chatT -= dt;
    if (this.chatT <= 0) { this.chatT = 5 + rng.next() * 8; this.ambient(); }
    this.eerieT -= dt;
    if (this.eerieT <= 0) { this.eerieT = 200 + rng.next() * 220; this.eerie(); }
    // whispers from strangers
    this.whisperT -= dt;
    if (this.whisperT <= 0) {
      this.whisperT = 70 + rng.next() * 90;
      const s = pick(rng, this.sims.filter(x => !x.dead && x.party !== this.party));
      if (s) { this.post('whisper', s, pick(rng, WHISPERS), { to: 'you' }); this.lastWhisperFrom = s; bus.emit('sound', { name: 'whisper' }); }
    }
    // party invites from nearby questers (not while raiding or spectating: those wait for the open world)
    const away = this.g.e?.mode === 'raid' || this.g.e?.watching;
    this.inviteT -= dt;
    if (this.inviteT <= 0 && !away) {
      this.inviteT = 110 + rng.next() * 120;
      if (!this.party) {
        const near = this.g.sim.query(p.pos, 45).filter(u => u.kind === 'sim' && !u.dead && !u.party && Math.abs(u.level - p.level) <= 3);
        const s = pick(rng, near);
        if (s) this.invitePlayer(s);
      }
    }
    // guild invite
    if (!this.guild) {
      this.guildOfferT -= dt;
      if (this.guildOfferT <= 0 && !away) {
        this.guildOfferT = 1e9;
        const s = pick(rng, this.sims.filter(x => x.guild === this.guildName));
        if (s) {
          this.post('whisper', s, `hey! <${this.guildName}> is recruiting, chill ppl, we raid the dragon every night. want an invite?`, { to: 'you' });
          this.later(3, () => bus.emit('popup', { kind: 'guild', from: s.name, text: `${s.name} invites you to join the guild <${this.guildName}>.`, onAccept: () => this.joinGuild(s), onDecline: () => this.post('whisper', s, 'np, offer stands!', { to: 'you' }) }));
        }
      }
    }
    // party members eventually leave
    for (const party of new Set(this.sims.map(s => s.party).filter(Boolean))) for (const m of party.all) {
      if (m.kind !== 'sim') continue; // only SimPlayers wander off; people leave when they choose to
      m.partyT = (m.partyT || 0) + dt;
      if (m.partyT > 360 + (m.id % 7) * 60 && !m.inCombat && rng.next() < dt * 0.02) { m.partyT = -1e9; this.post('party', m, pick(rng, REACT.bye)); this.later(2, () => { m.partyT = 0; if (m.party === party) this.leave(m); }); }
    }
    for (const [u, inv] of this.invites) if ((inv.t -= dt) <= 0) this.invites.delete(u);
    for (const s of this.sims) if (s.dancing && (s.stateAnim.speed > 0.1 || s.inCombat)) s.dancing = false;
  }

  joinGuild(s) {
    this.guild = this.guildName; this.g.player.guild = this.guild;
    this.post('system', null, `You have joined the guild <${this.guild}>.`);
    bus.emit('guild_joined', { guild: this.guild });
    const g = this.sims.filter(x => x.guild === this.guild);
    this.later(1.5, () => this.post('guild', s, `welcome ${this.g.player.name}!!`));
    for (let i = 0; i < 4; i++) { const m = pick(this.rng, g); this.later(2.5 + i * 1.3 + this.rng.next(), () => this.post('guild', m, pick(this.rng, ['welcome!', 'o/', 'welcome :)', 'hi new person', 'welcome, read the rules (there are no rules)', 'grats on the guild, raid is at the gate every night']))); }
  }
}
