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
uniform float uStrength;    // 0..1 — насколько сильно «вглядываемся» вниз
uniform float uAspect;      // ширина/высота экрана
uniform vec2 uResolution;   // разрешение буфера в пикселях
varying vec2 vUv;

void main() {
  // Маска прижата к нижнему краю экрана: снизу — тёмная пелена, вверх плавно
  // сходит на нет. Центр эллипса вынесен за кадр, поэтому эффект не читается
  // как отдельный «круг» посреди экрана (раньше так и выглядел).
  vec2 c = vec2((vUv.x - 0.5) * uAspect / 1.15, vUv.y + 0.3);
  float mask = 1.0 - smoothstep(0.30, 0.72 + uStrength * 0.22, length(c));
  mask *= uStrength;

  // Лёгкое размытие: 8 лучей по кольцу; радиус в ПИКСЕЛЯХ (до ~10px при
  // полном эффекте). Раньше радиус был в UV-единицах (до 2.6 ширины экрана):
  // 8 сэмплов уходили за края текстуры, clamp растягивал нижнюю часть кадра
  // в огромный размытый «купол», внутрь которого втягивался предмет в руках.
  float radiusPx = mask * 10.0;
  vec2 off = vec2(radiusPx / uResolution.x, radiusPx / uResolution.y);
  vec3 acc = texture2D(tScene, vUv).rgb;
  if (radiusPx > 0.5) {
    acc += texture2D(tScene, vUv + vec2(off.x, 0.0)).rgb;
    acc += texture2D(tScene, vUv - vec2(off.x, 0.0)).rgb;
    acc += texture2D(tScene, vUv + vec2(0.0, off.y)).rgb;
    acc += texture2D(tScene, vUv - vec2(0.0, off.y)).rgb;
    acc += texture2D(tScene, vUv + off * 0.7071).rgb;
    acc += texture2D(tScene, vUv - off * 0.7071).rgb;
    acc += texture2D(tScene, vUv + vec2(off.x, -off.y) * 0.7071).rgb;
    acc += texture2D(tScene, vUv - vec2(off.x, -off.y) * 0.7071).rgb;
    acc /= 9.0;
  }

  // Затемнение: в глубине карьера меньше света
  acc *= 1.0 - mask * 0.38;

  // Вывод в sRGB — так же, как встроенные материалы (colorspace_fragment):
  // буфер сцены хранит линейные значения, а канвас ожидает sRGB. Без этого
  // проход «карьера» рисовал весь мир заметно темнее обычного рендера
  // («крутит экспозицию» при включении/выключении эффекта).
  acc = mix(acc * 12.92, 1.055 * pow(acc, vec3(0.41666)) - vec3(0.055), step(vec3(0.0031308), acc));
  gl_FragColor = vec4(acc, 1.0);
}
`;

export class PitDepthFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.strength = 0;
    // Буфер сцены — в линейном рабочем пространстве (как и сцена). Прежнее
    // colorSpace=SRGBColorSpace заставляло GPU кодить значения при записи в
    // буфер, а пост-шейдер писал на канвас уже декодированные линейные числа
    // без обратного sRGB-кода: весь кадр получался темнее обычного рендера.
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.uniforms = {
      tScene: { value: this.rt.texture },
      uStrength: { value: 0 },
      uAspect: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
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
    const pw = Math.max(2, w | 0);
    const ph = Math.max(2, h | 0);
    this.rt.setSize(pw, ph);
    this.uniforms.uAspect.value = pw / Math.max(1, ph);
    this.uniforms.uResolution.value.set(pw, ph);
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
