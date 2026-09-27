# EVERDAWN UI — `src/ui/`

WoW-grade interface for Everdawn: DOM + CSS + canvas-painted art, no images or frameworks. The **game owns all
state** and pushes plain data into components; the UI renders it, diffs every write, and reports player intent back
through events. Everything lives under one root element (`.evd`) layered over the three.js canvas.

```js
import { UI, iconURL, renderShareCard } from './ui/ui.js';

const ui = new UI({ getItem: id => ITEMS[id], player: { name: 'Aldric', cls: 'mage', race: 'human' } });
ui.on('action', slot => game.useActionSlot(slot));
ui.on('target', unitId => game.targetById(unitId));
ui.on('chat', (channel, text, whisperTarget) => game.say(channel, text, whisperTarget));
ui.on('typing', on => { input.typing = on; });          // stop WASD while the chat box is open

function frame(dt) {
  ui.player.set(game.player);                            // raw game Unit objects are accepted (see "Adapters")
  ui.target.set(game.player.target);
  ui.nameplates.update(visibleUnitsWithScreenXY);
  ui.update(dt);                                         // once per frame, after your pushes
}
```

* Files: `ui.js` (entry, `class UI`), components (`frames.js`, `raid.js`, `actionbar.js`, `castbar.js`, `auras.js`,
  `minimap.js`, `chat.js`, `tooltip.js`, `fct.js`, `nameplates.js`, `alerts.js`, `bosstimers.js`, `dialogs.js`,
  `panels.js`, `screens.js`, `sharecard.js`), art (`icons.js`, `art.js`), helpers (`util.js`, `adapt.js`),
  styles `a-base.css … f-screens.css` (inlined automatically by the build, all selectors prefixed `evd-`).
* Fonts: `Cinzel` (headers, numbers) and `Roboto Condensed` (body). `new UI()` injects the Google Fonts link if the
  page lacks it. `ui.fontsReady` is a Promise (resolves when both are loaded, or after 3 s).
* Init cost: ≈ 90 ms for `new UI()` (HUD-critical art only). Stone/parchment/heavy-frame textures are generated in
  idle time (or on the first window/screen open); login/creation/results imagery on first show (~60 ms once). Icons
  are painted lazily on first use (~1.3 ms each, cached).

---------------------------------------------------------------------------------------------------------------------

## 1. Core

### `new UI(opts)`
| opt | default | meaning |
|---|---|---|
| `parent` | `document.body` | where the `.evd` root is appended |
| `hotkeys` | `true` | UI handles Enter / `/` (chat), `C` `B` `M` `H` `N` (panels), `Esc` (close topmost window, else emits `escape`) |
| `actionKeys` | `false` | if `true`, keys `1 2 … 9 0 - =` also emit `action` (the press-flash always plays) |
| `getItem(id)` | – | resolver for `{item:ID}` tokens in chat |
| `randomName(state)` | built-in syllable generator | used by the character-creation dice |
| `player` | – | `{ name, cls, race }` for `$N` / `$C` / `$R` substitution in quest text (also settable as `ui.playerInfo`) |
| `uiScale` | `1` | user scale multiplier (Settings → UI Scale also sets it) |

### Frame + scaling
* `ui.update(dt)` — call **once per frame** (seconds). Drives cooldown/aura text, cast timers, FCT motion, boss timers,
  popup countdowns, chat fade, typewriter text. Internal clock = `ui.now` (sum of `dt`, capped at 0.25 per call). All
  timers in the API are *remaining seconds*; the UI converts them to end times on `ui.now`, so re-sending the same
  timer every frame is cheap and never restarts animations (tolerance ≈ 0.1 s).
* Virtual resolution: every HUD layer renders in a **virtual 1080p space** scaled by `ui.scale`
  (`clamp(innerHeight / 1080, 0.8, 2.5) × uiScale`, never narrower than 1360 virtual px). 1280×720 → scale 0.8 (virtual
  1600×900, "narrow" layout lifts the chat above the bar), 1920×1080 → 1, 2560×1440 → 1.33. World-space layers
  (nameplates, FCT) take **raw screen CSS pixels** from the game and apply the scale themselves.
* `ui.setScale(multiplier)`, `ui.setHUDVisible(bool)`, `ui.screen('login'|'create'|'results'|'loading'|null)` (shows one
  screen and hides the HUD while any screen is open), `ui.toggle('character'|'bags'|'map'|'help'|'settings'|'meter')`,
  `ui.closeTop()`, `ui.dispose()`.
* Layers (bottom → top): world (nameplates, FCT) · death overlay · HUD · centre messages · windows · screens ·
  modal (settings) · tooltip.
* Pointer events: the root is `pointer-events:none`; only interactive elements (buttons, slots, frames, chat lines,
  windows) receive the mouse, so camera drags pass through everywhere else. The chat body and windows do capture the
  mouse (like WoW).
* `ui.typing` is `true` while the chat input is focused; the game's `Input` already ignores keys whose target is an
  `<input>` (the chat input also stops propagation), but you can mirror it: `ui.on('typing', on => input.typing = on)`.
* While a full-screen screen (login/create/results/loading) is open the UI ignores gameplay hotkeys.

### Events — `ui.on(name, fn)` → unsubscribe fn · `ui.off(name, fn)` · `ui.emit(name, …args)`
| event | args | when |
|---|---|---|
| `action` | `slot (0..11)` | action button clicked (or key pressed with `actionKeys:true`) |
| `target` | `unitId` | player/party/raid/ToT frame clicked (`'player'` for your own frame) |
| `targetMenu` | `unitId` | right-click on the target frame |
| `cancelAura` | `auraId` | right-click on one of your buffs |
| `chat` | `channel, text, whisperTarget` | chat line submitted (`say yell party raid raidWarning guild officer general trade lfg emote whisperOut`). The UI does **not** echo; call `ui.chat.add` |
| `command` | `cmd, argString, raw` | any other `/command` (e.g. `/dance`, `/roll`, `/invite Bob`) |
| `typing` | `bool` | chat input opened/closed |
| `playerClick` | `name` | clicked a `[Player]` name in chat |
| `itemClick` / `linkItem` | `item` | clicked an `[Item Link]` / shift-clicked a bag item |
| `useItem` | `index, item` | right-click a bag slot |
| `unequip` | `slotId, item` | right-click a paper-doll slot |
| `loot` | `index, entry` | loot row clicked |
| `roll` | `rollId, 'need'|'greed'|'pass'` | roll button (or auto-pass on timeout) |
| `questAccept` / `questComplete` | `quest` / `quest, choiceIndex` | quest dialog buttons |
| `gossip` | `option` | gossip option clicked |
| `questClick` | `questId` | quest title in the tracker clicked |
| `releaseSpirit` | – | death overlay button |
| `micro` | `id` | micro-menu button (`character bags spellbook quests map meter help settings`); panels toggle themselves, `spellbook`/`quests` also emit `open` |
| `open` | `'spellbook'|'quests'` | micro buttons with no built-in window |
| `panel` | `id, open` | a window opened/closed (`character bags map help settings quest loot`) — e.g. start/stop rendering the paper-doll model |
| `minimapClick` / `minimapZoom` / `minimapTracking` / `minimapMail` | `u, v` / `±1` / – / – | minimap interactions |
| `mapClick` | `u, v` (0..1) | world map clicked |
| `meterMode` | `'damage'|'healing'` | meter tab switched |
| `settings` | `settings` | any settings control changed (full object) |
| `escape` | – | Esc with no window open (clear target / game menu) |
| `resize` | `scale` | viewport or UI scale changed |
| `login:enter` `login:raid` `login:leaderboard` `login:settings` `login:leaderboardTab(id)` `login:realm(name)` | | login screen |
| `create:change(state)` `create:submit(state)` `create:back` `create:randomName(name)` | | character creation |
| `results:share(data)` `results:challenge(data)` `results:queue(data)` `results:return(data)` | | results screen |

### Adapters (raw game objects accepted)
`adapt.js` lets frames, raid/party cells, nameplates and tooltips take the game's objects directly
(`src/game/unit.js`): `inCombat` → combat glow, `elite/rare/boss` → classification, `hostile/neutral/kind` → reaction
(`kind: 'player'|'sim'` = player), `raidRole` → role, `casting {spell, t, dur, channel}` → cast bar, and auras
`[{ id, def: {name, icon, debuff, dispel, bleed, school, hidden}, rem, dur, stacks, src }]` → aura icons (wrappers are
cached on the source objects: no per-frame allocation). Set `ui.me = playerUnit` so target debuffs you applied
(`aura.src === ui.me`) are drawn larger and levels on frames, nameplates and tooltips are coloured by difficulty
relative to `ui.me.level` when `playerLevel` isn't passed.

---------------------------------------------------------------------------------------------------------------------

## 2. Data shapes

```ts
Unit   { id, name, level: number | '??' | -1, cls?, race?, guild?, reaction?: 'hostile'|'neutral'|'friendly'|'player',
         classification?: 'normal'|'elite'|'rare'|'rareelite'|'boss', isPlayer?, hp, hpMax, power?, powerMax?,
         powerType?: 'mana'|'rage'|'energy'|'focus', dead?, ghost?, offline?, combat?, leader?, role?: 'tank'|'healer'|'dps',
         playerLevel? (colours the level by difficulty), creatureType?, portraitIcon? (icon id painted into the portrait
         when the game doesn't draw one), auras?, cast? }
Aura   { id, icon, name?, desc?, remaining?: s, duration?: s, stacks?, debuff?, type?: 'magic'|'curse'|'disease'|'poison'|'bleed', mine? }
Cast   { name, icon?, duration: s, elapsed = 0, interruptible = true, channel = false }
Item   { id?, name, icon, rarity: 'poor'|'common'|'uncommon'|'rare'|'epic'|'legendary' | 0..5, tint?, bind?: 'pickup'|'equip'|'use'|string,
         unique?, questItem?, slot?, type?, armor?, damage?: {min,max,speed}, dps?, stats?: [{stat, value}] | {Strength: 5},
         durability?: [cur,max], classes?, reqLevel?, itemLevel?, equip?: string[], use?: string|string[], chance?: string[],
         setName?, flavor?, sell?: copper, count? }
Spell  { name, icon, rank?, cost?: '95 Mana', range?: '35 yd range', castTime?: '3 sec cast'|'Instant', cooldown?: '8 sec cooldown', desc, reqLevel?, note? }
```
Colours: `RARITY`, `CLASS_COLORS`, `rarityColor(r)`, `classColor(cls)`, `parseColor(pct)` (WCL: grey <25, green <50,
blue <75, purple <95, orange <99, pink <100, gold =100) are exported from `ui.js`.

---------------------------------------------------------------------------------------------------------------------

## 3. HUD components

### Unit frames — `ui.player`, `ui.target`, `ui.tot`, `ui.party`
* `ui.player.set(unit)` — portrait, name (class colour), level badge (crossed swords in combat), health/power bars with
  values, red combat glow, damage "lag" chunk, hit flash, leader crown, rested `Zz` (`rested:true` out of combat),
  `dead`/`ghost` greying. `ui.player.portrait` is a 128×128 `<canvas>` for the game to draw into — e.g.
  `portraits.draw(unit, ui.player.portrait)` from `src/game/portrait.js` (redraw on change, not every frame).
  The player's own name stays gold unless `nameColor` is given.
* `ui.target.set(unit | null)` — name band coloured by reaction (class colour for friendly players, grey if
  `tapped:true`), level coloured by difficulty or a skull for bosses/`'??'`, **dragon-winged ornament** for
  `elite` (gold) / `rare` (silver) / `rareelite` / `boss` (gold + ruby), health % + values, power bar (hidden if
  `powerMax` is 0), `auras` (buffs row + debuffs row, yours bigger, dispel-type borders, swipes, stacks, timers),
  `cast` (or call `ui.target.setCast(cast|null)`): gold interruptible bar, grey + shield when `interruptible:false`,
  green when channelled. `ui.target.portrait` canvas.
* `ui.tot.set(unit | null)` — target-of-target mini frame (`portrait` 64×64).
* `ui.party.set(members[≤4])` — `{ …Unit, inRange, selected, debuff: dispelType (glowing border), auras }`,
  `ui.party.portrait(i)` → canvas.

### Raid frames — `ui.raid.set(members[≤20])`
Up to 4 groups × 5. Each `{ id, name, cls, role, group?: 1..4, hp, hpMax, power?, powerMax?, powerType?, dead?, ghost?,
offline?, inRange?, selected?, aggro?, debuff?: 'magic'|'curse'|'disease'|'poison', absorb? (hp shield), leader?,
marker?: raid marker id, auras? }`. Class-coloured bars, deficit text, role icons, dispel highlight pulse, aggro border,
selection outline, range fade, mana strip for mana users. Click → `target`. Empty list hides the frame.

### Action bar — `ui.actionBar`
* `setSlot(i, slot | null)` / `set([12 slots])`. Slot:
  `{ icon, name?, spell?: Spell (tooltip), keybind?, cd?: {remaining, duration}, gcd?: {remaining, duration},
     usable?: false (greyed), noResource?: true (blue tint), outOfRange?: true (red keybind + tint), proc?: true
     (burst + pulsing gold glow with marching ants), active?: true (gold "checked" border), count?: charges/stacks, offGCD? }`
* `gcd(duration, remaining = duration)` — GCD sweep on every slot without a longer cooldown.
* `press(i)` — press flash (also plays automatically on key `1…=`).
* Cooldowns: dark clockwise sweep with a bright edge (CSS-animated, no per-frame JS), OmniCC-style numbers
  (`12`, `2m`, red `2.4` under 3 s), a brightness pulse when ready. Painted end caps (winged dawn-sun crests).
* `ui.xpBar.set({ xp, xpMax, rested?, level?, max? })` — purple (blue when rested) with 20 segments, rested overlay +
  marker, hover text/tooltip. Hidden when `max:true`.
* `ui.micro` — micro menu (bottom-right); `ui.micro.setActive(id, bool)`.

### Cast bar — `ui.castBar` (player) · the target cast bar uses the same class
* `start({ name, icon, duration, elapsed = 0, channel = false, interruptible = true })` — safe to call every frame.
* `setElapsed(s)` (pushback) · `succeed()` (white flash, fade) · `interrupt(text = 'Interrupted')` / `fail(text)` (red) ·
  `stop(immediate = true)`. Non-channel casts auto-succeed when time runs out.

### Buffs — `ui.auras.set(buffs[], debuffs[])` (or one mixed list using `aura.debuff`)
Top-right, left of the minimap. Timers under icons (`5 m`, `43 s`), blink under 8 s, dispel-coloured debuff borders,
right-click a buff → `cancelAura`.

### Minimap — `ui.minimap`
`canvas` (256×256, game draws the map; shown as a 172 px circle inside a riveted bronze ring). `set({ zone, subzone?,
zoneType?: 'friendly'|'hostile'|'contested'|'sanctuary'|'neutral', time?: 'hh:mm'|Date, x?, y? (map %), mail?,
facing? (radians → player arrow), dayPhase? (0..1 → sun/moon dial) })`. Zoom ± buttons, tracking & mail buttons,
wheel zoom, click ping → events.

### Quest tracker — `ui.tracker.set([{ id, title, level?, complete?, objectives: [{ text, have?, need?, done? }] }])`
Right side. Titles gold with `!`/`?` marks, objectives with counters; counter increments flash, finished objectives
turn gold, finished quests get “(Complete)” and a glow. Collapsible.

### Chat — `ui.chat`
* `add({ ch, from?, fromCls?, text, items?, tab?, color? })` → line element. `ch` ∈ `say yell emote textEmote party
  partyLeader raid raidLeader raidWarning guild officer whisperIn whisperOut general trade lfg system loot money xp
  achievement npcSay npcYell bossEmote combat error`. `combat` goes to the Combat Log tab.
  Text tokens: `{0}`, `{1}` → `items[n]`; `{item:ID}` → `opts.getItem(ID)`; `{player:Name:cls}` → clickable name.
  Item links are rarity-coloured, show item tooltips on hover, click → `itemClick`.
* `system(text)`, `clear(tab?)`, `tab('general'|'combat')`, `open(prefill?)`, `close()`, `setChannel(ch, whisperTarget?)`.
* Input: Enter opens, Enter sends, Esc cancels, ↑/↓ history. Sticky channels switch the header like WoW (`/p `,
  `/g `, `/raid `, `/1 `, `/w Name `, `/r `). Idle lines fade after 45 s and return on hover; the background only
  shows while hovering/typing. 200 lines per tab.

### Tooltips — `ui.tooltip`
Hovering any element with tooltip data works automatically (slots, auras, links, frames, …). Manual:
`showItem(item, at?)`, `showUnit(unit, at?)`, `showSpell(spell, at?)`, `showText(title, lines, at?)`, `show(data)`
(default anchor bottom-right, WoW style), `showAt(screenX, screenY, data)`, `showFor(element, data)`, `hide()`.
`at` = element or `{x, y}`. `data` = `{ type: 'item', item, playerLevel? } | { type: 'unit', unit } | { type: 'spell', spell }
| { type: 'aura', aura, remaining } | { type: 'text', title, lines: [string | { text, color?, right?, rightColor? }] }`.
Item tooltips: name in rarity colour, binds, unique, slot/type, damage/speed/DPS, armor, `+5 Strength` stats,
durability, classes, red requirement when too low, green `Equip:`/`Use:`/`Chance on hit:`, set name, gold flavour
text in quotes, sell price with coin icons, icon to the left.
To attach tooltips to your own DOM: `el._tip = () => data` (and give it `pointer-events:auto`).

### Floating combat text — `ui.fct`
* `anchor(id, x, y, visible = true)` — screen CSS px above a unit's head; call every frame for units that have text.
* `add({ anchor?, x?, y?, amount?, text?, type, school?, crit?, color? })`. `type`: `damage` (white), `spell`
  (school colour), `heal` (green `+`), `miss` (`text: 'Miss'|'Dodge'|'Parry'|'Immune'|'Resist'|'Absorb'`), `incoming`
  (red `-`, on the player), `xp` (`+120 XP`), `rep`, `honor`, `absorb`, `text`. `crit:true` → big pop + `!`.
  Schools: `physical holy fire nature frost shadow arcane`. Numbers on the same anchor fan out in lanes and push older
  ones upward (fountain), so bursts never overlap. Pooled (90 nodes); transforms/opacity only.
* `clear()`.

### Nameplates — `ui.nameplates`
`begin()`, `set(plate)` per visible unit, `end()` (hides the rest) — or `update([plates])`. Plate:
`{ id, x, y (screen px of the anchor above the head), scale = 1, visible = true, depth? (sort: closer on top), name,
guild?, level, playerLevel?, reaction, isPlayer?, cls?, hp, hpMax, showHealth? (default: hostile/neutral, damaged or
targeted), target?, dim? (non-target fade), marker?: 'star'|'circle'|'diamond'|'triangle'|'moon'|'square'|'cross'|'skull',
quest?: 'available'|'complete'|'incomplete'|'daily'|'low', classification?, cast?: { name, icon, progress | elapsed +
duration, interruptible, channel }, dead? }`. Target gets a white-gold glow + bobbing arrow; elites a dragon-wing glyph;
quest givers a bobbing gold `!`/`?`. Pooled, keyed by id; position writes are quantised to 0.5 px.

### Centre messages — `ui.alerts`
`zone(name, sub?, type?, pvpLine?)` (big metallic area text) · `error(text)` (red, de-duplicated) · `info(text)`
(yellow) · `raidWarning(text, color?)` (pulsing orange) · `emote(text)` (boss emote) · `countdown(n)` ·
`levelUp(level, { abilities: [{name, icon}], stats: ['+2 Stamina'] })` · `achievement({ name, desc?, points?, icon? })`.

### Boss timers — `ui.bossTimers` (DBM-style)
`start({ id, name, duration, remaining = duration, icon?, kind?: 'default'|'important'|'add'|'aoe'|'target'|'interrupt'|'phase'|'move', color?, countdown?: n, onEnd? })`
(re-`start` with the same id to refresh) · `cancel(id)` · `clear()`. Bars drain on the compositor; under 6 s they
jump to the large centre stack (red-shifted) and `countdown: 3` triggers big 3‑2‑1 numbers. `enlargeAt` is settable.

### Damage meter — `ui.meter` (Details!-style)
`set({ damage?: rows, healing?: rows, duration? (s), segment? })`, rows `{ name, cls, total, perSecond?, isPlayer? }`.
Sorted internally, class-coloured bars with icons, `total (per-second, %)`, your row always shown/outlined, DMG/HEAL
tabs (`meterMode` event), re-rendered at most 4×/s — pushing every frame is fine. `N` toggles it.

---------------------------------------------------------------------------------------------------------------------

## 4. Windows & dialogs

* **Popups** — `ui.popups.show({ id?, text (use **bold** for gold names), accept?, decline? (null = none), timeout?, icon?, onAccept, onDecline, onTimeout })` → `{ close() }`.
  Presets: `partyInvite(name, cb)`, `guildInvite(name, guild, cb)`, `duel(name, cb)`, `readyCheck(leader, cb, timeout = 30)`,
  `resurrect(name, cb, timeout = 60)`, `confirm(text, cb, accept?, decline?)`; `cb(accepted)`. Countdown bars; stack of 3.
* **Loot** — `ui.loot.open({ title?, icon?, x?, y?, entries: [{ item, count?, quest? } | { money: copper }], onLoot(i, entry), onClose, autoRemove = true })`,
  `remove(i)`, `close()`, `isOpen`.
* **Need / Greed / Pass** — `ui.rolls.add({ id, item, duration = 60, canNeed = true, onRoll(choice) })`, `choose(id, c)`,
  `result(id, { rolls: [{ name, cls, type, roll }], winner }, hold = 6)`, `remove(id)`. Unanswered rolls auto-pass.
* **Quest dialog** (parchment) — `ui.questDialog.open({ mode: 'offer'|'progress'|'complete'|'gossip', npc: { name, portraitIcon? }, title, text,
  progressText?, completeText?, objectivesText?, objectives?: [{ text, have, need }], rewards?: { items?: [{ item, count }], choice?: [{ item, count }], money?, xp? },
  options?: [{ label, type: 'questAvailable'|'questComplete'|'questIncomplete'|'gossip'|'vendor'|'bind'|…, id }], canComplete?,
  onAccept, onDecline, onComplete(choiceIndex), onContinue, onSelect(option), onClose })`, `close()`, `isOpen`. Typewriter text
  (click to finish), `$N/$C/$R` substitution, selectable reward choices, `pt` canvas (96×96) for an NPC portrait.
* **Death** — `ui.death.show({ onRelease, text?, sub?, releaseDelay?, button?, desaturate = true })`, `hide()`. Greys the world
  (backdrop filter) but keeps the UI in colour.
* **Character (C)** — `ui.character.set({ name, level, race, cls, guild?, slots: { head, neck, shoulder, back, chest, shirt, tabard, wrist, hands,
  waist, legs, feet, finger1, finger2, trinket1, trinket2, mainhand, offhand, ranged }: Item, statGroups: [{ title, stats: [{ label, value, color?, tip? }] }] })`.
  `modelCanvas` (512×512, transparent, letterboxed with `object-fit: contain`; e.g. `portraits.draw(unit, ui.character.modelCanvas, { full: true, transparent: true })`),
  or `modelRect()` (screen rect) to render into the main canvas.
* **Bags (B)** — `ui.bags.set({ slots: [{ item, count } | null], money, title? })`.
* **World map (M)** — `canvas` (1024×704, game-drawn), `setLabels([{ name, x, y (0..1), levels?, kind?: 'zone'|'town'|'poi'|'danger' }])`,
  `setPlayer(x, y, facing)`, `setMarkers([{ x, y, type: 'available'|'complete'|'incomplete'|'daily'|'boss'|'party', cls?, label? }])`.
* **Help (H)** — `ui.help.setBindings([{ title, rows: [['W,A,S,D', 'Move']] }])` (defaults provided).
* **Settings** — `ui.settings.open()`, `set(values)`, `get()`. Values: `{ master, music, sfx, ambience, voice (0..100), quality: 'low'|'medium'|'high'|'ultra',
  sensitivity (1..100), invertY, showFPS, uiScale (70..130), chatFade }`. Every change emits `settings`; `uiScale`,
  `showFPS` (FPS readout) and `chatFade` are applied by the UI itself.
All windows: `open()`, `close()`, `toggle()`, `isOpen`; Esc closes the topmost.

---------------------------------------------------------------------------------------------------------------------

## 5. Screens (full screen, hide the HUD while open)

* **Login** — `ui.login.set({ dragon: { name, element: 'ember'|'frost'|'venom'|'storm'|'shadow', affix, affixDesc?, worldFirst?: { name, cls, time } | null, resetIn? },
  leaderboard: { worldFirst, fastestKill, topParse, speedrun }: [{ rank, name, cls, value, parse?, isYou? }], population?, humans?, version? })`,
  `openRealms()`. Metallic EVERDAWN logo with a winged-sun crest, realm button + realm list (Lastlight + dead realms),
  Tonight's Dragon card, leaderboard with tabs and WCL parse colours. Leave the 3D scene rendering behind it.
* **Character creation** — `ui.create.update(partialState)`, `get()`, `setName(n)`, `setError(msg)`, `randomize()`.
  State `{ race: 'human'|'dwarf'|'orc'|'elf', sex: 'male'|'female', cls: 'warrior'|'mage'|'priest', appearance: { skin, face, hair, hairColor, beard }, name }`.
  Painted race/class emblems, locked SimPlayer-only classes, role chips, validation (`validateName`), random-name dice.
  The centre stays clear (and pointer-transparent) for the model; drag there to rotate it in the game.
* **Results** — `ui.results.set({ victory = true, bossName, dragon?, time, dps, hps?, parse, cls, name, rank?: { pos, of }, deaths?, worldFirst?, personalBest?, loot?: Item[] })`.
  Big parse ring in WCL colour, stats, flags, loot, buttons → `results:*` events.
* **Loading** — `ui.loading.set({ zone?, tip?, progress (0..1), stage? })` (matches the `#boot` style; painted landscape art).

`renderShareCard(data) → HTMLCanvasElement (1200×630)` — `{ name, cls, race?, level?, guild?, dragonName, element, affix?, parse,
time, dps?, hps?, rank?: { pos, of }, date?, portrait?: CanvasImageSource, worldFirst?, url? }`. Call after
`await ui.fontsReady`. Use `canvas.toBlob()` to share/download.

---------------------------------------------------------------------------------------------------------------------

## 6. Icons & art

* `iconURL(id, size = 64, opts?) → dataURL` (cached) · `iconCanvas(id, size, opts)` → canvas. `opts`: rarity string
  shorthand or `{ rarity, tint, glow, element }` (tint recolours armour/cloth/metal, epic/legendary add glow + rim,
  `element` for `dragon`). Unknown ids paint a red `?`.
* Ids — warrior: `valiantStrike charge rend thunderclap cleave victoryRush mortalBlow execute whirlwind battleShout` ·
  mage: `fireball frostbolt fireBlast frostNova blink flamestrike pyroblast arcaneMissiles iceBarrier` · priest: `smite
  flashHeal greaterHeal wordOfPain aegis renew mindSpike holyNova prayer` · generic: `attack hearthstone mount
  potionHealth potionMana food drink` · auras: `enrage fear fireBreath ghost poison stormPool web whelp` · items:
  `sword sword2h axe mace staff dagger bow shield helm shoulders chest robe gloves boots belt legs cloak ring trinket
  boarHaunch wolfPelt candle spiderSilk letter fishingNet junkFang junkHide coin gem dragonScale drakeReins redBandana
  bag map` · emblems: `raceHuman raceDwarf raceOrc raceElf classWarrior classMage classPriest classRogue classHunter
  classPaladin dragon unknownHelp`.
* `markerURL(type)` (8 raid markers), `questMarkURL(kind)`, `roleURL('tank'|'healer'|'dps')`, `glyphURL(name)`
  (`crown rested combat skull mail track close dice gear lock arrowL arrowR plus minus ready notready waiting need
  greed pass shield male female star`), `coinURL('gold'|'silver'|'copper')`.

---------------------------------------------------------------------------------------------------------------------

## 7. Wiring the game bus (suggested)

| bus event | UI call |
|---|---|
| `damage {src, dst, amount, crit, school, melee}` | `ui.fct.add({ anchor: dst.id, amount, crit, type: dst === me ? 'incoming' : melee ? 'damage' : 'spell', school })` |
| `heal {dst, amount, crit}` | `ui.fct.add({ anchor: dst.id, amount, crit, type: 'heal' })` |
| `miss {dst, kind}` | `ui.fct.add({ anchor: dst.id, text: 'Dodge', type: 'miss' })` |
| `xp {amount}` | `ui.fct.add({ anchor: me.id, text: '+' + amount + ' XP', type: 'xp' })`, `ui.chat.add({ ch: 'xp', text })` |
| `cast_start / cast_stop` (player) | `ui.castBar.start(...)` / `succeed()` · `interrupt()` |
| `error {msg}` | `ui.alerts.error(msg)` |
| `chat {ch, from, text}` | `ui.chat.add({ ch: map(ch), from, fromCls, text })` (`whisper`→`whisperIn`, `whisper_out`→`whisperOut`) |
| `level_up {level, learned}` | `ui.alerts.levelUp(level, { abilities })` |
| `quest_progress` | `ui.tracker.set(...)`, `ui.alerts.info('Timber Wolf slain: 3/6')` |
| `gossip / loot_open / popup` | `ui.questDialog.open(...)` / `ui.loot.open(...)` / `ui.popups.show(...)` |
| `raid_warning {text}` | `ui.alerts.raidWarning(text)` |
| `loot_item {item}` / `money` | `ui.chat.add({ ch: 'loot', text: 'You receive loot: {0}.', items: [item] })` |

---------------------------------------------------------------------------------------------------------------------

## 8. Performance notes
* Every setter is diffed (`util.js`: `setText`, `setCls`, `setFill`, `show`, …) — unchanged values cost a property
  compare and never touch style/layout. No layout reads in per-frame paths (the only reads are tooltip placement on
  hover and one `scrollHeight` per frame that received chat lines).
* Bars use `transform: scaleX` (compositor); cast bars, cooldown/GCD sweeps, boss timer drains and popup timers are CSS
  animations restarted by swapping keyframe names — JS only updates the countdown text when the string changes.
* FCT (90 pooled nodes) and nameplates (pooled by id) write only `transform`/`opacity` per frame.
* Pooled nodes that are idle are `display:none` (no idle compositor layers).
* Lab measurements (M-series, Chrome, `?perf=1`): questing HUD ≈ 0.36 ms/frame for all pushes + `ui.update`
  (`ui.update` alone ≈ 0.04 ms), ~19 DOM mutation records/frame; 20-man raid ≈ 1.2 ms including the lab's own data
  generation.
* Icons/textures: CPU-backed canvases (`willReadFrequently`) avoid GPU read-backs in `toDataURL` (≈1.3 ms/icon).

## 9. Lab
`node tools/lab.mjs src/lab/ui.js` → `http://localhost:5199/lab/ui.html?screen=…` with
`hud | raid | dialogs | panels | map | help | settings | death | login (&realms=1) | create | results (&parse=N) |
loading | share (&element=frost…) | icons (&size=&zoom=&rarity=) | art`, plus `&perf=1` (`window.__perf()`).
`window.ui` is exposed for poking at components from the console.
