# EVERDAWN — The Last Server

> A single-player MMO in your browser. Every other player is an AI. The leaderboard is real.

**Play: https://alexmorrison12.github.io/everdawn/**

Everdawn was a 2004 fantasy MMO. The official servers closed years ago, but one realm, **Lastlight**, is still up,
and it is full of players who never log off. Every one of them is a bot running the habits of a 2006 player: they
quest, spam trade chat, dance on the mailbox, pull early and stand in fire. You are the only human online.

Level from 1 to 10 in Everdawn Vale, then join tonight's raid on the dragon of Ember Peak. The dragon changes every
day, and so does the global race to kill it.

## Features

- **A living fake server.** 34 SimPlayers with personalities (tryhards, trolls, roleplayers, dads, noobs, lurkers)
  who quest, group with you, invite you to their guild, kill-steal your wolves, dance when you dance, and fill
  General/Trade/LFG/LocalDefense with a few hundred lines of 2006-era chat. Some of them are a little too aware.
- **WoW-style combat.** Tab targeting, global cooldown, cast bars, crits, threat, procs, auras.
  - **Warrior:** Charge, Mortal Blow, Execute.
  - **Mage:** Fireball and Pyroblast, with a Hot Streak proc loop.
  - **Priest:** heals, shields and shadow damage; the raid lives or dies on your healing.
- **Everdawn Vale.** A hand-shaped valley with Dawnhollow village, farms and a windmill, Mirrormere Lake and its
  waterfall, kobold mine, spider hollow, bandit ruins, and a smoking volcano with lava rivers. It has a full
  day/night cycle.
- **Quests from level 1 to 10.** Nine quests with rare elites, loot in rarity colours, and gear upgrades.
- **The daily raid.** A 10-man, three-phase dragon fight with the SimPlayers:
  - Cleave, tail swipe, elemental breath, telegraphed hazards, Deep Breath flights, whelp waves, fear, and a
    berserk timer.
  - Five daily elements and four affixes.
  - A raid leader who explains the tactics, a ready check, a pull timer, and occasionally someone who
    doesn't wait for it.
- **Watch the Raid.** Spectate tonight's attempt from the title screen: the raid AI plays every slot and a director
  camera cuts between the tank, the breath, the whelps and the kill.
- **Play Together.** Host a world and share the six-letter room code; up to four friends join the same realm,
  quest with you as a party (shared kill credit), and take real raider slots against the dragon. Browsers connect
  directly (WebRTC); each player's character stays saved in their own browser.
- **Real competition.**
  - Daily boards for World First, Fastest Kill, Top DPS and HPS, and a Speedrun (character creation to kill).
  - Warcraft-Logs-style parse colours.
  - A share card and challenge links.
- **Fully procedural.** Every mesh, texture, animation, sound and song is generated in code at load time. There
  are no asset files; the game is a single HTML page.
- **Runs anywhere with WebGL2.** Keyboard and mouse on desktop, touch controls on phones and tablets, quality presets
  with dynamic resolution.

## Play together

1. Open the game and choose **Play Together → Host a World**, then enter the world as usual.
2. A badge at the top shows your room code. Click **Copy invite link** and send it to a friend (or just tell them the
   code).
3. Your friend opens the link (or chooses **Play Together → Join a Friend** and types the code), picks a character,
   and appears next to you.

The host's browser runs the realm: mobs, SimPlayers and the raid all live there, and friends see a live mirror of it.
When the host steps into the raid portal, friends come along as raiders; when the host leaves, everyone returns to the
Vale together. Type `/host` in chat to start hosting from inside the game.

The public PeerJS service only introduces the two browsers; after that they talk directly (or through PeerJS's free
relay when a router blocks direct connections). Nothing runs on your computer except the game. Multiplayer doesn't
work inside the Claude artifact view, whose sandbox blocks peer connections; use the web link above.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move / turn |
| Q / E | Strafe |
| Right mouse drag | Steer (camera and character) |
| Left mouse drag | Look around |
| Both mouse buttons | Run forward |
| Space | Jump |
| 1 – = | Action bar |
| Tab | Target the nearest enemy |
| Right-click | Attack / talk / loot |
| Enter | Chat (`/dance`, `/wave`, `/invite name`, `/who`, `/roll`…) |
| M, C, B, H | Map, character, bags, help |

On phones and tablets (landscape), drag the left side of the screen to move and drag anywhere else to look around.
Pinch to zoom. Tap a unit to target it, and tap it again to talk, loot or attack. The action bar and a Jump button
are on screen.

## Build

```bash
npm install
node build.mjs --min
```

This writes `dist/index.html`, a single self-contained file (about 1.9 MB, 600 KB gzipped). `node build.mjs --watch`
rebuilds on change, and `node tools/serve.mjs dist 5199` serves it on localhost.

`node tools/e2e.mjs` plays the whole loop in headless Chrome, from character creation through the raid kill, and
reports console errors. `node tools/mobile.mjs` checks the touch controls on an emulated phone. `node tools/coop.mjs`
opens two browsers, hosts and joins over real WebRTC, and checks shared combat, chat and kill credit (`--raid` runs
the dragon together).

The global leaderboard is optional. Apply `supabase/schema.sql` to a Supabase project, then fill in `SUPABASE_URL`,
`SUPABASE_KEY` (the publishable key) and `PUBLIC_URL` in `src/meta/remote.js`. Without them the boards are local to
the browser. `.github/workflows/pages.yml` publishes the build to GitHub Pages on every push to `main`.

## Tech

three.js r186, WebGL2, esbuild. No other runtime dependencies.

| Area | Where |
|---|---|
| Terrain, sky, water, grass, forests, village kit, raid lair | `src/world/` |
| Characters, creatures, the dragon (SDF-sculpted, skinned, procedurally animated) | `src/models/` |
| Combat, AI, SimPlayers, chat, quests, loot, raid encounter | `src/game/` |
| Particles, spells, telegraphs, breath | `src/fx/` |
| WebAudio synth music and SFX | `src/audio/` |
| HUD, screens, icons, share card | `src/ui/` |
| Co-op: WebRTC transport, host snapshots, guest mirror, mirrored raid | `src/net/` |

Built with [Claude Code](https://claude.com/claude-code).
