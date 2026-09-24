// Рецепты крафта (выживание): список, проверка доступности, сам крафт
import { BLOCK } from './blocks.js';
import { ITEM } from './inventory.js';

// in — ингредиенты {id, n}, out — результат
export const RECIPES = [
  { out: { id: BLOCK.PLANKS, n: 4 }, in: [{ id: BLOCK.LOG, n: 1 }] },
  { out: { id: ITEM.STICK, n: 4 }, in: [{ id: BLOCK.PLANKS, n: 2 }] },
  { out: { id: ITEM.WOOD_PICK, n: 1 }, in: [{ id: BLOCK.PLANKS, n: 3 }, { id: ITEM.STICK, n: 2 }] },
  { out: { id: ITEM.WOOD_AXE, n: 1 }, in: [{ id: BLOCK.PLANKS, n: 3 }, { id: ITEM.STICK, n: 2 }] },
  { out: { id: ITEM.WOOD_SWORD, n: 1 }, in: [{ id: BLOCK.PLANKS, n: 2 }, { id: ITEM.STICK, n: 1 }] },
  { out: { id: ITEM.STONE_PICK, n: 1 }, in: [{ id: BLOCK.COBBLE, n: 3 }, { id: ITEM.STICK, n: 2 }] },
  { out: { id: ITEM.STONE_SWORD, n: 1 }, in: [{ id: BLOCK.COBBLE, n: 2 }, { id: ITEM.STICK, n: 1 }] },
  { out: { id: BLOCK.GLASS, n: 1 }, in: [{ id: BLOCK.SAND, n: 2 }] },
  { out: { id: BLOCK.BRICK, n: 2 }, in: [{ id: BLOCK.COBBLE, n: 2 }, { id: BLOCK.SAND, n: 2 }] },
  { out: { id: BLOCK.STONE, n: 1 }, in: [{ id: BLOCK.COBBLE, n: 2 }] },
  { out: { id: BLOCK.SLATE, n: 2 }, in: [{ id: BLOCK.STONE, n: 2 }] },
  { out: { id: BLOCK.GLOW, n: 2 }, in: [{ id: BLOCK.COBBLE, n: 1 }, { id: ITEM.STICK, n: 1 }, { id: BLOCK.LEAVES, n: 1 }] },
  { out: { id: BLOCK.SNOW, n: 1 }, in: [{ id: BLOCK.SAND, n: 1 }, { id: BLOCK.DIRT, n: 1 }] },
];

export function canCraft(inv, r) {
  return r.in.every((m) => inv.count(m.id) >= m.n);
}

// true — если крафт выполнен (ингредиенты списаны, результат добавлен)
export function craft(inv, r) {
  if (!canCraft(inv, r)) return false;
  for (const m of r.in) inv.remove(m.id, m.n);
  if (!inv.add(r.out.id, r.out.n)) {
    // Инвентарь полон — возвращаем ингредиенты
    for (const m of r.in) inv.add(m.id, m.n);
    return false;
  }
  return true;
}
