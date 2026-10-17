import * as THREE from 'three';
import { createFighter, type Faction } from './gnome';
import { makeJug, makeSniper, makeLauncher, makeDouble, makeSwirl, makeHealth } from './weapons';
import type { ClassDef } from './classes';

/** The 3D "operator" shown on the lobby screen: your gnome on a turntable with their class prop. */
export function initOperator(canvas: HTMLCanvasElement, isVisible: () => boolean) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return null; // no second WebGL context available: the lobby just goes without it
  }
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.55, 7);
  camera.lookAt(0, 1.15, 0);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x302040, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x19e3ff, 2.2);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  const pink = new THREE.PointLight(0xff2bd6, 40, 12);
  pink.position.set(2.5, 0.5, 2);
  scene.add(pink);

  const stage = new THREE.Group();
  scene.add(stage);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.08, 36), new THREE.MeshLambertMaterial({ color: 0x1a1030 }));
  disc.position.y = -0.04;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.03, 8, 48), new THREE.MeshBasicMaterial({ color: 0x19e3ff }));
  ring.rotation.x = Math.PI / 2;
  stage.add(disc, ring);

  const holder = new THREE.Group();
  holder.rotation.y = Math.PI; // gnomes face -z, the camera is at +z
  stage.add(holder);
  let model: THREE.Group | null = null;
  let legs: THREE.Group[] = [];
  let prop: THREE.Group | null = null;

  const setFaction = (f: Faction) => {
    if (model) holder.remove(model);
    const m = createFighter(f);
    model = m.root;
    legs = [m.legL, m.legR];
    model.scale.setScalar(1.15);
    holder.add(model);
  };

  const setClass = (c: ClassDef) => {
    if (prop) stage.remove(prop);
    prop = c.prop === 'sniper' ? makeSniper() : c.prop === 'launcher' ? makeLauncher() : c.prop === 'double' ? makeDouble() : c.prop === 'swirl' ? makeSwirl() : c.prop === 'health' ? makeHealth() : makeJug(0xffffff);
    prop.scale.multiplyScalar(c.prop === 'jug' || c.prop === 'health' ? 1.4 : 0.85);
    prop.position.set(0.5, 0.55, 1.0);
    stage.add(prop);
  };

  let w = 0;
  let h = 0;
  const loop = (ms: number) => {
    requestAnimationFrame(loop);
    if (!isVisible()) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw !== w || ch !== h) {
      w = cw;
      h = ch;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    }
    const t = ms / 1000;
    stage.rotation.y = Math.sin(t * 0.5) * 0.55;
    ring.rotation.z = t * 0.5;
    if (prop) {
      prop.rotation.y = t * 0.9;
      prop.position.y = 0.55 + Math.sin(t * 1.6) * 0.08;
    }
    legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 1.4 + i * Math.PI) * 0.04; });
    if (model) model.position.y = Math.sin(t * 1.4) * 0.015;
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);
  return { setFaction, setClass };
}
