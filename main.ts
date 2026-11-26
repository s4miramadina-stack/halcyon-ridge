// Halcyon Ridge hands itself in (Node 22, standard library only). It copies the static game in
// game/ and the maker's screenshots in screenshots/ to /output, checks both against the bounty's
// gate first so a bad hand-in fails loudly here rather than at the scorer, and writes
// /output/dossier.json with the kit's unchanged make.fun library.
// Locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Reads a JPEG's or PNG's pixel size from its header, no image library needed. */
function imageSize(bytes: Buffer): { w: number; h: number } | null {
  if (bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: bytes.readUInt16BE(i + 5), w: bytes.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  return null;
}

/** The gate's screenshot rule: 3 or 4 images, each at most 256 KiB, long side ≤1280, short ≥480. */
function checkScreenshots(dir: string): void {
  const files = readdirSync(dir).filter((f) => !f.startsWith('.')).sort();
  if (files.length < 3 || files.length > 4) throw new Error(`screenshots/: need 3 or 4 images, found ${files.length}`);
  for (const f of files) {
    const path = join(dir, f);
    if (statSync(path).size > 262144) throw new Error(`screenshots/${f} is over 256 KiB`);
    const size = imageSize(readFileSync(path));
    if (!size) throw new Error(`screenshots/${f} is not a whole PNG or JPEG`);
    const long = Math.max(size.w, size.h);
    const short = Math.min(size.w, size.h);
    if (long > 1280 || short < 480) throw new Error(`screenshots/${f} is ${size.w}x${size.h}, outside 1280 long / 480 short`);
  }
}

checkScreenshots(join(here, 'screenshots'));
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
