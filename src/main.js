// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, blockBounds, isSlab, isSolid, isDecor } from './blocks.js';
import { ITEM, blockItem, blockIdOf, blockDropItem, breakTime, itemDamage, itemName, placeBlockId, isBlockItem, itemDef, foodValue } from './items.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { craft, needsTable, FURNACE_RECIPES, furnaceFuel, smelt } from './crafts.js';
import { InventoryUI, setFullToast } from './inventory-ui.js';
import { itemIconCanvas, itemIconEl } from './icons.js';
import { buildAtlas, tileColor, tileTexture, CRACK_TILES } from './textures.js';
import { World } from './world.js';
import { migrateSave } from './save-migration.js';
import { meshChunk } from './mesher.js';
import { MobManager } from './mobs.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { ItemDrops } from './items.js';
import { Arrows, buildArrowModel, arrowMaterials } from './projectiles.js';
import { Eating } from './eating.js';
import { Sky } from './sky.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { I18n } from './i18n.js';
import { Ysdk } from './ysdk.js';

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
let mode = 'survival';           // 'survival' | 'creative'
let menuMode = 'survival';
let inventory = new Inventory(CONFIG.INV_SIZE);
let activeFurnace = null;
let hotbarIndex = 0;
let saveData = null;
let sessionStart = 0;
let interstitialShown = 0;
let debugVisible = false;
let pickToastT = 0;              // чтобы не спамить тостами о подобранных блоках
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

const atlasCanvas = buildAtlas();
const atlasTex = new THREE.CanvasTexture(atlasCanvas);
atlasTex.magFilter = THREE.NearestFilter;
atlasTex.minFilter = THREE.NearestFilter;
atlasTex.generateMipmaps = false;
atlasTex.colorSpace = THREE.SRGBColorSpace;

const terrainMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
const waterMat = new THREE.MeshBasicMaterial({
  map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72,
  depthWrite: false, side: THREE.DoubleSide,
});

const torchMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });

// Недорогой локальный свет на вершинах: до шести ближайших факелов.
// Днём влияние выключено, ночью блоки вокруг реально освещаются, но
// количество источников и сложность шейдера не зависят от размера мира.
const TORCH_LIGHTS = 6;
const torchPositions = Array.from({ length: TORCH_LIGHTS }, () => new THREE.Vector3(0, -1000, 0));
terrainMat.onBeforeCompile = (shader) => {
  shader.uniforms.torchPositions = { value: torchPositions };
  shader.uniforms.torchNight = { value: 0 };
  shader.uniforms.torchActive = { value: 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec3 torchPositions[6];\nuniform float torchActive;\nvarying float vTorchLight;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vTorchLight = 0.0;
      if (torchActive > 0.5) {
        // Вершины меша локальны для чанка, а позиции факелов — мировые.
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        for (int i = 0; i < 6; i++) {
          vec3 delta = worldPos - torchPositions[i];
          float falloff = max(0.0, 1.0 - dot(delta, delta) / 36.0);
          vTorchLight = max(vTorchLight, falloff * falloff);
        }
      }`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float torchNight;\nvarying float vTorchLight;')
    .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= vec3(1.0) + vec3(2.9, 1.9, 0.8) * (vTorchLight * torchNight);`);
  terrainMat.userData.torchShader = shader;
};
let torchRefreshT = 0;
let nearbyTorchCount = 0;
function updateTorchLights(dt, level) {
  const shader = terrainMat.userData.torchShader;
  if (shader) {
    shader.uniforms.torchNight.value = Math.max(0, 1 - level);
    shader.uniforms.torchActive.value = nearbyTorchCount > 0 && level < 0.98 ? 1 : 0;
  }
  if (!world || !player) return;
  torchRefreshT -= dt;
  if (torchRefreshT > 0) return;
  torchRefreshT = 0.35;
  const nearby = [];
  for (const key of world.torches) {
    const [x, y, z] = key.split(',').map(Number);
    const d2 = (x + 0.5 - player.pos.x) ** 2 + (y - player.pos.y) ** 2 + (z + 0.5 - player.pos.z) ** 2;
    if (d2 < 12 * 12) nearby.push({ x, y, z, d2 });
  }
  nearby.sort((a, b) => a.d2 - b.d2);
  nearbyTorchCount = Math.min(TORCH_LIGHTS, nearby.length);
  if (shader) shader.uniforms.torchActive.value = nearbyTorchCount > 0 && level < 0.98 ? 1 : 0;
  for (let i = 0; i < TORCH_LIGHTS; i++) {
    const t = nearby[i];
    torchPositions[i].set(t ? t.x + 0.5 : 0, t ? t.y + 0.65 : -1000, t ? t.z + 0.5 : 0);
  }
}

const sky = new Sky(THREE, scene);
sky.viewDistance = settings.viewDistance;
const particles = new Particles(THREE, scene);
const mobManager = new MobManager(scene, null);
const weather = new Weather(THREE, scene);
const items = new ItemDrops(scene);
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
let gloomT = 20;
let gloomWarned = false;
// Звуки мобов с затуханием по расстоянию
mobManager.onSound = (kind, dist, type) => {
  const vol = 1 / (1 + dist * 0.35);
  if (kind === 'hurt') sfx.mobHurt(type);
  else if (kind === 'growl') sfx.gloomGrowl(vol);
  else if (kind === 'hop') sfx.mobHop(vol);
  else if (kind === 'bleat') sfx.bleat(vol);
  else if (kind === 'chirp') sfx.chirp(vol);
  else if (kind === 'gloom') sfx.gloom(vol);
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
  new THREE.MeshBasicMaterial({ color: 0xd9a27a, depthTest: false, depthWrite: false }),
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
      transparent: true,
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
      map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    }));
  }
  return SPRITE_MATS.get(key);
}

const heldGeo = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  quad: new THREE.PlaneGeometry(1, 1),
};

// Материалы объёмных моделей предметов (инструменты, палка, яблоко).
// depthTest выключен — предмет в руке всегда рисуется поверх мира.
const ITEM_MATS = new Map();
function itemMat(color) {
  const key = color >>> 0;
  if (!ITEM_MATS.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
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

function buildHeldMesh(key) {
  const def = itemDef(key);
  if (!def) return null;
  let mesh;
  if (def.kind === 'block') {
    const b = BLOCKS[def.block];
    const [top, bottom, side] = b.tiles;
    const mats = [
      tileMaterial(side), tileMaterial(side),
      tileMaterial(top), tileMaterial(bottom),
      tileMaterial(side), tileMaterial(side),
    ];
    mesh = new THREE.Mesh(heldGeo.cube, mats);
    mesh.scale.setScalar(0.24);
    mesh.rotation.set(0.25, -0.75, 0.12);
    mesh.position.set(0.02, -0.02, -0.32);
  } else if (def.kind === 'tool') {
    // Инструменты — объёмные модели: рукоять, голова, гарда. Крупнее иконки и с наклоном
    mesh = buildToolModel(def.tool, def.tier);
    mesh.scale.setScalar(0.6);
    mesh.rotation.set(-0.22, -0.55, 0.72);
    mesh.position.set(0.05, -0.08, -0.32);
  } else if (def.icon === 'stick') {
    mesh = buildToolModel('stick', 'wood');
    mesh.scale.setScalar(0.55);
    mesh.rotation.set(-0.22, -0.55, 0.78);
    mesh.position.set(0.04, -0.07, -0.32);
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
  mesh.renderOrder = 1000;
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

// ---------------------------------------------------------------- Лук в руке (вид от первого лица)
// Дуга собрана из сегментов окружности, тетива тянется при натяжении,
// на тетиве лежит готовая стрела
const BOW_TIP = 0.2539;
const BOW_ANG = 1.0;
const bowPivot = new THREE.Group();
const bowMats = {
  wood: bowMaterial(0x8b5a2b),
  woodDark: bowMaterial(0x633f1a),
  edge: bowMaterial(0xbb884d),
  brass: bowMaterial(0xdac47e),
  string: bowMaterial(0xe8e8ee),
  hand: bowMaterial(0xc98f63),
};
bowPivot.scale.setScalar(1.5); // лук крупнее исходной модели, с читаемой тетивой
function bowMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  m.userData.baseColor = color;
  return m;
}
let bowStringUpper, bowStringLower;
{
  const R = 0.3, D = 0.16, SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const a0 = -BOW_ANG + 2 * BOW_ANG * (i / SEG);
    const a1 = -BOW_ANG + 2 * BOW_ANG * ((i + 1) / SEG);
    const y0 = R * Math.sin(a0), z0 = D - R * Math.cos(a0);
    const y1 = R * Math.sin(a1), z1 = D - R * Math.cos(a1);
    const len = Math.hypot(y1 - y0, z1 - z0);
    const grip = i === 2 || i === 3;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, len * 1.1, 0.036),
      grip ? bowMats.woodDark : bowMats.wood,
    );
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = (a0 + a1) / 2;
    bowPivot.add(seg);
    // Светлая накладка подчёркивает изгиб каждого плеча.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.012, len * 0.9, 0.015), bowMats.edge);
    edge.position.set(0.018, (y0 + y1) / 2, (z0 + z1) / 2 + 0.02);
    edge.rotation.x = seg.rotation.x;
    bowPivot.add(edge);
  }
  for (const sign of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.055, 0.062), bowMats.brass);
    tip.position.set(0, sign * BOW_TIP, D - R * Math.cos(BOW_ANG));
    bowPivot.add(tip);
  }
  const stringGeo = new THREE.BoxGeometry(0.011, 1, 0.011).translate(0, -0.5, 0);
  bowStringUpper = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringUpper.position.set(0, BOW_TIP, 0);
  bowStringLower = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringLower.position.set(0, -BOW_TIP, 0);
  bowStringLower.rotation.z = Math.PI;
  bowPivot.add(bowStringUpper, bowStringLower);
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.13), bowMats.hand);
  fist.position.set(0.005, -0.03, D - R + 0.035);
  bowPivot.add(fist);
}
const nockedArrow = buildArrowModel(1, arrowMaterials());
nockedArrow.rotation.y = Math.PI;
nockedArrow.visible = false;
nockedArrow.traverse((o) => {
  if (o.isMesh) { o.material.depthTest = false; o.material.depthWrite = false; }
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
  for (const m of [bowMats.wood, bowMats.woodDark, bowMats.edge, bowMats.brass, bowMats.string, bowMats.hand]) {
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
  ui.toast(i18n.t(key === ITEM.BREAD ? 'bread_eaten' : 'eat_ok'), 1400);
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

function fitBlockOutline(mesh, hit, padding = 0) {
  const b = blockBounds(hit.id);
  mesh.position.set(hit.x + (b.minX + b.maxX) / 2, hit.y + (b.minY + b.maxY) / 2,
    hit.z + (b.minZ + b.maxZ) / 2);
  mesh.scale.set(b.maxX - b.minX + padding, b.maxY - b.minY + padding, b.maxZ - b.minZ + padding);
}

function showCrack(hit, progress) {
  crackMesh.visible = true;
  fitBlockOutline(crackMesh, hit, 0.012);
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

function buildChunkMesh(cx, cz) {
  const chunk = world.getChunk(cx, cz);
  const { opaque, water, torch } = meshChunk(THREE, world, cx, cz);

  if (!chunk.meshOpaque) {
    chunk.meshOpaque = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
    scene.add(chunk.meshOpaque);
  }
  if (!chunk.meshWater) {
    chunk.meshWater = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
    scene.add(chunk.meshWater);
  }
  if (!chunk.meshTorch) {
    chunk.meshTorch = new THREE.Mesh(new THREE.BufferGeometry(), torchMat);
    scene.add(chunk.meshTorch);
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
  chunk.meshTorch.geometry.dispose();
  chunk.meshTorch.geometry = torch.isEmpty() ? new THREE.BufferGeometry() : torch.toGeometry(THREE);
  chunk.meshTorch.visible = !torch.isEmpty();
  chunk.dirty = false;
}

function disposeChunkMeshes(c) {
  if (c.meshOpaque) { scene.remove(c.meshOpaque); c.meshOpaque.geometry.dispose(); c.meshOpaque = null; }
  if (c.meshWater) { scene.remove(c.meshWater); c.meshWater.geometry.dispose(); c.meshWater = null; }
  if (c.meshTorch) { scene.remove(c.meshTorch); c.meshTorch.geometry.dispose(); c.meshTorch = null; }
}

// ---------------------------------------------------------------- Инвентарь и хотбар
// Каталог креатива: все блоки (кроме воздуха и воды) и предметы
const CATALOG_KEYS = [
  ...BLOCKS.filter((b) => b.id !== BLOCK.AIR && b.id !== BLOCK.WATER).map((b) => blockItem(b.id)),
  ITEM.STICK, ITEM.APPLE, ITEM.BOW, ITEM.ARROW, ITEM.BREAD, ITEM.WHEAT,
  ITEM.COAL, ITEM.ORE, ITEM.GOLD_ORE, ITEM.DIAMOND, ITEM.INGOT, ITEM.GOLD_INGOT,
  ITEM.WOOD_PICKAXE, ITEM.WOOD_AXE, ITEM.WOOD_SWORD, ITEM.STONE_PICKAXE, ITEM.STONE_SWORD,
];

function catalogEntries() {
  const unlocked = settings.paletteUnlocked || isCreative();
  return CATALOG_KEYS.map((key) => ({
    key,
    locked: !unlocked && isBlockItem(key) && BUILDER_PALETTE.includes(blockIdOf(key)),
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
  if (player) ui.setXP(player.level, player.xp, player.xpNeeded(), mode);
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

// Ближайший моб под прицелом (птиц бить нельзя)
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
  if (killed) mob.rewardXP = true;
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
  if (killed) m.rewardXP = true;
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
  if (isSurvival() && (id === BLOCK.TALL_GRASS || id === BLOCK.FERN) && Math.random() < 0.38) {
    items.spawn(hit.x + 0.5, hit.y + 0.55, hit.z + 0.5, ITEM.WHEAT);
  }
  swingHand(0.45);
  decorBreakCd = 0.12;
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
  ui.setBreakProgress(0);
  // В выживании сорванное растение падает в инвентарь
  if (isSurvival()) {
    const drop = blockDropItem(id);
    if (drop) {
      const left = inventory.add(drop, 1);
      refreshHotbar();
      if (left > 0) ui.toast(i18n.t('inv_full'), 1600);
    }
  }
}

function doBreak(hit) {
  if (!hit) return;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER) return;
  if (isDecor(id)) return breakDecor(hit);
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  // Факел над разрушенной опорой тоже падает (не оставляем свет в воздухе).
  if (world.getBlock(hit.x, hit.y + 1, hit.z) === BLOCK.TORCH) {
    world.setBlock(hit.x, hit.y + 1, hit.z, BLOCK.AIR);
    if (isSurvival()) giveItem(blockItem(BLOCK.TORCH), 1);
  }
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  // С листвы иногда падает яблоко
  if (id === BLOCK.LEAVES && Math.random() < 0.14) {
    items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 'apple');
  }
  // В выживании сломанный блок падает в инвентарь
  if (isSurvival()) {
    const drop = blockDropItem(id);
    if (drop && [ITEM.ORE, ITEM.COAL, ITEM.GOLD_ORE, ITEM.DIAMOND].includes(drop)) {
      items.spawn(hit.x + 0.5, hit.y + 0.72, hit.z + 0.5, drop);
    } else if (drop) {
      const left = inventory.add(drop, 1);
      refreshHotbar();
      if (left === 0 && performance.now() - pickToastT > 2500) {
        pickToastT = performance.now();
        ui.toast(`${i18n.t('block_drop')}: ${itemName(drop, i18n.lang)}`, 1200);
      } else if (left > 0) {
        ui.toast(i18n.t('inv_full'), 1600);
      }
    }
  }
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
}

function handleDeath() {
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
  ui.setHealth(player.hp, player.maxHp);
  ui.toast(i18n.t('died'), 2200);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('respawned'), 2400), 2300);
}

function tryEat() {
  if (!player || state !== 'game') return;
  const key = heldItem() === ITEM.BREAD && inventory.has(ITEM.BREAD) ? ITEM.BREAD
    : inventory.has(ITEM.APPLE) ? ITEM.APPLE
      : inventory.has(ITEM.BREAD) ? ITEM.BREAD : null;
  if (!key) { ui.toast(i18n.t('eat_none'), 1400); return; }
  if (player.hp >= player.maxHp) return;
  inventory.remove(key, 1);
  refreshHotbar();
  sfx.crunch();
  player.heal(foodValue(key));
  ui.setHealth(player.hp, player.maxHp);
  ui.toast(i18n.t(key === ITEM.BREAD ? 'bread_eaten' : 'eat_ok'), 1600);
}

function doPlace(hit) {
  if (!hit || state !== 'game') return;
  // ПКМ по верстаку/печке открывает интерфейс; Shift позволяет строить рядом.
  const sneaking = input.sneak || input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  if (hit.id === BLOCK.FURNACE && !sneaking) { openFurnace(hit); return; }
  if (hit.id === BLOCK.TABLE && !sneaking) {
    if (performance.now() - tableClosedT > 400) openTable();
    return;
  }
  const held = heldItem();
  const selected = placeBlockId(held);
  if (!selected) { swingHand(0.6); return; }
  const onDecor = isDecor(hit.id);
  let x = onDecor ? hit.x : hit.x + hit.nx;
  let y = onDecor ? hit.y : hit.y + hit.ny;
  let z = onDecor ? hit.z : hit.z + hit.nz;
  let id = selected;
  if (isSlab(selected)) {
    const wooden = selected === BLOCK.PLANK_SLAB || selected === BLOCK.PLANK_SLAB_TOP;
    const bottom = wooden ? BLOCK.PLANK_SLAB : BLOCK.COBBLE_SLAB;
    const top = wooden ? BLOCK.PLANK_SLAB_TOP : BLOCK.COBBLE_SLAB_TOP;
    if ((hit.id === bottom && hit.ny === 1) || (hit.id === top && hit.ny === -1)) {
      // Второй такой же полублок превращает пару в целый блок.
      x = hit.x; y = hit.y; z = hit.z;
      id = wooden ? BLOCK.PLANKS : BLOCK.COBBLE;
    } else {
      id = hit.ny < 0 || (hit.ny === 0 && hit.py - hit.y > 0.5) ? top : bottom;
    }
  }
  const cur = world.getBlock(x, y, z);
  const stacking = isSlab(cur) && (id === BLOCK.PLANKS || id === BLOCK.COBBLE) &&
    ((cur === BLOCK.PLANK_SLAB || cur === BLOCK.PLANK_SLAB_TOP) ? id === BLOCK.PLANKS : id === BLOCK.COBBLE);
  if (!stacking && cur !== BLOCK.AIR && cur !== BLOCK.WATER && !isDecor(cur)) return;
  if (id === BLOCK.TORCH) {
    const below = world.getBlock(x, y - 1, z);
    if ((hit.ny !== 1 && !onDecor) || cur === BLOCK.WATER || !isSolid(below) || blockBounds(below).maxY !== 1) {
      ui.toast(i18n.t('torch_floor'), 1400);
      return;
    }
  }
  const b = blockBounds(id), hw = CONFIG.PLAYER_WIDTH / 2 + 0.01;
  const overlap = x + b.maxX > player.pos.x - hw && x + b.minX < player.pos.x + hw &&
    y + b.maxY > player.pos.y && y + b.minY < player.pos.y + CONFIG.PLAYER_HEIGHT &&
    z + b.maxZ > player.pos.z - hw && z + b.minZ < player.pos.z + hw;
  if (overlap && isSolid(id)) return;
  if (isDecor(cur)) {
    if (isDecor(id) && cur === id) return;
    particles.burst(x, y, z, tileColor(BLOCKS[cur].tiles[0]), 8);
    sfx.breakBlock(breakKind(cur));
  }
  if (world.setBlock(x, y, z, id)) {
    swingHand(0.6);
    sfx.place();
    particles.burst(x, y, z, tileColor(BLOCKS[id].tiles[0]), 5);
    if (isSurvival()) { inventory.remove(held, 1); refreshHotbar(); }
    blocksBuilt++;
    ui.setBlocksBuilt(blocksBuilt);
    ysdk.setStats({ blocksBuilt });
  }
}

// ---------------------------------------------------------------- Сохранение
function buildSave() {
  return {
    v: 3,
    mode,
    inventory: inventory.serialize(),
    drops: items.serialize(),
    hotbarIndex,
    seed: world.seed,
    edits: world.serializeEdits(),
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

async function saveGame(showToast = false) {
  if (!world || !player) return;
  const data = buildSave();
  const ok = await ysdk.save(data);
  if (ok) saveData = data;
  if (showToast) ui.toast(i18n.t(ok ? 'saved' : 'save_fail'));
}

function attachPlayerEvents() {
  mobManager.onAttack = (mob) => {
    if (!isSurvival()) return;             // в креативе игрок бессмертен
    const dx = player.pos.x - mob.pos.x, dz = player.pos.z - mob.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (player.hurt(mob.type === 'gloom' ? 3 : 2)) {
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
        const dmg = Math.max(2, Math.round(7 - d));
        const dl = Math.hypot(dx, dz) || 1;
        if (player.hurt(dmg)) {
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
    const color = mob.type === 'gloom' ? 0x2a2140
      : mob.type === 'creeper' ? 0x6cc24a
        : mob.type === 'spider' ? 0x12141d
          : mob.type === 'wolf' ? 0xd6d2ca
            : mob.type === 'fish' ? 0xb8ccd8 : 0xd03232;
    particles.burst(mob.pos.x, mob.pos.y + mob.centerY(), mob.pos.z, color, 16);
    // Только убийство игроком даёт опыт: рассветное сгорание не награждает.
    if (mob.rewardXP && (mob.hostile || mob.type === 'slime' || mob.type === 'wolf')) {
      const count = mob.type === 'slime' ? 1 : 2;
      for (let i = 0; i < count; i++) {
        items.spawn(mob.pos.x + (Math.random() - 0.5) * 0.4,
          mob.pos.y + 0.7, mob.pos.z + (Math.random() - 0.5) * 0.4, 'xp', 2);
      }
    }
  };
  items.onPickup = (kind, amount = 1) => {
    if (kind === 'xp') {
      const levels = player.addXP(amount);
      sfx.xp();
      ui.setXP(player.level, player.xp, player.xpNeeded(), mode);
      if (levels) ui.toast(i18n.t('xp_level') + ' ' + player.level);
      return true;
    }
    if (inventory.spaceFor(kind) < amount) return false;
    const first = inventory.count(kind) === 0;
    inventory.add(kind, amount);
    refreshHotbar();
    sfx.pickup();
    if (first && kind === ITEM.APPLE) ui.toast(i18n.t('apple_get'), 2800);
    if (first && [ITEM.ORE, ITEM.GOLD_ORE, ITEM.DIAMOND].includes(kind))
      ui.toast(i18n.t('ore_get'), 2800);
    return true;
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
  player.events.onDeath = () => handleDeath();
  player.events.onSplash = () => sfx.splash();
}

// ---------------------------------------------------------------- Режим игры
function applyMode() {
  const creative = isCreative();
  player.invulnerable = creative;
  player.canFly = creative;
  if (!creative) player.stopFly();
  ui.setModeSelectors(mode);
  ui.setHealthVisible(!creative);
  ui.setFlyButton(creative);
  ui.setApples(inventory.count(ITEM.APPLE), mode);
  ui.setArrows(arrowAmmo(), mode);
  ui.setXP(player.level, player.xp, player.xpNeeded(), mode);
  ui.setRewardButton(settings.paletteUnlocked);
  if (creative) player.hp = player.maxHp;
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
  menuMode = mode;
  ui.setModeSelectors(menuMode);
  ui.setRewardButton(settings.paletteUnlocked);
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
    saveGame();
  } else {
    ui.toast(i18n.t('reward_fail'), 3200);
  }
}

// ---------------------------------------------------------------- Инициализация мира
async function startWorld(opts = {}) {
  ui.showScreen('loading-screen');
  ui.setLoading(0.05, i18n.t('loading'));

  const data = opts.fresh ? null : saveData;
  const seed = (data?.seed != null) ? data.seed : ((Math.random() * 0x7fffffff) | 0);
  // Выбор в меню переопределяет сохранённый режим; старые сейвы без режима — креатив.
  mode = opts.mode === 'survival' || opts.mode === 'creative' ? opts.mode
    : data ? (data.mode === 'survival' ? 'survival' : 'creative') : 'survival';
  menuMode = mode;
  ui.setModeSelectors(mode);
  if (world) {
    for (const chunk of world.chunks.values()) disposeChunkMeshes(chunk);
    world.chunks.clear();
  }
  world = new World(seed);
  player = new Player(world);
  mobManager.clear();
  items.clear();
  activeFurnace = null;
  gloomT = 20 + Math.random() * 15;
  torchRefreshT = 0;
  nearbyTorchCount = 0;
  for (const p of torchPositions) p.set(0, -1000, 0);
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
    inventory.add(blockItem(BLOCK.TORCH), 4);
    inventory.add(blockItem(BLOCK.FURNACE), 1);
    inventory.add(ITEM.BREAD, 2);
  }
  attachPlayerEvents();

  if (data) {
    world.loadEdits(data.edits || []);
    items.load(data.drops);
    if (Array.isArray(data.inventory)) inventory.deserialize(data.inventory);
    hotbarIndex = Math.max(0, Math.min(HOTBAR_SIZE - 1, data.hotbarIndex || 0));
    settings.paletteUnlocked = !!data.paletteUnlocked;
    blocksBuilt = data.blocksBuilt || 0;
    ui.setBlocksBuilt(blocksBuilt);
    if (data.settings) {
      settings.volume = data.settings.volume ?? settings.volume;
      settings.sound = data.settings.sound !== false;
      settings.lang = data.settings.lang || settings.lang;
      settings.viewDistance = data.settings.viewDistance || settings.viewDistance;
    settings.fullscreen = data.settings.fullscreen !== false;
    input.allowFullscreen = settings.fullscreen;
    }
    if (data.time != null) sky.setTime(data.time);
    i18n.setLang(settings.lang);
    sfx.setVolume(settings.volume);
    sfx.setEnabled(settings.sound);
  } else {
    settings.paletteUnlocked = false;
    sky.setTime(0.3);
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
    if (player.collides(player.pos.x, player.pos.y, player.pos.z)) player.pos.y += 2;
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

  // Появляются позади игрока, не перед камерой и не в дневной свет ночью.
  sky.update(0, player.pos);
  mobManager.setNight(sky.lightLevel < 0.32);
  for (let i = 0; i < 3; i++) mobManager.trySpawn(player.pos, player.yaw);
  ui.setHealth(player.hp, player.maxHp);
  applyMode();
  refreshHotbar();

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» имеет смысл и до первого сохранения

  enterGame();
}

// ---------------------------------------------------------------- Печка: обжиг руды и выпечка хлеба
function renderFurnace() {
  const stock = document.getElementById('furnace-stock');
  const list = document.getElementById('furnace-recipes');
  if (!stock || !list) return;
  const plank = blockItem(BLOCK.PLANKS);
  stock.textContent = `${i18n.t('furnace_fuel')}: ${itemName(ITEM.COAL, i18n.lang)} ×${inventory.count(ITEM.COAL)} · `
    + `${itemName(plank, i18n.lang)} ×${inventory.count(plank)}`;
  list.replaceChildren();
  for (const recipe of FURNACE_RECIPES) {
    const button = document.createElement('button');
    button.className = 'furnace-recipe';
    button.disabled = isSurvival() && (!furnaceFuel(inventory) ||
      Object.entries(recipe.in).some(([key, need]) => !inventory.has(key, need)) ||
      inventory.spaceFor(recipe.out.key) < recipe.out.count);
    const icon = itemIconEl(recipe.out.key, 40);
    if (icon) button.appendChild(icon);
    const info = document.createElement('div');
    info.className = 'recipe-info';
    const title = document.createElement('div');
    title.className = 'recipe-name';
    title.textContent = `${itemName(recipe.out.key, i18n.lang)} ×${recipe.out.count}`;
    const ing = document.createElement('div');
    ing.className = 'recipe-ing';
    ing.textContent = Object.entries(recipe.in)
      .map(([key, need]) => `${itemName(key, i18n.lang)} ${inventory.count(key)}/${need}`).join(' · ');
    info.append(title, ing);
    button.appendChild(info);
    button.addEventListener('click', () => {
      if (state !== 'furnace' || !activeFurnace) return;
      if (world.getBlock(activeFurnace.x, activeFurnace.y, activeFurnace.z) !== BLOCK.FURNACE) {
        closeFurnace(); return;
      }
      const result = isCreative() ? (inventory.add(recipe.out.key, recipe.out.count) === 0 ? 'ok' : 'full')
        : smelt(inventory, recipe);
      if (result === 'ok') {
        sfx.craft();
        ui.toast(`${i18n.t('craft_ok')}: ${itemName(recipe.out.key, i18n.lang)}`, 1600);
        refreshHotbar();
      } else ui.toast(i18n.t(result === 'full' ? 'craft_no_room' : 'furnace_missing'), 1700);
      renderFurnace();
    });
    list.appendChild(button);
  }
}

function openFurnace(hit) {
  if (state !== 'game') return;
  activeFurnace = { x: hit.x, y: hit.y, z: hit.z };
  state = 'furnace';
  input.enabled = false;
  input.keys.clear();
  input.mouse.left = input.mouse.right = false;
  ysdk.gameplayStop();
  if (document.pointerLockElement) document.exitPointerLock?.();
  renderFurnace();
  ui.showScreen('furnace-screen');
  ui.setTouchVisible(false);
  sfx.uiClick();
}

function closeFurnace() {
  if (state !== 'furnace') return;
  activeFurnace = null;
  resumeGame();
  refreshHotbar();
}

// ---------------------------------------------------------------- Инвентарь: окно
function openInventory(gridSize = 2) {
  if (state !== 'game' || !world) return;
  if (gridSize !== invUI.gridSize) invUI.setGridSize(gridSize);
  state = 'inventory';
  input.enabled = false;
  input.keys.clear();
  input.mouse.left = false;
  input.mouse.right = false;
  ysdk.gameplayStop();
  if (document.pointerLockElement) document.exitPointerLock?.();
  invUI.show({ inv: inventory, mode, hotbarIndex, catalog: catalogEntries(), gridSize });
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
ui.handlers.onPlay = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  startWorld({ fresh: !saveData, mode: menuMode });
};
ui.handlers.onNewWorld = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  showModeScreen();      // сейв затрётся только после выбора режима
};
ui.handlers.onMode = (m) => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  menuMode = m;
  ui.setModeSelectors(m);
  saveData = null;
  startWorld({ fresh: true, mode: m });
};
ui.handlers.onModeChange = (m, source) => {
  if (source === 'mode-menu') {
    menuMode = m;
    ui.setRewardButton(settings.paletteUnlocked);
    return;
  }
  if (source !== 'mode-pause' || !player) return;
  mode = m;
  menuMode = m;
  applyMode();
  refreshHotbar();
  refreshCatalog();
  ui.toast(`${i18n.t('mode_now')}: ${i18n.t(m === 'survival' ? 'mode_survival' : 'mode_creative')}`, 1800);
  saveGame();
};
ui.handlers.onModeBack = () => {
  sfx.uiClick();
  ui.showScreen('menu-screen');
};
ui.handlers.onBag = () => toggleInventory();
ui.handlers.onCloseFurnace = () => closeFurnace();
ui.handlers.onEat = () => tryEat();
ui.handlers.onResume = () => { input.enterFullscreen(); sfx.uiClick(); resumeGame(); };
ui.handlers.onSaveQuit = async () => { sfx.uiOk(); await saveAndQuit(); };
ui.handlers.onReward = () => requestReward();
ui.handlers.onSlot = (i) => {
  selectHotbar(i);
  sfx.uiClick();
};
ui.handlers.onPauseBtn = () => pauseGame();
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
  saveGame();
};

function showModeScreen() {
  ui.showScreen('mode-screen');
}

input.handlers.onPause = () => {
  if (state === 'inventory') { closeInventory(); return; }
  if (state === 'furnace') { closeFurnace(); return; }
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
  if (state !== 'game' || isBowSelected()) return;
  doPlace(pickTarget());
  placeCooldown = 0.25; // правый клик не повторяет постановку в следующем кадре
};
// Короткий клик между кадрами тоже должен открыть печку, поставить блок или ударить.
window.addEventListener('mousedown', (e) => {
  if (state !== 'game' || input.isTouch || !input.locked) return;
  if (e.button === 2) input.handlers.onActionPlace();
  if (e.button === 0 && !heldFood()) {
    const mob = findMobTarget();
    if (mob && attackCd <= 0) { attackCd = 0.36; hitMob(mob); }
    else if (!mob) input.handlers.onActionBreak();
  }
});

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
setInterval(() => { if (state === 'game') saveGame(); }, CONFIG.AUTO_SAVE_SEC * 1000);

// ---------------------------------------------------------------- Главный цикл
let lastT = performance.now();
let fpsEma = 60;
let sprintPhase = 0;
let sprintStrength = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  let dt = (now - lastT) / 1000;
  lastT = now;
  dt = Math.min(dt, 0.05);
  fpsEma = fpsEma * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;

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

    // --- Выживание: предметы, еда, ночные Хмари ---
    items.update(dt, world, player.pos);
    if (input.consumePress('KeyF')) tryEat();

    mobManager.setNight(sky.lightLevel < 0.32);
    if (sky.lightLevel < 0.32) {
      gloomT -= dt;
      if (gloomT <= 0) {
        gloomT = 20 + Math.random() * 15;
        const spawned = mobManager.trySpawnGloom(player.pos, player.yaw);
        if (spawned && !gloomWarned) {
          gloomWarned = true;
          ui.toast(i18n.t('gloom_warn'), 3200);
        }
      }
    } else {
      gloomWarned = false;
    }

    // Удар по мобу (ЛКМ): можно бить всех, кроме птиц
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
      fitBlockOutline(highlight, hit, 0.008);
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

    // Лук: удержание ПКМ (или кнопки на тач-экране) натягивает тетиву, отпускание — выстрел
    const bowSel = isBowSelected();
    if (bowSel && input.placeHeld) {
      if (!bowCharging) {
        bowCharging = true;
        bowCharge = 0;
        sfx.bowDraw();
      }
      bowCharge = Math.min(1, bowCharge + dt / BOW_CHARGE_TIME);
    } else if (bowCharging) {
      bowCharging = false;
      fireBow(bowCharge);
      bowCharge = 0;
    }

    placeCooldown -= dt;
    if (!bowSel && input.placeHeld && placeCooldown <= 0 && hit) {
      doPlace(hit);
      placeCooldown = 0.25;
    }

    // Стрелы: полёт с гравитацией, попадания в блоки и мобов, подбор воткнутых
    projectiles.update(dt, world, mobManager.mobs, player.pos);

    // Камера (+ встряска при уроне)
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    const runTarget = player.sprinting && player.onGround
      ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / CONFIG.SPRINT_SPEED) : 0;
    sprintStrength += (runTarget - sprintStrength) * Math.min(1, dt * 10);
    if (sprintStrength > 0.001) sprintPhase += dt * 15;
    const sway = Math.sin(sprintPhase) * sprintStrength;
    camera.position.x += Math.cos(player.yaw) * sway * 0.024;
    camera.position.y += (Math.abs(Math.sin(sprintPhase)) - 0.55) * sprintStrength * 0.07;
    camera.position.z -= Math.sin(player.yaw) * sway * 0.024;
    camera.rotation.z = sway * 0.016;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeT / 0.45;
      const amp = 0.11 * k;
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
      camera.position.z += (Math.random() - 0.5) * amp;
      camera.rotation.z = (Math.random() - 0.5) * 0.09 * k;
      camera.rotation.x += (Math.random() - 0.5) * 0.05 * k;
    } else {
      shakeT = 0;
    }

    // Небо, свет, вода, погода
    sky.update(dt, player.pos);
    const flash = weather.update(dt, player.pos, world, sky.lightLevel, {
      onFlash: () => ui.flashLightning(),
      onThunder: () => sfx.thunder(),
      onChange: (st) => {
        ui.toast(i18n.t(st === 'rain' ? 'rain_start' : 'rain_stop'));
        sfx.setRainLevel(st === 'rain' ? 1 : 0);
      },
    });
    sfx.setRainLevel(weather.wetness);
    const L = Math.min(1, sky.lightLevel + flash * 0.7);
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);
    mobManager.setLight(L);
    updateTorchLights(dt, L);
    mobManager.update(dt, player.pos, true, player.yaw);

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
    if (state !== 'inventory' && state !== 'furnace') player.yaw += dt * 0.05;
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    sky.update(dt * 0.3, player.pos);
    const L = sky.lightLevel;
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);
    mobManager.setLight(L);
    updateTorchLights(dt * 0.5, L);
    mobManager.update(dt * 0.5, player.pos, false, player.yaw);
    if (world) weather.update(dt * 0.5, player.pos, world, L, {});
    sfx.setRainLevel(weather.wetness);
  }

  if (state !== 'game') eat.reset();
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

  saveData = migrateSave(await ysdk.load());
  const hasSave = !!saveData;

  await ysdkPromise;
  if (saveData?.settings) applyLoadedSettings(saveData.settings);
  if (!saveData?.settings?.lang && ysdk.lang === 'en') {
    settings.lang = 'en';
    i18n.setLang('en');
  }
  settings.paletteUnlocked = !!saveData?.paletteUnlocked;
  menuMode = saveData ? (saveData.mode === 'survival' ? 'survival' : 'creative') : 'survival';
  ui.applySettings(settings);
  ui.setModeSelectors(menuMode);
  ui.applyI18n();
  ui.setRewardButton(settings.paletteUnlocked);

  ui.setLoading(0.08, i18n.t('ready'));
  state = 'menu';
  ui.showScreen('menu-screen');

  ui.setHasSave(hasSave);

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
