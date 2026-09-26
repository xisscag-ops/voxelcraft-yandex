// Мир: чанки-колонны, генерация рельефа, деревья, правки игрока
import { BLOCK, BLOCKS, isDecor, isSolid, isTorch, torchSupport } from './blocks.js';
import { fbm2d, makeRng, hash3 } from './noise.js';
import { CONFIG } from './config.js';

const S = CONFIG.CHUNK_SIZE;
// Пороговые значения биомов (подобраны так, чтобы зима и пустыни были редкими):
// пустыни — примерно 10% мира, снежные зоны — около 8%
const DRY_T = 0.735;      // сухие (пустынные) зоны
const COLD_T = 0.74;      // холодные (снежные) зоны
const ROCK_H = 41;        // выше — голый камень (горные склоны и скалы)
const PEAK_H = 51;        // выше — снежные вершины
const H = CONFIG.WORLD_HEIGHT;
const SEA = CONFIG.SEA_LEVEL;
const FEATURE_CELL = 160;       // глобальная сетка для карьер и разломов
// Пещеры-«черви»: ходы стартуют в чанках вокруг и вырезаются там, где проходят
const CAVE_ORIGIN_R = 5;        // из скольких чанков вокруг может прийти ход
const CAVE_MAX_REACH = 96;      // максимальная длина хода (с ветками) от точки старта
const CAVE_BOTTOM = 5;          // ниже — сланцевое дно
const CAVE_TOP = 46;            // выше ходы не поднимаются
const CAVE_CRUST = 5;           // толщина нетронутой породы под поверхностью
// Периметр колодца 3×3 — по нему идёт винтовая лестница входа в пещеру
const RING_8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

function idx(x, y, z) {
  return (y * S + z) * S + x;
}

// Плавный шаг 0..1 (как smoothstep): для мягких масок биомов без швов
function smooth01(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/**
 * Выравнивание пола пещер: где рядом с проходимым полом зияет яма глубже двух
 * блоков, подсыпаем камень — спуски и подъёмы превращаются в ступени по два
 * блока, по которым можно и спуститься, и подняться, не падая.
 * @param {Chunk} chunk
 * @param {Int16Array} terrainHeight высоты поверхности по колонкам чанка
 * @param {number} passes сколько раз повторить проход (склоны чинятся за полом)
 * @param {{x: number, z: number}|null} protect вход-лестница, который не трогаем
 */
function alignCaveFloors(chunk, terrainHeight, passes, protect = null) {
  for (let pass = 0; pass < passes; pass++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        if (protect && Math.abs(x - protect.x) <= 1 && Math.abs(z - protect.z) <= 1) continue;
        for (let y = Math.min(terrainHeight[z * S + x] - 4, CAVE_TOP); y >= 4; y--) {
          if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
          // над полом должно быть место в рост игрока (1.8 блока)
          if (chunk.get(x, y + 1, z) !== BLOCK.AIR) continue;
          if (!isSolid(chunk.get(x, y - 1, z))) continue;          // под ногами не пол
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= S || nz >= S) continue;
            if (protect && Math.abs(nx - protect.x) <= 1 && Math.abs(nz - protect.z) <= 1) continue;
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
    this.genLights = null;   // [{x,y,z}] — светящиеся растения, выращенные генератором
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
    this.lootChests = new Set();      // "x,y,z" — сундуки с лутом, сгенерированные в пещерах
    this.waterQueue = [];             // клетки, которым предстоит проверка на затекание воды
    this.waterQueued = new Map();     // дедупликация очереди: ключ -> минимальный запас «шагов»
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

  // Равнины-поля: крупные плоские области, на которых рельеф прижат к нулю.
  // Возвращает вес 0..1 (1 — совершенно плоское поле).
  plainsAt(wx, wz) {
    const n = fbm2d(wx * 0.0031 + 911, wz * 0.0031 - 311, this.seed + 733, 2);
    return smooth01((n - 0.55) / 0.14);
  }

  // Холмистые края: региональный усилитель мелкого рельефа (мягкие волны-холмы)
  hillCountryAt(wx, wz) {
    const n = fbm2d(wx * 0.0026 - 53, wz * 0.0026 + 117, this.seed + 311, 2);
    return smooth01((n - 0.56) / 0.12);
  }

  // Базовая высота поверхности без геологических особенностей.
  // Мир делится на регионы-биомы по рельефу: плоские поля-луга, холмистая
  // местность, высокие скальные горы с острыми гребнями, пустыни с дюнами;
  // крупные кратеры с валом вырезаются отдельным слоем (featureAt).
  baseHeightAt(wx, wz) {
    const seed = this.seed;
    const cont = fbm2d(wx * 0.006, wz * 0.006, seed, 4);           // континентальность
    const hills = fbm2d(wx * 0.03, wz * 0.03, seed + 991, 3);      // мелкий рельеф
    const mt = fbm2d(wx * 0.0022, wz * 0.0022, seed + 77, 2);      // горные массивы
    const massif = fbm2d(wx * 0.0012 + 7, wz * 0.0012 - 11, seed + 411, 2);  // крупные массивы
    const ridgeN = fbm2d(wx * 0.0048 + 13, wz * 0.0048 - 27, seed + 505, 3);
    const ridgeHi = fbm2d(wx * 0.012 + 41, wz * 0.012 - 8, seed + 909, 3);   // скальные зубья
    const plainsW = this.plainsAt(wx, wz);                         // вес полей
    const hillW = this.hillCountryAt(wx, wz);                      // вес холмистых краёв
    const c = Math.tanh((cont - 0.5) * 5);
    // Континентальность в полях почти выключена: поле держится у уровня моря,
    // а не уезжает на дно океана или в гору.
    let h = SEA + 3 + c * 18 * (1 - plainsW * 0.8);
    // Холмы: в холмистых краях волны заметно крупнее (+170%), в полях —
    // почти ровный стол (травяные просторы под застройку).
    const hillAmp = 12 * (1 + hillW * 1.7) * (1 - plainsW * 0.9);
    h += (hills - 0.5) * hillAmp;
    // Горы двух порядков: обычные хребты и крупные массивы. Массивы тянутся
    // сотни блоков и поднимают хребты на десятки блоков — это «большие горы».
    // Сквозь поля горы если и прорываются, то редко и сильно ниже.
    const mountain = Math.max(0, mt - 0.42) / 0.58;
    const big = Math.max(0, massif - 0.4) / 0.6;
    const mMask = 1 - plainsW * 0.78;
    const amp = 41 * (1 + big * 0.6);
    // Острые пики: степень выше единицы делает подножие пологим, а вершину — крутой;
    // зазубренный гребень (ridge) добавляет горам резкие кромки и скалы.
    h += Math.pow(mountain, 1.7) * amp * mMask;
    const ridge = 1 - Math.abs(ridgeN * 2 - 1);
    h += Math.pow(ridge, 2.2) * mountain * (26 + big * 14) * mMask;
    // Второй, мелкий гребень: каменные зубья и расщелины на склонах —
    // именно они дают «скальный» характер высоким горам.
    const ridgeF = 1 - Math.abs(ridgeHi * 2 - 1);
    h += Math.pow(ridgeF, 3.2) * mountain * 9 * mMask;
    // Пустынные дюны: в сухих зонах ниже гор рельеф идёт волнами-гребнями,
    // сбитыми шумом, чтобы дюны не были идеальными параллельными линиями.
    const dry = this.dryAt(wx, wz);
    if (dry > DRY_T && h < ROCK_H - 2 && this.temperatureAt(wx, wz) <= COLD_T) {
      const dw = smooth01((dry - DRY_T - 0.01) / 0.09) * (1 - mountain);
      if (dw > 0) {
        const sway = fbm2d(wx * 0.017 + 23, wz * 0.017 - 19, seed + 555, 2);
        const crest = Math.pow(Math.abs(Math.sin(wx * 0.055 + wz * 0.021 + sway * 2.6)), 1.5);
        h += (crest - 0.55) * 3.4 * dw;
      }
    }
    // Мягкий потолок: у самого верха мира горы выполаживаются, а не спиливаются
    // в одно плоское плато — иначе большие массивы выглядели бы столешницей.
    const ceiling = H - 3;
    if (h > ceiling - 10) {
      const over = h - (ceiling - 10);
      h = ceiling - 10 + 10 * (1 - Math.exp(-over / 10));
    }
    return Math.max(3, Math.min(ceiling, Math.round(h)));
  }

  /**
   * Детерминированная геологическая особенность рядом с колонкой.
   * Кратеры, карьеры и разломы встречаются в нескольких вариантах формы:
   * ударные чаши с приподнятым валом, террасные выемки, узкие каньоны-карьеры,
   * глубокие колодцы; у разломов — прямые и сильно изогнутые, с разными
   * профилями глубины и ширины.
   */
  featureAt(wx, wz) {
    const gx0 = Math.floor(wx / FEATURE_CELL);
    const gz0 = Math.floor(wz / FEATURE_CELL);
    let best = null;
    for (let gz = gz0 - 1; gz <= gz0 + 1; gz++) {
      for (let gx = gx0 - 1; gx <= gx0 + 1; gx++) {
        const roll = hash3(gx, 137, gz, this.seed);
        const type = roll < 0.07 ? 'crater' : roll < 0.26 ? 'quarry' : roll < 0.44 ? 'rift' : null;
        if (!type) continue;
        const fx = (gx + 0.25 + hash3(gx, 211, gz, this.seed) * 0.5) * FEATURE_CELL;
        const fz = (gz + 0.25 + hash3(gx, 307, gz, this.seed) * 0.5) * FEATURE_CELL;
        const dx = wx - fx, dz = wz - fz;
        let feature;

        if (type === 'crater') {
          // Ударный кратер: гладкая чаша с обсидиановым ядром и приподнятым
          // валом по краю. Силуэт чуть «морщинится» — кратер не идеальный круг.
          const rx = 13 + hash3(gx, 1901, gz, this.seed) * 9;
          const rz = 12 + hash3(gx, 1903, gz, this.seed) * 8;
          const wob = Math.sin(Math.atan2(dz, dx) * 3 + hash3(gx, 1907, gz, this.seed) * Math.PI * 2) * 0.045;
          const radius = Math.hypot(dx / rx, dz / rz) + wob;
          if (radius >= 1) continue;
          const depth = 5 + hash3(gx, 1909, gz, this.seed) * 6;
          const rimH = 2.2 + hash3(gx, 1913, gz, this.seed) * 3.4;
          let cut = 0, rim = 0;
          if (radius < 0.72) {
            // Чаша: глубже всего в центре, к валу выходит на нет
            cut = Math.floor(depth * Math.pow(1 - radius / 0.72, 1.35));
          } else {
            // Вал: кольцевой валик отброшенной породы, спадающий наружу
            const t = Math.min(1, (radius - 0.72) / 0.28);
            rim = Math.round(rimH * Math.sin(Math.PI * t));
          }
          if (cut < 2 && rim < 2) continue;
          feature = { type, style: 'impact', cut, rim, radius, rx, rz, depth, x: fx, z: fz };
        } else if (type === 'quarry') {
          // Четыре силуэта: округлая чаша, террасный карьер, вытянутый каньон и колодец
          const styleRoll = hash3(gx, 1201, gz, this.seed);
          const style = styleRoll < 0.34 ? 'bowl' : styleRoll < 0.62 ? 'terrace' : styleRoll < 0.85 ? 'canyon' : 'pit';
          const rx = 11 + hash3(gx, 401, gz, this.seed) * 8;
          const rz = 10 + hash3(gx, 503, gz, this.seed) * 7;
          const depth = 9 + hash3(gx, 601, gz, this.seed) * 9;
          let radius, cut;
          if (style === 'canyon') {
            // Каньон: узкий длинный карьер со ступенчатыми стенками
            const angle = hash3(gx, 1301, gz, this.seed) * Math.PI;
            const along = dx * Math.cos(angle) + dz * Math.sin(angle);
            const across = -dx * Math.sin(angle) + dz * Math.cos(angle);
            const len = 16 + hash3(gx, 1403, gz, this.seed) * 8;
            const wave = Math.sin(along * 0.22 + gx) * 1.3;
            radius = Math.max(Math.abs(along) / len, Math.abs(across + wave) / (rz * 0.55));
            if (radius >= 1) continue;
            const step = 4;
            cut = Math.floor(((1 - radius * radius) * depth * 1.25) / step) * step;
          } else if (style === 'pit') {
            // Глубокий колодец: маленький радиус, большая глубина, почти отвесные стены
            radius = Math.hypot(dx / (rx * 0.5), dz / (rz * 0.5));
            if (radius >= 1) continue;
            const step = 2;
            cut = Math.floor((Math.pow(1 - radius, 0.55) * depth * 1.7) / step) * step;
          } else {
            const rim = Math.sin(dx * 0.37 + gx) * Math.sin(dz * 0.31 + gz) * 0.035;
            radius = Math.hypot(dx / rx, dz / rz) + rim;
            if (radius >= 1) continue;
            if (style === 'terrace') {
              const step = 2 + ((hash3(gx, 1503, gz, this.seed) * 2) | 0);
              cut = Math.floor(((1 - radius) * depth * 1.15) / step) * step;
            } else {
              cut = Math.floor(((1 - radius) * depth) / 3) * 3;
            }
          }
          if (cut < 3) continue;
          feature = { type, style, cut, radius, rx, rz, depth, x: fx, z: fz };
        } else {
          const angle = hash3(gx, 701, gz, this.seed) * Math.PI * 2;
          const along = dx * Math.cos(angle) + dz * Math.sin(angle);
          const across = -dx * Math.sin(angle) + dz * Math.cos(angle);
          const halfLength = 44 + hash3(gx, 809, gz, this.seed) * 24;
          if (Math.abs(along) >= halfLength) continue;
          const phase = hash3(gx, 907, gz, this.seed) * Math.PI * 2;
          // Два характера изгиба: плавная меандра или резкий рывок в сторону
          const bendStyle = hash3(gx, 1601, gz, this.seed);
          const bend = bendStyle < 0.5
            ? Math.sin(along * 0.052 + phase) * 2.4 + Math.sin(along * 0.13 - phase) * 0.7
            : Math.sin(along * 0.028 + phase) * 3.6 + Math.sin(along * 0.19 - phase) * 1.6;
          // Ширина: ровная, клиновидная или с «карманами» по сторонам
          const widthRoll = hash3(gx, 1703, gz, this.seed);
          const t = along / halfLength;                       // -1..1 вдоль разлома
          let width = 3.2 + hash3(gx, 1009, gz, this.seed) * 2.7;
          if (widthRoll < 0.33) width *= 1 - Math.abs(t) * 0.4;                    // сужается к концам
          else if (widthRoll < 0.66) width *= 1 + Math.sin(t * 5 + phase) * 0.35;  // карманы
          const acrossDist = Math.abs(across - bend);
          const radius = acrossDist / width;
          if (radius >= 1) continue;
          const depth = 19 + hash3(gx, 1103, gz, this.seed) * 17;
          // Профиль глубины: у половины разломов дно идёт уступами к одному концу,
          // у остальных — чаша с обрывистыми стенками и несколькими террасами.
          let cut;
          if (bendStyle >= 0.5) {
            const taper = 1 - Math.max(0, t) * 0.55;         // глубже к одному концу
            const step = 2;
            cut = Math.floor((depth * Math.pow(Math.max(0, 1 - radius), 0.42) * taper) / step) * step;
          } else {
            cut = Math.floor((depth * Math.pow(1 - radius, 0.42)) / 2) * 2;
          }
          if (cut < 2) continue;
          feature = { type, style: bendStyle >= 0.5 ? 'tapered' : 'meander', cut, radius, width, depth, along, halfLength, x: fx, z: fz };
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
    const cut = Math.min(feature.cut || 0, base - (SEA + 4));
    const rim = feature.rim || 0;
    if (cut < 2 && rim < 2) return base;
    // Вал кратера не должен пробивать потолок мира
    return Math.max(3, Math.min(H - 3, base - cut + rim));
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
      const rh = 4.2 + rng() * 4.4, rv = 2.6 + rng() * 2.0;
      carve(x, y, z, rh, rv);
      const blobs = 3 + ((rng() * 4) | 0);
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
          const big = rng() < 0.3;
          const radius = big ? 3.0 + rng() * 1.8 : 1.6 + rng() * 1.1;
          const length = Math.floor(44 + rng() * 64);
          if (rng() < 0.38) room(rng, x, y, z);
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
          const safeCut = Math.min(feature.cut || 0, baseH - (SEA + 4));
          feature.cut = safeCut;
          if (safeCut < 2 && (feature.rim || 0) < 2) feature = null;
        }
        const h = Math.max(3, Math.min(H - 3, baseH - (feature?.cut || 0) + (feature?.rim || 0)));
        terrainHeight[z * S + x] = h;
        const excavated = !!(feature && feature.cut >= 3);
        const craterCore = feature?.type === 'crater' && feature.radius < 0.34;
        const craterWall = feature?.type === 'crater' && feature.rim >= 2;
        const cold = this.temperatureAt(wx, wz) > COLD_T;    // снежные зоны редкие
        const dry = !cold && !this.isRocky(h) && this.dryAt(wx, wz) > DRY_T;   // пустыни
        const rocky = this.isRocky(h);                        // высокогорье — голый камень
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let b = BLOCK.AIR;
          if (y > h) {
            // В холодных зонах вода сверху затянута льдом
            b = y <= SEA ? ((cold && y === SEA) ? BLOCK.ICE : BLOCK.WATER) : BLOCK.AIR;
          } else if (y === h) {
            if (craterCore) {
              // Ядро кратера: оплавленный центр удара — обсидиан в камне
              b = hash3(wx, y, wz, seed + 3400) < 0.55 ? BLOCK.OBSIDIAN : BLOCK.STONE;
            } else if (excavated || craterWall) {
              // В кратере, карьере и разломе на поверхность выходят коренные породы.
              b = h < 7 ? BLOCK.SLATE
                : (feature.type === 'quarry' || craterWall) && hash3(wx, y, wz, seed + 3300) < 0.07 ? BLOCK.GRAVEL
                  : BLOCK.STONE;
            } else if (h <= SEA + 2) b = cold ? BLOCK.SNOWY_SAND : BLOCK.SAND;  // пляжи; в холодных зонах песок под снегом
            else if (h >= PEAK_H) b = BLOCK.SNOW;            // снежные вершины
            else if (rocky) b = BLOCK.STONE;
            else if (cold) b = BLOCK.SNOW;
            else if (dry) b = BLOCK.SAND;
            else b = BLOCK.GRASS;
          } else if (y >= h - 3) {
            if (craterCore) b = y < 5 ? BLOCK.SLATE : (hash3(wx, y, wz, seed + 3400) < 0.35 ? BLOCK.OBSIDIAN : BLOCK.STONE);
            else if (excavated || craterWall) b = y < 5 ? BLOCK.SLATE : BLOCK.STONE;
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
    // подсыпаем камень. Проход в два блока повторяем дважды: первый поднимает
    // пол, второй чинит склоны за ним.
    alignCaveFloors(chunk, terrainHeight, 2);

    // Вход в пещеру: ищем место у подножия склона (подошва горы, холма или
    // обрыва) с тонкой породой над полостью и прорубаем просторный колодец 3×3
    // с каменной винтовой лестницей-спиралью вокруг центрального столба.
    let bestScore = -Infinity, bestX = 0, bestZ = 0, bestTop = 0;
    for (let z = 2; z < S - 2; z++) {
      for (let x = 2; x < S - 2; x++) {
        const top = carvedTop[z * S + x];
        if (top < 4) continue;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 2) continue;                    // пляжи и дно не вскрываем
        const depth = h - 1 - top;
        if (depth < 2 || depth > 14) continue;
        // нужна настоящая полость, а не подрезанный блок
        if (chunk.get(x, top - 1, z) !== BLOCK.AIR) continue;
        // и ход достаточно глубокий, чтобы спуск был лестницей, а не ямкой
        let floor = top;
        while (floor > 5 && chunk.get(x, floor - 1, z) === BLOCK.AIR) floor--;
        if (h - floor < 7) continue;
        // Рельеф вокруг: вход тем уместнее, чем выше местность поднимается рядом
        // (подножие склона), и тем хуже, чем больше вокруг ям и обрывов вниз.
        let rise = 0, drop = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1],
          [2, 0], [-2, 0], [0, 2], [0, -2]]) {
          const nh = terrainHeight[(z + dz) * S + (x + dx)];
          rise += Math.max(0, nh - h);
          drop += Math.max(0, h - nh);
        }
        const roll = hash3(ox + x, 4901, oz + z, this.seed);
        const score = Math.min(rise, 30) * 1.2 - Math.min(drop, 24) * 0.9 - depth * 0.8 + roll * 6;
        if (score > bestScore) { bestScore = score; bestX = x; bestZ = z; bestTop = top; }
      }
    }
    let entX = -1, entZ = -1;          // координаты входа — рядом с ними пол не рвём
    if (bestScore > -Infinity) {
      // Вход-колодец 2×2 с винтовой лестницей: на каждом уровне камень ровно
      // в одной из четырёх колонн по кругу — спуск ступенями по 1–2 блока,
      // ни одного свободного падения. Колонны входа целиком внутри чанка.
      entX = Math.max(1, Math.min(S - 3, bestX));
      entZ = Math.max(1, Math.min(S - 3, bestZ));
      const shaft = [[entX, entZ], [entX + 1, entZ], [entX + 1, entZ + 1], [entX, entZ + 1]];
      const hHigh = Math.max(...shaft.map(([x, z]) => terrainHeight[z * S + x]));
      // Вскрываем колодец: каждую колонну копаем от её собственной бровки вниз
      for (const [x, z] of shaft) {
        const h = terrainHeight[z * S + x];
        for (let y = h; y >= 6; y--) {
          const b = chunk.get(x, y, z);
          if (b === BLOCK.WATER || b === BLOCK.ICE) break;
          chunk.set(x, y, z, BLOCK.AIR);
        }
      }
      // Самый глубокий пол под колодцем — докуда вести лестницу
      let base = hHigh;
      for (const [x, z] of shaft) {
        let y = terrainHeight[z * S + x];
        while (y > 5 && chunk.get(x, y - 1, z) === BLOCK.AIR) y--;
        if (y < base) base = y;
      }
      // Ступени по кругу — ровно одна колонна на уровень, спуск по 1–2 блока.
      // Выше бровки колонны не ставим; на самой бровке дёрн меняем на камень.
      let k = 0;
      for (let y = hHigh - 1; y > base; y--, k++) {
        const [x, z] = shaft[k % 4];
        if (y > terrainHeight[z * S + x]) continue;
        const b = chunk.get(x, y, z);
        if (b === BLOCK.AIR || b === BLOCK.GRASS || b === BLOCK.DIRT
          || b === BLOCK.SAND || b === BLOCK.SNOW || b === BLOCK.SNOWY_SAND
          || b === BLOCK.STONE) {
          chunk.set(x, y, z, BLOCK.STONE);
        }
      }
    }

    // Отдельных вертикальных колодцев больше нет: каждый вход — лестница,
    // по которой можно спуститься и подняться без падений.
    // Случайные выходы пещер на поверхность «запечатываем»: если полость
    // вскрывается сама по себе, а не винтовой лестницей, закрыём её дёрном —
    // иначе по карте попадаются отвесные дыры, в которые нельзя спуститься.
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (entX >= 0 && Math.abs(x - entX) <= 1 && Math.abs(z - entZ) <= 1) continue;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 2) continue;
        let y = h;
        let filled = 0;
        while (y > 4 && chunk.get(x, y, z) === BLOCK.AIR && filled < 6) {
          chunk.set(x, y, z, filled < 2 ? BLOCK.DIRT : BLOCK.STONE);
          y--;
          filled++;
        }
      }
    }

    // Руды в каменных слоях. Жилы считаются от поверхности, а не от дна мира:
    // уголь и железо лежат у самой поверхности (под слоем земли, в скалах и
    // карьерах), поэтому первые факелы и инструменты не требуют долгих раскопок.
    const rngOre = makeRng(hash3(cx, 7, cz, seed) * 0x7fffffff);
    const placeVein = (vx, vy, vz, ore, size, spread = 3) => {
      for (let k = 0; k < size; k++) {
        const px2 = vx + ((rngOre() * spread) | 0) - ((spread / 2) | 0);
        const pz2 = vz + ((rngOre() * spread) | 0) - ((spread / 2) | 0);
        const py2 = vy + ((rngOre() * spread) | 0) - ((spread / 2) | 0);
        if (px2 < 0 || pz2 < 0 || px2 >= S || pz2 >= S || py2 < 1 || py2 >= H) continue;
        if (chunk.get(px2, py2, pz2) === BLOCK.STONE) chunk.set(px2, py2, pz2, ore);
      }
    };
    // [руда, сколько жил на чанк, блоков в жиле, мин. глубина, макс. глубина] —
    // глубина отсчитывается вниз от поверхности, ближе к верху жилы встречаются чаще
    const veins = [
      [BLOCK.COAL_ORE, 20, 12, 2, 18],
      [BLOCK.IRON_ORE, 12, 9, 4, 30],
      [BLOCK.GOLD_ORE, 4, 5, 16, 42],
      [BLOCK.DIAMOND_ORE, 3, 4, 24, 54],
    ];
    for (const [ore, tries, size, minDrop, maxDrop] of veins) {
      for (let i = 0; i < tries; i++) {
        const vx = (rngOre() * S) | 0;
        const vz = (rngOre() * S) | 0;
        const h = terrainHeight[vz * S + vx];
        const t = rngOre();
        const drop = minDrop + Math.round((maxDrop - minDrop) * t * t);
        const vy = Math.max(4, h - 1 - drop);
        placeVein(vx, vy, vz, ore, size);
      }
    }
    // Выходы руды на поверхность: в скалах, уступах и карьерах порода видна
    // снаружи, поэтому уголь и железо можно найти прямо в обрыве.
    for (let z = 1; z < S - 1; z++) {
      for (let x = 1; x < S - 1; x++) {
        const h = terrainHeight[z * S + x];
        if (h <= SEA) continue;                                  // под водой не надо
        if (chunk.get(x, h, z) !== BLOCK.STONE) continue;        // только голая порода
        if (chunk.get(x, h + 1, z) !== BLOCK.AIR) continue;
        if (rngOre() > 0.11) continue;
        const ore = rngOre() < 0.65 ? BLOCK.COAL_ORE : BLOCK.IRON_ORE;
        placeVein(x, h - ((rngOre() * 3) | 0), z, ore, 6, 3);
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

    // Рельеф пола пещер: полублоки-ступени и обрывы-уступы, чтобы ходы не были
    // «коридором с ровным полом». Детерминировано по координатам клетки.
    for (let z = 1; z < S - 1; z++) {
      for (let x = 1; x < S - 1; x++) {
        // винтовую лестницу входа не разрушаем
        if (entX >= 0 && Math.abs(x - entX) <= 1 && Math.abs(z - entZ) <= 1) continue;
        const yMax = Math.min(CAVE_TOP + 1, terrainHeight[z * S + x] - CAVE_CRUST + 1);
        for (let y = 7; y < yMax; y++) {
          if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
          if (chunk.get(x, y + 1, z) !== BLOCK.AIR) continue;   // нужен проход в рост
          const floor = chunk.get(x, y - 1, z);
          if (floor !== BLOCK.STONE && floor !== BLOCK.SLATE && floor !== BLOCK.MOSSY) continue;
          const wx = ox + x, wz = oz + z;
          const roll = hash3(wx, 6107, wz, this.seed);
          if (roll < 0.14) {
            chunk.set(x, y - 1, z, BLOCK.COBBLE_SLAB);          // полублок-ступенька
          } else if (roll < 0.24) {
            // Небольшой обрыв: выламываем пол на 1-2 блока — ямки и уступы
            const deep = 1 + ((hash3(wx, 6207, wz, this.seed) * 2) | 0);
            for (let dy = 0; dy < deep; dy++) {
              const below = chunk.get(x, y - 1 - dy, z);
              if (below === BLOCK.STONE || below === BLOCK.SLATE || below === BLOCK.MOSSY) {
                chunk.set(x, y - 1 - dy, z, BLOCK.AIR);
              }
            }
          }
        }
      }
    }

    // Рельеф пола мог выломать новые ямки — выравниваем ещё раз, не трогая
    // лестницу входа, чтобы в больших пещерах не оставалось отвесных провалов.
    if (entX >= 0) alignCaveFloors(chunk, terrainHeight, 1, { x: entX, z: entZ });

    // Сундуки с лутом в глубоких гротах: редко, на сухом полу, подальше от входа
    {
      const rngChest = makeRng(hash3(cx, 71, cz, seed) * 0x7fffffff);
      if (rngChest() < 0.42) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const x = 2 + ((rngChest() * (S - 4)) | 0);
          const z = 2 + ((rngChest() * (S - 4)) | 0);
          const yMax = Math.min(CAVE_TOP, terrainHeight[z * S + x] - CAVE_CRUST - 4);
          if (yMax < 10) continue;
          const y = 8 + ((rngChest() * (yMax - 8)) | 0);
          if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
          if (chunk.get(x, y + 1, z) !== BLOCK.AIR) continue;
          const floor = chunk.get(x, y - 1, z);
          if (floor !== BLOCK.STONE && floor !== BLOCK.SLATE && floor !== BLOCK.MOSSY) continue;
          const faceRoll = rngChest();
          const facing = faceRoll < 0.25 ? BLOCK.CHEST : faceRoll < 0.5 ? BLOCK.CHEST_NZ
            : faceRoll < 0.75 ? BLOCK.CHEST_PX : BLOCK.CHEST_NX;
          chunk.set(x, y, z, facing);
          this.lootChests.add(`${ox + x},${y},${oz + z}`);
          break;
        }
      }
    }

    // Пещерная флора: светящиеся грибы на полу группками и лианы с потолка.
    // Гриб — слабый источник света (свет запекается в меш чанка, см. genLights).
    chunk.genLights = [];
    {
      const rngFlora = makeRng(hash3(cx, 83, cz, seed) * 0x7fffffff);
      const groups = 2 + ((rngFlora() * 3) | 0);
      for (let g = 0; g < groups; g++) {
        const gx = 1 + ((rngFlora() * (S - 2)) | 0);
        const gz = 1 + ((rngFlora() * (S - 2)) | 0);
        const gMax = Math.min(CAVE_TOP, terrainHeight[gz * S + gx] - CAVE_CRUST);
        if (gMax < 12) continue;
        const gy = 7 + ((rngFlora() * (gMax - 7)) | 0);
        const patch = 1 + ((rngFlora() * 3) | 0);
        for (let i = 0; i < patch * 3; i++) {
          const x = gx + ((rngFlora() * 3) | 0) - 1;
          const z = gz + ((rngFlora() * 3) | 0) - 1;
          if (x < 1 || z < 1 || x >= S - 1 || z >= S - 1) continue;
          const dy = ((rngFlora() * 3) | 0) - 1;
          const y = gy + dy;
          if (y < 7 || y >= H - 1) continue;
          if (chunk.get(x, y, z) !== BLOCK.AIR || chunk.get(x, y + 1, z) !== BLOCK.AIR) continue;
          const floor = chunk.get(x, y - 1, z);
          if (floor !== BLOCK.STONE && floor !== BLOCK.SLATE && floor !== BLOCK.MOSSY) continue;
          if (rngFlora() < 0.5) {
            chunk.set(x, y, z, BLOCK.GLOW_SHROOM);
            chunk.genLights.push({ x: ox + x, y, z: oz + z });
          }
        }
      }
      // Лианы: свисают с каменных потолков гротов, плетьми по 1-4 блока
      for (let z = 1; z < S - 1; z++) {
        for (let x = 1; x < S - 1; x++) {
          const yMax = Math.min(CAVE_TOP + 1, terrainHeight[z * S + x] - CAVE_CRUST + 1);
          for (let y = 8; y < yMax; y++) {
            if (chunk.get(x, y, z) !== BLOCK.AIR) continue;
            const ceil = chunk.get(x, y + 1, z);
            if (ceil !== BLOCK.STONE && ceil !== BLOCK.SLATE && ceil !== BLOCK.MOSSY) continue;
            const below = chunk.get(x, y - 1, z);
            if (below !== BLOCK.AIR) continue;
            const roll = hash3(ox + x, 6307 + y, oz + z, this.seed);
            if (roll >= 0.05) continue;
            const len = 1 + (((roll * 400) | 0) % 4);
            for (let dy = 0; dy < len; dy++) {
              const vy = y - dy;
              if (vy < 6) break;
              if (chunk.get(x, vy, z) !== BLOCK.AIR) break;
              chunk.set(x, vy, z, BLOCK.VINE);
            }
          }
        }
      }
    }

    // Валуны и скальные выходы: крупные глыбы на поверхности. Возле гор их
    // больше и они выше — там встречаются настоящие скалы-пальцы, а на равнине
    // попадаются одиночные валуны.
    {
      const rngRock = makeRng(hash3(cx, 23, cz, seed) * 0x7fffffff);
      const roll = rngRock();
      const rocks = roll < 0.28 ? 0 : roll < 0.62 ? 1 : roll < 0.86 ? 2 : 3;
      for (let r = 0; r < rocks; r++) {
        const rx = 3 + ((rngRock() * (S - 6)) | 0);
        const rz = 3 + ((rngRock() * (S - 6)) | 0);
        const baseH = terrainHeight[rz * S + rx];
        if (baseH <= SEA + 1) continue;                       // в воде и на пляже глыб нет
        const rocky = baseH >= ROCK_H - 8;                    // у гор — крупнее и чаще
        const spire = rocky && rngRock() < 0.32;              // скала-палец
        const rad = spire ? 1.8 + rngRock() * 1.6
          : (rocky ? 1.7 : 1.2) + rngRock() * (rocky ? 1.7 : 1.0);
        const tall = spire ? 4 + rngRock() * 5 : 1.0 + rngRock() * (rocky ? 1.6 : 1.0);
        const cold = this.isCold(ox + rx, oz + rz) || baseH >= PEAK_H - 2;
        const steps = Math.ceil(rad);
        for (let dz = -steps; dz <= steps; dz++) {
          for (let dx = -steps; dx <= steps; dx++) {
            const wx = rx + dx, wz = rz + dz;
            if (wx < 1 || wz < 1 || wx >= S - 1 || wz >= S - 1) continue;
            const d2 = (dx * dx + dz * dz) / (rad * rad);
            if (d2 > 1) continue;
            const h = terrainHeight[wz * S + wx];
            const profile = Math.pow(Math.max(0, 1 - d2), spire ? 1.05 : 0.5);
            const top = h + Math.round(tall * profile);
            for (let y = h; y <= top; y++) {
              if (y < 1 || y >= H) continue;
              const cur = chunk.get(wx, y, wz);
              if (cur === BLOCK.WATER || cur === BLOCK.ICE) continue;
              if (y > h && cur !== BLOCK.AIR) continue;       // не ломаем деревья и постройки
              const kind = rngRock();
              const was = y === top && cold ? BLOCK.SNOW
                : kind < 0.62 ? BLOCK.STONE : kind < 0.82 ? BLOCK.COBBLE : BLOCK.MOSSY;
              chunk.set(wx, y, wz, was);
            }
          }
        }
      }
    }

    // Деревья разных пород (полностью внутри чанка, чтобы не пересекать границы).
    // Между деревьями держим дистанцию: кроны разных пород не должны
    // срастаться в один сплошной комок листвы.
    const rng = makeRng(hash3(cx, 0, cz, seed) * 0x7fffffff);
    const treeCount = 5 + ((rng() * 3) | 0);   // пробуем чаще — часть отпадёт по дистанции
    const treeSpots = [];                      // занятые кронами места: {x, z, r}
    const tooClose = (x, z, r) => treeSpots.some((s) => {
      const dx = s.x - x, dz = s.z - z;
      return dx * dx + dz * dz < (s.r + r + 1) * (s.r + r + 1);
    });
    let bigCounter = 0;
    for (let t = 0; t < treeCount; t++) {
      const tx = 3 + ((rng() * (S - 6)) | 0);
      const tz = 3 + ((rng() * (S - 6)) | 0);
      const th = terrainHeight[tz * S + tx];
      if (th <= SEA + 1 || th > ROCK_H) continue;
      const surface = chunk.get(tx, th, tz);
      if (surface !== BLOCK.GRASS && surface !== BLOCK.SNOW) continue;
      const cold = this.isCold(ox + tx, oz + tz);
      // Порода зависит от биома; в холоде — ели и сосны, в тепле больше выбора
      let tree;
      const pick = rng();
      if (surface === BLOCK.SNOW || cold) {
        tree = pick < 0.55 ? 'spruce' : 'pine';
      } else {
        tree = pick < 0.3 ? 'birch' : pick < 0.44 ? 'tall_birch' : pick < 0.58 ? 'pine' : 'oak';
      }
      const put = (lx, ly, lz, id, onlyAir = true) => {
        if (lx < 0 || lz < 0 || lx >= S || lz >= S || ly < 0 || ly >= H) return;
        if (onlyAir && chunk.get(lx, ly, lz) !== BLOCK.AIR) return;
        chunk.set(lx, ly, lz, id);
      };
      // Большая крона шире на 2 клетки, поэтому такому дереву нужно больше места
      const bigRoll = rng();
      const isBig = bigRoll < 0.38 && (tree === 'oak' || tree === 'spruce') && bigCounter < 3;
      const crownR = isBig ? 4 : 2;
      if (tooClose(tx, tz, crownR)) continue;              // не сливаемся с соседями
      if (isBig) {
        if (tx < 5 || tz < 5 || tx >= S - 5 || tz >= S - 5) continue;
        if (th + 14 >= H) continue;
        bigCounter++;
        treeSpots.push({ x: tx, z: tz, r: crownR });
        if (tree === 'spruce') growBigSpruce(tx, tz, th, put);
        else growBigOak(tx, tz, th, put);
        continue;
      }
      treeSpots.push({ x: tx, z: tz, r: crownR });
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
      } else if (tree === 'tall_birch') {
        // Стройная высокая берёза: тонкий ствол 7-10 и узкая крона-яйцо
        const trunkH = 7 + ((rng() * 4) | 0);
        for (let dy = trunkH - 3; dy <= trunkH + 1; dy++) {
          const r = dy >= trunkH - 1 ? 1 : 2;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if ((dx * dx + dz * dz) > r * r + 1) continue;
              if (Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.5) continue;
              put(tx + dx, th + dy, tz + dz, BLOCK.BIRCH_LEAVES);
            }
          }
        }
        for (let dy = 1; dy <= trunkH; dy++) chunk.set(tx, th + dy, tz, BLOCK.BIRCH_LOG);
      } else if (tree === 'pine') {
        // Сосна: высокий голый ствол и узкая крона-зонтик из еловой хвои наверху
        const trunkH = 7 + ((rng() * 4) | 0);
        for (let dy = trunkH - 2; dy <= trunkH; dy++) {
          const r = dy === trunkH - 2 ? 2 : 1;
          for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
              if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
              if (r > 0 && Math.abs(dx) === r && Math.abs(dz) === r && rng() < 0.6) continue;
              put(tx + dx, th + dy, tz + dz, BLOCK.SPRUCE_LEAVES);
            }
          }
        }
        put(tx, th + trunkH + 1, tz, BLOCK.SPRUCE_LEAVES);
        put(tx, th + trunkH + 2, tz, BLOCK.SPRUCE_LEAVES);
        for (let dy = 1; dy <= trunkH; dy++) chunk.set(tx, th + dy, tz, BLOCK.SPRUCE_LOG);
      } else {
        // Ель: узкая коническая крона. Верх ствола обязательно «одет» хвоей:
        // кольцо r=1 на уровне макушки и шапка над ним — голых блоков не остаётся.
        const trunkH = 6 + ((rng() * 3) | 0);
        for (let dy = 2; dy <= trunkH + 1; dy++) {
          const left = trunkH + 1 - dy;
          const r = left <= 0 ? 0 : left <= 2 ? 1 : 2;
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
      // Кольцо хвои на уровне макушки — верхний бревенчатый блок не голый
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        if (Math.abs(dx) + Math.abs(dz) > 1 && rng() < 0.5) continue;
        put(tx + dx, top, tz + dz, BLOCK.SPRUCE_LEAVES);
      }
      // Хвоя над второй колонной ствола — иначе её верх остаётся голым блоком
      put(tx + 1, th + trunkH - 1, tz, BLOCK.SPRUCE_LEAVES);
      put(tx + 1, th + trunkH, tz, BLOCK.SPRUCE_LEAVES);
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

    // Декоративная трава и цветы — на травяных вершинах. В полях-лугах
    // травы и особенно цветов заметно больше: получаются цветущие луга.
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const h = terrainHeight[z * S + x];
        if (h <= SEA + 1 || h >= H - 1) continue;
        if (chunk.get(x, h, z) !== BLOCK.GRASS) continue;
        if (chunk.get(x, h + 1, z) !== BLOCK.AIR) continue;
        const meadow = this.plainsAt(wx, wz) > 0.55 && this.hillCountryAt(wx, wz) < 0.4;
        const r = rng();
        const flowerP = meadow ? 0.085 : 0.045;
        const grassP = meadow ? 0.2 : 0.165;
        if (r < 0.12) chunk.set(x, h + 1, z, BLOCK.TALL_GRASS);
        else if (r < grassP) chunk.set(x, h + 1, z, BLOCK.FERN);
        else if (r < grassP + 0.025) chunk.set(x, h + 1, z, BLOCK.CLOVER);
        else if (r < grassP + 0.025 + flowerP * 0.55) chunk.set(x, h + 1, z, BLOCK.FLOWER_RED);
        else if (r < grassP + 0.025 + flowerP) chunk.set(x, h + 1, z, BLOCK.FLOWER_YELLOW);
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
    // Свет факела и светящихся растений выходит за пределы чанка — обновляем
    // соседние меши, чтобы запечённый свет не остался устаревшим.
    if (isTorch(previous) || isTorch(id) || BLOCKS[previous]?.emissive || BLOCKS[id]?.emissive) {
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
    // Вода: в освободившуюся клетку (и к её соседям) может затечь вода из океана,
    // озера или упавшего сверху потока — ставим их в очередь на проверку.
    if (previous !== BLOCK.AIR && id !== BLOCK.WATER) {
      this.scheduleWater(wx, wy, wz, 0);
      this.scheduleWater(wx + 1, wy, wz, 0);
      this.scheduleWater(wx - 1, wy, wz, 0);
      this.scheduleWater(wx, wy, wz + 1, 0);
      this.scheduleWater(wx, wy, wz - 1, 0);
      this.scheduleWater(wx, wy - 1, wz, 0);
    }
    return true;
  }

  /** Клетка ждёт проверки на затекание воды (с лимитом «дальности» по горизонтали) */
  scheduleWater(x, y, z, hops = 0) {
    if (this.waterQueue.length > 6000) return;
    const key = `${x},${y},${z}`;
    const prev = this.waterQueued.get(key);
    if (prev !== undefined && prev <= hops) return;
    this.waterQueued.set(key, hops);
    this.waterQueue.push({ x, y, z, hops });
  }

  /**
   * Растекание воды. Клетка заполняется, если сверху или сбоку есть вода:
   * выкопанная в океане яма заполняется, поток льётся вниз и растекается
   * в стороны на конечное число клеток (иначе он бежал бы бесконечно).
   * Вызывается из игрового цикла, обрабатывает до maxCells клеток за кадр.
   */
  updateWater(maxCells = 48) {
    if (!this.waterQueue.length) return;
    const MAX_HOPS = 14;
    let processed = 0;
    while (processed < maxCells && this.waterQueue.length) {
      const { x, y, z, hops } = this.waterQueue.shift();
      this.waterQueued.delete(`${x},${y},${z}`);
      if (y < 0 || y >= H) continue;
      if (this.getBlock(x, y, z) !== BLOCK.AIR) continue;
      const above = y + 1 < H ? this.getBlock(x, y + 1, z) : BLOCK.AIR;
      const fromSide = this.getBlock(x + 1, y, z) === BLOCK.WATER || this.getBlock(x - 1, y, z) === BLOCK.WATER
        || this.getBlock(x, y, z + 1) === BLOCK.WATER || this.getBlock(x, y, z - 1) === BLOCK.WATER;
      if (above !== BLOCK.WATER && !fromSide) continue;
      if (this.setBlock(x, y, z, BLOCK.WATER)) {
        processed++;
        // Дальше вода течёт вниз без ограничений, в стороны — пока не иссякнет запас
        this.scheduleWater(x, y - 1, z, 0);
        if (hops < MAX_HOPS) {
          this.scheduleWater(x + 1, y, z, hops + 1);
          this.scheduleWater(x - 1, y, z, hops + 1);
          this.scheduleWater(x, y, z + 1, hops + 1);
          this.scheduleWater(x, y, z - 1, hops + 1);
        }
      }
    }
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
