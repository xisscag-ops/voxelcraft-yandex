// Маленький инвентарь и рецепты. Ключи блоков отделены от предметов,
// поэтому ID блока никогда не путается с ID яблока или руды.
import { BLOCK, BLOCK_NAMES } from './blocks.js';

export const ITEM = Object.freeze({
  APPLE: 'apple', BREAD: 'bread', BOW: 'bow', ARROW: 'arrow',
  ORE: 'ore', COAL: 'coal', WHEAT: 'wheat', INGOT: 'ingot',
});
export const blockKey = (id) => `block:${id}`;
export const slotKey = (id) => typeof id === 'number' ? blockKey(id) : id;

export const ITEM_NAMES = {
  ru: { apple: 'Яблоко', bread: 'Хлеб', bow: 'Лук', arrow: 'Стрела', ore: 'Железная руда', coal: 'Уголь', wheat: 'Пшеница', ingot: 'Слиток железа' },
  en: { apple: 'Apple', bread: 'Bread', bow: 'Bow', arrow: 'Arrow', ore: 'Iron ore', coal: 'Coal', wheat: 'Wheat', ingot: 'Iron ingot' },
};
export const ITEM_ICONS = { apple: '🍎', bread: '🍞', bow: '🏹', arrow: '➶', ore: '🟤', coal: '⚫', wheat: '🌾', ingot: '▣' };

export function itemName(key, lang = 'ru') {
  if (key.startsWith('block:')) {
    const id = Number(key.slice(6));
    return BLOCK_NAMES[lang]?.[id] || BLOCK_NAMES.ru[id] || key;
  }
  return ITEM_NAMES[lang]?.[key] || ITEM_NAMES.ru[key] || key;
}

export const RECIPES = [
  { id: 'planks', inputs: { [blockKey(BLOCK.LOG)]: 1 }, output: blockKey(BLOCK.PLANKS), amount: 4 },
  { id: 'plank_slab', inputs: { [blockKey(BLOCK.PLANKS)]: 2 }, output: blockKey(BLOCK.PLANK_SLAB), amount: 4 },
  { id: 'cobble_slab', inputs: { [blockKey(BLOCK.COBBLE)]: 2 }, output: blockKey(BLOCK.COBBLE_SLAB), amount: 4 },
  { id: 'torch', inputs: { coal: 1, [blockKey(BLOCK.PLANKS)]: 1 }, output: blockKey(BLOCK.TORCH), amount: 4 },
  { id: 'furnace', inputs: { [blockKey(BLOCK.COBBLE)]: 8 }, output: blockKey(BLOCK.FURNACE), amount: 1 },
  { id: 'arrows', inputs: { ingot: 1, [blockKey(BLOCK.PLANKS)]: 1 }, output: ITEM.ARROW, amount: 8 },
  // Печь принимает в качестве топлива одну единицу угля ИЛИ досок.
  { id: 'smelt_ore', station: 'furnace', inputs: { ore: 1 }, fuel: true, output: ITEM.INGOT, amount: 1 },
  { id: 'bake_bread', station: 'furnace', inputs: { wheat: 3 }, fuel: true, output: ITEM.BREAD, amount: 1 },
];

export class Inventory {
  constructor(data = {}) {
    this.counts = Object.create(null);
    for (const [key, count] of Object.entries(data || {})) {
      if ((key.startsWith('block:') && /^block:\d+$/.test(key)) || Object.values(ITEM).includes(key)) {
        this.counts[key] = Math.min(9999, Math.max(0, Math.floor(Number(count) || 0)));
      }
    }
  }
  get(key) { return this.counts[key] || 0; }
  add(key, amount = 1) {
    this.counts[key] = Math.min(9999, this.get(key) + amount);
  }
  spend(key, amount = 1) {
    if (this.get(key) < amount) return false;
    this.counts[key] -= amount;
    return true;
  }
  canCraft(recipe) {
    return Object.entries(recipe.inputs).every(([key, n]) => this.get(key) >= n) &&
      (!recipe.fuel || this.get(ITEM.COAL) > 0 || this.get(blockKey(BLOCK.PLANKS)) > 0);
  }
  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const [key, n] of Object.entries(recipe.inputs)) this.spend(key, n);
    if (recipe.fuel) this.spend(this.get(ITEM.COAL) ? ITEM.COAL : blockKey(BLOCK.PLANKS));
    this.add(recipe.output, recipe.amount);
    return true;
  }
  serialize() { return { ...this.counts }; }
}

export function starterInventory() {
  return new Inventory({
    [blockKey(BLOCK.GRASS)]: 12, [blockKey(BLOCK.DIRT)]: 16,
    [blockKey(BLOCK.STONE)]: 8, [blockKey(BLOCK.COBBLE)]: 8,
    [blockKey(BLOCK.SAND)]: 8, [blockKey(BLOCK.LOG)]: 8,
    [blockKey(BLOCK.PLANKS)]: 24, [blockKey(BLOCK.PLANK_SLAB)]: 4,
    [blockKey(BLOCK.COBBLE_SLAB)]: 4, [blockKey(BLOCK.TORCH)]: 4,
    [blockKey(BLOCK.FURNACE)]: 1,
    [ITEM.BREAD]: 2, [ITEM.BOW]: 1, [ITEM.ARROW]: 16,
  });
}
