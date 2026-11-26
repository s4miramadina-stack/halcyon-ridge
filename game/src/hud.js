// The heads-up display: heading strip, speed and altitude tapes, pitch ladder, flight-path
// marker, mission objective, target cue, warnings, minimap and the instrument panel.
import * as THREE from 'three';
import { MS_TO_KNOTS, M_TO_FEET, AIRFIELDS, WORLD_SIZE, vectorToHeading } from './world-config.js';
import { heightAt, groundColour, slopeAt } from './terrain.js';
import { attitude, heightAboveGround } from './flight-model.js';
import {
  drawAirspeedGauge, drawAttitudeGauge, drawAltimeterGauge, drawHeadingGauge,
  drawVerticalSpeedGauge, drawEngineGauge,
} from './instruments.js';

const HUD_GREEN = '#7dffb0';
const HUD_SHADOW = 'rgba(0,20,10,0.65)';

/** Pre-renders a top-down colour map of the valley for the minimap. */
function renderMapImage(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / size - 0.5) * WORLD_SIZE;
      const z = (j / size - 0.5) * WORLD_SIZE;
      const h = heightAt(x, z);
      const col = h < 1 ? { r: 0.18, g: 0.44, b: 0.56 } : groundColour(h, slopeAt(x, z), 0);
      const k = (j * size + i) * 4;
      img.data[k] = col.r * 255;
      img.data[k + 1] = col.g * 255;
      img.data[k + 2] = col.b * 255;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#20232a';
  for (const f of AIRFIELDS) {
    g.save();
    g.translate((f.x / WORLD_SIZE + 0.5) * size, (f.z / WORLD_SIZE + 0.5) * size);
    g.rotate((f.headingDeg * Math.PI) / 180);
    g.fillRect(-2, (-f.length / WORLD_SIZE) * size / 2, 4, (f.length / WORLD_SIZE) * size);
    g.restore();
  }
  return c;
}

export function createHud(canvas, camera) {
  const ctx = canvas.getContext('2d');
  const hud = { messages: [], mapImage: null, scale: 1 };
  const projected = new THREE.Vector3();

  hud.resize = (w, h, dpr) => {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    hud.scale = dpr;
    hud.w = w;
    hud.h = h;
  };

  /** Queues a centred announcement that fades out after `seconds`. */
  hud.flash = (text, seconds = 2.2, color = '#ffffff') => {
    hud.messages.push({ text, t: seconds, total: seconds, color });
  };

  function text(str, x, y, size, color = HUD_GREEN, align = 'left', weight = 700) {
    ctx.font = `${weight} ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
    ctx.textAlign = align;
    ctx.fillStyle = HUD_SHADOW;
    ctx.fillText(str, x + 1.5, y + 1.5);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function drawHeadingStrip(heading, bug) {
    const cx = hud.w / 2;
    const y = 34;
    const span = 90;
    const width = Math.min(560, hud.w * 0.46);
    ctx.fillStyle = 'rgba(6,18,14,0.45)';
    ctx.fillRect(cx - width / 2, y - 22, width, 36);
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 1.5;
    for (let d = Math.floor((heading - span / 2) / 5) * 5; d <= heading + span / 2; d += 5) {
      const x = cx + ((d - heading) / span) * width;
      const norm = ((d % 360) + 360) % 360;
      const major = norm % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x, y + (major ? 0 : 6));
      ctx.stroke();
      if (norm % 30 === 0) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[norm] ?? String(norm).padStart(3, '0');
        text(label, x, y - 4, 13, HUD_GREEN, 'center');
      }
    }
    if (bug !== null) {
      let delta = ((bug - heading + 540) % 360) - 180;
      delta = Math.max(-span / 2, Math.min(span / 2, delta));
      const bx = cx + (delta / span) * width;
      ctx.fillStyle = '#4dfcff';
      ctx.beginPath();
      ctx.moveTo(bx, y + 14);
      ctx.lineTo(bx - 7, y + 24);
      ctx.lineTo(bx + 7, y + 24);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(6,18,14,0.85)';
    ctx.fillRect(cx - 30, y + 16, 60, 24);
    ctx.strokeRect(cx - 30, y + 16, 60, 24);
    text(`${String(Math.round(heading) % 360).padStart(3, '0')}°`, cx, y + 34, 17, '#ffffff', 'center');
    text('HDG', cx - 42, y + 34, 11, HUD_GREEN, 'right');
  }

  function drawTape(x, value, step, labelEvery, unit, title, side, bugValue) {
    const cy = hud.h * 0.42;
    const height = Math.min(300, hud.h * 0.44);
    const width = 74;
    const left = side === 'left' ? x : x - width;
    ctx.fillStyle = 'rgba(6,18,14,0.42)';
    ctx.fillRect(left, cy - height / 2, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, cy - height / 2, width, height);
    ctx.clip();
    const pxPer = height / (step * 10);
    const start = Math.floor((value - step * 6) / step) * step;
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 1.5;
    for (let v = start; v <= value + step * 6; v += step) {
      const y = cy - (v - value) * pxPer;
      const edge = side === 'left' ? left + width : left;
      const dir = side === 'left' ? -1 : 1;
      const major = Math.round(v / step) % labelEvery === 0;
      ctx.beginPath();
      ctx.moveTo(edge, y);
      ctx.lineTo(edge + dir * (major ? 14 : 7), y);
      ctx.stroke();
      if (major && v >= 0) text(String(Math.round(v)), edge + dir * 18, y + 5, 13, HUD_GREEN, side === 'left' ? 'right' : 'left');
    }
    ctx.restore();
    if (bugValue !== undefined && bugValue !== null) {
      const by = Math.max(cy - height / 2, Math.min(cy + height / 2, cy - (bugValue - value) * pxPer));
      ctx.fillStyle = '#ff5ad1';
      ctx.fillRect(side === 'left' ? left + width - 6 : left, by - 3, 6, 6);
    }
    ctx.fillStyle = 'rgba(6,18,14,0.9)';
    ctx.fillRect(left - 6, cy - 16, width + 12, 32);
    ctx.strokeStyle = HUD_GREEN;
    ctx.strokeRect(left - 6, cy - 16, width + 12, 32);
    text(String(Math.round(value)), left + width / 2, cy + 7, 20, '#ffffff', 'center');
    text(`${title} ${unit}`, left + width / 2, cy - height / 2 - 8, 12, HUD_GREEN, 'center');
  }

  function drawPitchLadder(att, fpmScreen) {
    const cx = hud.w / 2;
    const cy = hud.h * 0.42;
    const pxPerDeg = hud.h / 60;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-att.bank * Math.PI) / 180);
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 1.6;
    for (let p = -30; p <= 30; p += 5) {
      const y = (att.pitch - p) * pxPerDeg;
      if (Math.abs(y) > hud.h * 0.28) continue;
      const w = p === 0 ? hud.w * 0.22 : p % 10 === 0 ? 70 : 34;
      ctx.setLineDash(p < 0 ? [8, 6] : []);
      ctx.beginPath();
      ctx.moveTo(-w, y);
      ctx.lineTo(-24, y);
      ctx.moveTo(24, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (p !== 0 && p % 10 === 0) {
        ctx.setLineDash([]);
        text(String(Math.abs(p)), -w - 8, y + 5, 12, HUD_GREEN, 'right');
        text(String(Math.abs(p)), w + 8, y + 5, 12, HUD_GREEN, 'left');
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
    // Boresight and flight-path marker.
    ctx.strokeStyle = HUD_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx, cy + 6);
    ctx.lineTo(cx + 5, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.stroke();
    if (fpmScreen) {
      const { x, y } = fpmScreen;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x - 7, y);
      ctx.moveTo(x + 7, y);
      ctx.lineTo(x + 18, y);
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x, y - 14);
      ctx.stroke();
    }
  }

  function toScreen(worldPos) {
    projected.copy(worldPos).project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * hud.w,
      y: (-projected.y * 0.5 + 0.5) * hud.h,
      behind: projected.z > 1,
    };
  }

  function drawTargetCue(target, state) {
    if (!target) return;
    const s = toScreen(target);
    const dist = state.pos.distanceTo(target);
    const label = dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`;
    const margin = 60;
    const onScreen = !s.behind && s.x > margin && s.x < hud.w - margin && s.y > margin && s.y < hud.h - margin;
    ctx.strokeStyle = '#4dfcff';
    ctx.lineWidth = 2.5;
    if (onScreen) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 16);
      ctx.lineTo(s.x + 16, s.y);
      ctx.lineTo(s.x, s.y + 16);
      ctx.lineTo(s.x - 16, s.y);
      ctx.closePath();
      ctx.stroke();
      text(label, s.x, s.y - 24, 14, '#4dfcff', 'center');
    } else {
      let dx = s.x - hud.w / 2;
      let dy = s.y - hud.h * 0.42;
      if (s.behind) {
        dx = -dx;
        dy = -dy;
      }
      const a = Math.atan2(dy, dx);
      const rx = hud.w * 0.36;
      const ry = hud.h * 0.3;
      const ax = hud.w / 2 + Math.cos(a) * rx;
      const ay = hud.h * 0.42 + Math.sin(a) * ry;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#4dfcff';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-8, -11);
      ctx.lineTo(-8, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      text(label, ax, ay + 28, 13, '#4dfcff', 'center');
    }
  }

  function drawMinimap(state, target, mission) {
    const size = Math.min(190, hud.h * 0.26);
    if (!hud.mapImage) hud.mapImage = renderMapImage(160);
    const x = hud.w - size - 18;
    const y = hud.h - size - 18;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    // Map centred on the aircraft, track-up is confusing in a valley, so north-up with a 3 km radius.
    const view = 3200;
    const px = (state.pos.x / WORLD_SIZE + 0.5) * 160;
    const pz = (state.pos.z / WORLD_SIZE + 0.5) * 160;
    const half = (view / WORLD_SIZE) * 160;
    ctx.drawImage(hud.mapImage, px - half, pz - half, half * 2, half * 2, x, y, size, size);
    const toMap = (wx, wz) => ({
      x: x + size / 2 + ((wx - state.pos.x) / view) * (size / 2),
      y: y + size / 2 + ((wz - state.pos.z) / view) * (size / 2),
    });
    if (mission) {
      for (const ring of mission.rings) {
        if (!ring.visible) continue;
        const p = toMap(ring.position.x, ring.position.z);
        ctx.fillStyle = ring === mission.rings[mission.index] ? '#4dfcff' : '#ff8a1f';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const b of mission.beacons) {
        const p = toMap(b.mesh.position.x, b.mesh.position.z);
        ctx.fillStyle = b.done ? '#39ff7a' : '#ff3b30';
        ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
      }
    }
    if (target) {
      const p = toMap(target.x, target.z);
      ctx.strokeStyle = '#4dfcff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(125,255,176,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    const att = attitude(state);
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate((att.heading * Math.PI) / 180);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    text('N', x + size / 2, y + 14, 12, '#ffb03b', 'center');
  }

  function drawPanel(state, att, mode, bugHeading) {
    const knots = state.airspeed * MS_TO_KNOTS;
    const feet = state.pos.y * M_TO_FEET;
    const fpm = state.vel.y * M_TO_FEET * 60;
    if (mode === 'cockpit') {
      const ph = Math.min(hud.h * 0.34, 250);
      const top = hud.h - ph;
      const grad = ctx.createLinearGradient(0, top, 0, hud.h);
      grad.addColorStop(0, '#2b2f33');
      grad.addColorStop(1, '#15181b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, top + 30);
      ctx.quadraticCurveTo(hud.w / 2, top - 20, hud.w, top + 30);
      ctx.lineTo(hud.w, hud.h);
      ctx.lineTo(0, hud.h);
      ctx.closePath();
      ctx.fill();
      // Six gauges in the space left of the minimap.
      const room = hud.w - Math.min(190, hud.h * 0.26) - 50;
      const gap = room / 6;
      const r = Math.min(ph * 0.3, gap * 0.42);
      const cx = 20 + gap / 2;
      const cy = top + ph * 0.52;
      drawAirspeedGauge(ctx, cx, cy, r, knots);
      drawAttitudeGauge(ctx, cx + gap, cy, r, att.pitch, att.bank);
      drawAltimeterGauge(ctx, cx + gap * 2, cy, r, feet);
      drawHeadingGauge(ctx, cx + gap * 3, cy, r, att.heading, bugHeading);
      drawVerticalSpeedGauge(ctx, cx + gap * 4, cy, r, fpm);
      drawEngineGauge(ctx, cx + gap * 5, cy, r, state.throttle, state.fuel, state.engineOn);
      return top;
    }
    const r = Math.min(52, hud.h * 0.075);
    const gap = r * 2.45;
    const cx = 22 + r * 1.15;
    const cy = hud.h - r * 1.35;
    ctx.fillStyle = 'rgba(12,16,20,0.55)';
    ctx.beginPath();
    ctx.roundRect(8, cy - r * 1.3, gap * 4 + r * 0.5, r * 2.6, 14);
    ctx.fill();
    drawAirspeedGauge(ctx, cx, cy, r, knots);
    drawAttitudeGauge(ctx, cx + gap, cy, r, att.pitch, att.bank);
    drawAltimeterGauge(ctx, cx + gap * 2, cy, r, feet);
    drawHeadingGauge(ctx, cx + gap * 3, cy, r, att.heading, bugHeading);
    return hud.h;
  }

  function drawMissionBox(mission, state) {
    const lines = [mission ? mission.def.name.toUpperCase() : 'HALCYON RIDGE', mission ? mission.objective() : ''];
    ctx.fillStyle = 'rgba(6,18,14,0.5)';
    ctx.fillRect(16, 14, 380, 54);
    ctx.fillStyle = '#ffb03b';
    ctx.fillRect(16, 14, 4, 54);
    text(lines[0], 30, 36, 15, '#ffb03b');
    text(lines[1], 30, 58, 14, '#ffffff', 'left', 600);
    const flapsTxt = ['UP', '10°', '25°'][Math.round(state.flaps * 2)];
    const line2 = `THR ${Math.round(state.throttle * 100)}%  FLAPS ${flapsTxt}  ${state.brakes ? 'BRAKES' : ''}`;
    text(line2, 30, 88, 13, HUD_GREEN, 'left', 600);
    const dmg = Math.round(state.damage * 100);
    text(`FUEL ${Math.round(state.fuel * 100)}%   DMG ${dmg}%   G ${state.gForce.toFixed(1)}`, 30, 106, 13, dmg > 40 ? '#ff4a3d' : HUD_GREEN, 'left', 600);
  }

  function drawWarnings(state) {
    const agl = heightAboveGround(state);
    const warn = [];
    if (state.stalled) warn.push(['STALL', '#ff4a3d']);
    const descending = state.vel.y < -6;
    if (!state.onGround && agl < 80 && descending && state.vel.y * 6 + agl < 0) warn.push(['PULL UP', '#ff4a3d']);
    if (state.fuel < 0.12 && state.engineOn) warn.push(['LOW FUEL', '#ffb03b']);
    if (!state.engineOn && !state.crashed) warn.push(['ENGINE OUT', '#ff4a3d']);
    if (state.airspeed > 88) warn.push(['OVERSPEED', '#ffb03b']);
    warn.forEach(([w, c], i) => {
      ctx.fillStyle = 'rgba(40,0,0,0.55)';
      const y = hud.h * 0.42 + 70 + i * 34;
      ctx.fillRect(hud.w / 2 - 80, y - 22, 160, 30);
      text(w, hud.w / 2, y, 20, c, 'center', 800);
    });
  }

  function drawMessages(dt) {
    hud.messages = hud.messages.filter((m) => (m.t -= dt) > 0);
    hud.messages.forEach((m, i) => {
      ctx.globalAlpha = Math.min(1, m.t / 0.4, (m.total - m.t) / 0.2 + 0.2);
      text(m.text, hud.w / 2, hud.h * 0.24 + i * 34, 26, m.color, 'center', 800);
      ctx.globalAlpha = 1;
    });
  }

  /** Draws one frame of the HUD for the current state, mission and camera mode. */
  hud.draw = (state, mission, mode, dt) => {
    ctx.setTransform(hud.scale, 0, 0, hud.scale, 0, 0);
    ctx.clearRect(0, 0, hud.w, hud.h);
    const att = attitude(state);
    const target = mission ? mission.currentTarget() : null;
    const bug = target ? vectorToHeading(target.x - state.pos.x, target.z - state.pos.z) : null;
    let fpm = null;
    if (state.airspeed > 5) fpm = toScreen(state.pos.clone().addScaledVector(state.vel.clone().normalize(), 400));
    if (fpm && fpm.behind) fpm = null;
    drawPitchLadder(att, fpm);
    drawHeadingStrip(att.heading, bug);
    drawTape(18, state.airspeed * MS_TO_KNOTS, 5, 2, 'KT', 'IAS', 'left', 60);
    drawTape(hud.w - 18, state.pos.y * M_TO_FEET, 50, 2, 'FT', 'ALT', 'right', target ? target.y * M_TO_FEET : null);
    text(`AGL ${Math.round(heightAboveGround(state) * M_TO_FEET)} ft`, hud.w - 56, hud.h * 0.42 + Math.min(300, hud.h * 0.44) / 2 + 20, 13, HUD_GREEN, 'center');
    text(`VS ${Math.round(state.vel.y * M_TO_FEET * 60)} fpm`, 56, hud.h * 0.42 + Math.min(300, hud.h * 0.44) / 2 + 20, 13, HUD_GREEN, 'center');
    drawTargetCue(target, state);
    drawMissionBox(mission, state);
    drawWarnings(state);
    drawPanel(state, att, mode, bug);
    drawMinimap(state, target, mission);
    drawMessages(dt);
  };

  return hud;
}
