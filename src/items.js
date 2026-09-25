// Предметы: единый реестр (блоки, палка, яблоко, инструменты) + физические дропы в мире
import * as THREE from 'three';
import { BLOCK, BLOCKS, BLOCK_NAMES, isSolid, blockBounds } from './blocks.js';
import { CONFIG } from './config.js';

// ---------------------------------------------------------------- Реестр предметов
// Ключ предмета — строка: 'block_<id>' для блоков и короткий код для остального.
export const ITEM = {
  STICK: 'stick',
  APPLE: 'apple',
  BOW: 'bow',
  ARROW: 'arrow',
  WHEAT: 'wheat', COAL: 'coal', ORE: 'ore', GOLD_ORE: 'gold_ore',
  DIAMOND: 'diamond', INGOT: 'ingot', GOLD_INGOT: 'gold_ingot', BREAD: 'bread',
  WOOD_PICKAXE: 'tool_wood_pickaxe',
  WOOD_AXE: 'tool_wood_axe',
  WOOD_SWORD: 'tool_wood_sword',
  STONE_PICKAXE: 'tool_stone_pickaxe',
  STONE_SWORD: 'tool_stone_sword',
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
  [ITEM.WHEAT]: { kind: 'item', max: 64, icon: 'wheat', name: { ru: 'Пшеница', en: 'Wheat' } },
  [ITEM.COAL]: { kind: 'item', max: 64, icon: 'coal', name: { ru: 'Уголь', en: 'Coal' } },
  [ITEM.ORE]: { kind: 'item', max: 64, icon: 'ore', name: { ru: 'Железная руда', en: 'Iron ore' } },
  [ITEM.GOLD_ORE]: { kind: 'item', max: 64, icon: 'gold_ore', name: { ru: 'Золотая руда', en: 'Gold ore' } },
  [ITEM.DIAMOND]: { kind: 'item', max: 64, icon: 'diamond', name: { ru: 'Алмаз', en: 'Diamond' } },
  [ITEM.INGOT]: { kind: 'item', max: 64, icon: 'ingot', name: { ru: 'Железный слиток', en: 'Iron ingot' } },
  [ITEM.GOLD_INGOT]: { kind: 'item', max: 64, icon: 'gold_ingot', name: { ru: 'Золотой слиток', en: 'Gold ingot' } },
  [ITEM.BREAD]: { kind: 'item', max: 64, icon: 'bread', food: 6, name: { ru: 'Хлеб', en: 'Bread' } },
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
  [ITEM.STONE_SWORD]: {
    kind: 'tool', tool: 'sword', tier: 'stone', max: 1, icon: 'stone_sword',
    speed: 1, damage: 3,
    name: { ru: 'Каменный меч', en: 'Stone sword' },
  },
};

const _defCache = new Map();

/** Описание предмета или null, если такого предмета нет */
/**
 * Сытость предмета: сколько сердец здоровья он восстанавливает.
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

/** Можно ли поставить предмет как блок и какой id получится */
export function placeBlockId(key) {
  const d = itemDef(key);
  return d && d.kind === 'block' ? d.block : 0;
}

// ---------------------------------------------------------------- Дроп с блоков
// Выживание: трава → земля, камень → булыжник, стекло — ничего, листва — иногда листва
export function blockDropItem(id, rng = Math.random) {
  if (!id || id === BLOCK.AIR || id === BLOCK.WATER || id === BLOCK.GLASS) return null;
  if (id === BLOCK.GRASS) return blockItem(BLOCK.DIRT);
  if (id === BLOCK.STONE) return blockItem(BLOCK.COBBLE);
  if (id === BLOCK.COAL_ORE) return ITEM.COAL;
  if (id === BLOCK.IRON_ORE) return ITEM.ORE;
  if (id === BLOCK.GOLD_ORE) return ITEM.GOLD_ORE;
  if (id === BLOCK.DIAMOND_ORE) return ITEM.DIAMOND;
  if (id === BLOCK.PLANK_SLAB_TOP) return blockItem(BLOCK.PLANK_SLAB);
  if (id === BLOCK.COBBLE_SLAB_TOP) return blockItem(BLOCK.COBBLE_SLAB);
  if (id === BLOCK.LEAVES) return rng() < 0.35 ? blockItem(BLOCK.LEAVES) : null;
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

// ---------------------------------------------------------------- Физические предметы и сферы опыта в мире
export class ItemDrops {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    this.stemGeo = new THREE.BoxGeometry(0.07, 0.10, 0.07);
    this.orbGeo = new THREE.OctahedronGeometry(0.16, 0);
    this.mats = {
      apple: new THREE.MeshBasicMaterial({ color: 0xda4545 }),
      stem: new THREE.MeshBasicMaterial({ color: 0x6b4a2b }),
      ore: new THREE.MeshBasicMaterial({ color: 0xbd7650 }),
      coal: new THREE.MeshBasicMaterial({ color: 0x27282e }),
      gold_ore: new THREE.MeshBasicMaterial({ color: 0xd7af4c }),
      diamond: new THREE.MeshBasicMaterial({ color: 0x61e4d5 }),
      ingot: new THREE.MeshBasicMaterial({ color: 0xc7cbd1 }),
      gold_ingot: new THREE.MeshBasicMaterial({ color: 0xe7c75a }),
      wheat: new THREE.MeshBasicMaterial({ color: 0xeac564 }),
      xp: new THREE.MeshBasicMaterial({ color: 0x95ff3b }),
    };
    this.onPickup = null; // (kind, amount) => void
    this.max = 80;
  }

  spawn(x, y, z, kind = 'apple', amount = 1) {
    if (!this.mats[kind] || this.items.length >= this.max) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(kind === 'xp' ? this.orbGeo : this.geo, this.mats[kind]);
    group.add(body);
    if (kind === 'apple' || kind === 'wheat') {
      const stem = new THREE.Mesh(this.stemGeo, this.mats.stem);
      stem.position.y = 0.18;
      group.add(stem);
    }
    if (kind === 'ore') {
      const grain = new THREE.Mesh(this.stemGeo, this.mats.coal);
      grain.position.set(0.13, 0.04, 0.12);
      group.add(grain);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    const it = {
      kind, amount, group,
      vel: { x: (Math.random() - 0.5) * 1.2, y: 2.2, z: (Math.random() - 0.5) * 1.2 },
      t: 0, life: kind === 'xp' ? 55 : 90, rest: false,
    };
    this.items.push(it);
    return it;
  }

  _floorY(world, x, y, z) {
    for (let yy = Math.floor(y); yy > Math.floor(y) - 5; yy--) {
      const id = world.getBlock(Math.floor(x), yy, Math.floor(z));
      if (isSolid(id)) return yy + blockBounds(id).maxY;
    }
    return null;
  }

  update(dt, world, playerPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.life -= dt;
      const p = it.group.position;
      if (!it.rest) {
        it.vel.y -= 9 * dt;
        p.x += it.vel.x * dt;
        p.y += it.vel.y * dt;
        p.z += it.vel.z * dt;
        const fy = this._floorY(world, p.x, p.y, p.z);
        if (fy !== null && p.y <= fy + 0.16) {
          p.y = fy + 0.16;
          it.vel.x *= 0.3; it.vel.z *= 0.3;
          if (Math.abs(it.vel.y) < 1.2) { it.rest = true; it.vel.y = 0; }
          else it.vel.y = -it.vel.y * 0.25;
        }
      } else {
        p.y += Math.sin(it.t * 3) * 0.0016;
      }
      it.group.rotation.y += dt * (it.kind === 'xp' ? 3.5 : 1.8);
      if (it.kind === 'xp') it.group.position.y += Math.sin(it.t * 5) * 0.002;

      let dx = p.x - playerPos.x, dz = p.z - playerPos.z, dy = p.y - (playerPos.y + 0.9);
      let d2 = dx * dx + dz * dz + dy * dy;
      // Сферы опыта, как в основной ветке, магнитятся к игроку издалека.
      if (it.kind === 'xp' && d2 > 2.4 && d2 < 25) {
        const pull = Math.min(Math.sqrt(d2) - 0.1, dt * 5);
        p.x -= dx / Math.sqrt(d2) * pull;
        p.y -= dy / Math.sqrt(d2) * pull;
        p.z -= dz / Math.sqrt(d2) * pull;
        it.rest = false;
        dx = p.x - playerPos.x; dz = p.z - playerPos.z; dy = p.y - (playerPos.y + 0.9);
        d2 = dx * dx + dz * dz + dy * dy;
      }
      if (d2 < 2.4) {
        // Если инвентарь полон, предмет остаётся в мире до освобождения места.
        if (this.onPickup?.(it.kind, it.amount) !== false) {
          this.scene.remove(it.group);
          this.items.splice(i, 1);
          continue;
        }
      }
      if (it.life <= 0) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
  }

  serialize() {
    return this.items.map((it) => ({
      kind: it.kind, amount: it.amount,
      x: it.group.position.x, y: it.group.position.y, z: it.group.position.z,
      life: it.life,
    }));
  }

  load(saved) {
    this.clear();
    for (const data of (Array.isArray(saved) ? saved : []).slice(0, this.max)) {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.z)) continue;
      const it = this.spawn(data.x, data.y, data.z, data.kind, Math.max(1, data.amount | 0));
      if (it) it.life = Math.max(0, Math.min(90, Number(data.life) || 30));
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items.length = 0;
  }
}
