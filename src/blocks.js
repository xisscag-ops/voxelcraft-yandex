// Типы блоков и их свойства
// id: 0 = воздух. Текстуры — индексы тайлов в атласе (см. textures.js)

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  LOG: 6,
  PLANKS: 7,
  LEAVES: 8,
  GLASS: 9,
  BRICK: 10,
  GLOW: 11,
  SNOW: 12,
  WATER: 13,
  SLATE: 14,
  TALL_GRASS: 15,
  FLOWER_RED: 16,
  FLOWER_YELLOW: 17,
  FERN: 18,
  CLOVER: 19,
  TABLE: 20,        // верстак — крафт 3x3
  // Руды и породы
  COAL_ORE: 21,
  IRON_ORE: 22,
  GOLD_ORE: 23,
  DIAMOND_ORE: 24,
  GRAVEL: 25,
  SANDSTONE: 26,
  ICE: 27,
  MOSSY: 28,
  // Деревья разных пород
  BIRCH_LOG: 29,
  BIRCH_LEAVES: 30,
  SPRUCE_LOG: 31,
  SPRUCE_LEAVES: 32,
  // Прочее
  CACTUS: 33,
  OBSIDIAN: 34,
  // Id 35–37 уже встречаются в сохранениях основной ветки: не переназначаем!
  PLANK_SLAB: 35,
  SLAB: 35,        // совместимость со старыми сохранениями и рецептами
  TORCH: 36,
  FURNACE: 37,
  PLANK_SLAB_TOP: 38,
  COBBLE_SLAB: 39,
  COBBLE_SLAB_TOP: 40,
  WALL_TORCH: 41,   // факел, закреплённый на стене (сторона берётся из соседнего блока)
};

// tiles: [top, bottom, side] — индексы тайлов атласа
// tool: класс инструмента, ускоряющего ломание ('stone' — кирка, 'wood' — топор)
export const BLOCKS = [
  { id: 0, name: 'air', solid: false, tiles: null },
  { id: 1, name: 'grass', solid: true, tiles: [0, 2, 1], break: 'fast' },
  { id: 2, name: 'dirt', solid: true, tiles: [2, 2, 2], break: 'fast' },
  { id: 3, name: 'stone', solid: true, tiles: [3, 3, 3], break: 'slow', tool: 'stone' },
  { id: 4, name: 'cobble', solid: true, tiles: [4, 4, 4], break: 'slow', tool: 'stone' },
  { id: 5, name: 'sand', solid: true, tiles: [5, 5, 5], break: 'fast' },
  { id: 6, name: 'log', solid: true, tiles: [7, 7, 6], break: 'default', tool: 'wood' },
  { id: 7, name: 'planks', solid: true, tiles: [8, 8, 8], break: 'default', tool: 'wood' },
  { id: 8, name: 'leaves', solid: true, tiles: [9, 9, 9], break: 'fast', foliage: true },
  { id: 9, name: 'glass', solid: true, tiles: [10, 10, 10], break: 'slow', transparent: true },
  { id: 10, name: 'brick', solid: true, tiles: [11, 11, 11], break: 'slow', tool: 'stone' },
  { id: 11, name: 'glow', solid: true, tiles: [12, 12, 12], break: 'default', emissive: true },
  { id: 12, name: 'snow', solid: true, tiles: [13, 2, 14], break: 'fast' },
  { id: 13, name: 'water', solid: false, tiles: [15, 15, 15], break: 'default', liquid: true, transparent: true },
  { id: 14, name: 'slate', solid: true, tiles: [16, 16, 16], break: 'slow', tool: 'stone' },
  { id: 15, name: 'tall_grass', solid: false, tiles: [22, 22, 22], break: 'fast', transparent: true, decor: true },
  { id: 16, name: 'flower_red', solid: false, tiles: [23, 23, 23], break: 'fast', transparent: true, decor: true },
  { id: 17, name: 'flower_yellow', solid: false, tiles: [24, 24, 24], break: 'fast', transparent: true, decor: true },
  { id: 18, name: 'fern', solid: false, tiles: [25, 25, 25], break: 'fast', transparent: true, decor: true },
  { id: 19, name: 'clover', solid: false, tiles: [26, 26, 26], break: 'fast', transparent: true, decor: true },
  { id: 20, name: 'table', solid: true, tiles: [27, 8, 28], break: 'default', tool: 'wood', interactive: 'crafting' },
  { id: 21, name: 'coal_ore', solid: true, tiles: [29, 29, 29], break: 'slow', tool: 'stone' },
  { id: 22, name: 'iron_ore', solid: true, tiles: [30, 30, 30], break: 'slow', tool: 'stone' },
  { id: 23, name: 'gold_ore', solid: true, tiles: [31, 31, 31], break: 'slow', tool: 'stone' },
  { id: 24, name: 'diamond_ore', solid: true, tiles: [32, 32, 32], break: 'slow', tool: 'stone' },
  { id: 25, name: 'gravel', solid: true, tiles: [33, 33, 33], break: 'fast' },
  { id: 26, name: 'sandstone', solid: true, tiles: [34, 34, 34], break: 'slow', tool: 'stone' },
  { id: 27, name: 'ice', solid: true, tiles: [35, 35, 35], break: 'slow', tool: 'stone', transparent: true },
  { id: 28, name: 'mossy', solid: true, tiles: [36, 36, 36], break: 'slow', tool: 'stone' },
  { id: 29, name: 'birch_log', solid: true, tiles: [38, 38, 37], break: 'default', tool: 'wood' },
  { id: 30, name: 'birch_leaves', solid: true, tiles: [39, 39, 39], break: 'fast', foliage: true, tool: 'wood' },
  { id: 31, name: 'spruce_log', solid: true, tiles: [41, 41, 40], break: 'default', tool: 'wood' },
  { id: 32, name: 'spruce_leaves', solid: true, tiles: [42, 42, 42], break: 'fast', foliage: true, tool: 'wood' },
  { id: 33, name: 'cactus', solid: true, tiles: [44, 44, 43], break: 'default', tool: 'wood' },
  { id: 34, name: 'obsidian', solid: true, tiles: [45, 45, 45], break: 'slow', tool: 'stone' },
  { id: 35, name: 'plank_slab', solid: true, tiles: [8, 8, 8], break: 'default', tool: 'wood', shape: 'slab', slab: true, half: 'bottom' },
  { id: 36, name: 'torch', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, decor: true, transparent: true, emissive: true },
  { id: 37, name: 'furnace', solid: true, tiles: [46, 46, 47, 48], break: 'slow', tool: 'stone', interactive: 'furnace' },
  { id: 38, name: 'plank_slab_top', solid: true, tiles: [8, 8, 8], break: 'default', tool: 'wood', shape: 'slab', slab: true, half: 'top' },
  { id: 39, name: 'cobble_slab', solid: true, tiles: [4, 4, 4], break: 'slow', tool: 'stone', shape: 'slab', slab: true, half: 'bottom' },
  { id: 40, name: 'cobble_slab_top', solid: true, tiles: [4, 4, 4], break: 'slow', tool: 'stone', shape: 'slab', slab: true, half: 'top' },
  { id: 41, name: 'wall_torch', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, decor: true, transparent: true, emissive: true },
];

// Названия для UI
export const BLOCK_NAMES = {
  ru: {
    1: 'Дёрн', 2: 'Земля', 3: 'Камень', 4: 'Булыжник', 5: 'Песок',
    6: 'Бревно', 7: 'Доски', 8: 'Листва', 9: 'Стекло', 10: 'Кирпич',
    11: 'Светокамень', 12: 'Снег', 13: 'Вода', 14: 'Сланец',
    15: 'Трава', 16: 'Красный цветок', 17: 'Жёлтый цветок',
    18: 'Папоротник', 19: 'Клевер', 20: 'Верстак',
    21: 'Угольная руда', 22: 'Железная руда', 23: 'Золотая руда', 24: 'Алмазная руда',
    25: 'Гравий', 26: 'Песчаник', 27: 'Лёд', 28: 'Мшистый камень',
    29: 'Берёза', 30: 'Берёзовая листва', 31: 'Ель', 32: 'Еловая хвоя',
    33: 'Кактус', 34: 'Обсидиан',
    35: 'Деревянный полублок', 36: 'Факел', 37: 'Печка',
    38: 'Деревянный полублок', 39: 'Каменный полублок', 40: 'Каменный полублок',
    41: 'Настенный факел',
  },
  en: {
    1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Cobblestone', 5: 'Sand',
    6: 'Log', 7: 'Planks', 8: 'Leaves', 9: 'Glass', 10: 'Brick',
    11: 'Glowstone', 12: 'Snow', 13: 'Water', 14: 'Slate',
    15: 'Tall grass', 16: 'Red flower', 17: 'Yellow flower',
    18: 'Fern', 19: 'Clover', 20: 'Crafting table',
    21: 'Coal ore', 22: 'Iron ore', 23: 'Gold ore', 24: 'Diamond ore',
    25: 'Gravel', 26: 'Sandstone', 27: 'Ice', 28: 'Mossy stone',
    29: 'Birch log', 30: 'Birch leaves', 31: 'Spruce log', 32: 'Spruce needles',
    33: 'Cactus', 34: 'Obsidian',
    35: 'Wooden slab', 36: 'Torch', 37: 'Furnace',
    38: 'Wooden slab', 39: 'Stone slab', 40: 'Stone slab',
    41: 'Wall torch',
  },
};

// Базовый набор (открыт сразу) и «набор строителя» (после рекламы за вознаграждение)
export const STARTER_PALETTE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.LOG, BLOCK.PLANKS,
  BLOCK.PLANK_SLAB, BLOCK.COBBLE_SLAB, BLOCK.TORCH, BLOCK.FURNACE,
];
export const BUILDER_PALETTE = [
  BLOCK.COBBLE, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK, BLOCK.GLOW, BLOCK.SNOW, BLOCK.SLATE,
  BLOCK.TALL_GRASS, BLOCK.FERN, BLOCK.CLOVER, BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW,
  BLOCK.BIRCH_LOG, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LOG, BLOCK.SPRUCE_LEAVES,
  BLOCK.SANDSTONE, BLOCK.MOSSY, BLOCK.GRAVEL, BLOCK.ICE, BLOCK.CACTUS,
  BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE, BLOCK.DIAMOND_ORE,
  BLOCK.OBSIDIAN,
];

const FULL_BOUNDS = Object.freeze({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
const LOWER = Object.freeze({ ...FULL_BOUNDS, maxY: 0.5 });
const UPPER = Object.freeze({ ...FULL_BOUNDS, minY: 0.5 });
const TORCH_BOUNDS = Object.freeze({ minX: 0.36, minY: 0, minZ: 0.36, maxX: 0.64, maxY: 0.84, maxZ: 0.64 });
const DECOR_BOUNDS = Object.freeze({ minX: 0.2, minY: 0, minZ: 0.2, maxX: 0.8, maxY: 0.55, maxZ: 0.8 });
// Настенный факел: узкая часть у стены, на которую он опирается
const WALL_TORCH_BOUNDS = {
  px: Object.freeze({ minX: 0.62, minY: 0.3, minZ: 0.4, maxX: 1, maxY: 0.88, maxZ: 0.6 }),
  nx: Object.freeze({ minX: 0, minY: 0.3, minZ: 0.4, maxX: 0.38, maxY: 0.88, maxZ: 0.6 }),
  pz: Object.freeze({ minX: 0.4, minY: 0.3, minZ: 0.62, maxX: 0.6, maxY: 0.88, maxZ: 1 }),
  nz: Object.freeze({ minX: 0.4, minY: 0.3, minZ: 0, maxX: 0.6, maxY: 0.88, maxZ: 0.38 }),
};
export function isWallTorch(id) { return BLOCKS[id]?.wallTorch === true; }
export function isTorch(id) { return BLOCKS[id]?.torch === true; }

/** На какое твёрдое основание опирается блок: 'py' — снизу, иначе сторона стены. */
export function torchSupport(id, world, x, y, z) {
  if (!isWallTorch(id)) return isSolid(world.getBlock(x, y - 1, z)) ? 'ny' : null;
  for (const [side, dx, dy, dz] of [['px', 1, 0, 0], ['nx', -1, 0, 0], ['pz', 0, 0, 1], ['nz', 0, 0, -1]]) {
    if (isSolid(world.getBlock(x + dx, y + dy, z + dz))) return side;
  }
  return null;
}

/** Сторона стены, к которой прикреплён настенный факел (или null) */
export function wallTorchSide(world, x, y, z) {
  const side = torchSupport(BLOCKS.WALL_TORCH, world, x, y, z);
  return side === 'ny' ? null : side;
}

export function blockBounds(id, side = 'px') {
  const b = BLOCKS[id];
  if (b?.shape === 'slab') return b.half === 'top' ? UPPER : LOWER;
  if (b?.wallTorch) return WALL_TORCH_BOUNDS[side] || WALL_TORCH_BOUNDS.px;
  if (b?.shape === 'torch') return TORCH_BOUNDS;
  return b?.decor ? DECOR_BOUNDS : FULL_BOUNDS;
}
export function isSlab(id) { return BLOCKS[id]?.shape === 'slab'; }
export function isSolid(id) { return !!BLOCKS[id]?.solid; }
export function isOpaque(id) {
  const b = BLOCKS[id];
  return !!(b && id !== BLOCK.AIR && !b.transparent && !b.foliage && !b.shape);
}
export function isDecor(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].decor);
}
export function isFoliage(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].foliage);
}
export function isLiquid(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].liquid);
}
/** Блок открывает свой интерфейс при использовании (верстак — крафт 3x3) */
export function interactiveKind(id) {
  return (id !== 0 && BLOCKS[id] && BLOCKS[id].interactive) || null;
}

export function breakKind(id) {
  return (BLOCKS[id] && BLOCKS[id].break) || 'default';
}
