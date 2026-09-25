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
  WALL_TORCH: 41,   // старый настенный факел: сторона берётся из соседнего блока
  // Настенные факелы с явной стороной крепления (стена со стороны +X, −X, +Z, −Z)
  WALL_TORCH_PX: 42,
  WALL_TORCH_NX: 43,
  WALL_TORCH_PZ: 44,
  WALL_TORCH_NZ: 45,
  // Сундук: 4 варианта — лицевой стороной к игроку при установке
  CHEST: 46,        // лицом к +Z
  CHEST_NZ: 47,
  CHEST_PX: 48,
  CHEST_NX: 49,
  // Новые блоки: берёзовые доски, забор и наковальня
  BIRCH_PLANKS: 50,
  FENCE: 51,
  ANVIL: 52,
  // Природа: заснеженный песок, пещерные лианы и светящийся гриб
  SNOWY_SAND: 53,
  VINE: 54,
  GLOW_SHROOM: 55,
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
  { id: 41, name: 'wall_torch', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, decor: true, transparent: true, emissive: true, variant: true },
  { id: 42, name: 'wall_torch_px', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, wallSide: 'px', decor: true, transparent: true, emissive: true, variant: true },
  { id: 43, name: 'wall_torch_nx', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, wallSide: 'nx', decor: true, transparent: true, emissive: true, variant: true },
  { id: 44, name: 'wall_torch_pz', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, wallSide: 'pz', decor: true, transparent: true, emissive: true, variant: true },
  { id: 45, name: 'wall_torch_nz', solid: false, tiles: [49, 49, 49], break: 'fast', shape: 'torch', torch: true, wallTorch: true, wallSide: 'nz', decor: true, transparent: true, emissive: true, variant: true },
  { id: 46, name: 'chest', solid: true, tiles: [53, 53, 54, 55], front: 'pz', break: 'default', tool: 'wood', interactive: 'chest', chest: true },
  { id: 47, name: 'chest_nz', solid: true, tiles: [53, 53, 54, 55], front: 'nz', break: 'default', tool: 'wood', interactive: 'chest', chest: true, variant: true },
  { id: 48, name: 'chest_px', solid: true, tiles: [53, 53, 54, 55], front: 'px', break: 'default', tool: 'wood', interactive: 'chest', chest: true, variant: true },
  { id: 49, name: 'chest_nx', solid: true, tiles: [53, 53, 54, 55], front: 'nx', break: 'default', tool: 'wood', interactive: 'chest', chest: true, variant: true },
  { id: 50, name: 'birch_planks', solid: true, tiles: [56, 56, 56], break: 'default', tool: 'wood' },
  // Забор: твёрдый, но занимает только середину клетки (столбик) — через него видно
  { id: 51, name: 'fence', solid: true, tiles: [57, 57, 57], break: 'default', tool: 'wood', shape: 'fence', fence: true },
  // Наковальня: станция для инструментов выше каменных
  { id: 52, name: 'anvil', solid: true, tiles: [58, 58, 59, 60], front: 'pz', break: 'slow', tool: 'stone', interactive: 'anvil', anvil: true },
  // Заснеженный песок: песчаный пляж холодных зон со снежной коркой
  { id: 53, name: 'snowy_sand', solid: true, tiles: [13, 5, 61], break: 'fast' },
  // Пещерная лиана: свисает с потолка, срывается мгновенно
  { id: 54, name: 'vine', solid: false, tiles: [62, 62, 62], break: 'fast', transparent: true, decor: true, hang: true },
  // Светящийся пещерный гриб: растение, которое немного освещает вокруг
  { id: 55, name: 'glow_shroom', solid: false, tiles: [63, 63, 63], break: 'fast', transparent: true, decor: true, emissive: true, lightRadius: 5.5 },
];

// Плотная (без просветов) текстура листвы для внутренних граней кроны
export const DENSE_FOLIAGE_TILE = { 9: 50, 39: 51, 42: 52 };

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
    41: 'Настенный факел', 42: 'Настенный факел', 43: 'Настенный факел', 44: 'Настенный факел', 45: 'Настенный факел',
    46: 'Сундук', 47: 'Сундук', 48: 'Сундук', 49: 'Сундук',
    50: 'Берёзовые доски', 51: 'Забор', 52: 'Наковальня',
    53: 'Заснеженный песок', 54: 'Лиана', 55: 'Светящийся гриб',
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
    41: 'Wall torch', 42: 'Wall torch', 43: 'Wall torch', 44: 'Wall torch', 45: 'Wall torch',
    46: 'Chest', 47: 'Chest', 48: 'Chest', 49: 'Chest',
    50: 'Birch planks', 51: 'Fence', 52: 'Anvil',
    53: 'Snowy sand', 54: 'Vine', 55: 'Glow mushroom',
  },
};

// Базовый набор (открыт сразу) и «набор строителя» (после рекламы за вознаграждение)
export const STARTER_PALETTE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.SAND, BLOCK.LOG, BLOCK.PLANKS,
  BLOCK.BIRCH_PLANKS, BLOCK.PLANK_SLAB, BLOCK.COBBLE_SLAB, BLOCK.FENCE,
  BLOCK.TORCH, BLOCK.FURNACE, BLOCK.CHEST, BLOCK.ANVIL,
];
export const BUILDER_PALETTE = [
  BLOCK.COBBLE, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK, BLOCK.GLOW, BLOCK.SNOW, BLOCK.SLATE,
  BLOCK.TALL_GRASS, BLOCK.FERN, BLOCK.CLOVER, BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW,
  BLOCK.BIRCH_LOG, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LOG, BLOCK.SPRUCE_LEAVES,
  BLOCK.SANDSTONE, BLOCK.MOSSY, BLOCK.GRAVEL, BLOCK.ICE, BLOCK.CACTUS,
  BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE, BLOCK.DIAMOND_ORE,
  BLOCK.OBSIDIAN, BLOCK.VINE, BLOCK.GLOW_SHROOM,
];

const FULL_BOUNDS = Object.freeze({ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 });
const LOWER = Object.freeze({ ...FULL_BOUNDS, maxY: 0.5 });
const UPPER = Object.freeze({ ...FULL_BOUNDS, minY: 0.5 });
// Забор: столбик в центре клетки, чуть выше блока — через него не перепрыгнуть
const FENCE_BOUNDS = Object.freeze({ minX: 0.375, minY: 0, minZ: 0.375, maxX: 0.625, maxY: 1.5, maxZ: 0.625 });
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

const SIDE_OFFSETS = { px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
/** Настенный факел, который крепится к стене со стороны side */
export const WALL_TORCH_BY_SIDE = { px: 42, nx: 43, pz: 44, nz: 45 };
/** Вариант блока-варианта (настенный факел с явной стороной, повёрнутый сундук) */
export function isVariantBlock(id) { return BLOCKS[id]?.variant === true; }
export function isChest(id) { return BLOCKS[id]?.chest === true; }
/** Сундук, повёрнутый лицом в сторону side */
export const CHEST_BY_FRONT = { pz: 46, nz: 47, px: 48, nx: 49 };

/** На какое твёрдое основание опирается блок: 'ny' — снизу, иначе сторона стены. */
export function torchSupport(id, world, x, y, z) {
  if (!isWallTorch(id)) return isSolid(world.getBlock(x, y - 1, z)) ? 'ny' : null;
  const fixed = BLOCKS[id].wallSide;
  if (fixed) {
    const [dx, dy, dz] = SIDE_OFFSETS[fixed];
    return isSolid(world.getBlock(x + dx, y + dy, z + dz)) ? fixed : null;
  }
  for (const [side, dx, dy, dz] of [['px', 1, 0, 0], ['nx', -1, 0, 0], ['pz', 0, 0, 1], ['nz', 0, 0, -1]]) {
    if (isSolid(world.getBlock(x + dx, y + dy, z + dz))) return side;
  }
  return null;
}

/** Сторона стены, к которой прикреплён настенный факел (или null) */
export function wallTorchSide(world, x, y, z, id = BLOCK.WALL_TORCH) {
  const fixed = BLOCKS[id]?.wallSide;
  if (fixed) return fixed;
  const side = torchSupport(BLOCK.WALL_TORCH, world, x, y, z);
  return side === 'ny' ? null : side;
}

export function blockBounds(id, side = 'px') {
  const b = BLOCKS[id];
  if (b?.shape === 'slab') return b.half === 'top' ? UPPER : LOWER;
  if (b?.shape === 'fence') return FENCE_BOUNDS;
  if (b?.wallTorch) return WALL_TORCH_BOUNDS[side] || WALL_TORCH_BOUNDS.px;
  if (b?.shape === 'torch') return TORCH_BOUNDS;
  return b?.decor ? DECOR_BOUNDS : FULL_BOUNDS;
}
export function isSlab(id) { return BLOCKS[id]?.shape === 'slab'; }
export function isFence(id) { return BLOCKS[id]?.fence === true; }
/** Блок нестандартной формы (плита, забор, факел, растение) — не полный куб */
export function isShaped(id) { return !!BLOCKS[id]?.shape; }

/**
 * Пара «низ + верх» для полублоков: если поставить два одинаковых полублока
 * друг на друга, они превращаются в полный блок.
 * @returns {[number, number]|null} [нижний, верхний] id для этого полублока
 */
export function slabPair(id) {
  if (id === BLOCK.PLANK_SLAB || id === BLOCK.PLANK_SLAB_TOP) return [BLOCK.PLANK_SLAB, BLOCK.PLANK_SLAB_TOP];
  if (id === BLOCK.COBBLE_SLAB || id === BLOCK.COBBLE_SLAB_TOP) return [BLOCK.COBBLE_SLAB, BLOCK.COBBLE_SLAB_TOP];
  return null;
}
/** Полный блок, который получается из двух таких полублоков (или null) */
export function slabFullBlock(id) {
  if (id === BLOCK.PLANK_SLAB || id === BLOCK.PLANK_SLAB_TOP) return BLOCK.PLANKS;
  if (id === BLOCK.COBBLE_SLAB || id === BLOCK.COBBLE_SLAB_TOP) return BLOCK.COBBLE;
  return null;
}
/** Предмет, который выпадает из полублока (верхняя плита даёт обычную плиту) */
export function slabDropItem(id) {
  if (id === BLOCK.PLANK_SLAB || id === BLOCK.PLANK_SLAB_TOP) return BLOCK.PLANK_SLAB;
  if (id === BLOCK.COBBLE_SLAB || id === BLOCK.COBBLE_SLAB_TOP) return BLOCK.COBBLE_SLAB;
  return id;
}
export function isAnvil(id) { return BLOCKS[id]?.anvil === true; }
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
