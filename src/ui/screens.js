// Full-screen screens: Login, Character Creation, Results, Loading.
import { h, setText, setCls, setSrc, show, classColor, CLASS_NAMES, parseColor, fmtClock, fmtInt, rarityName, rarityColor, replay, rng } from './util.js';
import { iconURL, elementColors } from './icons.js';
import { glyphURL, roleURL, logoCrest } from './art.js';

class Screen {
  constructor(ui, parent, cls) { this.ui = ui; this.el = h('div', 'evd-screen ' + cls, parent); show(this.el, false); this.isOpen = false; this._lazy = []; }
  /** Defer an expensive image assignment until the screen is first shown. */
  later(fn) { if (this._lazyDone) fn(); else this._lazy.push(fn); }
  show() { if (!this._lazyDone) { this._lazyDone = true; for (const f of this._lazy) f(); this._lazy = null; } this.isOpen = true; show(this.el, true); replay(this.el, 'in'); this.ui._screenShown(this); }
  hide() { if (!this.isOpen) return; this.isOpen = false; show(this.el, false); this.ui._screenHidden(this); }
}

const ELEMENT_NAMES = { ember: 'Ember', frost: 'Frost', venom: 'Venom', storm: 'Storm', shadow: 'Shadow' };

// ------------------------------------------------------------------------------------ login
export const DEAD_REALMS = [
  ['Silvermoor', 'PvP', '2012'], ['Brightwater', 'RP', '2011'], ['Duskmire', 'PvP', '2013'], ['Thornspire', 'PvE', '2012'],
  ['Ravenholt', 'RP-PvP', '2010'], ['Gloamreach', 'PvE', '2012'], ['Ironcrest', 'PvP', '2011'], ['Mistfall', 'PvE', '2014'],
];
export class LoginScreen extends Screen {
  constructor(ui, parent) {
    super(ui, parent, 'evd-login');
    const el = this.el;
    h('div', 'vign', el);
    const logo = h('div', 'logo', el);
    const crest = h('div', 'crest', logo); this.later(() => { crest.style.backgroundImage = `url("${logoCrest()}")`; });
    h('div', 'lt', logo, 'EVERDAWN');
    h('div', 'ls', logo, 'THE LAST SERVER');
    // realm button
    const rb = h('div', 'realmbtn', el);
    this.realmName = h('div', 'rn', rb, 'Lastlight');
    this.realmPop = h('div', 'rp', rb, 'PvE · Full · Humans online: 1');
    const cr = h('button', 'evd-btn small', rb, 'Change Realm'); cr.addEventListener('click', () => this.openRealms());
    // menu
    const menu = h('div', 'menu', el);
    const b = (label, ev, cls = '') => { const bt = h('button', 'evd-btn big ' + cls, menu, label); bt.addEventListener('click', () => ui.emit(ev)); return bt; };
    this.enterBtn = b('Enter World', 'login:enter', 'primary');
    b('Play Together', 'login:together');
    b('Jump to Raid', 'login:raid');
    b('Watch the Raid', 'login:watch', 'live');
    const lbBtn = b('Leaderboard', 'login:leaderboard');
    // the board opens large in the middle (on phones it's hidden until asked for); click outside or Esc closes it
    lbBtn.addEventListener('click', e => { e.stopPropagation(); this.el.classList.toggle('lbopen'); });
    this.el.addEventListener('click', e => { if (this.el.classList.contains('lbopen') && !this.lb.contains(e.target)) this.el.classList.remove('lbopen'); });
    addEventListener('keydown', e => { if (e.key === 'Escape') this.el.classList.remove('lbopen'); });
    const sb = b('Settings', 'login:settings'); sb.addEventListener('click', () => ui.settings.open());
    // dragon card
    this.card = h('div', 'dcard evd-panel', el);
    h('div', 'evd-title', this.card, "Tonight's Dragon");
    this.dIcon = h('img', 'di', this.card);
    this.dName = h('div', 'dn', this.card);
    this.dElem = h('div', 'de', this.card);
    this.dAffix = h('div', 'da', this.card);
    this.dAffixD = h('div', 'dad', this.card);
    this.dWF = h('div', 'dwf', this.card);
    this.dReset = h('div', 'drs', this.card);
    // leaderboard
    this.lb = h('div', 'lb evd-panel', el);
    h('div', 'evd-title', this.lb, 'Leaderboard');
    const tabs = h('div', 'lbt', this.lb);
    this.lbTabs = {};
    for (const [id, label] of [['worldFirst', 'World First'], ['fastestKill', 'Fastest Kill'], ['topParse', 'Top Parse'], ['speedrun', 'Speedrun']]) {
      const t = this.lbTabs[id] = h('button', 'tab', tabs, label);
      t.addEventListener('click', () => { this.tab = id; this._renderLB(); ui.emit('login:leaderboardTab', id); });
    }
    const hd = h('div', 'lbh', this.lb); for (const c of ['#', 'Name', 'Result', 'Parse']) h('span', '', hd, c);
    this.lbRows = h('div', 'lbr', this.lb);
    this.lbFoot = h('div', 'lbf', this.lb);
    this.tab = 'worldFirst';
    // footer
    this.ver = h('div', 'ver', el, 'Everdawn v1.12.4 (Build 6005)');
    h('div', 'copy', el, '© 2004–2012 Everdawn Online. Official servers offline. Lastlight persists.');
    // realm dialog (with a dim backdrop)
    this.realmDim = h('div', 'rdim ptr', el); this.realmDim.addEventListener('click', () => { show(this.realms, false); show(this.realmDim, false); });
    this.realms = h('div', 'realms evd-panel heavy', el);
    h('div', 'evd-title', this.realms, 'Realm Selection');
    const rx = h('button', 'evd-close', this.realms); rx.addEventListener('click', () => { show(this.realms, false); show(this.realmDim, false); });
    const tbl = h('div', 'rt', this.realms);
    const rh = h('div', 'rr hdr', tbl); for (const c of ['Realm Name', 'Type', 'Population', 'Status']) h('span', '', rh, c);
    this.liveRow = h('div', 'rr live sel ptr', tbl);
    for (const c of ['Lastlight', 'PvE', 'Full (2,847)', 'Humans online: 1']) h('span', '', this.liveRow, c);
    this.liveRow.addEventListener('dblclick', () => { show(this.realms, false); show(this.realmDim, false); ui.emit('login:realm', 'Lastlight'); });
    for (const [n, t, y] of DEAD_REALMS) { const r = h('div', 'rr dead', tbl); for (const c of [n, t, '—', `Offline since ${y}`]) h('span', '', r, c); r._tip = () => ({ type: 'text', title: n, lines: [{ text: `This realm went dark in ${y}. Its players logged off one by one.`, color: '#aaa' }] }); r.classList.add('ptr'); }
    const rbtns = h('div', 'rbtns', this.realms);
    const ok = h('button', 'evd-btn', rbtns, 'Okay'); ok.addEventListener('click', () => { show(this.realms, false); show(this.realmDim, false); ui.emit('login:realm', 'Lastlight'); });
    h('div', 'rnote', this.realms, 'Lastlight is the only realm still online. Every other player is a SimPlayer. The leaderboard is real.');
    show(this.realms, false); show(this.realmDim, false);
    this.data = {};
  }
  openRealms() { show(this.realmDim, true); show(this.realms, true); replay(this.realms, 'in'); }
  /**
   * d: { dragon?: { name, element, affix, affixDesc?, worldFirst?: { name, cls, time } | null, resetIn? }, leaderboard?: { worldFirst, fastestKill, topParse, speedrun },
   *      population?, humans?, version? }   leaderboard rows: { rank, name, cls, value, parse?, isYou? }
   */
  set(d) {
    Object.assign(this.data, d);
    if (d.version) setText(this.ver, d.version);
    if (d.population != null) { setText(this.realmPop, `PvE · Full (${fmtInt(d.population)}) · Humans online: ${d.humans ?? 1}`); setText(this.liveRow.children[2], `Full (${fmtInt(d.population)})`); setText(this.liveRow.children[3], `Humans online: ${d.humans ?? 1}`); }
    if (d.dragon) {
      const g = d.dragon, E = elementColors(g.element);
      this.dIcon.src = iconURL('dragon', 128, { element: g.element });
      setText(this.dName, g.name);
      setText(this.dElem, `${ELEMENT_NAMES[g.element] || g.element} Dragon`); this.dElem.style.color = E.glow;
      this.card.style.setProperty('--el', E.glow);
      setText(this.dAffix, `Affix: ${g.affix}`);
      setText(this.dAffixD, g.affixDesc || '');
      this.dWF.textContent = '';
      if (g.worldFirst) { this.dWF.append('World First: '); const n = h('span', '', this.dWF, g.worldFirst.name); n.style.color = classColor(g.worldFirst.cls); this.dWF.append(` · ${g.worldFirst.time}`); }
      else { this.dWF.append('World First: '); h('b', 'open', this.dWF, 'UNCLAIMED'); }
      setText(this.dReset, g.resetIn ? `New dragon in ${g.resetIn}` : '');
    }
    if (d.leaderboard) this._renderLB();
  }
  _renderLB() {
    for (const k in this.lbTabs) setCls(this.lbTabs[k], 'on', k === this.tab);
    const rows = (this.data.leaderboard || {})[this.tab] || [];
    this.lbRows.textContent = '';
    for (const r of rows.slice(0, 10)) {
      const e = h('div', 'lr' + (r.isYou ? ' you' : ''), this.lbRows);
      h('span', 'rk', e, r.rank <= 3 ? '' : r.rank).classList.add('r' + r.rank);
      const n = h('span', 'nm', e); const ic = h('img', '', n); ic.src = iconURL('class' + (r.cls || 'warrior')[0].toUpperCase() + (r.cls || 'warrior').slice(1), 32); h('span', '', n, r.name).style.color = classColor(r.cls);
      h('span', 'vl', e, r.value);
      const p = h('span', 'pc', e, r.parse != null ? Math.floor(r.parse) : '–'); if (r.parse != null) p.style.color = parseColor(r.parse);
    }
    if (!rows.length) h('div', 'lr empty', this.lbRows, 'No kills yet today. Be the first.');
    setText(this.lbFoot, this.tab === 'worldFirst' ? 'Resets daily at 00:00 UTC' : this.tab === 'speedrun' ? 'Level 1 → dragon kill' : this.tab === 'topParse' ? 'Percentile vs. all logged kills' : 'Today\'s dragon only');
  }
}

// ------------------------------------------------------------------------------------ character creation
export const RACES = [
  { id: 'human', name: 'Human', icon: 'raceHuman', desc: 'Stubborn, adaptable and everywhere. Humans built Dawnhollow and still argue about the well.' },
  { id: 'dwarf', name: 'Dwarf', icon: 'raceDwarf', desc: 'Stout miners from the northern forges. Their beards have beards.' },
  { id: 'orc', name: 'Orc', icon: 'raceOrc', desc: 'Proud warriors of the ash plains, bound by honour and very large shoulder pads.' },
  { id: 'elf', name: 'Elf', icon: 'raceElf', desc: 'Moon-touched wanderers of Whisperwood. They were here first, and they will remind you.' },
];
export const CLASSES = [
  { id: 'warrior', name: 'Warrior', icon: 'classWarrior', roles: ['tank', 'dps'], resource: 'Rage', diff: 1, desc: 'A master of arms who builds Rage by dealing and taking blows. Charges in, holds the dragon\'s attention and hits things until they stop moving.' },
  { id: 'mage', name: 'Mage', icon: 'classMage', roles: ['dps'], resource: 'Mana', diff: 2, desc: 'Wields fire and frost from afar. Fragile, explosive, and the reason the raid leader says "don\'t pull aggro".' },
  { id: 'priest', name: 'Priest', icon: 'classPriest', roles: ['healer', 'dps'], resource: 'Mana', diff: 2, desc: 'Keeps the raid alive with holy light, or turns to shadow to melt foes. The raid will blame you anyway.' },
];
export const LOCKED = [
  { id: 'rogue', name: 'Rogue', icon: 'classRogue' }, { id: 'hunter', name: 'Hunter', icon: 'classHunter' }, { id: 'paladin', name: 'Paladin', icon: 'classPaladin' },
];
export const APPEARANCE = [['skin', 'Skin Color', 8], ['face', 'Face', 6], ['hair', 'Hair Style', 10], ['hairColor', 'Hair Color', 8], ['beard', 'Facial Hair', 6]];
const SYL = [['Ael', 'Bra', 'Cor', 'Dra', 'Eld', 'Fen', 'Gar', 'Hal', 'Ith', 'Jor', 'Kae', 'Lor', 'Mor', 'Nym', 'Or', 'Pyr', 'Quel', 'Ryn', 'Syl', 'Thal', 'Ul', 'Vey', 'Wyn', 'Zar'], ['a', 'e', 'i', 'o', 'ae', 'ia', 'or', 'an', 'el', 'ur'], ['dris', 'nor', 'wyn', 'mir', 'thas', 'dor', 'ra', 'lis', 'gar', 'vek', 'ion', 'eth', 'ric', 'mund']];
export function randomName(seed) {
  const R = seed != null ? rng(seed) : Math.random;
  const p = a => a[Math.floor(R() * a.length)];
  const n = p(SYL[0]) + (R() < 0.55 ? p(SYL[1]) : '') + p(SYL[2]);
  return n[0].toUpperCase() + n.slice(1).toLowerCase();
}
export function validateName(n) {
  if (!n) return 'Enter a name.';
  if (n.length < 2) return 'Names must be at least 2 characters.';
  if (n.length > 12) return 'Names must be 12 characters or fewer.';
  if (!/^[A-Za-zÀ-ÿ]+$/.test(n)) return 'Names may only contain letters.';
  if (/(.)\1\1/.test(n)) return 'Names cannot repeat a letter three times in a row.';
  if (/^(leeroy|admin|gm|blizz)/i.test(n)) return 'That name is reserved by a SimPlayer who never logs off.';
  return null;
}
export class CreateScreen extends Screen {
  constructor(ui, parent) {
    super(ui, parent, 'evd-create');
    const el = this.el;
    h('div', 'vign', el);
    h('div', 'ctitle', el, 'Create Your Hero');
    this.s = { race: 'human', sex: 'male', cls: 'warrior', appearance: { skin: 0, face: 0, hair: 0, hairColor: 0, beard: 0 }, name: '' };
    // left column (scrolls on short screens): race / sex / class, then appearance
    const col = h('div', 'ccol', el);
    const L = h('div', 'cleft evd-panel', col);
    h('div', 'ch', L, 'Race');
    const rg = h('div', 'races', L); this.raceB = {};
    for (const r of RACES) {
      const b = h('button', 'rbtn', rg); const im = h('img', '', b); this.later(() => { im.src = iconURL(r.icon, 128); }); h('span', '', b, r.name);
      b._tip = () => ({ type: 'text', title: r.name, lines: [r.desc] });
      b.addEventListener('click', () => this.update({ race: r.id })); this.raceB[r.id] = b;
    }
    h('div', 'ch', L, 'Sex');
    const sx = h('div', 'sexes', L); this.sexB = {};
    for (const s of ['male', 'female']) { const b = h('button', 'sbtn', sx); const im = h('img', '', b); this.later(() => { im.src = glyphURL(s); }); h('span', '', b, s === 'male' ? 'Male' : 'Female'); b.addEventListener('click', () => this.update({ sex: s })); this.sexB[s] = b; }
    h('div', 'ch', L, 'Class');
    const cg = h('div', 'classes', L); this.clsB = {};
    for (const c of CLASSES) {
      const b = h('button', 'cbtn', cg); const im = h('img', '', b); this.later(() => { im.src = iconURL(c.icon, 128); }); const t = h('span', '', b, c.name); t.style.color = classColor(c.id);
      b.addEventListener('click', () => this.update({ cls: c.id })); this.clsB[c.id] = b;
    }
    for (const c of LOCKED) {
      const b = h('button', 'cbtn locked', cg); const im = h('img', '', b); h('span', '', b, c.name); const lk = h('img', 'lk', b); this.later(() => { im.src = iconURL(c.icon, 128); lk.src = glyphURL('lock'); });
      b._tip = () => ({ type: 'text', title: c.name, lines: [{ text: 'SimPlayers only.', color: '#ff4040' }, 'Nobody on Lastlight remembers how to play this class except the bots.'] });
    }
    // right: class info
    const R = this.info = h('div', 'cright evd-panel', el);
    this.iIcon = h('img', 'ii', R);
    this.iName = h('div', 'in', R);
    this.iRoles = h('div', 'ir', R);
    this.iDesc = h('div', 'id', R);
    this.iRes = h('div', 'ires', R);
    this.iDiff = h('div', 'idf', R);
    h('div', 'isep evd-sep', R);
    this.rName = h('div', 'rnm', R);
    this.rDesc = h('div', 'rds', R);
    // bottom-left: appearance
    const A = h('div', 'capp evd-panel', col);
    h('div', 'ch', A, 'Appearance');
    this.appV = {};
    for (const [k, label, n] of APPEARANCE) {
      const r = h('div', 'arow', A);
      const l = h('button', 'arr', r); const li = h('img', '', l); this.later(() => { li.src = glyphURL('arrowL'); });
      h('span', 'al', r, label);
      this.appV[k] = h('span', 'av', r);
      const rr = h('button', 'arr', r); const ri = h('img', '', rr); this.later(() => { ri.src = glyphURL('arrowR'); });
      l.addEventListener('click', () => this._app(k, -1)); rr.addEventListener('click', () => this._app(k, 1));
    }
    const rnd = h('button', 'evd-btn dark small rand', A, 'Randomize'); rnd.addEventListener('click', () => this.randomize());
    // bottom-centre: name + buttons
    const N = h('div', 'cname', el);
    h('div', 'nl', N, 'Name');
    const row = h('div', 'nrow', N);
    this.nameIn = h('input', 'nin', row); this.nameIn.maxLength = 12; this.nameIn.spellcheck = false; this.nameIn.placeholder = 'Enter a name';
    this.nameIn.addEventListener('input', () => { const v = this.nameIn.value.replace(/[^A-Za-zÀ-ÿ]/g, ''); this.nameIn.value = v ? v[0].toUpperCase() + v.slice(1).toLowerCase() : ''; this.update({ name: this.nameIn.value }, true); });
    this.nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') this.submit(); });
    const dice = h('button', 'dice', row); const di = h('img', '', dice); this.later(() => { di.src = glyphURL('dice'); }); dice._tip = () => ({ type: 'text', title: 'Random Name' });
    dice.addEventListener('click', () => { const n = ui.opts.randomName ? ui.opts.randomName(this.s) : randomName(); this.setName(n); ui.emit('create:randomName', n); });
    this.err = h('div', 'nerr', N);
    const btns = h('div', 'cbtns', el);
    this.createB = h('button', 'evd-btn big', btns, 'Create Character'); this.createB.addEventListener('click', () => this.submit());
    const back = h('button', 'evd-btn dark', btns, 'Back'); back.addEventListener('click', () => ui.emit('create:back'));
    this.later(() => this.update({}, true));
  }
  /** Choices per option for the current race/sex (the host sets `counts(race, sex)`; static defaults otherwise). */
  _n(k) { const c = this.counts?.(this.s.race, this.s.sex === 'female' ? 'f' : 'm'); return Math.max(1, c?.[k] ?? APPEARANCE.find(a => a[0] === k)[2]); }
  _app(k, d) { const n = this._n(k); this.s.appearance[k] = (this.s.appearance[k] + d + n) % n; this.update({}); }
  randomize() {
    const s = this.s;
    for (const [k] of APPEARANCE) s.appearance[k] = Math.floor(Math.random() * this._n(k));
    this.update({});
  }
  setName(n) { this.nameIn.value = n; this.update({ name: n }, true); }
  /** Show an error under the name field (e.g. "That name is already taken."). */
  setError(msg) { setText(this.err, msg || ''); setCls(this.err, 'on', !!msg); }
  /** Partial state update: { race, sex, cls, appearance: {...}, name } */
  update(p, quiet) {
    const s = this.s;
    if (p.appearance) Object.assign(s.appearance, p.appearance);
    for (const k of ['race', 'sex', 'cls', 'name']) if (p[k] != null) s[k] = p[k];
    for (const k in this.raceB) setCls(this.raceB[k], 'on', k === s.race);
    for (const k in this.sexB) setCls(this.sexB[k], 'on', k === s.sex);
    for (const k in this.clsB) setCls(this.clsB[k], 'on', k === s.cls);
    const c = CLASSES.find(x => x.id === s.cls) || CLASSES[0], r = RACES.find(x => x.id === s.race) || RACES[0];
    setSrc(this.iIcon, iconURL(c.icon, 128));
    setText(this.iName, c.name); this.iName.style.color = classColor(c.id);
    this.iRoles.textContent = '';
    for (const role of c.roles) { const chip = h('span', 'chip ' + role, this.iRoles); h('img', '', chip).src = roleURL(role); h('span', '', chip, role === 'dps' ? 'Damage' : role === 'tank' ? 'Tank' : 'Healer'); }
    setText(this.iDesc, c.desc);
    this.iRes.innerHTML = ''; this.iRes.append('Resource: '); const rs = h('b', '', this.iRes, c.resource); rs.style.color = c.resource === 'Rage' ? '#ff4a3a' : '#4a8aff';
    setText(this.iDiff, 'Difficulty: ' + '★'.repeat(c.diff) + '☆'.repeat(3 - c.diff));
    setText(this.rName, r.name); setText(this.rDesc, r.desc);
    for (const [k] of APPEARANCE) { const n = this._n(k); s.appearance[k] = Math.min(s.appearance[k], n - 1); setText(this.appV[k], `${s.appearance[k] + 1} / ${n}`); }
    setCls(this.appV.beard.parentNode, 'dim', this._n('beard') <= 1);
    const err = validateName(s.name);
    if (!s.name) this.setError(''); else this.setError(err);
    this.createB.disabled = !!err;
    if (!quiet || p.name != null) this.ui.emit('create:change', this.get());
  }
  get() { return { ...this.s, appearance: { ...this.s.appearance } }; }
  submit() {
    const err = validateName(this.s.name);
    if (err) { this.setError(err); replay(this.err, 'shake'); return; }
    this.ui.emit('create:submit', this.get());
  }
}

// ------------------------------------------------------------------------------------ results
export class ResultsScreen extends Screen {
  constructor(ui, parent) {
    super(ui, parent, 'evd-results');
    const el = this.el;
    h('div', 'vign', el);
    this.banner = h('div', 'rbanner', el);
    const crest = h('div', 'crest', this.banner); this.later(() => { crest.style.backgroundImage = `url("${logoCrest()}")`; });
    this.bT = h('div', 'bt', this.banner);
    this.bS = h('div', 'bs', this.banner);
    const mid = h('div', 'rmid', el);
    const pbox = this.pbox = h('div', 'parse', mid);
    h('div', 'pring', pbox);
    this.pN = h('div', 'pn', pbox);
    h('div', 'pl', pbox, 'Parse Percentile');
    this.pC = h('div', 'pcls', pbox);
    const st = this.stats = h('div', 'rstats evd-panel thin', mid);
    this.sv = {};
    for (const [k, l] of [['time', 'Kill Time'], ['dps', 'DPS'], ['hps', 'HPS'], ['rank', 'Rank'], ['deaths', 'Deaths']]) { const c = h('div', 'rs', st); h('div', 'rl', c, l); this.sv[k] = h('div', 'rv', c); }
    this.flags = h('div', 'rflags', mid);
    const lootBox = this.lootBox = h('div', 'rloot evd-panel thin', el);
    h('div', 'evd-title', lootBox, 'Loot Won');
    this.loot = h('div', 'rlist', lootBox);
    const btns = h('div', 'rbtns', el);
    for (const [label, ev, cls] of [['Share Card', 'results:share', ''], ['Copy Challenge Link', 'results:challenge', ''], ['Queue Again', 'results:queue', 'green'], ['Return to Vale', 'results:return', 'dark']]) {
      const b = h('button', 'evd-btn ' + cls, btns, label); b.addEventListener('click', () => ui.emit(ev, this.d));
    }
  }
  /**
   * d: { victory = true, bossName, dragon?: { name, element, affix }, time, dps, hps?, parse, cls, name, rank?: { pos, of, board },
   *      deaths?, worldFirst?, personalBest?, loot?: [item] }
   */
  set(d) {
    this.d = d;
    const win = d.victory !== false;
    setCls(this.el, 'defeat', !win);
    setText(this.bT, win ? 'Victory' : 'Defeat');
    setText(this.bS, win ? `${d.bossName || (d.dragon && d.dragon.name)} has been slain` : `${d.bossName || 'The dragon'} stands triumphant`);
    const p = Math.floor(d.parse ?? 0), col = parseColor(d.parse ?? 0);
    setText(this.pN, p);
    this.pbox.style.setProperty('--pc', col);
    this.pC.textContent = ''; const c = h('span', '', this.pC, `${d.name} · ${CLASS_NAMES[d.cls] || ''}`); c.style.color = classColor(d.cls);
    setText(this.sv.time, fmtClock(d.time || 0));
    setText(this.sv.dps, d.dps != null ? fmtInt(d.dps) : '—');
    setText(this.sv.hps, d.hps ? fmtInt(d.hps) : '—');
    setText(this.sv.rank, d.rank ? `#${d.rank.pos} / ${fmtInt(d.rank.of)}` : '—');
    setText(this.sv.deaths, d.deaths ?? 0);
    this.flags.textContent = '';
    if (d.worldFirst) h('span', 'flag wf', this.flags, 'WORLD FIRST');
    if (d.personalBest) h('span', 'flag pb', this.flags, 'Personal Best');
    if (d.dragon && d.dragon.affix) h('span', 'flag af', this.flags, `Affix: ${d.dragon.affix}`);
    this.loot.textContent = '';
    for (const it of d.loot || []) {
      const r = h('div', 'rli ptr', this.loot);
      const s = h('div', 'evd-slot q-' + rarityName(it.rarity), r); h('img', 'ic', s).src = iconURL(it.icon, 64, { rarity: it.rarity });
      h('span', '', r, it.name).style.color = rarityColor(it.rarity);
      r._tip = () => ({ type: 'item', item: it });
    }
    if (!(d.loot || []).length) h('div', 'rnone', this.loot, 'The SimPlayers rolled better. As always.');
  }
}

// ------------------------------------------------------------------------------------ loading
export const TIPS = [
  'Standing in fire is a choice. Make better choices.',
  'Every player on Lastlight is a bot. Except you. Probably.',
  'Right-click drag to steer. Hold both mouse buttons to run.',
  'The dragon of Ember Peak changes every day. So does the leaderboard.',
  'If a party member says "brb", they will not be right back.',
  'Kobolds are very protective of their candles. Nobody knows why.',
  'Need rolls on items you cannot use are frowned upon. SimPlayers do it anyway.',
  'A 99th percentile parse is purple-orange. A 100 is gold. Legends say.',
];
export class LoadingScreen extends Screen {
  constructor(ui, parent) {
    super(ui, parent, 'evd-loading');
    const el = this.el;
    const art = h('div', 'lart', el);
    this.canvas = h('canvas', 'lcv', art); this.canvas.width = 1280; this.canvas.height = 560;
    h('i', 'lframe', art);
    this.zone = h('div', 'lzone', art);
    const bar = h('div', 'lbar', el);
    this.tip = h('div', 'ltip', bar);
    const tr = h('div', 'ltrack', bar); this.fill = h('div', 'lfill', tr); h('i', 'lspark', this.fill);
    this.stage = h('div', 'lstage', bar);
    this._painted = false;
  }
  /** d: { zone?, tip?, progress (0..1), stage? } */
  set(d) {
    if (!this._painted) { this._painted = true; paintLoadingArt(this.canvas); }
    if (d.zone != null) setText(this.zone, d.zone);
    if (d.tip != null) setText(this.tip, d.tip);
    else if (!this.tip._t) setText(this.tip, 'Tip: ' + TIPS[Math.floor(Math.random() * TIPS.length)]);
    if (d.progress != null) this.fill.style.width = (Math.max(0, Math.min(1, d.progress)) * 100).toFixed(1) + '%';
    if (d.stage != null) setText(this.stage, d.stage);
  }
  show() { this.set({}); super.show(); }
}

/** Painted landscape for the loading screen: dawn sky, layered ridges, the smoking Ember Peak. */
export function paintLoadingArt(cv) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, R = rng(1234);
  const sky = x.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a1438'); sky.addColorStop(0.35, '#6a3a5a'); sky.addColorStop(0.62, '#f09a5a'); sky.addColorStop(0.78, '#ffd89a'); sky.addColorStop(1, '#3a2a2a');
  x.fillStyle = sky; x.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.6})`; x.fillRect(R() * W, R() * H * 0.3, 1.2, 1.2); }
  // sun glow
  const sg = x.createRadialGradient(W * 0.62, H * 0.66, 10, W * 0.62, H * 0.66, W * 0.45);
  sg.addColorStop(0, 'rgba(255,240,200,.95)'); sg.addColorStop(0.1, 'rgba(255,200,120,.6)'); sg.addColorStop(1, 'rgba(255,140,80,0)');
  x.fillStyle = sg; x.fillRect(0, 0, W, H);
  // clouds (painterly strokes)
  x.lineCap = 'round';
  for (let i = 0; i < 90; i++) { const cy = H * (0.18 + R() * 0.38), cx = R() * W, l = 60 + R() * 220; x.strokeStyle = `rgba(${255},${170 + R() * 60 | 0},${140 + R() * 60 | 0},${0.05 + R() * 0.12})`; x.lineWidth = 4 + R() * 14; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + l / 2, cy - 6 + R() * 12, cx + l, cy + (R() - 0.5) * 10); x.stroke(); }
  // Ember Peak (volcano) with smoke + glow
  const peakX = W * 0.36, peakY = H * 0.26;
  const smoke = (px, py, n) => { for (let i = 0; i < n; i++) { const t = i / n; x.fillStyle = `rgba(${60 + t * 60},${50 + t * 40},${60 + t * 30},${0.22 * (1 - t)})`; x.beginPath(); x.arc(px + Math.sin(t * 5) * 40 + t * 160, py - t * 180, 20 + t * 70, 0, Math.PI * 2); x.fill(); } };
  smoke(peakX, peakY, 26);
  const ridge = (baseY, amp, col, peak, seed) => {
    const Rr = rng(seed);
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    let y = baseY;
    for (let px = 0; px <= W; px += 8) {
      y += (Rr() - 0.5) * amp * 0.25; y = Math.max(baseY - amp, Math.min(baseY + amp * 0.4, y));
      let yy = y;
      if (peak) { const d = Math.abs(px - peakX) / (W * 0.16); if (d < 1) yy = Math.min(yy, peakY + (baseY - peakY) * Math.pow(d, 1.3)); }
      x.lineTo(px, yy);
    }
    x.lineTo(W, H); x.closePath(); x.fill();
  };
  ridge(H * 0.52, 60, '#6a4a6a', true, 3);
  const lava = x.createRadialGradient(peakX, peakY + 8, 2, peakX, peakY + 8, 70);
  lava.addColorStop(0, 'rgba(255,200,80,.95)'); lava.addColorStop(0.3, 'rgba(255,90,20,.6)'); lava.addColorStop(1, 'rgba(255,60,0,0)');
  x.fillStyle = lava; x.fillRect(peakX - 80, peakY - 60, 160, 140);
  x.strokeStyle = 'rgba(255,120,40,.7)'; x.lineWidth = 2.5; for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(peakX - 6 + i * 4, peakY + 6); x.quadraticCurveTo(peakX - 20 + i * 14, peakY + 60, peakX - 40 + i * 26, peakY + 110 + R() * 30); x.stroke(); }
  ridge(H * 0.62, 50, '#4a3450', false, 5);
  ridge(H * 0.72, 40, '#2e2236', false, 7);
  // tree line silhouettes
  x.fillStyle = '#1a1422';
  for (let px = -10; px < W + 10; px += 7 + R() * 9) { const th = 18 + R() * 34, base = H * 0.8 + Math.sin(px * 0.01) * 10; x.beginPath(); x.moveTo(px - th * 0.28, base); x.lineTo(px, base - th); x.lineTo(px + th * 0.28, base); x.fill(); }
  x.fillRect(0, H * 0.8, W, H * 0.2);
  // village lights
  for (let i = 0; i < 18; i++) { const px = W * 0.55 + R() * W * 0.2, py = H * 0.8 - R() * 12; const gl = x.createRadialGradient(px, py, 0, px, py, 10); gl.addColorStop(0, 'rgba(255,210,120,.95)'); gl.addColorStop(1, 'rgba(255,160,60,0)'); x.fillStyle = gl; x.fillRect(px - 10, py - 10, 20, 20); }
  // haze + vignette
  const hz = x.createLinearGradient(0, H * 0.45, 0, H * 0.85); hz.addColorStop(0, 'rgba(255,180,140,0)'); hz.addColorStop(1, 'rgba(255,170,130,.14)'); x.fillStyle = hz; x.fillRect(0, 0, W, H);
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
}
