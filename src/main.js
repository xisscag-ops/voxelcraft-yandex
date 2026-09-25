// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, isSolid, isDecor, isTorch, isChest, isVariantBlock, wallTorchSide, WALL_TORCH_BY_SIDE, CHEST_BY_FRONT } from './blocks.js';
import { ITEM, blockItem, blockIdOf, blockDropItem, breakTime, itemDamage, itemName, placeBlockId, isBlockItem, itemDef, foodValue } from './items.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { craft, needsTable } from './crafts.js';
import { Furnace, serializeFurnaces, deserializeFurnaces } from './furnace.js';
import { createChest, serializeChests, deserializeChests } from './chest.js';
import { InventoryUI, setFullToast } from './inventory-ui.js';
import { itemIconCanvas, spritePixels } from './icons.js';
import { buildAtlas, tileColor, tileTexture, CRACK_TILES } from './textures.js';
import { World } from './world.js';
import { migrateSave } from './save-migration.js';
import { meshChunk, TORCH_LIGHT_RADIUS } from './mesher.js';
import { MobManager } from './mobs.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { ItemDrops, XpOrbs } from './items.js';
import { Arrows, buildArrowModel, arrowMaterials } from './projectiles.js';
import { Eating } from './eating.js';
import { Sky } from './sky.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { I18n } from './i18n.js';
import { Ysdk } from './ysdk.js';
import { updateRunShake } from './camera-effects.js';
import { createWorldRecord, emptyWorldProfile, normalizeWorldProfile, serializeWorldProfile } from './world-store.js';

// ---------------------------------------------------------------- Инициализация
const i18n = new I18n('ru');
const ui = new UI(i18n);
const sfx = new Sfx();
const input = new Input();
const ysdk = new Ysdk();
const invUI = new InventoryUI(i18n);

const settings = {
  volume: 0.8,
  sound: true,
  lang: 'ru',
  viewDistance: CONFIG.VIEW_DISTANCE,
  fullscreen: true,               // просить полный экран и захватывать клавиши
  paletteUnlocked: false,
};

let state = 'loading';           // loading | menu | game | pause | inventory
let world = null;
let player = null;
let mode = 'creative';           // 'survival' | 'creative'
let difficulty = 'normal';       // 'peaceful' | 'easy' | 'normal' | 'hard'
let inventory = new Inventory(CONFIG.INV_SIZE);
let furnaceStates = new Map(); // координаты печи -> сохранённая плавильная камера
let chestStates = new Map();   // координаты сундука -> содержимое (Inventory на 27 ячеек)
let hotbarIndex = 0;
let saveData = null;
let worldProfile = emptyWorldProfile();
let activeWorldRecord = null;
let sessionStart = 0;
let interstitialShown = 0;
let debugVisible = false;
let tableClosedT = 0;            // когда закрыли верстак (защита от повторного открытия)

function isCreative() { return mode === 'creative'; }
function isSurvival() { return mode === 'survival'; }

// ---------------------------------------------------------------- Рендер
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
camera.rotation.order = 'YXZ';

// Объёмный факел: прямоугольная рукоять из брусков, два слоя пламени,
// мягкий ореол и локальная лампа. Модель одна — и для пола, и для стены.
const torchStemGeo = new THREE.BoxGeometry(0.11, 0.56, 0.11);
const torchCollarGeo = new THREE.BoxGeometry(0.15, 0.09, 0.15);
const torchOuterFlameGeo = new THREE.BoxGeometry(0.18, 0.22, 0.18);
const torchInnerFlameGeo = new THREE.BoxGeometry(0.1, 0.13, 0.1);
const torchStemMat = new THREE.MeshBasicMaterial({ color: 0x744925 });
const torchCollarMat = new THREE.MeshBasicMaterial({ color: 0xb8763a });
const torchOuterFlameMat = new THREE.MeshBasicMaterial({ color: 0xff701b });
const torchInnerFlameMat = new THREE.MeshBasicMaterial({ color: 0xffe17a });
const torchGlowCanvas = document.createElement('canvas');
torchGlowCanvas.width = torchGlowCanvas.height = 64;
const glowCtx = torchGlowCanvas.getContext('2d');
const glowGradient = glowCtx.createRadialGradient(32, 32, 2, 32, 32, 32);
glowGradient.addColorStop(0, 'rgba(255, 239, 170, 0.95)');
glowGradient.addColorStop(0.22, 'rgba(255, 151, 45, 0.6)');
glowGradient.addColorStop(1, 'rgba(255, 110, 20, 0)');
glowCtx.fillStyle = glowGradient;
glowCtx.fillRect(0, 0, 64, 64);
const torchGlowTexture = new THREE.CanvasTexture(torchGlowCanvas);
torchGlowTexture.colorSpace = THREE.SRGBColorSpace;
const torchGlowMat = new THREE.SpriteMaterial({
  map: torchGlowTexture, color: 0xffa542, transparent: true, opacity: 0.62,
  depthWrite: false, blending: THREE.AdditiveBlending,
});
const heldTorchStemMat = new THREE.MeshBasicMaterial({ color: 0x744925, transparent: true, depthTest: false, depthWrite: false });
const heldTorchCollarMat = new THREE.MeshBasicMaterial({ color: 0xb8763a, transparent: true, depthTest: false, depthWrite: false });
const heldTorchOuterMat = new THREE.MeshBasicMaterial({ color: 0xff701b, transparent: true, depthTest: false, depthWrite: false });
const heldTorchInnerMat = new THREE.MeshBasicMaterial({ color: 0xffe17a, transparent: true, depthTest: false, depthWrite: false });
const heldTorchGlowMat = torchGlowMat.clone();
heldTorchGlowMat.depthTest = false;
heldTorchGlowMat.depthWrite = false;
for (const material of [heldTorchStemMat, heldTorchCollarMat, heldTorchOuterMat, heldTorchInnerMat, heldTorchGlowMat]) {
  material.userData.emissive = true;
}
// Материалы факела для мира и для выпавшего предмета (глубина как у обычных блоков)
const worldTorchMats = {
  stem: torchStemMat, collar: torchCollarMat, outer: torchOuterFlameMat, inner: torchInnerFlameMat,
};
const heldTorchMats = {
  stem: heldTorchStemMat, collar: heldTorchCollarMat, outer: heldTorchOuterMat, inner: heldTorchInnerMat,
};
const torchChunkGroups = new Map();

// Направление настенного факела: канонический вид — стена справа (+X)
const WALL_TORCH_YAW = { px: 0, nx: Math.PI, pz: -Math.PI / 2, nz: Math.PI / 2 };

/**
 * Собирает модель факела: прямоугольная рукоять, обмотка, пламя и ореол.
 * Начало координат — основание рукояти, высота модели ~0.84 блока.
 */
function buildTorchModel(mats, glowMat, withLight = true) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(torchStemGeo, mats.stem);
  stem.position.y = 0.29;
  const collar = new THREE.Mesh(torchCollarGeo, mats.collar);
  collar.position.y = 0.6;
  const flame = new THREE.Group();
  flame.position.y = 0.65;
  const outer = new THREE.Mesh(torchOuterFlameGeo, mats.outer);
  outer.position.y = 0.1;
  const inner = new THREE.Mesh(torchInnerFlameGeo, mats.inner);
  inner.position.y = 0.12;
  flame.add(outer, inner);
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = 0.75;
  glow.scale.set(1.15, 1.15, 1);
  group.add(stem, collar, flame, glow);
  let light = null;
  if (withLight) {
    light = new THREE.PointLight(0xffa347, 1.15, 8.5, 2);
    light.position.y = 0.78;
    group.add(light);
  }
  return { group, flame, glow, light };
}

const atlasCanvas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

const terrainMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
// Факел в руке светит так же, как поставленный: та же формула яркости, что и
// запечённый в вершины свет факела (см. torchBrightness в mesher.js), но считается
// в шейдере от позиции игрока — свет едет вместе с ним.
const heldLightUniforms = {
  uHeldLightPos: { value: new THREE.Vector3() },
  uHeldLight: { value: 0 },
  uHeldLightRadius: { value: TORCH_LIGHT_RADIUS },
};
function addHeldLight(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, heldLightUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float torchLight;
varying float vTorchLight;
varying vec3 vHeldWorldPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTorchLight = torchLight;
vHeldWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vTorchLight;
varying vec3 vHeldWorldPos;
uniform vec3 uHeldLightPos;
uniform float uHeldLight;
uniform float uHeldLightRadius;`)
      // Итоговая освещённость = max(небо × оттенок времени суток, факелы).
      // Факелы (поставленные — из вершин, в руке — по расстоянию) не зависят
      // от времени суток: ночью светят так же, днём не пересвечивают.
      .replace('#include <color_fragment>', `#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
  float torchL = vTorchLight;
  if (uHeldLight > 0.0) {
    float heldD = distance(vHeldWorldPos, uHeldLightPos);
    float heldF = clamp(1.0 - heldD / uHeldLightRadius, 0.0, 1.0);
    vec3 heldN = normalize(cross(dFdx(vHeldWorldPos), dFdy(vHeldWorldPos)));
    float heldShade = heldN.y > 0.5 ? 1.0 : (heldN.y < -0.5 ? 0.5 : (abs(heldN.x) > 0.5 ? 0.72 : 0.88));
    torchL = max(torchL, heldF * heldF * heldShade * uHeldLight);
  }
  vec3 skyL = diffuse * vColor.rgb;
  vec3 lightL = max(skyL, torchL * vec3(1.0, 0.93, 0.82));
  diffuseColor.rgb = diffuseColor.rgb / max(diffuse, vec3(0.001)) * lightL;
#endif`);
  };
}
addHeldLight(terrainMat);
const waterMat = new THREE.MeshBasicMaterial({
  map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72,
  depthWrite: false, side: THREE.DoubleSide,
});
addHeldLight(waterMat);

const sky = new Sky(THREE, scene);
sky.viewDistance = settings.viewDistance;
const particles = new Particles(THREE, scene);
const mobManager = new MobManager(scene, null);
const weather = new Weather(THREE, scene);
const items = new ItemDrops(scene, {
  tileMaterial: (idx) => dropTileMaterial(idx),
  iconMaterial: (key) => dropIconMaterial(key),
  modelFor: (key) => (isBlockItem(key) && isTorch(blockIdOf(key))
    ? buildDropTorchModel()
    : null),
});
const xpOrbs = new XpOrbs(scene);
let totalXp = 0;
const projectiles = new Arrows(scene);
let bowCharge = 0;               // 0..1 — натяжение тетивы
let bowCharging = false;
let bowKick = 0;                 // отдача лука после выстрела
const BOW_CHARGE_TIME = 0.85;    // полное натяжение за 0.85 с

// Еда: держим ЛКМ с едой в руке — персонаж жуёт (см. src/eating.js)
const eat = new Eating();
let eatFullT = 0;                // пауза между подсказками «ты сыт»

// Выживание
let attackCd = 0;
let shakeT = 0;                  // встряска камеры при уроне
let decorBreakCd = 0;            // пауза между мгновенными срывами растений
let zombieT = 6;
let zombieWarned = false;
// Звуки мобов с затуханием по расстоянию
mobManager.onSound = (kind, dist, type) => {
  const vol = 1 / (1 + dist * 0.35);
  if (kind === 'hurt') sfx.mobHurt(type);
  else if (kind === 'growl') sfx.zombieGroan(vol);
  else if (kind === 'hop') sfx.mobHop(vol);
  else if (kind === 'bleat') sfx.bleat(vol);
  else if (kind === 'chirp') sfx.chirp(vol);
  else if (kind === 'zombie') sfx.zombieAmbient(vol);
  else if (kind === 'die') sfx.mobDie();
  else if (kind === 'burn') sfx.burn();
  else if (kind === 'hiss') sfx.hiss();
  else if (kind === 'bark') sfx.bark(vol);
  else if (kind === 'fuse') sfx.fuse();
  else if (kind === 'flop') sfx.flop(vol);
  else if (kind === 'swim') sfx.swim(vol);
};

// Счётчик построенных блоков (лидерборд Яндекса)
let blocksBuilt = 0;
let cricketsT = 3;

// Контур выбранного блока
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
);
highlight.visible = false;
scene.add(highlight);

// ---------------------------------------------------------------- Рука (анимация удара)
scene.add(camera);
const hand = new THREE.Mesh(
  new THREE.BoxGeometry(0.16, 0.16, 0.55),
  new THREE.MeshBasicMaterial({ color: 0xd9a27a, transparent: true, opacity: 1, depthTest: false, depthWrite: false }),
);
hand.renderOrder = 999;
const handPivot = new THREE.Group();
handPivot.position.set(0.42, -0.36, -0.55);
hand.position.set(0, 0, -0.1);
handPivot.add(hand);
camera.add(handPivot);
handPivot.visible = false;
let handSwing = 0;       // 1 -> 0 во время взмаха
let handSwingPow = 1;
const HAND_SWING_TIME = 0.28;
function swingHand(power = 1) {
  if (handSwing > 0.35) return;
  handSwing = 1;
  handSwingPow = power;
}

// ---------------------------------------------------------------- Предмет в руке
// В руке показывается выбранный предмет: блок — объёмным кубиком с текстурой атласа,
// инструменты/палка/яблоко — плоской пиксель-арт иконкой.
const heldGroup = new THREE.Group();
heldGroup.renderOrder = 2000;
handPivot.add(heldGroup);
let heldKey = null;          // какой предмет сейчас в руке
let _tileMats = null;

function tileMaterial(idx) {
  if (!_tileMats) _tileMats = new Map();
  if (!_tileMats.has(idx)) {
    _tileMats.set(idx, new THREE.MeshBasicMaterial({
      map: tileTexture(THREE, idx),
      depthTest: false,
      depthWrite: false,
      // Оставляем в прозрачном render-pass: высокий renderOrder рисует блок поверх воды,
      // а alphaTest сохраняет непрозрачные пиксели текстуры без цветного наложения.
      transparent: true,
      opacity: 1,
      alphaTest: 0.5,
    }));
  }
  return _tileMats.get(idx);
}

const SPRITE_MATS = new Map();
function spriteMaterial(key) {
  if (!SPRITE_MATS.has(key)) {
    const canvas = itemIconCanvas(key, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    SPRITE_MATS.set(key, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 1, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return SPRITE_MATS.get(key);
}

// Материалы выпавших предметов: те же текстуры, но с обычной глубиной,
// чтобы предметы на земле прятались за блоками, а не рисовались поверх.
const DROP_TILE_MATS = new Map();
function dropTileMaterial(idx) {
  if (!DROP_TILE_MATS.has(idx)) {
    DROP_TILE_MATS.set(idx, new THREE.MeshBasicMaterial({
      map: tileTexture(THREE, idx),
      transparent: true,
      alphaTest: 0.5,
    }));
  }
  return DROP_TILE_MATS.get(idx);
}

const DROP_ICON_MATS = new Map();
function dropIconMaterial(key) {
  if (!DROP_ICON_MATS.has(key)) {
    const canvas = itemIconCanvas(key, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    DROP_ICON_MATS.set(key, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    }));
  }
  return DROP_ICON_MATS.get(key);
}

const heldGeo = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  quad: new THREE.PlaneGeometry(1, 1),
};

// Материалы объёмных моделей предметов (инструменты, палка, яблоко).
// Прозрачный render-pass с большим renderOrder рисует их после воды и мира.
const ITEM_MATS = new Map();
function itemMat(color) {
  const key = color >>> 0;
  if (!ITEM_MATS.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
    m.userData.baseColor = color;
    ITEM_MATS.set(key, m);
  }
  return ITEM_MATS.get(key);
}

const BOX_GEOS = new Map();
function boxGeo(w, h, d) {
  const key = `${w}|${h}|${d}`;
  if (!BOX_GEOS.has(key)) BOX_GEOS.set(key, new THREE.BoxGeometry(w, h, d));
  return BOX_GEOS.get(key);
}

function boxPart(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo(w, h, d), itemMat(color));
  m.position.set(x, y, z);
  return m;
}

const TOOL_WOOD = { handle: 0x8b5a2b, dark: 0x66431d, head: 0xb98a4a, edge: 0x8a6132, bind: 0x5d3c1a };
const TOOL_STONE = { handle: 0x8b5a2b, dark: 0x66431d, head: 0x9ba1a7, edge: 0x7b8187, bind: 0x5d3c1a };

/** Объёмная модель инструмента: рукоять, обмотка и голова (кирка/топор/меч) */
function buildToolModel(kind, tier) {
  const c = tier === 'stone' ? TOOL_STONE : TOOL_WOOD;
  const g = new THREE.Group();
  // Рукоять с обмоткой и навершием
  g.add(boxPart(0.062, 0.66, 0.062, c.handle, 0, -0.04, 0));
  g.add(boxPart(0.07, 0.09, 0.07, c.dark, 0, -0.2, 0));
  g.add(boxPart(0.078, 0.07, 0.078, c.dark, 0, -0.36, 0));
  if (kind === 'pickaxe') {
    // Изогнутая голова: центральный брусок и два «клюва» вниз
    g.add(boxPart(0.32, 0.085, 0.085, c.head, 0, 0.31, 0));
    for (const sx of [-1, 1]) {
      const tip = boxPart(0.17, 0.075, 0.075, c.edge, sx * 0.2, 0.25, 0);
      tip.rotation.z = sx * 0.6;
      g.add(tip);
      const point = boxPart(0.06, 0.06, 0.06, c.head, sx * 0.27, 0.18, 0);
      g.add(point);
    }
    g.add(boxPart(0.1, 0.13, 0.1, c.bind, 0, 0.25, 0));
  } else if (kind === 'axe') {
    // Полотно топора: широкая пластина и светлая режущая кромка
    g.add(boxPart(0.07, 0.3, 0.24, c.head, 0.12, 0.26, 0));
    g.add(boxPart(0.04, 0.32, 0.26, c.edge, 0.16, 0.26, 0));
    g.add(boxPart(0.12, 0.16, 0.11, c.bind, 0, 0.28, 0));
    g.add(boxPart(0.06, 0.1, 0.2, c.head, 0.06, 0.4, 0));
  } else if (kind === 'sword') {
    // Клинок с остриём, гарда, рукоять и навершие
    g.add(boxPart(0.085, 0.62, 0.025, c.head, 0, 0.44, 0));
    g.add(boxPart(0.055, 0.12, 0.025, c.edge, 0, 0.79, 0));
    g.add(boxPart(0.3, 0.07, 0.07, c.edge, 0, 0.13, 0));
    g.add(boxPart(0.07, 0.18, 0.07, c.handle, 0, 0.02, 0));
    g.add(boxPart(0.1, 0.08, 0.1, c.edge, 0, -0.09, 0));
  } else {
    // Палка — просто рукоять чуть длиннее
    g.add(boxPart(0.068, 0.78, 0.068, c.handle, 0, 0.02, 0));
  }
  return g;
}

// Объёмный пиксель-арт: картинка предмета из инвентаря, выдавленная в толщину
// (каждый пиксель — брусочек 1/16). Модель в руке выглядит так же, как иконка.
const EXTRUDED_GEOS = new Map();
const extrudedMat = new THREE.MeshBasicMaterial({
  vertexColors: true, transparent: true, opacity: 1, depthTest: false, depthWrite: false,
});
extrudedMat.userData.baseColor = 0xffffff;
const EXTRUDE_SHADE = { front: 1, back: 0.82, top: 0.95, bottom: 0.62, left: 0.78, right: 0.7 };

function extrudedGeometry(name) {
  if (EXTRUDED_GEOS.has(name)) return EXTRUDED_GEOS.get(name);
  const pixels = spritePixels(name);
  if (!pixels || !pixels.length) { EXTRUDED_GEOS.set(name, null); return null; }
  const filled = new Set(pixels.map((p) => p.x + ',' + p.y));
  const has = (x, y) => filled.has(x + ',' + y);
  const P = 1 / 16, D = P / 2;
  const pos = [], col = [], idx = [];
  const color = new THREE.Color();
  const quad = (a, b, c, d, shade) => {
    const base = pos.length / 3;
    for (const v of [a, b, c, d]) {
      pos.push(v[0], v[1], v[2]);
      col.push(color.r * shade, color.g * shade, color.b * shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const { x, y, color: css } of pixels) {
    color.set(css);
    const x0 = x * P - 0.5, x1 = x0 + P;
    const y1 = 0.5 - y * P, y0 = y1 - P;
    quad([x0, y0, D], [x1, y0, D], [x1, y1, D], [x0, y1, D], EXTRUDE_SHADE.front);
    quad([x1, y0, -D], [x0, y0, -D], [x0, y1, -D], [x1, y1, -D], EXTRUDE_SHADE.back);
    if (!has(x, y - 1)) quad([x0, y1, D], [x1, y1, D], [x1, y1, -D], [x0, y1, -D], EXTRUDE_SHADE.top);
    if (!has(x, y + 1)) quad([x0, y0, -D], [x1, y0, -D], [x1, y0, D], [x0, y0, D], EXTRUDE_SHADE.bottom);
    if (!has(x - 1, y)) quad([x0, y0, -D], [x0, y0, D], [x0, y1, D], [x0, y1, -D], EXTRUDE_SHADE.left);
    if (!has(x + 1, y)) quad([x1, y0, D], [x1, y0, -D], [x1, y1, -D], [x1, y1, D], EXTRUDE_SHADE.right);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // Точка хвата — низ рукояти (левый нижний угол картинки)
  geo.translate(0.22, 0.34, 0);
  geo.computeBoundingSphere();
  EXTRUDED_GEOS.set(name, geo);
  return geo;
}

/**
 * Предмет в руке из пиксель-арта иконки. Картинка повёрнута так, что рукоять
 * смотрит вниз в ладонь, а рабочая часть — вверх и к прицелу.
 */
function buildExtrudedItem(name) {
  const geo = extrudedGeometry(name);
  if (!geo) return null;
  const mesh = new THREE.Mesh(geo, extrudedMat);
  mesh.rotation.z = Math.PI / 4;          // диагональ картинки → вертикаль
  mesh.renderOrder = 2000;
  const g = new THREE.Group();
  g.add(mesh);
  g.scale.setScalar(0.55);
  g.rotation.set(-0.18, -0.62, 0.62);
  g.position.set(0.12, -0.25, -0.3);
  return g;
}

/** Объёмное яблоко: плод, черенок и листик */
function buildAppleModel() {
  const g = new THREE.Group();
  g.add(boxPart(0.3, 0.28, 0.3, 0xd64545, 0, 0, 0));
  g.add(boxPart(0.06, 0.12, 0.06, 0x6b4a2b, 0, 0.18, 0));
  const leaf = boxPart(0.14, 0.04, 0.08, 0x4e8f3a, 0.09, 0.2, 0);
  leaf.rotation.z = 0.35;
  g.add(leaf);
  return g;
}

function buildHeldTorchModel() {
  const { group } = buildTorchModel(heldTorchMats, heldTorchGlowMat, false);
  group.scale.setScalar(0.62);
  group.rotation.set(-0.2, -0.55, 0.72);
  group.position.set(0.05, -0.16, -0.32);
  group.traverse((object) => { if (object.isMesh || object.isSprite) object.renderOrder = 2000; });
  return group;
}

/** Маленький факел для выпавшего предмета: те же материалы, но без лампы */
function buildDropTorchModel() {
  const { group } = buildTorchModel(worldTorchMats, torchGlowMat, false);
  group.scale.setScalar(0.42);
  return group;
}

function buildHeldMesh(key) {
  const def = itemDef(key);
  if (!def) return null;
  let mesh;
  if (def.kind === 'block' && def.block === BLOCK.TORCH) {
    mesh = buildHeldTorchModel();
  } else if (def.kind === 'block') {
    const b = BLOCKS[def.block];
    const [top, bottom, side, front = side] = b.tiles;
    const mats = [
      tileMaterial(side), tileMaterial(side),
      tileMaterial(top), tileMaterial(bottom),
      tileMaterial(front), tileMaterial(side),
    ];
    mesh = new THREE.Mesh(heldGeo.cube, mats);
    mesh.scale.setScalar(0.24);
    mesh.rotation.set(0.25, -0.75, 0.12);
    mesh.position.set(0.02, -0.02, -0.32);
  } else if ((def.kind === 'tool' || def.icon === 'stick' || def.icon === 'arrow') && extrudedGeometry(def.icon)) {
    // Инструменты, палка и стрела — выдавленная иконка: в руке та же картинка, что в инвентаре
    mesh = buildExtrudedItem(def.icon);
  } else if (def.kind === 'tool') {
    mesh = buildToolModel(def.tool, def.tier);
    mesh.scale.setScalar(0.6);
    mesh.rotation.set(-0.22, -0.55, 0.72);
    mesh.position.set(0.05, -0.08, -0.32);
  } else if (def.icon === 'apple') {
    mesh = buildAppleModel();
    mesh.scale.setScalar(0.5);
    mesh.rotation.set(-0.1, -0.6, 0.35);
    mesh.position.set(0.05, -0.03, -0.32);
  } else {
    mesh = new THREE.Mesh(heldGeo.quad, spriteMaterial(key));
    mesh.scale.setScalar(0.34);
    mesh.rotation.set(-0.15, -0.45, 0.55);
    mesh.position.set(0.04, -0.02, -0.3);
    mesh.userData.isSprite = true;
  }
  mesh.renderOrder = 2000;
  return mesh;
}

function updateHeldItem() {
  const key = heldItem();
  if (key === heldKey) return;
  heldKey = key;
  for (const child of [...heldGroup.children]) heldGroup.remove(child);
  if (!key) return;
  // блоки в креативе бесконечны — в руке всё равно показываем кубик
  const mesh = buildHeldMesh(key);
  if (mesh) heldGroup.add(mesh);
}

// ---------------------------------------------------------------- Лук в руке (вид от первого лица) — детальный и крупный
// Дуга из 10 сегментов, утолщённая рукоять, обмотка, выемки под тетиву, рука обхватывает лук
const BOW_TIP = 0.32;
const BOW_ANG = 1.12;
const bowPivot = new THREE.Group();
const bowMats = {
  wood: bowMaterial(0x8b5a2b),
  woodDark: bowMaterial(0x5a3816),
  woodLight: bowMaterial(0xa67c3a),
  string: bowMaterial(0xeef0f5),
  hand: bowMaterial(0xc98f63),
  wrap: bowMaterial(0x3a2a12),
};
function bowMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
  m.userData.baseColor = color;
  return m;
}
let bowStringUpper, bowStringLower;
{
  const R = 0.38, D = 0.20, SEG = 10;
  for (let i = 0; i < SEG; i++) {
    const a0 = -BOW_ANG + 2 * BOW_ANG * (i / SEG);
    const a1 = -BOW_ANG + 2 * BOW_ANG * ((i + 1) / SEG);
    const y0 = R * Math.sin(a0), z0 = D - R * Math.cos(a0);
    const y1 = R * Math.sin(a1), z1 = D - R * Math.cos(a1);
    const len = Math.hypot(y1 - y0, z1 - z0);
    const isGrip = i >= 4 && i <= 5;
    const isTip = i === 0 || i === SEG - 1;
    const w = isTip ? 0.022 : isGrip ? 0.034 : 0.028;
    const d = isGrip ? 0.042 : 0.038;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(w, len * 1.08, d),
      isGrip ? bowMats.wrap : (i % 2 === 0 ? bowMats.wood : bowMats.woodLight),
    );
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = (a0 + a1) / 2;
    bowPivot.add(seg);
    if (isTip) {
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 0.025), bowMats.wrap);
      notch.position.set(0, y0 > 0 ? BOW_TIP : -BOW_TIP, D - R * Math.cos(i === 0 ? -BOW_ANG : BOW_ANG) + 0.01);
      bowPivot.add(notch);
    }
  }
  // обмотка рукояти — дополнительные кольца
  for (let k = -1; k <= 1; k++) {
    const wrapRing = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.022, 0.046), bowMats.wrap);
    wrapRing.position.set(0, k * 0.045, D - R + 0.015);
    bowPivot.add(wrapRing);
  }
  const stringGeo = new THREE.BoxGeometry(0.013, 1, 0.013).translate(0, -0.5, 0);
  bowStringUpper = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringUpper.position.set(0, BOW_TIP, 0);
  bowStringLower = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringLower.position.set(0, -BOW_TIP, 0);
  bowStringLower.rotation.z = Math.PI;
  bowPivot.add(bowStringUpper, bowStringLower);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.14), bowMats.hand);
  fist.position.set(0.008, -0.02, D - R + 0.04);
  bowPivot.add(fist);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.08), bowMats.hand);
  thumb.position.set(0.02, 0.06, D - R + 0.06);
  thumb.rotation.z = 0.4;
  bowPivot.add(thumb);
}
bowPivot.scale.setScalar(1.28);
const nockedArrow = buildArrowModel(1.18, arrowMaterials());
nockedArrow.rotation.y = Math.PI;
nockedArrow.visible = false;
nockedArrow.traverse((o) => {
  if (o.isMesh) {
    o.material.transparent = true;
    o.material.opacity = 1;
    o.material.depthTest = false;
    o.material.depthWrite = false;
    o.material.needsUpdate = true;
  }
});
bowPivot.add(nockedArrow);
bowPivot.visible = false;
bowPivot.traverse((o) => { if (o.isMesh) o.renderOrder = 999; });
camera.add(bowPivot);
const nockedMats = nockedArrow.children.map((c) => c.material);

/** Выбран лук? В руке тогда показываем лук вместо предмета */
function isBowSelected() {
  return heldItem() === ITEM.BOW;
}

function poseBow(dt, light) {
  if (bowKick > 0) bowKick = Math.max(0, bowKick - dt / 0.16);
  const show = state === 'game' && isBowSelected();
  bowPivot.visible = show;
  if (!show) return;
  // Натяжение: тетива тянется назад, стрела едет вместе с ней
  const pull = 0.26 * bowCharge;
  const len = Math.hypot(BOW_TIP, pull);
  bowStringUpper.scale.y = len;
  bowStringLower.scale.y = len;
  bowStringUpper.rotation.x = -Math.atan2(pull, BOW_TIP);
  bowStringLower.rotation.x = Math.atan2(pull, BOW_TIP);
  nockedArrow.visible = bowCharge > 0.02;
  nockedArrow.position.set(0, 0, pull);

  const k = bowCharge;
  const kick = bowKick * bowKick;
  bowPivot.position.set(
    0.34 - 0.16 * k,
    -0.34 + 0.15 * k - 0.03 * kick,
    -0.6 + 0.05 * k + 0.1 * kick,
  );
  bowPivot.rotation.set(0.06 - 0.04 * k + 0.2 * kick, -0.34 + 0.26 * k, 0.12 - 0.1 * k);

  const lum = 0.35 + 0.65 * light;
  for (const m of [bowMats.wood, bowMats.woodDark, bowMats.string, bowMats.hand]) {
    m.color.setHex(m.userData.baseColor).multiplyScalar(lum);
  }
  const nockedBase = [0x9c7548, 0xd8dde6, 0xe0574c, 0xe0574c];
  nockedMats.forEach((m, i) => m.color.setHex(nockedBase[i] || 0xc0c0c0).multiplyScalar(lum));
}

/** Съедобный предмет в руке (или null) */
function heldFood() {
  const key = heldItem();
  return key && foodValue(key) > 0 ? key : null;
}

/** Доели: здоровье прибавляется, предмет исчезает из инвентаря */
function finishEat() {
  const key = heldFood();
  if (!key) return;
  const heal = foodValue(key);
  inventory.remove(key, 1);
  refreshHotbar();
  player.heal(heal);
  ui.setHealth(player.hp, player.maxHp);
  sfx.burp();
  ui.toast(i18n.t('eat_ok'), 1400);
}

function updateHand(dt, light) {
  handPivot.visible = state === 'game';
  heldGroup.visible = !!heldKey && !isBowSelected();
  if (handSwing > 0) handSwing = Math.max(0, handSwing - dt / HAND_SWING_TIME);
  const p = Math.sin((1 - handSwing) * Math.PI) * handSwingPow; // 0 -> 1 -> 0
  const moving = Math.abs(input.move.forward) + Math.abs(input.move.right) > 0.1;
  handBob += dt * (moving ? 9 : 1.5);
  const bob = moving ? 0.025 : 0.006;
  handPivot.rotation.set(-1.1 * p + 0.1, 0.35 * p, 0.4 * p);
  handPivot.position.set(
    0.42 - 0.18 * p + Math.cos(handBob) * bob,
    -0.36 + 0.08 * p - Math.abs(Math.sin(handBob)) * bob,
    -0.55 - 0.15 * p,
  );
  // Еда: пока держим кнопку, предмет подносится ко рту и покачивается в такт жеванию
  if (eat.raised > 0.001) {
    const k = eat.raised;
    const chew = Math.sin(eat.t * 16) * 0.5 + 0.5;
    handPivot.position.x += (-0.12 - handPivot.position.x) * k;
    handPivot.position.y += (-0.13 + 0.05 * chew - handPivot.position.y) * k;
    handPivot.position.z += (-0.42 - handPivot.position.z) * k;
    handPivot.rotation.x += (-0.62 - 0.18 * chew - handPivot.rotation.x) * k;
    handPivot.rotation.y += (0.16 - handPivot.rotation.y) * k;
    handPivot.rotation.z += (0.08 - handPivot.rotation.z) * k;
    heldGroup.scale.setScalar(1 + 0.05 * chew);
  } else {
    heldGroup.scale.setScalar(1);
  }
  hand.material.color.setHex(0xd9a27a).multiplyScalar(0.35 + 0.65 * light);
  poseBow(dt, light);
  // Приглушаем предмет в руке по уровню освещения (и меши, и вложенные группы)
  const k = 0.5 + 0.5 * light;
  const shadeMat = (m) => {
    if (m.userData.emissive) return;
    if (m.userData.baseColor == null) m.userData.baseColor = m.color.getHex();
    m.color.setHex(m.userData.baseColor).multiplyScalar(k);
  };
  heldGroup.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material.forEach(shadeMat);
    else if (o.material) shadeMat(o.material);
  });
}
let handBob = 0;
let runBob = 0;
const runShake = { duration: 0, strength: 0 };

// Трещины при ломании блока (5 стадий)
const crackMats = CRACK_TILES.map((t) => new THREE.MeshBasicMaterial({
  map: tileTexture(THREE, t),
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
}));
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.005, 1.005, 1.005), crackMats[0]);
crackMesh.visible = false;
scene.add(crackMesh);

function showCrack(hit, progress) {
  crackMesh.visible = true;
  crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  crackMesh.material = crackMats[Math.max(0, Math.min(4, Math.floor(progress * 5)))];
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- Чанки
let chunkQueue = [];
let lastPlayerChunk = null;

function rebuildQueue() {
  const pcx = Math.floor(player.pos.x / CONFIG.CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CONFIG.CHUNK_SIZE);
  const R = settings.viewDistance;
  chunkQueue = [];
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const c = world.chunks.get(world.key(cx, cz));
      if (!c || c.dirty || !c.meshOpaque) {
        chunkQueue.push({ cx, cz, d: dx * dx + dz * dz });
      }
    }
  }
  chunkQueue.sort((a, b) => a.d - b.d);
}

function processQueue(limit) {
  let done = 0;
  while (chunkQueue.length && done < limit) {
    const { cx, cz } = chunkQueue.shift();
    buildChunkMesh(cx, cz);
    done++;
  }
  // Выгрузка далёких чанков (правки остаются в world.edits)
  const pcx = Math.floor(player.pos.x / CONFIG.CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CONFIG.CHUNK_SIZE);
  const R = settings.viewDistance + 2;
  for (const [k, c] of world.chunks) {
    const dx = c.cx - pcx, dz = c.cz - pcz;
    if (dx * dx + dz * dz > R * R) {
      disposeChunkMeshes(c);
      world.chunks.delete(k);
    }
  }
}

function appendTorchVisual(root, wx, y, wz, side = null) {
  const { group, flame, glow, light } = buildTorchModel(worldTorchMats, torchGlowMat, true);
  if (side) {
    // Настенный вариант: рукоять выходит из стены и наклонена вверх
    const tilt = new THREE.Group();
    tilt.position.set(0.36, 0.42, 0);
    tilt.rotation.z = 1.05;
    tilt.add(group);
    const holder = new THREE.Group();
    holder.position.set(wx + 0.5, y, wz + 0.5);
    holder.rotation.y = WALL_TORCH_YAW[side] || 0;
    holder.add(tilt);
    root.add(holder);
  } else {
    group.position.set(wx + 0.5, y + 0.03, wz + 0.5);
    group.rotation.z = -0.06;
    root.add(group);
  }
  root.userData.torches.push({ flame, glow, light, phase: Math.random() * Math.PI * 2 });
}

function buildTorchVisuals(cx, cz, chunk) {
  const key = `${cx},${cz}`;
  const previous = torchChunkGroups.get(key);
  if (previous) scene.remove(previous);

  const root = new THREE.Group();
  root.userData.torches = [];
  const S = CONFIG.CHUNK_SIZE;
  const plane = S * S;
  for (let i = 0; i < chunk.blocks.length; i++) {
    const id = chunk.blocks[i];
    if (!BLOCKS[id]?.torch) continue;
    const x = i % S;
    const z = Math.floor(i / S) % S;
    const y = Math.floor(i / plane);
    const wx = cx * S + x, wz = cz * S + z;
    const side = BLOCKS[id].wallTorch ? (wallTorchSide(world, wx, y, wz, id) || 'px') : null;
    appendTorchVisual(root, wx, y, wz, side);
  }
  if (root.userData.torches.length) {
    scene.add(root);
    torchChunkGroups.set(key, root);
  } else {
    torchChunkGroups.delete(key);
  }
}

function updateTorchVisuals(dt) {
  for (const root of torchChunkGroups.values()) {
    for (const torch of root.userData.torches) {
      torch.phase += dt * 8;
      const flicker = 0.5 + 0.5 * Math.sin(torch.phase) * Math.cos(torch.phase * 0.43);
      torch.flame.rotation.z = Math.sin(torch.phase * 0.7) * 0.07;
      torch.flame.rotation.x = Math.cos(torch.phase * 0.53) * 0.05;
      torch.flame.scale.set(0.96 + flicker * 0.08, 0.92 + flicker * 0.16, 0.96 + flicker * 0.08);
      const glowScale = 1.05 + flicker * 0.28;
      torch.glow.scale.set(glowScale, glowScale, 1);
      torch.light.intensity = 0.85 + flicker * 0.55;
    }
  }
}

/** Факел в руке освещает мир вокруг игрока (с лёгким мерцанием, как у поставленного) */
function updateHeldLight(now) {
  const holding = !!(world && player && (state === 'game' || state === 'inventory')
    && heldKey && isBlockItem(heldKey) && isTorch(blockIdOf(heldKey)));
  const u = heldLightUniforms;
  if (!holding) { u.uHeldLight.value = 0; return; }
  const flicker = 0.5 + 0.5 * Math.sin(now * 0.008) * Math.cos(now * 0.0034);
  u.uHeldLight.value = 0.9 + 0.1 * flicker;
  const eye = player.eyePos();
  u.uHeldLightPos.value.set(eye.x, eye.y - 0.25, eye.z);
}

function buildChunkMesh(cx, cz) {
  const chunk = world.getChunk(cx, cz);
  const { opaque, water } = meshChunk(THREE, world, cx, cz);

  if (!chunk.meshOpaque) {
    chunk.meshOpaque = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    scene.add(chunk.meshOpaque);
  }
  if (!chunk.meshWater) {
    chunk.meshWater = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
    scene.add(chunk.meshWater);
  }

  chunk.meshOpaque.geometry.dispose();
  chunk.meshOpaque.geometry = opaque.isEmpty()
    ? new THREE.BufferGeometry()
    : opaque.toGeometry(THREE);

  chunk.meshWater.geometry.dispose();
  if (water.isEmpty()) {
    chunk.meshWater.geometry = new THREE.BufferGeometry();
    chunk.meshWater.visible = false;
  } else {
    chunk.meshWater.geometry = water.toGeometry(THREE);
    chunk.meshWater.visible = true;
  }
  buildTorchVisuals(cx, cz, chunk);
  chunk.dirty = false;
}

function disposeChunkMeshes(c) {
  if (c.meshOpaque) { scene.remove(c.meshOpaque); c.meshOpaque.geometry.dispose(); c.meshOpaque = null; }
  if (c.meshWater) { scene.remove(c.meshWater); c.meshWater.geometry.dispose(); c.meshWater = null; }
  const key = `${c.cx},${c.cz}`;
  const torchGroup = torchChunkGroups.get(key);
  if (torchGroup) { scene.remove(torchGroup); torchChunkGroups.delete(key); }
}

// ---------------------------------------------------------------- Инвентарь и хотбар
// Каталог креатива: все блоки (кроме воздуха и воды) и предметы
// Настенный факел получается сам при установке факела на стену — в каталоге он не нужен
const CATALOG_KEYS = [
  ...BLOCKS.filter((b) => b.id !== BLOCK.AIR && b.id !== BLOCK.WATER && !b.variant).map((b) => blockItem(b.id)),
  ITEM.STICK, ITEM.APPLE, ITEM.BOW, ITEM.ARROW,
  ITEM.WOOD_PICKAXE, ITEM.WOOD_AXE, ITEM.WOOD_SWORD, ITEM.STONE_PICKAXE, ITEM.STONE_AXE, ITEM.STONE_SWORD,
  ITEM.COAL, ITEM.RAW_IRON, ITEM.RAW_GOLD, ITEM.DIAMOND, ITEM.BREAD, ITEM.WHEAT, ITEM.IRON_INGOT, ITEM.GOLD_INGOT,
];

function catalogEntries() {
  const unlocked = settings.paletteUnlocked;
  // новые блоки (полублок, факел, печка) доступны сразу, остальной строительный набор — за рекламу
  const alwaysUnlocked = new Set([BLOCK.SLAB, BLOCK.TORCH, BLOCK.FURNACE, BLOCK.CHEST]);
  return CATALOG_KEYS.map((key) => ({
    key,
    locked: !unlocked && isBlockItem(key) && BUILDER_PALETTE.includes(blockIdOf(key)) && !alwaysUnlocked.has(blockIdOf(key)),
  }));
}

function heldItem() {
  const stack = inventory.get(hotbarIndex);
  return stack ? stack.key : null;
}

function refreshHotbar() {
  ui.buildHotbar(inventory.slots.slice(0, HOTBAR_SIZE), i18n.lang, { creative: isCreative() });
  ui.setHotbarSelection(hotbarIndex);
  ui.setApples(inventory.count(ITEM.APPLE), mode);
  ui.setArrows(arrowAmmo(), mode);
  updateHeldItem();
}

/** Выдать предмет в инвентарь; лишнее — не влезло */
function giveItem(key, n = 1, quiet = false) {
  const left = inventory.add(key, n);
  refreshHotbar();
  if (left > 0 && !quiet) ui.toast(i18n.t('inv_full'), 1600);
  return left;
}

function selectHotbar(i) {
  hotbarIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, i));
  ui.setHotbarSelection(hotbarIndex);
  updateHeldItem();
  if (invUI.isOpen()) {
    invUI.hotbarIndex = hotbarIndex;
    invUI.render();
  }
}

// ---------------------------------------------------------------- Действия
let breakTarget = null;    // {x,y,z}
let breakProgress = 0;
let breakQuick = false;    // быстрое ломание по тапу (тач-экран)
let breakDustT = 0;
let placeCooldown = 0;

function pickTarget() {
  const eye = player.eyePos();
  const d = player.lookDir();
  return raycastVoxel(world, eye.x, eye.y, eye.z, d.x, d.y, d.z, CONFIG.REACH);
}

// Ближайший моб под прицелом (включая птиц)
function findMobTarget() {
  const eye = player.eyePos();
  const d = player.lookDir();
  let bestT = CONFIG.REACH;
  let best = null;
  for (const m of mobManager.mobs) {
    if (!m.hittable()) continue;
    const cx = m.pos.x - eye.x, cy = m.pos.y + m.centerY() - eye.y, cz = m.pos.z - eye.z;
    const t = cx * d.x + cy * d.y + cz * d.z;
    if (t < 0.25 || t > bestT) continue;
    const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t;
    const r = m.hitRadius();
    if (px * px + py * py + pz * pz > r * r) continue;
    bestT = t;
    best = m;
  }
  return best;
}

// Удар по мобу: красная вспышка, отдача назад, писк и красные частицы
// Стрела попала в моба: урон по силе натяжения, отдача и звук
function onArrowHitMob(mob, arrow, dir) {
  const dmg = arrow.dmg || 2;
  const killed = mob.hurt(dmg);
  sfx.hitMob();
  particles.burst(mob.pos.x, mob.pos.y + mob.centerY(), mob.pos.z, 0xd03232, 12);
  mob.knockback(dir.x, dir.z, killed ? 4.4 : 3.4);
  if (!killed && (mob.type === 'bunny' || mob.type === 'sheep' || mob.type === 'fish')) {
    mob.fleeFrom(player.pos, 4);
  }
  // Птицы пугаются и улетают
  if (mob.type === 'bird') mob.heading = Math.atan2(mob.pos.x - player.pos.x, mob.pos.z - player.pos.z);
}

/** Сколько стрел доступно (в креативе — бесконечно) */
function arrowAmmo() {
  return isCreative() ? Infinity : inventory.count(ITEM.ARROW);
}

/** Выстрел из лука: сила и урон зависят от натяжения */
function fireBow(charge) {
  if (!isBowSelected()) return;
  if (arrowAmmo() <= 0) {
    ui.toast(i18n.t('no_arrows'), 1800);
    sfx.uiClick();
    return;
  }
  if (!isCreative()) {
    inventory.remove(ITEM.ARROW, 1);
    refreshHotbar();
  }
  ui.setArrows(arrowAmmo(), mode);
  const eye = player.eyePos();
  const d = player.lookDir();
  const power = 0.3 + 0.7 * charge;                   // сила натяжения 0.3..1
  const speed = 15 + 22 * power;                      // 21..37 м/с
  const dmg = 1 + Math.round(4.5 * charge);           // 1..6
  bowKick = 0.6 + 0.4 * charge;
  projectiles.shoot(
    eye.x + d.x * 0.6, eye.y + d.y * 0.6 - 0.1, eye.z + d.z * 0.6,
    d.x, d.y, d.z, speed, dmg,
    {
      onMob: onArrowHitMob,
      onBlock: () => sfx.arrowHitBlock(),
      onPickup: (n) => {
        if (isCreative()) return;                       // в креативе стрелы не тратятся
        inventory.add(ITEM.ARROW, n);
        refreshHotbar();
        ui.setArrows(arrowAmmo(), mode);
        sfx.arrowPickup();
      },
    },
  );
  sfx.bowShoot(power);
}

function hitMob(m) {
  const dmg = itemDamage(heldItem());
  swingHand(1);
  const killed = m.hurt(dmg);
  m.squeak();
  sfx.hitMob();
  particles.burst(m.pos.x, m.pos.y + m.centerY(), m.pos.z, 0xd03232, 12);
  const kx = m.pos.x - player.pos.x, kz = m.pos.z - player.pos.z;
  m.knockback(kx, kz, 4.2);
  // Зайцы и овцы убегают
  if (m.type === 'bunny' || m.type === 'sheep') m.fleeFrom(player.pos);
  if (killed && (m.type === 'bunny' || m.type === 'sheep')) {
    // С зайца/овцы падают яблоки — приятный бонус выживания
    if (Math.random() < 0.5) items.spawn(m.pos.x, m.pos.y + 0.6, m.pos.z, 'apple');
  }
}

// Трава, цветы, папоротник, клевер срываются мгновенно: сухой треск, горсть частиц,
// без стадий трещин и без замены блока (как в Minecraft)
function breakDecor(hit) {
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!isDecor(id)) return;
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x + 0.15, hit.y + 0.1, hit.z + 0.15, tileColor(BLOCKS[id].tiles[0]), 10);
  sfx.grassRustle();
  swingHand(0.45);
  decorBreakCd = 0.12;
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
  ui.setBreakProgress(0);
  // В выживании сорванное растение падает как физический предмет (пшеница, трава)
  if (isSurvival()) {
    const drop = blockDropItem(id);
    if (drop) {
      // руды/пшеница вылетают как предмет, остальное прямо в инвентарь? Для единообразия спавним физически
      items.spawn(hit.x + 0.5, hit.y + 0.3, hit.z + 0.5, drop);
    }
  }
}

function doBreak(hit) {
  if (!hit) return;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER) return;
  if (isDecor(id)) return breakDecor(hit);
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  // С листвы иногда падает яблоко
  if (id === BLOCK.LEAVES && Math.random() < 0.14) {
    items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 'apple');
  }
  // Любой выпавший блок/ресурс сначала лежит в мире: его нужно подобрать рядом.
  if (isSurvival()) {
    const drop = blockDropItem(id);
    if (drop) items.spawn(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, drop);
  }
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
}

function handleDeath(cause = 'unknown') {
  bowCharge = 0;
  bowCharging = false;
  eat.reset();
  if (isCreative()) { player.hp = player.maxHp; return; }  // в креативе игрок бессмертен
  sfx.die();
  ui.flashHurt();
  ui.shake();
  ui.blinkHearts();
  const s = world.findSpawn();
  player.pos.x = s.x; player.pos.y = s.y; player.pos.z = s.z;
  player.vel.x = 0; player.vel.y = 0; player.vel.z = 0;
  player.hp = player.maxHp;
  player.hurtT = 2.5;
  player.resetFall();        // после возрождения падение не досчитывается
  ui.setHealth(player.hp, player.maxHp);
  const knownCause = ['fall', 'creeper', 'zombie', 'spider', 'wolf', 'slime'].includes(cause) ? cause : 'unknown';
  ui.toast(`${i18n.t('died')} ${i18n.t(`death_cause_${knownCause}`)}`, 3400);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('respawned'), 2400), 3500);
}

function tryEat() {
  // F — съесть то что в руке, иначе первое доступное из инвентаря (яблоко/хлеб)
  let key = heldFood();
  if (!key) {
    if (inventory.has(ITEM.APPLE)) key = ITEM.APPLE;
    else if (inventory.has(ITEM.BREAD)) key = ITEM.BREAD;
    else { ui.toast(i18n.t('eat_none'), 1400); return; }
  }
  if (player.hp >= player.maxHp) { ui.toast(i18n.t('eat_full'), 1400); return; }
  inventory.remove(key, 1);
  refreshHotbar();
  sfx.crunch();
  player.heal(foodValue(key));
  ui.setHealth(player.hp, player.maxHp);
  ui.toast(i18n.t('eat_ok'), 1600);
}

function openFurnace(hit) {
  const key = `${hit.x},${hit.y},${hit.z}`;
  let machine = furnaceStates.get(key);
  if (!machine) {
    machine = new Furnace();
    furnaceStates.set(key, machine);
  }
  openInventory(2, { type: 'furnace', machine, key });
}

function openChest(hit) {
  const key = `${hit.x},${hit.y},${hit.z}`;
  let chest = chestStates.get(key);
  if (!chest) {
    chest = createChest();
    chestStates.set(key, chest);
  }
  sfx.uiOk();
  openInventory(2, { type: 'chest', inv: chest, key });
}

/** Содержимое хранилища высыпается предметами, когда его блок исчезает */
function spillContainer(x, y, z, previous) {
  const key = `${x},${y},${z}`;
  const stacks = [];
  if (isChest(previous)) {
    const chest = chestStates.get(key);
    if (chest) for (const s of chest.slots) if (s) stacks.push(s);
    chestStates.delete(key);
  } else if (previous === BLOCK.FURNACE) {
    const machine = furnaceStates.get(key);
    if (machine) for (const name of ['input', 'fuel', 'output']) {
      const s = machine.getSlot(name);
      if (s) stacks.push(s);
    }
    furnaceStates.delete(key);
  }
  for (const s of stacks) {
    for (let n = 0; n < s.count; n++) {
      items.spawn(x + 0.3 + Math.random() * 0.4, y + 0.4 + Math.random() * 0.3, z + 0.3 + Math.random() * 0.4, s.key);
    }
  }
}

/** Настенный факел: крепится к той стене, по которой кликнули */
function wallTorchFor(hit) {
  if (hit.nx === 1) return WALL_TORCH_BY_SIDE.nx;
  if (hit.nx === -1) return WALL_TORCH_BY_SIDE.px;
  if (hit.nz === 1) return WALL_TORCH_BY_SIDE.nz;
  if (hit.nz === -1) return WALL_TORCH_BY_SIDE.pz;
  return BLOCK.TORCH;
}

/** Сундук ставится лицевой стороной к игроку */
function chestFacingPlayer(x, z) {
  const dx = player.pos.x - (x + 0.5), dz = player.pos.z - (z + 0.5);
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? CHEST_BY_FRONT.px : CHEST_BY_FRONT.nx;
  return dz > 0 ? CHEST_BY_FRONT.pz : CHEST_BY_FRONT.nz;
}

function doPlace(hit) {
  if (!hit) return;
  swingHand(0.6);
  // Shift (присед) + ПКМ по верстаку/печи/сундуку — поставить блок рядом, а не открыть меню
  const useStation = !(input.sneak && placeBlockId(heldItem()));
  // Верстак: использование открывает крафт 3×3 (с паузой, чтобы не открывался повторно)
  if (useStation && hit.id === BLOCK.TABLE) {
    if (performance.now() - tableClosedT > 400) openTable();
    return;
  }
  if (useStation && hit.id === BLOCK.FURNACE) {
    openFurnace(hit);
    return;
  }
  if (useStation && isChest(hit.id)) {
    openChest(hit);
    return;
  }
  // Прицел на траве/цветке — ставим блок на её место
  const onDecor = isDecor(hit.id);
  const x = onDecor ? hit.x : hit.x + hit.nx;
  const y = onDecor ? hit.y : hit.y + hit.ny;
  const z = onDecor ? hit.z : hit.z + hit.nz;
  const cur = world.getBlock(x, y, z);
  if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && !isDecor(cur)) return;
  // Не ставим блок внутрь игрока
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  const HW = CONFIG.PLAYER_WIDTH / 2 + 0.01;
  const overlap = x + 1 > px - HW && x < px + HW &&
    y + 1 > py && y < py + CONFIG.PLAYER_HEIGHT &&
    z + 1 > pz - HW && z < pz + HW;
  const held = heldItem();
  let id = placeBlockId(held);
  if (!id) { swingHand(0.6); return; }   // в руке не блок — ставить нечего
  // Факел в стену вешается настенным вариантом — со своей моделью и наклоном
  if (isTorch(id) && !onDecor && (hit.nx || hit.nz)) id = wallTorchFor(hit);
  if (isChest(id)) id = chestFacingPlayer(x, z);
  if (overlap && isSolid(id)) return;
  if (isDecor(cur)) {
    // Трава автоматически ломается при установке блока
    if (isDecor(id) && cur === id) return;
    particles.burst(x, y, z, tileColor(BLOCKS[cur].tiles[0]), 8);
    sfx.breakBlock(breakKind(cur));
  }
  if (world.setBlock(x, y, z, id)) {
    sfx.place();
    particles.burst(x, y, z, tileColor(BLOCKS[id].tiles[0]), 5);
    // В выживании поставленный блок расходуется
    if (isSurvival()) {
      inventory.remove(held, 1);
      refreshHotbar();
    }
    blocksBuilt++;
    ui.setBlocksBuilt(blocksBuilt);
    ysdk.setStats({ blocksBuilt });
  }
}

// ---------------------------------------------------------------- Сохранение
function buildSave() {
  return {
    v: 3,
    worldName: activeWorldRecord?.name || i18n.t('new_world'),
    mode,
    difficulty,
    inventory: inventory.serialize(),
    hotbarIndex,
    seed: world.seed,
    edits: world.serializeEdits(),
    furnaces: serializeFurnaces(furnaceStates),
    chests: serializeChests(chestStates),
    player: player.serialize(),
    time: sky.serialize(),
    blocksBuilt,
    paletteUnlocked: settings.paletteUnlocked,
    settings: {
      volume: settings.volume,
      sound: settings.sound,
      lang: settings.lang,
      viewDistance: settings.viewDistance,
      fullscreen: settings.fullscreen !== false,
    },
  };
}

function currentSettingsSave() {
  return {
    volume: settings.volume,
    sound: settings.sound,
    lang: settings.lang,
    viewDistance: settings.viewDistance,
    fullscreen: settings.fullscreen !== false,
  };
}

function refreshWorldMenu() {
  ui.setHasSave(worldProfile.worlds.length > 0);
  ui.setWorlds(worldProfile.worlds, worldProfile.activeWorldId);
}

async function persistWorldProfile() {
  const payload = serializeWorldProfile(worldProfile, null, currentSettingsSave(), settings.paletteUnlocked);
  worldProfile = normalizeWorldProfile(payload);
  activeWorldRecord = worldProfile.worlds.find((entry) => entry.id === worldProfile.activeWorldId) || null;
  saveData = activeWorldRecord?.save || null;
  refreshWorldMenu();
  return ysdk.save(payload);
}

async function saveGame(showToast = false) {
  if (!world || !player || state === 'menu' || state === 'loading') return false;
  saveData = buildSave();
  if (!activeWorldRecord) {
    activeWorldRecord = createWorldRecord({
      name: saveData.worldName,
      seed: world.seed,
      mode,
      difficulty,
    });
    worldProfile.worlds.unshift(activeWorldRecord);
  }
  worldProfile.activeWorldId = activeWorldRecord.id;
  const payload = serializeWorldProfile(worldProfile, saveData, currentSettingsSave(), settings.paletteUnlocked);
  worldProfile = normalizeWorldProfile(payload);
  activeWorldRecord = worldProfile.worlds.find((entry) => entry.id === worldProfile.activeWorldId) || null;
  saveData = activeWorldRecord?.save || saveData;
  refreshWorldMenu();
  const ok = await ysdk.save(payload);
  if (showToast) ui.toast(i18n.t(ok ? 'saved' : 'save_fail'));
  return ok;
}

/**
 * Моб бьёт игрока только «по прямой»: между ними не должно быть сплошных блоков.
 * Так урон не приходит сквозь стены и сквозь пол от моба, который стоит под ногами.
 */
function mobSeesPlayer(mob) {
  const ex = mob.pos.x, ey = mob.pos.y + (mob.centerY ? mob.centerY() : 0.6), ez = mob.pos.z;
  const tx = player.pos.x, ty = player.pos.y + 1.0, tz = player.pos.z;
  const dx = tx - ex, dy = ty - ey, dz = tz - ez;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.001) return true;
  const steps = Math.min(24, Math.max(2, Math.ceil(dist / 0.2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const bx = Math.floor(ex + dx * t), by = Math.floor(ey + dy * t), bz = Math.floor(ez + dz * t);
    if (isSolid(world.getBlock(bx, by, bz))) return false;
  }
  return true;
}

function attachPlayerEvents() {
  mobManager.onAttack = (mob) => {
    if (!isSurvival()) return;             // в креативе игрок бессмертен
    if (!mobSeesPlayer(mob)) return;       // сквозь стену урона нет
    const damageScale = difficulty === 'peaceful' ? 0 : difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.5 : 1;
    if (damageScale <= 0) return;
    const damage = Math.max(1, Math.round(2 * damageScale));
    const dx = player.pos.x - mob.pos.x, dz = player.pos.z - mob.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (player.hurt(damage, mob.type)) {
      player.vel.x = (dx / dl) * 5;
      player.vel.z = (dz / dl) * 5;
      player.vel.y = 3;
      ui.setHealth(player.hp, player.maxHp);
    }
  };
  // Крипер взорвался: урон по площади, разлетающиеся частицы и разрушение мягких блоков
  mobManager.onExplode = (mob) => {
    const ex = mob.pos.x, ey = mob.pos.y + 0.4, ez = mob.pos.z;
    sfx.explode();
    ui.shake();
    shakeT = 0.55;
    particles.burst(ex, ey, ez, 0xd8dcd8, 34);
    particles.burst(ex, ey + 0.4, ez, 0x4a4a4a, 18);
    // Урон игроку по расстоянию
    if (isSurvival()) {
      const dx = player.pos.x - ex, dy = player.pos.y + 1 - ey, dz = player.pos.z - ez;
      const d = Math.hypot(dx, dy, dz);
      if (d < 4.5) {
        const baseDamage = Math.max(2, Math.round(7 - d));
        const damageScale = difficulty === 'peaceful' ? 0 : difficulty === 'easy' ? 0.5 : difficulty === 'hard' ? 1.5 : 1;
        const dmg = Math.round(baseDamage * damageScale);
        const dl = Math.hypot(dx, dz) || 1;
        if (dmg > 0 && player.hurt(dmg, 'creeper')) {
          player.vel.x = (dx / dl) * 8;
          player.vel.z = (dz / dl) * 8;
          player.vel.y = 5;
          ui.setHealth(player.hp, player.maxHp);
        }
      }
    }
    // Разрушаем блоки вокруг (обсидиан взрыв не берёт)
    const R = 2;
    const bx = Math.floor(ex), by = Math.floor(ey), bz = Math.floor(ez);
    for (let x = bx - R; x <= bx + R; x++) {
      for (let y = Math.max(1, by - R); y <= by + R; y++) {
        for (let z = bz - R; z <= bz + R; z++) {
          const dist = Math.hypot(x + 0.5 - ex, y + 0.5 - ey, z + 0.5 - ez);
          if (dist > R + 0.4) continue;
          const id = world.getBlock(x, y, z);
          if (!id || id === BLOCK.WATER || id === BLOCK.OBSIDIAN) continue;
          world.setBlock(x, y, z, BLOCK.AIR);
        }
      }
    }
    particles.burst(ex, ey, ez, 0x8a8a8a, 12);
  };

  mobManager.onDeath = (mob) => {
    sfx.mobDie();
    const color = mob.type === 'zombie' ? 0x4f9b43
      : mob.type === 'creeper' ? 0x6cc24a
        : mob.type === 'spider' ? 0x111111
          : mob.type === 'wolf' ? 0xd6d2ca
            : mob.type === 'fish' ? 0xb8ccd8 : 0xd03232;
    particles.burst(mob.pos.x, mob.pos.y + mob.centerY(), mob.pos.z, color, 16);
    // Опыт с монстра: вылетают светящиеся шарики
    const xpMap = { zombie: 5, spider: 5, creeper: 6, wolf: 4, fish: 1, bunny: 2, sheep: 2, slime: 3, bird: 1 };
    const xp = xpMap[mob.type] || 3;
    xpOrbs.spawn(mob.pos.x, mob.pos.y + 0.6, mob.pos.z, xp);
    sfx.pickup();
  };
  items.onPickup = (kind) => {
    // универсальный подбор: любой предмет (руда, блок, хлеб, пшеница, яблоко)
    const normalized = kind === 'apple' ? ITEM.APPLE : kind;
    const left = inventory.add(normalized, 1);
    refreshHotbar();
    sfx.pickup();
    if (left > 0) ui.toast(i18n.t('inv_full'), 1600);
    else {
      if (normalized === ITEM.APPLE && inventory.count(ITEM.APPLE) === 1) ui.toast(i18n.t('apple_get'), 3200);
      else if ([ITEM.COAL, ITEM.RAW_IRON, ITEM.RAW_GOLD, ITEM.DIAMOND].includes(normalized)) {
        ui.toast(`${i18n.t('block_drop')}: ${itemName(normalized, i18n.lang)}`, 1400);
      } else if (normalized === ITEM.WHEAT) ui.toast(i18n.t('wheat_get') || 'Пшеница подобрана', 1400);
      else if (normalized === ITEM.BREAD) ui.toast(i18n.t('bread_get') || 'Хлеб подобран', 1400);
    }
  };
  xpOrbs.onPickup = (amount) => {
    totalXp += amount;
    // Опыт только показываем тостом: сердечки больше не мигают,
    // иначе вспышка опыта выглядела как урон из ниоткуда.
    ui.toast(`+${amount} XP  (всего ${totalXp})`, 1600);
    sfx.pickup();
  };
  player.events.onStep = (inWater) => sfx.step(inWater);
  player.events.onJump = () => sfx.jump();
  player.events.onLand = () => sfx.land();
  player.events.onHurt = () => {
    sfx.hurt();
    ui.flashHurt();
    ui.shake();
    ui.blinkHearts();
    shakeT = 0.45;
    ui.setHealth(player.hp, player.maxHp);
  };
  player.events.onDeath = (cause) => handleDeath(cause);
  player.events.onSplash = () => sfx.splash();
}

// ---------------------------------------------------------------- Режим игры
function applyMode() {
  const creative = isCreative();
  player.invulnerable = creative;
  player.canFly = creative;
  if (!creative) player.stopFly();
  ui.setHealthVisible(!creative);
  ui.setFlyButton(creative);
  ui.setApples(inventory.count(ITEM.APPLE), mode);
  ui.setArrows(arrowAmmo(), mode);
  // обновляем метки в паузе и инвентаре
  ui.showModeLabel(mode);
  if (invUI.isOpen()) {
    const label = document.getElementById('inv-mode-label');
    if (label) label.textContent = i18n.t(isCreative() ? 'mode_creative' : 'mode_survival');
  }
  if (creative) {
    // Креатив: здоровье всегда полное, старые отсчёты урона и падения сброшены
    player.hp = player.maxHp;
    player.hurtT = 0;
    player.resetFall();
    ui.setHealth(player.hp, player.maxHp);
  }
}

function toggleMode() {
  mode = isCreative() ? 'survival' : 'creative';
  applyMode();
  refreshHotbar();
  if (invUI.isOpen()) invUI.render();
  ui.toast(i18n.t(isCreative() ? 'mode_switched_creative' : 'mode_switched_survival'), 2200);
  sfx.uiOk();
  saveGame();
}

// ---------------------------------------------------------------- Стейты
function enterGame() {
  state = 'game';
  input.enabled = true;
  ui.showModeLabel(mode);
  sessionStart = sessionStart || performance.now();
  ui.showGame();
  ui.setTouchVisible(input.isTouch);
  ysdk.gameplayStart();
  if (!input.isTouch) input.requestLock(canvas);
  showHints();
}

function pauseGame() {
  if (state !== 'game') return;
  state = 'pause';
  input.enabled = false;
  input.keys.clear();
  runShake.duration = 0;
  runShake.strength = 0;
  runBob = 0;
  ysdk.gameplayStop();
  saveGame();
  ui.showModeLabel(mode);
  ui.showScreen('pause-screen');
  ui.setTouchVisible(false);
  if (document.pointerLockElement) document.exitPointerLock?.();
}

function resumeGame() {
  state = 'game';
  input.enabled = true;
  ysdk.gameplayStart();
  ui.showGame();
  ui.setTouchVisible(input.isTouch);
  if (!input.isTouch) input.requestLock(canvas);
}

async function saveAndQuit() {
  await saveGame(true);
  state = 'menu';
  input.enabled = false;
  ui.setHasSave(true);
  ui.showScreen('menu-screen');
  ui.setTouchVisible(false);
  ysdk.gameplayStop();
  // Межстраничная реклама после достаточно долгой сессии
  const played = (performance.now() - sessionStart) / 1000;
  if (played > CONFIG.INTERSTITIAL_MIN_SEC && performance.now() - interstitialShown > CONFIG.INTERSTITIAL_COOLDOWN_MS) {
    interstitialShown = performance.now();
    ui.showAdOverlay(true);
    await ysdk.showFullscreen();
    ui.showAdOverlay(false);
  }
  sessionStart = 0;
}

function showHints() {
  if (input.isTouch) return;
  ui.toast(i18n.t('hint_break'), 4000);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_place'), 3500), 4200);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_inventory'), 3500), 7800);
  setTimeout(() => state === 'game'
    && ui.toast(i18n.t(isCreative() ? 'hint_fly' : 'hint_table'), 3500), 11400);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_bow'), 4200), 15000);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_eat'), 4200), 21000);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('esc_fullscreen'), 4500), 20500);
}

// ---------------------------------------------------------------- Награда за рекламу
async function requestReward() {
  ui.toast(i18n.t('ad_loading'));
  sfx.resume();
  const ok = await ysdk.showRewarded();
  if (ok || !ysdk.available) {
    // Без SDK (локальный запуск/демо) награда выдаётся сразу
    settings.paletteUnlocked = true;
    refreshCatalog();
    ui.setRewardButton(true);
    ui.toast(i18n.t('reward_got') + (ok ? '' : ' (demo)'), 3200);
    sfx.reward();
    if (world && player && state !== 'menu') saveGame();
    else persistWorldProfile();
  } else {
    ui.toast(i18n.t('reward_fail'), 3200);
  }
}

// ---------------------------------------------------------------- Инициализация мира
async function startWorld(opts = {}) {
  ui.showScreen('loading-screen');
  ui.setLoading(0.05, i18n.t('loading'));

  if (world) for (const chunk of world.chunks.values()) disposeChunkMeshes(chunk);
  weather.reset();
  const record = opts.record || activeWorldRecord;
  if (record) {
    activeWorldRecord = record;
    worldProfile.activeWorldId = record.id;
  }
  const data = opts.fresh ? null : (opts.data ?? record?.save ?? saveData);
  const seed = (data?.seed != null) ? data.seed
    : (opts.seed != null ? Number(opts.seed) | 0 : (record?.seed ?? ((Math.random() * 0x7fffffff) | 0)));
  // Старые сохранения без режима по-прежнему открываются в креативе.
  mode = data ? (data.mode === 'survival' ? 'survival' : 'creative')
    : ((opts.mode || record?.mode) === 'survival' ? 'survival' : 'creative');
  const requestedDifficulty = data?.difficulty || opts.difficulty || record?.difficulty || 'normal';
  difficulty = ['peaceful', 'easy', 'normal', 'hard'].includes(requestedDifficulty) ? requestedDifficulty : 'normal';
  mobManager.setDifficulty(difficulty);
  runShake.duration = 0;
  runShake.strength = 0;
  runBob = 0;

  world = new World(seed);
  world.onUnsupportedDecor = (x, y, z, id) => {
    particles.burst(x + 0.5, y + 0.15, z + 0.5, tileColor(BLOCKS[id].tiles[0]), 8);
    sfx.grassRustle();
    if (isSurvival()) {
      const drop = blockDropItem(id);
      if (drop) items.spawn(x + 0.5, y + 0.3, z + 0.5, drop);
    }
  };
  furnaceStates = data ? deserializeFurnaces(data.furnaces) : new Map();
  chestStates = data ? deserializeChests(data.chests) : new Map();
  world.onBlockReplaced = (x, y, z, previous, id) => {
    if (previous === id) return;
    if (isChest(previous) && isChest(id)) return;
    if (isChest(previous) || previous === BLOCK.FURNACE) spillContainer(x, y, z, previous);
  };
  player = new Player(world);
  mobManager.clear();
  items.clear();
  xpOrbs.clear();
  totalXp = 0;
  inventory = new Inventory(CONFIG.INV_SIZE);
  invUI.hide();
  hotbarIndex = 0;
  if (mode === 'creative') {
    // В креативе стартовый хотбар — базовые блоки (бесконечные)
    STARTER_PALETTE.forEach((id, i) => inventory.setStack(i, { key: blockItem(id), count: 64 }));
  }
  mobManager.world = world;
  projectiles.clear();
  bowCharge = 0;
  bowCharging = false;
  if (!data && mode === 'survival') {
    // Небольшой стартовый набор: с луком и стрелами в выживании интереснее начинать
    inventory.add(ITEM.BOW, 1);
    inventory.add(ITEM.ARROW, 16);
  }
  attachPlayerEvents();

  if (data) {
    world.loadEdits(data.edits || []);
    if (Array.isArray(data.inventory)) inventory.deserialize(data.inventory);
    hotbarIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, data.hotbarIndex || 0));
    settings.paletteUnlocked = !!worldProfile.paletteUnlocked || !!data.paletteUnlocked;
    blocksBuilt = data.blocksBuilt || 0;
    ui.setBlocksBuilt(blocksBuilt);
    const dataSettings = Object.keys(worldProfile.settings).length ? worldProfile.settings : data.settings;
    if (dataSettings) {
      settings.volume = dataSettings.volume ?? settings.volume;
      settings.sound = dataSettings.sound !== false;
      settings.lang = dataSettings.lang || settings.lang;
      settings.viewDistance = dataSettings.viewDistance || settings.viewDistance;
      settings.fullscreen = dataSettings.fullscreen !== false;
      input.allowFullscreen = settings.fullscreen;
    }
    if (data.time != null) sky.setTime(data.time);
    i18n.setLang(settings.lang);
    sfx.setVolume(settings.volume);
    sfx.setEnabled(settings.sound);
  } else {
    settings.paletteUnlocked = !!worldProfile.paletteUnlocked;
  }
  ui.applySettings(settings);
  ui.applyI18n();
  applyMode();
  refreshHotbar();
  sky.viewDistance = settings.viewDistance;

  // Спавн
  const spawn = world.findSpawn();
  player.pos.x = spawn.x; player.pos.y = spawn.y; player.pos.z = spawn.z;
  player.yaw = Math.PI * 0.25;
  if (data?.player) {
    player.deserialize(data.player);
    // Защита от сохранения «внутри блоков»
    if (isSolid(world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y), Math.floor(player.pos.z)))) {
      player.pos.y += 2;
    }
  }

  // Предгенерация вокруг спавна
  const total = 25;
  let done = 0;
  lastPlayerChunk = null;
  rebuildQueue();
  const pregen = chunkQueue.splice(0, total);
  for (const q of pregen) {
    buildChunkMesh(q.cx, q.cz);
    done++;
    ui.setLoading(0.05 + 0.9 * (done / total), i18n.t('loading'));
    await new Promise((r) => setTimeout(r, 0));
  }
  ui.setLoading(1, i18n.t('ready'));
  ui.setRewardButton(settings.paletteUnlocked);

  // Несколько мобов сразу, чтобы мир был живым (спавним вне видимости)
  for (let i = 0; i < 5; i++) mobManager.trySpawn(player);
  ui.setHealth(player.hp, player.maxHp);
  applyMode();
  refreshHotbar();

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» доступно сразу, а не только после автосохранения.

  enterGame();
  void saveGame();
}

// ---------------------------------------------------------------- Инвентарь: окно
function openInventory(gridSize = 2, station = null) {
  if (state !== 'game' || !world) return;
  if (gridSize !== invUI.gridSize) invUI.setGridSize(gridSize);
  state = 'inventory';
  input.enabled = false;
  input.keys.clear();
  runShake.duration = 0;
  runShake.strength = 0;
  runBob = 0;
  input.mouse.left = false;
  input.mouse.right = false;
  ysdk.gameplayStop();
  if (document.pointerLockElement) document.exitPointerLock?.();
  invUI.show({ inv: inventory, mode, hotbarIndex, catalog: catalogEntries(), gridSize, station });
  ui.showScreen('inventory-screen');
  ui.setTouchVisible(false);
  sfx.uiClick();
}

function openTable() {
  sfx.uiOk();
  openInventory(3);
}

function closeInventory() {
  if (state !== 'inventory') return;
  if (invUI.gridSize === 3) tableClosedT = performance.now();
  invUI.hide();
  state = 'game';
  input.enabled = true;
  ui.showGame();
  if (!input.isTouch) input.requestLock(canvas);   // закрытие по E/✕ — это жест пользователя
  ui.setTouchVisible(input.isTouch);
  refreshHotbar();
  ysdk.gameplayStart();
  sfx.uiClick();
  saveGame();
}

function toggleInventory() {
  if (state === 'inventory') closeInventory();
  else openInventory();
}

/** Каталог креатива обновился (например, после рекламы) */
function refreshCatalog() {
  if (invUI.isOpen()) {
    invUI.catalog = catalogEntries();
    invUI.render();
  }
}

invUI.handlers.onChange = () => refreshHotbar();
invUI.handlers.onStationChange = () => saveGame();
invUI.handlers.onClose = () => closeInventory();
invUI.handlers.onSelect = (i) => {
  selectHotbar(i);
  sfx.uiClick();
};
invUI.handlers.onSound = (kind) => {
  if (kind === 'pickup') sfx.pickup();
  else if (kind === 'place') sfx.place();
  else if (kind === 'craft') sfx.craft();
  else sfx.uiClick();
};
invUI.handlers.onPickCatalog = (key) => {
  // Кладём предмет в выбранный слот хотбара (в креативе блоки бесконечны)
  inventory.setStack(hotbarIndex, { key, count: isCreative() ? 64 : 1 });
  refreshHotbar();
  invUI.render();
  sfx.uiOk();
};
invUI.handlers.onLocked = () => {
  ui.toast(i18n.t('catalog_locked'), 2600);
  requestReward();
};
invUI.handlers.onQuickCraft = (recipe) => {
  const res = craft(inventory, recipe);
  if (res === 'ok') {
    sfx.uiOk();
    ui.toast(`${i18n.t('craft_ok')}: ${itemName(recipe.out.key, i18n.lang)} ×${recipe.out.count}`, 1800);
  } else if (res === 'missing') {
    sfx.uiClick();
    ui.toast(i18n.t('craft_missing'), 1600);
  } else {
    ui.toast(i18n.t('craft_no_room'), 1800);
  }
  refreshHotbar();
  invUI.render();
};
setFullToast(() => ui.toast(i18n.t('craft_no_room'), 1600));

// ---------------------------------------------------------------- Обработчики UI
function seedFromInput(value) {
  const text = String(value ?? '').trim();
  if (!text) return (Math.random() * 0x7fffffff) | 0;
  if (/^[+-]?\d+$/.test(text)) return Number(text) | 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}

function createWorldFromForm(form = {}) {
  const nextNumber = worldProfile.worlds.length + 1;
  const name = String(form.name || '').trim() || `${i18n.t('new_world')} ${nextNumber}`;
  const seed = seedFromInput(form.seed);
  const record = createWorldRecord({
    name,
    seed,
    difficulty: form.difficulty || 'normal',
    mode: form.mode || 'survival',
  });
  worldProfile.worlds.unshift(record);
  worldProfile.activeWorldId = record.id;
  activeWorldRecord = record;
  saveData = null;
  refreshWorldMenu();
  return startWorld({ fresh: true, record, seed, mode: record.mode, difficulty: record.difficulty });
}

ui.handlers.onPlay = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  if (activeWorldRecord) {
    startWorld({ fresh: !activeWorldRecord.save, record: activeWorldRecord });
  } else {
    ui.showWorldCreator('menu-screen');
  }
};
ui.handlers.onNewWorld = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  ui.showWorldCreator('menu-screen');
};
ui.handlers.onWorlds = () => {
  sfx.uiClick();
  ui.showWorlds(worldProfile.worlds, worldProfile.activeWorldId);
};
ui.handlers.onCreateWorld = (form) => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  createWorldFromForm(form);
};
ui.handlers.onLoadWorld = (id) => {
  const record = worldProfile.worlds.find((entry) => entry.id === id);
  if (!record) return;
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  activeWorldRecord = record;
  worldProfile.activeWorldId = record.id;
  saveData = record.save;
  startWorld({ fresh: !record.save, record });
};
ui.handlers.onDeleteWorld = async (id) => {
  const record = worldProfile.worlds.find((entry) => entry.id === id);
  if (!record || !window.confirm(`${i18n.t('delete_world')} «${record.name}»? ${i18n.t('delete_world_confirm')}`)) return;
  worldProfile.worlds = worldProfile.worlds.filter((entry) => entry.id !== id);
  if (worldProfile.activeWorldId === id) worldProfile.activeWorldId = worldProfile.worlds[0]?.id ?? null;
  activeWorldRecord = worldProfile.worlds.find((entry) => entry.id === worldProfile.activeWorldId) || null;
  saveData = activeWorldRecord?.save || null;
  await persistWorldProfile();
  ui.showWorlds(worldProfile.worlds, worldProfile.activeWorldId);
};
ui.handlers.onMode = (m) => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  createWorldFromForm({ mode: m, difficulty: 'normal' });
};
ui.handlers.onModeBack = () => {
  sfx.uiClick();
  ui.showScreen('menu-screen');
};
ui.handlers.onBag = () => toggleInventory();
ui.handlers.onResume = () => { input.enterFullscreen(); sfx.uiClick(); resumeGame(); };
ui.handlers.onSaveQuit = async () => { sfx.uiOk(); await saveAndQuit(); };
ui.handlers.onReward = () => requestReward();
ui.handlers.onSlot = (i) => {
  selectHotbar(i);
  sfx.uiClick();
};
ui.handlers.onPauseBtn = () => pauseGame();
document.getElementById('btn-toggle-mode')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (state !== 'pause' && state !== 'game') return;
  toggleMode();
});
ui.handlers.onToSpawn = () => {
  if (!world || !player) return;
  const spawn = world.findSpawn();
  player.pos.x = spawn.x; player.pos.y = spawn.y; player.pos.z = spawn.z;
  player.vel = { x: 0, y: 0, z: 0 };
  sfx.uiOk();
  ui.toast(i18n.t('to_spawn_ok'));
};
ui.handlers.onSettingsChange = (delta) => {
  Object.assign(settings, delta);
  if (delta.volume != null) sfx.setVolume(settings.sound ? delta.volume : 0);
  if (delta.sound != null) sfx.setEnabled(delta.sound && settings.volume > 0);
  if (delta.lang) {
    i18n.setLang(delta.lang);
    ui.applyI18n();
    if (world) refreshHotbar();
    ui.setRewardButton(settings.paletteUnlocked);
    ui.setWorlds(worldProfile.worlds, worldProfile.activeWorldId);
    if (invUI.isOpen()) invUI.render();
  }
  if (delta.viewDistance) {
    sky.viewDistance = delta.viewDistance;
    lastPlayerChunk = null; // пересобрать очередь чанков
  }
  if (delta.fullscreen != null) {
    input.allowFullscreen = delta.fullscreen !== false;
    settings.fullscreen = input.allowFullscreen;
    if (settings.fullscreen) input.enterFullscreen();
    else { input.exitFullscreen(); ui.toast(i18n.t('fullscreen_off')); }
  }
  if (world && player && state !== 'menu') saveGame();
  else persistWorldProfile();
};

function showModeScreen() {
  ui.showScreen('mode-screen');
}

input.handlers.onPause = () => {
  if (state === 'inventory') { closeInventory(); return; }
  if (state === 'game') pauseGame();
  else if (state === 'pause') resumeGame();
};
input.handlers.onToggleInventory = () => toggleInventory();
let flyHintT = 0;
input.handlers.onToggleFly = () => {
  if (state !== 'game') return;
  if (!isCreative()) {
    // не спамим подсказкой, если игрок просто прыгает
    if (performance.now() - flyHintT > 20000) {
      flyHintT = performance.now();
      ui.toast(i18n.t('fly_creative_only'), 1600);
    }
    return;
  }
  const on = player.toggleFly();
  ui.toast(i18n.t(on ? 'fly_on' : 'fly_off'), 1500);
  sfx.uiClick();
};
input.handlers.onDigit = (i) => {
  if (i < HOTBAR_SIZE) {
    selectHotbar(i);
    sfx.uiClick();
  }
};
input.handlers.onScroll = (dir) => {
  selectHotbar((hotbarIndex + dir + HOTBAR_SIZE) % HOTBAR_SIZE);
  sfx.uiClick();
};
input.handlers.onActionBreak = () => {
  if (state !== 'game') return;
  if (findMobTarget()) return;          // тап по мобу — удар, а не ломание
  const hit = pickTarget();
  if (!hit) return;
  // Растения срываются мгновенно, без трещин
  if (isDecor(hit.id)) return breakDecor(hit);
  // Тап — быстрое ломание с короткой анимацией трещин
  breakTarget = { x: hit.x, y: hit.y, z: hit.z };
  breakProgress = 0;
  breakQuick = true;
  sfx.dig(breakKind(hit.id));
};
input.handlers.onActionPlace = () => {
  if (state !== 'game') return;
  doPlace(pickTarget());
};

// Клик по игре (после закрытия инвентаря) снова захватывает мышь
canvas.addEventListener('mousedown', () => {
  if (state === 'game' && !input.isTouch && !input.locked) input.requestLock(canvas);
});

// Потеря фокуса — пауза и стоп звука
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    sfx.suspend();
    if (state === 'game') pauseGame();
  } else {
    sfx.resume();
  }
});

// Выход из pointer lock без Esc (браузер) — пауза
document.addEventListener('pointerlockchange', () => {
  if (state === 'game' && !input.isTouch && document.pointerLockElement == null) {
    pauseGame();
  }
});

// Браузер сам вышел из полного экрана (Esc в Safari/Firefox или удержание Esc в Chrome)
// — показываем меню паузы вместо «молчаливого» выброса из игры
input.handlers.onFullscreenChange = (on) => {
  if (!on && state === 'game') pauseGame();
};

function checkOrientation() {
  const portrait = window.innerHeight > window.innerWidth && input.isTouch;
  ui.setRotateHint(portrait && state === 'game');
}
window.addEventListener('orientationchange', checkOrientation);
window.addEventListener('resize', checkOrientation);

// Автосохранение
setInterval(() => { if (state === 'game' || state === 'inventory') saveGame(); }, CONFIG.AUTO_SAVE_SEC * 1000);

// ---------------------------------------------------------------- Главный цикл
let lastT = performance.now();
let fpsEma = 60;

function updateFurnaceMachines(dt) {
  const openMachine = state === 'inventory' && invUI.station?.type === 'furnace'
    ? invUI.station.machine : null;
  for (const machine of furnaceStates.values()) {
    if (machine !== openMachine) machine.update(dt);
  }
  invUI.updateStation(dt);
}

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  fpsEma = fpsEma * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;

  if (world && player && (state === 'game' || state === 'inventory')) updateFurnaceMachines(dt);

  if (world && player && (state === 'game')) {
    input.update();

    // Обзор
    const look = input.consumeLook();
    player.yaw -= look.dx * 0.0022;
    player.pitch -= look.dy * 0.0022;
    const lim = Math.PI / 2 - 0.01;
    player.pitch = Math.max(-lim, Math.min(lim, player.pitch));

    player.update({
      forward: input.move.forward,
      right: input.move.right,
      jump: input.jump,
      sneak: input.sneak,
      sprint: input.sprint,
    }, dt);

    // Потоковая подгрузка чанков
    const pcx = Math.floor(player.pos.x / CONFIG.CHUNK_SIZE);
    const pcz = Math.floor(player.pos.z / CONFIG.CHUNK_SIZE);
    if (!lastPlayerChunk || lastPlayerChunk.x !== pcx || lastPlayerChunk.z !== pcz) {
      lastPlayerChunk = { x: pcx, z: pcz };
      rebuildQueue();
    } else if (chunkQueue.length === 0) {
      rebuildQueue(); // подбираем чанки, «загрязнившиеся» после правок
    }
    processQueue(CONFIG.MAX_MESH_PER_FRAME);

    // --- Выживание: предметы, опыт, еда, ночные зомби ---
    items.update(dt, world, player.pos);
    xpOrbs.update(dt, world, player.pos);
    if (input.consumePress('KeyF')) tryEat();

    mobManager.setNight(sky.lightLevel < 0.32);
    if (sky.lightLevel < 0.32) {
      zombieT -= dt;
      if (zombieT <= 0) {
        zombieT = 8 + Math.random() * 9;
        const spawned = mobManager.trySpawnZombie(player);
        if (spawned && !zombieWarned) {
          zombieWarned = true;
          ui.toast(i18n.t('zombie_warn'), 3200);
        }
      }
    } else {
      zombieWarned = false;
    }

    // Удар по любому мобу под прицелом, включая птиц
    let mobTarget = null;
    if (input.breakHeld) {
      mobTarget = findMobTarget();
      attackCd -= dt;
      if (mobTarget && attackCd <= 0) {
        attackCd = 0.36;
        hitMob(mobTarget);
      }
    } else {
      attackCd = 0;
    }

    // Прицел и действия
    const hit = pickTarget();
    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }

    // Еда: держим ЛКМ (или кнопку «копать» на телефоне) с едой в руке — персонаж жуёт.
    // Отпустили раньше времени — анимация прерывается, предмет не тратится.
    const foodKey = heldFood();
    const hungry = player.hp < player.maxHp;
    const holdEat = !!foodKey && input.breakHeld && !mobTarget;
    eatFullT = Math.max(0, eatFullT - dt);
    const eatEvent = eat.update(dt, holdEat, hungry);
    if (eatEvent === 'chew') {
      sfx.crunch();
      // Крошки летят перед лицом — еда выглядит «настоящей»
      const eye = player.eyePos();
      const dir = player.lookDir();
      particles.burst(
        eye.x + dir.x * 0.55, eye.y + dir.y * 0.55 - 0.18, eye.z + dir.z * 0.55,
        Math.random() < 0.5 ? 0xd64545 : 0xd8c48a, 2,
      );
    } else if (eatEvent === 'done') {
      finishEat();
    } else if (eatEvent === 'cancel') {
      ui.setBreakProgress(0);
    }
    if (holdEat && !eat.active && !hungry && eatFullT <= 0) {
      ui.toast(i18n.t('eat_full'), 2000);       // здоровье полное — есть нечего
      eatFullT = 2.5;
    }

    // Ломание: удержание ЛКМ/кнопки или быстрое по тапу (с анимацией трещин)
    let breaking = null;
    decorBreakCd = Math.max(0, decorBreakCd - dt);
    if (hit && !mobTarget && !eat.active && isDecor(hit.id)) {
      // Растения: мгновенный срыв удержанием кнопки, трещины не показываем
      if (input.breakHeld && decorBreakCd <= 0) breakDecor(hit);
      breakTarget = null;
      breakProgress = 0;
      breakQuick = false;
      crackMesh.visible = false;
      ui.setBreakProgress(0);
    } else if (hit && !mobTarget && !eat.active) {
      const same = breakTarget && breakTarget.x === hit.x && breakTarget.y === hit.y && breakTarget.z === hit.z;
      if (breakQuick) {
        if (same) breaking = hit;
        else { breakQuick = false; }
      }
      if (!breaking && input.breakHeld) {
        if (!same) {
          breakTarget = { x: hit.x, y: hit.y, z: hit.z };
          breakProgress = 0;
          breakQuick = false;
          sfx.dig(breakKind(hit.id));
        }
        breaking = hit;
      }
    }
    if (breaking) {
      const secs = breakTime(breaking.id, heldItem(), mode);
      const rate = dt / (breakQuick ? Math.min(secs, 0.3) : secs);
      breakProgress += rate;
      if (handSwing <= 0) swingHand(0.7);
      // Пыль из трещин
      breakDustT += dt;
      if (breakDustT > 0.1) {
        breakDustT = 0;
        particles.burst(breaking.x, breaking.y, breaking.z, tileColor(BLOCKS[breaking.id].tiles[0]), 2);
      }
      if (breakProgress >= 1) {
        doBreak(breaking);
      } else {
        ui.setBreakProgress(breakProgress);
        showCrack(breaking, breakProgress);
      }
    } else {
      breakTarget = null;
      breakProgress = 0;
      breakQuick = false;
      breakDustT = 0;
      ui.setBreakProgress(0);
      crackMesh.visible = false;
    }

    // ПКМ по интерактивному блоку важнее лука: даже с луком можно открыть верстак/печь.
    const interactiveTarget = hit && (hit.id === BLOCK.TABLE || hit.id === BLOCK.FURNACE || isChest(hit.id));
    // Лук: удержание ПКМ (или кнопки на тач-экране) натягивает тетиву, отпускание — выстрел
    const bowSel = isBowSelected() && !interactiveTarget;
    if (bowSel && input.placeHeld) {
      if (!bowCharging) {
        bowCharging = true;
        bowCharge = 0;
        sfx.bowDraw();
      }
      bowCharge = Math.min(1, bowCharge + dt / BOW_CHARGE_TIME);
    } else if (bowCharging) {
      bowCharging = false;
      if (bowSel) fireBow(bowCharge);
      bowCharge = 0;
    }

    placeCooldown -= dt;
    if (!bowSel && input.placeHeld && placeCooldown <= 0 && hit) {
      doPlace(hit);
      placeCooldown = 0.25;
    }

    // Стрелы: полёт с гравитацией, попадания в блоки и мобов, подбор воткнутых
    projectiles.update(dt, world, mobManager.mobs, player.pos);

    // Камера (+ встряска при уроне и тряска при беге)
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = 0;
    // Беговая тряска начинается после двух секунд и мягко усиливается до предела.
    const isRunning = input.sprint && player.onGround && !player.flying && !player.inWater
      && (Math.abs(input.move.forward) + Math.abs(input.move.right) > 0.2);
    const runStrength = updateRunShake(runShake, isRunning, dt);
    if (isRunning) runBob += dt * 14;
    else {
      runBob += dt * 4 * Math.sin(runBob) * -0.5;
      if (Math.abs(Math.sin(runBob)) < 0.01) runBob = 0;
    }
    if (runStrength > 0.001) {
      const vbob = Math.sin(runBob) * 0.075 * runStrength;
      const hbob = Math.sin(runBob * 0.5) * 0.04 * runStrength;
      camera.position.y += Math.abs(vbob) * 0.9;
      camera.position.x += hbob * Math.cos(player.yaw);
      camera.position.z += hbob * Math.sin(player.yaw);
      camera.rotation.z += Math.sin(runBob) * 0.022 * runStrength;
      camera.rotation.x += vbob * 0.1;
    }
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeT / 0.45;
      const amp = 0.11 * k;
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
      camera.position.z += (Math.random() - 0.5) * amp;
      camera.rotation.z = (Math.random() - 0.5) * 0.09 * k + camera.rotation.z;
      camera.rotation.x += (Math.random() - 0.5) * 0.05 * k;
    } else {
      shakeT = 0;
    }

    // Небо, свет, вода, погода
    sky.update(dt, player.pos);
    weather.update(dt, player.pos, world, sky.lightLevel, {
      onFlash: (strike) => {
        particles.burst(strike.x, strike.y, strike.z, 0xb8dcff, 12);
      },
      onThunder: () => sfx.thunder(),
      onChange: (st) => {
        ui.toast(i18n.t(st === 'rain' ? 'rain_start' : 'rain_stop'));
        sfx.setRainLevel(st === 'rain' ? 1 : 0);
      },
    });
    sfx.setRainLevel(weather.wetness);
    const L = sky.lightLevel;
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);
    mobManager.setLight(L);
    mobManager.update(dt, player, true);

    // Сверчки по ночам в ясную погоду
    cricketsT -= dt;
    if (cricketsT <= 0) {
      cricketsT = 2 + Math.random() * 4;
      if (sky.lightLevel < 0.35 && weather.wetness < 0.05) sfx.cricket();
    }
    ui.setUnderwater(player.headInWater);
    if (player.headInWater) {
      scene.fog.near = 2; scene.fog.far = 18;
      scene.fog.color.setHex(0x1a4a8a);
      scene.background = scene.fog.color;
    }

    particles.update(dt);
    ui.setDebug(debugVisible, fpsEma, player.pos, L);
    checkOrientation();
  } else if (world && player) {
    // В меню/паузе — медленный облёт вокруг игрока, живой фон
    input.consumeLook();
    input.clearPresses();
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    if (state !== 'inventory') player.yaw += dt * 0.05;
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    sky.update(dt * 0.3, player.pos);
    const L = sky.lightLevel;
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);
    mobManager.setLight(L);
    mobManager.update(dt * 0.5, player.pos, false);
    if (world) weather.update(dt * 0.5, player.pos, world, L, {});
    sfx.setRainLevel(weather.wetness);
  }

  if (state !== 'game') eat.reset();
  updateTorchVisuals(dt);
  updateHeldLight(now);
  updateHand(dt, sky.lightLevel ?? 1);
  renderer.render(scene, camera);
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); debugVisible = !debugVisible; }
});

// ---------------------------------------------------------------- Старт
(async function boot() {
  ui.applyI18n();
  ui.setLoading(0.02, i18n.t('loading'));

  // SDK Яндекс Игр инициализируется параллельно
  const ysdkPromise = ysdk.init({
    onPause: () => ui.showAdOverlay(true),
    onResume: () => ui.showAdOverlay(false),
  });

  await ysdkPromise;
  worldProfile = normalizeWorldProfile(await ysdk.load());
  for (const record of worldProfile.worlds) {
    if (record.save) record.save = migrateSave(record.save);
  }
  activeWorldRecord = worldProfile.worlds.find((entry) => entry.id === worldProfile.activeWorldId) || null;
  saveData = activeWorldRecord?.save || null;
  const loadedSettings = Object.keys(worldProfile.settings).length ? worldProfile.settings : saveData?.settings;
  if (loadedSettings) applyLoadedSettings(loadedSettings);
  if (!loadedSettings?.lang && ysdk.lang === 'en') {
    settings.lang = 'en';
    i18n.setLang('en');
  }
  settings.paletteUnlocked = !!worldProfile.paletteUnlocked || !!saveData?.paletteUnlocked;
  ui.applySettings(settings);
  ui.applyI18n();
  ui.setRewardButton(settings.paletteUnlocked);

  ui.setLoading(0.08, i18n.t('ready'));
  state = 'menu';
  ui.showScreen('menu-screen');

  refreshWorldMenu();

  frame();
})();

function applyLoadedSettings(s) {
  if (!s) return;
  settings.volume = s.volume ?? settings.volume;
  settings.sound = s.sound !== false;
  settings.lang = s.lang || settings.lang;
  settings.viewDistance = s.viewDistance || settings.viewDistance;
  settings.fullscreen = s.fullscreen !== false;
  input.allowFullscreen = settings.fullscreen;
  i18n.setLang(settings.lang);
  sfx.setVolume(settings.sound ? settings.volume : 0);
  sfx.setEnabled(settings.sound);
}

// Экспорт для отладки в консоли
window.VoxelCraft = {
  get state() { return state; },
  get mode() { return mode; },
  get inventory() { return inventory; },
  get invUI() { return invUI; },
  /** Что сейчас в руке (для тестов и отладки) */
  get hand() {
    const mesh = heldGroup.children[0];
    return {
      held: heldKey,
      meshKind: mesh ? (mesh.userData.isSprite ? 'sprite' : 'cube') : null,
      visible: heldGroup.visible,
    };
  },
  get world() { return world; },
  get player() { return player; },
  get scene() { return scene; },
  get renderer() { return renderer; },
  get camera() { return camera; },
  get mobs() { return mobManager; },
  get weather() { return weather; },
  get sky() { return sky; },
  get items() { return items; },
};
