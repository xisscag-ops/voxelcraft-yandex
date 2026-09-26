// Процедурный атлас текстур (16x16 пиксель-арт генерируется кодом при старте)
import { makeRng } from './noise.js';

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 9;

// Индексы тайлов
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5,
  LOG_SIDE: 6, LOG_TOP: 7, PLANKS: 8, LEAVES: 9, GLASS: 10, BRICK: 11,
  GLOW: 12, SNOW_TOP: 13, SNOW_SIDE: 14, WATER: 15, SLATE: 16,
  // Стадии трещин при ломании
  CRACK0: 17, CRACK1: 18, CRACK2: 19, CRACK3: 20, CRACK4: 21,
  // Декоративная растительность
  GRASS_TUFT: 22, FLOWER_RED: 23, FLOWER_YELLOW: 24, FERN: 25, CLOVER: 26,
  // Верстак (крафт 3x3)
  TABLE_TOP: 27, TABLE_SIDE: 28,
  // Руды, породы камня и лёд
  COAL_ORE: 29, IRON_ORE: 30, GOLD_ORE: 31, DIAMOND_ORE: 32,
  GRAVEL: 33, SANDSTONE: 34, ICE: 35, MOSSY: 36,
  // Деревья разных пород
  BIRCH_SIDE: 37, BIRCH_TOP: 38, BIRCH_LEAVES: 39,
  SPRUCE_SIDE: 40, SPRUCE_TOP: 41, SPRUCE_LEAVES: 42,
  // Прочее
  CACTUS_SIDE: 43, CACTUS_TOP: 44, OBSIDIAN: 45,
  FURNACE_TOP: 46, FURNACE_SIDE: 47, FURNACE_FRONT: 48, TORCH: 49,
  // Плотная листва для внутренних граней кроны (без просветов)
  LEAVES_DENSE: 50, BIRCH_LEAVES_DENSE: 51, SPRUCE_LEAVES_DENSE: 52,
  // Сундук
  CHEST_TOP: 53, CHEST_SIDE: 54, CHEST_FRONT: 55,
  // Берёзовые доски, забор и наковальня
  BIRCH_PLANKS: 56, FENCE: 57, ANVIL_TOP: 58, ANVIL_SIDE: 59, ANVIL_FRONT: 60,
  // Природа: заснеженный песок, пещерная лиана и светящийся гриб
  SAND_SNOW_SIDE: 61, VINE: 62, GLOW_SHROOM: 63,
  // Объёмный забор: отдельные текстуры столбика и перекладины
  FENCE_POST: 64, FENCE_RAIL: 65,
};

export const CRACK_TILES = [17, 18, 19, 20, 21];

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

// Вкрапления руды в каменной основе
function oreBlobs(data, rng, color, n = 7) {
  for (let i = 0; i < n; i++) {
    const cx = 2 + ((rng() * 12) | 0);
    const cy = 2 + ((rng() * 12) | 0);
    const w = 2 + ((rng() * 2) | 0);
    const h = 2 + ((rng() * 2) | 0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (rng() - 0.5) * 26;
        px(data, cx + x, cy + y, color[0] + v, color[1] + v, color[2] + v);
      }
    }
  }
}

// Мелкие малоконтрастные вкрапления (уголь в камне): пятнышки 1-2 пикселя,
// по тону близкие к камню — руда заметна, но не «вырвиглазная»
function softOreSpecks(data, rng, color, n = 11) {
  for (let i = 0; i < n; i++) {
    const cx = 1 + ((rng() * 14) | 0);
    const cy = 1 + ((rng() * 14) | 0);
    const wide = rng() < 0.4;
    const w = wide ? 2 : 1;
    const h = wide ? 1 : 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (rng() - 0.5) * 12;
        px(data, cx + x, cy + y, color[0] + v, color[1] + v, color[2] + v);
      }
    }
  }
}

// Листва с просветами
function leavesFill(data, rng, base, holes = 0.14) {
  noisyFill(data, rng, base, 22);
  for (let i = 0; i < 26; i++) {
    const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
    const v = (rng() - 0.5) * 34;
    px(data, x, y, base[0] + v * 0.6, base[1] + v * 0.6, base[2] + v * 0.4);
  }
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rng() < holes) px(data, x, y, 0, 0, 0, 0);
    }
  }
}

const painters = {
  [T.GRASS_TOP](data, rng) {
    // Трава темнее остальных блоков: так газон не «светится» на солнце
    // и лучше сочетается с землёй и камнем.
    noisyFill(data, rng, [78, 140, 54], 16);
    for (let i = 0; i < 14; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 58, 112, 40);
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 96, 160, 68);
    }
  },
  [T.GRASS_SIDE](data, rng) {
    painters[T.DIRT](data, rng);
    // Зубчатая травяная кромка сверху
    for (let x = 0; x < TILE; x++) {
      const h = 2 + ((rng() * 3) | 0);
      for (let y = 0; y < h; y++) {
        const v = (rng() - 0.5) * 30;
        px(data, x, y, 78 + v, 140 + v, 54 + v);
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
  // ---- Трещины (стадии 0..4) ----
  [T.CRACK0](data, rng) { drawCracks(data, rng, 0); },
  [T.CRACK1](data, rng) { drawCracks(data, rng, 1); },
  [T.CRACK2](data, rng) { drawCracks(data, rng, 2); },
  [T.CRACK3](data, rng) { drawCracks(data, rng, 3); },
  [T.CRACK4](data, rng) { drawCracks(data, rng, 4); },
  // ---- Декоративная растительность (крестовые спрайты) ----
  [T.GRASS_TUFT](data, rng) {
    for (let b = 0; b < 7; b++) {
      const x = 2 + ((rng() * 12) | 0);
      const h = 4 + ((rng() * 8) | 0);
      const lean = rng() < 0.5 ? 1 : -1;
      for (let i = 0; i < h; i++) {
        let xx = x;
        if (i > h * 0.55) xx += lean * (((i - h * 0.55) / 1.6) | 0);
        const v = (rng() - 0.5) * 26;
        px(data, xx, 15 - i, 64 + v, 122 + v, 44 + v);
      }
    }
  },
  [T.FLOWER_RED](data, rng) {
    // Стебель и листья
    for (let y = 15; y >= 7; y--) {
      const v = (rng() - 0.5) * 14;
      px(data, 8, y, 62 + v, 122 + v, 46 + v);
    }
    px(data, 6, 11, 70, 135, 52); px(data, 5, 12, 70, 135, 52);
    px(data, 10, 10, 70, 135, 52); px(data, 11, 11, 70, 135, 52);
    // Лепестки
    for (const [x, y] of [[8, 4], [7, 5], [9, 5], [8, 6], [6, 5], [10, 5], [8, 5]]) {
      px(data, x, y, 214 + (rng() * 30 | 0), 52, 58);
    }
    px(data, 8, 5, 250, 220, 90);
  },
  [T.FLOWER_YELLOW](data, rng) {
    for (let y = 15; y >= 8; y--) {
      const v = (rng() - 0.5) * 14;
      px(data, 8, y, 62 + v, 122 + v, 46 + v);
    }
    px(data, 9, 12, 70, 135, 52); px(data, 10, 13, 70, 135, 52);
    px(data, 7, 11, 70, 135, 52);
    for (const [x, y] of [[8, 5], [7, 6], [9, 6], [8, 7], [6, 6], [10, 6]]) {
      px(data, x, y, 236 + (rng() * 18 | 0), 205, 60);
    }
    px(data, 8, 6, 255, 235, 120);
  },
  [T.FERN](data, rng) {
    // Дуговые вайи с «листиками» по бокам
    for (let f = 0; f < 4; f++) {
      const lean = f < 2 ? -1 : 1;
      const x0 = 8 + lean * (1 + (f % 2) * 2);
      for (let i = 0; i < 9; i++) {
        const x = x0 + lean * (((i * 0.55) | 0));
        const y = 15 - i * 1.4;
        const v = (rng() - 0.5) * 22;
        px(data, x, (y | 0), 66 + v, 128 + v, 48 + v);
        if (i % 2 === 1 && i > 1) {
          px(data, x - 1, (y | 0), 58 + v, 112 + v, 42 + v);
          px(data, x + 1, (y | 0), 58 + v, 112 + v, 42 + v);
        }
      }
    }
  },
  [T.CLOVER](data, rng) {
    // Стебель и три округлых листика
    for (let y = 15; y >= 9; y--) px(data, 8, y, 64, 126, 48);
    px(data, 9, 11, 58, 115, 44);
    for (const [cx, cy] of [[5, 6], [8, 4], [11, 6]]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 1 && dy === -1) continue;
          const v = (rng() - 0.5) * 18;
          px(data, cx + dx, cy + dy, 82 + v, 158 + v, 58 + v);
        }
      }
    }
  },
  // Верстак: крышка с сеткой и инструментами
  [T.TABLE_TOP](data, rng) {
    painters[T.PLANKS](data, rng);
    // Тёмная рамка и внутренняя сетка (как рабочая поверхность)
    for (let i = 0; i < TILE; i++) {
      px(data, i, 0, 74, 52, 30);
      px(data, i, TILE - 1, 74, 52, 30);
      px(data, 0, i, 74, 52, 30);
      px(data, TILE - 1, i, 74, 52, 30);
    }
    for (let i = 1; i < TILE - 1; i++) {
      if (i % 5 === 0) {
        for (let j = 1; j < TILE - 1; j++) px(data, i, j, 118, 88, 52);
      }
    }
    // Инструменты на крышке: пила (светлая) и молоток (тёмный)
    for (let x = 3; x <= 9; x++) px(data, x, 3, 190, 190, 198);
    for (let y = 3; y <= 6; y++) px(data, 9, y, 190, 190, 198);
    for (let x = 10; x <= 13; x++) px(data, x, 12, 96, 96, 104);
    for (let y = 9; y <= 12; y++) px(data, 12, y, 150, 118, 70);
  },
  [T.TABLE_SIDE](data, rng) {
    painters[T.PLANKS](data, rng);
    // Верхняя кромка и вертикальные стойки
    for (let x = 0; x < TILE; x++) {
      px(data, x, 0, 150, 116, 68);
      px(data, x, 1, 108, 80, 46);
      px(data, x, 2, 88, 64, 38);
    }
    for (let y = 3; y < TILE; y++) {
      px(data, 2, y, 96, 70, 42);
      px(data, 13, y, 96, 70, 42);
    }
    // Полка с инструментом
    for (let x = 3; x < 13; x++) px(data, x, 8, 84, 60, 36);
    for (let y = 4; y <= 7; y++) px(data, 6, y, 176, 176, 184);
    for (let y = 5; y <= 7; y++) px(data, 9, y, 124, 92, 52);
  },

// ---- Руды и камни ----
  // Уголь: мелкие тёмно-серые точки, близкие по тону к камню (не контрастные)
  [T.COAL_ORE](data, rng) { painters[T.STONE](data, rng); softOreSpecks(data, rng, [84, 82, 82], 10); softOreSpecks(data, rng, [64, 62, 62], 6); },
  [T.IRON_ORE](data, rng) { painters[T.STONE](data, rng); oreBlobs(data, rng, [196, 150, 118], 7); },
  [T.GOLD_ORE](data, rng) { painters[T.STONE](data, rng); oreBlobs(data, rng, [232, 196, 76], 6); },
  [T.DIAMOND_ORE](data, rng) { painters[T.STONE](data, rng); oreBlobs(data, rng, [110, 226, 226], 6); },
  [T.GRAVEL](data, rng) {
    noisyFill(data, rng, [124, 118, 112], 18);
    for (let i = 0; i < 22; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      const v = (rng() - 0.5) * 30;
      px(data, x, y, 100 + v, 94 + v, 88 + v);
      if (rng() < 0.5) px(data, (x + 1) % TILE, y, 146 + v, 140 + v, 134 + v);
    }
  },
  [T.SANDSTONE](data, rng) {
    noisyFill(data, rng, [220, 206, 152], 10);
    for (const by of [3, 8, 13]) {
      for (let x = 0; x < TILE; x++) {
        const v = (rng() - 0.5) * 14;
        px(data, x, by, 198 + v, 182 + v, 128 + v);
        px(data, x, by + 1, 206 + v, 190 + v, 136 + v);
      }
    }
  },
  [T.ICE](data, rng) {
    noisyFill(data, rng, [172, 208, 236], 10);
    for (let i = 0; i < 10; i++) {
      let x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      for (let k = 0; k < 4 + rng() * 5; k++) {
        px(data, x, y, 210, 234, 250);
        x = (x + (rng() < 0.5 ? 1 : 0)) % TILE;
        y = (y - 1 + TILE) % TILE;
      }
    }
  },
  [T.MOSSY](data, rng) {
    painters[T.COBBLE](data, rng);
    for (let i = 0; i < 60; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      if (rng() < 0.75) {
        const v = (rng() - 0.5) * 26;
        px(data, x, y, 74 + v, 122 + v, 58 + v);
      }
    }
  },
  // ---- Деревья разных пород ----
  // Берёза: светлая кора с частыми вертикальными волокнами и характерными
  // тёмными чёрточками-«чечевичками», которые идут горизонтальными штрихами.
  [T.BIRCH_SIDE](data, rng) {
    // Настоящая кора берёзы: гладкий кремово-белый ствол с лёгкими
    // горизонтальными полосами, тёмными чёрточками-чечевицами и
    // парой грубых тёмных заплаток. Никакой вертикальной рябь.
    const bands = [];
    for (let y = 0; y < TILE; y++) bands.push((rng() - 0.5) * 7);
    for (let y = 0; y < TILE; y++) {
      // полосы чуть тянутся вверх: среднее с соседней строкой
      const b = (bands[y] + bands[(y + 1) % TILE]) / 2;
      for (let x = 0; x < TILE; x++) {
        const v = (rng() - 0.5) * 5 + b;
        px(data, x, y, 232 + v, 228 + v, 216 + v);
      }
    }
    // Широкие тёмные заплатки (как у старой берёзы): рваные горизонтальные
    // пятна угольного цвета с неровными краями
    const patches = 2 + ((rng() * 2) | 0);
    for (let i = 0; i < patches; i++) {
      const py = 1 + ((rng() * (TILE - 3)) | 0);
      const px0 = (rng() * TILE) | 0;
      const w = 4 + ((rng() * 5) | 0);
      const h = 2 + ((rng() * 2) | 0);
      for (let yy = 0; yy < h; yy++) {
        for (let k = -1; k <= w; k++) {
          const xx = (px0 + k + TILE) % TILE;
          const edge = k < 0 || k >= w || rng() < 0.25;
          const v = (rng() - 0.5) * 12;
          if (edge && rng() < 0.5) continue;
          px(data, xx, py + yy, (edge ? 92 : 52) + v, (edge ? 86 : 47) + v, (edge ? 78 : 42) + v);
        }
      }
    }
    // Чечевицы: короткие горизонтальные тёмные чёрточки со светлой кромкой
    const dashes = 8 + ((rng() * 5) | 0);
    for (let i = 0; i < dashes; i++) {
      const y = 1 + ((rng() * (TILE - 2)) | 0);
      const x = (rng() * (TILE - 6)) | 0;
      const w = 2 + ((rng() * 4) | 0);
      for (let k = 0; k < w; k++) {
        const edge = k === 0 || k === w - 1;
        const v = edge ? 40 : 0;
        px(data, x + k, y, 46 + v, 42 + v, 38 + v);
      }
      if (rng() < 0.7) px(data, x + 1 + ((rng() * Math.max(1, w - 2)) | 0), y - 1, 246, 243, 234);
    }
  },
  [T.BIRCH_TOP](data, rng) {
    noisyFill(data, rng, [214, 205, 183], 7);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 7.0) {
          // кора по краю спила
          const v = (rng() - 0.5) * 10;
          px(data, x, y, 228 + v, 225 + v, 215 + v);
        } else if (((d * 1.7) | 0) % 2 === 0) {
          const v = (rng() - 0.5) * 12;
          px(data, x, y, 178 + v, 164 + v, 134 + v);
        } else {
          const v = (rng() - 0.5) * 10;
          px(data, x, y, 206 + v, 192 + v, 162 + v);
        }
      }
    }
    // тёмная сердцевина
    px(data, 7, 7, 128, 108, 78); px(data, 8, 7, 128, 108, 78);
    px(data, 7, 8, 142, 120, 88); px(data, 8, 8, 142, 120, 88);
  },
  [T.BIRCH_LEAVES](data, rng) { leavesFill(data, rng, [124, 178, 84], 0.15); },
  [T.SPRUCE_SIDE](data, rng) {
    noisyFill(data, rng, [72, 52, 34], 10);
    for (let x = 0; x < TILE; x++) {
      if (rng() < 0.4) {
        const v = (rng() - 0.5) * 14;
        for (let y = 0; y < TILE; y++) px(data, x, y, 52 + v, 36 + v, 22 + v);
      }
    }
  },
  [T.SPRUCE_TOP](data, rng) {
    noisyFill(data, rng, [128, 96, 62], 8);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (((d * 1.5) | 0) % 2 === 0) {
          const v = (rng() - 0.5) * 10;
          px(data, x, y, 96 + v, 70 + v, 44 + v);
        }
      }
    }
  },
  [T.SPRUCE_LEAVES](data, rng) { leavesFill(data, rng, [58, 108, 72], 0.16); },
  // ---- Кактус, верстак, обсидиан ----
  [T.CACTUS_SIDE](data, rng) {
    noisyFill(data, rng, [78, 142, 68], 10);
    for (const x of [1, 5, 10, 14]) {
      for (let y = 0; y < TILE; y++) {
        const v = (rng() - 0.5) * 12;
        px(data, x, y, 54 + v, 112 + v, 48 + v);
      }
    }
    for (let i = 0; i < 16; i++) px(data, (rng() * TILE) | 0, (rng() * TILE) | 0, 226, 232, 210);
  },
  [T.CACTUS_TOP](data, rng) {
    noisyFill(data, rng, [86, 150, 74], 10);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d > 5.5) px(data, x, y, 58, 116, 50);
        if (d < 3) px(data, x, y, 112, 178, 92);
      }
    }
  },
  [T.OBSIDIAN](data, rng) {
    noisyFill(data, rng, [26, 22, 38], 8);
    for (let i = 0; i < 14; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      const v = (rng() - 0.5) * 20;
      px(data, x, y, 62 + v, 44 + v, 108 + v);
    }
    for (let i = 0; i < 6; i++) px(data, (rng() * TILE) | 0, (rng() * TILE) | 0, 128, 112, 190);
  },
  [T.FURNACE_TOP](data, rng) {
    noisyFill(data, rng, [106, 106, 105], 10);
    for (const k of [2, 13]) {
      for (let j = 1; j < 15; j++) {
        px(data, k, j, 65, 65, 68); px(data, j, k, 65, 65, 68);
      }
    }
  },
  [T.FURNACE_SIDE](data, rng) {
    noisyFill(data, rng, [114, 108, 102], 12);
    for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) px(data, x, y, 70, 68, 66);
  },
  [T.FURNACE_FRONT](data, rng) {
    painters[T.FURNACE_SIDE](data, rng);
    for (let y = 5; y < 13; y++) for (let x = 3; x < 13; x++) {
      const rim = x === 3 || x === 12 || y === 5 || y === 12;
      px(data, x, y, ...(rim ? [185, 173, 145] : y > 8 ? [35, 33, 37] : [19, 21, 25]));
    }
    for (const [x, y] of [[7, 9], [8, 8], [9, 10], [6, 11], [9, 11]]) px(data, x, y, 246, 137, 43);
  },
  [T.TORCH](data, rng) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(data, x, y, 0, 0, 0, 0);
    for (let y = 6; y < 16; y++) for (let x = 7; x <= 8; x++) px(data, x, y, 135, 83, 41);
    for (let y = 2; y <= 7; y++) {
      const w = y > 4 ? 2 : 1;
      for (let x = 8 - w; x <= 8 + w; x++) px(data, x, y, 255, y > 4 ? 168 : 223, 70);
    }
    px(data, 8, 1, 255, 245, 151); px(data, 8, 4, 255, 248, 160);
  },
  [T.LEAVES_DENSE](data) { denseLeaves(data, T.LEAVES); },
  [T.BIRCH_LEAVES_DENSE](data) { denseLeaves(data, T.BIRCH_LEAVES); },
  [T.SPRUCE_LEAVES_DENSE](data) { denseLeaves(data, T.SPRUCE_LEAVES); },
  // ---- Сундук: доски, тёмная окантовка, крышка и железная защёлка ----
  [T.CHEST_TOP](data, rng) {
    chestWood(data, rng);
    for (let i = 0; i < TILE; i++) {
      for (const k of [0, 15]) { px(data, i, k, 74, 46, 20); px(data, k, i, 74, 46, 20); }
    }
  },
  [T.CHEST_SIDE](data, rng) {
    chestWood(data, rng);
    for (let i = 0; i < TILE; i++) {
      for (const k of [0, 15]) { px(data, i, k, 74, 46, 20); px(data, k, i, 74, 46, 20); }
      px(data, i, 5, 62, 38, 16);          // щель между крышкой и корпусом
      px(data, i, 6, 92, 58, 26);
    }
  },
  [T.CHEST_FRONT](data, rng) {
    painters[T.CHEST_SIDE](data, rng);
    for (let y = 4; y <= 8; y++) {
      for (let x = 6; x <= 9; x++) {
        const rim = x === 6 || x === 9 || y === 4 || y === 8;
        px(data, x, y, ...(rim ? [58, 58, 64] : [196, 198, 206]));
      }
    }
    px(data, 7, 7, 40, 40, 44); px(data, 8, 7, 40, 40, 44);
  },
  // ---- Берёзовые доски: светлые, с ровными плашками и тонкой фаской ----
  [T.BIRCH_PLANKS](data, rng) {
    noisyFill(data, rng, [214, 200, 164], 8);
    for (let y = 0; y < TILE; y += 4) {
      // тёмный шов между плашками
      for (let x = 0; x < TILE; x++) px(data, x, y, 158, 140, 104);
      // светлая фаска сразу под швом
      for (let x = 0; x < TILE; x++) {
        const v = (rng() - 0.5) * 8;
        px(data, x, y + 1, 228 + v, 216 + v, 184 + v);
      }
      // волокна древесины внутри плашки
      for (let x = 0; x < TILE; x++) {
        if (rng() < 0.28) {
          const v = (rng() - 0.5) * 12;
          px(data, x, y + 2 + ((rng() * 2) | 0), 190 + v, 174 + v, 138 + v);
        }
      }
      // торец плашки (вертикальный стык) со смещением в каждом ряду
      const xk = ((y / 4) | 0) % 2 === 0 ? 5 + ((rng() * 3) | 0) : 10 + ((rng() * 3) | 0);
      for (let y2 = y + 1; y2 < y + 4; y2++) px(data, xk, y2, 168, 150, 114);
    }
  },
  // ---- Забор: текстура столбика (светлое дерево с волокнами и фаской) ----
  [T.FENCE](data, rng) {
    noisyFill(data, rng, [156, 116, 68], 9);
    for (let y = 0; y < TILE; y++) {
      // вертикальные волокна
      for (const x of [1, 4, 7, 11, 14]) {
        if (rng() < 0.55) {
          const v = (rng() - 0.5) * 16;
          px(data, x, y, 126 + v, 92 + v, 52 + v);
        }
      }
      // тёмные кромки столбика и светлая фаска
      px(data, 0, y, 92, 66, 36);
      px(data, 1, y, 122, 90, 50);
      px(data, TILE - 1, y, 84, 60, 32);
      px(data, TILE - 2, y, 112, 82, 46);
    }
    // горизонтальные прожилки и шляпки гвоздей
    for (let x = 2; x < TILE - 2; x++) px(data, x, 3, 132, 98, 56);
    for (let x = 2; x < TILE - 2; x++) px(data, x, 12, 132, 98, 56);
    px(data, 7, 6, 74, 74, 80); px(data, 8, 6, 168, 170, 178);
    px(data, 7, 9, 74, 74, 80); px(data, 8, 9, 168, 170, 178);
  },
  // ---- Наковальня: тёмная сталь с потёртостями ----
  [T.ANVIL_TOP](data, rng) {
    noisyFill(data, rng, [74, 76, 84], 8);
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const edge = x < 2 || y < 2 || x > 13 || y > 13;
        if (edge) {
          const v = (rng() - 0.5) * 10;
          px(data, x, y, 46 + v, 48 + v, 54 + v);
        } else if (rng() < 0.12) {
          px(data, x, y, 128, 132, 142);      // блики отполированной стали
        }
      }
    }
    // следы ударов
    for (let i = 0; i < 8; i++) {
      const x = 4 + ((rng() * 8) | 0), y = 4 + ((rng() * 8) | 0);
      px(data, x, y, 40, 42, 48);
      px(data, x + 1, y + 1, 104, 108, 118);
    }
    // ржавые потёки по краям
    for (let i = 0; i < 10; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 116, 74, 44);
    }
  },
  [T.ANVIL_SIDE](data, rng) {
    noisyFill(data, rng, [58, 60, 68], 7);
    for (let x = 0; x < TILE; x++) {
      px(data, x, 0, 96, 99, 108);            // светлая верхняя кромка
      px(data, x, 1, 78, 80, 88);
      px(data, x, TILE - 1, 30, 31, 36);      // тёмное основание
      px(data, x, TILE - 2, 38, 40, 46);
    }
    for (let i = 0; i < 14; i++) {
      const x = (rng() * TILE) | 0, y = 3 + ((rng() * 9) | 0);
      px(data, x, y, 108, 70, 42);            // ржавчина
    }
    for (let i = 0; i < 10; i++) {
      const x = (rng() * TILE) | 0, y = 3 + ((rng() * 9) | 0);
      px(data, x, y, 92, 95, 104);            // потёртости
    }
  },
  [T.ANVIL_FRONT](data, rng) {
    painters[T.ANVIL_SIDE](data, rng);
    // силуэт наковальни: рог слева, массивная середина, сужение к основанию
    for (let y = 3; y <= 12; y++) {
      for (let x = 1; x <= 14; x++) {
        const horn = y >= 5 && y <= 8 && x <= 4;
        const body = x >= 4 && x <= 13 && y >= 3 && y <= 9;
        const waist = x >= 6 && x <= 11 && y >= 9 && y <= 10;
        const foot = x >= 3 && x <= 13 && y >= 11;
        if (!(horn || body || waist || foot)) continue;
        const rim = !((x > 4 && x < 13) && (y > 3 && y < 9));
        const v = (rng() - 0.5) * 10;
        px(data, x, y, ...(rim ? [88 + v, 90 + v, 98 + v] : [52 + v, 54 + v, 61 + v]));
      }
    }
    px(data, 2, 6, 122, 126, 134); px(data, 3, 6, 122, 126, 134);   // блик на роге
  },
  // ---- Заснеженный песок: песчаная сторона со снежной коркой сверху ----
  [T.SAND_SNOW_SIDE](data, rng) {
    painters[T.SAND](data, rng);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + ((rng() * 3) | 0);
      for (let y = 0; y < h; y++) {
        const v = (rng() - 0.5) * 10;
        // Рваная снежная кромка: местами сползает на песок язычками
        const edge = y === h - 1 && rng() < 0.55;
        px(data, x, y, edge ? 214 : 240 + v, edge ? 220 : 245 + v, edge ? 214 : 250 + v);
      }
    }
  },
  // ---- Пещерная лиана: тонкие свисающие плети с листиками ----
  [T.VINE](data, rng) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(data, x, y, 0, 0, 0, 0);
    for (let s = 0; s < 4; s++) {
      let x = 2 + ((rng() * 12) | 0);
      const len = 9 + ((rng() * 7) | 0);
      for (let i = 0; i < len; i++) {
        const y = i;
        if (rng() < 0.22) x += rng() < 0.5 ? -1 : 1;   // плеть слегка вьётся
        x = Math.max(0, Math.min(TILE - 1, x));
        const v = (rng() - 0.5) * 24;
        px(data, x, y, 58 + v, 104 + v, 52 + v);
        // листики по бокам плети
        if (rng() < 0.45) {
          const side = rng() < 0.5 ? -1 : 1;
          const lx = Math.max(0, Math.min(TILE - 1, x + side));
          px(data, lx, y, 72 + v, 126 + v, 58 + v);
        }
      }
    }
  },
  // ---- Светящийся пещерный гриб: ножка и бирюзовая светящаяся шляпка ----
  [T.GLOW_SHROOM](data, rng) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(data, x, y, 0, 0, 0, 0);
    // ножка
    for (let y = 8; y <= 15; y++) {
      const w = y > 12 ? 2 : 1;
      for (let x = 8 - w; x <= 7 + w; x++) {
        const v = (rng() - 0.5) * 14;
        px(data, x, y, 196 + v, 224 + v, 214 + v);
      }
    }
    // шляпка: округлая, светится бирюзой
    for (let y = 3; y <= 8; y++) {
      const half = 5 - Math.abs(5.5 - y) * 0.9;
      for (let x = Math.round(8 - half); x <= Math.round(7 + half); x++) {
        const v = (rng() - 0.5) * 20;
        const rim = y <= 4 || x <= Math.round(8 - half) + 0 || x >= Math.round(7 + half);
        px(data, x, y, ...(rim ? [96 + v, 210 + v, 186 + v] : [150 + v, 246 + v, 220 + v]));
      }
    }
    // блики и «споры» света
    for (const [x, y] of [[6, 5], [9, 6], [11, 5], [7, 7], [10, 4]]) px(data, x, y, 226, 255, 244);
    // маленький грибочек рядом
    for (let y = 11; y <= 15; y++) px(data, 3, y, 176, 208, 198);
    for (let y = 9; y <= 11; y++) for (let x = 2; x <= 4; x++) px(data, x, y, 120, 226, 200);
  },
  // ---- Забор: столбик. Узкие грани берут среднюю четверть тайла (пиксели 6–9),
  // поэтому «брусок» нарисован именно там, а вокруг — однородное дерево.
  [T.FENCE_POST](data, rng) {
    for (let x = 0; x < TILE; x++) {
      const shade = x < 2 || x > TILE - 3 ? -26 : (x < 4 || x > TILE - 5 ? -10 : 0);
      const base = [168 + shade, 126 + shade, 76 + shade];
      for (let y = 0; y < TILE; y++) {
        const v = (rng() - 0.5) * 12;
        px(data, x, y, base[0] + v, base[1] + v, base[2] + v);
      }
    }
    // светлые волокна вдоль бруска
    for (let i = 0; i < 20; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0, len = 3 + ((rng() * 6) | 0);
      for (let k = 0; k < len; k++) px(data, x, y + k, 190, 148, 94);
    }
    // смоляные точки и тёмные сучки
    for (let i = 0; i < 9; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 106, 74, 42);
    }
    // грани бруска: тёмная кромка слева, светлая фаска и тень справа
    for (let y = 0; y < TILE; y++) {
      px(data, 6, y, 108, 78, 44);
      px(data, 7, y, 196, 154, 98);
      px(data, 8, y, 176, 134, 84);
      px(data, 9, y, 118, 84, 48);
      if (y % 7 === 3) { px(data, 7, y, 150, 110, 64); px(data, 8, y, 140, 102, 60); }
    }
  },
  // ---- Забор: перекладина. Волокно идёт вдоль доски, поэтому любая полоса
  // тайла выглядит как настоящий брусок.
  [T.FENCE_RAIL](data, rng) {
    for (let y = 0; y < TILE; y++) {
      // доска из трёх реек: у каждой свой оттенок и тёмный стык
      const row = y < 5 ? 0 : y < 10 ? 1 : 2;
      const shade = row === 0 ? 6 : row === 1 ? 0 : -10;
      for (let x = 0; x < TILE; x++) {
        const seam = y === 5 || y === 10 || y === 0 || y === TILE - 1 ? -30 : 0;
        const v = (rng() - 0.5) * 12 + seam;
        px(data, x, y, 172 + shade + v, 130 + shade + v, 80 + shade + v);
      }
    }
    for (let i = 0; i < 26; i++) {
      const y = (rng() * TILE) | 0, x = (rng() * TILE) | 0, len = 3 + ((rng() * 6) | 0);
      for (let k = 0; k < len; k++) px(data, x + k, y, 194, 152, 98);
    }
    for (let i = 0; i < 6; i++) {
      const x = (rng() * TILE) | 0, y = (rng() * TILE) | 0;
      px(data, x, y, 112, 80, 46);
    }
  },
};

function chestWood(data, rng) {
  noisyFill(data, rng, [158, 106, 52], 12);
  for (let y = 3; y < TILE; y += 4) {
    for (let x = 0; x < TILE; x++) {
      const v = (rng() - 0.5) * 10;
      px(data, x, y, 118 + v, 76 + v, 34 + v);
    }
  }
}

// Плотная версия листвы: те же пиксели, просветы закрыты тёмной зеленью
function denseLeaves(data, source) {
  painters[source](data, makeRng(1000 + source * 77));
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  }
  r /= n || 1; g /= n || 1; b /= n || 1;
  const rng = makeRng(4242 + source);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      const v = 0.52 + rng() * 0.14;
      data[i] = r * v; data[i + 1] = g * v; data[i + 2] = b * v;
    } else {
      data[i] *= 0.86; data[i + 1] *= 0.86; data[i + 2] *= 0.86;
    }
    data[i + 3] = 255;
  }
}

// Растущие трещины: чем выше стадия, тем гуще сетка
function drawCracks(data, rng, stage) {
  const segments = 2 + stage * 4;
  for (let s = 0; s < segments; s++) {
    let x = (rng() * TILE) | 0;
    let y = (rng() * TILE) | 0;
    const len = 2 + ((rng() * (2 + stage * 2)) | 0);
    const dx = rng() < 0.5 ? 1 : -1;
    const dy = rng() < 0.5 ? 1 : -1;
    for (let i = 0; i < len; i++) {
      px(data, x, y, 30, 24, 20, 225);
      if (rng() < 0.75) x += dx;
      if (rng() < 0.75) y += dy;
      x = (x + TILE) % TILE;
      y = (y + TILE) % TILE;
    }
    if (stage >= 2) px(data, x, y, 30, 24, 20, 225);
  }
}

const tileColors = {};

// Тайлы-источники света не затемняются: они должны выглядеть яркими.
const EMISSIVE_TILES = new Set([T.GLOW, T.TORCH, T.FURNACE_FRONT, T.GLOW_SHROOM]);
// Общий множитель яркости атласа: текстуры чуть темнее «мультяшных»,
// ближе к реальному освещению (просили больше реализма).
export const ATLAS_DARKEN = 0.86;

function darkenTile(data, idx) {
  const f = EMISSIVE_TILES.has(idx) ? 0.985 : ATLAS_DARKEN;
  if (f >= 1) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.round(data[i] * f);
    data[i + 1] = Math.round(data[i + 1] * f);
    data[i + 2] = Math.round(data[i + 2] * f);
  }
}

/**
 * Пиксели одного тайла без канваса (RGBA). Нужны тестам и предпросмотру:
 * цвет тайла можно проверить в node, где document недоступен.
 */
export function tilePixels(idx, darken = true) {
  const data = new Uint8ClampedArray(TILE * TILE * 4);
  // Сид по номеру тайла — стабильный вид между запусками
  const rng = makeRng(1000 + idx * 77);
  if (painters[idx]) painters[idx](data, rng);
  if (darken) darkenTile(data, idx);
  return data;
}

export function buildAtlas(darken = true) {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext('2d');

  for (const key of Object.keys(painters)) {
    const idx = Number(key);
    const px = tilePixels(idx, darken);
    const img = ctx.createImageData(TILE, TILE);
    img.data.set(px);
    const tx = (idx % ATLAS_COLS) * TILE;
    const ty = ((idx / ATLAS_COLS) | 0) * TILE;
    ctx.putImageData(img, tx, ty);

    // Средний цвет тайла — для частиц и иконок
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 200) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
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
export function atlasCanvas() {
  if (!_atlasCanvas) _atlasCanvas = buildAtlas();
  return _atlasCanvas;
}
const buildAtlasOnce = atlasCanvas;

// Отдельный канвас одного тайла (для оверлея трещин)
export function tileCanvas(idx) {
  const atlas = buildAtlasOnce();
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const ctx = c.getContext('2d');
  const sx = (idx % ATLAS_COLS) * TILE;
  const sy = ((idx / ATLAS_COLS) | 0) * TILE;
  ctx.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
  return c;
}

// Текстура одного тайла (NearestFilter, с прозрачностью)
export function tileTexture(THREE, idx) {
  const tex = new THREE.CanvasTexture(tileCanvas(idx));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
