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
    this.speed = type === 'bunny' ? 2.2 : type === 'slime' ? 1.6 : 1.1;
    visuals.group.position.set(x, y, z);
    this.yBase = y;
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
      if (isSolid(b)) return y + 1;
    }
    return null;
  }

  update(dt, playerPos) {
    // Птицы летают отдельно — без привязки к земле
    if (this.type === 'bird') return this.updateBird(dt, playerPos);

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

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.geoCache = new Map();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.slimeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
    this.spawnT = 0;
    this.max = 10;
    this.onHop = null; // (dist) => void — звук
  }

  setLight(level) {
    const s = 0.32 + 0.68 * level;
    this.mat.color.setScalar(s);
    this.slimeMat.color.setScalar(s);
  }

  _randomType() {
    const r = Math.random();
    return r < 0.32 ? 'bunny' : r < 0.6 ? 'sheep' : r < 0.78 ? 'slime' : 'bird';
  }

  _buildVisuals(type) {
    const ci = (Math.random() * 3) | 0;
    if (type === 'bunny') return buildBunny(this.mat, this.geoCache, ci);
    if (type === 'sheep') return buildSheep(this.mat, this.geoCache, ci);
    if (type === 'bird') return buildBird(this.mat, this.geoCache, ci);
    return buildSlime(this.slimeMat, this.geoCache);
  }

  trySpawn(playerPos) {
    if (this.mobs.length >= this.max) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 18;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      const type = this._randomType();

      // Птицы — в небе над любой поверхностью
      if (type === 'bird') {
        if (h <= 2) continue;
        const visuals = this._buildVisuals(type);
        const mob = new Mob(this.world, visuals, type, x, Math.max(h + 7, this.world.seaLevel + 6) + Math.random() * 5, z);
        mob.onSound = this.onSound;
        this.scene.add(visuals.group);
        this.mobs.push(mob);
        return;
      }

      if (h <= this.world.seaLevel + 1) continue;
      // Проверяем настоящий блок сверху
      const top = this.world.getBlock(Math.floor(x), h, Math.floor(z));
      const above = this.world.getBlock(Math.floor(x), h + 1, Math.floor(z));
      const above2 = this.world.getBlock(Math.floor(x), h + 2, Math.floor(z));
      if ((top !== BLOCK.GRASS && top !== BLOCK.SNOW) || above !== BLOCK.AIR || above2 !== BLOCK.AIR) continue;
      const visuals = this._buildVisuals(type);
      const mob = new Mob(this.world, visuals, type, x + 0.5, h + 1, z + 0.5);
      mob.onSound = this.onSound;
      this.scene.add(visuals.group);
      this.mobs.push(mob);
      return;
    }
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
