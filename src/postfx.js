// Пост-эффект «заглянул в глубокий карьер»: при взгляде вниз с большой высоты
// нижняя часть экрана чуть темнеет и размывается — как от поля зрения и дали.
import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = `
uniform sampler2D tScene;
uniform float uStrength;   // 0..1 — насколько сильно «вглядываемся» вниз
uniform float uAspect;     // ширина/высота экрана
varying vec2 vUv;

void main() {
  // Маска: эллипс в нижней части экрана, растёт с силой эффекта
  vec2 c = vUv - vec2(0.5, 0.08);
  c.x *= uAspect;
  float mask = 1.0 - smoothstep(0.25, 0.62 + uStrength * 0.25, length(c));
  mask *= uStrength;

  // Лёгкое размытие: 8 лучей по кольцу; чем сильнее эффект, тем шире кольцо
  float radius = mask * 2.6;
  vec3 acc = texture2D(tScene, vUv).rgb;
  if (radius > 0.05) {
    acc += texture2D(tScene, vUv + vec2(radius, 0.0) / uAspect).rgb;
    acc += texture2D(tScene, vUv - vec2(radius, 0.0) / uAspect).rgb;
    acc += texture2D(tScene, vUv + vec2(0.0, radius)).rgb;
    acc += texture2D(tScene, vUv - vec2(0.0, radius)).rgb;
    acc += texture2D(tScene, vUv + vec2(radius, radius) * 0.7 / uAspect).rgb;
    acc += texture2D(tScene, vUv - vec2(radius, radius) * 0.7 / uAspect).rgb;
    acc += texture2D(tScene, vUv + vec2(radius, -radius) * 0.7 / uAspect).rgb;
    acc += texture2D(tScene, vUv - vec2(radius, -radius) * 0.7 / uAspect).rgb;
    acc /= 9.0;
  }

  // Затемнение: в глубине карьера меньше света
  acc *= 1.0 - mask * 0.38;
  gl_FragColor = vec4(acc, 1.0);
}
`;

export class PitDepthFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.strength = 0;
    this.rt = new THREE.WebGLRenderTarget(2, 2);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tScene: { value: this.rt.texture },
      uStrength: { value: 0 },
      uAspect: { value: 1 },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      }),
    );
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setSize(w, h) {
    this.rt.setSize(Math.max(2, w | 0), Math.max(2, h | 0));
    this.uniforms.uAspect.value = w / Math.max(1, h);
  }

  /**
   * Обновляет силу эффекта.
   * @param {number} pitch наклон взгляда (рад, отрицательный — вниз)
   * @param {number} drop насколько глубоко под игроком дно (в блоках)
   * @param {number} dt
   */
  update(pitch, drop, dt) {
    const lookingDown = Math.max(0, Math.min(1, (-pitch - 0.32) / 0.5));
    const deep = Math.max(0, Math.min(1, (drop - 5) / 9));
    const target = lookingDown * deep;
    const k = 1 - Math.exp(-(target > this.strength ? 5 : 3.2) * dt);
    this.strength += (target - this.strength) * k;
    if (this.strength < 0.004) this.strength = 0;
    this.uniforms.uStrength.value = this.strength;
    return this.strength;
  }

  /** Рендер сцены в буфер и наложение эффекта (если он вообще виден) */
  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
