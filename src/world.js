// Мир: чанки-колонны, генерация рельефа, деревья, правки игрока
import { BLOCK, isDecor, isSolid, isTorch, torchSupport } from './blocks.js';
import { fbm2d, makeRng, hash3 } from './noise.js';
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
// Пещеры-«черви»: ходы стартуют в чанках вокруг и вырезаются там, где проходят
const CAVE_ORIGIN_R = 5;        // из скольких чанков вокруг может прийти ход
const CAVE_MAX_REACH = 76;      // максимальная длина хода (с ветками) от точки старта
const CAVE_BOTTOM = 5;          // ниже — сланцевое дно
const CAVE_TOP = 46;            // выше ходы не поднимаются
const CAVE_CRUST = 4;           // толщина нетронутой породы под поверхностью

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
    this.onUnsupportedDecor = null;   // (x,y,z,id) — растение/факел лишились опоры
    this.onBlockReplaced = null;      // (x,y,z,previous,id) — блок в клетке сменился
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

  /**
   * Вырезает пещеры-«черви», проходящие через чанк. Все ходы моделируются
   * детерминированно от сида чанка-источника, поэтому соседние чанки
   * вырезают одни и те же ходы и стыкуются без швов.
   */
  carveCaves(chunk, terrainHeight, carvedTop) {
    const cx = chunk.cx, cz = chunk.cz;
    const ox = cx * S, oz = cz * S;
    const seed = this.seed;

    // Эллипсоид полости; за пределами чанка ничего не делаем
    const carve = (x, y, z, rh, rv) => {
      if (x + rh < ox || x - rh >= ox + S || z + rh < oz || z - rh >= oz + S) return;
      const x0 = Math.max(ox, Math.floor(x - rh)), x1 = Math.min(ox + S - 1, Math.floor(x + rh));
      const z0 = Math.max(oz, Math.floor(z - rh)), z1 = Math.min(oz + S - 1, Math.floor(z + rh));
      const y0 = Math.max(CAVE_BOTTOM - 1, Math.floor(y - rv)), y1 = Math.min(H - 2, Math.floor(y + rv));
      for (let wz = z0; wz <= z1; wz++) {
        const dz = (wz + 0.5 - z) / rh;
        for (let wx = x0; wx <= x1; wx++) {
          const dx = (wx + 0.5 - x) / rh;
          const hz = dx * dx + dz * dz;
          if (hz >= 1) continue;
          const lx = wx - ox, lz = wz - oz;
          const ceil = terrainHeight[lz * S + lx] - CAVE_CRUST;
          for (let wy = y0; wy <= y1; wy++) {
            if (wy > ceil) break;
            const dy = (wy + 0.5 - y) / rv;
            if (hz + dy * dy >= 1) continue;
            const was = chunk.get(lx, wy, lz);
            if (was === BLOCK.AIR || was === BLOCK.WATER || was === BLOCK.ICE) continue;
            const above = chunk.get(lx, wy + 1, lz);
            if (above === BLOCK.WATER || above === BLOCK.ICE) continue;
            chunk.set(lx, wy, lz, BLOCK.AIR);
            if (wy > carvedTop[lz * S + lx]) carvedTop[lz * S + lx] = wy;
          }
        }
      }
    };

    // Подземный зал: несколько перекрывающихся эллипсоидов — неровные стены и свод
    const room = (rng, x, y, z) => {
      const rh = 3.2 + rng() * 3.6, rv = 2.0 + rng() * 1.6;
      carve(x, y, z, rh, rv);
      const blobs = 2 + ((rng() * 3) | 0);
      for (let i = 0; i < blobs; i++) {
        const a = rng() * Math.PI * 2, d = rh * (0.4 + rng() * 0.5);
        carve(x + Math.cos(a) * d, y + (rng() - 0.6) * rv, z + Math.sin(a) * d,
          rh * (0.45 + rng() * 0.35), rv * (0.6 + rng() * 0.4));
      }
    };

    // Один ход: шаг за шагом меняет направление, радиус «дышит» (перехваты),
    // к концу сужается до тупика. depth — уровень ветвления.
    const worm = (rng, x, y, z, yaw, pitch, length, radius, depth, travelled) => {
      let yawVel = 0, pitchVel = 0;
      const step = 0.85;
      const branchAt = depth < 2 && rng() < (depth ? 0.25 : 0.5) ? Math.floor(length * (0.25 + rng() * 0.5)) : -1;
      const phase = rng() * Math.PI * 2, freq = 0.06 + rng() * 0.09;
      // Склонность хода: чаще вниз (вглубь), иногда почти горизонтально или вверх
      const r0 = rng();
      const bias = r0 < 0.45 ? -(0.04 + rng() * 0.14) : r0 < 0.82 ? (rng() - 0.5) * 0.06 : 0.04 + rng() * 0.1;
      const steep = rng() < 0.25;          // крутой ход: наклон держится дольше
      for (let i = 0; i < length; i++) {
        if (travelled + i * step > CAVE_MAX_REACH) break;
        const left = length - i;
        const endTaper = Math.min(1, left / 14);           // сужение к тупику
        const startTaper = Math.min(1, 0.55 + i / 8);
        const squeeze = 0.78 + 0.32 * Math.sin(i * freq + phase);   // перехваты и расширения
        const r = radius * Math.sqrt(endTaper) * startTaper * squeeze;
        if (r > 0.55) {
          const rv = Math.max(Math.min(r, 1.15), r * (0.72 + 0.18 * Math.sin(i * 0.21 + phase * 1.7)));
          carve(x, y, z, r, rv);
        }
        if (i === branchAt) {
          const side = rng() < 0.5 ? -1 : 1;
          worm(rng, x, y, z, yaw + side * (Math.PI / 2 + (rng() - 0.5) * 0.9), pitch - rng() * 0.25,
            Math.floor(length * (0.4 + rng() * 0.4)), Math.max(1.05, radius * (0.65 + rng() * 0.25)),
            depth + 1, travelled + i * step);
        }
        const cp = Math.cos(pitch);
        x += Math.cos(yaw) * cp * step;
        z += Math.sin(yaw) * cp * step;
        y += Math.sin(pitch) * step;
        pitch = pitch * (steep ? 0.92 : 0.75) + pitchVel * 0.1 + bias * 0.25;
        yaw += yawVel * 0.1;
        pitchVel = pitchVel * 0.9 + (rng() - rng()) * rng() * 2;
        yawVel = yawVel * 0.75 + (rng() - rng()) * rng() * 4;
        if (pitch > 0.7) pitch = 0.7;
        if (pitch < -0.95) pitch = -0.95;
        if (y < CAVE_BOTTOM + 2) pitch = Math.abs(pitch) * 0.4 + 0.05;
        if (y > CAVE_TOP) pitch = -Math.abs(pitch) * 0.4 - 0.05;
      }
    };

    for (let gcz = cz - CAVE_ORIGIN_R; gcz <= cz + CAVE_ORIGIN_R; gcz++) {
      for (let gcx = cx - CAVE_ORIGIN_R; gcx <= cx + CAVE_ORIGIN_R; gcx++) {
        const rng = makeRng(hash3(gcx, 913, gcz, seed) * 0x7fffffff);
        const roll = rng();
        const count = roll < 0.5 ? 0 : roll < 0.84 ? 1 : roll < 0.96 ? 2 : 3;
        for (let k = 0; k < count; k++) {
          const x = gcx * S + rng() * S, z = gcz * S + rng() * S;
          // Старт — ниже местной поверхности: под горами системы начинаются выше и уходят глубже
          const surf = this.baseHeightAt(Math.floor(x), Math.floor(z));
          const y = CAVE_BOTTOM + 3 + rng() * Math.max(6, Math.min(CAVE_TOP, surf - CAVE_CRUST - 3) - CAVE_BOTTOM - 3);
          const yaw = rng() * Math.PI * 2;
          const pitch = (rng() - 0.6) * 0.5;
          const big = rng() < 0.12;
          const radius = big ? 2.4 + rng() * 1.5 : 1.3 + rng() * 1.0;
          const length = Math.floor(38 + rng() * 52);
          if (rng() < 0.28) room(rng, x, y, z);
          worm(rng, x, y, z, yaw, pitch, length, radius, 0, 0);
          // Часто из той же точки ход идёт и в обратную сторону — зал оказывается посередине
          if (rng() < 0.5) {
            worm(rng, x, y, z, yaw + Math.PI + (rng() - 0.5) * 0.6, -pitch, Math.floor(length * (0.5 + rng() * 0.5)),
              radius * (0.8 + rng() * 0.3), 1, 0);
          }
        }
      }
    }
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

    // Пещеры: конечные извилистые ходы («черви»). Каждый ход стартует в своём чанке,
    // петляет, уходит вглубь или поднимается, сужается и заканчивается тупиком;
    // иногда ветвится или начинается с подземного зала. Никакой сплошной полосы.
    const carvedTop = new Int16Array(S * S);
    this.carveCaves(chunk, terrainHeight, carvedTop);

    // Выравнивание пола пещер: где рядом с полом зияет яма глубже двух блоков,
    // подсыпаем камень. Спуски и подъёмы превращаются в ступени по два блока —
    // по ним можно и спуститься, и подняться, не падая. Проход в два блока
    // повторяем дважды: первый проход поднимает пол, второй чинит склоны за ним.
    for (let pass = 0; pass < 2; pass++) {
      for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
          for (let y = Math.min(terrainHeight[z * S + x] - 4, CAVE_TOP); y >= 4; y--) {
            if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
            // над полом должно быть место в рост игрока (1.8 блока)
            if (chunk.get(x, y + 1, z) !== BLOCK.AIR) continue;
            if (!isSolid(chunk.get(x, y - 1, z))) continue;          // под ногами не пол
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = x + dx, nz = z + dz;
              if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
              if (chunk.get(nx, y, nz) !== BLOCK.AIR) continue;      // туда не шагнуть
              if (chunk.get(nx, y - 1, nz) !== BLOCK.AIR) continue;  // там не яма
              let yf = y - 1;
              while (yf > 5 && chunk.get(nx, yf - 1, nz) === BLOCK.AIR) yf--;
              if (chunk.get(nx, yf - 1, nz) === BLOCK.WATER) continue;   // озеро не засыпаем
              if (yf < 5 || y - yf < 3) continue;
              for (let fy = yf; fy <= y - 2; fy++) chunk.set(nx, fy, nz, BLOCK.STONE);
            }
          }
        }
      }
    }

    // Вход в пещеру: в самом «тонком» месте чанка прорубаем колодец от поверхности
    // к полости, а внутри — каменную винтовую лестницу от поверхности до самого
    // пола пещеры. Спускаться и выбираться можно шагом, отвесных ям нет.
    let best = -1, bestX = 0, bestZ = 0;
    for (let z = 1; z < S - 1; z++) {
      for (let x = 1; x < S - 1; x++) {
        const top = carvedTop[z * S + x];
        if (top < 4) continue;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 2) continue;                    // пляжи и дно не вскрываем
        const depth = h - 1 - top;                     // сколько породы над полостью
        if (depth < 2 || depth > 13) continue;
        // нужна настоящая полость, а не подрезанный блок
        if (chunk.get(x, top - 1, z) !== BLOCK.AIR) continue;
        // и ход достаточно глубокий, чтобы спуск был лестницей, а не ямкой
        let floor = top;
        while (floor > 5 && chunk.get(x, floor - 1, z) === BLOCK.AIR) floor--;
        if (h - floor < 7) continue;
        if (best < 0 || depth < best) { best = depth; bestX = x; bestZ = z; }
      }
    }
    if (best >= 0) {
      const top = carvedTop[bestZ * S + bestX];
      const SHAFT = [[0, 0], [1, 0], [1, 1], [0, 1]];   // обход по периметру 2×2
      // Открытый лаз сверху до полости: вскрываем и дерновый слой, иначе вход не найти
      let minH = H;
      for (const [dx, dz] of SHAFT) {
        const x = bestX + dx, z = bestZ + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        const h = terrainHeight[z * S + x];
        if (h < minH) minH = h;
        for (let y = top + 1; y <= h; y++) {
          const b = chunk.get(x, y, z);
          if (b === BLOCK.WATER || b === BLOCK.ICE) break;
          chunk.set(x, y, z, BLOCK.AIR);
        }
      }
      // Самый глубокий пол под колодцем — докуда вести лестницу
      let base = top;
      for (const [dx, dz] of SHAFT) {
        const x = bestX + dx, z = bestZ + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        let y = top;
        while (y > 5 && chunk.get(x, y - 1, z) === BLOCK.AIR) y--;
        if (y < base) base = y;
      }
      // Винтовая лестница: каждая следующая ступень на блок ниже и на блок в сторону.
      // Начинаем от самой низкой стенки лаза, чтобы первый шаг был в один блок.
      for (let y = minH - 1, k = 0; y > base; y--, k++) {
        const [dx, dz] = SHAFT[k % 4];
        const x = bestX + dx, z = bestZ + dz;
        if (x < 0 || z < 0 || x >= S || z >= S) continue;
        if (y > terrainHeight[z * S + x]) continue;     // над землёй ступеней не ставим
        if (chunk.get(x, y, z) === BLOCK.AIR) chunk.set(x, y, z, BLOCK.STONE);
      }
    }

    // Отдельных вертикальных колодцев больше нет: каждый вход — лестница,
    // по которой можно спуститься и подняться без падений.

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
        const yMax = Math.min(CAVE_TOP + 1, terrainHeight[z * S + x] - CAVE_CRUST + 1);
        for (let y = 6; y < yMax; y++) {
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
        const yMax = Math.min(CAVE_TOP + 1, terrainHeight[z * S + x] - CAVE_CRUST + 1);
        for (let y = 6; y < yMax; y++) {
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
    // Каждое четвёртое дерево — «большое»: высокий толстый ствол, ветки и широкая крона
    let bigCounter = 0;
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
      // Большая крона шире на 2 клетки, поэтому такому дереву нужно больше места
      const bigRoll = rng();
      const isBig = bigRoll < 0.26 && tree !== 'birch' && bigCounter < 2;
      if (isBig) {
        if (tx < 5 || tz < 5 || tx >= S - 5 || tz >= S - 5) continue;
        if (th + 14 >= H) continue;
        bigCounter++;
        if (tree === 'spruce') growBigSpruce(tx, tz, th, put);
        else growBigOak(tx, tz, th, put);
        continue;
      }
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

    // -------------------------------------------------- большие деревья
    /**
     * Огромный дуб: ствол 9–12 блоков толщиной 2×2, ветки в разные стороны
     * и двухъярусная крона. Ветки и листва ставятся только в воздух,
     * чтобы не «съедать» соседние деревья и рельеф.
     */
    function growBigOak(tx, tz, th, put) {
      const trunkH = 9 + ((rng() * 4) | 0);
      const top = th + trunkH;
      // Крона: два яруса, радиус 3 и 2 (+ «шапка» на макушке)
      for (let dy = -3; dy <= 2; dy++) {
        const y = top + dy;
        if (y < 0 || y >= H) continue;
        const r = dy <= -2 ? 3 : dy <= 0 ? 3 : dy === 1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const d2 = dx * dx + dz * dz;
            if (d2 > r * r + 1) continue;
            // углы короны прореживаем — крона выглядит живой, а не «кубиком»
            if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.55) continue;
            if (d2 === r * r + 1 && rng() < 0.4) continue;
            put(tx + dx, y, tz + dz, BLOCK.LEAVES);
          }
        }
      }
      // Ветки: 3–4 штуки, расходятся от ствола вверх-наружу
      const branches = 3 + ((rng() * 2) | 0);
      for (let b = 0; b < branches; b++) {
        const ang = rng() * Math.PI * 2;
        const sx = Math.sin(ang), sz = Math.cos(ang);
        const y0 = th + 4 + ((rng() * (trunkH - 5)) | 0);
        const len = 2 + ((rng() * 3) | 0);
        for (let k = 1; k <= len; k++) {
          const bx = Math.round(tx + sx * k);
          const bz = Math.round(tz + sz * k);
          const by = y0 + Math.round(k * 0.7);
          if (by < 0 || by >= H) continue;
          chunk.set(bx, by, bz, BLOCK.LOG);
          put(bx, by + 1, bz, BLOCK.LEAVES);
          put(bx + 1, by, bz, BLOCK.LEAVES);
          put(bx - 1, by, bz, BLOCK.LEAVES);
          put(bx, by, bz + 1, BLOCK.LEAVES);
          put(bx, by, bz - 1, BLOCK.LEAVES);
        }
      }
      // Ствол 2×2 (ставим поверх листвы — он всегда виден)
      for (let dy = 1; dy <= trunkH; dy++) {
        for (let dx = 0; dx <= 1; dx++) {
          for (let dz = 0; dz <= 1; dz++) {
            if (dx && dz && rng() < 0.25) continue;      // лёгкая неровность верха
            chunk.set(tx + dx, th + dy, tz + dz, BLOCK.LOG);
          }
        }
      }
      // Корни-подпорки у основания
      for (const [dx, dz] of [[-1, 0], [2, 0], [0, -1], [0, 2], [-1, -1], [2, 2]]) {
        if (rng() < 0.5) put(tx + dx, th + 1, tz + dz, BLOCK.LOG);
      }
    }

    /** Огромная ель: высокий ствол и широкие ярусы лап, сужающиеся кверху */
    function growBigSpruce(tx, tz, th, put) {
      const trunkH = 11 + ((rng() * 4) | 0);
      const top = th + trunkH;
      // Ярусы лап: снизу (r=3) кверху (r=0)
      const tiers = 5;
      for (let i = 0; i < tiers; i++) {
        const y = th + 3 + Math.round((trunkH - 3) * (i / (tiers - 1)));
        const r = 3 - Math.round(i * 0.7);
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const man = Math.abs(dx) + Math.abs(dz);
            if (man > r + 1) continue;
            if (man === r + 1 && rng() < 0.45) continue;
            if (dx === 0 && dz === 0) continue;          // центр займёт ствол
            put(tx + dx, y, tz + dz, BLOCK.SPRUCE_LEAVES);
            // под длинными лапами — ещё один слой, чтобы крона не была «бумажной»
            if (r >= 2 && man >= r && rng() < 0.5) put(tx + dx, y - 1, tz + dz, BLOCK.SPRUCE_LEAVES);
          }
        }
      }
      put(tx, top + 1, tz, BLOCK.SPRUCE_LEAVES);
      put(tx, top + 2, tz, BLOCK.SPRUCE_LEAVES);
      // Ствол 2×2 и торчащая макушка
      for (let dy = 1; dy <= trunkH; dy++) {
        chunk.set(tx, th + dy, tz, BLOCK.SPRUCE_LOG);
        if (dy <= trunkH - 2 && rng() < 0.7) chunk.set(tx + 1, th + dy, tz, BLOCK.SPRUCE_LOG);
      }
      for (const [dx, dz] of [[-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1]]) {
        if (rng() < 0.35) put(tx + dx, th + 1, tz + dz, BLOCK.SPRUCE_LOG);
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
    const previous = chunk.get(lx, wy, lz);
    if (previous === id) return false;
    chunk.set(lx, wy, lz, id);
    chunk.dirty = true;
    if (recordEdit) {
      this.edits.set(`${wx},${wy},${wz}`, id);
    }
    // Хранилища (сундук, печь) рассыпают содержимое, когда блок исчезает
    if (this.onBlockReplaced) this.onBlockReplaced(wx, wy, wz, previous, id);
    // Растения и факелы не висят в воздухе: если опора исчезла,
    // автоматически убираем декор над ней и сохраняем эту правку.
    if (!isSolid(id) && !isDecor(id)) {
      const above = wy + 1 < H ? this.getBlock(wx, wy + 1, wz) : BLOCK.AIR;
      if (isDecor(above)) {
        this.setBlock(wx, wy + 1, wz, BLOCK.AIR, recordEdit);
        if (this.onUnsupportedDecor) this.onUnsupportedDecor(wx, wy + 1, wz, above);
      }
    }
    // Настенные факелы держатся за боковую стену: вместе с опорой убираем и их.
    if (!isSolid(id)) {
      for (const [dx, dy, dz] of [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]]) {
        const nx = wx + dx, nz = wz + dz;
        const neighbour = this.getBlock(nx, wy, nz);
        if (!isDecor(neighbour)) continue;
        if (torchSupport(neighbour, this, nx, wy, nz) === null) {
          this.setBlock(nx, wy, nz, BLOCK.AIR, recordEdit);
          if (this.onUnsupportedDecor) this.onUnsupportedDecor(nx, wy, nz, neighbour);
        }
      }
    }
    // Свет факела выходит за пределы чанка — обновляем соседние меши.
    if (isTorch(previous) || isTorch(id)) {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx || dz) this.markDirty(cx + dx, cz + dz);
        }
      }
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
