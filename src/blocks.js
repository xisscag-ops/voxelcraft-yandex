// Типы блоков и их свойства. Старые id не меняем — они уже записаны в сохранениях.
export const BLOCK = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5,
  LOG: 6, PLANKS: 7, LEAVES: 8, GLASS: 9, BRICK: 10, GLOW: 11,
  SNOW: 12, WATER: 13, SLATE: 14, TALL_GRASS: 15,
  FLOWER_RED: 16, FLOWER_YELLOW: 17, FERN: 18, CLOVER: 19,
  PLANK_SLAB: 20, PLANK_SLAB_TOP: 21, COBBLE_SLAB: 22, COBBLE_SLAB_TOP: 23,
  TORCH: 24, FURNACE: 25, IRON_ORE: 26, COAL_ORE: 27,
};

// tiles: [top, bottom, side, optional front (+Z)] — индексы тайлов атласа.
export const BLOCKS = [
  { id: 0, name: 'air', solid: false, tiles: null },
  { id: 1, name: 'grass', solid: true, tiles: [0, 2, 1], break: 'fast' },
  { id: 2, name: 'dirt', solid: true, tiles: [2, 2, 2], break: 'fast' },
  { id: 3, name: 'stone', solid: true, tiles: [3, 3, 3], break: 'slow' },
  { id: 4, name: 'cobble', solid: true, tiles: [4, 4, 4], break: 'slow' },
  { id: 5, name: 'sand', solid: true, tiles: [5, 5, 5], break: 'fast' },
  { id: 6, name: 'log', solid: true, tiles: [7, 7, 6], break: 'default' },
  { id: 7, name: 'planks', solid: true, tiles: [8, 8, 8], break: 'default' },
  { id: 8, name: 'leaves', solid: true, tiles: [9, 9, 9], break: 'fast', foliage: true },
  { id: 9, name: 'glass', solid: true, tiles: [10, 10, 10], break: 'slow', transparent: true },
  { id: 10, name: 'brick', solid: true, tiles: [11, 11, 11], break: 'slow' },
  { id: 11, name: 'glow', solid: true, tiles: [12, 12, 12], break: 'default', emissive: true },
  { id: 12, name: 'snow', solid: true, tiles: [13, 2, 14], break: 'fast' },
  { id: 13, name: 'water', solid: false, tiles: [15, 15, 15], break: 'default', liquid: true, transparent: true },
  { id: 14, name: 'slate', solid: true, tiles: [16, 16, 16], break: 'slow' },
  { id: 15, name: 'tall_grass', solid: false, tiles: [22, 22, 22], break: 'fast', transparent: true, decor: true },
  { id: 16, name: 'flower_red', solid: false, tiles: [23, 23, 23], break: 'fast', transparent: true, decor: true },
  { id: 17, name: 'flower_yellow', solid: false, tiles: [24, 24, 24], break: 'fast', transparent: true, decor: true },
  { id: 18, name: 'fern', solid: false, tiles: [25, 25, 25], break: 'fast', transparent: true, decor: true },
  { id: 19, name: 'clover', solid: false, tiles: [26, 26, 26], break: 'fast', transparent: true, decor: true },
  { id: 20, name: 'plank_slab', solid: true, tiles: [8, 8, 8], break: 'default', shape: 'slab', half: 'bottom' },
  { id: 21, name: 'plank_slab_top', solid: true, tiles: [8, 8, 8], break: 'default', shape: 'slab', half: 'top' },
  { id: 22, name: 'cobble_slab', solid: true, tiles: [4, 4, 4], break: 'slow', shape: 'slab', half: 'bottom' },
  { id: 23, name: 'cobble_slab_top', solid: true, tiles: [4, 4, 4], break: 'slow', shape: 'slab', half: 'top' },
  { id: 24, name: 'torch', solid: false, tiles: [32, 32, 32], break: 'fast', shape: 'torch', transparent: true, emissive: true },
  { id: 25, name: 'furnace', solid: true, tiles: [30, 30, 29, 31], break: 'slow' },
  { id: 26, name: 'iron_ore', solid: true, tiles: [27, 27, 27], break: 'slow' },
  { id: 27, name: 'coal_ore', solid: true, tiles: [28, 28, 28], break: 'slow' },
];

export const BLOCK_NAMES = {
  ru: {
    1: 'Дёрн', 2: 'Земля', 3: 'Камень', 4: 'Булыжник', 5: 'Песок',
    6: 'Бревно', 7: 'Доски', 8: 'Листва', 9: 'Стекло', 10: 'Кирпич',
    11: 'Светокамень', 12: 'Снег', 13: 'Вода', 14: 'Сланец',
    15: 'Трава', 16: 'Красный цветок', 17: 'Жёлтый цветок',
    18: 'Папоротник', 19: 'Клевер', 20: 'Деревянный полублок',
    21: 'Деревянный полублок', 22: 'Каменный полублок', 23: 'Каменный полублок',
    24: 'Факел', 25: 'Печка', 26: 'Железная руда', 27: 'Угольная руда',
  },
  en: {
    1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Cobblestone', 5: 'Sand',
    6: 'Log', 7: 'Planks', 8: 'Leaves', 9: 'Glass', 10: 'Brick',
    11: 'Glowstone', 12: 'Snow', 13: 'Water', 14: 'Slate',
    15: 'Tall grass', 16: 'Red flower', 17: 'Yellow flower',
    18: 'Fern', 19: 'Clover', 20: 'Wooden slab', 21: 'Wooden slab',
    22: 'Stone slab', 23: 'Stone slab', 24: 'Torch', 25: 'Furnace',
    26: 'Iron ore', 27: 'Coal ore',
  },
};

// Базовые блоки, предметы и набор строителя. Верхние полублоки — варианты
// размещения тех же предметов, поэтому отдельные слоты им не нужны.
export const STARTER_PALETTE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.SAND,
  BLOCK.LOG, BLOCK.PLANKS, BLOCK.PLANK_SLAB, BLOCK.COBBLE_SLAB,
  BLOCK.TORCH, BLOCK.FURNACE, 'bow', 'bread',
];
export const BUILDER_PALETTE = [
  BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK, BLOCK.GLOW, BLOCK.SNOW, BLOCK.SLATE,
  BLOCK.TALL_GRASS, BLOCK.FERN, BLOCK.CLOVER, BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW,
  BLOCK.IRON_ORE, BLOCK.COAL_ORE,
];

const FULL = Object.freeze({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
const LOWER = Object.freeze({ ...FULL, maxY: 0.5 });
const UPPER = Object.freeze({ ...FULL, minY: 0.5 });
const TORCH_BOUNDS = Object.freeze({ minX: 0.36, minY: 0, minZ: 0.36, maxX: 0.64, maxY: 0.84, maxZ: 0.64 });
const DECOR_BOUNDS = Object.freeze({ minX: 0.2, minY: 0, minZ: 0.2, maxX: 0.8, maxY: 0.55, maxZ: 0.8 });
export function blockBounds(id) {
  const def = BLOCKS[id];
  if (def?.shape === 'slab') return def.half === 'top' ? UPPER : LOWER;
  if (def?.shape === 'torch') return TORCH_BOUNDS;
  return def?.decor ? DECOR_BOUNDS : FULL;
}
export function isSlab(id) { return BLOCKS[id]?.shape === 'slab'; }
export function isSolid(id) { return !!BLOCKS[id]?.solid; }
export function isOpaque(id) {
  const def = BLOCKS[id];
  return !!(def && id !== 0 && !def.transparent && !def.foliage && !def.shape);
}
export function isDecor(id) { return !!BLOCKS[id]?.decor; }
export function isFoliage(id) { return !!BLOCKS[id]?.foliage; }
export function isLiquid(id) { return !!BLOCKS[id]?.liquid; }
export function breakKind(id) { return BLOCKS[id]?.break || 'default'; }

// Возвращает ключ добытого предмета. Руда не превращается обратно в блок:
// её надо подобрать и затем переплавить в печке.
export function blockDrop(id) {
  if (id === BLOCK.AIR || id === BLOCK.WATER) return null;
  if (id === BLOCK.IRON_ORE) return 'ore';
  if (id === BLOCK.COAL_ORE) return 'coal';
  if (id === BLOCK.STONE) return `block:${BLOCK.COBBLE}`;
  if (id === BLOCK.GRASS) return `block:${BLOCK.DIRT}`;
  if (id === BLOCK.PLANK_SLAB_TOP) return `block:${BLOCK.PLANK_SLAB}`;
  if (id === BLOCK.COBBLE_SLAB_TOP) return `block:${BLOCK.COBBLE_SLAB}`;
  return `block:${id}`;
}
