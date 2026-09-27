// Headless screenshot helper for visual QA.
// usage: node tools/shot.mjs <url> <out.png> [--w=1600] [--h=900] [--wait=3000] [--eval="js"] [--evalAfter="js"]
import puppeteer from 'puppeteer-core';
const args = Object.fromEntries(process.argv.slice(4).map(a => { const m = a.match(/^--([^=]+)=(.*)$/s); return m ? [m[1], m[2]] : [a, true]; }));
const [url, out] = process.argv.slice(2);
const W = +(args.w || 1600), H = +(args.h || 900);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
if (args.eval) { try { const r = await page.evaluate(args.eval); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); } catch (e) { logs.push('[eval-error] ' + e.message); } }
await new Promise(r => setTimeout(r, +(args.wait || 3000)));
if (args.evalAfter) { try { const r = await page.evaluate(args.evalAfter); if (r !== undefined) logs.push('[evalAfter] ' + JSON.stringify(r)); } catch (e) { logs.push('[evalAfter-error] ' + e.message); } }
await page.screenshot({ path: out });
console.log(logs.slice(-40).join('\n'));
await browser.close();
