// Audio lab: buttons for every sound/track/ambience, live meters (waveform, spectrum, L/R peak+RMS, limiter GR),
// 3D placement pad, bus volumes, duck test, stress + hitch tests, and offline render/analysis (WAV + spectrogram).
// Automation (headless): window.__lab.* — see bottom of file.
import { Audio, SOUND_NAMES, LOOP_NAMES, TRACK_NAMES, AMBIENCE_NAMES } from '../audio/audio.js';
import { CATEGORIES, SFX } from '../audio/sfx/index.js';
import { renderSound, renderEvents, renderMusic, renderAmbience, renderLoop, analyze, timeline, toWav, spectrogram, blockPower } from '../audio/analysis.js';

const audio = new Audio();
window.audio = audio;

// ---------------------------------------------------------------- DOM
const css = `
#lab{position:fixed;inset:0;overflow:auto;background:#0e0c10;color:#e6dcc4;font:13px/1.35 'Roboto Condensed',Arial,sans-serif}
#lab h1{font:700 20px Cinzel,serif;color:#f3cf7a;margin:0;letter-spacing:.06em}
#lab h2{font:600 12px 'Roboto Condensed',sans-serif;text-transform:uppercase;letter-spacing:.12em;color:#b89a5a;margin:14px 0 6px}
#lab .top{position:sticky;top:0;z-index:5;display:flex;gap:14px;align-items:center;padding:10px 16px;background:#16121a;border-bottom:1px solid #3a2f22}
#lab .wrap{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:18px;padding:12px 16px 40px}
@media (max-width:900px){#lab .wrap{grid-template-columns:1fr}}
#lab button{background:#2a2230;color:#eadfc8;border:1px solid #4a3c2c;border-radius:4px;padding:5px 9px;margin:2px;cursor:pointer;font:13px 'Roboto Condensed',sans-serif}
#lab button:hover{background:#3a2e40;border-color:#8a6d3a}
#lab button.on{background:#5a4318;border-color:#e0b04a;color:#fff}
#lab button.big{background:#6a4a14;border-color:#e0b04a;font-weight:700}
#lab .row{display:flex;align-items:center;gap:8px;margin:3px 0}
#lab .row label{width:78px;color:#bfae8a}
#lab input[type=range]{flex:1;accent-color:#e0b04a}
#lab canvas{background:#050406;border:1px solid #2c2430;border-radius:4px;display:block;max-width:100%}
#lab pre{background:#08070a;border:1px solid #2c2430;border-radius:4px;padding:8px;white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;color:#cfc3a8;max-height:320px;overflow:auto}
#lab select,#lab input[type=number]{background:#1c1720;color:#eee;border:1px solid #4a3c2c;border-radius:3px;padding:3px}
#lab .muted{color:#8a7d66}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const root = document.createElement('div'); root.id = 'lab'; document.body.appendChild(root);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v); } for (const c of kids) e.append(c); return e; };

const status = el('span', { class: 'muted' }, 'audio not started — click anything');
const top = el('div', { class: 'top' }, el('h1', {}, 'EVERDAWN · Audio Lab'), el('button', { class: 'big', onclick: () => start() }, 'Init / Resume'), status);
root.append(top);
const left = el('div'), right = el('div');
root.append(el('div', { class: 'wrap' }, left, right));

function start() { audio.init(); if (!meters.on) meters.start(); status.textContent = `ctx ${audio.ctx.state} · ${audio.ctx.sampleRate} Hz · init ${audio.stats.initMs.toFixed(1)} ms`; }
root.addEventListener('pointerdown', () => { if (!audio.ctx) start(); }, { capture: true });

// ---------------------------------------------------------------- music
left.append(el('h2', {}, 'Music'));
const fadeIn = el('input', { type: 'number', value: '3', step: '0.5', min: '0', style: 'width:56px' });
const trackBtns = {};
const mrow = el('div');
for (const n of TRACK_NAMES) { const b = el('button', { onclick: () => { start(); audio.music(n, { fade: +fadeIn.value }); refreshTracks(); } }, n); trackBtns[n] = b; mrow.append(b); }
mrow.append(el('button', { onclick: () => { audio.music(null, { fade: +fadeIn.value }); refreshTracks(); } }, '■ stop'));
left.append(mrow, el('div', { class: 'row' }, el('label', {}, 'fade (s)'), fadeIn,
  el('button', { onclick: () => { start(); audio.stinger('victory'); } }, 'overlay victory'),
  el('button', { onclick: () => { start(); audio.music('victory', { fade: 0.8, then: 'vale' }); } }, 'victory → vale')));
const schedPre = el('pre', {}, '');
left.append(schedPre);
function refreshTracks() { for (const [n, b] of Object.entries(trackBtns)) b.classList.toggle('on', audio.currentMusic === n); }

// ---------------------------------------------------------------- volumes / duck
left.append(el('h2', {}, 'Buses'));
for (const bus of ['master', 'music', 'sfx', 'ambience', 'ui']) {
  const r = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '1' });
  const v = el('span', { class: 'muted', style: 'width:34px' }, '1.00');
  r.addEventListener('input', () => { audio.setVolume(bus, +r.value); v.textContent = (+r.value).toFixed(2); });
  left.append(el('div', { class: 'row' }, el('label', {}, bus), r, v));
}
left.append(el('div', {}, el('button', { onclick: () => audio.duck(0.6, 2.5) }, 'duck 0.6 / 2.5 s'), el('button', { onclick: () => { start(); audio.play('dragonRoar'); audio.duck(0.65, 3.5); } }, 'roar + duck')));

// ---------------------------------------------------------------- ambience
left.append(el('h2', {}, 'Ambience'));
const ambSliders = {};
for (const n of AMBIENCE_NAMES) {
  const r = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0' });
  const v = el('span', { class: 'muted', style: 'width:34px' }, '0.00');
  ambSliders[n] = r; r.addEventListener('sync', () => { v.textContent = (+r.value).toFixed(2); });
  r.addEventListener('input', () => { start(); audio.ambience({ [n]: +r.value }); v.textContent = (+r.value).toFixed(2); });
  left.append(el('div', { class: 'row' }, el('label', {}, n), r, v));
}
left.append(el('div', {}, ...[['Forest day', { birds: 0.8, wind: 0.35, water: 0, crickets: 0, fire: 0, tavern: 0, cave: 0, lava: 0 }], ['Lake night', { birds: 0, wind: 0.2, water: 0.7, crickets: 0.8 }], ['Inn', { birds: 0, wind: 0, water: 0, crickets: 0, tavern: 0.9, fire: 0.6 }], ['Mine', { tavern: 0, fire: 0, cave: 0.9, wind: 0.1 }], ['Ember Maw', { cave: 0.4, lava: 0.9, wind: 0 }], ['Silence', Object.fromEntries(AMBIENCE_NAMES.map((n) => [n, 0]))]]
  .map(([label, lv]) => el('button', { onclick: () => { start(); audio.ambience(lv); for (const [k, v] of Object.entries(lv)) if (ambSliders[k]) { ambSliders[k].value = v; ambSliders[k].dispatchEvent(new Event('sync')); } } }, label))));

// ---------------------------------------------------------------- loops
left.append(el('h2', {}, 'Loops (at pad position)'));
const loopHandles = {};
const lrow = el('div');
for (const n of LOOP_NAMES) {
  const b = el('button', { onclick: () => { start(); if (loopHandles[n]) { loopHandles[n].stop(0.4); delete loopHandles[n]; b.classList.remove('on'); } else { loopHandles[n] = audio.loop(n, { pos: pad.world() }); b.classList.add('on'); } } }, n);
  lrow.append(b);
}
left.append(lrow);

// ---------------------------------------------------------------- 3D pad
left.append(el('h2', {}, '3D position (listener at centre, facing up / −Z; ±40 m)'));
const padCv = el('canvas', { width: '240', height: '240' });
const use3d = el('input', { type: 'checkbox' });
left.append(padCv, el('div', { class: 'row' }, use3d, el('span', {}, 'play SFX at this position')));
const pad = {
  x: 0, z: -8,
  world() { return { x: audio.L.x + this.x, y: 0, z: audio.L.z + this.z }; },
  draw() {
    const g = padCv.getContext('2d'); g.fillStyle = '#050406'; g.fillRect(0, 0, 240, 240);
    g.strokeStyle = '#2a2230'; for (const r of [10, 20, 30, 40]) { g.beginPath(); g.arc(120, 120, r * 3, 0, 7); g.stroke(); }
    g.fillStyle = '#e0b04a'; g.beginPath(); g.moveTo(120, 110); g.lineTo(114, 126); g.lineTo(126, 126); g.fill();
    g.fillStyle = '#6cf'; g.beginPath(); g.arc(120 + this.x * 3, 120 + this.z * 3, 5, 0, 7); g.fill();
    g.fillStyle = '#8a7d66'; g.font = '11px monospace'; g.fillText(`x ${this.x.toFixed(0)}  z ${this.z.toFixed(0)}  d ${Math.hypot(this.x, this.z).toFixed(1)} m`, 6, 234);
  },
};
padCv.addEventListener('pointerdown', (e) => {
  const move = (ev) => { const r = padCv.getBoundingClientRect(); pad.x = ((ev.clientX - r.left) / r.width * 240 - 120) / 3; pad.z = ((ev.clientY - r.top) / r.height * 240 - 120) / 3; pad.draw(); for (const h of Object.values(loopHandles)) h.setPos(pad.world()); };
  move(e); const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); }; addEventListener('pointermove', move); addEventListener('pointerup', up);
});
pad.draw();

// ---------------------------------------------------------------- meters
right.append(el('h2', {}, 'Output'));
const meterCv = el('canvas', { width: '900', height: '220', style: 'width:100%' });
right.append(meterCv);
const meters = {
  on: false,
  start() {
    const ctx = audio.ctx; this.on = true;
    this.an = ctx.createAnalyser(); this.an.fftSize = 4096; this.an.smoothingTimeConstant = 0.6;
    const sp = ctx.createChannelSplitter(2); this.l = ctx.createAnalyser(); this.r = ctx.createAnalyser(); this.l.fftSize = this.r.fftSize = 2048;
    audio.output.connect(this.an); audio.output.connect(sp); sp.connect(this.l, 0); sp.connect(this.r, 1);
    this.td = new Float32Array(4096); this.fd = new Float32Array(2048); this.cl = new Float32Array(2048); this.cr = new Float32Array(2048);
    this.hold = [-90, -90]; this.peakMax = -90;
    const loop = () => { requestAnimationFrame(loop); this.draw(); };
    loop();
  },
  draw() {
    const g = meterCv.getContext('2d'), W = meterCv.width, H = meterCv.height;
    g.fillStyle = '#050406'; g.fillRect(0, 0, W, H);
    this.an.getFloatTimeDomainData(this.td); this.an.getFloatFrequencyData(this.fd);
    // waveform
    g.strokeStyle = '#6cf'; g.beginPath();
    for (let i = 0; i < 1024; i++) { const x = i / 1024 * 380, y = 110 - this.td[i] * 100; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke(); g.strokeStyle = '#332'; g.strokeRect(0, 10, 380, 200);
    // spectrum (log f)
    g.fillStyle = '#e0b04a';
    const sr = audio.ctx.sampleRate;
    for (let x = 0; x < 380; x++) { const f = 30 * Math.pow(18000 / 30, x / 380), k = Math.round(f / (sr / 2) * 2048), v = Math.max(0, (this.fd[k] + 110) / 100); g.fillRect(400 + x, 210 - v * 200, 1, v * 200); }
    // L/R meters
    const lvl = (an, buf) => { an.getFloatTimeDomainData(buf); let pk = 0, s = 0; for (const v of buf) { pk = Math.max(pk, Math.abs(v)); s += v * v; } return [20 * Math.log10(pk || 1e-9), 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-9)]; };
    [[this.l, this.cl], [this.r, this.cr]].forEach(([an, b], i) => {
      const [pk, rms] = lvl(an, b); this.hold[i] = Math.max(pk, this.hold[i] - 0.4); this.peakMax = Math.max(this.peakMax, pk);
      const X = 800 + i * 40, y = (d) => 10 + (Math.max(-60, Math.min(0, -d)) / 60) * -200 * -1;
      const hh = (d) => Math.max(0, (d + 60) / 60) * 200;
      g.fillStyle = '#243'; g.fillRect(X, 10, 30, 200);
      g.fillStyle = '#4c8'; g.fillRect(X, 210 - hh(rms), 30, hh(rms));
      g.fillStyle = pk > -1 ? '#f44' : '#cfa'; g.fillRect(X, 210 - hh(this.hold[i]), 30, 2);
    });
    g.fillStyle = '#aaa'; g.font = '11px monospace';
    g.fillText(`peak max ${this.peakMax.toFixed(1)} dBFS · limiter GR ${audio.lim.reduction.toFixed(1)} dB · voices ${audio.voices.length}`, 404, 22);
    if (audio.mu) {
      const s = audio.mu.stats;
      schedPre.textContent = `current: ${audio.currentMusic}\ntracks: ${audio.mu.tracks.map((t) => t.name + (t.stopping ? '(fading)' : '')).join(', ')}\nbars ${s.bars} · skipped ${s.skipped} · min lead ${isFinite(s.minLead) ? s.minLead.toFixed(3) : '-'} s · horizon ${s.horizon.toFixed(2)} s · max timer gap ${s.maxTimerGap.toFixed(3)} s`;
    }
  },
};

// ---------------------------------------------------------------- SFX
right.append(el('h2', {}, 'Sound effects'));
const vary = el('input', { type: 'checkbox', checked: '' });
right.append(el('div', { class: 'row' }, vary, el('span', {}, 'random rate ±6% (pitch variation)')));
for (const [cat, names] of Object.entries(CATEGORIES)) {
  const row = el('div', {}, el('span', { class: 'muted', style: 'display:inline-block;width:90px' }, cat));
  for (const n of names) row.append(el('button', { onclick: () => { start(); audio.play(n, { pos: use3d.checked ? pad.world() : undefined, rate: vary.checked ? 0.94 + Math.random() * 0.12 : 1 }); } }, n));
  right.append(row);
}
right.append(el('div', {}, el('button', { onclick: () => stressLive(20) }, 'stress: 20 overlapping'), el('button', { onclick: () => hitchTest(20).then((r) => { schedPre.textContent = JSON.stringify(r, null, 1); }) }, 'hitch test (20 s, 400 ms stalls)')));

// ---------------------------------------------------------------- offline analysis
right.append(el('h2', {}, 'Offline render + analysis'));
const kind = el('select', {}, ...['sfx', 'music', 'ambience', 'loop'].map((k) => el('option', { value: k }, k)));
const nameSel = el('select');
const durIn = el('input', { type: 'number', value: '6', step: '1', min: '1', style: 'width:60px' });
const fillNames = () => { nameSel.innerHTML = ''; const list = { sfx: SOUND_NAMES, music: TRACK_NAMES, ambience: AMBIENCE_NAMES, loop: LOOP_NAMES }[kind.value]; for (const n of list) nameSel.append(el('option', { value: n }, n)); durIn.value = kind.value === 'music' ? '60' : kind.value === 'sfx' ? '6' : '12'; };
kind.addEventListener('change', fillNames); fillNames();
const out = el('pre', {}, 'render a sound to see peak / RMS / LUFS / DC / band energies');
const specHolder = el('div');
right.append(el('div', { class: 'row' }, kind, nameSel, el('span', {}, 'dur'), durIn,
  el('button', { onclick: () => doRender(false) }, 'Render + analyze'), el('button', { onclick: () => doRender(true) }, 'Render → WAV')), out, specHolder);
let lastBuf = null;
async function render(k, n, dur, o = {}) {
  if (k === 'sfx') return renderSound(n, { dur, ...o });
  if (k === 'music') return (await renderMusic(n, dur, o)).buf;
  if (k === 'ambience') return renderAmbience({ [n]: 1 }, dur, o);
  return renderLoop(n, dur, o);
}
async function doRender(wav) {
  out.textContent = 'rendering…';
  const t0 = performance.now();
  const buf = lastBuf = await render(kind.value, nameSel.value, +durIn.value);
  const a = analyze(buf);
  out.textContent = `${kind.value} "${nameSel.value}" rendered in ${(performance.now() - t0).toFixed(0)} ms\n` + JSON.stringify(a, null, 1);
  specHolder.innerHTML = ''; specHolder.append(spectrogram(buf, { w: 900, h: 300, title: nameSel.value }));
  if (wav) { const blob = new Blob([toWav(buf)], { type: 'audio/wav' }); const u = URL.createObjectURL(blob); const link = el('a', { href: u, download: `${nameSel.value}.wav` }); document.body.append(link); link.click(); link.remove(); }
}

// ---------------------------------------------------------------- tests
function stressLive(n = 20) {
  start();
  const names = ['hitFlesh', 'hitArmor', 'crit', 'swing', 'swingHeavy', 'fireImpact', 'frostImpact', 'thunderClap', 'holySmite', 'parry', 'block', 'arcaneMissile', 'nova', 'execute', 'charge', 'bowShot', 'arrowHit', 'whirlwind', 'eruption', 'wolfGrowl'];
  for (let i = 0; i < n; i++) audio.play(names[i % names.length], { pos: { x: audio.L.x + (Math.random() - 0.5) * 10, y: 0, z: audio.L.z - 2 - Math.random() * 6 } });
}
// Realtime: run a track and stall the main thread periodically; the scheduler must never skip or go late.
async function hitchTest(seconds = 20, { track = 'raid', stall = 400, every = 2000 } = {}) {
  start(); audio.music(track, { fade: 0.5 });
  const mu = audio._mus(); const s0 = { ...mu.stats };
  const t0 = performance.now(); let stalls = 0;
  await new Promise((res) => {
    const iv = setInterval(() => {
      const t = performance.now(); while (performance.now() - t < stall) { /* busy: simulated hitch */ } stalls++;
      if (performance.now() - t0 > seconds * 1000) { clearInterval(iv); res(); }
    }, every);
  });
  const s = mu.stats;
  return { track, seconds, stalls, stallMs: stall, barsScheduled: s.bars - s0.bars, skippedBars: s.skipped - s0.skipped, minLeadSec: +s.minLead.toFixed(3), horizon: +s.horizon.toFixed(2), maxTimerGap: +s.maxTimerGap.toFixed(3), ctxTime: +audio.ctx.currentTime.toFixed(2) };
}

// ---------------------------------------------------------------- automation API
const b64 = (ab) => { let s = ''; const u = new Uint8Array(ab); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const SFX_DUR = (n) => ({ dragonRoar: 8, legendary: 8, levelUp: 7, deathPlayer: 6.5, resurrect: 6, wolfHowl: 6, victory: 10, groundShake: 5.5, eruption: 5.5, fireImpact: 4.5, thunderClap: 4.5, achievement: 5, epicLoot: 5, questComplete: 4.5, raidWarning: 4.5 }[n] || 3.5);
window.__lab = {
  audio, SFX, SOUND_NAMES, LOOP_NAMES, TRACK_NAMES, AMBIENCE_NAMES, CATEGORIES,
  analyze, timeline, render, renderSound, renderMusic, renderAmbience, renderLoop, renderEvents,
  async sfxReport(names = SOUND_NAMES, o = {}) {
    const res = [];
    for (const n of names) { const buf = await renderSound(n, { dur: o.dur || SFX_DUR(n), raw: !!o.raw, seed: o.seed ?? 1 }); res.push({ name: n, ...analyze(buf) }); }
    return res;
  },
  async spec(k, n, dur, o = {}) { const buf = await render(k, n, dur, o); return spectrogram(buf, { w: o.w || 1200, h: o.h || 360, title: n, fmax: o.fmax || 16000 }).toDataURL('image/png'); },
  async wav(k, n, dur, o = {}) { return b64(toWav(await render(k, n, dur, o))); },
  async music(n, seconds, o = {}) {
    const t0 = performance.now();
    const r = await renderMusic(n, seconds, o);
    const res = { name: n, seconds, renderMs: Math.round(performance.now() - t0), stats: r.stats, analysis: analyze(r.buf), tl: timeline(r.buf, o.win || 5), notes: r.log.length };
    if (o.png) res.png = spectrogram(r.buf, { w: o.w || 1600, h: o.h || 380, title: n, fmax: 12000 }).toDataURL('image/png');
    if (o.log) res.log = r.log;
    if (o.wav) res.wav = b64(toWav(r.buf));
    return res;
  },
  async stressOffline(n = 20, o = {}) {
    const names = ['hitFlesh', 'hitArmor', 'crit', 'swing', 'swingHeavy', 'fireImpact', 'frostImpact', 'thunderClap', 'holySmite', 'parry', 'block', 'arcaneMissile', 'nova', 'execute', 'charge', 'bowShot', 'arrowHit', 'whirlwind', 'eruption', 'levelUp', 'dragonRoar', 'legendary'];
    const ev = []; for (let i = 0; i < n; i++) ev.push({ name: names[i % names.length], t: o.spread ? i * o.spread : 0, opts: { pos: { x: (i % 5) - 2, y: 0, z: -1 - (i % 3) } } });
    const { buf, audio: a } = await renderEvents(ev, o.dur || 6, { setup: o.music ? async (au) => au.music('raid', { fade: 0.01 }) : null });
    return { n, ...analyze(buf), maxVoices: a.stats.maxVoices, stolen: a.stats.stolen, dropped: a.stats.dropped };
  },
  initTiming() {
    const a = new Audio(); const t0 = performance.now(); a.init(); const ms = performance.now() - t0;
    const r = { initMs: +ms.toFixed(1), statsInitMs: +a.stats.initMs.toFixed(1), sr: a.ctx.sampleRate, state: a.ctx.state };
    const t1 = performance.now(); a.music('vale'); a.ambience({ birds: 1, wind: 0.5 }); r.firstMusicMs = +(performance.now() - t1).toFixed(1);
    const t2 = performance.now(); for (const n of SOUND_NAMES) a.play(n); r.allSfxPlayMs = +(performance.now() - t2).toFixed(1);
    setTimeout(() => a.dispose(), 500);
    return r;
  },
  hitchTest,
  // per-instrument stems of a track: loudness + band balance of each instrument alone (same seed → same notes)
  async stems(name, seconds = 40, o = {}) {
    const probe = new Audio(); const oac = new OfflineAudioContext(2, 4800, 48000); probe.init({ context: oac });
    const { TRACKS } = await import('../audio/music.js'); const tr = TRACKS[name].make(probe._mus(), name, 0, o.seed ?? 7);
    const names = Object.keys(tr.inst); const res = { mix: null, stems: {} };
    const full = await renderMusic(name, seconds, { seed: o.seed ?? 7, log: false });
    const fa = analyze(full.buf), pm = blockPower(full.buf); res.mix = { lufs: fa.lufs, peak: fa.peakDb, bands: fa.bands };
    for (const n of names) {
      const r = await renderMusic(name, seconds, { seed: o.seed ?? 7, log: false, solo: [n] });
      const a = analyze(r.buf), ps = blockPower(r.buf), mx = Math.max(...ps);
      // relative level while the stem is actually playing (blocks within 20 dB of its loudest block)
      let es = 0, em = 0, k = 0; ps.forEach((p, i) => { if (p > mx * 0.01) { es += p; em += pm[i]; k++; } });
      const rel = k ? 10 * Math.log10(es / em) : -200;
      res.stems[n] = { lufs: a.lufs, rel: +rel.toFixed(1), active: +(k / ps.length).toFixed(2), peak: a.peakDb, bands: Object.values(a.bands).join('/') };
    }
    return res;
  },
  // Scripted session: every music transition type + SFX/duck over it. Returns 1 s loudness timeline + events.
  async scenario(o = {}) {
    const ev = [];
    const A = (t, label, fn) => ({ t, fn: (a) => { ev.push([t, label, a.currentMusic]); fn(a); } });
    const actions = [
      A(0.1, 'music login', (a) => a.music('login', { fade: 2 })),
      A(20, 'music vale (3 s xfade)', (a) => { a.music('vale'); a.ambience({ birds: 0.8, wind: 0.3 }); }),
      A(40, 'music village', (a) => { a.music('village'); a.ambience({ birds: 0, wind: 0, tavern: 0.8, fire: 0.5 }); }),
      A(55, 'music danger', (a) => { a.music('danger', { fade: 2 }); a.ambience({ tavern: 0, fire: 0, wind: 0.4 }); }),
      A(70, 'music raid', (a) => { a.music('raid', { fade: 1.5 }); a.ambience({ wind: 0, cave: 0.4, lava: 0.7 }); }),
      A(82, 'dragonRoar + duck', (a) => { a.play('dragonRoar', { pos: { x: 0, y: 0, z: -25 } }); a.duck(0.6, 3.5); }),
      A(88, 'combat burst', (a) => { for (let i = 0; i < 12; i++) a.play(['hitFlesh', 'crit', 'swing', 'fireImpact', 'hitArmor', 'arcaneMissile'][i % 6], { pos: { x: i % 3 - 1, y: 0, z: -2 }, delay: i * 0.12 }); }),
      A(95, 'raidP2', (a) => a.music('raidP2')),
      A(115, 'raidP3', (a) => a.music('raidP3')),
      A(130, 'victory → vale', (a) => { a.music('victory', { fade: 0.8, then: 'vale' }); a.ambience({ cave: 0, lava: 0 }); a.play('legendary'); }),
      A(160, 'overlay wipe stinger', (a) => a.stinger('wipe')),
      A(175, 'music(null)', (a) => a.music(null, { fade: 3 })),
    ];
    const r = await renderMusic(null, o.seconds || 185, { seed: 11, log: false, actions });
    const tl = timeline(r.buf, 1);
    return { events: ev, stats: r.stats, peak: analyze(r.buf).peakDb, clip: analyze(r.buf).clip, tl: tl.map((x) => x.m) };
  },
  // Harmony sanity: seconds per minute where a melody note overlaps (>0.2 s) a sustained harmony note a semitone
  // (or major 7th / minor 9th) away. Passing tones are normal; large values indicate chord/melody mismatch.
  async clashes(name, seconds = 120, o = {}) {
    const MEL = ['flute', 'oboe', 'clar', 'vln', 'horn', 'rec', 'lute2', 'fid', 'tbn'], HAR = ['str', 'choir', 'pad', 'low', 'drone'];
    const r = await renderMusic(name, seconds, { seed: o.seed ?? 7, log: true });
    const mel = r.log.filter((e) => MEL.includes(e[1])), har = r.log.filter((e) => HAR.includes(e[1]));
    let clash = 0, melSec = 0; const worst = [];
    for (const [, mi, mt, mm, md] of mel) {
      melSec += md;
      for (const [, hi, ht, hm, hd] of har) {
        const ov = Math.min(mt + md, ht + hd) - Math.max(mt, ht);
        if (ov < 0.2) continue;
        const ic = ((mm - hm) % 12 + 12) % 12;
        if (ic === 1 || ic === 11) { clash += ov; if (worst.length < 12) worst.push([+mt.toFixed(1), mi, mm, hi, hm, +ov.toFixed(2)]); }
      }
    }
    return { name, melodySeconds: +melSec.toFixed(1), clashSeconds: +clash.toFixed(2), clashPerMelodyMinute: +(clash / Math.max(1, melSec) * 60).toFixed(2), worst };
  },
  // 3D checks: L/R balance (dB, + = right louder) and loudness vs listener yaw / distance.
  async spatialCheck() {
    const lr = (b) => { let l = 0, r = 0; const L = b.getChannelData(0), R = b.getChannelData(1); for (let i = 0; i < L.length; i++) { l += L[i] * L[i]; r += R[i] * R[i]; } return +(10 * Math.log10(r / l)).toFixed(1); };
    const one = async (pos, yaw = 0, name = 'hitFlesh') => {
      const { buf, audio: a } = await renderEvents([], 1.2, { setup: (au) => { au.setListener({ x: 0, y: 0, z: 0 }, yaw); au.play(name, { pos }); } });
      const an = analyze(buf); return { lr: lr(buf), mMax: an.mMax, culled: a.stats.culled };
    };
    return {
      eastYaw0: await one({ x: 8, y: 0, z: 0 }), westYaw0: await one({ x: -8, y: 0, z: 0 }),
      northYaw0_front: await one({ x: 0, y: 0, z: -8 }), eastFacingEast: await one({ x: 8, y: 0, z: 0 }, -Math.PI / 2),
      eastFacingWest: await one({ x: 8, y: 0, z: 0 }, Math.PI / 2),
      d3: await one({ x: 0, y: 0, z: -3 }), d10: await one({ x: 0, y: 0, z: -10 }), d25: await one({ x: 0, y: 0, z: -25 }), d44: await one({ x: 0, y: 0, z: -44 }), d60culled: await one({ x: 0, y: 0, z: -60 }),
    };
  },
  // Loop seam check: 2nd-difference at the wrap point relative to the buffer's typical 2nd-difference RMS
  // (a click at the seam would be >> 5; smooth continuation ≈ 0–3).
  async loopSeams() {
    const oac = new OfflineAudioContext(2, 4800, 48000), a = new Audio(); a.init({ context: oac });
    const out = [];
    for (const n of LOOP_NAMES) {
      const b = await a.bake(n), res = { n, dur: +b.duration.toFixed(2) };
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c), N = d.length;
        let s = 0; for (let i = 2; i < N; i++) { const dd = d[i] - 2 * d[i - 1] + d[i - 2]; s += dd * dd; }
        const rms2 = Math.sqrt(s / (N - 2)) || 1e-12;
        const seam = Math.max(Math.abs(d[N - 2] - 2 * d[N - 1] + d[0]), Math.abs(d[N - 1] - 2 * d[0] + d[1]));
        res['seam' + c] = +(seam / rms2).toFixed(2);
      }
      out.push(res);
    }
    return out;
  },
  // piano roll of the notes a track schedules (from the scheduler log): x = time, y = pitch, colour = instrument
  async roll(name, seconds = 60, o = {}) {
    const r = await renderMusic(name, seconds, { seed: o.seed ?? 7, log: true, actions: o.actions || [] });
    const W = o.w || 1600, H = o.h || 520, lo = 24, hi = 100, from = o.from || 0, to = o.to || seconds;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H + 40; const g = cv.getContext('2d');
    g.fillStyle = '#0b0a0e'; g.fillRect(0, 0, W, H + 40);
    const X = (t) => (t - from) / (to - from) * W, Y = (m) => H - (m - lo) / (hi - lo) * H;
    for (let m = lo; m <= hi; m++) if (m % 12 === 0) { g.fillStyle = '#222'; g.fillRect(0, Y(m), W, 1); g.fillStyle = '#555'; g.font = '10px monospace'; g.fillText('C' + (m / 12 - 1), 2, Y(m) - 2); }
    for (let s = Math.ceil(from); s < to; s += 5) { g.fillStyle = '#1a1a1a'; g.fillRect(X(s), 0, 1, H); }
    const insts = [...new Set(r.log.map((e) => e[1]))];
    const col = (i) => `hsl(${(i * 137) % 360} 70% 60%)`;
    for (const [, inst, t, m, d, v] of r.log) {
      if (t + d < from || t > to) continue;
      g.fillStyle = col(insts.indexOf(inst)); g.globalAlpha = 0.35 + 0.65 * Math.min(1, v * 1.4);
      g.fillRect(X(t), Y(m) - 2, Math.max(2, X(t + d) - X(t)), 4);
    }
    g.globalAlpha = 1; g.font = '12px monospace';
    insts.forEach((n, i) => { g.fillStyle = col(i); g.fillText(n, 8 + i * 90, H + 28); });
    return cv.toDataURL('image/png');
  },
  // contact sheet of spectrograms: items [{ k, n, dur, o }]
  async sheet(items, { cols = 3, w = 520, h = 170 } = {}) {
    const rows = Math.ceil(items.length / cols), cv = document.createElement('canvas');
    cv.width = cols * (w + 6); cv.height = rows * (h + 76); const g = cv.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < items.length; i++) {
      const it = items[i], buf = await render(it.k || 'sfx', it.n, it.dur || SFX_DUR(it.n), it.o || {});
      g.drawImage(spectrogram(buf, { w, h, title: it.n, fmax: it.fmax || 16000 }), (i % cols) * (w + 6), Math.floor(i / cols) * (h + 76));
    }
    return cv.toDataURL('image/png');
  },
};
