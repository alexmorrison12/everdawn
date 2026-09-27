// Everdawn audio engine — everything synthesized with the Web Audio API (no audio files).
//
//   const audio = new Audio();
//   addEventListener('pointerdown', () => audio.init());      // first user gesture (safe to call repeatedly)
//   audio.play('hitFlesh', { pos: {x, y, z} });                // 3D one-shot → Voice handle | null (culled/limited)
//   const hum = audio.loop('castLoop', { pos });  hum.setPos(p); hum.setVol(0.5); hum.stop(0.3);
//   audio.setListener(camPos, yaw);                            // forward = (-sin yaw, 0, -cos yaw); call every frame
//   audio.music('vale');  audio.music('raidP2');  audio.music('victory', { fade: 0.8, then: 'vale' });  audio.music(null);
//   audio.ambience({ birds: 0.8, wind: 0.4 });                 // partial updates OK; cheap to call every frame
//   audio.setVolume('music', 0.7);  audio.duck(0.6, 2.5);
//
// play/loop options: pos {x,y,z} (3D: distance gain + air-absorption low-pass + pan vs listener, culled beyond the
//   sound's range), vol (linear, default 1), rate (pitch multiplier), pan (-1..1, non-3D), delay (s).
// Calls made before init() are safe: play() returns null, music()/ambience()/loop() are remembered and start on init.
// Extras: stinger(name) overlays 'victory'/'wipe' over current music; prepare() pre-bakes loop buffers (async);
//   currentMusic; stats; dispose(). Names: SOUND_NAMES, LOOP_NAMES, TRACK_NAMES, AMBIENCE_NAMES (exported below).
// setVolume(bus, v): bus = master | music | sfx | ambience | ui, v = 0..1 slider value (perceptual: gain = v²).
//
// Graph:  voices → bus(in/rev) → [bus EQ] → duck → volume → [bus limiter: sfx, music] → mix → 24 Hz HPF →
//         master limiter (-2 dBFS) → makeup compensation → safety soft-clipper (ceiling 0.88 ≈ -1.1 dBFS) → master
//         bus reverb sends → hall (music/ui/ambience, mono-in wide) or room (sfx) convolvers (generated IRs) → mix
import { Kit } from './kit.js';
import { SFX, ALIAS } from './sfx/index.js';
import { MusicEngine, TRACKS } from './music.js';
import { Ambience, AMBIENCE_NAMES } from './ambience.js';
import { makeNoise, makeIR, safetyCurve, ksBuffer, loopify, clamp, fromDb, driveCurve } from './util.js';

export const SOUND_NAMES = Object.keys(SFX).filter((k) => !SFX[k].hidden);
export const LOOP_NAMES = Object.keys(SFX).filter((k) => SFX[k].loop);
export const TRACK_NAMES = Object.keys(TRACKS);
export { AMBIENCE_NAMES };

// Internal bus trims (dB) — the designed mix at user volume 1.0.
const TRIM = { music: -4, sfx: 0, ambience: -2, ui: -1 };
const MAX_VOICES = 56;
const LAT = 0.004;

// Master limiter (DynamicsCompressorNode applies automatic makeup gain = (1/curve(0 dBFS))^0.6; compensated after).
const LIM = { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.16 };
const LIM_MAKEUP_DB = 0.6 * (-LIM.threshold - (-LIM.threshold) / LIM.ratio); // spec formula for knee 0
// SFX-bus transient limiter: catches impact "cracks" on the SFX bus so they don't pump the music via the master.
const SFX_LIM = { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.12 };
const SFX_LIM_MAKEUP_DB = 0.6 * (-SFX_LIM.threshold - (-SFX_LIM.threshold) / SFX_LIM.ratio);
// Music-bus limiter: drum transients in the loudest cues are caught on the music bus (never pumping SFX).
const MUS_LIM = { threshold: -3.5, knee: 0, ratio: 20, attack: 0.002, release: 0.2 };
const MUS_LIM_MAKEUP_DB = 0.6 * (-MUS_LIM.threshold - (-MUS_LIM.threshold) / MUS_LIM.ratio);
const CLIP_RANGE = 2;

export class Audio {
  constructor() {
    this.ctx = null;
    this.vol = { master: 1, music: 1, sfx: 1, ambience: 1, ui: 1 };
    this.L = { x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: -1, rx: 1, rz: 0, moved: false };
    this.voices = [];
    this.byName = new Map();
    this.loops = new Set();
    this.baked = new Map();
    this.ksCache = new Map();
    this._pendingMusic = null;
    this._ambLevels = {};
    this.seed = (Math.random() * 1e9) | 0;
    this.stats = { initMs: 0, played: 0, stolen: 0, culled: 0, dropped: 0, maxVoices: 0, tickMax: 0 };
    this._warned = new Set();
    this._lastTick = 0;
  }

  get time() { return this.ctx ? this.ctx.currentTime : 0; }
  get ready() { return !!this.ctx; }

  // Create the context + graph. Call from a user gesture. Options (lab/offline): { context, seed }.
  init(opts = {}) {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx.resume && !this.offline) this.ctx.resume().catch(() => {});
      return this;
    }
    const t0 = performance.now();
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!opts.context && !AC) return this;
    if (opts.seed != null) this.seed = opts.seed;
    this._raw = !!opts.raw;
    try { this.ctx = opts.context || new AC({ latencyHint: 'interactive' }); } catch (e) { console.warn('[audio] no context', e); return this; }
    this.offline = typeof OfflineAudioContext !== 'undefined' && this.ctx instanceof OfflineAudioContext;
    this._build();
    if (!this.offline) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      this._timer = setInterval(() => this._tick(), 50);
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this._tick());
    }
    this.stats.initMs = performance.now() - t0;
    if (this._pendingMusic) { const [n, o] = this._pendingMusic; this._pendingMusic = null; this.music(n, o); }
    if (Object.keys(this._ambLevels).length) this.ambience(this._ambLevels);
    for (const h of this.loops) h._start();
    return this;
  }

  _build() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const G = (v = 1, dest = null) => { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    // noise buffers are generated on first use (~1–3 ms each)
    const nz = {}, seeds = { white: 1, pink: 2, brown: 3 };
    this.noise = {};
    for (const c of Object.keys(seeds)) Object.defineProperty(this.noise, c, { get: () => nz[c] || (nz[c] = makeNoise(ctx, 2.5, c, seeds[c])) });
    // master chain
    this.master = G(this.vol.master ** 2);
    this.master.connect(ctx.destination);
    this.clip = ctx.createWaveShaper(); this.clip.curve = safetyCurve(CLIP_RANGE, 0.78, 0.88); this.clip.oversample = 'none';
    this.clip.connect(this.master);
    const clipIn = G(1 / CLIP_RANGE, this.clip);
    const post = G(fromDb(-LIM_MAKEUP_DB), clipIn);
    this.lim = new DynamicsCompressorNode(ctx, LIM); this.lim.connect(post);
    // raw: bypass limiter + clipper (lab calibration measurements only)
    this.hpf = ctx.createBiquadFilter(); this.hpf.type = 'highpass'; this.hpf.frequency.value = 24; this.hpf.Q.value = 0.6;
    this.hpf.connect(this._raw ? this.master : this.lim);
    this.mix = G(1, this.hpf);
    this.output = this.master; // tap for meters
    // reverbs: impulse responses are generated right after init returns (≈20 ms, kept out of the gesture handler)
    this.hallIn = G(1); this.hallIn.channelCount = 1; this.hallIn.channelCountMode = 'explicit';
    this.hall = ctx.createConvolver(); this.hall.normalize = false;
    this.hallIn.connect(this.hall); this.hall.connect(G(1, this.mix));
    this.roomIn = G(1);
    this.room = ctx.createConvolver(); this.room.normalize = false;
    this.roomIn.connect(this.room); this.room.connect(G(1, this.mix));
    const irs = () => {
      if (!this.ctx) return;
      this.hall.buffer = makeIR(ctx, { dur: 3.6, rt60: 3.0, pre: 0.03, fc0: 10000, fc1: 1600, damp: 0.35, hp: 170, er: 6, erSpread: 0.07, erLevel: 1.5, seed: 21 });
      this.room.buffer = makeIR(ctx, { dur: 1.3, rt60: 0.9, pre: 0.008, fc0: 9000, fc1: 2200, damp: 0.4, hp: 220, er: 10, erSpread: 0.045, erLevel: 3, seed: 5 });
    };
    if (this.offline) irs(); else setTimeout(irs, 0);
    // buses: in → [bus EQ] → duck → vol → [sfx limiter] → mix ;  rev → duckR → volR → hall|room
    const BUS_EQ = {
      music: [['lowshelf', 120, 0.7, -1.5], ['peaking', 2800, 0.8, 1.5], ['highshelf', 6000, 0.7, 3]], // presence + air
      sfx: [['highpass', 32, 0.6, 0]], // subsonic energy only eats limiter headroom
      ambience: [], ui: [],
    };
    this.bus = {};
    for (const name of ['music', 'sfx', 'ambience', 'ui']) {
      const b = { in: G(1), rev: G(1), hall: null, duck: G(1), duckR: G(1), vol: G(1), volR: G(1), volH: G(1) };
      let head = b.in;
      for (const [ty, f, q, g] of BUS_EQ[name]) { const n = ctx.createBiquadFilter(); n.type = ty; n.frequency.value = f; n.Q.value = q; n.gain.value = g; head.connect(n); head = n; }
      head.connect(b.duck); b.duck.connect(b.vol);
      if ((name === 'sfx' || name === 'music') && !this._raw) {
        const L = name === 'sfx' ? SFX_LIM : MUS_LIM, mk = name === 'sfx' ? SFX_LIM_MAKEUP_DB : MUS_LIM_MAKEUP_DB;
        b.lim = new DynamicsCompressorNode(ctx, L); b.vol.connect(b.lim); b.lim.connect(G(fromDb(-mk), this.mix));
      } else b.vol.connect(this.mix);
      b.rev.connect(b.duckR); b.duckR.connect(b.volR); b.volR.connect(name === 'sfx' ? this.roomIn : this.hallIn);
      if (name === 'sfx') { b.hall = G(1); b.hall.connect(b.volH); b.volH.connect(this.hallIn); } else b.hall = b.rev;
      this.bus[name] = b;
    }
    for (const k of Object.keys(this.vol)) this.setVolume(k, this.vol[k]);
    this.sr = sr;
  }

  // ---------------------------------------------------------------- volume / duck
  setVolume(bus, v) {
    v = clamp(+v || 0, 0, 1.5); this.vol[bus] = v;
    if (!this.ctx) return;
    const g = v * v, now = this.ctx.currentTime;
    if (bus === 'master') { this.master.gain.setTargetAtTime(g, now, 0.03); return; }
    const b = this.bus[bus]; if (!b) return;
    const gg = g * fromDb(TRIM[bus] || 0);
    for (const n of [b.vol, b.volR, b.volH]) n.gain.setTargetAtTime(gg, now, 0.03);
  }
  // Duck music + ambience by `amount` (0..1) for `time` seconds (fast attack, smooth release).
  duck(amount = 0.5, time = 1.5) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, lvl = 1 - clamp(amount, 0, 0.95);
    const until = now + time;
    if (this._duck && this._duck.until > now && this._duck.lvl < lvl) {
      if (until <= this._duck.until) return; // a deeper duck is already covering this
    }
    this._duck = { until, lvl };
    for (const name of ['music', 'ambience']) {
      const b = this.bus[name], amt = name === 'ambience' ? 0.5 + 0.5 * lvl : lvl;
      for (const n of [b.duck, b.duckR]) {
        const p = n.gain;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
        p.setTargetAtTime(amt, now, 0.04);
        p.setTargetAtTime(1, until, 0.45);
      }
    }
  }

  // ---------------------------------------------------------------- listener & spatial
  setListener(pos, yaw = 0) {
    const L = this.L;
    if (pos) { if (Math.abs(pos.x - L.x) + Math.abs(pos.z - L.z) + Math.abs((pos.y || 0) - L.y) > 0.05) L.moved = true; L.x = pos.x; L.y = pos.y || 0; L.z = pos.z; }
    if (Math.abs(yaw - L.yaw) > 0.01) L.moved = true;
    L.yaw = yaw; L.fx = -Math.sin(yaw); L.fz = -Math.cos(yaw); L.rx = Math.cos(yaw); L.rz = -Math.sin(yaw);
  }
  _spatial(p, range = 50, ref = 3) {
    const L = this.L, dx = p.x - L.x, dy = (p.y ?? L.y) - L.y, dz = p.z - L.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= range) return { g: 0, pan: 0, lp: 20000, d, send: 1 };
    let g = d <= ref ? 1 : ref / (ref + 0.85 * (d - ref));
    const u = d / range; if (u > 0.6) g *= Math.pow((1 - u) / 0.4, 1.5);
    const dh = Math.hypot(dx, dz);
    let pan = 0, front = 1;
    if (dh > 1e-3) { pan = (dx * L.rx + dz * L.rz) / dh; front = (dx * L.fx + dz * L.fz) / dh; }
    pan *= clamp(dh / 3, 0, 1) * 0.8;
    const lp = clamp(20000 / (1 + d / 14) * (0.62 + 0.38 * clamp(front + 0.6, 0, 1)), 700, 20000);
    const send = clamp(1 / Math.sqrt(Math.max(g, 0.05)), 1, 3.5);
    return { g, pan, lp, d, send };
  }

  // ---------------------------------------------------------------- one-shots
  // play(name, { pos, vol = 1, rate = 1, pan, delay }) → Voice handle | null
  play(name, o = {}) {
    if (!this.ctx) return null;
    name = ALIAS[name] || name;
    const rec = SFX[name];
    if (!rec) {
      if (TRACKS[name]) { this.stinger(name); return null; }
      if (!this._warned.has(name)) { this._warned.add(name); console.warn('[audio] unknown sound', name); }
      return null;
    }
    const ctx = this.ctx, now = ctx.currentTime, t = now + LAT + (o.delay || 0);
    let sp = null;
    if (o.pos) {
      sp = this._spatial(o.pos, rec.range ?? 45, rec.ref ?? 3);
      if (sp.g < 0.004) { this.stats.culled++; return null; }
    }
    // per-name voice limiting + burst suppression
    let list = this.byName.get(name);
    if (!list) { list = []; this.byName.set(name, list); }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= now) list.splice(i, 1);
    const gap = rec.gap ?? 0.025;
    let recent = 0; for (const v of list) if (t - v.t < gap) recent++;
    if (recent >= (rec.burst ?? 2)) { this.stats.dropped++; return null; }
    while (list.length >= (rec.max ?? 4)) this._steal(list[0]);
    // global cap
    this._prune(now);
    if (this.voices.length >= MAX_VOICES) {
      const pri = rec.pri ?? 1;
      let victim = null;
      for (const v of this.voices) if ((v.rec.pri ?? 1) <= pri && (!victim || v.t < victim.t)) victim = v;
      if (!victim) { this.stats.dropped++; return null; }
      this._steal(victim);
    }
    const v = new Voice(this, name, rec, t, o, sp);
    const kit = new Kit(this, ctx, v.input, t, { rate: o.rate ?? 1, seed: (this.seed = (this.seed * 1664525 + 1013904223) >>> 0), o });
    v.kit = kit;
    let dur = 0;
    try { dur = rec.fn(kit, { ...(rec.defaults || {}), ...o }) || 0; } catch (e) { console.error('[audio] recipe failed', name, e); }
    v.end = Math.max(kit.st.end, t + dur) + 0.05;
    list.push(v); this.voices.push(v);
    this.stats.played++;
    if (this.voices.length > this.stats.maxVoices) this.stats.maxVoices = this.voices.length;
    return v;
  }
  _steal(v) { v.stop(0.03); this.stats.stolen++; }
  _remove(v) {
    const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1);
    const l = this.byName.get(v.name); if (l) { const j = l.indexOf(v); if (j >= 0) l.splice(j, 1); }
  }
  _prune(now) { for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i].end <= now) this._remove(this.voices[i]); }

  // ---------------------------------------------------------------- loops
  // loop(name, { pos, vol }) → { stop(fade), setPos(p), setVol(v) }. Works before init (starts when audio starts).
  loop(name, o = {}) {
    name = ALIAS[name] || name;
    const rec = SFX[name];
    if (!rec) { if (!this._warned.has(name)) { this._warned.add(name); console.warn('[audio] unknown loop', name); } return new LoopHandle(this, null, o); }
    const h = new LoopHandle(this, name, o);
    this.loops.add(h);
    if (this.ctx) h._start();
    return h;
  }
  // Render a loopable buffer for a loop recipe (async, off the main thread via OfflineAudioContext).
  bake(name) {
    if (this.baked.has(name)) return this.baked.get(name);
    const rec = SFX[name];
    const spec = rec.loop || { dur: 3, xf: 0.3 };
    const sr = this.ctx.sampleRate, len = spec.dur + spec.xf;
    const oac = new OfflineAudioContext(2, Math.ceil(len * sr), sr);
    const out = oac.createGain(); out.connect(oac.destination);
    const kit = new Kit(this, oac, out, 0, { seed: 777 + name.length * 13, o: {} });
    rec.fn(kit, { ...(rec.defaults || {}), dur: len, loop: true });
    const p = oac.startRendering().then((buf) => loopify(this.ctx, buf, spec.xf));
    this.baked.set(name, p);
    return p;
  }
  // Pre-render loop buffers (e.g. during a loading screen). Resolves when done.
  prepare(names = LOOP_NAMES) {
    if (!this.ctx) return Promise.resolve();
    return Promise.all(names.filter((n) => SFX[n] && SFX[n].loop).map((n) => this.bake(n)));
  }
  // 'high' (default) | 'low': low thins per-note voices (2-saw strings, no string sheen / choir breath) for weak CPUs.
  setQuality(q) { this.lite = q === 'low'; }
  // PeriodicWave cache (per context) from harmonic amplitudes [h1, h2, ...]
  wave(name, amps) {
    this.waves = this.waves || new Map();
    let w = this.waves.get(name);
    if (!w) {
      const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
      amps.forEach((a, i) => { im[i + 1] = a; });
      w = this.ctx.createPeriodicWave(re, im); this.waves.set(name, w);
    }
    return w;
  }
  ks(f, o = {}) {
    const key = Math.round(f * 4) + '|' + (o.t60 ?? 2) + '|' + (o.bright ?? 0.5) + '|' + (o.pos ?? 0.18) + '|' + (o.shape ?? 0.5);
    let b = this.ksCache.get(key);
    if (!b) {
      b = ksBuffer(this.ctx, f, o);
      if (this.ksCache.size >= 100) this.ksCache.delete(this.ksCache.keys().next().value); // ≤ ~100 × ≤300 KB
      this.ksCache.set(key, b);
    }
    return b;
  }

  // ---------------------------------------------------------------- music / ambience
  music(name, o = {}) {
    if (!this.ctx) { this._pendingMusic = name ? [name, o] : null; return; }
    this._mus().play(name, o);
  }
  // Play a stinger ('victory' | 'wipe') over the current music (current music is ducked while it plays).
  stinger(name, o = {}) { if (this.ctx) this._mus().stinger(name, o); }
  get currentMusic() { return this.mu ? this.mu.currentName : (this._pendingMusic ? this._pendingMusic[0] : null); }
  _mus() { return this.mu || (this.mu = new MusicEngine(this)); }
  ambience(levels = {}) {
    Object.assign(this._ambLevels, levels);
    if (!this.ctx) return;
    (this.amb || (this.amb = new Ambience(this))).set(levels);
  }

  // ---------------------------------------------------------------- housekeeping
  _tick() {
    if (!this.ctx) return;
    const t0 = performance.now(), now = this.ctx.currentTime;
    this._prune(now);
    const L = this.L;
    for (const h of this.loops) if (h.pos && (h.dirty || L.moved)) h._spatialize();
    L.moved = false;
    if (this.mu) this.mu.tick();
    if (this.amb) this.amb.tick();
    const dt = performance.now() - t0; if (dt > this.stats.tickMax) this.stats.tickMax = dt;
  }
  dispose() { clearInterval(this._timer); if (this.ctx && this.ctx.close && !this.offline) this.ctx.close(); this.ctx = null; }
}

// One-shot voice: vg (volume × distance) → [lowpass → panner] → bus.in, with post-pan reverb sends.
class Voice {
  constructor(a, name, rec, t, o, sp) {
    const ctx = a.ctx;
    this.a = a; this.name = name; this.rec = rec; this.t = t; this.end = t + 1; this.stopped = false;
    this.base = (o.vol ?? 1) * (rec.gain ?? 1);
    this.pos = o.pos || null;
    const bus = a.bus[rec.bus || 'sfx'];
    this.vg = ctx.createGain(); this.vg.gain.value = this.base * (sp ? sp.g : 1);
    this.input = this.vg;
    if (rec.clip) { // per-voice soft clipper (drum-bus style): tames the first-ms crack of impacts, adds punch
      const sh = ctx.createWaveShaper(); sh.curve = driveCurve(rec.clip); sh.oversample = '2x'; sh.connect(this.vg);
      if (rec.clipIn) { this.input = ctx.createGain(); this.input.gain.value = rec.clipIn; this.input.connect(sh); } else this.input = sh;
    }
    let node = this.vg;
    if (sp) {
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = sp.lp; this.lp.Q.value = 0.5;
      this.pn = ctx.createStereoPanner(); this.pn.pan.value = sp.pan;
      node.connect(this.lp); this.lp.connect(this.pn); node = this.pn;
    } else if (o.pan != null) {
      this.pn = ctx.createStereoPanner(); this.pn.pan.value = clamp(o.pan, -1, 1); node.connect(this.pn); node = this.pn;
    }
    node.connect(bus.in);
    const sm = sp ? sp.send : 1;
    if (rec.rev) { this.sr = ctx.createGain(); this.sr.gain.value = rec.rev * sm; node.connect(this.sr); this.sr.connect(bus.rev); }
    if (rec.hall) { this.sh = ctx.createGain(); this.sh.gain.value = rec.hall * sm; node.connect(this.sh); this.sh.connect(bus.hall); }
  }
  stop(fade = 0.05) {
    if (this.stopped || !this.a.ctx) return;
    this.stopped = true;
    const now = this.a.ctx.currentTime, p = this.vg.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
    p.linearRampToValueAtTime(0, now + Math.max(0.005, fade));
    const endAt = now + Math.max(0.005, fade) + 0.02;
    for (const s of this.kit.st.srcs) if (!(s._end <= endAt)) { try { s.stop(endAt); } catch (e) { /* already stopped */ } }
    this.end = Math.min(this.end, endAt);
    this.a._remove(this);
  }
  setVol(v) { this.base = v * (this.rec.gain ?? 1); this._apply(); }
  setPos(p) { this.pos = p; this._apply(); }
  _apply() {
    if (this.stopped) return;
    const now = this.a.ctx.currentTime, sp = this.pos && this.lp ? this.a._spatial(this.pos, this.rec.range ?? 45, this.rec.ref ?? 3) : null;
    this.vg.gain.setTargetAtTime(this.base * (sp ? sp.g : 1), now, 0.05);
    if (sp) { this.pn.pan.setTargetAtTime(sp.pan, now, 0.05); this.lp.frequency.setTargetAtTime(sp.lp, now, 0.05); }
  }
}

// Looping sound: baked seamless buffer → gain → [lowpass → panner] → bus. Created before init = deferred start.
class LoopHandle {
  constructor(a, name, o) {
    this.a = a; this.name = name; this.rec = name ? SFX[name] : null;
    this.pos = o.pos ? { x: o.pos.x, y: o.pos.y ?? 0, z: o.pos.z } : null;
    this.vol = o.vol ?? 1; this.rate = o.rate ?? 1; this.fadeIn = o.fade ?? 0.4;
    this.stopped = !name; this.started = false; this.dirty = false;
  }
  _start() {
    if (this.stopped || this.started || !this.a.ctx) return;
    this.started = true;
    const a = this.a, ctx = a.ctx, rec = this.rec, bus = a.bus[rec.bus || 'sfx'];
    this.g = ctx.createGain(); this.g.gain.value = 0;
    let node = this.g;
    if (this.pos) {
      this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.5;
      this.pn = ctx.createStereoPanner(); node.connect(this.lp); this.lp.connect(this.pn); node = this.pn;
    }
    node.connect(bus.in);
    if (rec.rev) { this.sr = ctx.createGain(); this.sr.gain.value = rec.rev; node.connect(this.sr); this.sr.connect(bus.rev); }
    if (rec.hall) { this.sh = ctx.createGain(); this.sh.gain.value = rec.hall; node.connect(this.sh); this.sh.connect(bus.hall); }
    a.bake(this.name).then((buf) => {
      if (this.stopped || !a.ctx) return;
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = this.rate;
      s.connect(this.g); s.start(ctx.currentTime + 0.01, Math.random() * buf.duration * 0.9);
      this.src = s;
      this._apply(this.fadeIn);
    });
  }
  _target() {
    const base = this.vol * (this.rec.gain ?? 1);
    if (!this.pos) return { g: base };
    const sp = this.a._spatial(this.pos, this.rec.range ?? 45, this.rec.ref ?? 3);
    return { g: base * sp.g, sp };
  }
  _apply(tc = 0.08) {
    if (!this.g || this.stopped) return;
    const now = this.a.ctx.currentTime, { g, sp } = this._target();
    this.g.gain.setTargetAtTime(g, now, tc);
    if (sp) {
      this.pn.pan.setTargetAtTime(sp.pan, now, 0.06); this.lp.frequency.setTargetAtTime(sp.lp, now, 0.06);
      if (this.sr) this.sr.gain.setTargetAtTime(this.rec.rev * sp.send, now, 0.1);
    }
  }
  _spatialize() { this.dirty = false; if (this.src) this._apply(0.06); }
  setPos(p) { if (!p) return; if (!this.pos) this.pos = { x: 0, y: 0, z: 0 }; this.pos.x = p.x; this.pos.y = p.y ?? 0; this.pos.z = p.z; this.dirty = true; }
  setVol(v) { this.vol = v; if (this.src) this._apply(0.08); }
  setRate(r) { this.rate = r; if (this.src) this.src.playbackRate.setTargetAtTime(r, this.a.ctx.currentTime, 0.05); }
  stop(fade = 0.3) {
    if (this.stopped) return;
    this.stopped = true; this.a.loops.delete(this);
    if (!this.g || !this.a.ctx) return;
    const now = this.a.ctx.currentTime, p = this.g.gain;
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); }
    p.linearRampToValueAtTime(0, now + Math.max(0.01, fade));
    if (this.src) this.src.stop(now + Math.max(0.01, fade) + 0.05);
    const g = this.g; setTimeout(() => { try { g.disconnect(); } catch (e) { /* noop */ } }, (fade + 0.2) * 1000);
  }
  get playing() { return !!this.src && !this.stopped; }
}
