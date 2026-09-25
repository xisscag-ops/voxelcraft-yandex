// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, blockBounds, blockDrop, isSolid, isDecor, isSlab } from './blocks.js';
import { buildAtlas, tileColor, tileTexture, CRACK_TILES } from './textures.js';
import { World } from './world.js';
import { meshChunk } from './mesher.js';
import { MobManager } from './mobs.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { ItemDrops } from './items.js';
import { Inventory, ITEM, RECIPES, blockKey, slotKey, starterInventory, itemName } from './inventory.js';
import { Arrows, createBowModel } from './bow.js';
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
let gameMode = 'survival';
let inventory = starterInventory();
let activeFurnace = null;
let palette = [...STARTER_PALETTE];
let hotbarIndex = 0;
let saveData = null;
let sessionStart = 0;
let interstitialShown = 0;
let debugVisible = false;

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
        for (int i = 0; i < 6; i++) {
          vec3 delta = position - torchPositions[i];
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
const arrows = new Arrows(scene);
let attackCd = 0;
let gloomWarned = false;
let prevEat = false;
// Звуки мобов с затуханием по расстоянию
mobManager.onSound = (kind, dist) => {
  const vol = 1 / (1 + dist * 0.35);
  if (kind === 'hop') sfx.mobHop(vol);
  else if (kind === 'bleat') sfx.bleat(vol);
  else if (kind === 'chirp') sfx.chirp(vol);
  else if (kind === 'gloom') sfx.gloom(vol);
  else if (kind === 'die') sfx.mobDie();
  else if (kind === 'burn') sfx.burn();
};
mobManager.onSpawn = (mob) => {
  if ((mob.type === 'gloom' || mob.type === 'spider') && !gloomWarned) {
    gloomWarned = true;
    ui.toast(i18n.t('gloom_warn'), 3200);
  }
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

const bowVisual = createBowModel();
const bowPivot = new THREE.Group();
bowPivot.add(bowVisual.group);
bowPivot.position.set(0.57, -0.29, -1.18);
bowPivot.rotation.set(-0.07, -0.28, -0.15);
camera.add(bowPivot);
let bowRecoil = 0;

const loafPivot = new THREE.Group();
const loaf = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.36), new THREE.MeshBasicMaterial({ color: 0xbb7635, depthTest: false }));
loaf.position.set(0, 0, -0.12);
loafPivot.add(loaf);
for (const x of [-0.09, 0.03, 0.14]) {
  const score = new THREE.Mesh(new THREE.BoxGeometry(0.023, 0.015, 0.23), new THREE.MeshBasicMaterial({ color: 0xf4c776, depthTest: false }));
  score.position.set(x, 0.12, -0.12);
  loafPivot.add(score);
}
loafPivot.position.set(0.42, -0.38, -0.6);
loafPivot.renderOrder = 999;
camera.add(loafPivot);
let handSwing = 0;       // 1 -> 0 во время взмаха
let handSwingPow = 1;
const HAND_SWING_TIME = 0.28;
function swingHand(power = 1) {
  if (handSwing > 0.35) return;
  handSwing = 1;
  handSwingPow = power;
}
function updateHand(dt, light) {
  const held = palette[hotbarIndex];
  handPivot.visible = state === 'game' && held !== ITEM.BOW && held !== ITEM.BREAD;
  bowPivot.visible = state === 'game' && held === ITEM.BOW;
  loafPivot.visible = state === 'game' && held === ITEM.BREAD;
  bowVisual.arrow.visible = gameMode === 'creative' || inventory.get(ITEM.ARROW) > 0;
  if (handSwing > 0) handSwing = Math.max(0, handSwing - dt / HAND_SWING_TIME);
  bowRecoil = Math.max(0, bowRecoil - dt * 4);
  const p = Math.sin((1 - handSwing) * Math.PI) * handSwingPow;
  const moving = state === 'game' && player?.moving;
  const sprint = moving && player?.sprinting && player?.onGround;
  handBob += dt * (moving ? sprint ? 15 : 9 : 1.5);
  const bob = moving ? sprint ? 0.045 : 0.025 : 0.006;
  handPivot.rotation.set(-1.1 * p + 0.1, 0.35 * p, 0.4 * p);
  handPivot.position.set(
    0.42 - 0.18 * p + Math.cos(handBob) * bob,
    -0.36 + 0.08 * p - Math.abs(Math.sin(handBob)) * bob,
    -0.55 - 0.15 * p,
  );
  bowPivot.position.set(0.57 + Math.cos(handBob) * bob, -0.29 - Math.abs(Math.sin(handBob)) * bob, -1.18 + bowRecoil * 0.14);
  bowPivot.rotation.set(-0.07 + bowRecoil * 0.12, -0.28, -0.15 + Math.sin(handBob) * bob);
  loafPivot.position.set(0.42 + Math.cos(handBob) * bob, -0.38 - Math.abs(Math.sin(handBob)) * bob, -0.6);
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

function fitBlockOutline(mesh, hit, padding = 0) {
  const b = blockBounds(hit.id);
  mesh.position.set(
    hit.x + (b.minX + b.maxX) / 2,
    hit.y + (b.minY + b.maxY) / 2,
    hit.z + (b.minZ + b.maxZ) / 2,
  );
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

// ---------------------------------------------------------------- Хотбар
function rebuildPalette() {
  const held = palette[hotbarIndex];
  palette = (gameMode === 'creative' || settings.paletteUnlocked)
    ? [...STARTER_PALETTE, ...BUILDER_PALETTE]
    : [...STARTER_PALETTE];
  hotbarIndex = Math.max(0, palette.indexOf(held));
  ui.buildHotbar(palette, i18n.lang);
  ui.setHotbarSelection(hotbarIndex);
  refreshResources();
}

function refreshResources() {
  ui.setHotbarCounts(inventory, gameMode);
  ui.setFood(inventory);
  if (player) ui.setXP(player.level, player.xp, player.xpNeeded());
  if (state === 'inventory') ui.showInventory(inventory, activeFurnace ? 'furnace' : null, gameMode);
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

function doBreak(hit) {
  if (!hit) return;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER) return;
  if (!world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR)) return;
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  const drop = blockDrop(id);
  if (drop === ITEM.ORE || drop === ITEM.COAL) {
    // Руда именно выпадает в мир и должна быть подобрана, а не мгновенно
    // оказывается в инвентаре.
    items.spawn(hit.x + 0.5, hit.y + 0.72, hit.z + 0.5, drop);
  } else if (drop && gameMode === 'survival') {
    inventory.add(drop);
  }
  if (id === BLOCK.LEAVES && Math.random() < 0.14)
    items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, ITEM.APPLE);
  if ((id === BLOCK.TALL_GRASS || id === BLOCK.FERN || id === BLOCK.GRASS) && Math.random() < 0.38)
    items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, ITEM.WHEAT);
  // Без опоры факел не должен висеть в воздухе.
  if (world.getBlock(hit.x, hit.y + 1, hit.z) === BLOCK.TORCH) {
    world.setBlock(hit.x, hit.y + 1, hit.z, BLOCK.AIR);
    if (gameMode === 'survival') inventory.add(blockKey(BLOCK.TORCH));
  }
  refreshResources();
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
}

function handleDeath() {
  sfx.die();
  ui.flashHurt();
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
  if (!player || state !== 'game' || gameMode !== 'survival') return;
  const bread = inventory.get(ITEM.BREAD), apples = inventory.get(ITEM.APPLE);
  const kind = palette[hotbarIndex] === ITEM.BREAD && bread > 0 ? ITEM.BREAD
    : apples > 0 ? ITEM.APPLE : bread > 0 ? ITEM.BREAD : null;
  if (!kind) { ui.toast(i18n.t('eat_none'), 1400); return; }
  if (player.hp >= player.maxHp) return;
  inventory.spend(kind);
  player.heal(kind === ITEM.BREAD ? 6 : 4);
  ui.setHealth(player.hp, player.maxHp);
  refreshResources();
  sfx.crunch();
  ui.toast(i18n.t(kind === ITEM.BREAD ? 'bread_eaten' : 'eat_ok'), 1600);
}

function doPlace(hit) {
  if (!hit || state !== 'game') return;
  if (hit.id === BLOCK.FURNACE && !input.sneak) {
    openInventory({ x: hit.x, y: hit.y, z: hit.z });
    return;
  }
  const selected = palette[hotbarIndex];
  if (selected === ITEM.BREAD) { tryEat(); return; }
  if (typeof selected !== 'number') return;
  if (gameMode === 'survival' && inventory.get(slotKey(selected)) < 1) {
    ui.toast(i18n.t('no_blocks'), 1500);
    return;
  }
  const onDecor = isDecor(hit.id);
  if (selected === BLOCK.TORCH && hit.ny !== 1 && !onDecor) {
    ui.toast(i18n.t('need_torch_floor'), 1300);
    return;
  }
  let x = onDecor ? hit.x : hit.x + hit.nx;
  let y = onDecor ? hit.y : hit.y + hit.ny;
  let z = onDecor ? hit.z : hit.z + hit.nz;
  let id = selected;
  if (selected === BLOCK.PLANK_SLAB || selected === BLOCK.COBBLE_SLAB) {
    const bottom = selected;
    const top = selected + 1;
    const full = selected === BLOCK.PLANK_SLAB ? BLOCK.PLANKS : BLOCK.COBBLE;
    // Щёлкнуть по внутренней стороне полублока — сложить два в целый.
    if ((hit.id === bottom && hit.ny === 1) || (hit.id === top && hit.ny === -1)) {
      x = hit.x; y = hit.y; z = hit.z;
      id = full;
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
    if (cur === BLOCK.WATER || !isSolid(below) || blockBounds(below).maxY !== 1) {
      ui.toast(i18n.t('need_torch_floor'), 1300);
      return;
    }
  }
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  const b = blockBounds(id), hw = CONFIG.PLAYER_WIDTH / 2 + 0.01;
  const overlap = x + b.maxX > px - hw && x + b.minX < px + hw &&
    y + b.maxY > py && y + b.minY < py + CONFIG.PLAYER_HEIGHT &&
    z + b.maxZ > pz - hw && z + b.minZ < pz + hw;
  if (overlap && isSolid(id)) return;
  if (isDecor(cur)) {
    particles.burst(x, y, z, tileColor(BLOCKS[cur].tiles[0]), 8);
    sfx.breakBlock(breakKind(cur));
  }
  if (world.setBlock(x, y, z, id)) {
    if (gameMode === 'survival') inventory.spend(slotKey(selected));
    swingHand(0.6);
    sfx.place();
    particles.burst(x, y, z, tileColor(BLOCKS[id].tiles[0]), 5);
    blocksBuilt++;
    ui.setBlocksBuilt(blocksBuilt);
    refreshResources();
    ysdk.setStats({ blocksBuilt });
  }
}

// ---------------------------------------------------------------- Сохранение
function buildSave() {
  return {
    v: 1,
    seed: world.seed,
    edits: world.serializeEdits(),
    player: player.serialize(),
    mode: gameMode,
    inventory: inventory.serialize(),
    drops: items.serialize(),
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
  const data = buildSave();
  const ok = await ysdk.save(data);
  if (ok) saveData = data;
  if (showToast) ui.toast(i18n.t(ok ? 'saved' : 'save_fail'));
}

function attachPlayerEvents() {
  mobManager.onAttack = (mob) => {
    if (gameMode !== 'survival') return;
    const dx = player.pos.x - mob.pos.x, dz = player.pos.z - mob.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (player.hurt(mob.type === 'spider' ? 2 : 3)) {
      player.vel.x = dx / dl * 5;
      player.vel.z = dz / dl * 5;
      player.vel.y = 3;
      ui.setHealth(player.hp, player.maxHp);
    }
  };
  mobManager.onDeath = (mob) => {
    sfx.mobDie();
    particles.burst(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, mob.type === 'spider' ? 0x17181c : 0x2a2140, 14);
    if (mob.type === 'spider' || mob.type === 'gloom' || mob.type === 'slime') {
      const amount = mob.type === 'slime' ? 1 : 2;
      for (let i = 0; i < amount; i++)
        items.spawn(mob.pos.x + (Math.random() - 0.5) * 0.4, mob.pos.y + 0.7, mob.pos.z, 'xp', 2);
    }
  };
  items.onPickup = (kind, amount) => {
    if (kind === 'xp') {
      const levels = player.addXP(amount);
      sfx.xp();
      if (levels) ui.toast(i18n.t('xp_level') + ' ' + player.level);
    } else {
      const first = inventory.get(kind) === 0;
      inventory.add(kind, amount);
      sfx.pickup();
      if (first && (kind === ITEM.APPLE || kind === ITEM.ORE || kind === ITEM.COAL)) {
        ui.toast(i18n.t(kind === ITEM.APPLE ? 'apple_get' : kind === ITEM.ORE ? 'ore_get' : 'coal_get'), 3000);
      }
    }
    refreshResources();
  };
  arrows.onHitMob = (mob) => {
    sfx.hitMob();
    particles.burst(mob.pos.x, mob.pos.y + 0.4, mob.pos.z, 0xaa3842, 8);
  };
  arrows.onHitBlock = (hit) => {
    particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[hit.id].tiles[0]), 4);
  };
  player.events.onStep = (inWater) => sfx.step(inWater);
  player.events.onJump = () => sfx.jump();
  player.events.onLand = () => sfx.land();
  player.events.onHurt = () => {
    sfx.hurt(); ui.flashHurt(); ui.setHealth(player.hp, player.maxHp);
  };
  player.events.onDeath = () => handleDeath();
  player.events.onSplash = () => sfx.splash();
}

// ---------------------------------------------------------------- Стейты
function setGameMode(mode, announce = false) {
  gameMode = mode === 'creative' ? 'creative' : 'survival';
  ui.setMode(gameMode);
  ui.setRewardButton(settings.paletteUnlocked);
  mobManager.hostileEnabled = gameMode === 'survival';
  if (player) {
    player.mode = gameMode;
    if (gameMode === 'creative') player.hp = player.maxHp;
    else if (player.flying) { player.flying = false; player.vel.y = 0; }
    ui.setHealth(player.hp, player.maxHp);
    rebuildPalette();
    if (announce) {
      ui.toast(i18n.t('mode_changed') + i18n.t(gameMode));
      saveGame();
    }
  }
}

function openInventory(furnace = null) {
  if (state !== 'game') return;
  activeFurnace = furnace;
  state = 'inventory';
  input.keys.clear();
  input.mouse.left = input.mouse.right = false;
  ysdk.gameplayStop();
  ui.showScreen('inventory-screen');
  ui.showInventory(inventory, furnace ? 'furnace' : null, gameMode);
  ui.setTouchVisible(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeInventory() {
  if (state !== 'inventory') return;
  activeFurnace = null;
  resumeGame();
}

function enterGame() {
  state = 'game';
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
  ysdk.gameplayStop();
  saveGame();
  ui.showScreen('pause-screen');
  ui.setTouchVisible(false);
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  state = 'game';
  ysdk.gameplayStart();
  ui.showGame();
  ui.setTouchVisible(input.isTouch);
  if (!input.isTouch) input.requestLock(canvas);
}

async function saveAndQuit() {
  await saveGame(true);
  state = 'menu';
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
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_fly'), 3500), 8000);
}

// ---------------------------------------------------------------- Награда за рекламу
async function requestReward() {
  ui.toast(i18n.t('ad_loading'));
  sfx.resume();
  const ok = await ysdk.showRewarded();
  if (ok || !ysdk.available) {
    // Без SDK (локальный запуск/демо) награда выдаётся сразу
    settings.paletteUnlocked = true;
    rebuildPalette();
    ui.setRewardButton(true);
    ui.toast(i18n.t('reward_got') + (ok ? '' : ' (demo)'), 3200);
    sfx.reward();
    saveGame();
  } else {
    ui.toast(i18n.t('reward_fail'), 3200);
  }
}

// ---------------------------------------------------------------- Инициализация мира
async function startWorld(newWorld = false) {
  ui.showScreen('loading-screen');
  ui.setLoading(0.05, i18n.t('loading'));

  const data = newWorld ? null : saveData;
  // Сначала удаляем GPU-меши предыдущего мира (игрок мог вернуться в меню).
  if (world) {
    for (const chunk of world.chunks.values()) disposeChunkMeshes(chunk);
    world.chunks.clear();
  }
  mobManager.clear();
  items.clear();
  arrows.clear();
  const seed = (data?.seed != null) ? data.seed : ((Math.random() * 0x7fffffff) | 0);
  world = new World(seed);
  player = new Player(world);
  player.mode = gameMode;
  inventory = data?.inventory ? new Inventory(data.inventory) : starterInventory();
  mobManager.world = world;
  mobManager.hostileEnabled = gameMode === 'survival';
  gloomWarned = false;
  attackCd = 0;
  torchRefreshT = 0;
  nearbyTorchCount = 0;
  for (const p of torchPositions) p.set(0, -1000, 0);
  attachPlayerEvents();

  if (data) {
    world.loadEdits(data.edits || []);
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
    items.load(data.drops);
    i18n.setLang(settings.lang);
    sfx.setVolume(settings.volume);
    sfx.setEnabled(settings.sound);
  } else {
    settings.paletteUnlocked = false;
    blocksBuilt = 0;
    ui.setBlocksBuilt(0);
    sky.setTime(0.3);
  }
  ui.applySettings(settings);
  ui.applyI18n();
  rebuildPalette();
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

  // Мобы появляются за спиной даже при первом запуске: никаких
  // «всплывающих» существ прямо перед камерой.
  for (let i = 0; i < 3; i++) mobManager.trySpawn(player.pos, player.yaw);
  ui.setHealth(player.hp, player.maxHp);
  ui.setMode(gameMode);
  refreshResources();

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» имеет смысл и до первого сохранения

  enterGame();
}

// ---------------------------------------------------------------- Бой
function aimedMob(reach) {
  const eye = player.eyePos(), dir = player.lookDir();
  const wall = raycastVoxel(world, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);
  let bestT = wall ? wall.t + 0.15 : reach;
  let target = null;
  for (const mob of mobManager.mobs) {
    if (mob.dead) continue;
    const h = mob.type === 'spider' ? 0.37 : mob.type === 'bird' ? 0 : 0.48;
    const dx = mob.pos.x - eye.x, dy = mob.pos.y + h - eye.y, dz = mob.pos.z - eye.z;
    const t = dx * dir.x + dy * dir.y + dz * dir.z;
    if (t < 0.2 || t >= bestT) continue;
    const radius = mob.type === 'bird' ? 0.33 : mob.type === 'gloom' ? 0.42 : 0.6;
    if (dx * dx + dy * dy + dz * dz - t * t > radius * radius) continue;
    bestT = t;
    target = mob;
  }
  return target;
}

function meleeAttack(mob) {
  if (!mob || attackCd > 0) return;
  attackCd = 0.38;
  swingHand(1);
  mob.hurt(1);
  sfx.hitMob();
  particles.burst(mob.pos.x, mob.pos.y + 0.4, mob.pos.z, mob.type === 'spider' ? 0x161619 : 0x30253a, 8);
  mob.knockback(mob.pos.x - player.pos.x, mob.pos.z - player.pos.z, 3.2);
}

function shootBow() {
  if (state !== 'game' || palette[hotbarIndex] !== ITEM.BOW || attackCd > 0) return;
  attackCd = 0.66;
  if (gameMode === 'survival' && !inventory.get(ITEM.ARROW)) {
    ui.toast(i18n.t('no_arrows'), 1500);
    return;
  }
  if (arrows.fire(player.eyePos(), player.lookDir())) {
    if (gameMode === 'survival') inventory.spend(ITEM.ARROW);
    bowRecoil = 1;
    sfx.bow();
    refreshResources();
  }
}

// ---------------------------------------------------------------- Обработчики UI
ui.handlers.onPlay = () => { input.enterFullscreen(); sfx.resume(); sfx.uiOk(); startWorld(false); };
ui.handlers.onNewWorld = () => { input.enterFullscreen(); sfx.resume(); sfx.uiOk(); saveData = null; startWorld(true); };
ui.handlers.onResume = () => { input.enterFullscreen(); sfx.uiClick(); resumeGame(); };
ui.handlers.onSaveQuit = async () => { sfx.uiOk(); await saveAndQuit(); };
ui.handlers.onReward = () => requestReward();
ui.handlers.onModeChange = (mode) => setGameMode(mode, true);
ui.handlers.onOpenInventory = () => openInventory();
ui.handlers.onCloseInventory = () => closeInventory();
ui.handlers.onEat = () => tryEat();
ui.handlers.onCraft = (id) => {
  if (state !== 'inventory' || gameMode !== 'survival') return;
  const recipe = RECIPES.find((r) => r.id === id);
  if (!recipe) return;
  if (recipe.station && (!activeFurnace || world.getBlock(activeFurnace.x, activeFurnace.y, activeFurnace.z) !== BLOCK.FURNACE)) return;
  if (!inventory.craft(recipe)) return;
  sfx.place();
  ui.toast(itemName(recipe.output, i18n.lang) + ' ×' + recipe.amount, 1200);
  refreshResources();
  saveGame();
};
ui.handlers.onSlot = (i) => {
  hotbarIndex = i;
  ui.setHotbarSelection(i);
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
    if (palette.length) {
      ui.buildHotbar(palette, i18n.lang);
      ui.setHotbarSelection(hotbarIndex);
      refreshResources();
    }
    ui.setRewardButton(settings.paletteUnlocked);
  }
  if (delta.viewDistance) {
    sky.viewDistance = delta.viewDistance;
    lastPlayerChunk = null; // пересобрать очередь чанков
  }
  saveGame();
};

input.handlers.onPause = () => {
  if (state === 'game') pauseGame();
  else if (state === 'pause') resumeGame();
  else if (state === 'inventory') closeInventory();
};
input.handlers.onInventory = () => {
  if (state === 'game') openInventory();
  else if (state === 'inventory') closeInventory();
};
input.handlers.onToggleFly = () => {
  if (state !== 'game') return;
  if (gameMode !== 'creative') {
    ui.toast(i18n.t('creative_only'), 1400);
    return;
  }
  const on = player.toggleFly();
  ui.toast(i18n.t(on ? 'fly_on' : 'fly_off'), 1500);
  sfx.uiClick();
};
input.handlers.onDigit = (i) => {
  if (i < palette.length) {
    hotbarIndex = i;
    ui.setHotbarSelection(i);
    sfx.uiClick();
  }
};
input.handlers.onScroll = (dir) => {
  hotbarIndex = (hotbarIndex + dir + palette.length) % palette.length;
  ui.setHotbarSelection(hotbarIndex);
  sfx.uiClick();
};
input.handlers.onActionBreak = () => {
  if (state !== 'game') return;
  if (palette[hotbarIndex] === ITEM.BOW) { shootBow(); return; }
  const mob = aimedMob(3.7);
  if (mob) { meleeAttack(mob); return; }
  const hit = pickTarget();
  if (!hit) return;
  // Тап — быстрое ломание с короткой анимацией трещин
  breakTarget = { x: hit.x, y: hit.y, z: hit.z };
  breakProgress = 0;
  breakQuick = true;
  sfx.dig(breakKind(hit.id));
};
input.handlers.onMouseBreak = () => {
  if (state !== 'game') return;
  if (palette[hotbarIndex] === ITEM.BOW) shootBow();
  else meleeAttack(aimedMob(3.7));
};
input.handlers.onActionPlace = () => {
  if (state !== 'game') return;
  doPlace(pickTarget());
  placeCooldown = 0.25;
};

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
let sprintPhase = 0;
let sprintStrength = 0;

function updateCamera(dt) {
  const eye = player.eyePos();
  const target = player.sprinting && player.onGround
    ? Math.min(1, Math.hypot(player.vel.x, player.vel.z) / CONFIG.SPRINT_SPEED) : 0;
  sprintStrength += (target - sprintStrength) * Math.min(1, dt * 10);
  if (sprintStrength > 0.001) sprintPhase += dt * 15;
  const sway = Math.sin(sprintPhase) * sprintStrength;
  camera.position.set(
    eye.x + Math.cos(player.yaw) * sway * 0.024,
    eye.y + (Math.abs(Math.sin(sprintPhase)) - 0.55) * sprintStrength * 0.07,
    eye.z - Math.sin(player.yaw) * sway * 0.024,
  );
  camera.rotation.set(player.pitch, player.yaw, sway * 0.016);
}

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

    // Подбираемые ресурсы, еда и бой.
    items.update(dt, world, player.pos);
    const eatPressed = input.keys.has('KeyF');
    if (eatPressed && !prevEat) tryEat();
    prevEat = eatPressed;
    attackCd = Math.max(0, attackCd - dt);
    mobManager.setNight(sky.lightLevel < 0.32);
    if (sky.lightLevel >= 0.32) gloomWarned = false;

    let mobTarget = null;
    if (input.breakHeld) {
      if (palette[hotbarIndex] === ITEM.BOW) shootBow();
      else {
        mobTarget = aimedMob(3.7);
        meleeAttack(mobTarget);
      }
    }

    // Прицел и действия
    const hit = pickTarget();
    if (hit) {
      highlight.visible = true;
      fitBlockOutline(highlight, hit, 0.008);
    } else {
      highlight.visible = false;
    }

    // Ломание: удержание ЛКМ/кнопки или быстрое по тапу (с анимацией трещин)
    let breaking = null;
    if (hit && !mobTarget && palette[hotbarIndex] !== ITEM.BOW) {
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
      const kind = breakKind(breaking.id);
      const rate = gameMode === 'creative' ? dt / 0.08 : breakQuick
        ? dt / 0.3
        : dt / (CONFIG.BREAK_TIME[kind] ?? CONFIG.BREAK_TIME.default);
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

    // Небольшая затухающая тряска только при беге по земле.
    updateCamera(dt);

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
    mobManager.update(dt, player.pos, player.yaw, true);
    arrows.update(dt, world, mobManager.mobs);

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
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    player.yaw += dt * 0.05;
    camera.rotation.set(player.pitch, player.yaw, 0);
    sprintStrength = 0;
    sky.update(dt * 0.3, player.pos);
    const L = sky.lightLevel;
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);
    mobManager.setLight(L);
    updateTorchLights(dt, L);
    mobManager.update(dt * 0.5, player.pos, player.yaw, false);
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
  gameMode = saveData?.mode === 'creative' ? 'creative' : 'survival';
  ui.applySettings(settings);
  ui.setMode(gameMode);
  ui.applyI18n();
  ui.setRewardButton(settings.paletteUnlocked);

  ui.setLoading(0.08, i18n.t('ready'));
  ui.showScreen('menu-screen');

  const btnPlay = document.getElementById('btn-play');
  const btnNew = document.getElementById('btn-new-world');
  ui.setHasSave(hasSave);
  if (btnPlay) btnPlay.textContent = hasSave ? i18n.t('continue') : i18n.t('play');
  if (btnNew) btnNew.classList.toggle('hidden', !hasSave);

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
  get world() { return world; },
  get player() { return player; },
  get scene() { return scene; },
  get renderer() { return renderer; },
  get camera() { return camera; },
  get mobs() { return mobManager; },
  get weather() { return weather; },
  get sky() { return sky; },
  get items() { return items; },
  get arrows() { return arrows; },
  get inventory() { return inventory; },
  get mode() { return gameMode; },
};
