// The valley: one height function shared by the terrain mesh, the flight model's ground contact,
// tree placement and the minimap, so what you see is what you hit.
import * as THREE from 'three';
import { WORLD_SIZE, TERRAIN_SEGMENTS, WORLD_SEED, AIRFIELDS, PALETTE, headingToVector } from './world-config.js';
import { createValueNoise, fractalNoise, smoothstep, lerp } from './seeded-random.js';

const noiseA = createValueNoise(WORLD_SEED);
const noiseB = createValueNoise(WORLD_SEED + 101);

/** X position of the Halcyon river's centre line at a given z. */
export function riverCentreX(z) {
  return 600 * Math.sin(z / 1400) - 200 + 90 * Math.sin(z / 380);
}

/** Signed position of (x, z) in an airfield's runway frame: along the runway and across it. */
export function runwayFrame(field, x, z) {
  const dir = headingToVector(field.headingDeg);
  const dx = x - field.x;
  const dz = z - field.z;
  return { along: dx * dir.x + dz * dir.z, across: dx * dir.z - dz * dir.x };
}

function rawHeight(x, z) {
  const d = Math.abs(x - riverCentreX(z));
  const valley = smoothstep(260, 1700, d);
  const rolling = 34 + 70 * fractalNoise(noiseA, x / 1300, z / 1300, 4);
  const ridges = fractalNoise(noiseB, x / 1050, z / 1050, 5, true) * 0.5 + 0.5;
  const mountains = valley * (140 + 520 * ridges * ridges);
  const rim = Math.max(Math.abs(x), Math.abs(z));
  const edge = smoothstep(2300, 3450, rim) * 520;
  const riverbed = (1 - smoothstep(0, 140, d)) * 48;
  return rolling + mountains + edge - riverbed;
}

/** Terrain height in metres at world (x, z), with each airfield graded flat. */
export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const field of AIRFIELDS) {
    const { along, across } = runwayFrame(field, x, z);
    const outAlong = Math.max(0, Math.abs(along) - (field.length / 2 + 140));
    const outAcross = Math.max(0, Math.abs(across) - (field.width / 2 + 90));
    const outside = Math.hypot(outAlong, outAcross);
    const blend = 1 - smoothstep(0, 320, outside);
    if (blend > 0) h = lerp(h, field.elevation, blend);
  }
  return h;
}

/** Steepness at (x, z): 0 for flat ground, rising toward 1 on cliffs. */
export function slopeAt(x, z) {
  const e = 12;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.min(1, Math.hypot(dx, dz) / (2 * e));
}

const colorScratch = new THREE.Color();
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

/** Ground colour from height and slope: river sand, meadow, forest, scree and snow caps. */
export function groundColour(h, slope, jitter) {
  const c = colorScratch;
  if (h < 6) return c.set(PALETTE.sand);
  tmpA.set(PALETTE.meadow);
  tmpB.set(PALETTE.forest);
  c.copy(tmpA).lerp(tmpB, smoothstep(70, 190, h + jitter * 40));
  tmpA.set(PALETTE.rock);
  c.lerp(tmpA, Math.max(smoothstep(0.55, 0.95, slope), smoothstep(330, 470, h + jitter * 30)));
  tmpA.set(PALETTE.snow);
  c.lerp(tmpA, smoothstep(560, 640, h + jitter * 50) * (1 - smoothstep(0.85, 1.2, slope)));
  return c;
}

/** Builds the terrain mesh with per-vertex colours and flat-ish lighting normals. */
export function buildTerrainMesh() {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const jitter = noiseA(x / 90, z / 90);
    const c = groundColour(h, slopeAt(x, z), jitter);
    const shade = 0.93 + jitter * 0.07;
    colours[i * 3] = c.r * shade;
    colours[i * 3 + 1] = c.g * shade;
    colours[i * 3 + 2] = c.b * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

/** The river and lakes: a translucent plane at sea level the riverbed dips under. */
export function buildWaterPlane() {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 90, specular: 0x9fd4ff, transparent: true, opacity: 0.88 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.5;
  mesh.name = 'water';
  return mesh;
}
