/**
 * Generative psychedelic music. Nothing is pre-recorded: a drone, a sitar-ish pluck that wanders
 * around odd scales (quarter-tones included), tabla-ish drums in 7/8 / 5/8 / 9/8 bars, bubbly
 * blorps, backwards cymbal swells and an occasional wobbling kazoo choir, all through a feedback echo.
 * The key lurches every few bars, and the scale changes with whatever is coming out of your bladder.
 */
const SCALES: number[][] = [
  [0, 1.5, 4, 5, 7, 8.5, 10], // 0 quarter-tone maqam (plain pee)
  [0, 1, 4, 5, 7, 8, 10], // 1 phrygian dominant (fire)
  [0, 2, 4, 6, 8, 10], // 2 whole tone (frost)
  [0, 1, 3, 4, 6, 7, 9, 10], // 3 octatonic (acid)
  [0, 1, 2, 5, 6, 8, 11], // 4 crunchy (shock)
  [0, 2, 3, 7, 8], // 5 hirajoshi (poison)
  [0, 2, 4, 6, 7, 9, 11], // 6 lydian (heal)
];

/** Bars come in odd lengths; the numbers say where the beat groups begin (in eighth notes). */
const BARS: { len: number; groups: number[] }[] = [
  { len: 7, groups: [0, 3, 5] },
  { len: 7, groups: [0, 2, 4] },
  { len: 5, groups: [0, 3] },
  { len: 9, groups: [0, 2, 4, 6] },
];

const KEY_JUMPS = [0, 5, 7, 6, -2, 3, 10, -5];

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  on = true;
  private ctx: AudioContext | null = null;
  private out!: GainNode; // master
  private inst!: GainNode; // instruments before the echo
  private noise!: AudioBuffer;
  private timer: number | undefined;
  private nextTime = 0;
  private step = 0;
  private barIdx = 0;
  private bar = BARS[0];
  private barCount = 0;
  private root = 50; // MIDI D3
  private baseRoot = 50;
  private scaleIdx = 0;
  private pendingScale = 0;
  private degree = 0;
  private intensity = 0;
  private lastKick = -10;
  private drone: { a: OscillatorNode; b: OscillatorNode; c: OscillatorNode } | null = null;

  constructor(private getCtx: () => AudioContext | null) {}

  /** Call after the first user click (audio needs a gesture). */
  start() {
    if (this.timer !== undefined) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    this.ctx = ctx;
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.out = ctx.createGain();
    this.out.gain.value = this.on ? 0.3 : 0;
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(ctx.destination);

    this.inst = ctx.createGain();
    this.inst.connect(this.out);
    // feedback echo with a dark loop
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = ctx.createGain();
    fb.gain.value = 0.48;
    const dark = ctx.createBiquadFilter();
    dark.type = 'lowpass';
    dark.frequency.value = 2300;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.inst.connect(delay);
    delay.connect(dark).connect(fb).connect(delay);
    dark.connect(wet).connect(this.out);
    // the echo time itself drifts, so the repeats warble
    const wob = ctx.createOscillator();
    wob.frequency.value = 0.21;
    const wg = ctx.createGain();
    wg.gain.value = 0.012;
    wob.connect(wg).connect(delay.delayTime);
    wob.start();

    this.startDrone();
    this.nextTime = ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  setEnabled(on: boolean) {
    this.on = on;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(on ? 0.3 : 0, this.ctx.currentTime, 0.15);
  }

  /** 0..1: how wild things are (fighting, riding, a potion in your system). */
  setIntensity(x: number) {
    this.intensity = x;
  }

  /** Pick the scale for a pee type (index into the pee kinds). */
  setMood(kindIdx: number) {
    this.pendingScale = Math.max(0, Math.min(SCALES.length - 1, kindIdx));
  }

  /** A 0..1 thump that decays after each drum hit, for the visuals. */
  pulse(): number {
    if (!this.ctx || !this.on) return 0;
    const dt = this.ctx.currentTime - this.lastKick;
    return dt < 0 ? 0 : Math.exp(-dt * 7);
  }

  private startDrone() {
    const ctx = this.ctx!;
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    const b = ctx.createOscillator();
    b.type = 'sawtooth';
    const c = ctx.createOscillator();
    c.type = 'sine';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 380;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.07;
    a.connect(f);
    b.connect(f);
    c.connect(g);
    f.connect(g);
    g.connect(this.inst);
    a.start();
    b.start();
    c.start();
    lfo.start();
    this.drone = { a, b, c };
    this.tuneDrone(0.05);
  }

  private tuneDrone(glide: number) {
    if (!this.drone || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = mtof(this.root);
    this.drone.a.frequency.setTargetAtTime(f, t, glide);
    this.drone.b.frequency.setTargetAtTime(f * 1.5 * 1.004, t, glide); // slightly sour fifth
    this.drone.c.frequency.setTargetAtTime(f / 2, t, glide);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    // if the tab was asleep, don't try to play catch-up
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.nextTime);
      const tempo = 108 + Math.sin(this.barCount * 0.37) * 14 + this.intensity * 26; // wobbling tempo
      const eighth = 30 / tempo;
      const swing = this.step % 2 === 1 ? 0.012 : 0; // slightly drunk
      this.nextTime += eighth + swing * (Math.random() - 0.3);
      this.step++;
      if (this.step >= this.bar.len) {
        this.step = 0;
        this.barCount++;
        this.barIdx = (this.barIdx + (Math.random() < 0.3 ? 2 : 1)) % BARS.length;
        this.bar = BARS[this.barIdx];
        this.scaleIdx = this.pendingScale;
        if (this.barCount % 8 === 0) {
          const j = KEY_JUMPS[Math.floor(Math.random() * KEY_JUMPS.length)];
          this.root = this.baseRoot + j;
          this.tuneDrone(0.6);
        }
      }
    }
  }

  private scaleNote(degree: number, octaveBase: number): number {
    const sc = SCALES[this.scaleIdx];
    const n = sc.length;
    const oct = Math.floor(degree / n);
    const idx = ((degree % n) + n) % n;
    return this.root + octaveBase + oct * 12 + sc[idx];
  }

  private playStep(t: number) {
    const ctx = this.ctx!;
    const s = this.step;
    const groupStart = this.bar.groups.includes(s);
    const first = s === 0;
    const wild = this.intensity;

    // drums: a deep thump on each group start, a tabla-ish "tak" on the other beats
    if (groupStart) {
      this.kick(t, first ? 1 : 0.7);
      if (first) this.lastKick = t;
    } else if (Math.random() < 0.55 + wild * 0.3) {
      this.tak(t, 0.5 + Math.random() * 0.4);
    }
    if (Math.random() < 0.35 + wild * 0.5) this.hat(t, s % 2 ? 0.5 : 0.28);

    // bass: wobbly FM growl on the beat groups
    if (groupStart && Math.random() < 0.85) this.bass(t, this.scaleNote(Math.random() < 0.7 ? 0 : [2, 4, -3][Math.floor(Math.random() * 3)], -12));

    // wandering sitar pluck
    if (Math.random() < 0.5 + wild * 0.3) {
      const r = Math.random();
      this.degree += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.82 ? 2 : r < 0.92 ? -2 : r < 0.97 ? 5 : -5;
      this.degree = Math.max(-4, Math.min(11, this.degree));
      this.pluck(t, this.scaleNote(this.degree, 12), 0.5 + Math.random() * 0.5, (Math.random() * 2 - 1) * 0.7);
    }

    // bubbly blorps
    if (Math.random() < 0.07 + wild * 0.07) this.blorp(t);

    if (first) {
      if (Math.random() < 0.2) this.swell(t, (this.bar.len * 30) / 110);
      if (Math.random() < 0.16) this.kazoo(t, this.scaleNote(Math.floor(Math.random() * 5), 12 + (Math.random() < 0.5 ? 0 : 12)), 1.6);
    }
    void ctx;
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.9 * v, 0.004, 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private tak(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const f = 520 + Math.random() * 380;
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.09);
    const g = ctx.createGain();
    this.env(g, t, 0.28 * v, 0.003, 0.11);
    o.connect(g).connect(this.inst);
    o.start(t);
    o.stop(t + 0.15);
  }

  private hat(t: number, v: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    this.env(g, t, 0.14 * v, 0.002, 0.04);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.08);
  }

  private bass(t: number, midi: number) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    car.type = 'sawtooth';
    const f = mtof(midi);
    car.frequency.setValueAtTime(f * 1.5, t);
    car.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 2.01;
    const mg = ctx.createGain();
    mg.gain.value = f * 1.2;
    mod.connect(mg).connect(car.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 8;
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.34, 0.01, 0.4);
    car.connect(lp).connect(g).connect(this.out);
    car.start(t);
    mod.start(t);
    car.stop(t + 0.5);
    mod.stop(t + 0.5);
  }

  private pluck(t: number, midi: number, v: number, pan: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.94, t); // sitar-style slide up into the note
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.setValueAtTime(f * 2.005, t);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(f * 5, t);
    bp.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.34 * v, 0.004, 0.55);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    const pan2 = ctx.createStereoPanner();
    pan2.pan.value = pan;
    o.connect(bp);
    o2.connect(g2).connect(bp);
    bp.connect(g).connect(pan2).connect(this.inst);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.7);
    o2.stop(t + 0.7);
  }

  private blorp(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const f = 200 + Math.random() * 700;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (1.8 + Math.random() * 1.5), t + 0.13);
    const g = ctx.createGain();
    this.env(g, t, 0.18, 0.01, 0.15);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 2 - 1;
    o.connect(g).connect(p).connect(this.inst);
    o.start(t);
    o.stop(t + 0.2);
  }

  /** A backwards-cymbal style rising wash. */
  private swell(t: number, dur: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(this.inst);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** A wobbling, vowel-ish lead: half choir, half kazoo. */
  private kazoo(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.4;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.03, t + dur * 0.7);
    vib.connect(vg).connect(o.frequency);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.linearRampToValueAtTime(1500, t + dur); // "ooo" opening to "aaa"
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.25);
    g.gain.setValueAtTime(0.22, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g).connect(this.inst);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }
}
