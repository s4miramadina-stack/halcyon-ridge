// Keyboard and mouse input mapped to stick, rudder, throttle, flaps and brakes.
// Keyboard: W/S pitch, A/D roll, Q/E rudder, Shift/Ctrl throttle, 1–9 throttle steps, F flaps,
// B brakes, C camera, P pause, R restart. Mouse: hold the left button and move to fly the stick.
import { clamp } from './seeded-random.js';

export function createInput(target) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { active: false, x: 0, y: 0, startX: 0, startY: 0, wheel: 0 };
  const controls = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, throttleSet: null, flaps: 0, brakes: false };
  let flapNotch = 0;

  window.addEventListener('keydown', (e) => {
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  target.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouse.active = true;
    mouse.startX = mouse.x = e.clientX;
    mouse.startY = mouse.y = e.clientY;
  });
  window.addEventListener('mouseup', () => (mouse.active = false));
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  target.addEventListener('wheel', (e) => {
    mouse.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }, { passive: false });
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  const smooth = (current, wanted, rate, dt) => current + (wanted - current) * clamp(rate * dt, 0, 1);

  /** Samples the devices into the control state; call once per frame. */
  function update(dt) {
    let pitch = axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown');
    let roll = axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight');
    const yaw = axis('KeyQ', 'KeyE');
    if (mouse.active) {
      const span = Math.min(window.innerWidth, window.innerHeight) * 0.25;
      roll += clamp((mouse.x - mouse.startX) / span, -1, 1);
      pitch += clamp((mouse.y - mouse.startY) / span, -1, 1);
    }
    controls.pitch = smooth(controls.pitch, clamp(pitch, -1, 1), 7, dt);
    controls.roll = smooth(controls.roll, clamp(roll, -1, 1), 8, dt);
    controls.yaw = smooth(controls.yaw, clamp(yaw, -1, 1), 6, dt);
    controls.throttleDelta = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0)
      - (keys.has('ControlLeft') || keys.has('ControlRight') ? 1 : 0)
      - mouse.wheel * 4;
    mouse.wheel = 0;
    controls.throttleSet = null;
    for (let d = 0; d <= 9; d++) if (pressed.has(`Digit${d}`)) controls.throttleSet = d === 0 ? 1 : (d - 1) / 8;
    if (pressed.has('KeyF')) flapNotch = (flapNotch + 1) % 3;
    controls.flaps = flapNotch / 2;
    controls.brakes = keys.has('KeyB') || keys.has('Space');
  }

  /** True once for a key pressed since the last call to endFrame. */
  function wasPressed(code) {
    return pressed.has(code);
  }

  function endFrame() {
    pressed.clear();
  }

  function resetControls() {
    controls.pitch = controls.roll = controls.yaw = 0;
    flapNotch = 0;
    controls.flaps = 0;
  }

  return { controls, update, wasPressed, endFrame, resetControls, mouse };
}
