// VoxelCraft — точка входа: игровой цикл, чанки, строительство, сохранения
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BLOCK, BLOCKS, STARTER_PALETTE, BUILDER_PALETTE, breakKind, isSolid, isPlant } from './blocks.js';
import { buildAtlas, buildCrackStages, tileColor } from './textures.js';
import { World } from './world.js';
import { meshChunk } from './mesher.js';
import { Player } from './physics.js';
import { raycastVoxel } from './raycast.js';
import { Particles } from './particles.js';
import { Sky } from './sky.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { I18n } from './i18n.js';
import { Ysdk } from './ysdk.js';
import { Mobs } from './mobs.js';

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

let state = 'loading';           // loading | menu | game | pause
let world = null;
let player = null;
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

const sky = new Sky(THREE, scene);
sky.viewDistance = settings.viewDistance;
const particles = new Particles(THREE, scene);
let mobs = null; // создаётся вместе с миром

// Контур выбранного блока
const highlight = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }),
);
highlight.visible = false;
scene.add(highlight);

// Анимация ломания: оверлей с трещинами (5 стадий)
const crackMats = buildCrackStages(5).map((canvas) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
});
const crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006), crackMats[0]);
crackMesh.visible = false;
crackMesh.renderOrder = 2;
scene.add(crackMesh);

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
  palette = settings.paletteUnlocked
    ? [...STARTER_PALETTE, ...BUILDER_PALETTE]
    : [...STARTER_PALETTE];
  hotbarIndex = Math.min(hotbarIndex, palette.length - 1);
  ui.buildHotbar(palette, i18n.lang);
  ui.setHotbarSelection(hotbarIndex);
}

// ---------------------------------------------------------------- Действия
let breakTarget = null;
let breakProgress = 0;
let placeCooldown = 0;
let mobHoldBlock = false;   // клик пришёлся по мобу — не ломаем блок
let digTickAcc = 0;
let breakWasHeld = false;

function pickTarget() {
  const eye = player.eyePos();
  const d = player.lookDir();
  return raycastVoxel(world, eye.x, eye.y, eye.z, d.x, d.y, d.z, CONFIG.REACH);
}

// Моб перед блоком? (возвращает попадание по мобу ближе блока)
function pickMob() {
  if (!mobs) return null;
  const eye = player.eyePos();
  const d = player.lookDir();
  const mobHit = mobs.tryHit(eye, d, CONFIG.REACH);
  if (!mobHit) return null;
  const blockHit = pickTarget();
  if (blockHit) {
    const bdx = blockHit.x + 0.5 - eye.x, bdy = blockHit.y + 0.5 - eye.y, bdz = blockHit.z + 0.5 - eye.z;
    const blockDist = Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz);
    if (mobHit.dist > blockDist + 0.4) return null;
  }
  return mobHit;
}

function hitMob(mobHit) {
  mobs.hit(mobHit.mob, player.pos, sfx);
  particles.burst(mobHit.mob.pos.x, mobHit.mob.pos.y, mobHit.mob.pos.z, [230, 210, 200], 6);
}

function tryActionBreak() {
  // Тап (мобильный / одиночное действие): сначала моб, потом мгновенный слом
  const mobHit = pickMob();
  if (mobHit) {
    hitMob(mobHit);
    return;
  }
  doBreak(pickTarget());
}

function doBreak(hit) {
  if (!hit) return;
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER) return;
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  particles.burst(hit.x, hit.y, hit.z, tileColor(BLOCKS[id].tiles[0]), 16);
  sfx.breakBlock(breakKind(id));
  breakTarget = null;
  breakProgress = 0;
  crackMesh.visible = false;
}

function doPlace(hit) {
  if (!hit) return;
  const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
  const cur = world.getBlock(x, y, z);
  // Ставим в воздух, воду или на место растения
  if (cur !== BLOCK.AIR && cur !== BLOCK.WATER && !isPlant(cur)) return;
  // Не ставим блок внутрь игрока
  const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
  const HW = CONFIG.PLAYER_WIDTH / 2 + 0.01;
  const overlap = x + 1 > px - HW && x < px + HW &&
    y + 1 > py && y < py + CONFIG.PLAYER_HEIGHT &&
    z + 1 > pz - HW && z < pz + HW;
  const id = palette[hotbarIndex];
  if (overlap && isSolid(id)) return;
  if (world.setBlock(x, y, z, id)) {
    sfx.place();
    particles.burst(x, y, z, tileColor(BLOCKS[id].tiles[0]), 5);
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
  player.events.onStep = (inWater) => sfx.step(inWater);
  player.events.onJump = () => sfx.jump();
  player.events.onLand = () => sfx.land();
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
  const seed = (data?.seed != null) ? data.seed : ((Math.random() * 0x7fffffff) | 0);
  world = new World(seed);
  player = new Player(world);
  attachPlayerEvents();
  if (mobs) mobs.dispose();
  mobs = new Mobs(THREE, scene, world);
  mobs._onChirp = () => sfx.chirp();
  // Сразу подружим окрестность жизнью
  for (let i = 0; i < 4; i++) mobs.spawnAround(player.pos, world.seaLevel);

  if (data) {
    world.loadEdits(data.edits || []);
    settings.paletteUnlocked = !!data.paletteUnlocked;
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

  ysdk.gameplayReady();
  saveData = buildSave(); // «Продолжить» имеет смысл и до первого сохранения

  enterGame();
}

// ---------------------------------------------------------------- Обработчики UI
ui.handlers.onPlay = () => { sfx.resume(); sfx.uiOk(); startWorld(false); };
ui.handlers.onNewWorld = () => { sfx.resume(); sfx.uiOk(); saveData = null; startWorld(true); };
ui.handlers.onResume = () => { sfx.uiClick(); resumeGame(); };
ui.handlers.onSaveQuit = async () => { sfx.uiOk(); await saveAndQuit(); };
ui.handlers.onReward = () => requestReward();
ui.handlers.onSlot = (i) => {
  hotbarIndex = i;
  ui.setHotbarSelection(i);
  sfx.uiClick();
};
ui.handlers.onPauseBtn = () => pauseGame();
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
  tryActionBreak();
};
input.handlers.onActionPlace = () => {
  if (state !== 'game') return;
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

    // Прицел и действия
    const hit = pickTarget();
    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else {
      highlight.visible = false;
    }

    // Нажатие ЛКМ: сначала проверяем моба
    const wasBreaking = breakWasHeld;
    breakWasHeld = input.breakHeld;
    if (input.breakHeld && !wasBreaking) {
      const mobHit = pickMob();
      if (mobHit) {
        hitMob(mobHit);
        mobHoldBlock = true;
      }
    }
    if (!input.breakHeld) mobHoldBlock = false;

    if (input.breakHeld && !mobHoldBlock && hit) {
      const key = `${hit.x},${hit.y},${hit.z}`;
      if (breakTarget !== key) {
        breakTarget = key;
        breakProgress = 0;
        digTickAcc = 0;
        sfx.dig(breakKind(hit.id));
      }
      const kind = breakKind(hit.id);
      breakProgress += dt / (CONFIG.BREAK_TIME[kind] ?? CONFIG.BREAK_TIME.default);
      // Тикание кирки во время ломания
      digTickAcc += dt;
      if (digTickAcc > 0.28) {
        digTickAcc = 0;
        sfx.dig(kind);
      }
      if (breakProgress >= 1) {
        doBreak(hit);
      } else {
        ui.setBreakProgress(breakProgress);
        // Оверлей трещин на блоке
        crackMesh.visible = true;
        crackMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        const stage = Math.min(crackMats.length - 1, Math.floor(breakProgress * crackMats.length));
        crackMesh.material = crackMats[stage];
      }
    } else {
      breakTarget = null;
      breakProgress = 0;
      ui.setBreakProgress(0);
      crackMesh.visible = false;
    }

    placeCooldown -= dt;
    if (input.placeHeld && placeCooldown <= 0 && hit) {
      doPlace(hit);
      placeCooldown = 0.25;
    }

    // Камера
    const eye = player.eyePos();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;

    // Небо, свет, вода
    sky.update(dt, player.pos);
    const L = sky.lightLevel;
    terrainMat.color.setScalar(0.28 + 0.72 * L);
    waterMat.color.setScalar(0.3 + 0.7 * L);

    // Мобы
    if (mobs) mobs.update(dt, player.pos, L);

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
  }

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
  get mobs() { return mobs; },
  get crack() { return crackMesh; },
  get crackMats() { return crackMats; },
  get sky() { return sky; },
};
