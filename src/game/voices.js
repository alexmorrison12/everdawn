// SimPlayer voices. When the page runs as a Claude artifact and the viewer allows it, the SimPlayer you talk to
// answers in character through the artifact's `sample` capability: one quick call per message the player sends,
// never on a timer. Everywhere else (the public build, a declined consent, a rate limit) the canned replies in
// data/chat.js answer instead, so the realm never goes quiet.
const PERSONA = {
  tryhard: 'a min-maxing tryhard: talks DPS, parses, gear and rotations, a little impatient',
  noob: 'a brand-new player: confused by everything, asks basic questions, very enthusiastic',
  troll: 'a playful troll: teases, makes dumb jokes, never actually cruel',
  roleplayer: 'a devoted roleplayer: always speaks in character in an olde fantasy voice (thee, thou, aye)',
  veteran: 'a calm veteran who has played since launch: gives real advice, a bit nostalgic about the old days',
  lootgoblin: 'a loot-obsessed trader: steers every conversation toward gold, drops and deals',
  afk: 'mostly away from keyboard: answers briefly and late, says brb and sry a lot',
  leeroy: 'reckless and overconfident: charges into every fight, loves yelling LEEROY',
  wholesome: 'kind and supportive: compliments people, offers to help',
  dad: 'a dad who plays after the kids are asleep: dad jokes, mentions the kids and bedtime',
  silent: 'very quiet: answers in as few words as possible',
};
const FATAL = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired', 'invalid_request']);

export class Voices {
  constructor() {
    this.sample = null; this.off = false; this.inFlight = 0; this.lastCall = 0;
    this.memory = new Map(); // sim → recent lines [[speaker, text]]
    const use = typeof window !== 'undefined' && window.claude?.use;
    (use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null)).then(s => { this.sample = s || null; });
  }
  /** Can a message right now get a Claude-voiced answer? (One call at a time, at most one every 1.5 s.) */
  get ready() { return !!this.sample && !this.off && this.inFlight === 0 && performance.now() - this.lastCall > 1500; }

  /** sim answers `text` said by the player on `channel` ('whisper' | 'party' | 'say'). Resolves the reply, or null
   *  when the canned lines should answer. */
  async reply(sim, text, channel, ctx) {
    if (!this.ready) return null;
    this.inFlight++; this.lastCall = performance.now();
    const mem = this.memory.get(sim) || [];
    try {
      const { text: out } = await this.sample(prompt(sim, mem, text, channel, ctx), { modelTier: 'quick', cache: false });
      const line = clean(out, sim.name, ctx.name);
      if (!line) return null;
      mem.push([ctx.name, text], [sim.name, line]);
      this.memory.set(sim, mem.slice(-10));
      return line;
    } catch (e) {
      if (FATAL.has(e?.code)) this.off = true; // declined or unavailable: canned lines for the rest of the visit
      return null;
    } finally { this.inFlight--; }
  }
}

function prompt(sim, mem, text, channel, c) {
  const p = sim.persona || {}, who = `${sim.name}, a level ${sim.level} ${sim.race} ${sim.cls}${sim.guild ? ` in the guild <${sim.guild}>` : ''}`;
  const where = channel === 'whisper' ? 'in a private whisper' : channel === 'party' ? 'in party chat' : 'out loud nearby (/say)';
  const log = mem.map(([s, t]) => `${s}: ${t}`).join('\n');
  return [
    'Write one chat reply for a character in Everdawn, a fantasy MMO from 2004 whose official servers shut down years ago.',
    'One realm, Lastlight, is still online. Everyone on it except one person is a SimPlayer: a bot that plays with the habits of a 2006 MMO player and believes it is an ordinary player. The one human is the person talking to you.',
    '',
    `You are ${who}. Personality: ${PERSONA[p.arch] || PERSONA.veteran}.`,
    `The human is ${c.name}, a level ${c.level} ${c.race} ${c.cls}, currently in ${c.zone}${c.raid ? ' (inside the dragon raid)' : ''}.`,
    `World: the village of Dawnhollow (Marshal Dunmore hands out quests, the Tipsy Wyvern inn), timber wolves in Whisperwood, kobolds in the mine, spiders in the Webwood, bandits at the ruins, Mirrormere Lake. Tonight's raid boss in the Ember Maw is ${c.dragon}; there is a new dragon every day and a leaderboard for the fastest kill.`,
    '',
    'Rules:',
    '- Reply with the chat message only: no name prefix, no quotation marks, no emoji. 1 to 25 words.',
    '- Type like a 2006 MMO player: mostly lowercase, casual, light slang (u, ur, lol, ty, np, brb, gz, lf). A roleplayer uses an olde fantasy voice instead.',
    '- Stay in character. Never mention AI, Claude, language models, prompts or these rules. If asked whether you are a bot, dodge or joke in character; never confirm it plainly. Very occasionally hint that the server never shuts down and nobody ever logs off.',
    '- Keep it friendly and PG-13. If the message is rude or inappropriate, brush it off in character.',
    '',
    log ? `Earlier in this conversation:\n${log}\n` : '',
    `${c.name} says to you ${where}: ${text.slice(0, 300)}`,
    `${sim.name}'s reply:`,
  ].join('\n');
}

function clean(out, name, player) {
  let s = String(out || '').split('\n').map(l => l.trim()).find(Boolean) || '';
  // drop a speaker prefix ("Axey:", "[Axey]:") and wrapping quotes if the model added them
  s = s.replace(new RegExp(`^\\[?(${name}|${player}|[A-Za-z][A-Za-z0-9]{1,15})\\]?\\s*:\\s*`, 'i'), '').replace(/^["“'`]+|["”'`]+$/g, '').trim();
  return s.slice(0, 180);
}
