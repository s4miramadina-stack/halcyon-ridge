// Particle effects so landings and crashes read as what happened: a dust puff at each touchdown,
// and fire with a rising smoke column at a wreck.
import * as THREE from 'three';

export function createEffects(scene) {
  const MAX = 220;
  const geo = new THREE.SphereGeometry(1, 7, 5);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);
  const parts = [];
  const fx = { burning: false, wreckPos: new THREE.Vector3(), spawnTimer: 0 };
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let seed = 99;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  function spawn(pos, vel, size, grow, life, colour) {
    if (parts.length >= MAX) parts.shift();
    parts.push({ pos: pos.clone(), vel, size, grow, life, age: 0, colour: new THREE.Color(colour) });
  }

  /** A ring of tan dust kicked up by the wheels. */
  fx.dust = (pos) => {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 4, 1 + rnd(), Math.sin(a) * 4);
      spawn(pos.clone().setY(pos.y - 1.4), v, 0.8, 2.2, 1.4 + rnd() * 0.6, 0xcbb68f);
    }
  };

  /** Starts the fire and smoke at a crash site. */
  fx.wreck = (pos) => {
    fx.burning = true;
    fx.wreckPos.copy(pos);
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3(rnd() - 0.5, rnd() * 0.8 + 0.2, rnd() - 0.5).multiplyScalar(18);
      spawn(pos, v, 1.5, 3, 0.9, i % 2 ? 0xffa53a : 0xff5a1f);
    }
  };

  fx.reset = () => {
    fx.burning = false;
    parts.length = 0;
  };

  fx.update = (dt) => {
    if (fx.burning) {
      fx.spawnTimer -= dt;
      while (fx.spawnTimer < 0) {
        fx.spawnTimer += 0.06;
        spawn(fx.wreckPos, new THREE.Vector3(rnd() - 0.5, 6 + rnd() * 3, rnd() - 0.5), 1.6, 4.5, 4 + rnd() * 2, 0x3a3836);
        spawn(fx.wreckPos, new THREE.Vector3(rnd() - 0.5, 3, rnd() - 0.5), 1.2, 0.5, 0.5, 0xff8a2a);
      }
    }
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) {
        parts.splice(i, 1);
        continue;
      }
      p.pos.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(1 - dt * 0.8);
      const s = p.size + p.grow * p.age;
      m4.makeScale(s, s, s).setPosition(p.pos);
      mesh.setMatrixAt(n, m4);
      col.copy(p.colour).multiplyScalar(1 - (p.age / p.life) * 0.5);
      mesh.setColorAt(n, col);
      n++;
    }
    mesh.count = n;
    mat.opacity = 0.75;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  };

  return fx;
}
