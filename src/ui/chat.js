// Chat frame: tabs (General / Combat Log), colour-coded channels, [Item Links] with tooltips,
// clickable [Player] names, idle auto-fade, and an input box (Enter to open) with slash-command parsing.
import { h, setText, setCls, show, rarityColor, classColor } from './util.js';

export const CHANNELS = {
  say: { color: '#ffffff', fmt: (n) => [n, ' says: '] },
  yell: { color: '#ff4040', fmt: (n) => [n, ' yells: '] },
  emote: { color: '#ff8040', fmt: (n) => [n, ' '] },
  textEmote: { color: '#ff8040', fmt: () => [] },
  party: { color: '#aaaaff', label: 'Party' },
  partyLeader: { color: '#76c8ff', label: 'Party Leader' },
  raid: { color: '#ff7f00', label: 'Raid' },
  raidLeader: { color: '#ff4809', label: 'Raid Leader' },
  raidWarning: { color: '#ff4800', label: 'Raid Warning' },
  guild: { color: '#40ff40', label: 'Guild' },
  officer: { color: '#40c040', label: 'Officer' },
  whisperIn: { color: '#ff80ff', fmt: (n) => [n, ' whispers: '] },
  whisperOut: { color: '#ff80ff', fmt: (n) => ['To ', n, ': '] },
  general: { color: '#ffc0c0', label: '1. General' },
  trade: { color: '#ffc0c0', label: '2. Trade' },
  lfg: { color: '#ffc0c0', label: '4. LookingForGroup' },
  system: { color: '#ffff00' },
  loot: { color: '#00c800' },
  money: { color: '#ffff00' },
  xp: { color: '#8f84ff' },
  achievement: { color: '#ffff00' },
  npcSay: { color: '#fffb9f', fmt: (n) => [n, ' says: '], npc: true },
  npcYell: { color: '#ff4040', fmt: (n) => [n, ' yells: '], npc: true },
  bossEmote: { color: '#ffb400', fmt: (n) => [n, ' '], npc: true },
  combat: { color: '#ffffff' },
  error: { color: '#ff2020' },
};
const STICKY = { s: 'say', say: 'say', y: 'yell', yell: 'yell', p: 'party', party: 'party', g: 'guild', guild: 'guild', o: 'officer', raid: 'raid', ra: 'raid', rw: 'raidWarning', 1: 'general', 2: 'trade', 4: 'lfg', e: 'emote', me: 'emote', em: 'emote' };
const INPUT_LABEL = { say: 'Say:', yell: 'Yell:', party: 'Party:', guild: 'Guild:', officer: 'Officer:', raid: 'Raid:', raidWarning: 'Raid Warning:', general: '[1. General]', trade: '[2. Trade]', lfg: '[4. LookingForGroup]', emote: 'Emote:', whisperOut: 'Tell' };

export class Chat {
  constructor(ui, parent) {
    this.ui = ui;
    const el = this.el = h('div', 'evd-chat', parent);
    const tabs = h('div', 'tabs', el);
    this.tabs = {};
    this.panes = {};
    for (const [id, label] of [['general', 'General'], ['combat', 'Combat Log']]) {
      const t = this.tabs[id] = h('button', 'tab', tabs, label);
      t.addEventListener('click', () => this.tab(id));
      this.panes[id] = h('div', 'lines ptr', el);
      this.panes[id]._n = 0;
    }
    this.inp = h('div', 'inp', el);
    this.lbl = h('span', 'lbl', this.inp);
    this.input = h('input', '', this.inp); this.input.type = 'text'; this.input.maxLength = 255; this.input.spellcheck = false;
    this.input.addEventListener('keydown', e => this._key(e));
    this.input.addEventListener('input', () => this._sticky());
    this.input.addEventListener('blur', () => { if (this.typing) setTimeout(() => { if (document.activeElement !== this.input) this.close(); }, 0); });
    for (const p of Object.values(this.panes)) {
      p.addEventListener('wheel', e => { e.stopPropagation(); this._stickBottom = false; this._touched = this.ui.now; }, { passive: true });
      p.addEventListener('scroll', () => { const at = p.scrollHeight - p.scrollTop - p.clientHeight < 6; p._atBottom = at; });
      p._atBottom = true;
    }
    el.addEventListener('pointerenter', () => setCls(el, 'hover', true));
    el.addEventListener('pointerleave', () => setCls(el, 'hover', false));
    this.channel = 'say'; this.whisperTarget = null; this.lastWhisper = null;
    this.history = []; this.hIdx = -1;
    this.fadeAfter = 45; this.max = 200;
    this.typing = false;
    this._dirty = new Set(); this._fadeT = 0;
    this.tab('general');
    this.close();
    ui._tick.push(this);
    ui._keyHooks.push(e => this._global(e));
  }

  /**
   * Add a message.
   * m: { ch, from?, fromCls?, text, items?: [item], tab?: 'general'|'combat', color? }
   *  text tokens: {0},{1}… → items[n]; {item:ID} → ui.opts.getItem(ID); {player:Name:cls} → clickable name
   */
  add(m) {
    if (typeof m === 'string') m = { ch: 'system', text: m };
    const chd = CHANNELS[m.ch] || CHANNELS.system;
    const tab = m.tab || (m.ch === 'combat' ? 'combat' : 'general');
    const pane = this.panes[tab];
    const ln = h('div', 'ln');
    ln.style.color = m.color || chd.color;
    const nameEl = n => {
      const a = h('span', 'pl', null, chd.npc ? n : `[${n}]`);
      if (!chd.npc) { if (m.fromCls) a.style.color = classColor(m.fromCls); a._click = () => this.ui.emit('playerClick', n); a._tip = () => ({ type: 'text', title: n, lines: [{ text: 'Click to whisper', color: '#aaa' }] }); }
      return a;
    };
    if (chd.label) { ln.append(`[${chd.label}] `); if (m.from) ln.append(nameEl(m.from), ': '); }
    else if (chd.fmt && m.from) for (const part of chd.fmt(m.from)) ln.append(part === m.from ? nameEl(m.from) : part);
    this._rich(ln, m.text || '', m.items);
    ln._t = this.ui.now;
    pane.appendChild(ln);
    if (++pane._n > this.max) { pane.firstChild.remove(); pane._n--; }
    this._dirty.add(pane);
    if (tab !== this.cur) setCls(this.tabs[tab], 'flash', true);
    if (m.ch === 'whisperIn' && m.from) this.lastWhisper = m.from;
    return ln;
  }
  system(text) { return this.add({ ch: 'system', text }); }
  clear(tab = this.cur) { this.panes[tab].textContent = ''; this.panes[tab]._n = 0; }
  tab(id) {
    this.cur = id;
    for (const k in this.panes) { show(this.panes[k], k === id); setCls(this.tabs[k], 'on', k === id); }
    setCls(this.tabs[id], 'flash', false);
    this._dirty.add(this.panes[id]);
  }
  _rich(ln, text, items) {
    const re = /\{(\d+)\}|\{item:([^}]+)\}|\{player:([^:}]+)(?::([^}]+))?\}/g;
    let last = 0, mm;
    while ((mm = re.exec(text))) {
      if (mm.index > last) ln.append(text.slice(last, mm.index));
      if (mm[3]) {
        const a = h('span', 'pl', null, `[${mm[3]}]`);
        if (mm[4]) a.style.color = classColor(mm[4]);
        const n = mm[3]; a._click = () => this.ui.emit('playerClick', n);
        ln.append(a);
      } else {
        const it = mm[1] != null ? items && items[+mm[1]] : this.ui.opts.getItem && this.ui.opts.getItem(mm[2]);
        if (it) ln.append(this.itemLink(it)); else ln.append(mm[0]);
      }
      last = re.lastIndex;
    }
    if (last < text.length) ln.append(text.slice(last));
  }
  /** Creates an [Item Link] element (rarity-coloured, tooltip on hover, click → 'itemClick'). */
  itemLink(it) {
    const a = h('span', 'il', null, `[${it.name}]`);
    a.style.color = rarityColor(it.rarity);
    a._tip = () => ({ type: 'item', item: it });
    a._click = () => this.ui.emit('itemClick', it);
    return a;
  }

  // --------------------------------------------------------------- input
  open(prefill = '') {
    this.typing = true; this.ui.typing = true;
    setCls(this.el, 'typing', true);
    this._label();
    this.input.value = prefill;
    this.input.focus();
    this.ui.emit('typing', true);
  }
  close() {
    const was = this.typing;
    this.typing = false; this.ui.typing = false;
    setCls(this.el, 'typing', false);
    this.input.value = ''; this.input.blur();
    if (was) this.ui.emit('typing', false);
  }
  setChannel(ch, target) { this.channel = ch; if (target) this.whisperTarget = target; this._label(); }
  _label() { setText(this.lbl, this.channel === 'whisperOut' ? `Tell ${this.whisperTarget}:` : (INPUT_LABEL[this.channel] || 'Say:')); this.lbl.style.color = (CHANNELS[this.channel === 'whisperOut' ? 'whisperOut' : this.channel] || CHANNELS.say).color; }
  _sticky() {
    const v = this.input.value;
    let m = v.match(/^\/(\w+) $/);
    if (m && STICKY[m[1].toLowerCase()]) { this.setChannel(STICKY[m[1].toLowerCase()]); this.input.value = ''; return; }
    m = v.match(/^\/(?:w|t|whisper|tell) (\S+) $/i);
    if (m) { this.setChannel('whisperOut', m[1]); this.input.value = ''; return; }
    if (/^\/r $/i.test(v) && this.lastWhisper) { this.setChannel('whisperOut', this.lastWhisper); this.input.value = ''; }
  }
  _key(e) {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this._submit(); }
    else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.history.length) return;
      this.hIdx = Math.max(-1, Math.min(this.history.length - 1, this.hIdx + (e.key === 'ArrowUp' ? 1 : -1)));
      this.input.value = this.hIdx < 0 ? '' : this.history[this.history.length - 1 - this.hIdx];
    }
  }
  _submit() {
    const raw = this.input.value.trim();
    this.close();
    if (!raw) return;
    this.history.push(raw); if (this.history.length > 50) this.history.shift(); this.hIdx = -1;
    if (raw[0] === '/') {
      const m = raw.match(/^\/(\S+)\s*(.*)$/); const cmd = m[1].toLowerCase(), rest = m[2];
      if (STICKY[cmd]) { if (rest) this.ui.emit('chat', STICKY[cmd], rest, null); this.channel = STICKY[cmd] === 'raidWarning' ? this.channel : STICKY[cmd]; return; }
      if (['w', 't', 'whisper', 'tell'].includes(cmd)) { const mm = rest.match(/^(\S+)\s+(.+)$/); if (mm) { this.whisperTarget = mm[1]; this.ui.emit('chat', 'whisperOut', mm[2], mm[1]); } return; }
      if (cmd === 'r' || cmd === 'reply') { if (this.lastWhisper && rest) this.ui.emit('chat', 'whisperOut', rest, this.lastWhisper); return; }
      this.ui.emit('command', cmd, rest, raw);
      return;
    }
    this.ui.emit('chat', this.channel, raw, this.channel === 'whisperOut' ? this.whisperTarget : null);
  }
  _global(e) {
    if (this.typing) return false;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return false;
    if (e.key === 'Enter') { this.open(); return true; }
    if (e.key === '/') { this.open('/'); return true; }
    if (e.key === 'r' && e.shiftKey === false && this.ui.opts.replyKey && this.lastWhisper) { this.setChannel('whisperOut', this.lastWhisper); this.open(); return true; }
    return false;
  }
  tick(now) {
    for (const p of this._dirty) { if (p._atBottom !== false) p.scrollTop = p.scrollHeight; }
    this._dirty.clear();
    if (now - this._fadeT < 0.5) return;
    this._fadeT = now;
    const p = this.panes[this.cur];
    // walk from the oldest visible line until we find one that is not yet old
    for (let ln = p.firstChild; ln; ln = ln.nextSibling) {
      if (ln._old) continue;
      if (now - ln._t > this.fadeAfter) { ln._old = true; ln.classList.add('old'); } else break;
    }
  }
}
