// Browser-to-browser transport for co-op (WebRTC data channels via PeerJS). Nothing runs on anyone's computer but the
// game: the free public PeerJS service only introduces the two browsers, then they talk directly (or through its TURN
// relay when a strict router forbids a direct path). The host's peer id is derived from a short room code.
import { Peer } from 'peerjs';

const PREFIX = 'everdawn-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

/** WebRTC works in normal browsers; the Claude artifact viewer's sandbox blocks it. */
export function canNetwork() {
  if (typeof RTCPeerConnection === 'undefined') return false;
  try { return window.top === window.self || !/claudeusercontent|claude\.ai/.test(document.referrer + location.host); } catch { return false; }
}

// PeerJS's JSON channel refuses messages over ~16 KB (a first snapshot of a busy village is bigger), so messages are
// sent as JSON text and anything long is cut into ordered chunks and glued back together on arrival.
const CHUNK = 12000;
let chunkId = 1;
function sendChunked(conn, msg) {
  const s = JSON.stringify(msg);
  if (s.length <= CHUNK) { conn.send(s); return; }
  const id = chunkId++, n = Math.ceil(s.length / CHUNK);
  for (let i = 0; i < n; i++) conn.send({ $c: id, i, n, d: s.slice(i * CHUNK, (i + 1) * CHUNK) });
}
function receiver(onMsg) {
  const parts = new Map();
  return data => {
    if (typeof data === 'string') { try { onMsg(JSON.parse(data)); } catch { /* malformed */ } return; }
    if (!data || typeof data !== 'object') return;
    if (data.$c === undefined) { onMsg(data); return; }
    let p = parts.get(data.$c); if (!p) parts.set(data.$c, p = []);
    p[data.i] = data.d;
    if (p.filter(x => x !== undefined).length === data.n) { parts.delete(data.$c); try { onMsg(JSON.parse(p.join(''))); } catch { /* malformed */ } }
  };
}

const OPTS = { debug: 0, config: { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] } };

/** Hosting: open the room and accept guests. cb: onOpen(code), onJoin(id, name), onLeave(id), onMessage(id, msg), onError(msg).
 *  A preferred code (the same tab after a refresh) is retried for a while: the matchmaking service frees the old
 *  page's id a few seconds after it disconnects, and friends are already trying that code to get back in. */
export class HostTransport {
  constructor(cb, code = null) {
    this.cb = cb; this.conns = new Map(); this.nextId = 1; this.closed = false; this.tries = 0;
    this.open(code || makeCode(), !!code);
  }
  open(code, preferred) {
    this.code = code;
    const peer = this.peer = new Peer(PREFIX + code, OPTS);
    peer.on('open', () => this.cb.onOpen?.(code));
    peer.on('connection', conn => this.accept(conn));
    peer.on('disconnected', () => { if (!this.closed && peer === this.peer) setTimeout(() => { try { peer.reconnect(); } catch { /* destroyed */ } }, 1500); });
    peer.on('error', err => {
      if (peer !== this.peer) return;
      if (err.type === 'unavailable-id') {
        peer.destroy();
        if (preferred && this.tries++ < 12) { this.cb.onWait?.(code); setTimeout(() => { if (!this.closed) this.open(code, true); }, 2500); }
        else if (this.tries++ < 16) this.open(makeCode(), false);
        return;
      }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') this.cb.onError?.('Could not reach the matchmaking service. Check your connection.');
      else if (err.type !== 'peer-unavailable') this.cb.onError?.(err.message || String(err.type));
    });
  }
  accept(conn) {
    if (this.conns.size >= 4) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
    const id = this.nextId++, name = String(conn.metadata?.name || 'Adventurer').replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 14) || 'Adventurer';
    conn.on('open', () => { this.conns.set(id, conn); this.cb.onJoin?.(id, name); });
    conn.on('data', receiver(m => this.cb.onMessage?.(id, m)));
    const gone = why => { if (this.conns.delete(id)) { console.warn('[net] guest', name, 'left:', why); this.cb.onLeave?.(id); } };
    conn.on('close', () => gone('closed'));
    conn.on('error', e => { console.warn('[net] connection error', e?.type, e?.message); if (!conn.open) gone(`error ${e?.type || ''}`); });
  }
  send(id, msg) { const c = this.conns.get(id); if (c?.open) try { sendChunked(c, msg); } catch (e) { console.warn('[net] send failed', e?.message); } }
  close() { this.closed = true; for (const c of this.conns.values()) try { c.close(); } catch { /* */ } this.peer.destroy(); }
}

/** Joining: connect to a room code. cb: onOpen(), onMessage(msg), onClose(reason), onError(msg). */
export class GuestTransport {
  constructor(code, name, cb) {
    this.cb = cb; this.code = cleanCode(code); this.name = name; this.closed = false; this.open = false;
    const peer = this.peer = new Peer(OPTS);
    peer.on('open', () => this.dial());
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') cb.onError?.(`No world found for code ${this.code}. Check the code, and that your friend is hosting.`);
      else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') cb.onError?.('Could not reach the matchmaking service. Check your connection.');
      else cb.onError?.(err.message || String(err.type));
    });
  }
  dial() {
    const conn = this.conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json', metadata: { name: this.name } });
    const t = setTimeout(() => { if (!this.open) this.cb.onError?.('Your friend’s browser didn’t answer. Try again, or check the code.'); }, 20000);
    conn.on('open', () => { clearTimeout(t); this.open = true; this.cb.onOpen?.(); });
    conn.on('data', receiver(m => this.cb.onMessage?.(m)));
    conn.on('close', () => { this.open = false; if (!this.closed) this.cb.onClose?.('The host closed the world.'); });
    conn.on('error', () => { this.open = false; });
  }
  send(msg) { if (this.open) try { sendChunked(this.conn, msg); } catch (e) { console.warn('[net] send failed', e?.message); } }
  close() { this.closed = true; try { this.conn?.close(); } catch { /* */ } this.peer.destroy(); }
}
