// Watch-mode check: starts "Watch the Raid" from the title and screenshots the director camera at several points
// of the fight (fast-forwarded with manual frame stepping). usage: node tools/watch.mjs [--shots=dir] [--el=ember]
import puppeteer from 'puppeteer-core';
const arg = (k, d) => { const a = process.argv.find(a => a.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const dir = arg('shots', '.'), el = arg('el', '');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load/.test(m.text())) errs.push(m.text()); });
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5199/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.mode === 'title', { timeout: 60000 });
await page.evaluate(el => { if (el) __game.dragon.element = el; [...document.querySelectorAll('button')].find(b => /watch the raid/i.test(b.textContent)).click(); }, el);
await page.waitForFunction(() => __game.mode === 'raid', { timeout: 30000 });
const snap = async (name, secs) => {
  const st = await page.evaluate(async secs => { const A = __game; A.step(Math.round(secs * 30), 1 / 30); A.manual = false; await new Promise(r => setTimeout(r, 700)); const R = A.raid; return R ? { t: Math.round(R.totalT), state: R.state, phase: R.boss.brain.phase, boss: Math.round(R.boss.hpPct * 100), shot: A.dcam.shot, alive: R.raiders.filter(m => !m.dead).length } : { mode: A.mode }; }, secs);
  await page.screenshot({ path: `${dir}/watch_${name}.png` });
  console.log(name, JSON.stringify(st));
  return st;
};
await snap('prepull', 6);
await snap('pull', 36);
let st = await snap('p1', 40);
for (let i = 0; i < 40 && st.phase < 2 && st.state !== 'victory'; i++) st = await page.evaluate(() => { __game.step(150, 1 / 30); const R = __game.raid; return { phase: R.boss.brain.phase, state: R.state }; });
await snap('p2', 6);
for (let i = 0; i < 60 && st.phase < 3 && st.state !== 'victory'; i++) st = await page.evaluate(() => { __game.step(150, 1 / 30); const R = __game.raid; return { phase: R.boss.brain.phase, state: R.state }; });
await snap('p3', 4);
for (let i = 0; i < 120 && st.state !== 'victory'; i++) st = await page.evaluate(() => { __game.step(150, 1 / 30); const R = __game.raid; return { phase: R.boss.brain.phase, state: R.state }; });
await snap('kill', 3);
const end = await page.evaluate(async () => { __game.manual = false; await new Promise(r => setTimeout(r, 16000)); return { mode: __game.mode, player: !!__game.game.player, watching: !!__game.watching, saved: Object.keys(JSON.parse(localStorage.getItem('everdawn.v1') || '{"chars":{}}').chars) }; });
await page.screenshot({ path: `${dir}/watch_end.png` });
console.log('end', JSON.stringify(end), 'errors', JSON.stringify(errs.slice(0, 6)));
await browser.close();
