// Правки встроенных шейдеров three.js (MeshBasicMaterial) как чистые функции
// над исходником: так их можно проверить тестом без браузера и WebGL.
//
// Почему это отдельный модуль: раньше вода и «свет факела в руке» были двумя
// независимыми onBeforeCompile, и второй затирал первый. Из-за этого
// vHeldWorldPos объявлялся во фрагментном шейдере воды, но не объявлялся в
// вершинном — в WebGL2 (GLSL ES 3.00) это ошибка линковки, и вода пропадала
// целиком. Теперь обе части собираются вместе и проверяются тестом.

/** Декларации и расчёт света факелов — вершинная часть */
export function heldLightVertex(src) {
  return src
    .replace('#include <common>', `#include <common>
attribute float torchLight;
varying float vTorchLight;
varying vec3 vHeldWorldPos;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vTorchLight = torchLight;
vHeldWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
}

/** Декларации и расчёт света факелов — фрагментная часть */
export function heldLightFragment(src) {
  return src
    .replace('#include <common>', `#include <common>
varying float vTorchLight;
varying vec3 vHeldWorldPos;
uniform vec3 uHeldLightPos;
uniform float uHeldLight;
uniform float uHeldLightRadius;`)
    // Итоговая освещённость = max(небо × оттенок времени суток, факелы).
    // Факелы (поставленные — из вершин, в руке — по расстоянию) не зависят
    // от времени суток: ночью светят так же, днём не пересвечивают.
    .replace('#include <color_fragment>', `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  float torchL = vTorchLight;
  if (uHeldLight > 0.0) {
    float heldD = distance(vHeldWorldPos, uHeldLightPos);
    float heldF = clamp(1.0 - heldD / uHeldLightRadius, 0.0, 1.0);
    vec3 heldN = normalize(cross(dFdx(vHeldWorldPos), dFdy(vHeldWorldPos)));
    float heldShade = heldN.y > 0.5 ? 1.0 : (heldN.y < -0.5 ? 0.5 : (abs(heldN.x) > 0.5 ? 0.72 : 0.88));
    torchL = max(torchL, heldF * heldF * heldShade * uHeldLight);
  }
  vec3 skyL = diffuse * vColor.rgb;
  vec3 lightL = max(skyL, torchL * vec3(1.0, 0.93, 0.82));
  diffuseColor.rgb = diffuseColor.rgb / max(diffuse, vec3(0.001)) * lightL;
#endif`);
}

/**
 * Анимация воды: текстура тайла воды медленно колышется внутри своего тайла
 * атласа (UV гуляет, не задевая соседние тайлы) и слегка переливается.
 * Размер атласа приходит униформой uAtlasCells, а не хардкодом.
 */
export function waterFragment(src) {
  return src
    .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec2 uAtlasCells;`)
    .replace('#include <map_fragment>', `
  {
    vec2 t8 = vMapUv * uAtlasCells;
    vec2 tileBase = floor(t8) / uAtlasCells;
    vec2 local = fract(t8);
    float wob = sin(uTime * 1.3 + vHeldWorldPos.x * 1.7 + vHeldWorldPos.z * 1.1)
              + cos(uTime * 0.9 + vHeldWorldPos.z * 1.9 - vHeldWorldPos.x * 0.7);
    vec2 wuv = tileBase + fract(local + wob * 0.045) / uAtlasCells;
    vec4 sampledDiffuseColor = texture2D(map, wuv);
    float shimmer = 0.94 + 0.06 * sin(uTime * 2.1 + vHeldWorldPos.x * 2.3 + vHeldWorldPos.z * 1.7);
    diffuseColor *= sampledDiffuseColor * shimmer;
  }
`);
}

/**
 * Собирает обе правки в один onBeforeCompile: сначала свет факелов (он задаёт
 * vHeldWorldPos и в вершинном, и во фрагментном шейдере), затем анимация воды.
 * @param {object} uniforms униформы воды (uTime, uAtlasCells)
 * @param {object} extraUniforms униформы света факелов в руке (иначе вода их не получит)
 */
export function waterShaderHook(uniforms, extraUniforms = {}) {
  return (shader) => {
    Object.assign(shader.uniforms, extraUniforms, uniforms);
    shader.vertexShader = heldLightVertex(shader.vertexShader);
    shader.fragmentShader = waterFragment(heldLightFragment(shader.fragmentShader));
  };
}

const BS = String.fromCharCode(92);   // обратный слэш без экранирования в шаблонах

/** Регулярка «объявление varying с таким именем» */
function varyingDecl(name) {
  return new RegExp(`^${BS}s*varying${BS}s+${BS}w+${BS}s+${name}${BS}s*;`, 'm');
}

/** Список объявленных varying-переменных */
export function declaredVaryings(src) {
  return [...src.matchAll(/^\s*varying\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]);
}

/** Объявлен ли varying в вершинном шейдере */
export function vertexDeclares(vertexSrc, name) { return varyingDecl(name).test(vertexSrc); }
/** Объявлен ли varying во фрагментном шейдере */
export function fragmentDeclares(fragmentSrc, name) { return varyingDecl(name).test(fragmentSrc); }

/** Используется ли переменная где-то, кроме её собственного объявления */
export function usesVarying(src, name) {
  const body = src.replace(new RegExp(`^${BS}s*varying${BS}s+${BS}w+${BS}s+${name}${BS}s*;`, 'gm'), '');
  return new RegExp(`${BS}b${name}${BS}b`).test(body);
}

/** Varying-переменные, которые добавляем мы сами (three.js свои ведёт сам) */
export const INJECTED_VARYINGS = ['vHeldWorldPos', 'vTorchLight'];

/**
 * Проверка стыковки шейдеров. В WebGL2 (GLSL ES 3.00) любая переменная, которой
 * фрагментный шейдер пользуется, обязана быть объявлена и в вершинном, и во
 * фрагментном шейдере — иначе программа не линкуется и объект не рисуется
 * совсем. Именно так пропала вода: анимация воды затирала хук света факела,
 * vHeldWorldPos оставался без объявления в вершинном шейдере.
 * @returns {string[]} имена несогласованных переменных
 */
export function varyingMismatches(vertexSrc, fragmentSrc) {
  const bad = [];
  for (const name of INJECTED_VARYINGS) {
    const used = usesVarying(fragmentSrc, name);
    const declared = fragmentDeclares(fragmentSrc, name);
    if (declared && !vertexDeclares(vertexSrc, name)) bad.push(name);
    else if (used && !vertexDeclares(vertexSrc, name)) bad.push(name + ':не объявлена в вершинном шейдере');
    else if (used && !declared) bad.push(name + ':не объявлена во фрагментном шейдере');
  }
  return bad;
}
