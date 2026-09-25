// DDA-рейкаст по вокселям с точным пересечением полублоков и узких факелов.
import { BLOCK, blockBounds } from './blocks.js';

function rayBox(bounds, cell, origin, dir) {
  let enter = -Infinity, leave = Infinity;
  let normal = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const b = 'XYZ'[axis];
    const lo = cell[axis] + bounds[`min${b}`];
    const hi = cell[axis] + bounds[`max${b}`];
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < lo || origin[axis] > hi) return null;
      continue;
    }
    const t0 = (lo - origin[axis]) / dir[axis];
    const t1 = (hi - origin[axis]) / dir[axis];
    const near = Math.min(t0, t1), far = Math.max(t0, t1);
    if (near > enter) {
      enter = near;
      normal = [0, 0, 0];
      normal[axis] = dir[axis] > 0 ? -1 : 1;
    }
    leave = Math.min(leave, far);
    if (enter > leave) return null;
  }
  return { enter, leave, normal };
}

/** @returns {null | {x,y,z,nx,ny,nz,id,t,px,py,pz}} */
export function raycastVoxel(world, ox, oy, oz, dx, dy, dz, maxDist) {
  if (!dx && !dy && !dz) return null;
  const origin = [ox, oy, oz], dir = [dx, dy, dz];
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const deltaX = dx ? Math.abs(1 / dx) : Infinity;
  const deltaY = dy ? Math.abs(1 / dy) : Infinity;
  const deltaZ = dz ? Math.abs(1 / dz) : Infinity;
  let nextX = dx ? (dx > 0 ? x + 1 - ox : ox - x) * deltaX : Infinity;
  let nextY = dy ? (dy > 0 ? y + 1 - oy : oy - y) * deltaY : Infinity;
  let nextZ = dz ? (dz > 0 ? z + 1 - oz : oz - z) * deltaZ : Infinity;
  let t = 0;

  while (t <= maxDist) {
    const end = Math.min(nextX, nextY, nextZ, maxDist);
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR && id !== BLOCK.WATER) {
      const hit = rayBox(blockBounds(id), [x, y, z], origin, dir);
      if (hit) {
        const at = Math.max(0, hit.enter);
        if (at >= t - 1e-6 && at <= end + 1e-6 && at <= hit.leave + 1e-6) {
          return {
            x, y, z, id, t: at,
            nx: hit.normal[0], ny: hit.normal[1], nz: hit.normal[2],
            px: ox + dx * at, py: oy + dy * at, pz: oz + dz * at,
          };
        }
      }
    }
    if (nextX < nextY && nextX < nextZ) {
      x += stepX; t = nextX; nextX += deltaX;
    } else if (nextY < nextZ) {
      y += stepY; t = nextY; nextY += deltaY;
    } else {
      z += stepZ; t = nextZ; nextZ += deltaZ;
    }
  }
  return null;
}
