// Мобы: процедурные модели животных и монстров с движением, атаками и анимациями.
import * as THREE from 'three';
import { isSolid, isLiquid, BLOCK } from './blocks.js';

// Затенение граней как у блоков мира
function partGeometry(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.getAttribute('normal');
  const count = n.count;
  const cols = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ny = n.getY(i);
    const nz = n.getZ(i);
    let shade = 0.8;
    if (ny > 0.5) shade = 1.0;
    else if (ny < -0.5) shade = 0.55;
    else if (Math.abs(nz) > 0.5) shade = 0.88;
    cols[i * 3] = color[0] * shade;
    cols[i * 3 + 1] = color[1] * shade;
    cols[i * 3 + 2] = color[2] * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// Деталь с пивотом у верхнего края (для качающихся ног/ушей)
function pendulumPart(mat, geoCache, key, w, h, d, color) {
  if (!geoCache.has(key)) {
    const g = partGeometry(w, h, d, color);
    g.translate(0, -h / 2, 0); // пивот сверху
    geoCache.set(key, g);
  }
  return new THREE.Mesh(geoCache.get(key), mat);
}

function fixedPart(mat, geoCache, key, w, h, d, color) {
  if (!geoCache.has(key)) geoCache.set(key, partGeometry(w, h, d, color));
  return new THREE.Mesh(geoCache.get(key), mat);
}

// Материал «красного» моба: вспышка урона и анимация смерти.
// Цвет задаётся через vertexColors, поэтому силуэт и лицо моба не теряются.
const HURT_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xff3a2e });

// Сколько длится анимация смерти: моб заваливается, краснеет и оседает
export const MOB_DEATH_TIME = 1.8;
// Цвет умирающего моба: яркий красный в начале → тёмный в конце
const DEATH_COLOR_FROM = [1, 0.23, 0.18];
const DEATH_COLOR_TO = [0.35, 0.05, 0.04];

// Враждебные мобы: сами нападают на игрока (паук, крипер и зомби).
// Волк — только если его ударить.
export const HOSTILE = new Set(['zombie', 'spider', 'creeper']);
// Сколько мобов каждого вида держим одновременно
export const MOB_CAPS = { spider: 3, creeper: 2, wolf: 3, fish: 4, zombie: 4, villager: 7 };

// ---------------------------------------------------------------- Лица: глаза, зрачки, рты, зубы
const EYE_WHITE = [0.98, 0.98, 0.99];
const EYE_PUPIL = [0.06, 0.05, 0.08];
const MOUTH_DARK = [0.14, 0.08, 0.1];
const TOOTH = [0.96, 0.96, 0.9];

/** Пара глаз с белками и зрачками */
function addEyes(g, mat, geoCache, key, { y, z, dx, size = 0.09, sclera = EYE_WHITE, pupil = EYE_PUPIL, pupilScale = 0.5, glow = null }) {
  const eyes = [];
  for (const s of [-1, 1]) {
    const white = fixedPart(mat, geoCache, `${key}-eye`, size, size, size * 0.45, sclera);
    white.position.set(s * dx, y, z);
    g.add(white);
    eyes.push(white);
    if (pupil) {
      const p = fixedPart(mat, geoCache, `${key}-pup`, size * pupilScale, size * pupilScale, size * 0.5, pupil);
      p.position.set(s * dx, y - size * 0.06, z + size * 0.26);
      g.add(p);
      eyes.push(p);
    }
    if (glow) {
      const gl = fixedPart(glow.mat, geoCache, `${key}-glow`, size * 0.9, size * 0.9, size * 0.3, glow.color);
      gl.position.set(s * dx, y, z + size * 0.3);
      g.add(gl);
      eyes.push(gl);
    }
  }
  return eyes;
}

/** Рот: тёмная полоса (или оскал) + зубы */
function addMouth(g, mat, geoCache, key, { y, z, w = 0.16, h = 0.05, color = MOUTH_DARK, teeth = 0, tooth = TOOTH, grin = false }) {
  const mouth = fixedPart(mat, geoCache, `${key}-mouth`, w, h, 0.05, color);
  mouth.position.set(0, y, z);
  g.add(mouth);
  const parts = [mouth];
  if (teeth > 0) {
    const tw = w / (teeth * 1.7);
    for (let i = 0; i < teeth; i++) {
      const x = (i - (teeth - 1) / 2) * (w / Math.max(1, teeth - 0.4));
      const up = fixedPart(mat, geoCache, `${key}-tooth`, tw, grin ? 0.06 : 0.04, 0.04, tooth);
      up.position.set(x, y + h * 0.6, z + 0.01);
      g.add(up);
      parts.push(up);
      if (grin) {
        const down = fixedPart(mat, geoCache, `${key}-tooth`, tw, 0.05, 0.04, tooth);
        down.position.set(x, y - h * 0.6, z + 0.01);
        g.add(down);
        parts.push(down);
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------- Анимация: общие помощники
// Фазы лап: у четвероногих в фазе идут диагональные пары (перед-лево + зад-право),
// у паука волна бежит по восьми ногам
const LEG_PHASE = {
  4: [0, Math.PI, Math.PI, 0],
  8: [0, Math.PI, 0, Math.PI, Math.PI, 0, Math.PI, 0],
};

/** Разница углов в диапазоне -π..π */
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Поворот «головы»: детали (голова, глаза, рот, морда) вращаются вокруг
 * вертикальной оси, проходящей через точку (0, pivotZ) внутри модели.
 */
function turnHead(v, angle) {
  if (!v.look) return;
  const pivotZ = v.lookZ || 0;
  const c = Math.cos(angle), sn = Math.sin(angle);
  for (const part of v.look) {
    if (!part) continue;
    const ud = part.userData;
    if (!ud.basePos) {
      ud.basePos = { x: part.position.x, y: part.position.y, z: part.position.z };
      ud.baseRotY = part.rotation.y;
    }
    const bx = ud.basePos.x, bz = ud.basePos.z - pivotZ;
    part.position.x = bx * c + bz * sn;
    part.position.z = pivotZ + (-bx * sn + bz * c);
    part.rotation.y = ud.baseRotY + angle;
  }
}

/** Мигание: на 0.12 с глаза «закрываются» */
function blinkEyes(v, dt) {
  if (!v.blink || !v.blink.length) return;
  if (v._blinkT == null) v._blinkT = 1.5 + Math.random() * 4;
  v._blinkT -= dt;
  if (v._blinkT <= 0) {
    v._blinkT = 2.5 + Math.random() * 5.5;
    v._blinkLeft = 0.12;
  }
  const closed = v._blinkLeft > 0;
  if (closed) v._blinkLeft -= dt;
  const k = closed ? 0.12 : 1;
  for (const e of v.blink) e.scale.y = k;
}

// ---------------------------------------------------------------- Новые мобы
// Паук: восемь ног, два сегмента тела, красные глаза и жвала (выходит ночью) — теперь чёрный
function buildSpider(mat, geoCache, eyeMat) {
  const body = [0.07, 0.07, 0.08];
  const dark = [0.04, 0.04, 0.05];
  const g = new THREE.Group();
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.18, 0.34, 0.26 - i * 0.17);
      pivot.rotation.z = side * 0.95;
      pivot.rotation.y = side * (0.45 - i * 0.28);
      const upper = fixedPart(mat, geoCache, 'sp-leg-up', 0.36, 0.07, 0.07, body);
      upper.position.set(side * 0.18, 0, 0);
      const lower = fixedPart(mat, geoCache, 'sp-leg-low', 0.3, 0.06, 0.06, dark);
      lower.position.set(side * 0.48, -0.17, 0);
      lower.rotation.z = side * -0.95;
      pivot.add(upper, lower);
      legs.push(pivot);
      g.add(pivot);
    }
  }
  const abdomen = fixedPart(mat, geoCache, 'sp-abd', 0.46, 0.36, 0.5, body);
  abdomen.position.set(0, 0.38, -0.22);
  const spots = fixedPart(mat, geoCache, 'sp-spots', 0.3, 0.24, 0.06, dark);
  spots.position.set(0, 0.44, 0.03);
  const head = fixedPart(mat, geoCache, 'sp-head', 0.36, 0.3, 0.32, [0.09, 0.09, 0.10]);
  head.position.set(0, 0.36, 0.26);
  g.add(abdomen, spots, head);
  // Горящие красные глаза (материал свечения, как у зомби)
  const eyes = addEyes(g, eyeMat, geoCache, 'sp', {
    y: 0.42, z: 0.43, dx: 0.1, size: 0.09,
    sclera: [1, 0.3, 0.22], pupil: null,
    glow: { mat: eyeMat, color: [1, 0.35, 0.25] },
  });
  const fangs = [];
  for (const sx of [-1, 1]) {
    const fang = fixedPart(mat, geoCache, 'sp-fang', 0.06, 0.07, 0.12, [0.12, 0.08, 0.07]);
    fang.position.set(sx * 0.09, 0.28, 0.42);
    fang.rotation.x = 0.3;
    fangs.push(fang);
    g.add(fang);
  }
  return {
    group: g, legs, head, ears: [], hop: false, scale: 1.15, spider: true,
    abdomen, fangs, look: [head, ...eyes, ...fangs], lookZ: 0.26, blink: eyes,
  };
}

// Крипер: высокий зелёный силуэт с хмурым лицом и короткими лапами (взрывается)
function buildCreeper(mat, geoCache) {
  const skin = [0.36, 0.72, 0.32];
  const g = new THREE.Group();
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = pendulumPart(mat, geoCache, 'cr-leg', 0.17, 0.26, 0.17, [0.26, 0.56, 0.24]);
      leg.position.set(sx * 0.15, 0.26, sz * 0.11);
      legs.push(leg);
      g.add(leg);
    }
  }
  const body = fixedPart(mat, geoCache, 'cr-body', 0.5, 0.8, 0.36, skin);
  body.position.set(0, 0.66, 0);
  const head = fixedPart(mat, geoCache, 'cr-head', 0.48, 0.44, 0.44, [0.42, 0.78, 0.36]);
  head.position.set(0, 1.3, 0.02);
  g.add(body, head);
  // Лицо: пустые тёмные глазницы и угрюмый рот
  const face = addEyes(g, mat, geoCache, 'cr', {
    y: 1.36, z: 0.24, dx: 0.12, size: 0.12,
    sclera: [0.05, 0.08, 0.05], pupil: null,
  });
  const mouth = addMouth(g, mat, geoCache, 'cr', { y: 1.2, z: 0.24, w: 0.2, h: 0.08, teeth: 0 });
  const frown = fixedPart(mat, geoCache, 'cr-frown', 0.12, 0.12, 0.04, [0.05, 0.08, 0.05]);
  frown.position.set(0, 1.14, 0.245);
  g.add(frown);
  return {
    group: g, legs, head, ears: [], hop: false, scale: 1.2, creeper: true,
    face, mouth, headPart: head,
    look: [head, ...face, ...mouth, frown], lookZ: 0.02, blink: face,
  };
}

// Рыба: плоское тельце, хвост и плавники, живёт в воде
function buildFish(mat, geoCache, ci) {
  const COLORS = [
    [0.88, 0.62, 0.24],  // золотая
    [0.38, 0.6, 0.78],   // синяя
    [0.7, 0.73, 0.7],    // серебристая
  ];
  const c = COLORS[ci % COLORS.length];
  const fin = [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `fi-body-${ci}`, 0.17, 0.24, 0.52, c);
  body.position.set(0, 0.24, 0);
  const tail = fixedPart(mat, geoCache, `fi-tail-${ci}`, 0.05, 0.26, 0.22, fin);
  tail.position.set(0, 0.24, -0.34);
  const dorsal = fixedPart(mat, geoCache, `fi-dorsal-${ci}`, 0.035, 0.13, 0.26, fin);
  dorsal.position.set(0, 0.42, 0.02);
  g.add(body, tail, dorsal);
  const wings = [];
  const eyes = [];
  for (const s of [-1, 1]) {
    const side = wingPart(mat, geoCache, `fi-fin-${s}-${ci}`, 0.2, 0.03, 0.15, fin, s);
    side.position.set(s * 0.085, 0.27, 0.1);
    wings.push(side);
    g.add(side);
    const eye = fixedPart(mat, geoCache, 'fi-eye', 0.055, 0.055, 0.035, [0.05, 0.05, 0.07]);
    eye.position.set(s * 0.075, 0.3, 0.25);
    eyes.push(eye);
    g.add(eye);
  }
  // Рот: открывается, когда рыба чавкает
  const mouth = fixedPart(mat, geoCache, `fi-mouth-${ci}`, 0.085, 0.06, 0.05, [0.3, 0.18, 0.18]);
  mouth.position.set(0, 0.2, 0.28);
  g.add(mouth);
  return {
    group: g, legs: [], head: null, ears: [], wings, fish: true, tail, scale: 1,
    mouth: [mouth], smile: mouth, blink: eyes,
  };
}

// Волк: серый пёс с мордой, ушами, хвостом и зубами (злится, если его ударить)
function buildWolf(mat, geoCache, ci) {
  const COLORS = [
    [0.72, 0.71, 0.68],
    [0.55, 0.54, 0.52],
    [0.86, 0.85, 0.82],
  ];
  const c = COLORS[ci % COLORS.length];
  const dark = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7];
  const g = new THREE.Group();
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `wl-leg-${ci}`, 0.13, 0.4, 0.13, dark);
    leg.position.set(sx * 0.17, 0.42, sz * 0.28);
    legs.push(leg);
    g.add(leg);
  }
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pendulumPart(mat, geoCache, `wl-ear-${ci}`, 0.11, 0.18, 0.07, dark);
    ear.position.set(s * 0.12, 1.0, 0.42);
    ear.rotation.x = -0.15;
    ears.push(ear);
    g.add(ear);
  }
  const body = fixedPart(mat, geoCache, `wl-body-${ci}`, 0.46, 0.44, 0.8, c);
  body.position.set(0, 0.62, -0.06);
  const neck = fixedPart(mat, geoCache, `wl-neck-${ci}`, 0.3, 0.3, 0.22, c);
  neck.position.set(0, 0.78, 0.32);
  const head = fixedPart(mat, geoCache, `wl-head-${ci}`, 0.34, 0.3, 0.32, c);
  head.position.set(0, 0.9, 0.48);
  const snout = fixedPart(mat, geoCache, `wl-snout-${ci}`, 0.18, 0.16, 0.22, dark);
  snout.position.set(0, 0.84, 0.68);
  const nose = fixedPart(mat, geoCache, 'wl-nose', 0.08, 0.07, 0.06, [0.1, 0.09, 0.09]);
  nose.position.set(0, 0.88, 0.79);
  const tail = fixedPart(mat, geoCache, `wl-tail-${ci}`, 0.13, 0.13, 0.42, c);
  tail.position.set(0, 0.7, -0.52);
  tail.rotation.x = -0.35;
  g.add(body, neck, head, snout, nose, tail);
  const face = addEyes(g, mat, geoCache, `wl-${ci}`, { y: 0.95, z: 0.62, dx: 0.11, size: 0.085 });
  const mouth = addMouth(g, mat, geoCache, `wl-${ci}`, { y: 0.8, z: 0.78, w: 0.11, h: 0.05, teeth: 2, grin: true });
  return {
    group: g, legs, ears, head, hop: false, scale: 1.15, wolf: true,
    face, mouth, tail, snout,
    look: [head, snout, nose, ...face, ...mouth], lookZ: 0.48, blink: face,
  };
}

const BUNNY_COLORS = [
  [0.93, 0.91, 0.88], // белый
  [0.62, 0.52, 0.42], // коричневый
  [0.55, 0.55, 0.58], // серый
];
const SHEEP_WOOL = [
  [0.95, 0.95, 0.97],
  [0.55, 0.55, 0.58],
  [0.35, 0.33, 0.32],
];

function buildBunny(mat, geoCache, ci) {
  const c = BUNNY_COLORS[ci % BUNNY_COLORS.length];
  const dark = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `bn-body-${ci}`, 0.46, 0.38, 0.62, c);
  body.position.set(0, 0.42, 0);
  const head = fixedPart(mat, geoCache, `bn-head-${ci}`, 0.34, 0.32, 0.3, c);
  head.position.set(0, 0.66, 0.34);
  const tail = fixedPart(mat, geoCache, `bn-tail-${ci}`, 0.16, 0.16, 0.14, [0.98, 0.97, 0.96]);
  tail.position.set(0, 0.5, -0.36);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pendulumPart(mat, geoCache, `bn-ear-${ci}`, 0.1, 0.42, 0.11, c);
    ear.position.set(s * 0.1, 0.98, 0.3);
    ear.rotation.x = -0.15;
    const inner = fixedPart(mat, geoCache, `bn-earin-${ci}`, 0.05, 0.26, 0.02, [0.95, 0.68, 0.72]);
    inner.position.set(0, -0.14, 0.06);
    ear.add(inner);
    ears.push(ear);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `bn-leg-${ci}`, 0.11, 0.26, 0.11, dark);
    leg.position.set(sx * 0.15, 0.28, sz * 0.22);
    legs.push(leg);
    g.add(leg);
  }
  // Морда: глаза с зрачками, нос и рот с двумя зубками
  const face = addEyes(g, mat, geoCache, `bn-${ci}`, { y: 0.71, z: 0.5, dx: 0.1, size: 0.1 });
  const nose = fixedPart(mat, geoCache, `bn-nose-${ci}`, 0.06, 0.05, 0.04, [0.95, 0.6, 0.66]);
  nose.position.set(0, 0.65, 0.51);
  g.add(nose);
  const mouth = addMouth(g, mat, geoCache, `bn-${ci}`, { y: 0.59, z: 0.51, w: 0.12, h: 0.045, teeth: 2, grin: false });
  g.add(body, head, tail);
  return {
    group: g, legs, head, ears, hop: true, face, mouth, tail,
    look: [head, ...face, nose, ...mouth], lookZ: 0.34, blink: face, scale: 1.3,
  };
}

function buildSheep(mat, geoCache, ci) {
  const wool = SHEEP_WOOL[ci % SHEEP_WOOL.length];
  const skin = [0.46, 0.4, 0.36];
  const dark = [wool[0] * 0.68, wool[1] * 0.68, wool[2] * 0.68];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `sh-body-${ci}`, 0.78, 0.56, 0.86, wool);
  body.position.set(0, 0.62, -0.06);
  const puff = fixedPart(mat, geoCache, `sh-puff-${ci}`, 0.66, 0.24, 0.72, [Math.min(1, wool[0] * 1.05), Math.min(1, wool[1] * 1.05), Math.min(1, wool[2] * 1.05)]);
  puff.position.set(0, 0.96, -0.08);
  const head = fixedPart(mat, geoCache, `sh-head-${ci}`, 0.38, 0.36, 0.34, skin);
  head.position.set(0, 0.78, 0.52);
  const snout = fixedPart(mat, geoCache, `sh-snout-${ci}`, 0.24, 0.18, 0.14, [0.36, 0.3, 0.27]);
  snout.position.set(0, 0.68, 0.72);
  // Рога — выглядят суровее
  const horns = [];
  for (const s of [-1, 1]) {
    const horn = fixedPart(mat, geoCache, `sh-horn-${ci}`, 0.12, 0.11, 0.22, [0.32, 0.29, 0.26]);
    horn.position.set(s * 0.25, 0.98, 0.46);
    horn.rotation.z = s * 0.35;
    g.add(horn);
    horns.push(horn);
    const ear = fixedPart(mat, geoCache, `sh-ear-${ci}`, 0.14, 0.1, 0.18, skin);
    ear.position.set(s * 0.26, 0.82, 0.5);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `sh-leg-${ci}`, 0.14, 0.34, 0.14, dark);
    leg.position.set(sx * 0.22, 0.34, sz * 0.26);
    legs.push(leg);
    g.add(leg);
  }
  // Морда: глаза с горизонтальными зрачками и жующий рот
  const face = addEyes(g, mat, geoCache, `sh-${ci}`, { y: 0.83, z: 0.7, dx: 0.14, size: 0.11, pupilScale: 0.42 });
  const mouth = addMouth(g, mat, geoCache, `sh-${ci}`, { y: 0.61, z: 0.8, w: 0.2, h: 0.05, teeth: 4, grin: false });
  g.add(body, puff, head, snout);
  return {
    group: g, legs, head, ears: horns, hop: false, face, mouth, snout,
    look: [head, snout, ...face, ...mouth], lookZ: 0.52, blink: face, chew: mouth, scale: 1.35,
  };
}

function buildSlime(mat, geoCache) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'sl-body', 0.62, 0.56, 0.62, [0.38, 0.78, 0.36]);
  body.position.set(0, 0.3, 0);
  const inner = fixedPart(mat, geoCache, 'sl-core', 0.3, 0.26, 0.3, [0.24, 0.6, 0.26]);
  inner.position.set(0, 0.24, 0);
  // Глаза с зрачками + широкий рот с зубами
  const face = addEyes(g, mat, geoCache, 'sl', { y: 0.42, z: 0.32, dx: 0.15, size: 0.11, pupilScale: 0.45 });
  const mouth = addMouth(g, mat, geoCache, 'sl', { y: 0.24, z: 0.35, w: 0.3, h: 0.08, teeth: 4, grin: false });
  // Капли по бокам
  for (const s of [-1, 1]) {
    const drip = fixedPart(mat, geoCache, 'sl-drip', 0.12, 0.12, 0.12, [0.32, 0.68, 0.32]);
    drip.position.set(s * 0.36, 0.16, 0.1);
    g.add(drip);
  }
  g.add(body, inner);
  return {
    group: g, legs: [], head: null, ears: [], hop: true, slime: body, face, mouth,
    look: [...face, ...mouth], lookZ: 0.12, blink: face, scale: 1.45,
  };
}

const BIRD_COLORS = [
  [0.9, 0.9, 0.93],   // белая
  [0.55, 0.42, 0.32], // воробей
  [0.38, 0.48, 0.68], // синица
];

function wingPart(mat, geoCache, key, w, h, d, color, side) {
  if (!geoCache.has(key)) {
    const g = partGeometry(w, h, d, color);
    g.translate(side * w / 2, 0, 0); // пивот у корпуса
    geoCache.set(key, g);
  }
  return new THREE.Mesh(geoCache.get(key), mat);
}

function buildBird(mat, geoCache, ci) {
  const c = BIRD_COLORS[ci % BIRD_COLORS.length];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `bd-body-${ci}`, 0.26, 0.22, 0.4, c);
  const head = fixedPart(mat, geoCache, `bd-head-${ci}`, 0.17, 0.16, 0.16, c);
  head.position.set(0, 0.12, 0.26);
  const beak = fixedPart(mat, geoCache, `bd-beak-${ci}`, 0.07, 0.05, 0.12, [0.95, 0.7, 0.25]);
  beak.position.set(0, 0.1, 0.4);
  const tail = fixedPart(mat, geoCache, `bd-tail-${ci}`, 0.11, 0.04, 0.2, c);
  tail.position.set(0, 0.02, -0.28);
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = wingPart(mat, geoCache, `bd-wing-${s}-${ci}`, 0.36, 0.04, 0.24, c, s);
    wing.position.set(s * 0.09, 0.06, 0.02);
    wings.push(wing);
    g.add(wing);
  }
  const face = addEyes(g, mat, geoCache, `bd-${ci}`, { y: 0.16, z: 0.36, dx: 0.07, size: 0.06, pupilScale: 0.55 });
  g.add(body, head, beak, tail);
  return {
    group: g, legs: [], head, ears: [], wings, hop: false, bird: true, face, tail, beak,
    look: [head, beak, ...face], lookZ: 0.26, blink: face, scale: 1.25,
  };
}

// Зомби: привычный зеленокожий гуманоид в бирюзовой рубашке и с вытянутыми руками.
// Халаты жителей: задумчивый коричневый, полевой зелёный, ярмарочный лиловый
const VILLAGER_ROBES = [
  { robe: [0.45, 0.31, 0.2], robeDark: [0.33, 0.22, 0.14], apron: [0.63, 0.52, 0.4] },   // мельник
  { robe: [0.3, 0.42, 0.24], robeDark: [0.21, 0.31, 0.17], apron: [0.5, 0.42, 0.3] },    // огородник
  { robe: [0.38, 0.28, 0.44], robeDark: [0.27, 0.19, 0.32], apron: [0.55, 0.46, 0.58] }, // торговец
];

function buildVillager(mat, geoCache, ci) {
  const c = VILLAGER_ROBES[ci % VILLAGER_ROBES.length];
  const skin = [0.72, 0.55, 0.42];
  const skinDark = [0.6, 0.44, 0.33];
  const g = new THREE.Group();
  const legs = [];
  const arms = [];

  // Сандалии выглядывают из-под рясы
  for (const sx of [-1, 1]) {
    const leg = pendulumPart(mat, geoCache, 'villager-leg', 0.16, 0.34, 0.19, c.robeDark);
    leg.position.set(sx * 0.12, 0.34, 0);
    const shoe = fixedPart(mat, geoCache, 'villager-shoe', 0.17, 0.1, 0.23, [0.2, 0.14, 0.1]);
    shoe.position.set(0, -0.285, 0.015);
    leg.add(shoe);
    legs.push(leg);
    g.add(leg);
  }

  // Ряса до колен и фартук — силуэт читается издалека
  const robe = fixedPart(mat, geoCache, `villager-robe-${ci}`, 0.54, 0.62, 0.34, c.robe);
  robe.position.set(0, 0.62, 0);
  const torso = fixedPart(mat, geoCache, `villager-torso-${ci}`, 0.5, 0.44, 0.3, c.robe);
  torso.position.set(0, 1.06, 0);
  const apron = fixedPart(mat, geoCache, `villager-apron-${ci}`, 0.34, 0.5, 0.03, c.apron);
  apron.position.set(0, 0.92, 0.17);
  const belt = fixedPart(mat, geoCache, 'villager-belt', 0.52, 0.07, 0.33, [0.24, 0.16, 0.1]);
  belt.position.set(0, 0.78, 0);
  const collar = fixedPart(mat, geoCache, `villager-collar-${ci}`, 0.3, 0.09, 0.04, c.robeDark);
  collar.position.set(0, 1.26, 0.15);

  // Руки сложены перед собой: тыльная сторона ладоней снаружи,
  // как у деревенского жителя, который что-то обдумывает.
  for (const sx of [-1, 1]) {
    const arm = pendulumPart(mat, geoCache, 'villager-arm', 0.15, 0.5, 0.16, c.robe);
    arm.position.set(sx * 0.32, 1.2, 0.02);
    arm.rotation.x = -0.5;
    arm.rotation.z = sx * 0.55;                    // кисти сходятся к животу
    const hand = fixedPart(mat, geoCache, 'villager-hand', 0.15, 0.13, 0.15, skin);
    hand.position.set(0, -0.48, 0.01);
    arm.add(hand);
    arms.push(arm);
    g.add(arm);
  }

  // Голова: крупный нос, густые брови, добродушный рот — «деревенский» профиль
  const head = fixedPart(mat, geoCache, 'villager-head', 0.46, 0.44, 0.42, skin);
  head.position.set(0, 1.52, 0.01);
  const nose = fixedPart(mat, geoCache, 'villager-nose', 0.1, 0.16, 0.12, skinDark);
  nose.position.set(0, 1.44, 0.25);
  const brow = fixedPart(mat, geoCache, 'villager-brow', 0.34, 0.06, 0.03, [0.3, 0.2, 0.13]);
  brow.position.set(0, 1.63, 0.225);
  const hair = fixedPart(mat, geoCache, 'villager-hair', 0.47, 0.1, 0.43, [0.28, 0.18, 0.11]);
  hair.position.set(0, 1.76, 0);
  const face = addEyes(g, mat, geoCache, 'villager', {
    y: 1.56, z: 0.225, dx: 0.12, size: 0.08,
    sclera: [0.97, 0.96, 0.92], pupil: [0.12, 0.2, 0.1], pupilScale: 0.5,
  });
  const mouth = addMouth(g, mat, geoCache, 'villager', {
    y: 1.35, z: 0.225, w: 0.18, h: 0.045, color: [0.32, 0.2, 0.16], teeth: 0,
  });

  g.add(robe, torso, apron, belt, collar, head, nose, brow, hair);
  return {
    group: g, legs, head, ears: [], hop: false,
    face, mouth, arms, look: [head, nose, brow, hair, ...face, ...mouth],
    lookZ: 0.01, blink: face, scale: 1.12,
  };
}

function buildZombie(mat, geoCache) {
  const g = new THREE.Group();
  const skin = [0.32, 0.64, 0.29];
  const skinDark = [0.21, 0.44, 0.2];
  const shirt = [0.12, 0.43, 0.58];
  const shirtDark = [0.08, 0.31, 0.43];
  const pants = [0.19, 0.23, 0.48];
  const legs = [];
  const arms = [];

  // Прямоугольные ноги и потёртые штаны.
  for (const sx of [-1, 1]) {
    const leg = pendulumPart(mat, geoCache, 'zombie-leg', 0.17, 0.58, 0.22, pants);
    leg.position.set(sx * 0.13, 0.58, 0);
    const boot = fixedPart(mat, geoCache, 'zombie-boot', 0.18, 0.13, 0.24, [0.11, 0.15, 0.3]);
    boot.position.set(0, -0.5, 0.015);
    leg.add(boot);
    legs.push(leg);
    g.add(leg);
  }

  const torso = fixedPart(mat, geoCache, 'zombie-torso', 0.52, 0.68, 0.3, shirt);
  torso.position.set(0, 0.92, 0);
  const collar = fixedPart(mat, geoCache, 'zombie-collar', 0.2, 0.11, 0.035, shirtDark);
  collar.position.set(0, 1.23, 0.16);
  const tornPatch = fixedPart(mat, geoCache, 'zombie-patch', 0.12, 0.09, 0.025, [0.22, 0.56, 0.55]);
  tornPatch.position.set(-0.13, 0.87, 0.16);

  // Голова с потемневшими щеками, глазами и простой угрюмой пастью.
  const head = fixedPart(mat, geoCache, 'zombie-head', 0.48, 0.48, 0.45, skin);
  head.position.set(0, 1.48, 0.015);
  const cheek = fixedPart(mat, geoCache, 'zombie-cheek', 0.11, 0.09, 0.025, skinDark);
  cheek.position.set(0.15, 1.36, 0.245);
  const face = addEyes(g, mat, geoCache, 'zombie', {
    y: 1.53, z: 0.247, dx: 0.115, size: 0.085,
    sclera: [0.86, 0.9, 0.72], pupil: [0.035, 0.045, 0.025], pupilScale: 0.42,
  });
  const mouth = addMouth(g, mat, geoCache, 'zombie', {
    y: 1.35, z: 0.25, w: 0.22, h: 0.055, color: [0.12, 0.18, 0.1], teeth: 2,
  });

  // Руки вытянуты перед собой; анимация шагает в противофазе с ногами.
  for (const sx of [-1, 1]) {
    const arm = pendulumPart(mat, geoCache, 'zombie-arm', 0.16, 0.62, 0.18, shirt);
    arm.position.set(sx * 0.34, 1.2, 0.03);
    arm.rotation.z = sx * 0.08;
    arm.rotation.x = -0.92;
    const hand = fixedPart(mat, geoCache, 'zombie-hand', 0.17, 0.16, 0.17, skin);
    hand.position.set(0, -0.61, 0.015);
    arm.add(hand);
    arms.push(arm);
    g.add(arm);
  }

  g.add(torso, collar, tornPatch, head, cheek);
  return {
    group: g, legs, head, ears: [], hop: false,
    face, mouth, arms, look: [head, cheek, ...face, ...mouth],
    lookZ: 0.015, blink: face, scale: 1.12,
  };
}

export class Mob {
  constructor(world, visuals, type, x, y, z) {
    this.world = world;
    this.v = visuals;
    this.type = type;            // 'bunny' | 'sheep' | 'slime' | 'zombie' | 'bird' | 'spider' | 'creeper' | 'wolf' | 'fish' | 'villager'
    this.pos = { x, y, z };
    this.home = { x, y, z };
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateT = 1 + Math.random() * 2;
    this.thinkT = Math.random();
    this.animT = Math.random() * 10;
    this.soundT = 1 + Math.random() * 3;
    this.onSound = null;         // (kind, dist) => void
    this.onAttack = null;        // (mob, playerPos) => void
    const SPEEDS = { bunny: 2.2, slime: 1.6, zombie: 2.0, bird: 3.0, spider: 3.1, creeper: 2.3, wolf: 2.7, fish: 1.5, villager: 1.15 };
    this.speed = SPEEDS[type] ?? 1.1;
    // Зайцы и овцы выдерживают 2–3 удара рукой, хищники — покрепче
    this.hp = type === 'sheep' ? 3 : type === 'bunny' ? 2 : type === 'slime' ? 2
      : type === 'zombie' ? 3 : type === 'spider' ? 4 : type === 'creeper' ? 6
        : type === 'wolf' ? 5 : type === 'fish' ? 1 : type === 'villager' ? 5 : 1;
    this.maxHp = this.hp;
    this.attackT = 0;
    this.flashT = 0;
    this.burnT = 0;
    this.fleeT = 0;
    this.zombieAvoidT = 0;
    // Анти-«крутится на месте»: если моб упёрся, он выбирает один обходной курс
    // и держится его, а не дёргает направление каждый кадр.
    this.detourT = 0;            // сколько ещё идти выбранным обходным курсом
    this.detourHeading = 0;      // сам курс
    this.stuckT = 0;             // сколько уже не может сдвинуться
    this.lastX = x; this.lastZ = z;
    this.idleStandT = 0;         // постоять на месте, когда выхода нет вовсе
    this.kbX = 0; this.kbZ = 0; this.kbT = 0;
    this.gaitT = 0;              // фаза походки (копится по пройденному пути)
    this.lookAngle = 0;          // на сколько повёрнута голова к игроку
    this.lungeT = 0;             // выпад при атаке (1 -> 0)
    this.dead = false;
    this.dying = -1;             // >= 0 — идёт анимация смерти (0..1)
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
    this.hurtMats = new Map();   // базовый материал → красный клон для этого моба
    this.hostile = HOSTILE.has(type);
    this.angry = false;          // волк злится, если его ударить
    this.fuseT = -1;             // крипер: >= 0 — горит фитиль
    this.fuseMax = 1.5;
    this.floodT = 0;             // сколько рыба уже бьётся на суше
    this.onExplode = null;       // (mob) => void — взрыв крипера
    this.baseScale = visuals.scale || 1;
    visuals.group.scale.setScalar(this.baseScale);
    visuals.group.position.set(x, y, z);
    this.yBase = y;
  }

  // Зомби идёт по земле за игроком, вытянув руки, и наносит урон при сближении.
  updateZombie(dt, playerPos) {
    const v = this.v;
    this.animT += dt;
    this.tickFlash(dt);
    this.attackT = Math.max(0, this.attackT - dt);
    this.zombieAvoidT = Math.max(0, this.zombieAvoidT - dt);
    this.applyKnockback(dt);

    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const hunting = dist < 22;
    const toPlayer = Math.atan2(dx, dz);
    const detour = this.detourTick(dt);
    if (hunting && this.zombieAvoidT <= 0 && detour === null) this.heading = toPlayer;

    let wantSpeed = hunting && dist > 1.25 ? this.speed * (dist > 5 ? 1.12 : 0.82) : 0;
    let moveSpeed = 0;
    if (wantSpeed > 0 && this.idleStandT <= 0) {
      // Пока выбираемся из ловушки — идём выбранным курсом, а не в стену
      const course = detour !== null ? detour : this.heading;
      const nx = this.pos.x + Math.sin(course) * wantSpeed * dt;
      const nz = this.pos.z + Math.cos(course) * wantSpeed * dt;
      const ground = this.groundAt(nx, nz, this.pos.y + 1.2);
      const water = ground !== null && isLiquid(this.world.getBlock(
        Math.floor(nx), Math.floor(ground - 0.1), Math.floor(nz),
      ));
      if (ground !== null && !water && Math.abs(ground - this.pos.y) <= 1.15 && !this.blockedAt(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.yBase = ground;
        this.heading = course;
        moveSpeed = wantSpeed;
      } else {
        // Не проходит сквозь стену и не идёт в воду/с обрыва.
        this.zombieAvoidT = 0.65 + Math.random() * 0.55;
        if (detour === null && !this.startDetour(toPlayer)) moveSpeed = 0;
      }
    }
    const moved = moveSpeed > 0;
    if (this.trackStuck(dt, moved, wantSpeed) && detour === null) {
      // Застрял в щели между блоками: перестаём крутиться и идём прочь
      this.zombieAvoidT = 0;
      if (!this.startDetour(toPlayer)) wantSpeed = 0;
    }
    if (this.detourT > 0 && hunting) {
      // Курс обхода плавно «уводит» зомби вокруг препятствия, потом снова к игроку
      this.heading = this.detourHeading;
    }
    const groundHere = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.2);
    if (groundHere !== null && Math.abs(groundHere - this.yBase) < 1.5) this.yBase = groundHere;
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 10);

    const walking = moveSpeed > 0;
    this.gaitT += moveSpeed * dt;
    const phase = this.gaitT * 3.2;
    const lunge = this.lungeT > 0 ? Math.sin(this.lungeT * Math.PI) : 0;
    this.lungeT = Math.max(0, this.lungeT - dt / 0.32);
    v.group.position.set(
      this.pos.x + Math.sin(this.heading) * 0.16 * lunge,
      this.pos.y + (walking ? Math.abs(Math.sin(phase * 2)) * 0.025 : 0) - 0.04 * lunge,
      this.pos.z + Math.cos(this.heading) * 0.16 * lunge,
    );
    v.group.rotation.y = this.heading;
    v.group.rotation.z = walking ? Math.sin(phase) * 0.035 : Math.sin(this.animT * 1.2) * 0.012;

    if (this.flashT > 0) {
      const k = this.flashT / 0.3;
      const pulse = Math.sin((1 - k) * Math.PI);
      const scale = this.baseScale;
      v.group.rotation.x = -0.48 * pulse;
      v.group.scale.set(scale * (1 + 0.16 * pulse), scale * (1 - 0.12 * pulse), scale * (1 + 0.16 * pulse));
      v.group.position.y += 0.08 * pulse;
    } else {
      v.group.rotation.x = -0.14 * lunge;
      v.group.scale.setScalar(this.baseScale * (1 + Math.sin(this.animT * 1.7) * 0.008));
    }

    for (let i = 0; i < v.legs.length; i++) {
      v.legs[i].rotation.x = walking ? Math.sin(phase + i * Math.PI) * 0.58 : Math.sin(this.animT * 1.4 + i) * 0.018;
    }
    for (let i = 0; i < v.arms.length; i++) {
      const side = i === 0 ? -1 : 1;
      const swing = walking ? Math.sin(phase + i * Math.PI) * 0.2 : Math.sin(this.animT * 1.4 + i) * 0.035;
      const attackReach = dist < 2.4 ? 0.18 : 0;
      v.arms[i].rotation.x = -0.92 + swing - attackReach + lunge * 0.22;
      v.arms[i].rotation.z = side * (0.08 + Math.sin(this.animT * 1.5 + i) * 0.025);
    }
    this.animateHead(dt, playerPos, 0.3);

    if (dist < 1.7 && this.attackT <= 0 && Math.abs(playerPos.y - this.pos.y) < 2.2) {
      this.attackT = 1.25;
      this.lungeT = 1;
      if (this.onSound) this.onSound('growl', dist, this.type);
      if (this.onAttack) this.onAttack(this, playerPos);
    }

    this.soundT -= dt;
    if (this.soundT <= 0) {
      this.soundT = dist < 10 ? 2.7 + Math.random() * 2.5 : 4 + Math.random() * 4;
      if (this.onSound && dist < 20) this.onSound('zombie', dist, this.type);
    }
  }

  /** Взгляд на игрока и мигание — общее для всех мобов */
  animateHead(dt, playerPos, reach = 0.6) {
    blinkEyes(this.v, dt);
    if (!this.v.look || !playerPos) return;
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const want = dist < 16 && this.state !== 'flee' && this.dying < 0
      ? Math.max(-reach, Math.min(reach, angDiff(Math.atan2(dx, dz), this.heading)))
      : 0;
    this.lookAngle += (want - this.lookAngle) * Math.min(1, dt * 4.5);
    turnHead(this.v, this.lookAngle);
  }

  knockback(dx, dz, power = 3.2) {
    const l = Math.hypot(dx, dz) || 1;
    this.kbX = (dx / l) * power;
    this.kbZ = (dz / l) * power;
    this.kbT = 0.22;
  }

  /** Звук удара (писк/блеяние/чавканье) */
  squeak() {
    if (this.onSound) this.onSound('hurt', 0, this.type);
  }

  /** Радиус попадания по мобу (для удара игрока) */
  hitRadius() {
    const base = this.type === 'sheep' ? 0.8 : this.type === 'slime' ? 0.62
      : this.type === 'zombie' ? 0.62 : this.type === 'bunny' ? 0.58
        : this.type === 'spider' ? 0.7 : this.type === 'creeper' ? 0.62
          : this.type === 'wolf' ? 0.62 : this.type === 'fish' ? 0.35 : 0.4;
    return base * this.baseScale;
  }

  /** Высота центра модели — по ней целимся и бьём частицами */
  centerY() {
    const base = this.type === 'sheep' ? 0.6 : this.type === 'zombie' ? 0.95
      : this.type === 'bird' ? 0.1 : this.type === 'creeper' ? 0.8
        : this.type === 'wolf' ? 0.6 : this.type === 'spider' ? 0.32 : 0.4;
    return base * this.baseScale;
  }

  /** Птиц тоже можно поразить; уже умирающие мобы не получают повторных попаданий. */
  hittable() {
    return this.dying < 0;
  }

  /**
   * Красный моб на время вспышки урона и на всю анимацию смерти.
   * Материал клонируется с базового, поэтому сохраняются прозрачность
   * (слизень) и цвета деталей — моб «краснеет», а не становится силуэтом.
   */
  setHurtTint(on) {
    const walk = (o) => {
      if (o.isMesh) {
        if (on) {
          if (!o.userData._baseMat) o.userData._baseMat = o.material;
          let tinted = this.hurtMats.get(o.userData._baseMat);
          if (!tinted) {
            tinted = o.userData._baseMat.clone();
            tinted.color.copy(HURT_MAT.color);
            this.hurtMats.set(o.userData._baseMat, tinted);
          }
          o.material = tinted;
        } else if (o.userData._baseMat) {
          o.material = o.userData._baseMat;
          o.userData._baseMat = null;
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(this.v.group);
  }

  /** Плавно перекрашивает умирающего моба из яркого красного в тёмный */
  tintDeath(k) {
    for (const mat of this.hurtMats.values()) {
      mat.color.setRGB(
        DEATH_COLOR_FROM[0] + (DEATH_COLOR_TO[0] - DEATH_COLOR_FROM[0]) * k,
        DEATH_COLOR_FROM[1] + (DEATH_COLOR_TO[1] - DEATH_COLOR_FROM[1]) * k,
        DEATH_COLOR_FROM[2] + (DEATH_COLOR_TO[2] - DEATH_COLOR_FROM[2]) * k,
      );
    }
  }

  /** Тик вспышки урона: 0.3 с красный, затем обратно */
  tickFlash(dt) {
    if (this.flashT <= 0) return;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.flashT === 0) this.setHurtTint(false);
  }

  /** Отброс после удара — с проверкой блоков, чтобы не пролететь сквозь стену */
  applyKnockback(dt) {
    if (this.kbT <= 0) return;
    const step = Math.min(this.kbT, dt);
    this.kbT -= dt;
    const nx = this.pos.x + this.kbX * step;
    const nz = this.pos.z + this.kbZ * step;
    if (!this.blockedAt(nx, this.pos.z)) this.pos.x = nx;
    else this.kbX = 0;
    if (!this.blockedAt(this.pos.x, nz)) this.pos.z = nz;
    else this.kbZ = 0;
    if (this.type !== 'fish') {
      // Наземные мобы не залетают в воздух — только скользят по земле.
      const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      if (g !== null && Math.abs(g - this.pos.y) <= 1.5) this.yBase = g;
    }
  }

  blockedAt(x, z) {
    for (const dy of [0.3, 1.0]) {
      if (isSolid(this.world.getBlock(Math.floor(x), Math.floor(this.pos.y + dy), Math.floor(z)))) return true;
    }
    return false;
  }

  /** Убегает от точки (после удара) */
  fleeFrom(pos, time = 4.5) {
    const dx = this.pos.x - pos.x, dz = this.pos.z - pos.z;
    this.heading = Math.atan2(dx, dz);
    this.state = 'flee';
    this.fleeT = time;
    this.stateT = time;
  }

  hurt(n) {
    if (this.dying >= 0) return false;      // уже умирает — повторно не бьём
    this.hp -= n;
    this.flashT = 0.3;
    this.setHurtTint(true);
    if (this.hp <= 0) {
      // Не исчезаем мгновенно: сначала проигрывается долгая анимация смерти,
      // на всё её время моб остаётся красным (updateDeath).
      this.dying = 0;
      this.state = 'dead';
      this.fuseT = -1;
      this.flashT = 0;
      this.setHurtTint(true);
      this.v.group.scale.setScalar(this.baseScale);
      this.v.group.rotation.x = 0;
      this.v.group.rotation.z = 0;
      if (this.onSound) this.onSound('die', 3, this.type);
      return true;
    }
    // Волк отвечает на удар: злится и бросается на игрока
    if (this.type === 'wolf') {
      this.angry = true;
      this.state = 'hunt';
      this.stateT = 12;
    }
    return false;
  }

  /**
   * Долгая анимация смерти: моб краснеет, заваливается набок, вздрагивает,
   * оседает и уменьшается. Живёт дольше вспышки урона, поэтому игрок успевает
   * разглядеть и «красную текстуру», и рассыпающиеся частицы в конце.
   */
  updateDeath(dt) {
    const v = this.v;
    this.dying = Math.min(1, this.dying + dt / MOB_DEATH_TIME);
    const k = this.dying;
    const topple = Math.min(1, k / 0.45);          // заваливание — первая половина
    const fall = topple * topple * (3 - 2 * topple);
    const settle = Math.min(1, Math.max(0, (k - 0.35) / 0.65));   // оседание и усадка
    const sink = settle * settle;

    v.group.rotation.order = 'YXZ';
    v.group.rotation.y = this.heading;
    v.group.rotation.z = this.deathDir * fall * Math.PI * 0.5;
    // Короткая судорога, когда моб касается земли
    v.group.rotation.x = -0.22 * fall + Math.sin(k * Math.PI * 3) * 0.1 * (1 - settle);

    const s = this.baseScale * (1 - sink * 0.42);
    v.group.scale.set(
      s * (1 + 0.06 * Math.sin(k * Math.PI)),
      s * (1 - 0.34 * sink),
      s,
    );
    v.group.position.set(this.pos.x, this.pos.y + 0.14 * (1 - fall) - 0.34 * sink, this.pos.z);

    this.tintDeath(k);
    if (this.dying >= 1) this.dead = true;   // дальше MobManager убирает моба и зовёт onDeath
  }

  dispose(scene) {
    scene.remove(this.v.group);
    // Геометрия общая (кэш) — не удаляем
  }

  think(playerPos) {
    const dx = this.pos.x - playerPos.x;
    const dz = this.pos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    this.stateT -= 0.6;

    // Разъярённый волк гонится за игроком, пока не остынет
    if (this.type === 'wolf' && this.angry) {
      if (dist > 22) this.angry = false;
      else {
        this.state = 'hunt';
        this.heading = Math.atan2(dx, dz);
        return;
      }
    }
    // Паук и крипер охотятся, когда игрок рядом
    if (this.hostile && dist < (this.type === 'spider' ? 14 : 12)) {
      this.state = 'hunt';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.state === 'hunt' && this.hostile && dist > 22) {
      this.state = 'idle';                  // потерял игрока
      this.stateT = 1.5 + Math.random() * 2;
    }
    // После удара заяц и барашек убегают довольно долго
    if (this.fleeT > 0) {
      this.state = 'flee';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.type === 'bunny' && dist < 4.5) {
      this.state = 'flee';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.state === 'flee' && dist > 7) this.state = 'idle';

    if (this.stateT <= 0) {
      const r = Math.random();
      if (this.type === 'sheep' && r < 0.35) {
        this.state = 'graze';
        this.stateT = 2 + Math.random() * 2.5;
      } else if (r < 0.55) {
        this.state = 'walk';
        this.heading += (Math.random() - 0.5) * 2.5;
        this.stateT = 1.5 + Math.random() * 2.5;
      } else {
        this.state = 'idle';
        this.stateT = 0.8 + Math.random() * 2;
      }
    }
  }

  /**
   * Застревание: моб упёрся в блок/обрыв и раньше начинал бесконечно крутиться
   * на месте (каждый кадр новый случайный разворот). Теперь он запоминает, что
   * не двигается, выбирает один свободный курс и идёт по нему, пока не освободится.
   * @param {number} dt
   * @param {boolean} moved сдвинулся ли моб в этом кадре
   * @param {number} speed желаемая скорость (0 — стоим)
   * @returns {boolean} true, если моб действительно застрял и сейчас «выбирается»
   */
  trackStuck(dt, moved, speed) {
    if (moved || speed <= 0) {
      this.stuckT = 0;
      return false;
    }
    this.stuckT += dt;
    return this.stuckT > 0.3;
  }

  /** Проходимо ли в этом направлении (стена, вода, обрыв/ступенька выше пояса) */
  headingFree(h, step = 0.85, waterCheck = true) {
    const nx = this.pos.x + Math.sin(h) * step;
    const nz = this.pos.z + Math.cos(h) * step;
    if (this.blockedAt(nx, nz)) return false;
    const g = this.groundAt(nx, nz, this.pos.y + 1.2);
    if (g === null) return false;
    if (Math.abs(g - this.pos.y) > 1.15) return false;
    if (waterCheck && isLiquid(this.world.getBlock(Math.floor(nx), Math.floor(g - 0.1), Math.floor(nz)))) return false;
    return true;
  }

  /**
   * Подобрать обходной курс: сначала ближайшие отклонения от текущего направления,
   * потом всё шире; если свободно только «назад» — идём назад.
   * @returns {number|null} угол или null, когда выхода нет (моб просто стоит)
   */
  findDetourHeading(base = this.heading, preferBack = true) {
    for (const off of [0.7, -0.7, 1.35, -1.35, 2.1, -2.1, 2.8, -2.8]) {
      const h = base + off;
      if (this.headingFree(h)) return h;
    }
    if (preferBack && this.headingFree(base + Math.PI, 0.7)) return base + Math.PI;
    return null;
  }

  /** Моб застрял: выбираем (или держим) обходной курс, не крутясь на месте */
  startDetour(base = this.heading, minT = 0.9, maxT = 2.2) {
    if (this.detourT > 0) return true;      // уже выбираемся — курс не меняем
    const h = this.findDetourHeading(base);
    if (h === null) {
      this.detourT = 0;
      this.idleStandT = 0.6 + Math.random() * 0.9;
      return false;                          // совсем некуда идти — стоим, а не крутимся
    }
    this.detourHeading = h;
    this.detourT = minT + Math.random() * (maxT - minT);
    return true;
  }

  /** Тик обходного курса: вернуть направление, которым сейчас надо идти (или null) */
  detourTick(dt) {
    if (this.idleStandT > 0) this.idleStandT -= dt;
    if (this.detourT <= 0) return null;
    this.detourT -= dt;
    if (this.detourT <= 0) { this.stuckT = 0; return null; }
    return this.detourHeading;
  }

  // Высота поверхности под ногами; null — обрыв/вода (не идём)
  groundAt(x, z, fromY) {
    const y0 = Math.floor(fromY) + 1;
    for (let y = y0; y > y0 - 6; y--) {
      const b = this.world.getBlock(Math.floor(x), y, Math.floor(z));
      if (isSolid(b)) return y + 1;
    }
    return null;
  }

  update(dt, playerPos) {
    // Птицы и рыба двигаются по своим правилам
    if (this.type === 'bird') return this.updateBird(dt, playerPos);
    if (this.type === 'zombie') return this.updateZombie(dt, playerPos);
    if (this.type === 'fish') return this.updateFish(dt, playerPos);

    // Крипер: подбежал — шипит, раздувается, потом взрывается
    if (this.fuseT >= 0) return this.updateFuse(dt, playerPos);

    this.thinkT -= dt;
    this.fleeT = Math.max(0, this.fleeT - dt);
    if (this.thinkT <= 0) {
      this.thinkT = 0.5 + Math.random() * 0.4;
      this.think(playerPos);
    }
    this.animT += dt;
    this.tickFlash(dt);
    this.applyKnockback(dt);

    const v = this.v;
    let moveSpeed = 0;
    if (this.state === 'walk') moveSpeed = this.speed;
    else if (this.state === 'flee') moveSpeed = this.speed * 1.7;
    else if (this.state === 'hunt') {
      moveSpeed = this.speed * (this.angry ? 1.15 : 1);
      this.heading = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    }

    const detour = this.detourTick(dt);
    const wantSpeed = moveSpeed;
    if (moveSpeed > 0 && this.idleStandT > 0) moveSpeed = 0;
    let moved = false;
    if (moveSpeed > 0) {
      // Охота/бегство смотрят на игрока, но если впереди стена или обрыв —
      // идём заранее выбранным обходным курсом (иначе моб крутится на месте).
      const course = detour !== null ? detour : this.heading;
      const nx = this.pos.x + Math.sin(course) * moveSpeed * dt;
      const nz = this.pos.z + Math.cos(course) * moveSpeed * dt;
      const g = this.groundAt(nx, nz, this.pos.y);
      // Не падаем с обрыва и не заходим в воду
      const targetWater = isLiquid(this.world.getBlock(Math.floor(nx), Math.floor((g ?? this.pos.y) - 1), Math.floor(nz)));
      if (g !== null && !targetWater && Math.abs(g - this.pos.y) <= 1.15 && !this.blockedAt(nx, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.yBase = g;
        this.heading = course;
        moved = true;
      } else if (detour === null) {
        this.startDetour(this.heading);      // один курс на секунду-другую, без верчения
      }
    }
    if (this.trackStuck(dt, moved, wantSpeed) && detour === null) this.startDetour(this.heading);

    // Плавный подъём/спуск по рельефу
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 10);

    // Анимация: фаза походки копится по пройденному пути, а не по времени —
    // иначе лапы «скользят» при разной скорости
    const walking = moveSpeed > 0;
    this.gaitT += moveSpeed * dt;
    const strideRate = this.type === 'spider' ? 5.2 : this.type === 'creeper' ? 3.4 : 3.0;
    const phase = this.gaitT * strideRate;
    let yOff = walking ? Math.abs(Math.sin(phase * 2)) * (this.type === 'spider' ? 0.012 : 0.022) : 0;
    if (this.type === 'slime') {
      // Слизень: прыгает и сплющивается
      if (walking) {
        yOff = Math.abs(Math.sin(this.animT * 6)) * 0.4;
        const sq = 1 + Math.sin(this.animT * 12) * 0.15;
        v.slime.scale.set(2 - sq, sq, 2 - sq);
      } else {
        v.slime.scale.set(1 + Math.sin(this.animT * 2) * 0.04, 1 - Math.sin(this.animT * 2) * 0.04, 1 + Math.sin(this.animT * 2) * 0.04);
      }
    } else if (v.hop && walking) {
      // Зайчик: резкие прыжки
      yOff = Math.abs(Math.sin(this.animT * 7)) * 0.3;
    }

    // Выпад при атаке: корпус подаётся вперёд и приседает
    if (this.lungeT > 0) this.lungeT = Math.max(0, this.lungeT - dt / 0.3);
    const lunge = this.lungeT > 0 ? Math.sin(this.lungeT * Math.PI) : 0;

    v.group.position.set(
      this.pos.x + Math.sin(this.heading) * 0.18 * lunge,
      this.pos.y + yOff - 0.05 * lunge,
      this.pos.z + Math.cos(this.heading) * 0.18 * lunge,
    );
    v.group.rotation.y = this.heading;   // модель смотрит носом туда, куда бежит

    // Отдача от удара: тряска и сплющивание
    if (this.flashT > 0) {
      const k = this.flashT / 0.3;
      const pulse = Math.sin((1 - k) * Math.PI);
      const sc = this.baseScale;
      v.group.rotation.x = -0.5 * pulse;
      v.group.rotation.z = Math.sin(this.animT * 60) * 0.14 * k;
      v.group.scale.set(sc * (1 + 0.2 * pulse), sc * (1 - 0.18 * pulse), sc * (1 + 0.2 * pulse));
      v.group.position.y += 0.1 * pulse;
    } else {
      // В покое корпус «дышит», на ходу покачивается в такт шагам
      const sway = walking ? Math.sin(phase) * 0.035 : Math.sin(this.animT * 1.2) * 0.015;
      const breathe = 1 + Math.sin(this.animT * 1.8) * (walking ? 0.005 : 0.014);
      v.group.rotation.x = -0.2 * lunge;
      v.group.rotation.z = sway;
      v.group.scale.set(
        this.baseScale * (1 + 0.012 * Math.sin(this.animT * 1.8)),
        this.baseScale * breathe,
        this.baseScale * (1 + 0.012 * Math.sin(this.animT * 1.8)),
      );
    }

    // Лапы: у зверей диагональные пары, у паука волна по восьми ногам
    const legPhase = LEG_PHASE[v.legs.length];
    for (let i = 0; i < v.legs.length; i++) {
      const off = legPhase ? legPhase[i] : 0;
      v.legs[i].rotation.x = walking
        ? Math.sin(phase + off) * 0.62
        : Math.sin(this.animT * 1.5 + i * 1.3) * 0.03;
      if (this.type === 'spider') {
        const ud = v.legs[i].userData;
        if (ud.baseRotZ == null) ud.baseRotZ = v.legs[i].rotation.z;
        v.legs[i].rotation.z = ud.baseRotZ + (walking
          ? Math.sin(phase + off + 1.2) * 0.22
          : Math.sin(this.animT * 2 + i) * 0.05);
      }
    }
    // Уши: у зайки трясутся в прыжке, у волка прижимаются в ярости и в бегстве
    const earsBack = (this.angry ? 0.55 : 0) + (this.state === 'flee' ? 0.35 : 0)
      + (this.type === 'wolf' && this.state === 'hunt' ? 0.3 : 0);
    for (const ear of v.ears) {
      const flap = this.type === 'wolf'
        ? Math.sin(this.animT * 3) * 0.06
        : Math.sin(this.animT * 5) * 0.12 + yOff * 0.3;
      ear.rotation.x = -0.15 + flap + earsBack;
    }
    // Хвост виляет на спокойной ходьбе и вытягивается в погоне
    if (v.tail) {
      const ud = v.tail.userData;
      if (ud.baseRotX == null) ud.baseRotX = v.tail.rotation.x;
      const hunting = this.state === 'hunt' || this.state === 'flee';
      v.tail.rotation.y = Math.sin(this.animT * (hunting ? 3 : 7)) * (hunting ? 0.06 : 0.45);
      v.tail.rotation.x = ud.baseRotX + (this.type === 'bunny' ? Math.sin(this.animT * 6) * 0.2 : 0)
        + (hunting ? -0.12 : 0);
    }
    // Жвала паука раскрываются, когда он охотится
    if (v.fangs) {
      const open = this.state === 'hunt' ? 0.5 : 0.12;
      for (let i = 0; i < v.fangs.length; i++) {
        v.fangs[i].rotation.x = 0.3 + open * 0.7;
        v.fangs[i].rotation.y = (i === 0 ? -1 : 1) * open * 0.5;
      }
    }
    // Барашек щиплет траву
    if (v.head && this.type === 'sheep') {
      const target = this.state === 'graze' ? 0.85 : 0;
      v.head.rotation.x += (target - v.head.rotation.x) * Math.min(1, dt * 6);
      v.head.position.y = 0.62 - (this.state === 'graze' ? 0.14 : 0);
    }
    if (v.head && this.type === 'bunny') {
      v.head.rotation.x = Math.sin(this.animT * 3) * 0.08;
    }
    // Барашек жуёт, когда щиплет траву
    if (v.chew) {
      const chew = this.state === 'graze' ? Math.abs(Math.sin(this.animT * 9)) * 0.6 : 0;
      for (const m of v.chew) m.scale.y = 1 + chew;
    }
    // Голова поворачивается к игроку, глаза мигают
    this.animateHead(dt, playerPos, this.type === 'spider' ? 0.45 : 0.6);

    // Атака: паук и волк кусают, крипер поджигает фитиль
    const distP = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    if (this.type === 'creeper') {
      if (this.state === 'hunt' && distP < 2.2) this.fuseT = 0;
    } else if (this.state === 'hunt' && this.attackT <= 0 && distP < 1.7 &&
               Math.abs(playerPos.y - this.pos.y) < 2) {
      this.attackT = this.type === 'wolf' ? 1.2 : 1.0;
      this.lungeT = 1;                       // видимый выпад вперёд
      if (this.onAttack) this.onAttack(this, playerPos);
    }
    if (this.type === 'spider' && this.soundT <= 0 && distP < 12) {
      this.soundT = 3 + Math.random() * 3;
      if (this.onSound) this.onSound('hiss', distP, this.type);
    }
    if (this.type === 'wolf' && this.soundT <= 0) {
      this.soundT = 2.5 + Math.random() * 4;
      if (distP < 16 && Math.random() < 0.5 && this.onSound) this.onSound('bark', distP, this.type);
    }

    // Звуки: прыжок зайки, блеяние барашка
    const dist = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    this.soundT -= dt;
    if (this.soundT <= 0 && this.onSound && dist < 14) {
      if (this.type === 'bunny' && walking && Math.random() < 0.35) {
        this.onSound('hop', dist);
        this.soundT = 0.7;
      } else if (this.type === 'sheep' && Math.random() < 0.12) {
        this.onSound('bleat', dist);
        this.soundT = 4;
      } else if (this.type === 'villager' && Math.random() < 0.2) {
        this.onSound('huh', dist);
        this.soundT = 5 + Math.random() * 4;
      } else {
        this.soundT = 0.4;
      }
    }
  }

  // Крипер с горящим фитилём: раздувается, дрожит и взрывается
  updateFuse(dt, playerPos) {
    const v = this.v;
    this.animT += dt;
    this.tickFlash(dt);
    this.fuseT += dt;
    const k = Math.min(1, this.fuseT / this.fuseMax);
    const swell = 1 + k * 0.45 + Math.sin(this.animT * 30) * 0.05 * k;
    v.group.scale.set(this.baseScale * swell, this.baseScale * (1 + k * 0.2), this.baseScale * swell);
    v.group.rotation.z = Math.sin(this.animT * 40) * 0.06 * k;
    v.group.rotation.y = this.heading;
    v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    // Пока горит фитиль, крипер перебирает лапами и подаётся к игроку
    for (let i = 0; i < v.legs.length; i++) {
      v.legs[i].rotation.x = Math.sin(this.animT * 18 + i * 1.7) * 0.28 * k;
    }
    this.animateHead(dt, playerPos, 0.5);
    const d = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (d > 5) this.fuseT = Math.max(0, this.fuseT - dt * 2);   // отошёл — фитиль гаснет
    if (this.fuseT >= this.fuseMax) {
      this.fuseT = -1;
      v.group.scale.setScalar(this.baseScale);
      v.group.rotation.z = 0;
      if (this.onExplode) this.onExplode(this);
      this.hurt(this.hp);        // после взрыва крипер погибает (с анимацией)
    }
  }

  /** Сколько блоков воды от рыбы до поверхности (0 — над головой воздух) */
  waterDepth() {
    let d = 0;
    for (let y = Math.floor(this.pos.y + 0.8); y < Math.floor(this.pos.y) + 6; y++) {
      if (!isLiquid(this.world.getBlock(Math.floor(this.pos.x), y, Math.floor(this.pos.z)))) break;
      d++;
    }
    return d;
  }

  // Рыба: плавает в воде, на суше беспомощно бьётся
  updateFish(dt, playerPos) {
    const v = this.v;
    this.animT += dt;
    this.tickFlash(dt);
    this.applyKnockback(dt);
    const inWater = isLiquid(this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z),
    ));
    if (inWater) {
      this.floodT = 0;
      this.thinkT -= dt;
      this.escapeT = Math.max(0, (this.escapeT || 0) - dt);
      if (this.thinkT <= 0) {
        this.thinkT = 1 + Math.random() * 2;
        this.heading += (Math.random() - 0.5) * 2.2;
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
        if (hx * hx + hz * hz > 36) this.heading = Math.atan2(hx, hz);
      }
      // Насколько глубоко под водой: в тесной колонне (блок сверху и снизу)
      // рыба не плавает и не вертится — стоит, слегка покачиваясь.
      const depth = this.waterDepth();
      const far = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z) > 4;
      let sp = this.speed * (far ? 1 : 1.9);
      if (depth < 1.4) sp = 0;
      if (sp > 0) {
        const course = this.escapeT > 0 ? this.escapeHeading : this.heading;
        const nx = this.pos.x + Math.sin(course) * sp * dt;
        const nz = this.pos.z + Math.cos(course) * sp * dt;
        const ahead = this.world.getBlock(Math.floor(nx), Math.floor(this.pos.y + 0.2), Math.floor(nz));
        if (isLiquid(ahead)) {
          this.pos.x = nx;
          this.pos.z = nz;
          if (this.escapeT > 0) this.heading = course;
        } else {
          // Упёрлась в стену: разворот на один фиксированный угол (не случайный),
          // иначе рыба крутилась бы на месте в тесном водоёме.
          this.turnDir = this.turnDir || (Math.random() < 0.5 ? 1 : -1);
          this.escapeHeading = this.heading + this.turnDir * Math.PI * 0.7;
          this.escapeT = 0.7;
          this.heading = this.escapeHeading;
        }
      } else if (this.escapeT <= 0) {
        this.heading += Math.sin(this.animT * 0.6) * dt * 0.3;   // тихо покачивается
      }
      const targetY = this.home.y + Math.sin(this.animT * 0.8) * 0.6;
      this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 1.6);
      v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      v.group.rotation.order = 'YXZ';
      v.group.rotation.y = this.heading;      // рыба плывёт носом вперёд
      v.group.rotation.x = Math.sin(this.animT * 1.3) * 0.12;
      v.group.rotation.z = Math.sin(this.animT * 1.1) * 0.14;
      if (v.tail) v.tail.rotation.y = Math.sin(this.animT * 8) * 0.5;
      for (let i = 0; i < v.wings.length; i++) {
        v.wings[i].rotation.z = (i === 0 ? 1 : -1) * (0.25 + Math.sin(this.animT * 9) * 0.25);
      }
      if (v.mouth) v.mouth[0].scale.x = 0.7 + Math.abs(Math.sin(this.animT * 2.4)) * 0.6;   // чавкает
      this.animateHead(dt, playerPos, 0.3);
      this.soundT -= dt;
      if (this.soundT <= 0) {
        this.soundT = 4 + Math.random() * 6;
        if (this.onSound && Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z) < 14) {
          this.onSound('swim', 4, this.type);
        }
      }
    } else {
      // На суше рыба бьётся и через время погибает
      this.floodT += dt;
      this.pos.y = Math.max(0, this.pos.y - dt * 1.2);
      v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      v.group.rotation.order = 'YXZ';
      v.group.rotation.set(0, this.heading, Math.PI * 0.35);   // на суше лежит на боку
      if (v.tail) v.tail.rotation.y = Math.sin(this.animT * 18) * 0.7;
      for (let i = 0; i < v.wings.length; i++) {
        v.wings[i].rotation.z = (i === 0 ? 1 : -1) * Math.sin(this.animT * 16) * 0.5;
      }
      if (v.mouth) v.mouth[0].scale.x = 0.6 + Math.abs(Math.sin(this.animT * 12)) * 0.9;    // хватает воздух
      this.animateHead(dt, playerPos, 0.2);
      this.soundT -= dt;
      if (this.soundT <= 0) {
        this.soundT = 1.4;
        if (this.onSound) this.onSound('flop', 4, this.type);
      }
      if (this.floodT > 12) this.hurt(this.hp);   // задохнулась
    }
  }

  updateBird(dt, playerPos) {
    this.animT += dt;
    this.tickFlash(dt);
    this.applyKnockback(dt);
    const v = this.v;
    // Кружим вокруг точки спавна, плавно меняя курс
    this.heading += Math.sin(this.animT * 0.7 + this.pos.x) * dt * 0.9;
    // Возвращаемся, если залетели далеко от дома
    const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
    if (hx * hx + hz * hz > 24 * 24) this.heading = Math.atan2(hx, hz);
    // Пугаемся игрока
    const dx = this.pos.x - playerPos.x, dz = this.pos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    let speed = 2.6;
    if (dist < 4) {
      this.heading = Math.atan2(dx, dz);
      speed = 5;
    }

    // Не влетаем в блоки: перед взмахом крыльев смотрим, что впереди.
    // Впереди стена — не летим и разворачиваемся по одному выбранному курсу
    // (случайный разворот каждый кадр выглядел как «птица крутится на месте»).
    this.escapeT = Math.max(0, (this.escapeT || 0) - dt);
    const stepX = this.pos.x + Math.sin(this.heading) * speed * 0.25;
    const stepZ = this.pos.z + Math.cos(this.heading) * speed * 0.25;
    const solidAt = (x, y, z) => {
      const b = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      return b !== 0 && !isLiquid(b);
    };
    const bodyY = this.pos.y + 0.4;
    if (solidAt(stepX, bodyY, stepZ)) {
      if (this.escapeT <= 0) {
        this.turnDir = this.turnDir || (Math.random() < 0.5 ? 1 : -1);
        this.escapeHeading = this.heading + this.turnDir * (1.1 + Math.random() * 0.5);
        this.escapeT = 0.6;
      }
      this.heading = this.escapeHeading;
    } else {
      this.pos.x += Math.sin(this.heading) * speed * dt;
      this.pos.z += Math.cos(this.heading) * speed * dt;
    }
    // Плавная волна высоты; держимся над землёй, но не влетаем в потолок/пол
    let targetY = this.home.y + Math.sin(this.animT * 0.9) * 1.6;
    if (solidAt(this.pos.x, targetY + 1.1, this.pos.z)) targetY = Math.floor(targetY) - 0.4;
    if (solidAt(this.pos.x, targetY - 0.6, this.pos.z)) targetY = Math.ceil(targetY) + 0.6;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 2);

    v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    v.group.rotation.y = this.heading;   // птица летит носом вперёд
    v.group.rotation.z = Math.sin(this.animT * 0.7) * 0.15; // крен в поворотах

    // Взмахи крыльев (в полёте чаще, в парении реже)
    const flap = Math.sin(this.animT * (dist < 4 ? 16 : 9)) * 0.85;
    if (v.wings) {
      v.wings[0].rotation.z = -flap;
      v.wings[1].rotation.z = flap;
    }
    // Голова клюёт носом, хвост работает как руль
    if (v.head) v.head.position.y = 0.12 + Math.sin(this.animT * 5) * 0.02;
    if (v.tail) v.tail.rotation.x = Math.sin(this.animT * 3) * 0.14;
    // Птица косится на игрока
    this.animateHead(dt, playerPos, 0.45);

    this.soundT -= dt;
    if (this.soundT <= 0 && this.onSound && dist < 16 && Math.random() < 0.25) {
      this.onSound('chirp', dist);
    }
    if (this.soundT <= 0) this.soundT = 1.2;
  }
}

/**
 * Модель моба отдельно от менеджера: нужна тестам и отладке.
 * @param {string} type вид моба
 */
export function buildVisualsFor(type, mat, geoCache, eyeMat, slimeMat = mat) {
  const ci = (Math.random() * 3) | 0;
  if (type === 'bunny') return buildBunny(mat, geoCache, ci);
  if (type === 'sheep') return buildSheep(mat, geoCache, ci);
  if (type === 'zombie') return buildZombie(mat, geoCache);
  if (type === 'bird') return buildBird(mat, geoCache, ci);
  if (type === 'spider') return buildSpider(mat, geoCache, eyeMat);
  if (type === 'creeper') return buildCreeper(mat, geoCache);
  if (type === 'wolf') return buildWolf(mat, geoCache, ci);
  if (type === 'fish') return buildFish(mat, geoCache, ci);
  if (type === 'villager') return buildVillager(mat, geoCache, ci);
  return buildSlime(slimeMat, geoCache);
}

/** Собрать модель моба для тестов: свои материалы и свой кэш геометрии */
export function makeMobVisuals(type) {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  return buildVisualsFor(type, mat, new Map(), new THREE.MeshBasicMaterial({ color: 0x8ef6ff }));
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.geoCache = new Map();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.slimeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
    this.spawnT = 0;
    this.villagerSpawnT = 0;           // отдельный таймер заселения деревень
    this.max = 14;                     // в мире стало больше видов мобов
    this.onHop = null; // (dist) => void — звук
    this.onSound = null; // (kind, dist, type) => void — звуки мобов
    this.onAttack = null; // (mob, playerPos) => void — укус паука/волка, атака зомби
    this.onDeath = null;  // (mob) => void
    this.onExplode = null; // (mob) => void — взрыв крипера
    this.night = true;
    this.difficulty = 'normal';
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ef6ff });
  }

  setLight(level) {
    const s = 0.32 + 0.68 * level;
    this.mat.color.setScalar(s);
    this.slimeMat.color.setScalar(s);
  }

  _count(type) {
    let n = 0;
    for (const m of this.mobs) if (m.type === type) n++;
    return n;
  }

  _randomType() {
    const r = Math.random();
    if (this.night && this.difficulty !== 'peaceful') {
      const hostileChance = this.difficulty === 'easy' ? 0.24 : this.difficulty === 'hard' ? 0.62 : 0.44;
      if (r < hostileChance * 0.55) return 'spider';
      if (r < hostileChance) return 'creeper';
      const passiveRoll = (r - hostileChance) / (1 - hostileChance);
      if (passiveRoll < 0.28) return 'bunny';
      if (passiveRoll < 0.52) return 'sheep';
      if (passiveRoll < 0.76) return 'slime';
      return 'wolf';
    }
    if (r < 0.28) return 'bunny';
    if (r < 0.5) return 'sheep';
    if (r < 0.66) return 'slime';
    if (r < 0.8) return 'wolf';
    return 'bird';
  }

  setDifficulty(difficulty = 'normal') {
    this.difficulty = ['peaceful', 'easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
    this.max = this.difficulty === 'hard' ? 18 : this.difficulty === 'easy' || this.difficulty === 'peaceful' ? 10 : 14;
  }

  _buildVisuals(type) {
    return buildVisualsFor(type, this.mat, this.geoCache, this.eyeMat, this.slimeMat);
  }

  /** Собрать моба со всеми хуками и поставить в мир */
  _addMob(type, x, y, z) {
    const visuals = this._buildVisuals(type);
    const mob = new Mob(this.world, visuals, type, x, y, z);
    mob.onSound = (k, d, t) => { if (this.onSound) this.onSound(k, d, t); };
    mob.onAttack = (m, pp) => { if (this.onAttack) this.onAttack(m, pp); };
    mob.onExplode = (m) => { if (this.onExplode) this.onExplode(m); };
    this.scene.add(visuals.group);
    this.mobs.push(mob);
    return mob;
  }

  _isVisibleSpawn(x, z, player) {
    // моб виден игроку — не спавним прямо перед носом
    const px = player.pos ? player.pos.x : player.x;
    const pz = player.pos ? player.pos.z : player.z;
    const yaw = player.yaw ?? 0;
    const dx = x - px, dz = z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > 36) return false;
    if (dist < 8) return true; // слишком близко всегда считаем видимым
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const dnx = dx / dist, dnz = dz / dist;
    const dot = fx * dnx + fz * dnz;
    // < 75° в стороны от взгляда считаем видимым
    return dot > 0.26 && dist < 32;
  }

  /** Рыба: ищем воду рядом с игроком */
  trySpawnFish(player) {
    const playerPos = player.pos || player;
    if (this._count('fish') >= MOB_CAPS.fish) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 20;
      const x = Math.floor(playerPos.x + Math.sin(ang) * r);
      const z = Math.floor(playerPos.z + Math.cos(ang) * r);
      const h = this.world.heightAt(x, z);
      if (h >= this.world.seaLevel - 1) continue;      // нужно хотя бы 2 блока глубины
      const y = this.world.seaLevel - 1;
      if (this.world.getBlock(x, y, z) !== BLOCK.WATER) continue;
      if (this.world.getBlock(x, y + 1, z) !== BLOCK.WATER) continue;
      if (this._isVisibleSpawn(x + 0.5, z + 0.5, player)) continue;
      return this._addMob('fish', x + 0.5, y + 0.5, z + 0.5);
    }
    return null;
  }

  trySpawn(player) {
    const playerPos = player.pos || player;
    if (this.mobs.length >= this.max) return;
    // Днём подселяем рыбу в ближайшую воду — реже
    if (!this.night && Math.random() < 0.25 && this.trySpawnFish(player)) return;
    for (let attempt = 0; attempt < 8; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 22;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      // не спавним прямо перед глазами
      if (this._isVisibleSpawn(x, z, player)) continue;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      let type = this._randomType();
      // Не превышаем лимит по каждому виду
      if (MOB_CAPS[type] && this._count(type) >= MOB_CAPS[type]) type = 'sheep';
      if (this.night && type === 'bird') type = 'slime';

      // Птицы — в небе над любой поверхностью
      if (type === 'bird') {
        if (h <= 2) continue;
        this._addMob(type, x, Math.max(h + 7, this.world.seaLevel + 6) + Math.random() * 5, z);
        return;
      }

      if (h <= this.world.seaLevel + 1) continue;
      // Проверяем настоящий блок сверху
      const top = this.world.getBlock(Math.floor(x), h, Math.floor(z));
      const above = this.world.getBlock(Math.floor(x), h + 1, Math.floor(z));
      const above2 = this.world.getBlock(Math.floor(x), h + 2, Math.floor(z));
      if ((top !== BLOCK.GRASS && top !== BLOCK.SNOW) || above !== BLOCK.AIR || above2 !== BLOCK.AIR) continue;
      this._addMob(type, x + 0.5, h + 1, z + 0.5);
      return;
    }
  }

  setNight(n) {
    this.night = n;
  }

  /** Житель деревни: привязан к дому/колодцу, откуда заспавнен */
  spawnVillagerAt(x, y, z) {
    if (this._count('villager') >= MOB_CAPS.villager) return null;
    const mob = this._addMob('villager', x, y, z);
    if (mob) mob.home = { x, y, z };
    return mob;
  }

  /**
   * Деревенское население: рядом с игроком каждая деревня получает жителей
   * (по точкам у домов и колодца), а уехав из зоны прорисовки жители
   * «расходятся по домам» — выгружаются, чтобы не тикали вдали.
   */
  trySpawnVillagers(player) {
    const playerPos = player.pos || player;
    if (typeof this.world.villagesNear !== 'function') return;
    const near = this.world.villagesNear(playerPos.x, playerPos.z);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.type !== 'villager') continue;
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      if (dx * dx + dz * dz > 110 * 110) {
        m.dispose(this.scene);
        this.mobs.splice(i, 1);
      }
    }
    for (const v of near) {
      const want = Math.min(v.spots.length, 4);
      if (this._count('villager') >= MOB_CAPS.villager) return;
      for (const spot of v.spots) {
        if (this._count('villager') >= MOB_CAPS.villager) return;
        const taken = this.mobs.some((m) => m.type === 'villager'
          && Math.hypot(m.home.x - spot.x, m.home.z - spot.z) < 6);
        if (taken) continue;
        const crowd = this.mobs.filter((m) => m.type === 'villager'
          && Math.hypot(m.pos.x - v.x, m.pos.z - v.z) < 60).length;
        if (crowd >= want) break;
        const pdx = spot.x - playerPos.x, pdz = spot.z - playerPos.z;
        if (pdx * pdx + pdz * pdz > 72 * 72) continue;
        this.spawnVillagerAt(spot.x, spot.y, spot.z);
      }
    }
  }

  // Ночной спавн зомби (и отдельный хук для тестов) — тоже только вне видимости
  trySpawnZombie(player) {
    const playerPos = player.pos || player;
    if (this.difficulty === 'peaceful') return null;
    if (this.mobs.filter((m) => m.type === 'zombie').length >= 4) return null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 14;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      if (this._isVisibleSpawn(x, z, player)) continue;
      const bx = Math.floor(x), bz = Math.floor(z);
      const h = this.world.heightAt(bx, bz);
      if (h <= this.world.seaLevel) continue;
      const top = this.world.getBlock(bx, h, bz);
      const above = this.world.getBlock(bx, h + 1, bz);
      const above2 = this.world.getBlock(bx, h + 2, bz);
      if (![BLOCK.GRASS, BLOCK.SNOW, BLOCK.STONE, BLOCK.SAND].includes(top)
          || above !== BLOCK.AIR || above2 !== BLOCK.AIR) continue;
      return this.spawnZombieAt(x + 0.5, h + 1, z + 0.5);
    }
    return null;
  }

  spawnZombieAt(x, y, z) {
    return this._addMob('zombie', x, y, z);
  }

  /**
   * Пещерный спавн: глубоко под землёй в темноте заводятся пауки и зомби
   * в любое время суток — игроку в пещере нужен факел.
   */
  trySpawnCaveMob(player) {
    const playerPos = player.pos || player;
    if (this.difficulty === 'peaceful') return null;
    const px = Math.floor(playerPos.x), pz = Math.floor(playerPos.z);
    const surf = this.world.heightAt(px, pz);
    if (playerPos.y > surf - 5) return null;      // игрок не под землёй
    for (let attempt = 0; attempt < 12; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 16;
      const x = Math.floor(playerPos.x + Math.sin(ang) * r);
      const z = Math.floor(playerPos.z + Math.cos(ang) * r);
      // Воздушный карман заметно ниже поверхности и неподалёку от игрока
      const hh = this.world.heightAt(x, z);
      const top = Math.min(hh - 6, Math.floor(playerPos.y + 8));
      const bottom = Math.max(6, Math.floor(playerPos.y - 10));
      if (top <= bottom) continue;
      const y = Math.floor(bottom + Math.random() * (top - bottom));
      if (this.world.getBlock(x, y, z) !== BLOCK.AIR) continue;
      if (this.world.getBlock(x, y + 1, z) !== BLOCK.AIR) continue;
      if (this.world.getBlock(x, y + 2, z) !== BLOCK.AIR) continue;
      if (!isSolid(this.world.getBlock(x, y - 1, z))) continue;
      if (this._isVisibleSpawn(x + 0.5, z + 0.5, player)) continue;
      const type = Math.random() < 0.6 ? 'spider' : 'zombie';
      if (this._count(type) >= (MOB_CAPS[type] || 4)) continue;
      return this._addMob(type, x + 0.5, y + 0.5, z + 0.5);
    }
    return null;
  }

  /** Моб в пещере (поверхность значительно выше) — рассвет его не жжёт */
  _underground(m) {
    const h = this.world.heightAt(Math.floor(m.pos.x), Math.floor(m.pos.z));
    return m.pos.y + 1 < h - 2;
  }

  update(dt, player, active = true) {
    const playerPos = player.pos || player;
    // Спавн реже и только вне поля зрения (раз в 5-8 сек)
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 5 + Math.random() * 3.5;
      if (active) this.trySpawn(player);
    }
    // Деревни заселяются чаще: игрок подошёл — жители выходят к колодцу
    this.villagerSpawnT -= dt;
    if (this.villagerSpawnT <= 0) {
      this.villagerSpawnT = 1.4;
      if (active) this.trySpawnVillagers(player);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs.splice(i, 1);
        m.dispose(this.scene);
        if (this.onDeath) this.onDeath(m);
        continue;
      }
      // Умирающий моб проигрывает анимацию смерти, потом исчезает
      if (m.dying >= 0) {
        m.updateDeath(dt);
        continue;
      }
      // Рассвет сжигает ночную нечисть под открытым небом: зомби, пауков и криперов.
      // В пещере темно и днём — там нечисть не сгорает.
      if ((m.type === 'zombie' || m.type === 'spider' || m.type === 'creeper') && !this.night && !this._underground(m)) {
        m.burnT += dt;
        if (m.burnT <= dt * 1.5 && this.onSound) this.onSound('burn', 3, m.type);
        if (m.burnT > 1.6) {
          m.hurt(m.hp);        // сгорает с дымом и анимацией смерти
          continue;
        }
      }
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 64 * 64) {
        m.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }
      // Дальних обновляем реже
      if (d2 > 32 * 32 && (this.spawnT * 3) % 2 > 1) continue;
      m.update(dt, playerPos);
    }
  }

  clear() {
    for (const m of this.mobs) m.dispose(this.scene);
    this.mobs = [];
  }
}
