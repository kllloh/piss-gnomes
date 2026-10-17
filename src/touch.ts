/** On-screen controls for phones and tablets: a floating stick, drag-to-look, and action buttons. */

export interface TouchApi {
  /** Look by this many pixels (same units as mouse movement). */
  look(dx: number, dy: number): void;
  /** Analog move, each -1..1 (y is forward). */
  move(x: number, y: number): void;
  jump(on: boolean): void;
  fire(on: boolean): void;
  zoom(on: boolean): void;
  ride(): void;
  jug(): void;
  cycleWeapon(): void;
  shout(): void;
  streak(): void;
  thermal(): void;
  pause(): void;
  /** What the buttons should say right now. */
  status(): { weapon: string; jugs: number; sniper: boolean; riding: boolean; canRide: boolean; running: boolean; reward: string; hasThermal: boolean; thermalOn: boolean };
}

export function isTouchDevice(): boolean {
  try {
    return matchMedia('(pointer: coarse)').matches || location.search.includes('touch');
  } catch {
    return false;
  }
}

const CSS = `
body.touch #meters { left: 50%; transform: translateX(-50%); bottom: 6px; width: 230px; padding: 5px 10px; font-size: 12px; }
body.touch #meters .bar { height: 8px; margin: 2px 0 5px; }
body.touch #weaponline { font-size: 11px; }
body.touch #stats { display: none; }
body.touch #minimap { width: 110px; height: 110px; top: 6px; right: 6px; }
body.touch #feed { top: 52px; left: 8px; font-size: 11px; max-width: 38vw; }
body.touch #tickets { top: 4px; padding: 3px 12px; font-size: 16px; }
body.touch .pip { width: 11px; height: 11px; }
body.touch #chatter { bottom: 70px; font-size: 14px; max-width: 80vw; }
body.touch #mountinfo { left: 50%; transform: translateX(-50%); bottom: 96px; width: 220px; font-size: 12px; }
body.touch #banner { font-size: 22px; top: 16%; }
body.touch #prompt { top: 56%; font-size: 15px; }
body.touch #overlay h1 { font-size: 40px; }
#tz { position: fixed; inset: 0; z-index: 5; touch-action: none; display: none; }
body.touch.playing #tz { display: block; }
.tbtn { min-width: 44px; min-height: 44px; position: fixed; z-index: 6; display: none; align-items: center; justify-content: center; text-align: center; border-radius: 50%; border: 2px solid #19e3ff; background: rgba(8,6,28,.45); color: #d9fbff; font-size: 11px; line-height: 1.1; touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: 0 0 10px rgba(25,227,255,.6), inset 0 0 8px rgba(255,43,214,.4); text-shadow: 0 0 4px #19e3ff; }
body.touch.playing .tbtn { display: flex; }
.tbtn.on { background: rgba(255,43,214,.45); }
#t-fire { right: 3vmin; bottom: 4vmin; width: 24vmin; height: 24vmin; border-color: #ff2bd6; font-size: 15px; }
#t-jump { right: 29vmin; bottom: 4vmin; width: 14vmin; height: 14vmin; }
#t-jug { right: 27vmin; bottom: 21vmin; width: 12vmin; height: 12vmin; }
#t-wpn { right: 15vmin; bottom: 31vmin; width: 12vmin; height: 12vmin; }
#t-ride { right: 1vmin; bottom: 31vmin; width: 12vmin; height: 12vmin; }
#t-zoom { right: 40vmin; bottom: 14vmin; width: 12vmin; height: 12vmin; display: none !important; }
body.touch.playing #t-zoom.show { display: flex !important; }
#t-streak { right: 29vmin; bottom: 21vmin; width: 12vmin; height: 12vmin; border-color: #ffd070; }
#t-thermal { right: 40vmin; bottom: 28vmin; width: 12vmin; height: 12vmin; border-color: #ff9a30; display: none !important; }
body.touch.playing #t-thermal.show { display: flex !important; }
#t-shout { right: 8px; top: 124px; width: 10vmin; height: 10vmin; min-width: 40px; min-height: 40px; }
#t-pause { left: 8px; top: 8px; width: 9vmin; height: 9vmin; min-width: 36px; min-height: 36px; }
#t-stick { position: fixed; z-index: 6; display: none; width: 26vmin; height: 26vmin; border-radius: 50%; border: 2px solid rgba(25,227,255,.7); background: rgba(8,6,28,.3); pointer-events: none; transform: translate(-50%, -50%); box-shadow: 0 0 10px rgba(25,227,255,.5); }
#t-knob { position: absolute; left: 50%; top: 50%; width: 11vmin; height: 11vmin; margin: -5.5vmin 0 0 -5.5vmin; border-radius: 50%; background: rgba(255,43,214,.55); box-shadow: 0 0 10px #ff2bd6; }
#t-rotate { position: fixed; inset: 0; z-index: 50; background: #0b0420; color: #ff7af0; display: none; align-items: center; justify-content: center; text-align: center; font-size: 22px; padding: 30px; }
@media (orientation: portrait) { body.touch #t-rotate { display: flex; } }
`;

export function initTouch(api: TouchApi) {
  document.body.classList.add('touch');
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const meta = document.querySelector('meta[name=viewport]');
  meta?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

  const mk = (id: string, label: string) => {
    const d = document.createElement('div');
    d.id = id;
    d.className = 'tbtn';
    d.innerHTML = label;
    document.body.appendChild(d);
    return d;
  };
  const rotate = document.createElement('div');
  rotate.id = 't-rotate';
  rotate.innerHTML = 'Rotate your device sideways<br>to play Piss Gnomes';
  document.body.appendChild(rotate);

  const zone = document.createElement('div');
  zone.id = 'tz';
  document.body.appendChild(zone);
  const stick = document.createElement('div');
  stick.id = 't-stick';
  stick.innerHTML = '<div id="t-knob"></div>';
  document.body.appendChild(stick);
  const knob = stick.firstElementChild as HTMLElement;

  // --- floating stick (left 40% of the screen) and look (everywhere else) ---
  let stickId = -1;
  let lookId = -1;
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;
  const R = () => Math.min(innerWidth, innerHeight) * 0.13;
  const setStick = (x: number, y: number) => {
    const dx = x - sx;
    const dy = y - sy;
    const r = R();
    const len = Math.hypot(dx, dy);
    const k = len > r ? r / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const m = Math.min(1, len / r);
    const mm = m < 0.12 ? 0 : m; // dead zone
    api.move(len ? (dx / len) * mm : 0, len ? (-dy / len) * mm : 0);
  };
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (stickId < 0 && t.clientX < innerWidth * 0.4) {
        stickId = t.identifier;
        sx = t.clientX;
        sy = t.clientY;
        stick.style.left = sx + 'px';
        stick.style.top = sy + 'px';
        stick.style.display = 'block';
        knob.style.transform = 'translate(0,0)';
        api.move(0, 0);
      } else if (lookId < 0) {
        lookId = t.identifier;
        lx = t.clientX;
        ly = t.clientY;
      }
    }
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) setStick(t.clientX, t.clientY);
      else if (t.identifier === lookId) {
        api.look((t.clientX - lx) * 1.5, (t.clientY - ly) * 1.5);
        lx = t.clientX;
        ly = t.clientY;
      }
    }
  }, { passive: false });
  const end = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) { stickId = -1; stick.style.display = 'none'; api.move(0, 0); }
      if (t.identifier === lookId) lookId = -1;
    }
  };
  zone.addEventListener('touchend', end, { passive: false });
  zone.addEventListener('touchcancel', end, { passive: false });

  // --- buttons ---
  const hold = (el: HTMLElement, on: (v: boolean) => void, lookToo = false) => {
    let id = -1;
    let px = 0;
    let py = 0;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      id = t.identifier;
      px = t.clientX;
      py = t.clientY;
      el.classList.add('on');
      on(true);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!lookToo) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== id) continue;
        api.look((t.clientX - px) * 1.5, (t.clientY - py) * 1.5);
        px = t.clientX;
        py = t.clientY;
      }
    }, { passive: false });
    const up = (e: TouchEvent) => {
      e.preventDefault();
      el.classList.remove('on');
      id = -1;
      on(false);
    };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  };
  const tap = (el: HTMLElement, f: () => void) => {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('on');
      f();
    }, { passive: false });
    const up = (e: TouchEvent) => { e.preventDefault(); el.classList.remove('on'); };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  };

  const fire = mk('t-fire', 'PEE');
  const jump = mk('t-jump', 'JUMP');
  const jug = mk('t-jug', 'JUG');
  const wpn = mk('t-wpn', 'SWAP');
  const ride = mk('t-ride', 'RIDE');
  const zoom = mk('t-zoom', 'ZOOM');
  const shout = mk('t-shout', 'YELL');
  const streak = mk('t-streak', 'STREAK');
  const thermal = mk('t-thermal', 'THERMAL');
  const pause = mk('t-pause', 'II');
  hold(fire, api.fire, true);
  hold(jump, api.jump);
  hold(zoom, api.zoom);
  tap(jug, api.jug);
  tap(wpn, api.cycleWeapon);
  tap(ride, api.ride);
  tap(shout, api.shout);
  tap(streak, api.streak);
  tap(thermal, api.thermal);
  tap(pause, api.pause);

  // keep the labels honest
  setInterval(() => {
    const s = api.status();
    document.body.classList.toggle('playing', s.running);
    fire.textContent = s.weapon === 'Bladder' ? 'PEE' : 'FIRE';
    wpn.innerHTML = 'SWAP<br>' + s.weapon.replace('Piss ', '');
    jug.innerHTML = 'JUG' + (s.jugs ? '<br>×' + s.jugs : '');
    ride.textContent = s.riding ? 'HOP OFF' : 'RIDE';
    ride.style.opacity = s.riding || s.canRide ? '1' : '0.45';
    zoom.classList.toggle('show', s.sniper);
    thermal.classList.toggle('show', s.hasThermal);
    thermal.classList.toggle('on', s.thermalOn);
    streak.innerHTML = s.reward ? 'USE<br>' + s.reward : 'STREAK';
    streak.style.opacity = s.reward ? '1' : '0.4';
  }, 150);

  // a gesture is needed for fullscreen; the first tap on the start screen does it
  const goFull = () => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
      const r = el.requestFullscreen?.();
      if (r) r.catch(() => {});
      else el.webkitRequestFullscreen?.();
      const lock = (screen.orientation as unknown as { lock?: (o: string) => Promise<void> } | undefined)?.lock;
      if (lock) lock.call(screen.orientation, 'landscape').catch(() => {});
    } catch { /* not allowed, fine */ }
  };
  return { goFull };
}
