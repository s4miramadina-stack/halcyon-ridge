// Halcyon Ridge — shared world constants: the map, the two airfields and the units the HUD shows.

export const WORLD_SIZE = 7000;          // metres, square map centred on the origin
export const TERRAIN_SEGMENTS = 220;     // grid cells per side of the terrain mesh
export const SEA_LEVEL = 0;
export const WORLD_SEED = 7331;

// Airfields: centre (x, z), runway heading in degrees (0 = north = -Z), length and width in metres.
export const AIRFIELDS = [
  { id: 'HAL', name: 'Halcyon Field', x: -140, z: 1500, headingDeg: 345, length: 1100, width: 34, elevation: 38 },
  { id: 'PIN', name: 'Pinecrest Strip', x: -360, z: -2050, headingDeg: 15, length: 760, width: 24, elevation: 96 },
];

export const MS_TO_KNOTS = 1.94384;
export const M_TO_FEET = 3.28084;
export const GRAVITY = 9.81;

export const PALETTE = {
  skyTop: 0x2f6fb5,
  skyHorizon: 0xcfe3f2,
  fog: 0xbfd6e8,
  water: 0x2d6f8f,
  sand: 0xd8c690,
  meadow: 0x6f9a3c,
  forest: 0x3f6b2a,
  rock: 0x8a8174,
  snow: 0xf2f4f7,
  runway: 0x3b3d42,
  marking: 0xf4f1e6,
  ring: 0xff8a1f,
  ringNext: 0x4dfcff,
};

/** Converts a compass heading in degrees to the world direction (x, z) the nose points along. */
export function headingToVector(deg) {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** Converts a world direction (x, z) back to a compass heading in [0, 360). */
export function vectorToHeading(x, z) {
  let deg = (Math.atan2(x, -z) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}
