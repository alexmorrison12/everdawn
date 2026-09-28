// Persistence, parse percentiles, local leaderboard, challenge links. Remote boards plug in via setRemote().
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
    speedrunDone: !!p.speedrunDone, bar: g.pc?.custom ? g.pc.bar.slice(0, 10) : undefined,
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

export async function boards(day) {
  if (remote) { try { const r = await remote.top(day); if (r) return { ...r, online: true }; } catch (e) { console.warn('leaderboard fetch failed', e); } }
  const kills = store.load().kills.filter(k => !day || k.day === day);
  const by = (f, dir = 1) => [...kills].sort((a, b) => (f(a) - f(b)) * dir).slice(0, 10);
  return {
    online: false,
    first: by(k => k.at).slice(0, 5),
    fastest: by(k => k.killTime),
    dps: by(k => -(k.role === 'heal' ? 0 : k.dps)).filter(k => k.role !== 'heal'),
    hps: by(k => -(k.hps || 0)).filter(k => k.role === 'heal'),
    speedrun: by(k => k.speedrun || 1e12).filter(k => k.speedrun),
  };
}

export async function remoteSamples(day, role) {
  if (!remote?.samples) return null;
  try { return await remote.samples(day, role); } catch { return null; }
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
