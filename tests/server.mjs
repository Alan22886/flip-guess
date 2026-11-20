import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const output = new URL('../dist/', import.meta.url);
const legacy = new URL('../翻转猜词_v59_词库添加删除修复.html', import.meta.url);
const digest = data => createHash('sha256').update(data).digest('base64');
const original = await readFile(new URL('index.html', output));
const updated = Buffer.from(original.toString().replace('<title>', '<meta name="test-release" content="2"><title>'));
const worker = await readFile(new URL('sw.js', output), 'utf8');
const updateWorker = worker.replace(digest(original), digest(updated)).replace(/'[a-f0-9]{64}'/, "'test-release-2'");
let release = 'original';
const types = {html: 'text/html; charset=utf-8', webmanifest: 'application/manifest+json', js: 'text/javascript', png: 'image/png'};
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST' && path.startsWith('/__release/')) {
      release = path.split('/').at(-1);
      res.end(release);
      return;
    }
    if (release === 'offline' && path.startsWith('/flip-guess/')) {
      req.socket.destroy();
      return;
    }
    if (path === '/health') {
      res.setHeader('Content-Type', types.html);
      res.end('<!doctype html><title>Test server</title>');
      return;
    }
    if (path === '/legacy.html') {
      const content = await readFile(legacy);
      res.setHeader('Content-Type', types.html);
      res.end(content);
      return;
    }
    const file = path.replace(/^\/flip-guess\//, '') || 'index.html';
    if (!path.startsWith('/flip-guess/') ||
        !/^(index\.html|sw\.js|manifest\.webmanifest|assets\/[a-z0-9-]+\.png)$/.test(file)) {
      res.writeHead(404).end();
      return;
    }
    const content = file === 'sw.js' && release !== 'original' ? updateWorker :
      file === 'index.html' && release === 'updated' ? updated :
      await readFile(new URL(file, output));
    res.setHeader('Content-Type', types[file.split('.').at(-1)]);
    res.end(content);
  } catch {
    res.writeHead(404).end();
  }
}).listen(4173, '127.0.0.1');
