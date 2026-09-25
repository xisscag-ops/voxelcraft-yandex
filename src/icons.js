// Иконки предметов для интерфейса:
//  • блоки — объёмные изометрические кубики из атласа (верх + две боковые грани с затенением)
//  • трава/цветы/папоротник — плоские спрайты
//  • инструменты, палка, яблоко — пиксель-арт
import { BLOCK, BLOCKS } from './blocks.js';
import { TILE, ATLAS_COLS, atlasCanvas } from './textures.js';
import { itemDef } from './items.js';

// Растения рисуем плоскими спрайтами, остальное — кубиками
const FLAT_BLOCKS = new Set([
  BLOCK.TALL_GRASS, BLOCK.FLOWER_RED, BLOCK.FLOWER_YELLOW, BLOCK.FERN, BLOCK.CLOVER, BLOCK.TORCH,
]);
const SLAB_BLOCKS = new Set([
  BLOCK.PLANK_SLAB, BLOCK.PLANK_SLAB_TOP, BLOCK.COBBLE_SLAB, BLOCK.COBBLE_SLAB_TOP,
]);

// Затенение граней кубика: верх — светлый, левая — средняя, правая — тёмная
export const FACE_SHADE = { top: 1, left: 0.74, right: 0.52 };

let _atlas = null;
function atlas() {
  if (!_atlas) _atlas = atlasCanvas();
  return _atlas;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return c;
}

// Вырезает один тайл атласа в отдельный канвас
function tileCanvas(idx) {
  const a = atlas();
  const c = makeCanvas(TILE, TILE);
  const sx = (idx % ATLAS_COLS) * TILE;
  const sy = ((idx / ATLAS_COLS) | 0) * TILE;
  c.getContext('2d').drawImage(a, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
  return c;
}

// Затемнение грани (сохраняет прозрачность)
function shaded(tile, factor) {
  if (factor >= 1) return tile;
  const c = makeCanvas(TILE, TILE);
  const ctx = c.getContext('2d');
  ctx.drawImage(tile, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = `rgba(0,0,0,${(1 - factor).toFixed(3)})`;
  ctx.fillRect(0, 0, TILE, TILE);
  ctx.globalCompositeOperation = 'source-over';
  return c;
}

function drawFace(ctx, img, m) {
  ctx.save();
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Изометрический кубик блока (верхняя грань + левая и правая боковые)
 * Ромб сверху занимает половину высоты, боковины — вторую половину.
 */
export function blockCubeCanvas(id, size = 48) {
  const def = BLOCKS[id];
  const c = makeCanvas(size, size);
  if (!def || !def.tiles) return c;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const [topId, , sideId, frontId = sideId] = def.tiles;
  const s = size;
  const cx = s / 2;
  const k = s / TILE;           // масштаб «тайл → пиксели иконки»

  const top = shaded(tileCanvas(topId), FACE_SHADE.top);
  const left = shaded(tileCanvas(sideId), FACE_SHADE.left);
  const right = shaded(tileCanvas(frontId), FACE_SHADE.right);

  // верхняя грань: ромб
  drawFace(ctx, top, [k / 2, k / 4, -k / 2, k / 4, cx, 0]);
  // левая грань
  drawFace(ctx, left, [k / 2, k / 4, 0, k / 2, 0, s * 0.25]);
  // правая грань
  drawFace(ctx, right, [k / 2, -k / 4, 0, k / 2, cx, s * 0.5]);
  return c;
}

/** Плоский спрайт блока (трава, цветы) */
export function blockSpriteCanvas(id, size = 48) {
  const def = BLOCKS[id];
  const c = makeCanvas(size, size);
  if (!def || !def.tiles) return c;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const a = atlas();
  const idx = def.tiles[0];
  const sx = (idx % ATLAS_COLS) * TILE;
  const sy = ((idx / ATLAS_COLS) | 0) * TILE;
  ctx.drawImage(a, sx, sy, TILE, TILE, 0, 0, size, size);
  return c;
}

// ---------------------------------------------------------------- Пиксель-арт
// 16x16 сетки; '.' — прозрачный пиксель, остальные символы — цвета из pal
const SPRITES = {
  stick: {
    pal: { h: '#7b5530', H: '#a97a45' },
    rows: [
      '................',
      '................',
      '................',
      '..........hH....',
      '.........hH.....',
      '........hH......',
      '.......hH.......',
      '......hH........',
      '.....hH.........',
      '....hH..........',
      '...hH...........',
      '...h............',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  bow: {
    pal: { w: '#8b5a2b', d: '#5f3d1c', s: '#ececef', f: '#e0574c', h: '#d9dde6', a: '#c39a63' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '....wws.........',
      '...ww.s.........',
      '...ww.s.........',
      '...dd.sf....h...',
      '...ww.saaaaaah..',
      '...ww.sf....h...',
      '...ww.s.........',
      '....wws.........',
      '......s.........',
      '................',
      '................',
      '................',
    ],
  },
  arrow: {
    pal: { F: '#e0574c', S: '#c39a63', W: '#d9dde6' },
    rows: [
      '................',
      '..............W.',
      '.............WW.',
      '.............WWW',
      '............WW..',
      '...........SS...',
      '..........SS....',
      '.........SS.....',
      '........SS......',
      '.......SS.......',
      '......SS........',
      '..F..SS.........',
      '.FFF.S..........',
      '.FF.............',
      '.F..............',
      '................',
    ],
  },
  apple: {
    pal: { h: '#6b4a2b', H: '#8a6134', G: '#5aa83c', R: '#d64545', r: '#a02f2f' },
    rows: [
      '................',
      '................',
      '.......hH...G...',
      '......h...GGG...',
      '....RRRRR.G.....',
      '...RRRRRRR......',
      '..RRRRRRRRR.....',
      '..RrRRRRRRR.....',
      '..RrRRRRRRR.....',
      '..RrRRRRRRR.....',
      '..RRRRRRRRR.....',
      '...RRRRRRR......',
      '....RRRRR.......',
      '................',
      '................',
      '................',
    ],
  },
  // Кисти инструментов: H/h — рукоятка, W/w — рабочая часть (дерево), S/s — камень
  wood_pickaxe: {
    pal: { h: '#7b5530', H: '#a97a45', W: '#c39a62', w: '#8a6134' },
    rows: [
      '................',
      '.........WWW....',
      '.......WWWWWW...',
      '.....WWWWWWWWW..',
      '.....Ww....WWWw.',
      '....Ww.......WW.',
      '....w.....hH....',
      '.........hH.....',
      '........hH......',
      '.......hH.......',
      '......hH........',
      '.....hH.........',
      '....hH..........',
      '...hH...........',
      '...h............',
      '................',
    ],
  },
  stone_pickaxe: {
    pal: { h: '#7b5530', H: '#a97a45', W: '#cbcbcb', w: '#8f8f8f' },
    rows: [
      '................',
      '.........WWW....',
      '.......WWWWWW...',
      '.....WWWWWWWWW..',
      '.....Ww....WWWw.',
      '....Ww.......WW.',
      '....w.....hH....',
      '.........hH.....',
      '........hH......',
      '.......hH.......',
      '......hH........',
      '.....hH.........',
      '....hH..........',
      '...hH...........',
      '...h............',
      '................',
    ],
  },
  stone_axe: {
    pal: { h: '#7b5530', H: '#a97a45', W: '#c8ccd0', w: '#858b92' },
    rows: [
      '................',
      '........WWWW....',
      '.......WWWWWW...',
      '......WWWWWWWW..',
      '......WWWWWWWWh.',
      '......WwWWWW.H..',
      '.......WwWW.hH..',
      '.......Ww..hH...',
      '..........hH....',
      '.........hH.....',
      '........hH......',
      '.......hH.......',
      '......hH........',
      '.....hH.........',
      '....h...........',
      '................',
    ],
  },
  wood_axe: {
    pal: { h: '#7b5530', H: '#a97a45', W: '#c39a62', w: '#8a6134' },
    rows: [
      '................',
      '........WWWW....',
      '.......WWWWWW...',
      '......WWWWWWWW..',
      '......WWWWWWWWh.',
      '......WwWWWW.H..',
      '.......WwWW.hH..',
      '.......Ww..hH...',
      '..........hH....',
      '.........hH.....',
      '........hH......',
      '.......hH.......',
      '......hH........',
      '.....hH.........',
      '....h...........',
      '................',
    ],
  },
  wood_sword: {
    pal: { h: '#7b5530', H: '#a97a45', B: '#c39a62', b: '#8a6134', g: '#6a5540' },
    rows: [
      '................',
      '..............B.',
      '.............BB.',
      '............BBb.',
      '...........BBb..',
      '..........BBb...',
      '.........BBb....',
      '........BBb.....',
      '.......BBb......',
      '......BBb.......',
      '.....BBb........',
      '..gBBBg.........',
      '...hHh..........',
      '...hH...........',
      '...h............',
      '................',
    ],
  },
  stone_sword: {
    pal: { h: '#7b5530', H: '#a97a45', B: '#d8d8e0', b: '#9aa0b0', g: '#5d5d68' },
    rows: [
      '................',
      '..............B.',
      '.............BB.',
      '............BBb.',
      '...........BBb..',
      '..........BBb...',
      '.........BBb....',
      '........BBb.....',
      '.......BBb......',
      '......BBb.......',
      '.....BBb........',
      '..gBBBg.........',
      '...hHh..........',
      '...hH...........',
      '...h............',
      '................',
    ],
  },
};

// Остальные ресурсы рисуем на сетке 16×16; ни на одной платформе не нужны emoji-шрифты.
const RESOURCE_SPRITES = new Set(['wheat', 'coal', 'ore', 'gold_ore', 'diamond', 'ingot', 'gold_ingot', 'bread']);
function resourceIcon(ctx, name) {
  const box = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  if (name === 'bread') {
    box(2, 6, 12, 8, '#78411e'); box(3, 5, 10, 8, '#b47731');
    box(4, 4, 8, 7, '#dc9d4f'); box(5, 5, 6, 4, '#edb864');
    for (const x of [5, 8, 11]) box(x, 5, 1, 4, '#965726');
  } else if (name === 'wheat') {
    box(8, 4, 1, 11, '#986c2f');
    for (let y = 3; y <= 10; y += 2) {
      box(5, y, 3, 2, '#e8b948'); box(9, y + 1, 3, 2, '#dca93d');
    }
    box(8, 2, 1, 2, '#ffe08a');
  } else if (name === 'diamond') {
    box(6, 2, 5, 2, '#d7ffff'); box(3, 4, 10, 4, '#48b7cb');
    box(4, 8, 8, 3, '#3ce4d2'); box(6, 11, 4, 2, '#267eac');
    box(5, 4, 3, 4, '#aefff0');
  } else if (name === 'ingot' || name === 'gold_ingot') {
    const metal = name === 'gold_ingot' ? ['#88601f', '#e1ac43', '#ffe094'] : ['#596577', '#aebbc7', '#ebf3f4'];
    box(2, 9, 12, 4, metal[0]); box(3, 7, 10, 4, metal[1]);
    box(5, 6, 6, 2, metal[2]);
  } else {
    const shades = name === 'coal' ? ['#17191d', '#333942', '#727885']
      : name === 'gold_ore' ? ['#715e40', '#b48c44', '#ffdb66']
        : ['#68594b', '#ad7350', '#e0a777'];
    box(3, 5, 10, 8, shades[0]); box(4, 3, 8, 9, shades[1]);
    box(5, 4, 4, 3, shades[2]); box(10, 8, 2, 3, shades[2]);
  }
}

/** Пиксель-арт иконка по имени спрайта */
export function pixelSpriteCanvas(name, size = 48) {
  const c = makeCanvas(size, size);
  const sp = SPRITES[name];
  if (!sp) {
    if (RESOURCE_SPRITES.has(name)) {
      const ctx = c.getContext('2d');
      ctx.scale(size / 16, size / 16);
      resourceIcon(ctx, name);
    }
    return c;
  }
  const ctx = c.getContext('2d');
  const k = size / 16;
  for (let y = 0; y < 16; y++) {
    const row = sp.rows[y] || '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      const col = sp.pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * k, y * k, Math.ceil(k), Math.ceil(k));
    }
  }
  return c;
}

/**
 * Пиксели спрайта (16×16) для объёмной модели предмета в руке: та же картинка,
 * что и в инвентаре, выдавленная в толщину. null — у предмета нет пиксель-арта.
 * @returns {null | Array<{ x: number, y: number, color: string }>}
 */
export function spritePixels(name) {
  const sp = SPRITES[name];
  if (!sp) return null;
  const out = [];
  for (let y = 0; y < 16; y++) {
    const row = sp.rows[y] || '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (!ch || ch === '.' || !sp.pal[ch]) continue;
      out.push({ x, y, color: sp.pal[ch] });
    }
  }
  return out;
}

/** Иконка блока по id: кубик или плоский спрайт */
export function blockIconCanvas(id, size = 48) {
  if (FLAT_BLOCKS.has(id)) return blockSpriteCanvas(id, size);
  if (SLAB_BLOCKS.has(id)) {
    const c = makeCanvas(size, size);
    c.getContext('2d').drawImage(blockCubeCanvas(id, size), 0, size * 0.17, size, size * 0.75);
    return c;
  }
  return blockCubeCanvas(id, size);
}

/** Иконка любого предмета по ключу ('block_3', 'stick', 'tool_wood_axe', …) */
export function itemIconCanvas(key, size = 48) {
  const def = itemDef(key);
  if (!def) return null;
  if (def.kind === 'block') return blockIconCanvas(def.block, size);
  return pixelSpriteCanvas(def.icon, size);
}

/** Готовый элемент <canvas class="slot-icon"> для вставки в DOM */
export function itemIconEl(key, size = 44) {
  const c = itemIconCanvas(key, size);
  if (!c) return null;
  c.className = 'slot-icon';
  return c;
}

/** Ключ спрайта инструмента — для тестов и отладки */
export function spriteNames() {
  return [...Object.keys(SPRITES), ...RESOURCE_SPRITES];
}
