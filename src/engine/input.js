// Keyboard + mouse + touch state. WoW-style: LMB drag orbits camera, RMB drag steers, both buttons run forward.
// While dragging, the cursor is locked (Pointer Lock) so you can keep turning past the screen edge, and it comes
// back where it was when you let go, like WoW. Middle-click / Alt+click is a click too (waypoints). Touch on the canvas: one
// finger orbits, two fingers pinch-zoom, a tap is a click flagged `touch` (the move stick lives in touch.js).
const MB = b => (b & 1 ? 1 : 0) | (b & 2 ? 2 : 0); // mouse buttons we care about (left 1, right 2)

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();     // keys pressed this frame (edge)
    this.buttons = 0;             // bitmask 1=left 2=right
    this.dragDX = 0; this.dragDY = 0; this.wheel = 0;
    this.dragging = false; this.dragDist = 0;
    this.mouse = { x: 0, y: 0 };
    this.clicks = [];             // {button, x, y} short clicks (not drags)
    this.enabled = true;
    this.typing = false;          // chat box focus
    this.pointerLock = false;
    this.lockOk = true;           // settings: lock the cursor while turning
    this._down = null;
    this.touch = false;                                   // a touch has happened (touch UI is on)
    this.stick = { x: 0, y: 0, active: false };          // virtual move stick, -1..1 (screen axes)
    this.tp = new Map(); this._pinch = 0; this._pinched = false;
    window.addEventListener('keydown', e => {
      if (this.typing) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Tab', 'Space', 'Slash', 'Backquote', 'ArrowUp', 'ArrowDown'].includes(k) || (e.altKey && k.startsWith('Digit'))) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; this.endDrag(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no autoscroll on middle-click
    el.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      if (e.pointerType === 'touch') { this.touch = true; this.tp.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }); if (this.tp.size === 2) { this._pinch = this.pinchDist(); this._pinched = true; } return; }
      if (e.button === 1) e.preventDefault();
      this.buttons = MB(e.buttons) || (e.button === 0 ? 1 : e.button === 2 ? 2 : 0);
      this._down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() };
      if (e.button !== 1) this.dragDist = 0;
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') { this.touchMove(e); return; }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      // a second button pressed or let go while one is held arrives here, not as pointerdown/up (chorded buttons):
      // that's how "hold both buttons to run" works (only for presses that began on the game, not a drag out of a window)
      if (this.buttons) { const b = MB(e.buttons); if (b !== this.buttons) { this.buttons = b; if (!b) this.endDrag(); } }
      if (!this.buttons) return;
      this.dragDist += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.dragDist > 4 && !this.dragging) { this.dragging = true; el.style.cursor = 'none'; this.lock(); }
      if (this.dragging) { this.dragDX += e.movementX; this.dragDY += e.movementY; }
    });
    const up = e => {
      if (e.pointerType === 'touch') { this.touchUp(e); return; }
      const b = e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
      if (this._down && this._down.button === e.button && (e.button === 1 || this.dragDist <= 4) && performance.now() - this._down.t < 450) {
        this.clicks.push({ button: e.button, x: this._down.x, y: this._down.y, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey });
      }
      this.buttons = MB(e.buttons) & ~b;
      if (!this.buttons) this.endDrag();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5); e.preventDefault(); }, { passive: false });
  }
  pinchDist() { const [a, b] = [...this.tp.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  touchMove(e) {
    const p = this.tp.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
    if (this.tp.size >= 2) { const d = this.pinchDist(); if (this._pinch) this.wheel += (this._pinch - d) / 28; this._pinch = d; return; }
    if (p.moved > 8) { this.dragging = true; this.dragDX += dx * 1.3; this.dragDY += dy * 1.3; }
  }
  touchUp(e) {
    const p = this.tp.get(e.pointerId); if (!p) return;
    this.tp.delete(e.pointerId);
    if (!this._pinched && p.moved <= 10 && performance.now() - p.t < 350) this.clicks.push({ button: 0, x: e.clientX, y: e.clientY, touch: true });
    if (this.tp.size < 2) this._pinch = 0;
    if (!this.tp.size) { this._pinched = false; this.endDrag(); }
  }
  endDrag() { this.dragging = false; this.el.style.cursor = ''; if (document.pointerLockElement === this.el) document.exitPointerLock?.(); }
  /** Lock the cursor for a mouse drag (turn without hitting the screen edge). Needs a recent click, which a drag has. */
  lock() {
    if (!this.lockOk || this.touch || document.pointerLockElement === this.el || !this.el.requestPointerLock) return;
    try { const p = this.el.requestPointerLock({ unadjustedMovement: false }); p?.catch?.(() => {}); } catch { /* sandboxed frame: drag unlocked */ }
  }
  down(code) { return this.enabled && !this.typing && this.keys.has(code); }
  hit(code) { return this.enabled && !this.typing && this.pressed.has(code); }
  consumeDrag() { const d = [this.dragDX, this.dragDY]; this.dragDX = this.dragDY = 0; return d; }
  endFrame() { this.pressed.clear(); this.wheel = 0; this.clicks.length = 0; }
}
