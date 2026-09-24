// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, isSolid, isDecor } from './blocks.js';
import { ITEM, blockItem, blockIdOf, blockDropItem, breakTime, itemDamage, itemName, placeBlockId, isBlockItem } from './items.js';
import { Inventory, HOTBAR_SIZE } from './inventory.js';
import { craft } from './crafts.js';
import { InventoryUI } from './inventory-ui.js';
import { buildAtlas, tileColor, tileTexture, CRACK_TILES } from './textures.js';
import { World } from './world.js';
import { meshChunk } from './mesher.js';
import { MobManager } from './mobs.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { ItemDrops } from './items.js';
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
  paletteUnlocked: false,
};

let state = 'loading';           // loading | menu | game | pause | inventory
let world = null;
let player = null;
let mode = 'creative';           // 'survival' | 'creative'
let inventory = new Inventory(CONFIG.INV_SIZE);
let hotbarIndex = 0;
let saveData = null;
let sessionStart = 0;
let interstitialShown = 0;
let debugVisible = false;
let pickToastT = 0;              // чтобы не спамить тостами о подобранных блоках

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

const sky = new Sky(THREE, scene);
sky.viewDistance = settings.viewDistance;
const particles = new Particles(THREE, scene);
const mobManager = new MobManager(scene, null);
const weather = new Weather(THREE, scene);
const items = new ItemDrops(scene);
// Выживание
let attackCd = 0;
let shakeT = 0;                  // встряска камеры при уроне
let gloomT = 6;
let gloomWarned = false;
// Звуки мобов с затуханием по расстоянию
mobManager.onSound = (kind, dist, type) => {
  const vol = 1 / (1 + dist * 0.35);
  if (kind === 'hurt') sfx.mobHurt(type);
  else if (kind === 'hop') sfx.mobHop(vol);
  else if (kind === 'bleat') sfx.bleat(vol);
  else if (kind === 'chirp') sfx.chirp(vol);
  else if (kind === 'gloom') sfx.gloom(vol);
  else if (kind === 'die') sfx.mobDie();
  else if (kind === 'burn') sfx.burn();
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
function updateHand(dt, light) {
  handPivot.visible = state === 'game';
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
  hand.material.color.setHex(0xd9a27a).multiplyScalar(0.35 + 0.65 * light);
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
  chunk.dirty = false;
}

function disposeChunkMeshes(c) {
  if (c.meshOpaque) { scene.remove(c.meshOpaque); c.meshOpaque.geometry.dispose(); c.meshOpaque = null; }
  if (c.meshWater) { scene.remove(c.meshWater); c.meshWater.geometry.dispose(); c.meshWater = null; }
}

// ---------------------------------------------------------------- Инвентарь и хотбар
// Каталог креатива: все блоки (кроме воздуха и воды) и предметы
const CATALOG_KEYS = [
  ...BLOCKS.filter((b) => b.id !== BLOCK.AIR && b.id !== BLOCK.WATER).map((b) => blockItem(b.id)),
  ITEM.STICK, ITEM.APPLE,
  ITEM.WOOD_PICKAXE, ITEM.WOOD_AXE, ITEM.WOOD_SWORD, ITEM.STONE_PICKAXE, ITEM.STONE_SWORD,
];

function catalogEntries() {
  const unlocked = settings.paletteUnlocked;
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
    const cx = m.pos.x - eye.x, cy = m.pos.y + 0.5 - eye.y, cz = m.pos.z - eye.z;
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
function hitMob(m) {
  const dmg = itemDamage(heldItem());
  swingHand(1);
  const killed = m.hurt(dmg);
  m.squeak();
  sfx.hitMob();
  particles.burst(m.pos.x, m.pos.y + 0.5, m.pos.z, 0xd03232, 12);
  const kx = m.pos.x - player.pos.x, kz = m.pos.z - player.pos.z;
  m.knockback(kx, kz, 4.2);
  // Зайцы и овцы убегают
  if (m.type === 'bunny' || m.type === 'sheep') m.fleeFrom(player.pos);
  if (killed && (m.type === 'bunny' || m.type === 'sheep')) {
    // С зайца/овцы падают яблоки — приятный бонус выживания
    if (Math.random() < 0.5) items.spawn(m.pos.x, m.pos.y + 0.6, m.pos.z, 'apple');
  }
}

function doBreak(hit) {
  if (!hit) return;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER) return;
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  // С листвы иногда падает яблоко
  if (id === BLOCK.LEAVES && Math.random() < 0.14) {
    items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 'apple');
  }
  // В выживании сломанный блок падает в инвентарь
  if (isSurvival()) {
    const drop = blockDropItem(id);
    if (drop) {
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
  if (!inventory.has(ITEM.APPLE)) { ui.toast(i18n.t('eat_none'), 1400); return; }
  if (player.hp >= player.maxHp) return;
  inventory.remove(ITEM.APPLE, 1);
  refreshHotbar();
  sfx.crunch();
  player.heal(4);
  ui.setHealth(player.hp, player.maxHp);
  ui.toast(i18n.t('eat_ok'), 1600);
}

function doPlace(hit) {
  if (!hit) return;
  swingHand(0.6);
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
  const id = placeBlockId(held);
  if (!id) { swingHand(0.6); return; }   // в руке не блок — ставить нечего
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
    v: 2,
    mode,
    inventory: inventory.serialize(),
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
    },
  };
}

async function saveGame(showToast = false) {
  if (!world || !player) return;
  const ok = await ysdk.save(buildSave());
  if (showToast) ui.toast(i18n.t(ok ? 'saved' : 'save_fail'));
}

function attachPlayerEvents() {
  mobManager.onAttack = (mob) => {
    if (!isSurvival()) return;             // в креативе игрок бессмертен
    const dx = player.pos.x - mob.pos.x, dz = player.pos.z - mob.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (player.hurt(3)) {
      player.vel.x = (dx / dl) * 5;
      player.vel.z = (dz / dl) * 5;
      player.vel.y = 3;
      ui.setHealth(player.hp, player.maxHp);
    }
  };
  mobManager.onDeath = (mob) => {
    sfx.mobDie();
    const color = mob.type === 'gloom' ? 0x2a2140 : 0xd03232;
    particles.burst(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, color, 14);
  };
  items.onPickup = (kind) => {
    if (kind === 'apple') {
      const left = inventory.add(ITEM.APPLE, 1);
      refreshHotbar();
      sfx.pickup();
      if (left > 0) ui.toast(i18n.t('inv_full'), 1600);
      else if (inventory.count(ITEM.APPLE) === 1) ui.toast(i18n.t('apple_get'), 3200);
    }
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
  ui.setHealthVisible(!creative);
  ui.setFlyButton(creative);
  ui.setApples(inventory.count(ITEM.APPLE), mode);
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
    && ui.toast(i18n.t(isCreative() ? 'hint_fly' : 'hint_eat'), 3500), 11400);
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
  // Режим: из сохранения (старые сейвы — креатив) или выбранный в меню
  mode = data ? (data.mode === 'survival' ? 'survival' : 'creative')
    : (opts.mode === 'survival' ? 'survival' : 'creative');

  world = new World(seed);
  player = new Player(world);
  mobManager.clear();
  items.clear();
  inventory = new Inventory(CONFIG.INV_SIZE);
  invUI.hide();
  hotbarIndex = 0;
  if (mode === 'creative') {
    // В креативе стартовый хотбар — базовые блоки (бесконечные)
    STARTER_PALETTE.forEach((id, i) => inventory.setStack(i, { key: blockItem(id), count: 64 }));
  }
  mobManager.world = world;
  attachPlayerEvents();

  if (data) {
    world.loadEdits(data.edits || []);
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
    }
    if (data.time != null) sky.setTime(data.time);
    i18n.setLang(settings.lang);
    sfx.setVolume(settings.volume);
    sfx.setEnabled(settings.sound);
  } else {
    settings.paletteUnlocked = false;
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

  // Несколько мобов сразу, чтобы мир был живым
  for (let i = 0; i < 5; i++) mobManager.trySpawn(player.pos);
  ui.setHealth(player.hp, player.maxHp);
  applyMode();
  refreshHotbar();

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» имеет смысл и до первого сохранения

  enterGame();
}

// ---------------------------------------------------------------- Инвентарь: окно
function openInventory() {
  if (state !== 'game' || !world) return;
  state = 'inventory';
  input.enabled = false;
  input.keys.clear();
  input.mouse.left = false;
  input.mouse.right = false;
  ysdk.gameplayStop();
  if (document.pointerLockElement) document.exitPointerLock?.();
  invUI.show({ inv: inventory, mode, hotbarIndex, catalog: catalogEntries() });
  ui.showScreen('inventory-screen');
  ui.setTouchVisible(false);
  sfx.uiClick();
}

function closeInventory() {
  if (state !== 'inventory') return;
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
invUI.handlers.onCraft = (recipe) => {
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

// ---------------------------------------------------------------- Обработчики UI
ui.handlers.onPlay = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  // Без сохранения «Играть» = новый мир: сначала выбор режима
  if (saveData) startWorld({ fresh: false });
  else showModeScreen();
};
ui.handlers.onNewWorld = () => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  showModeScreen();      // сейв затрётся только после выбора режима
};
ui.handlers.onMode = (m) => {
  input.enterFullscreen(); sfx.resume(); sfx.uiOk();
  saveData = null;
  startWorld({ fresh: true, mode: m });
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
  saveGame();
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
  const hit = pickTarget();
  if (!hit) return;
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
        gloomT = 7 + Math.random() * 7;
        const spawned = mobManager.trySpawnGloom(player.pos);
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
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }

    // Ломание: удержание ЛКМ/кнопки или быстрое по тапу (с анимацией трещин)
    let breaking = null;
    if (hit && !mobTarget) {
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

    placeCooldown -= dt;
    if (input.placeHeld && placeCooldown <= 0 && hit) {
      doPlace(hit);
      placeCooldown = 0.25;
    }

    // Камера (+ встряска при уроне)
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = 0;
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
    mobManager.update(dt, player.pos, true);

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

  saveData = await ysdk.load();
  const hasSave = !!saveData;

  await ysdkPromise;
  if (saveData?.settings) applyLoadedSettings(saveData.settings);
  if (!saveData?.settings?.lang && ysdk.lang === 'en') {
    settings.lang = 'en';
    i18n.setLang('en');
  }
  settings.paletteUnlocked = !!saveData?.paletteUnlocked;
  ui.applySettings(settings);
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
