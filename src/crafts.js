// Крафт: рецепты «в руках» (без сетки), доступность и выполнение
import { BLOCK } from './blocks.js';
import { ITEM, blockItem, itemDef, maxStack } from './items.js';

// in — что тратится, out — что получается
export const RECIPES = [
  { id: 'planks', in: { [blockItem(BLOCK.LOG)]: 1 }, out: { key: blockItem(BLOCK.PLANKS), count: 4 } },
  { id: 'sticks', in: { [blockItem(BLOCK.PLANKS)]: 2 }, out: { key: ITEM.STICK, count: 4 } },
  { id: 'wood_pickaxe', in: { [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.WOOD_PICKAXE, count: 1 } },
  { id: 'wood_axe', in: { [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.WOOD_AXE, count: 1 } },
  { id: 'wood_sword', in: { [blockItem(BLOCK.PLANKS)]: 2, [ITEM.STICK]: 1 }, out: { key: ITEM.WOOD_SWORD, count: 1 } },
  { id: 'stone_pickaxe', in: { [blockItem(BLOCK.COBBLE)]: 3, [ITEM.STICK]: 2 }, out: { key: ITEM.STONE_PICKAXE, count: 1 } },
  { id: 'stone_sword', in: { [blockItem(BLOCK.COBBLE)]: 2, [ITEM.STICK]: 1 }, out: { key: ITEM.STONE_SWORD, count: 1 } },
  { id: 'glass', in: { [blockItem(BLOCK.SAND)]: 2 }, out: { key: blockItem(BLOCK.GLASS), count: 1 } },
  { id: 'brick', in: { [blockItem(BLOCK.COBBLE)]: 2, [blockItem(BLOCK.SAND)]: 2 }, out: { key: blockItem(BLOCK.BRICK), count: 2 } },
  { id: 'stone', in: { [blockItem(BLOCK.COBBLE)]: 2 }, out: { key: blockItem(BLOCK.STONE), count: 1 } },
  { id: 'slate', in: { [blockItem(BLOCK.STONE)]: 2 }, out: { key: blockItem(BLOCK.SLATE), count: 2 } },
  { id: 'glow', in: { [blockItem(BLOCK.COBBLE)]: 1, [ITEM.STICK]: 1, [blockItem(BLOCK.LEAVES)]: 1 }, out: { key: blockItem(BLOCK.GLOW), count: 2 } },
  { id: 'snow', in: { [blockItem(BLOCK.SAND)]: 1, [blockItem(BLOCK.DIRT)]: 1 }, out: { key: blockItem(BLOCK.SNOW), count: 1 } },
];

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

/** Хватает ли места под результат (с учётом ячеек, которые освободятся) */
export function hasRoom(inv, recipe) {
  return inv.spaceFor(recipe.out.key) >= recipe.out.count;
}

/**
 * Крафт: тратит ингредиенты и выдаёт результат.
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
    // откат: ингредиенты возвращаются
    for (const [key, need] of removed) inv.add(key, need);
    return 'full';
  }
  const left = inv.add(recipe.out.key, recipe.out.count);
  if (left > 0) return 'full';
  return 'ok';
}

/** Рецепты, которые сейчас доступны (для подсветки) */
export function availableRecipes(inv) {
  return RECIPES.map((r) => ({ recipe: r, ok: canCraft(inv, r) }));
}

/** Проверка целостности рецептов (используется тестами) */
export function validateRecipes() {
  const problems = [];
  for (const r of RECIPES) {
    if (!itemDef(r.out.key)) problems.push(`${r.id}: неизвестный результат ${r.out.key}`);
    if (!Number.isInteger(r.out.count) || r.out.count <= 0) problems.push(`${r.id}: плохое количество`);
    if (r.out.count > maxStack(r.out.key)) problems.push(`${r.id}: результат больше стопки`);
    if (!Object.keys(r.in).length) problems.push(`${r.id}: нет ингредиентов`);
    for (const [k, n] of Object.entries(r.in)) {
      if (!itemDef(k)) problems.push(`${r.id}: неизвестный ингредиент ${k}`);
      if (!Number.isInteger(n) || n <= 0) problems.push(`${r.id}: плохое число ингредиента ${k}`);
    }
  }
  return problems;
}
