// renderShareCard(data) → HTMLCanvasElement 1200×630: a social image for a dragon kill.
import { paint as P, iconCanvas, elementColors } from './icons.js';
import { parseColor, classColor, CLASS_NAMES, fmtClock, fmtInt, rng, rgba, mix, shade } from './util.js';

const W = 1200, H = 630;
const ELEMENT_NAMES = { ember: 'Ember', frost: 'Frost', venom: 'Venom', storm: 'Storm', shadow: 'Shadow' };

/**
 * data: { name, cls, race?, level?, dragonName, element = 'ember', affix?, parse, time (s), dps?, hps?, rank?: { pos, of },
 *         date?: Date|string, portrait?: CanvasImageSource, worldFirst?: bool, url?: string, guild? }
 * Fonts: call after `await ui.fontsReady` (or document.fonts.ready) so Cinzel is used.
 */
export function renderShareCard(d) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const E = elementColors(d.element || 'ember'), R = rng(7);
  const pc = parseColor(d.parse ?? 0);
  P.setK(1);
  // ---- background: element nebula + painterly strokes
  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, shade(E.bg[2], 0.08)); bg.addColorStop(0.55, shade(E.bg[1], -0.45)); bg.addColorStop(1, E.bg[2]);
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  glow(W * 0.78, H * 0.45, 520, E.glow, 0.35);
  glow(W * 0.2, H * 0.5, 380, pc, 0.16);
  x.lineCap = 'round';
  for (let i = 0; i < 160; i++) { const px = R() * W, py = R() * H, l = 40 + R() * 160, a = -0.5 + (R() - 0.5) * 0.5; x.strokeStyle = rgba(R() < 0.5 ? E.bg[0] : E.bg[1], 0.03 + R() * 0.06); x.lineWidth = 6 + R() * 26; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  // ---- giant dragon head silhouette on the right
  x.save(); x.globalAlpha = 0.9; x.translate(W * 0.56, H * 0.02); x.scale(6.4, 6.4);
  P.dragonHead(x, R, E.head);
  x.restore();
  const shadeL = x.createLinearGradient(0, 0, W, 0); shadeL.addColorStop(0, 'rgba(6,4,8,.92)'); shadeL.addColorStop(0.55, 'rgba(6,4,8,.55)'); shadeL.addColorStop(0.8, 'rgba(6,4,8,.1)'); shadeL.addColorStop(1, 'rgba(6,4,8,.25)');
  x.fillStyle = shadeL; x.fillRect(0, 0, W, H);
  // embers
  for (let i = 0; i < 90; i++) { const px = R() * W, py = R() * H, r = 0.6 + R() * 2.4; glow(px, py, r * 4, E.glow, 0.35); x.fillStyle = rgba('#ffffff', 0.7); x.beginPath(); x.arc(px, py, r * 0.4, 0, 6.3); x.fill(); }
  // vignette
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.7)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);

  // ---- ornate gold frame
  const gold = (x0, y0, x1, y1) => P.metalLG(x, x0, y0, x1, y1, 'gold');
  x.lineWidth = 6; x.strokeStyle = gold(0, 0, W, H); x.strokeRect(18, 18, W - 36, H - 36);
  x.lineWidth = 1.5; x.strokeStyle = 'rgba(0,0,0,.9)'; x.strokeRect(14.5, 14.5, W - 29, H - 29); x.strokeRect(21.5, 21.5, W - 43, H - 43);
  x.lineWidth = 1; x.strokeStyle = 'rgba(255,220,150,.35)'; x.strokeRect(30, 30, W - 60, H - 60);
  for (const [cx, cy, sx, sy] of [[18, 18, 1, 1], [W - 18, 18, -1, 1], [18, H - 18, 1, -1], [W - 18, H - 18, -1, -1]]) {
    x.save(); x.translate(cx, cy); x.scale(sx, sy);
    x.fillStyle = gold(-10, -10, 40, 40); x.beginPath(); x.moveTo(-8, -8); x.lineTo(46, -8); x.quadraticCurveTo(20, 4, 12, 12); x.quadraticCurveTo(4, 20, -8, 46); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.9)'; x.lineWidth = 1.5; x.stroke();
    P.gemShape(x, 6, 6, 7, E.glow, { glow: true });
    x.restore();
  }

  // ---- portrait
  const px = 170, py = 250, pr = 108;
  glow(px, py, pr * 1.8, pc, 0.25);
  x.save(); x.beginPath(); x.arc(px, py, pr, 0, 6.3); x.clip();
  const pg = x.createRadialGradient(px, py - 30, 10, px, py, pr); pg.addColorStop(0, '#3a3440'); pg.addColorStop(1, '#0c0a10'); x.fillStyle = pg; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  if (d.portrait) { try { x.drawImage(d.portrait, px - pr, py - pr, pr * 2, pr * 2); } catch (e) { /* tainted/unsupported source */ } }
  else { const ic = iconCanvas('class' + (d.cls || 'warrior')[0].toUpperCase() + (d.cls || 'warrior').slice(1), 256); x.drawImage(ic, px - pr * 1.1, py - pr * 1.1, pr * 2.2, pr * 2.2); }
  const ish = x.createRadialGradient(px, py, pr * 0.7, px, py, pr); ish.addColorStop(0, 'rgba(0,0,0,0)'); ish.addColorStop(1, 'rgba(0,0,0,.6)'); x.fillStyle = ish; x.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  x.restore();
  x.lineWidth = 14; x.strokeStyle = gold(px - pr, py - pr, px + pr, py + pr); x.beginPath(); x.arc(px, py, pr + 7, 0, 6.3); x.stroke();
  x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,.9)'; x.beginPath(); x.arc(px, py, pr + 14, 0, 6.3); x.stroke(); x.beginPath(); x.arc(px, py, pr, 0, 6.3); x.stroke();
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + 0.26; const rx = px + Math.cos(a) * (pr + 7), ry = py + Math.sin(a) * (pr + 7); const rgr = x.createRadialGradient(rx - 1.5, ry - 1.5, 0, rx, ry, 4.5); rgr.addColorStop(0, '#fffbe8'); rgr.addColorStop(1, '#6a4208'); x.fillStyle = rgr; x.beginPath(); x.arc(rx, ry, 3.8, 0, 6.3); x.fill(); }

  // ---- text helpers
  const text = (s, tx, ty, font, fill, o = {}) => {
    x.font = font; x.textAlign = o.align || 'left'; x.textBaseline = o.base || 'alphabetic';
    if (o.ls) try { x.letterSpacing = o.ls; } catch (e) { /* older engines */ }
    if (o.shadow !== false) { x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = o.blur ?? 8; x.shadowOffsetY = 2; }
    if (o.stroke) { x.lineWidth = o.stroke; x.strokeStyle = 'rgba(0,0,0,.95)'; x.lineJoin = 'round'; x.strokeText(s, tx, ty); }
    x.fillStyle = fill; x.fillText(s, tx, ty);
    x.shadowBlur = 0; x.shadowOffsetY = 0; try { x.letterSpacing = '0px'; } catch (e) { /* noop */ }
    return x.measureText(s).width;
  };
  const goldText = (ty0, ty1) => { const g = x.createLinearGradient(0, ty0, 0, ty1); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.45, '#ffd24a'); g.addColorStop(0.55, '#e8a820'); g.addColorStop(1, '#8a5a10'); return g; };

  // name block (under portrait)
  text(d.name || 'Adventurer', px, py + pr + 58, '700 40px Cinzel, Georgia, serif', classColor(d.cls), { align: 'center', stroke: 5 });
  text(`${d.level ? 'Level ' + d.level + ' ' : ''}${d.race ? d.race.charAt(0).toUpperCase() + d.race.slice(1) + ' ' : ''}${CLASS_NAMES[d.cls] || ''}`, px, py + pr + 90, '600 20px "Roboto Condensed", Arial, sans-serif', '#e8dcc0', { align: 'center' });
  if (d.guild) text(`<${d.guild}>`, px, py + pr + 116, '600 18px "Roboto Condensed", Arial, sans-serif', '#a8a090', { align: 'center' });

  // headline
  const lx = 340;
  text(d.worldFirst ? 'WORLD FIRST' : 'DRAGON SLAIN', lx, 96, '900 30px Cinzel, Georgia, serif', d.worldFirst ? '#ff8000' : '#e8dcc0', { ls: '6px', stroke: 4 });
  text(d.dragonName || 'The Dragon', lx, 158, '900 50px Cinzel, Georgia, serif', goldText(118, 162), { stroke: 6 });
  let chipX = lx;
  const chip = (s, col) => {
    x.font = '700 18px "Roboto Condensed", Arial, sans-serif'; const w = x.measureText(s).width + 28;
    x.fillStyle = 'rgba(0,0,0,.55)'; x.strokeStyle = rgba(col, 0.9); x.lineWidth = 2; x.beginPath(); x.roundRect(chipX, 180, w, 32, 16); x.fill(); x.stroke();
    text(s, chipX + w / 2, 202, '700 18px "Roboto Condensed", Arial, sans-serif', col, { align: 'center', shadow: false });
    chipX += w + 10;
  };
  chip(`${ELEMENT_NAMES[d.element] || 'Ember'} Dragon`, E.glow);
  if (d.affix) chip(`Affix: ${d.affix}`, '#ffd35a');

  // parse number
  const pn = String(Math.floor(d.parse ?? 0));
  glow(lx + 110, 360, 190, pc, 0.3);
  x.font = '900 190px Cinzel, Georgia, serif';
  const pw = x.measureText(pn).width;
  const pgrad = x.createLinearGradient(0, 250, 0, 430); pgrad.addColorStop(0, mix(pc, '#ffffff', 0.55)); pgrad.addColorStop(0.5, pc); pgrad.addColorStop(1, shade(pc, -0.45));
  text(pn, lx - 6, 420, '900 190px Cinzel, Georgia, serif', pgrad, { stroke: 10, blur: 24 });
  text('PARSE', lx + pw + 18, 336, '900 34px Cinzel, Georgia, serif', pc, { stroke: 4, ls: '4px' });
  text('PERCENTILE', lx + pw + 18, 372, '700 22px Cinzel, Georgia, serif', '#e8dcc0', { stroke: 3, ls: '3px' });
  if (d.rank) text(`Rank #${fmtInt(d.rank.pos)} of ${fmtInt(d.rank.of)}`, lx + pw + 18, 408, '700 22px "Roboto Condensed", Arial, sans-serif', '#ffd35a', { stroke: 3 });

  // stats row
  // one output stat for the role (a healer's DPS is noise), then how many tries it took
  const out = d.hps && (d.role === 'heal' || !d.dps) ? ['HPS', fmtInt(d.hps)] : ['DPS', fmtInt(d.dps || 0)];
  const tries = d.attempts ? ['ATTEMPT', d.attempts === 1 ? 'FIRST TRY' : `#${d.attempts}`] : null;
  const stats = [['KILL TIME', fmtClock(d.time || 0)], out, tries, ['DATE', typeof d.date === 'string' ? d.date : (d.date || new Date()).toISOString().slice(0, 10)]].filter(Boolean);
  let sx = lx;
  for (const [k, v] of stats) {
    x.fillStyle = 'rgba(0,0,0,.45)'; x.strokeStyle = 'rgba(255,210,120,.45)'; x.lineWidth = 1.5; x.beginPath(); x.roundRect(sx, 458, 176, 76, 6); x.fill(); x.stroke();
    text(k, sx + 88, 486, '700 16px "Roboto Condensed", Arial, sans-serif', '#b8a888', { align: 'center', ls: '2px', shadow: false });
    text(v, sx + 88, 522, '700 32px "Roboto Condensed", Arial, sans-serif', '#ffffff', { align: 'center', stroke: 4 });
    sx += 188;
  }

  // footer: logo + URL
  text('EVERDAWN', W - 64, H - 62, '900 34px Cinzel, Georgia, serif', goldText(H - 92, H - 58), { align: 'right', ls: '5px', stroke: 5 });
  text('THE LAST SERVER · ' + (d.url || 'everdawn'), W - 64, H - 38, '700 15px "Roboto Condensed", Arial, sans-serif', '#c9b890', { align: 'right', ls: '3px' });
  return c;
}
