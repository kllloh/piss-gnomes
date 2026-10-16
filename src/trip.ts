import * as THREE from 'three';

/** Cosine palette: smooth rainbow-ish colour from a single number. */
function palette(t: number, out: THREE.Color): THREE.Color {
  out.setRGB(
    0.5 + 0.5 * Math.cos(6.2832 * (t + 0.0)),
    0.5 + 0.5 * Math.cos(6.2832 * (t + 0.33)),
    0.5 + 0.5 * Math.cos(6.2832 * (t + 0.67)),
  );
  return out;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform float time;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float swirl = d.y * 0.9 + sin(d.x * 3.0 + time * 0.2) * 0.25 + sin(d.z * 4.0 - time * 0.15) * 0.25
              + sin(atan(d.z, d.x) * 5.0 + d.y * 6.0 + time * 0.3) * 0.12;
  float t = swirl + time * 0.03;
  vec3 col = 0.5 + 0.5 * cos(6.2832 * (vec3(t) + vec3(0.0, 0.33, 0.67)));
  col *= 0.5 + 0.35 * d.y;
  // aurora ribbons
  float rib = smoothstep(0.0, 0.5, sin(d.y * 14.0 + sin(d.x * 5.0 + time * 0.4) * 2.0 + time * 0.5));
  col += rib * 0.18 * (0.5 + 0.5 * cos(6.2832 * (vec3(t * 2.0) + vec3(0.3, 0.6, 0.0)))) * smoothstep(0.0, 0.5, d.y);
  // pulsing moon with rings
  vec3 m = normalize(vec3(0.4, 0.55, -0.7));
  float md = acos(clamp(dot(d, m), -1.0, 1.0));
  col += vec3(1.0, 0.95, 0.7) * smoothstep(0.16, 0.14, md);
  col += 0.12 * (0.5 + 0.5 * sin(md * 40.0 - time * 2.0)) * smoothstep(0.7, 0.15, md) * vec3(0.8, 0.6, 1.0);
  // twinkling stars
  vec3 g = floor(d * 90.0);
  float h = hash(g);
  float star = step(0.985, h) * (0.5 + 0.5 * sin(time * 3.0 + h * 50.0));
  col += star * smoothstep(0.05, 0.4, d.y);
  col = floor(col * 9.0 + 0.5) / 9.0; // banded like a low-colour skybox
  gl_FragColor = vec4(col, 1.0);
}`;

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FRAG = `
uniform sampler2D tDiffuse;
uniform float time;
uniform float amp;
uniform float pulse;
uniform float tint;
uniform float ink;
uniform vec2 res;
varying vec2 vUv;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float lum(vec3 c) { return sqrt(max(dot(c, vec3(0.299, 0.587, 0.114)), 0.0)); }
vec3 hueRotate(vec3 c, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 y = toYIQ * c;
  float cs = cos(a), sn = sin(a);
  y.yz = mat2(cs, -sn, sn, cs) * y.yz;
  return toRGB * y;
}
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r = length(c);
  // wobbling, breathing lens
  uv += amp * 0.005 * vec2(sin(uv.y * 16.0 + time * 1.7), cos(uv.x * 14.0 + time * 1.3));
  uv += c * (amp * 0.04 * sin(time * 0.8) + pulse * amp * 0.03) * (0.3 + r * 2.0);
  // colour fringes
  float ca = amp * (0.002 + 0.004 * pulse) * (0.4 + r * 3.0);
  vec3 col;
  col.r = texture2D(tDiffuse, uv + c * ca).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - c * ca).b;
  // colour drift, bounded so the two teams never swap places
  col = hueRotate(col, amp * (sin(time * 0.23) * 0.9 + r * 1.2 * sin(time * 0.31) + pulse * 0.25) + tint);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 1.0 + 0.55 * amp);
  col *= 1.0 - r * r * (0.5 + 0.2 * amp);
  col += amp * pulse * 0.05 * vec3(1.0, 0.3, 0.8);
  col = max(col, 0.0);
  if (ink > 0.0) {
    // --- PlayStation 2 look: low-res picture, a little bloom, saturated colour, 5-bit colour with an ordered dither ---
    vec2 px = 1.0 / res;
    vec3 glow = texture2D(tDiffuse, vUv + px * vec2(2.0, 0.0)).rgb + texture2D(tDiffuse, vUv - px * vec2(2.0, 0.0)).rgb
              + texture2D(tDiffuse, vUv + px * vec2(0.0, 2.0)).rgb + texture2D(tDiffuse, vUv - px * vec2(0.0, 2.0)).rgb;
    col += max(glow * 0.25 - 0.6, 0.0) * 0.4 * ink;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 1.0 + 0.3 * ink);
    vec2 q = mod(floor(vUv * res), 4.0);
    float ba = mod(q.x, 2.0), bb = floor(q.x / 2.0), bc = mod(q.y, 2.0), bd = floor(q.y / 2.0);
    float bayer = (8.0 * abs(ba - bc) + 4.0 * bc + 2.0 * abs(bb - bd) + bd) / 16.0;
    vec3 pc = sqrt(col);
    pc = floor((pc + (bayer - 0.5) / 14.0) * 31.0 + 0.5) / 31.0;
    col = pc * pc;
    col *= 1.0 - 0.07 * ink * step(0.5, fract(vUv.y * res.y * 0.5)); // faint interlace lines
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/** The psychedelic layer: swirling sky, drifting spores, and a warping colour-shifting post effect. */
export class Trip {
  /** 0 = off, 1 = mild, 2 = full. */
  level = 2;
  private _ink = 1;
  /** PlayStation 2 look, 0..1: 480p picture, dither, bloom. */
  get ink(): number {
    return this._ink;
  }
  set ink(v: number) {
    const changed = v > 0 !== this._ink > 0;
    this._ink = v;
    if (changed && this.rt) this.makeTarget();
  }
  private rt: THREE.WebGLRenderTarget | null = null;
  private quad: THREE.Mesh | null = null;
  private quadScene = new THREE.Scene();
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    amp: { value: 0.5 },
    pulse: { value: 0 },
    tint: { value: 0 },
    ink: { value: 1 },
    res: { value: new THREE.Vector2(1, 1) },
  };
  private sky: THREE.Mesh;
  private spores: THREE.InstancedMesh;
  private sporeSeed: Float32Array;
  private tmpC = new THREE.Color();
  private dummy = new THREE.Object3D();
  private size = new THREE.Vector2();
  postOk = false;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    // sky dome that always sits on the camera
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // glowing spores floating around you
    const N = 240;
    this.spores = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
    this.spores.frustumCulled = false;
    this.spores.setColorAt(0, new THREE.Color(1, 1, 1));
    this.sporeSeed = new Float32Array(N * 4);
    for (let i = 0; i < this.sporeSeed.length; i++) this.sporeSeed[i] = Math.random();
    scene.add(this.spores);

    try {
      const ok = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
      if (ok) {
        this.makeTarget();
        this.quad = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 2),
          new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false }),
        );
        this.quad.frustumCulled = false;
        this.quadScene.add(this.quad);
        this.postOk = true;
      }
    } catch {
      this.postOk = false;
    }
  }

  private makeTarget() {
    this.renderer.getDrawingBufferSize(this.size);
    let w = this.size.x;
    let h = this.size.y;
    const ps2 = this._ink > 0;
    if (ps2) { // render at roughly 480p and let the pixels show
      const k = Math.min(1, 480 / h);
      w = Math.max(8, Math.round(w * k));
      h = Math.max(8, Math.round(h * k));
    }
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: ps2 ? 0 : 4,
      magFilter: ps2 ? THREE.NearestFilter : THREE.LinearFilter,
      minFilter: ps2 ? THREE.NearestFilter : THREE.LinearFilter,
    });
    this.uniforms.tDiffuse.value = this.rt.texture;
    this.uniforms.res.value.set(w, h);
  }

  resize() {
    if (this.rt) this.makeTarget();
  }

  /** Match the fog to the horizon colour of the sky so distance fades into the swirl. */
  horizon(t: number, out: THREE.Color): THREE.Color {
    palette(t * 0.03, out).multiplyScalar(0.22);
    return out;
  }

  update(t: number, camPos: THREE.Vector3, beat: number) {
    (this.sky.material as THREE.ShaderMaterial).uniforms.time.value = t;
    this.sky.position.copy(camPos);
    // spores drift in a box that follows the camera
    const N = this.spores.count;
    const sd = this.sporeSeed;
    const S = 44;
    const lvl = this.level / 2;
    this.spores.visible = this.level > 0;
    if (!this.spores.visible) return;
    for (let i = 0; i < N; i++) {
      const bx = sd[i * 4] * S + Math.sin(t * (0.3 + sd[i * 4 + 3]) + i) * 1.2;
      const bz = sd[i * 4 + 1] * S + Math.cos(t * (0.25 + sd[i * 4 + 3]) + i * 2) * 1.2;
      const by = 0.4 + sd[i * 4 + 2] * 9 + Math.sin(t * 0.8 + i) * 0.6;
      const x = ((bx - camPos.x) % S + S * 1.5) % S - S / 2 + camPos.x;
      const z = ((bz - camPos.z) % S + S * 1.5) % S - S / 2 + camPos.z;
      this.dummy.position.set(x, by, z);
      this.dummy.scale.setScalar((0.8 + 0.6 * Math.sin(t * 2 + i)) * (1 + beat * 0.8) * (0.4 + lvl * 0.6));
      this.dummy.updateMatrix();
      this.spores.setMatrixAt(i, this.dummy.matrix);
      palette(t * 0.1 + i * 0.037, this.tmpC);
      this.spores.setColorAt(i, this.tmpC);
    }
    this.spores.instanceMatrix.needsUpdate = true;
    if (this.spores.instanceColor) this.spores.instanceColor.needsUpdate = true;
  }

  /** Render the scene, through the warp pass if it is available and switched on. */
  render(scene: THREE.Scene, camera: THREE.Camera, t: number, amp: number, beat: number, tint: number) {
    const a = amp * (this.level === 2 ? 1 : this.level === 1 ? 0.4 : 0);
    if (!this.postOk || !this.rt || !this.quad || (this.level === 0 && this.ink === 0)) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(scene, camera);
      return;
    }
    this.uniforms.time.value = t;
    this.uniforms.amp.value = a;
    this.uniforms.pulse.value = beat;
    this.uniforms.tint.value = tint;
    this.uniforms.ink.value = this.ink;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
