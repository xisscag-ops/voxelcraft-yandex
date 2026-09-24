// DDA-рейкаст по вокселям (Amanatides & Woo)
import { BLOCK, isDecor } from './blocks.js';

// Уменьшенный хитбокс декоративных растений (трава, цветы): не мешает целиться в блок за ними
const DECOR_MIN = 0.2, DECOR_MAX = 0.8, DECOR_H = 0.55;
function rayHitsDecor(x, y, z, ox, oy, oz, dx, dy, dz, maxDist) {
  const mn = [x + DECOR_MIN, y, z + DECOR_MIN];
  const mx = [x + DECOR_MAX, y + DECOR_H, z + DECOR_MAX];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  let t0 = 0, t1 = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * @returns {null | {x,y,z, nx,ny,nz, id}} попадание: блок и нормаль грани
 */
export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDeltaY : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDeltaZ : Infinity;

  let nx = 0, ny = 0, nz = 0;
  let t = 0;

  while (t <= maxDist) {
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR && id !== BLOCK.WATER &&
        (!isDecor(id) || rayHitsDecor(x, y, z, ox, oy, oz, dx, dy, dz, maxDist))) {
      return { x, y, z, nx, ny, nz, id };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      nx = 0; ny = 0; nz = -stepZ;
    }
  }
  return null;
}
