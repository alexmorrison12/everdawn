// Tiny synchronous event bus shared by gameplay, UI, FX, audio and chat.
const handlers = new Map();
export const bus = {
  on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); },
  emit(type, data) { const h = handlers.get(type); if (h) for (const fn of h) { try { fn(data); } catch (e) { console.error('[bus]', type, e); } } },
  clear() { handlers.clear(); },
};
