// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { Mobs } from './src/mobs.js';
import { BLOCK, isSolid, isPlant, BLOCKS } from './src/blocks.js';

// Заглушка THREE — достаточно для toGeometry
const calls = { geom: 0, verts: 0, idx: 0 };
const THREE = {
  BufferGeometry: class {
    constructor() { calls.geom++; }
    setAttribute() {}
    setIndex() {}
    computeBoundingSphere() {}
  },
  Float32BufferAttribute: class {
    constructor(arr, sz) {
      calls.verts += sz === 3 ? arr.length / 3 : 0;
      this.arr = arr;
    }
  },
};

let failed = 0;
function check(name, cond) {
  if (cond) console.log('OK  ', name);
  else { console.log('FAIL', name); failed++; }
}

const world = new World(12345);

// Генерация чанков
const c0 = world.getChunk(0, 0);
check('chunk generated', c0.generated);
check('chunk has surface', c0.blocks.some((v) => v === 1 || v === 5 || v === 12)); // grass/sand/snow
check('chunk has stone', c0.blocks.includes(3));
check('water fills somewhere near sea', c0.blocks.includes(13) || world.heightAt(3, 3) > 22);

// Высоты детерминированы
check('heightAt deterministic', world.heightAt(10, -20) === world.heightAt(10, -20));
check('heightAt in bounds', (() => {
  for (let i = 0; i < 500; i++) {
    const h = world.heightAt((i * 37) % 1000, (i * 91) % 1000);
    if (h < 3 || h > 58) return false;
  }
  return true;
})());

// Блоки: get/set и правки
const h = world.heightAt(0, 0);
const before = world.getBlock(0, h, 0);
check('setBlock works', world.setBlock(0, h + 2, 0, 10));
check('getBlock after set', world.getBlock(0, h + 2, 0) === 10);
check('edit recorded', world.edits.has(`0,${h + 2},0`));

// Пересоздание чанка воспроизводит правки
world.chunks.delete('0,0');
const c0b = world.getChunk(0, 0);
check('edit survives regen', c0b.get(0, h + 2, 0) === 10);

// Спавн
const spawn = world.findSpawn();
check('spawn above water', spawn.y > 22);

// Сериализация правок
const ser = world.serializeEdits();
const world2 = new World(12345);
world2.loadEdits(ser);
check('edits roundtrip', world2.getBlock(0, h + 2, 0) === 10);

// Мешер
const { opaque, water } = meshChunk(THREE, world2, 0, 0);
check('opaque mesh non-empty', opaque.pos.length > 0 && opaque.idx.length > 0);
check('mesh indices valid', (() => {
  const nVerts = opaque.pos.length / 3;
  for (const i of opaque.idx) if (i < 0 || i >= nVerts) return false;
  return true;
})());
check('uv count matches', opaque.uv.length / 2 === opaque.pos.length / 3);
check('color count matches', opaque.col.length === opaque.pos.length);
check('triangles in groups of 3', opaque.idx.length % 3 === 0);
check('no NaN in positions', !opaque.pos.some((v) => Number.isNaN(v)));
check('shades in range', opaque.col.every((v) => v >= 0.2 && v <= 1.001));

const g = opaque.toGeometry(THREE);
check('toGeometry ok', !!g);

// Вода строится отдельно
check('water builder exists', !!water);

// AO: блок в углу должен делать вершину темнее — сравним две вершины
check('AO varies (some dark, some bright)', (() => {
  let mn = 2, mx = -1;
  for (const v of opaque.col) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return mx - mn > 0.1;
})());

// Обход треугольников: нормали верхних граней должны смотреть вверх
check('winding: up-facing triangles dominate', (() => {
  let up = 0, down = 0;
  for (let t = 0; t < opaque.idx.length; t += 3) {
    const i0 = opaque.idx[t], i1 = opaque.idx[t + 1], i2 = opaque.idx[t + 2];
    const p0 = opaque.pos.slice(i0 * 3, i0 * 3 + 3);
    const p1 = opaque.pos.slice(i1 * 3, i1 * 3 + 3);
    const p2 = opaque.pos.slice(i2 * 3, i2 * 3 + 3);
    const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const b = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const ny = a[2] * b[0] - a[0] * b[2]; // компонента y у (a x b)
    if (ny > 0.5) up++;
    if (ny < -0.5) down++;
  }
  return up > 100 && up > down * 2;
})());

// Рейкаст: взгляд сверху вниз попадает в блок с нормалью +Y
check('raycast hits block top with +Y normal', (() => {
  const h = world2.heightAt(2, 2);
  const hit = raycastVoxel(world2, 2.5, h + 3.5, 2.5, 0, -1, 0, 6);
  return !!hit && hit.y === h && hit.ny === 1 && hit.x === 2 && hit.z === 2;
})());
check('raycast misses up to sky', (() => {
  const h = world2.heightAt(2, 2);
  return raycastVoxel(world2, 2.5, h + 3.5, 2.5, 0, 1, 0, 6) === null;
})());

// ---------------- Растения ----------------
check('plants: non-solid, flagged', (() => {
  return !isSolid(BLOCK.GRASS_TALL) && isPlant(BLOCK.GRASS_TALL) &&
    isPlant(BLOCK.FLOWER_RED) && isPlant(BLOCK.FLOWER_YELLOW) &&
    !isPlant(BLOCK.GRASS) && BLOCKS[BLOCK.GRASS_TALL].break === 'instant';
})());

check('plants generate on grass', (() => {
  let plants = 0;
  for (let cz = -3; cz <= 3; cz++) {
    for (let cx = -3; cx <= 3; cx++) {
      const c = world2.getChunk(cx, cz);
      for (const v of c.blocks) if (v === BLOCK.GRASS_TALL || v === BLOCK.FLOWER_RED || v === BLOCK.FLOWER_YELLOW) plants++;
    }
  }
  return plants > 20;
})());

check('plants produce cross geometry', (() => {
  // Ставим растение в воздух и замешиваем чанк
  const h = world2.heightAt(4, 4);
  world2.setBlock(4, h + 2, 4, BLOCK.GRASS_TALL);
  const { opaque } = meshChunk(THREE, world2, 0, 0);
  const beforeVerts = opaque.pos.length / 3;
  const beforeIdx = opaque.idx.length;
  world2.setBlock(4, h + 2, 4, BLOCK.AIR);
  const after = meshChunk(THREE, world2, 0, 0).opaque;
  // Крест: 2 плоскости × 4 вершины = 8 вершин; индексы ×2 стороны ×2 диагонали-пары = 24
  return beforeVerts - after.pos.length / 3 === 8 && beforeIdx - after.idx.length === 24;
})());

// ---------------- Мобы ----------------
check('mobs: spawn, hit detection, flee', (() => {
  // Минимальная заглушка THREE для работы моделей
  class Color {
    constructor(h) { this.h = h; }
    copy() { return this; }
    multiplyScalar() { return this; }
  }
  class Obj3d {
    constructor() {
      this.children = [];
      this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => { this.position.x = x; this.position.y = y; this.position.z = z; } };
      this.rotation = { x: 0, y: 0, z: 0 };
    }
    add(o) { this.children.push(o); }
    remove(o) { this.children = this.children.filter((c) => c !== o); }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse ? c.traverse(fn) : fn(c); }
  }
  class Mesh extends Obj3d {
    constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; }
  }
  class Material {
    constructor(o = {}) { this.color = new Color(o.color); }
    dispose() {}
  }
  class Geometry { dispose() {} }
  const T3 = {
    Group: Obj3d, Mesh, BoxGeometry: Geometry,
    MeshBasicMaterial: Material, Color,
  };

  const scene = { add() {}, remove() {} };
  const mobs = new Mobs(T3, scene, world2);
  const sea = world2.seaLevel;

  // Ищем сушу и спавним кабана там
  const spawn = world2.findSpawn();
  const mob = mobs.add('boar', spawn.x, spawn.y, spawn.z);
  if (!mob || mobs.list.length !== 1) return false;

  // columnInfo под ним: земля
  const info = mobs.columnInfo(spawn.x, spawn.z);
  if (info.water || info.groundY < sea) return false;

  // Попадание сверху по мобу
  const eye = { x: spawn.x, y: spawn.y + 2, z: spawn.z + 0.01 };
  const hitDown = mobs.tryHit(eye, { x: 0, y: -1, z: 0 }, 6);
  if (!hitDown || hitDown.mob !== mob) return false;

  // Промах в небо
  const miss = mobs.tryHit(eye, { x: 0, y: 1, z: 0 }, 6);
  if (miss) return false;

  // Удар — испуг
  mobs.hit(mob, { x: spawn.x, y: spawn.y, z: spawn.z + 3 }, null);
  if (mob.flee <= 0 || mob.mode !== 'flee') return false;

  // Обновление двигает кабана при испуге
  const x0 = mob.pos.x, z0 = mob.pos.z;
  mobs.update(0.1, { x: spawn.x, y: spawn.y, z: spawn.z + 3 }, 1);
  const moved = Math.hypot(mob.pos.x - x0, mob.pos.z - z0) > 0.01;
  if (!moved) return false;

  // Птица летает
  const bird = mobs.add('bird', spawn.x, spawn.y + 6, spawn.z);
  const by0 = bird.pos.y;
  bird.flee = 1;
  mobs.update(0.2, spawn, 1);
  return mobs.list.length === 2;
})());

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);