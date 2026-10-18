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

export type MusicStyle = 'trip' | 'acid' | 'stoner';

export class Music {
  on = true;
  private vol = 0.5; // the player's volume slider, 0..1
  private style: MusicStyle = 'trip';
  private echo: DelayNode | null = null;
  private droneOut: GainNode | null = null;
  private fuzz: WaveShaperNode | null = null;
  private squelch: WaveShaperNode | null = null;
  private acidPat: { on: boolean; n: number; acc: boolean; slide: boolean }[] = [];
  private lastAcid = 0;
  private riff: { s: number; n: number; len: number }[] = [];
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
    this.out.gain.value = this.level();
    const comp = ctx.createDynamicsCompressor();
    this.out.connect(comp).connect(ctx.destination);

    this.inst = ctx.createGain();
    this.inst.connect(this.out);
    // feedback echo with a dark loop
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.42;
    this.echo = delay;
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

    const curve = (k: number) => {
      const c = new Float32Array(2048);
      for (let i = 0; i < c.length; i++) {
        const x = (i / (c.length - 1)) * 2 - 1;
        c[i] = Math.tanh(x * k);
      }
      return c;
    };
    this.fuzz = ctx.createWaveShaper();
    this.fuzz.curve = curve(40);
    this.fuzz.oversample = '2x';
    this.squelch = ctx.createWaveShaper();
    this.squelch.curve = curve(4);
    this.startDrone();
    this.applyStyle();
    this.nextTime = ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  /** Pick the soundtrack: the weird jam (forest), acid techno (mushrooms) or stoner metal (desert). */
  setStyle(s: MusicStyle) {
    this.style = s;
    this.step = 0;
    this.barCount = 0;
    this.regen();
    this.applyStyle();
  }

  private applyStyle() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.droneOut?.gain.setTargetAtTime(this.style === 'trip' ? 0.07 : 0, t, 0.3);
    this.echo?.delayTime.setTargetAtTime(this.style === 'acid' ? 0.336 : this.style === 'stoner' ? 0.625 : 0.42, t, 0.1);
  }

  /** New bassline / riff every four bars. */
  private regen() {
    if (this.style === 'acid') {
      const sc = [0, 0, 3, 5, 7, 10, 12, 15];
      this.acidPat = Array.from({ length: 16 }, (_, i) => ({
        on: Math.random() > (i % 4 === 0 ? 0.1 : 0.3),
        n: sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.2 ? 12 : 0),
        acc: Math.random() < 0.28,
        slide: Math.random() < 0.25,
      }));
    } else if (this.style === 'stoner') {
      const rhythms = [[0, 3, 6, 8, 11, 14], [0, 4, 6, 10, 12, 14], [0, 2, 3, 8, 10, 11], [0, 6, 8, 14], [0, 3, 8, 11]];
      const rh = rhythms[Math.floor(Math.random() * rhythms.length)];
      const notes = [0, 0, 0, 0, 3, 5, 6, 7, 10];
      this.riff = rh.map((s, i) => ({ s, n: notes[Math.floor(Math.random() * notes.length)], len: Math.max(1, (rh[i + 1] ?? 16) - s) }));
      this.riff[0].n = 0;
    }
  }

  /** Master level: much quieter than it used to be, and scaled by the volume slider. */
  private level(): number {
    return this.on ? 0.2 * this.vol : 0;
  }

  setEnabled(on: boolean) {
    this.on = on;
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15);
  }

  setVolume(v: number) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.ctx && this.out) this.out.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.1);
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
    this.droneOut = g;
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
      if (this.style !== 'trip') {
        const bpm = this.style === 'acid' ? 134 + this.intensity * 6 : 70 + this.intensity * 5;
        if (this.style === 'acid') this.acidStep(this.nextTime);
        else this.stonerStep(this.nextTime);
        this.nextTime += 15 / bpm; // a sixteenth note
        this.step++;
        if (this.step >= 16) {
          this.step = 0;
          this.barCount++;
          if (this.barCount % 4 === 0) this.regen();
        }
        continue;
      }
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

  // ======================================================================================
  //  ACID TECHNO (Mushroom Hollow): 134 BPM, four on the floor, a squelching 303 bassline
  // ======================================================================================

  private acidStep(t: number) {
    const s = this.step;
    const bar = this.barCount;
    const breakdown = bar % 16 >= 14; // two bars without the kick, then it comes back in
    if (s % 4 === 0 && !breakdown) {
      this.kick(t, 1.15);
      if (s === 0) this.lastKick = t;
    }
    if (s % 4 === 2) this.ohat(t, 0.9);
    else if (Math.random() < 0.65 + this.intensity * 0.3) this.hat(t, s % 2 ? 0.45 : 0.25);
    if ((s === 4 || s === 12) && !breakdown) this.clap(t);
    const p = this.acidPat[s];
    if (p?.on) this.acid303(t, 40 + p.n, p.acc, p.slide);
    if (bar % 8 >= 4 && s % 2 === 0 && Math.random() < 0.75) this.arp(t, 64 + [0, 3, 7, 10, 12, 15][Math.floor(Math.random() * 6)] + (s % 8 === 0 ? 12 : 0));
    if (s === 0 && bar % 16 === 14) this.swell(t, 32 * (15 / 134));
    if (s === 0 && bar % 4 === 0 && Math.random() < 0.3) this.blorp(t);
  }

  private acid303(t: number, midi: number, accent: boolean, slide: boolean) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    if (slide && this.lastAcid) {
      o.frequency.setValueAtTime(this.lastAcid, t);
      o.frequency.linearRampToValueAtTime(f, t + 0.05);
    } else {
      o.frequency.setValueAtTime(f, t);
    }
    this.lastAcid = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 15;
    const base = 450 + 1700 * (0.5 + 0.5 * Math.sin(this.barCount * 0.5 + this.step * 0.07)); // the filter wobbles over the bars
    lp.frequency.setValueAtTime(base * (accent ? 3.2 : 1.8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, base * 0.35), t + 0.17);
    const g = ctx.createGain();
    this.env(g, t, accent ? 0.42 : 0.3, 0.004, 0.14);
    o.connect(lp);
    if (this.squelch) lp.connect(this.squelch).connect(g);
    else lp.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.22);
  }

  private ohat(t: number, v: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6500;
    const g = ctx.createGain();
    this.env(g, t, 0.2 * v, 0.003, 0.12);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.18);
  }

  private clap(t: number) {
    const ctx = this.ctx!;
    for (const d of [0, 0.011, 0.023]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      this.env(g, t + d, d === 0.023 ? 0.4 : 0.25, 0.002, d === 0.023 ? 0.16 : 0.03);
      src.connect(f).connect(g).connect(this.inst);
      src.start(t + d);
      src.stop(t + d + 0.2);
    }
  }

  private arp(t: number, midi: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    const g = ctx.createGain();
    this.env(g, t, 0.1, 0.003, 0.11);
    const pn = ctx.createStereoPanner();
    pn.pan.value = Math.random() * 1.4 - 0.7;
    o.connect(lp).connect(g).connect(pn).connect(this.inst);
    o.start(t);
    o.stop(t + 0.17);
  }

  // ======================================================================================
  //  STONER METAL (Desert Trip): 70 BPM, fuzzed-out drop-D riffs, huge drums, a wailing solo
  // ======================================================================================

  private stonerStep(t: number) {
    const s = this.step;
    const bar = this.barCount;
    const b4 = bar % 4;
    const step = 15 / (70 + this.intensity * 5);
    // drums: a lumbering half-time groove
    if (s === 0 || s === 6 || s === 10) {
      this.heavyKick(t);
      if (s === 0) this.lastKick = t;
    }
    if (s === 8) this.bigSnare(t);
    if (s % 4 === 0 && !(b4 === 3 && s >= 12)) this.ride(t, s === 0 ? 1 : 0.6);
    if (s === 0 && b4 === 0) this.crash(t);
    if (b4 === 3 && s >= 12) this.tom(t, 190 - (s - 12) * 28); // a tom fill into the next riff
    // the riff: fuzzed power chords with the bass doubling underneath
    const r = this.riff.find((x) => x.s === s);
    if (r) {
      this.fuzzChord(t, 38 + r.n, r.len * step * 0.95);
      this.bassNote(t, 26 + r.n, r.len * step * 0.95);
    }
    // a slow wailing solo over the top every eight bars
    if (bar % 8 >= 6 && s % 8 === 0) this.wail(t, 62 + [0, 3, 5, 7, 10, 12, 15][Math.floor(Math.random() * 7)], step * 7);
  }

  private fuzzChord(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const mix = ctx.createGain();
    for (const [semi, type, det] of [[0, 'sawtooth', 0], [7, 'sawtooth', 5], [12, 'square', -6]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = mtof(midi + semi);
      o.detune.value = det;
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.12);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.setValueAtTime(0.2, t + Math.max(0.02, dur * 0.8));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    mix.gain.value = 0.5;
    if (this.fuzz) mix.connect(this.fuzz).connect(lp);
    else mix.connect(lp);
    lp.connect(g).connect(this.out);
    // a whisper of echo so the riff rings in the desert
    const send = ctx.createGain();
    send.gain.value = 0.25;
    g.connect(send).connect(this.inst);
  }

  private bassNote(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.012);
    g.gain.setValueAtTime(0.42, t + Math.max(0.02, dur * 0.85));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.out);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  private heavyKick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    const g = ctx.createGain();
    this.env(g, t, 1.0, 0.004, 0.5);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.6);
  }

  private bigSnare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, t, 0.55, 0.002, 0.3);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.35);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    const g2 = ctx.createGain();
    this.env(g2, t, 0.5, 0.002, 0.2);
    o.connect(g2).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
  }

  private ride(t: number, v: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    this.env(g, t, 0.13 * v, 0.002, 0.3);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 0.35);
  }

  private crash(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4200;
    const g = ctx.createGain();
    this.env(g, t, 0.3, 0.003, 1.8);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + 2);
  }

  private tom(t: number, f0: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(Math.max(70, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(50, f0 * 0.6), t + 0.2);
    const g = ctx.createGain();
    this.env(g, t, 0.7, 0.003, 0.24);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  /** A slow, vibrato-heavy fuzz guitar lead that bends up into each note. */
  private wail(t: number, midi: number, dur: number) {
    const ctx = this.ctx!;
    const f = mtof(midi);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.89, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.25);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(f * 0.025, t + dur * 0.6);
    vib.connect(vg).connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.05);
    g.gain.setValueAtTime(0.16, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (this.fuzz) o.connect(this.fuzz).connect(lp);
    else o.connect(lp);
    lp.connect(g).connect(this.out);
    const send = ctx.createGain();
    send.gain.value = 0.5;
    g.connect(send).connect(this.inst);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }
}
