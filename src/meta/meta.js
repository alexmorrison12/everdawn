// Persistence, parse percentiles, leaderboards (yours, friends' from co-op, the realm's SimPlayer raids, and the global
// board when one is configured via setRemote()), challenge links.
import { RNG } from '../core/noise.js';
import { NAME_PARTS, CURATED_NAMES, GUILDS } from '../game/data/chat.js';
const KEY = 'everdawn.v1';
const safe = (fn, fb) => { try { return fn(); } catch { return fb; } };

export const store = {
  load() { return safe(() => JSON.parse(localStorage.getItem(KEY) || 'null'), null) || { chars: {}, last: null, kills: [], settings: {} }; },
  save(data) { safe(() => localStorage.setItem(KEY, JSON.stringify(data))); },
};

export function serializeChar(g) {
  const p = g.player;
  return {
    name: p.name, race: p.race, sex: p.sex, cls: p.cls, appearance: p.appearance, level: p.level, xp: p.xp, gold: p.gold,
    equip: p.equip, bags: p.bags, quests: p.quests, questsDone: [...p.questsDone], guild: g.social?.guild || null,
    pos: [p.pos.x, p.pos.z], hasMount: !!g.hasMount, created: p.created || Date.now(), playedMs: (p.playedMs || 0), jump: !!p.jump,
    speedrunDone: !!p.speedrunDone, marks: p.marks || 0, skills: p.skills, bar: g.pc?.custom ? g.pc.bar.slice(0, 10) : undefined,
  };
}

// ---------------------------------------------------------------- parse model
// Expected output at level 10 raid gear by role; percentile from a logistic curve around the median.
// Calibrated on skill-0.7 SimPlayer raids (mage ~295 DPS, warrior ~250-280, priest ~125-165 HPS): an average
// first attempt lands green/blue, clean Hot Streak / no-deaths play reaches orange.
const MEDIAN = { ranged: 280, melee: 255, heal: 150 };
const SPREAD = { ranged: 70, melee: 62, heal: 45 };
export function parsePercentile(role, value, samples = null) {
  if (samples && samples.length >= 20) {
    const below = samples.filter(v => v < value).length;
    return Math.round(100 * below / samples.length);
  }
  const m = MEDIAN[role] || 280, s = SPREAD[role] || 65;
  const p = 1 / (1 + Math.exp(-(value - m) / (s * 0.6)));
  return Math.max(1, Math.min(100, Math.round(p * 100)));
}
export function parseColor(p) {
  if (p >= 100) return '#e5cc80';
  if (p >= 99) return '#e268a8';
  if (p >= 95) return '#ff8000';
  if (p >= 75) return '#a335ee';
  if (p >= 50) return '#0070ff';
  if (p >= 25) return '#1eff00';
  return '#9d9d9d';
}

// ---------------------------------------------------------------- boards
let remote = null; // { submit(entry) → Promise, top(day) → Promise<{first, fastest, dps, hps, speedrun}>, samples(day, role) }
export function setRemote(r) { remote = r; }
export function hasRemote() { return !!remote; }

export async function submitKill(entry) {
  const db = store.load();
  db.kills.push(entry);
  db.kills = db.kills.slice(-200);
  store.save(db);
  if (remote) { try { return await remote.submit(entry); } catch (e) { console.warn('leaderboard submit failed', e); } }
  return null;
}

/** Today's boards: your kills, friends' (shared while playing together), the realm's SimPlayers, and the global board. */
export async function boards(day) {
  const db = store.load(), mine = [...db.kills, ...(db.friendKills || [])].filter(k => !day || k.day === day);
  let global = null;
  if (remote) { try { global = await remote.top(day); } catch (e) { console.warn('leaderboard fetch failed', e); } }
  const pool = [...mine, ...aiKills(day)];
  if (global) for (const k of ['first', 'fastest', 'dps', 'hps', 'speedrun']) pool.push(...(global[k] || []));
  // one row per kill (the same kill can arrive locally and from the global board)
  const seen = new Set(), kills = pool.filter(k => { const id = `${k.name}|${Math.round((k.killTime || 0) * 10)}|${k.day}`; if (seen.has(id)) return false; seen.add(id); return true; });
  const top = (list, f) => [...list].sort((a, b) => f(a) - f(b)).slice(0, 10);
  return {
    online: !!global, total: kills.length,
    first: top(kills, k => k.at).slice(0, 5),
    fastest: top(kills, k => k.killTime),
    dps: top(kills.filter(k => k.role !== 'heal'), k => -k.dps),
    hps: top(kills.filter(k => k.role === 'heal'), k => -(k.hps || 0)),
    speedrun: top(kills.filter(k => k.speedrun), k => k.speedrun),
  };
}
/** Kills a friend shared with you (co-op): kept so their names stay on your boards. */
export function addFriendKills(list) {
  const db = store.load(), have = new Set([...db.kills, ...(db.friendKills || [])].map(k => `${k.name}|${k.at}`));
  const fresh = (list || []).filter(k => k && k.name && k.day && !have.has(`${k.name}|${k.at}`)).map(k => ({ ...k, friend: true }));
  if (!fresh.length) return 0;
  db.friendKills = [...(db.friendKills || []), ...fresh].slice(-300); store.save(db);
  return fresh.length;
}
/** The kills you know of for a day (yours and friends'): what you share when you play together. */
export function knownKills(day) { const db = store.load(); return [...db.kills, ...(db.friendKills || [])].filter(k => k.day === day).slice(-60); }

// The realm's own raid groups kill the dragon through the day as well: seeded by the day (everyone sees the same ones),
// appearing as the day goes on. Their numbers follow the same curve parses are graded on.
const AI_ROLES = [['ranged', 'mage'], ['ranged', 'mage'], ['melee', 'warrior'], ['melee', 'warrior'], ['heal', 'priest']];
export function aiKills(day, now = Date.now()) {
  const start = Date.parse(day + 'T00:00:00Z'); if (!start) return [];
  const rng = new RNG('realm-' + day), out = [], used = new Set();
  const name = () => { for (let i = 0; i < 20; i++) { let n = rng.next() < 0.5 ? rng.pick(CURATED_NAMES) : rng.pick(NAME_PARTS.pre) + rng.pick(NAME_PARTS.post); n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase(); if (!used.has(n)) { used.add(n); return n; } } return 'Raider' + out.length; };
  const n = 30 + Math.floor(rng.next() * 14);
  for (let i = 0; i < n; i++) {
    const at = start + (1.3 + Math.pow(i / n, 1.25) * 21.5 + rng.next() * 0.9) * 3600e3;
    const [role, cls] = rng.pick(AI_ROLES), u = Math.min(0.995, Math.max(0.01, rng.next()));
    const value = Math.max(40, MEDIAN[role] + SPREAD[role] * 0.6 * Math.log(u / (1 - u)));
    const e = { day, at, ai: true, name: name(), cls, race: rng.pick(['human', 'dwarf', 'orc', 'elf']), role, guild: rng.next() < 0.7 ? rng.pick(GUILDS) : null,
      killTime: 210 + rng.next() * 300 + (i < 3 ? 120 : 0), dps: role === 'heal' ? value * 0.25 : value, hps: role === 'heal' ? value : 0,
      attempts: 1 + Math.floor(rng.next() * 3), deaths: rng.next() < 0.3 ? 1 : 0, speedrun: rng.next() < 0.3 ? Math.round((2.2 + rng.next() * 6) * 3600) : null, parse: 0 };
    e.parse = parsePercentile(role, value);
    if (at <= now) out.push(e);
  }
  return out;
}

/** Values to grade a parse against: the global board's, else today's realm (SimPlayers and friends). */
export async function remoteSamples(day, role) {
  if (remote?.samples) { try { const s = await remote.samples(day, role); if (s?.length >= 20) return s; } catch { /* */ } }
  const db = store.load(), all = [...aiKills(day, Infinity), ...(db.friendKills || []).filter(k => k.day === day)].filter(k => k.role === role);
  return all.length >= 20 ? all.map(k => (role === 'heal' ? k.hps : k.dps)) : null;
}

// ---------------------------------------------------------------- challenge links
export function challengeLink(base, e) {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ n: e.name, c: e.cls, d: e.day, t: Math.round(e.killTime), v: Math.round(e.role === 'heal' ? e.hps : e.dps), r: e.role, p: e.parse }))));
  return `${base}#vs=${payload}`;
}
export function readChallenge() {
  const m = location.hash.match(/vs=([^&]+)/); if (!m) return null;
  return safe(() => { const o = JSON.parse(decodeURIComponent(escape(atob(m[1])))); return { name: String(o.n).slice(0, 16), cls: o.c, day: o.d, killTime: +o.t, value: +o.v, role: o.r, parse: +o.p }; }, null);
}

export function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${m}:${String(s).padStart(2, '0')}`; }

// ---------------------------------------------------------------- names
const P1 = ['Ael', 'Bran', 'Cor', 'Dra', 'El', 'Fen', 'Gar', 'Hal', 'Is', 'Jor', 'Kael', 'Lor', 'Mor', 'Nym', 'Or', 'Per', 'Quel', 'Ryn', 'Syl', 'Thal', 'Ul', 'Val', 'Wyn', 'Xan', 'Yor', 'Zan'];
const P2 = ['adrin', 'wyn', 'thas', 'dor', 'ira', 'wen', 'rik', 'vian', 'dros', 'mira', 'eth', 'gorn', 'lith', 'mar', 'ric', 'sael', 'tor', 'vyn', 'dell', 'ros'];
export function randomName() { const r = Math.random; let n = P1[Math.floor(r() * P1.length)] + P2[Math.floor(r() * P2.length)]; return n.charAt(0).toUpperCase() + n.slice(1); }
const BAD = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|bitch|whore|slut|dick|cock|puss|porn|sex|kkk|retard)/i;
export function validName(n) {
  if (!n || n.length < 2 || n.length > 14) return 'Names must be 2–14 letters.';
  if (!/^[A-Za-zÀ-ÿ]+$/.test(n)) return 'Names may only contain letters.';
  if (BAD.test(n)) return 'That name is not allowed.';
  return null;
}
export const cleanName = n => (validName(n) ? 'Adventurer' : n.charAt(0).toUpperCase() + n.slice(1).toLowerCase());
