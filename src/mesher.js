// Меширование вокселей: видимые грани, полублоки, факелы и AO на вершинах.
import { BLOCK, BLOCKS, blockBounds, isOpaque, isLiquid, isDecor, isSlab } from './blocks.js';
import { tileUV } from './textures.js';

const FACE_SHADE = { px: 0.72, nx: 0.72, py: 1.0, ny: 0.5, pz: 0.88, nz: 0.88 };
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

const FACE_PRECOMP = FACES.map((f) => {
  const aAxis = f.n.findIndex((c) => c !== 0);
  const verts = RING.map(([du, dv]) => {
    const pos = [0, 0, 0];
    pos[aAxis] = f.n[aAxis] > 0 ? 1 : 0;
    pos[f.U] = du > 0 ? 1 : 0;
    pos[f.V] = dv > 0 ? 1 : 0;
    return { pos, du, dv };
  });
  const [a, b, c] = verts.map((v) => v.pos);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
  const ring = cross[aAxis] * f.n[aAxis] > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
  return {
    ...f, verts, aAxis,
    idxA: [ring[0], ring[1], ring[2], ring[0], ring[2], ring[3]],
    idxB: [ring[1], ring[2], ring[3], ring[1], ring[3], ring[0]],
  };
});

function aoOf(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - Number(side1) - Number(side2) - Number(corner);
}

class MeshBuilder {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
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

// Вернуть видимый участок грани. Грань, расположенная внутри ячейки
// (верх нижнего полублока / низ верхнего), не перекрывается соседом.
// Если рядом с полным блоком стоит полублок, рисуется только открытая
// ПОЛОВИНА боковой грани: нет ни дыр, ни наложения поверхностей.
function visibleBounds(id, neighbor, face) {
  const bounds = blockBounds(id);
  const axis = 'XYZ'[face.aAxis];
  const edge = face.n[face.aAxis] > 0 ? bounds[`max${axis}`] === 1 : bounds[`min${axis}`] === 0;
  if (!edge) return bounds;
  if (isLiquid(id)) return neighbor === id || isOpaque(neighbor) ? null : bounds;
  if (isOpaque(neighbor)) return null;
  if (neighbor === id && (BLOCKS[id].transparent || BLOCKS[id].foliage)) return null;

  if (isSlab(neighbor)) {
    const half = BLOCKS[neighbor].half;
    if (face.key === 'py' && half === 'bottom') return null;
    if (face.key === 'ny' && half === 'top') return null;
    if (face.aAxis !== 1) {
      if (isSlab(id) && BLOCKS[id].half === half) return null;
      if (!isSlab(id)) return half === 'bottom'
        ? { ...bounds, minY: 0.5 } : { ...bounds, maxY: 0.5 };
    }
  }
  return bounds;
}

/** Строит геометрию чанка (не создаёт GPU-ресурсы). */
export function meshChunk(THREE, world, cx, cz) {
  const opaque = new MeshBuilder();
  const water = new MeshBuilder();
  const torch = new MeshBuilder();
  const S = world.chunkSize, H = world.worldHeight;
  const ox = cx * S, oz = cz * S;

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const wx = ox + x, wz = oz + z;
        const id = world.getBlock(wx, y, wz);
        if (!id) continue;
        const def = BLOCKS[id];
        if (isDecor(id)) { addDecorQuads(opaque, world, wx, y, wz, def); continue; }
        if (id === BLOCK.TORCH) { addTorchQuads(torch, wx, y, wz, def); continue; }

        const liquid = isLiquid(id);
        const builder = liquid ? water : opaque;
        for (const face of FACE_PRECOMP) {
          const n = face.n;
          const nb = world.getBlock(wx + n[0], y + n[1], wz + n[2]);
          const bounds = visibleBounds(id, nb, face);
          if (!bounds) continue;

          const tileIdx = face.key === 'pz' && def.tiles[3] != null ? def.tiles[3] : def.tiles[face.face];
          const [u0, v0, u1, v1] = tileUV(tileIdx);
          const baseShade = FACE_SHADE[face.key];
          const emissive = !!def.emissive;
          const yTopOffset = liquid && !isLiquid(world.getBlock(wx, y + 1, wz)) ? -0.12 : 0;
          const base = [wx + n[0], y + n[1], wz + n[2]];
          const cornerAOs = [], vi = [];

          for (const vert of face.verts) {
            const s1 = [...base], s2 = [...base], co = [...base];
            s1[face.U] += vert.du;
            s2[face.V] += vert.dv;
            co[face.U] += vert.du; co[face.V] += vert.dv;
            const ao = emissive ? 3 : aoOf(
              isOpaque(world.getBlock(...s1)),
              isOpaque(world.getBlock(...s2)),
              isOpaque(world.getBlock(...co)),
            );
            cornerAOs.push(ao);

            const p = [wx, y, wz];
            for (let a = 0; a < 3; a++) {
              const axis = 'XYZ'[a];
              p[a] += bounds[`min${axis}`] + vert.pos[a] * (bounds[`max${axis}`] - bounds[`min${axis}`]);
            }
            if (vert.pos[1] === 1 && yTopOffset && face.key !== 'ny') p[1] += yTopOffset;
            // На вертикальных гранях полублока текстура обрезана по высоте,
            // а не растянута до целого блока.
            const local = [p[0] - wx, p[1] - y, p[2] - wz];
            const u = u0 + (u1 - u0) * local[face.U];
            const v = v0 + (v1 - v0) * local[face.V];
            const shade = emissive ? 1 : baseShade * AO_LEVEL[ao];
            vi.push(builder.vertex(p, u, v, shade));
          }
          const flip = cornerAOs[0] + cornerAOs[2] > cornerAOs[1] + cornerAOs[3];
          builder.idx.push(...(flip ? face.idxB : face.idxA).map((i) => vi[i]));
        }
      }
    }
  }
  return { opaque, water, torch };
}

// Декоративные растения: два двусторонних крестовых спрайта.
function addDecorQuads(builder, world, wx, y, wz, def) {
  const [u0, v0, u1, v1] = tileUV(def.tiles[2]);
  let open = 0;
  if (!isOpaque(world.getBlock(wx + 1, y, wz))) open++;
  if (!isOpaque(world.getBlock(wx - 1, y, wz))) open++;
  if (!isOpaque(world.getBlock(wx, y, wz + 1))) open++;
  if (!isOpaque(world.getBlock(wx, y, wz - 1))) open++;
  const shade = 0.72 + 0.07 * open;
  for (const [[ax, az], [bx, bz]] of [
    [[0.15, 0.15], [0.85, 0.85]],
    [[0.85, 0.15], [0.15, 0.85]],
  ]) {
    addDoubleQuad(builder, [
      [wx + ax, y + 0.02, wz + az], [wx + bx, y + 0.02, wz + bz],
      [wx + bx, y + 0.92, wz + bz], [wx + ax, y + 0.92, wz + az],
    ], [u0, v0, u1, v1], shade);
  }
}

function addDoubleQuad(builder, points, uv, shade) {
  const [u0, v0, u1, v1] = uv;
  const vi = [
    builder.vertex(points[0], u0, v0, shade), builder.vertex(points[1], u1, v0, shade),
    builder.vertex(points[2], u1, v1, shade), builder.vertex(points[3], u0, v1, shade),
  ];
  builder.idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
  builder.idx.push(vi[2], vi[1], vi[0], vi[3], vi[2], vi[0]);
}

// Факел рендерится отдельным всегда ярким материалом; освещение соседних
// блоков выполняет шейдер местного света (см. main.js).
function addTorchQuads(builder, wx, y, wz, def) {
  const uv = tileUV(def.tiles[2]);
  for (const [[ax, az], [bx, bz]] of [
    [[0.38, 0.5], [0.62, 0.5]],
    [[0.5, 0.38], [0.5, 0.62]],
  ]) {
    addDoubleQuad(builder, [
      [wx + ax, y + 0.02, wz + az], [wx + bx, y + 0.02, wz + bz],
      [wx + bx, y + 0.84, wz + bz], [wx + ax, y + 0.84, wz + az],
    ], uv, 1);
  }
}
