// Deterministic random numbers and smooth value noise, so the valley, trees and screenshots
// come out the same on every run.

/** Mulberry32: a small fast PRNG returning floats in [0, 1). */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise on an integer lattice with a quintic fade, seeded by a permutation table. */
export function createValueNoise(seed) {
  const rand = createRandom(seed);
  const size = 256;
  const values = new Float32Array(size);
  const perm = new Uint16Array(size * 2);
  for (let i = 0; i < size; i++) values[i] = rand() * 2 - 1;
  const order = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let i = 0; i < size * 2; i++) perm[i] = order[i & 255];

  const lattice = (ix, iz) => values[perm[(perm[ix & 255] + iz) & 511]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  return function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = fade(x - ix);
    const fz = fade(z - iz);
    const a = lattice(ix, iz);
    const b = lattice(ix + 1, iz);
    const c = lattice(ix, iz + 1);
    const d = lattice(ix + 1, iz + 1);
    return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
  };
}

/** Fractal sum of value noise: octaves of halving amplitude and doubling frequency. */
export function fractalNoise(noise, x, z, octaves, ridged = false) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = noise(x * freq + o * 17.3, z * freq - o * 9.1);
    if (ridged) n = 1 - Math.abs(n) * 2;
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
