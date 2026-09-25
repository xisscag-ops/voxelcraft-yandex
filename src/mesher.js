// Меширование вокселей: только видимые грани + ambient occlusion на вершинах
import { BLOCK, BLOCKS, isOpaque, isLiquid, isDecor, isSlab } from './blocks.js';
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
    this.idx = [];
  }
  vertex(p, u, v, shade) {
    this.pos.push(p[0], p[1], p[2]);
    this.uv.push(u, v);
    this.col.push(shade, shade, shade);
    return this.pos.length / 3 - 1;
  }
  isEmpty() { return this.idx.length === 0; }
  toGeometry(THREE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

function createLighting(world, ox, oz, S, H) {
  const skyColumns = new Map();
  const torches = [];
  // Правки мира — быстрый источник факелов; при пересборке чанк уже знает их позиции.
  if (world.edits?.[Symbol.iterator]) {
    for (const [key, id] of world.edits) {
      if (id !== BLOCK.TORCH) continue;
      const [x, y, z] = key.split(',').map(Number);
      if (x < ox - 9 || x > ox + S + 9 || z < oz - 9 || z > oz + S + 9) continue;
      torches.push({ x: x + 0.5, y: y + 0.72, z: z + 0.5 });
    }
  }

  function skyVisibleAt(px, py, pz, normal) {
    // Чуть выносим пробу за грань, чтобы не считать сам блок преградой для света.
    const bx = Math.floor(px + normal[0] * 0.02);
    const by = Math.floor(py + normal[1] * 0.02);
    const bz = Math.floor(pz + normal[2] * 0.02);
    if (by >= H) return 1;
    if (by < 0) return 0.1;
    const key = `${bx},${bz}`;
    let column = skyColumns.get(key);
    if (!column) {
      column = new Uint8Array(H);
      let blocked = false;
      for (let y = H - 1; y >= 0; y--) {
        if (isOpaque(world.getBlock(bx, y, bz))) blocked = true;
        column[y] = blocked ? 0 : 1;
      }
      skyColumns.set(key, column);
    }
    return column[by] ? 1 : 0.1;
  }

  return (p, normal, skyProbe = p) => {
    let brightness = skyVisibleAt(skyProbe[0], skyProbe[1], skyProbe[2], normal);
    for (const torch of torches) {
      const d = Math.hypot(p[0] - torch.x, p[1] - torch.y, p[2] - torch.z);
      if (d >= 8.5) continue;
      const falloff = 1 - d / 8.5;
      // Значение выше единицы компенсирует общий ночной tint terrainMat,
      // так что факел освещает пещеру, не делая ярче поверхность днём.
      brightness = Math.max(brightness, 3.6 * falloff * falloff);
    }
    return brightness;
  };
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
        // Факел рендерится объёмной моделью в main.js, не плоскими квадами.
        if (def.torch) continue;

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
            // грань между двумя одинаковыми стеклянными/листьями/плитами — не рисуем
            if (nb === id && (def.transparent || def.foliage || def.slab)) continue;
          }

          const tileIdx = def.tiles[face.face];
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
            const probe = [
              wx + 0.08 + vert.pos[0] * 0.84,
              y + 0.08 + vert.pos[1] * 0.84,
              wz + 0.08 + vert.pos[2] * 0.84,
            ];
            for (let axis = 0; axis < 3; axis++) if (n[axis]) probe[axis] = p[axis] + n[axis] * 0.02;
            const shade = emissive ? 1.0 : baseShade * AO_LEVEL[ao] * lightAt(p, n, probe);
            vi.push(builder.vertex(p, u, v, shade));
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

function addSlabFaces(builder, world, wx, y, wz, def, lightAt) {
  const H = 0.5;
  const tileIdx = def.tiles[2];
  const [u0, v0, u1, v1] = tileUV(tileIdx);
  // top at 0.5 if not blocked above, bottom always, sides half height
  const faces = [
    // top
    { n: [0, 1, 0], pos: [[0, H, 0], [1, H, 0], [1, H, 1], [0, H, 1]], shade: FACE_SHADE.py },
    // bottom
    { n: [0, -1, 0], pos: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]], shade: FACE_SHADE.ny },
    // sides
    { n: [1, 0, 0], pos: [[1, 0, 0], [1, 0, 1], [1, H, 1], [1, H, 0]], shade: FACE_SHADE.px },
    { n: [-1, 0, 0], pos: [[0, 0, 1], [0, 0, 0], [0, H, 0], [0, H, 1]], shade: FACE_SHADE.nx },
    { n: [0, 0, 1], pos: [[0, 0, 1], [1, 0, 1], [1, H, 1], [0, H, 1]], shade: FACE_SHADE.pz },
    { n: [0, 0, -1], pos: [[1, 0, 0], [0, 0, 0], [0, H, 0], [1, H, 0]], shade: FACE_SHADE.nz },
  ];
  for (const f of faces) {
    const n = f.n;
    const nb = world.getBlock(wx + n[0], y + n[1], wz + n[2]);
    // top face: if slab above or opaque block above, hide
    if (n[1] === 1) {
      if (isOpaque(nb) || world.getBlock(wx, y + 1, wz) !== 0 && isSlab(world.getBlock(wx, y + 1, wz))) continue;
    } else if (n[1] === -1) {
      if (isOpaque(nb)) continue;
    } else {
      if (isOpaque(nb)) continue;
      // hide side if neighbor slab at same height
      if (nb !== 0 && isSlab(nb)) continue;
    }
    const emissive = !!def.emissive;
    const vi = [];
    for (let i = 0; i < 4; i++) {
      const p = [wx + f.pos[i][0], y + f.pos[i][1], wz + f.pos[i][2]];
      // UV mapping: for top/bottom use x,z ; for sides use x,y etc
      let u, v;
      if (n[1] !== 0) { u = f.pos[i][0] === 0 ? u0 : u1; v = f.pos[i][2] === 0 ? v0 : v1; }
      else if (n[0] !== 0) { u = f.pos[i][2] === 0 ? u0 : u1; v = f.pos[i][1] === 0 ? v1 : (f.pos[i][1] === H ? v0 : v1 - (v1 - v0) * 0.5); }
      else { u = f.pos[i][0] === 0 ? u0 : u1; v = f.pos[i][1] === 0 ? v1 : v0; }
      const probe = [
        wx + 0.08 + f.pos[i][0] * 0.84,
        y + 0.08 + f.pos[i][1] * 0.84,
        wz + 0.08 + f.pos[i][2] * 0.84,
      ];
      for (let axis = 0; axis < 3; axis++) if (n[axis]) probe[axis] = p[axis] + n[axis] * 0.02;
      if (n[1] === 1) probe[1] = y + 1.02;
      const shade = emissive ? 1.0 : f.shade * lightAt(p, n, probe);
      vi.push(builder.vertex(p, u, v, shade));
    }
    builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
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
 * Крестовые спрайты декора (трава, цветы): две диагональные плоскости,
 * каждая рисуется с двух сторон (материал односторонний).
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

  const y0 = 0.02, y1 = 0.92, m = 0.15;
  // Две плоскости: (m,m)-(1-m,1-m) и (1-m,m)-(m,1-m)
  const planes = [
    [[m, m], [1 - m, 1 - m]],
    [[1 - m, m], [m, 1 - m]],
  ];
  for (const [[ax, az], [bx, bz]] of planes) {
    const vi = [];
    // Кольцо: нижний А, нижний Б, верхний Б, верхний А
    for (const [px, py, pz, u, v] of [
      [wx + ax, y + y0, wz + az, u0, v0],
      [wx + bx, y + y0, wz + bz, u1, v0],
      [wx + bx, y + y1, wz + bz, u1, v1],
      [wx + ax, y + y1, wz + az, u0, v1],
    ]) {
      const p = [px, py, pz];
      const probe = [wx + 0.5, py + 0.02, wz + 0.5];
      vi.push(builder.vertex(p, u, v, baseShade * lightAt(p, [0, 1, 0], probe)));
    }
    // Обе стороны плоскости (обход/против обхода)
    builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
    builder.idx.push(vi[2], vi[1], vi[0], vi[3], vi[2], vi[0]);
  }
}


