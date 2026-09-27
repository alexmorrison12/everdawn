// Bundles src/ into one self-contained HTML file.
//   dist/index.html     full standalone document (double-click or serve)
//   dist/artifact.html  content-only page for a Claude Artifact (host adds doctype/head/body)
// usage: node build.mjs [--min] [--watch] [--out=dir]
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const MIN = process.argv.includes('--min');
const WATCH = process.argv.includes('--watch');
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '--out=dist').slice(6);

function readCss() {
  const dir = 'src/ui';
  if (!fs.existsSync(dir)) return '';
  return fs.readdirSync(dir).filter(f => f.endsWith('.css')).sort()
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
}

function writePages(js) {
  js = js.replace(/<\/script/gi, '<\\/script');
  const page = fs.readFileSync('src/index.html', 'utf8')
    .replace('/*__CSS__*/', () => readCss())
    .replace('/*__JS__*/', () => js);
  fs.mkdirSync(OUT, { recursive: true });
  // gallery name for the Claude Artifact build; the standalone page keeps the full title for link previews
  fs.writeFileSync(`${OUT}/artifact.html`, page.replace(/<title>[^<]*<\/title>/, '<title>Everdawn</title>'));
  const split = page.indexOf('</style>') + '</style>'.length;
  const desc = 'A single-player MMO in your browser. Every other player is an AI. The leaderboard is real.';
  const meta = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<meta name="description" content="${desc}">`,
    '<meta name="theme-color" content="#0b0a12">',
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#c07a1c"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#140f1c"/><path d="M10 44a22 22 0 0 1 44 0z" fill="url(#g)"/><g stroke="#ffd26a" stroke-width="4" stroke-linecap="round"><path d="M32 8v8M12 18l6 6M52 18l-6 6M4 34h8M52 34h8"/></g><rect x="6" y="46" width="52" height="5" rx="2.5" fill="#ffd26a"/></svg>')}">`,
    '<meta property="og:title" content="EVERDAWN — The Last Server">',
    `<meta property="og:description" content="${desc}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:url" content="https://alexmorrison12.github.io/everdawn/">',
    '<meta property="og:image" content="https://alexmorrison12.github.io/everdawn/og.jpg">',
    '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].join('\n');
  const doc = `<!doctype html>\n<html lang="en">\n<head>\n${meta}\n${page.slice(0, split)}\n</head>\n<body>\n${page.slice(split)}\n</body>\n</html>\n`;
  fs.writeFileSync(`${OUT}/index.html`, doc);
  // static extras (the social preview image) ship beside the page
  if (fs.existsSync('public')) for (const f of fs.readdirSync('public')) fs.copyFileSync(path.join('public', f), path.join(OUT, f));
  return page.length;
}

const opts = {
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: MIN,
  format: 'iife',
  write: false,
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'warning',
  sourcemap: MIN ? false : 'inline',
  define: { __DEV__: MIN ? 'false' : 'true' },
};

if (WATCH) {
  const ctx = await esbuild.context({
    ...opts,
    plugins: [{
      name: 'html', setup(b) {
        b.onEnd(r => {
          if (r.errors.length) return;
          const t = Date.now();
          const size = writePages(r.outputFiles[0].text);
          console.log(`[${new Date().toLocaleTimeString()}] built ${(size / 1024).toFixed(0)} KB (${Date.now() - t}ms html)`);
        });
      },
    }],
  });
  await ctx.watch();
  // CSS/HTML are not part of the JS graph: poll them and trigger rebuilds.
  let last = '';
  setInterval(() => {
    const sig = ['src/index.html', ...(fs.existsSync('src/ui') ? fs.readdirSync('src/ui').map(f => 'src/ui/' + f) : [])]
      .map(f => { try { return f + fs.statSync(f).mtimeMs; } catch { return f; } }).join('|');
    if (last && sig !== last) ctx.rebuild().catch(() => {});
    last = sig;
  }, 500);
  console.log('watching…');
} else {
  const t0 = Date.now();
  const r = await esbuild.build(opts);
  const size = writePages(r.outputFiles[0].text);
  console.log(`built in ${Date.now() - t0}ms, ${(size / 1024).toFixed(0)} KB`);
}
