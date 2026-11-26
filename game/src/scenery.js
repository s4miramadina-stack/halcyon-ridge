// Everything standing on the valley floor or floating in its sky: runways with their markings and
// lights, hangars, forests, clouds, the sky dome, mission rings and ridge beacons.
import * as THREE from 'three';
import { AIRFIELDS, PALETTE, WORLD_SIZE, headingToVector } from './world-config.js';
import { heightAt, slopeAt, runwayFrame, riverCentreX } from './terrain.js';
import { createRandom } from './seeded-random.js';

/** A runway slab with threshold bars, centre-line dashes, numbers-style blocks and edge lights. */
export function buildRunway(field) {
  const group = new THREE.Group();
  group.name = `runway-${field.id}`;
  const heading = (field.headingDeg * Math.PI) / 180;
  group.position.set(field.x, field.elevation + 0.15, field.z);
  group.rotation.y = -heading;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(field.width, 0.3, field.length),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  group.add(slab);
  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(field.width + 16, 0.12, field.length + 40),
    new THREE.MeshLambertMaterial({ color: 0x8c9a6a }),
  );
  shoulder.position.y = -0.12;
  group.add(shoulder);

  const paint = new THREE.MeshBasicMaterial({ color: PALETTE.marking });
  const dash = new THREE.BoxGeometry(1.2, 0.05, 18);
  for (let s = -field.length / 2 + 80; s < field.length / 2 - 80; s += 36) {
    const m = new THREE.Mesh(dash, paint);
    m.position.set(0, 0.17, s);
    group.add(m);
  }
  const bar = new THREE.BoxGeometry(1.6, 0.05, 26);
  for (const end of [-1, 1]) {
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const m = new THREE.Mesh(bar, paint);
      m.position.set(i * (field.width / 12), 0.17, end * (field.length / 2 - 20));
      group.add(m);
    }
    const aim = new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 40), paint);
    aim.position.set(-6, 0.17, end * (field.length / 2 - 150));
    group.add(aim);
    const aim2 = aim.clone();
    aim2.position.x = 6;
    group.add(aim2);
  }

  const lightGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const edgeLight = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const endLight = new THREE.MeshBasicMaterial({ color: 0x5dff7a });
  for (let s = -field.length / 2; s <= field.length / 2; s += 60) {
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(lightGeo, Math.abs(s) >= field.length / 2 - 1 ? endLight : edgeLight);
      l.position.set(side * (field.width / 2 + 2), 0.5, s);
      group.add(l);
    }
  }
  // Approach lights leading in from the south end.
  const approach = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let k = 1; k <= 8; k++) {
    const l = new THREE.Mesh(lightGeo, approach);
    const z = field.length / 2 + k * 30;
    l.position.set(0, heightAt(field.x, field.z) - field.elevation + 1.2, z);
    group.add(l);
  }
  return group;
}

/** Hangars, a control tower, a fuel tank and a windsock beside an airfield. */
export function buildAirfieldBuildings(field, rand) {
  const group = new THREE.Group();
  const dir = headingToVector(field.headingDeg);
  const side = { x: dir.z * -1, z: dir.x };
  const place = (along, across, mesh) => {
    const x = field.x + dir.x * along + -side.x * across;
    const z = field.z + dir.z * along + -side.z * across;
    mesh.position.set(x, field.elevation, z);
    mesh.rotation.y = -(field.headingDeg * Math.PI) / 180;
    group.add(mesh);
  };
  const roofColours = [0xb3412f, 0x2f5f8a, 0xc9a23a];
  for (let i = 0; i < 3; i++) {
    const hangar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 22), new THREE.MeshLambertMaterial({ color: 0xd9d4c7 }));
    body.position.y = 4.5;
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(13, 13, 22, 12, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color: roofColours[i % 3] }),
    );
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.y = 9;
    roof.scale.set(1, 1, 0.35);
    hangar.add(body, roof);
    place(-200 + i * 40 + rand() * 6, field.width / 2 + 60, hangar);
  }
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(5, 18, 5), new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }));
  shaft.position.y = 9;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 8), new THREE.MeshPhongMaterial({ color: 0x3a6f8c, emissive: 0x0c2a3a, shininess: 80 }));
  cab.position.y = 20;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(9, 0.8, 9), new THREE.MeshLambertMaterial({ color: 0x8a2d22 }));
  cap.position.y = 22.4;
  tower.add(shaft, cab, cap);
  place(-60, field.width / 2 + 70, tower);

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 8, 16), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
  tank.position.y = 4;
  const tankGroup = new THREE.Group();
  tankGroup.add(tank);
  place(60, field.width / 2 + 55, tankGroup);

  const sock = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0x777777 }));
  pole.position.y = 4;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xff6a1a, side: THREE.DoubleSide }));
  cone.rotation.z = Math.PI / 2;
  cone.position.set(2, 7.6, 0);
  sock.add(pole, cone);
  place(field.length / 2 - 120, -(field.width / 2 + 25), sock);
  return group;
}

/** Instanced conifers and broadleaf trees over the meadows and forest belts, clear of runways. */
export function buildForest(rand, count = 2600) {
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 5);
  const crownGeo = new THREE.ConeGeometry(3.6, 11, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a3d26 }), count);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  let placed = 0;
  let tries = 0;
  while (placed < count && tries < count * 12) {
    tries++;
    const x = (rand() - 0.5) * WORLD_SIZE * 0.86;
    const z = (rand() - 0.5) * WORLD_SIZE * 0.86;
    const h = heightAt(x, z);
    if (h < 10 || h > 470 || slopeAt(x, z) > 0.75) continue;
    if (Math.abs(x - riverCentreX(z)) < 70) continue;
    let nearRunway = false;
    for (const field of AIRFIELDS) {
      const f = runwayFrame(field, x, z);
      if (Math.abs(f.along) < field.length / 2 + 260 && Math.abs(f.across) < field.width / 2 + 120) nearRunway = true;
    }
    if (nearRunway) continue;
    const scale = 0.7 + rand() * 0.9;
    s.set(scale, scale, scale);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI * 2);
    p.set(x, h + 2 * scale, z);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);
    p.y = h + 8.5 * scale;
    m.compose(p, q, s);
    crowns.setMatrixAt(placed, m);
    c.setHSL(0.27 + rand() * 0.07, 0.45 + rand() * 0.2, 0.2 + rand() * 0.12);
    crowns.setColorAt(placed, c);
    placed++;
  }
  trunks.count = placed;
  crowns.count = placed;
  const group = new THREE.Group();
  group.name = 'forest';
  group.add(trunks, crowns);
  return group;
}

/** A sky dome with a vertical gradient from deep blue to a hazy horizon and a warm sun glow. */
export function buildSkyDome() {
  const geo = new THREE.SphereGeometry(9000, 32, 16);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const sunDir = new THREE.Vector3(0.45, 0.35, -0.82).normalize();
  const warm = new THREE.Color(0xffe2b0);
  const colours = [];
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    v.fromBufferAttribute(geo.attributes.position, i).normalize();
    const t = Math.pow(Math.max(0, v.y), 0.55);
    c.copy(horizon).lerp(top, t);
    const glow = Math.pow(Math.max(0, v.dot(sunDir)), 6);
    c.lerp(warm, glow * 0.6);
    colours.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(geo, mat);
  dome.name = 'sky';
  return dome;
}

/** Soft cumulus made of clustered low-poly spheres, scattered at 700–1100 m. */
export function buildClouds(rand, count = 46) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x9aa8b8, transparent: true, opacity: 0.92 });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const n = 4 + Math.floor(rand() * 5);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(puff, mat);
      const r = 45 + rand() * 60;
      m.scale.set(r * 1.4, r * 0.7, r);
      m.position.set((k - n / 2) * 55 + rand() * 30, rand() * 25, rand() * 50);
      cloud.add(m);
    }
    cloud.position.set((rand() - 0.5) * WORLD_SIZE, 700 + rand() * 400, (rand() - 0.5) * WORLD_SIZE);
    cloud.rotation.y = rand() * Math.PI;
    group.add(cloud);
  }
  return group;
}

/** A mission ring: a glowing torus the pilot must thread, with a lit inner rim. */
export function buildRing(radius = 26) {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 2.2, 10, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.ring }),
  );
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(radius - 3, 0.5, 6, 40),
    new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.8 }),
  );
  group.add(outer, inner);
  group.userData.outer = outer;
  return group;
}

/** A ridge beacon: a striped mast with a pulsing lamp, the target of the recon mission. */
export function buildBeacon() {
  const group = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2 - i * 0.12, 1.3 - i * 0.12, 6, 8),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xffffff : 0xd8322a }),
    );
    seg.position.y = 3 + i * 6;
    group.add(seg);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  lamp.position.y = 38;
  group.add(lamp);
  group.userData.lamp = lamp;
  return group;
}

/** Builds every static scenery piece and adds it to the scene. */
export function populateScenery(scene) {
  const rand = createRandom(4242);
  scene.add(buildSkyDome());
  scene.add(buildClouds(rand));
  scene.add(buildForest(rand));
  for (const field of AIRFIELDS) {
    scene.add(buildRunway(field));
    scene.add(buildAirfieldBuildings(field, rand));
  }
}
