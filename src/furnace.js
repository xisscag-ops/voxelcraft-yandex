// Плавильная печь: отдельные слоты сырья, топлива и результата.
import { BLOCK } from './blocks.js';
import { ITEM, blockItem, itemDef, maxStack } from './items.js';

export const SMELT_TIME = 4.5;

const SMELT_RECIPES = new Map([
  [ITEM.RAW_IRON, ITEM.IRON_INGOT],
  [ITEM.RAW_GOLD, ITEM.GOLD_INGOT],
  [blockItem(BLOCK.SAND), blockItem(BLOCK.GLASS)],
  [blockItem(BLOCK.COBBLE), blockItem(BLOCK.STONE)],
]);

const FUELS = new Map([
  [ITEM.COAL, 9],
  [ITEM.STICK, 1.2],
  [blockItem(BLOCK.PLANKS), 3.2],
  [blockItem(BLOCK.LOG), 5.5],
  [blockItem(BLOCK.BIRCH_LOG), 5.5],
  [blockItem(BLOCK.SPRUCE_LOG), 5.5],
]);

function cleanStack(stack) {
  if (!stack || !itemDef(stack.key) || stack.count <= 0) return null;
  return { key: stack.key, count: Math.min(maxStack(stack.key), Math.floor(stack.count)) };
}

export function smeltResult(key) { return SMELT_RECIPES.get(key) || null; }
export function fuelDuration(key) { return FUELS.get(key) || 0; }
export function canBeSmelted(key) { return SMELT_RECIPES.has(key); }
export function canBeFuel(key) { return FUELS.has(key); }

export class Furnace {
  constructor(data = null) {
    this.slots = {
      input: cleanStack(data?.slots?.input),
      fuel: cleanStack(data?.slots?.fuel),
      output: cleanStack(data?.slots?.output),
    };
    this.burnRemaining = Math.max(0, Number(data?.burnRemaining) || 0);
    this.burnTotal = Math.max(0, Number(data?.burnTotal) || 0);
    this.cookProgress = Math.max(0, Number(data?.cookProgress) || 0);
    this.changed = false;
  }

  getSlot(name) { return this.slots[name] || null; }

  accepts(name, key) {
    if (name === 'input') return canBeSmelted(key);
    if (name === 'fuel') return canBeFuel(key);
    return false;
  }

  setStack(name, stack) {
    if (name === 'output' || !Object.prototype.hasOwnProperty.call(this.slots, name)) return false;
    const next = cleanStack(stack);
    if (next && !this.accepts(name, next.key)) return false;
    this.slots[name] = next;
    this.changed = true;
    return true;
  }

  clearSlot(name) {
    if (name === 'output' || !Object.prototype.hasOwnProperty.call(this.slots, name)) return false;
    this.slots[name] = null;
    this.changed = true;
    return true;
  }

  _hasOutputRoom(resultKey) {
    const out = this.slots.output;
    return !out || (out.key === resultKey && out.count < maxStack(resultKey));
  }

  canSmelt() {
    const input = this.slots.input;
    const result = input && smeltResult(input.key);
    return !!(input && input.count > 0 && result && this._hasOutputRoom(result));
  }

  /** Обновить горение и прогресс; возвращает true, если содержимое/состояние изменилось. */
  update(dt) {
    this.changed = false;
    const delta = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (delta === 0) return false;

    if (!this.canSmelt()) {
      this.cookProgress = 0;
      this.burnRemaining = Math.max(0, this.burnRemaining - delta);
      return false;
    }

    if (this.burnRemaining <= 0 && this.slots.fuel) {
      const duration = fuelDuration(this.slots.fuel.key);
      if (duration > 0) {
        this.slots.fuel.count--;
        if (this.slots.fuel.count <= 0) this.slots.fuel = null;
        this.burnRemaining = duration;
        this.burnTotal = duration;
        this.changed = true;
      }
    }

    if (this.burnRemaining <= 0) return false;
    const beforeBurn = this.burnRemaining;
    this.burnRemaining = Math.max(0, this.burnRemaining - delta);
    if (this.burnRemaining !== beforeBurn) this.changed = true;
    this.cookProgress += delta;

    while (this.cookProgress >= SMELT_TIME && this.canSmelt()) {
      const input = this.slots.input;
      const resultKey = smeltResult(input.key);
      if (!this._hasOutputRoom(resultKey)) {
        this.cookProgress = SMELT_TIME;
        break;
      }
      input.count--;
      if (input.count <= 0) this.slots.input = null;
      if (!this.slots.output) this.slots.output = { key: resultKey, count: 1 };
      else this.slots.output.count++;
      this.cookProgress -= SMELT_TIME;
      this.changed = true;
    }

    if (!this.canSmelt()) this.cookProgress = 0;
    return this.changed;
  }

  takeOutput(amount = Infinity) {
    const out = this.slots.output;
    if (!out) return null;
    const count = Math.min(out.count, Math.max(1, Math.floor(amount)));
    const stack = { key: out.key, count };
    out.count -= count;
    if (out.count <= 0) this.slots.output = null;
    this.changed = true;
    return stack;
  }

  serialize() {
    return {
      slots: {
        input: this.slots.input ? { ...this.slots.input } : null,
        fuel: this.slots.fuel ? { ...this.slots.fuel } : null,
        output: this.slots.output ? { ...this.slots.output } : null,
      },
      burnRemaining: this.burnRemaining,
      burnTotal: this.burnTotal,
      cookProgress: this.cookProgress,
    };
  }
}

export function serializeFurnaces(furnaces) {
  return Array.from(furnaces.entries(), ([key, furnace]) => [key, furnace.serialize()]);
}

export function deserializeFurnaces(data) {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const row of data) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
    map.set(row[0], new Furnace(row[1]));
  }
  return map;
}
