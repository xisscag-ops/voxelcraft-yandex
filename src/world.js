// Мир: чанки-колонны, генерация рельефа, деревья, правки игрока
import { BLOCK, isSolid } from './blocks.js';
import { fbm2d, fbm3d, makeRng, hash3 } from './noise.js';
import { CONFIG } from './config.js';

const S = CONFIG.CHUNK_SIZE;
// Пороговые значения биомов (подобраны так, чтобы зима и пустыни были редкими):
// пустыни — примерно 10% мира, снежные зоны — около 8%
const DRY_T = 0.735;      // сухие (пустынные) зоны
const COLD_T = 0.74;      // холодные (снежные) зоны
const ROCK_H = 44;        // выше — голый камень
const PEAK_H = 51;        // выше — снежные вершины
const H = CONFIG.WORLD_HEIGHT;
const SEA = CONFIG.SEA_LEVEL;
const FEATURE_CELL = 160;       // глобальная сетка для карьер и разломов

function idx(x, y, z) {
  return (y * S + z) * S + x;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint8Array(S * H * S);
    this.edited = false;
    this.dirty = true;       // нужно перестроить меш
    this.meshOpaque = null;
    this.meshWater = null;
    this.generated = false;
  }
  get(x, y, z) { return this.blocks[idx(x, y, z)]; }
  set(x, y, z, v) { this.blocks[idx(x, y, z)] = v; }
}

export class World {
  constructor(seed) {
    this.seed = seed | 0;
    this.chunkSize = S;
    this.worldHeight = H;
    this.seaLevel = SEA;
    this.chunks = new Map();          // "cx,cz" -> Chunk
    this.edits = new Map();           // "x,y,z" -> id (правки игрока, сохраняются)
  }

  key(cx, cz) { return cx + ',' + cz; }

  getChunk(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
    }
    if (!c.generated) this.generateChunk(c);
    return c;
  }

  // Температура: холодные (снежные) зоны — крупные, но редкие
  temperatureAt(wx, wz) {
    return fbm2d(wx * 0.0016 + 40, wz * 0.0016 - 70, this.seed + 31, 3);
  }

  // Сухие (пустынные) зоны
  dryAt(wx, wz) {
    return fbm2d(wx * 0.0021 - 90, wz * 0.0021 + 55, this.seed + 17, 3);
  }

  // Голый камень на высокогорье
  isRocky(h) { return h >= ROCK_H; }

  // Пустынная колонка (сухо и не холодно)
  isDry(wx, wz, h = null) {
    if (this.temperatureAt(wx, wz) > COLD_T) return false;
    if (h !== null && this.isRocky(h)) return false;
    return this.dryAt(wx, wz) > DRY_T;
  }

  // Снежная колонка
  isCold(wx, wz) { return this.temperatureAt(wx, wz) > COLD_T; }

  // Базовая высота поверхности без геологических особенностей.
  baseHeightAt(wx, wz) {
    const seed = this.seed;
    const cont = fbm2d(wx * 0.006, wz * 0.006, seed, 4);           // континентальность
    const hills = fbm2d(wx * 0.03, wz * 0.03, seed + 991, 3);      // холмы
    const mt = fbm2d(wx * 0.0022, wz * 0.0022, seed + 77, 2);      // горные массивы
    const ridgeN = fbm2d(wx * 0.0048 + 13, wz * 0.0048 - 27, seed + 505, 3);
    const c = Math.tanh((cont - 0.5) * 5);
    let h = SEA + 3 + c * 18 + (hills - 0.5) * 12;
    const mountain = Math.max(0, mt - 0.46) / 0.54;
    h += Math.pow(mountain, 1.5) * 30;
    const ridge = 1 - Math.abs(ridgeN * 2 - 1);
    h += ridge * ridge * mountain * 16;
    return Math.max(3, Math.min(H - 3, Math.round(h)));
  }

  /**
   * Детерминированная геологическая особенность рядом с колонкой.
   * Карьеры формируют уступчатые выемки, а разломы — длинные узкие ущелья.
   */
  featureAt(wx, wz) {
    const gx0 = Math.floor(wx / FEATURE_CELL);
    const gz0 = Math.floor(wz / FEATURE_CELL);
    let best = null;
    for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
      for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
        const roll = hash3(gx, 137, gz, this.seed);
        const type = roll < 0.22 ? 'quarry' : roll < 0.42 ? 'rift' : null;
        if (!type) continue;
        const fx = (gx + 0.25 + hash3(gx, 211, gz, this.seed) * 0.5) * FEATURE_CELL;
        const fz = (gz + 0.25 + hash3(gx, 307, gz, this.seed) * 0.5) * FEATURE_CELL;
        const dx = wx - fx, dz = wz - fz;
        let feature;

        if (type === 'quarry') {
          const rx = 11 + hash3(gx, 401, gz, this.seed) * 8;
          const rz = 10 + hash3(gx, 503, gz, this.seed) * 7;
          const depth = 9 + hash3(gx, 601, gz, this.seed) * 9;
          // Неровный край и ступени вместо идеально круглой воронки.
          const rim = Math.sin(dx * 0.37 + gx) * Math.sin(dz * 0.31 + gz) * 0.035;
          const radius = Math.hypot(dx / rx, dz / rz) + rim;
          if (radius >= 1) continue;
          const cut = Math.floor(((1 - radius) * depth) / 3) * 3;
          if (cut < 3) continue;
          feature = { type, cut, radius, rx, rz, depth, x: fx, z: fz };
        } else {
          const angle = hash3(gx, 701, gz, this.seed) * Math.PI * 2;
          const along = dx * Math.cos(angle) + dz * Math.sin(angle);
          const across = -dx * Math.sin(angle) + dz * Math.cos(angle);
          const halfLength = 44 + hash3(gx, 809, gz, this.seed) * 24;
          if (Math.abs(along) >= halfLength) continue;
          const phase = hash3(gx, 907, gz, this.seed) * Math.PI * 2;
          const bend = Math.sin(along * 0.052 + phase) * 2.4
            + Math.sin(along * 0.13 - phase) * 0.7;
          const width = 3.2 + hash3(gx, 1009, gz, this.seed) * 2.7;
          const acrossDist = Math.abs(across - bend);
          const radius = acrossDist / width;
          if (radius >= 1) continue;
          const depth = 19 + hash3(gx, 1103, gz, this.seed) * 17;
          // Обрывчатые стенки с несколькими каменными террасами по краям.
          const cut = Math.floor((depth * Math.pow(1 - radius, 0.42)) / 2) * 2;
          if (cut < 2) continue;
          feature = { type, cut, radius, width, depth, along, halfLength, x: fx, z: fz };
        }
        if (!best || feature.cut > best.cut) best = feature;
      }
    }
    return best;
  }

  heightAt(wx, wz) {
    const base = this.baseHeightAt(wx, wz);
    if (base <= SEA + 4) return base;
    const feature = this.featureAt(wx, wz);
    if (!feature) return base;
    const cut = Math.min(feature.cut, base - (SEA + 4));
    return cut >= 2 ? base - cut : base;
  }

  generateChunk(chunk) {
    const cx = chunk.cx, cz = chunk.cz;
    const ox = cx * S, oz = cz * S;
    const seed = this.seed;
    const terrainHeight = new Int16Array(S * S);

    // Рельеф и биомы
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const baseH = this.baseHeightAt(wx, wz);
        let feature = baseH > SEA + 4 ? this.featureAt(wx, wz) : null;
        if (feature) {
          const safeCut = Math.min(feature.cut, baseH - (SEA + 4));
          if (safeCut < 2) feature = null;
          else feature.cut = safeCut;
        }
        const h = baseH - (feature?.cut || 0);
        terrainHeight[z * S + x] = h;
        const excavated = !!(feature && feature.cut >= 3);
        const cold = this.temperatureAt(wx, wz) > COLD_T;    // снежные зоны редкие
        const dry = !cold && !this.isRocky(h) && this.dryAt(wx, wz) > DRY_T;   // пустыни
        const rocky = this.isRocky(h);                        // высокогорье — голый камень
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let b = BLOCK.AIR;
          if (y > h) {
            // В холодных зонах вода сверху затянута льдом
            b = y <= SEA ? ((cold && y === SEA) ? BLOCK.ICE : BLOCK.WATER) : BLOCK.AIR;
          } else if (y === h) {
            if (excavated) {
              // В карьере и разломе на поверхность выходят коренные породы.
              b = h < 7 ? BLOCK.SLATE
                : feature.type === 'quarry' && hash3(wx, y, wz, seed + 3300) < 0.07 ? BLOCK.GRAVEL
                  : BLOCK.STONE;
            } else if (h <= SEA + 2) b = BLOCK.SAND;         // пляжи
            else if (h >= PEAK_H) b = BLOCK.SNOW;            // снежные вершины
            else if (rocky) b = BLOCK.STONE;
            else if (cold) b = BLOCK.SNOW;
            else if (dry) b = BLOCK.SAND;
            else b = BLOCK.GRASS;
          } else if (y >= h - 3) {
            if (excavated) b = y < 5 ? BLOCK.SLATE : BLOCK.STONE;
            else if (h <= SEA + 2) b = BLOCK.SAND;
            else if (h >= PEAK_H) b = BLOCK.SNOW;
            else if (rocky) b = BLOCK.STONE;
            else if (dry) b = BLOCK.SANDSTONE;
            else b = BLOCK.DIRT;
          } else {
            b = y < 4 ? BLOCK.SLATE : BLOCK.STONE;
          }
          if (b !== BLOCK.AIR) chunk.set(x, y, z, b);
        }
      }
    }

    // Тоннели образуют связанные меандрирующие системы, а не случайные вертикальные полости.
    // Контурные 2D-поля задают трассы, низкочастотная деформация и отдельные поля высоты
    // изгибают их в пространстве. Вариативный радиус формирует неровные стены и ответвления.
    const rngCave = makeRng(hash3(cx, 5, cz, seed) * 0x7fffffff);
    const carvedTop = new Int16Array(S * S);
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const h = terrainHeight[z * S + x];
        const yTop = h - 4 - ((rngCave() * 3) | 0);
        if (yTop < 8) continue;

        const warpX = (fbm2d(wx * 0.012, wz * 0.012, seed + 1211, 3) - 0.5) * 9;
        const warpZ = (fbm2d(wx * 0.012 + 19, wz * 0.012 - 31, seed + 1319, 3) - 0.5) * 9;
        const px = wx + warpX, pz = wz + warpZ;
        const detail = fbm2d(wx * 0.075 + 7, wz * 0.075 - 13, seed + 1433, 2);
        const verticalLimit = Math.max(7, Math.min(43, yTop - 3));
        const paths = [
          {
            n: fbm2d(px * 0.024, pz * 0.024, seed + 404, 4), threshold: 0.072,
            center: 6 + fbm2d(wx * 0.011 + 5, wz * 0.011 - 8, seed + 909, 3) * (verticalLimit - 6),
            radius: 1.55, variation: 1.25,
          },
          {
            n: fbm2d(px * 0.041 + 11, pz * 0.041 - 6, seed + 707, 3), threshold: 0.052,
            center: 7 + fbm2d(wx * 0.017 - 17, wz * 0.017 + 9, seed + 1511, 3) * (verticalLimit - 7),
            radius: 1.05, variation: 1.15,
          },
          {
            n: fbm2d((wx - warpZ) * 0.018 - 23, (wz + warpX) * 0.018 + 17, seed + 808, 3), threshold: 0.045,
            center: 8 + fbm2d(wx * 0.008 + 33, wz * 0.008 - 25, seed + 1613, 2) * (verticalLimit - 8),
            radius: 1.8, variation: 1.45,
          },
        ];
        for (const path of paths) {
          const distance = Math.abs(path.n - 0.5);
          if (distance >= path.threshold) continue;
          const strength = 1 - distance / path.threshold;
          const radius = path.radius + strength * path.variation + (detail - 0.5) * 0.55;
          const centerY = path.center + (detail - 0.5) * 1.4;
          const y0 = Math.max(3, Math.floor(centerY - radius));
          const y1 = Math.min(yTop, Math.ceil(centerY + radius));
          for (let y = y0; y <= y1; y++) {
            const vertical = (y - centerY) / Math.max(0.7, radius);
            // Мягко сужаем ход к потолку и полу; небольшая шумовая рябь делает стену естественной.
            const wallNoise = (fbm2d(wx * 0.12 + y * 0.021, wz * 0.12 - y * 0.017, seed + 1717, 2) - 0.5) * 0.18;
            if (vertical * vertical > 1 + wallNoise) continue;
            const was = chunk.get(x, y, z);
            if (was === BLOCK.AIR || was === BLOCK.WATER || was === BLOCK.ICE) continue;
            chunk.set(x, y, z, BLOCK.AIR);
            if (y > carvedTop[z * S + x]) carvedTop[z * S + x] = y;
          }
        }
      }
    }

    // Подземные залы: крупные каверны по трёхмерному шуму.
    // Шум считаем на сетке 2×2×2 и растягиваем — иначе генерация чанка станет заметно дороже.
    {
      const CY0 = 5, CY1 = 41, STEP = 2;
      const gn = S / STEP + 1;
      const gyn = Math.floor((CY1 - CY0) / STEP) + 1;
      const grid = new Float32Array(gn * gyn * gn);
      const warpX = new Float32Array(gn * gn), warpZ = new Float32Array(gn * gn);
      for (let iz = 0; iz < gn; iz++) {
        for (let ix = 0; ix < gn; ix++) {
          const wx = ox + ix * STEP, wz = oz + iz * STEP;
          const i = iz * gn + ix;
          warpX[i] = (fbm2d(wx * 0.017, wz * 0.017, seed + 1823, 3) - 0.5) * 8;
          warpZ[i] = (fbm2d(wx * 0.017 + 27, wz * 0.017 - 41, seed + 1931, 3) - 0.5) * 8;
        }
      }
      for (let iz = 0; iz < gn; iz++) {
        for (let iy = 0; iy < gyn; iy++) {
          for (let ix = 0; ix < gn; ix++) {
            const wx = ox + ix * STEP, wy = CY0 + iy * STEP, wz = oz + iz * STEP;
            const warpIndex = iz * gn + ix;
            grid[(iz * gyn + iy) * gn + ix] = fbm3d(
              (wx + warpX[warpIndex]) * 0.035,
              wy * 0.067,
              (wz + warpZ[warpIndex]) * 0.035,
              seed + 1500,
              3,
            );
          }
        }
      }
      // Трилинейная выборка между узлами сетки
      const sample = (fx, fy, fz) => {
        const x0 = Math.min(gn - 2, Math.max(0, Math.floor(fx)));
        const y0 = Math.min(gyn - 2, Math.max(0, Math.floor(fy)));
        const z0 = Math.min(gn - 2, Math.max(0, Math.floor(fz)));
        const tx = fx - x0, ty = fy - y0, tz = fz - z0;
        const at = (ix, iy, iz) => grid[(iz * gyn + iy) * gn + ix];
        const c00 = at(x0, y0, z0) + (at(x0 + 1, y0, z0) - at(x0, y0, z0)) * tx;
        const c10 = at(x0, y0 + 1, z0) + (at(x0 + 1, y0 + 1, z0) - at(x0, y0 + 1, z0)) * tx;
        const c01 = at(x0, y0, z0 + 1) + (at(x0 + 1, y0, z0 + 1) - at(x0, y0, z0 + 1)) * tx;
        const c11 = at(x0, y0 + 1, z0 + 1) + (at(x0 + 1, y0 + 1, z0 + 1) - at(x0, y0 + 1, z0 + 1)) * tx;
        const c0 = c00 + (c10 - c00) * ty;
        const c1 = c01 + (c11 - c01) * ty;
        return c0 + (c1 - c0) * tz;
      };
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const wx = ox + x, wz = oz + z;
          const h = terrainHeight[z * S + x];
          const yTop = Math.min(CY1, h - 6 - ((rngCave() * 3) | 0));
          for (let y = CY0; y <= yTop; y++) {
            const b = chunk.get(x, y, z);
            if (b !== BLOCK.STONE && b !== BLOCK.SLATE && b !== BLOCK.DIRT && b !== BLOCK.MOSSY) continue;
            const n = sample(x / STEP, (y - CY0) / STEP, z / STEP)
              + (fbm3d(wx * 0.09, y * 0.16, wz * 0.09, seed + 1600, 2) - 0.5) * 0.28;
            // К поверхности залы сходят на нет: иначе под холмами получается ровный срез
            const near = h - y;
            const extra = near < 13 ? (13 - near) * 0.022 : 0;
            if (n < 0.675 + extra) continue;
            chunk.set(x, y, z, BLOCK.AIR);
            if (y > carvedTop[z * S + x]) carvedTop[z * S + x] = y;
          }
        }
      }
    }

    // Входы в пещеры: в каждом чанке раскрываем лаз к самой близкой к поверхности
    // полости. Так пещеры всегда можно найти снаружи, а не только прокопаться наугад.
    let mouths = 0;
    for (let pass = 0; pass < 2; pass++) {
      let best = -1, bestX = 0, bestZ = 0;
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          const top = carvedTop[z * S + x];
          if (top < 4) continue;
          const h = terrainHeight[z * S + x];
          if (h <= SEA + 2) continue;                    // пляжи и дно не вскрываем
          const depth = h - 1 - top;                     // сколько породы над полостью
          if (depth < 2 || depth > 8) continue;
          // нужна настоящая полость, а не подрезанный блок
          if (chunk.get(x, top - 1, z) !== BLOCK.AIR) continue;
          if (best < 0 || depth < best) { best = depth; bestX = x; bestZ = z; }
        }
      }
      if (best < 0) break;
      const top = carvedTop[bestZ * S + bestX];
      // Лаз 2×2, чтобы можно было спуститься
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const x = bestX + dx, z = bestZ + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const h = terrainHeight[z * S + x];
        for (let y = top + 1; y < h; y++) {
          const b = chunk.get(x, y, z);
          if (b === BLOCK.WATER || b === BLOCK.ICE) break;
          chunk.set(x, y, z, BLOCK.AIR);
        }
      }
      // Затираем полость рядом с лазом, чтобы он не упирался в стену
      for (let dz = -1; dz <= 2; dz++) {
        for (let dx = -1; dx <= 2; dx++) {
          const x = bestX + dx, z = bestZ + dz;
          if (x < 1 || z < 1 || x >= S - 1 || z >= S - 1) continue;
          const b = chunk.get(x, top + 1, z);
          if (b === BLOCK.STONE || b === BLOCK.DIRT || b === BLOCK.MOSSY || b === BLOCK.GRAVEL) {
            chunk.set(x, top + 1, z, BLOCK.AIR);
          }
        }
      }
      mouths++;
      // Второй лаз — только если первый далеко от края (иначе дыр слишком много)
      if (pass === 0 && rngCave() > 0.45) break;
    }
    void mouths;

    // Вертикальные колодцы на поверхность (стали чаще и шире)
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (rngCave() >= 0.004) continue;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 3) continue;
        const depth = 8 + ((rngCave() * 10) | 0);
        for (let y = h - 1; y > h - depth; y--) {
          if (y < 2) break;
          const b = chunk.get(x, y, z);
          if (b === BLOCK.SLATE || b === BLOCK.WATER || b === BLOCK.ICE) break;
          chunk.set(x, y, z, BLOCK.AIR);
        }
      }
    }

    // Руды и гравий в каменных слоях
    const rngOre = makeRng(hash3(cx, 7, cz, seed) * 0x7fffffff);
    const veins = [
      [BLOCK.COAL_ORE, 9, 6, 34],
      [BLOCK.IRON_ORE, 6, 5, 28],
      [BLOCK.GOLD_ORE, 3, 4, 18],
      [BLOCK.DIAMOND_ORE, 2, 3, 12],
    ];
    for (const [ore, tries, size, maxY] of veins) {
      for (let i = 0; i < tries; i++) {
        const vx = (rngOre() * S) | 0;
        const vz = (rngOre() * S) | 0;
        const vy = 4 + ((rngOre() * maxY) | 0);
        if (chunk.get(vx, vy, vz) !== BLOCK.STONE) continue;
        for (let k = 0; k < size; k++) {
          const px2 = vx + ((rngOre() * 3) | 0) - 1;
          const pz2 = vz + ((rngOre() * 3) | 0) - 1;
          const py2 = vy + ((rngOre() * 3) | 0) - 1;
          if (px2 < 0 || pz2 < 0 || px2 >= S || pz2 >= S) continue;
          if (chunk.get(px2, py2, pz2) === BLOCK.STONE) chunk.set(px2, py2, pz2, ore);
        }
      }
    }
    // Сталактиты и сталагмиты: сосульки из сланца под потолком и наросты на полу
    const rngSpike = makeRng(hash3(cx, 11, cz, seed) * 0x7fffffff);
    for (let z = 1; z < S - 1; z++) {
      for (let x = 1; x < S - 1; x++) {
        for (let y = 6; y < 33; y++) {
          if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
          const ceil = chunk.get(x, y + 1, z);
          const floor = chunk.get(x, y - 1, z);
          const upper = ceil === BLOCK.STONE || ceil === BLOCK.SLATE;
          const lower = floor === BLOCK.STONE || floor === BLOCK.SLATE;
          if (upper && chunk.get(x, y - 1, z) === BLOCK.AIR && rngSpike() < 0.1) {
            chunk.set(x, y, z, BLOCK.SLATE);            // сталактит
          } else if (lower && chunk.get(x, y + 1, z) === BLOCK.AIR && rngSpike() < 0.07) {
            chunk.set(x, y, z, BLOCK.SLATE);            // сталагмит
          }
        }
      }
    }

    // Мох на стенах пещер (под поверхностью, рядом с пустотой)
    for (let z = 1; z < S - 1; z++) {
      for (let x = 1; x < S - 1; x++) {
        for (let y = 6; y < 34; y++) {
          if (chunk.get(x, y, z) !== BLOCK.STONE) continue;
          if (rngOre() > 0.35) continue;
          const nearAir =
            chunk.get(x + 1, y, z) === BLOCK.AIR || chunk.get(x - 1, y, z) === BLOCK.AIR ||
            chunk.get(x, y, z + 1) === BLOCK.AIR || chunk.get(x, y, z - 1) === BLOCK.AIR ||
            chunk.get(x, y + 1, z) === BLOCK.AIR;
          if (nearAir) chunk.set(x, y, z, BLOCK.MOSSY);
        }
      }
    }

    // Гравийные линзы
    for (let i = 0; i < 2; i++) {
      const gx = (rngOre() * S) | 0, gz = (rngOre() * S) | 0;
      const gy = 8 + ((rngOre() * 30) | 0);
      for (let k = 0; k < 7; k++) {
        const px2 = gx + ((rngOre() * 4) | 0) - 2;
        const pz2 = gz + ((rngOre() * 4) | 0) - 2;
        if (px2 < 0 || pz2 < 0 || px2 >= S || pz2 >= S) continue;
        if (chunk.get(px2, gy, pz2) === BLOCK.STONE) chunk.set(px2, gy, pz2, BLOCK.GRAVEL);
      }
    }

    // Деревья разных пород (полностью внутри чанка, чтобы не пересекать границы)
    const rng = makeRng(hash3(cx, 0, cz, seed) * 0x7fffffff);
    const treeCount = 3 + ((rng() * 3) | 0);
    for (let t = 0; t < treeCount; t++) {
      const tx = 3 + ((rng() * (S - 6)) | 0);
      const tz = 3 + ((rng() * (S - 6)) | 0);
      const th = terrainHeight[tz * S + tx];
      if (th <= SEA + 1 || th > 44) continue;
      const surface = chunk.get(tx, th, tz);
      if (surface !== BLOCK.GRASS && surface !== BLOCK.SNOW) continue;
      const cold = this.isCold(ox + tx, oz + tz);
      const tree = (surface === BLOCK.SNOW || cold) ? 'spruce' : (rng() < 0.32 ? 'birch' : 'oak');
      const put = (lx, ly, lz, id, onlyAir = true) => {
        if (lx < 0 || lz < 0 || lx >= S || lz >= S || ly < 0 || ly >= H) return;
        if (onlyAir && chunk.get(lx, ly, lz) !== BLOCK.AIR) return;
        chunk.set(lx, ly, lz, id);
      };
      if (tree === 'oak') {
        const trunkH = 4 + ((rng() * 3) | 0);
        for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
          const r = dy >= trunkH ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
              put(tx + dx, th + dy, tz + dz, BLOCK.LEAVES);
            }
          }
        }
        for (let dy = 1; dy <= trunkH; dy++) chunk.set(tx, th + dy, tz, BLOCK.LOG);
      } else if (tree === 'birch') {
        const trunkH = 5 + ((rng() * 3) | 0);
        for (let dy = trunkH - 2; dy <= trunkH + 1; dy++) {
          const r = dy >= trunkH ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if ((dx * dx + dz * dz) > r * r + 1) continue;
              if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.45) continue;
              put(tx + dx, th + dy, tz + dz, BLOCK.BIRCH_LEAVES);
            }
          }
        }
        for (let dy = 1; dy <= trunkH; dy++) chunk.set(tx, th + dy, tz, BLOCK.BIRCH_LOG);
      } else {
        // Ель: узкая коническая крона
        const trunkH = 6 + ((rng() * 3) | 0);
        for (let dy = 2; dy <= trunkH + 1; dy++) {
          const left = trunkH + 1 - dy;
          const r = left <= 1 ? 0 : left <= 3 ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
              if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.7) continue;
              put(tx + dx, th + dy, tz + dz, BLOCK.SPRUCE_LEAVES);
            }
          }
        }
        put(tx, th + trunkH + 2, tz, BLOCK.SPRUCE_LEAVES);
        for (let dy = 1; dy <= trunkH; dy++) chunk.set(tx, th + dy, tz, BLOCK.SPRUCE_LOG);
      }
    }

    // Кактусы в пустынях
    for (let i = 0; i < 3; i++) {
      const tx = 1 + ((rng() * (S - 2)) | 0);
      const tz = 1 + ((rng() * (S - 2)) | 0);
      const th = terrainHeight[tz * S + tx];
      if (th <= SEA + 1 || th > 40) continue;
      if (!this.isDry(ox + tx, oz + tz, th)) continue;
      if (chunk.get(tx, th, tz) !== BLOCK.SAND) continue;
      const ch = 2 + ((rng() * 2) | 0);
      for (let dy = 1; dy <= ch; dy++) {
        if (chunk.get(tx, th + dy, tz) === BLOCK.AIR) chunk.set(tx, th + dy, tz, BLOCK.CACTUS);
      }
    }

    // Декоративная трава и цветы — на травяных вершинах
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 1 || h >= H - 1) continue;
        if (chunk.get(x, h, z) !== BLOCK.GRASS) continue;
        if (chunk.get(x, h + 1, z) !== BLOCK.AIR) continue;
        const r = rng();
        if (r < 0.12) chunk.set(x, h + 1, z, BLOCK.TALL_GRASS);
        else if (r < 0.165) chunk.set(x, h + 1, z, BLOCK.FERN);
        else if (r < 0.19) chunk.set(x, h + 1, z, BLOCK.CLOVER);
        else if (r < 0.215) chunk.set(x, h + 1, z, BLOCK.FLOWER_RED);
        else if (r < 0.235) chunk.set(x, h + 1, z, BLOCK.FLOWER_YELLOW);
      }
    }

    // Применяем правки игрока, попадающие в чанк
    for (const [k, v] of this.edits) {
      const [ex, ey, ez] = k.split(',').map(Number);
      const lx = ex - ox, lz = ez - oz;
      if (lx >= 0 && lz >= 0 && lx < S && lz < S && ey >= 0 && ey < H) {
        chunk.set(lx, ey, lz, v);
      }
    }

    chunk.generated = true;
    chunk.dirty = true;
  }

  getBlock(wx, wy, wz) {
    if (wy < 0) return BLOCK.SLATE;
    if (wy >= H) return BLOCK.AIR;
    const cx = Math.floor(wx / S), cz = Math.floor(wz / S);
    const chunk = this.getChunk(cx, cz);
    return chunk.get(wx - cx * S, wy, wz - cz * S);
  }

  setBlock(wx, wy, wz, id, recordEdit = true) {
    if (wy < 0 || wy >= H) return false;
    const cx = Math.floor(wx / S), cz = Math.floor(wz / S);
    const chunk = this.getChunk(cx, cz);
    const lx = wx - cx * S, lz = wz - cz * S;
    if (chunk.get(lx, wy, lz) === id) return false;
    chunk.set(lx, wy, lz, id);
    chunk.dirty = true;
    if (recordEdit) {
      this.edits.set(`${wx},${wy},${wz}`, id);
    }
    // Соседние чанки на границе тоже перестраиваем
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === S - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === S - 1) this.markDirty(cx, cz + 1);
    return true;
  }

  markDirty(cx, cz) {
    const c = this.chunks.get(this.key(cx, cz));
    if (c) c.dirty = true;
  }

  isSolidAt(wx, wy, wz) {
    return isSolid(this.getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz)));
  }

  // Ищем точку возрождения: трава рядом с (0, 0) выше воды
  findSpawn() {
    for (let r = 0; r < 40; r++) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a) * r * 3);
        const z = Math.round(Math.sin(a) * r * 3);
        const h = this.heightAt(x, z);
        if (h <= SEA + 1) continue;
        // Не спавнимся над лазом в пещеру: под ногами должна быть целая порода
        if (this.getBlock(x, h - 1, z) === BLOCK.AIR) continue;
        if (this.getBlock(x, h - 2, z) === BLOCK.AIR) continue;
        return { x: x + 0.5, y: h + 1.2, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: H - 8, z: 0.5 };
  }

  serializeEdits() {
    const out = [];
    for (const [k, v] of this.edits) out.push(k, v);
    return out;
  }

  loadEdits(arr) {
    this.edits.clear();
    for (let i = 0; i + 1 < arr.length; i += 2) {
      this.edits.set(arr[i], arr[i + 1]);
    }
  }
}
