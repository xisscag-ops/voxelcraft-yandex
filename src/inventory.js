// Инвентарь игрока: 36 ячеек, первые 9 — хотбар; стопки до 64, инструменты по 1
import { itemDef, maxStack } from './items.js';

export const INV_SIZE = 36;
export const HOTBAR_SIZE = 9;

export class Inventory {
  constructor(size = INV_SIZE) {
    this.size = size;
    this.slots = new Array(size).fill(null); // null | { key, count }
  }

  get(i) {
    return this.slots[i] || null;
  }

  set(i, key, count = 1) {
    if (i < 0 || i >= this.size) return;
    const def = itemDef(key);
    if (!def || count <= 0) { this.slots[i] = null; return; }
    this.slots[i] = { key, count: Math.min(count, maxStack(key)) };
  }

  /** Кладёт готовую стопку в ячейку (или null, чтобы очистить) */
  setStack(i, stack) {
    if (i < 0 || i >= this.size) return;
    if (!stack || !itemDef(stack.key) || stack.count <= 0) { this.slots[i] = null; return; }
    this.slots[i] = { key: stack.key, count: Math.min(stack.count, maxStack(stack.key)) };
  }

  clearSlot(i) { this.slots[i] = null; }

  isEmpty() { return this.slots.every((s) => !s); }

  count(key) {
    let n = 0;
    for (const s of this.slots) if (s && s.key === key) n += s.count;
    return n;
  }

  has(key, n = 1) { return this.count(key) >= n; }

  /** Сколько ещё предметов key поместится (пустые ячейки + место в стопках) */
  spaceFor(key) {
    const max = maxStack(key);
    let free = 0;
    for (const s of this.slots) {
      if (!s) free += max;
      else if (s.key === key) free += Math.max(0, max - s.count);
    }
    return free;
  }

  /** Сколько предметов key удалось бы положить (без изменения инвентаря) */
  canAdd(key, n = 1) { return Math.min(n, this.spaceFor(key)); }

  /**
   * Добавляет предметы. Возвращает остаток, который не поместился (0 — всё вошло)
   */
  add(key, n = 1) {
    if (!itemDef(key) || n <= 0) return n;
    const max = maxStack(key);
    let left = n;
    // сначала докладываем в существующие неполные стопки
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.key === key && s.count < max) {
        const take = Math.min(max - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    // затем в пустые ячейки
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, left);
        this.slots[i] = { key, count: take };
        left -= take;
      }
    }
    return left;
  }

  /** Убирает предметы; true — если убрано ровно n (иначе ничего не меняется) */
  remove(key, n = 1) {
    if (n <= 0) return true;
    if (this.count(key) < n) return false;
    let left = n;
    for (let i = 0; i < this.size && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.key !== key) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  firstEmpty() {
    return this.slots.findIndex((s) => !s);
  }

  serialize() {
    return this.slots.map((s) => (s ? [s.key, s.count] : 0));
  }

  deserialize(arr) {
    this.clear();
    if (!Array.isArray(arr)) return;
    const n = Math.min(this.size, arr.length);
    for (let i = 0; i < n; i++) {
      const e = arr[i];
      if (!e || !e.length) continue;
      const [key, count] = e;
      if (itemDef(key) && count > 0) this.slots[i] = { key, count: Math.min(count, maxStack(key)) };
    }
  }

  clear() {
    this.slots.fill(null);
  }

  clone() {
    const inv = new Inventory(this.size);
    inv.deserialize(this.serialize());
    return inv;
  }
}
