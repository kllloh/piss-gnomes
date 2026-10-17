/** Procedural sound effects and gnome voices (no asset files needed). */
export type Voice = 'gnome' | 'goblin' | 'announcer';

export class Sound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lx = 0;
  private lz = 0;
  private lyaw = 0;
  private lastTaunt = 0;
  private voiceCache: SpeechSynthesisVoice | null | undefined;
  tauntsOn = true;

  init() {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        const len = Math.floor(this.ctx.sampleRate * 0.4);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Tell the mixer where the listener is, so sounds can be panned and attenuated. */
  setListener(x: number, z: number, yaw: number) {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  /** Volume (0..1) and stereo pan (-1..1) for a sound at world position (x, z). */
  spatial(x: number, z: number): { vol: number; pan: number } {
    const dx = x - this.lx;
    const dz = z - this.lz;
    const dist = Math.hypot(dx, dz);
    const vol = Math.max(0, Math.min(1, 1 - dist / 55));
    // listener's right vector for yaw: (cos, -sin)
    const pan = dist < 0.5 ? 0 : Math.max(-1, Math.min(1, (dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw)) / dist));
    return { vol, pan };
  }

  /** gain -> optional panner -> speakers. Returns the node to feed audio into. */
  private out(vol: number, pan: number): { input: AudioNode; gain: GainNode } | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan !== 0 && typeof this.ctx.createStereoPanner === 'function') {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.ctx.destination);
    } else {
      g.connect(this.ctx.destination);
    }
    return { input: g, gain: g };
  }

  private burst(vol: number, cutoff: number, decay: number, pan = 0, delay = 0) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const o = this.out(vol, pan);
    if (!o) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(200, t + decay);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + decay);
    src.connect(f).connect(env).connect(o.input);
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  private tone(vol: number, f0: number, f1: number, dur: number, type: OscillatorType = 'sine', pan = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.out(vol, pan);
    if (!o) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(env).connect(o.input);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(vol = 1, pan = 0, heavy = false) {
    if (heavy) {
      this.burst(0.8 * vol, 2600, 0.3, pan);
      this.tone(0.5 * vol, 100, 30, 0.2, 'sine', pan);
      return;
    }
    this.burst(0.5 * vol, 4000, 0.16, pan);
    this.tone(0.35 * vol, 140, 40, 0.12, 'sine', pan);
  }
  /** Something solid breaking apart. */
  crash(vol = 1, pan = 0) {
    this.burst(0.7 * vol, 1500, 0.45, pan);
    this.tone(0.4 * vol, 90, 35, 0.3, 'sine', pan);
  }
  boom(vol = 1, pan = 0) {
    this.burst(1.0 * vol, 1800, 0.8, pan);
    this.tone(0.8 * vol, 70, 25, 0.5, 'sine', pan);
  }
  smokePop(vol = 1, pan = 0) {
    this.burst(0.5 * vol, 900, 0.9, pan);
    this.tone(0.25 * vol, 200, 90, 0.2, 'sine', pan);
  }
  whoosh(vol = 0.5) {
    this.tone(0.12 * vol, 300, 700, 0.15, 'sawtooth');
  }
  hit(head = false) {
    this.tone(0.25, head ? 1400 : 800, head ? 900 : 500, 0.07, 'square');
  }
  hurt() {
    this.tone(0.5, 90, 40, 0.25);
  }
  reload() {
    this.tone(0.15, 500, 300, 0.05, 'square');
    setTimeout(() => this.tone(0.15, 700, 500, 0.05, 'square'), 900);
  }
  empty() {
    this.tone(0.12, 300, 250, 0.04, 'square');
  }

  // --- gnome voices ----------------------------------------------------------

  /** A gnome got shot: short indignant squeak. `p` is the gnome's voice pitch (~1.5-2). */
  gnomeHit(vol: number, pan: number, p = 1.8, rasp = false) {
    if (vol < 0.03) return;
    const base = 420 * p;
    if (rasp) {
      // goblins grunt: low, buzzy, with a bit of breath
      this.tone(0.26 * vol, base, base * 0.6, 0.11, 'square', pan);
      this.burst(0.12 * vol, 1400, 0.09, pan);
      return;
    }
    this.tone(0.22 * vol, base, base * 1.7, 0.09, 'sawtooth', pan);
    this.tone(0.14 * vol, base * 1.5, base * 0.9, 0.07, 'square', pan, 0.05);
  }

  /** A gnome died: long falling wail with a wobble, then a soft thud. */
  gnomeDeath(vol: number, pan: number, p = 1.8, rasp = false) {
    if (vol < 0.03 || !this.ctx) return;
    if (rasp) this.burst(0.25 * vol, 1100, 0.5, pan);
    const t = this.ctx.currentTime;
    const o = this.out(0.3 * vol, pan);
    if (!o) return;
    const osc = this.ctx.createOscillator();
    osc.type = rasp ? 'square' : 'sawtooth';
    osc.frequency.setValueAtTime(620 * p, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.7);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 40;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 1.5;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    osc.connect(f).connect(env).connect(o.input);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.8);
    lfo.stop(t + 0.8);
    this.tone(0.3 * vol, 90, 35, 0.2, 'sine', pan, 0.6);
  }

  // --- speech: pick a fitting system voice per character ----------------------------

  private pools: Record<Voice, SpeechSynthesisVoice[]> | null = null;
  private poolsFor = 0;

  private voicePools() {
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!ss) return null;
    const vs = ss.getVoices();
    if (!vs.length) return null; // not loaded yet; try again next time
    if (this.pools && this.poolsFor === vs.length) return this.pools;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    // prefer the natural-sounding neural/online voices when the system has them
    const score = (v: SpeechSynthesisVoice) =>
      (/(natural|neural|online)/i.test(v.name) ? 60 : 0) + (/google/i.test(v.name) ? 25 : 0) + (v.localService ? 0 : 10);
    const best = (list: SpeechSynthesisVoice[]) => list.slice().sort((x, y) => score(y) - score(x));
    const MALE = /(guy|ryan|daniel|george|arthur|alfie|thomas|david|mark|james|oliver|brian|eric|roger|christopher|steffan|liam|connor|prabhat|mitchell|william|sean|ethan|rishi|male)/i;
    const FEMALE = /(libby|sonia|hazel|susan|aria|jenny|zira|emma|michelle|ana\b|sara|natasha|clara|mia\b|female|moira|samantha|karen|tessa)/i;
    const gb = en.filter((v) => /en[-_]GB/i.test(v.lang));
    const males = en.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name));
    const pool = en.length ? en : vs;
    this.pools = {
      // gnomes: posh British-ish voices, goblins: low male voices
      gnome: best(gb.length ? gb : pool).slice(0, 4),
      goblin: best(males.length ? males : pool).slice(0, 4),
      announcer: best(males.length ? males : pool).slice(0, 2),
    };
    this.poolsFor = vs.length;
    return this.pools;
  }

  /** Names of the voices that will be used (for debugging). */
  voiceNames() {
    const p = this.voicePools();
    return p ? { gnome: p.gnome.map((v) => v.name), goblin: p.goblin.map((v) => v.name), announcer: p.announcer.map((v) => v.name) } : null;
  }

  /** Called whenever a line is actually spoken, so the game can show a subtitle. */
  onSpeak: ((name: string, text: string, voice: Voice) => void) | null = null;
  private curPrio = 0;

  /**
   * Speak a line in the character's own voice (browser speech), or babble if speech isn't available.
   * Higher `prio` lines (the announcer, the player) cut off lesser ones; gnomes only speak when it is quiet.
   * Now and then a line comes out screamed, drawled or whispered.
   */
  taunt(text: string, vol: number, pan: number, p = 1.8, faction: Voice = 'gnome', seed = 0, prio = 0, name = '') {
    if (!this.tauntsOn || vol < 0.12) return;
    const now = performance.now();
    if (prio === 0 && now - this.lastTaunt < 1100) return;
    const ss = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (ss && typeof SpeechSynthesisUtterance !== 'undefined') {
      if (ss.speaking || ss.pending) {
        // a line that has been "speaking" for ages is a stuck engine: reset it
        if (now - this.lastTaunt < 7000 && prio <= this.curPrio) return;
        ss.cancel();
      }
      this.lastTaunt = now;
      this.curPrio = prio;
      const u = new SpeechSynthesisUtterance(text);
      const jitter = ((seed % 7) - 3) * 0.02;
      // moderate pitch shifts keep it sounding like a person (extreme ones sound like a chipmunk)
      let pitch = faction === 'gnome' ? Math.min(1.5, 1.05 + (p - 1.5) * 0.5 + jitter) : faction === 'goblin' ? Math.max(0.5, Math.min(0.85, p * 0.9)) : 0.55;
      let rate = (faction === 'gnome' ? 1.08 : faction === 'goblin' ? 0.9 : 1.02) + jitter;
      let volume = Math.min(1, vol);
      const r = Math.random();
      if (r < 0.1 || /[A-Z]{4,}/.test(text)) { pitch = Math.min(2, pitch * 1.3); rate *= 1.25; volume = 1; } // screamed
      else if (r < 0.17) rate *= 0.6; // drawled
      else if (r < 0.22) { pitch *= 0.85; volume *= 0.55; } // whispered
      u.pitch = pitch;
      u.rate = rate;
      u.volume = volume;
      const pool = this.voicePools();
      const list = pool ? pool[faction] : [];
      if (list.length) u.voice = list[seed % list.length];
      u.onend = () => { this.curPrio = 0; };
      ss.speak(u);
      this.onSpeak?.(name, text, faction);
      return;
    }
    this.lastTaunt = now;
    this.onSpeak?.(name, text, faction);
    for (let i = 0; i < 4; i++) {
      const f = (400 + Math.random() * 500) * p;
      this.tone(0.14 * vol, f, f * (0.8 + Math.random() * 0.6), 0.07, 'square', pan, i * 0.09);
    }
  }

  stopTaunts() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  }

  // --- voiced noises built from a buzzy source through a "vowel" filter ----------------

  private vowel(vol: number, f0: number, f1: number, dur: number, formant: number, pan = 0, delay = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.out(vol, pan);
    if (!o) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(f1, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = formant;
    f.Q.value = 4;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f).connect(env).connect(o.input);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** A gleeful laugh: "hehehe" for gnomes, a low "heh heh heh" for goblins. */
  cackle(vol: number, pan: number, faction: 'gnome' | 'goblin') {
    if (!this.tauntsOn || vol < 0.08) return;
    const goblin = faction === 'goblin';
    const n = goblin ? 4 : 5;
    for (let i = 0; i < n; i++) {
      const f0 = (goblin ? 110 : 330) * (1 + (Math.random() - 0.5) * 0.15);
      this.vowel(0.35 * vol, f0, f0 * 0.85, 0.1, goblin ? 650 : 1000, pan, i * (goblin ? 0.17 : 0.13));
    }
  }

  /** Goblin flatulence. Brrrp. */
  fart(vol: number, pan: number) {
    if (!this.ctx || vol < 0.05) return;
    const t = this.ctx.currentTime;
    const dur = 0.55 + Math.random() * 0.6;
    const o = this.out(0.45 * vol, pan);
    if (!o) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + dur);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 22 + Math.random() * 16;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 28;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.03);
    env.gain.setValueAtTime(1, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(f).connect(env).connect(o.input);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.burst(0.18 * vol, 500, dur, pan);
  }

  /** Gnome sneeze: ah... ah... CHOO! */
  sneeze(vol: number, pan: number) {
    if (!this.ctx || !this.noise || vol < 0.05) return;
    const t = this.ctx.currentTime;
    const o = this.out(0.5 * vol, pan);
    if (!o) return;
    // the inhale: a rising airy sweep
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.38);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.02, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.36);
    env.gain.linearRampToValueAtTime(0.0001, t + 0.4);
    src.connect(bp).connect(env).connect(o.input);
    src.start(t);
    src.stop(t + 0.42);
    // the explosion
    this.burst(0.9 * vol, 5200, 0.22, pan, 0.52);
    this.tone(0.3 * vol, 950, 280, 0.2, 'sawtooth', pan, 0.52);
  }

  /** Something wet. */
  squelch(vol: number, pan: number) {
    this.burst(0.35 * vol, 700, 0.18, pan);
    this.tone(0.25 * vol, 220, 70, 0.14, 'sine', pan);
  }

  /** A hat getting bonked off, with a cartoon boing. */
  bonk(vol = 0.7) {
    this.tone(0.3 * vol, 520, 200, 0.09, 'square');
    this.tone(0.2 * vol, 300, 760, 0.18, 'sine', 0, 0.06);
  }

  private sawNodes: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  /** Chainsaw engine loop: idles while it's in your hands, roars while it cuts. */
  saw(on: boolean, rev: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.sawNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 62;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 124;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(f);
      osc2.connect(f);
      f.connect(gain).connect(this.ctx.destination);
      osc.start();
      osc2.start();
      this.sawNodes = { osc, osc2, gain };
    }
    const n = this.sawNodes;
    if (!n) return;
    if (on) {
      const f = rev ? 96 : 62;
      n.gain.gain.setTargetAtTime(rev ? 0.16 : 0.045, t, 0.05);
      n.osc.frequency.setTargetAtTime(f, t, 0.08);
      n.osc2.frequency.setTargetAtTime(f * 2.02, t, 0.08);
    } else {
      n.gain.gain.setTargetAtTime(0.0001, t, 0.05);
      this.sawNodes = null;
      setTimeout(() => {
        try { n.osc.stop(); n.osc2.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  }

  /** RPG launch: a long hiss and a thump. */
  rocket(vol = 1, pan = 0) {
    this.burst(0.7 * vol, 2500, 0.9, pan);
    this.tone(0.35 * vol, 180, 60, 0.5, 'sawtooth', pan);
  }

  /** The chainsaw biting wood or stone. */
  chunk(vol = 0.6) {
    this.burst(0.35 * vol, 1200, 0.09);
    this.tone(0.2 * vol, 140, 70, 0.1, 'square');
  }

  /** Lots of tiny feet. */
  skitter(vol: number, pan: number) {
    if (vol < 0.06) return;
    for (let i = 0; i < 5; i++) this.burst(0.1 * vol, 3500, 0.03, pan, i * 0.05 + Math.random() * 0.02);
  }

  /** An angry wasp going past. */
  buzz(vol: number, pan: number) {
    if (vol < 0.06) return;
    this.tone(0.08 * vol, 210, 190, 0.35, 'sawtooth', pan);
    this.tone(0.05 * vol, 420, 380, 0.35, 'square', pan);
  }

  // --- pee wars ------------------------------------------------------------------------

  private peeNodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;

  /** The sound of the stream: filtered hiss that changes colour with the potion. */
  pee(on: boolean, kindIdx = 0) {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    if (on && !this.peeNodes) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.1;
      filter.frequency.value = 2600;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      src.connect(filter).connect(gain).connect(this.ctx.destination);
      src.start();
      this.peeNodes = { src, filter, gain };
    }
    const n = this.peeNodes;
    if (!n) return;
    if (on) {
      const f = [2600, 4300, 5400, 1800, 3700, 1500, 3000][kindIdx] ?? 2600;
      n.filter.frequency.setTargetAtTime(f, t, 0.05);
      n.gain.gain.setTargetAtTime(0.12, t, 0.04);
    } else {
      n.gain.gain.setTargetAtTime(0.0001, t, 0.05);
      this.peeNodes = null;
      setTimeout(() => {
        try { n.src.stop(); } catch { /* already stopped */ }
      }, 300);
    }
  }

  /** Picked up a potion: a little magical arpeggio. */
  potion() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(0.14, f, f, 0.12, 'sine', 0, i * 0.07));
  }

  /** A zone changed hands. Good news is a rising horn, bad news a falling one. */
  horn(good: boolean) {
    const a = good ? 220 : 260;
    const b = good ? 330 : 170;
    this.tone(0.28, a, a, 0.35, 'sawtooth');
    this.tone(0.28, b, b, 0.5, 'sawtooth', 0, 0.3);
  }

  /** Lightning jumping between fighters. */
  zap(vol: number, pan: number) {
    this.burst(0.4 * vol, 5000, 0.08, pan);
    this.tone(0.22 * vol, 1800, 300, 0.12, 'square', pan);
  }

  // --- movement, riding and the rest of the forest ---------------------------------------

  /** The audio context, for the music engine (null until the first click). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** A footstep: soft grass crunch. `kind` 0 = boots, 1 = many little bug legs, 2 = heavy beetle thump. */
  step(vol: number, pan: number, kind = 0) {
    if (vol < 0.04) return;
    if (kind === 1) {
      for (let i = 0; i < 4; i++) this.burst(0.16 * vol, 4200, 0.025, pan, i * 0.035 + Math.random() * 0.015);
      return;
    }
    if (kind === 2) {
      this.burst(0.5 * vol, 700, 0.12, pan);
      this.tone(0.45 * vol, 70, 35, 0.16, 'sine', pan);
      return;
    }
    this.burst(0.2 * vol, 1500 + Math.random() * 900, 0.07, pan);
    this.tone(0.07 * vol, 120 + Math.random() * 40, 60, 0.06, 'sine', pan);
  }

  jump() {
    this.tone(0.14, 200, 520, 0.14, 'sine');
    this.burst(0.08, 2000, 0.1);
  }

  land(vol = 1) {
    this.burst(0.3 * vol, 900, 0.1);
    this.tone(0.28 * vol, 90, 40, 0.14, 'sine');
  }

  /** Climbing on a bug: a wet squelch and a happy boing. */
  mount() {
    this.squelch(0.8, 0);
    this.tone(0.22, 220, 660, 0.22, 'sine', 0, 0.05);
    this.tone(0.12, 440, 1320, 0.18, 'triangle', 0, 0.12);
  }

  dismount() {
    this.tone(0.2, 600, 200, 0.2, 'sine');
    this.squelch(0.5, 0);
  }

  /** A bug getting pee on its shell: crunchy tick and a little squeal. */
  mountHit(vol: number, pan: number) {
    if (vol < 0.05) return;
    this.burst(0.18 * vol, 3000, 0.05, pan);
    this.tone(0.1 * vol, 1500, 900, 0.07, 'square', pan);
  }

  /** A bug exploding into rainbow goo. */
  mountBreak(vol: number, pan: number) {
    if (vol < 0.04) return;
    this.burst(0.9 * vol, 1600, 0.6, pan);
    this.tone(0.45 * vol, 120, 30, 0.45, 'sine', pan);
    this.tone(0.3 * vol, 2400, 400, 0.5, 'sawtooth', pan);
    this.squelch(0.9 * vol, pan);
    this.tone(0.2 * vol, 300, 1200, 0.3, 'sine', pan, 0.15);
  }

  private cannonNodes: { o1: OscillatorNode; o2: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  /** The low gurgling rumble of a pee cannon charging up. */
  cannon(on: boolean, heavy = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.cannonNodes) {
      const o1 = this.ctx.createOscillator();
      o1.type = 'sawtooth';
      const o2 = this.ctx.createOscillator();
      o2.type = 'square';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 17;
      const lg = this.ctx.createGain();
      lg.gain.value = 9;
      lfo.connect(lg);
      lg.connect(o1.frequency);
      lg.connect(o2.frequency);
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 380;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      o1.connect(f);
      o2.connect(f);
      f.connect(gain).connect(this.ctx.destination);
      o1.start();
      o2.start();
      lfo.start();
      this.cannonNodes = { o1, o2, lfo, gain };
    }
    const n = this.cannonNodes;
    if (!n) return;
    if (on) {
      const f = heavy ? 52 : 70;
      n.o1.frequency.setTargetAtTime(f, t, 0.1);
      n.o2.frequency.setTargetAtTime(f * 1.49, t, 0.1);
      n.gain.gain.setTargetAtTime(0.07, t, 0.05);
    } else {
      n.gain.gain.setTargetAtTime(0.0001, t, 0.06);
      this.cannonNodes = null;
      setTimeout(() => {
        try { n.o1.stop(); n.o2.stop(); n.lfo.stop(); } catch { /* already stopped */ }
      }, 400);
    }
  }

  /** Pee splashing on the ground: bubbly gurgle. */
  gurgle(vol: number, pan: number) {
    if (vol < 0.05) return;
    this.burst(0.12 * vol, 1800, 0.08, pan);
    const f = 300 + Math.random() * 500;
    this.tone(0.07 * vol, f, f * 2.2, 0.07, 'sine', pan);
  }

  /** Bladder nearly empty: two nervous beeps. */
  lowBladder() {
    this.tone(0.1, 880, 880, 0.08, 'square');
    this.tone(0.1, 660, 660, 0.1, 'square', 0, 0.14);
  }

  potionEnd() {
    [784, 622, 466, 392].forEach((f, i) => this.tone(0.1, f, f * 0.97, 0.12, 'triangle', 0, i * 0.07));
  }

  respawn() {
    this.tone(0.16, 150, 900, 0.5, 'sine');
    this.tone(0.1, 300, 1800, 0.5, 'triangle', 0, 0.05);
    this.burst(0.1, 5000, 0.4);
  }

  healthUp() {
    [523, 659, 784].forEach((f, i) => this.tone(0.14, f, f, 0.16, 'sine', 0, i * 0.08));
    this.tone(0.08, 1568, 1568, 0.3, 'triangle', 0, 0.26);
  }

  armorUp() {
    this.burst(0.3, 3500, 0.1);
    this.tone(0.2, 900, 500, 0.18, 'square');
    this.tone(0.15, 1350, 700, 0.2, 'triangle', 0, 0.04);
  }

  powerUp() {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(0.1, f, f * 1.01, 0.1, 'sawtooth', 0, i * 0.05));
  }

  private sirenTimer: number | undefined;

  /** A rising and falling air-raid siren. */
  siren(seconds = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    for (let i = 0; i * 1.0 < seconds; i++) {
      o.frequency.setValueAtTime(420, t + i);
      o.frequency.linearRampToValueAtTime(900, t + i + 0.5);
      o.frequency.linearRampToValueAtTime(420, t + i + 1);
    }
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.2);
    g.gain.setValueAtTime(0.12, t + seconds - 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    o.connect(f).connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  /** A jet going over very low. */
  flyby() {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 1.1);
    bp.frequency.exponentialRampToValueAtTime(220, t + 2.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    src.connect(bp).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 2.7);
  }

  /** The big one. */
  nukeBoom() {
    if (!this.ctx || !this.noise) return;
    const t = this.ctx.currentTime;
    this.burst(1.0, 2400, 2.4);
    this.tone(0.9, 80, 18, 3.2, 'sine');
    this.tone(0.5, 40, 14, 4, 'sawtooth');
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    src.connect(lp).connect(g).connect(this.ctx.destination);
    src.start(t);
    src.stop(t + 4.1);
  }

  ignite() {
    this.burst(0.35, 3200, 0.35);
    this.tone(0.1, 120, 300, 0.3, 'sawtooth');
  }

  freeze() {
    [2400, 3100, 3800, 4600].forEach((f, i) => this.tone(0.07, f, f * 0.6, 0.18, 'sine', 0, i * 0.04));
  }

  uiClick() {
    this.tone(0.12, 700, 1100, 0.07, 'square');
    this.tone(0.08, 1400, 1800, 0.07, 'triangle', 0, 0.05);
  }

  // --- night-time ambience: crickets, frogs, owls and the odd weird glooop ----------------

  private ambTimer: number | undefined;

  ambient(on: boolean) {
    if (!on) {
      if (this.ambTimer !== undefined) clearInterval(this.ambTimer);
      this.ambTimer = undefined;
      return;
    }
    if (this.ambTimer !== undefined) return;
    this.ambTimer = window.setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const r = Math.random();
      const pan = Math.random() * 2 - 1;
      if (r < 0.5) { // crickets: a rapid chirp train
        const f = 4200 + Math.random() * 800;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) this.tone(0.012, f, f * 1.02, 0.03, 'sine', pan, i * 0.06);
      } else if (r < 0.68) { // frog
        const f = 140 + Math.random() * 60;
        this.tone(0.05, f, f * 1.6, 0.09, 'square', pan);
        this.tone(0.05, f * 1.2, f * 0.8, 0.12, 'square', pan, 0.1);
      } else if (r < 0.8) { // owl: hoo-hoo
        this.tone(0.05, 380, 330, 0.25, 'sine', pan);
        this.tone(0.05, 380, 320, 0.4, 'sine', pan, 0.4);
      } else if (r < 0.92) { // distant glooop
        const f = 150 + Math.random() * 250;
        this.tone(0.04, f, f * 4, 0.35, 'sine', pan);
        this.tone(0.025, f * 1.5, f * 5, 0.35, 'triangle', pan, 0.05);
      } else { // a faint giggle from nowhere
        for (let i = 0; i < 4; i++) this.vowel(0.05, 500 + Math.random() * 200, 420, 0.08, 1100, pan, i * 0.11);
      }
    }, 700);
  }
}
