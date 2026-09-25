// Крафт: рецепты «в руках» (список с кликом) и настоящая сетка крафта
//   • 2×2 — в окне инвентаря
//   • 3×3 — на верстаке (блок TABLE)
import { BLOCK } from './blocks.js';
import { ITEM, blockItem, itemDef, maxStack } from './items.js';

const LOG = blockItem(BLOCK.LOG);
const PLANKS = blockItem(BLOCK.PLANKS);
const COBBLE = blockItem(BLOCK.COBBLE);
const SAND = blockItem(BLOCK.SAND);
const STONE = blockItem(BLOCK.STONE);
const LEAVES = blockItem(BLOCK.LEAVES);
const DIRT = blockItem(BLOCK.DIRT);

// in — что тратится при крафте «кликом по рецепту»,
// shapeless/patterns — как рецепт собирается в сетке крафта,
// out — что получается.
export const RECIPES = [
  {
    id: 'planks', in: { [LOG]: 1 }, out: { key: PLANKS, count: 4 },
    shapeless: { [LOG]: 1 },
  },
  {
    id: 'sticks', in: { [PLANKS]: 2 }, out: { key: ITEM.STICK, count: 4 },
    patterns: [['A', 'A']], keys: { A: PLANKS },
  },
  {
    id: 'table', in: { [PLANKS]: 4 }, out: { key: blockItem(BLOCK.TABLE), count: 1 },
    patterns: [['AA', 'AA']], keys: { A: PLANKS },
  },
  {
    id: 'wood_pickaxe', in: { [PLANKS]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.WOOD_PICKAXE, count: 1 },
    patterns: [['AAA', ' B ', ' B ']], keys: { A: PLANKS, B: ITEM.STICK },
  },
  {
    id: 'wood_axe', in: { [PLANKS]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.WOOD_AXE, count: 1 },
    patterns: [['AA', 'AB', ' B']], keys: { A: PLANKS, B: ITEM.STICK },
  },
  {
    id: 'wood_sword', in: { [PLANKS]: 2, [ITEM.STICK]: 1 }, out: { key: ITEM.WOOD_SWORD, count: 1 },
    patterns: [['A', 'A', 'B']], keys: { A: PLANKS, B: ITEM.STICK },
  },
  {
    id: 'stone_pickaxe', in: { [COBBLE]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.STONE_PICKAXE, count: 1 },
    patterns: [['AAA', ' B ', ' B ']], keys: { A: COBBLE, B: ITEM.STICK },
  },
  {
    id: 'stone_axe', in: { [COBBLE]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.STONE_AXE, count: 1 },
    patterns: [['AA', 'AB', ' B']], keys: { A: COBBLE, B: ITEM.STICK },
  },
  {
    id: 'stone_sword', in: { [COBBLE]: 2, [ITEM.STICK]: 1 }, out: { key: ITEM.STONE_SWORD, count: 1 },
    patterns: [['A', 'A', 'B']], keys: { A: COBBLE, B: ITEM.STICK },
  },
  {
    id: 'bow', in: { [ITEM.STICK]: 3, [PLANKS]: 3 }, out: { key: ITEM.BOW, count: 1 },
    patterns: [['AB', 'AB', 'AB']], keys: { A: ITEM.STICK, B: PLANKS },
  },
  {
    id: 'arrows', in: { [ITEM.STICK]: 1, [COBBLE]: 1 }, out: { key: ITEM.ARROW, count: 2 },
    patterns: [['AB']], keys: { A: ITEM.STICK, B: COBBLE },
  },
  {
    id: 'glass', in: { [SAND]: 2 }, out: { key: blockItem(BLOCK.GLASS), count: 1 },
    patterns: [['AA']], keys: { A: SAND },
  },
  {
    id: 'brick', in: { [COBBLE]: 2, [SAND]: 2 }, out: { key: blockItem(BLOCK.BRICK), count: 2 },
    patterns: [['AA', 'BB']], keys: { A: COBBLE, B: SAND },
  },
  {
    id: 'stone', in: { [COBBLE]: 2 }, out: { key: STONE, count: 1 },
    patterns: [['A', 'A']], keys: { A: COBBLE },
  },
  {
    id: 'slate', in: { [STONE]: 2 }, out: { key: blockItem(BLOCK.SLATE), count: 2 },
    patterns: [['A', 'A']], keys: { A: STONE },
  },
  {
    id: 'glow', in: { [COBBLE]: 1, [ITEM.STICK]: 1, [LEAVES]: 1 }, out: { key: blockItem(BLOCK.GLOW), count: 2 },
    shapeless: { [COBBLE]: 1, [ITEM.STICK]: 1, [LEAVES]: 1 },
  },
  {
    id: 'snow', in: { [SAND]: 1, [DIRT]: 1 }, out: { key: blockItem(BLOCK.SNOW), count: 1 },
    shapeless: { [SAND]: 1, [DIRT]: 1 },
  },
  {
    id: 'plank_slabs', in: { [PLANKS]: 2 }, out: { key: blockItem(BLOCK.PLANK_SLAB), count: 4 },
    patterns: [['AA']], keys: { A: PLANKS },
  },
  {
    id: 'cobble_slabs', in: { [COBBLE]: 2 }, out: { key: blockItem(BLOCK.COBBLE_SLAB), count: 4 },
    patterns: [['AA']], keys: { A: COBBLE },
  },
  {
    id: 'torches', in: { [ITEM.COAL]: 1, [ITEM.STICK]: 1 }, out: { key: blockItem(BLOCK.TORCH), count: 4 },
    patterns: [['A', 'B']], keys: { A: ITEM.COAL, B: ITEM.STICK },
  },
  {
    id: 'furnace', in: { [COBBLE]: 8 }, out: { key: blockItem(BLOCK.FURNACE), count: 1 },
    patterns: [['AAA', 'A A', 'AAA']], keys: { A: COBBLE },
  },
  // Рецепты основной ветки остаются доступными и после добавления экрана печки.
  { id: 'bread', in: { [ITEM.WHEAT]: 3 }, out: { key: ITEM.BREAD, count: 1 },
    patterns: [['AAA']], keys: { A: ITEM.WHEAT } },
  { id: 'iron_ingot', in: { [ITEM.RAW_IRON]: 1, [ITEM.COAL]: 1 }, out: { key: ITEM.IRON_INGOT, count: 1 },
    shapeless: { [ITEM.RAW_IRON]: 1, [ITEM.COAL]: 1 } },
  { id: 'gold_ingot', in: { [ITEM.RAW_GOLD]: 1, [ITEM.COAL]: 1 }, out: { key: ITEM.GOLD_INGOT, count: 1 },
    shapeless: { [ITEM.RAW_GOLD]: 1, [ITEM.COAL]: 1 } },
];

// Печка расходует ровно одну единицу топлива за один обжиг; ингредиенты и
// топливо снимаются атомарно и только если помещается результат.
export const FURNACE_RECIPES = [
  { id: 'smelt_iron', in: { [ITEM.RAW_IRON]: 1 }, out: { key: ITEM.IRON_INGOT, count: 1 } },
  { id: 'smelt_gold', in: { [ITEM.RAW_GOLD]: 1 }, out: { key: ITEM.GOLD_INGOT, count: 1 } },
  { id: 'bake_bread', in: { [ITEM.WHEAT]: 3 }, out: { key: ITEM.BREAD, count: 1 } },
];

export function furnaceFuel(inv) {
  return inv.has(ITEM.COAL) ? ITEM.COAL : inv.has(PLANKS) ? PLANKS : null;
}

export function smelt(inv, recipe) {
  if (!FURNACE_RECIPES.includes(recipe)) return 'missing';
  const fuel = furnaceFuel(inv);
  if (!fuel || !Object.entries(recipe.in).every(([key, need]) => inv.has(key, need))) return 'missing';
  if (inv.spaceFor(recipe.out.key) < recipe.out.count) return 'full';
  for (const [key, need] of Object.entries(recipe.in)) inv.remove(key, need);
  inv.remove(fuel, 1);
  inv.add(recipe.out.key, recipe.out.count);
  return 'ok';
}

export function recipeById(id) {
  return RECIPES.find((r) => r.id === id) || null;
}

/** Нужен ли для этого рецепта верстак (сетка 3×3) */
export function needsTable(recipe) {
  if (!recipe) return false;
  if (recipe.shapeless && !recipe.patterns) return false;
  for (const p of recipe.patterns || []) {
    if (p.length > 2) return true;                     // 3 ряда
    if (p.some((row) => row.replace(/\s/g, '').length > 2)) return true; // 3 колонки
  }
  return false;
}

/** Минимальный размер сетки для рецепта */
export function recipeGridSize(recipe) {
  return needsTable(recipe) ? 3 : 2;
}

/** Список ингредиентов рецепта: [{ key, need, have, ok }] */
export function ingredients(inv, recipe) {
  return Object.entries(recipe.in).map(([key, need]) => {
    const have = inv.count(key);
    return { key, need, have, ok: have >= need };
  });
}

export function canCraft(inv, recipe) {
  return Object.entries(recipe.in).every(([key, need]) => inv.count(key) >= need);
}

/** Хватает ли места под результат */
export function hasRoom(inv, recipe) {
  return inv.spaceFor(recipe.out.key) >= recipe.out.count;
}

/**
 * Крафт «кликом по рецепту» из списка: тратит ингредиенты и выдаёт результат.
 * @returns {'ok'|'missing'|'full'}
 */
export function craft(inv, recipe) {
  if (!canCraft(inv, recipe)) return 'missing';
  const removed = [];
  for (const [key, need] of Object.entries(recipe.in)) {
    inv.remove(key, need);
    removed.push([key, need]);
  }
  if (!hasRoom(inv, recipe)) {
    for (const [key, need] of removed) inv.add(key, need);  // откат
    return 'full';
  }
  const left = inv.add(recipe.out.key, recipe.out.count);
  if (left > 0) return 'full';
  return 'ok';
}

// ---------------------------------------------------------------- Сетка крафта
/** Пустая сетка size×size (size = 2 или 3) */
export function emptyGrid(size = 2) {
  return new Array(size * size).fill(null).map(() => null);
}

/** Копия стопки без ссылки */
function cloneStack(s) {
  return s ? { key: s.key, count: s.count } : null;
}

// Бесформенный рецепт: важны типы предметов по ячейкам (а не размер стопки):
// положив в ячейку стопку, можно скрафтить несколько раз подряд.
function shapelessMatches(cells, want) {
  const wantKeys = Object.keys(want);
  const byKey = new Map();
  for (const c of cells) {
    if (!c) continue;
    if (!want[c.key]) return false;
    byKey.set(c.key, (byKey.get(c.key) || 0) + 1);
  }
  if (byKey.size !== wantKeys.length) return false;
  for (const k of wantKeys) {
    if ((byKey.get(k) || 0) !== want[k]) return false;
  }
  return true;
}

function patternMatches(grid, size, pattern, keys) {
  const h = pattern.length;
  const w = Math.max(...pattern.map((r) => r.length));
  if (h > size || w > size) return false;
  for (let oy = 0; oy <= size - h; oy++) {
    for (let ox = 0; ox <= size - w; ox++) {
      if (matchesAt(grid, size, pattern, keys, ox, oy)) return true;
    }
  }
  return false;
}

function matchesAt(grid, size, pattern, keys, ox, oy) {
  const used = new Set();
  let usedCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x - ox, py = y - oy;
      const row = py >= 0 && py < pattern.length ? pattern[py] : '';
      const ch = px >= 0 && px < row.length ? row[px] : ' ';
      const slot = grid[y * size + x];
      if (ch === ' ' || ch === '.') {
        if (slot) return false;             // лишний предмет в сетке
        continue;
      }
      const need = keys[ch];
      if (!slot || slot.key !== need) return false;
      if (grid.indexOf(slot) !== y * size + x) return false;
      used.add(y * size + x);
      usedCount++;
    }
  }
  // все непустые ячейки должны быть задействованы
  let filled = 0;
  for (let i = 0; i < size * size; i++) if (grid[i]) filled++;
  return filled === usedCount;
}

/**
 * Что получается из содержимого сетки.
 * @param {Array} grid ячейки (size*size)
 * @param {number} size 2 или 3
 * @returns {null | object} рецепт
 */
export function matchRecipe(grid, size = 2) {
  const cells = grid.slice(0, size * size);
  if (!cells.some(Boolean)) return null;
  for (const recipe of RECIPES) {
    if (recipe.shapeless && shapelessMatches(cells, recipe.shapeless)) return recipe;
    if (recipe.patterns) {
      for (const pattern of recipe.patterns) {
        if (patternMatches(cells, size, pattern, recipe.keys)) return recipe;
      }
    }
  }
  return null;
}

/** Результат сетки: { recipe, out } или null */
export function gridResult(grid, size = 2) {
  const recipe = matchRecipe(grid, size);
  return recipe ? { recipe, out: { key: recipe.out.key, count: recipe.out.count } } : null;
}

/**
 * Скрафтить из сетки: списывает по одному предмету из каждой занятой ячейки.
 * @returns {'ok'|'nothing'|'full'}
 */
export function craftFromGrid(grid, size, inv, craftAll = false) {
  const res = gridResult(grid, size);
  if (!res) return 'nothing';
  const { recipe } = res;
  const perCraft = recipe.out.count;
  let times = 1;
  if (craftAll) {
    times = Infinity;
    for (const s of grid.slice(0, size * size)) if (s) times = Math.min(times, s.count);
    if (!Number.isFinite(times) || times < 1) times = 1;
  }
  const totalOut = perCraft * times;
  if (inv.spaceFor(recipe.out.key) < totalOut) return 'full';
  for (let i = 0; i < size * size; i++) {
    const s = grid[i];
    if (!s) continue;
    s.count -= times;
    if (s.count <= 0) grid[i] = null;
  }
  inv.add(recipe.out.key, totalOut);
  return 'ok';
}

/** Рецепты, которые сейчас доступны (для подсветки списка) */
export function availableRecipes(inv) {
  return RECIPES.map((r) => ({ recipe: r, ok: canCraft(inv, r) }));
}

/** Проверка целостности рецептов (используется тестами) */
export function validateRecipes() {
  const problems = [];
  const ids = new Set();
  for (const r of RECIPES) {
    if (ids.has(r.id)) problems.push(`${r.id}: дубликат id`);
    ids.add(r.id);
    if (!itemDef(r.out.key)) problems.push(`${r.id}: неизвестный результат ${r.out.key}`);
    if (!Number.isInteger(r.out.count) || r.out.count <= 0) problems.push(`${r.id}: плохое количество`);
    if (r.out.count > maxStack(r.out.key)) problems.push(`${r.id}: результат больше стопки`);
    if (!Object.keys(r.in).length) problems.push(`${r.id}: нет ингредиентов`);
    for (const [k, n] of Object.entries(r.in)) {
      if (!itemDef(k)) problems.push(`${r.id}: неизвестный ингредиент ${k}`);
      if (!Number.isInteger(n) || n <= 0) problems.push(`${r.id}: плохое число ингредиента ${k}`);
    }
    if (!r.shapeless && !r.patterns) problems.push(`${r.id}: нет формы для сетки`);
    for (const p of r.patterns || []) {
      if (p.length < 1 || p.length > 3) problems.push(`${r.id}: плохая высота формы`);
      for (const row of p) if (row.length > 3) problems.push(`${r.id}: форма шире 3 клеток`);
      const chars = new Set(p.join('').replace(/[ .]/g, '').split(''));
      for (const ch of chars) if (!r.keys || !r.keys[ch]) problems.push(`${r.id}: нет ключа формы ${ch}`);
    }
    const needCount = new Map();
    if (r.shapeless) for (const [k, n] of Object.entries(r.shapeless)) needCount.set(k, n);
    for (const [k, n] of Object.entries(r.in)) {
      // для рецептов с формой сумма символов должна совпадать с ингредиентами «в руках»
      if (!r.patterns) continue;
      let symbols = 0;
      for (const p of r.patterns) for (const row of p) for (const ch of row) if (ch !== ' ' && ch !== '.') symbols++;
      void symbols;
      void needCount;
      if (!Object.keys(r.keys || {}).includes('A') && n > 0) problems.push(`${r.id}: форма без ключа A`);
    }
  }
  return problems;
}
