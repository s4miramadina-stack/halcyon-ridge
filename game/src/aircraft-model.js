// The Kestrel K-2: a high-wing bush plane built from primitives, nose along -Z, with a spinning
// propeller, moving control surfaces and a nav-light set the chase camera can see.
import * as THREE from 'three';

const LIVERY = {
  body: 0xf1e7d0,
  stripe: 0xc0392b,
  wing: 0xe9dcc0,
  trim: 0x23324a,
  glass: 0x5d88a8,
  metal: 0x9aa3ab,
  tyre: 0x1d1d1f,
};

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/** Builds the aircraft group; returns it with handles to the parts that animate. */
export function buildKestrel() {
  const plane = new THREE.Group();
  plane.name = 'kestrel';

  // Fuselage: a tapered cylinder lying along Z, nose forward.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.32, 7.2, 14), lambert(LIVERY.body));
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.6;
  plane.add(fuselage);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.635, 0.4, 5.4, 14, 1, true, Math.PI * 0.35, Math.PI * 0.3), lambert(LIVERY.stripe));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.z = 0.2;
  const stripeOther = stripe.clone();
  stripeOther.rotation.y = Math.PI;
  plane.add(stripe, stripeOther);
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.62, 1.3, 16), lambert(LIVERY.stripe));
  cowl.rotation.x = Math.PI / 2;
  cowl.position.z = -3.5;
  plane.add(cowl);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), lambert(LIVERY.metal));
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.5;
  plane.add(spinner);

  // Cabin glass sits under the wing root.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 2.0), new THREE.MeshPhongMaterial({ color: LIVERY.glass, shininess: 120, specular: 0xffffff }));
  cabin.position.set(0, 0.62, -1.4);
  plane.add(cabin);

  // High wing with stripe tips and struts.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.16, 1.7), lambert(LIVERY.wing));
  wing.position.set(0, 1.05, -1.0);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.17, 1.72), lambert(LIVERY.stripe));
    tip.position.set(side * 5.15, 1.05, -1.0);
    plane.add(tip);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), lambert(LIVERY.metal));
    strut.position.set(side * 1.7, 0.35, -0.9);
    strut.rotation.z = side * 1.1;
    plane.add(strut);
  }
  const ailerons = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.9, 1.05, -0.15);
    const flap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.45), lambert(LIVERY.trim));
    flap.position.z = 0.22;
    pivot.add(flap);
    plane.add(pivot);
    ailerons.push({ pivot, side });
  }

  // Tail: horizontal stabiliser with elevator, fin with rudder.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 0.9), lambert(LIVERY.wing));
  stab.position.set(0, 0.25, 3.7);
  plane.add(stab);
  const elevator = new THREE.Group();
  elevator.position.set(0, 0.25, 4.15);
  const elevatorMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.45), lambert(LIVERY.trim));
  elevatorMesh.position.z = 0.22;
  elevator.add(elevatorMesh);
  plane.add(elevator);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 1.1), lambert(LIVERY.stripe));
  fin.position.set(0, 1.0, 3.75);
  plane.add(fin);
  const rudder = new THREE.Group();
  rudder.position.set(0, 1.0, 4.3);
  const rudderMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.45), lambert(LIVERY.trim));
  rudderMesh.position.z = 0.22;
  rudder.add(rudderMesh);
  plane.add(rudder);

  // Fixed tricycle-less taildragger gear: two mains and a tail wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), lambert(LIVERY.metal));
    leg.position.set(side * 0.75, -0.7, -2.2);
    leg.rotation.z = side * 0.45;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 14), lambert(LIVERY.tyre));
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(side * 1.0, -1.2, -2.2);
    plane.add(leg, tyre);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 10), lambert(LIVERY.tyre));
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.35, 3.9);
  plane.add(tailWheel);

  // Propeller: two blades plus a translucent disc that shows at speed.
  const prop = new THREE.Group();
  prop.position.z = -4.3;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 0.06), lambert(0x2a2a2a));
  prop.add(blade);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
  prop.add(disc);
  plane.add(prop);

  // Navigation lights: red port, green starboard, white tail strobe.
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  navRed.position.set(-5.75, 1.05, -1.0);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff5a }));
  navGreen.position.set(5.75, 1.05, -1.0);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strobe.position.set(0, 1.8, 4.25);
  plane.add(navRed, navGreen, strobe);

  return { group: plane, prop, disc, ailerons, elevator, rudder, strobe };
}

/** Moves the control surfaces and spins the propeller from the current inputs and throttle. */
export function animateKestrel(parts, controls, throttle, engineOn, dt, time) {
  const spin = engineOn ? 20 + throttle * 90 : 0;
  parts.prop.rotation.z += spin * dt;
  parts.disc.material.opacity = engineOn ? 0.08 + throttle * 0.18 : 0;
  for (const a of parts.ailerons) a.pivot.rotation.x = -controls.roll * a.side * 0.45;
  parts.elevator.rotation.x = controls.pitch * 0.5;
  parts.rudder.rotation.y = -controls.yaw * 0.5;
  parts.strobe.visible = Math.floor(time * 1.4) % 2 === 0;
}
