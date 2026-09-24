// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { isSolid, isOpaque, isDecor, BLOCK } from './src/blocks.js';
import { Inventory } from './src/inventory.js';
import { RECIPES, craft, canCraft, validateRecipes } from './src/crafts.js';
import { ITEM, blockItem, blockDropItem, breakTime, itemDamage, maxStack, placeBlockId, toolKind } from './src/items.js';
import { CONFIG } from './src/config.js';

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

// ---- Предметы и дроп с блоков ----
check('трава падает землёй', blockDropItem(BLOCK.GRASS) === blockItem(BLOCK.DIRT));
check('камень падает булыжником', blockDropItem(BLOCK.STONE) === blockItem(BLOCK.COBBLE));
check('стекло не даёт ничего', blockDropItem(BLOCK.GLASS) === null);
check('вода не даёт ничего', blockDropItem(BLOCK.WATER) === null);
check('песок падает песком', blockDropItem(BLOCK.SAND) === blockItem(BLOCK.SAND));
check('листва падает иногда', (() => {
  let yes = 0;
  for (let i = 0; i < 400; i++) if (blockDropItem(BLOCK.LEAVES, () => i % 4 === 0)) yes++;
  return yes > 0 && yes < 400;
})());
check('стопки: блок 64, инструмент 1', maxStack(blockItem(BLOCK.STONE)) === 64 && maxStack(ITEM.WOOD_AXE) === 1);
check('поставить можно только блок', placeBlockId(blockItem(BLOCK.PLANKS)) === BLOCK.PLANKS
  && placeBlockId(ITEM.STICK) === 0);
check('инструмент опознаётся', toolKind(ITEM.STONE_PICKAXE) === 'pickaxe' && toolKind(ITEM.STICK) === null);

// ---- Скорость ломания с инструментами ----
const BASE_STONE = CONFIG.BREAK_TIME.slow;
const BASE_LOG = CONFIG.BREAK_TIME.default;
check('камень без кирки ×2.6', Math.abs(breakTime(BLOCK.STONE, null, 'survival') - BASE_STONE * 2.6) < 1e-9);
check('деревянная кирка ×0.85', Math.abs(breakTime(BLOCK.STONE, ITEM.WOOD_PICKAXE, 'survival') - BASE_STONE * 0.85) < 1e-9);
check('каменная кирка ×0.55', Math.abs(breakTime(BLOCK.STONE, ITEM.STONE_PICKAXE, 'survival') - BASE_STONE * 0.55) < 1e-9);
check('дерево без топора ×1.6', Math.abs(breakTime(BLOCK.LOG, null, 'survival') - BASE_LOG * 1.6) < 1e-9);
check('топор ускоряет дерево ×0.5', Math.abs(breakTime(BLOCK.LOG, ITEM.WOOD_AXE, 'survival') - BASE_LOG * 0.5) < 1e-9);
check('земля ломается как раньше', Math.abs(breakTime(BLOCK.DIRT, null, 'survival') - CONFIG.BREAK_TIME.fast) < 1e-9);
check('креатив: блок ломается за 0.12 с',
  breakTime(BLOCK.STONE, null, 'creative') === CONFIG.CREATIVE_BREAK_TIME && CONFIG.CREATIVE_BREAK_TIME === 0.12);
check('урон: рука 1, деревянный меч 2, каменный 3',
  itemDamage(null) === 1 && itemDamage(ITEM.WOOD_SWORD) === 2 && itemDamage(ITEM.STONE_SWORD) === 3);

// ---- Инвентарь: 36 ячеек, стопки до 64 ----
const inv = new Inventory(CONFIG.INV_SIZE);
check('инвентарь: 36 ячеек, первые 9 — хотбар', inv.size === 36 && CONFIG.HOTBAR_SIZE === 9);
check('добавление с переносом в новые стопки', inv.add(blockItem(BLOCK.DIRT), 70) === 0
  && inv.count(blockItem(BLOCK.DIRT)) === 70 && inv.get(0).count === 64 && inv.get(1).count === 6);
check('инструменты не складываются в стопку', inv.add(ITEM.WOOD_AXE, 2) === 0 && inv.get(2).count === 1 && inv.get(3).count === 1);
check('удаление предметов', inv.remove(blockItem(BLOCK.DIRT), 70) && inv.count(blockItem(BLOCK.DIRT)) === 0);
check('удаление больше, чем есть — не проходит', inv.remove(blockItem(BLOCK.DIRT), 1) === false);
check('сериализация инвентаря крутится без потерь', (() => {
  const a = new Inventory(CONFIG.INV_SIZE);
  a.setStack(5, { key: blockItem(BLOCK.GLASS), count: 12 });
  a.setStack(20, { key: ITEM.STONE_SWORD, count: 1 });
  const b = new Inventory(CONFIG.INV_SIZE);
  b.deserialize(a.serialize());
  return b.get(5).count === 12 && b.get(20).key === ITEM.STONE_SWORD && b.get(0) === null;
})());
check('инвентарь полон → лишнее не влезает', (() => {
  const full = new Inventory(CONFIG.INV_SIZE);
  for (let i = 0; i < full.size; i++) full.setStack(i, { key: blockItem(BLOCK.STONE), count: 64 });
  return full.add(blockItem(BLOCK.STONE), 5) === 5;
})());

// ---- Крафт ----
check('рецепты без ошибок', validateRecipes().length === 0, validateRecipes().join('; '));
check('13 рецептов', RECIPES.length === 13, 'их ' + RECIPES.length);
function craftWith(input, id) {
  const i = new Inventory(CONFIG.INV_SIZE);
  for (const [k, n] of Object.entries(input)) i.add(k, n);
  const recipe = RECIPES.find((r) => r.id === id);
  const res = craft(i, recipe);
  return { res, i };
}
const r1 = craftWith({ [blockItem(BLOCK.LOG)]: 1 }, 'planks');
check('бревно → 4 доски', r1.res === 'ok' && r1.i.count(blockItem(BLOCK.PLANKS)) === 4 && r1.i.count(blockItem(BLOCK.LOG)) === 0);
const r2 = craftWith({ [blockItem(BLOCK.PLANKS)]: 2 }, 'sticks');
check('2 доски → 4 палки', r2.res === 'ok' && r2.i.count(ITEM.STICK) === 4);
const r3 = craftWith({ [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, 'wood_pickaxe');
check('3 доски + 2 палки → деревянная кирка', r3.res === 'ok' && r3.i.count(ITEM.WOOD_PICKAXE) === 1
  && r3.i.count(blockItem(BLOCK.PLANKS)) === 0 && r3.i.count(ITEM.STICK) === 0);
check('3 доски + 2 палки → деревянный топор', craftWith({ [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, 'wood_axe').i.count(ITEM.WOOD_AXE) === 1);
check('2 доски + палка → деревянный меч', craftWith({ [blockItem(BLOCK.PLANKS)]: 2, [ITEM.STICK]: 1 }, 'wood_sword').i.count(ITEM.WOOD_SWORD) === 1);
check('3 булыжника + 2 палки → каменная кирка', craftWith({ [blockItem(BLOCK.COBBLE)]: 3, [ITEM.STICK]: 2 }, 'stone_pickaxe').i.count(ITEM.STONE_PICKAXE) === 1);
check('2 булыжника + палка → каменный меч', craftWith({ [blockItem(BLOCK.COBBLE)]: 2, [ITEM.STICK]: 1 }, 'stone_sword').i.count(ITEM.STONE_SWORD) === 1);
check('2 песка → стекло', craftWith({ [blockItem(BLOCK.SAND)]: 2 }, 'glass').i.count(blockItem(BLOCK.GLASS)) === 1);
check('2 булыжника + 2 песка → 2 кирпича', craftWith({ [blockItem(BLOCK.COBBLE)]: 2, [blockItem(BLOCK.SAND)]: 2 }, 'brick').i.count(blockItem(BLOCK.BRICK)) === 2);
check('2 булыжника → камень', craftWith({ [blockItem(BLOCK.COBBLE)]: 2 }, 'stone').i.count(blockItem(BLOCK.STONE)) === 1);
check('2 камня → 2 сланца', craftWith({ [blockItem(BLOCK.STONE)]: 2 }, 'slate').i.count(blockItem(BLOCK.SLATE)) === 2);
check('булыжник + палка + листва → 2 светокамня',
  craftWith({ [blockItem(BLOCK.COBBLE)]: 1, [ITEM.STICK]: 1, [blockItem(BLOCK.LEAVES)]: 1 }, 'glow').i.count(blockItem(BLOCK.GLOW)) === 2);
check('песок + земля → снег', craftWith({ [blockItem(BLOCK.SAND)]: 1, [blockItem(BLOCK.DIRT)]: 1 }, 'snow').i.count(blockItem(BLOCK.SNOW)) === 1);
check('без ресурсов крафт не проходит', craftWith({}, 'planks').res === 'missing');
check('ресурсы не списываются при нехватке', (() => {
  const { i } = craftWith({ [blockItem(BLOCK.LOG)]: 1 }, 'planks');
  const before = i.count(blockItem(BLOCK.LOG));
  const recipe = RECIPES.find((r) => r.id === 'planks');
  craft(i, recipe);
  return i.count(blockItem(BLOCK.LOG)) === before;
})());
check('недоступный рецепт не проходит проверку доступности', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  return !canCraft(i, RECIPES.find((r) => r.id === 'stone_pickaxe'));
})());

// Разметка: кнопка «К спавну» и слой молний
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
check('btn-home + lightning in markup', html.includes('id="btn-home"') && html.includes('id="lightning"'));
check('разметка: выбор режима, инвентарь, рюкзак', html.includes('id="mode-screen"')
  && html.includes('id="inventory-screen"') && html.includes('id="btn-bag"')
  && html.includes('id="cursor-item"') && html.includes('id="inv-hotbar-row"'));

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);