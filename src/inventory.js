// Предметы и инвентарь: типы предметов, рюкзак на 36 слотов, дропы, мультипликаторы инструментов
import { BLOCK, BLOCKS, BLOCK_NAMES, isDecor } from './blocks.js';
import { CONFIG } from './config.js';

// id предметов: 1..19 — блоки (см. blocks.js), 101+ — особые предметы
export const ITEM = {
  STICK: 101,
  WOOD_PICK: 102,
  STONE_PICK: 103,
  WOOD_AXE: 104,
  WOOD_SWORD: 105,
  STONE_SWORD: 106,
  APPLE: 107,
};

// name: ru/en, stack: максимальная стопка, tool: назначение инструмента
export const ITEMS = {
  [ITEM.STICK]: { name: { ru: 'Палка', en: 'Stick' }, stack: 64 },
  [ITEM.WOOD_PICK]: { name: { ru: 'Деревянная кирка', en: 'Wooden pickaxe' }, stack: 1, tool: 'pick', tier: 1 },
  [ITEM.STONE_PICK]: { name: { ru: 'Каменная кирка', en: 'Stone pickaxe' }, stack: 1, tool: 'pick', tier: 2 },
  [ITEM.WOOD_AXE]: { name: { ru: 'Деревянный топор', en: 'Wooden axe' }, stack: 1, tool: 'axe', tier: 1 },
  [ITEM.WOOD_SWORD]: { name: { ru: 'Деревянный меч', en: 'Wooden sword' }, stack: 1, tool: 'sword', tier: 1 },
  [ITEM.STONE_SWORD]: { name: { ru: 'Каменный меч', en: 'Stone sword' }, stack: 1, tool: 'sword', tier: 2 },
  [ITEM.APPLE]: { name: { ru: 'Яблоко', en: 'Apple' }, stack: 64, food: true },
};

export function maxStack(id) {
  if (id >= 101) return ITEMS[id] ? ITEMS[id].stack : 1;
  return CONFIG.STACK_MAX;
}

export function isBlockItem(id) {
  return id >= 1 && id <= 19;
}

export function itemName(id, lang = 'ru') {
  if (id >= 101) {
    const it = ITEMS[id];
    return it ? (it.name[lang] || it.name.ru) : '';
  }
  return BLOCK_NAMES[lang]?.[id] || BLOCK_NAMES.ru[id] || '';
}

// Урон ближнего боя: рукой 1, деревянный меч 2, каменный меч 3
export function swordDamage(heldId) {
  if (heldId === ITEM.WOOD_SWORD) return 2;
  if (heldId === ITEM.STONE_SWORD) return 3;
  return 1;
}

export class Inventory {
  constructor(size = 36) {
    this.size = size;
    this.slots = new Array(size).fill(null); // { id, n } | null
  }

  // Положить предмет (составляет стопки). true — если всё поместилось
  add(id, n = 1) {
    const max = maxStack(id);
    let left = n;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.n < max) {
        const mv = Math.min(max - s.n, left);
        s.n += mv;
        left -= mv;
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const mv = Math.min(max, left);
        this.slots[i] = { id, n: mv };
        left -= mv;
      }
    }
    return left === 0;
  }

  remove(id, n = 1) {
    let left = n;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const mv = Math.min(s.n, left);
        s.n -= mv;
        left -= mv;
        if (s.n <= 0) this.slots[i] = null;
      }
    }
    return left === 0;
  }

  count(id) {
    let t = 0;
    for (const s of this.slots) if (s && s.id === id) t += s.n;
    return t;
  }

  decrement(i) {
    const s = this.slots[i];
    if (!s) return;
    s.n--;
    if (s.n <= 0) this.slots[i] = null;
  }

  serialize() {
    return this.slots.map((s) => (s ? [s.id, s.n] : 0));
  }

  load(arr) {
    this.slots.fill(null);
    if (Array.isArray(arr)) {
      for (let i = 0; i < this.size; i++) {
        const e = arr[i];
        if (Array.isArray(e) && e[0] > 0 && e[1] > 0) {
          this.slots[i] = { id: e[0], n: Math.min(e[1], maxStack(e[0])) };
        }
      }
    }
  }

  clear() {
    this.slots.fill(null);
  }
}

// Что даёт сломанный блок в выживании (null — ничего)
export function dropFor(id) {
  if (!id || id === BLOCK.WATER) return null;
  if (id === BLOCK.GRASS) return BLOCK.DIRT;
  if (id === BLOCK.STONE) return BLOCK.COBBLE;
  if (id === BLOCK.GLASS) return null;
  if (id === BLOCK.LEAVES) return Math.random() < 0.3 ? BLOCK.LEAVES : null;
  if (isDecor(id)) return null; // трава и цветы не дают предметов
  return id;
}

// Множитель времени ломания по предмету в руке (только выживание)
export function breakMult(heldId, blockId) {
  const b = BLOCKS[blockId];
  if (!b) return 1;
  const kind = b.break || 'default';
  const held = ITEMS[heldId];
  const M = CONFIG.TOOL_MULT;
  if (kind === 'slow') {
    // «Каменные» блоки: камень, булыжник, стекло, кирпич, сланец
    if (held && held.tool === 'pick') return held.tier >= 2 ? M.stonePick : M.woodPick;
    return M.stoneNoPick;
  }
  if (blockId === BLOCK.LOG || blockId === BLOCK.PLANKS) {
    return held && held.tool === 'axe' ? M.withAxe : M.noAxe;
  }
  return 1;
}

// Режим по сохранению: старые сейвы (без поля mode) открываются в креативе
export function defaultMode(save) {
  return save && save.mode === 'survival' ? 'survival' : 'creative';
}
