// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { isSolid, isOpaque, isDecor, BLOCK } from './src/blocks.js';
import { Inventory, ITEM, maxStack, dropFor, breakMult, defaultMode } from './src/inventory.js';
import { RECIPES, canCraft, craft } from './src/crafting.js';

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

// ---- Инвентарь ----
{
  check('inv: stack up to 64', (() => {
    const t = new Inventory();
    t.add(2, 40);
    t.add(2, 24);
    return t.count(2) === 64 && t.slots.filter((s) => s && s.id === 2).length === 1;
  })());
  check('inv: overflow goes to 2nd slot', (() => {
    const t = new Inventory();
    t.add(2, 64);
    t.add(2, 30);
    return t.slots.filter((s) => s && s.id === 2).length === 2 && t.count(2) === 94;
  })());
  check('inv: tools cannot stack in one slot', (() => {
    const t = new Inventory();
    t.add(ITEM.WOOD_PICK);
    t.add(ITEM.WOOD_PICK);
    return t.slots.filter((s) => s && s.id === ITEM.WOOD_PICK).every((s) => s.n === 1)
      && t.slots.filter((s) => s && s.id === ITEM.WOOD_PICK).length === 2;
  })());
  check('inv: remove across stacks', (() => {
    const t = new Inventory();
    t.add(2, 64);
    t.add(2, 30);
    t.remove(2, 65);
    return t.count(2) === 29;
  })());
  check('inv: serialize/load roundtrip', (() => {
    const a = new Inventory();
    a.add(6, 5); a.add(ITEM.STICK, 10); a.add(ITEM.WOOD_SWORD);
    const b = new Inventory();
    b.load(a.serialize());
    return b.count(6) === 5 && b.count(ITEM.STICK) === 10 && b.count(ITEM.WOOD_SWORD) === 1;
  })());
  check('inv: full inventory rejects', (() => {
    const t = new Inventory(2);
    t.add(ITEM.WOOD_PICK);
    t.add(ITEM.STONE_PICK);
    return t.add(ITEM.STONE_PICK) === false;
  })());
  check('maxStack: blocks 64, tools 1', maxStack(2) === 64 && maxStack(ITEM.WOOD_PICK) === 1 && maxStack(ITEM.APPLE) === 64);
}

// ---- Дропы выживания ----
check('drop: grass -> dirt', dropFor(BLOCK.GRASS) === BLOCK.DIRT);
check('drop: stone -> cobble', dropFor(BLOCK.STONE) === BLOCK.COBBLE);
check('drop: glass -> nothing', dropFor(BLOCK.GLASS) === null);
check('drop: leaves sometimes -> leaves', (() => {
  let got = 0;
  for (let i = 0; i < 300; i++) if (dropFor(BLOCK.LEAVES) === BLOCK.LEAVES) got++;
  return got > 0 && got < 300;
})());
check('drop: other blocks drop themselves', dropFor(BLOCK.SAND) === BLOCK.SAND && dropFor(BLOCK.BRICK) === BLOCK.BRICK);

// ---- Инструменты: множители ломания ----
check('tool: stone no pick x2.6', breakMult(null, BLOCK.STONE) === 2.6);
check('tool: stone wood pick x0.85', breakMult(ITEM.WOOD_PICK, BLOCK.STONE) === 0.85);
check('tool: stone stone pick x0.55', breakMult(ITEM.STONE_PICK, BLOCK.STONE) === 0.55);
check('tool: log axe x0.5', breakMult(ITEM.WOOD_AXE, BLOCK.LOG) === 0.5);
check('tool: log no axe x1.6', breakMult(null, BLOCK.LOG) === 1.6);
check('tool: sword gives no speed', breakMult(ITEM.STONE_SWORD, BLOCK.LOG) === 1.6);
check('tool: dirt unaffected', breakMult(ITEM.STONE_PICK, BLOCK.DIRT) === 1);

// ---- Режим по сохранению ----
check('mode: old save (no mode) -> creative', defaultMode({ v: 1 }) === 'creative');
check('mode: survival kept', defaultMode({ mode: 'survival' }) === 'survival');
check('mode: creative kept', defaultMode({ mode: 'creative' }) === 'creative');
check('mode: null save -> creative', defaultMode(null) === 'creative');

// ---- Крафт ----
{
  const inv = new Inventory();
  const planks = RECIPES.find((r) => r.out.id === BLOCK.PLANKS);
  const sticks = RECIPES.find((r) => r.out.id === ITEM.STICK);
  const woodPick = RECIPES.find((r) => r.out.id === ITEM.WOOD_PICK);
  const stonePick = RECIPES.find((r) => r.out.id === ITEM.STONE_PICK);
  const glow = RECIPES.find((r) => r.out.id === BLOCK.GLOW);
  check('craft: recipe list complete', RECIPES.length === 13);
  check('craft: locked without mats', !canCraft(inv, planks));
  inv.add(BLOCK.LOG, 1);
  check('craft: log -> 4 planks', canCraft(inv, planks) && craft(inv, planks)
    && inv.count(BLOCK.PLANKS) === 4 && inv.count(BLOCK.LOG) === 0);
  check('craft: 2 planks -> 4 sticks', craft(inv, sticks) && inv.count(ITEM.STICK) === 4 && inv.count(BLOCK.PLANKS) === 2);
  inv.add(BLOCK.PLANKS, 3);
  check('craft: 3 planks + 2 sticks -> wood pick', craft(inv, woodPick) && inv.count(ITEM.WOOD_PICK) === 1);
  inv.add(BLOCK.COBBLE, 3);
  check('craft: 3 cobble + 2 sticks -> stone pick', craft(inv, stonePick) && inv.count(ITEM.STONE_PICK) === 1);
  inv.add(BLOCK.COBBLE, 1); inv.add(BLOCK.LEAVES, 1); inv.add(ITEM.STICK, 1);
  check('craft: cobble + stick + leaves -> 2 glow', craft(inv, glow) && inv.count(BLOCK.GLOW) === 2);
  check('craft: not twice without mats', !canCraft(inv, glow));
  // Крафт при полном инвентаре не должен терять ингредиенты
  const tiny = new Inventory(1);
  tiny.add(BLOCK.LOG, 64);
  const r2 = { out: { id: BLOCK.PLANKS, n: 4 }, in: [{ id: BLOCK.LOG, n: 1 }] };
  check('craft: full inv keeps materials', craft(tiny, r2) === false && tiny.count(BLOCK.LOG) === 64);
}

// Разметка: кнопка «К спавну», слой молний, экраны режимов и инвентарь
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
check('btn-home + lightning in markup', html.includes('id="btn-home"') && html.includes('id="lightning"'));
check('mode screen + buttons in markup', html.includes('id="mode-screen"')
  && html.includes('id="btn-mode-survival"') && html.includes('id="btn-mode-creative"')
  && html.includes('id="btn-mode-back"'));
check('inventory screen in markup', html.includes('id="inventory-screen"')
  && html.includes('id="inv-grid"') && html.includes('id="inv-list"') && html.includes('id="item-cursor"'));
check('mobile inventory button', html.includes('id="btn-inventory"'));

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);