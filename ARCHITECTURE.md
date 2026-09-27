# Everdawn — architecture & conventions (read before writing code)

Plain ES modules under `src/`, bundled by esbuild into ONE self-contained HTML file. three.js r186 (`import * as THREE from 'three'`,
addons via `three/addons/...`). No other runtime dependencies. No external assets: every model, texture, sound and icon is
generated in code at load time. Keep load-time cost small (target: whole boot < 4 s on an M1; your module's init < 300 ms).

## Build / test
- `node build.mjs` → `dist/index.html` (the game). Do not edit build.mjs, src/main.js, or files you do not own.
- Lab pages for isolated work: create `src/lab/<yourname>.js`, build with `node tools/lab.mjs src/lab/<yourname>.js`
  → `dist/lab/<yourname>.html`. A static server is already running: `http://localhost:5199/lab/<yourname>.html`
  (if not: `node tools/serve.mjs dist 5199 &`).
- Screenshot (headless Chrome, real GPU): `node tools/shot.mjs <url> <out.png> [--w=1600] [--h=900] [--wait=3000] [--evalAfter="js expr"]`
  then look at the PNG with the Read tool. Console output of the page is printed. Put screenshots in the scratchpad dir
  (`source tools/env.sh` sets `$SP`). Iterate visually — do not stop at the first version that renders.

## World conventions
- Metres, Y up. +X east, +Z south (north = -Z). Ground height from the game (not your concern in labs: use y = 0).
- **Every model faces -Z in its local space.** The game sets `root.rotation.y = facing`, where the forward vector is
  `(-sin(facing), 0, -cos(facing))`.
- Scale reference: a human is ~1.85 m tall (WoW-chunky proportions: big hands/feet/shoulders, heads ~1/6.5 of height).
- Colours in vertex buffers are LINEAR (use `linColor(hex)` from `src/engine/geom.js`). Materials take hex (auto sRGB→linear).

## Rendering conventions
- Lit meshes use `lambert(params, opts)` from `src/engine/materials.js` (MeshLambertMaterial + stylized wrap lighting,
  optional `spec`/`shine` for metal, `rim`, `trans` (foliage), height fog, ghost-world desaturation). Supports
  skinning, instancing, vertex colours, shadows. Use `opts.vertex/opts.fragment` string hooks for custom effects and
  set a unique `opts.key` for each distinct shader variant.
- Look target: World of Warcraft (hand-painted, saturated, chunky silhouettes, soft light). Vertex colours with baked
  gradients/AO are the main "paint". Avoid photoreal PBR.
- Scene lighting in labs: `HemisphereLight(0xbcd4f0, 0x5a6a3a, 1.2)` + a directional sun `(0xfff0d8, 3.0)` from
  roughly (0.5, 0.7, 0.35). The game renders HDR → bloom → tone map, so emissive values > 1 glow.
- Shared helpers: `src/engine/geom.js` (MeshBuilder merging with vertex colours + custom attributes, tube, blob, mat4),
  `src/engine/paint.js` (procedural painted textures), `src/core/noise.js` (RNG, Simplex, smoothstep, lerp...).
  Import them; do not modify them (ask the lead if you need a change).

## Character / creature contract (src/models/*)
```js
const c = createHumanoid(opts)   // or createCreature(type, opts), createDragon(opts)
c.root        // THREE.Object3D to add to the scene; game drives root.position / root.rotation.y
c.height      // metres, top of head (nameplates go above this)
c.radius      // collision radius
c.sockets     // { handR, handL, back, head, chest, mouth? } Object3Ds for attaching VFX/weapons
c.update(dt, state)
//   state = { speed (m/s, signed along facing), strafe (m/s, + = right), turn (rad/s), grounded, vy,
//             combat (weapon-ready stance), casting: null | 'directed' | 'omni' | 'channel', swimming, dead, sit }
c.play(action, { speed = 1 } = {})   // one-shot layered actions, see lists in the task briefs
c.setTint?(hex, amount)              // optional: flash (hit) / ghost
c.dispose()
```
Animations are procedural (pose functions of time) or generated AnimationClips — owner's choice — but must blend:
locomotion on the lower body while upper-body one-shots (attacks/casts) play. Deaths hold the last pose.

## FX / audio / UI owners
- `src/fx/*` — particles, projectiles, spell/impact effects, ground telegraphs, floating combat text is UI-side (DOM).
- `src/audio/*` — WebAudio synthesis only (no files). Must start after a user gesture.
- `src/ui/*` — DOM + CSS (`src/ui/*.css` is inlined automatically by the build). WoW-inspired but original art.

## IP
Original names and art only. No Blizzard names, logos, fonts or icons. Parody of MMO culture is fine.
