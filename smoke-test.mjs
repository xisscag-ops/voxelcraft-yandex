// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { isSolid, isOpaque, isDecor, BLOCK } from './src/blocks.js';
import { Inventory } from './src/inventory.js';
import {
  RECIPES, craft, canCraft, validateRecipes, emptyGrid, matchRecipe, gridResult,
  craftFromGrid, needsTable, recipeGridSize,
} from './src/crafts.js';
import { ITEM, itemDef, foodValue, isFood, blockItem, blockDropItem, breakTime, itemDamage, maxStack, placeBlockId, toolKind } from './src/items.js';
import { CONFIG } from './src/config.js';
import { STRINGS } from './src/i18n.js';

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

// Обход треугольников: нормали верхних граней должны смотреть вверх.
// Пещеры дают законные «потолочные» грани, поэтому верхних должно быть заметно больше,
// но не обязательно вдвое.
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
  return up > 100 && up > down * 1.3;
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

// ---- Пещеры: полости под землёй, входы с поверхности, натёки ----
{
  const cw = new World(4242);
  const S = CONFIG.CHUNK_SIZE, SEA = CONFIG.SEA_LEVEL;
  let columns = 0, hollow = 0, deepHollow = 0, mouths = 0, spikes = 0;
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      const c = cw.getChunk(cx, cz);
      const ox = cx * S, oz = cz * S;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const h = cw.heightAt(ox + x, oz + z);
          columns++;
          let top = -1;
          for (let y = 4; y < h; y++) {
            const b = c.get(x, y, z);
            if (b === BLOCK.AIR) { hollow++; if (top < y) top = y; }
            if (y <= h - 9) {
              // считаем сквозные полости на глубине
              if (b === BLOCK.AIR && deepHollow < columns * 4) deepHollow++;
            }
            if (b === BLOCK.SLATE && c.get(x, y + 1, z) === BLOCK.AIR) spikes++;
          }
          if (h > SEA + 2 && c.get(x, h - 1, z) === BLOCK.AIR && c.get(x, h - 2, z) === BLOCK.AIR) mouths++;
        }
      }
    }
  }
  const airShare = hollow / columns;
  check('пещеры: под землёй есть полости', airShare > 0.05, 'их ' + (airShare * 100).toFixed(1) + '% высоты колонок');
  check('пещеры: воздух распределён по глубине', deepHollow > 200, 'считано ' + deepHollow);
  check('пещеры: есть входы с поверхности', mouths >= 2, 'входов ' + mouths + ' на ' + columns + ' колонок');
  check('пещеры: в залах есть натёки из сланца', spikes > 10, 'натёков ' + spikes);

  // Пещеры детерминированы: тот же сид — тот же мир
  const cw2 = new World(4242);
  let same = true;
  for (let y = 4; y < 30 && same; y++) {
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (cw.getBlock(x, y, z) !== cw2.getBlock(x, y, z)) { same = false; break; }
      }
    }
  }
  check('пещеры: генерация детерминирована', same);
}

// ---- Декоративная трава ----
// Мир состоит из биомов (пустыни, горы, снег), поэтому травяные участки ищем
// на площадке пошире — в радиусе 6 чанков они точно есть
const wd = new World(987654);
let decorCount = 0;
for (let cz = -6; cz <= 6; cz++) {
  for (let cx = -6; cx <= 6; cx++) {
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
check('16 рецептов (включая верстак, лук и стрелы)', RECIPES.length === 16, 'их ' + RECIPES.length);
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

// ---- Сетка крафта ----
function grid2(pairs) {
  const g = emptyGrid(2);
  for (const [i, key, n] of pairs) g[i] = { key, count: n ?? 1 };
  return g;
}
function grid3(pairs) {
  const g = emptyGrid(3);
  for (const [i, key, n] of pairs) g[i] = { key, count: n ?? 1 };
  return g;
}
check('сетка 2×2: бревно → доски', gridResult(grid2([[0, blockItem(BLOCK.LOG)]]), 2)?.out.key === blockItem(BLOCK.PLANKS));
check('сетка 2×2: 2 доски столбиком → палки',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)]]), 2)?.out.key === ITEM.STICK);
check('сетка 2×2: 2 доски в ряд — не рецепт',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)]]), 2) === null);
check('сетка 2×2: 4 доски → верстак',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)],
    [2, blockItem(BLOCK.PLANKS)], [3, blockItem(BLOCK.PLANKS)]]), 2)?.out.key === blockItem(BLOCK.TABLE));
check('верстак нужен для 3×3 рецептов', needsTable(RECIPES.find((r) => r.id === 'wood_pickaxe'))
  && recipeGridSize(RECIPES.find((r) => r.id === 'wood_pickaxe')) === 3
  && !needsTable(RECIPES.find((r) => r.id === 'planks')));
check('сетка 3×3: кирка (3 доски + 2 палки)',
  gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)],
    [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_PICKAXE);
check('сетка 2×2 не собирает кирку (нужен верстак)',
  gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)],
    [4, ITEM.STICK], [7, ITEM.STICK]]).slice(0, 4), 2) === null);
check('сетка 3×3: топор', gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)],
  [3, blockItem(BLOCK.PLANKS)], [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_AXE);
check('сетка 3×3: меч', gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [3, blockItem(BLOCK.PLANKS)],
  [6, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_SWORD);
check('сетка 3×3: кирка из булыжника', gridResult(grid3([[0, blockItem(BLOCK.COBBLE)], [1, blockItem(BLOCK.COBBLE)],
  [2, blockItem(BLOCK.COBBLE)], [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.STONE_PICKAXE);
check('лишний предмет в сетке ломает рецепт',
  gridResult(grid2([[0, blockItem(BLOCK.LOG)], [3, blockItem(BLOCK.SAND)]]), 2) === null);
check('бесформенные рецепты (светокамень)', gridResult(grid2([
  [0, blockItem(BLOCK.COBBLE)], [1, ITEM.STICK], [2, blockItem(BLOCK.LEAVES)]]), 2)?.out.count === 2);
check('крафт из сетки тратит по одному предмету', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  const g = grid2([[0, blockItem(BLOCK.LOG), 3]]);
  const res = craftFromGrid(g, 2, i);
  return res === 'ok' && i.count(blockItem(BLOCK.PLANKS)) === 4 && g[0].count === 2;
})());
check('крафт из сетки «всё сразу» (ПКМ по результату)', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  const g = grid2([[0, blockItem(BLOCK.LOG), 3]]);
  const res = craftFromGrid(g, 2, i, true);
  return res === 'ok' && i.count(blockItem(BLOCK.PLANKS)) === 12 && g[0] === null;
})());
check('крафт из сетки: пустая сетка', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  return craftFromGrid(emptyGrid(2), 2, i) === 'nothing';
})());

// ---- Еда: съедобность и поедание удержанием ----
{
  const { Eating, EAT_TIME, CHEW_INTERVAL } = await import('./src/eating.js');
  check('еда: яблоко съедобно, палка — нет', foodValue(ITEM.APPLE) === 4 && isFood(ITEM.APPLE)
    && foodValue(ITEM.STICK) === 0 && !isFood(ITEM.STICK));
  check('еда: удержание занимает около секунды', EAT_TIME > 0.8 && EAT_TIME < 1.6 && CHEW_INTERVAL > 0.1);
  check('еда: без еды в руке поедание не начинается', (() => {
    const e = new Eating();
    let events = 0;
    for (let i = 0; i < 180; i++) if (e.update(1 / 60, true, false)) events++;
    return events === 0 && !e.active;
  })());
  check('еда: короткое нажатие не тратит предмет', (() => {
    const e = new Eating();
    let started = false, done = false;
    for (let i = 0; i < 18; i++) {            // 0.3 с — меньше, чем нужно
      const ev = e.update(1 / 60, true, true);
      if (ev === 'start') started = true;
      if (ev === 'done') done = true;
    }
    for (let i = 0; i < 60; i++) e.update(1 / 60, false, true);
    return started && !done && !e.active && e.raised < 0.2;
  })());
  check('еда: удержание до конца съедает предмет', (() => {
    const e = new Eating();
    let done = false, chews = 0, maxRaise = 0;
    for (let i = 0; i < 180 && !done; i++) {
      const ev = e.update(1 / 60, true, true);
      if (ev === 'done') done = true;
      if (ev === 'chew') chews++;
      maxRaise = Math.max(maxRaise, e.raised);
    }
    return done && chews >= 2 && maxRaise > 0.9;
  })());
  check('еда: повторное удержание снова кормит', (() => {
    const e = new Eating();
    let done = 0;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 180; i++) {
        const ev = e.update(1 / 60, true, true);
        if (ev === 'done') { done++; break; }
      }
      for (let i = 0; i < 30; i++) e.update(1 / 60, false, true);
    }
    return done === 2;
  })());
  check('еда: подсказки есть в обоих языках', (() => {
    return !!STRINGS.ru.eat_full && !!STRINGS.en.eat_full
      && !!STRINGS.ru.eat_ok && !!STRINGS.ru.hint_eat && !!STRINGS.en.hint_eat;
  })());
}

// ---- Лук и стрелы ----
check('лук и стрела есть в предметах', !!itemDef(ITEM.BOW) && !!itemDef(ITEM.ARROW));
check('лук: 3 палки + 3 доски', craftWith({ [ITEM.STICK]: 3, [blockItem(BLOCK.PLANKS)]: 3 }, 'bow')
  .i.count(ITEM.BOW) === 1);
check('стрелы: палка + булыжник → 2 стрелы',
  craftWith({ [ITEM.STICK]: 1, [blockItem(BLOCK.COBBLE)]: 1 }, 'arrows').i.count(ITEM.ARROW) === 2);
check('лук не стакается', maxStack(ITEM.BOW) === 1);

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
  check('стрела долетает до стены', !!stuck);
  check('стрела не проваливается в блок', !!stuck && Math.floor(stuck.group.position.x) < 3);
  if (stuck) {
    for (let i = 0; i < 20 && !picked; i++) {
      arrows.update(1 / 60, wallWorld, [], stuck.group.position);
    }
    check('воткнутая стрела подбирается', picked === 1);
  }

  const arrows2 = new proj.Arrows(scene);
  const mob = { pos: { x: 2, y: 10, z: 0.5 }, dead: false, dying: -1 };
  arrows2.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, { onMob: (m) => { hitMob = m; } });
  for (let i = 0; i < 120 && !hitMob; i++) arrows2.update(1 / 60, wallWorld, [mob], null);
  check('стрела попадает в моба на лету', hitMob === mob);

  const arrows3 = new proj.Arrows(scene);
  let dyingHit = null;
  const dying = { pos: { x: 2, y: 10, z: 0.5 }, dead: false, dying: 0.4 };
  arrows3.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, { onMob: (m) => { dyingHit = m; } });
  for (let i = 0; i < 120 && !dyingHit; i++) arrows3.update(1 / 60, wallWorld, [dying], null);
  check('в умирающего моба стрела не бьёт', dyingHit === null);
}

// ---- Мобы: направление движения, урон, анимация смерти ----
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
  check('моб сдвинулся с места', Math.hypot(mx, mz) > 0.1);
  check('моб смотрит по ходу движения', mx * fwd.x + mz * fwd.z > 0.1);
  check('взгляд моба горизонтальный', Math.abs(fwd.y) < 1e-6);

  check('кап мобов', mobs.MOB_CAPS.spider === 3 && mobs.MOB_CAPS.creeper === 2);
  check('ночные мобы враждебны', ['gloom', 'spider', 'creeper'].every((t) => mobs.HOSTILE.has(t)));
  check('рыба и волк — не враждебные', !mobs.HOSTILE.has('fish') && !mobs.HOSTILE.has('wolf'));

  // Анимации: походка, взгляд, хвост, мигание, выпад
  const animMob = (type, opts = {}) => {
    const v = mobs.makeMobVisuals(type);
    const m = new mobs.Mob(opts.world || flat, v, type, 0.5, 31, 0.5);
    m.state = opts.state || 'walk';
    m.thinkT = 1e9;
    m.heading = 0;
    return { v, m };
  };
  const sidePlayer = { x: 5.5, y: 31, z: 0.5 };

  check('лапы ходят диагональными парами', (() => {
    const { v, m } = animMob('wolf');
    let opposite = 0;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      if (v.legs[0].rotation.x > 0.25 && v.legs[1].rotation.x < -0.25) opposite++;
    }
    return opposite > 3;
  })());

  check('моб смотрит на игрока головой', (() => {
    const { v, m } = animMob('sheep');
    for (let i = 0; i < 60; i++) m.update(1 / 60, sidePlayer);
    const yaw = v.look[0].rotation.y;
    return Math.abs(yaw) > 0.3 && Math.abs(yaw) < 0.8;
  })());

  check('в бегстве моб не оглядывается', (() => {
    const { v, m } = animMob('bunny', { state: 'flee' });
    for (let i = 0; i < 60; i++) m.update(1 / 60, sidePlayer);
    return Math.abs(v.look[0].rotation.y) < 0.05;
  })());

  check('хвост виляет', (() => {
    const { v, m } = animMob('wolf');
    let mn = 9, mx = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, { x: 40, y: 31, z: 40 });
      mn = Math.min(mn, v.tail.rotation.y);
      mx = Math.max(mx, v.tail.rotation.y);
    }
    return mx - mn > 0.3;
  })());

  check('мобы мигают', (() => {
    const { v, m } = animMob('bunny', { state: 'idle' });
    let closed = 0;
    for (let i = 0; i < 600; i++) {
      m.update(1 / 60, sidePlayer);
      if (v.blink[0].scale.y < 0.2) closed++;
    }
    return closed > 3 && closed < 120;
  })());

  check('выпад вперёд при атаке', (() => {
    const { v, m } = animMob('wolf', { state: 'hunt' });
    m.angry = true;
    let adv = 0;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, { x: 1.2, y: 31, z: 0.5 });
      adv = Math.max(adv, v.group.position.x - m.pos.x);
    }
    return adv > 0.1;
  })());

  check('паук перебирает восемью ногами', (() => {
    const { v, m } = animMob('spider');
    let moved = 0;
    const z0 = v.legs[0].rotation.z;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      if (Math.abs(v.legs[0].rotation.x) > 0.1) moved++;
    }
    return moved > 20 && Math.abs(v.legs[0].rotation.z - z0) > 0.01;
  })());

  check('крипер перебирает лапами, пока горит фитиль', (() => {
    const { v, m } = animMob('creeper');
    m.fuseT = 0;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      m.update(1 / 60, { x: 2, y: 31, z: 0.5 });
      if (Math.abs(v.legs[0].rotation.x) > 0.05) moved++;
    }
    return moved > 10;
  })());

  check('рыба чавкает и бьёт хвостом', (() => {
    const sea = { getBlock: () => BLOCK.WATER, seaLevel: 22, heightAt: () => 30 };
    const { v, m } = animMob('fish', { world: sea, state: 'idle' });
    let mn = 9, mx = -9, mnMouth = 9, mxMouth = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      mn = Math.min(mn, v.tail.rotation.y);
      mx = Math.max(mx, v.tail.rotation.y);
      mnMouth = Math.min(mnMouth, v.mouth[0].scale.x);
      mxMouth = Math.max(mxMouth, v.mouth[0].scale.x);
    }
    return mx - mn > 0.3 && mxMouth - mnMouth > 0.2;
  })());

  check('птица машет крыльями и вертит головой', (() => {
    const { v, m } = animMob('bird');
    let mn = 9, mx = -9, mnHead = 9, mxHead = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      mn = Math.min(mn, v.wings[0].rotation.z);
      mx = Math.max(mx, v.wings[0].rotation.z);
      mnHead = Math.min(mnHead, v.head.position.y);
      mxHead = Math.max(mxHead, v.head.position.y);
    }
    return mx - mn > 0.5 && mxHead - mnHead > 0.01;
  })());

  // Смерть: не исчезает мгновенно, а заваливается на бок и только потом убирается
  const dead = new mobs.Mob(flat, { group: new THREE.Group(), legs: [], head: null, ears: [] }, 'spider', 0.5, 31, 0.5);
  dead.hurt(99);
  check('смертельный урон включает анимацию, а не мгновенное исчезновение', dead.dying === 0 && !dead.dead);
  const baseScale = dead.v.group.scale.x;
  dead.updateDeath(0.35);
  dead.updateDeath(0.35);                       // почти вся анимация (~0.75 с)
  const tilt = Math.abs(dead.v.group.rotation.z);
  check('моб заваливается на бок', tilt > 1 && dead.v.group.scale.x < baseScale && !dead.dead);
  for (let i = 0; i < 60 && !dead.dead; i++) dead.updateDeath(1 / 60);
  check('после анимации моб убирается из мира', dead.dead);
}

// Разметка: кнопка «К спавну» и слой молний
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
check('btn-home + lightning in markup', html.includes('id="btn-home"') && html.includes('id="lightning"'));
check('разметка: выбор режима, инвентарь, рюкзак', html.includes('id="mode-screen"')
  && html.includes('id="inventory-screen"') && html.includes('id="btn-bag"')
  && html.includes('id="cursor-item"') && html.includes('id="inv-hotbar-row"'));

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);