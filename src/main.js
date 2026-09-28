// EVERDAWN — boot + app flow: title (live flyover) → character creation → Everdawn Vale → The Ember Maw → results.
import * as THREE from 'three';
import { Renderer } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { TouchControls } from './engine/touch.js';
import { OrbitCam } from './engine/camera.js';
import { G, lambert } from './engine/materials.js';
import { bus } from './game/events.js';
import { World } from './world/world.js';
import { GameState } from './game/game.js';
import { HUD } from './game/hud.js';
import { RaidState } from './game/raid/director.js';
import { RaidBrain } from './game/raid/raidai.js';
import { DirectorCam } from './game/raid/directorcam.js';
import { HostSession } from './net/host.js';
import { GuestSession } from './net/guest.js';
import { MirrorRaid } from './net/mirrorraid.js';
import { openLobby, GuestBadge } from './net/lobby.js';
import { canNetwork } from './net/peer.js';
import { Interactions } from './game/interact.js';
import { Waypoints, groundAt } from './game/waypoints.js';
import { Professions } from './game/professions.js';
import { Companions } from './game/companions.js';
import { MARKS_PER_KILL } from './game/game.js';
import { ZONES } from './game/zones.js';
import { dailyDragon, AFFIXES } from './game/raid/daily.js';
import { CinematicCam, TITLE_PATH, STAGE } from './game/cinematic.js';
import { FX } from './fx/fx.js';
import { Bridge } from './game/bridge.js';
import { SelectionRing } from './game/decals.js';
import { Flyover } from './game/flyover.js';
import { M } from './world/heightfield.js';
import { createModel, buildLog } from './models/factory.js';
import { ground as modelGround, preloadCreatures, prewarmHumanoids, appearanceCounts } from './models/register.js';
import { renderShareCard, iconURL } from './ui/ui.js';
import { store, serializeChar, submitKill, boards, parsePercentile, remoteSamples, challengeLink, readChallenge, fmtTime, setRemote, randomName } from './meta/meta.js';
import { makeRemote, PUBLIC_URL } from './meta/remote.js';

const TIPS = [
  'Tip: Standing in fire is a choice. Make better choices.',
  'Tip: Every player on Lastlight is a bot. Except you. Probably.',
  'Tip: Right-click drag to steer. Hold both mouse buttons to run.',
  'Tip: The dragon of Ember Peak changes every day. So does the leaderboard.',
  'Tip: If a party member says "brb", they will not be right back.',
  'Tip: Deep Breath is not a suggestion.',
  'Tip: Type /dance near other players. You will not dance alone.',
];
const bootFill = document.getElementById('boot-fill'), bootStage = document.getElementById('boot-stage');
document.getElementById('boot-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
const bootLog = window.__boot = []; // [stage, ms since navigation] for load profiling
window.__builds = buildLog;
const progress = (f, label) => { bootFill.style.width = (f * 100).toFixed(1) + '%'; if (label) { bootStage.textContent = label; if (bootLog.at(-1)?.[0] !== label) bootLog.push([label, Math.round(performance.now())]); } };
const params = new URLSearchParams(location.search);
const worldBoxes = world => world.colliders.filter(c => c.type === 'box' && c.hw > 1).map(c => ({ ...c, cos: Math.cos(c.rot), sin: Math.sin(c.rot), top: world.heightAt(c.x, c.z) + 11 }));

class App {
  async init() {
    const app = document.getElementById('app');
    this.renderer = new Renderer(app);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 2400);
    this.input = new Input(this.renderer.r.domElement);
    this.touch = new TouchControls(this.input);
    this.touch.setPlaying(false);
    this.dragon = dailyDragon();
    if (params.get('el')) this.dragon.element = params.get('el');
    setRemote(makeRemote());
    this.world = new World('vale');
    await this.world.build(progress);
    this.worlds = { vale: this.world }; this.zoneId = 'vale';
    this.renderer.setScene(this.world.scene, this.camera);
    this.cam = new OrbitCam(this.camera, (x, z) => this.world.heightAt(x, z));
    this.cam.boxes = worldBoxes(this.world);
    this.time = 0;
    progress(0.91, 'Conjuring spell effects');
    this.fx = new FX(this.world.scene, this.camera, { heightAt: (x, z) => this.world.heightAt(x, z) });
    this.fx.onShake = a => { this.cam.shake = Math.max(this.cam.shake, a * 1.2); };
    this.bridge = new Bridge(this);
    this.bridge.attach(this.fx, null);
    this.bridge.worldAnchors(this.world);
    this.ring = new SelectionRing(this.world.scene);
    this.ambAnchor = new THREE.Object3D(); this.world.scene.add(this.ambAnchor);
    // a soft warm glow around the player after dark keeps forests readable (always in the scene: adding lights later recompiles every shader)
    this.lantern = new THREE.PointLight(0xffc890, 0, 15, 1.6); this.world.scene.add(this.lantern);
    this.amb = {
      fireflies: this.fx.attach('fireflies', this.ambAnchor, { radius: 26 }),
      leaves: this.fx.attach('fallingLeaves', this.ambAnchor, { radius: 22, height: 14 }),
      motes: this.fx.attach('dustMotes', this.ambAnchor, { radius: 16 }),
    };
    progress(0.92, 'Waking the wildlife');
    modelGround.fn = (x, z) => this.world.heightAt(x, z);
    await new Promise(r => setTimeout(r, 0));
    try { preloadCreatures(['wolf', 'boar', 'spider', 'gurgler', 'kobold', 'rabbit', 'deer', 'chicken', 'sheep', 'cat', 'crow']); } catch (e) { console.warn(e); }
    progress(0.925, 'Sculpting heroes');
    try {
      // only the eight body bases up front; hair, faces and gear sculpt on first use (the realm's actual population)
      await prewarmHumanoids({ races: ['human', 'dwarf', 'orc', 'elf'], sexes: ['m', 'f'], hair: false, beards: false, hoods: false, faces: false, gear: [], onProgress: f => progress(0.925 + f * 0.035, 'Sculpting heroes') });
    } catch (e) { console.warn('prewarm', e); }
    progress(0.94, 'Summoning the locals');
    const mark = n => bootLog.push(['  ' + n, Math.round(performance.now())]);
    this.game = new GameState(this); mark('game state');
    this.game.dragon = this.dragon;
    this.game.spawnCamps(); mark('camps');
    this.game.spawnNPCs(); mark('npcs');
    this.game.spawnCritters(); mark('critters');
    this.game.social.spawnPopulation(34); mark('simplayers');
    this.prof = new Professions(this); this.companions = new Companions(this);
    this.prof.spawnNodes(this.world, this.game.sim, 'vale'); mark('ore and herbs');
    this.flyover = new Flyover(this.game, this.dragon); mark('flyover');
    this.raiseStatue(); mark('statue');
    progress(0.97, 'Drawing the interface');
    this.hud = new HUD(this);
    this.ui = this.hud.ui;
    this.touch.onChat = () => this.ui.chat.open();
    this.interact = new Interactions(this); // player menu: whisper, invite, inspect, trade, follow, duel
    this.waypoints = new Waypoints(this);   // middle-click marks for your group
    this.ui.create.counts = appearanceCounts; // creation-screen options match each race's real palettes
    this.cine = new CinematicCam(this.camera);
    this.wireScreens();
    this.loadAudio();
    // phones and small tablets start on medium; dynamic resolution takes it from there
    const small = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
    this.settings = { sensitivity: 50, invertY: false, quality: small ? 'medium' : 'high', ...(store.load().settings || {}) };
    this.applySettings(this.settings);
    this.ui.settings.set(this.settings); // the Game Menu shows what's saved (and saves all of it back)
    this.world.terrain.warm(new THREE.Vector3(10, 0, 150));
    progress(1, 'Entering world');
    this.last = performance.now();
    this.manual = false;
    const boot = document.getElementById('boot');
    boot.style.opacity = 0; setTimeout(() => boot.remove(), 900);
    // an accidental refresh or Back while hosting/joined: straight back into the same world (see rememberSession)
    const sess = this.readSession(), resumeCh = sess?.char && store.load().chars[sess.char];
    let solo = null; try { solo = sessionStorage.getItem('everdawn.solo'); sessionStorage.removeItem('everdawn.solo'); } catch { /* */ }
    const soloCh = solo && store.load().chars[solo];
    if (params.get('cls')) this.quickStart(); else if (soloCh) this.startWorld(soloCh); else if (resumeCh) this.resumeSession(sess, resumeCh); else this.showTitle();
    addEventListener('pagehide', () => this.save());
    addEventListener('beforeunload', e => { if (this.leaving) return; if ((this.net && [...this.net.guests.values()].some(g => g.proxy)) || (this.guest?.joined && !this.guest.closed)) { e.preventDefault(); e.returnValue = ''; } });
    const loop = () => { requestAnimationFrame(loop); if (!this.manual) this.frame(); };
    loop();
    setInterval(() => this.save(), 20000);
    addEventListener('beforeunload', () => this.save());
  }

  // The hero statue in Dawnhollow's square honours yesterday's World First (or the realm's first legend).
  async raiseStatue() {
    const spot = this.world.settle.statue; if (!spot) return;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let hero = { name: 'Aldric Dawnbringer', cls: 'warrior', race: 'human', when: '2004-11-23' };
    try { const b = await boards(y); const f = b.first?.[0]; if (f) hero = { name: f.name, cls: f.cls, race: f.race || 'human', when: y }; } catch { }
    const g = this.game;
    const u = new (await import('./game/unit.js')).Unit({ name: hero.name, kind: 'npc', hostile: false, level: 10, pos: new THREE.Vector3(spot.x, spot.y, spot.z), hp: 9999 });
    u.title = `World First · ${hero.when}`; u.npcId = 'statue'; u.facing = Math.PI + 0.3; u.statue = true;
    u.npc = { name: `${hero.name}`, greet: `Carved in stone: ${hero.name}, first of all Lastlight to slay the dragon of the Ember Maw on ${hero.when}. The plaque is polished by a thousand hands. A small inscription below reads: "your name could be here tomorrow."` };
    g.addModel(u, ['humanoid', { race: hero.race, sex: 'm', cls: hero.cls, gearTier: 3, seed: 1234 }]);
    const m = u.model;
    m.root.scale.setScalar(1.45);
    u.height = (m.height || 1.9) * 1.45; u.radius = 0;
    // strike a pose, then freeze it in stone
    m.update(0.2, { speed: 0, combat: true, grounded: true });
    m.play?.('roar');
    for (let i = 0; i < 40; i++) m.update(1 / 30, { speed: 0, combat: true, grounded: true });
    const stone = stoneMaterial();
    m.root.traverse(o => { if (o.isMesh) o.material = stone; });
    u.frozenModel = true;
    g.sim.add(u); g.npcs.statue = u;
  }

  // The Valley of Kings outside Aurelion's west gate: six stone heroes, larger than life.
  async raiseKings(w) {
    const heroes = [['human', 'm', 'warrior', 'roar'], ['elf', 'f', 'mage', 'castOmni'], ['dwarf', 'm', 'paladin', 'cheer'], ['orc', 'm', 'warrior', 'point'], ['human', 'f', 'priest', 'bow'], ['elf', 'm', 'hunter', 'roar']];
    const stone = stoneMaterial();
    for (const [i, s] of (w.settle.statues || []).entries()) {
      const [race, sex, cls, pose] = heroes[i % heroes.length];
      const m = createModel(['humanoid', { race, sex, cls, gearTier: 3, seed: 900 + i }]);
      m.update(0.2, { speed: 0, combat: true, grounded: true }); m.play?.(pose);
      for (let k = 0; k < 40; k++) m.update(1 / 30, { speed: 0, combat: true, grounded: true });
      m.root.traverse(o => { if (o.isMesh) { o.material = stone; o.castShadow = true; } });
      m.root.scale.setScalar(3.1); m.root.position.set(s.x, s.y, s.z); m.root.rotation.y = s.rot;
      w.scene.add(m.root);
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ------------------------------------------------------------------ zones
  /** Put another zone's world on screen (built already): its terrain, lights, effects and inhabitants. */
  activateWorld(zone, w = this.worlds[zone]) {
    const old = this.world, g = this.game;
    if (!w || old === w) return;
    this.bridge.leaveWorld(old);
    this.prof.endFish(null); this.prof.clearNodes(g.sim);
    g.swapZone(zone, w);
    this.world = w; this.zoneId = zone;
    w.cycle = old.cycle; w.setTime(old.tod);
    this.renderer.setScene(w.scene, this.camera); this.renderer.setQuality(this.renderer.quality, w);
    G.uHeightTex.value = w.terrain.heightTex;
    this.fx.setScene(w.scene, (x, z) => w.heightAt(x, z)); this.fx.useGlobalHeight?.();
    this.ring.attach(w.scene);
    w.scene.add(this.ambAnchor); w.scene.add(this.lantern);
    this.cam.heightFn = (x, z) => w.heightAt(x, z); this.cam.boxes = worldBoxes(w); this.cam._first = true;
    this.bridge.worldAnchors(w); this.bridge.worldLoops(w);
    this.prof.spawnNodes(w, g.sim, zone);
    this.companions.reparent();
    this.hud.lastArea = null; this.hud.trackerDirty = true;
  }
  /** Walk through a zone gate, fly, or hearth home. The first visit builds the zone (a loading screen); a friend's
   *  browser follows its host (net/host.js tells it to), and can't lead the group itself. */
  async travelTo(zone, arrive = null, o = {}) {
    if (this.traveling || zone === this.zoneId || this.mode !== 'world' || !this.game.player) return false;
    if (this.guest && !o.fromHost) { this.ui.alerts.error(`${this.guest.hostName} leads the group between zones. Ask them to come through.`); return false; }
    const Z = ZONES[zone], p = this.game.player; if (!Z) return false;
    arrive = arrive || Z.arrive;
    this.traveling = true;
    try {
      this.game.duels.forfeit(p); this.waypoints.clearAll(); this.interact.closeMenu(); this.ui.loot.close();
      if (this.ui.merchant.isOpen) this.ui.merchant.close();
      this.ui.screen('loading');
      const tip = zone === 'crown' ? 'Tip: Aurelion\'s Quartermaster takes Ember Marks too. So does the one in Dawnhollow.' : 'Tip: Your hearthstone always brings you home to Dawnhollow.';
      this.ui.loading.set({ zone: Z.name, tip, progress: 0.05, stage: o.hearth ? 'Hearthstone' : o.fly ? 'Taking flight…' : 'Travelling…' });
      this.net?.zoneStart?.(zone, arrive);
      this.guest?.pause();
      await new Promise(r => setTimeout(r, 40));
      let w = this.worlds[zone];
      if (!w) {
        w = new World(zone);
        await w.build((f, label) => this.ui.loading.set({ zone: Z.name, tip, progress: 0.05 + f * 0.8, stage: label }));
        this.worlds[zone] = w;
        if (zone === 'crown') await this.raiseKings(w);
      }
      this.activateWorld(zone, w);
      p.pos.set(arrive.x, w.heightAt(arrive.x, arrive.z), arrive.z); p.vy = 0; p.dash = null; p.corpsePos = p.ghost ? p.pos.clone() : p.corpsePos;
      if (arrive.facing != null) p.facing = arrive.facing;
      this.cam.yaw = p.facing; this.cam.pitch = 0.3;
      w.terrain.warm(p.pos);
      this.ui.loading.set({ zone: Z.name, tip, progress: 1, stage: 'Arriving' });
      await new Promise(r => setTimeout(r, 60));
      this.ui.screen(null); this.ui.setHUDVisible(true);
      bus.emit('zone_text', { title: Z.name, sub: '' });
      this.music(Z.music);
      this.save();
      this.net?.zoneDone?.(zone, arrive);
      this.guest?.resume();
      return true;
    } catch (e) { console.error('travel failed', e); this.ui.screen(null); this.ui.setHUDVisible(true); return false; }
    finally { this.traveling = false; }
  }

  // ------------------------------------------------------------------ audio (optional module)
  async loadAudio() {
    try {
      const mod = await import('./audio/audio.js');
      this.audio = new mod.Audio();
      const start = () => {
        try {
          this.audio.init(); this.applySettings(this.settings);
          this.bridge.forceMusic(this.mode === 'raid' ? 'danger' : this.mode === 'world' ? 'vale' : 'login');
          this.bridge.worldLoops(this.world);
          this.audio.prepare?.();
        } catch (e) { console.warn(e); }
        removeEventListener('pointerdown', start); removeEventListener('keydown', start);
      };
      addEventListener('pointerdown', start); addEventListener('keydown', start);
      this.bridge.audio = this.audio;
      // UI clicks
      addEventListener('click', ev => { if (ev.target.closest?.('.evd button, .evd [class*=btn], .evd .slot')) { try { this.audio.play('uiClick', { vol: 0.6 }); } catch { } } }, true);
      this.ui.on('panel', (id, open) => { try { this.audio.play(open ? 'uiOpen' : 'uiClose', { vol: 0.6 }); } catch { } });
    } catch (e) { console.warn('audio unavailable', e); }
  }
  music(name) { this.bridge?.forceMusic(name); }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    const st = this.settings;
    this.game.settings.sens = (st.sensitivity ?? 50) / 50;
    this.game.settings.invertY = !!st.invertY;
    this.game.settings.autoLoot = st.autoLoot !== false;
    this.input.lockOk = st.mouseLock !== false;
    if (st.quality && st.quality !== this.renderer.quality) this.renderer.setQuality(st.quality, this.world);
    if (this.audio) for (const bus of ['master', 'music', 'sfx', 'ambience']) if (st[bus] !== undefined) { try { this.audio.setVolume(bus, st[bus] / 100); } catch { } }
    const db = store.load(); db.settings = st; store.save(db);
  }

  // ------------------------------------------------------------------ screens
  async showTitle() {
    if (this.zoneId !== 'vale') this.activateWorld('vale'); // the title flies over the Vale
    this.mode = 'title';
    if (params.get('join') && !this.joinPrompted) { this.joinPrompted = true; setTimeout(() => this.openTogether(params.get('join')), 700); } // an invite link
    this.cine.play(TITLE_PATH, Math.random() * 40);
    this.world.cycle = false; this.world.setTime(0.66);
    this.ui.screen('login');
    this.music('login');
    const d = this.dragon;
    const b = await boards(d.day);
    const you = store.load().last;
    const row = (arr, fmt) => (arr || []).map((r, i) => ({ rank: i + 1, name: r.name, cls: r.cls, value: fmt(r), parse: r.parse, isYou: r.name === you }));
    const utc = t => new Date(t).toISOString().slice(11, 16) + ' UTC';
    this.ui.login.set({
      dragon: { name: `${d.name}, ${d.title}`, element: d.element, affix: AFFIXES[d.affix].name, affixDesc: AFFIXES[d.affix].desc, worldFirst: b.first?.[0] ? { name: b.first[0].name, cls: b.first[0].cls, time: utc(b.first[0].at) } : null, resetIn: this.resetIn() },
      leaderboard: {
        worldFirst: row(b.first, r => utc(r.at)),
        fastestKill: row(b.fastest, r => fmtTime(r.killTime)),
        topParse: row([...(b.dps || []), ...(b.hps || [])].sort((a, c) => (c.dps || c.hps) - (a.dps || a.hps)).slice(0, 10), r => Math.round(r.dps || r.hps).toLocaleString()),
        speedrun: row(b.speedrun, r => fmtTime(r.speedrun)),
      },
      population: 2847, humans: 1, online: b.online,
    });
  }
  resetIn() { const n = new Date(), m = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)); const s = (m - n) / 1000; return `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`; }

  wireScreens() {
    const ui = this.ui;
    const saved = () => { const db = store.load(); return db.last && db.chars[db.last]; };
    ui.on('login:enter', () => {
      const ch = saved();
      if (ch) ui.popups.show({ id: 'title', text: `Continue as **${ch.name}**, level ${ch.level} ${ch.race} ${ch.cls}?`, accept: 'Continue', decline: 'New Character', onAccept: () => this.startWorld(ch), onDecline: () => this.showCreate(false) });
      else this.showCreate(false);
    });
    ui.on('login:raid', () => {
      const ch = saved();
      if (ch && ch.level >= 10) ui.popups.show({ id: 'title', text: `Raid tonight as **${ch.name}** (level 10 ${ch.cls})?`, accept: 'Raid', decline: 'New Character', onAccept: () => this.startWorld(ch, true), onDecline: () => this.showCreate(true) });
      else this.showCreate(true);
    });
    ui.on('login:watch', () => this.watchRaid());
    ui.on('login:together', () => this.openTogether());
    ui.on('login:settings', () => ui.settings.open());
    ui.on('settingsOpen', () => ui.settings.setActions(this.gameActions()));
    ui.on('gameAction', id => {
      if (id === 'logout') this.logout();
      else if (id === 'leaveWorld') this.leaveFriendsWorld();
      else if (id === 'stopHosting') this.stopHosting();
      else if (id === 'host') { ui.settings.close(); if (!this.startHosting()) ui.alerts.error('Hosting needs the web version of the game.'); }
    });
    ui.on('create:change', st => this.updatePreview(st));
    ui.on('create:back', () => { this.clearPreview(); this.showTitle(); });
    ui.on('create:submit', st => this.createCharacter(st));
    ui.on('results:share', () => this.shareCard());
    ui.on('results:challenge', () => this.copyChallenge());
    ui.on('results:queue', () => { if (this.guest) return this.guestResultsClose(); this.leaveRaid(); setTimeout(() => this.enterRaid(), 100); });
    ui.on('results:return', () => { if (this.guest) return this.guestResultsClose(); this.leaveRaid(); });
  }

  showCreate(jump) {
    this.ui.popups.close('title');
    this.mode = 'create'; this.jumpMode = jump;
    this.ui.screen('create');
    this.world.cycle = false; this.world.setTime(0.63);
    this.previewYaw = STAGE.face;
    this.updatePreview(this.ui.create.get());
  }
  updatePreview(st) {
    this.clearPreview();
    const opts = { race: st.race, sex: st.sex === 'female' ? 'f' : 'm', cls: st.cls, ...(st.appearance || {}), gearTier: this.jumpMode ? 2 : 0, seed: 7 };
    const m = this.preview = createModel(['humanoid', opts]);
    const p = STAGE.pos.clone(); p.y = this.world.heightAt(p.x, p.z);
    m.root.position.copy(p); m.root.rotation.y = this.previewYaw ?? STAGE.face;
    this.world.scene.add(m.root);
    m.play?.(st.cls === 'warrior' ? 'roar' : 'castOmni');
  }
  clearPreview() { if (this.preview) { this.world.scene.remove(this.preview.root); this.preview.dispose?.(); this.preview = null; } }

  createCharacter(st) {
    this.clearPreview();
    const ch = { name: st.name, race: st.race, sex: st.sex === 'female' ? 'f' : 'm', cls: st.cls, appearance: st.appearance || {}, level: 1, created: Date.now() };
    if (this.jumpMode) { ch.level = 10; ch.jump = true; ch.equip = this.game.premadeGear(st.cls); }
    this.startWorld(ch, this.jumpMode);
  }
  quickStart() { // dev: ?cls=mage&lv=5[&raid=1] skips the screens
    this.startWorld({ name: params.get('name') || 'Tester', cls: params.get('cls'), race: params.get('race') || 'human', sex: params.get('sex') || 'm', level: +(params.get('lv') || 1) }, !!params.get('raid'));
  }

  startWorld(ch, toRaid = false) {
    const g = this.game;
    this.ui.popups.close('title'); // a title prompt left open must not restart the character later
    if (g.player) { g.sim.remove(g.player); g.player = null; }
    const p = g.createPlayer(ch);
    if (ch.jump && !ch.equip) Object.assign(p.equip, g.premadeGear(p.cls));
    g.levelStats(p); p.hp = p.hpMax; p.power = p.powerType === 'rage' ? 0 : p.powerMax;
    g.refreshBar();
    this.ui.screen(null);
    this.ui.setHUDVisible(true);
    this.ui.playerInfo = { name: p.name, cls: p.cls, race: p.race };
    this.world.cycle = true;
    this.mode = 'world';
    this.cam.yaw = p.facing; this.cam._first = true; this.cam.pitch = 0.3; this.cam.distTarget = 8;
    this.world.terrain.warm(p.pos);
    g.enterWorld(this.dragon);
    this.hud.trackerDirty = true; this.hud.portraitDirty = true;
    this.save();
    this.music('vale');
    const vs = readChallenge();
    if (vs && !this.watching) setTimeout(() => this.ui.alerts.raidWarning(`${vs.name} challenges you: ${vs.value.toLocaleString()} ${vs.role === 'heal' ? 'HPS' : 'DPS'} in ${fmtTime(vs.killTime)}. Beat it.`, '#ffd040'), 3000);
    if (this.hostWanted) { this.hostWanted = false; this.startHosting(this.hostCode); }
    if (ch.zone && ch.zone !== this.zoneId && !this.guest && ZONES[ch.zone]) setTimeout(() => this.travelTo(ch.zone, { x: ch.pos?.[0], z: ch.pos?.[1] }), 50); // logged out in another zone
    if (this.guest) this.rememberSession({ char: p.name });
    if (this.guest && !this.guest.hooked) { this.guest.hooked = true; this.guest.hook(); this.guest.hello(); this.guestBadge = new GuestBadge(this.guest.hostName); return; }
    if (toRaid) setTimeout(() => this.enterRaid(), 300);
  }

  // ------------------------------------------------------------------ play together (net/)
  // One player hosts (their browser simulates the realm), friends join with a six-letter room code. Browsers talk
  // directly over WebRTC; the raid, quests and SimPlayers are shared, characters stay in each player's own browser.
  /** Per tab, so a refresh or Back/Forward can put you back where you were (a new tab starts fresh). */
  rememberSession(s) { try { const cur = this.readSession() || {}; sessionStorage.setItem('everdawn.session', JSON.stringify({ ...cur, ...s, char: s.char ?? this.game.player?.name ?? cur.char })); } catch { /* storage blocked */ } }
  readSession() { try { return JSON.parse(sessionStorage.getItem('everdawn.session') || 'null'); } catch { return null; } }
  forgetSession() { try { sessionStorage.removeItem('everdawn.session'); } catch { /* */ } }
  resumeSession(sess, ch) {
    if (sess.role === 'host') { this.hostCode = sess.code; this.hostWanted = true; this.startWorld(ch); return; }
    this.showTitle();
    this.ui.alerts.info(`Rejoining room ${sess.code}…`);
    this.joinFriend(sess.code, { ok: () => {}, fail: msg => { this.forgetSession(); this.ui.alerts.error(msg); this.showTitle(); } }, ch);
  }
  openTogether(code) {
    if (this.mode !== 'title' || this.guest) return;
    openLobby({ code, publicUrl: PUBLIC_URL, onHost: () => { this.hostWanted = true; this.ui.emit('login:enter'); }, onJoin: (c, st) => this.joinFriend(c, st) });
  }
  joinFriend(code, st, ch = null) {
    const s = new GuestSession(this, code, {
      onOpen: () => {
        st.ok(); this.guest = s; this.game.becomeMirror();
        this.rememberSession({ role: 'guest', code, char: ch?.name ?? null });
        if (ch) { this.startWorld(ch); return; }
        this.ui.alerts.info('Connected! Choose your character.');
        this.ui.emit('login:enter');
      },
      onError: msg => { s.dispose(); if (this.guest === s) this.guest = null; st.fail(msg); },
    });
  }
  startHosting(code = null) {
    if (this.net || this.guest || !canNetwork() || !this.game.player) return false;
    this.net = new HostSession(this, code);
    return true;
  }
  /** The Game Menu's session buttons for where you are right now. */
  gameActions() {
    if (this.mode !== 'world' && this.mode !== 'raid') return [];
    if (this.watching) return [];
    const list = [];
    if (this.guest) list.push({ id: 'leaveWorld', label: `Leave ${this.guest.hostName}'s World` });
    else if (this.net) list.push({ id: 'stopHosting', label: 'Stop Hosting' });
    else if (canNetwork() && this.mode === 'world') list.push({ id: 'host', label: 'Host for Friends' });
    list.push({ id: 'logout', label: 'Log Out', dark: true });
    return list;
  }
  /** Stop hosting: friends are told the world closed; you keep playing on your own. */
  stopHosting() {
    if (!this.net) return;
    this.ui.settings.close();
    this.net.close(); this.net = null;
    this.forgetSession();
    this.ui.alerts.info('Your world is closed to friends. You are playing on your own.');
    bus.emit('chat', { ch: 'system', text: 'You stopped hosting. Friends were sent back to their title screen.' });
  }
  /** A friend's world is theirs: leaving goes back through a reload (this browser's own realm was set aside). */
  leaveFriendsWorld() {
    if (!this.guest) return;
    this.save();
    try { sessionStorage.setItem('everdawn.solo', this.game.player?.name || ''); } catch { /* */ }
    this.reloadClean();
  }
  reloadClean() {
    this.leaving = true;
    try { this.guest?.dispose(); } catch { /* */ }
    this.forgetSession();
    setTimeout(() => location.replace(location.pathname), 150); // drops ?join= so the lobby doesn't open again
  }
  /** Log Out: save and go back to the title screen (a friend's world closes for you; a hosted world closes for all). */
  logout({ force = false } = {}) {
    if (this.mode !== 'world' && this.mode !== 'raid') return;
    const g = this.game, p = g.player;
    if (!force && p && p.inCombat && !p.dead && !p.ghost && !this.guest) { this.ui.alerts.error("You can't log out while in combat."); return; }
    this.ui.settings.close();
    this.save();
    if (this.guest) { this.reloadClean(); return; }
    if (this.watching) { this.endWatch(null); return; }
    if (this.raid) this.leaveRaid();
    if (this.net) { this.net.close(); this.net = null; }
    this.forgetSession();
    // put the character away
    g.duels.forfeit(p);
    this.companions.dismount(p); if (this.companions.pet) this.companions.togglePet(); this.prof.endFish(null);
    if (p.party) g.social.leave(p, true);
    this.interact.cancelTrade?.(); this.interact.closeMenu(); this.interact.closeWindow?.();
    this.waypoints.clearAll();
    g.sim.remove(p); p.model?.dispose?.(); g.player = null;
    if (p.ghost) { G.uDesat.value = 0; this.renderer.F.uDesat.value = 0; }
    this.ui.popups.closeAll(); this.ui.loot.close(); this.ui.death.hide();
    while (this.ui.closeTop()) { /* close every window */ }
    this.showTitle();
  }
  /** Middle-click / Alt+click in the world: a waypoint for your group where the cursor points. */
  markAt(sx, sy) {
    if (this.mode !== 'world') return;
    const hit = groundAt(this.camera, sx, sy, (x, z) => this.world.heightAt(x, z));
    if (hit) this.waypoints.place(hit.x, hit.z);
  }
  guestRaidEnter(m) {
    if (this.mode === 'raid' || !this.guest) return;
    const p = this.game.player;
    this.ui.screen(null);
    p.dead = false; p.ghost = false; p.auras = []; p.target = null; p.casting = null; p.corpsePos = null; p.dash = null;
    G.uDesat.value = 0; this.renderer.F.uDesat.value = 0;
    this.guest.clearUnits();
    this.raid = new MirrorRaid(this, m.dragon, this.guest);
    this.raid.lair.applyAtmosphere();
    this.renderer.setScene(this.raid.scene, this.camera);
    this.fx.setScene(this.raid.scene, (x, z) => this.raid.lair.heightAt(x, z), { bake: { extent: 72 } });
    this.ring.attach(this.raid.scene);
    this.cam.heightFn = (x, z) => this.raid.lair.heightAt(x, z);
    this.cam.boxes = null; this.cam._first = true; this.cam.yaw = 0; this.cam.pitch = 0.35; this.cam.distTarget = 11;
    this.mode = 'raid'; this.raidDone = false; this.hud.raidTracker = false; this.companions.dismount(p); this.companions.reparent();
    this.ui.setHUDVisible(true);
    this.music('danger');
    this.dcam = this.dcam || new DirectorCam(this.camera); this.dcam.reset();
    this.revealT = 5; this.dcam.choose(this.raid, 'sleeper', 2.8);
  }
  guestRaidLeave() {
    if (this.mode !== 'raid' || !(this.raid instanceof MirrorRaid)) return;
    this.ui.screen(null);
    this.leaveRaid();
    this.guest.clearUnits();
  }
  guestRaidResult(m) {
    if (!(this.raid instanceof MirrorRaid) || this.raidDone) return;
    this.raidDone = true;
    const p = this.game.player, row = m.res.meter.find(r => r.name === p.name) || { dmg: 0, heal: 0, dead: false }, t = Math.max(1, m.res.killTime);
    const result = { killTime: m.res.killTime, attempts: m.res.attempts, meter: m.res.meter, loot: [], player: { dps: row.dmg / t, hps: row.heal / t, dmg: row.dmg, heal: row.heal, died: !!row.dead, avoidable: row.avoidable || 0, role: p.raidRole } };
    this.raid.result = result; this.raid.state = 'victory';
    p.marks = (p.marks || 0) + MARKS_PER_KILL; bus.emit('marks', { amount: MARKS_PER_KILL }); bus.emit('chat', { ch: 'system', text: `You receive ${MARKS_PER_KILL} Ember Marks. Spend them with Quartermaster Brannoc in Dawnhollow.` });
    setTimeout(() => this.onVictory(result), 9000);
  }
  guestResultsClose() {
    this.ui.screen(null); this.ui.setHUDVisible(true);
    if (this.mode === 'raid') this.ui.alerts.info(`${this.guest.hostName} leads you back out when they leave the raid.`);
  }
  guestLost() { this.guestBadge?.set('Disconnected'); }
  // ------------------------------------------------------------------ watch mode
  // Spectate tonight's raid: a throwaway level-10 character joins as the tenth raider, the raid AI plays it, a
  // director camera cuts around the fight, and nothing is saved or submitted. Ends back at the title.
  watchRaid() {
    if (this.mode !== 'title' || this.guest) return;
    const r = a => a[Math.floor(Math.random() * a.length)];
    this.watching = true; this.noHints = true;
    this.dcam = this.dcam || new DirectorCam(this.camera);
    this.ui.root.classList.add('evd-watching');
    this.startWorld({ name: randomName(), race: r(['human', 'dwarf', 'orc', 'elf']), sex: r(['m', 'f']), cls: r(['warrior', 'mage', 'priest']), level: 10, jump: true, created: Date.now() }, true);
    this.showWatchBar(true);
  }
  showWatchBar(on) {
    this.watchBar?.remove(); this.watchBar = null;
    if (!on) return;
    const d = this.dragon, bar = this.watchBar = document.createElement('div');
    bar.className = 'evd-watchbar';
    const label = document.createElement('span'); label.className = 'wl'; label.textContent = 'Watching';
    const title = document.createElement('span'); title.className = 'wt'; title.textContent = `Tonight's raid: ${d.name}, ${d.title}`;
    const btn = (text, cls, fn) => { const b = document.createElement('button'); b.className = 'evd-btn small ' + cls; b.textContent = text; b.addEventListener('click', fn); return b; };
    bar.append(label, title, btn('Play Everdawn', '', () => this.endWatch(null, true)), btn('Leave', 'dark', () => this.endWatch(null)));
    this.ui.topLayer.appendChild(bar);
  }
  endWatch(result, play = false) {
    if (!this.watching) return;
    if (this.raid) this.leaveRaid();
    const g = this.game;
    if (g.player) { g.sim.remove(g.player); g.player = null; }
    this.watching = false; this.noHints = false;
    this.ui.root.classList.remove('evd-watching');
    this.showWatchBar(false);
    this.showTitle();
    if (result) setTimeout(() => this.ui.alerts.raidWarning(`The raid killed ${this.dragon.name} in ${fmtTime(result.killTime)}${result.attempts > 1 ? ` after ${result.attempts - 1} wipe${result.attempts > 2 ? 's' : ''}` : ''}. Your turn.`, '#ffd040'), 800);
    if (play) setTimeout(() => this.ui.emit('login:enter'), 50);
  }

  save() {
    if (!this.game?.player || this.mode === 'title' || this.mode === 'create' || this.watching) return;
    const db = store.load(); db.chars[this.game.player.name] = serializeChar(this.game); db.last = this.game.player.name; store.save(db);
  }

  // ------------------------------------------------------------------ raid
  enterRaid(el) {
    const g = this.game, p = g.player;
    if (this.mode === 'raid' || !p || this.guest) return; // a guest raids when their host does
    this.ui.screen('loading');
    this.ui.loading.set({ zone: 'The Ember Maw', tip: 'Tip: When the dragon takes a deep breath, get out of the line.', progress: 0.35, stage: 'Forming raid…' });
    setTimeout(() => {
      if (p.level < 10) { p.level = 10; g.levelStats(p); }
      g.refreshBar();
      p.hp = p.hpMax; p.power = p.powerType === 'rage' ? 0 : p.powerMax; p.dead = false; p.ghost = false; p.auras = []; p.target = null; p.casting = null;
      if (p.corpsePos) { p.corpsePos = null; }
      this.companions.dismount(p); this.prof.endFish(null);
      G.uDesat.value = 0; this.renderer.F.uDesat.value = 0;
      const d = { ...this.dragon }; if (el) d.element = el;
      this.raid = new RaidState(this, { dragon: d, player: p, social: g.social, world: g, watch: !!this.watching, guests: this.net?.proxies() || [] });
      this.raid.build();
      this.net?.raidStart();
      this.dcam = this.dcam || new DirectorCam(this.camera); this.dcam.reset();
      if (this.watching) { // the spectator's own slot is played by the raid AI like everyone else's
        p.persona = { skill: 0.85, arch: 'tryhard' }; p.brain = new RaidBrain(p, this.raid, p.raidRole, 9);
        this.raid.pc.update = () => { this.input.consumeDrag(); };
      } else { this.revealT = 5; this.dcam.choose(this.raid, 'sleeper', 2.8); } // meet the dragon first
      this.raid.pc.setBar(g.pc.bar);
      this.raid.lair.applyAtmosphere();
      this.renderer.setScene(this.raid.scene, this.camera);
      this.fx.setScene(this.raid.scene, (x, z) => this.raid.lair.heightAt(x, z), { bake: { extent: 72 } });
      this.ring.attach(this.raid.scene);
      this.cam.heightFn = (x, z) => this.raid.lair.heightAt(x, z);
      this.cam.boxes = null; this.cam._first = true; this.cam.yaw = 0; this.cam.pitch = 0.35; this.cam.distTarget = 11;
      this.mode = 'raid'; this.raidDone = false; this.companions.reparent();
      this.hud.raidTracker = false;
      this.ui.screen(null); this.ui.setHUDVisible(true);
      this.music('danger');
    }, 80);
  }

  leaveRaid() {
    if (!this.raid) return;
    const g = this.game, p = g.player;
    this.raid.dispose();
    this.world.scene.add(p.model.root);
    p.pos.set(0, 0, -264); p.pos.y = this.world.heightAt(p.pos.x, p.pos.z);
    p.dead = false; p.hp = p.hpMax; p.auras = []; p.target = null; p.casting = null; p.dash = null; p.stateAnim.dead = false; p.model?.revive?.();
    this.renderer.setScene(this.world.scene, this.camera);
    this.fx.setScene(this.world.scene, (x, z) => this.world.heightAt(x, z));
    this.fx.useGlobalHeight?.();
    this.ring.attach(this.world.scene);
    this.cam.heightFn = (x, z) => this.world.heightAt(x, z);
    this.cam.boxes = worldBoxes(this.world);
    this.cam._first = true; p.facing = 0; this.cam.yaw = 0;
    G.uFogDensity.value = 0.0016; G.uFogHeight.value = 0.012; G.uFogBase.value = 0;
    this.world.setTime(this.world.tod);
    this.raid = null;
    this.mode = 'world'; this.companions.reparent();
    this.ui.screen(null); this.ui.setHUDVisible(true);
    this.hud.trackerDirty = true; this.hud.lastArea = null;
    this.music('vale');
    this.save();
    this.net?.raidEnd(p.pos);
  }

  async onVictory(result) {
    const g = this.game, p = g.player, d = this.raid.dragon;
    const role = p.raidRole === 'heal' ? 'heal' : p.raidRole;
    const value = role === 'heal' ? result.player.hps : result.player.dps;
    const samples = await remoteSamples(d.day, role);
    const parse = parsePercentile(role, value, samples);
    const speedrun = !p.jump && !p.speedrunDone ? p.played : null;
    if (speedrun) p.speedrunDone = true;
    const entry = { day: d.day, at: Date.now(), name: p.name, cls: p.cls, race: p.race, role, guild: p.guild, element: d.element, killTime: result.killTime, dps: result.player.dps, hps: result.player.hps, attempts: result.attempts, deaths: result.player.died ? 1 : 0, avoidable: result.player.avoidable, speedrun, premade: !!p.jump, parse };
    const sub = await submitKill(entry);
    this.net?.broadcast({ t: 'kills', l: [entry] }); this.guest?.net.send({ t: 'kills', l: [entry] }); // friends see it on their boards
    const b = await boards(d.day);
    const pos = (b.fastest || []).findIndex(r => r.name === p.name && Math.abs(r.killTime - result.killTime) < 1);
    this.lastEntry = entry;
    this.ui.results.set({
      victory: true, bossName: `${d.name}, ${d.title}`, dragon: { name: d.name, element: d.element }, time: result.killTime, dps: Math.round(result.player.dps), hps: Math.round(result.player.hps),
      parse, cls: p.cls, name: p.name, rank: pos >= 0 ? { pos: pos + 1, of: Math.max(b.fastest.length, b.total || 0) } : undefined,
      deaths: entry.deaths, worldFirst: !!sub?.world_first, personalBest: false, loot: result.loot.map(it => ({ name: it.name, rarity: it.rarity, icon: it.icon })),
    });
    this.ui.screen('results');
    this.save();
  }

  async shareCard() {
    const p = this.game.player, e = this.lastEntry; if (!e) return;
    await this.ui.fontsReady;
    const portrait = document.createElement('canvas'); portrait.width = portrait.height = 512;
    // pose the hero for the camera: standing and mid-cheer (the fight may have left them dead or mid-swing)
    const m = p.model, still = { speed: 0, grounded: true, combat: false, dead: false };
    if (m?.update) { for (let i = 0; i < 45; i++) m.update(1 / 30, still); m.play?.('cheer'); for (let i = 0; i < 20; i++) m.update(1 / 30, still); }
    this.hud.portraits.draw(p, portrait, { full: true, transparent: true });
    const d = this.raid?.dragon || this.dragon;
    const card = renderShareCard({ name: p.name, cls: p.cls, race: p.race, level: p.level, guild: p.guild, dragonName: d.name, element: d.element, affix: AFFIXES[d.affix].name, parse: e.parse, time: e.killTime, dps: Math.round(e.dps), hps: Math.round(e.hps), role: e.role, attempts: e.attempts, date: e.day, portrait, url: this.shareHost() });
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.82);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;box-sizing:border-box';
    card.style.cssText = 'max-width:min(86vw,100%);max-height:66vh;box-shadow:0 10px 60px #000;border-radius:6px';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
    const note = document.createElement('div'); note.style.cssText = 'font:14px/1.4 system-ui,sans-serif;color:#e8d8b0;min-height:20px;text-align:center;max-width:680px';
    const btn = (label, fn) => { const bt = document.createElement('button'); bt.textContent = label; bt.style.cssText = 'font:600 16px Cinzel,serif;padding:10px 22px;background:linear-gradient(#9a2a1a,#5a1008);color:#ffd890;border:2px solid #c89a4a;border-radius:4px;cursor:pointer'; bt.onclick = fn; row.appendChild(bt); return bt; };
    const file = `everdawn-${p.name}-${e.day}.png`;
    const blob = new Promise(res => card.toBlob(res, 'image/png'));
    // Sandboxed embeds block <a download>; offer the platform's save dialog there, clipboard everywhere.
    const downloads = window.claude?.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
    btn('Save image', async () => {
      const dl = await downloads;
      if (dl) { try { await dl.save({ filename: file, data: await blob }); } catch { /* the viewer declined */ } return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(await blob); a.download = file; a.click();
    });
    if (window.ClipboardItem && navigator.clipboard?.write) btn('Copy image', () => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => { note.textContent = 'Image copied. Paste it anywhere.'; }, () => { note.textContent = 'Your browser blocked image copying. Use Save image instead.'; });
    });
    btn('Copy challenge', () => this.copyChallenge(note));
    btn('Close', () => ov.remove());
    ov.append(card, row, note); document.body.appendChild(ov);
  }
  // Where the card says the game lives: the public build if configured, this page if it has a real address.
  shareHost() {
    const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();
    if (PUBLIC_URL) return PUBLIC_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return !framed && /^https?:$/.test(location.protocol) && !/^(localhost|127\.)/.test(location.hostname) ? location.host + location.pathname.replace(/index\.html$/, '') : 'realm: Lastlight';
  }
  // The brag line + link that goes on the clipboard. Inside a sandboxed frame the page's own URL is useless to a
  // friend, so link to the public build when one is configured, and send the text alone otherwise.
  challengeText() {
    const e = this.lastEntry; if (!e) return '';
    const d = this.raid?.dragon || this.dragon;
    const framed = (() => { try { return window.top !== window.self; } catch { return true; } })();
    const base = PUBLIC_URL || (framed || !/^https?:$/.test(location.protocol) ? '' : location.href.split('#')[0].split('?')[0]);
    const value = Math.round(e.role === 'heal' ? e.hps : e.dps).toLocaleString();
    const line = `I killed ${d.name} in ${fmtTime(e.killTime)} with ${value} ${e.role === 'heal' ? 'HPS' : 'DPS'} (parse ${e.parse}) on Everdawn's Lastlight realm. Beat me.`;
    return base ? `${line} ${challengeLink(base, e)}` : line;
  }
  copyChallenge(note) {
    const text = this.challengeText(); if (!text) return;
    const say = m => { if (note) note.textContent = m; else this.ui.alerts.info(m); };
    const fallback = () => {
      // No clipboard access (some embeds refuse it): show the text selected so Cmd/Ctrl+C works.
      const box = document.createElement('textarea'); box.value = text; box.readOnly = true;
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(640px,92vw);height:84px;z-index:10000;font:13px/1.4 ui-monospace,monospace;background:#120e0a;color:#f2e2bc;border:1px solid #c89a4a;border-radius:4px;padding:8px';
      document.body.appendChild(box); box.focus(); box.select();
      const close = ev => { if (ev.type === 'keydown' && ev.key !== 'Escape' && !(ev.metaKey || ev.ctrlKey)) return; setTimeout(() => box.remove(), ev.type === 'keydown' && ev.key !== 'Escape' ? 150 : 0); removeEventListener('keydown', close, true); };
      addEventListener('keydown', close, true); box.addEventListener('blur', () => box.remove());
      say('Press Cmd/Ctrl+C to copy your challenge.');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => say('Challenge copied. Send it to a friend.'), fallback);
    else fallback();
  }

  // ------------------------------------------------------------------ frame
  frame(dtOverride) {
    const now = performance.now();
    const dt = dtOverride ?? Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.time += dt; G.uTime.value = this.time;
    const g = this.game;
    if (this.mode === 'title' || this.mode === 'create') {
      if (this._touchPlaying) { this._touchPlaying = false; this.touch.setPlaying(false); }
      g.update(dt);
      if (this.mode === 'title') this.cine.update(dt, (x, z) => this.world.heightAt(x, z));
      else this.stageCamera(dt);
      this.world.update(dt, this.camera, this.camera.position);
      this.fx.update(dt);
      this.hud.update(dt);
      this.renderer.render(dt, this.time);
      this.input.endFrame();
      return;
    }
    const p = g.player;
    const st = this.mode === 'raid' ? this.raid : g;
    const touchPlay = this.touch.on && !this.watching;
    if (touchPlay !== this._touchPlaying) { this._touchPlaying = touchPlay; this.touch.setPlaying(touchPlay); }
    this.guest?.update(dt);
    st.update(dt);
    this.prof.update(dt); this.companions.update(dt);
    this.net?.update(dt);
    if (this.mode === 'raid' && this.raid.state === 'victory' && !this.raidDone && this.raid.result && !this.raid.mirror) { this.raidDone = true; const res = this.raid.result; this.net?.raidVictory(res); setTimeout(() => this.watching ? this.endWatch(res) : this.onVictory(res), this.watching ? 14000 : 9000); }
    const focus = p.pos.clone(); focus.y += (p.height || 1.8) * 0.92;
    G.uPlayerPos.value.copy(focus);
    if (this.debugView) { this.camera.position.set(...this.debugView.pos); this.camera.lookAt(...this.debugView.look); }
    else if (this.mode === 'raid' && (this.watching || this.revealT > 0)) {
      if (this.revealT > 0) { // entry reveal: any key or click hands the camera back
        this.revealT -= dt;
        if (this.input.clicks.length || this.input.pressed.size || this.revealT <= 0) { this.revealT = 0; this.cam._first = true; }
      }
      this.dcam.update(dt, this.raid);
    }
    else this.cam.update(dt, focus, p.facing, { moving: st.pc.moving && st.pc.camFollow !== false, dragging: this.input.dragging });
    if (this.mode === 'world') {
      this.world.update(dt, this.camera, p.pos);
      if (this.zoneId === 'vale') this.flyover.update(dt);
      this.ambAnchor.position.copy(p.pos);
      this.lantern.position.set(p.pos.x, p.pos.y + 2.6, p.pos.z); this.lantern.intensity = (this.world.night || 0) * 9;
      const night = this.world.night || 0, forest = this.world.hf.maskAt(p.pos.x, p.pos.z, M.FOREST);
      this.amb.fireflies.setIntensity(night * (0.4 + forest * 0.6));
      this.amb.leaves.setIntensity(forest * (1 - night * 0.5));
      this.amb.motes.setIntensity((1 - night) * 0.6);
    } else { G.uCamPos.value.copy(this.camera.position); for (const k in this.amb) this.amb[k].setIntensity(0); }
    const target = !this.watching && p.target && (!p.target.dead || p.target.lootable) ? p.target : null;
    this.ring.update(dt, target, p, (x, z) => (this.mode === 'raid' ? this.raid.lair : this.world).heightAt(x, z));
    this.bridge.update(dt, p, this.mode === 'world' ? this.world.hf : null, this.world.night || 0);
    this.fx.update(dt);
    this.hud.update(dt);
    this.renderer.render(dt, this.time);
    this.input.endFrame();
  }

  stageCamera(dt) {
    const [dx] = this.input.consumeDrag();
    if (this.preview) { this.previewYaw = (this.previewYaw ?? STAGE.face) + dx * 0.01; this.preview.root.rotation.y = this.previewYaw; this.preview.update(dt, { speed: 0, grounded: true, combat: false }); }
    const p = STAGE.pos, h = this.world.heightAt(p.x, p.z);
    const f = STAGE.face, fx = -Math.sin(f), fz = -Math.cos(f);
    this.camera.position.set(p.x + fx * STAGE.cam.dist - fz * STAGE.cam.side, h + STAGE.cam.height + 0.4, p.z + fz * STAGE.cam.dist + fx * STAGE.cam.side);
    this.camera.lookAt(p.x - fz * 0.55, h + 1.05, p.z + fx * 0.55);
  }

  // ------------------------------------------------------------------ debug / test helpers
  view(pos, look, t) { this.debugView = pos ? { pos, look } : null; if (t !== undefined) { this.world.cycle = false; this.world.setTime(t); } this.world.terrain.warm(new THREE.Vector3(...(pos || [0, 0, 0]))); }
  stats() { const i = this.renderer.r.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; }
  tp(x, z) { const p = this.game.player; p.pos.set(x, this.world.heightAt(x, z), z); this.cam._first = true; }
  step(n = 1, dt = 1 / 60) { this.manual = true; for (let i = 0; i < n; i++) this.frame(dt); }
  botPlayer(skill = 0.8) {
    const p = this.game.player; p.persona = { skill, arch: 'tryhard' };
    if (this.mode === 'raid') import('./game/raid/raidai.js').then(m => { p.brain = new m.RaidBrain(p, this.raid, p.raidRole, 9); });
    (this.mode === 'raid' ? this.raid : this.game).pc.update = () => {};
  }
  async simRaid(seconds = 420, skill = 0.8) {
    this.manual = true;
    if (this.mode !== 'raid') { this.enterRaid(); await new Promise(r => setTimeout(r, 300)); }
    const r = this.raid; this.botPlayer(skill); await new Promise(res => setTimeout(res, 50));
    const log = []; let last = '';
    for (let t = 0; t < seconds * 30; t++) {
      if (r.state === 'readycheck' && r.playerReady === undefined) { r.playerReady = true; r.afterReady([]); }
      this.frame(1 / 30);
      if (r.state !== last) { log.push(`${r.totalT.toFixed(0)}s ${r.state} boss ${(r.boss.hpPct * 100).toFixed(0)}% alive ${r.raiders.filter(m => !m.dead).length}`); last = r.state; }
      if (r.state === 'victory') break;
    }
    return { log, result: r.result && { killTime: Math.round(r.result.killTime), attempts: r.result.attempts, player: r.result.player } };
  }
}

/** Weathered granite for statues: the painted colours' brightness × stone, with moss in the crevices. */
let STONE_MAT = null;
function stoneMaterial() {
  return STONE_MAT ||= lambert({ vertexColors: true }, { wrap: 0.35, spec: 0.25, shine: 12, rim: 0.12, key: 'statue-stone',
    fragment: fs => fs.replace('#include <color_fragment>', `#include <color_fragment>
      { float l = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2)); float n = fract(sin(dot(floor(vWPos * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec3 g = vec3(0.62, 0.6, 0.56) * (0.55 + l * 0.9) * (0.92 + n * 0.12);
        diffuseColor.rgb = mix(g, vec3(0.32, 0.4, 0.22), smoothstep(0.35, 0.1, l) * 0.35); }`) });
}

const appInst = new App();
window.__game = appInst;
window.__iconURL = iconURL; // debug: render any icon
appInst.init().catch(e => { console.error(e); bootStage.textContent = 'Error: ' + e.message; });
// Claude artifact viewers hot-swap a republished version into open pages: save first so the reload resumes the character.
try { window.claude?.hot?.snapshot?.(() => { try { appInst.save(); } catch { /* not in a saveable state */ } return {}; }); } catch { /* not in a viewer */ }
