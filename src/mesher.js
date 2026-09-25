// Меширование вокселей: только видимые грани + ambient occlusion на вершинах
import { BLOCK, BLOCKS, DENSE_FOLIAGE_TILE, isOpaque, isLiquid, isDecor, isSlab, isFence, isFoliage } from './blocks.js';
import { tileUV } from './textures.js';

// Яркость граней (классический «мультипликационный» свет)
const FACE_SHADE = { px: 0.72, nx: 0.72, py: 1.0, ny: 0.5, pz: 0.88, nz: 0.88 };

// Описание граней куба: нормаль, оси U/V для UV и AO, 4 вершины (du,dv)
// Кольцо вершин: (+,+), (−,+), (−,−), (+,−)
const FACES = [
  { key: 'px', n: [1, 0, 0], U: 2, V: 1, face: 2 },
  { key: 'nx', n: [-1, 0, 0], U: 2, V: 1, face: 2 },
  { key: 'py', n: [0, 1, 0], U: 0, V: 2, face: 0 },
  { key: 'ny', n: [0, -1, 0], U: 0, V: 2, face: 1 },
  { key: 'pz', n: [0, 0, 1], U: 0, V: 1, face: 2 },
  { key: 'nz', n: [0, 0, -1], U: 0, V: 1, face: 2 },
];

const RING = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
const AO_LEVEL = [0.42, 0.64, 0.82, 1.0];

// Предвычисляем для каждой грани: позиции вершин (в координатах куба 0..1),
// индексы треугольников с правильным обходом, смещения AO-сэмплов
const FACE_PRECOMP = FACES.map((f) => {
  const verts = RING.map(([du, dv]) => {
    // Координаты: по оси нормали — плоскость грани, по U/V — 0/1 от du,dv
    const pos = [0, 0, 0];
    const aAxis = f.n.findIndex((c) => c !== 0);
    pos[aAxis] = f.n[aAxis] > 0 ? 1 : 0;
    pos[f.U] = du > 0 ? 1 : 0;
    pos[f.V] = dv > 0 ? 1 : 0;
    return { pos, du, dv, u: 0, v: 0 };
  });
  // UV: u от U-оси, v от V-оси (для боковых граней V = Y, текстура не переворачивается)
  for (const vert of verts) {
    vert.u = vert.pos[f.U];
    vert.v = vert.pos[f.V];
  }
  // Проверка обхода: (v1-v0)x(v2-v0) должен смотреть по нормали
  const [v0, v1, v2] = verts;
  const ax = v1.pos[0] - v0.pos[0], ay = v1.pos[1] - v0.pos[1], az = v1.pos[2] - v0.pos[2];
  const bx = v2.pos[0] - v0.pos[0], by = v2.pos[1] - v0.pos[1], bz = v2.pos[2] - v0.pos[2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const dot = cx * f.n[0] + cy * f.n[1] + cz * f.n[2];
  // Кольцо с правильной ориентацией (против часовой, если смотреть по нормали)
  const ring = dot > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
  // Два варианта триангуляции (разная диагональ) — оба с правильным обходом
  const idxA = [ring[0], ring[1], ring[2], ring[0], ring[2], ring[3]]; // диагональ 0-2
  const idxB = [ring[1], ring[2], ring[3], ring[1], ring[3], ring[0]]; // диагональ 1-3
  return { ...f, verts, idxA, idxB, indices: idxA, aAxis: f.n.findIndex((c) => c !== 0) };
});

function aoOf(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - ((side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0));
}

class MeshBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.torch = [];    // свет факелов — отдельный канал (см. шейдер terrainMat в main.js)
    this.idx = [];
  }
  vertex(p, u, v, shade, torch = 0) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(u, v);
    this.col.push(shade, shade, shade);
    this.torch.push(torch);
    return this.pos.length / 3 - 1;
  }
  isEmpty() { return this.idx.length === 0; }
  toGeometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('torchLight', new THREE.Float32BufferAttribute(this.torch, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Полный уровень небесного света. Свет гаснет на 1 уровень за блок, поэтому
// от входа в пещеру темнота наступает плавно, а примерно через 20 блоков без
// источников остаётся полная темнота.
export const SKY_LIGHT_LEVELS = 20;
// Запас вокруг чанка при расчёте света: целый соседний чанк. Свет из входа
// в соседнем чанке доходит и сюда, поэтому на стыках чанков нет резких «ступенек».
const LIGHT_MARGIN = 16;

// Таблица непрозрачности по id — быстрее, чем isOpaque() на каждую клетку
const OPAQUE_TABLE = new Uint8Array(256);
for (let id = 0; id < 256; id++) OPAQUE_TABLE[id] = isOpaque(id) ? 1 : 0;

/**
 * Поле небесного света для чанка с запасом LIGHT_MARGIN блоков по сторонам.
 * 1. Колонки, открытые небу, получают полный уровень; под первым непрозрачным
 *    блоком свет обрывается.
 * 2. Свет растекается по прозрачным блокам (воздух, вода, листва, стекло)
 *    честной заливкой (BFS) с затуханием 1 уровень за блок — он огибает углы,
 *    заходит в боковые ходы и не обрывается на границе чанка.
 * @returns {{ sample: (px: number, py: number, pz: number) => number, level: Function, opaqueAt: Function }}
 */
export function buildSkylight(world, ox, oz, S, H, margin = LIGHT_MARGIN) {
  const M = margin;
  const W = S + M * 2;
  const total = W * W * H;
  const grid = new Uint8Array(total);    // уровень света 0..SKY_LIGHT_LEVELS
  const opaque = new Uint8Array(total);  // 1 — блок не пропускает свет
  const index = (ix, iy, iz) => (ix * W + iz) * H + iy;
  const x0w = ox - M, z0w = oz - M;
  const MAX = SKY_LIGHT_LEVELS;

  // Быстрый путь: читаем массивы блоков чанков напрямую
  const CS = world.chunkSize;
  const fast = typeof world.getChunk === 'function' && world.chunks instanceof Map;
  for (let ix = 0; ix < W; ix++) {
    for (let iz = 0; iz < W; iz++) {
      const wx = x0w + ix, wz = z0w + iz;
      let blocks = null, lx = 0, lz = 0;
      if (fast) {
        const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
        const chunk = world.getChunk(cx, cz);
        blocks = chunk.blocks;
        lx = wx - cx * CS; lz = wz - cz * CS;
      }
      let open = true;
      const base = (ix * W + iz) * H;
      for (let y = H - 1; y >= 0; y--) {
        const id = blocks ? blocks[(y * CS + lz) * CS + lx] : world.getBlock(wx, y, wz);
        const solid = OPAQUE_TABLE[id];
        if (solid) { opaque[base + y] = 1; open = false; }
        else if (open) grid[base + y] = MAX;
      }
    }
  }

  // Источники заливки — освещённые небом клетки на границе с тенью
  const queue = new Int32Array(total);
  let head = 0, tail = 0;
  const WH = W * H;
  for (let ix = 0; ix < W; ix++) {
    for (let iz = 0; iz < W; iz++) {
      const base = (ix * W + iz) * H;
      for (let y = 0; y < H; y++) {
        const i = base + y;
        if (grid[i] !== MAX) continue;
        const dark = (j) => !opaque[j] && grid[j] < MAX - 1;
        if ((y > 0 && dark(i - 1))
          || (ix > 0 && dark(i - WH)) || (ix + 1 < W && dark(i + WH))
          || (iz > 0 && dark(i - H)) || (iz + 1 < W && dark(i + H))) {
          queue[tail++] = i;
        }
      }
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const v = grid[i] - 1;
    if (v <= 0) continue;
    const y = i % H;
    const col = (i - y) / H;
    const iz = col % W;
    const ix = (col - iz) / W;
    const spread = (j) => {
      if (opaque[j] || grid[j] >= v) return;
      grid[j] = v;
      queue[tail++] = j;
    };
    if (y > 0) spread(i - 1);
    if (y + 1 < H) spread(i + 1);
    if (ix > 0) spread(i - WH);
    if (ix + 1 < W) spread(i + WH);
    if (iz > 0) spread(i - H);
    if (iz + 1 < W) spread(i + H);
  }

  /** Уровень света в клетке мира (за пределами поля: сверху небо, снизу темно) */
  const level = (wx, wy, wz) => {
    if (wy >= H) return MAX;
    if (wy < 0) return 0;
    const ix = wx - x0w, iz = wz - z0w;
    if (ix < 0 || iz < 0 || ix >= W || iz >= W) return 0;
    return grid[index(ix, wy, iz)];
  };
  const opaqueAt = (wx, wy, wz) => {
    if (wy >= H) return 0;
    if (wy < 0) return 1;
    const ix = wx - x0w, iz = wz - z0w;
    if (ix < 0 || iz < 0 || ix >= W || iz >= W) return 1;
    return opaque[index(ix, wy, iz)];
  };
  /** Уровень в клетке, содержащей точку */
  const sample = (px, py, pz) => level(Math.floor(px), Math.floor(py), Math.floor(pz));
  return { sample, level, opaqueAt, grid, W, H };
}

/**
 * Яркость по уровню света: MAX → 1, 0 → 0 (в глубине — абсолютная темнота).
 * Степенная кривая мягче прежней smoothstep: полумрак тянется глубже в пещеру,
 * а тень у входа не проваливается резко в черноту.
 */
const BRIGHTNESS = new Float32Array(SKY_LIGHT_LEVELS * 4 + 1);
for (let i = 0; i < BRIGHTNESS.length; i++) {
  const t = i / (BRIGHTNESS.length - 1);
  BRIGHTNESS[i] = t <= 0 ? 0 : Math.pow(t, 1.35);
}
function lightBrightness(level) {
  if (level <= 0) return 0;
  const t = Math.min(1, level / SKY_LIGHT_LEVELS);
  return BRIGHTNESS[Math.round(t * (BRIGHTNESS.length - 1))];
}

export const TORCH_LIGHT_RADIUS = 8.5;
/**
 * Яркость от источника на расстоянии d: 1 у пламени, 0 на краю радиуса.
 * Та же формула считается в шейдере для факела в руке. Свет хранится
 * в отдельном канале вершин и не умножается на дневной/ночной оттенок неба,
 * поэтому днём он не пересвечивает, а ночью светит так же ярко.
 */
export function torchBrightness(d, radius = TORCH_LIGHT_RADIUS) {
  if (d >= radius) return 0;
  const falloff = 1 - d / radius;
  return falloff * falloff;
}

function createLighting(world, ox, oz, S, H) {
  const skylight = buildSkylight(world, ox, oz, S, H);
  const torches = [];
  // Правки мира — быстрый источник факелов; при пересборке чанк уже знает их позиции.
  if (world.edits?.[Symbol.iterator]) {
    for (const [key, id] of world.edits) {
      const def = BLOCKS[id];
      if (!def?.torch && !def?.emissive) continue;
      const [x, y, z] = key.split(',').map(Number);
      if (x < ox - 9 || x > ox + S + 9 || z < oz - 9 || z > oz + S + 9) continue;
      torches.push({ x: x + 0.5, y: y + 0.6, z: z + 0.5, r: def.lightRadius || TORCH_LIGHT_RADIUS });
    }
  }
  // Светящиеся растения, выращенные генератором мира (грибы в пещерах):
  // чанк помнит их позиции, соседние чанки тоже видят их свет.
  if (world.chunks instanceof Map) {
    const cx0 = Math.floor(ox / S), cz0 = Math.floor(oz / S);
    for (let gz = cz0 - 1; gz <= cz0 + 1; gz++) {
      for (let gx = cx0 - 1; gx <= cx0 + 1; gx++) {
        const chunk = world.chunks.get(gx + ',' + gz);
        if (!chunk?.genLights) continue;
        for (const l of chunk.genLights) {
          if (l.x < ox - 9 || l.x > ox + S + 9 || l.z < oz - 9 || l.z > oz + S + 9) continue;
          torches.push({ x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5, r: BLOCKS[BLOCK.GLOW_SHROOM].lightRadius });
        }
      }
    }
  }

  /**
   * Сглаженный небесный свет в вершине: среднее по клеткам перед гранью,
   * которые касаются вершины (как «плавное освещение» в классических песочницах).
   * Непрозрачные клетки не участвуют — свет не протекает сквозь стены.
   */
  const smoothSky = (p, normal) => {
    const axis = normal[0] ? 0 : normal[1] ? 1 : normal[2] ? 2 : -1;
    const ranges = [];
    for (let a = 0; a < 3; a++) {
      const c = p[a];
      const whole = Math.abs(c - Math.round(c)) < 1e-4;
      if (a === axis) {
        if (whole) ranges.push([normal[a] > 0 ? Math.round(c) : Math.round(c) - 1]);
        else ranges.push([Math.floor(c)]);
      } else if (whole) {
        ranges.push([Math.round(c) - 1, Math.round(c)]);
      } else {
        ranges.push([Math.floor(c)]);
      }
    }
    let sum = 0, n = 0, maxLevel = 0;
    for (const x of ranges[0]) {
      for (const y of ranges[1]) {
        for (const z of ranges[2]) {
          if (skylight.opaqueAt(x, y, z)) continue;
          const l = skylight.level(x, y, z);
          sum += l; n++;
          if (l > maxLevel) maxLevel = l;
        }
      }
    }
    if (!n) return 0;
    // Немного тянем среднее к самому яркому соседу: свет «отражается» и
    // тень на стенах получается плавной, без тёмных полос в углах
    return (sum / n) * 0.7 + maxLevel * 0.3;
  };

  // cell — клетка, из которой брать свет целиком (декор); иначе — сглаживание по вершине.
  // Возвращает яркость неба; яркость факелов кладётся в light.torch.
  const light = (p, normal, cell = null) => {
    const level = cell
      ? skylight.sample(cell[0], cell[1], cell[2])
      : smoothSky(p, normal || [0, 1, 0]);
    let torchLight = 0;
    for (const torch of torches) {
      const d = Math.hypot(p[0] - torch.x, p[1] - torch.y, p[2] - torch.z);
      const b = torchBrightness(d, torch.r);
      if (b > torchLight) torchLight = b;
    }
    light.torch = torchLight;       // второй канал: свет факелов в этой вершине
    return lightBrightness(level);
  };
  light.torch = 0;
  return light;
}

/**
 * Строит меши чанка.
 * @param {*} THREE модуль three
 * @param {object} world объект мира (getBlock)
 * @param {number} cx, cz координаты чанка
 * @returns {{opaque: MeshBuilder, water: MeshBuilder}}
 */
export function meshChunk(THREE, world, cx, cz) {
  const opaque = new MeshBuilder();
  const water = new MeshBuilder();
  const S = world.chunkSize, H = world.worldHeight;
  const ox = cx * S, oz = cz * S;
  const lightAt = createLighting(world, ox, oz, S, H);

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const id = world.getBlock(wx, y, wz);
        if (!id) continue;
        const def = BLOCKS[id];
        const liquid = isLiquid(id);

        // Полублок — низкая плита
        if (isSlab(id)) {
          addSlabFaces(opaque, world, wx, y, wz, def, lightAt);
          continue;
        }
        // Забор — столбик с перекладинами
        if (isFence(id)) {
          addFenceFaces(opaque, world, wx, y, wz, def, lightAt);
          continue;
        }
        // Факел рендерится объёмной моделью в main.js, не плоскими квадами.
        if (id === BLOCK.TORCH || def.shape === 'torch' || def.torch) continue;

        // Декоративная растительность — два перекрёстных спрайта
        if (isDecor(id)) {
          addDecorQuads(opaque, world, wx, y, wz, def, lightAt);
          continue;
        }

        const builder = liquid ? water : opaque;

        for (const face of FACE_PRECOMP) {
          const n = face.n;
          const nb = world.getBlock(wx + n[0], y + n[1], wz + n[2]);
          // Видимость грани
          if (liquid) {
            if (nb === id || isOpaque(nb)) continue;
            // боковые грани воды — только против воздуха/непрозрачного выше? достаточно: не вода и не непрозрачный
          } else {
            if (isOpaque(nb)) continue;
            // грань между двумя одинаковыми стеклянными/плитами — не рисуем
            if (nb === id && (def.transparent || def.slab)) continue;
          }
          // Листва: грани между соседними блоками кроны рисуем плотной текстурой
          // без просветов — сквозь середину дерева больше не видно неба
          const innerFoliage = def.foliage && isFoliage(nb);

          let tileIdx = def.tiles[face.face];
          if (innerFoliage) tileIdx = DENSE_FOLIAGE_TILE[tileIdx] ?? tileIdx;
          else if (def.front && face.key === def.front && def.tiles[3] != null) tileIdx = def.tiles[3];
          const innerShade = innerFoliage ? 0.78 : 1;
          const [u0, v0, u1, v1] = tileUV(tileIdx);
          const baseShade = FACE_SHADE[face.key];
          const emissive = !!def.emissive;

          // Поверхность воды чуть ниже (у верхних вершин всех граней под открытым небом)
          let yTopOffset = 0;
          if (liquid && !isLiquid(world.getBlock(wx, y + 1, wz))) {
            yTopOffset = -0.12;
          }

          const base = [wx + n[0], y + n[1], wz + n[2]];
          const cornerAOs = [];
          const vi = [];

          for (const vert of face.verts) {
            // AO-сэмплы в плоскости соседней ячейки
            const s1 = [0, 0, 0], s2 = [0, 0, 0], co = [0, 0, 0];
            for (let a = 0; a < 3; a++) {
              s1[a] = base[a];
              s2[a] = base[a];
              co[a] = base[a];
            }
            s1[face.U] += vert.du;
            s2[face.V] += vert.dv;
            co[face.U] += vert.du;
            co[face.V] += vert.dv;
            const ao = emissive ? 3 : aoOf(
              isOpaque(world.getBlock(s1[0], s1[1], s1[2])),
              isOpaque(world.getBlock(s2[0], s2[1], s2[2])),
              isOpaque(world.getBlock(co[0], co[1], co[2])),
            );
            cornerAOs.push(ao);

            const p = [wx + vert.pos[0], y + vert.pos[1], wz + vert.pos[2]];
            if (vert.pos[1] === 1 && yTopOffset && face.key !== 'ny') p[1] += yTopOffset;

            const u = vert.u === 0 ? u0 : u1;
            const v = vert.v === 0 ? v0 : v1;
            const lp = yTopOffset && vert.pos[1] === 1 ? [p[0], y + 1, p[2]] : p;
            const k = baseShade * innerShade * AO_LEVEL[ao];
            const shade = emissive ? 1.0 : k * lightAt(lp, n);
            vi.push(builder.vertex(p, u, v, shade, emissive ? 0 : k * lightAt.torch));
          }

          // Классический флип триангуляции по AO (борьба с артефактами диагонали);
          // обход треугольников уже корректен в обоих вариантах
          const flip = cornerAOs[0] + cornerAOs[2] > cornerAOs[1] + cornerAOs[3];
          builder.idx.push(...(flip ? face.idxB : face.idxA).map((i) => vi[i]));
        }
      }
    }
  }

  return { opaque, water };
}

// ---------------------------------------------------------------- Объёмные формы
/**
 * Запись квада произвольной формы (плита, столб забора) с ambient occlusion
 * и светом — тот же путь, что и у полных блоков, поэтому плиты и заборы
 * освещены и затенены одинаково с миром вокруг.
 *
 * quad: { n, c — центр грани в координатах клетки (0..1),
 *         a, b — полуоси грани (векторы), tile, shade, uvAxis }
 * uvAxis: какая ось клетки задаёт u и v текстуры (как у полных блоков:
 *         u = 0 в нуле оси, u = 1 в единице; v — то же самое).
 */
function pushShapeFace(builder, world, quad, lightAt, wx, y, wz, def, cell) {
  const n = quad.n;
  const base = [wx + n[0], y + n[1], wz + n[2]];
  const [u0, v0, u1, v1] = tileUV(quad.tile ?? def.tiles[2]);
  const emissive = !!def.emissive;
  const uAxis = quad.a.findIndex((c) => c !== 0);
  const vAxis = quad.b.findIndex((c) => c !== 0);
  const ua = quad.a[uAxis], va = quad.b[vAxis];
  const cornerAOs = [];
  const vi = [];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sa, sb] of ring) {
    const p = [0, 1, 2].map((axis) => {
      const q = quad.c[axis] + sa * quad.a[axis] + sb * quad.b[axis];
      return Math.abs(q - Math.round(q)) < 1e-4 ? Math.round(q) : q;
    });
    const s1 = p.slice(), s2 = p.slice(), co = p.slice();
    s1[uAxis] += Math.sign(ua) * sa;
    s2[vAxis] += Math.sign(va) * sb;
    co[uAxis] += Math.sign(ua) * sa;
    co[vAxis] += Math.sign(va) * sb;
    const ao = emissive ? 3 : aoOf(
      isOpaque(world.getBlock(base[0] + s1[0], base[1] + s1[1], base[2] + s1[2])),
      isOpaque(world.getBlock(base[0] + s2[0], base[1] + s2[1], base[2] + s2[2])),
      isOpaque(world.getBlock(base[0] + co[0], base[1] + co[1], base[2] + co[2])),
    );
    cornerAOs.push(ao);
    // UV: как у полных блоков — u по своей оси 0→1, v по своей оси 0→1
    const uu = quad.uAxis != null ? p[quad.uAxis] : p[uAxis];
    const vv = quad.vAxis != null ? p[quad.vAxis] : p[vAxis];
    const u = uu <= 0.0001 ? u0 : uu >= 0.9999 ? u1 : u0 + (u1 - u0) * uu;
    const v = vv <= 0.0001 ? v0 : vv >= 0.9999 ? v1 : v0 + (v1 - v0) * vv;
    const k = quad.shade * AO_LEVEL[ao];
    const shade = emissive ? 1.0 : k * lightAt(cell || [wx + p[0], y + p[1], wz + p[2]], n);
    vi.push(builder.vertex([wx + p[0], y + p[1], wz + p[2]], u, v, shade, emissive ? 0 : k * lightAt.torch));
  }
  const flip = cornerAOs[0] + cornerAOs[2] > cornerAOs[1] + cornerAOs[3];
  builder.idx.push(...(flip
    ? [vi[1], vi[2], vi[3], vi[1], vi[3], vi[0]]
    : [vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]]));
}

/**
 * Шесть граней бокса внутри клетки.
 * @param {object} box { x0,y0,z0,x1,y1,z1 }
 * @param {object} skip какие грани не рисовать: { px,nx,py,ny,pz,nz }
 */
function pushBox(builder, world, box, skip, lightAt, wx, y, wz, def, tile, cell) {
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, cz = (box.z0 + box.z1) / 2;
  const hx = (box.x1 - box.x0) / 2, hy = (box.y1 - box.y0) / 2, hz = (box.z1 - box.z0) / 2;
  const faces = [
    { key: 'px', n: [1, 0, 0], c: [box.x1, cy, cz], a: [0, 0, hz], b: [0, hy, 0], shade: FACE_SHADE.px, uAxis: 2, vAxis: 1 },
    { key: 'nx', n: [-1, 0, 0], c: [box.x0, cy, cz], a: [0, 0, hz], b: [0, hy, 0], shade: FACE_SHADE.nx, uAxis: 2, vAxis: 1 },
    { key: 'py', n: [0, 1, 0], c: [cx, box.y1, cz], a: [hx, 0, 0], b: [0, 0, hz], shade: FACE_SHADE.py, uAxis: 0, vAxis: 2 },
    { key: 'ny', n: [0, -1, 0], c: [cx, box.y0, cz], a: [hx, 0, 0], b: [0, 0, hz], shade: FACE_SHADE.ny, uAxis: 0, vAxis: 2 },
    { key: 'pz', n: [0, 0, 1], c: [cx, cy, box.z1], a: [hx, 0, 0], b: [0, hy, 0], shade: FACE_SHADE.pz, uAxis: 0, vAxis: 1 },
    { key: 'nz', n: [0, 0, -1], c: [cx, cy, box.z0], a: [hx, 0, 0], b: [0, hy, 0], shade: FACE_SHADE.nz, uAxis: 0, vAxis: 1 },
  ];
  for (const f of faces) {
    if (skip && skip[f.key]) continue;
    pushShapeFace(builder, world, { ...f, tile }, lightAt, wx, y, wz, def, cell);
  }
}

/**
 * Полублок: шесть граней плиты высотой в полблока. Боковые грани показывают
 * свою половину текстуры (текстура не растягивается и не перевёрнута),
 * внутренние грани между низом и верхом одной клетки не рисуются.
 */
function addSlabFaces(builder, world, wx, y, wz, def, lightAt) {
  const top = def.half === 'top';
  const y0 = top ? 0.5 : 0;
  const y1 = y0 + 0.5;
  const tile = def.tiles[2];
  const cell = [wx + 0.5, y + 0.5, wz + 0.5];

  const above = world.getBlock(wx, y + 1, wz);
  const below = world.getBlock(wx, y - 1, wz);
  // Низ + верх в одной клетке смыкаются в полный блок: внутренняя грань не нужна
  const closedTop = isSlab(above) && (BLOCKS[above].half || 'bottom') === 'bottom';
  const closedBottom = isSlab(below) && (BLOCKS[below].half || 'bottom') === 'top';

  const skip = {};
  const nbTop = world.getBlock(wx, y + 1, wz);
  const nbBottom = world.getBlock(wx, y - 1, wz);
  if (isOpaque(nbTop) || closedTop) skip.py = true;
  if (isOpaque(nbBottom) || closedBottom) skip.ny = true;
  for (const [key, dx, dz] of [['px', 1, 0], ['nx', -1, 0], ['pz', 0, 1], ['nz', 0, -1]]) {
    const nb = world.getBlock(wx + dx, y, wz + dz);
    if (isOpaque(nb)) skip[key] = true;
    else if (isSlab(nb) && (BLOCKS[nb].half || 'bottom') === (top ? 'top' : 'bottom')) skip[key] = true;
  }
  pushBox(builder, world, { x0: 0, y0, z0: 0, x1: 1, y1, z1: 1 }, skip, lightAt, wx, y, wz, def, tile, cell);
}

/** Сосед, к которому забор тянет перекладину: другой забор или полный блок */
function fenceArmTo(world, x, y, z) {
  const id = world.getBlock(x, y, z);
  if (id === BLOCK.FENCE) return true;
  if (!isOpaque(id)) return false;
  const b = BLOCKS[id];
  return !b.shape && !b.decor;
}

/**
 * Забор: столбик в центре клетки (выше обычного блока — не перепрыгнуть)
 * плюс перекладины к соседним заборам и полным блокам.
 */
function addFenceFaces(builder, world, wx, y, wz, def, lightAt) {
  const tile = def.tiles[2];
  const cell = [wx + 0.5, y + 0.5, wz + 0.5];
  const P = 0.125;                 // половина ширины столбика
  const TOP = 1.5;                 // высота столбика
  const arms = {
    px: fenceArmTo(world, wx + 1, y, wz),
    nx: fenceArmTo(world, wx - 1, y, wz),
    pz: fenceArmTo(world, wx, y, wz + 1),
    nz: fenceArmTo(world, wx, y, wz - 1),
  };

  // Столбик: боковые грани закрыты перекладинами с соответствующей стороны
  pushBox(builder, world, {
    x0: 0.5 - P, y0: 0, z0: 0.5 - P, x1: 0.5 + P, y1: TOP, z1: 0.5 + P,
  }, { px: arms.px, nx: arms.nx, pz: arms.pz, nz: arms.nz }, lightAt, wx, y, wz, def, tile, cell);

  // Перекладина: от столбика до края клетки. Если сосед — тоже забор,
  // торец не рисуем (его закроет перекладина соседа), к полному блоку — рисуем.
  const CY = 0.78, T = 0.12;
  const dirs = [
    { key: 'px', nb: [1, 0, 0], inner: 'nx', outer: 'px',
      box: { x0: 0.5 + P, y0: CY - T, z0: 0.5 - T, x1: 1, y1: CY + T, z1: 0.5 + T } },
    { key: 'nx', nb: [-1, 0, 0], inner: 'px', outer: 'nx',
      box: { x0: 0, y0: CY - T, z0: 0.5 - T, x1: 0.5 - P, y1: CY + T, z1: 0.5 + T } },
    { key: 'pz', nb: [0, 0, 1], inner: 'nz', outer: 'pz',
      box: { x0: 0.5 - T, y0: CY - T, z0: 0.5 + P, x1: 0.5 + T, y1: CY + T, z1: 1 } },
    { key: 'nz', nb: [0, 0, -1], inner: 'pz', outer: 'nz',
      box: { x0: 0.5 - T, y0: CY - T, z0: 0, x1: 0.5 + T, y1: CY + T, z1: 0.5 - P } },
  ];
  for (const d of dirs) {
    if (!arms[d.key]) continue;
    const skip = { [d.inner]: true };
    if (world.getBlock(wx + d.nb[0], y + d.nb[1], wz + d.nb[2]) === BLOCK.FENCE) skip[d.outer] = true;
    pushBox(builder, world, d.box, skip, lightAt, wx, y, wz, def, tile, cell);
  }
}

function addTorchQuads(builder, world, wx, y, wz, def) {
  const [u0, v0, u1, v1] = tileUV(def.tiles[2]);
  const shade = 1.0; // emissive full bright
  // тонкий стержень высотой 0.7, крест из двух плоскостей
  const w = 0.12;
  const cx = 0.5 - w / 2, cz = 0.5 - w / 2;
  const cx2 = 0.5 + w / 2, cz2 = 0.5 + w / 2;
  const y0 = 0.0, y1 = 0.62;
  const planes = [
    [[cx, cx], [cx2, cz2]],
    [[cx2, cx], [cx, cz2]],
  ];
  // stem using torch side texture (brown) - but we use same tile: stretch
  for (const [[ax, az], [bx, bz]] of planes) {
    const vi = [];
    vi.push(builder.vertex([wx + ax, y + y0, wz + az], u0, v1, shade));
    vi.push(builder.vertex([wx + bx, y + y0, wz + bz], u1, v1, shade));
    vi.push(builder.vertex([wx + bx, y + y1, wz + bz], u1, v0, shade));
    vi.push(builder.vertex([wx + ax, y + y1, wz + az], u0, v0, shade));
    builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
    builder.idx.push(vi[2], vi[1], vi[0], vi[3], vi[2], vi[0]);
  }
  // flame top - small bright quad
  const fy0 = y1, fy1 = y1 + 0.22;
  const fx0 = 0.5 - 0.11, fx1 = 0.5 + 0.11, fz0 = 0.5 - 0.11, fz1 = 0.5 + 0.11;
  // flame faces as cross above stick
  const flamePlanes = [
    [[fx0, 0.5], [fx1, 0.5]],
    [[0.5, fz0], [0.5, fz1]],
  ];
  // actually two vertical planes for flame
  const flameVs = [
    [[fx0, fy0, 0.5], [fx1, fy0, 0.5], [fx1, fy1, 0.5], [fx0, fy1, 0.5]],
    [[0.5, fy0, fz0], [0.5, fy0, fz1], [0.5, fy1, fz1], [0.5, fy1, fz0]],
  ];
  for (const quad of flameVs) {
    const vi = [];
    vi.push(builder.vertex([wx + quad[0][0], y + quad[0][1], wz + quad[0][2]], u0, v1, shade));
    vi.push(builder.vertex([wx + quad[1][0], y + quad[1][1], wz + quad[1][2]], u1, v1, shade));
    vi.push(builder.vertex([wx + quad[2][0], y + quad[2][1], wz + quad[2][2]], u1, v0, shade));
    vi.push(builder.vertex([wx + quad[3][0], y + quad[3][1], wz + quad[3][2]], u0, v0, shade));
    builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
    builder.idx.push(vi[2], vi[1], vi[0], vi[3], vi[2], vi[0]);
  }
}

/**
 * Крестовые спрайты декора (трава, цветы, лианы, грибы): две диагональные
 * плоскости, каждая рисуется с двух сторон (материал односторонний).
 * Лиана (def.hang) свисает с потолка, светящийся гриб (def.emissive) горит сам.
 */
function addDecorQuads(builder, world, wx, y, wz, def, lightAt) {
  const [u0, v0, u1, v1] = tileUV(def.tiles[2]);
  // Чем свободнее вокруг, тем ярче трава
  let open = 0;
  if (!isOpaque(world.getBlock(wx + 1, y, wz))) open++;
  if (!isOpaque(world.getBlock(wx - 1, y, wz))) open++;
  if (!isOpaque(world.getBlock(wx, y, wz + 1))) open++;
  if (!isOpaque(world.getBlock(wx, y, wz - 1))) open++;
  const baseShade = 0.72 + 0.07 * open;

  const hang = !!def.hang;                     // лиана крепится к потолку
  const y0 = 0.02;
  const y1 = hang ? 0.98 : 0.92;
  const m = 0.15;
  const cell = [wx + 0.5, y + 0.5, wz + 0.5];
  // Две плоскости: (m,m)-(1-m,1-m) и (1-m,m)-(m,1-m)
  const planes = [
    [[m, m], [1 - m, 1 - m]],
    [[1 - m, m], [m, 1 - m]],
  ];
  for (const [[ax, az], [bx, bz]] of planes) {
    const vi = [];
    // Кольцо: нижний А, нижний Б, верхний Б, верхний А.
    // У лианы текстура перевёрнута: плеть «свисает» из точки крепления.
    for (const [px, py, pz, u, v] of [
      [wx + ax, y + y0, wz + az, u0, v0],
      [wx + bx, y + y0, wz + bz, u1, v0],
      [wx + bx, y + y1, wz + bz, u1, v1],
      [wx + ax, y + y1, wz + az, u0, v1],
    ]) {
      const p = [px, py, pz];
      const sky = def.emissive ? 1 : lightAt(p, [0, 1, 0], cell);
      const glow = def.emissive ? 1 : lightAt.torch;
      vi.push(builder.vertex(p, u, v, def.emissive ? 1 : baseShade * sky, baseShade * glow));
    }
    // Обе стороны плоскости (обход/против обхода)
    builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
    builder.idx.push(vi[2], vi[1], vi[0], vi[3], vi[2], vi[0]);
  }
}


