// Four sorties with different goals: a timed ring trail, a mail run that ends in a landing at
// Pinecrest on limited fuel, a low-level ridge-beacon recon, and a free flight. Each mission
// owns its targets, its objective text and its scoring.
import * as THREE from 'three';
import { AIRFIELDS, headingToVector } from './world-config.js';
import { heightAt, riverCentreX } from './terrain.js';
import { buildRing, buildBeacon } from './scenery.js';
import { heightAboveGround } from './flight-model.js';

const HAL = AIRFIELDS[0];
const PIN = AIRFIELDS[1];

/** Where each mission starts: airborne on the river, or lined up on a runway. */
function runwayStart(field) {
  const dir = headingToVector(field.headingDeg);
  const back = field.length / 2 - 40;
  return { x: field.x - dir.x * back, z: field.z - dir.z * back, y: field.elevation + 1.55, heading: field.headingDeg, speed: 0 };
}

export const MISSIONS = [
  {
    id: 'ring-trail',
    name: 'River Ring Trail',
    brief: 'Thread 10 rings down the Halcyon river before the clock beats you. Low and fast pays.',
    fuel: 0.7,
    start: () => ({ x: riverCentreX(2600), z: 2600, y: 150, heading: 352, speed: 52 }),
  },
  {
    id: 'mail-run',
    name: 'Pinecrest Mail Run',
    brief: 'Take off from Halcyon Field with 40% fuel and land the mail on Pinecrest Strip. Mind the ridge.',
    fuel: 0.4,
    start: () => runwayStart(HAL),
  },
  {
    id: 'ridge-recon',
    name: 'Ridge Beacon Recon',
    brief: 'Pass within 120 m of all four ridge beacons below 200 m AGL, then land back at Halcyon.',
    fuel: 0.75,
    start: () => runwayStart(HAL),
  },
  {
    id: 'free-flight',
    name: 'Free Flight',
    brief: 'Full tanks, no clock. Explore the valley, practise landings at both fields.',
    fuel: 1,
    start: () => ({ x: HAL.x, z: HAL.z + 900, y: 260, heading: HAL.headingDeg, speed: 50 }),
  },
];

/** Ring positions follow the river, weaving and climbing gently. */
function ringCourse() {
  const rings = [];
  for (let i = 0; i < 10; i++) {
    const z = 2200 - i * 430;
    const x = riverCentreX(z) + Math.sin(i * 1.3) * 90;
    const y = Math.max(heightAt(x, z) + 60, 70) + (i % 3) * 25;
    rings.push(new THREE.Vector3(x, y, z));
  }
  return rings;
}

/** Four beacons on ridge tops either side of the valley. */
function beaconSites() {
  const picks = [
    [-1150, 600], [880, -300], [-1250, -1300], [700, 1900],
  ];
  return picks.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z), z));
}

/** Builds the live mission: its scene objects, progress and per-frame logic. */
export function createMission(def, scene) {
  const group = new THREE.Group();
  group.name = `mission-${def.id}`;
  scene.add(group);
  const m = {
    def,
    group,
    time: 0,
    status: 'flying', // flying | success | failed
    resultText: '',
    score: 0,
    targets: [],
    index: 0,
    rings: [],
    beacons: [],
  };

  if (def.id === 'ring-trail') {
    for (const p of ringCourse()) {
      const ring = buildRing();
      ring.position.copy(p);
      group.add(ring);
      m.rings.push(ring);
    }
    // Face each ring toward the next so it reads as a gate.
    m.rings.forEach((ring, i) => {
      const next = m.rings[Math.min(i + 1, m.rings.length - 1)].position;
      const prev = m.rings[Math.max(i - 1, 0)].position;
      ring.lookAt(i < m.rings.length - 1 ? next : prev);
    });
  }
  if (def.id === 'ridge-recon') {
    for (const p of beaconSites()) {
      const b = buildBeacon();
      b.position.copy(p);
      group.add(b);
      m.beacons.push({ mesh: b, done: false });
    }
  }

  /** The point the HUD arrow and minimap should guide the pilot toward. */
  m.currentTarget = () => {
    if (def.id === 'ring-trail') return m.index < m.rings.length ? m.rings[m.index].position : null;
    if (def.id === 'mail-run') return new THREE.Vector3(PIN.x, PIN.elevation, PIN.z);
    if (def.id === 'ridge-recon') {
      const left = m.beacons.find((b) => !b.done);
      return left ? left.mesh.position.clone().setY(left.mesh.position.y + 38) : new THREE.Vector3(HAL.x, HAL.elevation, HAL.z);
    }
    return null;
  };

  /** One line of objective text for the HUD. */
  m.objective = () => {
    if (def.id === 'ring-trail') return `RING ${Math.min(m.index + 1, 10)}/10  ·  ${m.time.toFixed(1)} s`;
    if (def.id === 'mail-run') return `LAND AT PINECREST STRIP  ·  ${m.time.toFixed(0)} s`;
    if (def.id === 'ridge-recon') {
      const n = m.beacons.filter((b) => b.done).length;
      return n < 4 ? `BEACONS ${n}/4  ·  STAY BELOW 200 m AGL` : 'ALL BEACONS LOGGED · RETURN TO HALCYON';
    }
    return 'FREE FLIGHT · PRACTISE LANDINGS';
  };

  /** Advances mission logic; returns an event string the game can announce, or null. */
  m.update = (state, dt) => {
    if (m.status !== 'flying') return null;
    m.time += dt;
    let event = null;
    for (const ring of m.rings) ring.userData.outer.material.color.setHex(0xff8a1f);
    if (def.id === 'ring-trail' && m.index < m.rings.length) {
      const ring = m.rings[m.index];
      ring.userData.outer.material.color.setHex(0x4dfcff);
      ring.rotation.z += dt * 0.6;
      if (state.pos.distanceTo(ring.position) < 26) {
        m.index++;
        ring.visible = false;
        event = m.index === m.rings.length ? null : 'ring';
        if (m.index === m.rings.length) {
          m.status = 'success';
          m.score = Math.max(0, Math.round(3000 - m.time * 12 + (1 - state.damage) * 500));
          m.resultText = `All 10 rings in ${m.time.toFixed(1)} s`;
          event = 'success';
        }
      }
    }
    if (def.id === 'ridge-recon') {
      for (const b of m.beacons) {
        b.mesh.userData.lamp.material.color.setHex(b.done ? 0x39ff7a : Math.floor(m.time * 2) % 2 ? 0xff3b30 : 0x661010);
        if (!b.done && state.pos.distanceTo(b.mesh.position) < 160 && heightAboveGround(state) < 200) {
          b.done = true;
          event = 'beacon';
        }
      }
    }
    // Landing objectives: a full stop on the right runway.
    const td = state.lastTouchdown;
    if (state.onGround && td && td.onRunway && state.airspeed < 3 && !state.crashed) {
      const allBeacons = m.beacons.every((b) => b.done);
      if ((def.id === 'mail-run' && td.fieldId === 'PIN') || (def.id === 'ridge-recon' && allBeacons && td.fieldId === 'HAL')) {
        m.status = 'success';
        const gradeBonus = { smooth: 1500, firm: 900, hard: 300 }[td.verdict] ?? 0;
        m.score = Math.max(0, Math.round(2500 - m.time * 4 + gradeBonus + state.fuel * 1000 - state.damage * 1200));
        m.resultText = `${td.verdict.toUpperCase()} landing at ${td.fieldId === 'PIN' ? PIN.name : HAL.name} · sink ${td.sink.toFixed(1)} m/s`;
        event = 'success';
      }
    }
    if (state.crashed) {
      m.status = 'failed';
      m.resultText = state.lastTouchdown?.verdict === 'crash' ? 'Crashed on touchdown' : 'Airframe lost';
      event = 'failed';
    } else if (!state.engineOn && state.onGround && state.airspeed < 1 && m.status === 'flying') {
      m.status = 'failed';
      m.resultText = 'Out of fuel and stuck on the ground';
      event = 'failed';
    }
    return event;
  };

  m.dispose = () => scene.remove(group);
  return m;
}
