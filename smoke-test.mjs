// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { isSolid, isOpaque, isDecor } from './src/blocks.js';

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

// ---- Декоративная трава ----
const wd = new World(987654);
let decorCount = 0;
for (let cz = -2; cz <= 2; cz++) {
  for (let cx = -2; cx <= 2; cx++) {
    const c = wd.getChunk(cx, cz);
    for (const v of c.blocks) if (v >= 15 && v <= 19) decorCount++;
  }
}
check('decor (grass/flowers) generated', decorCount > 5);

// Крестовый меш: +8 вершин и +24 индекса на один декор-блок
const meshA = meshChunk(THREE, wd, 0, 0).opaque;
wd.setBlock(2, 60, 2, 15); // трава гарантированно в воздухе
const meshB = meshChunk(THREE, wd, 0, 0).opaque;
check('decor meshed as cross quads', (() => {
  const dv = meshB.pos.length - meshA.pos.length;
  const di = meshB.idx.length - meshA.idx.length;
  return dv === 8 * 3 && di === 24;
})());

// Декор непроходим и не непрозрачен
check('decor is walk-through', isDecor(15) && !isSolid(15) && !isOpaque(15));

// ---- Мобы смотрят туда, куда идут (не бегут задом наперёд) ----
{
  const mobs = await import('./src/mobs.js');
  const THREE = await import('three');
  const flat = { getBlock: (x, y) => (y <= 30 ? 1 : 0), seaLevel: 22, heightAt: () => 30 };
  const visuals = { group: new THREE.Group(), legs: [], head: null, ears: [], hop: true };
  const mob = new mobs.Mob(flat, visuals, 'bunny', 0.5, 31, 0.5);
  mob.state = 'walk';
  mob.thinkT = 1e9;                 // курс не перебивается «мыслями»
  mob.heading = 0.7;
  const x0 = mob.pos.x, z0 = mob.pos.z;
  mob.update(0.5, { x: 60, y: 31, z: 60 });
  const mx = mob.pos.x - x0, mz = mob.pos.z - z0;
  const fwd = new THREE.Vector3(0, 0, 1).applyEuler(visuals.group.rotation);
  check('mob moved', Math.hypot(mx, mz) > 0.1);
  check('mob faces its movement direction', mx * fwd.x + mz * fwd.z > 0.1);
  check('mob forward is horizontal', Math.abs(fwd.y) < 1e-6);
}

// ---- Стрелы: полёт, попадание в блок, подбор ----
{
  const proj = await import('./src/projectiles.js');
  const scene = { add() {}, remove() {} };
  const arrows = new proj.Arrows(scene);
  const wallWorld = { getBlock: (x) => (x >= 3 ? 3 : 0) };
  let stuck = null, picked = 0, hitMob = null;
  const cb = { onBlock: (a) => { stuck = a; }, onPickup: (n) => { picked += n; } };
  arrows.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, cb);
  for (let i = 0; i < 120 && !stuck; i++) arrows.update(1 / 60, wallWorld, [], null);
  check('arrow reaches the wall', !!stuck);
  check('arrow does not sink into the block', !!stuck && Math.floor(stuck.group.position.x) < 3);
  if (stuck) {
    arrows.update(1 / 60, wallWorld, [], stuck.group.position);
    check('stuck arrow is picked up by the player', picked === 1);
  }

  const arrows2 = new proj.Arrows(scene);
  const mob = { pos: { x: 2, y: 10, z: 0.5 }, dead: false };
  arrows2.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, { onMob: (m) => { hitMob = m; } });
  for (let i = 0; i < 120 && !hitMob; i++) arrows2.update(1 / 60, wallWorld, [mob], null);
  check('arrow hits a mob in flight', hitMob === mob);
}

// Разметка: кнопка «К спавну» и слой молний
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
check('btn-home + lightning in markup', html.includes('id="btn-home"') && html.includes('id="lightning"'));
check('arrow counter + fullscreen toggle in markup', html.includes('id="arrows"') && html.includes('id="set-fullscreen"'));

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);