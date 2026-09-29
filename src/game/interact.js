// Player-to-player interactions: the right-click menu on players (SimPlayers and co-op friends), Inspect, Trade and
// Follow. Trades with friends travel through the host (net/host.js routes them); trades with SimPlayers are answered
// by a small haggling bot right here, since a SimPlayer's gold only exists as a line of chat.
import { bus } from './events.js';
import { makeGear, SLOTS, ITEMS, isTwoHand, makeCosmetic } from './items.js';
import { uiItem } from './hud.js';
import { fmtMoney } from './game.js';
import { iconURL } from '../ui/icons.js';
import { rarityColor } from '../ui/util.js';
import { RNG } from '../core/noise.js';

const CSS = `
.evd-pmenu{position:fixed;z-index:65;min-width:170px;padding:6px 0;border-radius:6px;background:linear-gradient(180deg,#221810,#110c08);border:1px solid #8a6a2a;box-shadow:0 0 0 1px #000,0 10px 30px rgba(0,0,0,.6);font:600 14px 'Roboto Condensed',Arial,sans-serif;color:#f2e2bc}
.evd-pmenu .hd{padding:4px 14px 6px;font:700 15px Cinzel,Georgia,serif;border-bottom:1px solid rgba(255,210,130,.18);margin-bottom:4px}
.evd-pmenu .hd small{display:block;font:500 12px 'Roboto Condensed',Arial,sans-serif;color:#b8a888}
.evd-pmenu button{display:block;width:100%;text-align:left;padding:7px 14px;background:none;border:0;color:inherit;font:inherit;cursor:pointer}
.evd-pmenu button:hover,.evd-pmenu button:focus-visible{background:rgba(255,210,120,.12);outline:none}
.evd-pmenu button:disabled{color:#7a6e58;cursor:default;background:none}
.evd-ptrade,.evd-pinspect{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);pointer-events:auto;padding:18px 18px 16px;color:#f2e2bc;font-family:var(--font)}
.evd-pinspect{width:640px;max-width:calc(100vw - 32px);box-sizing:border-box}.evd-ptrade{width:560px}
.evd-pinspect .slots{display:grid;grid-template-columns:1fr 1fr;column-gap:16px}.evd-pinspect .slots>p{grid-column:1/-1}
@media (max-width:700px){.evd-pinspect .slots{grid-template-columns:1fr}}
.evd-pw .x{position:absolute;right:8px;top:6px;background:none;border:0;color:#c9b890;font:18px/1 sans-serif;cursor:pointer;padding:6px}
.evd-pw h3{margin:0 0 2px;font:700 20px var(--serif);color:var(--gold);text-shadow:var(--ol)}
.evd-pw .sub{margin:0 0 12px;font-size:13px;color:#c9b890}
.evd-pw .row{display:flex;align-items:center;gap:9px;padding:4px 2px;border-bottom:1px solid rgba(255,255,255,.05);min-height:34px}
.evd-pw .ic{width:30px;height:30px;border-radius:4px;box-shadow:0 0 0 1px #000,0 0 0 2px var(--rc,#555);background:#0b0806 center/cover}
.evd-pw .nm{flex:1;font:600 13.5px var(--font);text-shadow:var(--ol);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.evd-pw .sl{font-size:11.5px;color:#9a8c70;width:62px;text-transform:uppercase;letter-spacing:.06em}
.evd-pw .il{font-size:12px;color:#b8a888}
.evd-pw .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.evd-pw .box{padding:10px;border-radius:5px;background:rgba(0,0,0,.25);box-shadow:inset 0 0 0 1px rgba(255,210,130,.14)}
.evd-pw .box.ok{box-shadow:inset 0 0 0 2px #40d070}
.evd-pw h4{margin:0 0 8px;font:700 14px var(--serif);color:#ffe7a8}
.evd-pw .slots{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;min-height:40px}
.evd-pw .slot{position:relative;aspect-ratio:1;border-radius:4px;background:#0b0806 center/cover;box-shadow:0 0 0 1px #000,0 0 0 2px var(--rc,#3a2e20);cursor:pointer}
.evd-pw .slot.empty{cursor:default;opacity:.45}
.evd-pw .slot b{position:absolute;right:2px;bottom:0;font:700 11px var(--font);text-shadow:var(--ol)}
.evd-pw .gold{margin-top:8px;display:flex;align-items:center;gap:6px;font-size:13px}
.evd-pw .gold input{width:58px;padding:4px 5px;border-radius:4px;border:1px solid #6a5028;background:#0b0806;color:#ffe7a8;font:600 13px var(--font)}
.evd-pw .state{margin-top:8px;font-size:12.5px;color:#9a8c70;min-height:16px}
.evd-pw .state.ok{color:#50e080}
.evd-pw .bags{margin-top:12px}
.evd-pw .bags .slots{grid-template-columns:repeat(10,1fr)}
.evd-pw .foot{display:flex;justify-content:flex-end;gap:10px;margin-top:14px}
.evd-pw .foot button{font:700 14px var(--serif);padding:8px 18px;border-radius:4px;cursor:pointer;color:#ffe7a8;border:1px solid #c89a4a;background:linear-gradient(#9a2a1a,#5a1008)}
.evd-pw .foot button.dark{background:linear-gradient(#3a2c1c,#1c140c)}
.evd-pw .foot button:disabled{opacity:.5;cursor:default}
`;
const SLOT_LABEL = { head: 'Head', neck: 'Neck', shoulders: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt', tabard: 'Tabard', wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet',
  finger1: 'Finger', finger2: 'Finger', trinket1: 'Trinket', trinket2: 'Trinket', weapon: 'Main Hand', offhand: 'Off Hand', ranged: 'Ranged' };
const RMUL = { poor: 0.4, common: 1.2, uncommon: 1.8, rare: 2.8, epic: 4.5 };
const isPlayer = u => u && (u.kind === 'sim' || u.kind === 'remote');
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const tradable = b => b && (b.gear ? true : ITEMS[b.id] && !ITEMS[b.id].quest && b.id !== 'hearthstone'); // quest items and the hearthstone stay yours
const itemOf = e => (e.gear ? e.gear : ITEMS[e.id]);
const valueOf = e => { const it = itemOf(e); return (it?.sell || (e.gear ? 5 + (e.gear.ilvl || 1) * 3 : 1)) * 25 * (e.count || 1); };

export class Interactions {
  constructor(app) {
    this.app = app; this.trade = null;
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    bus.on('interact_sim', ({ unit }) => this.menu(unit));
    app.ui.target.el.addEventListener('contextmenu', e => { e.preventDefault(); const t = this.player?.target; if (isPlayer(t) || (t && t === this.player)) this.menu(t, e.clientX, e.clientY); });
    app.ui.player.el.addEventListener('contextmenu', e => { e.preventDefault(); if (this.player) this.selfMenu(e.clientX, e.clientY); });
    for (const f of app.ui.party.m) f.el.addEventListener('contextmenu', e => { e.preventDefault(); if (isPlayer(f.u)) this.menu(f.u, e.clientX, e.clientY); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && (this.menuEl || this.win)) { this.closeMenu(); } }, true);
  }
  get game() { return this.app.game; }
  get player() { return this.app.game.player; }
  get ui() { return this.app.ui; }
  get pc() { return this.app.mode === 'raid' ? this.app.raid?.pc : this.game.pc; }
  say(text) { bus.emit('chat', { ch: 'system', text }); }

  // ---------------------------------------------------------------- the menu
  menu(u, x, y) {
    if (!isPlayer(u) || u === this.player) { if (u === this.player) this.selfMenu(x, y); return; }
    const me = this.player, party = me.party, inParty = !!party && u.party === party, lead = !!party && party.leader === me;
    const human = u.kind === 'remote';
    const { el, item } = this.openMenu(u.name, `Level ${u.level} ${cap(u.race)} ${cap(u.cls)}${human ? ' · player' : ''}${u.offline ? ' · offline' : ''}`, x, y);
    item('Whisper', () => this.ui.chat.open(`/w ${u.name} `), u.offline);
    if (!inParty) item('Invite to Party', () => this.partyOp('invite', u), !!party && party.full);
    else {
      if (lead && human) item('Promote to Leader', () => this.partyOp('promote', u));
      if (lead) item('Remove from Party', () => this.partyOp('kick', u));
    }
    item('Inspect', () => this.inspect(u), u.offline);
    item('Trade', () => this.startTrade(u), !!this.trade || u.dead || u.offline);
    item(this.pc?.follow === u ? 'Stop Following' : 'Follow', () => this.follow(u), u.dead || u.offline);
    const dueling = me.duel && (me.duelWith === u || me.duel.a === u || me.duel.b === u);
    if (dueling) item('Yield the Duel', () => this.duelOp('yield'));
    else item('Challenge to a Duel', () => this.duelOp('challenge', u), !!me.duel || u.dead || u.offline || this.app.mode === 'raid');
    if (inParty) item('Leave Party', () => this.partyOp('leave'));
    this.showMenu(el);
  }
  /** Right-click your own portrait: group and duel options (WoW's self menu). */
  selfMenu(x, y) {
    const me = this.player; if (!me) return;
    const party = me.party;
    const { el, item } = this.openMenu(me.name, party ? `${party.leader === me ? 'Group leader' : `In ${party.leader?.name || 'a'}'s group`} · ${party.size}/5` : 'Not in a group', x, y);
    item('Leave Party', () => this.partyOp('leave'), !party);
    if (me.duel) item('Yield the Duel', () => this.duelOp('yield'));
    item('Social Window (O)', () => this.ui.emit('micro', 'social'));
    this.showMenu(el);
  }
  openMenu(title, sub, x, y) {
    this.closeMenu();
    const m = this.app.input.mouse;
    const el = this.menuEl = document.createElement('div');
    el.className = 'evd-pmenu'; el.setAttribute('role', 'menu');
    el._x = x ?? (m.x || innerWidth / 2); el._y = y ?? (m.y || innerHeight / 2);
    el.innerHTML = `<div class="hd"></div>`;
    el.querySelector('.hd').append(title, Object.assign(document.createElement('small'), { textContent: sub }));
    const item = (label, fn, disabled = false) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled; b.setAttribute('role', 'menuitem'); b.addEventListener('click', () => { this.closeMenu(); fn(); }); el.appendChild(b); };
    return { el, item };
  }
  showMenu(el) {
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, el._x + 6)) + 'px';
    el.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, el._y - 10)) + 'px';
    setTimeout(() => { this.outside = e => { if (!el.contains(e.target)) this.closeMenu(); }; addEventListener('pointerdown', this.outside, true); }, 0);
    el.querySelector('button:not(:disabled)')?.focus();
  }
  /** Group and duel requests: a friend's browser asks the host; solo or hosting, Social / Duels decide here. */
  partyOp(op, u) {
    if (this.app.guest) return this.app.guest.partyOp(op, u);
    const soc = this.game.social, me = this.player;
    if (op === 'invite') soc.invite(me, u); else if (op === 'kick') soc.kick(me, u); else if (op === 'promote') soc.promote(me, u);
    else if (op === 'leave') { if (me.party) soc.leave(me); else this.say("You aren't in a group."); }
  }
  duelOp(op, u) {
    if (this.app.guest) return this.app.guest.duelOp(op, u);
    const d = this.game.duels;
    if (op === 'challenge') d.challenge(this.player, u); else if (op === 'yield') d.forfeit(this.player);
  }
  closeMenu() { this.menuEl?.remove(); this.menuEl = null; if (this.outside) removeEventListener('pointerdown', this.outside, true); this.outside = null; }

  follow(u) {
    const pc = this.pc; if (!pc) return;
    if (pc.follow === u) { pc.follow = null; this.say(`You stop following ${u.name}.`); return; }
    pc.follow = u; this.say(`You are now following ${u.name}. Move to stop.`);
  }

  // ---------------------------------------------------------------- inspect
  inspect(u) {
    if (this.app.guest) { this.app.guest.net.send({ t: 'inspect', id: u.netId }); return; } // the host knows everyone's gear
    this.showInspect(this.inspectData(u));
  }
  /** What a unit is wearing (friends send their own gear; SimPlayers get a consistent set for their gear tier). */
  inspectData(u) {
    const eq = u === this.player || u.kind === 'remote' ? (u.equip || {}) : this.simGear(u);
    return { name: u.name, level: u.level, race: u.race, cls: u.cls, guild: u.guild || null, items: SLOTS.filter(s => eq[s] || (s !== 'shirt' && s !== 'tabard')).map(s => [s, eq[s] || null]) };
  }
  simGear(u) {
    if (u._gear) return u._gear;
    const rng = new RNG('inspect-' + u.id + u.name), tier = u.gearTier ?? 1, eq = {};
    const gcls = u.cls === 'mage' || u.cls === 'priest' ? u.cls : 'warrior';
    for (const s of SLOTS) {
      const type = s.replace(/[12]$/, '');
      if (type === 'shirt' || type === 'tabard') { if (rng.next() < 0.4) eq[s] = makeCosmetic(rng.pick(type === 'shirt' ? ['shirtWhite', 'shirtRed', 'shirtBlue', 'shirtBlack'] : ['tabardDawn', 'tabardCrown', ...(tier >= 3 ? ['tabardMaw'] : [])])); continue; }
      if (type === 'offhand' && (gcls === 'warrior' || isTwoHand(eq.weapon))) continue;
      if (tier === 0 && rng.next() < 0.35) continue;
      const rarity = tier >= 3 ? (rng.next() < 0.55 ? 'epic' : 'rare') : tier === 2 ? (rng.next() < 0.5 ? 'rare' : 'uncommon') : tier === 1 ? (rng.next() < 0.7 ? 'uncommon' : 'common') : 'common';
      eq[s] = makeGear(rng, gcls, u.level + tier * 2, rarity, type);
    }
    return (u._gear = eq);
  }
  showInspect(d) {
    this.closeWindow();
    const w = this.window('evd-pinspect'); w.body.className = 'slots';
    w.h3.textContent = d.name;
    w.sub.textContent = `Level ${d.level} ${cap(d.race)} ${cap(d.cls)}${d.guild ? ` <${d.guild}>` : ''}`;
    let sum = 0, n = 0;
    for (const [slot, it] of d.items) {
      const row = document.createElement('div'); row.className = 'row';
      const ic = document.createElement('div'); ic.className = 'ic';
      const sl = document.createElement('span'); sl.className = 'sl'; sl.textContent = SLOT_LABEL[slot] || slot;
      const nm = document.createElement('span'); nm.className = 'nm';
      const il = document.createElement('span'); il.className = 'il';
      if (it) { ic.style.backgroundImage = `url("${iconURL(it.icon || 'unknown', 64)}")`; ic.style.setProperty('--rc', rarityColor(it.rarity)); nm.textContent = it.name; nm.style.color = rarityColor(it.rarity); il.textContent = it.ilvl ? `ilvl ${it.ilvl}` : ''; row._tip = () => ({ type: 'item', item: uiItem(it) }); if (!it.cosmetic) { sum += it.ilvl || 0; n++; } }
      else { nm.textContent = 'Empty'; nm.style.color = '#6a604e'; }
      row.append(sl, ic, nm, il); w.body.appendChild(row);
    }
    const avg = document.createElement('p'); avg.className = 'sub'; avg.style.margin = '10px 0 0'; avg.textContent = n ? `Average item level ${Math.round(sum / n)}` : 'Wearing nothing worth mentioning.';
    w.body.appendChild(avg);
  }

  // ---------------------------------------------------------------- windows
  window(cls) {
    const el = document.createElement('div'); el.className = `evd-panel evd-pw ${cls}`;
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Close');
    const h3 = document.createElement('h3'), sub = document.createElement('p'), body = document.createElement('div');
    sub.className = 'sub'; el.append(x, h3, sub, body);
    this.ui.modalLayer.appendChild(el);
    x.addEventListener('click', () => (this.trade ? this.cancelTrade(true) : this.closeWindow()));
    this.win = el;
    this.esc = e => { if (e.key !== 'Escape') return; if (this.trade) this.cancelTrade(true); else this.closeWindow(); };
    addEventListener('keydown', this.esc);
    return { el, h3, sub, body };
  }
  closeWindow() { this.win?.remove(); this.win = null; if (this.esc) removeEventListener('keydown', this.esc); this.esc = null; this.ui.tooltip?.hide?.(); }

  // ---------------------------------------------------------------- trade
  // Protocol (messages {k}): req → open | no; offer {v, items, gold}; accept {my, their}; cancel. Each side swaps its
  // own bags when both have accepted the same two offer versions, so a last-second change can't slip through.
  startTrade(u) {
    const p = this.player;
    if (this.trade) return bus.emit('error', { unit: p, msg: 'You are already trading.' });
    if (Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) > 15) return bus.emit('error', { unit: p, msg: 'You are too far away to trade.' });
    if (u.kind === 'sim') { this.openTrade(u, true); this.botSay(u, ['whatcha got', 'sup, selling?', 'show me the goods', 'k', 'buying anything shiny']); return; }
    this.send(u, { k: 'req' });
    this.say(`You have requested to trade with ${u.name}.`);
  }
  send(u, m) {
    if (this.app.guest) this.app.guest.net.send({ t: 'trade', to: u.netId, m });
    else if (this.app.net) { const gst = this.app.net.byProxy.get(u); if (gst) this.app.net.send(gst, { t: 'trade', from: this.player.id, m }); }
  }
  /** A trade message from another human (routed by the host). */
  onTrade(u, m) {
    if (!u) return;
    const t = this.trade;
    switch (m.k) {
      case 'req':
        if (t) return this.send(u, { k: 'no', busy: 1 });
        this.ui.popups.show({ id: 'trade', text: `**${u.name}** wants to trade with you.`, accept: 'Trade', decline: 'Decline', timeout: 30,
          onAccept: () => { if (this.trade) return; this.openTrade(u, false); this.send(u, { k: 'open' }); },
          onDecline: () => this.send(u, { k: 'no' }), onTimeout: () => this.send(u, { k: 'no' }) });
        return;
      case 'open': if (!t) this.openTrade(u, false); return;
      case 'no': this.say(m.busy ? `${u.name} is busy.` : `${u.name} declined your trade.`); return;
      case 'offer': if (t?.with !== u) return; t.theirs = { v: m.v, items: m.items || [], gold: Math.max(0, m.gold | 0) }; t.okMine = t.okTheirs = false; this.renderTrade(); return;
      case 'accept': if (t?.with !== u) return; if (m.my === t.theirs.v && m.their === t.mine.v) { t.okTheirs = true; this.renderTrade(); this.tryFinish(); } return;
      case 'cancel': if (t?.with === u) { this.say(`${u.name} cancelled the trade.`); this.endTrade(); } return;
    }
  }
  openTrade(u, bot) {
    this.closeWindow();
    this.trade = { with: u, bot, mine: { v: 0, items: [], gold: 0 }, theirs: { v: 0, items: [], gold: 0 }, okMine: false, okTheirs: false };
    const w = this.window('evd-ptrade');
    w.h3.textContent = `Trade with ${u.name}`;
    w.sub.textContent = bot ? 'SimPlayers pay in gold for things they like.' : 'Click items in your bags to offer them. Both of you press Trade to swap.';
    w.body.innerHTML = `<div class="cols">
      <div class="box mine"><h4>You</h4><div class="slots"></div><div class="gold"><input type="number" min="0" step="1" aria-label="Gold"> g <input type="number" min="0" max="99" step="1" aria-label="Silver"> s</div><div class="state"></div></div>
      <div class="box theirs"><h4></h4><div class="slots"></div><div class="gold"></div><div class="state"></div></div>
    </div>
    <div class="bags"><h4>Your bags</h4><div class="slots"></div></div>
    <div class="foot"><button type="button" class="dark cancel">Cancel</button><button type="button" class="go">Trade</button></div>`;
    w.body.querySelector('.theirs h4').textContent = u.name;
    const [gi, si] = w.body.querySelectorAll('.mine input');
    const onGold = () => { const c = Math.max(0, Math.floor(+gi.value || 0)) * 10000 + Math.max(0, Math.min(99, Math.floor(+si.value || 0))) * 100; if (c !== this.trade.mine.gold) { this.trade.mine.gold = Math.min(c, this.player.gold); this.changed(); } };
    for (const i of [gi, si]) { i.addEventListener('change', onGold); i.addEventListener('keydown', e => e.stopPropagation()); }
    w.body.querySelector('.cancel').addEventListener('click', () => this.cancelTrade(true));
    w.body.querySelector('.go').addEventListener('click', () => this.acceptTrade());
    this.renderTrade();
  }
  changed() {
    const t = this.trade; if (!t) return;
    t.mine.v++; t.okMine = t.okTheirs = false;
    if (t.bot) this.botConsider();
    else this.send(t.with, { k: 'offer', v: t.mine.v, gold: t.mine.gold, items: t.mine.items.map(e => (e.ref.gear ? { gear: e.ref.gear } : { id: e.ref.id, count: e.ref.count })) });
    this.renderTrade();
  }
  renderTrade() {
    const t = this.trade, w = this.win; if (!t || !w) return;
    const p = this.player;
    const slotEl = (entry, onClick) => {
      const s = document.createElement('div'); s.className = 'slot' + (entry ? '' : ' empty');
      if (entry) {
        const it = itemOf(entry); s.style.backgroundImage = `url("${iconURL(it?.icon || 'unknown', 64)}")`; s.style.setProperty('--rc', rarityColor(it?.rarity || 'common'));
        if (entry.count > 1) { const b = document.createElement('b'); b.textContent = entry.count; s.appendChild(b); }
        s._tip = () => ({ type: 'item', item: entry.gear ? uiItem(entry.gear) : uiItem(ITEMS[entry.id], entry.id) });
        if (onClick) s.addEventListener('click', onClick);
      }
      return s;
    };
    const fill = (host, list, onClick) => { host.textContent = ''; for (let i = 0; i < 6; i++) host.appendChild(slotEl(list[i], list[i] && onClick ? () => onClick(i) : null)); };
    fill(w.querySelector('.mine .slots'), t.mine.items.map(e => e.ref), i => { t.mine.items.splice(i, 1); this.changed(); });
    fill(w.querySelector('.theirs .slots'), t.theirs.items);
    w.querySelector('.theirs .gold').textContent = t.theirs.gold ? fmtMoney(t.theirs.gold) : '';
    const bags = w.querySelector('.bags .slots'); bags.textContent = '';
    const offered = new Set(t.mine.items.map(e => e.ref));
    for (const b of p.bags) {
      if (offered.has(b) || !tradable(b)) continue;
      bags.appendChild(slotEl(b, () => { if (t.mine.items.length >= 6) return; t.mine.items.push({ ref: b }); this.changed(); }));
    }
    if (!bags.children.length) bags.textContent = 'Nothing to trade.';
    w.querySelector('.mine').classList.toggle('ok', t.okMine); w.querySelector('.theirs').classList.toggle('ok', t.okTheirs);
    const ms = w.querySelector('.mine .state'), ts = w.querySelector('.theirs .state');
    ms.textContent = t.okMine ? 'You accepted' : `You have ${fmtMoney(p.gold)}`; ms.classList.toggle('ok', t.okMine);
    ts.textContent = t.okTheirs ? `${t.with.name} accepted` : t.bot ? (t.thinking ? 'Thinking…' : '') : 'Waiting…'; ts.classList.toggle('ok', t.okTheirs);
    w.querySelector('.go').disabled = t.okMine || (!t.mine.items.length && !t.mine.gold && !t.theirs.items.length && !t.theirs.gold);
  }
  acceptTrade() {
    const t = this.trade; if (!t) return;
    t.okMine = true;
    if (!t.bot) this.send(t.with, { k: 'accept', my: t.mine.v, their: t.theirs.v });
    this.renderTrade(); this.tryFinish();
  }
  tryFinish() {
    const t = this.trade; if (!t || !t.okMine || !t.okTheirs) return;
    const p = this.player, g = this.game;
    if (t.mine.items.some(e => !p.bags.includes(e.ref)) || p.gold < t.mine.gold) { this.say('Trade failed: something you offered is gone.'); this.cancelTrade(true); return; }
    p.bags = p.bags.filter(b => !t.mine.items.some(e => e.ref === b));
    p.gold += t.theirs.gold - t.mine.gold;
    for (const it of t.theirs.items) { if (it.gear) g.addGear({ ...it.gear }, false); else if (ITEMS[it.id]) g.addItem(it.id, it.count || 1); }
    bus.emit('bags_changed', { unit: p }); if (t.theirs.gold || t.mine.gold) bus.emit('money', { amount: t.theirs.gold - t.mine.gold });
    this.say(`Trade complete with ${t.with.name}.`);
    bus.emit('sound', { name: 'itemPickup' });
    g.checkQuestObjectives?.();
    this.endTrade();
    this.app.save?.();
  }
  cancelTrade(tell) { const t = this.trade; if (!t) return; if (tell && !t.bot) this.send(t.with, { k: 'cancel' }); this.say('Trade cancelled.'); this.endTrade(); }
  endTrade() { clearTimeout(this.trade?.botT); this.trade = null; this.closeWindow(); }

  // ---------------------------------------------------------------- SimPlayer haggling
  botSay(u, lines) { const s = lines[Math.floor(Math.random() * lines.length)]; bus.emit('chat', { ch: 'whisper', from: u.name, cls: u.cls, text: s, to: 'you' }); }
  botConsider() {
    const t = this.trade; clearTimeout(t.botT); t.thinking = true;
    t.botT = setTimeout(() => {
      if (this.trade !== t) return;
      t.thinking = false;
      const items = t.mine.items.map(e => e.ref);
      if (!items.length && !t.mine.gold) { t.theirs = { v: t.theirs.v + 1, items: [], gold: 0 }; this.renderTrade(); return; }
      if (!items.length) { t.theirs = { v: t.theirs.v + 1, items: [], gold: 0 }; t.okTheirs = true; this.botSay(t.with, ['free gold?? ty!!', 'wow ty', 'lol ok ty']); this.renderTrade(); return; }
      const junk = items.every(b => itemOf(b)?.rarity === 'poor');
      if (junk) { this.botSay(t.with, ['lol no', 'vendor that', 'thats trash man', 'no ty']); t.theirs = { v: t.theirs.v + 1, items: [], gold: 0 }; this.renderTrade(); return; }
      let offer = 0; for (const b of items) offer += valueOf(b) * (RMUL[itemOf(b)?.rarity] || 1);
      offer = Math.max(100, Math.round(offer * (0.85 + Math.random() * 0.35) / 100) * 100);
      t.theirs = { v: t.theirs.v + 1, items: [], gold: offer }; t.okTheirs = true;
      this.botSay(t.with, [`${fmtMoney(offer)}, final offer`, `ill give u ${fmtMoney(offer)}`, `${fmtMoney(offer)}? take it or leave it`, `hmm ok ${fmtMoney(offer)}`]);
      this.renderTrade();
    }, 1100 + Math.random() * 900);
    this.renderTrade();
  }
}
