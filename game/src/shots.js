// Deterministic poses for the maker's screenshots: `?shot=<name>` skips the menu, starts a mission,
// places the Kestrel at an exact position and attitude and freezes the physics so the picture is
// the game's own render of that moment.
import * as THREE from 'three';
import { AIRFIELDS, headingToVector, vectorToHeading } from './world-config.js';
import { heightAt } from './terrain.js';

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const NOSE = new THREE.Vector3(0, 0, -1); // roll axis: positive angle drops the right wing

/** Sets the aircraft's attitude from heading, pitch and bank (right wing down positive). */
export function setPose(state, pos, headingDeg, pitchDeg, bankDeg, speed) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, (-headingDeg * Math.PI) / 180);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(RIGHT, (pitchDeg * Math.PI) / 180));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(NOSE, (bankDeg * Math.PI) / 180));
  state.quat.copy(q);
  state.pos.copy(pos);
  state.vel.set(0, 0, -1).applyQuaternion(q).multiplyScalar(speed);
  state.airspeed = speed;
  state.onGround = false;
}

/** Puts the aircraft `back` metres before ring `i`, flying along the course toward it. */
function approachRing(mission, i, back, rise) {
  const ring = mission.rings[i].position;
  const prev = mission.rings[Math.max(0, i - 1)].position;
  const dir = ring.clone().sub(prev).setY(0).normalize();
  const pos = ring.clone().addScaledVector(dir, -back);
  pos.y += rise;
  return { pos, heading: vectorToHeading(dir.x, dir.z) };
}

const HAL = AIRFIELDS[0];

export const SHOTS = {
  // Cover: chase view on short final to Halcyon Field, flaps down, runway lights ahead.
  'final-approach': {
    mission: 'ridge-recon',
    camera: 'chase',
    setup(state, mission) {
      for (const b of mission.beacons) b.done = true;
      const dir = headingToVector(HAL.headingDeg);
      const back = HAL.length / 2 + 360;
      const ground = heightAt(HAL.x - dir.x * back, HAL.z - dir.z * back);
      const pos = new THREE.Vector3(HAL.x - dir.x * back, Math.max(HAL.elevation + 36, ground + 30), HAL.z - dir.z * back);
      setPose(state, pos, HAL.headingDeg, -3, 4, 36);
      state.throttle = 0.34;
      state.flaps = 1;
      state.fuel = 0.46;
      state.vel.y = -2.6;
      mission.time = 412;
    },
  },
  // Cockpit view in the ring trail with the full instrument panel lit.
  'cockpit-rings': {
    mission: 'ring-trail',
    camera: 'cockpit',
    setup(state, mission) {
      mission.index = 3;
      for (let k = 0; k < 3; k++) mission.rings[k].visible = false;
      const a = approachRing(mission, 3, 260, 6);
      setPose(state, a.pos, a.heading, 1.5, -8, 54);
      state.throttle = 0.78;
      state.fuel = 0.58;
      mission.time = 38.4;
    },
  },
  // Chase view banking hard through the ring trail over the river.
  'river-bank': {
    mission: 'ring-trail',
    camera: 'chase',
    setup(state, mission) {
      mission.index = 6;
      for (let k = 0; k < 6; k++) mission.rings[k].visible = false;
      const a = approachRing(mission, 6, 170, 4);
      setPose(state, a.pos, a.heading + 9, 3, 34, 58);
      state.throttle = 0.9;
      state.fuel = 0.49;
      mission.time = 71.2;
    },
  },
  // Low over the ridges hunting a recon beacon.
  'ridge-recon': {
    mission: 'ridge-recon',
    camera: 'chase',
    setup(state, mission) {
      mission.beacons[0].done = true;
      const b = mission.beacons[1].mesh.position;
      const from = new THREE.Vector3(b.x - 520, 0, b.z + 380);
      const dir = b.clone().sub(from).setY(0).normalize();
      from.y = Math.max(heightAt(from.x, from.z), b.y) + 120;
      setPose(state, from, vectorToHeading(dir.x, dir.z), -4, -18, 50);
      state.throttle = 0.7;
      state.fuel = 0.63;
      mission.time = 96;
    },
  },
};
