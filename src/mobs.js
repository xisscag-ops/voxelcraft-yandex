// Мобы: зайчик, барашек и слизень из коробок, с ходьбой, прыжками и настроениями
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

// Здоровье и цвет «брызг» при попадании
const MOB_HP = { bunny: 2, sheep: 3, slime: 1, bird: 1, gloom: 3, spider: 4, creeper: 6, fish: 1, wolf: 5 };
const HIT_COLORS = {
  bunny: 0xe6e2da, sheep: 0xf2f2f4, slime: 0x5cc45a, bird: 0xdadade, gloom: 0x2a2140,
  spider: 0x4a2f26, creeper: 0x6cc24a, fish: 0xb8ccd8, wolf: 0xd6d2ca,
};
// Враждебные мобы: их можно бить рукой и они атакуют игрока
export const HOSTILE = new Set(['gloom', 'spider', 'creeper']);
// Сколько каких мобов держим одновременно
const MOB_CAPS = { spider: 3, creeper: 2, wolf: 3, fish: 4, gloom: 4 };

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
  const body = fixedPart(mat, geoCache, `bn-body-${ci}`, 0.42, 0.34, 0.58, c);
  body.position.set(0, 0.38, 0);
  const head = fixedPart(mat, geoCache, `bn-head-${ci}`, 0.3, 0.28, 0.26, c);
  head.position.set(0, 0.58, 0.32);
  const tail = fixedPart(mat, geoCache, `bn-tail-${ci}`, 0.14, 0.14, 0.12, [0.98, 0.97, 0.96]);
  tail.position.set(0, 0.45, -0.34);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pendulumPart(mat, geoCache, `bn-ear-${ci}`, 0.09, 0.34, 0.1, c);
    ear.position.set(s * 0.09, 0.86, 0.28);
    ear.rotation.x = -0.15;
    ears.push(ear);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `bn-leg-${ci}`, 0.1, 0.22, 0.1, dark);
    leg.position.set(sx * 0.14, 0.24, sz * 0.2);
    legs.push(leg);
    g.add(leg);
  }
  g.add(body, head, tail);
  return { group: g, legs, head, ears, hop: true };
}

function buildSheep(mat, geoCache, ci) {
  const wool = SHEEP_WOOL[ci % SHEEP_WOOL.length];
  const skin = [0.48, 0.42, 0.38];
  const dark = [wool[0] * 0.7, wool[1] * 0.7, wool[2] * 0.7];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `sh-body-${ci}`, 0.68, 0.52, 0.88, wool);
  body.position.set(0, 0.52, 0);
  // «Кудряшки» — второй блок шерсти сверху
  const puff = fixedPart(mat, geoCache, `sh-puff-${ci}`, 0.56, 0.2, 0.7, [Math.min(1, wool[0] * 1.05), Math.min(1, wool[1] * 1.05), Math.min(1, wool[2] * 1.05)]);
  puff.position.set(0, 0.82, -0.03);
  const head = fixedPart(mat, geoCache, `sh-head-${ci}`, 0.3, 0.3, 0.26, skin);
  head.position.set(0, 0.62, 0.52);
  for (const s of [-1, 1]) {
    const ear = fixedPart(mat, geoCache, `sh-ear-${ci}`, 0.1, 0.08, 0.14, skin);
    ear.position.set(s * 0.2, 0.68, 0.48);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `sh-leg-${ci}`, 0.13, 0.3, 0.13, dark);
    leg.position.set(sx * 0.2, 0.3, sz * 0.28);
    legs.push(leg);
    g.add(leg);
  }
  g.add(body, puff, head);
  return { group: g, legs, head, ears: [], hop: false };
}

function buildSlime(mat, geoCache) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'sl-body', 0.55, 0.5, 0.55, [0.38, 0.78, 0.36]);
  body.position.set(0, 0.28, 0);
  // Глазки
  for (const s of [-1, 1]) {
    const eye = fixedPart(mat, geoCache, 'sl-eye', 0.09, 0.09, 0.05, [0.1, 0.12, 0.1]);
    eye.position.set(s * 0.13, 0.34, 0.29);
    g.add(eye);
  }
  g.add(body);
  return { group: g, legs: [], head: null, ears: [], hop: true, slime: body };
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
  const body = fixedPart(mat, geoCache, `bd-body-${ci}`, 0.22, 0.18, 0.34, c);
  const head = fixedPart(mat, geoCache, `bd-head-${ci}`, 0.14, 0.13, 0.13, c);
  head.position.set(0, 0.1, 0.22);
  const beak = fixedPart(mat, geoCache, `bd-beak-${ci}`, 0.05, 0.04, 0.09, [0.95, 0.7, 0.25]);
  beak.position.set(0, 0.08, 0.32);
  const tail = fixedPart(mat, geoCache, `bd-tail-${ci}`, 0.09, 0.03, 0.16, c);
  tail.position.set(0, 0.02, -0.24);
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = wingPart(mat, geoCache, `bd-wing-${s}-${ci}`, 0.3, 0.03, 0.2, c, s);
    wing.position.set(s * 0.08, 0.05, 0.02);
    wings.push(wing);
    g.add(wing);
  }
  g.add(body, head, beak, tail);
  return { group: g, legs: [], head: null, ears: [], wings, hop: false, bird: true };
}

// Хмарь — ночной охотник: парящая тень с горящими глазами (своя, процедурная модель)
function buildGloom(mat, geoCache, eyeMat) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'gl-body', 0.5, 0.5, 0.38, [0.03, 0.02, 0.05]);
  body.position.set(0, 0.45, 0);
  const head = fixedPart(mat, geoCache, 'gl-head', 0.4, 0.3, 0.36, [0.04, 0.03, 0.07]);
  head.position.set(0, 0.82, 0);
  const wisp = fixedPart(mat, geoCache, 'gl-wisp', 0.2, 0.55, 0.2, [0.015, 0.01, 0.03]);
  wisp.position.set(0, -0.05, 0);
  const eyeL = fixedPart(eyeMat, geoCache, 'gl-eye', 0.09, 0.09, 0.06, [1, 1, 1]);
  eyeL.position.set(-0.1, 0.85, 0.18);
  const eyeR = fixedPart(eyeMat, geoCache, 'gl-eye', 0.09, 0.09, 0.06, [1, 1, 1]);
  eyeR.position.set(0.1, 0.85, 0.18);
  g.add(body, head, wisp, eyeL, eyeR);
  return { group: g, legs: [], head: null, ears: [], hop: false, gloom: true };
}

// Паук: восемь ног-«палок», два сегмента тела и красные глаза (ночной охотник)
function buildSpider(mat, geoCache, eyeMat) {
  const g = new THREE.Group();
  const bodyCol = [0.24, 0.16, 0.13];
  const legs = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.16, 0.3, 0.24 - i * 0.16);
      pivot.rotation.z = side * 0.95;
      pivot.rotation.y = side * (0.5 - i * 0.3);
      const upper = fixedPart(mat, geoCache, 'sp-leg-up', 0.34, 0.07, 0.07, bodyCol);
      upper.position.set(side * 0.17, 0, 0);
      const lower = fixedPart(mat, geoCache, 'sp-leg-low', 0.26, 0.06, 0.06, [0.18, 0.12, 0.1]);
      lower.position.set(side * 0.45, -0.16, 0);
      lower.rotation.z = side * -0.9;
      pivot.add(upper, lower);
      legs.push(pivot);
      g.add(pivot);
    }
  }
  const abdomen = fixedPart(mat, geoCache, 'sp-abd', 0.42, 0.34, 0.46, bodyCol);
  abdomen.position.set(0, 0.34, -0.2);
  const head = fixedPart(mat, geoCache, 'sp-head', 0.34, 0.28, 0.3, [0.3, 0.2, 0.16]);
  head.position.set(0, 0.32, 0.22);
  for (const s2 of [-1, 1]) {
    const eye = fixedPart(eyeMat, geoCache, 'sp-eye', 0.08, 0.07, 0.06, [1, 0.25, 0.2]);
    eye.position.set(s2 * 0.09, 0.36, 0.36);
    g.add(eye);
    const fang = fixedPart(mat, geoCache, 'sp-fang', 0.05, 0.05, 0.1, [0.12, 0.08, 0.07]);
    fang.position.set(s2 * 0.07, 0.25, 0.36);
    g.add(fang);
  }
  g.add(abdomen, head);
  return { group: g, legs, head, ears: [], hop: false, spider: true };
}

// Крипер: высокий зелёный силуэт с «лицом» и короткими лапами
function buildCreeper(mat, geoCache) {
  const g = new THREE.Group();
  const bodyCol = [0.36, 0.72, 0.32];
  const body = fixedPart(mat, geoCache, 'cr-body', 0.46, 0.78, 0.34, bodyCol);
  body.position.set(0, 0.62, 0);
  const head = fixedPart(mat, geoCache, 'cr-head', 0.44, 0.42, 0.42, [0.42, 0.78, 0.36]);
  head.position.set(0, 1.24, 0.02);
  // Лицо: тёмные глаза и рот
  for (const s2 of [-1, 1]) {
    const eye = fixedPart(mat, geoCache, 'cr-eye', 0.11, 0.1, 0.06, [0.06, 0.09, 0.06]);
    eye.position.set(s2 * 0.11, 1.3, 0.23);
    g.add(eye);
  }
  const mouth = fixedPart(mat, geoCache, 'cr-mouth', 0.16, 0.13, 0.06, [0.06, 0.09, 0.06]);
  mouth.position.set(0, 1.16, 0.23);
  g.add(mouth);
  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = pendulumPart(mat, geoCache, 'cr-leg', 0.16, 0.24, 0.16, [0.26, 0.56, 0.24]);
      leg.position.set(sx * 0.14, 0.24, sz * 0.1);
      legs.push(leg);
      g.add(leg);
    }
  }
  g.add(body, head);
  return { group: g, legs, head, ears: [], hop: false, creeper: true, body, headPart: head };
}

// Рыба: плоское тельце, хвост и плавники
function buildFish(mat, geoCache, ci) {
  const FISH_COLORS = [
    [0.85, 0.6, 0.25],  // золотая
    [0.4, 0.62, 0.78],  // синяя
    [0.72, 0.74, 0.7],  // серебристая
  ];
  const c = FISH_COLORS[ci % FISH_COLORS.length];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `fi-body-${ci}`, 0.16, 0.22, 0.5, c);
  body.position.set(0, 0.22, 0);
  const tail = fixedPart(mat, geoCache, `fi-tail-${ci}`, 0.04, 0.24, 0.2, [c[0] * 1.1, c[1] * 1.1, c[2] * 1.1]);
  tail.position.set(0, 0.22, -0.33);
  const dorsal = fixedPart(mat, geoCache, `fi-dorsal-${ci}`, 0.03, 0.12, 0.24, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8]);
  dorsal.position.set(0, 0.38, 0.02);
  const wings = [];
  for (const s2 of [-1, 1]) {
    const fin = wingPart(mat, geoCache, `fi-fin-${s2}-${ci}`, 0.18, 0.03, 0.14, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], s2);
    fin.position.set(s2 * 0.08, 0.24, 0.1);
    wings.push(fin);
    g.add(fin);
    const eye = fixedPart(mat, geoCache, 'fi-eye', 0.05, 0.05, 0.03, [0.05, 0.05, 0.07]);
    eye.position.set(s2 * 0.07, 0.27, 0.24);
    g.add(eye);
  }
  g.add(body, tail, dorsal);
  return { group: g, legs: [], head: null, ears: [], wings, fish: true, tail };
}

// Волк: серый пёс с мордой, ушами и хвостом
function buildWolf(mat, geoCache, ci) {
  const WOLF_COLORS = [
    [0.72, 0.71, 0.68],
    [0.55, 0.54, 0.52],
    [0.86, 0.85, 0.82],
  ];
  const c = WOLF_COLORS[ci % WOLF_COLORS.length];
  const dark = [c[0] * 0.72, c[1] * 0.72, c[2] * 0.72];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `wl-body-${ci}`, 0.42, 0.4, 0.74, c);
  body.position.set(0, 0.56, -0.04);
  const neck = fixedPart(mat, geoCache, `wl-neck-${ci}`, 0.28, 0.26, 0.2, c);
  neck.position.set(0, 0.7, 0.3);
  const head = fixedPart(mat, geoCache, `wl-head-${ci}`, 0.32, 0.28, 0.3, c);
  head.position.set(0, 0.82, 0.44);
  const snout = fixedPart(mat, geoCache, `wl-snout-${ci}`, 0.16, 0.14, 0.2, dark);
  snout.position.set(0, 0.76, 0.62);
  const nose = fixedPart(mat, geoCache, 'wl-nose', 0.07, 0.06, 0.06, [0.12, 0.11, 0.11]);
  nose.position.set(0, 0.79, 0.72);
  const ears = [];
  for (const s2 of [-1, 1]) {
    const ear = pendulumPart(mat, geoCache, `wl-ear-${ci}`, 0.1, 0.16, 0.06, dark);
    ear.position.set(s2 * 0.11, 0.96, 0.42);
    ear.rotation.x = -0.2;
    ears.push(ear);
    g.add(ear);
    const eye = fixedPart(mat, geoCache, 'wl-eye', 0.05, 0.05, 0.04, [0.08, 0.07, 0.06]);
    eye.position.set(s2 * 0.1, 0.85, 0.58);
    g.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `wl-leg-${ci}`, 0.12, 0.36, 0.12, dark);
    leg.position.set(sx * 0.16, 0.38, sz * 0.26);
    legs.push(leg);
    g.add(leg);
  }
  const tail = fixedPart(mat, geoCache, `wl-tail-${ci}`, 0.12, 0.12, 0.4, c);
  tail.position.set(0, 0.62, -0.48);
  tail.rotation.x = -0.35;
  g.add(body, neck, head, snout, nose, tail);
  return { group: g, legs, head, ears, hop: false, wolf: true, tail, jaw: snout };
}

export class Mob {
  constructor(world, visuals, type, x, y, z) {
    this.world = world;
    this.v = visuals;
    this.type = type;            // 'bunny' | 'sheep' | 'slime' | 'bird'
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
    const SPEEDS = { bunny: 2.2, slime: 1.6, gloom: 2.0, sheep: 1.1, bird: 1.1, spider: 3.1, creeper: 2.3, wolf: 2.7, fish: 1.5 };
    this.speed = SPEEDS[type] ?? 1.1;
    this.hostile = HOSTILE.has(type);
    this.angry = false;          // волк злится, если его ударить
    this.fuseT = -1;             // крипер: >= 0 — идёт фитиль
    this.fuseMax = 1.5;
    this.dying = -1;             // >= 0 — проигрывается анимация смерти (0..1)
    this.deathDir = Math.random() < 0.5 ? -1 : 1;
    this.swimT = 0;
    this.hp = MOB_HP[type] ?? 2;
    // Цвет частиц при ударе/смерти
    this.hitColor = HIT_COLORS[type] ?? 0xcccccc;
    this.attackT = 0;
    this.flashT = 0;
    this.burnT = 0;
    this.fleeT = 0;              // сколько ещё убегать после удара
    this.dead = false;
    // Порядок поворотов «сначала рыскание, потом наклон» — реакции на удар
    // и крен смотрятся правильно при любом курсе
    visuals.group.rotation.order = 'YXZ';
    visuals.group.position.set(x, y, z);
    this.yBase = y;
  }

  // Хмарь: подкрадывается к игроку, висит над землёй, бьёт с дистанции 1.6
  updateGloom(dt, playerPos) {
    const v = this.v;
    this.animT += dt;
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    this.heading = Math.atan2(dx, dz);
    if (dist > 1.15 && dist < 24) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
    }
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    this.yBase = (g ?? this.pos.y) + 0.3;
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 4);

    const hover = Math.sin(this.animT * 2.6) * 0.09;
    v.group.position.set(this.pos.x, this.pos.y + hover, this.pos.z);
    v.group.rotation.y = this.heading;
    v.group.rotation.z = Math.sin(this.animT * 2) * 0.05;
    // Анимация получения удара: отдача назад, сплющивание и дрожь
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT) / 0.35;      // 1 -> 0
      const pulse = Math.sin((1 - k) * Math.PI);        // 0 -> 1 -> 0
      v.group.rotation.x = -0.55 * pulse;               // отклоняется назад
      v.group.rotation.z += Math.sin(this.animT * 60) * 0.12 * k;
      v.group.scale.set(1 + 0.25 * pulse, 1 - 0.22 * pulse, 1 + 0.25 * pulse);
      v.group.position.y += 0.12 * pulse;
    } else {
      v.group.rotation.x = 0;
      v.group.scale.setScalar(1);
    }
    // Плавный отброс после удара
    if (this.kbT > 0) {
      const step = Math.min(this.kbT, dt);
      this.kbT -= dt;
      this.pos.x += this.kbX * step;
      this.pos.z += this.kbZ * step;
    }

    // Атака
    this.attackT -= dt;
    if (dist < 1.6 && this.attackT <= 0) {
      this.attackT = 1.1;
      if (this.onAttack) this.onAttack(this, playerPos);
    }

    // Шёпот
    this.soundT -= dt;
    if (this.soundT <= 0) {
      this.soundT = 3 + Math.random() * 4;
      if (this.onSound && dist < 18) this.onSound('gloom', dist);
    }
  }

  knockback(dx, dz, power = 3.2) {
    const l = Math.hypot(dx, dz) || 1;
    this.kbX = (dx / l) * power;
    this.kbZ = (dz / l) * power;
    this.kbT = 0.18;
  }

  /** Убегать от точки (x, z) — после попадания стрелы */
  fleeFrom(x, z, time = 3.5) {
    const dx = this.pos.x - x, dz = this.pos.z - z;
    if (dx * dx + dz * dz > 1e-6) this.heading = Math.atan2(dx, dz);
    this.state = 'flee';
    this.fleeT = time;
    this.stateT = time;
  }

  hurt(n) {
    if (this.dying >= 0) return false;      // уже умирает — не бьём повторно
    this.hp -= n;
    this.flashT = 0.35;
    if (this.hp <= 0) {
      // Смерть: сноп частиц, звук и падение набок (анимация в updateDeath)
      this.dying = 0;
      this.state = 'dead';
      if (this.onSound) this.onSound('die', 3);
      return true;
    }
    // Волк отвечает на удар — становится злым и бросается на игрока
    if (this.type === 'wolf') {
      this.angry = true;
      this.state = 'hunt';
      this.stateT = 12;
    }
    return false;
  }

  // Анимация смерти: моб заваливается набок, оседает и уменьшается
  updateDeath(dt) {
    const v = this.v;
    this.dying = Math.min(1, this.dying + dt / 0.75);
    const k = this.dying;
    const fall = k * k;
    v.group.rotation.order = 'YXZ';
    v.group.rotation.x = 0;
    v.group.rotation.z = this.deathDir * fall * Math.PI * 0.5;
    v.group.rotation.y = this.heading;
    const s = 1 - fall * 0.45;
    v.group.scale.set(s, s * (1 - fall * 0.3), s);
    v.group.position.set(this.pos.x, this.pos.y + Math.max(0, 0.12 - fall * 0.25), this.pos.z);
    if (this.dying >= 1) this.dead = true;
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

    // Волк в бешенстве видит игрока далеко
    if (this.type === 'wolf' && this.angry) {
      this.state = 'hunt';
      if (dist > 22) this.angry = false;
      return;
    }
    // Хищники (паук, крипер) охотятся вблизи
    if (this.hostile && this.state !== 'hunt' && dist < (this.type === 'spider' ? 14 : 12)) {
      this.state = 'hunt';
      return;
    }
    if (this.state === 'hunt' && !this.hostile && !(this.type === 'wolf' && this.angry)) {
      this.state = 'idle';
    }
    if (this.state === 'hunt' && this.hostile && dist > 22) {
      this.state = 'idle';                 // потерял игрока
      this.stateT = 1.5 + Math.random() * 2;
    }
    if (this.type === 'bunny' && dist < 4.5) {
      this.state = 'flee';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.type === 'wolf' && dist < 5 && !this.angry && Math.random() < 0.3) {
      // Волк держится рядом с игроком, но не нападает
      this.state = 'idle';
      this.stateT = 1.5;
      return;
    }
    if (this.state === 'flee' && dist > 7 && this.fleeT <= 0) this.state = 'idle';

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
    if (this.dying >= 0) return this.updateDeath(dt);
    // Птицы летают отдельно — без привязки к земле
    if (this.type === 'bird') return this.updateBird(dt, playerPos);
    if (this.type === 'gloom') return this.updateGloom(dt, playerPos);
    if (this.type === 'fish') return this.updateFish(dt, playerPos);

    // Фитиль крипера: подбежал — шипит, раздувается и взрывается
    if (this.fuseT >= 0) {
      this.fuseT += dt;
      const k = Math.min(1, this.fuseT / this.fuseMax);
      const v0 = this.v;
      const swell = 1 + k * 0.45 + Math.sin(this.animT * 30) * 0.04 * k;
      v0.group.scale.set(swell, 1 + k * 0.2, swell);
      v0.group.rotation.z = Math.sin(this.animT * 40) * 0.06 * k;
      this.animT += dt;
      v0.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      const ddx = playerPos.x - this.pos.x, ddz = playerPos.z - this.pos.z;
      if (Math.hypot(ddx, ddz) > 5) this.fuseT = Math.max(0, this.fuseT - dt * 2); // отошёл — фитиль гаснет
      if (this.fuseT >= this.fuseMax) {
        this.fuseT = -1;
        this.dying = 0;                     // после взрыва осыпается
        if (this.onExplode) this.onExplode(this);
      }
      return;
    }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.5 + Math.random() * 0.4;
      this.think(playerPos);
    }
    this.animT += dt;
    if (this.fleeT > 0) this.fleeT -= dt;

    const v = this.v;
    let moveSpeed = 0;
    if (this.state === 'walk') moveSpeed = this.speed;
    else if (this.state === 'flee') moveSpeed = this.speed * 1.7;
    else if (this.state === 'hunt') {
      moveSpeed = this.speed;
      // Хищник всегда бежит прямо на игрока
      this.heading = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    }

    if (moveSpeed > 0) {
      const nx = this.pos.x + Math.sin(this.heading) * moveSpeed * dt;
      const nz = this.pos.z + Math.cos(this.heading) * moveSpeed * dt;
      const g = this.groundAt(nx, nz, this.pos.y);
      // Не падаем с обрыва и не заходим в воду
      const targetWater = isLiquid(this.world.getBlock(Math.floor(nx), Math.floor((g ?? this.pos.y) - 1), Math.floor(nz)));
      if (g !== null && !targetWater && Math.abs(g - this.pos.y) <= 1.15) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.yBase = g;
      } else {
        this.heading += Math.PI * (0.5 + Math.random() * 0.6); // разворот
      }
    }

    // Импульс от удара (стрела или кулак)
    if (this.kbT > 0) {
      const step = Math.min(this.kbT, dt);
      this.kbT -= dt;
      const nx = this.pos.x + this.kbX * step;
      const nz = this.pos.z + this.kbZ * step;
      if (this.groundAt(nx, nz, this.pos.y) !== null) {
        this.pos.x = nx;
        this.pos.z = nz;
      }
    }

    // Плавный подъём/спуск по рельефу
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 10);

    // Анимация
    const walking = moveSpeed > 0;
    const phase = this.animT * (walking ? 7 : 2);
    let yOff = 0;
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

    v.group.position.set(this.pos.x, this.pos.y + yOff, this.pos.z);
    v.group.rotation.y = this.heading;   // модель смотрит туда, куда бежит (нос — +Z)

    // Попадание (стрела или удар): отдача назад и «сплющивание»
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT) / 0.35;
      const pulse = Math.sin((1 - k) * Math.PI);
      v.group.rotation.x = -0.6 * pulse;
      v.group.scale.set(1 + 0.2 * pulse, 1 - 0.18 * pulse, 1 + 0.2 * pulse);
    } else {
      v.group.rotation.x = 0;
      v.group.scale.setScalar(1);
    }

    // Ноги
    for (let i = 0; i < v.legs.length; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      v.legs[i].rotation.x = walking ? Math.sin(phase) * 0.7 * s : Math.sin(this.animT * 1.5) * 0.04;
    }
    // Уши зайки покачиваются
    for (const ear of v.ears) {
      ear.rotation.x = -0.15 + Math.sin(this.animT * 5) * 0.12 + yOff * 0.3;
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

    // Атака хищников: паук кусает, крипер поджигает фитиль, волк кусает
    if (this.state === 'hunt') {
      const distP = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      if (this.type === 'creeper') {
        if (distP < 2.2) this.fuseT = 0;
      } else if (this.attackT <= 0 && distP < 1.7 && Math.abs(playerPos.y - this.pos.y) < 2) {
        this.attackT = this.type === 'wolf' ? 1.2 : 1.0;
        if (this.onAttack) this.onAttack(this, playerPos);
      }
      // Шипение паука
      if (this.type === 'spider' && this.soundT <= 0 && distP < 12) {
        this.soundT = 3 + Math.random() * 3;
        if (this.onSound) this.onSound('hiss', distP);
      }
    }
    // Лай волка
    if (this.type === 'wolf' && this.soundT <= 0) {
      this.soundT = 2.5 + Math.random() * 4;
      const dW = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
      if (this.onSound && dW < 16 && Math.random() < 0.5) this.onSound('bark', dW);
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
      } else {
        this.soundT = 0.4;
      }
    }
  }

  // Рыба: плавает в воде, изредка плещется; на суше беспомощно бьётся
  updateFish(dt, playerPos) {
    this.animT += dt;
    const v = this.v;
    const inWater = isLiquid(this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)));
    if (inWater) {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.thinkT = 1 + Math.random() * 2;
        this.heading += (Math.random() - 0.5) * 2.2;
        // Держимся в своём водоёме
        const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
        if (hx * hx + hz * hz > 36) this.heading = Math.atan2(hx, hz);
      }
      const sp = this.speed * (Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z) < 4 ? 1.8 : 1);
      const nx = this.pos.x + Math.sin(this.heading) * sp * dt;
      const nz = this.pos.z + Math.cos(this.heading) * sp * dt;
      const below = this.world.getBlock(Math.floor(nx), Math.floor(this.pos.y + 0.2), Math.floor(nz));
      if (isLiquid(below)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else {
        this.heading += Math.PI * (0.5 + Math.random() * 0.5);
      }
      // Плаваем в слое воды, ныряем/всплываем
      const targetY = this.home.y + Math.sin(this.animT * 0.8) * 0.6;
      this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 1.6);
      v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      v.group.rotation.order = 'YXZ';
      v.group.rotation.set(Math.sin(this.animT * 1.3) * 0.12, this.heading, Math.sin(this.animT * 1.1) * 0.14);
      if (v.tail) v.tail.rotation.y = Math.sin(this.animT * 8) * 0.5;
      for (let i = 0; i < v.wings.length; i++) v.wings[i].rotation.z = (i === 0 ? 1 : -1) * (0.25 + Math.sin(this.animT * 9) * 0.25);
      this.soundT -= dt;
      if (this.soundT <= 0) {
        this.soundT = 4 + Math.random() * 6;
        if (this.onSound && Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z) < 14) this.onSound('swim', 4);
      }
    } else {
      // На суше рыба бьётся и медленно погибает
      this.pos.y = Math.max(0, this.pos.y - dt * 1.2);
      v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      v.group.rotation.order = 'YXZ';
      v.group.rotation.set(0, this.heading + Math.sin(this.animT * 12) * 0.6, Math.PI * 0.35);
      this.swimT += dt;
      if (v.tail) v.tail.rotation.y = Math.sin(this.animT * 18) * 0.7;
      this.soundT -= dt;
      if (this.soundT <= 0) {
        this.soundT = 1.4;
        if (this.onSound) this.onSound('flop', 4);
      }
      if (this.swimT > 12 && this.dying < 0) {
        this.dying = 0;                     // задохнулась
      }
    }
    // Отдача от удара
    if (this.kbT > 0) {
      const step = Math.min(this.kbT, dt);
      this.kbT -= dt;
      this.pos.x += this.kbX * step;
      this.pos.z += this.kbZ * step;
    }
  }

  updateBird(dt, playerPos) {
    this.animT += dt;
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

    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    // Плавная волна высоты; держимся над землёй
    const targetY = this.home.y + Math.sin(this.animT * 0.9) * 1.6;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 2);

    v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    v.group.rotation.y = this.heading;   // птица летит носом вперёд
    v.group.rotation.z = -Math.sin(this.animT * 0.7) * 0.15; // крен в поворотах

    // Взмахи крыльев (в полёте чаще, в парении реже)
    const flap = Math.sin(this.animT * (dist < 4 ? 16 : 9)) * 0.85;
    if (v.wings) {
      v.wings[0].rotation.z = -flap;
      v.wings[1].rotation.z = flap;
    }

    this.soundT -= dt;
    if (this.soundT <= 0 && this.onSound && dist < 16 && Math.random() < 0.25) {
      this.onSound('chirp', dist);
    }
    if (this.soundT <= 0) this.soundT = 1.2;
  }
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
    this.max = 14;
    this.onHop = null; // (dist) => void — звук
    this.onAttack = null; // (mob, playerPos) => void — атака Хмари/паука/волка
    this.onExplode = null; // (mob) => void — взрыв крипера
    this.onDeath = null;  // (mob) => void
    this.night = true;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ef6ff });
    this.gloomMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  }

  setLight(level) {
    const s = 0.32 + 0.68 * level;
    this.mat.color.setScalar(s);
    this.slimeMat.color.setScalar(s);
    this.gloomMat.color.setScalar(0.55 + 0.45 * level);
  }

  _count(type) {
    let n = 0;
    for (const m of this.mobs) if (m.type === type) n++;
    return n;
  }

  _randomType() {
    const r = Math.random();
    if (this.night) {
      // Ночью выходят пауки и криперы
      if (r < 0.26) return 'spider';
      if (r < 0.44) return 'creeper';
      if (r < 0.6) return 'bunny';
      if (r < 0.74) return 'sheep';
      if (r < 0.86) return 'slime';
      return 'wolf';
    }
    if (r < 0.28) return 'bunny';
    if (r < 0.5) return 'sheep';
    if (r < 0.66) return 'slime';
    if (r < 0.8) return 'wolf';
    return 'bird';
  }

  _buildVisuals(type) {
    const ci = (Math.random() * 3) | 0;
    if (type === 'bunny') return buildBunny(this.mat, this.geoCache, ci);
    if (type === 'sheep') return buildSheep(this.mat, this.geoCache, ci);
    if (type === 'gloom') return buildGloom(this.gloomMat, this.geoCache, this.eyeMat);
    if (type === 'bird') return buildBird(this.mat, this.geoCache, ci);
    if (type === 'spider') return buildSpider(this.mat, this.geoCache, this.eyeMat);
    if (type === 'creeper') return buildCreeper(this.mat, this.geoCache);
    if (type === 'wolf') return buildWolf(this.mat, this.geoCache, ci);
    if (type === 'fish') return buildFish(this.mat, this.geoCache, ci);
    return buildSlime(this.slimeMat, this.geoCache);
  }

  _addMob(type, x, y, z) {
    const visuals = this._buildVisuals(type);
    const mob = new Mob(this.world, visuals, type, x, y, z);
    mob.onSound = (k, d) => { if (this.onSound) this.onSound(k, d); };
    mob.onAttack = (m, pp) => { if (this.onAttack) this.onAttack(m, pp); };
    mob.onExplode = (m) => { if (this.onExplode) this.onExplode(m); };
    this.scene.add(visuals.group);
    this.mobs.push(mob);
    return mob;
  }

  // Рыба: ищем воду рядом с игроком
  trySpawnFish(playerPos) {
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
      return this._addMob('fish', x + 0.5, y + 0.5, z + 0.5);
    }
    return null;
  }

  trySpawn(playerPos) {
    if (this.mobs.length >= this.max) return;
    // Рыба живёт в воде отдельно от наземных мобов
    if (!this.night && this._count('fish') < MOB_CAPS.fish && Math.random() < 0.4) {
      if (this.trySpawnFish(playerPos)) return;
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 18;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      let type = this._randomType();
      if (MOB_CAPS[type] && this._count(type) >= MOB_CAPS[type]) type = 'sheep';
      if (this.night && (type === 'bird')) type = 'slime';

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

  // Ночной спавн Хмари (и отдельный хук для тестов)
  trySpawnGloom(playerPos) {
    if (this.mobs.filter((m) => m.type === 'gloom').length >= 4) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 10;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      if (h <= this.world.seaLevel) continue;
      return this.spawnGloomAt(x + 0.5, h + 1, z + 0.5);
    }
    return null;
  }

  spawnGloomAt(x, y, z) {
    return this._addMob('gloom', x, y, z);
  }

  update(dt, playerPos, active = true) {
    // Спавн/деспавн
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      if (active) this.trySpawn(playerPos);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs.splice(i, 1);
        m.dispose(this.scene);
        if (this.onDeath) this.onDeath(m);
        continue;
      }
      // Рассвет сжигает Хмарь
      if (m.type === 'gloom' && !this.night) {
        m.burnT += dt;
        if (m.burnT <= dt * 1.5 && this.onSound) this.onSound('burn', 3);
        if (m.burnT > 1.6) {
          this.mobs.splice(i, 1);
          m.dispose(this.scene);
          if (this.onDeath) this.onDeath(m);
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
