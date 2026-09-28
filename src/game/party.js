// Groups of up to five: you, co-op friends and SimPlayers. `all` holds every member (you included); `members` is
// everyone but this browser's own player, which is what the party frames, minimap dots and SimPlayer chatter want.
// The realm's authority (a solo game or the host) changes groups through Social (social.js); a friend's browser
// only mirrors the group it is told about (net/guest.js).
let NEXT = 1;
export const isHuman = u => !!u && (u.kind === 'player' || u.kind === 'remote');
export const MAX_PARTY = 5;

export class Party {
  constructor(leader) { this.id = NEXT++; this.leader = leader; this.all = leader ? [leader] : []; }
  get members() { return this.all.filter(m => m.kind !== 'player'); }
  get size() { return this.all.length; }
  get full() { return this.all.length >= MAX_PARTY; }
  has(u) { return this.all.includes(u); }
  humans() { return this.all.filter(isHuman); }
}
