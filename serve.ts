// Serves game/ on http://localhost:8080 (Node 22, standard library only) so Halcyon Ridge can be
// played locally: `node serve.ts`, then open the address in desktop Chrome. `--port N` changes it.
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const flag = process.argv.indexOf('--port');
const port = flag > 0 ? Number(process.argv[flag + 1]) || 8080 : 8080;
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
  const wanted = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname));
  const path = resolve(join(root, wanted.endsWith('/') ? `${wanted}index.html` : wanted));
  if (path !== root && !path.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Halcyon Ridge on http://localhost:${port}/`));
