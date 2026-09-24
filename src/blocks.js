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
  GRASS_TALL: 15,
  FLOWER_RED: 16,
  FLOWER_YELLOW: 17,
};

// tiles: [top, bottom, side] — индексы тайлов атласа
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
  // Растения: не твердые, ломаются мгновенно, ставятся как крест из плоскостей
  { id: 15, name: 'grass_tall', solid: false, tiles: [17, 17, 17], break: 'instant', plant: true, transparent: true },
  { id: 16, name: 'flower_red', solid: false, tiles: [18, 18, 18], break: 'instant', plant: true, transparent: true },
  { id: 17, name: 'flower_yellow', solid: false, tiles: [19, 19, 19], break: 'instant', plant: true, transparent: true },
];

// Названия для UI
export const BLOCK_NAMES = {
  ru: {
    1: 'Дёрн', 2: 'Земля', 3: 'Камень', 4: 'Булыжник', 5: 'Песок',
    6: 'Бревно', 7: 'Доски', 8: 'Листва', 9: 'Стекло', 10: 'Кирпич',
    11: 'Светокамень', 12: 'Снег', 13: 'Вода', 14: 'Сланец',
    15: 'Трава', 16: 'Красный цветок', 17: 'Жёлтый цветок',
  },
  en: {
    1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Cobblestone', 5: 'Sand',
    6: 'Log', 7: 'Planks', 8: 'Leaves', 9: 'Glass', 10: 'Brick',
    11: 'Glowstone', 12: 'Snow', 13: 'Water', 14: 'Slate',
    15: 'Tall grass', 16: 'Red flower', 17: 'Yellow flower',
  },
};

// Базовый набор (открыт сразу) и «набор строителя» (после рекламы за вознаграждение)
export const STARTER_PALETTE = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.LOG, BLOCK.PLANKS];
export const BUILDER_PALETTE = [
  BLOCK.COBBLE, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK, BLOCK.GLOW,
  BLOCK.SNOW, BLOCK.SLATE, BLOCK.GRASS_TALL, BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW,
];

export function isSolid(id) {
  return id !== 0 && BLOCKS[id] && BLOCKS[id].solid;
}
export function isOpaque(id) {
  return id !== 0 && BLOCKS[id] && !BLOCKS[id].transparent && !BLOCKS[id].foliage;
}
export function isFoliage(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].foliage);
}
export function isLiquid(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].liquid);
}
export function isPlant(id) {
  return !!(id !== 0 && BLOCKS[id] && BLOCKS[id].plant);
}
export function breakKind(id) {
  return (BLOCKS[id] && BLOCKS[id].break) || 'default';
}
