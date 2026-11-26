// Synthesised sound, no audio files: a piston engine whose pitch follows the throttle and prop
// speed, wind that rises with airspeed, a stall horn, a ring chime and a touchdown thump.
export function createAudio() {
  const audio = { ctx: null, muted: false };

  /** Browsers only allow audio after a user gesture; call this from a click or key press. */
  audio.start = () => {
    if (audio.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass, plus a sub-octave square for the chug.
    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    audio.engineFilter = lp;
    audio.engineOscs = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    audio.engineOscs[0].type = 'sawtooth';
    audio.engineOscs[1].type = 'sawtooth';
    audio.engineOscs[2].type = 'square';
    for (const o of audio.engineOscs) {
      o.connect(lp);
      o.start();
    }
    lp.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);

    // Wind: looped noise through a band-pass.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    audio.windFilter = ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.Q.value = 0.7;
    audio.windGain = ctx.createGain();
    audio.windGain.gain.value = 0;
    noise.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.master);
    noise.start();
    audio.noiseBuffer = buffer;

    // Stall horn: a steady reedy tone gated on and off.
    audio.horn = ctx.createOscillator();
    audio.horn.type = 'triangle';
    audio.horn.frequency.value = 820;
    audio.hornGain = ctx.createGain();
    audio.hornGain.gain.value = 0;
    audio.horn.connect(audio.hornGain);
    audio.hornGain.connect(audio.master);
    audio.horn.start();
  };

  /** Follows the aircraft every frame. */
  audio.update = (state) => {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const on = state.engineOn && !audio.muted;
    const rpm = state.engineOn ? 0.25 + state.throttle * 0.75 + Math.min(state.airspeed / 90, 1) * 0.15 : 0;
    const base = 38 + rpm * 70;
    audio.engineOscs[0].frequency.setTargetAtTime(base, t, 0.08);
    audio.engineOscs[1].frequency.setTargetAtTime(base * 1.012, t, 0.08);
    audio.engineOscs[2].frequency.setTargetAtTime(base / 2, t, 0.08);
    audio.engineFilter.frequency.setTargetAtTime(380 + rpm * 1400, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(on ? 0.08 + rpm * 0.12 : 0, t, 0.15);
    const wind = Math.min(1, state.airspeed / 80);
    audio.windFilter.frequency.setTargetAtTime(300 + wind * 1500, t, 0.2);
    audio.windGain.gain.setTargetAtTime(audio.muted ? 0 : wind * wind * 0.22, t, 0.2);
    audio.hornGain.gain.setTargetAtTime(state.stalled && !audio.muted ? 0.07 : 0, t, 0.03);
  };

  function blip(freq, duration, type = 'sine', gain = 0.2, when = 0) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime + when;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(audio.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  /** Two rising notes when a ring or beacon is taken. */
  audio.chime = () => {
    blip(880, 0.25, 'sine', 0.18);
    blip(1320, 0.35, 'sine', 0.16, 0.09);
  };

  /** A three-note fanfare for a completed mission. */
  audio.fanfare = () => {
    [660, 880, 1100].forEach((f, i) => blip(f, 0.5, 'triangle', 0.16, i * 0.14));
  };

  /** Tyre chirp and thump on touchdown, heavier for harder landings. */
  audio.touchdown = (sink) => {
    blip(90, 0.25 + sink * 0.05, 'sine', Math.min(0.5, 0.12 + sink * 0.06));
    blip(2400, 0.08, 'square', 0.04);
  };

  /** Noise burst for a crash. */
  audio.crash = () => {
    if (!audio.ctx || audio.muted) return;
    const src = audio.ctx.createBufferSource();
    src.buffer = audio.noiseBuffer;
    const g = audio.ctx.createGain();
    const t = audio.ctx.currentTime;
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    src.connect(g);
    g.connect(audio.master);
    src.start(t);
    src.stop(t + 1.5);
    blip(55, 1.2, 'sine', 0.5);
  };

  audio.toggleMute = () => {
    audio.muted = !audio.muted;
    return audio.muted;
  };

  return audio;
}
