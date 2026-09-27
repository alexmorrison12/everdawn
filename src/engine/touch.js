// Touch play for phones and tablets. The left part of the screen is a floating move stick that appears under the
// thumb; the canvas (see Input) orbits the camera with one finger, pinch-zooms with two, targets on tap, and
// interacts when the current target is tapped again. A jump button sits on the right. Touch mode switches on at
// the first touch, so a laptop with a touchscreen keeps its mouse controls until someone actually touches it.
const CSS = `
.evd-stick-zone{position:fixed;left:0;bottom:0;width:42vw;height:62vh;z-index:15;touch-action:none;display:none;-webkit-user-select:none;user-select:none}
.evd-touch-on .evd-stick-zone{display:block}
.evd-stick{position:fixed;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;pointer-events:none;z-index:16;
  background:radial-gradient(circle,rgba(20,14,8,.18) 0,rgba(20,14,8,.34) 62%,rgba(255,211,90,.28) 64%,rgba(255,211,90,0) 70%);
  border:2px solid rgba(255,211,90,.38);box-shadow:0 0 18px rgba(0,0,0,.35);opacity:.45;transition:opacity .2s;display:none}
.evd-touch-on .evd-stick{display:block}
.evd-stick.live{opacity:1;transition:none}
.evd-stick-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;
  background:radial-gradient(circle at 40% 35%,#fff1b8,#d9a53a 55%,#7a4c12);border:2px solid #2a1a08;box-shadow:0 3px 10px rgba(0,0,0,.6)}
.evd-jump{position:fixed;right:max(14px,env(safe-area-inset-right,0px));bottom:38vh;width:64px;height:64px;border-radius:50%;z-index:25;display:none;
  touch-action:none;border:2px solid #c89a4a;color:#ffe7a8;font:700 12px/1 'Cinzel',Georgia,serif;letter-spacing:.06em;
  background:radial-gradient(circle at 45% 35%,rgba(140,40,20,.95),rgba(60,12,6,.95));box-shadow:0 4px 14px rgba(0,0,0,.55)}
.evd-touch-on .evd-jump{display:block}
.evd-chatbtn{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(62vh + 8px);z-index:25;display:none;touch-action:manipulation;padding:7px 14px;border-radius:14px;
  border:1px solid #8a6a2a;background:rgba(20,14,8,.82);color:#f2e2bc;font:600 13px/1 'Roboto Condensed',Arial,sans-serif;letter-spacing:.04em}
.evd-touch-on .evd-chatbtn{display:block}
.evd-jump:active{transform:scale(.94);filter:brightness(1.25)}
.evd-touch-on .evd-chat,.evd-touch-on .evd-chat *{pointer-events:none!important}
.evd-touch-on .evd-chat.typing,.evd-touch-on .evd-chat.typing *{pointer-events:auto!important}
.evd-rotate{position:fixed;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;
  background:rgba(8,6,4,.92);color:#f2e2bc;font:16px/1.45 system-ui,sans-serif;text-align:center;padding:24px}
.evd-rotate b{font:700 20px 'Cinzel',Georgia,serif;color:#ffd35a;letter-spacing:.04em}
.evd-rotate i{display:block;width:74px;height:46px;border:3px solid #ffd35a;border-radius:9px;animation:evd-rot 2.4s ease-in-out infinite}
@keyframes evd-rot{0%,30%{transform:rotate(-90deg)}60%,100%{transform:rotate(0)}}
@media (prefers-reduced-motion:reduce){.evd-rotate i{animation:none}}
@media (orientation:portrait){.evd-touch-on.evd-playing .evd-rotate{display:flex}}
`;

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.on = false;
    const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    const mk = (tag, cls, parent = document.body) => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
    this.zone = mk('div', 'evd-stick-zone');
    this.base = mk('div', 'evd-stick');
    this.knob = mk('div', 'evd-stick-knob', this.base);
    this.jump = mk('button', 'evd-jump'); this.jump.textContent = 'JUMP'; this.jump.setAttribute('aria-label', 'Jump');
    this.chat = mk('button', 'evd-chatbtn'); this.chat.textContent = 'Chat'; this.chat.addEventListener('click', () => this.onChat?.());
    this.rotate = mk('div', 'evd-rotate');
    this.rotate.innerHTML = '<i></i><b>Turn your phone sideways</b><span>Everdawn plays in landscape.</span>';
    this.rest();
    this.stickId = null;
    const R = 56;
    this.zone.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || this.stickId !== null) return;
      this.enable();
      this.stickId = e.pointerId; this.zone.setPointerCapture?.(e.pointerId);
      // keep the whole stick on screen even when the thumb lands at the edge
      this.ox = Math.max(64, Math.min(innerWidth - 64, e.clientX)); this.oy = Math.max(64, Math.min(innerHeight - 64, e.clientY));
      this.sx = e.clientX; this.sy = e.clientY; this.t0 = performance.now(); this.moved = 0;
      this.place(this.ox, this.oy); this.base.classList.add('live');
      Object.assign(input.stick, { x: 0, y: 0, active: true });
      e.preventDefault();
    });
    this.zone.addEventListener('pointermove', e => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
      this.moved = Math.max(this.moved, Math.hypot(e.clientX - this.sx, e.clientY - this.sy));
      const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(${dx}px,${dy}px)`;
      input.stick.x = dx / R; input.stick.y = dy / R;
    });
    const end = e => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      // a quick tap on the stick side still targets whatever is under the finger
      if (this.moved < 10 && performance.now() - this.t0 < 350) input.clicks.push({ button: 0, x: e.clientX, y: e.clientY, touch: true });
      Object.assign(input.stick, { x: 0, y: 0, active: false });
      this.rest();
    };
    this.zone.addEventListener('pointerup', end);
    this.zone.addEventListener('pointercancel', end);
    this.jump.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); input.pressed.add('Space'); });
    // phones and tablets start in touch mode; anything else switches at its first real touch
    if (matchMedia('(pointer: coarse)').matches) this.enable();
    else addEventListener('touchstart', () => this.enable(), { passive: true, once: true });
    addEventListener('resize', () => { if (this.stickId === null) this.rest(); });
  }
  place(x, y) { this.base.style.left = x + 'px'; this.base.style.top = y + 'px'; }
  rest() { this.knob.style.transform = ''; this.base.classList.remove('live'); this.place(Math.min(130, innerWidth * 0.16), innerHeight - Math.min(150, innerHeight * 0.36)); }
  enable() {
    if (this.on) return;
    this.on = true; this.input.touch = true;
    document.body.classList.add('evd-touch-on');
    this.onEnable?.();
  }
  /** In-world play (not menus): shows the stick/jump and the portrait "rotate" notice. */
  setPlaying(on) { document.body.classList.toggle('evd-playing', !!on); this.zone.style.visibility = this.jump.style.visibility = this.base.style.visibility = this.chat.style.visibility = on ? '' : 'hidden'; }
}
