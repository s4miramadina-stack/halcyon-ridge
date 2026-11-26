// Two camera modes: a chase camera that trails the Kestrel on a soft spring and leans into turns,
// and a cockpit view from the pilot's seat with the panel drawn by the HUD.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

export function createCameraRig(camera) {
  const rig = { mode: 'chase', smoothPos: new THREE.Vector3(), initialised: false, orbit: 0 };
  const offset = new THREE.Vector3();
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const upV = new THREE.Vector3();

  /** Switches between chase and cockpit. */
  rig.toggle = () => {
    rig.mode = rig.mode === 'chase' ? 'cockpit' : 'chase';
  };

  /** Places the camera for the aircraft state; snap skips the spring for a clean cut. */
  rig.update = (state, aircraftGroup, dt, snap = false) => {
    fwd.set(0, 0, -1).applyQuaternion(state.quat);
    upV.set(0, 1, 0).applyQuaternion(state.quat);
    aircraftGroup.visible = rig.mode === 'chase';
    if (rig.mode === 'cockpit') {
      offset.set(0, 0.95, -1.1).applyQuaternion(state.quat);
      camera.position.copy(state.pos).add(offset);
      camera.quaternion.copy(state.quat);
      camera.fov = 72;
      camera.updateProjectionMatrix();
      rig.initialised = false;
      return;
    }
    // Chase: behind and above, following the velocity a little so turns read clearly.
    const speedFactor = Math.min(1, state.vel.length() / 60);
    offset.set(0, 4.2, 15 + speedFactor * 4);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rig.orbit);
    offset.applyQuaternion(state.quat);
    offset.y = Math.max(offset.y, 2.5);
    const wanted = state.pos.clone().add(offset);
    const ground = heightAt(wanted.x, wanted.z) + 2;
    if (wanted.y < ground) wanted.y = ground;
    if (!rig.initialised || snap) {
      rig.smoothPos.copy(wanted);
      rig.initialised = true;
    } else {
      rig.smoothPos.lerp(wanted, Math.min(1, dt * 5.5));
    }
    camera.position.copy(rig.smoothPos);
    look.copy(state.pos).addScaledVector(fwd, 12).addScaledVector(upV, 1.2);
    camera.up.copy(upV).lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize();
    camera.lookAt(look);
    camera.fov = 62 + speedFactor * 6;
    camera.updateProjectionMatrix();
  };

  return rig;
}
