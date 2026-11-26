// Round analogue gauges drawn on the HUD canvas: airspeed, attitude, altimeter, heading,
// vertical speed and an engine gauge. Back-lit faces, luminous needles, bezel screws.
const FACE = '#0d1418';
const INK = '#e9f5ec';
const LUME = '#7dffb0';
const AMBER = '#ffb03b';
const RED = '#ff4a3d';

function bezel(ctx, x, y, r, label) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.15);
  g.addColorStop(0, '#5a6168');
  g.addColorStop(1, '#1b1f23');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
  ctx.fill();
  const face = ctx.createRadialGradient(x, y - r * 0.4, r * 0.1, x, y, r);
  face.addColorStop(0, '#1d2a30');
  face.addColorStop(1, FACE);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9aa3ab';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 1.06, y + Math.sin(a) * r * 1.06, Math.max(1.2, r * 0.035), 0, Math.PI * 2);
    ctx.fill();
  }
  if (label) {
    ctx.fillStyle = 'rgba(233,245,236,0.75)';
    ctx.font = `600 ${Math.round(r * 0.16)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + r * 0.62);
  }
}

function needle(ctx, x, y, r, angle, color = LUME, width = 0.06) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-r * width, r * 0.12);
  ctx.lineTo(0, -r * 0.86);
  ctx.lineTo(r * width, r * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#2a3238';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
}

function ticks(ctx, x, y, r, from, to, count, major, labels) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(r * 0.17)}px "Trebuchet MS", sans-serif`;
  for (let i = 0; i <= count; i++) {
    const a = from + ((to - from) * i) / count;
    const isMajor = i % major === 0;
    ctx.lineWidth = isMajor ? Math.max(1.5, r * 0.035) : 1;
    const inner = isMajor ? 0.78 : 0.86;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * inner, y - Math.cos(a) * r * inner);
    ctx.lineTo(x + Math.sin(a) * r * 0.95, y - Math.cos(a) * r * 0.95);
    ctx.stroke();
    if (isMajor && labels) {
      const text = labels(i);
      if (text !== null) ctx.fillText(text, x + Math.sin(a) * r * 0.6, y - Math.cos(a) * r * 0.6);
    }
  }
  ctx.textBaseline = 'alphabetic';
}

/** Airspeed indicator in knots with white, green and yellow arcs. */
export function drawAirspeedGauge(ctx, x, y, r, knots) {
  bezel(ctx, x, y, r, 'KNOTS');
  const from = -Math.PI * 0.8;
  const to = Math.PI * 0.8;
  const max = 200;
  const arc = (k0, k1, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.9, from + ((to - from) * k0) / max - Math.PI / 2, from + ((to - from) * k1) / max - Math.PI / 2);
    ctx.stroke();
  };
  arc(45, 95, '#f2f2f2');
  arc(55, 145, '#3bd16f');
  arc(145, 178, AMBER);
  arc(178, 182, RED);
  ticks(ctx, x, y, r, from, to, 20, 4, (i) => String(i * 10));
  needle(ctx, x, y, r, from + ((to - from) * Math.min(knots, max)) / max);
}

/** Artificial horizon: sky and ground split by pitch, rotated by bank, with a fixed miniature aircraft. */
export function drawAttitudeGauge(ctx, x, y, r, pitchDeg, bankDeg) {
  bezel(ctx, x, y, r, null);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate((-bankDeg * Math.PI) / 180);
  const offset = (pitchDeg / 30) * r;
  ctx.fillStyle = '#2f7fd0';
  ctx.fillRect(-r * 2, -r * 2 + offset, r * 4, r * 2);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(-r * 2, offset, r * 4, r * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, r * 0.03);
  ctx.beginPath();
  ctx.moveTo(-r * 2, offset);
  ctx.lineTo(r * 2, offset);
  ctx.stroke();
  ctx.lineWidth = 1;
  for (let p = -20; p <= 20; p += 10) {
    if (p === 0) continue;
    const yy = offset - (p / 30) * r;
    const w = r * (Math.abs(p) === 10 ? 0.3 : 0.45);
    ctx.beginPath();
    ctx.moveTo(-w, yy);
    ctx.lineTo(w, yy);
    ctx.stroke();
  }
  ctx.restore();
  // Bank scale.
  ctx.strokeStyle = INK;
  for (const b of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = (b * Math.PI) / 180;
    ctx.lineWidth = b % 30 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * r * 0.82, y - Math.cos(a) * r * 0.82);
    ctx.lineTo(x + Math.sin(a) * r * 0.95, y - Math.cos(a) * r * 0.95);
    ctx.stroke();
  }
  ctx.strokeStyle = AMBER;
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.55, y);
  ctx.lineTo(x - r * 0.18, y);
  ctx.lineTo(x - r * 0.1, y + r * 0.1);
  ctx.moveTo(x + r * 0.55, y);
  ctx.lineTo(x + r * 0.18, y);
  ctx.lineTo(x + r * 0.1, y + r * 0.1);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

/** Three-pointer altimeter in feet. */
export function drawAltimeterGauge(ctx, x, y, r, feet) {
  bezel(ctx, x, y, r, 'ALT FT');
  ticks(ctx, x, y, r, 0, Math.PI * 2, 50, 5, (i) => (i < 50 ? String(i / 5) : null));
  needle(ctx, x, y, r * 0.62, ((feet % 10000) / 10000) * Math.PI * 2, '#ffffff', 0.1);
  needle(ctx, x, y, r, ((feet % 1000) / 1000) * Math.PI * 2, LUME, 0.05);
  ctx.fillStyle = INK;
  ctx.font = `700 ${Math.round(r * 0.2)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(feet)).padStart(5, ' '), x, y - r * 0.32);
}

/** Heading indicator: a compass card that turns under a fixed lubber line. */
export function drawHeadingGauge(ctx, x, y, r, headingDeg, bugDeg) {
  bezel(ctx, x, y, r, null);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((-headingDeg * Math.PI) / 180);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const major = d % 30 === 0;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r * (major ? 0.76 : 0.84), -Math.cos(a) * r * (major ? 0.76 : 0.84));
    ctx.lineTo(Math.sin(a) * r * 0.94, -Math.cos(a) * r * 0.94);
    ctx.stroke();
    if (major) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      ctx.font = `700 ${Math.round(r * (label.length === 1 && isNaN(+label) ? 0.22 : 0.16))}px "Trebuchet MS", sans-serif`;
      ctx.fillStyle = label === 'N' ? AMBER : INK;
      ctx.save();
      ctx.translate(Math.sin(a) * r * 0.6, -Math.cos(a) * r * 0.6);
      ctx.rotate(a);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }
  if (bugDeg !== null && bugDeg !== undefined) {
    const a = (bugDeg * Math.PI) / 180;
    ctx.fillStyle = '#4dfcff';
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-r * 0.07, -r * 0.98, r * 0.14, r * 0.12);
    ctx.restore();
  }
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x - r * 0.14, y + r * 0.25);
  ctx.lineTo(x, y + r * 0.12);
  ctx.lineTo(x + r * 0.14, y + r * 0.25);
  ctx.closePath();
  ctx.fill();
}

/** Vertical speed indicator in hundreds of feet per minute. */
export function drawVerticalSpeedGauge(ctx, x, y, r, fpm) {
  bezel(ctx, x, y, r, 'VS ×100');
  const clampV = Math.max(-2000, Math.min(2000, fpm));
  const a = -Math.PI / 2 + (clampV / 2000) * Math.PI * 0.85;
  ticks(ctx, x, y, r, -Math.PI / 2 - Math.PI * 0.85, -Math.PI / 2 + Math.PI * 0.85, 8, 2, (i) => String(Math.abs(i * 5 - 20)));
  needle(ctx, x, y, r, a + Math.PI, LUME);
}

/** Engine gauge: throttle arc and fuel quantity bar with a low-fuel warning. */
export function drawEngineGauge(ctx, x, y, r, throttle, fuel, engineOn) {
  bezel(ctx, x, y, r, engineOn ? 'RPM ×100' : 'ENGINE OUT');
  const from = -Math.PI * 0.75;
  const to = Math.PI * 0.75;
  ticks(ctx, x, y, r, from, to, 28, 4, (i) => String(i));
  const rpm = engineOn ? 6 + throttle * 21 : 0;
  needle(ctx, x, y, r, from + ((to - from) * rpm) / 28, engineOn ? LUME : RED);
  const w = r * 1.1;
  const bx = x - w / 2;
  const by = y + r * 0.28;
  ctx.fillStyle = '#05080a';
  ctx.fillRect(bx, by, w, r * 0.14);
  ctx.fillStyle = fuel < 0.15 ? RED : fuel < 0.3 ? AMBER : '#3bd16f';
  ctx.fillRect(bx + 1, by + 1, (w - 2) * fuel, r * 0.14 - 2);
  ctx.fillStyle = INK;
  ctx.font = `600 ${Math.round(r * 0.13)}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`FUEL ${Math.round(fuel * 100)}%`, x, by - r * 0.05);
}
