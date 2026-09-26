// Пистолет: описание модели из коробок. Ствол смотрит вперёд (−Z в системе
// модели), начало координат — на уровне затвора, рукоять уходит вниз.
// Данные вынесены из main.js: модель собирается из этого списка, поэтому её
// форму можно проверить тестом и отрисовать без браузера.
//
// Поля детали: w/h/d — размеры, x/y/z — смещение центра, color — цвет,
// rotX/rotY/rotZ — повороты (рад), emissive — не темнеет без света (огни прицела).

// Палитра
const METAL = 0x8d97a3;      // затвор: оружейная сталь
const METAL_D = 0x59616c;    // тёмный металл (ствол, накладки затвора)
const BLACK = 0x2a2e34;      // почти чёрный (мелкие детали, мушка)
const POLY = 0x333a42;       // полимер рамки
const POLY_D = 0x1c2026;     // тёмный полимер (пазы, насечки)
const WOOD = 0x6b4a2b;       // деревянные щёчки рукояти
const WOOD_D = 0x503720;     // тёмное дерево
const TRITIUM = 0x9fff8a;    // светящиеся точки прицела
const SKIN = 0xd9a27a;       // кожа кисти — тот же тон, что у руки игрока в main.js
const SKIN_D = 0xc98f63;     // затенённые фаланги и ладонь

export const PISTOL_PARTS = [
  // ---- Кисть, сжимающая рукоять (часть модели: рука и пистолет — одно целое) ----
  // Ладонь обхватывает рукоять сзади, пальцы ложатся спереди, большой палец — сбоку.
  // Так пистолет держится в ладони, а не «висит у локтя»: кисть всегда там, где рукоять.
  { name: 'palmSkin', w: 0.115, h: 0.14, d: 0.125, color: SKIN, x: 0.004, y: -0.212, z: 0.183, rotX: -0.16 },
  { name: 'palmKnuckle', w: 0.1, h: 0.05, d: 0.11, color: SKIN_D, y: -0.128, z: 0.176, rotX: -0.16 },
  { name: 'finger0', w: 0.098, h: 0.036, d: 0.086, color: SKIN_D, y: -0.152, z: 0.062, rotX: -0.16 },
  { name: 'finger1', w: 0.098, h: 0.036, d: 0.086, color: SKIN, y: -0.192, z: 0.058, rotX: -0.16 },
  { name: 'finger2', w: 0.098, h: 0.036, d: 0.086, color: SKIN_D, y: -0.232, z: 0.054, rotX: -0.16 },
  { name: 'finger3', w: 0.098, h: 0.036, d: 0.086, color: SKIN, y: -0.268, z: 0.05, rotX: -0.16 },
  { name: 'thumb', w: 0.036, h: 0.05, d: 0.1, color: SKIN, x: -0.052, y: -0.14, z: 0.108, rotX: -0.16, rotZ: 0.18 },
  { name: 'wrist', w: 0.105, h: 0.08, d: 0.1, color: SKIN_D, y: -0.3, z: 0.215 },
  // Предплечье уходит назад-вниз, за кадр: рука не «обрублена» у кисти
  { name: 'forearm1', w: 0.12, h: 0.12, d: 0.26, color: SKIN_D, x: 0.004, y: -0.36, z: 0.36, rotX: 0.3 },
  { name: 'forearm2', w: 0.135, h: 0.135, d: 0.32, color: SKIN_D, x: 0.008, y: -0.48, z: 0.6, rotX: 0.42 },
  { name: 'sleeve', w: 0.15, h: 0.15, d: 0.3, color: 0x4a6f9c, x: 0.012, y: -0.62, z: 0.86, rotX: 0.5 },
  // ---- Затвор и ствол ----
  // сам затвор: прямоугольный кожух, ходящий по рамке
  { name: 'slide', w: 0.085, h: 0.078, d: 0.30, color: METAL, y: 0.024, z: -0.06 },
  // верхнее ребро затвора с канавкой между прицелами
  { name: 'slideRib', w: 0.03, h: 0.012, d: 0.29, color: METAL_D, y: 0.068, z: -0.058 },
  // окно выброса гильз — тёмная выемка на правой щеке затвора
  { name: 'ejectPort', w: 0.014, h: 0.026, d: 0.07, color: BLACK, x: 0.038, y: 0.036, z: -0.03 },
  // задние насечки затвора (по три с каждой стороны) — за них цепляются при взводе
  { name: 'serrL1', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: -0.0455, y: 0.022, z: 0.058 },
  { name: 'serrL2', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: -0.0455, y: 0.022, z: 0.078 },
  { name: 'serrL3', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: -0.0455, y: 0.022, z: 0.098 },
  { name: 'serrR1', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: 0.0455, y: 0.022, z: 0.058 },
  { name: 'serrR2', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: 0.0455, y: 0.022, z: 0.078 },
  { name: 'serrR3', w: 0.006, h: 0.05, d: 0.013, color: POLY_D, x: 0.0455, y: 0.022, z: 0.098 },
  // ствол, выступающий из затвора
  { name: 'barrel', w: 0.042, h: 0.042, d: 0.09, color: METAL_D, y: 0.014, z: -0.245 },
  // дульный срез — самая передняя деталь; отверстие канала ствола
  { name: 'muzzle', w: 0.026, h: 0.026, d: 0.02, color: 0x11141a, y: 0.014, z: -0.305 },
  // направляющий стержень возвратной пружины под стволом
  { name: 'guideRod', w: 0.016, h: 0.016, d: 0.06, color: BLACK, y: -0.006, z: -0.235 },

  // ---- Прицел: мушка, целик из двух стоек и светящиеся точки (тритий) ----
  { name: 'frontSight', w: 0.02, h: 0.024, d: 0.02, color: BLACK, y: 0.086, z: -0.185 },
  { name: 'frontDot', w: 0.008, h: 0.008, d: 0.006, color: TRITIUM, y: 0.088, z: -0.172, emissive: true },
  { name: 'rearSightBase', w: 0.05, h: 0.012, d: 0.024, color: BLACK, y: 0.074, z: 0.076 },
  { name: 'rearSightL', w: 0.014, h: 0.024, d: 0.018, color: BLACK, x: -0.017, y: 0.09, z: 0.076 },
  { name: 'rearSightR', w: 0.014, h: 0.024, d: 0.018, color: BLACK, x: 0.017, y: 0.09, z: 0.076 },
  { name: 'rearDotL', w: 0.007, h: 0.007, d: 0.006, color: TRITIUM, x: -0.017, y: 0.09, z: 0.088, emissive: true },
  { name: 'rearDotR', w: 0.007, h: 0.007, d: 0.006, color: TRITIUM, x: 0.017, y: 0.09, z: 0.088, emissive: true },

  // ---- Рамка (полимер) ----
  { name: 'frame', w: 0.078, h: 0.048, d: 0.30, color: POLY, y: -0.032, z: -0.04 },
  // Затыльник (передняя/задняя стойка рукояти): закрывает стык рамки и рукояти,
  // иначе между ними сквозила щель насквозь — «дырка» в модели в прицеле.
  { name: 'backStrap', w: 0.06, h: 0.062, d: 0.13, color: POLY, y: -0.056, z: 0.115, rotX: -0.16 },
  // Крепления спусковой скобы к рамке: без них между рамкой и скобой был просвет
  { name: 'guardMountFront', w: 0.05, h: 0.058, d: 0.034, color: POLY, y: -0.074, z: -0.047 },
  { name: 'guardMountRear', w: 0.05, h: 0.058, d: 0.034, color: POLY, y: -0.078, z: 0.055 },
  // Колодец спуска: продолжает рамку вниз до самого спуска, закрывая стык
  { name: 'triggerHousing', w: 0.042, h: 0.034, d: 0.05, color: POLY_D, y: -0.072, z: 0.004 },
  // крышка рамки под стволом и планка Пикатинни с прорезями
  { name: 'dustCover', w: 0.068, h: 0.02, d: 0.13, color: POLY, y: -0.062, z: -0.13 },
  { name: 'railBase', w: 0.05, h: 0.014, d: 0.12, color: POLY_D, y: -0.079, z: -0.13 },
  { name: 'railSlot1', w: 0.052, h: 0.008, d: 0.012, color: 0x0c0e12, y: -0.079, z: -0.105 },
  { name: 'railSlot2', w: 0.052, h: 0.008, d: 0.012, color: 0x0c0e12, y: -0.079, z: -0.13 },
  { name: 'railSlot3', w: 0.052, h: 0.008, d: 0.012, color: 0x0c0e12, y: -0.079, z: -0.155 },

  // ---- Спусковой механизм ----
  { name: 'trigger', w: 0.018, h: 0.06, d: 0.016, color: BLACK, y: -0.098, z: 0.004, rotX: -0.14 },
  { name: 'guardFront', w: 0.02, h: 0.058, d: 0.016, color: POLY, y: -0.112, z: -0.05, rotX: 0.18 },
  { name: 'guardBottom', w: 0.02, h: 0.016, d: 0.115, color: POLY, y: -0.141, z: 0.006 },
  { name: 'guardRear', w: 0.02, h: 0.05, d: 0.016, color: POLY, y: -0.118, z: 0.06, rotX: -0.32 },

  // ---- Органы управления и казённая часть ----
  { name: 'hammer', w: 0.024, h: 0.045, d: 0.026, color: BLACK, y: 0.06, z: 0.112, rotX: 0.28 },
  { name: 'beavertail', w: 0.056, h: 0.03, d: 0.05, color: POLY, y: -0.012, z: 0.125 },
  { name: 'slideStop', w: 0.012, h: 0.018, d: 0.05, color: BLACK, x: -0.044, y: -0.008, z: 0.02 },
  { name: 'safety', w: 0.012, h: 0.016, d: 0.042, color: BLACK, x: -0.044, y: 0.014, z: 0.072 },
  { name: 'magRelease', w: 0.014, h: 0.024, d: 0.024, color: BLACK, x: -0.046, y: -0.072, z: 0.05 },

  // ---- Рукоять: сердечник, щёчки, магазин ----
  { name: 'grip', w: 0.072, h: 0.21, d: 0.088, color: POLY, y: -0.175, z: 0.115, rotX: -0.16 },
  { name: 'gripBack', w: 0.03, h: 0.2, d: 0.028, color: BLACK, y: -0.178, z: 0.158, rotX: -0.16 },
  // деревянные щёчки с винтами
  { name: 'gripPanelL', w: 0.014, h: 0.17, d: 0.075, color: WOOD, x: -0.041, y: -0.178, z: 0.116, rotX: -0.16 },
  { name: 'gripPanelR', w: 0.014, h: 0.17, d: 0.075, color: WOOD, x: 0.041, y: -0.178, z: 0.116, rotX: -0.16 },
  { name: 'gripScrewL', w: 0.008, h: 0.02, d: 0.02, color: METAL_D, x: -0.051, y: -0.158, z: 0.11, rotX: -0.16 },
  { name: 'gripScrewR', w: 0.008, h: 0.02, d: 0.02, color: METAL_D, x: 0.051, y: -0.158, z: 0.11, rotX: -0.16 },
  // горловина магазина и подошва-пятка магазина
  { name: 'magWell', w: 0.066, h: 0.02, d: 0.08, color: BLACK, y: -0.272, z: 0.136, rotX: -0.16 },
  { name: 'magBase', w: 0.078, h: 0.026, d: 0.1, color: WOOD_D, y: -0.29, z: 0.14, rotX: -0.16 },
];

// Кисть (ладонь и пальцы) в модели всегда: она сжимает рукоять и в прицеле
// видна у нижнего края экрана, как и положено.
export const PISTOL_HAND_PARTS = [
  'palmSkin', 'palmKnuckle', 'finger0', 'finger1', 'finger2', 'finger3', 'thumb',
];
// Предплечье и рукав: в прицел пистолет уходит вперёд, рука остаётся за
// камерой — в прицельной позе эта группа прячется, иначе её обрезки
// рисовались бы поверх прицела.
export const PISTOL_ARM_PARTS = ['wrist', 'forearm1', 'forearm2', 'sleeve'];

// ---------------------------------------------------------------- поза в руке
// Модель маленькая, поэтому в руке её увеличивают; точка хвата — середина
// рукояти, там её сжимает кисть.
export const PISTOL_VIEW_SCALE = 0.8;
export const PISTOL_GRIP_POINT = { x: 0, y: -0.228, z: 0.128 };

// Куда встаёт точка хвата в системе руки: у бедра и в прицеле.
// Координаты — в системе руки (та же, где лежит кисть руки игрока).
const HOLD_HIP = { x: 0.008, y: 0.012, z: -0.215 };
// В прицеле ствол встаёт на ось взгляда: целик и мушка сходятся ровно в
// центре экрана (смещение подобрано по проекции точек прицела).
const HOLD_ADS = { x: 0, y: -0.188, z: -0.258 };

// Поворот модели: ствол смотрит вперёд и чуть внутрь — привычный наклон
// пистолета «у бедра»; в прицеле ствол строго по оси взгляда.
const ROT_HIP = { rx: 0.05, ry: 0.34, rz: 0.1 };
const ROT_ADS = { rx: 0, ry: 0, rz: 0 };

// Кватернион из углов в порядке three.js (rx·ry·rz), чтобы поза совпадала
// с тем, как её применяет Object3D.rotation в игре.
function eulerQuat({ rx, ry, rz }) {
  const cx = Math.cos(rx / 2), sx = Math.sin(rx / 2);
  const cy = Math.cos(ry / 2), sy = Math.sin(ry / 2);
  const cz = Math.cos(rz / 2), sz = Math.sin(rz / 2);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function rotateVec(q, v) {
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y);
  const ty = 2 * (z * v.x - x * v.z);
  const tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx),
  };
}

/**
 * Поза модели так, чтобы точка хвата рукояти оказалась в заданной точке руки
 * (там, где сжимается кулак). Возвращает { px, py, pz, rx, ry, rz }.
 */
export function gripPose(rot, hold, scale = PISTOL_VIEW_SCALE) {
  const q = eulerQuat(rot);
  const g = rotateVec(q, {
    x: PISTOL_GRIP_POINT.x * scale,
    y: PISTOL_GRIP_POINT.y * scale,
    z: PISTOL_GRIP_POINT.z * scale,
  });
  return {
    px: +(hold.x - g.x).toFixed(4),
    py: +(hold.y - g.y).toFixed(4),
    pz: +(hold.z - g.z).toFixed(4),
    rx: rot.rx, ry: rot.ry, rz: rot.rz,
  };
}

// Где рука держит пистолет (точка хвата в системе руки) — эти точки задают
// и позу модели, и проверки тестов.
export const PISTOL_HOLD = { hip: HOLD_HIP, ads: HOLD_ADS };

// Поза «у бедра»: пистолет в руке на вытянутой руке (кисть — дальний конец руки)
export const GUN_POSE_HIP = gripPose(ROT_HIP, HOLD_HIP);
// Поза прицеливания: ствол по центру экрана, мушка и целик на оси взгляда
export const GUN_POSE_ADS = gripPose(ROT_ADS, HOLD_ADS);

// Огонёк у дула: компактное пламя вместо вспышки-звезды. Белое горячее ядро
// у среза ствола, оранжевое тело и тёмный кончик, пара боковых язычков —
// на пару кадров после выстрела это читается как маленький огонь из ствола.
export const PISTOL_FLASH_Z = -0.318;
const FIRE_CORE = 0xfff3c0;   // ядро — раскалённое, почти белое
const FIRE_MID = 0xff9d2e;    // тело пламени — оранжевое
const FIRE_TIP = 0xd84315;    // кончик — тёмный багрянец
export const PISTOL_FLASH_PARTS = [
  { name: 'flameCore', w: 0.052, h: 0.052, d: 0.085, color: FIRE_CORE, x: 0, y: 0, z: -0.028 },
  { name: 'flameBody', w: 0.038, h: 0.038, d: 0.075, color: FIRE_MID, x: 0, y: 0.004, z: -0.082 },
  { name: 'flameTip', w: 0.022, h: 0.022, d: 0.055, color: FIRE_TIP, x: 0, y: 0.008, z: -0.128 },
  { name: 'flameLickL', w: 0.016, h: 0.016, d: 0.06, color: FIRE_MID, x: -0.028, y: 0.014, z: -0.07 },
  { name: 'flameLickR', w: 0.016, h: 0.016, d: 0.06, color: FIRE_MID, x: 0.026, y: -0.01, z: -0.078 },
];

// Баллистика пистолета (используется и в main.js, и в тестах)
export const PISTOL_STATS = {
  damage: 5,        // урон пули; у лука 1–6 в зависимости от натяжения
  speed: 62,        // м/с — пуля летит почти прямо
  gravity: 4,       // слабое падение, чтобы дальние выстрелы требовали поправки
  cooldown: 0.36,   // пауза между выстрелами
  spread: 0.014,    // разброс направления от бедра (в прицеле — вчетверо точнее)
  magSizeHint: 8,   // сколько патронов даёт один крафт (для подсказок в UI)
  adsFovFactor: 0.56,   // доля поля зрения в прицеле (0.56 ≈ зум ×1.8)
  adsMoveFactor: 0.55,  // замедление шага при прицеливании
};
