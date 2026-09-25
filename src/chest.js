// Сундуки: хранилище на 27 ячеек, привязанное к координатам блока
import { Inventory } from './inventory.js';

export const CHEST_SIZE = 27;

export function createChest() {
  return new Inventory(CHEST_SIZE);
}

export function serializeChests(chests) {
  const out = [];
  for (const [key, inv] of chests) {
    if (inv && !inv.isEmpty()) out.push([key, inv.serialize()]);
  }
  return out;
}

export function deserializeChests(data) {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const row of data) {
    if (!Array.isArray(row) || typeof row[0] !== 'string') continue;
    const inv = createChest();
    inv.deserialize(row[1]);
    map.set(row[0], inv);
  }
  return map;
}
