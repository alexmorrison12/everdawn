// Tiny static file server. usage: node tools/serve.mjs <dir> <port>
import http from 'http'; import fs from 'fs'; import path from 'path';
const [dir = 'dist', port = 5173] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const root = path.resolve(dir), f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); res.end('403'); return; }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(+port, '127.0.0.1', () => console.log(`serving ${dir} on http://localhost:${port} (loopback only)`));
