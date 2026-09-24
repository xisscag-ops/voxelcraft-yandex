// Иконки предметов для интерфейса:
//  - блоки — объёмные изометрические кубики из атласа (верх + две боковые грани с затенением)
//  - трава/цветы — плоский спрайт тайла
//  - палка, инструменты, яблоко — пиксель-арт
import { TILE, tileCanvas } from './textures.js';
import { BLOCKS, isDecor } from './blocks.js';
import { ITEM } from './inventory.js';

const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h || w;
  return c;
}

// Изометрический кубик: верхний тайл + боковой тайл, грани с затенением
function cubeIcon(size, topIdx, sideIdx) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const S = size;
  const w = S * 0.47;   // полуширина верхнего ромба
  const h = S * 0.44;   // высота боковых граней
  const m = (S - (w + h)) / 2;
  const N = { x: S / 2, y: m };     // верхний угол ромба
  const M = { x: S / 2, y: m + w }; // средний угол (низ ромба)
  const top = tileCanvas(topIdx);
  const side = tileCanvas(sideIdx);

  const face = (tex, a, b, cx, d, ex, ey, shade) => {
    const t = makeCanvas(TILE);
    const tctx = t.getContext('2d');
    tctx.drawImage(tex, 0, 0);
    if (shade < 1) {
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = 'rgba(0,0,0,' + (1 - shade).toFixed(3) + ')';
      tctx.fillRect(0, 0, TILE, TILE);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.transform(a, b, cx, d, ex, ey);
    ctx.drawImage(t, 0, 0, TILE, TILE, 0, 0, 1, 1);
    ctx.restore();
  };

  // Верх: N + u*(w, w/2) + v*(-w, w/2)
  face(top, w, w / 2, -w, w / 2, N.x, N.y, 1.0);
  // Правая грань: от M в сторону (w, -w/2), ниже — темнее
  face(side, w, -w / 2, 0, h, M.x, M.y, 0.55);
  // Левая грань: от M в сторону (-w, -w/2)
  face(side, -w, -w / 2, 0, h, M.x, M.y, 0.75);
  return c;
}

// Плоский спрайт (декоративная растительность)
function spriteIcon(tileIdx, size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tileCanvas(tileIdx), 0, 0, TILE, TILE, 0, 0, size, size);
  return c;
}

// Пиксель-арт: рисуем 16×16, масштабируем без сглаживания
function pixelIcon(size, painter) {
  const s = makeCanvas(TILE);
  painter(s.getContext('2d'));
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s, 0, 0, TILE, TILE, 0, 0, size, size);
  return c;
}

// Диагональная «лента» из пикселей (рукоятки, клинки)
function diag(ctx, x, y, len, wdt, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < len; i++) ctx.fillRect(x + i, y + i, wdt, wdt);
}

const WOOD = '#9c7a3c', WOOD_L = '#c2a25c', WOOD_D = '#6f4526';
const STONE = '#8f8f96', STONE_L = '#c9c9d2', STONE_D = '#6a6a74';
const STICK_C = '#8a5a33', STICK_L = '#a06c3e', STICK_D = '#6f4526';

function pick(ctx, mat, matL, matD) {
  // Рукоять по диагонали
  diag(ctx, 6, 4, 8, 2, STICK_C);
  diag(ctx, 7, 4, 7, 1, STICK_L);
  // Голова: дуга с загнутыми концами
  ctx.fillStyle = mat;
  ctx.fillRect(3, 2, 10, 2);
  ctx.fillRect(2, 2, 2, 4);
  ctx.fillRect(12, 2, 2, 4);
  ctx.fillRect(3, 4, 1, 2);
  ctx.fillRect(12, 4, 1, 2);
  ctx.fillStyle = matL;
  ctx.fillRect(4, 2, 3, 1);
  ctx.fillStyle = matD;
  ctx.fillRect(2, 5, 2, 1);
  ctx.fillRect(12, 5, 2, 1);
}

function axe(ctx, mat, matL, matD) {
  // Рукоять по диагонали
  diag(ctx, 2, 4, 10, 2, STICK_C);
  diag(ctx, 3, 4, 9, 1, STICK_L);
  // Голова у верхнего конца
  ctx.fillStyle = mat;
  ctx.fillRect(8, 0, 6, 5);
  ctx.fillRect(12, 2, 3, 4);
  ctx.fillStyle = matL;
  ctx.fillRect(9, 1, 1, 4);
  ctx.fillStyle = matD;
  ctx.fillRect(14, 3, 1, 2);
}

function sword(ctx, mat, matL) {
  // Клинков по диагонали
  ctx.fillStyle = mat;
  for (let i = 0; i < 10; i++) ctx.fillRect(4 + i, 11 - i, 2, 2);
  ctx.fillRect(14, 1, 2, 2); // остриё
  ctx.fillStyle = matL;
  for (let i = 0; i < 10; i++) ctx.fillRect(4 + i, 11 - i, 2, 1);
  // Перекладина и рукоять
  ctx.fillStyle = WOOD_D;
  ctx.fillRect(2, 12, 3, 2);
  ctx.fillRect(1, 13, 2, 2);
}

const PAINTERS = {
  [ITEM.STICK](ctx) {
    diag(ctx, 3, 3, 10, 2, STICK_C);
    diag(ctx, 4, 2, 9, 1, STICK_L);
    diag(ctx, 2, 12, 2, 2, STICK_D);
  },
  [ITEM.WOOD_PICK](ctx) { pick(ctx, WOOD, WOOD_L, WOOD_D); },
  [ITEM.STONE_PICK](ctx) { pick(ctx, STONE, STONE_L, STONE_D); },
  [ITEM.WOOD_AXE](ctx) { axe(ctx, WOOD, WOOD_L, WOOD_D); },
  [ITEM.WOOD_SWORD](ctx) { sword(ctx, WOOD, WOOD_L); },
  [ITEM.STONE_SWORD](ctx) { sword(ctx, STONE, STONE_L); },
  [ITEM.APPLE](ctx) {
    ctx.fillStyle = '#c93b3b';
    ctx.fillRect(5, 5, 6, 1);
    ctx.fillRect(4, 6, 8, 4);
    ctx.fillRect(4, 10, 8, 1);
    ctx.fillRect(5, 11, 6, 1);
    ctx.fillStyle = '#e05545';
    ctx.fillRect(5, 6, 2, 3);
    ctx.fillStyle = '#8f2b2b';
    ctx.fillRect(6, 11, 4, 1);
    ctx.fillStyle = STICK_D;
    ctx.fillRect(8, 3, 1, 2);
    ctx.fillStyle = '#4a8f2f';
    ctx.fillRect(9, 3, 3, 1);
    ctx.fillRect(10, 4, 2, 1);
  },
};

// Иконка предмета (кэшированная)
export function itemIcon(id, size = 44) {
  const key = id + '@' + size;
  let c = cache.get(key);
  if (c) return c;
  if (id >= 1 && id <= 19 && id !== 13) {
    const b = BLOCKS[id];
    c = isDecor(id) ? spriteIcon(b.tiles[0], size) : cubeIcon(size, b.tiles[0], b.tiles[2]);
  } else if (PAINTERS[id]) {
    c = pixelIcon(size, PAINTERS[id]);
  } else {
    c = makeCanvas(size);
  }
  cache.set(key, c);
  return c;
}

// Копия иконки — чтобы одинаковые предметы могли одновременно
// находиться в разных местах DOM (слот, каталог, «в руке»)
export function itemIconCopy(id, size = 44) {
  const src = itemIcon(id, size);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  return c;
}
