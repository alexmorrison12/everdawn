// Builds a standalone lab page from an entry file: node tools/lab.mjs src/lab/foo.js  -> dist/lab/foo.html
import * as esbuild from 'esbuild';
import fs from 'fs'; import path from 'path';
const entry = process.argv[2];
const name = path.basename(entry, '.js');
const r = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'iife', write: false, target: 'es2022', sourcemap: 'inline', logLevel: 'warning', define: { __DEV__: 'true' } });
fs.mkdirSync('dist/lab', { recursive: true });
const css = fs.existsSync('src/ui') ? fs.readdirSync('src/ui').filter(f => f.endsWith('.css')).map(f => fs.readFileSync('src/ui/' + f, 'utf8')).join('\n') : '';
fs.writeFileSync(`dist/lab/${name}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111;color:#ddd;font:12px sans-serif;overflow:hidden}${css}</style></head><body><script>${r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
console.log(`dist/lab/${name}.html`);
