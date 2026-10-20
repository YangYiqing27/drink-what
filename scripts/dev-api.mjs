// Local integration preview: npm run build && node scripts/dev-api.mjs
// Uses an in-memory database; preview records disappear when the process exits.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import worker from '../worker.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
sqlite.exec(readFileSync(new URL('../migrations/0002_accounts.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  },
};
const root = resolve('dist');
const ASSETS = {
  async fetch(request) {
    let file = resolve(root, '.' + new URL(request.url).pathname);
    if (!file.startsWith(root + '/')) file = resolve(root, 'index.html');
    let bytes;
    try { bytes = readFileSync(file); } catch { file = resolve(root, 'index.html'); bytes = readFileSync(file); }
    return new Response(bytes, { headers: { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] || 'application/octet-stream' } });
  },
};
createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(`http://localhost:8788${req.url}`, {
      method: req.method, headers: req.headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const response = await worker.fetch(request, { DB, ASSETS });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('Preview error'); }
}).listen(8788, '127.0.0.1', () => console.log('Integration preview: http://localhost:8788 (temporary database)'));
