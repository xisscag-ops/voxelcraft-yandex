// Мобы: зайчик, барашек и слизень из коробок, с ходьбой, прыжками и настроениями
import * as THREE from 'three';
import { isSolid, isLiquid, blockBounds, BLOCK } from './blocks.js';

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

// Хмарь стала меньше, но её лицо теперь видно даже ночью: красные глаза,
// скошенные брови, чёрная пасть и светлые клыки. Лицевая сторона — +Z.
function buildGloom(mat, geoCache, eyeMat) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'gl-body', 0.49, 0.47, 0.38, [0.07, 0.055, 0.1]);
  body.position.set(0, 0.43, 0);
  const head = fixedPart(mat, geoCache, 'gl-head', 0.47, 0.39, 0.36, [0.13, 0.11, 0.17]);
  head.position.set(0, 0.82, 0.02);
  const wisp = fixedPart(mat, geoCache, 'gl-wisp', 0.17, 0.44, 0.17, [0.035, 0.025, 0.05]);
  wisp.position.set(0, -0.02, 0);
  g.add(body, head, wisp);
  for (const s of [-1, 1]) {
    const brow = fixedPart(mat, geoCache, 'gl-brow', 0.18, 0.05, 0.045, [0.015, 0.01, 0.025]);
    brow.position.set(s * 0.115, 0.92, 0.226);
    brow.rotation.z = -s * 0.28;
    const eye = fixedPart(eyeMat, geoCache, 'gl-eye', 0.105, 0.073, 0.045, [1, 1, 1]);
    eye.position.set(s * 0.12, 0.855, 0.231);
    g.add(brow, eye);
  }
  const mouth = fixedPart(mat, geoCache, 'gl-mouth', 0.29, 0.085, 0.045, [0.007, 0.005, 0.015]);
  mouth.position.set(0, 0.71, 0.231);
  g.add(mouth);
  for (const sx of [-0.105, -0.025, 0.04, 0.11]) {
    const fang = fixedPart(mat, geoCache, 'gl-fang', 0.027, 0.055, 0.028, [0.94, 0.88, 0.75]);
    fang.position.set(sx, sx > 0 ? 0.70 : 0.73, 0.263);
    g.add(fang);
  }
  g.scale.setScalar(0.72);
  return { group: g, legs: [], head: null, ears: [], hop: false, gloom: true };
}

// Чёрный паук: брюшко, головогрудь, восемь сгибающихся ног и четыре глаза.
function buildSpider(mat, geoCache, eyeMat) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'sp-body', 0.55, 0.32, 0.62, [0.085, 0.085, 0.105]);
  body.position.set(0, 0.36, -0.18);
  const stripe = fixedPart(mat, geoCache, 'sp-stripe', 0.24, 0.025, 0.34, [0.17, 0.16, 0.19]);
  stripe.position.set(0, 0.535, -0.18);
  const head = fixedPart(mat, geoCache, 'sp-head', 0.39, 0.28, 0.37, [0.095, 0.09, 0.12]);
  head.position.set(0, 0.36, 0.29);
  g.add(body, stripe, head);
  const legs = [];
  for (const side of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.25, 0.42, -0.32 + j * 0.2);
      const upper = fixedPart(mat, geoCache, 'sp-leg-upper', 0.35, 0.09, 0.085, [0.065, 0.065, 0.075]);
      upper.position.set(side * 0.17, 0.06, 0);
      upper.rotation.z = side * 0.38;
      const lower = fixedPart(mat, geoCache, 'sp-leg-lower', 0.34, 0.075, 0.075, [0.038, 0.038, 0.045]);
      lower.position.set(side * 0.48, -0.12, 0);
      lower.rotation.z = -side * 0.67;
      leg.add(upper, lower);
      g.add(leg);
      legs.push(leg);
    }
    for (let j = 0; j < 2; j++) {
      const eye = fixedPart(eyeMat, geoCache, 'sp-eye', 0.065, 0.065, 0.035, [1, 1, 1]);
      eye.position.set(side * (0.09 + j * 0.07), 0.38 + j * 0.075, 0.495);
      g.add(eye);
    }
  }
  return { group: g, legs, head: null, ears: [], hop: false, spider: true };
}

export class Mob {
  constructor(world, visuals, type, x, y, z) {
    this.world = world;
    this.v = visuals;
    this.type = type;            // 'bunny' | 'sheep' | 'slime' | 'bird' | 'gloom' | 'spider'
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
    this.speed = type === 'bunny' ? 2.2 : type === 'slime' ? 1.6 : type === 'gloom' ? 1.9 : type === 'spider' ? 2.3 : 1.1;
    this.hp = (type === 'gloom' || type === 'spider') ? 3 : 1;
    this.attackT = 0;
    this.flashT = 0;
    this.burnT = 0;
    this.dead = false;
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
      v.group.scale.set(0.72 * (1 + 0.25 * pulse), 0.72 * (1 - 0.22 * pulse), 0.72 * (1 + 0.25 * pulse));
      v.group.position.y += 0.12 * pulse;
    } else {
      v.group.rotation.x = 0;
      v.group.scale.setScalar(0.72);
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
    if (this.night && dist < 1.6 && this.attackT <= 0) {
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

  updateSpider(dt, playerPos) {
    this.animT += dt;
    const dx = playerPos.x - this.pos.x, dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const hunting = this.night && dist < 22;
    if (hunting) {
      this.heading = Math.atan2(dx, dz);
    } else {
      this.thinkT -= dt;
      if (this.thinkT <= 0) {
        this.heading += (Math.random() - 0.5) * 2;
        this.thinkT = 2 + Math.random() * 3;
      }
    }
    const move = hunting ? dist > 1.1 : Math.sin(this.animT * 0.7) > -0.3;
    if (move) {
      const nx = this.pos.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.pos.z + Math.cos(this.heading) * this.speed * dt;
      const g = this.groundAt(nx, nz, this.pos.y);
      if (g !== null && Math.abs(g - this.pos.y) < 1.1 &&
          !isLiquid(this.world.getBlock(Math.floor(nx), Math.floor(g - 0.01), Math.floor(nz)))) {
        this.pos.x = nx; this.pos.z = nz; this.yBase = g;
      } else this.heading += Math.PI * 0.7;
    }
    if (this.kbT > 0) {
      const step = Math.min(this.kbT, dt);
      this.kbT -= dt;
      this.pos.x += this.kbX * step;
      this.pos.z += this.kbZ * step;
    }
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 9);
    const v = this.v;
    v.group.position.set(this.pos.x, this.pos.y + Math.abs(Math.sin(this.animT * 8)) * 0.025, this.pos.z);
    v.group.rotation.y = this.heading;
    for (let i = 0; i < v.legs.length; i++) {
      const side = i < 4 ? -1 : 1;
      v.legs[i].rotation.y = move ? Math.sin(this.animT * 11 + i * Math.PI / 2) * 0.27 * side : 0;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    v.group.scale.setScalar(1 + this.flashT * 0.22);
    this.attackT -= dt;
    if (hunting && dist < 1.4 && this.attackT <= 0) {
      this.attackT = 1.4;
      this.onAttack?.(this, playerPos);
    }
  }

  knockback(dx, dz, power = 3.2) {
    const l = Math.hypot(dx, dz) || 1;
    this.kbX = (dx / l) * power;
    this.kbZ = (dz / l) * power;
    this.kbT = 0.18;
  }

  hurt(n) {
    this.hp -= n;
    this.flashT = 0.35;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
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

  // Высота поверхности под ногами; null — обрыв/вода (не идём)
  groundAt(x, z, fromY) {
    const y0 = Math.floor(fromY) + 1;
    for (let y = y0; y > y0 - 6; y--) {
      const b = this.world.getBlock(Math.floor(x), y, Math.floor(z));
      if (isSolid(b)) return y + blockBounds(b).maxY;
    }
    return null;
  }

  update(dt, playerPos) {
    // Птицы летают отдельно — без привязки к земле
    if (this.type === 'bird') return this.updateBird(dt, playerPos);
    if (this.type === 'gloom') return this.updateGloom(dt, playerPos);
    if (this.type === 'spider') return this.updateSpider(dt, playerPos);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.5 + Math.random() * 0.4;
      this.think(playerPos);
    }
    this.animT += dt;

    const v = this.v;
    let moveSpeed = 0;
    if (this.state === 'walk') moveSpeed = this.speed;
    else if (this.state === 'flee') moveSpeed = this.speed * 1.7;

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
    v.group.rotation.y = this.heading + Math.PI;

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
    v.group.rotation.y = this.heading + Math.PI;
    v.group.rotation.z = Math.sin(this.animT * 0.7) * 0.15; // крен в поворотах

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

// Спавним исключительно за пределами поля зрения (позади игрока) и не
// ближе минимального радиуса. yaw=0 означает взгляд по -Z.
export function isHiddenSpawn(playerPos, yaw, x, z, minDist = 18) {
  const dx = x - playerPos.x, dz = z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < minDist) return false;
  const forwardDot = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / dist;
  return forwardDot < -0.16;
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.geoCache = new Map();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.slimeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
    this.gloomMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0xff4242 });
    this.spawnT = 8;
    this.hostileT = 20;
    this.maxPassive = 10;
    this.maxHostile = 3;
    this.night = false;
    this.hostileEnabled = true;
    this.onSound = null;
    this.onAttack = null;
    this.onDeath = null; // только после убийства, не при исчезновении на рассвете
    this.onSpawn = null;
  }

  setLight(level) {
    const s = 0.32 + 0.68 * level;
    this.mat.color.setScalar(s);
    this.slimeMat.color.setScalar(s);
    this.gloomMat.color.setScalar(0.55 + 0.45 * level);
  }

  _randomType() {
    const r = Math.random();
    return r < 0.32 ? 'bunny' : r < 0.6 ? 'sheep' : r < 0.78 ? 'slime' : 'bird';
  }

  _buildVisuals(type) {
    const ci = (Math.random() * 3) | 0;
    if (type === 'bunny') return buildBunny(this.mat, this.geoCache, ci);
    if (type === 'sheep') return buildSheep(this.mat, this.geoCache, ci);
    if (type === 'gloom') return buildGloom(this.gloomMat, this.geoCache, this.eyeMat);
    if (type === 'spider') return buildSpider(this.mat, this.geoCache, this.eyeMat);
    if (type === 'bird') return buildBird(this.mat, this.geoCache, ci);
    return buildSlime(this.slimeMat, this.geoCache);
  }

  _addMob(type, x, y, z) {
    const visuals = this._buildVisuals(type);
    const mob = new Mob(this.world, visuals, type, x, y, z);
    mob.onSound = (k, d) => this.onSound?.(k, d);
    mob.onAttack = (m, pp) => this.onAttack?.(m, pp);
    this.scene.add(visuals.group);
    this.mobs.push(mob);
    this.onSpawn?.(mob);
    return mob;
  }

  _countHostile() { return this.mobs.filter((m) => m.type === 'gloom' || m.type === 'spider').length; }

  trySpawn(playerPos, yaw = 0) {
    if (this.mobs.length - this._countHostile() >= this.maxPassive) return null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 16;
      const x = playerPos.x + Math.sin(ang) * r, z = playerPos.z + Math.cos(ang) * r;
      if (!isHiddenSpawn(playerPos, yaw, x, z, 22)) continue;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      const type = this._randomType();
      if (type === 'bird') {
        if (h <= 2) continue;
        return this._addMob(type, x, Math.max(h + 7, this.world.seaLevel + 6) + Math.random() * 5, z);
      }
      if (h <= this.world.seaLevel + 1) continue;
      const ix = Math.floor(x), iz = Math.floor(z);
      const top = this.world.getBlock(ix, h, iz);
      if ((top !== BLOCK.GRASS && top !== BLOCK.SNOW) ||
          isSolid(this.world.getBlock(ix, h + 1, iz)) || isSolid(this.world.getBlock(ix, h + 2, iz))) continue;
      return this._addMob(type, ix + 0.5, h + 1, iz + 0.5);
    }
    return null;
  }

  setNight(n) { this.night = n; }

  _spawnHostile(type, playerPos, yaw) {
    if (!this.night || !this.hostileEnabled || this._countHostile() >= this.maxHostile) return null;
    for (let attempt = 0; attempt < 18; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 19 + Math.random() * 13;
      const x = playerPos.x + Math.sin(ang) * r, z = playerPos.z + Math.cos(ang) * r;
      if (!isHiddenSpawn(playerPos, yaw, x, z, 19)) continue;
      const ix = Math.floor(x), iz = Math.floor(z);
      const h = this.world.heightAt(ix, iz);
      if (h <= this.world.seaLevel || h + 2 >= this.world.worldHeight) continue;
      if (!isSolid(this.world.getBlock(ix, h, iz)) ||
          isSolid(this.world.getBlock(ix, h + 1, iz)) || isSolid(this.world.getBlock(ix, h + 2, iz))) continue;
      return this._addMob(type, ix + 0.5, h + 1, iz + 0.5);
    }
    return null;
  }

  trySpawnGloom(playerPos, yaw = 0) { return this._spawnHostile('gloom', playerPos, yaw); }
  trySpawnSpider(playerPos, yaw = 0) { return this._spawnHostile('spider', playerPos, yaw); }
  trySpawnHostile(playerPos, yaw = 0) {
    return Math.random() < 0.5 ? this.trySpawnGloom(playerPos, yaw) : this.trySpawnSpider(playerPos, yaw);
  }

  // Явный спавн для отладки/тестов не зависит от времени суток.
  spawnGloomAt(x, y, z) { return this._addMob('gloom', x, y, z); }
  spawnSpiderAt(x, y, z) { return this._addMob('spider', x, y, z); }

  update(dt, playerPos, yaw = 0, active = true) {
    if (active) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 12 + Math.random() * 10;
        this.trySpawn(playerPos, yaw);
      }
      if (this.night && this.hostileEnabled) {
        this.hostileT -= dt;
        if (this.hostileT <= 0) {
          this.hostileT = 20 + Math.random() * 15;
          this.trySpawnHostile(playerPos, yaw);
        }
      }
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs.splice(i, 1);
        m.dispose(this.scene);
        this.onDeath?.(m);
        continue;
      }
      if (m.type === 'gloom' && !this.night) {
        m.burnT += dt;
        if (m.burnT > 1.6) {
          this.onSound?.('burn', 3);
          m.dispose(this.scene);
          this.mobs.splice(i, 1);
          continue; // естественное исчезновение НЕ даёт опыта
        }
      }
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 64 * 64) {
        m.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }
      m.night = this.night && this.hostileEnabled && active;
      // Без движения игроков в меню враждебные мобы не атакуют.
      if (!active && (m.type === 'gloom' || m.type === 'spider')) continue;
      if (d2 > 32 * 32 && (this.spawnT * 3) % 2 > 1) continue;
      m.update(dt, playerPos);
    }
  }

  clear() {
    for (const m of this.mobs) m.dispose(this.scene);
    this.mobs.length = 0;
    this.spawnT = 8;
    this.hostileT = 20;
  }
}
