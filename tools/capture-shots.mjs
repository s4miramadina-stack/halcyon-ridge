// Takes the maker's screenshots: serves game/ locally, opens each `?shot=` pose in headless
// Chromium at 1280x800 and saves the game's own render as a JPEG in screenshots/.
// Usage: NODE_PATH=<dir with playwright-core> node tools/capture-shots.mjs
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');

const ROOT = new URL('../game/', import.meta.url).pathname;
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const SHOTS = [
  ['1-final-approach.jpg', 'final-approach'],
  ['2-cockpit-rings.jpg', 'cockpit-rings'],
  ['3-river-bank.jpg', 'river-bank'],
  ['4-ridge-recon.jpg', 'ridge-recon'],
];

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
  try {
    const body = await readFile(join(ROOT, path || 'index.html'));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(8093, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.log('[error]', e.message));
for (const [file, name] of SHOTS) {
  await page.goto(`http://localhost:8093/index.html?shot=${name}`, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000, polling: 1000 });
  const data = await page.evaluate(() => window.__shotData);
  await writeFile(join(OUT, file), Buffer.from(data.split(',')[1], 'base64'));
  console.log(file, (await stat(join(OUT, file))).size, 'bytes');
}
await browser.close();
server.close();
