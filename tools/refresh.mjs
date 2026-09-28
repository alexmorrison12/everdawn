// Repro: host a world, reload the page, then try the title buttons again.
import puppeteer from 'puppeteer-core';
const url = process.argv[2] || 'http://localhost:5199/index.html';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warn') errs.push(m.type() + ' ' + m.text().slice(0, 200)); });
const ready = () => p.waitForFunction(() => window.__game && __game.mode === 'title', { timeout: 90000 });
const click = t => p.evaluate(t => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase() === t.toLowerCase() && x.offsetParent); if (!b) return 'no button ' + t; b.click(); return 'clicked ' + t; }, t);
const state = () => p.evaluate(() => ({ mode: __game.mode, net: !!__game.net, code: __game.net?.code, popups: [...document.querySelectorAll('button')].filter(x => x.offsetParent).map(x => x.textContent.trim()).slice(0, 14), top: (() => { const e = document.elementFromPoint(640, 360); return e && (e.className || e.tagName); })() }));
await p.goto(url, { waitUntil: 'load' }); await ready();
await p.evaluate(() => localStorage.clear());
if (!process.argv.includes('--solo')) { console.log(await click('Play Together')); await new Promise(r => setTimeout(r, 400)); console.log(await click('Host a World')); await new Promise(r => setTimeout(r, 600)); }
else { console.log(await click('Enter World')); await new Promise(r => setTimeout(r, 600)); }
console.log(JSON.stringify(await state()));
// create a character through the create screen
await p.evaluate(() => { const A = __game; A.ui.emit('create:submit', { ...A.ui.create.get(), name: 'Refreshy', cls: 'mage', race: 'human', sex: 'male' }); });
await new Promise(r => setTimeout(r, 4000));
console.log('after enter', JSON.stringify(await state()));
await p.reload({ waitUntil: 'load' }); await ready(); await new Promise(r => setTimeout(r, 1500));
console.log('after reload', JSON.stringify(await state()));
console.log(await click('Enter World')); await new Promise(r => setTimeout(r, 800));
console.log('enter', JSON.stringify(await state()));
console.log('popup dom', await p.evaluate(() => { const els = [...document.querySelectorAll('[class*=popup], [class*=dialog]')]; return els.map(e => e.className + ' vis=' + !!e.offsetParent + ' txt=' + e.textContent.slice(0, 60)).slice(0, 6).join(' | '); }));
console.log(await click('Continue')); await new Promise(r => setTimeout(r, 3000));
console.log('continue', JSON.stringify(await state()));
console.log('errors', JSON.stringify(errs.slice(0, 10)));
await b.close();
