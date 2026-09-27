// Contact sheet: node tools/contact.mjs out.png cols img1.png img2.png ...   (labels = file names)
import puppeteer from 'puppeteer-core'; import fs from 'fs'; import path from 'path';
const [out, colsS, ...imgs] = process.argv.slice(2); const cols = +colsS || 3;
const W = 1800, cw = Math.floor(W / cols);
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:0">` + imgs.map(f => `<div style="position:relative"><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" style="width:${cw}px;display:block"><div style="position:absolute;left:4px;top:2px;color:#ff0;font:bold 14px sans-serif;text-shadow:0 0 3px #000">${path.basename(f)}</div></div>`).join('') + '</body>';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: W, height: 1000 } });
const p = await b.newPage(); await p.setContent(html, { waitUntil: 'load' });
const h = await p.evaluate(() => document.body.scrollHeight); await p.setViewport({ width: W, height: h });
await p.screenshot({ path: out }); await b.close(); console.log(out);
