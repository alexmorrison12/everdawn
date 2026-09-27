// "Play Together" dialog (host a world or join one by code) and the small connection badges shown in-game.
import { cleanCode, canNetwork } from './peer.js';

const CSS = `
.evd-lobby{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(6,4,2,.72);font-family:'Roboto Condensed',Arial Narrow,Arial,sans-serif;color:#f2e2bc}
.evd-lobby .box{position:relative;width:min(720px,100%);max-height:100%;overflow:auto;padding:26px 26px 20px;box-sizing:border-box;border:1px solid #8a6a2a;border-radius:8px;
  background:linear-gradient(180deg,#221810,#110c08);box-shadow:0 0 0 1px #000,0 20px 60px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,210,130,.12)}
.evd-lobby h2{margin:0 0 4px;font:700 28px/1.1 Cinzel,Georgia,serif;color:#ffd35a;letter-spacing:.04em;text-align:center;text-shadow:0 2px 0 #000}
.evd-lobby .sub{margin:0 0 20px;text-align:center;color:#c9b890;font-size:15px}
.evd-lobby .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:620px){.evd-lobby .cols{grid-template-columns:1fr}}
.evd-lobby .col{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:6px;background:rgba(255,220,150,.04);box-shadow:inset 0 0 0 1px rgba(255,210,130,.14)}
.evd-lobby h3{margin:0;font:700 18px Cinzel,Georgia,serif;color:#ffe7a8;letter-spacing:.04em}
.evd-lobby p{margin:0;font-size:14px;line-height:1.45;color:#d8cbae}
.evd-lobby input{font:700 26px/1 'Roboto Condensed',monospace;letter-spacing:.3em;text-align:center;text-transform:uppercase;padding:10px 6px;border-radius:5px;border:1px solid #8a6a2a;background:#0b0806;color:#ffe7a8;width:100%;box-sizing:border-box}
.evd-lobby input:focus-visible,.evd-lobby button:focus-visible{outline:2px solid #ffd35a;outline-offset:2px}
.evd-lobby button{font:700 16px Cinzel,Georgia,serif;letter-spacing:.05em;padding:11px 16px;border-radius:5px;cursor:pointer;color:#ffe7a8;border:1px solid #c89a4a;background:linear-gradient(#9a2a1a,#5a1008);box-shadow:0 2px 6px rgba(0,0,0,.5)}
.evd-lobby button:disabled{opacity:.5;cursor:default}
.evd-lobby button.dark{background:linear-gradient(#3a2c1c,#1c140c)}
.evd-lobby .status{min-height:20px;font-size:14px;color:#ffd35a}
.evd-lobby .status.err{color:#ff7a5a}
.evd-lobby .foot{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:16px;font-size:12.5px;color:#9a8c70}
.evd-lobby .x{position:absolute;right:10px;top:8px;background:none;border:0;box-shadow:none;color:#c9b890;font:20px/1 sans-serif;padding:6px 10px}
.evd-netbadge{position:fixed;left:50%;transform:translateX(-50%);top:max(8px,env(safe-area-inset-top,0px));z-index:30;display:flex;align-items:center;gap:10px;padding:6px 8px 6px 12px;border-radius:6px;
  font:600 13px 'Roboto Condensed',Arial,sans-serif;color:#f2e2bc;background:rgba(14,10,6,.86);border:1px solid #8a6a2a;box-shadow:0 4px 16px rgba(0,0,0,.5);white-space:nowrap}
.evd-netbadge b{color:#40ff80;letter-spacing:.12em;text-transform:uppercase;font-size:11.5px}
.evd-netbadge b::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#40ff80;box-shadow:0 0 8px #40ff80;margin-right:6px;vertical-align:1px}
.evd-netbadge .code{font:700 14px monospace;letter-spacing:.14em;color:#ffe7a8}
.evd-netbadge .who{color:#c9b890}
.evd-netbadge button{font:600 12px 'Roboto Condensed',Arial,sans-serif;padding:4px 9px;border-radius:4px;border:1px solid #8a6a2a;background:#2a1e12;color:#ffe7a8;cursor:pointer}
.evd-netbadge .msg{color:#40ff80}
@media (max-width:700px){.evd-netbadge .who{display:none}}
`;
let styled = false;
export function lobbyStyles() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

/**
 * opts: { code (prefill), publicUrl, onHost(), onJoin(code, status) → status.ok() / status.fail(msg), onClose() }
 */
export function openLobby(opts) {
  lobbyStyles();
  const el = document.createElement('div');
  el.className = 'evd-lobby';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Play Together');
  const online = canNetwork();
  el.innerHTML = `<div class="box">
    <button class="x" type="button" aria-label="Close">✕</button>
    <h2>Play Together</h2>
    <p class="sub">One of you hosts; up to four friends join the same world, quests and dragon.</p>
    ${online ? `<div class="cols">
      <div class="col">
        <h3>Host a world</h3>
        <p>Your browser runs the realm: every mob, SimPlayer and the raid. You get a six-letter room code to share.</p>
        <button type="button" id="evd-host">Host a World</button>
      </div>
      <div class="col">
        <h3>Join a friend</h3>
        <p>Enter the room code your friend sees at the top of their screen.</p>
        <input id="evd-code" maxlength="6" autocomplete="off" spellcheck="false" placeholder="CODE" aria-label="Room code">
        <button type="button" id="evd-join">Join</button>
      </div>
    </div>
    <div class="status" role="status"></div>
    <div class="foot"><span>Browsers connect to each other directly (WebRTC). Your character stays saved in your own browser.</span></div>`
    : `<p class="sub">This view can't open connections to other players.${opts.publicUrl ? ` Play Together works on the web version:<br><b>${opts.publicUrl.replace(/^https?:\/\//, '')}</b>` : ''}</p>`}
  </div>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); removeEventListener('keydown', key, true); opts.onClose?.(); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', key, true);
  el.querySelector('.x').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  if (!online) return { close };
  const status = el.querySelector('.status'), input = el.querySelector('#evd-code'), join = el.querySelector('#evd-join'), host = el.querySelector('#evd-host');
  const say = (msg, err) => { status.textContent = msg || ''; status.classList.toggle('err', !!err); };
  if (opts.code) input.value = cleanCode(opts.code);
  input.addEventListener('input', () => { const v = cleanCode(input.value); if (v !== input.value) input.value = v; });
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') join.click(); });
  host.addEventListener('click', () => { el.remove(); removeEventListener('keydown', key, true); opts.onHost(); });
  join.addEventListener('click', () => {
    const code = cleanCode(input.value);
    if (code.length !== 6) { say('Room codes are six letters and numbers.', true); input.focus(); return; }
    join.disabled = host.disabled = true; say('Connecting to your friend…');
    opts.onJoin(code, {
      ok: () => { el.remove(); removeEventListener('keydown', key, true); },
      fail: msg => { join.disabled = host.disabled = false; say(msg, true); },
    });
  });
  setTimeout(() => (opts.code ? join : host).focus(), 50);
  return { close };
}

/** Top badge for a guest: whose world you're in. */
export class GuestBadge {
  constructor(name) {
    lobbyStyles();
    const el = this.el = document.createElement('div');
    el.className = 'evd-netbadge';
    el.innerHTML = '<b>Online</b><span class="who"></span>';
    document.body.appendChild(el);
    this.set(`In ${name}'s world`);
  }
  set(text) { this.el.querySelector('.who').textContent = text; }
  remove() { this.el.remove(); }
}
