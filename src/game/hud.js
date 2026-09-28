// HUD controller: pushes game state into the UI every frame and turns UI events into game actions.
import * as THREE from 'three';
import { UI } from '../ui/ui.js';
import { aura as adaptAura } from '../ui/adapt.js';
import { bus } from './events.js';
import { SPELLS } from './data/spells.js';
import { CLASSES, RACES, xpToNext, MAX_LEVEL } from './data/classes.js';
import { QUEST, NPCS } from './data/quests.js';
import { ITEMS, statLines, SLOTS, procText } from './items.js';
import { MOBS } from './data/mobs.js';
import { drawMinimap, drawLairMinimap, areaAt, bakeWorldMap } from './map.js';
import { Portraits } from './portrait.js';
import { fmtMoney } from './game.js';
import { ZONES } from './zones.js';
import { procLit } from './combat.js';
import { estimate } from './estimate.js';

const UIGEAR = new WeakMap(); // UI item → the game's gear piece (for DPS comparisons in tooltips)

const _v = new THREE.Vector3();
const CH_MAP = { whisper: 'whisperIn', whisper_out: 'whisperOut', localdefense: 'general', raid: 'raid', rw: 'raidWarning' };
const ROLE = { mt: 'tank', ot: 'tank', heal: 'healer', melee: 'dps', ranged: 'dps' };
const STAT_NAMES = { str: 'Strength', agi: 'Agility', sta: 'Stamina', int: 'Intellect', spi: 'Spirit' };
const SLOT_UI = { head: 'head', shoulders: 'shoulder', chest: 'chest', hands: 'hands', legs: 'legs', feet: 'feet', back: 'back', weapon: 'mainhand' };
const SLOT_NAME = { head: 'Head', shoulders: 'Shoulder', chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet', back: 'Back', weapon: 'Two-Hand' };

/** Game item (template or generated gear) → UI Item shape (cached). */
export function uiItem(it, id) {
  if (!it) return null;
  if (it._ui) return it._ui;
  const o = { id: id || it.uid, name: it.name, icon: it.icon || 'unknown', rarity: it.rarity || 'common', flavor: it.flavor, sell: it.sell ? it.sell * 25 : undefined };
  if (it.quest) { o.questItem = true; o.bind = 'pickup'; }
  if (it.gear) {
    UIGEAR.set(o, it);
    o.bind = it.rarity === 'epic' || it.rarity === 'legendary' ? 'pickup' : 'equip';
    if (it.unique) o.unique = true;
    if (it.proc && it.proc.id !== 'dawnlight') o.chance = [procText(it.proc)];
    o.slot = SLOT_NAME[it.slot]; o.type = it.slot === 'weapon' ? (it.cls === 'warrior' ? 'Sword' : it.cls === 'mage' ? 'Staff' : 'Mace') : it.slot === 'back' ? 'Cloth' : it.armorType === 'plate' ? 'Plate' : 'Cloth';
    if (it.armor) o.armor = it.armor;
    if (it.dmgMin) { o.damage = { min: it.dmgMin * 10, max: it.dmgMax * 10, speed: it.speed }; o.dps = +(((it.dmgMin + it.dmgMax) / 2 * 10) / it.speed).toFixed(1); }
    o.stats = {}; for (const k in STAT_NAMES) if (it.stats?.[k]) o.stats[STAT_NAMES[k]] = it.stats[k];
    o.equip = statLines(it).filter(l => l.text.startsWith('Equip:')).map(l => l.text.replace(/^Equip: /, ''));
    o.itemLevel = it.ilvl; o.reqLevel = Math.max(1, Math.min(MAX_LEVEL, it.ilvl - 3)); o.classes = [CLASSES[it.cls]?.name]; // raid gear asks for the level cap, not above it
    o.tint = it.tier >= 3 ? undefined : undefined;
  }
  if (it.mount) { o.bind = 'pickup'; o.use = ['Summons and dismisses a rideable drake.']; o.flavor = 'The Maw remembers. So does this drake.'; }
  if (it.use && !it.gear) o.use = [{ healPotion: 'Restores health. (1 Min Cooldown)', manaPotion: 'Restores mana. (1 Min Cooldown)', eat: 'Restores health over 18 sec. Must remain seated.', drink: 'Restores mana over 18 sec. Must remain seated.', hearth: 'Returns you to Dawnhollow. Speak to an Innkeeper to change your home location.' }[it.use]];
  it._ui = o;
  return o;
}

function spellTip(sp, u) {
  const c = { L: u.level, sp: u.stats.sp, ap: u.stats.ap };
  const cost = typeof sp.cost === 'function' ? Math.round(sp.cost(c) * (sp.powerType === 'mana' ? 0.6 : 1)) : sp.cost;
  return {
    name: sp.name, icon: sp.icon,
    cost: cost ? `${cost} ${sp.powerType === 'rage' ? 'Rage' : sp.powerType === 'energy' ? 'Energy' : 'Mana'}` : undefined,
    range: sp.range ? `${sp.range} yd range` : sp.melee ? 'Melee Range' : undefined,
    castTime: sp.channel ? `Channeled (${sp.channel} sec)` : sp.cast ? `${sp.cast} sec cast` : 'Instant',
    cooldown: sp.cd ? `${sp.cd} sec cooldown` : undefined,
    desc: typeof sp.desc === 'function' ? sp.desc({ ...c, L: u.level }) : sp.desc || '',
    reqLevel: sp.learn,
  };
}

export class HUD {
  constructor(engine) {
    this.e = engine;
    this.ui = new UI({ getItem: id => uiItem(ITEMS[id], id), player: { name: 'Adventurer', cls: 'warrior', race: 'human' } });
    window.ui = this.ui;
    this.portraits = new Portraits(engine.renderer.r);
    this.mapT = 0; this.portraitT = 0; this.trackerDirty = true; this.bagsDirty = true; this.charDirty = true;
    this.fctUnits = new Map(); // unit → time left to keep anchoring
    this.lastPortrait = { player: null, target: null };
    this.offs = [];
    this.wire();
  }
  get g() { return this.e.mode === 'raid' ? this.e.raid : this.e.game; }
  get game() { return this.e.game; }

  // ------------------------------------------------------------------ UI → game
  wire() {
    const ui = this.ui, e = this.e;
    ui.on('typing', on => { e.input.typing = on; });
    ui.on('action', slot => this.g.pc?.useSlot(slot));
    ui.on('escape', () => { const p = this.game.player; if (p?.target) this.g.pc.setTarget(null); else ui.settings.open(); }); // nothing to clear: the options menu
    ui.on('target', id => { const u = id === 'player' ? this.game.player : this.g.sim.units.find(x => x.id === id); if (u) this.g.pc.setTarget(u); });
    ui.on('chat', (ch, text, to) => {
      const map = { say: '/s ', yell: '/y ', party: '/p ', guild: '/g ', general: '/1 ', trade: '/2 ', lfg: '/4 ', raid: '/p ', whisperOut: `/w ${to} `, emote: '/me ' };
      if (ch === 'emote') { bus.emit('chat', { ch: 'emote', text: `${this.game.player.name} ${text}` }); return; }
      if (ch === 'raid' && this.e.mode === 'raid') { this.game.social.post('raid', this.game.player, text); return; }
      this.game.social.playerChat((map[ch] || '') + text);
    });
    ui.on('command', (cmd, arg, raw) => this.game.social.playerChat(raw));
    ui.on('playerClick', name => { const s = this.game.social.findSim(name); this.ui.chat.open(`/w ${s ? s.name : name} `); });
    ui.on('useItem', (i, item) => {
      const b = this.game.player.bags[i]; if (!b) return;
      if (ui.merchant.isOpen) { this.game.sellItem(i); return; } // at a merchant, right-click sells (WoW)
      if (b.gear) this.game.equip(b.gear); else this.game.useItem(b.id); this.bagsDirty = this.charDirty = true;
    });
    ui.on('spellbookCast', id => this.g.pc?.castSpell(id));
    ui.on('profUse', id => this.g.pc?.castSpell(id));
    ui.on('craft', (id, n) => { this.e.prof?.craft(id, n); this.profDirty = true; });
    ui.on('minimapTracking', () => { const order = [null, 'mining', 'herbalism']; this.tracking = order[(order.indexOf(this.tracking ?? null) + 1) % order.length]; ui.minimap.trackLabel = this.tracking === 'mining' ? 'Find Minerals' : this.tracking === 'herbalism' ? 'Find Herbs' : 'none'; ui.alerts.info(`Tracking: ${ui.minimap.trackLabel}`); });
    ui.on('bagMove', (i, j) => {
      const bags = this.game.player.bags, a = bags[i]; if (!a) return;
      const b = bags[j];
      if (b && !a.gear && !b.gear && a.id === b.id && ITEMS[a.id]?.stack) { b.count += a.count; bags.splice(i, 1); } // same stack: merge
      else if (b) { bags[i] = b; bags[j] = a; }
      else { bags.splice(i, 1); bags.push(a); }
      this.bagsDirty = true;
    });
    ui.on('barItem', (j, i) => { const b = this.game.player.bags[i], def = b && !b.gear && ITEMS[b.id]; if (!def?.use) { ui.alerts.error('Only usable items go on the action bar.'); return; } this.editBar(pc => { pc.bar[j] = 'item:' + b.id; }); });
    ui.on('bagSell', i => { if (ui.merchant.isOpen) this.game.sellItem(i); else ui.alerts.error('Talk to a merchant to sell.'); });
    ui.on('bagDestroy', i => {
      const b = this.game.player.bags[i]; if (!b) return;
      const it = b.gear || ITEMS[b.id], n = b.count > 1 ? ` (${b.count})` : '';
      ui.popups.show({ id: 'destroy', text: `Do you want to destroy **${it.name}**${n}?`, accept: 'Yes', decline: 'No', onAccept: () => { if (this.game.player.bags[i] === b) this.game.destroyItem(i); } });
    });
    ui.on('barPlace', (i, id) => this.editBar(pc => { const j = pc.bar.indexOf(id), prev = pc.bar[i]; pc.bar[i] = id; if (j >= 0 && j !== i) pc.bar[j] = prev; }));
    ui.on('barMove', (i, j) => this.editBar(pc => { const id = pc.bar[i]; if (j < 0 || j >= 10) pc.bar[i] = null; else { pc.bar[i] = pc.bar[j]; pc.bar[j] = id; } }));
    ui.on('questAbandon', id => { const q = QUEST[id]; if (q) ui.popups.confirm(`Abandon **${q.title}**?`, ok => { if (ok) this.game.abandonQuest(id); }, 'Abandon', 'Keep'); });
    ui.on('social', (a, id) => this.socialAction(a, id));
    ui.on('merchantBuy', (i, n) => this.merchantBuy(i, n));
    ui.on('merchantBuyback', i => { if (this.game.buyback(i)) this.merchantDirty = true; });
    ui.on('merchantSellJunk', () => { if (!this.game.sellJunk()) ui.alerts.error('You have no junk to sell.'); });
    ui.on('minimapClick', (fx, fy) => { const w = this.minimapToWorld(fx, fy); if (w) this.e.waypoints?.ping(w.x, w.z); });
    ui.on('minimapMark', (fx, fy) => { const w = this.minimapToWorld(fx, fy); if (w) this.e.waypoints?.place(w.x, w.z); });
    ui.on('mapMark', (u, v) => { if (this.e.mode === 'world') { const [z0, z1] = this.game.zone.mapZ; this.e.waypoints?.place(u * 1024 - 512, z0 + v * (z1 - z0)); this.drawWorldMap(); } });
    ui.on('releaseSpirit', () => this.game.releaseSpirit());
    ui.on('roll', (id, choice) => this.onRoll(id, choice));
    ui.on('settings', s => this.e.applySettings?.(s));
    ui.on('panel', (id, open) => {
      if (id === 'character' && open) { this.charDirty = true; } if (id === 'bags' && open) this.bagsDirty = true; if (id === 'map' && open) this.drawWorldMap();
      if (id === 'spellbook' && open) this.spellDirty = true; if (id === 'quests' && open) this.questDirty = true; if (id === 'social' && open) this.socialT = 0;
      if (id === 'merchant' && !open) this.vendor = null;
    });
    ui.on('meterMode', m => { this.meterMode = m; });
    ui.on('minimapZoom', d => { this.mmRadius = Math.max(50, Math.min(160, (this.mmRadius || 90) * (d > 0 ? 0.8 : 1.25))); });
    ui.on('questClick', () => ui.toggle('map'));
    // item tooltips: what wearing this would do to your estimated DPS (and HPS for healers)
    ui.itemExtra = uiIt => {
      const g = UIGEAR.get(uiIt), p = this.game.player;
      if (!g || !p || g.cls !== p.cls || p.equip[g.slot] === g) return null;
      const cur = estimate(this.game, p), next = estimate(this.game, p, { [g.slot]: g });
      const line = (label, a, b) => { const d = b - a; return { text: `If equipped: ${label} ${d >= 0 ? '+' : ''}${d.toFixed(1)}  (${a.toFixed(1)} → ${b.toFixed(1)})`, color: d > 0.05 ? '#1eff00' : d < -0.05 ? '#ff4040' : '#ffd100' }; };
      return cur.hps != null ? [line('HPS', cur.hps, next.hps), line('DPS', cur.dps, next.dps)] : [line('DPS', cur.dps, next.dps)];
    };
    this.mmRadius = 90;

    // ------------------------------------------------------------------ game → UI
    const on = (t, f) => this.offs.push(bus.on(t, d => { try { f(d); } catch (err) { console.error('[hud]', t, err); } }));
    const me = () => this.game.player;
    on('damage', ({ src, dst, amount, absorbed, crit, school, melee, dot }) => {
      const p = me();
      if (dst === p) { this.fctUnits.set(p, 3); if (amount > 0) ui.fct.add({ anchor: p.id, amount, crit, type: 'incoming', school }); if (absorbed) ui.fct.add({ anchor: p.id, text: 'Absorb', type: 'absorb' }); }
      else if (src === p || (src.brain && src.party && src.party === p.party && false)) {
        this.fctUnits.set(dst, 3);
        if (amount > 0) ui.fct.add({ anchor: dst.id, amount, crit, type: melee ? 'damage' : 'spell', school: school === 'physical' && !melee ? 'physical' : school });
        if (absorbed && !amount) ui.fct.add({ anchor: dst.id, text: 'Absorb', type: 'miss' });
      }
    });
    on('heal', ({ src, dst, amount, crit }) => {
      const p = me();
      if ((src === p || dst === p) && amount > 0) { this.fctUnits.set(dst, 3); ui.fct.add({ anchor: dst.id, amount, crit, type: 'heal' }); }
    });
    on('miss', ({ src, dst, what }) => { const p = me(); if (src === p || dst === p) { this.fctUnits.set(dst, 2); ui.fct.add({ anchor: dst.id, text: what, type: 'miss' }); } });
    on('xp', ({ amount, src }) => { const p = me(); this.fctUnits.set(p, 3); ui.fct.add({ anchor: p.id, text: `+${amount} XP`, type: 'xp' }); if (src === 'kill') ui.chat.add({ ch: 'xp', text: `You gain ${amount} experience.` }); else ui.chat.add({ ch: 'xp', text: `Experience gained: ${amount}.` }); });
    on('error', ({ unit, msg }) => { if (unit === me()) ui.alerts.error(msg); });
    on('cast_start', ({ unit, spell, dur, channel }) => { if (unit === me()) ui.castBar.start({ name: spell.name, icon: spell.icon, duration: dur, channel, interruptible: true }); });
    on('cast_stop', ({ unit, reason }) => { if (unit !== me()) return; if (reason === 'success') ui.castBar.succeed(); else ui.castBar.interrupt(reason === 'Interrupted' ? 'Interrupted' : reason); });
    on('chat', ev => this.chatLine(ev));
    on('level_up', ({ level, learned }) => {
      ui.alerts.levelUp(level, { abilities: learned.map(id => ({ name: SPELLS[id].name, icon: SPELLS[id].icon })), stats: [`+${CLASSES[me().cls].hpPer * 10} Health`] });
      ui.chat.add({ ch: 'system', text: `Congratulations, you have reached level ${level}!` });
      for (const id of learned) ui.chat.add({ ch: 'system', text: `You have learned a new ability: ${SPELLS[id].name}.` });
      this.portraitDirty = true;
    });
    on('quest_accept', ({ quest }) => { ui.chat.add({ ch: 'system', text: `Quest accepted: ${quest.title}` }); this.trackerDirty = true; });
    on('quest_complete', ({ quest }) => { ui.chat.add({ ch: 'system', text: `${quest.title} completed.` }); ui.alerts.info(`${quest.title} completed.`); this.trackerDirty = true; });
    on('quest_progress', ({ obj, value }) => { ui.alerts.info(`${obj.label}: ${value}/${obj.count ?? 1}`); this.trackerDirty = true; });
    on('quests_changed', () => { this.trackerDirty = true; });
    on('bags_changed', () => { this.bagsDirty = true; });
    on('equip_changed', () => { this.charDirty = true; this.portraitDirty = true; });
    on('money', ({ amount }) => { if (amount > 0) ui.chat.add({ ch: 'money', text: `You loot ${fmtMoney(amount)}.` }); this.bagsDirty = true; });
    on('loot_item', ({ item, id, count }) => { const it = item ? uiItem(item) : uiItem(ITEMS[id], id); if (it) ui.chat.add({ ch: 'loot', text: `You receive loot: {0}${count > 1 ? 'x' + count : ''}.`, items: [it] }); });
    on('zone_text', ({ title, sub }) => ui.alerts.zone(title, sub));
    on('raid_warning', ({ text, color, small }) => { if (small && /^Pull in (\d)/.test(text)) ui.alerts.countdown(+text.match(/\d/)[0]); else ui.alerts.raidWarning(text, color); });
    // big 3-2-1 numerals only where a countdown changes what you do: the pull and Deep Breath
    on('boss_timer', ({ id, name, dur, icon, pull }) => ui.bossTimers.start({ id, name, duration: dur, icon, kind: pull ? 'phase' : id === 'deep' || id === 'breath' ? 'important' : id === 'whelps' ? 'add' : id === 'roar' ? 'aoe' : 'default', countdown: pull ? 5 : id === 'deep' ? 3 : 0 }));
    // a new phase retires the old phase's bars; a wipe or a kill retires them all
    const STALE = { 1: ['deep', 'whelps', 'roar'], 2: ['breath', 'hazard', 'roar'], 3: ['deep', 'whelps'] };
    on('boss_phase', ({ phase }) => { for (const id of STALE[phase] || []) ui.bossTimers.cancel(id); });
    on('raid_state', ({ state }) => { if (state === 'victory' || state === 'wipe' || state === 'prepull') ui.bossTimers.clear(); });
    on('hint', ({ text }) => { ui.alerts.info(text); ui.chat.add({ ch: 'system', text }); });
    on('popup', p => this.popup(p));
    on('gossip', g => this.gossip(g));
    on('loot_open', ({ corpse, items }) => this.lootWindow(corpse, items));
    on('loot_close', () => ui.loot.close());
    on('player_died', ({ raid } = {}) => ui.death.show(raid ? { text: 'You have died.', sub: 'The raid fights on without you…', button: null, desaturate: true } : { onRelease: () => this.game.releaseSpirit(), text: 'You have died.', releaseDelay: 2 }));
    on('ghost', ({ on: ghost }) => { ui.death.hide(); if (ghost) { ui.alerts.info('Return to your corpse to resurrect.'); } });
    on('target_changed', ({ target }) => { this.portraitDirty = true; if (target && target.kind === 'mob' && !target.dead) this.game.onFirstCombat?.(); });
    on('raid_loot', ({ items, raid }) => this.raidLoot(items, raid));
    on('bubble', () => {});
    on('duel_state', d => this.duelState(d));
    on('party_changed', () => { this.socialT = 0; });
    on('bar_changed', () => { this.spellDirty = true; });
    on('bags_changed', () => { this.merchantDirty = true; this.profDirty = true; });
    on('skill_up', () => { this.profDirty = true; });
    on('marks', () => { this.merchantDirty = true; this.bagsDirty = true; });
    on('money', () => { this.merchantDirty = true; });
    on('waypoint', () => { if (ui.worldMap.isOpen) this.drawWorldMap(); });
    on('popup_close', ({ kind }) => { if (kind === 'readycheck') { try { this.readyPopup?.close(); } catch { } this.readyPopup = null; } });
  }

  chatLine(ev) {
    if (ev.hideLocal) return; // relayed to a friend only (net/host.js)
    const ui = this.ui, p = this.game.player;
    if (ev.ch === 'party' && ev.unit && p && ev.unit !== p && !(p.party && ev.unit.party === p.party)) return; // another group's chatter
    let ch = CH_MAP[ev.ch] || ev.ch;
    if (ev.ch === 'say' && ev.unit && ev.unit.kind === 'npc') ch = 'npcSay';
    if (ev.ch === 'yell' && ev.unit && (ev.unit.kind === 'mob' || ev.unit.kind === 'boss' || !ev.unit.kind)) ch = 'npcYell';
    if (ev.ch === 'emote' && ev.unit && ev.unit.boss) ch = 'bossEmote';
    let text = ev.text, items = [];
    if (ev.links?.length) {
      ev.links.forEach((l, i) => {
        const it = l.item ? uiItem(l.item) : uiItem(ITEMS[l.id], l.id) || { name: l.name, rarity: l.rarity, icon: 'unknown' };
        items.push(it);
        text = text.replace(`[${l.name}]`, `{${i}}`);
      });
    }
    const line = { ch, text, items };
    if (ev.from && ch !== 'emote' && ch !== 'textEmote' && ch !== 'system' && ch !== 'loot') { line.from = ev.from; line.fromCls = ev.cls || ev.unit?.cls; }
    if (ch === 'whisperOut') line.from = ev.to;
    if (ch === 'localdefense') line.text = '[LocalDefense] ' + line.text;
    ui.chat.add(line);
    if (ev.ch === 'rw') ui.alerts.raidWarning(ev.text);
  }

  popup(p) {
    const ui = this.ui, cb = ok => ok ? p.onAccept?.() : p.onDecline?.();
    if (p.kind === 'invite') ui.popups.partyInvite(p.from, cb);
    else if (p.kind === 'guild') ui.popups.guildInvite(p.from, this.game.social.guildName, cb);
    else if (p.kind === 'readycheck') this.readyPopup = ui.popups.show({ id: 'ready', text: `**${p.from}** is checking if everyone is ready.`, icon: 'hearthstone', accept: 'Ready', decline: 'Not Ready', timeout: p.timeout || 25, onAccept: p.onAccept, onDecline: p.onDecline, onTimeout: p.onAccept });
    else if (p.kind === 'duel') ui.popups.duel(p.from, cb);
    else if (p.kind === 'confirm') ui.popups.confirm(p.text, cb, p.accept, p.decline);
    else ui.popups.show({ text: p.text, onAccept: p.onAccept, onDecline: p.onDecline, timeout: p.timeout });
  }

  // ------------------------------------------------------------------ NPC dialogs
  gossip({ npc, def, offers }) {
    const ui = this.ui, game = this.game;
    const openQuest = (q, kind) => {
      const a = game.player.quests.find(x => x.id === q.id);
      const choices = kind === 'complete' || kind === 'offer' ? game.questRewardChoices(q) : null;
      this.pendingChoices = choices;
      const rewards = { xp: q.xp * 1, money: q.gold * 100 };
      if (choices) rewards.choice = choices.map(c => ({ item: uiItem(c) }));
      if (Array.isArray(q.rewards)) rewards.items = q.rewards.map(id => ({ item: uiItem(ITEMS[id], id) }));
      const d = ui.questDialog.open({
        mode: kind === 'offer' ? 'offer' : kind === 'complete' ? 'complete' : 'progress',
        npc: { name: def.name }, title: q.title, text: q.text, progressText: q.progress, completeText: q.complete,
        objectives: kind === 'offer' ? undefined : q.obj.map((o, i) => ({ text: o.label, have: a ? a.progress[i] : 0, need: o.count ?? 1 })),
        objectivesText: kind === 'offer' ? q.obj.map(o => (o.count > 1 ? `${o.label}: ${o.count}` : o.label)).join('\n') : undefined,
        rewards, canComplete: kind === 'complete',
        onAccept: () => { game.acceptQuest(q.id); ui.questDialog.close(); },
        onDecline: () => ui.questDialog.close(),
        onComplete: (ci) => { game.completeQuest(q.id, choices ? choices[Math.max(0, ci ?? 0)] : null); ui.questDialog.close(); },
      });
      this.drawNpcPortrait(npc);
      bus.emit('sound', { name: 'uiOpen' });
      return d;
    };
    const vendor = def.vendor;
    if (offers.length === 1 && !vendor && !def.flight) return openQuest(offers[0].q, offers[0].kind);
    const options = offers.map(o => ({ label: o.q.title, type: o.kind === 'offer' ? 'questAvailable' : o.kind === 'complete' ? 'questComplete' : 'questIncomplete', id: o.q.id }));
    if (vendor) options.push({ label: 'Let me browse your goods.', type: 'vendor', id: 'shop' });
    if (def.flight) options.push({ label: `Fly to ${ZONES[def.flight].home} (50 copper)`, type: 'taxi', id: 'fly' });
    if (!options.length && !def.greet) return;
    ui.questDialog.open({
      mode: 'gossip', npc: { name: def.name }, title: def.name, text: def.greet || 'Well met, adventurer.', options,
      onSelect: (opt) => {
        if (opt.id === 'shop') { this.openMerchant(npc); return; }
        if (opt.id === 'fly') { const p = game.player; if (p.gold < 50) { ui.alerts.error("You don't have enough money."); return; } ui.questDialog.close(); this.e.travelTo(def.flight, ZONES[def.flight].flightArrive, { fly: true }).then(ok => { if (ok) { p.gold -= 50; this.bagsDirty = true; } }); return; }
        const o = offers.find(x => x.q.id === opt.id); if (o) openQuest(o.q, o.kind);
      },
    });
    this.drawNpcPortrait(npc);
    bus.emit('sound', { name: 'uiOpen' });
  }
  drawNpcPortrait(npc) { const pt = this.ui.questDialog.pt; if (pt) this.portraits.draw(npc, pt); }

  lootWindow(corpse, items) {
    const ui = this.ui, game = this.game, n = new Set(items.map(l => l.from || corpse)).size;
    ui.loot.open({
      title: n > 1 ? `${corpse.name} +${n - 1} nearby` : corpse.name,
      entries: items.map(l => l.gold ? { money: l.gold } : { item: l.gear ? uiItem(l.gear) : uiItem(ITEMS[l.id], l.id), count: l.count || 1, quest: !!ITEMS[l.id]?.quest }),
      // area loot: every entry remembers its own corpse (indices shift as items are taken)
      onLoot: (i) => { const l = items[i], c = l.from || corpse, k = c.loot?.indexOf(l.ref ?? l); if (k >= 0) game.takeLoot(c, k); },
      onClose: () => { game.lootSession = null; },
    });
    bus.emit('sound', { name: 'loot' });
  }

  raidLoot(items, raid) {
    const ui = this.ui;
    this.rollItems = new Map();
    items.forEach((it, i) => {
      const id = 'r' + i + '_' + Date.now();
      this.rollItems.set(id, { it, raid });
      ui.rolls.add({ id, item: uiItem(it), duration: 30, canNeed: it.mount || it.cls === this.game.player.cls, onRoll: c => this.onRoll(id, c) });
    });
  }
  onRoll(id, choice) {
    const r = this.rollItems?.get(id); if (!r || r.done) return; r.done = true;
    const win = r.raid.resolveRoll(r.it, choice);
    if (win) this.ui.rolls.result(id, { rolls: [], winner: win.m.name });
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const ui = this.ui, e = this.e, game = this.game, p = game?.player;
    if (!p || e.mode === 'title' || e.mode === 'create') { ui.update(dt); return; }
    const g = this.g;
    ui.me = p;
    if (ui.death.isOpen && !p.dead && !p.ghost) ui.death.hide(); // revived (a raid wipe, a resurrect): back to the game
    ui.playerInfo = { name: p.name, cls: p.cls, race: p.race };
    p.ghost = !!p.ghost;
    p.leader = !!p.party && p.party.leader === p && p.party.size > 1;
    ui.player.set(p);
    const t = p.target;
    if (t) t.tapped = !!(t.hostile && t.tapper && t.tapper !== p && t.tapper !== p.party);
    if (t && (t.kind === 'sim' || t.kind === 'remote')) t.reaction = p.duelWith === t ? 'hostile' : undefined; // your duel opponent reads red
    ui.target.set(t && (!t.dead || t.lootable) ? t : null);
    ui.tot.set(t && t.target && !t.dead ? t.target : null);
    // portraits (throttled; on change)
    this.portraitT -= dt;
    if (this.portraitDirty || this.portraitT <= 0 || this.lastPortrait.target !== t) {
      this.portraitT = 8; this.portraitDirty = false; // periodic refresh only for lighting; changes redraw at once
      this.portraits.draw(p, ui.player.portrait);
      if (t && ui.target.portrait) this.portraits.draw(t, ui.target.portrait);
      this.lastPortrait.target = t;
    }
    // action bar
    const bar = g.pc?.bar || [];
    const slots = bar.map((id, i) => {
      if (!id) return null;
      if (id.startsWith('item:') && i < 10) { // an item you dragged onto the bar (food, a mount, fireworks…)
        const iid = id.slice(5), def = ITEMS[iid]; if (!def) return null; const n = game.countItem(iid);
        return { icon: def.icon, name: def.name, keybind: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'][i], count: def.stack ? n : '', usable: n > 0, active: def.use === 'mount' && !!p.mount, cd: /Potion/.test(def.use || '') && p.cdLeft('potion') > 0 ? { remaining: p.cdLeft('potion'), duration: 60 } : null };
      }
      const sp = SPELLS[id]; if (!sp) return null;
      const learned = !sp.learn || sp.learn <= p.level;
      const lit = learned && procLit(p, sp, id, t), cd = lit ? 0 : p.cdLeft(id); // a lit ability is ready now, whatever its cooldown
      const chk = learned ? g.combat.canCast(p, id, sp.target === 'ally' ? (t && !p.isEnemy(t) ? t : p) : t) : { ok: false };
      return {
        icon: sp.icon, name: sp.name, spell: spellTip(sp, p), keybind: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='][i],
        cd: cd > 0 ? { remaining: cd, duration: sp.cd || cd } : null,
        gcd: !sp.offGcd && p.gcd > 0 ? { remaining: p.gcd, duration: p.gcdMax || 1.5 } : null,
        usable: learned && !(sp.requiresAura && !p.hasAura(sp.requiresAura)) && !(sp.requiresTargetBelow && (!t || t.hpPct > sp.requiresTargetBelow)),
        noResource: chk.err === 'Not enough mana' || chk.err === 'Not enough rage' || chk.err === 'Not enough energy',
        outOfRange: chk.err === 'Out of range',
        proc: lit,
        offGCD: !!sp.offGcd,
      };
    });
    // consumables on the last slots
    const pot = game.countItem?.('potionHealth') || 0, food = game.countItem?.(p.powerType === 'mana' ? 'water' : 'bread') || 0;
    slots[10] = pot ? { icon: 'potionHealth', name: 'Minor Healing Potion', keybind: '-', count: pot, cd: p.cdLeft('potion') > 0 ? { remaining: p.cdLeft('potion'), duration: 60 } : null } : null;
    slots[11] = { icon: 'hearthstone', name: 'Hearthstone', keybind: '=', cd: p.cdLeft('hearth') > 0 ? { remaining: p.cdLeft('hearth'), duration: 120 } : null, usable: e.mode === 'world' };
    if (g.pc) { g.pc.bar[10] = pot ? 'item:potionHealth' : null; g.pc.bar[11] = 'item:hearthstone'; }
    while (slots.length < 12) slots.push(null);
    ui.actionBar.set(slots);
    // xp
    ui.xpBar.set({ xp: p.xp, xpMax: xpToNext(p.level) || 1, level: p.level, max: p.level >= MAX_LEVEL });
    // buffs
    const buffs = [], debuffs = [];
    for (const a of p.auras) { if (a.def.hidden) continue; (a.def.debuff ? debuffs : buffs).push(adaptAura(a, p)); }
    ui.auras.set(buffs, debuffs);
    // party / raid
    if (e.mode === 'raid') {
      ui.party.set([]);
      ui.raid.set(g.raiders.map(m => this.raidCell(m, t)));
      this.meterT = (this.meterT || 0) - dt;
      if (this.meterT <= 0) {
        this.meterT = 0.25;
        const dur = g.state === 'combat' || g.state === 'victory' ? Math.max(1, (g.result ? g.result.killTime : g.totalT - g.fightStart)) : 1;
        ui.meter.set({ duration: dur, segment: g.boss.name, damage: g.raiders.map(m => ({ name: m.name, cls: m.cls, total: m.meter.dmg, perSecond: m.meter.dmg / dur, isPlayer: m === p })), healing: g.raiders.map(m => ({ name: m.name, cls: m.cls, total: m.meter.heal, perSecond: m.meter.heal / dur, isPlayer: m === p })) });
      }
    } else {
      ui.raid.set([]);
      ui.party.set(p.party ? p.party.members.slice(0, 4).map(m => { m.selected = m === t; m.inRange = !m.offline && m.pos.distanceTo(p.pos) < 40; m.leader = m === p.party.leader; return m; }) : []);
    }
    // quest tracker (and the quest log, when open)
    if (this.trackerDirty) this.questDirty = true;
    if (this.trackerDirty && e.mode === 'world') {
      this.trackerDirty = false;
      ui.tracker.set(p.quests.map(a => { const q = QUEST[a.id]; const done = game.questComplete(a); return { id: q.id, title: q.title, level: q.level, complete: done, objectives: q.obj.map((o, i) => ({ text: o.label, have: a.progress[i], need: o.count ?? 1, done: a.progress[i] >= (o.count ?? 1) })) }; }));
    }
    if (e.mode === 'raid' && !this.raidTracker) { this.raidTracker = true; ui.tracker.set([]); }
    // bags, character, spellbook, quest log, social, merchant (only when open)
    if (this.bagsDirty && ui.bags.isOpen) { this.bagsDirty = false; this.pushBags(); }
    if (this.spellDirty && ui.spellbook.isOpen) { this.spellDirty = false; this.pushSpellbook(); }
    if (this.questDirty && ui.questLog.isOpen) { this.questDirty = false; this.pushQuestLog(); }
    if (ui.social.isOpen && (this.socialT = (this.socialT || 0) - dt) <= 0) { this.socialT = 1; this.pushSocial(); }
    if (ui.professions.isOpen && ((this.profT = (this.profT || 0) - dt) <= 0 || this.profDirty)) { this.profT = 1; this.profDirty = false; if (this.e.prof) ui.professions.set(this.e.prof.view()); }
    if (ui.merchant.isOpen) {
      if (!this.vendor || e.mode !== 'world' || this.vendor.pos.distanceTo(p.pos) > 9) ui.merchant.close();
      else if (this.merchantDirty) { this.merchantDirty = false; this.pushMerchant(); }
    }
    if (this.charDirty && ui.character.isOpen) { this.charDirty = false; this.pushCharacter(); }
    // minimap (10 Hz)
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.1; this.pushMinimap(); }
    // nameplates + floating text anchors
    this.pushWorldSpace(dt);
    this.e.waypoints?.update(dt, this.e.world.scene, this.e.camera, ui.worldLayer, (x, z) => this.e.world.heightAt(x, z), e.mode === 'world');
    ui.update(dt);
  }

  raidCell(m, t) {
    const c = m._cell || (m._cell = {});
    c.id = m.id; c.name = m.name; c.cls = m.cls; c.role = ROLE[m.raidRole] || 'dps'; c.hp = m.hp; c.hpMax = m.hpMax;
    c.power = m.power; c.powerMax = m.powerMax; c.powerType = m.powerType; c.dead = m.dead; c.selected = m === t;
    c.inRange = !m.dead && m.pos.distanceTo(this.game.player.pos) < 40; c.aggro = this.e.raid?.boss?.target === m;
    c.absorb = m.auras.reduce((s, a) => s + (a.absorb || 0), 0); c.auras = m.auras; c.leader = m === this.e.raid?.leader;
    c.debuff = m.auras.some(a => a.id === 'staticCharge') ? 'magic' : m.auras.some(a => a.id === 'poison') ? 'poison' : null;
    return c;
  }

  pushBags() {
    const p = this.game.player;
    const slots = p.bags.map(b => b.gear ? { item: uiItem(b.gear), count: 1 } : { item: uiItem(ITEMS[b.id], b.id), count: b.count });
    while (slots.length < 16) slots.push(null);
    this.ui.bags.set({ slots, money: p.gold, marks: p.marks || 0 });
  }
  pushCharacter() {
    const p = this.game.player, s = p.stats, slots = {};
    for (const k of SLOTS) if (p.equip[k]) slots[SLOT_UI[k]] = uiItem(p.equip[k]);
    // attributes: class base + growth per level + race bonus (display only; derived stats come from Unit.recalc) + gear
    const B = { warrior: [23, 20, 22, 17, 19, 2.2, 1.2, 2, 0.4, 0.6], mage: [17, 17, 18, 24, 22, 0.4, 0.5, 1, 2.2, 1.6], priest: [17, 18, 19, 22, 24, 0.4, 0.5, 1.2, 1.8, 2.2] }[p.cls] || [20, 20, 20, 20, 20, 1, 1, 1, 1, 1];
    const RB = { human: [0, 0, 0, 0, 2], dwarf: [2, -2, 2, -1, 0], orc: [3, -2, 1, -3, 2], elf: [-2, 3, -1, 2, 1] }[p.race] || [0, 0, 0, 0, 0];
    const gs0 = p.gearStats, gs = {};
    ['str', 'agi', 'sta', 'int', 'spi'].forEach((k, i) => { gs[k] = Math.round(B[i] + B[i + 5] * (p.level - 1) + RB[i] + (gs0[k] || 0)); });
    this.ui.character.set({
      name: p.name, level: p.level, race: p.race, cls: p.cls, guild: p.guild,
      slots,
      statGroups: [
        { title: 'Attributes', stats: [{ label: 'Strength', value: gs.str || 0 }, { label: 'Agility', value: gs.agi || 0 }, { label: 'Stamina', value: gs.sta || 0 }, { label: 'Intellect', value: gs.int || 0 }, { label: 'Spirit', value: gs.spi || 0 }, { label: 'Armor', value: Math.round(s.armor) }] },
        (() => { const est = estimate(this.game, p), tip = 'A 90-second fight against a training dummy with your gear and abilities. Hover an item to see what it would change.'; return { title: 'Training Dummy', stats: [{ label: 'DPS', value: est.dps.toFixed(1), color: '#ffd35a', tip }, ...(est.hps != null ? [{ label: 'HPS', value: est.hps.toFixed(1), color: '#40ff90', tip }] : [])] }; })(),
        { title: p.cls === 'warrior' ? 'Melee' : 'Spell', stats: p.cls === 'warrior' ? [{ label: 'Damage', value: `${Math.round(s.dmgMin * 10)} - ${Math.round(s.dmgMax * 10)}` }, { label: 'Attack Power', value: Math.round(s.ap) }, { label: 'Crit Chance', value: s.crit.toFixed(1) + '%' }] : [{ label: 'Spell Power', value: Math.round(s.sp) }, { label: 'Crit Chance', value: s.crit.toFixed(1) + '%' }, { label: 'Mana', value: p.powerMax }] },
      ],
    });
    if (this.ui.character.modelCanvas) this.portraits.draw(p, this.ui.character.modelCanvas, { full: true, transparent: true });
  }

  pushMinimap() {
    const ui = this.ui, e = this.e, p = this.game.player, cv = ui.minimap.canvas; if (!cv) return;
    const ctx = cv.getContext('2d'), size = cv.width;
    const now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    if (e.mode === 'raid') {
      drawLairMinimap(ctx, size, e.raid, p.pos, e.cam.yaw);
      ui.minimap.set({ zone: 'The Ember Maw', zoneType: 'hostile', time: `${hh}:${mm}`, facing: p.facing - e.cam.yaw, dayPhase: 0.9 });
      return;
    }
    const Z = this.game.zone, mapCv = this.zoneMap();
    const markers = [];
    const game = this.game;
    for (const n of Object.values(game.npcs)) if (n.questMark) markers.push({ x: n.pos.x, z: n.pos.z, kind: n.questMark === '!' ? 'quest' : 'turnin', edge: true });
    for (const a of p.quests) { const q = QUEST[a.id]; q.obj.forEach((o, i) => { if (o.area && (o.zone || q.zone || 'vale') === game.zoneId && a.progress[i] < (o.count ?? 1)) markers.push({ x: o.area[0], z: o.area[1], kind: 'area', edge: true }); }); }
    if (p.party) for (const m of p.party.members) if (!m.offline) markers.push({ x: m.pos.x, z: m.pos.z, kind: 'party' });
    for (const w of this.e.waypoints?.markers() || []) markers.push(w);
    if (this.tracking && this.e.prof) markers.push(...this.e.prof.tracked(this.tracking));
    if (p.corpsePos && p.ghost) markers.push({ x: p.corpsePos.x, z: p.corpsePos.z, kind: 'corpse', edge: true });
    for (const u of game.sim.query(p.pos, this.mmRadius)) if (u.hostile && !u.dead && u.inCombat && u.target === p) markers.push({ x: u.pos.x, z: u.pos.z, kind: 'hostile' });
    if (game.zoneId === 'vale') markers.push({ x: 0, z: -282, kind: 'portal', edge: p.level >= 9 });
    for (const ex of Z.exits || []) markers.push({ x: ex.x, z: ex.z, kind: 'portal', edge: false });
    drawMinimap(ctx, size, mapCv, p.pos, e.cam.yaw, markers, this.mmRadius);
    const area = areaAt(p.pos.x, p.pos.z, Z.areas, Z.name);
    ui.minimap.set({ zone: Z.name, subzone: area === Z.name ? undefined : area, zoneType: 'friendly', time: `${hh}:${mm}`, x: Math.round((p.pos.x + 512) / 10.24), y: Math.round((p.pos.z + 512) / 10.24), facing: p.facing - e.cam.yaw, dayPhase: e.world.tod });
    if (area !== this.lastArea) { if (this.lastArea) ui.alerts.zone(area, area === Z.name ? '' : Z.name); this.lastArea = area; }
  }
  /** The painted map of the zone you're in (baked once per zone). */
  zoneMap() {
    const e = this.e; this.mapCv ||= {};
    return this.mapCv[this.game.zoneId] ||= bakeWorldMap(e.world.hf, e.world.settle, e.world.forest);
  }

  drawWorldMap() {
    const ui = this.ui, cv = ui.worldMap?.canvas, e = this.e; if (!cv || e.mode !== 'world') return;
    const Z = this.game.zone, mapCv = this.zoneMap(), ctx = cv.getContext('2d');
    // show x -512..512 and the zone's band of z (the Vale: the whole valley incl. Ember Peak)
    const [z0, z1] = Z.mapZ;
    ctx.drawImage(mapCv, 0, z0 + 512, 1024, z1 - z0, 0, 0, cv.width, cv.height);
    if (ui.worldMap.titleEl) ui.worldMap.titleEl.textContent = Z.name;
    const U = x => (x + 512) / 1024, Vv = z => (z - z0) / (z1 - z0);
    ui.worldMap.setLabels(Z.labels.map(([name, x, z, kind, levels]) => ({ name, x: U(x), y: Vv(z), kind, levels })));
    const p = this.game.player;
    ui.worldMap.setPlayer(U(p.pos.x), Vv(p.pos.z), p.facing);
    const mk = [];
    for (const n of Object.values(this.game.npcs)) if (n.questMark) mk.push({ x: U(n.pos.x), y: Vv(n.pos.z), type: n.questMark === '!' ? 'available' : 'complete', label: n.name });
    // objective areas are shaded blobs (a grey "?" reads as "turn in here")
    for (const a of p.quests) { const q = QUEST[a.id]; q.obj.forEach((o, i) => { if (o.area && (o.zone || q.zone || 'vale') === this.game.zoneId && a.progress[i] < (o.count ?? 1)) mk.push({ x: U(o.area[0]), y: Vv(o.area[1]), type: 'area', w: (o.area[2] || 20) * 2 / 1024, h: (o.area[2] || 20) * 2 / Math.abs(z1 - z0), label: q.title, lines: [o.label] }); }); }
    if (this.game.zoneId === 'vale') mk.push({ x: U(0), y: Vv(-282), type: 'boss', label: 'The Ember Maw' });
    if (p.party) for (const m of p.party.members) if (!m.offline) mk.push({ x: U(m.pos.x), y: Vv(m.pos.z), type: 'party', cls: m.cls, label: m.name });
    for (const w of this.e.waypoints?.markers() || []) if (w.kind === 'wp') mk.push({ x: U(w.x), y: Vv(w.z), type: 'wp', color: w.color, label: w.label, lines: ['Middle-click it again to remove your own.'] });
    ui.worldMap.setMarkers(mk);
  }

  pushWorldSpace(dt) {
    const ui = this.ui, e = this.e, cam = e.camera, p = this.game.player, g = this.g;
    const W = innerWidth, H = innerHeight, t = p.target;
    ui.nameplates.begin();
    for (const u of g.sim.units) {
      if (u === p || !u.model?.root.visible) continue;
      if ((u.kind === 'critter' || u.kind === 'node' || u.kind === 'object') && u !== t) continue; // critters, ore and herbs: a nameplate only when targeted
      const d = cam.position.distanceTo(u.pos);
      const foe = u === p.duelWith, isMob = u.hostile, maxD = u.boss ? 140 : isMob || foe ? 48 : u.kind === 'npc' ? 36 : 40;
      if (d > maxD && u !== t) continue;
      if (u.dead && !(u.lootable && isMob) && u !== t) continue;
      _v.set(u.pos.x, u.pos.y + (u.height || 1.8) + 0.45, u.pos.z).project(cam);
      if (_v.z > 1 || _v.x < -1.2 || _v.x > 1.2 || _v.y < -1.2 || _v.y > 1.2) continue;
      const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
      if (isMob) u.tapped = !!(u.tapper && u.tapper !== p && u.tapper !== p.party);
      const tmpl = u.template && MOBS[u.template];
      const quest = u.questMark === '!' ? 'available' : u.questMark === '?' ? 'complete' : undefined;
      ui.nameplates.set({
        id: u.id, x, y, scale: Math.max(0.65, Math.min(1.1, 14 / Math.max(d, 1))), depth: d,
        name: u.afk ? `<AFK> ${u.name}` : u.name, guild: u.guild || u.title, level: u.boss ? '??' : u.level, playerLevel: p.level,
        reaction: u.tapped ? 'tapped' : foe ? 'hostile' : undefined, isPlayer: u.kind === 'sim' || u.kind === 'remote', cls: u.cls,
        hp: u.hp, hpMax: u.hpMax, showHealth: isMob || foe ? (u === t || u.hp < u.hpMax || u.inCombat || foe) : false,
        target: u === t, dim: !!t && u !== t && isMob, quest, classification: u.boss ? 'boss' : u.rare ? 'rareelite' : u.elite ? 'elite' : 'normal',
        cast: u.casting && isMob ? { name: u.casting.spell?.name, icon: u.casting.spell?.icon, elapsed: u.casting.t, duration: u.casting.dur, interruptible: !u.boss, channel: !!u.casting.channel } : undefined,
        dead: u.dead, hostile: u.hostile || foe, kind: u.kind, elite: u.elite, rare: u.rare, boss: u.boss, tapped: u.tapped,
      });
    }
    ui.nameplates.end();
    // floating combat text anchors (units with fresh numbers)
    for (const [u, left] of this.fctUnits) {
      const l = left - dt;
      if (l <= 0 || !u.model) { this.fctUnits.delete(u); continue; }
      this.fctUnits.set(u, l);
      const big = u !== p && (u.boss || (u.radius || 0) > 2.2 || (u.height || 0) > 6);
      if (big && !u.flying) {
        // a dragon's head is far above you in melee: show its numbers where you're hitting it, on the side facing you
        const dx = p.pos.x - u.pos.x, dz = p.pos.z - u.pos.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d * 0.7, (u.radius || 2) * 0.85);
        _v.set(u.pos.x + dx / d * r, p.pos.y + 3.4, u.pos.z + dz / d * r).project(cam);
      } else _v.set(u.pos.x, u.pos.y + (u.height || 1.8) * (u === p ? 1.05 : 1.15), u.pos.z).project(cam);
      let fx = (_v.x * 0.5 + 0.5) * W, fy = (-_v.y * 0.5 + 0.5) * H, on = _v.z < 1;
      if (big) { if (!on) { fx = W / 2; fy = H * 0.3; on = true; } fx = Math.max(W * 0.1, Math.min(W * 0.9, fx)); fy = Math.max(H * 0.14, Math.min(H * 0.7, fy)); } // always on screen
      ui.fct.anchor(u.id, fx, fy, on);
    }
  }

  // ------------------------------------------------------------------ action bar editing (spellbook drag, Shift-drag)
  editBar(fn) {
    for (const pc of new Set([this.game.pc, this.e.raid?.pc].filter(Boolean))) { fn(pc); pc.custom = true; }
    bus.emit('bar_changed', { bar: this.g.pc?.bar });
    this.e.save?.();
  }
  pushSpellbook() {
    const p = this.game.player, bar = this.g.pc?.bar || [];
    this.ui.spellbook.set({ cls: p.cls, level: p.level, spells: (CLASSES[p.cls].bar || []).map(id => { const sp = SPELLS[id], learn = sp.learn || 1; return { id, name: sp.name, icon: sp.icon, learn, known: learn <= p.level, onBar: bar.includes(id), tip: spellTip(sp, p) }; }) });
  }
  pushQuestLog() {
    const p = this.game.player, g = this.game, sub = t => String(t || '').replace(/\$N/g, p.name).replace(/\$C/g, CLASSES[p.cls]?.name || '').replace(/\$R/g, RACES[p.race]?.name || '');
    this.ui.questLog.set(p.quests.map(a => {
      const q = QUEST[a.id];
      return { id: q.id, title: q.title, level: q.level, complete: g.questComplete(a), text: sub(q.text), turnin: NPCS[q.turnin]?.name,
        objectives: q.obj.map((o, i) => ({ text: o.label, have: a.progress[i], need: o.count ?? 1, done: a.progress[i] >= (o.count ?? 1) })),
        rewards: { xp: q.xp, money: q.gold * 100, items: Array.isArray(q.rewards) ? q.rewards.map(id => uiItem(ITEMS[id], id)) : [], choice: q.rewards === 'gear' || q.rewards === 'rare' } };
    }));
  }
  pushSocial() {
    const p = this.game.player, party = p.party, dist = u => Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
    const nearby = this.g.sim.query(p.pos, 60).filter(u => u !== p && (u.kind === 'sim' || u.kind === 'remote') && !u.dead)
      .sort((a, b) => (b.kind === 'remote') - (a.kind === 'remote') || dist(a) - dist(b)).slice(0, 14)
      .map(u => ({ id: u.id, name: u.name, cls: u.cls, level: u.level, human: u.kind === 'remote', grouped: !!party && u.party === party, dist: Math.round(dist(u)) }));
    this.ui.social.set({
      party: party ? { lead: party.leader === p, members: party.all.map(m => ({ id: m.id, name: m.name, cls: m.cls, level: m.level, leader: m === party.leader, offline: !!m.offline, me: m === p, human: m.kind === 'remote' || m.kind === 'player' })) } : null,
      nearby, duel: !!p.duel,
    });
  }
  socialAction(a, id) {
    const it = this.e.interact, p = this.game.player;
    const u = (p.party?.all || []).find(m => m.id === id) || this.g.sim.units.find(m => m.id === id);
    if (a === 'leave') it.partyOp('leave');
    else if (!u) return;
    else if (a === 'whisper') this.ui.chat.open(`/w ${u.name} `);
    else if (a === 'invite' || a === 'kick' || a === 'promote') it.partyOp(a, u);
    else if (a === 'duel') it.duelOp('challenge', u);
    this.socialT = 0.4;
  }
  // ------------------------------------------------------------------ merchants
  openMerchant(npc) {
    this.vendor = npc; this.vendorStock = this.game.stock(npc.npcId);
    this.ui.questDialog.close();
    this.pushMerchant(); this.ui.merchant.tab = 'buy'; this.ui.merchant.render();
    this.ui.merchant.open(); if (!this.ui.bags.isOpen) this.ui.bags.open();
  }
  pushMerchant() {
    const g = this.game, it = e => e.gear ? uiItem(e.gear) : uiItem(ITEMS[e.id], e.id);
    const marks = this.vendorStock?.some(e => e.marks != null);
    this.ui.merchant.set({ name: this.vendor?.name || 'Merchant', items: (this.vendorStock || []).map(e => ({ item: it(e), price: e.price, marks: e.marks, count: e.count })),
      buyback: (g.buybackList || []).map(b => ({ item: it(b), count: b.count, price: b.price })), money: g.player.gold, marks: marks ? g.player.marks || 0 : null });
  }
  merchantBuy(i, n) {
    const e = this.vendorStock?.[i]; if (!e) return;
    if (e.marks != null) this.game.buyMarks(e, e.gear ? 1 : n);
    else if (e.gear) { if (this.game.buyGear(e.gear, e.price)) this.vendorStock.splice(i, 1); } // one of each piece
    else this.game.buy(e.id, n, e.price * n);
    this.merchantDirty = true;
  }
  // ------------------------------------------------------------------ duels, waypoints
  duelState(d) {
    if (d.unit !== this.game.player) return;
    const ui = this.ui;
    if (d.op === 'count') { if (d.other) ui.alerts.info(`Duel with ${d.other.name} starting!`); ui.alerts.countdown(d.n, '#ffd040'); bus.emit('sound', { name: 'pullTick' }); }
    else if (d.op === 'go') { ui.alerts.raidWarning('Duel!', '#ff5030'); bus.emit('sound', { name: 'pullGo' }); }
    else if (d.op === 'out') ui.alerts.raidWarning(`Return to the duel area within ${d.n} seconds or forfeit`, '#ffb040');
    else if (d.op === 'back') ui.alerts.info('Back in the duel area.');
  }
  /** Minimap click (0..1 across the canvas) → the world point under it (the minimap turns with the camera). */
  minimapToWorld(fx, fy) {
    if (this.e.mode !== 'world') return null;
    const p = this.game.player, yaw = this.e.cam.yaw, s = 256 / (this.mmRadius * 2);
    const rx = (fx - 0.5) * 256, rz = (fy - 0.5) * 256, c = Math.cos(yaw), sn = Math.sin(yaw);
    return { x: p.pos.x + (rx * c + rz * sn) / s, z: p.pos.z + (-rx * sn + rz * c) / s };
  }

  dispose() { for (const o of this.offs) o(); this.ui.dispose(); }
}
