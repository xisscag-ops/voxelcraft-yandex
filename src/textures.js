// Процедурный атлас текстур (16x16 пиксель-арт генерируется кодом при старте)
import { makeRng } from './noise.js';

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 3;

// Индексы тайлов
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5,
  LOG_SIDE: 6, LOG_TOP: 7, PLANKS: 8, LEAVES: 9, GLASS: 10, BRICK: 11,
  GLOW: 12, SNOW_TOP: 13, SNOW_SIDE: 14, WATER: 15, SLATE: 16,
};

function px(data, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
  const i = (y * TILE + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

// Добавляет шум к базовому цвету
function noisyFill(data, rng, base, vary, alpha = 255) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const v = (rng() - 0.5) * 2 * vary;
      px(data, x, y,
        Math.max(0, Math.min(255, base[0] + v)),
        Math.max(0, Math.min(255, base[1] + v)),
        Math.max(0, Math.min(255, base[2] + v)), alpha);
    }
  }
}

const painters = {
  [T.GRASS_TOP](data, rng) {
    noisyFill(data, rng, [98, 168, 68], 18);
    for (let i = 0; i < 14; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 76, 140, 50);
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 120, 190, 84);
    }
  },
  [T.GRASS_SIDE](data, rng) {
    painters[T.DIRT](data, rng);
    // Зубчатая травяная кромка сверху
    for (let x = 0; x < TILE; x++) {
      const h = 2 + ((rng() * 3) | 0);
      for (let y = 0; y < h; y++) {
        const v = (rng() - 0.5) * 30;
        px(data, x, y, 98 + v, 168 + v, 68 + v);
      }
    }
  },
  [T.DIRT](data, rng) {
    noisyFill(data, rng, [134, 96, 67], 16);
    for (let i = 0; i < 12; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 104, 72, 48);
    }
  },
  [T.STONE](data, rng) {
    noisyFill(data, rng, [128, 128, 128], 12);
    for (let i = 0; i < 10; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 102, 102, 102);
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 150, 150, 150);
    }
  },
  [T.COBBLE](data, rng) {
    noisyFill(data, rng, [110, 110, 110], 10);
    // Камешки
    const rocks = [[2, 2, 5, 4], [8, 1, 6, 5], [1, 8, 6, 5], [9, 8, 5, 6], [3, 4, 4, 3], [10, 4, 4, 3]];
    for (const [rx, ry, rw, rh] of rocks) {
      const shade = 128 + (rng() * 40 - 20);
      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const edge = x === 0 || y === 0 || x === rw - 1 || y === rh - 1;
          const v = (rng() - 0.5) * 16 + (edge ? -26 : 0);
          px(data, rx + x, ry + y, shade + v, shade + v, shade + v);
        }
      }
    }
  },
  [T.SAND](data, rng) {
    noisyFill(data, rng, [219, 205, 152], 12);
    for (let i = 0; i < 10; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 196, 180, 128);
    }
  },
  [T.LOG_SIDE](data, rng) {
    noisyFill(data, rng, [104, 78, 48], 8);
    for (let x = 0; x < TILE; x++) {
      if (rng() < 0.35) {
        const v = (rng() - 0.5) * 16;
        for (let y = 0; y < TILE; y++) px(data, x, y, 84 + v, 60 + v, 36 + v);
      }
    }
  },
  [T.LOG_TOP](data, rng) {
    noisyFill(data, rng, [168, 136, 90], 8);
    // Годовые кольца
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (((d * 1.4) | 0) % 2 === 0) {
          const v = (rng() - 0.5) * 10;
          px(data, x, y, 138 + v, 108 + v, 66 + v);
        }
      }
    }
  },
  [T.PLANKS](data, rng) {
    noisyFill(data, rng, [172, 132, 78], 10);
    for (let y = 0; y < TILE; y += 4) {
      for (let x = 0; x < TILE; x++) px(data, x, y, 120, 90, 52);
      if (rng() < 0.7) {
        const xk = (rng() * TILE) | 0;
        for (let y2 = y + 1; y2 < y + 4; y2++) px(data, xk, y2, 132, 100, 58);
      }
    }
  },
  [T.LEAVES](data, rng) {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        if (rng() < 0.30) { px(data, x, y, 0, 0, 0, 0); continue; }
        const v = (rng() - 0.5) * 36;
        px(data, x, y, 58 + v, 122 + v, 44 + v);
      }
    }
    for (let i = 0; i < 8; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      if (rng() < 0.7) px(data, x, y, 40, 90, 30);
    }
  },
  [T.GLASS](data, rng) {
    // Прозрачная середина, рамка + блики
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) px(data, x, y, 0, 0, 0, 0);
    }
    for (let i = 0; i < TILE; i++) {
      px(data, i, 0, 210, 235, 240);
      px(data, i, TILE - 1, 210, 235, 240);
      px(data, 0, i, 210, 235, 240);
      px(data, TILE - 1, i, 210, 235, 240);
    }
    for (let i = 0; i < 6; i++) px(data, 3 + i, 5 + i, 235, 250, 252);
    for (let i = 0; i < 4; i++) px(data, 9 + i, 4 + i, 235, 250, 252);
  },
  [T.BRICK](data, rng) {
    noisyFill(data, rng, [150, 74, 60], 10);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const row = (y / 4) | 0;
        const off = (row % 2) * 4;
        if (y % 4 === 0 || (x + off) % 8 === 0) {
          const v = (rng() - 0.5) * 8;
          px(data, x, y, 186 + v, 172 + v, 162 + v);
        }
      }
    }
  },
  [T.GLOW](data, rng) {
    noisyFill(data, rng, [255, 214, 108], 12);
    for (let i = 0; i < 16; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 255, 244, 180);
    }
    for (let i = 0; i < 8; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 214, 160, 60);
    }
  },
  [T.SNOW_TOP](data, rng) {
    noisyFill(data, rng, [242, 246, 250], 6);
    for (let i = 0; i < 8; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 255, 255, 255);
    }
  },
  [T.SNOW_SIDE](data, rng) {
    painters[T.DIRT](data, rng);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + ((rng() * 2) | 0);
      for (let y = 0; y < h; y++) {
        const v = (rng() - 0.5) * 8;
        px(data, x, y, 242 + v, 246 + v, 250 + v);
      }
    }
  },
  [T.WATER](data, rng) {
    noisyFill(data, rng, [52, 108, 202], 14);
    for (let i = 0; i < 10; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 90, 150, 230);
    }
  },
  [T.SLATE](data, rng) {
    noisyFill(data, rng, [70, 74, 88], 10);
    for (let y = 0; y < TILE; y += 3) {
      for (let x = 0; x < TILE; x++) {
        if (rng() < 0.6) px(data, x, y, 52, 55, 66);
      }
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 96, 100, 118);
    }
  },
};

const tileColors = {};

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');

  for (const key of Object.keys(painters)) {
    const idx = Number(key);
    const img = ctx.createImageData(TILE, TILE);
    // Сид по номеру тайла — стабильный вид между запусками
    const rng = makeRng(1000 + idx * 77);
    painters[idx](img.data, rng);
    const tx = (idx % ATLAS_COLS) * TILE;
    const ty = ((idx / ATLAS_COLS) | 0) * TILE;
    ctx.putImageData(img, tx, ty);

    // Средний цвет тайла — для частиц и иконок
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i + 3] > 200) { r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
    }
    if (n > 0) {
      tileColors[idx] = [r / n, g / n, b / n];
    } else {
      tileColors[idx] = [200, 200, 200];
    }
  }
  return canvas;
}

export function tileColor(idx) {
  return tileColors[idx] || [180, 180, 180];
}

// UV-прямоугольник тайла (с полу-тексельным отступом от краёв)
export function tileUV(idx) {
  const col = idx % ATLAS_COLS;
  const row = (idx / ATLAS_COLS) | 0;
  const e = 0.02 / ATLAS_COLS; // микро-отступ против «протекания» соседних тайлов
  const u0 = col / ATLAS_COLS + e;
  const u1 = (col + 1) / ATLAS_COLS - e;
  const v1 = 1 - row / ATLAS_ROWS - e;
  const v0 = 1 - (row + 1) / ATLAS_ROWS + e;
  return [u0, v0, u1, v1];
}

// Иконка тайла для HTML-интерфейса (масштабированный канвас)
export function tileIcon(idx, size = 48) {
  const atlas = buildAtlasOnce();
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sx = (idx % ATLAS_COLS) * TILE;
  const sy = ((idx / ATLAS_COLS) | 0) * TILE;
  ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, size, size);
  return c;
}

let _atlasCanvas = null;
function buildAtlasOnce() {
  if (!_atlasCanvas) _atlasCanvas = buildAtlas();
  return _atlasCanvas;
}
