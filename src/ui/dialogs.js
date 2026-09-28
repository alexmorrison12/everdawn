// Popups (party/guild invite, duel, ready check, resurrect, confirm), loot window, need/greed/pass rolls,
// parchment quest dialog, death overlay.
import { h, setText, setCls, show, rarityColor, rarityName, classColor, fmtInt, replay, splitMoney } from './util.js';
import { iconURL } from './icons.js';
import { glyphURL, questMarkURL } from './art.js';
import { moneyEl } from './tooltip.js';

// ------------------------------------------------------------------------------------ static popups
export class Popups {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-popups', parent);
    this.list = [];
    ui._tick.push(this);
  }
  /**
   * Show a popup. p: { id?, text, accept='Accept', decline='Decline' (null = no button), timeout? (s), icon?, onAccept, onDecline, onTimeout, sound? }
   * Returns a handle { close() }. A popup with the same id replaces the previous one.
   */
  show(p) {
    if (p.id) this.close(p.id);
    const el = h('div', 'evd-popup evd-panel thin', this.el);
    const e = { p, el, end: p.timeout ? this.ui.now + p.timeout : 0 };
    const row = h('div', 'pr', el);
    if (p.icon) h('img', 'pi', row).src = p.icon.startsWith('data:') ? p.icon : iconURL(p.icon, 64);
    const tx = h('div', 'pt', row);
    this._richText(tx, p.text);
    if (p.timeout) { const tb = h('div', 'ptb', el); e.fill = h('i', 'fill', tb); e.fill.style.animationDuration = p.timeout + 's'; e.tt = h('span', 'ptt', tb); }
    const btns = h('div', 'pb', el);
    const done = (fn) => { this._remove(e); fn && fn(); };
    const a = h('button', 'evd-btn', btns, p.accept || 'Accept'); a.addEventListener('click', () => done(p.onAccept));
    if (p.decline !== null) { const d = h('button', 'evd-btn', btns, p.decline || 'Decline'); d.addEventListener('click', () => done(p.onDecline)); }
    this.list.push(e);
    if (this.list.length > 3) this._remove(this.list[0], true);
    replay(el, 'in');
    return { close: () => this._remove(e) };
  }
  _richText(el, text) {
    // **bold** segments render gold
    const parts = String(text).split(/\*\*(.+?)\*\*/g);
    parts.forEach((s, i) => { if (i % 2) h('b', '', el, s); else if (s) el.append(s); });
  }
  _remove(e, silent) { const i = this.list.indexOf(e); if (i < 0) return; this.list.splice(i, 1); e.el.remove(); if (!silent) { /* no-op */ } }
  close(id) { for (const e of [...this.list]) if (e.p.id === id) this._remove(e); }
  closeAll() { for (const e of [...this.list]) this._remove(e); }
  tick(now) {
    for (const e of [...this.list]) {
      if (!e.end) continue;
      const r = e.end - now;
      if (r <= 0) { this._remove(e); if (e.p.onTimeout) e.p.onTimeout(); else if (e.p.onDecline) e.p.onDecline(); continue; }
      setText(e.tt, Math.ceil(r) + 's');
    }
  }
  partyInvite(name, cb) { return this.show({ id: 'party', text: `**${name}** invites you to a group.`, icon: 'classWarrior', timeout: 60, onAccept: () => cb(true), onDecline: () => cb(false) }); }
  guildInvite(name, guild, cb) { return this.show({ id: 'guild', text: `**${name}** invites you to join the guild **<${guild}>**.`, icon: 'raceHuman', onAccept: () => cb(true), onDecline: () => cb(false) }); }
  duel(name, cb) { return this.show({ id: 'duel', text: `**${name}** has challenged you to a duel.`, icon: 'attack', timeout: 30, onAccept: () => cb(true), onDecline: () => cb(false) }); }
  readyCheck(leader, cb, timeout = 30) { return this.show({ id: 'ready', text: `**${leader}** is checking if everyone is ready.`, icon: 'hearthstone', accept: 'Ready', decline: 'Not Ready', timeout, onAccept: () => cb(true), onDecline: () => cb(false) }); }
  resurrect(name, cb, timeout = 60) { return this.show({ id: 'res', text: `**${name}** wants to resurrect you. Once resurrected, you will be returned to life with some health and mana.`, icon: 'renew', timeout, onAccept: () => cb(true), onDecline: () => cb(false) }); }
  confirm(text, cb, accept = 'Okay', decline = 'Cancel') { return this.show({ text, accept, decline, onAccept: () => cb(true), onDecline: () => cb(false) }); }
}

// ------------------------------------------------------------------------------------ loot window
export class LootWindow {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-loot evd-panel thin', parent);
    const hd = h('div', 'lh', el);
    this.icon = h('img', 'lp', hd);
    this.title = h('span', 'lt', hd, 'Loot');
    const x = h('button', 'evd-close', el); x.addEventListener('click', () => this.close());
    this.rows = h('div', 'lr', el);
    this.o = null;
    show(el, false);
  }
  /**
   * o: { title?, icon?, x?, y? (virtual px), entries: [{ item, count? , quest? } | { money: copper }], onLoot(index, entry), onClose(), autoRemove=true }
   */
  open(o) {
    this.o = o;
    setText(this.title, o.title || 'Loot');
    if (o.icon) this.icon.src = iconURL(o.icon, 64); show(this.icon, !!o.icon);
    this.entries = o.entries.slice();
    this._render();
    if (o.x != null) { this.el.style.left = o.x + 'px'; this.el.style.top = o.y + 'px'; } else { this.el.style.left = ''; this.el.style.top = ''; }
    show(this.el, true); replay(this.el, 'in');
    this.ui._panelOpened(this, 'loot');
  }
  _render() {
    this.rows.textContent = '';
    this.entries.forEach((e, i) => {
      if (!e) return;
      const r = h('div', 'li ptr', this.rows);
      const s = h('div', 'evd-slot', r);
      const img = h('img', 'ic', s);
      if (e.money != null) {
        img.src = iconURL('coin', 64);
        const m = splitMoney(e.money);
        h('span', 'ln', r, [m.g && `${m.g} Gold`, m.s && `${m.s} Silver`, m.c && `${m.c} Copper`].filter(Boolean).join(' ')).style.color = '#fff';
      } else {
        const it = e.item;
        img.src = iconURL(it.icon, 64, it.rarity && rarityName(it.rarity) !== 'common' ? { rarity: it.rarity } : undefined);
        s.classList.add('q-' + rarityName(it.rarity));
        if (e.count > 1) h('span', 'cnt', s, e.count);
        if (e.quest || it.questItem) { const q = h('img', 'qb', s); q.src = questMarkURL('available'); }
        h('span', 'ln', r, it.name).style.color = rarityColor(it.rarity);
        r._tip = () => ({ type: 'item', item: it });
      }
      r.addEventListener('click', () => {
        if (!this.o || !this.entries[i]) return;
        if (this.o.onLoot) this.o.onLoot(i, e);
        this.ui.emit('loot', i, e);
        if (this.o && this.o.autoRemove !== false) this.remove(i); // (taking the last item can close the window first)
      });
    });
  }
  /** Remove entry i (after it was looted). Closes when empty. */
  remove(i) { this.entries[i] = null; this._render(); if (!this.entries.some(Boolean)) this.close(); }
  close() { if (!this.el._s && this.el._s !== undefined) return; show(this.el, false); this.ui.tooltip.hide(); if (this.o && this.o.onClose) this.o.onClose(); this.o = null; this.ui._panelClosed(this, 'loot'); }
  get isOpen() { return !!this.o; }
}

// ------------------------------------------------------------------------------------ need / greed / pass
export class RollFrames {
  constructor(ui, parent) {
    this.ui = ui;
    this.el = h('div', 'evd-rolls', parent);
    this.map = new Map();
    ui._tick.push(this);
  }
  /** r: { id, item, duration = 60, onRoll(choice: 'need'|'greed'|'pass') , canNeed = true } */
  add(r) {
    const el = h('div', 'evd-roll evd-panel thin', this.el);
    const e = { r, el, end: this.ui.now + (r.duration || 60) };
    const s = h('div', 'evd-slot q-' + rarityName(r.item.rarity), el);
    h('img', 'ic', s).src = iconURL(r.item.icon, 64, { rarity: r.item.rarity });
    s._tip = () => ({ type: 'item', item: r.item }); s.classList.add('ptr');
    const mid = h('div', 'rm', el);
    const nm = h('div', 'rn', mid, r.item.name); nm.style.color = rarityColor(r.item.rarity);
    const tb = h('div', 'rt', mid); e.fill = h('i', 'fill', tb); e.fill.style.animationDuration = (r.duration || 60) + 's';
    e.status = h('div', 'rs', mid);
    const btns = e.btns = h('div', 'rb', el);
    for (const [c, tip] of [['need', 'Need'], ['greed', 'Greed'], ['pass', 'Pass']]) {
      const b = h('button', 'rbtn ' + c, btns); h('img', '', b).src = glyphURL(c);
      b._tip = () => ({ type: 'text', title: tip, lines: [c === 'need' ? 'Roll for this item because you need it.' : c === 'greed' ? 'Roll for this item because you want to sell it.' : 'Pass on this item.'] });
      if (c === 'need' && r.canNeed === false) b.disabled = true;
      b.addEventListener('click', () => this.choose(r.id, c));
    }
    this.map.set(r.id, e);
    replay(el, 'in');
  }
  choose(id, c) {
    const e = this.map.get(id); if (!e || e.choice) return;
    e.choice = c;
    setCls(e.el, 'chosen', true);
    e.btns.querySelectorAll('button').forEach(b => { b.disabled = true; setCls(b, 'sel', b.classList.contains(c)); });
    setText(e.status, c === 'pass' ? 'You passed.' : `You selected ${c === 'need' ? 'Need' : 'Greed'}.`);
    if (e.r.onRoll) e.r.onRoll(c);
    this.ui.emit('roll', id, c);
  }
  /** Show results. res: { rolls: [{ name, cls, type, roll }], winner?: name } — the frame closes after `hold` s. */
  result(id, res, hold = 6) {
    const e = this.map.get(id); if (!e) return;
    e.el.classList.add('result');
    const box = h('div', 'rr', e.el);
    const sorted = [...res.rolls].sort((a, b) => (a.type === 'pass') - (b.type === 'pass') || (a.type === 'greed') - (b.type === 'greed') || b.roll - a.roll);
    for (const x of sorted.slice(0, 6)) {
      const l = h('div', 'rl', box);
      h('img', '', l).src = glyphURL(x.type);
      h('span', 'rv', l, x.type === 'pass' ? '—' : x.roll);
      const n = h('span', '', l, x.name); n.style.color = classColor(x.cls);
      if (x.name === res.winner) l.classList.add('win');
    }
    if (res.winner) { const w = h('div', 'rw', box); w.append(`${res.winner} won `); const a = h('span', '', w, `[${e.r.item.name}]`); a.style.color = rarityColor(e.r.item.rarity); }
    e.end = this.ui.now + hold; e.resolved = true;
  }
  remove(id) { const e = this.map.get(id); if (e) { e.el.remove(); this.map.delete(id); } }
  tick(now) {
    for (const [id, e] of this.map) {
      if (now >= e.end) {
        if (!e.resolved && !e.choice) this.choose(id, 'pass');
        if (e.resolved || now >= e.end + 3) this.remove(id);
      }
    }
  }
}

// ------------------------------------------------------------------------------------ quest dialog
export class QuestDialog {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-quest evd-panel heavy evd-parch', parent);
    const top = h('div', 'qh', el);
    this.pt = h('canvas', 'qpt', top); this.pt.width = this.pt.height = 96;
    this.npc = h('div', 'qnpc', top);
    const x = h('button', 'evd-close', el); x.addEventListener('click', () => this.close(true));
    this.body = h('div', 'qb ptr', el);
    this.btns = h('div', 'qbtns', el);
    this.o = null; this.reveal = null;
    this.body.addEventListener('click', () => this._finishReveal());
    show(el, false);
    ui._tick.push(this);
  }
  /**
   * o: { mode: 'offer'|'progress'|'complete'|'gossip', npc: { name, portraitIcon? }, title, text, objectivesText?, objectives?: [{text, have, need}],
   *      rewards?: { items?: [{item, count}], choice?: [{item, count}], money?, xp? }, options?: [{ label, type, id }],
   *      onAccept, onDecline, onComplete(choiceIndex), onSelect(option) }
   * The portrait canvas (this.pt, 96×96) can be drawn into by the game; otherwise portraitIcon is painted.
   */
  open(o) {
    this.o = o; this.choice = -1;
    setText(this.npc, o.npc ? o.npc.name : '');
    if (o.npc && o.npc.portraitIcon) { const img = new Image(); img.onload = () => { const x = this.pt.getContext('2d'); x.clearRect(0, 0, 96, 96); x.drawImage(img, -8, -8, 112, 112); }; img.src = iconURL(o.npc.portraitIcon, 128); }
    const b = this.body; b.textContent = ''; this.btns.textContent = '';
    b.scrollTop = 0;
    if (o.mode === 'gossip') {
      const p = h('p', 'qtext', b); this._revealText(p, o.text || '');
      const ul = h('div', 'qopts', b);
      for (const opt of o.options || []) {
        const r = h('div', 'qo ptr', ul);
        const ic = h('img', '', r);
        ic.src = opt.type === 'questAvailable' ? questMarkURL('available') : opt.type === 'questComplete' ? questMarkURL('complete') : opt.type === 'questIncomplete' ? questMarkURL('incomplete') : glyphURL(opt.type === 'vendor' ? 'greed' : 'waiting');
        if (opt.type && opt.type.startsWith('quest')) ic.classList.add('qm');
        h('span', '', r, opt.label);
        r.addEventListener('click', () => { if (o.onSelect) o.onSelect(opt); this.ui.emit('gossip', opt); });
      }
      this._btn('Goodbye', () => this.close(true));
    } else {
      h('h2', 'qt', b, o.title || '');
      const p = h('p', 'qtext', b); this._revealText(p, o.mode === 'progress' ? (o.progressText || o.text || '') : o.mode === 'complete' ? (o.completeText || o.text || '') : (o.text || ''));
      if (o.mode === 'offer' && (o.objectivesText || o.objectives)) {
        h('h3', '', b, 'Quest Objectives');
        if (o.objectivesText) h('p', 'qtext', b, this._subst(o.objectivesText));
        if (o.objectives) for (const ob of o.objectives) h('div', 'qob', b, `- ${ob.text}${ob.need ? `: ${ob.have || 0}/${ob.need}` : ''}`);
      }
      if (o.mode === 'progress' && o.objectives) { h('h3', '', b, 'Required'); for (const ob of o.objectives) { const d = h('div', 'qob', b, `- ${ob.text}${ob.need ? `: ${ob.have || 0}/${ob.need}` : ''}`); setCls(d, 'done', ob.need && ob.have >= ob.need); } }
      if (o.rewards && o.mode !== 'progress') this._rewards(b, o.rewards, o.mode === 'complete');
      if (o.mode === 'offer') { this._btn('Accept', () => { o.onAccept && o.onAccept(); this.ui.emit('questAccept', o); this.close(); }); this._btn('Decline', () => { o.onDecline && o.onDecline(); this.close(true); }); }
      else if (o.mode === 'progress') { this._btn(o.canComplete ? 'Continue' : 'Goodbye', () => { if (o.canComplete && o.onContinue) o.onContinue(); else this.close(true); }, !o.canComplete ? 'dark' : ''); }
      else if (o.mode === 'complete') {
        this.completeBtn = this._btn('Complete Quest', () => {
          if (o.rewards && o.rewards.choice && o.rewards.choice.length > 1 && this.choice < 0) { this.ui.alerts.error('You must choose a reward.'); return; }
          o.onComplete && o.onComplete(this.choice); this.ui.emit('questComplete', o, this.choice); this.close();
        });
        this._btn('Cancel', () => this.close(true), 'dark');
      }
    }
    show(this.el, true); replay(this.el, 'in');
    this.ui._panelOpened(this, 'quest');
  }
  _rewards(b, r, complete) {
    h('h3', '', b, 'Rewards');
    if (r.choice && r.choice.length) {
      h('p', 'qsmall', b, complete ? 'Choose your reward:' : 'You will be able to choose one of these rewards:');
      const g = h('div', 'qrg', b);
      r.choice.forEach((e, i) => { const c = this._reward(g, e); c.classList.add('pick'); c.addEventListener('click', () => { this.choice = i; g.querySelectorAll('.qr').forEach((n, k) => setCls(n, 'sel', k === i)); }); });
    }
    if (r.items && r.items.length) {
      h('p', 'qsmall', b, 'You will receive:');
      const g = h('div', 'qrg', b);
      for (const e of r.items) this._reward(g, e);
    }
    if (r.money || r.xp) {
      const l = h('div', 'qmoney', b);
      if (r.money) { h('span', '', l, 'Money: '); moneyEl(r.money, l); }
      if (r.xp) h('span', 'qxp', l, `Experience: ${fmtInt(r.xp)} XP`);
    }
  }
  _reward(g, e) {
    const it = e.item || e;
    const c = h('div', 'qr ptr', g);
    const s = h('div', 'evd-slot q-' + rarityName(it.rarity), c);
    h('img', 'ic', s).src = iconURL(it.icon, 64, { rarity: it.rarity });
    if (e.count > 1) h('span', 'cnt', s, e.count);
    const n = h('span', 'qrn', c, it.name); n.style.color = rarityName(it.rarity) === 'common' ? '#2c1a08' : rarityColor(it.rarity);
    c._tip = () => ({ type: 'item', item: it });
    return c;
  }
  _btn(label, fn, cls = '') { const b = h('button', 'evd-btn ' + cls, this.btns, label); b.addEventListener('click', fn); return b; }
  _revealText(p, text) { text = this._subst(text); this.reveal = { p, text, i: 0, t0: this.ui.now, rate: Math.max(90, text.length / 1.6) }; p.textContent = ''; }
  /** $N → player name, $C → class, $R → race (ui.playerInfo = { name, cls, race }). */
  _subst(t) { const p = this.ui.playerInfo || {}; return String(t).replace(/\$N/g, p.name || 'adventurer').replace(/\$C/g, p.clsName || p.cls || 'hero').replace(/\$R/g, p.race || 'traveller'); }
  _finishReveal() { if (this.reveal) { this.reveal.p.textContent = this.reveal.text; this.reveal = null; } }
  tick(now) {
    const r = this.reveal; if (!r) return;
    const n = Math.min(r.text.length, Math.floor((now - r.t0) * r.rate));
    if (n !== r.i) { r.i = n; r.p.textContent = r.text.slice(0, n); }
    if (n >= r.text.length) this.reveal = null;
  }
  close(declined) { if (!this.o) return; const o = this.o; this.o = null; show(this.el, false); this.reveal = null; this.ui.tooltip.hide(); if (declined && o.onClose) o.onClose(); this.ui._panelClosed(this, 'quest'); }
  get isOpen() { return !!this.o; }
}

// ------------------------------------------------------------------------------------ death overlay
export class DeathOverlay {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-death', parent);
    this.box = h('div', 'evd-popup evd-panel thin dbox', el);
    this.msg = h('div', 'dm', this.box, 'You have died.');
    this.sub = h('div', 'ds', this.box);
    const btns = h('div', 'pb', this.box);
    this.btn = h('button', 'evd-btn', btns, 'Release Spirit');
    this.btn.addEventListener('click', () => { if (this.btn.disabled) return; const o = this.o; this.hide(); if (o && o.onRelease) o.onRelease(); this.ui.emit('releaseSpirit'); });
    show(el, false); this.o = null;
    ui._tick.push(this);
  }
  /** o: { onRelease, text?, sub?, releaseDelay? (s), button?: 'Release Spirit', desaturate = true } */
  show(o = {}) {
    this.o = o;
    setText(this.msg, o.text || 'You have died.');
    setText(this.btn, o.button || 'Release Spirit');
    show(this.btn, o.button !== null); // button: null = spectate (raid deaths: the raid revives you on a wipe)
    setCls(this.el, 'desat', o.desaturate !== false);
    this.until = o.releaseDelay ? this.ui.now + o.releaseDelay : 0;
    this.btn.disabled = !!this.until;
    setText(this.sub, o.sub || '');
    show(this.el, true); replay(this.el, 'in');
  }
  hide() { this.o = null; show(this.el, false); }
  get isOpen() { return !!this.o; }
  tick(now) {
    if (!this.o || !this.until) return;
    const r = this.until - now;
    if (r <= 0) { this.until = 0; this.btn.disabled = false; setText(this.sub, this.o.sub || ''); }
    else setText(this.sub, `Release available in ${Math.ceil(r)} sec`);
  }
}
