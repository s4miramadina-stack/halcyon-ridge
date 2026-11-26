// Boot and main loop: renderer, scene, lights and fog, the fixed-step flight physics, mission
// events, camera, HUD and sound, plus the screenshot mode used for the maker's shots.
import * as THREE from 'three';
import { PALETTE, AIRFIELDS } from './world-config.js';
import { buildTerrainMesh, buildWaterPlane } from './terrain.js';
import { populateScenery } from './scenery.js';
import { buildKestrel, animateKestrel } from './aircraft-model.js';
import { createAircraftState, stepFlight } from './flight-model.js';
import { createInput } from './input.js';
import { createCameraRig } from './camera-rig.js';
import { MISSIONS, createMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createScreens } from './screens.js';
import { SHOTS } from './shots.js';
import { createEffects } from './effects.js';

const PHYSICS_STEP = 1 / 120;
const params = new URLSearchParams(location.search);
const shot = SHOTS[params.get('shot')] ?? null;

const canvas3d = document.getElementById('view');
const hudCanvas = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, preserveDrawingBuffer: !!shot });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.fog, 900, 6200);
scene.background = new THREE.Color(PALETTE.skyHorizon);
const camera = new THREE.PerspectiveCamera(65, 1, 0.3, 12000);

scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x4a5a3a, 1.15));
const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
sun.position.set(2600, 2000, -4800);
scene.add(sun);

scene.add(buildTerrainMesh());
scene.add(buildWaterPlane());
populateScenery(scene);
const sky = scene.getObjectByName('sky');

const kestrel = buildKestrel();
scene.add(kestrel.group);
const effects = createEffects(scene);

const input = createInput(hudCanvas);
const rig = createCameraRig(camera);
const hud = createHud(hudCanvas, camera);
const audio = createAudio();

const game = { mode: 'menu', mission: null, def: null, state: null, accumulator: 0, time: 0, lastTouchdown: null };

/** Starts (or restarts) a mission from its start pose. */
function startMission(def) {
  if (game.mission) game.mission.dispose();
  const s = def.start();
  game.state = createAircraftState(s.x, s.y, s.z, s.heading, s.speed);
  game.state.fuel = def.fuel;
  game.mission = createMission(def, scene);
  game.def = def;
  game.lastTouchdown = null;
  game.resultShown = 0;
  input.resetControls();
  effects.reset();
  rig.update(game.state, kestrel.group, 0, true);
  game.mode = 'flying';
  if (!shot) audio.start();
  hud.flash(def.name.toUpperCase(), 2.6, '#ffb03b');
}

const screens = createScreens(startMission);
screens.onResume = () => {
  game.mode = 'flying';
  screens.show('none');
};
screens.onQuit = () => {
  game.mode = 'menu';
  screens.show('title');
};
screens.onRetry = () => startMission(game.def);

/** Reacts to what happened this frame: rings, beacons, landings, crashes and mission end. */
function handleEvents(event) {
  const st = game.state;
  const td = st.lastTouchdown;
  if (td && td !== game.lastTouchdown) {
    game.lastTouchdown = td;
    if (td.verdict === 'crash') {
      audio.crash();
    } else {
      audio.touchdown(td.sink);
      const colour = { smooth: '#7dffb0', firm: '#ffffff', hard: '#ffb03b', 'off-field': '#ff4a3d' }[td.verdict];
      hud.flash(`${td.verdict.toUpperCase()} TOUCHDOWN  ${td.sink.toFixed(1)} m/s`, 2.5, colour);
      effects.dust(st.pos);
    }
  }
  if (st.crashed && !effects.burning) {
    effects.wreck(st.pos);
    audio.crash();
  }
  if (event === 'ring') {
    audio.chime();
    hud.flash('RING', 0.9, '#4dfcff');
  } else if (event === 'beacon') {
    audio.chime();
    hud.flash('BEACON LOGGED', 1.6, '#39ff7a');
  } else if (event === 'success') {
    audio.fanfare();
    hud.flash('MISSION COMPLETE', 3, '#7dffb0');
  } else if (event === 'failed') {
    hud.flash('MISSION FAILED', 3, '#ff4a3d');
  }
}

function handleKeys() {
  if (input.wasPressed('KeyC')) rig.toggle();
  if (input.wasPressed('KeyM')) hud.flash(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1);
  if (game.mode === 'flying') {
    if (input.wasPressed('KeyP') || input.wasPressed('Escape')) {
      game.mode = 'paused';
      screens.show('pause');
    }
    if (input.wasPressed('KeyR')) startMission(game.def);
  } else if (game.mode === 'paused' && (input.wasPressed('KeyP') || input.wasPressed('Escape'))) {
    screens.onResume();
  } else if (game.mode === 'menu') {
    if (screens.current === 'title') {
      for (let i = 0; i < MISSIONS.length; i++) if (input.wasPressed(`Digit${i + 1}`)) screens.brief(MISSIONS[i]);
    } else if (screens.current === 'brief' && (input.wasPressed('Enter') || input.wasPressed('Space'))) {
      screens.launch();
    } else if (screens.current === 'result' && input.wasPressed('Enter')) {
      startMission(game.def);
    }
  }
  if (game.mode === 'result' && input.wasPressed('Enter')) startMission(game.def);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.resize(w, h, renderer.getPixelRatio());
}
window.addEventListener('resize', resize);
resize();

/** One display frame: input, fixed-step physics, mission logic, camera, effects, render, HUD. */
function frame(dt) {
  game.time += dt;
  input.update(dt);
  handleKeys();
  const st = game.state;
  if (st && game.mode === 'flying') {
    game.accumulator += dt;
    let event = null;
    while (game.accumulator >= PHYSICS_STEP) {
      stepFlight(st, input.controls, PHYSICS_STEP);
      event = game.mission.update(st, PHYSICS_STEP) ?? event;
      game.accumulator -= PHYSICS_STEP;
    }
    handleEvents(event);
    if (game.mission.status !== 'flying') {
      game.resultShown += dt;
      if (game.resultShown > 2.5) {
        game.mode = 'result';
        screens.result(game.mission);
      }
    }
  }
  if (st) {
    kestrel.group.position.copy(st.pos);
    kestrel.group.quaternion.copy(st.quat);
    animateKestrel(kestrel, input.controls, st.throttle, st.engineOn, dt, game.time);
    rig.update(st, kestrel.group, dt);
    audio.update(game.mode === 'flying' ? st : { ...st, engineOn: false, airspeed: 0, stalled: false });
  } else {
    // Title screen: a slow orbit over Halcyon Field.
    const f = AIRFIELDS[0];
    const a = game.time * 0.05;
    camera.position.set(f.x + Math.sin(a) * 1400, f.elevation + 380, f.z + Math.cos(a) * 1400);
    camera.up.set(0, 1, 0);
    camera.lookAt(f.x, f.elevation + 60, f.z);
    kestrel.group.visible = false;
  }
  effects.update(dt);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  if (st) hud.draw(st, game.mission, rig.mode, dt);
  input.endFrame();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}

if (shot) {
  // Screenshot mode: build the posed moment, then render a few frames with physics frozen.
  document.body.classList.add('shot');
  screens.show('none');
  const def = MISSIONS.find((m) => m.id === shot.mission);
  startMission(def);
  shot.setup(game.state, game.mission);
  game.mission.update(game.state, 0);
  game.mode = 'frozen';
  rig.mode = shot.camera;
  hud.messages = [];
  for (let i = 0; i < 90; i++) frame(1 / 60);
  hud.messages = [];
  frame(1 / 60);
  // Flatten the 3D view and the HUD into one picture, exactly as they are layered on screen.
  const flat = document.createElement('canvas');
  flat.width = canvas3d.width;
  flat.height = canvas3d.height;
  const g = flat.getContext('2d');
  g.drawImage(canvas3d, 0, 0);
  g.drawImage(hudCanvas, 0, 0, flat.width, flat.height);
  window.__shotData = flat.toDataURL('image/jpeg', Number(params.get('q') || 0.84));
  window.__shotReady = true;
} else {
  screens.show('title');
  requestAnimationFrame(loop);
}
