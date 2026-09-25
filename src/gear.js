// Снаряжение игрока: предметы, которые не являются блоками (лук, стрелы).
// Иконки рисуются пиксель-артом на канвасе 16×16 и масштабируются без сглаживания.

export const ITEM = { BOW: 'bow', ARROW: 'arrow' };

export const ITEM_NAMES = {
  ru: { bow: 'Лук', arrow: 'Стрела' },
  en: { bow: 'Bow', arrow: 'Arrow' },
};

export const ITEM_ICON_TILE = 16;

const C = {
  wood: '#8b5a2b',
  woodDark: '#5f3d1c',
  woodLight: '#b07c42',
  string: '#ececef',
  shaft: '#c39a63',
  head: '#d9dde6',
  feather: '#e0574c',
};

function px(ctx, x, y, color, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Лук: дуга, открытая вправо, тетива и наложенная стрела
function paintBow(ctx) {
  const arc = [[4, 11], [3, 10], [3, 9], [3, 8], [3, 7], [3, 6], [3, 5], [4, 4]];
  for (const [x, y] of arc) px(ctx, x, y, C.wood, 2, 2);
  // Рукоять чуть темнее
  px(ctx, 3, 7, C.woodDark, 2, 2);
  // Блики на дуге
  px(ctx, 2, 8, C.woodLight, 1, 2);
  px(ctx, 5, 4, C.woodLight, 1, 1);
  px(ctx, 5, 12, C.woodLight, 1, 1);
  // Тетива
  px(ctx, 6, 4, C.string, 1, 9);
  // Стрела: древко, наконечник, оперение
  px(ctx, 6, 8, C.shaft, 6, 1);
  px(ctx, 12, 7, C.head, 1, 3);
  px(ctx, 13, 8, C.head, 1, 1);
  px(ctx, 7, 7, C.feather, 1, 1);
  px(ctx, 7, 9, C.feather, 1, 1);
}

// Отдельная стрела (диагональ снизу-слева вверх-вправо)
function paintArrow(ctx) {
  for (let i = 0; i < 8; i++) px(ctx, 4 + i, 12 - i, C.shaft, 1, 1);
  for (let i = 0; i < 8; i++) px(ctx, 4 + i, 13 - i, C.woodDark, 1, 1);
  px(ctx, 12, 4, C.head, 1, 1);
  px(ctx, 13, 3, C.head, 1, 1);
  px(ctx, 12, 3, C.head, 1, 1);
  px(ctx, 13, 4, C.head, 1, 1);
  // Оперение у пятки
  px(ctx, 2, 12, C.feather, 1, 1);
  px(ctx, 3, 13, C.feather, 1, 1);
}

const painters = { bow: paintBow, arrow: paintArrow };

/** Иконка предмета для HTML-интерфейса (масштабированный пиксель-арт) */
export function itemIcon(name, size = 44) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const src = document.createElement('canvas');
  src.width = ITEM_ICON_TILE;
  src.height = ITEM_ICON_TILE;
  const sctx = src.getContext('2d');
  (painters[name] || paintArrow)(sctx);
  ctx.drawImage(src, 0, 0, ITEM_ICON_TILE, ITEM_ICON_TILE, 0, 0, size, size);
  return c;
}
