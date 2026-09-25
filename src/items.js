// Предметы: единый реестр (блоки, палка, яблоко, инструменты) + физические дропы в мире
import * as THREE from 'three';
import { BLOCK, BLOCKS, BLOCK_NAMES } from './blocks.js';
import { CONFIG } from './config.js';

// ---------------------------------------------------------------- Реестр предметов
// Ключ предмета — строка: 'block_<id>' для блоков и короткий код для остального.
export const ITEM = {
  STICK: 'stick',
  APPLE: 'apple',
  BOW: 'bow',
  ARROW: 'arrow',
  WOOD_PICKAXE: 'tool_wood_pickaxe',
  WOOD_AXE: 'tool_wood_axe',
  WOOD_SWORD: 'tool_wood_sword',
  STONE_PICKAXE: 'tool_stone_pickaxe',
  STONE_AXE: 'tool_stone_axe',
  STONE_SWORD: 'tool_stone_sword',
  COAL: 'coal',
  RAW_IRON: 'raw_iron',
  RAW_GOLD: 'raw_gold',
  DIAMOND: 'diamond',
  BREAD: 'bread',
  WHEAT: 'wheat',
  IRON_INGOT: 'iron_ingot',
  GOLD_INGOT: 'gold_ingot',
  XP: 'xp',
};

export function blockItem(id) { return 'block_' + id; }
export function isBlockItem(key) { return typeof key === 'string' && key.startsWith('block_'); }
export function blockIdOf(key) { return Number(String(key).slice(6)); }

// kind: 'block' | 'item' | 'tool'
// tool: 'pickaxe' | 'axe' | 'sword' — влияет на скорость ломания и урон
export const ITEMS = {
  [ITEM.STICK]: {
    kind: 'item', max: 64, icon: 'stick',
    name: { ru: 'Палка', en: 'Stick' },
  },
  [ITEM.APPLE]: {
    kind: 'item', max: 64, icon: 'apple', food: 4,
    name: { ru: 'Яблоко', en: 'Apple' },
  },
  [ITEM.BOW]: {
    kind: 'item', max: 1, icon: 'bow',
    name: { ru: 'Лук', en: 'Bow' },
  },
  [ITEM.ARROW]: {
    kind: 'item', max: 64, icon: 'arrow',
    name: { ru: 'Стрела', en: 'Arrow' },
  },
  [ITEM.WOOD_PICKAXE]: {
    kind: 'tool', tool: 'pickaxe', tier: 'wood', max: 1, icon: 'wood_pickaxe',
    speed: 0.85, damage: 1,
    name: { ru: 'Деревянная кирка', en: 'Wooden pickaxe' },
  },
  [ITEM.WOOD_AXE]: {
    kind: 'tool', tool: 'axe', tier: 'wood', max: 1, icon: 'wood_axe',
    speed: 0.5, damage: 1,
    name: { ru: 'Деревянный топор', en: 'Wooden axe' },
  },
  [ITEM.WOOD_SWORD]: {
    kind: 'tool', tool: 'sword', tier: 'wood', max: 1, icon: 'wood_sword',
    speed: 1, damage: 2,
    name: { ru: 'Деревянный меч', en: 'Wooden sword' },
  },
  [ITEM.STONE_PICKAXE]: {
    kind: 'tool', tool: 'pickaxe', tier: 'stone', max: 1, icon: 'stone_pickaxe',
    speed: 0.55, damage: 1,
    name: { ru: 'Каменная кирка', en: 'Stone pickaxe' },
  },
  [ITEM.STONE_AXE]: {
    kind: 'tool', tool: 'axe', tier: 'stone', max: 1, icon: 'stone_axe',
    speed: 0.32, damage: 3,
    name: { ru: 'Каменный топор', en: 'Stone axe' },
  },
  [ITEM.STONE_SWORD]: {
    kind: 'tool', tool: 'sword', tier: 'stone', max: 1, icon: 'stone_sword',
    speed: 1, damage: 3,
    name: { ru: 'Каменный меч', en: 'Stone sword' },
  },
  [ITEM.COAL]: {
    kind: 'item', max: 64, icon: 'coal',
    name: { ru: 'Уголь', en: 'Coal' },
  },
  [ITEM.RAW_IRON]: {
    kind: 'item', max: 64, icon: 'raw_iron',
    name: { ru: 'Железная руда', en: 'Raw iron' },
  },
  [ITEM.RAW_GOLD]: {
    kind: 'item', max: 64, icon: 'raw_gold',
    name: { ru: 'Золотая руда', en: 'Raw gold' },
  },
  [ITEM.DIAMOND]: {
    kind: 'item', max: 64, icon: 'diamond',
    name: { ru: 'Алмаз', en: 'Diamond' },
  },
  [ITEM.BREAD]: {
    kind: 'item', max: 64, icon: 'bread', food: 6,
    name: { ru: 'Хлеб', en: 'Bread' },
  },
  [ITEM.WHEAT]: {
    kind: 'item', max: 64, icon: 'wheat',
    name: { ru: 'Пшеница', en: 'Wheat' },
  },
  [ITEM.IRON_INGOT]: {
    kind: 'item', max: 64, icon: 'iron_ingot',
    name: { ru: 'Железный слиток', en: 'Iron ingot' },
  },
  [ITEM.GOLD_INGOT]: {
    kind: 'item', max: 64, icon: 'gold_ingot',
    name: { ru: 'Золотой слиток', en: 'Gold ingot' },
  },
  [ITEM.XP]: {
    kind: 'item', max: 9999, icon: 'xp',
    name: { ru: 'Опыт', en: 'Experience' },
  },
};

const BLOCK_DETAILS = {
  [BLOCK.GRASS]: { ru: 'Верхний слой земли на равнинах. Подходит для строительства и озеленения.', en: 'The grassy surface layer. Useful for building and landscaping.' },
  [BLOCK.DIRT]: { ru: 'Мягкая порода для простых построек; из неё растёт трава.', en: 'Soft soil for simple builds; grass can grow on it.' },
  [BLOCK.STONE]: { ru: 'Прочная порода. Добывайте киркой; выпадает булыжник.', en: 'A sturdy rock. Mine with a pickaxe; drops cobblestone.' },
  [BLOCK.COBBLE]: { ru: 'Булыжник для прочных стен, печки и каменных инструментов.', en: 'A sturdy building block, also used for furnaces and stone tools.' },
  [BLOCK.SAND]: { ru: 'Песок пляжей и пустынь. Переплавляется в стекло.', en: 'Beach and desert sand. Smelt it in a furnace to make glass.' },
  [BLOCK.LOG]: { ru: 'Бревно дерева. Перерабатывается в доски; годится на топливо.', en: 'Tree trunk. Craft it into planks or use it as fuel.' },
  [BLOCK.PLANKS]: { ru: 'Деревянные доски для построек, верстака и инструментов.', en: 'Wooden boards for building, crafting tables and tools.' },
  [BLOCK.LEAVES]: { ru: 'Листва дерева. Быстро ломается; иногда даёт яблоко.', en: 'Tree foliage. Breaks quickly and may drop an apple.' },
  [BLOCK.GLASS]: { ru: 'Прозрачный декоративный блок. Получается из песка в печи.', en: 'A transparent decorative block, smelted from sand.' },
  [BLOCK.BRICK]: { ru: 'Декоративный прочный блок для стен и построек.', en: 'A sturdy decorative block for walls and builds.' },
  [BLOCK.GLOW]: { ru: 'Светящийся блок — осветите им пещеру или постройку.', en: 'A glowing block for lighting caves and builds.' },
  [BLOCK.SNOW]: { ru: 'Снежный блок из холодных биомов; лёгкий строительный материал.', en: 'A snow block from cold biomes; a lightweight building material.' },
  [BLOCK.SLATE]: { ru: 'Тёмная порода глубин. Очень прочная и медленно добывается.', en: 'A dark deep-rock block. Very sturdy and slow to mine.' },
  [BLOCK.TALL_GRASS]: { ru: 'Декоративная трава. Иногда даёт пшеницу при сборе.', en: 'Decorative grass. May yield wheat when gathered.' },
  [BLOCK.FLOWER_RED]: { ru: 'Красный цветок для украшения участка.', en: 'A red flower for decorating your surroundings.' },
  [BLOCK.FLOWER_YELLOW]: { ru: 'Жёлтый цветок для украшения участка.', en: 'A yellow flower for decorating your surroundings.' },
  [BLOCK.FERN]: { ru: 'Папоротник — декоративное растение для леса и сада.', en: 'A fern, useful for decorating forests and gardens.' },
  [BLOCK.CLOVER]: { ru: 'Низкий декоративный клевер.', en: 'A low decorative clover plant.' },
  [BLOCK.TABLE]: { ru: 'Верстак открывает сетку крафта 3×3. Поставьте и нажмите ПКМ.', en: 'Opens the 3×3 crafting grid. Place it and right-click.' },
  [BLOCK.COAL_ORE]: { ru: 'Руда для добычи угля. Каменная кирка помогает быстрее.', en: 'Coal-bearing rock. A stone pickaxe mines it faster.' },
  [BLOCK.IRON_ORE]: { ru: 'Железная руда. Выплавьте её с углём, чтобы получить слиток.', en: 'Iron ore. Smelt it with coal to produce an ingot.' },
  [BLOCK.GOLD_ORE]: { ru: 'Золотая руда. Выплавьте её с углём, чтобы получить слиток.', en: 'Gold ore. Smelt it with coal to produce an ingot.' },
  [BLOCK.DIAMOND_ORE]: { ru: 'Редкая алмазная руда. Добывается каменной киркой.', en: 'Rare diamond ore. Mine it with a stone pickaxe.' },
  [BLOCK.GRAVEL]: { ru: 'Рыхлый гравий из подземных отложений.', en: 'Loose gravel found in underground deposits.' },
  [BLOCK.SANDSTONE]: { ru: 'Сплошной песчаник пустынь.', en: 'Solid sandstone from desert regions.' },
  [BLOCK.ICE]: { ru: 'Лёд из холодных биомов. Скользкий и полупрозрачный.', en: 'Ice from cold biomes. Slippery and translucent.' },
  [BLOCK.MOSSY]: { ru: 'Камень, покрытый мхом; часто встречается в пещерах.', en: 'Moss-covered stone often found in caves.' },
  [BLOCK.BIRCH_LOG]: { ru: 'Светлое берёзовое бревно. Перерабатывается в доски.', en: 'Pale birch wood. Can be crafted into planks.' },
  [BLOCK.BIRCH_LEAVES]: { ru: 'Берёзовая листва для природного декора.', en: 'Birch foliage for natural-looking decoration.' },
  [BLOCK.SPRUCE_LOG]: { ru: 'Еловое бревно. Подходит для построек и как топливо.', en: 'Spruce wood for building or use as fuel.' },
  [BLOCK.SPRUCE_LEAVES]: { ru: 'Еловая хвоя для декора и крыш.', en: 'Spruce needles for decoration and roofs.' },
  [BLOCK.CACTUS]: { ru: 'Кактус пустыни. Высокое декоративное растение.', en: 'A tall decorative plant from the desert.' },
  [BLOCK.OBSIDIAN]: { ru: 'Очень твёрдый тёмный блок для прочных построек.', en: 'An exceptionally hard dark block for durable builds.' },
  [BLOCK.SLAB]: { ru: 'Деревянная плита высотой в половину обычного блока.', en: 'A half-height wooden building slab.' },
  [BLOCK.PLANK_SLAB_TOP]: { ru: 'Верхняя деревянная плита для ступеней и перекрытий.', en: 'A top wooden slab for steps and ceilings.' },
  [BLOCK.COBBLE_SLAB]: { ru: 'Каменная плита высотой в половину обычного блока.', en: 'A half-height cobblestone building slab.' },
  [BLOCK.COBBLE_SLAB_TOP]: { ru: 'Верхняя каменная плита для ступеней и перекрытий.', en: 'A top cobblestone slab for steps and ceilings.' },
  [BLOCK.TORCH]: { ru: 'Светильник для освещения тёмных мест.', en: 'A small light source for dark places.' },
  [BLOCK.FURNACE]: { ru: 'Печь для переплавки руды и песка. Положите сырьё и топливо, затем нажмите ПКМ.', en: 'Smelts ore and sand. Add an ingredient and fuel, then right-click.' },
  [BLOCK.WALL_TORCH]: { ru: 'Тот же светильник, но висит на стене — поставьте факел на боковой блок.', en: 'The same light source, mounted on a wall: place a torch against a side block.' },
};

const ITEM_DETAILS = {
  [ITEM.STICK]: { ru: 'Материал для рукоятей инструментов, лука и стрел.', en: 'A crafting material for tool handles, bows and arrows.' },
  [ITEM.APPLE]: { ru: 'Еда: восстановит до 4 единиц здоровья. Удерживайте ЛКМ или нажмите F.', en: 'Food: restores up to 4 health. Hold left mouse or press F to eat.' },
  [ITEM.BOW]: { ru: 'Дальнее оружие. Удерживайте ПКМ, чтобы натянуть тетиву, затем отпустите.', en: 'Ranged weapon. Hold right mouse to draw, then release to fire.' },
  [ITEM.ARROW]: { ru: 'Боеприпас для лука. Можно подобрать после попадания в блок.', en: 'Ammunition for the bow. Can be picked up after hitting a block.' },
  [ITEM.WOOD_PICKAXE]: { ru: 'Ускоряет добычу камня и руд. Урон по мобу: 1.', en: 'Speeds up mining stone and ore. Mob damage: 1.' },
  [ITEM.WOOD_AXE]: { ru: 'Ускоряет добычу брёвен и деревянных блоков. Урон по мобу: 1.', en: 'Speeds up mining logs and wooden blocks. Mob damage: 1.' },
  [ITEM.WOOD_SWORD]: { ru: 'Оружие ближнего боя. Урон по мобу: 2.', en: 'A melee weapon. Mob damage: 2.' },
  [ITEM.STONE_PICKAXE]: { ru: 'Быстрее деревянной кирки добывает камень и руды. Урон: 1.', en: 'Mines stone and ore faster than a wooden pickaxe. Damage: 1.' },
  [ITEM.STONE_AXE]: { ru: 'Быстро рубит брёвна и деревянные блоки. Урон по мобу: 3.', en: 'Chops logs and wooden blocks quickly. Mob damage: 3.' },
  [ITEM.STONE_SWORD]: { ru: 'Прочный меч для ближнего боя. Урон по мобу: 3.', en: 'A sturdy melee weapon. Mob damage: 3.' },
  [ITEM.COAL]: { ru: 'Топливо для печи. Одной порции хватает примерно на две плавки.', en: 'Furnace fuel. One piece lasts for about two smelts.' },
  [ITEM.RAW_IRON]: { ru: 'Сырьё из железной руды. Переплавьте в печи, чтобы получить слиток.', en: 'Raw ore from iron deposits. Smelt it in a furnace to make an ingot.' },
  [ITEM.RAW_GOLD]: { ru: 'Сырьё из золотой руды. Переплавьте в печи, чтобы получить слиток.', en: 'Raw ore from gold deposits. Smelt it in a furnace to make an ingot.' },
  [ITEM.DIAMOND]: { ru: 'Редкий драгоценный материал из алмазной руды.', en: 'A rare gem recovered from diamond ore.' },
  [ITEM.BREAD]: { ru: 'Еда: восстановит до 6 единиц здоровья. Удерживайте ЛКМ или нажмите F.', en: 'Food: restores up to 6 health. Hold left mouse or press F to eat.' },
  [ITEM.WHEAT]: { ru: 'Соберите три пшеницы и скрафтите хлеб.', en: 'Combine three wheat to craft bread.' },
  [ITEM.IRON_INGOT]: { ru: 'Готовый железный слиток после плавки руды.', en: 'An iron ingot produced by smelting raw iron.' },
  [ITEM.GOLD_INGOT]: { ru: 'Готовый золотой слиток после плавки руды.', en: 'A gold ingot produced by smelting raw gold.' },
  [ITEM.XP]: { ru: 'Опыт, который дают мобы. Подойдите к светящемуся шару, чтобы собрать.', en: 'Experience dropped by mobs. Walk close to a glowing orb to collect it.' },
};

const _defCache = new Map();

/**
 * Сытость предмета: сколько единиц здоровья он восстанавливает.
 * 0 — предмет несъедобный.
 */
export function foodValue(key) {
  const def = itemDef(key);
  return def && def.kind === 'item' && def.food > 0 ? def.food : 0;
}

/** Съедобный предмет? */
export function isFood(key) {
  return foodValue(key) > 0;
}

export function itemDef(key) {
  if (!key) return null;
  if (_defCache.has(key)) return _defCache.get(key);
  let def = null;
  if (isBlockItem(key)) {
    const id = blockIdOf(key);
    const b = BLOCKS[id];
    if (b && id !== BLOCK.AIR && id !== BLOCK.WATER) {
      def = { key, kind: 'block', block: id, max: 64, icon: 'cube' };
    }
  } else if (ITEMS[key]) {
    def = { key, ...ITEMS[key] };
  }
  _defCache.set(key, def);
  return def;
}

export function itemExists(key) { return !!itemDef(key); }

export function maxStack(key) {
  const d = itemDef(key);
  return d ? d.max : 64;
}

/** Урон удара предметом (рукой — 1) */
export function itemDamage(key) {
  const d = itemDef(key);
  return d && d.damage ? d.damage : 1;
}

export function toolKind(key) {
  const d = itemDef(key);
  return d && d.kind === 'tool' ? d.tool : null;
}

export function itemName(key, lang = 'ru') {
  const d = itemDef(key);
  if (!d) return '';
  if (d.kind === 'block') {
    return BLOCK_NAMES[lang]?.[d.block] || BLOCK_NAMES.ru[d.block] || '';
  }
  return d.name?.[lang] || d.name?.ru || key;
}

/** Краткое назначение предмета/блока для подсказок и меню крафта */
export function itemDescription(key, lang = 'ru') {
  const d = itemDef(key);
  if (!d) return '';
  if (d.kind === 'block') {
    return BLOCK_DETAILS[d.block]?.[lang] || BLOCK_DETAILS[d.block]?.ru || '';
  }
  return ITEM_DETAILS[key]?.[lang] || ITEM_DETAILS[key]?.ru || '';
}

/** Можно ли поставить предмет как блок и какой id получится */
export function placeBlockId(key) {
  const d = itemDef(key);
  return d && d.kind === 'block' ? d.block : 0;
}

// ---------------------------------------------------------------- Дроп с блоков
// Выживание: трава → земля, камень → булыжник, стекло — ничего, листва — иногда листва
// Руды падают предметом-рудой (углем, сырой рудой, алмазом) — можно подобрать
export function blockDropItem(id, rng = Math.random) {
  if (!id || id === BLOCK.AIR || id === BLOCK.WATER || id === BLOCK.GLASS) return null;
  if (id === BLOCK.GRASS) return blockItem(BLOCK.DIRT);
  if (id === BLOCK.STONE) return blockItem(BLOCK.COBBLE);
  if (id === BLOCK.LEAVES) return rng() < 0.35 ? blockItem(BLOCK.LEAVES) : null;
  if (id === BLOCK.COAL_ORE) return ITEM.COAL;
  if (id === BLOCK.IRON_ORE) return ITEM.RAW_IRON;
  if (id === BLOCK.GOLD_ORE) return ITEM.RAW_GOLD;
  if (id === BLOCK.DIAMOND_ORE) return ITEM.DIAMOND;
  if (id === BLOCK.TORCH || id === BLOCK.WALL_TORCH) return blockItem(BLOCK.TORCH);
  if (id === BLOCK.SLAB) return blockItem(BLOCK.SLAB);
  if (id === BLOCK.FURNACE) return blockItem(BLOCK.FURNACE);
  // с высокой травы иногда падает пшеница для хлеба
  if (id === BLOCK.TALL_GRASS) {
    if (rng() < 0.12) return ITEM.WHEAT;
    return null;
  }
  return blockItem(id);
}

// ---------------------------------------------------------------- Ломание блоков
// Классы блоков по инструменту заданы в blocks.js полем tool: 'stone' | 'wood'
export const HAND_BREAK_MULT = { stone: 2.6, wood: 1.6 };

/**
 * Время ломания блока (секунды) с учётом режима и инструмента в руке
 * @param {number} id id блока
 * @param {string|null} heldKey предмет в руке
 * @param {'survival'|'creative'} mode
 * @param {object} [cfg] таблица времён (по умолчанию CONFIG.BREAK_TIME)
 */
export function breakTime(id, heldKey, mode = 'survival', cfg = CONFIG.BREAK_TIME) {
  if (mode === 'creative') return CONFIG.CREATIVE_BREAK_TIME;
  const def = BLOCKS[id];
  if (!def) return cfg.default;
  let t = cfg[def.break || 'default'] ?? cfg.default;
  const cls = def.tool;
  if (!cls) return t;
  const tool = toolKind(heldKey);
  if (tool === 'pickaxe' && cls === 'stone') {
    const speed = itemDef(heldKey)?.speed ?? 0.85;
    return t * speed;
  }
  if (tool === 'axe' && cls === 'wood') {
    const speed = itemDef(heldKey)?.speed ?? 0.5;
    return t * speed;
  }
  return t * (HAND_BREAK_MULT[cls] ?? 1);
}

// ---------------------------------------------------------------- Физические дропы в мире
export const ITEM_MAGNET_RANGE = 4.2;
export const ITEM_PICKUP_RANGE = 0.58;
const APPLE = { color: 0xd64545, stem: 0x6b4a2b };
const ORE_COLORS = {
  [ITEM.COAL]: 0x2e2e2e,
  [ITEM.RAW_IRON]: 0xd8d0c0,
  [ITEM.RAW_GOLD]: 0xe6c84a,
  [ITEM.DIAMOND]: 0x6af0ff,
  [ITEM.BREAD]: 0xdeba7a,
  [ITEM.WHEAT]: 0xe8d86a,
  [ITEM.STICK]: 0x8b5a2b,
};
const SLAB_BLOCKS = new Set([
  BLOCK.PLANK_SLAB, BLOCK.PLANK_SLAB_TOP, BLOCK.COBBLE_SLAB, BLOCK.COBBLE_SLAB_TOP,
]);

/**
 * Выпавшие предметы. Внешний вид собирается по ключу предмета:
 *  • блок — кубик с настоящими текстурами атласа (top/bottom/side);
 *  • инструмент, еда, руда — спрайт из иконки предмета;
 *  • факел — объёмная модель (её даёт игра через `modelFor`).
 * Провайдеры материалов приходят из main.js: в тестах и без DOM работает
 * запасной вариант — цветной кубик.
 */
export class ItemDrops {
  constructor(scene, visuals = {}) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    this.stemGeo = new THREE.BoxGeometry(0.08, 0.1, 0.08);
    this.slabGeo = new THREE.BoxGeometry(0.28, 0.14, 0.28);
    this.quadGeo = new THREE.PlaneGeometry(0.32, 0.32);
    this.mats = {
      apple: new THREE.MeshBasicMaterial({ color: APPLE.color }),
      stem: new THREE.MeshBasicMaterial({ color: APPLE.stem }),
    };
    // Pre-make mats for ore items
    this._itemMats = new Map();
    this.tileMaterial = visuals.tileMaterial || null;     // (tileIdx) => Material
    this.iconMaterial = visuals.iconMaterial || null;     // (key) => Material
    this.modelFor = visuals.modelFor || null;             // (key) => Object3D | null
    this.onPickup = null; // (kind) => void
    this.max = 50;
  }

  /** Тело предмета: текстурированный кубик, спрайт или модель */
  _buildBody(kind) {
    const custom = this.modelFor ? this.modelFor(kind) : null;
    if (custom) return custom;
    if (isBlockItem(kind)) {
      const id = blockIdOf(kind);
      const def = BLOCKS[id];
      if (def && def.tiles && !def.shape && this.tileMaterial) {
        const [top, bottom, side] = def.tiles;
        const mats = [
          this.tileMaterial(side), this.tileMaterial(side),
          this.tileMaterial(top), this.tileMaterial(bottom),
          this.tileMaterial(side), this.tileMaterial(side),
        ];
        const geo = SLAB_BLOCKS.has(id) ? this.slabGeo : this.geo;
        return new THREE.Mesh(geo, mats);
      }
    }
    const icon = itemDef(kind)?.icon;
    if (icon && this.iconMaterial) {
      const sprite = new THREE.Mesh(this.quadGeo, this.iconMaterial(kind));
      return sprite;
    }
    return null;
  }

  _matFor(kind) {
    if (this.mats[kind]) return this.mats[kind];
    if (this._itemMats.has(kind)) return this._itemMats.get(kind);
    let color = ORE_COLORS[kind];
    if (color == null) {
      // block items: use hash of key to pick color
      if (isBlockItem(kind)) {
        const id = blockIdOf(kind);
        const h = (id * 97 + 13) % 360;
        // fallback greyish
        color = 0x8a8a9a;
        if (SLAB_BLOCKS.has(id)) color = id === BLOCK.PLANK_SLAB || id === BLOCK.PLANK_SLAB_TOP ? 0xc9a76a : 0x898b91;
        else if (id === BLOCK.TORCH) color = 0xffd54a;
        else if (id === BLOCK.FURNACE) color = 0x7a7a82;
      } else {
        color = 0xffffff;
      }
    }
    const m = new THREE.MeshBasicMaterial({ color });
    this._itemMats.set(kind, m);
    return m;
  }

  spawn(x, y, z, kind = 'apple') {
    if (this.items.length >= this.max) return null;
    const g = new THREE.Group();
    const isApple = kind === 'apple' || kind === ITEM.APPLE;
    const mat = this._matFor(isApple ? 'apple' : kind);
    let body = this._buildBody(kind);
    if (!body) {
      // запасной вариант: цветной кубик (полублок — плоский)
      body = new THREE.Mesh(
        isBlockItem(kind) && SLAB_BLOCKS.has(blockIdOf(kind)) ? this.slabGeo : this.geo,
        mat,
      );
    }
    g.add(body);
    const textured = body.isMesh && !Array.isArray(body.material) && !!body.material.map;
    if (isApple && !textured) {
      const stem = new THREE.Mesh(this.stemGeo, this.mats.stem);
      stem.position.y = 0.18;
      g.add(stem);
    }
    // маленькая подсветка для руды
    if ([ITEM.COAL, ITEM.DIAMOND, ITEM.RAW_GOLD, ITEM.RAW_IRON].includes(kind)) {
      const sparkle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
      sparkle.position.y = 0.12;
      g.add(sparkle);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    const it = {
      kind,
      group: g,
      vel: { x: (Math.random() - 0.5) * 1.2, y: 2.2, z: (Math.random() - 0.5) * 1.2 },
      t: 0,
      life: 90,
      rest: false,
      attracting: false,
    };
    this.items.push(it);
    return it;
  }

  _floorY(world, x, y, z) {
    // Верхняя грань первого твёрдого блока снизу (в радиусе падения)
    for (let yy = Math.floor(y); yy > Math.floor(y) - 5; yy--) {
      const b = world.getBlock(Math.floor(x), yy, Math.floor(z));
      if (b && b !== 13) return yy + 1; // 13 = вода (упрощённо)
    }
    return null;
  }

  update(dt, world, playerPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.life -= dt;
      const p = it.group.position;

      const targetX = playerPos.x, targetY = playerPos.y + 0.85, targetZ = playerPos.z;
      let dx = targetX - p.x, dy = targetY - p.y, dz = targetZ - p.z;
      let distanceSq = dx * dx + dy * dy + dz * dz;

      // На полу предмет ждёт; только когда игрок подходит достаточно близко,
      // он медленно скользит к нему. Пока летит/падает, сохраняет обычную физику.
      if (!it.attracting && it.rest && distanceSq < ITEM_MAGNET_RANGE * ITEM_MAGNET_RANGE) {
        it.attracting = true;
        it.vel.x = it.vel.y = it.vel.z = 0;
      }

      if (it.attracting) {
        const distance = Math.sqrt(distanceSq);
        if (distance > 0.0001) {
          const speed = Math.min(2.4, 0.8 + (ITEM_MAGNET_RANGE - Math.min(distance, ITEM_MAGNET_RANGE)) * 0.45);
          const step = Math.min(distance, speed * dt);
          p.x += dx / distance * step;
          p.y += dy / distance * step;
          p.z += dz / distance * step;
        }
        dx = targetX - p.x; dy = targetY - p.y; dz = targetZ - p.z;
        distanceSq = dx * dx + dy * dy + dz * dz;
      } else if (!it.rest) {
        it.vel.y -= 9 * dt;
        p.x += it.vel.x * dt;
        p.y += it.vel.y * dt;
        p.z += it.vel.z * dt;
        const fy = this._floorY(world, p.x, p.y, p.z);
        if (fy !== null && p.y <= fy + 0.16) {
          p.y = fy + 0.16;
          it.vel.x *= 0.3; it.vel.z *= 0.3;
          if (Math.abs(it.vel.y) < 1.2) { it.rest = true; it.vel.y = 0; }
          else it.vel.y = -it.vel.y * 0.25; // мягкий рикошет
        }
      } else {
        p.y += Math.sin(it.t * 3) * 0.0016;
      }

      it.group.rotation.y += dt * 1.8;

      // Подбор происходит только вплотную, после физического падения и притяжения.
      if (distanceSq < ITEM_PICKUP_RANGE * ITEM_PICKUP_RANGE) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
        if (this.onPickup) this.onPickup(it.kind);
        continue;
      }

      // Старые исчезают
      if (it.life <= 0) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items.length = 0;
  }
}

/** Опыт: светящиеся шарики, вылетают из монстров */
export class XpOrbs {
  constructor(scene) {
    this.scene = scene;
    this.orbs = [];
    this.geo = new THREE.SphereGeometry(0.14, 8, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x8aff4a, transparent: true, opacity: 0.92 });
    this.max = 60;
    this.onPickup = null; // (amount) => void
  }
  spawn(x, y, z, amount = 1) {
    if (this.orbs.length >= this.max) return null;
    // разбрасываем несколько мелких орбов если amount > 3
    const count = amount <= 3 ? 1 : Math.min(6, Math.ceil(amount / 2));
    const per = Math.max(1, Math.round(amount / count));
    let last = null;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Mesh(this.geo, this.mat);
      g.position.set(x + (Math.random() - 0.5) * 0.6, y + 0.5 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.6);
      this.scene.add(g);
      const orb = {
        group: g,
        vel: { x: (Math.random() - 0.5) * 2.2, y: 2.4 + Math.random() * 1.2, z: (Math.random() - 0.5) * 2.2 },
        t: 0,
        life: 30 + Math.random() * 20,
        amount: i === count - 1 ? amount - per * (count - 1) : per,
      };
      this.orbs.push(orb);
      last = orb;
    }
    return last;
  }
  _floorY(world, x, y, z) {
    for (let yy = Math.floor(y); yy > Math.floor(y) - 5; yy--) {
      const b = world.getBlock(Math.floor(x), yy, Math.floor(z));
      if (b && b !== BLOCK.AIR && b !== BLOCK.WATER) return yy + 1;
    }
    return null;
  }
  update(dt, world, playerPos) {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.t += dt;
      o.life -= dt;
      const p = o.group.position;
      // притяжение к игроку если близко
      const dx = playerPos.x - p.x, dz = playerPos.z - p.z, dy = (playerPos.y + 0.9) - p.y;
      const d2 = dx * dx + dz * dz + dy * dy;
      const magnet = 6;
      if (d2 < magnet * magnet && d2 > 0.01) {
        const d = Math.sqrt(d2);
        const pull = Math.min(12, 18 / (d + 0.5));
        o.vel.x += (dx / d) * pull * dt;
        o.vel.y += (dy / d) * pull * dt;
        o.vel.z += (dz / d) * pull * dt;
        // ускоренное притяжение последние секунды
        o.vel.x *= 0.99; o.vel.y *= 0.99; o.vel.z *= 0.99;
      } else {
        o.vel.y -= 6 * dt;
        p.x += o.vel.x * dt;
        p.y += o.vel.y * dt;
        p.z += o.vel.z * dt;
        const fy = this._floorY(world, p.x, p.y, p.z);
        if (fy !== null && p.y <= fy + 0.14) {
          p.y = fy + 0.14;
          o.vel.y = Math.abs(o.vel.y) * 0.25;
          o.vel.x *= 0.7; o.vel.z *= 0.7;
        }
      }
      // летим к игроку с magnet
      if (d2 < magnet * magnet) {
        p.x += o.vel.x * dt;
        p.y += o.vel.y * dt;
        p.z += o.vel.z * dt;
      }
      o.group.rotation.y += dt * 3;
      p.y += Math.sin(o.t * 4) * 0.001;

      if (d2 < 1.4) {
        this.scene.remove(o.group);
        this.orbs.splice(i, 1);
        if (this.onPickup) this.onPickup(o.amount);
        continue;
      }
      if (o.life <= 0) {
        this.scene.remove(o.group);
        this.orbs.splice(i, 1);
      }
      // мерцание перед исчезновением
      if (o.life < 3) o.group.material.opacity = 0.3 + 0.6 * (o.life / 3);
    }
  }
  clear() {
    for (const o of this.orbs) this.scene.remove(o.group);
    this.orbs.length = 0;
  }
}
