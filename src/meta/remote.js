// Supabase RPC client for the global leaderboard. Only the three security-definer functions are reachable.
// Fill SUPABASE_URL / SUPABASE_KEY after provisioning (publishable key is safe to ship).
export const SUPABASE_URL = '';
export const SUPABASE_KEY = '';
// Canonical public address of the game (e.g. a GitHub Pages URL). Challenge links point here when the page runs
// somewhere a link can't carry a #hash (a sandboxed embed); empty means "use this page's own address".
export const PUBLIC_URL = 'https://alexmorrison12.github.io/everdawn/';

async function rpc(fn, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `leaderboard ${res.status}`);
  return data;
}

export function makeRemote() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  return {
    submit: e => rpc('submit_kill', {
      p_day: e.day, p_name: e.name, p_cls: e.cls, p_race: e.race, p_role: e.role, p_guild: e.guild || '', p_element: e.element,
      p_kill_ms: Math.round(e.killTime * 1000), p_dps: Math.round(e.dps), p_hps: Math.round(e.hps), p_attempts: e.attempts, p_deaths: e.deaths || 0,
      p_avoidable: Math.round(e.avoidable || 0), p_speedrun_ms: e.speedrun ? Math.round(e.speedrun * 1000) : null, p_premade: !!e.premade,
    }),
    top: async day => {
      const r = await rpc('top_kills', { p_day: day });
      const map = a => a.map(x => ({ ...x, killTime: x.kill_ms / 1000, speedrun: x.speedrun_ms ? x.speedrun_ms / 1000 : null, at: x.at ? Date.parse(x.at) : null }));
      return { first: map(r.first), fastest: map(r.fastest), dps: map(r.dps), hps: map(r.hps), speedrun: map(r.speedrun), total: r.total };
    },
    samples: (day, role) => rpc('parse_samples', { p_day: day, p_role: role }),
  };
}
