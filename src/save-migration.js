// Совмещаем сохранения PR #6 (v1) и уже опубликованной основной ветки (v2).
// Нельзя переиспользовать id блоков: они записаны в правках мира и инвентаре.
import { BLOCK } from './blocks.js';
import { itemDef, maxStack } from './items.js';

const PR6_BLOCKS = {
  20: BLOCK.PLANK_SLAB, 21: BLOCK.PLANK_SLAB_TOP,
  22: BLOCK.COBBLE_SLAB, 23: BLOCK.COBBLE_SLAB_TOP,
  24: BLOCK.TORCH, 25: BLOCK.FURNACE,
  26: BLOCK.IRON_ORE, 27: BLOCK.COAL_ORE,
};
// Локальные превью интеграции v2 до закрепления публичных id 36/37.
const PREVIEW_BLOCKS = {
  36: BLOCK.PLANK_SLAB_TOP, 37: BLOCK.COBBLE_SLAB,
  38: BLOCK.COBBLE_SLAB_TOP, 39: BLOCK.TORCH, 40: BLOCK.FURNACE,
};
const MAIN_ITEMS = { ore: 'raw_iron', gold_ore: 'raw_gold', ingot: 'iron_ingot' };

export function migrateSave(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (data.v >= 3) return data;
  const fromPR6 = data.v === 1;
  const ids = fromPR6 ? PR6_BLOCKS
    : data.v === 2 && Array.isArray(data.drops) ? PREVIEW_BLOCKS : {};
  const blockId = (id) => ids[id] ?? id;
  const itemKey = (key) => {
    if (typeof key !== 'string') return key;
    const block = /^(?:block:|block_)(\d+)$/.exec(key);
    if (block) return `block_${blockId(Number(block[1]))}`;
    return MAIN_ITEMS[key] || key;
  };

  const out = { ...data, v: 3 };
  if (Array.isArray(data.edits)) {
    out.edits = data.edits.map((value, i) => i % 2 ? blockId(value) : value);
  }
  if (Array.isArray(data.inventory)) {
    out.inventory = data.inventory.map((slot) => Array.isArray(slot)
      ? [itemKey(slot[0]), slot[1]] : slot);
  } else if (fromPR6 && data.inventory && typeof data.inventory === 'object') {
    // PR #6 хранил количества в объекте, а main — 36 слотов со стопками до 64.
    out.inventory = Array(36).fill(0);
    let i = 0;
    for (const [key, value] of Object.entries(data.inventory)) {
      const migrated = itemKey(key);
      if (!itemDef(migrated)) continue;
      let left = Math.max(0, Math.min(9999, Math.floor(Number(value) || 0)));
      while (left > 0 && i < out.inventory.length) {
        const count = Math.min(left, maxStack(migrated));
        out.inventory[i++] = [migrated, count];
        left -= count;
      }
      if (i >= out.inventory.length) break;
    }
  }
  if (Array.isArray(data.drops)) {
    out.drops = data.drops.map((drop) => ({ ...drop, kind: itemKey(drop.kind) }));
  }
  return out;
}
