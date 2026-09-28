// EVERDAWN UI — entry point. `new UI(opts)` builds every component; the game pushes plain data into them
// and calls `ui.update(dt)` once per frame. See src/ui/README.md for the full API.
import { h, clamp, setText, show } from './util.js';
import { installArt, installArtLate } from './art.js';
import { PlayerFrame, TargetFrame, ToTFrame, PartyFrames } from './frames.js';
import { RaidFrames } from './raid.js';
import { ActionBar, MicroMenu } from './actionbar.js';
import { CastBar } from './castbar.js';
import { BuffBar } from './auras.js';
import { Minimap, QuestTracker } from './minimap.js';
import { Chat } from './chat.js';
import { Tooltip } from './tooltip.js';
import { FloatingText } from './fct.js';
import { Nameplates } from './nameplates.js';
import { Alerts } from './alerts.js';
import { BossTimers, Meter } from './bosstimers.js';
import { Popups, LootWindow, RollFrames, QuestDialog, DeathOverlay } from './dialogs.js';
import { CharacterPanel, Bags, WorldMap, HelpOverlay, Settings } from './panels.js';
import { SpellBook, QuestLog, SocialPanel, Merchant, ProfessionsWindow, enableBarDrag } from './books.js';
import { LoginScreen, CreateScreen, ResultsScreen, LoadingScreen } from './screens.js';

export { iconURL, iconCanvas } from './icons.js';
export { renderShareCard } from './sharecard.js';
export { markerURL, questMarkURL, roleURL, glyphURL, coinURL } from './art.js';
export { randomName, validateName } from './screens.js';
export { parseColor, classColor, rarityColor, CLASS_COLORS, RARITY } from './util.js';

const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Roboto+Condensed:wght@400;600;700&display=swap';

export class UI {
  /**
   * opts: { parent = document.body, hotkeys = true (Enter / C B M H N / Esc), actionKeys = false (1–= emit 'action'),
   *         getItem(id) → item (chat {item:id} links), randomName(state) → string, uiScale = 1 }
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.now = 0;
    this.typing = false;
    this._ev = new Map();
    this._tick = [];
    this._keyHooks = [];
    this._open = [];
    this._screens = new Set();
    this._hudWanted = true;
    this.userScale = opts.uiScale || 1;
    /** { name, cls, race } — used for $N/$C/$R substitution in quest text. */
    this.playerInfo = opts.player || null;
    this.layout = { tooltip: { right: 330, bottom: 250 } };
    ensureFonts();
    this.fontsReady = document.fonts ? Promise.race([
      Promise.all(['900 20px Cinzel', '700 20px Cinzel', '400 14px "Roboto Condensed"', '700 14px "Roboto Condensed"'].map(f => document.fonts.load(f))).catch(() => {}),
      new Promise(r => setTimeout(r, 3000)),
    ]) : Promise.resolve();

    const root = this.root = h('div', 'evd', opts.parent || document.body);
    installArt(root);
    const L = cls => h('div', 'evd-layer ' + cls, root);
    this.worldLayer = h('div', 'evd-world', root);
    this.deathLayer = L('evd-deathl');   // below the HUD: greys the world, keeps the UI in colour
    this.hudLayer = L('evd-hud');
    this.centerLayer = L('evd-centerl');
    this.winLayer = L('evd-winl');
    this.screenLayer = L('evd-scrl');
    this.modalLayer = L('evd-modall');
    this.topLayer = L('evd-topl');

    // world space (screen px, not scaled)
    this.nameplates = new Nameplates(this, this.worldLayer);
    this.fct = new FloatingText(this, this.worldLayer);
    // HUD
    const hud = this.hudLayer;
    this.party = new PartyFrames(this, hud);
    this.raid = new RaidFrames(this, hud);
    this.player = new PlayerFrame(this, hud);
    this.target = new TargetFrame(this, hud);
    this.tot = new ToTFrame(this, hud);
    this.minimap = new Minimap(this, hud);
    this.auras = new BuffBar(this, hud);
    this.tracker = new QuestTracker(this, hud);
    this.bossTimers = new BossTimers(this, hud);
    this.chat = new Chat(this, hud);
    this.meter = new Meter(this, hud);
    this.micro = new MicroMenu(this, hud);
    this.castBar = new CastBar(this, hud, 'pcast');
    this.actionBar = new ActionBar(this, hud);
    this.xpBar = this.actionBar.xp;
    this.rolls = new RollFrames(this, hud);
    this.fps = h('div', 'evd-fps', hud); show(this.fps, false);
    // centre messages
    this.alerts = new Alerts(this, this.centerLayer);
    // death
    this.death = new DeathOverlay(this, this.deathLayer);
    // windows
    const win = this.winLayer;
    this.questDialog = new QuestDialog(this, win);
    this.character = new CharacterPanel(this, win);
    this.bags = new Bags(this, win);
    this.worldMap = new WorldMap(this, win);
    this.help = new HelpOverlay(this, win);
    this.spellbook = new SpellBook(this, win);
    this.questLog = new QuestLog(this, win);
    this.social = new SocialPanel(this, win);
    this.merchant = new Merchant(this, win);
    this.professions = new ProfessionsWindow(this, win);
    this.character.dock = true;
    this.loot = new LootWindow(this, win);
    this.popups = new Popups(this, this.modalLayer); // above screens too: the title's "Continue as…?" prompt must be visible
    // screens
    this.login = new LoginScreen(this, this.screenLayer);
    this.create = new CreateScreen(this, this.screenLayer);
    this.results = new ResultsScreen(this, this.screenLayer);
    this.loading = new LoadingScreen(this, this.screenLayer);
    // modal + top
    this.settings = new Settings(this, this.modalLayer);
    this.tooltip = new Tooltip(this, this.topLayer);

    this.on('micro', id => this._micro(id));
    enableBarDrag(this);
    this._bindPointer();
    this._onKey = e => this._key(e);
    addEventListener('keydown', this._onKey);
    this._onResize = () => this._resize();
    addEventListener('resize', this._onResize);
    this._resize();
    this._fpsT = 0; this._fpsN = 0;
    this._tipT = 0;
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 60));
    idle(() => installArtLate(root), { timeout: 400 });
  }

  // ------------------------------------------------------------------ events
  /** Subscribe: ui.on('action', i => …). Returns an unsubscribe function. */
  on(name, fn) { let s = this._ev.get(name); if (!s) this._ev.set(name, s = new Set()); s.add(fn); return () => s.delete(fn); }
  off(name, fn) { const s = this._ev.get(name); if (s) s.delete(fn); }
  emit(name, ...args) { const s = this._ev.get(name); if (s) for (const fn of s) { try { fn(...args); } catch (e) { console.error(e); } } }

  // ------------------------------------------------------------------ frame
  /** Call once per frame with the frame delta (seconds). Drives timers, sweeps text, FCT, fades. */
  update(dt) {
    this.now += Math.min(dt, 0.25);
    const t = this._tick;
    for (let i = 0; i < t.length; i++) t[i].tick(this.now, dt);
    if (this._fpsOn) { this._fpsN++; this._fpsT += dt; if (this._fpsT >= 0.5) { setText(this.fps, Math.round(this._fpsN / this._fpsT) + ' fps'); this._fpsN = 0; this._fpsT = 0; } }
    if (this.tooltip.visible && this.tooltip.anchor && this.now - this._tipT > 0.5) {
      this._tipT = this.now;
      const a = this.tooltip.anchor;
      if (!a.isConnected || !a.offsetParent) this.tooltip.hide();
      else if (a._tipLive !== false) { const d = typeof a._tip === 'function' ? a._tip() : a._tip; if (d) this.tooltip.showFor(a, d); else this.tooltip.hide(); }
    }
  }
  get scale() { return this._s; }

  /** Show/hide the whole in-game HUD (screens hide it automatically while open). */
  setHUDVisible(on) { this._hudWanted = on; this._applyHUD(); }
  _applyHUD() {
    const on = this._hudWanted && this._screens.size === 0;
    for (const l of [this.hudLayer, this.centerLayer, this.worldLayer, this.winLayer, this.deathLayer]) show(l, on);
  }
  /** Convenience: show exactly one screen ('login'|'create'|'results'|'loading') or null for the HUD. */
  screen(name) {
    for (const s of [this.login, this.create, this.results, this.loading]) if (s !== this[name]) s.hide();
    if (name && this[name]) this[name].show();
  }
  _screenShown(s) { installArtLate(this.root); this._screens.add(s); this._applyHUD(); }
  _screenHidden(s) { this._screens.delete(s); this._applyHUD(); }

  // ------------------------------------------------------------------ panels
  _panelOpened(p, id) { installArtLate(this.root); this._open = this._open.filter(x => x !== p); this._open.push(p); this._layout(); this.micro.setActive(id, true); this.emit('panel', id, true); }
  _panelClosed(p, id) { this._open = this._open.filter(x => x !== p); this._layout(); this.micro.setActive(id, false); this.emit('panel', id, false); }
  /** Docked windows (Character, Spellbook, Quest Log, Social, Merchant) sit side by side from the left, WoW style. */
  _layout() {
    let x = 56; const room = this.winLayer.offsetWidth || innerWidth;
    for (const p of this._open) if (p.dock) { const w = p.el.offsetWidth; p.el.style.left = Math.max(8, Math.min(x, room - w - 8)) + 'px'; x += w + 12; }
  }
  /** Toggle a panel by name: character | bags | spellbook | quests | social | map | help | settings | meter */
  toggle(name) {
    const p = { character: this.character, bags: this.bags, spellbook: this.spellbook, quests: this.questLog, social: this.social, professions: this.professions, map: this.worldMap, help: this.help, settings: this.settings }[name];
    if (p) p.toggle();
    else if (name === 'meter') { const on = this.meter.el.classList.toggle('hidden'); this.micro.setActive('meter', !on); }
  }
  /** Close the topmost open window. Returns true if something was closed. */
  closeTop() {
    const p = this._open.pop();
    if (!p) return false;
    if (p.close) p.close(true);
    return true;
  }
  _micro(id) { this.toggle(id); }

  // ------------------------------------------------------------------ input
  _key(e) {
    const t = e.target;
    const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (inField && t !== document.body) return;
    if (this._screens.size) { if (e.key === 'Escape' && this.settings.isOpen) this.settings.close(); return; } // screens own the keyboard
    for (const hook of this._keyHooks) if (hook(e)) { e.preventDefault(); return; }
    if (this.opts.hotkeys === false || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (this.loot.isOpen) { this.loot.close(); return; }
      if (this.closeTop()) return;
      if (this.popups.list.length) return;
      this.emit('escape');
      return;
    }
    const map = { KeyC: 'character', KeyB: 'bags', KeyP: 'spellbook', KeyL: 'quests', KeyO: 'social', KeyK: 'professions', KeyM: 'map', KeyH: 'help', KeyN: 'meter' };
    const name = map[e.code];
    if (name && !e.repeat) { this.toggle(name); e.preventDefault(); }
  }
  _bindPointer() {
    const root = this.root;
    const findTip = n => { while (n && n !== root) { if (n._tip) return n; n = n.parentElement; } return null; };
    root.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return; // no hover on touch; a tooltip would swallow the tap on iOS
      const t = findTip(e.target);
      if (t === this._tipEl) return;
      this._tipEl = t;
      if (!t) { this.tooltip.hide(); return; }
      const d = typeof t._tip === 'function' ? t._tip() : t._tip;
      if (d) { this.tooltip.showFor(t, d); this._tipT = this.now; } else this.tooltip.hide();
    });
    root.addEventListener('pointerout', e => {
      if (this._tipEl && (!e.relatedTarget || !this._tipEl.contains(e.relatedTarget))) { this._tipEl = null; this.tooltip.hide(); }
    });
    root.addEventListener('click', e => {
      let n = e.target;
      while (n && n !== root) { if (n._click) { n._click(e); return; } n = n.parentElement; }
    });
    // stop wheel / context menu over UI from reaching the game canvas
    root.addEventListener('contextmenu', e => { if (e.target !== root) e.preventDefault(); });
  }

  // ------------------------------------------------------------------ scale & settings
  _resize() {
    let s = clamp(innerHeight / 1080, 0.8, 2.5) * this.userScale;
    if (innerWidth / s < 1360) s = Math.max(0.55, innerWidth / 1360);
    this._s = s;
    this.root.style.setProperty('--s', s.toFixed(4));
    // narrow virtual screens (e.g. 1280×720 → 1600×900 virtual): lift the chat above the action-bar row
    this.root.classList.toggle('evd-narrow', innerWidth / s < 1880);
    // phones held upright: menus restack into one column (in-world play asks for landscape, see engine/touch.js)
    this.root.classList.toggle('evd-portrait', innerWidth / s < 1000);
    this.emit('resize', s);
  }
  /** Set the user UI scale multiplier (1 = default). */
  setScale(m) { this.userScale = m; this._resize(); }
  _applySettings(v) {
    if (v.uiScale && Math.abs(v.uiScale / 100 - this.userScale) > 0.001) this.setScale(v.uiScale / 100);
    this.chat.fadeAfter = v.chatFade === false ? 1e9 : 45;
    this._fpsOn = !!v.showFPS; show(this.fps, this._fpsOn);
  }
  /** Remove all DOM + listeners. */
  dispose() { removeEventListener('keydown', this._onKey); removeEventListener('resize', this._onResize); this.root.remove(); }
}

function ensureFonts() {
  if (typeof document === 'undefined') return;
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href.includes('fonts.googleapis.com') && l.href.includes('Cinzel'))) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_HREF; document.head.appendChild(l);
}
