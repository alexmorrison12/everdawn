// More windows: Spellbook (P), Quest Log (L), Social (O) and the Merchant. Like the Character window they dock
// side by side down the left of the screen (UI._layout). The game pushes plain data in; clicks come back as events.
import { h, setText, show, classColor, CLASS_NAMES, rarityColor } from './util.js';
import { iconURL } from './icons.js';
import { questMarkURL, glyphURL } from './art.js';
import { moneyEl } from './tooltip.js';
import { Window, itemSlot, fillSlot, dragIcon } from './panels.js';

// ------------------------------------------------------------------------------------ dragging abilities
// dropping one on an action-bar slot places it there (dragIcon lives in panels.js)
function dragAbility(ui, e, icon, onDrop) {
  dragIcon(e, icon, (x, y, els) => { const slot = els.find(n => n.classList?.contains('evd-abslot')); onDrop(slot ? ui.actionBar.slots.findIndex(s => s.el === slot) : -1); });
}
/** Shift-drag an ability off the action bar to move it to another slot or take it off (WoW's locked bars). */
export function enableBarDrag(ui) {
  const slots = ui.actionBar.slots || [];
  slots.forEach((s, i) => s.el.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.shiftKey || e.pointerType === 'touch' || i >= 10 || !s.d) return;
    e.preventDefault(); e.stopPropagation();
    dragAbility(ui, e, s.d.icon, j => ui.emit('barMove', i, j));
  }, true));
}

// ------------------------------------------------------------------------------------ spellbook
export class SpellBook extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'spellbook', 'heavy', 'Spellbook & Abilities');
    this.dock = true;
    this.sub = h('div', 'bsub', this.el);
    this.grid = h('div', 'sbgrid', this.el);
    h('div', 'bhint', this.el, 'Click an ability to use it. Drag it onto your action bar to place it there; Shift-drag on the bar to move or remove.');
  }
  /** d: { cls, level, spells: [{ id, name, icon, learn, known, tip }] } */
  set(d) {
    this.sub.textContent = '';
    const c = h('span', '', this.sub, CLASS_NAMES[d.cls] || d.cls); c.style.color = classColor(d.cls);
    this.sub.append(` · Level ${d.level}`);
    this.grid.textContent = '';
    for (const sp of d.spells) {
      const r = h('div', 'sbrow' + (sp.known ? '' : ' locked'), this.grid);
      const ic = itemSlot(r, 'ptr'); ic.img.src = iconURL(sp.icon, 64); ic.classList.remove('empty');
      ic._tip = () => ({ type: 'spell', spell: sp.tip, icon: sp.icon });
      const t = h('div', 'sbt', r); h('div', 'sbn', t, sp.name); h('div', 'sbl', t, sp.known ? (sp.onBar ? 'On your action bar' : 'Not on your action bar') : `Learned at level ${sp.learn}`);
      if (!sp.known) continue;
      ic.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        const x0 = e.clientX, y0 = e.clientY;
        const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { off(); dragAbility(this.ui, ev, sp.icon, i => { if (i >= 0 && i < 10) this.ui.emit('barPlace', i, sp.id); }); } };
        const up = () => { off(); this.ui.emit('spellbookCast', sp.id); };
        const off = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
        addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
      });
    }
  }
}

// ------------------------------------------------------------------------------------ quest log
export class QuestLog extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'quests', 'heavy', 'Quest Log');
    this.dock = true; this.sel = null;
    const body = h('div', 'qlbody', this.el);
    this.list = h('div', 'qllist', body);
    this.page = h('div', 'qlpage', body);
    const f = h('div', 'qlfoot', this.el);
    this.count = h('span', 'qlcount', f);
    this.abandon = h('button', 'evd-btn small dark', f, 'Abandon Quest');
    this.abandon.addEventListener('click', () => { if (this.sel) this.ui.emit('questAbandon', this.sel); });
    this.data = [];
  }
  /** quests: [{ id, title, level, complete, text, objectives: [{ text, have, need, done }], rewards: { xp, money, items: [UI item] }, turnin }] */
  set(quests) {
    this.data = quests;
    if (!quests.find(q => q.id === this.sel)) this.sel = quests[0]?.id || null;
    setText(this.count, `${quests.length} / 20 quests`);
    this.list.textContent = '';
    for (const q of quests) {
      const r = h('div', 'qlq ptr' + (q.id === this.sel ? ' sel' : '') + (q.complete ? ' done' : ''), this.list);
      h('span', 'qll', r, `[${q.level}]`); h('span', 'qln', r, q.title);
      if (q.complete) h('span', 'qlc', r, 'Complete');
      r.addEventListener('click', () => { this.sel = q.id; this.set(this.data); });
    }
    this.abandon.disabled = !this.sel;
    this.page.textContent = '';
    const q = quests.find(x => x.id === this.sel);
    if (!q) { h('div', 'qlempty', this.page, 'Your quest log is empty. Look for a yellow ! above someone\'s head to find work.'); return; }
    h('div', 'qlt', this.page, q.title);
    const ob = h('div', 'qlobs', this.page);
    for (const o of q.objectives) h('div', 'qlob' + (o.done ? ' done' : ''), ob, o.need > 1 ? `${o.text}: ${o.have}/${o.need}` : `${o.text}${o.done ? ' (Complete)' : ''}`);
    if (q.complete && q.turnin) h('div', 'qlturn', this.page, `Return to ${q.turnin}.`);
    h('div', 'qlh', this.page, 'Description');
    h('div', 'qltext', this.page, q.text || '');
    const rw = q.rewards || {};
    if (rw.xp || rw.money || rw.items?.length || rw.choice) {
      h('div', 'qlh', this.page, 'Rewards');
      if (rw.choice) h('div', 'qltext', this.page, 'You will be able to choose one of several rewards.');
      for (const it of rw.items || []) { const r = h('div', 'qlrw', this.page); const sl = itemSlot(r); fillSlot(sl, it); sl._tip = () => ({ type: 'item', item: it }); const n = h('span', '', r, it.name); n.style.color = rarityColor(it.rarity); }
      const m = h('div', 'qlmoney', this.page);
      if (rw.money) moneyEl(rw.money, m);
      if (rw.xp) h('span', 'qlxp', m, `${rw.xp} experience`);
    }
  }
}

// ------------------------------------------------------------------------------------ social
export class SocialPanel extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'social', 'heavy', 'Social');
    this.dock = true;
    this.body = h('div', 'socbody', this.el);
    h('div', 'bhint', this.el, 'Middle-click (or Alt+click) the ground, minimap or world map to place a waypoint your group can see. Click the minimap to ping it.');
  }
  /** d: { me, party: null | { lead, members: [{ id, name, cls, level, leader, offline, me, human }] }, nearby: [{ id, name, cls, level, human, grouped, dist }], duel } */
  set(d) {
    const b = this.body; b.textContent = '';
    const act = (row, label, a, id, off = false) => { const bt = h('button', 'evd-btn small' + (a === 'kick' || a === 'leave' ? ' dark' : ''), row, label); bt.disabled = off; bt.addEventListener('click', () => this.ui.emit('social', a, id)); return bt; };
    h('div', 'soch', b, d.party ? `Your group (${d.party.members.length}/5)` : 'Your group');
    if (!d.party) h('div', 'socnone', b, 'You are not in a group. Invite someone below, right-click a player, or type /invite name.');
    else for (const m of d.party.members) {
      const r = h('div', 'socrow' + (m.offline ? ' off' : ''), b);
      if (m.leader) h('img', 'soclead', r).src = glyphURL('crown');
      const n = h('span', 'socn', r, m.name + (m.me ? ' (you)' : '')); n.style.color = classColor(m.cls);
      h('span', 'socl', r, m.offline ? 'Offline' : `${m.level} ${CLASS_NAMES[m.cls] || ''}${m.human && !m.me ? ' · player' : ''}`);
      if (m.me) { act(r, 'Leave Party', 'leave', m.id); continue; }
      act(r, 'Whisper', 'whisper', m.id, m.offline);
      if (d.party.lead && m.human) act(r, 'Promote', 'promote', m.id);
      if (d.party.lead) act(r, 'Remove', 'kick', m.id);
    }
    h('div', 'soch', b, 'Players nearby');
    if (!d.nearby.length) h('div', 'socnone', b, 'Nobody within 60 yards.');
    for (const m of d.nearby) {
      const r = h('div', 'socrow', b);
      const n = h('span', 'socn', r, m.name); n.style.color = classColor(m.cls);
      h('span', 'socl', r, `${m.level} ${CLASS_NAMES[m.cls] || ''}${m.human ? ' · player' : ''} · ${m.dist} yd`);
      act(r, m.grouped ? 'Grouped' : 'Invite', 'invite', m.id, m.grouped || (d.party && d.party.members.length >= 5));
      act(r, 'Whisper', 'whisper', m.id);
      act(r, 'Duel', 'duel', m.id, !!d.duel);
    }
  }
}

// ------------------------------------------------------------------------------------ merchant
export class Merchant extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'merchant', 'heavy', 'Merchant');
    this.dock = true; this.tab = 'buy';
    const tabs = h('div', 'mtabs', this.el);
    this.tBuy = h('button', 'mtab on', tabs, 'Merchant'); this.tBack = h('button', 'mtab', tabs, 'Buyback');
    this.tBuy.addEventListener('click', () => { this.tab = 'buy'; this.render(); });
    this.tBack.addEventListener('click', () => { this.tab = 'back'; this.render(); });
    this.grid = h('div', 'mgrid', this.el);
    const f = h('div', 'mfoot', this.el);
    this.junk = h('button', 'evd-btn small', f, 'Sell Junk');
    this.junk.addEventListener('click', () => this.ui.emit('merchantSellJunk'));
    this.money = h('span', 'mmoney', f);
    h('div', 'bhint', this.el, 'Right-click an item in your bags to sell it. Shift-click to buy five.');
    this.d = { name: '', items: [], buyback: [], money: 0 };
  }
  /** d: { name, items: [{ item, price, count }], buyback: [{ item, count, price }], money } */
  set(d) { this.d = { ...this.d, ...d }; if (d.name && this.titleEl) setText(this.titleEl, d.name); this.render(); }
  render() {
    const d = this.d, back = this.tab === 'back';
    this.tBuy.classList.toggle('on', !back); this.tBack.classList.toggle('on', back);
    this.grid.textContent = '';
    const list = back ? d.buyback : d.items;
    if (!list.length) h('div', 'mnone', this.grid, back ? 'Items you sell show up here for a while, in case you change your mind.' : 'Nothing for sale.');
    const marksPrice = (e, el) => { const m = h('span', 'mmk', el); h('img', '', m).src = iconURL('emberMark', 32); m.append(String(e.marks)); };
    list.forEach((e, i) => {
      const r = h('div', 'mrow ptr', this.grid);
      const sl = itemSlot(r); fillSlot(sl, { item: e.item, count: e.count }); sl._tip = () => ({ type: 'item', item: e.item });
      const t = h('div', 'mt', r); const n = h('div', 'mn', t, e.item.name); n.style.color = rarityColor(e.item.rarity);
      if (e.marks != null) { marksPrice(e, h('div', 'mp', t)); if ((d.marks || 0) < e.marks) r.classList.add('poor'); }
      else { moneyEl(e.price, h('div', 'mp', t)); if (d.money < e.price) r.classList.add('poor'); }
      r.addEventListener('click', ev => this.ui.emit(back ? 'merchantBuyback' : 'merchantBuy', i, ev.shiftKey ? 5 : 1));
      r.addEventListener('contextmenu', ev => { ev.preventDefault(); this.ui.emit(back ? 'merchantBuyback' : 'merchantBuy', i, 1); });
    });
    this.money.textContent = ''; moneyEl(d.money || 0, this.money);
    if (d.marks != null) { const m = h('span', 'mmk', this.money); h('img', '', m).src = iconURL('emberMark', 32); m.append(`${d.marks} Ember Marks`); }
  }
}

// ------------------------------------------------------------------------------------ professions
export class ProfessionsWindow extends Window {
  constructor(ui, parent) {
    super(ui, parent, 'professions', 'heavy', 'Professions');
    this.dock = true; this.sel = 'fishing';
    const body = h('div', 'pfbody', this.el);
    this.list = h('div', 'pflist', body);
    this.page = h('div', 'pfpage', body);
    this.data = [];
  }
  /** profs: [{ id, name, icon, kind, tip, skill, max, tool?, recipes: [{ id, name, icon, rarity, req, color, max, why, needs: [{ name, icon, need, have }], where }] }] */
  set(profs) {
    this.data = profs;
    this.list.textContent = '';
    for (const p of profs) {
      const r = h('div', 'pfrow ptr' + (p.id === this.sel ? ' sel' : ''), this.list);
      h('img', 'pfic', r).src = iconURL(p.icon, 64);
      const t = h('div', 'pft', r); h('div', 'pfn', t, p.name);
      const bar = h('div', 'pfbar', t); h('i', '', bar).style.width = (p.skill / p.max * 100) + '%'; h('span', '', bar, `${p.skill} / ${p.max}`);
      r.addEventListener('click', () => { this.sel = p.id; this.set(this.data); });
    }
    const p = profs.find(x => x.id === this.sel) || profs[0]; if (!p) return;
    const pg = this.page; pg.textContent = '';
    const hd = h('div', 'pfhd', pg); h('img', '', hd).src = iconURL(p.icon, 64); h('span', '', hd, `${p.name} · ${p.skill} / ${p.max}`);
    h('div', 'pftip', pg, p.tip);
    if (p.tool !== undefined) h('div', 'pftool' + (p.tool ? '' : ' none'), pg, p.tool ? `Using: ${p.tool}` : p.id === 'fishing' ? 'You need a Fishing Pole.' : 'You need a Mining Pick.');
    const ability = (id, icon, label) => {
      const row = h('div', 'pfab', pg), sl = itemSlot(row, 'ptr'); sl.img.src = iconURL(icon, 64); sl.classList.remove('empty');
      const bt = h('button', 'evd-btn small', row, label); bt.addEventListener('click', () => this.ui.emit('profUse', id));
      h('span', 'pfdrag', row, 'Drag the icon onto your action bar.');
      sl.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const x0 = e.clientX, y0 = e.clientY;
        const mv = ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { off(); dragAbility(this.ui, ev, icon, i => { if (i >= 0 && i < 10) this.ui.emit('barPlace', i, id); }); } };
        const up = () => { off(); this.ui.emit('profUse', id); };
        const off = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); };
        addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); });
    };
    if (p.id === 'fishing') ability('fishing', 'fishingPole', 'Fish');
    if (p.id === 'cooking') ability('campfire', 'campfire', 'Basic Campfire');
    if (!p.recipes.length) return;
    h('div', 'pfh', pg, 'Recipes');
    for (const r of p.recipes) {
      const row = h('div', 'pfrec c-' + r.color, pg);
      const sl = itemSlot(row); sl.img.src = iconURL(r.icon, 64, r.rarity === 'rare' || r.rarity === 'epic' ? { rarity: r.rarity } : undefined); sl.classList.remove('empty');
      const t = h('div', 'pfrt', row);
      h('div', 'pfrn', t, r.max > 0 ? `${r.name} [${r.max}]` : r.name);
      const need = h('div', 'pfneed', t);
      for (const n of r.needs) { const e = h('span', 'pfr' + (n.have >= n.need ? '' : ' short'), need); h('img', '', e).src = iconURL(n.icon, 32); e.append(`${n.have}/${n.need} ${n.name}`); }
      h('div', 'pfwhere', t, r.color === 'red' ? `Requires ${p.name} (${r.req})` : r.where);
      const b1 = h('button', 'evd-btn small', row, 'Create'), b2 = h('button', 'evd-btn small dark', row, 'All');
      b1.disabled = b2.disabled = !!r.why; if (r.why) row._tip = { type: 'text', title: r.name, lines: [r.why] };
      b1.addEventListener('click', () => this.ui.emit('craft', r.id, 1)); b2.addEventListener('click', () => this.ui.emit('craft', r.id, r.max));
    }
  }
}
