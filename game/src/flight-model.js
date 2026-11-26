// Flight dynamics for the Kestrel: lift from angle of attack with a stall break, induced and
// parasite drag, propeller thrust that fades with speed, fuel burn, structural damage, and wheel
// contact that tells a greaser from a hard landing from a crash.
import * as THREE from 'three';
import { GRAVITY, AIRFIELDS } from './world-config.js';
import { heightAt, runwayFrame } from './terrain.js';
import { clamp } from './seeded-random.js';

export const KESTREL = {
  mass: 980,            // kg
  wingArea: 16.2,       // m²
  airDensity: 1.18,     // kg/m³
  maxThrust: 3600,      // N at zero airspeed
  cd0: 0.031,
  inducedK: 0.055,
  clSlope: 5.2,         // per radian
  stallAoa: 0.27,       // radians, about 15.5°
  gearHeight: 1.55,     // metres from the airframe origin to the tyres
  rollRate: 2.1,        // rad/s at full authority
  pitchRate: 1.05,
  yawRate: 0.55,
  burnPerSecond: 0.0048, // fraction of tank per second at full throttle
  vne: 92,              // m/s never-exceed speed
};

const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

/** Creates a fresh aircraft state at a position with a heading in degrees. */
export function createAircraftState(x, y, z, headingDeg, speed = 0) {
  const quat = new THREE.Quaternion().setFromAxisAngle(UP, (-headingDeg * Math.PI) / 180);
  const vel = FORWARD.clone().applyQuaternion(quat).multiplyScalar(speed);
  return {
    pos: new THREE.Vector3(x, y, z),
    vel,
    quat,
    throttle: speed > 0 ? 0.62 : 0,
    fuel: 1,
    damage: 0,
    engineOn: true,
    onGround: speed === 0,
    brakes: false,
    flaps: 0,
    stalled: false,
    crashed: false,
    lastTouchdown: null,  // { sink, onRunway, fieldId, verdict }
    aoa: 0,
    gForce: 1,
    airspeed: speed,
  };
}

/** Which runway, if any, the point (x, z) lies on. */
export function runwayUnder(x, z) {
  for (const field of AIRFIELDS) {
    const f = runwayFrame(field, x, z);
    if (Math.abs(f.along) <= field.length / 2 && Math.abs(f.across) <= field.width / 2 + 3) return field;
  }
  return null;
}

/** Grades a touchdown from its sink rate, bank and whether it was on a runway. */
export function gradeTouchdown(sink, bankDeg, onRunway) {
  if (!onRunway) return sink > 3.5 || bankDeg > 20 ? 'crash' : 'off-field';
  if (sink > 6.5 || bankDeg > 25) return 'crash';
  if (sink > 3.5) return 'hard';
  if (sink > 1.6) return 'firm';
  return 'smooth';
}

const tmpF = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const force = new THREE.Vector3();

/** Advances the aircraft by dt seconds under the given control inputs. */
export function stepFlight(state, controls, dt) {
  if (state.crashed) return;
  const k = KESTREL;
  state.throttle = clamp(state.throttle + controls.throttleDelta * dt * 0.6, 0, 1);
  if (controls.throttleSet !== null) state.throttle = controls.throttleSet;
  state.flaps = controls.flaps;
  state.brakes = controls.brakes;

  if (state.fuel <= 0) state.engineOn = false;
  const power = state.engineOn ? state.throttle : 0;
  state.fuel = Math.max(0, state.fuel - (0.08 + power) * k.burnPerSecond * dt * 0.55);

  const fwd = tmpF.copy(FORWARD).applyQuaternion(state.quat);
  const up = tmpU.copy(UP).applyQuaternion(state.quat);
  const right = tmpR.copy(RIGHT).applyQuaternion(state.quat);
  const speed = state.vel.length();
  state.airspeed = speed;

  // Control authority grows with dynamic pressure; damage makes the ailerons sloppy.
  const authority = clamp(speed / 38, 0.15, 1.25) * (1 - state.damage * 0.35);
  const rollIn = controls.roll * k.rollRate * authority;
  const pitchIn = controls.pitch * k.pitchRate * authority;
  const yawIn = controls.yaw * k.yawRate * authority;

  if (!state.onGround) {
    tmpQ.setFromAxisAngle(RIGHT, pitchIn * dt);
    state.quat.multiply(tmpQ);
    tmpQ.setFromAxisAngle(FORWARD, rollIn * dt);
    state.quat.multiply(tmpQ);
    tmpQ.setFromAxisAngle(UP, -yawIn * dt);
    state.quat.multiply(tmpQ);
    // Banking turns the nose: a coordinated-turn yaw toward the low wing.
    const bank = Math.asin(clamp(-right.y, -1, 1));
    tmpQ.setFromAxisAngle(UP, -bank * 0.32 * dt * clamp(speed / 45, 0, 1.2));
    state.quat.premultiply(tmpQ);
  } else {
    // On the wheels: rudder steers, the elevator can rotate the nose up once fast enough.
    tmpQ.setFromAxisAngle(UP, -controls.yaw * 0.6 * dt * clamp(speed / 10, 0.2, 1));
    state.quat.premultiply(tmpQ);
    if (speed > 24 && controls.pitch > 0) {
      tmpQ.setFromAxisAngle(RIGHT, pitchIn * dt * 0.6);
      state.quat.multiply(tmpQ);
    }
  }
  state.quat.normalize();

  fwd.copy(FORWARD).applyQuaternion(state.quat);
  up.copy(UP).applyQuaternion(state.quat);
  right.copy(RIGHT).applyQuaternion(state.quat);

  // Aerodynamics in the body frame.
  const vF = state.vel.dot(fwd);
  const vU = state.vel.dot(up);
  const aoa = speed > 1 ? Math.atan2(-vU, Math.max(vF, 0.1)) : 0;
  state.aoa = aoa;
  const flapBonus = state.flaps * 0.45;
  let cl;
  const absA = Math.abs(aoa);
  if (absA < k.stallAoa) cl = k.clSlope * aoa + flapBonus;
  else cl = Math.sign(aoa) * (k.clSlope * k.stallAoa * Math.max(0.35, 1 - (absA - k.stallAoa) * 3.2)) + flapBonus * 0.5;
  state.stalled = absA >= k.stallAoa && speed > 5 && !state.onGround;
  const q = 0.5 * k.airDensity * speed * speed;
  const lift = q * k.wingArea * cl;
  const drag = q * k.wingArea * (k.cd0 + state.flaps * 0.035 + k.inducedK * cl * cl + state.damage * 0.02);

  force.set(0, -GRAVITY * k.mass, 0);
  // Lift is perpendicular to the airflow, in the plane of the wings' up axis.
  if (speed > 1) {
    const velDir = tmpV.copy(state.vel).normalize();
    const liftDir = up.clone().addScaledVector(velDir, -up.dot(velDir)).normalize();
    force.addScaledVector(liftDir, lift);
    force.addScaledVector(velDir, -drag);
  }
  const thrust = power * k.maxThrust * (1 - clamp(speed / 115, 0, 0.85));
  force.addScaledVector(fwd, thrust);
  // Side-slip damping: the fin weathervanes the airframe into the airflow.
  const vR = state.vel.dot(right);
  force.addScaledVector(right, -vR * k.mass * 0.9);

  const accel = force.divideScalar(k.mass);
  state.gForce = accel.clone().addScaledVector(UP, GRAVITY).dot(up) / GRAVITY;
  state.vel.addScaledVector(accel, dt);

  // The nose slowly follows the flight path, which keeps a stable aircraft stable.
  if (!state.onGround && speed > 12) {
    const pitchAlign = clamp(aoa, -0.4, 0.4) * 0.9 * dt;
    tmpQ.setFromAxisAngle(RIGHT, -pitchAlign);
    state.quat.multiply(tmpQ);
  }

  state.pos.addScaledVector(state.vel, dt);

  if (speed > k.vne) state.damage = Math.min(1, state.damage + (speed - k.vne) * 0.004 * dt);

  resolveGroundContact(state, dt);
}

function resolveGroundContact(state, dt) {
  const k = KESTREL;
  const ground = heightAt(state.pos.x, state.pos.z);
  const wheelsY = state.pos.y - k.gearHeight;
  if (wheelsY > ground + 0.05) {
    if (state.onGround && wheelsY > ground + 0.6) state.onGround = false;
    if (!state.onGround) return;
  }
  const field = runwayUnder(state.pos.x, state.pos.z);
  const right = tmpR.copy(RIGHT).applyQuaternion(state.quat);
  const bankDeg = Math.abs(Math.asin(clamp(right.y, -1, 1))) * 57.3;
  if (!state.onGround) {
    const sink = Math.max(0, -state.vel.y);
    const verdict = gradeTouchdown(sink, bankDeg, !!field);
    state.lastTouchdown = { sink, onRunway: !!field, fieldId: field ? field.id : null, verdict, speed: state.vel.length() };
    if (verdict === 'crash' || (verdict === 'off-field' && state.vel.length() > 30)) {
      crash(state, ground);
      return;
    }
    if (verdict === 'hard') state.damage = Math.min(1, state.damage + 0.25);
    if (verdict === 'off-field') state.damage = Math.min(1, state.damage + 0.4);
    state.onGround = true;
  }
  // Rolling: pin the wheels to the ground, level the wings, bleed speed with rolling friction.
  state.pos.y = ground + k.gearHeight;
  if (state.vel.y < 0) state.vel.y = 0;
  const fwd = tmpF.copy(FORWARD).applyQuaternion(state.quat);
  const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
  const levelQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), flat);
  const pitchUp = new THREE.Quaternion().setFromAxisAngle(RIGHT, clamp(Math.asin(clamp(fwd.y, -1, 1)), -0.02, 0.2));
  levelQuat.multiply(pitchUp);
  state.quat.slerp(levelQuat, clamp(dt * 4, 0, 1));
  const along = state.vel.dot(flat);
  const friction = (field ? 0.35 : 2.2) + (state.brakes ? 5.5 : 0);
  const newAlong = Math.sign(along) * Math.max(0, Math.abs(along) - friction * dt);
  state.vel.set(flat.x * newAlong, state.vel.y, flat.z * newAlong);
  if (!field && Math.abs(newAlong) > 12) state.damage = Math.min(1, state.damage + 0.05 * dt);
  if (state.damage >= 1) crash(state, ground);
}

function crash(state, ground) {
  state.crashed = true;
  state.engineOn = false;
  state.vel.set(0, 0, 0);
  state.pos.y = Math.max(state.pos.y, ground + 0.8);
  state.damage = 1;
}

/** Height above the ground directly below the aircraft, in metres. */
export function heightAboveGround(state) {
  return state.pos.y - KESTREL.gearHeight - heightAt(state.pos.x, state.pos.z);
}

/** Pitch and bank in degrees, and the compass heading of the nose. */
export function attitude(state) {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.quat);
  const pitch = Math.asin(clamp(fwd.y, -1, 1)) * 57.2958;
  const bank = Math.asin(clamp(-right.y, -1, 1)) * 57.2958;
  const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quat).y;
  const bankFull = upY < 0 ? Math.sign(bank || 1) * (180 - Math.abs(bank)) : bank;
  let heading = (Math.atan2(fwd.x, -fwd.z) * 180) / Math.PI;
  if (heading < 0) heading += 360;
  return { pitch, bank: bankFull, heading };
}
