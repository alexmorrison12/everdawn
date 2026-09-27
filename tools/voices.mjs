// Checks the Claude-voiced SimPlayer replies against a mocked artifact runtime (window.claude.use('sample')).
// usage: node tools/voices.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.evaluateOnNewDocument(() => {
  window.__prompts = [];
  const sample = async (input, opts) => { window.__prompts.push({ input, opts }); await new Promise(r => setTimeout(r, 300)); return { text: 'Stablock8: "lol no im totally real, want to run the mine?"', truncated: false, modelTierApplied: 'quick' }; };
  window.claude = { use: async name => (name === 'sample' ? sample : null) };
});
await page.setViewport({ width: 1600, height: 900 });
await page.goto('http://localhost:5199/index.html?cls=mage', { waitUntil: 'load' });
await page.waitForFunction(() => window.__game && window.__game.mode === 'world', { timeout: 60000 });
const r = await page.evaluate(async () => {
  const g = __game.game, s = g.social.sims[0];
  g.social.playerChat(`/w ${s.name} are you a bot?`);
  await new Promise(r => setTimeout(r, 2500));
  const lines = [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => t.includes(s.name)).slice(-2);
  g.social.playerChat(`/w ${s.name} spam`); g.social.playerChat(`/w ${s.name} spam again`); // second one must fall back (one call at a time)
  await new Promise(r => setTimeout(r, 4500));
  return { sim: s.name, arch: s.persona.arch, calls: __prompts.length, tier: __prompts[0]?.opts, promptHead: __prompts[0]?.input.slice(0, 260), promptTail: __prompts[0]?.input.slice(-160), lines, after: [...document.querySelectorAll('.evd-chat .ln')].map(l => l.textContent).filter(t => t.includes(s.name)).slice(-3) };
});
console.log(JSON.stringify(r, null, 1), 'errors', errs);
await browser.close();
