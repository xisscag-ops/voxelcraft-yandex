// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, isSolid, isDecor } from './blocks.js';
import { buildAtlas, tileColor, tileTexture, CRACK_TILES } from './textures.js';
import { World } from './world.js';
import { meshChunk } from './mesher.js';
import { MobManager } from './mobs.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Weather } from './weather.js';
import { ItemDrops } from './items.js';
import { Arrows, buildArrowModel, arrowMaterials } from './projectiles.js';
import { ITEM } from './gear.js';
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
  fullscreen: true,
};

let state = 'loading';           // loading | menu | game | pause
let world = null;
let player = null;
let palette = [];                 // [{ kind: 'block', id } | { kind: 'item', item }]
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

const sky = new Sky(THREE, scene);
sky.viewDistance = settings.viewDistance;
const particles = new Particles(THREE, scene);
const mobManager = new MobManager(scene, null);
const weather = new Weather(THREE, scene);
const items = new ItemDrops(scene);
const projectiles = new Arrows(scene);
// Выживание
let apples = 0;
let arrowsAmmo = 32;           // стрелы для лука
let bowCharge = 0;             // 0..1 — натяжение тетивы
let bowCharging = false;
let bowKick = 0;               // анимация отдачи после выстрела
let decorBreakCd = 0;          // пауза между мгновенными «срывами» травы
const BOW_CHARGE_TIME = 0.85;  // секунды до полной натяжки
let attackCd = 0;
let gloomT = 6;
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
  handPivot.visible = state === 'game' && !isBowSelected();
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
  poseBow(dt, light);
}
let handBob = 0;

// ---------------------------------------------------------------- Лук (вид от первого лица)
// Дуга собрана из сегментов окружности: рукоять в центре, концы смотрят на игрока.
const BOW_TIP = 0.2539;        // половина высоты дуги (y концов)
const BOW_ANG = 1.0;           // половина угла дуги, рад

function bowMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
}

const bowPivot = new THREE.Group();
const bowMats = {
  wood: bowMaterial(0x8b5a2b),
  woodDark: bowMaterial(0x633f1a),
  string: bowMaterial(0xe8e8ee),
  hand: bowMaterial(0xc98f63),
};
let bowStringUpper, bowStringLower;
{
  const R = 0.3, D = 0.16, SEG = 6;
  for (let i = 0; i < SEG; i++) {
    const a0 = -BOW_ANG + 2 * BOW_ANG * (i / SEG);
    const a1 = -BOW_ANG + 2 * BOW_ANG * ((i + 1) / SEG);
    const am = (a0 + a1) / 2;
    const y0 = R * Math.sin(a0), z0 = D - R * Math.cos(a0);
    const y1 = R * Math.sin(a1), z1 = D - R * Math.cos(a1);
    const len = Math.hypot(y1 - y0, z1 - z0);
    const grip = i === 2 || i === 3;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.026, len * 1.1, 0.036),
      grip ? bowMats.woodDark : bowMats.wood,
    );
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = am;
    bowPivot.add(seg);
  }
  // Тетива — два отрезка от концов к точке натяжения
  const stringGeo = new THREE.BoxGeometry(0.011, 1, 0.011).translate(0, -0.5, 0);
  bowStringUpper = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringUpper.position.set(0, BOW_TIP, 0);
  bowStringLower = new THREE.Mesh(stringGeo, bowMats.string);
  bowStringLower.position.set(0, -BOW_TIP, 0);
  bowStringLower.rotation.z = Math.PI;
  bowPivot.add(bowStringUpper, bowStringLower);
  // Кулак на рукояти
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.13), bowMats.hand);
  fist.position.set(0.005, -0.03, D - R + 0.035);
  bowPivot.add(fist);
}
// Стрела на тетиве (смотрит вперёд, пятка — в начале координат)
const nockedArrow = buildArrowModel(1, arrowMaterials());
nockedArrow.rotation.y = Math.PI;
nockedArrow.visible = false;
nockedArrow.traverse((o) => {
  if (o.isMesh) { o.material.depthTest = false; o.material.depthWrite = false; }
});
bowPivot.add(nockedArrow);
bowPivot.visible = false;
// Поверх мира, как и рука
bowPivot.traverse((o) => { if (o.isMesh) o.renderOrder = 999; });
camera.add(bowPivot);

const nockedMats = nockedArrow.children.map((c) => c.material);

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

  // Освещение как у руки
  const lum = 0.35 + 0.65 * light;
  bowMats.wood.color.setHex(0x8b5a2b).multiplyScalar(lum);
  bowMats.woodDark.color.setHex(0x633f1a).multiplyScalar(lum);
  bowMats.string.color.setHex(0xe8e8ee).multiplyScalar(lum);
  bowMats.hand.color.setHex(0xc98f63).multiplyScalar(lum);
  const nockedBase = [0x9c7548, 0xd8dde6, 0xe0574c, 0xe0574c];
  nockedMats.forEach((m, i) => m.color.setHex(nockedBase[i] || 0xc0c0c0).multiplyScalar(lum));
}

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

// ---------------------------------------------------------------- Хотбар
function rebuildPalette() {
  const blockIds = settings.paletteUnlocked
    ? [...STARTER_PALETTE, ...BUILDER_PALETTE]
    : [...STARTER_PALETTE];
  const entries = blockIds.map((id) => ({ kind: 'block', id }));
  // Лук — сразу после базовых блоков, чтобы всегда был под рукой
  entries.splice(STARTER_PALETTE.length, 0, { kind: 'item', item: ITEM.BOW });
  palette = entries;
  hotbarIndex = Math.min(hotbarIndex, palette.length - 1);
  ui.buildHotbar(palette, i18n.lang);
  ui.setHotbarSelection(hotbarIndex);
  ui.setPlaceButtonBow(isBowSelected());
  ui.setArrows(arrowsAmmo);
}

const selectedEntry = () => palette[hotbarIndex] || null;

/** Выбран лук? */
function isBowSelected() {
  const e = selectedEntry();
  return !!e && e.kind === 'item' && e.item === ITEM.BOW;
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
  if (isDecor(id)) return breakDecor(hit);   // растения срываются мгновенно, с треском
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  // С листвы иногда падает яблоко или стрела
  if (id === BLOCK.LEAVES) {
    if (Math.random() < 0.14) items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 'apple');
    if (Math.random() < 0.08) items.spawn(hit.x + 0.5, hit.y + 0.8, hit.z + 0.5, 'arrow');
  }
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  crackMesh.visible = false;
}

// Трава, цветы, папоротник, клевер: мгновенный «срыв» — шелест, горсть зелёных частиц,
// без кубической модели и без анимации трещин (как в Minecraft)
function breakDecor(hit) {
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!isDecor(id)) return;
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x + 0.1, hit.y, hit.z + 0.1, tileColor(BLOCKS[id].tiles[0]), 10);
  sfx.grassRustle();
  swingHand(0.45);
  decorBreakCd = 0.12;
  breakTarget = null;
  breakProgress = 0;
  breakQuick = false;
  breakDustT = 0;
  crackMesh.visible = false;
  highlight.visible = false;
  ui.setBreakProgress(0);
}

// ---------------------------------------------------------------- Лук
function onArrowHitMob(mob, arrow, dir) {
  const dmg = arrow.dmg || 2;
  const killed = mob.hurt(dmg);
  sfx.hitMob();
  particles.burst(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, mob.hitColor, 12);
  mob.knockback(dir.x, dir.z, killed ? 3.4 : 2.6);
  if (!killed) mob.fleeFrom(player.pos.x, player.pos.z, 4);
  else if (Math.random() < 0.5) {
    // Стрела остаётся рядом — её можно подобрать
    items.spawn(mob.pos.x, mob.pos.y + 0.6, mob.pos.z, 'arrow');
  }
}

function fireBow(charge) {
  if (!isBowSelected()) return;
  if (arrowsAmmo <= 0) {
    ui.toast(i18n.t('no_arrows'), 1800);
    sfx.uiClick();
    return;
  }
  arrowsAmmo--;
  ui.setArrows(arrowsAmmo);
  const eye = player.eyePos();
  const d = player.lookDir();
  const power = 0.3 + 0.7 * charge;                    // сила натяжения 0.3..1
  const speed = 15 + 22 * power;                       // 21..37 м/с
  const dmg = 1 + Math.round(4.5 * charge);            // 1..6
  bowKick = 0.6 + 0.4 * charge;
  projectiles.shoot(
    eye.x + d.x * 0.6, eye.y + d.y * 0.6 - 0.1, eye.z + d.z * 0.6,
    d.x, d.y, d.z, speed, dmg,
    {
      onMob: onArrowHitMob,
      onBlock: () => sfx.arrowHitBlock(),
      onPickup: (n) => {
        const wasEmpty = arrowsAmmo <= 0;
        arrowsAmmo += n;
        ui.setArrows(arrowsAmmo);
        sfx.arrowPickup();
        if (wasEmpty) ui.toast(i18n.t('arrow_pickup'), 1400);
      },
    },
  );
  sfx.bowShoot(power);
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
  if (apples <= 0) { ui.toast(i18n.t('eat_none'), 1400); return; }
  if (player.hp >= player.maxHp) return;
  apples--;
  ui.setApples(apples);
  sfx.crunch();
  player.heal(4);
  ui.setHealth(player.hp, player.maxHp);
  ui.toast(i18n.t('eat_ok'), 1600);
}

function doPlace(hit) {
  if (!hit) return;
  const sel = selectedEntry();
  if (!sel || sel.kind !== 'block') return;   // лук блоки не ставит
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
  const id = sel.id;
  if (overlap && isSolid(id)) return;
  if (isDecor(cur)) {
    // Трава автоматически ломается при установке блока — с тем же треском
    if (isDecor(id) && cur === id) return;
    particles.burst(x, y, z, tileColor(BLOCKS[cur].tiles[0]), 8);
    sfx.grassRustle();
  }
  if (world.setBlock(x, y, z, id)) {
    sfx.place();
    particles.burst(x, y, z, tileColor(BLOCKS[id].tiles[0]), 5);
    blocksBuilt++;
    ui.setBlocksBuilt(blocksBuilt);
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
    time: sky.serialize(),
    blocksBuilt,
    paletteUnlocked: settings.paletteUnlocked,
    arrows: arrowsAmmo,
    settings: {
      volume: settings.volume,
      sound: settings.sound,
      lang: settings.lang,
      viewDistance: settings.viewDistance,
      fullscreen: settings.fullscreen,
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
  particles.burst(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, mob.hitColor, 14);
};
items.onPickup = (kind) => {
  if (kind === 'apple') {
    apples++;
    ui.setApples(apples);
    sfx.pickup();
    if (apples === 1) ui.toast(i18n.t('apple_get'), 3200);
  } else if (kind === 'arrow') {
    const wasEmpty = arrowsAmmo <= 0;
    arrowsAmmo++;
    ui.setArrows(arrowsAmmo);
    sfx.arrowPickup();
    if (wasEmpty) ui.toast(i18n.t('arrow_pickup'), 1400);
  }
};
player.events.onStep = (inWater) => sfx.step(inWater);
  player.events.onJump = () => sfx.jump();
  player.events.onLand = () => sfx.land();
  player.events.onHurt = () => {
    sfx.hurt();
    ui.flashHurt();
    ui.setHealth(player.hp, player.maxHp);
  };
  player.events.onDeath = () => handleDeath();
  player.events.onSplash = () => sfx.splash();
}

// ---------------------------------------------------------------- Стейты
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
  bowCharging = false;
  bowCharge = 0;
  input.unlockKeys();   // в паузе клавиатура снова свободна (Tab, Alt и т.п.)
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
  input.unlockKeys();
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
  setTimeout(() => state === 'game' && ui.toast(i18n.t('hint_bow'), 4000), 12000);
  setTimeout(() => state === 'game' && ui.toast(i18n.t('esc_fullscreen'), 4500), 17000);
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
  const seed = (data?.seed != null) ? data.seed : ((Math.random() * 0x7fffffff) | 0);
  world = new World(seed);
  player = new Player(world);
  mobManager.clear();
  items.clear();
  projectiles.clear();
  apples = 0;
  arrowsAmmo = 32;
  bowCharge = 0;
  bowCharging = false;
  ui.setApples(0);
  ui.setArrows(arrowsAmmo);
  mobManager.world = world;
  attachPlayerEvents();

  if (data) {
    world.loadEdits(data.edits || []);
    settings.paletteUnlocked = !!data.paletteUnlocked;
    blocksBuilt = data.blocksBuilt || 0;
    ui.setBlocksBuilt(blocksBuilt);
    if (data.arrows != null) arrowsAmmo = Math.max(0, data.arrows | 0);
    ui.setArrows(arrowsAmmo);
    if (data.settings) {
      settings.volume = data.settings.volume ?? settings.volume;
      settings.sound = data.settings.sound !== false;
      settings.lang = data.settings.lang || settings.lang;
      settings.viewDistance = data.settings.viewDistance || settings.viewDistance;
      settings.fullscreen = data.settings.fullscreen !== false;
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
  input.allowFullscreen = settings.fullscreen !== false;
  rebuildPalette();
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
  ui.setApples(apples);

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» имеет смысл и до первого сохранения

  enterGame();
}

// ---------------------------------------------------------------- Обработчики UI
ui.handlers.onPlay = () => { input.enterFullscreen(); sfx.resume(); sfx.uiOk(); startWorld(false); };
ui.handlers.onNewWorld = () => { input.enterFullscreen(); sfx.resume(); sfx.uiOk(); saveData = null; startWorld(true); };
ui.handlers.onResume = () => { input.enterFullscreen(); sfx.uiClick(); resumeGame(); };
ui.handlers.onSaveQuit = async () => { sfx.uiOk(); await saveAndQuit(); };
ui.handlers.onReward = () => requestReward();
ui.handlers.onSlot = (i) => {
  hotbarIndex = i;
  ui.setHotbarSelection(i);
  ui.setPlaceButtonBow(isBowSelected());
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
    }
    ui.setRewardButton(settings.paletteUnlocked);
  }
  if (delta.viewDistance) {
    sky.viewDistance = delta.viewDistance;
    lastPlayerChunk = null; // пересобрать очередь чанков
  }
  if (delta.fullscreen != null) {
    input.allowFullscreen = delta.fullscreen;
    if (delta.fullscreen) input.enterFullscreen();
    else { input.exitFullscreen(); ui.toast(i18n.t('fullscreen_off')); }
  }
  saveGame();
};

input.handlers.onPause = () => {
  if (state === 'game') pauseGame();
  else if (state === 'pause') resumeGame();
};
input.handlers.onToggleFly = () => {
  if (state !== 'game') return;
  const on = player.toggleFly();
  ui.toast(i18n.t(on ? 'fly_on' : 'fly_off'), 1500);
  sfx.uiClick();
};
input.handlers.onDigit = (i) => {
  if (i < palette.length) {
    hotbarIndex = i;
    ui.setHotbarSelection(i);
    ui.setPlaceButtonBow(isBowSelected());
    sfx.uiClick();
  }
};
input.handlers.onScroll = (dir) => {
  hotbarIndex = (hotbarIndex + dir + palette.length) % palette.length;
  ui.setHotbarSelection(hotbarIndex);
  ui.setPlaceButtonBow(isBowSelected());
  sfx.uiClick();
};
input.handlers.onActionBreak = () => {
  if (state !== 'game') return;
  const hit = pickTarget();
  if (!hit) return;
  if (isDecor(hit.id)) {   // трава и цветы — сразу, с треском
    breakDecor(hit);
    return;
  }
  // Тап — быстрое ломание с короткой анимацией трещин
  breakTarget = { x: hit.x, y: hit.y, z: hit.z };
  breakProgress = 0;
  breakQuick = true;
  sfx.dig(breakKind(hit.id));
};
input.handlers.onActionPlace = () => {
  if (state !== 'game') return;
  if (isBowSelected()) return;   // лук заряжается удержанием, выстрел — по отпусканию
  doPlace(pickTarget());
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
    const eatPressed = input.keys.has('KeyE');
    if (eatPressed && !prevEat) tryEat();
    prevEat = eatPressed;

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

    // Удар по Хмари (ЛКМ) вместо ломания блока
    let mobTarget = null;
    if (input.breakHeld) {
      const eye = player.eyePos();
      const d = player.lookDir();
      let bestT = 4.5;
      for (const m of mobManager.mobs) {
        if (m.type !== 'gloom') continue;
        const cx = m.pos.x - eye.x, cy = m.pos.y + 0.5 - eye.y, cz = m.pos.z - eye.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        if (t < 0.3 || t > 4.5) continue;
        const px = cx - d.x * t, py = cy - d.y * t, pz = cz - d.z * t;
        if (px * px + py * py + pz * pz > 0.72 * 0.72) continue;
        if (t < bestT) { bestT = t; mobTarget = m; }
      }
      attackCd -= dt;
      if (mobTarget && attackCd <= 0) {
        attackCd = 0.36;
        swingHand(1);
        mobTarget.hurt(1);
        sfx.hitMob();
        particles.burst(mobTarget.pos.x, mobTarget.pos.y + 0.5, mobTarget.pos.z, 0x2a2140, 8);
        const kx = mobTarget.pos.x - player.pos.x, kz = mobTarget.pos.z - player.pos.z;
        const kl = Math.hypot(kx, kz) || 1;
        mobTarget.knockback(kx / kl, kz / kl, 3.2);
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

    // Ломание: удержание ЛКМ/кнопки или быстрое по тапу (с анимацией трещин).
    // Трава и цветы — исключение: срываются мгновенно, одним нажатием, с треском.
    let breaking = null;
    decorBreakCd -= dt;
    if (hit && !mobTarget) {
      const same = breakTarget && breakTarget.x === hit.x && breakTarget.y === hit.y && breakTarget.z === hit.z;
      if (isDecor(hit.id)) {
        // Тап по растению уже обработан в onActionBreak, здесь — удержание
        if (input.breakHeld && decorBreakCd <= 0) breakDecor(hit);
      } else {
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
    }
    if (breaking) {
      const kind = breakKind(breaking.id);
      const rate = breakQuick
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

    // Стрелы: полёт, попадания, подбор воткнутых
    projectiles.update(dt, world, mobManager.mobs, player.pos);

    // Камера
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

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
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    player.yaw += dt * 0.05;
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
  settings.fullscreen = s.fullscreen !== false;
  input.allowFullscreen = settings.fullscreen !== false;
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
};
