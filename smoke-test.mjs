// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk, buildSkylight, SKY_LIGHT_LEVELS } from './src/mesher.js';
import { Weather, WEATHER_LIFECYCLE } from './src/weather.js';
import * as THREEReal from 'three';
import { ItemDrops, ITEM_MAGNET_RANGE, ITEM_PICKUP_RANGE } from './src/items.js';
import { Player } from './src/physics.js';
import { updateRunShake } from './src/camera-effects.js';
import { createWorldRecord, emptyWorldProfile, normalizeWorldProfile, serializeWorldProfile } from './src/world-store.js';
import { migrateSave } from './src/save-migration.js';
import { raycastVoxel } from './src/raycast.js';
import { isSolid, isOpaque, isDecor, BLOCK, BLOCKS, BLOCK_NAMES, isSlab, isFence, isAnvil,
  blockBounds, slabFullBlock, slabPair, slabDropItem } from './src/blocks.js';
import { Inventory } from './src/inventory.js';
import {
  RECIPES, craft, canCraft, validateRecipes, emptyGrid, matchRecipe, gridResult,
  craftFromGrid, needsTable, recipeGridSize, recipesFor, stationAllows, stationInfo,
} from './src/crafts.js';
import { ITEM, itemDef, itemDescription, foodValue, isFood, blockItem, blockDropItem, breakTime, itemDamage, maxStack, placeBlockId, toolKind, itemName } from './src/items.js';
import { spriteNames } from './src/icons.js';
import { tilePixels, T as TILE_ID, ATLAS_COLS, ATLAS_ROWS } from './src/textures.js';
import { Sky } from './src/sky.js';
import { heldLightVertex, heldLightFragment, waterFragment, waterShaderHook,
  varyingMismatches, usesVarying, vertexDeclares, fragmentDeclares } from './src/shaders.js';
import { CAVE_FOG_NEAR, CAVE_FOG_FAR, CAVE_FOG_COLOR, CAVE_OPEN_CAP,
  caveFogTarget, stepCaveFog } from './src/fog.js';
import { CONFIG } from './src/config.js';
import { Furnace, serializeFurnaces, deserializeFurnaces, fuelDuration, smeltResult } from './src/furnace.js';
import { STRINGS } from './src/i18n.js';
import * as gun from './src/gun.js';

// Заглушка THREE — достаточно для toGeometry
const calls = { geom: 0, verts: 0, idx: 0 };
const THREE = {
  BufferGeometry: class {
    constructor() { calls.geom++; }
    setAttribute() {}
    setIndex() {}
    computeBoundingSphere() {}
  },
  Float32BufferAttribute: class {
    constructor(arr, sz) {
      calls.verts += sz === 3 ? arr.length / 3 : 0;
      this.arr = arr;
    }
  },
};

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log('OK  ', name);
  else { console.log('FAIL', name, detail ? `(${detail})` : ''); failed++; }
}

// Нормализация угла в [-PI, PI] — для проверок «моб не крутится на месте»
function angNorm(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function itemNameRu(key) { return itemName(key, 'ru'); }

const runShakeTest = { duration: 0, strength: 0 };
let runStrength = 0;
for (let i = 0; i < 119; i++) runStrength = updateRunShake(runShakeTest, true, 1 / 60);
check('тряска при беге не включается до задержки', runStrength < 0.001);
for (let i = 0; i < 90; i++) runStrength = updateRunShake(runShakeTest, true, 1 / 60);
check('тряска плавно нарастает после двух секунд и ограничена', runStrength > 0.2 && runStrength < 1);
for (let i = 0; i < 240; i++) runStrength = updateRunShake(runShakeTest, true, 1 / 60);
check('тряска достигает заданного лимита', runStrength > 0.98 && runStrength <= 1);
runStrength = updateRunShake(runShakeTest, false, 1 / 60);
check('тряска плавно затухает после остановки', runStrength < 1 && runStrength > 0);
const causePlayer = new Player({ getBlock: () => BLOCK.AIR });
causePlayer.hp = 1;
let deathCause = null;
causePlayer.events.onDeath = (cause) => { deathCause = cause; };
causePlayer.hurt(2, 'fall');
check('игрок передаёт причину гибели обработчику смерти', deathCause === 'fall');

const world = new World(12345);

// Генерация чанков
const c0 = world.getChunk(0, 0);
check('chunk generated', c0.generated);
check('chunk has surface', c0.blocks.some((v) => v === 1 || v === 5 || v === 12)); // grass/sand/snow
check('chunk has stone', c0.blocks.includes(3));
check('water fills somewhere near sea', c0.blocks.includes(13) || world.heightAt(3, 3) > 22);

// Высоты детерминированы
check('heightAt deterministic', world.heightAt(10, -20) === world.heightAt(10, -20));
check('heightAt in bounds', (() => {
  for (let i = 0; i < 500; i++) {
    const h = world.heightAt((i * 37) % 1000, (i * 91) % 1000);
    if (h < 3 || h > CONFIG.WORLD_HEIGHT - 3) return false;
  }
  return true;
})());
check('geology: deterministic quarry and rift depressions', (() => {
  const geology = new World(4242);
  const quarry = geology.featureAt(71, -841);
  const rift = geology.featureAt(-1000, -107);
  const quarryY = geology.heightAt(71, -841);
  const riftY = geology.heightAt(-1000, -107);
  const quarryFloor = geology.getBlock(71, quarryY, -841);
  const riftFloor = geology.getBlock(-1000, riftY, -107);
  return quarry?.type === 'quarry' && rift?.type === 'rift'
    && quarryY < geology.baseHeightAt(71, -841)
    && riftY < geology.baseHeightAt(-1000, -107)
    && [BLOCK.STONE, BLOCK.GRAVEL].includes(quarryFloor) && riftFloor === BLOCK.STONE;
})());

// Блоки: get/set и правки
const h = world.heightAt(0, 0);
const before = world.getBlock(0, h, 0);
check('setBlock works', world.setBlock(0, h + 2, 0, 10));
check('getBlock after set', world.getBlock(0, h + 2, 0) === 10);
check('edit recorded', world.edits.has(`0,${h + 2},0`));

const supportWorld = new World(93);
let unsupportedDecor = null;
supportWorld.onUnsupportedDecor = (x, y, z, id) => { unsupportedDecor = { x, y, z, id }; };
supportWorld.setBlock(123, 60, 123, BLOCK.STONE);
supportWorld.setBlock(123, 61, 123, BLOCK.FERN);
supportWorld.setBlock(123, 60, 123, BLOCK.DIRT);
check('растение сохраняется при замене опоры на твёрдый блок', supportWorld.getBlock(123, 61, 123) === BLOCK.FERN);
supportWorld.setBlock(123, 60, 123, BLOCK.AIR);
check('растение удаляется вместе с опорой, сохраняется и даёт событие выпадения',
  supportWorld.getBlock(123, 61, 123) === BLOCK.AIR && supportWorld.edits.get('123,61,123') === BLOCK.AIR
    && unsupportedDecor?.id === BLOCK.FERN && unsupportedDecor.x === 123 && unsupportedDecor.y === 61);

// Миграция одиночного сохранения и отдельный профиль с несколькими мирами.
const migrated = normalizeWorldProfile({ seed: 456, mode: 'survival', edits: [], settings: { lang: 'en' } });
check('старое сохранение автоматически становится миром в списке',
  migrated.worlds.length === 1 && migrated.worlds[0].seed === 456 && migrated.worlds[0].save.seed === 456);
const migratedPR6 = migrateSave({ v: 1, seed: 456, edits: ['0,62,0', 24], inventory: { ore: 2, gold_ore: 1, block_24: 1 } });
check('сохранения PR6 мигрируют id блоков и ключи руды', migratedPR6.v === 3
  && migratedPR6.edits[1] === BLOCK.TORCH
  && migratedPR6.inventory.some(([key]) => key === ITEM.RAW_IRON)
  && migratedPR6.inventory.some(([key]) => key === ITEM.RAW_GOLD)
  && migratedPR6.inventory.some(([key]) => key === blockItem(BLOCK.TORCH)));
const extraWorld = createWorldRecord({ name: 'Пещеры', seed: 77, difficulty: 'hard', mode: 'survival' }, 1234, () => 0.5);
const twoWorlds = normalizeWorldProfile({ ...emptyWorldProfile(), activeWorldId: extraWorld.id, worlds: [migrated.worlds[0], extraWorld] });
check('профиль хранит несколько миров и выбранный мир', twoWorlds.worlds.length === 2 && twoWorlds.activeWorldId === extraWorld.id);
check('в профиле мира сохраняются имя, сложность и режим', extraWorld.name === 'Пещеры' && extraWorld.difficulty === 'hard' && extraWorld.mode === 'survival');
const profileWithSave = serializeWorldProfile(twoWorlds, { seed: 77, mode: 'survival', difficulty: 'hard' }, { lang: 'en' }, true);
check('сохранение обновляет только активный мир профиля', profileWithSave.worlds[1].save?.seed === 77
  && profileWithSave.settings.lang === 'en' && profileWithSave.paletteUnlocked);

// Пересоздание чанка воспроизводит правки
world.chunks.delete('0,0');
const c0b = world.getChunk(0, 0);
check('edit survives regen', c0b.get(0, h + 2, 0) === 10);

// Спавн
const spawn = world.findSpawn();
check('spawn above water', spawn.y > 22);
check('спавн не над лазом в пещеру', (() => {
  const sx = Math.floor(spawn.x), sz = Math.floor(spawn.z);
  const h = world.heightAt(sx, sz);
  return world.getBlock(sx, h - 1, sz) !== BLOCK.AIR && world.getBlock(sx, h - 2, sz) !== BLOCK.AIR;
})());

// Сериализация правок
const ser = world.serializeEdits();
const world2 = new World(12345);
world2.loadEdits(ser);
check('edits roundtrip', world2.getBlock(0, h + 2, 0) === 10);

// Мешер
const { opaque, water } = meshChunk(THREE, world2, 0, 0);
check('opaque mesh non-empty', opaque.pos.length > 0 && opaque.idx.length > 0);
check('mesh indices valid', (() => {
  const nVerts = opaque.pos.length / 3;
  for (const i of opaque.idx) if (i < 0 || i >= nVerts) return false;
  return true;
})());
check('uv count matches', opaque.uv.length / 2 === opaque.pos.length / 3);
check('color count matches', opaque.col.length === opaque.pos.length);
check('triangles in groups of 3', opaque.idx.length % 3 === 0);
check('no NaN in positions', !opaque.pos.some((v) => Number.isNaN(v)));
check('shades in range', opaque.col.every((v) => v >= 0 && v <= 4.1));
const topSlabMesh = meshChunk(THREE, {
  chunkSize: 1, worldHeight: 4, getBlock: (x, y, z) => x === 0 && z === 0 && y === 2 ? BLOCK.PLANK_SLAB_TOP : BLOCK.AIR,
}, 0, 0).opaque;
const topSlabYs = topSlabMesh.pos.filter((_, i) => i % 3 === 1);
check('верхняя плита занимает верхнюю половину блока', Math.min(...topSlabYs) === 2.5 && Math.max(...topSlabYs) === 3);

// Замкнутая пещера: колодец в скале, со всех сторон камень — свету взяться неоткуда
const caveWorld = (withTorch) => {
  const blocks = new Map([
    ['0,1,0', BLOCK.STONE],
    ['0,4,0', BLOCK.STONE],
  ]);
  const edits = new Map();
  if (withTorch) {
    blocks.set('0,2,0', BLOCK.TORCH);
    edits.set('0,2,0', BLOCK.TORCH);
  }
  return {
    chunkSize: 1,
    worldHeight: 6,
    edits,
    getBlock(x, y, z) {
      if (y < 0) return BLOCK.SLATE;
      if (y >= 6) return BLOCK.AIR;
      // Порода вокруг колодца: сюда небесный свет не добирается
      if (Math.floor(x) !== 0 || Math.floor(z) !== 0) return BLOCK.STONE;
      return blocks.get(`0,${y},0`) || BLOCK.AIR;
    },
  };
};
const darkCaveMesh = meshChunk(THREE, caveWorld(false), 0, 0).opaque;
const litCaveMesh = meshChunk(THREE, caveWorld(true), 0, 0).opaque;
// Внутренние грани пещеры: пол (верх нижнего камня) и потолок (низ верхнего камня)
const caveTopShade = (mesh) => Math.max(...mesh.col.slice(0, 12), ...mesh.col.slice(36, 48));
const caveTorchLight = (mesh) => Math.max(...mesh.torch.slice(0, 4), ...mesh.torch.slice(12, 16));
check('без факела закрытая пещера остаётся тёмной', caveTopShade(darkCaveMesh) < 0.2 && caveTorchLight(darkCaveMesh) === 0);
check('факел локально освещает пещеру без плоского спрайта', caveTorchLight(litCaveMesh) > 0.3
  && caveTorchLight(litCaveMesh) > caveTopShade(darkCaveMesh) * 5
  && litCaveMesh.pos.length === darkCaveMesh.pos.length);
check('свет факелов — отдельный канал на каждую вершину', litCaveMesh.torch.length === litCaveMesh.pos.length / 3
  && litCaveMesh.torch.every((v) => v >= 0 && v <= 1));
check('свет факела не меняет небесный канал', caveTopShade(litCaveMesh) === caveTopShade(darkCaveMesh));

// ---- Небесный свет: плавное затухание с глубиной и полная темнота в глубине ----
{
  const S2 = 22, H2 = 12;
  // Широкий горизонтальный ход: слева открытая колонка (полный свет), дальше — под скалой
  const tunnelWorld = {
    chunkSize: S2,
    worldHeight: H2,
    getBlock(x, y, z) {
      if (y < 0) return BLOCK.STONE;
      if (y >= H2) return BLOCK.AIR;
      return Math.floor(x) === 0 ? BLOCK.AIR : (y >= 6 ? BLOCK.STONE : BLOCK.AIR);
    },
  };
  const sky = buildSkylight(tunnelWorld, 0, 0, S2, H2);
  const level = (x, y) => sky.sample(x + 0.5, y + 0.5, 11.5);
  check('под открытым небом полный свет', level(0, 3) === SKY_LIGHT_LEVELS);
  check('свет уходит вглубь пещеры постепенно', [1, 2, 3, 4, 5, 6, 10, 15].every((x) => level(x, 3) === SKY_LIGHT_LEVELS - x));
  check('через 20 блоков от входа — полная темнота', level(SKY_LIGHT_LEVELS, 3) === 0 && level(21, 3) === 0);
  const sealed = { chunkSize: S2, worldHeight: H2, getBlock: (x, y, z) => (y <= 2 ? BLOCK.STONE : BLOCK.AIR) };
  const sealedSky = buildSkylight(sealed, 0, 0, S2, H2);
  check('замурованная каверна без источников света черна', sealedSky.sample(4.5, 1.5, 4.5) === 0);
}

check('ясная погода длится дольше дождя', WEATHER_LIFECYCLE.clear[0] > WEATHER_LIFECYCLE.rain[1] * 2);
const weatherScene = new THREEReal.Scene();
const weatherTest = new Weather(THREEReal, weatherScene);
const strike = weatherTest._createLightning({ x: 0, y: 25, z: 0 }, {
  worldHeight: 64,
  heightAt: () => 20,
});
check('молния имеет точку удара и отдельную 3D-геометрию', !!strike && strike.y === 21
  && strike.distance >= 10 && weatherScene.children.some((child) => child === weatherTest.lightningGroup));
weatherTest.reset();

const g = opaque.toGeometry(THREE);
check('toGeometry ok', !!g);

// Вода строится отдельно
check('water builder exists', !!water);

// AO: блок в углу должен делать вершину темнее — сравним две вершины
check('AO varies (some dark, some bright)', (() => {
  let mn = 2, mx = -1;
  for (const v of opaque.col) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return mx - mn > 0.1;
})());

// Обход треугольников: нормали верхних граней должны смотреть вверх.
// Пещеры дают законные «потолочные» грани, поэтому верхних должно быть заметно больше,
// но не обязательно вдвое.
check('winding: up-facing triangles dominate', (() => {
  let up = 0, down = 0;
  for (let t = 0; t < opaque.idx.length; t += 3) {
    const i0 = opaque.idx[t], i1 = opaque.idx[t + 1], i2 = opaque.idx[t + 2];
    const p0 = opaque.pos.slice(i0 * 3, i0 * 3 + 3);
    const p1 = opaque.pos.slice(i1 * 3, i1 * 3 + 3);
    const p2 = opaque.pos.slice(i2 * 3, i2 * 3 + 3);
    const a = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const b = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const ny = a[2] * b[0] - a[0] * b[2]; // компонента y у (a x b)
    if (ny > 0.5) up++;
    if (ny < -0.5) down++;
  }
  return up > 100 && up > down * 1.3;
})());

// Рейкаст: взгляд сверху вниз попадает в блок с нормалью +Y
check('raycast hits block top with +Y normal', (() => {
  const h = world2.heightAt(2, 2);
  const hit = raycastVoxel(world2, 2.5, h + 3.5, 2.5, 0, -1, 0, 6);
  return !!hit && hit.y === h && hit.ny === 1 && hit.x === 2 && hit.z === 2;
})());
check('raycast misses up to sky', (() => {
  const h = world2.heightAt(2, 2);
  return raycastVoxel(world2, 2.5, h + 3.5, 2.5, 0, 1, 0, 6) === null;
})());

// ---- Пещеры: полости под землёй, входы с поверхности, натёки ----
{
  const cw = new World(4242);
  const S = CONFIG.CHUNK_SIZE, SEA = CONFIG.SEA_LEVEL;
  let columns = 0, hollow = 0, deepHollow = 0, mouths = 0, spikes = 0;
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      const c = cw.getChunk(cx, cz);
      const ox = cx * S, oz = cz * S;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const h = cw.heightAt(ox + x, oz + z);
          columns++;
          let top = -1;
          for (let y = 4; y < h; y++) {
            const b = c.get(x, y, z);
            if (b === BLOCK.AIR) { hollow++; if (top < y) top = y; }
            if (y <= h - 9) {
              // считаем сквозные полости на глубине
              if (b === BLOCK.AIR && deepHollow < columns * 4) deepHollow++;
            }
            if (b === BLOCK.SLATE && c.get(x, y + 1, z) === BLOCK.AIR) spikes++;
          }
          // вход открыт сверху: дёрн снят, под ним пустота
          if (h > SEA + 2 && c.get(x, h, z) === BLOCK.AIR && c.get(x, h - 1, z) === BLOCK.AIR) mouths++;
        }
      }
    }
  }
  const airShare = hollow / columns;
  check('пещеры: под землёй есть полости', airShare > 0.05, 'их ' + (airShare * 100).toFixed(1) + '% высоты колонок');
  check('пещеры: воздух распределён по глубине', deepHollow > 200, 'считано ' + deepHollow);
  check('пещеры: есть входы с поверхности', mouths >= 2, 'входов ' + mouths + ' на ' + columns + ' колонок');
  check('пещеры: в залах есть натёки из сланца', spikes > 10, 'натёков ' + spikes);

  // Входы должны быть проходимы: внутри лаза — ступени по 1–2 блока вниз,
  // а не отвесная яма до самого пола пещеры
  const airAt = (c, x, y, z) => c.get(x, y, z) === BLOCK.AIR;
  const solidAt = (c, x, y, z) => {
    const b = c.get(x, y, z);
    return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE;
  };
  let mouths2 = 0, walkable = 0, worstStep = 0;
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      const c = cw.getChunk(cx, cz);
      const ox = cx * S, oz = cz * S;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const h = cw.heightAt(ox + x, oz + z);
          if (h <= SEA + 2) continue;
          if (!airAt(c, x, h, z) || !airAt(c, x, h - 1, z) || !airAt(c, x, h - 2, z)) continue;
          mouths2++;
          let bestSteps = 0, bestStep = 0;
          for (const gx of [x - 1, x]) {
            for (const gz of [z - 1, z]) {
              if (gx < 0 || gz < 0 || gx + 1 >= S || gz + 1 >= S) continue;
              const cols = [[gx, gz], [gx + 1, gz], [gx, gz + 1], [gx + 1, gz + 1]];
              let top = 0;
              for (const [px, pz] of cols) top = Math.max(top, cw.heightAt(ox + px, oz + pz));
              let y = top - 1, steps = 0, maxStep = 0;
              while (steps < 40) {
                let drop = 0;
                for (const d of [1, 2]) {
                  if (y - d < 3) continue;
                  const found = cols.some(([px, pz]) => solidAt(c, px, y - d, pz)
                    && airAt(c, px, y - d + 1, pz) && airAt(c, px, y - d + 2, pz));
                  if (found) { drop = d; break; }
                }
                if (!drop) break;
                maxStep = Math.max(maxStep, drop);
                y -= drop;
                steps++;
              }
              if (steps > bestSteps) { bestSteps = steps; bestStep = maxStep; }
            }
          }
          if (bestSteps >= 4) walkable++;
          if (bestStep > worstStep) worstStep = bestStep;
        }
      }
    }
  }
  check('пещеры: входы со ступенями, а не отвесные ямы',
    mouths2 > 0 && walkable === mouths2 && worstStep <= 2,
    'входов ' + mouths2 + ', со ступенями ' + walkable + ', худший шаг ' + worstStep);

  // Пол пещер выровнен: глубокие ямы рядом с проходимым полом — редкость,
  // спускаться и подниматься можно ступенями (это требование «без резких перепадов»)
  const solidW = (wx, wy, wz) => {
    const b = cw.getBlock(wx, wy, wz);
    return b !== BLOCK.AIR && b !== BLOCK.WATER && b !== BLOCK.ICE;
  };
  let stand = 0, deepPits = 0, deepest = 0;
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      const ox = cx * S, oz = cz * S;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const wx = ox + x, wz = oz + z;
          const h = cw.heightAt(wx, wz);
          if (cw.getBlock(wx, h - 1, wz) === BLOCK.AIR) continue;     // колонна лаза — не пол пещеры
          for (let y = 5; y < Math.min(42, h - 3); y++) {
            if (cw.getBlock(wx, y, wz) !== BLOCK.AIR || !solidW(wx, y - 1, wz)) continue;
            if (cw.getBlock(wx, y + 1, wz) !== BLOCK.AIR) continue;
            stand++;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = wx + dx, nz = wz + dz;
              if (cw.heightAt(nx, nz) <= y) continue;
              if (cw.getBlock(nx, y, nz) !== BLOCK.AIR || cw.getBlock(nx, y - 1, nz) !== BLOCK.AIR) continue;
              let floor = -1;
              for (let ny = y - 1; ny > 2; ny--) {
                if (solidW(nx, ny, nz)) { floor = ny + 1; break; }
                if (cw.getBlock(nx, ny, nz) === BLOCK.WATER) { floor = -2; break; }
              }
              if (floor < 0) continue;
              const d = y - floor;
              if (d > deepest) deepest = d;
              if (d >= 5) deepPits++;
            }
          }
        }
      }
    }
  }
  check('пещеры: рядом с полом почти нет глубоких ям',
    stand > 500 && deepPits / stand < 0.01 && deepest <= 8,
    'мест ' + stand + ', глубоких ям ' + deepPits + ' (' + (100 * deepPits / stand).toFixed(2) + '%), глубочайшая ' + deepest);

  // Пещеры детерминированы: тот же сид — тот же мир
  const cw2 = new World(4242);
  let same = true;
  for (let y = 4; y < 30 && same; y++) {
    for (let x = 0; x < S; x++) {
      for (let z = 0; z < S; z++) {
        if (cw.getBlock(x, y, z) !== cw2.getBlock(x, y, z)) { same = false; break; }
      }
    }
  }
  check('пещеры: генерация детерминирована', same);
}

// ---- Декоративная трава ----
// Мир состоит из биомов (пустыни, горы, снег), поэтому травяные участки ищем
// на площадке пошире — в радиусе 6 чанков они точно есть
const wd = new World(987654);
let decorCount = 0;
for (let cz = -6; cz <= 6; cz++) {
  for (let cx = -6; cx <= 6; cx++) {
    const c = wd.getChunk(cx, cz);
    for (const v of c.blocks) if (v >= 15 && v <= 19) decorCount++;
  }
}
check('decor (grass/flowers) generated', decorCount > 5);

// Крестовый меш: +8 вершин и +24 индекса на один декор-блок
wd.setBlock(2, 60, 2, 0);               // гарантированно пустая клетка (там могли быть валуны)
const meshA = meshChunk(THREE, wd, 0, 0).opaque;
wd.setBlock(2, 60, 2, 15); // трава гарантированно в воздухе
const meshB = meshChunk(THREE, wd, 0, 0).opaque;
check('decor meshed as cross quads', (() => {
  const dv = meshB.pos.length - meshA.pos.length;
  const di = meshB.idx.length - meshA.idx.length;
  return dv === 8 * 3 && di === 24;
})());

// Декор непроходим и не непрозрачен
check('decor is walk-through', isDecor(15) && !isSolid(15) && !isOpaque(15));

// ---- Предметы, описания и плавка ----
check('предметы и блоки имеют описания на русском и английском', (() => {
  const allBlocks = BLOCKS.slice(1).filter((block) => block.id !== BLOCK.WATER);
  return allBlocks.every((block) => itemDescription(blockItem(block.id), 'ru') && itemDescription(blockItem(block.id), 'en'))
    && Object.values(ITEM).every((key) => itemDescription(key, 'ru') && itemDescription(key, 'en'))
    && itemDescription(blockItem(BLOCK.FURNACE), 'ru').toLowerCase().includes('печ')
    && itemDescription(blockItem(BLOCK.FURNACE), 'en').toLowerCase().includes('smelt');
})());
check('печь знает рецепты и топливо', smeltResult(ITEM.RAW_IRON) === ITEM.IRON_INGOT
  && smeltResult(blockItem(BLOCK.SAND)) === blockItem(BLOCK.GLASS)
  && fuelDuration(ITEM.COAL) > 0);
check('печь не принимает неподходящие предметы', (() => {
  const f = new Furnace();
  return !f.setStack('input', { key: ITEM.STICK, count: 1 })
    && !f.setStack('fuel', { key: ITEM.APPLE, count: 1 });
})());
check('печь переплавляет руду и сериализует состояние', (() => {
  const f = new Furnace();
  f.setStack('input', { key: ITEM.RAW_IRON, count: 1 });
  f.setStack('fuel', { key: ITEM.COAL, count: 1 });
  for (let i = 0; i < 45; i++) f.update(0.1);
  const map = new Map([['4,25,-8', f]]);
  const restored = deserializeFurnaces(serializeFurnaces(map)).get('4,25,-8');
  return restored?.getSlot('output')?.key === ITEM.IRON_INGOT
    && restored.getSlot('output')?.count === 1 && restored.getSlot('input') === null;
})());

// ---- Дроп с блоков ----
check('трава падает землёй', blockDropItem(BLOCK.GRASS) === blockItem(BLOCK.DIRT));
check('камень падает булыжником', blockDropItem(BLOCK.STONE) === blockItem(BLOCK.COBBLE));
check('стекло не даёт ничего', blockDropItem(BLOCK.GLASS) === null);
check('вода не даёт ничего', blockDropItem(BLOCK.WATER) === null);
check('песок падает песком', blockDropItem(BLOCK.SAND) === blockItem(BLOCK.SAND));
check('листва падает иногда', (() => {
  let yes = 0;
  for (let i = 0; i < 400; i++) if (blockDropItem(BLOCK.LEAVES, () => i % 4 === 0)) yes++;
  return yes > 0 && yes < 400;
})());
check('физические предметы лежат и притягиваются только рядом', (() => {
  const scene = new THREEReal.Scene();
  const drops = new ItemDrops(scene);
  let picked = 0;
  drops.onPickup = () => picked++;
  const item = drops.spawn(5, 0.85, 0, ITEM.APPLE);
  item.rest = true;
  item.vel = { x: 0, y: 0, z: 0 };
  const flatWorld = { getBlock: () => BLOCK.AIR };
  const player = { x: 0, y: 0, z: 0 };
  drops.update(1 / 60, flatWorld, player);
  const waitsAtDistance = !item.attracting && drops.items.length === 1;
  item.group.position.set(ITEM_MAGNET_RANGE - 0.5, 0.85, 0);
  drops.update(1 / 60, flatWorld, player);
  const startedAtCloseRange = item.attracting && item.group.position.x < ITEM_MAGNET_RANGE - 0.5;
  for (let i = 0; i < 300 && drops.items.length; i++) drops.update(1 / 60, flatWorld, player);
  const collectedOnlyAfterApproach = picked === 1 && drops.items.length === 0;
  drops.clear();
  return waitsAtDistance && startedAtCloseRange && collectedOnlyAfterApproach
    && ITEM_MAGNET_RANGE > ITEM_PICKUP_RANGE;
})());
check('стопки: блок 64, инструмент 1', maxStack(blockItem(BLOCK.STONE)) === 64 && maxStack(ITEM.WOOD_AXE) === 1);
check('поставить можно только блок', placeBlockId(blockItem(BLOCK.PLANKS)) === BLOCK.PLANKS
  && placeBlockId(ITEM.STICK) === 0);
check('инструмент опознаётся', toolKind(ITEM.STONE_PICKAXE) === 'pickaxe'
  && toolKind(ITEM.WOOD_AXE) === 'axe' && toolKind(ITEM.STONE_AXE) === 'axe' && toolKind(ITEM.STICK) === null);

// ---- Скорость ломания с инструментами ----
const BASE_STONE = CONFIG.BREAK_TIME.slow;
const BASE_LOG = CONFIG.BREAK_TIME.default;
check('камень без кирки ×2.6', Math.abs(breakTime(BLOCK.STONE, null, 'survival') - BASE_STONE * 2.6) < 1e-9);
check('деревянная кирка ×0.85', Math.abs(breakTime(BLOCK.STONE, ITEM.WOOD_PICKAXE, 'survival') - BASE_STONE * 0.85) < 1e-9);
check('каменная кирка ×0.55', Math.abs(breakTime(BLOCK.STONE, ITEM.STONE_PICKAXE, 'survival') - BASE_STONE * 0.55) < 1e-9);
check('дерево без топора ×1.6', Math.abs(breakTime(BLOCK.LOG, null, 'survival') - BASE_LOG * 1.6) < 1e-9);
check('топор ускоряет дерево ×0.5', Math.abs(breakTime(BLOCK.LOG, ITEM.WOOD_AXE, 'survival') - BASE_LOG * 0.5) < 1e-9);
check('каменный топор быстрее деревянного', breakTime(BLOCK.LOG, ITEM.STONE_AXE, 'survival') < breakTime(BLOCK.LOG, ITEM.WOOD_AXE, 'survival'));
check('земля ломается как раньше', Math.abs(breakTime(BLOCK.DIRT, null, 'survival') - CONFIG.BREAK_TIME.fast) < 1e-9);
check('креатив: блок ломается за 0.045 с',
  breakTime(BLOCK.STONE, null, 'creative') === CONFIG.CREATIVE_BREAK_TIME && CONFIG.CREATIVE_BREAK_TIME === 0.045);
check('урон: рука 1, деревянный меч 2, каменный 3',
  itemDamage(null) === 1 && itemDamage(ITEM.WOOD_SWORD) === 2 && itemDamage(ITEM.STONE_SWORD) === 3);

// ---- Инвентарь: 36 ячеек, стопки до 64 ----
const inv = new Inventory(CONFIG.INV_SIZE);
check('инвентарь: 36 ячеек, первые 9 — хотбар', inv.size === 36 && CONFIG.HOTBAR_SIZE === 9);
check('добавление с переносом в новые стопки', inv.add(blockItem(BLOCK.DIRT), 70) === 0
  && inv.count(blockItem(BLOCK.DIRT)) === 70 && inv.get(0).count === 64 && inv.get(1).count === 6);
check('инструменты не складываются в стопку', inv.add(ITEM.WOOD_AXE, 2) === 0 && inv.get(2).count === 1 && inv.get(3).count === 1);
check('удаление предметов', inv.remove(blockItem(BLOCK.DIRT), 70) && inv.count(blockItem(BLOCK.DIRT)) === 0);
check('удаление больше, чем есть — не проходит', inv.remove(blockItem(BLOCK.DIRT), 1) === false);
check('сериализация инвентаря крутится без потерь', (() => {
  const a = new Inventory(CONFIG.INV_SIZE);
  a.setStack(5, { key: blockItem(BLOCK.GLASS), count: 12 });
  a.setStack(20, { key: ITEM.STONE_SWORD, count: 1 });
  const b = new Inventory(CONFIG.INV_SIZE);
  b.deserialize(a.serialize());
  return b.get(5).count === 12 && b.get(20).key === ITEM.STONE_SWORD && b.get(0) === null;
})());
check('инвентарь полон → лишнее не влезает', (() => {
  const full = new Inventory(CONFIG.INV_SIZE);
  for (let i = 0; i < full.size; i++) full.setStack(i, { key: blockItem(BLOCK.STONE), count: 64 });
  return full.add(blockItem(BLOCK.STONE), 5) === 5;
})());

// ---- Крафт ----
check('рецепты без ошибок', validateRecipes().length === 0, validateRecipes().join('; '));
check('42 рецепта (берёзовые доски, забор, наковальня, металлические инструменты, алмазный молот, пистолет и патроны)',
  RECIPES.length === 42, 'их ' + RECIPES.length);
function craftWith(input, id) {
  const i = new Inventory(CONFIG.INV_SIZE);
  for (const [k, n] of Object.entries(input)) i.add(k, n);
  const recipe = RECIPES.find((r) => r.id === id);
  const res = craft(i, recipe);
  return { res, i };
}
const r1 = craftWith({ [blockItem(BLOCK.LOG)]: 1 }, 'planks');
check('бревно → 4 доски', r1.res === 'ok' && r1.i.count(blockItem(BLOCK.PLANKS)) === 4 && r1.i.count(blockItem(BLOCK.LOG)) === 0);
const r2 = craftWith({ [blockItem(BLOCK.PLANKS)]: 2 }, 'sticks');
check('2 доски → 4 палки', r2.res === 'ok' && r2.i.count(ITEM.STICK) === 4);
const r3 = craftWith({ [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, 'wood_pickaxe');
check('3 доски + 2 палки → деревянная кирка', r3.res === 'ok' && r3.i.count(ITEM.WOOD_PICKAXE) === 1
  && r3.i.count(blockItem(BLOCK.PLANKS)) === 0 && r3.i.count(ITEM.STICK) === 0);
check('3 доски + 2 палки → деревянный топор', craftWith({ [blockItem(BLOCK.PLANKS)]: 3, [ITEM.STICK]: 2 }, 'wood_axe').i.count(ITEM.WOOD_AXE) === 1);
check('2 доски + палка → деревянный меч', craftWith({ [blockItem(BLOCK.PLANKS)]: 2, [ITEM.STICK]: 1 }, 'wood_sword').i.count(ITEM.WOOD_SWORD) === 1);
check('3 булыжника + 2 палки → каменная кирка', craftWith({ [blockItem(BLOCK.COBBLE)]: 3, [ITEM.STICK]: 2 }, 'stone_pickaxe').i.count(ITEM.STONE_PICKAXE) === 1);
check('2 булыжника + палка → каменный меч', craftWith({ [blockItem(BLOCK.COBBLE)]: 2, [ITEM.STICK]: 1 }, 'stone_sword').i.count(ITEM.STONE_SWORD) === 1);
check('2 песка → стекло', craftWith({ [blockItem(BLOCK.SAND)]: 2 }, 'glass').i.count(blockItem(BLOCK.GLASS)) === 1);
check('2 булыжника + 2 песка → 2 кирпича', craftWith({ [blockItem(BLOCK.COBBLE)]: 2, [blockItem(BLOCK.SAND)]: 2 }, 'brick').i.count(blockItem(BLOCK.BRICK)) === 2);
check('2 булыжника → камень', craftWith({ [blockItem(BLOCK.COBBLE)]: 2 }, 'stone').i.count(blockItem(BLOCK.STONE)) === 1);
check('2 камня → 2 сланца', craftWith({ [blockItem(BLOCK.STONE)]: 2 }, 'slate').i.count(blockItem(BLOCK.SLATE)) === 2);
check('булыжник + палка + листва → 2 светокамня',
  craftWith({ [blockItem(BLOCK.COBBLE)]: 1, [ITEM.STICK]: 1, [blockItem(BLOCK.LEAVES)]: 1 }, 'glow').i.count(blockItem(BLOCK.GLOW)) === 2);
check('песок + земля → снег', craftWith({ [blockItem(BLOCK.SAND)]: 1, [blockItem(BLOCK.DIRT)]: 1 }, 'snow').i.count(blockItem(BLOCK.SNOW)) === 1);
check('без ресурсов крафт не проходит', craftWith({}, 'planks').res === 'missing');
check('ресурсы не списываются при нехватке', (() => {
  const { i } = craftWith({ [blockItem(BLOCK.LOG)]: 1 }, 'planks');
  const before = i.count(blockItem(BLOCK.LOG));
  const recipe = RECIPES.find((r) => r.id === 'planks');
  craft(i, recipe);
  return i.count(blockItem(BLOCK.LOG)) === before;
})());
check('недоступный рецепт не проходит проверку доступности', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  return !canCraft(i, RECIPES.find((r) => r.id === 'stone_pickaxe'));
})());

// ---- Сетка крафта ----
function grid2(pairs) {
  const g = emptyGrid(2);
  for (const [i, key, n] of pairs) g[i] = { key, count: n ?? 1 };
  return g;
}
function grid3(pairs) {
  const g = emptyGrid(3);
  for (const [i, key, n] of pairs) g[i] = { key, count: n ?? 1 };
  return g;
}
check('сетка 2×2: бревно → доски', gridResult(grid2([[0, blockItem(BLOCK.LOG)]]), 2)?.out.key === blockItem(BLOCK.PLANKS));
check('сетка 2×2: 2 доски столбиком → палки',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)]]), 2)?.out.key === ITEM.STICK);
check('сетка 2×2: 2 доски в ряд → деревянные плиты',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)]]), 2)?.out.key === blockItem(BLOCK.PLANK_SLAB));
check('сетка 2×2: 2 булыжника в ряд → каменные плиты',
  gridResult(grid2([[0, blockItem(BLOCK.COBBLE)], [1, blockItem(BLOCK.COBBLE)]]), 2)?.out.key === blockItem(BLOCK.COBBLE_SLAB));
check('сетка 2×2: 4 доски → верстак',
  gridResult(grid2([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)],
    [2, blockItem(BLOCK.PLANKS)], [3, blockItem(BLOCK.PLANKS)]]), 2)?.out.key === blockItem(BLOCK.TABLE));
check('верстак нужен для 3×3 рецептов', needsTable(RECIPES.find((r) => r.id === 'wood_pickaxe'))
  && recipeGridSize(RECIPES.find((r) => r.id === 'wood_pickaxe')) === 3
  && !needsTable(RECIPES.find((r) => r.id === 'planks')));
check('сетка 3×3: кирка (3 доски + 2 палки)',
  gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)],
    [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_PICKAXE);
check('сетка 2×2 не собирает кирку (нужен верстак)',
  gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)], [2, blockItem(BLOCK.PLANKS)],
    [4, ITEM.STICK], [7, ITEM.STICK]]).slice(0, 4), 2) === null);
check('сетка 3×3: топор', gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [1, blockItem(BLOCK.PLANKS)],
  [3, blockItem(BLOCK.PLANKS)], [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_AXE);
check('сетка 3×3: меч', gridResult(grid3([[0, blockItem(BLOCK.PLANKS)], [3, blockItem(BLOCK.PLANKS)],
  [6, ITEM.STICK]]), 3)?.out.key === ITEM.WOOD_SWORD);
check('сетка 3×3: кирка из булыжника', gridResult(grid3([[0, blockItem(BLOCK.COBBLE)], [1, blockItem(BLOCK.COBBLE)],
  [2, blockItem(BLOCK.COBBLE)], [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.STONE_PICKAXE);
check('сетка 3×3: каменный топор', gridResult(grid3([[0, blockItem(BLOCK.COBBLE)], [1, blockItem(BLOCK.COBBLE)],
  [3, blockItem(BLOCK.COBBLE)], [4, ITEM.STICK], [7, ITEM.STICK]]), 3)?.out.key === ITEM.STONE_AXE);
check('лишний предмет в сетке ломает рецепт',
  gridResult(grid2([[0, blockItem(BLOCK.LOG)], [3, blockItem(BLOCK.SAND)]]), 2) === null);
check('бесформенные рецепты (светокамень)', gridResult(grid2([
  [0, blockItem(BLOCK.COBBLE)], [1, ITEM.STICK], [2, blockItem(BLOCK.LEAVES)]]), 2)?.out.count === 2);
check('крафт из сетки тратит по одному предмету', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  const g = grid2([[0, blockItem(BLOCK.LOG), 3]]);
  const res = craftFromGrid(g, 2, i);
  return res === 'ok' && i.count(blockItem(BLOCK.PLANKS)) === 4 && g[0].count === 2;
})());
check('крафт из сетки «всё сразу» (ПКМ по результату)', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  const g = grid2([[0, blockItem(BLOCK.LOG), 3]]);
  const res = craftFromGrid(g, 2, i, true);
  return res === 'ok' && i.count(blockItem(BLOCK.PLANKS)) === 12 && g[0] === null;
})());
check('крафт из сетки: пустая сетка', (() => {
  const i = new Inventory(CONFIG.INV_SIZE);
  return craftFromGrid(emptyGrid(2), 2, i) === 'nothing';
})());

// ---- Еда: съедобность и поедание удержанием ----
{
  const { Eating, EAT_TIME, CHEW_INTERVAL } = await import('./src/eating.js');
  check('еда: яблоко съедобно, палка — нет', foodValue(ITEM.APPLE) === 4 && isFood(ITEM.APPLE)
    && foodValue(ITEM.STICK) === 0 && !isFood(ITEM.STICK));
  check('еда: удержание занимает около секунды', EAT_TIME > 0.8 && EAT_TIME < 1.6 && CHEW_INTERVAL > 0.1);
  check('еда: без еды в руке поедание не начинается', (() => {
    const e = new Eating();
    let events = 0;
    for (let i = 0; i < 180; i++) if (e.update(1 / 60, true, false)) events++;
    return events === 0 && !e.active;
  })());
  check('еда: короткое нажатие не тратит предмет', (() => {
    const e = new Eating();
    let started = false, done = false;
    for (let i = 0; i < 18; i++) {            // 0.3 с — меньше, чем нужно
      const ev = e.update(1 / 60, true, true);
      if (ev === 'start') started = true;
      if (ev === 'done') done = true;
    }
    for (let i = 0; i < 60; i++) e.update(1 / 60, false, true);
    return started && !done && !e.active && e.raised < 0.2;
  })());
  check('еда: удержание до конца съедает предмет', (() => {
    const e = new Eating();
    let done = false, chews = 0, maxRaise = 0;
    for (let i = 0; i < 180 && !done; i++) {
      const ev = e.update(1 / 60, true, true);
      if (ev === 'done') done = true;
      if (ev === 'chew') chews++;
      maxRaise = Math.max(maxRaise, e.raised);
    }
    return done && chews >= 2 && maxRaise > 0.9;
  })());
  check('еда: повторное удержание снова кормит', (() => {
    const e = new Eating();
    let done = 0;
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 180; i++) {
        const ev = e.update(1 / 60, true, true);
        if (ev === 'done') { done++; break; }
      }
      for (let i = 0; i < 30; i++) e.update(1 / 60, false, true);
    }
    return done === 2;
  })());
  check('еда: подсказки есть в обоих языках', (() => {
    return !!STRINGS.ru.eat_full && !!STRINGS.en.eat_full
      && !!STRINGS.ru.eat_ok && !!STRINGS.ru.hint_eat && !!STRINGS.en.hint_eat;
  })());
}

// ---- Лук и стрелы ----
check('лук и стрела есть в предметах', !!itemDef(ITEM.BOW) && !!itemDef(ITEM.ARROW));
check('лук: 3 палки + 3 доски', craftWith({ [ITEM.STICK]: 3, [blockItem(BLOCK.PLANKS)]: 3 }, 'bow')
  .i.count(ITEM.BOW) === 1);
check('стрелы: палка + булыжник → 2 стрелы',
  craftWith({ [ITEM.STICK]: 1, [blockItem(BLOCK.COBBLE)]: 1 }, 'arrows').i.count(ITEM.ARROW) === 2);
check('лук не стакается', maxStack(ITEM.BOW) === 1);

// ---- Стрелы: полёт, попадание в блок, подбор ----
{
  const proj = await import('./src/projectiles.js');
  const scene = { add() {}, remove() {} };
  const arrows = new proj.Arrows(scene);
  const wallWorld = { getBlock: (x) => (x >= 3 ? 3 : 0) };
  let stuck = null, picked = 0, hitMob = null;
  const cb = { onBlock: (a) => { stuck = a; }, onPickup: (n) => { picked += n; } };
  arrows.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, cb);
  for (let i = 0; i < 120 && !stuck; i++) arrows.update(1 / 60, wallWorld, [], null);
  check('стрела долетает до стены', !!stuck);
  check('стрела не проваливается в блок', !!stuck && Math.floor(stuck.group.position.x) < 3);
  if (stuck) {
    for (let i = 0; i < 20 && !picked; i++) {
      arrows.update(1 / 60, wallWorld, [], stuck.group.position);
    }
    check('воткнутая стрела подбирается', picked === 1);
  }

  const arrows2 = new proj.Arrows(scene);
  const mob = { pos: { x: 2, y: 10, z: 0.5 }, dead: false, dying: -1 };
  arrows2.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, { onMob: (m) => { hitMob = m; } });
  for (let i = 0; i < 120 && !hitMob; i++) arrows2.update(1 / 60, wallWorld, [mob], null);
  check('стрела попадает в моба на лету', hitMob === mob);

  const arrows3 = new proj.Arrows(scene);
  let dyingHit = null;
  const dying = { pos: { x: 2, y: 10, z: 0.5 }, dead: false, dying: 0.4 };
  arrows3.shoot(0.5, 10, 0.5, 1, 0, 0, 20, 3, { onMob: (m) => { dyingHit = m; } });
  for (let i = 0; i < 120 && !dyingHit; i++) arrows3.update(1 / 60, wallWorld, [dying], null);
  check('в умирающего моба стрела не бьёт', dyingHit === null);
}

// ---- Пистолет и патроны ----
check('пистолет и патроны есть в предметах', !!itemDef(ITEM.PISTOL) && !!itemDef(ITEM.BULLET));
check('пистолет: 3 слитка + 2 доски + палка на верстаке', (() => {
  const r = craftWith({ [ITEM.IRON_INGOT]: 3, [blockItem(BLOCK.PLANKS)]: 2, [ITEM.STICK]: 1 }, 'pistol');
  return r.res === 'ok' && r.i.count(ITEM.PISTOL) === 1;
})());
check('патроны: слиток + уголь → 8 патронов (без верстака)', (() => {
  const r = craftWith({ [ITEM.IRON_INGOT]: 1, [ITEM.COAL]: 1 }, 'bullets');
  return r.res === 'ok' && r.i.count(ITEM.BULLET) === 8
    && !needsTable(RECIPES.find((x) => x.id === 'bullets'));
})());
check('пистолет не стакается, патроны стакаются', maxStack(ITEM.PISTOL) === 1 && maxStack(ITEM.BULLET) === 64);
check('пистолет и патрон описаны и нарисованы', (() => {
  return ['ru', 'en'].every((l) => itemDescription(ITEM.PISTOL, l) && itemDescription(ITEM.BULLET, l))
    && spriteNames().includes('pistol') && spriteNames().includes('bullet');
})());

check('модель пистолета: ствол вперёд, рукоять вниз, вспышка у дула', (() => {
  const byName = (n) => gun.PISTOL_PARTS.find((p) => p.name === n);
  const muzzle = byName('muzzle'), grip = byName('grip'), slide = byName('slide');
  const frontZ = Math.min(...gun.PISTOL_PARTS.map((p) => (p.z || 0) - p.d / 2));
  return !!muzzle && !!grip && !!slide
    && muzzle.z - muzzle.d / 2 === frontZ          // дуло — самая передняя деталь
    && grip.y < slide.y - 0.1                      // рукоять уходит вниз от затвора
    && gun.PISTOL_FLASH_PARTS.length > 0
    && gun.PISTOL_FLASH_Z <= muzzle.z        // вспышка начинается на дуле и уходит вперёд
    && gun.PISTOL_FLASH_PARTS.every((p) => p.z <= 0);
})());
check('пистолет мощнее лука и стреляет быстрее', gun.PISTOL_STATS.damage >= 5
  && gun.PISTOL_STATS.speed > 40 && gun.PISTOL_STATS.cooldown > 0);

// ---- Пуля: летит прямо, гаснет в блоке, бьёт моба ----
{
  const proj = await import('./src/projectiles.js');
  const scene = { add() {}, remove() {} };
  const wallWorld = { getBlock: (x) => (x >= 3 ? 3 : 0) };
  const bullets = new proj.Arrows(scene);
  let bulletBlock = null, bulletStuck = 0;
  bullets.shoot(0.5, 10, 0.5, 1, 0, 0, 62, 5,
    { onBlock: (a) => { bulletBlock = a; }, onPickup: () => { bulletStuck++; } },
    { kind: 'bullet', gravity: 4, stick: false });
  for (let i = 0; i < 60 && !bulletBlock; i++) bullets.update(1 / 60, wallWorld, [], null);
  check('пуля гаснет в блоке и не остаётся лежать', !!bulletBlock && bulletBlock.kind === 'bullet'
    && bullets.list.length === 0);
  const bullets2 = new proj.Arrows(scene);
  let bulletMob = null, bulletDmg = 0;
  const mob = { pos: { x: 2, y: 10, z: 0.5 }, dead: false, dying: -1 };
  bullets2.shoot(0.5, 10, 0.5, 1, 0, 0, 62, 5,
    { onMob: (m, a) => { bulletMob = m; bulletDmg = a.dmg; } },
    { kind: 'bullet', gravity: 4, stick: false });
  for (let i = 0; i < 60 && !bulletMob; i++) bullets2.update(1 / 60, wallWorld, [mob], null);
  check('пуля попадает в моба с уроном 5', bulletMob === mob && bulletDmg === 5 && bullets2.list.length === 0);
  check('пуля почти не падает на дистанции выстрела', (() => {
    const b = new proj.Arrows(scene);
    const a = b.shoot(0.5, 10, 0.5, 1, 0, 0, 62, 5, {}, { kind: 'bullet', gravity: 4, stick: false });
    for (let i = 0; i < 10; i++) b.update(1 / 60, { getBlock: () => 0 }, [], null);
    return a && Math.abs(a.group.position.y - 10) < 0.15;
  })());
}

// ---- Мобы: направление движения, урон, анимация смерти ----
{
  const mobs = await import('./src/mobs.js');
  const THREE = await import('three');
  const flat = { getBlock: (x, y) => (y <= 30 ? 1 : 0), seaLevel: 22, heightAt: () => 30 };
  const visuals = { group: new THREE.Group(), legs: [], head: null, ears: [], hop: true };
  const mob = new mobs.Mob(flat, visuals, 'bunny', 0.5, 31, 0.5);
  mob.state = 'walk';
  mob.thinkT = 1e9;                 // курс не перебивается «мыслями»
  mob.heading = 0.7;
  const x0 = mob.pos.x, z0 = mob.pos.z;
  mob.update(0.5, { x: 60, y: 31, z: 60 });
  const mx = mob.pos.x - x0, mz = mob.pos.z - z0;
  const fwd = new THREE.Vector3(0, 0, 1).applyEuler(visuals.group.rotation);
  check('моб сдвинулся с места', Math.hypot(mx, mz) > 0.1);
  check('моб смотрит по ходу движения', mx * fwd.x + mz * fwd.z > 0.1);
  check('взгляд моба горизонтальный', Math.abs(fwd.y) < 1e-6);

  check('кап мобов', mobs.MOB_CAPS.spider === 3 && mobs.MOB_CAPS.creeper === 2);
  check('ночные мобы враждебны', ['zombie', 'spider', 'creeper'].every((t) => mobs.HOSTILE.has(t)));
  check('рыба и волк — не враждебные', !mobs.HOSTILE.has('fish') && !mobs.HOSTILE.has('wolf'));
  const difficultyManager = new mobs.MobManager(new THREE.Scene(), flat);
  difficultyManager.setDifficulty('peaceful');
  check('мирная сложность не спавнит враждебных мобов и зомби',
    !mobs.HOSTILE.has(difficultyManager._randomType())
      && difficultyManager.trySpawnZombie({ pos: { x: 0, y: 31, z: 0 }, yaw: 0 }) === null);
  difficultyManager.setDifficulty('hard');
  check('сложность меняет лимит мобов', difficultyManager.max === 18 && difficultyManager.difficulty === 'hard');
  check('птицу можно поразить, пока она жива', (() => {
    const bird = new mobs.Mob(flat, mobs.makeMobVisuals('bird'), 'bird', 0.5, 36, 0.5);
    const targetable = bird.hittable();
    bird.hurt(1);
    return targetable && bird.dying === 0 && !bird.hittable();
  })());
  check('зомби — наземный моб с моделью гуманоида', (() => {
    const v = mobs.makeMobVisuals('zombie');
    const zombie = new mobs.Mob(flat, v, 'zombie', 0.5, 31, 0.5);
    zombie.heading = 0;
    zombie.update(0.5, { x: 10.5, y: 31, z: 0.5 });
    return v.legs.length === 2 && v.arms.length === 2
      && zombie.pos.x > 0.8 && Math.abs(zombie.pos.y - 31) < 0.01;
  })());
  check('зомби атакует игрока на расстоянии удара', (() => {
    const zombie = new mobs.Mob(flat, mobs.makeMobVisuals('zombie'), 'zombie', 0.5, 31, 0.5);
    let attacks = 0;
    zombie.onAttack = () => attacks++;
    zombie.update(1 / 60, { x: 1.5, y: 31, z: 0.5 });
    return attacks === 1 && zombie.lungeT > 0;
  })());

  // Анимации: походка, взгляд, хвост, мигание, выпад
  const animMob = (type, opts = {}) => {
    const v = mobs.makeMobVisuals(type);
    const m = new mobs.Mob(opts.world || flat, v, type, 0.5, 31, 0.5);
    m.state = opts.state || 'walk';
    m.thinkT = 1e9;
    m.heading = 0;
    return { v, m };
  };
  const sidePlayer = { x: 5.5, y: 31, z: 0.5 };

  check('лапы ходят диагональными парами', (() => {
    const { v, m } = animMob('wolf');
    let opposite = 0;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      if (v.legs[0].rotation.x > 0.25 && v.legs[1].rotation.x < -0.25) opposite++;
    }
    return opposite > 3;
  })());

  check('моб смотрит на игрока головой', (() => {
    const { v, m } = animMob('sheep');
    for (let i = 0; i < 60; i++) m.update(1 / 60, sidePlayer);
    const yaw = v.look[0].rotation.y;
    return Math.abs(yaw) > 0.3 && Math.abs(yaw) < 0.8;
  })());

  check('в бегстве моб не оглядывается', (() => {
    const { v, m } = animMob('bunny', { state: 'flee' });
    for (let i = 0; i < 60; i++) m.update(1 / 60, sidePlayer);
    return Math.abs(v.look[0].rotation.y) < 0.05;
  })());

  check('хвост виляет', (() => {
    const { v, m } = animMob('wolf');
    let mn = 9, mx = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, { x: 40, y: 31, z: 40 });
      mn = Math.min(mn, v.tail.rotation.y);
      mx = Math.max(mx, v.tail.rotation.y);
    }
    return mx - mn > 0.3;
  })());

  check('мобы мигают', (() => {
    const { v, m } = animMob('bunny', { state: 'idle' });
    let closed = 0;
    for (let i = 0; i < 600; i++) {
      m.update(1 / 60, sidePlayer);
      if (v.blink[0].scale.y < 0.2) closed++;
    }
    return closed > 3 && closed < 120;
  })());

  check('выпад вперёд при атаке', (() => {
    const { v, m } = animMob('wolf', { state: 'hunt' });
    m.angry = true;
    let adv = 0;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, { x: 1.2, y: 31, z: 0.5 });
      adv = Math.max(adv, v.group.position.x - m.pos.x);
    }
    return adv > 0.1;
  })());

  check('паук перебирает восемью ногами', (() => {
    const { v, m } = animMob('spider');
    let moved = 0;
    const z0 = v.legs[0].rotation.z;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      if (Math.abs(v.legs[0].rotation.x) > 0.1) moved++;
    }
    return moved > 20 && Math.abs(v.legs[0].rotation.z - z0) > 0.01;
  })());

  check('крипер перебирает лапами, пока горит фитиль', (() => {
    const { v, m } = animMob('creeper');
    m.fuseT = 0;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
      m.update(1 / 60, { x: 2, y: 31, z: 0.5 });
      if (Math.abs(v.legs[0].rotation.x) > 0.05) moved++;
    }
    return moved > 10;
  })());

  check('рыба чавкает и бьёт хвостом', (() => {
    const sea = { getBlock: () => BLOCK.WATER, seaLevel: 22, heightAt: () => 30 };
    const { v, m } = animMob('fish', { world: sea, state: 'idle' });
    let mn = 9, mx = -9, mnMouth = 9, mxMouth = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      mn = Math.min(mn, v.tail.rotation.y);
      mx = Math.max(mx, v.tail.rotation.y);
      mnMouth = Math.min(mnMouth, v.mouth[0].scale.x);
      mxMouth = Math.max(mxMouth, v.mouth[0].scale.x);
    }
    return mx - mn > 0.3 && mxMouth - mnMouth > 0.2;
  })());

  check('птица машет крыльями и вертит головой', (() => {
    const { v, m } = animMob('bird');
    let mn = 9, mx = -9, mnHead = 9, mxHead = -9;
    for (let i = 0; i < 60; i++) {
      m.update(1 / 60, sidePlayer);
      mn = Math.min(mn, v.wings[0].rotation.z);
      mx = Math.max(mx, v.wings[0].rotation.z);
      mnHead = Math.min(mnHead, v.head.position.y);
      mxHead = Math.max(mxHead, v.head.position.y);
    }
    return mx - mn > 0.5 && mxHead - mnHead > 0.01;
  })());

  // Смерть: долгая анимация — моб краснеет, заваливается на бок и только потом убирается
  const mkDead = () => {
    const d = new mobs.Mob(flat, mobs.makeMobVisuals('spider'), 'spider', 0.5, 31, 0.5);
    d.hurt(99);
    return d;
  };
  const dead = mkDead();
  check('смертельный урон включает анимацию, а не мгновенное исчезновение', dead.dying === 0 && !dead.dead);
  check('умирающий моб становится красным', dead.hurtMats.size > 0
    && [...dead.hurtMats.values()].every((m) => m.color.r > m.color.g && m.color.r > m.color.b));
  const baseScale = dead.v.group.scale.x;
  dead.updateDeath(mobs.MOB_DEATH_TIME * 0.62);     // к этому времени моб уже лежит
  const tilt = Math.abs(dead.v.group.rotation.z);
  const midRed = [...dead.hurtMats.values()][0]?.color.r ?? 0;
  check('моб заваливается на бок', tilt > 1 && dead.v.group.scale.x < baseScale && !dead.dead);
  check('анимация смерти длится дольше вспышки урона', mobs.MOB_DEATH_TIME >= 1.5);
  dead.updateDeath(mobs.MOB_DEATH_TIME);            // анимация доводится до конца
  check('после анимации моб убирается из мира', dead.dead);
  const endRed = [...dead.hurtMats.values()][0]?.color.r ?? 0;
  check('моб темнеет к концу анимации смерти', endRed > 0.2 && endRed < midRed);

  // Отсчёт падения не превращается в «урон из ниоткуда»: заплыв и полёт его сбрасывают
  const swimWorld = { getBlock: (x, y, z) => (y <= 0 ? BLOCK.STONE : BLOCK.WATER) };
  const swimmer = new Player(swimWorld);
  swimmer.pos.y = 8;
  for (let i = 0; i < 240; i++) swimmer.update({ forward: 0, right: 0, jump: 0, sneak: 0, sprint: false }, 1 / 60);
  check('в воде урон от падения не накапливается', swimmer.hp === 20 && swimmer._fallFrom === null);
  const flyer = new Player(swimWorld);
  flyer.pos.y = 40;
  flyer.toggleFly();
  for (let i = 0; i < 120; i++) flyer.update({ forward: 0, right: 0, jump: 0, sneak: 0, sprint: false }, 1 / 60);
  check('в полёте отсчёт падения сброшен', flyer._fallFrom === null);

  // Креатив: урон и вовсе не проходит
  const god = new Player({ getBlock: () => BLOCK.AIR });
  god.invulnerable = true;
  god.hp = 20;
  check('в креативе урон не проходит и здоровье полное', god.hurt(5, 'fall') === false && god.hp === 20);
}

// Разметка экранов и локальная 3D-молния (без полноэкранного flash overlay)
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
const weatherSource = await (await import('node:fs/promises')).readFile(new URL('./src/weather.js', import.meta.url), 'utf8');
check('экран миров и форма создания доступны в разметке', html.includes('id="world-list-screen"')
  && html.includes('id="world-create-screen"') && html.includes('id="world-name"')
  && html.includes('id="world-seed"') && html.includes('id="world-difficulty"'));
check('молния создаётся в конкретной точке, экран не вспыхивает целиком', weatherSource.includes('_createLightning')
  && weatherSource.includes('lightningStrike') && !html.includes('id="lightning"'));
check('разметка: выбор режима, инвентарь, рюкзак', html.includes('id="mode-screen"')
  && html.includes('id="inventory-screen"') && html.includes('id="btn-bag"')
  && html.includes('id="cursor-item"') && html.includes('id="inv-hotbar-row"'));
check('печь: разметка содержит три слота и панель плавки', html.includes('id="inv-furnace-panel"')
  && html.includes('data-furnace-slot="input"') && html.includes('data-furnace-slot="fuel"')
  && html.includes('data-furnace-slot="output"'));
const css = await (await import('node:fs/promises')).readFile(new URL('./styles.css', import.meta.url), 'utf8');
check('печь: панель имеет стили', css.includes('.furnace-layout') && css.includes('#furnace-progress-fill'));

check('сундук: разметка и стили панели', html.includes('id="inv-chest-panel"') && html.includes('id="inv-chest-grid"')
  && css.includes('.chest-panel'));

// ---- Новые механики: сундук, настенные факелы, плотная листва, пещеры-«черви», свет через границу чанков ----
{
  const { serializeChests, deserializeChests, createChest, CHEST_SIZE } = await import('./src/chest.js');
  const { torchSupport, wallTorchSide, WALL_TORCH_BY_SIDE, CHEST_BY_FRONT, isChest, DENSE_FOLIAGE_TILE } = await import('./src/blocks.js');
  const { addToRange } = await import('./src/inventory-ui.js');

  // Сундук: рецепт 3×3 из 8 досок, 27 ячеек, сохранение по координатам
  const P = blockItem(BLOCK.PLANKS);
  const ring = [P, P, P, P, null, P, P, P, P].map((k) => (k ? { key: k, count: 1 } : null));
  check('сундук крафтится из 8 досок на верстаке', gridResult(ring, 3)?.out.key === blockItem(BLOCK.CHEST));
  const chest = createChest();
  chest.add(ITEM.COAL, 10);
  chest.add(blockItem(BLOCK.STONE), 70);
  const restored = deserializeChests(serializeChests(new Map([['1,2,3', chest], ['4,5,6', createChest()]])));
  check('сундук: 27 ячеек и сохранение содержимого', CHEST_SIZE === 27 && restored.get('1,2,3')?.count(ITEM.COAL) === 10
    && restored.get('1,2,3')?.count(blockItem(BLOCK.STONE)) === 70 && !restored.has('4,5,6'));
  check('все варианты сундука — сундук, выпадает один предмет', Object.values(CHEST_BY_FRONT).every((id) => isChest(id)
    && blockDropItem(id) === blockItem(BLOCK.CHEST) && BLOCKS[id].interactive === 'chest'));

  // Быстрое перемещение в хотбар/рюкзак: сначала докладываем в стопки, потом в пустые
  const qinv = new Inventory();
  qinv.setStack(0, { key: blockItem(BLOCK.DIRT), count: 60 });
  qinv.setStack(12, { key: blockItem(BLOCK.DIRT), count: 10 });
  const left = addToRange(qinv, 0, 9, blockItem(BLOCK.DIRT), 10);
  check('shift-перемещение: докладывает в стопки диапазона', left === 0 && qinv.get(0).count === 64 && qinv.get(1)?.count === 6);

  // Настенные факелы: 4 модели, каждая держится за свою стену
  const wallWorld = (solid) => ({ getBlock: (x, y, z) => (solid.has(`${x},${y},${z}`) ? BLOCK.STONE : BLOCK.AIR) });
  const w4 = wallWorld(new Set(['1,0,0', '-1,0,0', '0,0,1', '0,0,-1']));
  check('настенный факел: 4 варианта со своей стороной', ['px', 'nx', 'pz', 'nz'].every((side) =>
    torchSupport(WALL_TORCH_BY_SIDE[side], w4, 0, 0, 0) === side && wallTorchSide(w4, 0, 0, 0, WALL_TORCH_BY_SIDE[side]) === side));
  const onlyWest = wallWorld(new Set(['-1,0,0']));
  check('настенный факел без своей стены теряет опору', torchSupport(WALL_TORCH_BY_SIDE.px, onlyWest, 0, 0, 0) === null
    && torchSupport(WALL_TORCH_BY_SIDE.nx, onlyWest, 0, 0, 0) === 'nx');
  check('настенные факелы выпадают обычным факелом', Object.values(WALL_TORCH_BY_SIDE).every((id) => blockDropItem(id) === blockItem(BLOCK.TORCH)));

  // Плотная листва: внутренние грани кроны рисуются (плотной текстурой), а не пропадают
  const leafWorld = (n) => ({ chunkSize: 4, worldHeight: 4, getBlock: (x, y, z) => (y === 1 && z === 1 && x >= 1 && x < 1 + n ? BLOCK.LEAVES : BLOCK.AIR) });
  const oneLeaf = meshChunk(THREE, leafWorld(1), 0, 0).opaque.idx.length / 6;
  const twoLeaves = meshChunk(THREE, leafWorld(2), 0, 0).opaque.idx.length / 6;
  check('листва: внутренние грани между блоками кроны не выбрасываются', oneLeaf === 6 && twoLeaves === 12);
  check('листва: для внутренних граней есть плотные тайлы', [BLOCK.LEAVES, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LEAVES]
    .every((id) => DENSE_FOLIAGE_TILE[BLOCKS[id].tiles[0]] > 0));

  // Свет из входа в соседнем чанке доходит сюда без обрыва на границе
  const borderWorld = {
    chunkSize: 16, worldHeight: 12,
    getBlock(x, y, z) {
      if (y < 0) return BLOCK.STONE;
      if (y >= 12) return BLOCK.AIR;
      if (x === -6 && z === 5) return BLOCK.AIR;         // колодец к небу в соседнем чанке
      return y >= 6 ? BLOCK.STONE : (y >= 2 && z >= 3 && z <= 7 ? BLOCK.AIR : BLOCK.STONE);
    },
  };
  const bsky = buildSkylight(borderWorld, 0, 0, 16, 12);
  check('свет из соседнего чанка проходит через границу', bsky.sample(0.5, 3.5, 5.5) === SKY_LIGHT_LEVELS - 6
    && bsky.sample(3.5, 3.5, 5.5) === SKY_LIGHT_LEVELS - 9);

  // Пещеры конечны: не сплошной слой, а отдельные ходы на разной глубине
  const cw = new World(777);
  const S = CONFIG.CHUNK_SIZE;
  let cols = 0, withCave = 0, deep = 0, high = 0;
  for (let cx = -3; cx <= 3; cx++) {
    for (let cz = -3; cz <= 3; cz++) {
      const c = cw.getChunk(cx, cz);
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const h = cw.heightAt(cx * S + x, cz * S + z);
          cols++;
          let any = false;
          for (let y = 5; y < h - 3; y++) {
            if (c.get(x, y, z) !== BLOCK.AIR) continue;
            any = true;
            if (y <= 9) deep++;
            if (y >= 16) high++;
          }
          if (any) withCave++;
        }
      }
    }
  }
  const share = withCave / cols;
  // Пещеры стали крупнее и встречаются чаще (просьба игрока), поэтому верхняя
  // граница выше: важно, что это по-прежнему отдельные ходы, а не сплошной слой.
  check('пещеры: отдельные ходы, а не сплошной слой', share > 0.08 && share < 0.8, (share * 100).toFixed(1) + '% колонок');
  check('пещеры: ходы уходят в глубину и поднимаются выше', deep > 300 && high > 100, 'глубоко ' + deep + ', высоко ' + high);
  check('пещеры: мир не превратился в решето', (() => {
    // Колонок, где пещера занимает больше половины подземной толщи, должно быть мало
    let hollow = 0, seen = 0;
    for (let cx = -3; cx <= 3; cx++) {
      for (let cz = -3; cz <= 3; cz++) {
        const c = cw.getChunk(cx, cz);
        for (let x = 0; x < S; x++) {
          for (let z = 0; z < S; z++) {
            const h = cw.heightAt(cx * S + x, cz * S + z);
            let air = 0, total = 0;
            for (let y = 5; y < h - 2; y++) { total++; if (c.get(x, y, z) === BLOCK.AIR) air++; }
            if (total > 0) { seen++; if (air / total > 0.5) hollow++; }
          }
        }
      }
    }
    return hollow / seen < 0.05;
  })());
}

// ---- Плиты, забор, наковальня, присед, дроп мобов, музыка, большие деревья ----
{
  // Плиты: форма, границы и «две плиты = полный блок»
  check('плита — не полный куб: нижняя занимает низ клетки',
    blockBounds(BLOCK.PLANK_SLAB).maxY === 0.5 && blockBounds(BLOCK.PLANK_SLAB).minY === 0);
  check('верхняя плита занимает верх клетки',
    blockBounds(BLOCK.PLANK_SLAB_TOP).minY === 0.5 && blockBounds(BLOCK.PLANK_SLAB_TOP).maxY === 1);
  check('плиты одного материала складываются в пару',
    slabPair(BLOCK.PLANK_SLAB)[1] === BLOCK.PLANK_SLAB_TOP && slabFullBlock(BLOCK.COBBLE_SLAB_TOP) === BLOCK.COBBLE);
  check('верхняя плита выпадает обычной плитой', slabDropItem(BLOCK.PLANK_SLAB_TOP) === BLOCK.PLANK_SLAB);

  // Боковая грань нижней плиты берёт свою половину тайла (текстура не тянется)
  const mkSlabWorld = (id) => ({
    chunkSize: 1, worldHeight: 3,
    getBlock: (x, y, z) => (x === 0 && z === 0 && y === 1 ? id : BLOCK.AIR),
  });
  const slabMesh = meshChunk(THREE, mkSlabWorld(BLOCK.PLANK_SLAB), 0, 0).opaque;
  const fullMesh = meshChunk(THREE, mkSlabWorld(BLOCK.PLANKS), 0, 0).opaque;
  const slabYs = slabMesh.pos.filter((_, i) => i % 3 === 1);
  check('нижняя плита занимает только нижнюю половину блока',
    Math.min(...slabYs) === 1 && Math.max(...slabYs) === 1.5);
  /** Все боковые грани +X отдельными четвёрками вершин */
  const sideFacesX = (mesh) => {
    const out = [];
    for (let v = 0; v + 3 < mesh.pos.length / 3; v += 4) {
      const xs = [0, 1, 2, 3].map((k) => mesh.pos[(v + k) * 3]);
      if (Math.max(...xs) - Math.min(...xs) > 1e-6) continue;
      const vs = [0, 1, 2, 3].map((k) => mesh.uv[(v + k) * 2 + 1]);
      out.push({ x: xs[0], vMin: Math.min(...vs), vMax: Math.max(...vs) });
    }
    return out;
  };
  const slabSides = sideFacesX(slabMesh).filter((f) => f.x === 1);
  const fullSides = sideFacesX(fullMesh).filter((f) => f.x === 1);
  check('боковые грани плиты и блока на месте', slabSides.length > 0 && fullSides.length > 0);
  check('UV боковой грани плиты — половина тайла (текстура не растянулась)',
    slabSides.every((f) => Math.abs((f.vMax - f.vMin) * 2 - (fullSides[0].vMax - fullSides[0].vMin)) < 1e-9)
    && slabSides.every((f) => f.vMin >= fullSides[0].vMin - 1e-9 && f.vMax <= fullSides[0].vMax + 1e-9),
    'плита ' + JSON.stringify(slabSides[0]) + ' блок ' + JSON.stringify(fullSides[0]));
  const topSlabSide = (() => {
    const m = meshChunk(THREE, mkSlabWorld(BLOCK.PLANK_SLAB_TOP), 0, 0).opaque;
    return sideFacesX(m).filter((f) => f.x === 1);
  })();
  check('верхняя плита показывает верхнюю половину тайла',
    topSlabSide.length > 0 && topSlabSide.every((f) => f.vMin > slabSides[0].vMin + 1e-6));

  // Две плиты (низ + верх) дают полных 6 граней, как обычный блок
  const pairMesh = meshChunk(THREE, {
    chunkSize: 1, worldHeight: 3,
    getBlock: (x, y, z) => (x === 0 && z === 0 && y === 1 ? BLOCK.PLANKS : BLOCK.AIR),
  }, 0, 0).opaque;
  check('полный блок из двух плит: 24 вершины (6 граней)', pairMesh.pos.length / 3 === 24,
    'вершин ' + pairMesh.pos.length / 3);

  // Забор
  check('забор — не полный куб, но выше блока (не перепрыгнуть)',
    isFence(BLOCK.FENCE) && blockBounds(BLOCK.FENCE).maxY === 1.5 && blockBounds(BLOCK.FENCE).minX === 0.375);
  check('забор твёрдый и непрозрачный для света частично', isSolid(BLOCK.FENCE) && !isOpaque(BLOCK.FENCE));
  const fenceWorld = {
    chunkSize: 3, worldHeight: 3,
    getBlock: (x, y, z) => (y === 1 && z === 1 && x >= 0 && x <= 2 ? BLOCK.FENCE : BLOCK.AIR),
  };
  const fenceMesh = meshChunk(THREE, fenceWorld, 0, 0).opaque;
  const fenceVerts = fenceMesh.pos.length / 3;
  check('забор рисуется столбиком с перекладинами (граней больше, чем у куба)',
    fenceVerts > 24 && fenceMesh.idx.length % 3 === 0, 'вершин ' + fenceVerts);
  const fenceYs = fenceMesh.pos.filter((_, i) => i % 3 === 1);
  check('забор выше блока — через него не перепрыгнуть',
    Math.max(...fenceYs) === 2.5 && Math.min(...fenceYs) === 1);
  check('одинокий забор — просто столбик (6 граней, как куб)', (() => {
    const one = meshChunk(THREE, {
      chunkSize: 3, worldHeight: 3,
      getBlock: (x, y, z) => (y === 1 && x === 1 && z === 1 ? BLOCK.FENCE : BLOCK.AIR),
    }, 0, 0).opaque;
    return one.pos.length / 3 === 24;
  })(), 'вершин ' + 0);
  check('ряд заборов соединяется перекладинами', fenceVerts >= 96, 'вершин ' + fenceVerts);

  // Наковальня: станок для инструментов выше каменных
  check('наковальня — интерактивный блок-станок', isAnvil(BLOCK.ANVIL) && BLOCKS[BLOCK.ANVIL].interactive === 'anvil');
  check('наковальня крафтится на верстаке из слитков, угля и досок', (() => {
    const inv = new Inventory(CONFIG.INV_SIZE);
    inv.add(ITEM.IRON_INGOT, 4); inv.add(ITEM.COAL, 2); inv.add(blockItem(BLOCK.PLANKS), 2);
    return craft(inv, RECIPES.find((r) => r.id === 'anvil')) === 'ok'
      && inv.count(blockItem(BLOCK.ANVIL)) === 1;
  })());
  const anvilStation = { type: 'anvil', gridSize: 3 };
  const tableStation = { type: 'table', gridSize: 3 };
  check('железная кирка недоступна без наковальни',
    stationInfo(null).anvil === false && stationInfo(tableStation).anvil === false
    && stationInfo(anvilStation).anvil === true);
  const ironPick = RECIPES.find((r) => r.id === 'iron_pickaxe');
  check('железная кирка куются только на наковальне',
    !stationAllows(ironPick, stationInfo(null)) && !stationAllows(ironPick, stationInfo(tableStation))
    && stationAllows(ironPick, stationInfo(anvilStation)));
  check('крафт железной кирки без наковальни возвращает «station»', (() => {
    const inv = new Inventory(CONFIG.INV_SIZE);
    inv.add(ITEM.IRON_INGOT, 5); inv.add(ITEM.STICK, 4);
    return craft(inv, ironPick) === 'station'
      && craft(inv, ironPick, anvilStation) === 'ok' && inv.count(ITEM.IRON_PICKAXE) === 1;
  })());
  check('список рецептов наковальни длиннее обычного',
    recipesFor(anvilStation).length > recipesFor(null).length
    && recipesFor(null).length === recipesFor(tableStation).length);
  const toolIds = ['iron_pickaxe', 'iron_axe', 'iron_sword',
    'gold_pickaxe', 'gold_axe', 'gold_sword', 'diamond_pickaxe', 'diamond_axe', 'diamond_sword'];
  check('все 9 металлических инструментов требуют наковальни', (() => {
    const tools = toolIds.map((id) => RECIPES.find((r) => r.id === id));
    return tools.every((r) => !!r && r.station === 'anvil' && needsTable(r));
  })(), toolIds.filter((id) => !RECIPES.some((r) => r.id === id && r.station === 'anvil')).join(','));
  check('слитки по-прежнему плавятся/крафтятся без наковальни', (() => {
    const ingots = RECIPES.filter((r) => /^(iron|gold)_ingot$/.test(r.id));
    return ingots.length === 2 && ingots.every((r) => !r.station);
  })());
  check('без наковальни доступно ровно 32 рецепта, с наковальней — 42',
    recipesFor(null).length === 32 && recipesFor(anvilStation).length === 42,
    recipesFor(null).length + '/' + recipesFor(anvilStation).length);
  check('сетка 3×3 на наковальне собирает алмазный меч', (() => {
    const g = emptyGrid(3);
    g[0] = { key: ITEM.DIAMOND, count: 1 };
    g[3] = { key: ITEM.DIAMOND, count: 1 };
    g[6] = { key: ITEM.STICK, count: 1 };
    if (gridResult(g, 3, null)) return false;                 // без наковальни — не выйдет
    const res = gridResult(g, 3, anvilStation);
    return !!res && res.out.key === ITEM.DIAMOND_SWORD;
  })());
  check('золото и алмазы теперь во что-то крафтятся', (() => {
    const gold = RECIPES.filter((r) => Object.keys(r.in || {}).includes(ITEM.GOLD_INGOT));
    const diam = RECIPES.filter((r) => Object.keys(r.in || {}).includes(ITEM.DIAMOND));
    return gold.length >= 3 && diam.length >= 3;
  })());

  // Берёзовые доски и забор из них
  check('берёзовое бревно → 4 берёзовые доски', (() => {
    const inv = new Inventory(CONFIG.INV_SIZE);
    inv.add(blockItem(BLOCK.BIRCH_LOG), 1);
    return craft(inv, RECIPES.find((r) => r.id === 'birch_planks')) === 'ok'
      && inv.count(blockItem(BLOCK.BIRCH_PLANKS)) === 4;
  })());
  check('забор крафтится из досок и палок (и из берёзовых досок)', (() => {
    const a = new Inventory(CONFIG.INV_SIZE);
    a.add(blockItem(BLOCK.PLANKS), 2); a.add(ITEM.STICK, 4);
    const okA = craft(a, RECIPES.find((r) => r.id === 'fence')) === 'ok' && a.count(blockItem(BLOCK.FENCE)) === 3;
    const b = new Inventory(CONFIG.INV_SIZE);
    b.add(blockItem(BLOCK.BIRCH_PLANKS), 2); b.add(ITEM.STICK, 4);
    const okB = craft(b, RECIPES.find((r) => r.id === 'fence_birch')) === 'ok' && b.count(blockItem(BLOCK.FENCE)) === 3;
    return okA && okB;
  })());

  // Сырое мясо жарится в печи
  check('сырое мясо → жареное в печи', smeltResult(ITEM.RAW_MEAT) === ITEM.COOKED_MEAT);
  check('жареное мясо сытнее сырого', foodValue(ITEM.COOKED_MEAT) > foodValue(ITEM.RAW_MEAT));

  // Дроп мобов: предметы существуют и описаны
  check('предметы дропа мобов: шерсть, мясо, клык', [ITEM.WOOL, ITEM.RAW_MEAT, ITEM.COOKED_MEAT, ITEM.FANG]
    .every((k) => !!itemDef(k) && itemNameRu(k).length > 0));
  check('иконки металлических инструментов и дропа нарисованы', (() => {
    const keys = ['iron_pickaxe', 'gold_sword', 'diamond_axe', 'wool', 'raw_meat', 'cooked_meat', 'fang'];
    return keys.every((k) => spriteNames().includes(k));
  })());
  check('иконки руды, слитков и алмаза нарисованы', (() => {
    const keys = ['raw_iron', 'raw_gold', 'diamond', 'iron_ingot', 'gold_ingot', 'coal'];
    return keys.every((k) => spriteNames().includes(k));
  })());

  // Игрок: присед и «не получил урон, выйдя из меню»
  const flat = (extra) => ({
    getBlock: (x, y, z) => (y < 20 ? BLOCK.STONE : (extra ? extra(x, y, z) : BLOCK.AIR)),
  });
  const sp = new Player(flat());
  sp.pos.x = 0.5; sp.pos.y = 20; sp.pos.z = 0.5;
  for (let i = 0; i < 12; i++) sp.update({ forward: 0, right: 0, jump: false, sneak: false, sprint: false }, 1 / 60);
  const standH = sp.height();
  for (let i = 0; i < 40; i++) sp.update({ forward: 0, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  check('присед: ниже рост и ниже глаза', sp.sneaking && sp.height() < standH && sp.eyeOffset > 0.2,
    'рост ' + sp.height() + ' глаза -' + sp.eyeOffset.toFixed(2));
  check('присед медленнее шага', CONFIG.SNEAK_SPEED < CONFIG.WALK_SPEED);
  check('глаза при приседе опускаются',
    Math.abs(sp.eyePos().y - (sp.pos.y + CONFIG.PLAYER_EYE - sp.eyeOffset)) < 1e-6
    && sp.eyePos().y < sp.pos.y + CONFIG.PLAYER_EYE - 0.2);
  for (let i = 0; i < 40; i++) sp.update({ forward: 0, right: 0, jump: false, sneak: false, sprint: false }, 1 / 60);
  check('встал после приседа — рост прежний', !sp.sneaking && sp.height() === standH && sp.eyeOffset === 0);

  // Крадущийся игрок не сходит с края платформы
  const plat = (x, y, z) => (y < 20 && x >= -3 && x <= 3 && z >= -3 && z <= 3 ? BLOCK.STONE : BLOCK.AIR);
  const sneakP = new Player({ getBlock: plat });
  sneakP.pos.x = 2.5; sneakP.pos.y = 20; sneakP.pos.z = 0.5;
  for (let i = 0; i < 20; i++) sneakP.update({ forward: 0, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  sneakP.yaw = -Math.PI / 2;                        // смотрим на +X, за которым пустота
  for (let i = 0; i < 180; i++) sneakP.update({ forward: 1, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  check('присед не даёт сойти с края блока', sneakP.pos.x < 4.35 && sneakP.pos.x > 4.1
    && sneakP.onGround && sneakP.pos.y === 20,
    'x=' + sneakP.pos.x.toFixed(2) + ' y=' + sneakP.pos.y.toFixed(2));
  // Присед не мешает подняться на ступеньку и зайти на плиту
  const stairWorld = (x, y, z) => {
    if (y < 20) return BLOCK.STONE;
    if (y === 20 && x >= 2 && x <= 4 && Math.abs(z) <= 2) return BLOCK.STONE;
    return BLOCK.AIR;
  };
  const stairP = new Player({ getBlock: stairWorld });
  stairP.pos.x = 0.5; stairP.pos.y = 20; stairP.pos.z = 0.5; stairP.yaw = -Math.PI / 2;
  for (let i = 0; i < 20; i++) stairP.update({ forward: 0, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  for (let i = 0; i < 240; i++) stairP.update({ forward: 1, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  check('крадущийся игрок поднимается на ступеньку без прыжка',
    stairP.pos.x > 4 && Math.abs(stairP.pos.y - 21) < 0.01,
    'x=' + stairP.pos.x.toFixed(2) + ' y=' + stairP.pos.y.toFixed(2));
  const slabWorld = (x, y, z) => {
    if (y < 20) return BLOCK.STONE;
    if (y === 20 && x >= 2 && x <= 4 && Math.abs(z) <= 2) return BLOCK.PLANK_SLAB;
    return BLOCK.AIR;
  };
  const slabP = new Player({ getBlock: slabWorld });
  slabP.pos.x = 0.5; slabP.pos.y = 20; slabP.pos.z = 0.5; slabP.yaw = -Math.PI / 2;
  for (let i = 0; i < 20; i++) slabP.update({ forward: 0, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  for (let i = 0; i < 240; i++) slabP.update({ forward: 1, right: 0, jump: false, sneak: true, sprint: false }, 1 / 60);
  check('крадущийся игрок заходит на плиту (поднимается на полклетки)',
    slabP.pos.x > 4 && Math.abs(slabP.pos.y - 20.5) < 0.01, 'y=' + slabP.pos.y.toFixed(2));
  const walkP = new Player({ getBlock: plat });
  walkP.pos.x = 2.5; walkP.pos.y = 20; walkP.pos.z = 0.5;
  walkP.yaw = -Math.PI / 2;
  for (let i = 0; i < 20; i++) walkP.update({ forward: 0, right: 0, jump: false, sneak: false, sprint: false }, 1 / 60);
  for (let i = 0; i < 180; i++) walkP.update({ forward: 1, right: 0, jump: false, sneak: false, sprint: false }, 1 / 60);
  check('без приседа с края спокойно падаем', walkP.pos.x > 4.2 || !walkP.onGround,
    'x=' + walkP.pos.x.toFixed(2));

  // Выход из паузы не должен выглядеть как удар
  const gp = new Player(flat());
  gp.hp = 20;
  gp.grace(0.6);
  const blocked = gp.hurt(4, 'zombie');
  const hpDuringGrace = gp.hp;
  gp.graceT = 0;
  const passed = gp.hurt(4, 'zombie');
  check('короткая неуязвимость после меню гасит «урон из ниоткуда»',
    blocked === false && hpDuringGrace === 20 && passed === true && gp.hp === 16,
    `blocked=${blocked} hp=${hpDuringGrace} passed=${passed} now=${gp.hp}`);

  // Мобы: застряв в щели, не крутятся на месте
  const { Mob } = await import('./src/mobs.js');
  const mobWorld = (blocks) => ({
    getBlock: (x, y, z) => blocks.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? BLOCK.AIR,
  });
  const visuals = () => {
    const group = {
      position: { x: 0, y: 0, z: 0, set() {} },
      rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
      scale: { x: 1, y: 1, z: 1, set() {}, setScalar() {} },
    };
    return { group, legs: [], arms: [], ears: [], look: null };
  };
  const openBlocks = new Map();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) openBlocks.set(`${x},19,${z}`, BLOCK.STONE);
  const openMob = new Mob(mobWorld(openBlocks), visuals(), 'sheep', 0.5, 20, 0.5);
  for (let i = 0; i < 120; i++) { openMob.state = 'walk'; openMob.update(1 / 60, { x: 40, y: 20, z: 40 }); }
  check('на открытом месте моб идёт и не застревает', openMob.stuckT === 0 && openMob.detourT === 0
    && Math.hypot(openMob.pos.x - 0.5, openMob.pos.z - 0.5) > 1,
    'прошёл ' + Math.hypot(openMob.pos.x - 0.5, openMob.pos.z - 0.5).toFixed(2));

  const box = new Map();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) box.set(`${x},19,${z}`, BLOCK.STONE);
  for (let y = 20; y <= 22; y++) {
    for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
      if (Math.abs(x) === 1 || Math.abs(z) === 1) box.set(`${x},${y},${z}`, BLOCK.STONE);
    }
  }
  box.set('0,23,0', BLOCK.STONE);                    // потолок — сверху тоже блок
  const trapped = new Mob(mobWorld(box), visuals(), 'sheep', 0.5, 20, 0.5);
  const spins = [];
  let prev = trapped.heading;
  for (let i = 0; i < 240; i++) {
    trapped.state = 'walk';
    trapped.update(1 / 60, { x: 60, y: 20, z: 60 });
    spins.push(Math.abs(angNorm(trapped.heading - prev)));
    prev = trapped.heading;
  }
  const avgSpin = spins.reduce((a, b) => a + b, 0) / spins.length;
  check('застрявший моб не вращается каждый кадр', avgSpin < 0.05, 'средний поворот ' + avgSpin.toFixed(3));
  check('застрявший моб понимает, что застрял, и держит один курс обхода',
    trapped.stuckT > 0.2 || trapped.detourT > 0 || trapped.idleStandT > 0);

  // Большие деревья
  let bigTrees = 0, maxTrunk = 0, bigSpruce = 0, leafy = 0;
  for (const treeSeed of [90210, 4242, 20260925]) {
    const wt = new World(treeSeed);
    for (let cx = 0; cx < 6; cx++) {
      for (let cz = 0; cz < 6; cz++) {
        const c = wt.getChunk(cx, cz);
        for (let x = 0; x < CONFIG.CHUNK_SIZE; x++) {
          for (let z = 0; z < CONFIG.CHUNK_SIZE; z++) {
            let run = 0, best = 0, kind = 0, leaves = 0;
            for (let y = 0; y < CONFIG.WORLD_HEIGHT; y++) {
              const b = c.get(x, y, z);
              if (b === BLOCK.LOG || b === BLOCK.SPRUCE_LOG) { run++; if (run > best) { best = run; kind = b; } } else run = 0;
              if (b === BLOCK.LEAVES || b === BLOCK.SPRUCE_LEAVES) leaves++;
            }
            leafy += leaves;
            if (best >= 9) { bigTrees++; if (kind === BLOCK.SPRUCE_LOG) bigSpruce++; }
            maxTrunk = Math.max(maxTrunk, best);
          }
        }
      }
    }
  }
  check('в мире появляются большие деревья (ствол 9+ блоков)', bigTrees > 5 && maxTrunk >= 9,
    'больших ' + bigTrees + ', макс. ствол ' + maxTrunk);
  check('большие деревья бывают и хвойные', bigSpruce > 0, 'елей ' + bigSpruce);
  check('ствол большого дерева не выше 16 блоков', maxTrunk <= 16 && maxTrunk >= 9);
  check('у больших деревьев есть крона', leafy > 2000, 'листвы ' + leafy);

  // Музыка: папка music/ и плейлист
  const { Music, MUSIC_FILES, MUSIC_DIR } = await import('./src/music.js');
  check('список музыкальных файлов не пуст и лежит в music/', MUSIC_DIR === 'music/' && MUSIC_FILES.length >= 4);
  const m = new Music({ probe: async (p) => p.endsWith('music1.mp3') || p.endsWith('theme.ogg'), create: () => ({}) });
  const list = await m.discover();
  check('музыка: найденные треки складываются в плейлист', list.length === 2 && m.available);
  check('музыка: повторный поиск не дублирует плейлист', (await m.discover()).length === 2);
  const mEmpty = new Music({ probe: async () => false, create: () => ({}), assumeOnProbeFailure: false });
  await mEmpty.discover();
  check('музыка: без файлов просто тихо (не падает)', !mEmpty.available);
  const mBlind = new Music({ probe: async () => { throw new Error('HEAD недоступен'); }, create: () => ({}) });
  await mBlind.discover();
  check('музыка: если проверка файлов не работает, плейлист всё равно собирается',
    mBlind.playlist.length === MUSIC_FILES.length && mBlind.available);

  // Тексты интерфейса
  const both = ['ru', 'en'];
  const newKeys = ['anvil_title', 'anvil_craft_title', 'anvil_hint', 'anvil_recipes', 'need_anvil',
    'need_anvil_short', 'anvil_open', 'sneak_hint', 'music', 'music_hint', 'dropped',
    'hint_pistol', 'no_bullets', 'bullet_pickup'];
  check('новые строки интерфейса есть в обоих языках',
    newKeys.every((k) => both.every((l) => typeof STRINGS[l][k] === 'string' && STRINGS[l][k].length > 0)),
    newKeys.filter((k) => !both.every((l) => STRINGS[l][k])).join(','));
  check('в подсказке «как играть» рассказано про наковальню и перетаскивание',
    both.every((l) => STRINGS[l].howto_text.includes('наковальн') || STRINGS[l].howto_text.toLowerCase().includes('anvil')));
  check('наковальня, забор и берёзовые доски названы в обоих языках',
    [BLOCK.ANVIL, BLOCK.FENCE, BLOCK.BIRCH_PLANKS, BLOCK.PLANK_SLAB]
      .every((id) => both.every((l) => BLOCK_NAMES[l][id])));
}

// ---- Шейдеры: вода, свет факела, согласованность varying ----
{
  const lib = THREEReal.ShaderLib.basic;
  const water = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  const uniforms = { uTime: { value: 0 }, uAtlasCells: { value: new THREEReal.Vector2(ATLAS_COLS, ATLAS_ROWS) } };
  const held = { uHeldLightPos: { value: null }, uHeldLight: { value: 0 }, uHeldLightRadius: { value: 8.5 } };
  waterShaderHook(uniforms, held)(water);
  check('вода: вершинный и фрагментный шейдеры согласованы (иначе вода не рисуется вовсе)',
    varyingMismatches(water.vertexShader, water.fragmentShader).length === 0,
    varyingMismatches(water.vertexShader, water.fragmentShader).join(','));
  check('вода: анимация тайла берёт размер атласа из униформы, а не из хардкода',
    water.fragmentShader.includes('uniform vec2 uAtlasCells;')
    && water.fragmentShader.includes('vMapUv * uAtlasCells') && !/[^.\w]8\.0/.test(water.fragmentShader));
  check('вода: свет факела в руке подключён тем же хуком (один onBeforeCompile, а не два)',
    water.fragmentShader.includes('torchL = max(torchL')
    && water.vertexShader.includes('vHeldWorldPos = (modelMatrix')
    && water.uniforms.uTime && water.uniforms.uAtlasCells);
  check('вода: получила и униформы света факела в руке (uHeldLight)',
    water.uniforms.uHeldLight === held.uHeldLight && water.uniforms.uHeldLightRadius === held.uHeldLightRadius
    && water.uniforms.uHeldLightPos === held.uHeldLightPos);
  // Детектор действительно ловит старый баг: без правки света varying не объявлен
  const naive = { vertexShader: lib.vertexShader, fragmentShader: waterFragment(lib.fragmentShader) };
  check('детектор ловит потерянный vHeldWorldPos (регрессия воды)',
    varyingMismatches(naive.vertexShader, naive.fragmentShader).length > 0,
    varyingMismatches(naive.vertexShader, naive.fragmentShader).join(','));
  check('вода: vHeldWorldPos объявлен и в вершинном, и во фрагментном шейдере',
    vertexDeclares(water.vertexShader, 'vHeldWorldPos') && fragmentDeclares(water.fragmentShader, 'vHeldWorldPos')
    && usesVarying(water.fragmentShader, 'vHeldWorldPos'));
  const terrain = { vertexShader: heldLightVertex(lib.vertexShader), fragmentShader: heldLightFragment(lib.fragmentShader) };
  check('земля: свет факела согласован с вершинным шейдером',
    varyingMismatches(terrain.vertexShader, terrain.fragmentShader).length === 0);
  check('детектор не ругается на нетронутые шейдеры three.js',
    varyingMismatches(lib.vertexShader, lib.fragmentShader).length === 0);
  check('в атласе 8 колонок и 9 рядов — вода не уезжает в пустой тайл',
    ATLAS_COLS === 8 && ATLAS_ROWS === 9);
}

// ---- Трава темнее ----
{
  const avg = (idx) => {
    const d = tilePixels(idx);
    let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
    return n ? s / n : 0;
  };
  const top = avg(TILE_ID.GRASS_TOP), side = avg(TILE_ID.GRASS_SIDE);
  check('трава сверху заметно темнее прежней (было ~96)', top < 85 && top > 50, 'средняя яркость ' + top.toFixed(1));
  check('трава сбоку тоже притемнена вместе с верхом', side < 92 && side > 50, 'средняя яркость ' + side.toFixed(1));
  check('трава осталась зелёной, а не серой', (() => {
    const d = tilePixels(TILE_ID.GRASS_TOP);
    let g = 0, r = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return g / n > r / n * 1.5 && g / n > b / n * 2;
  })());
}

// ---- Тень от деревьев ----
{
  const S = 9, H = 12, blocks = new Map();
  const k = (x, y, z) => `${x},${y},${z}`;
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) blocks.set(k(x, 1, z), BLOCK.GRASS);
  blocks.set(k(4, 2, 4), BLOCK.LOG); blocks.set(k(4, 3, 4), BLOCK.LOG); blocks.set(k(4, 4, 4), BLOCK.LOG);
  for (let y = 5; y <= 6; y++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dz * dz <= 5) blocks.set(k(4 + dx, y, 4 + dz), BLOCK.LEAVES);
      }
    }
  }
  const treeWorld = { chunkSize: S, worldHeight: H, getBlock: (x, y, z) => blocks.get(k(x, y, z)) || BLOCK.AIR };
  const mesh = meshChunk(THREE, treeWorld, 0, 0).opaque;
  const topShade = (x, z) => {
    const vals = [];
    for (let v = 0; v < mesh.pos.length / 3; v++) {
      if (mesh.pos[v * 3 + 1] !== 2) continue;
      if (Math.floor(mesh.pos[v * 3]) !== x || Math.floor(mesh.pos[v * 3 + 2]) !== z) continue;
      vals.push(mesh.col[v * 3]);
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const under = topShade(4, 4), away = topShade(0, 0), edge = topShade(8, 8);
  check('под кроной земля темнее, чем на открытом месте', under < away * 0.8 && under < edge * 0.8,
    `под кроной ${under.toFixed(3)}, рядом ${away.toFixed(3)}/${edge.toFixed(3)}`);
  check('тень под деревом небольшая, а не чёрное пятно', under > 0.4, under.toFixed(3));
  check('вне кроны земля не затенена', away > 0.75 && edge > 0.75, `${away.toFixed(3)}/${edge.toFixed(3)}`);
  // Тень не должна «протекать» на открытую воду/лёд в стороне
  const openShade = buildSkylight(treeWorld, 0, 0, S, H).shadeAt(0, 5, 0);
  check('открытая колонка остаётся без тени', openShade === 1);
  const underShade = buildSkylight(treeWorld, 0, 0, S, H).shadeAt(4, 5, 4);
  check('под листвой небесный свет притемнён', underShade < 0.75 && underShade > 0.3, underShade.toFixed(3));
}

// ---- Ночь: темно, но не «ничего не видно» ----
{
  const skyTest = new Sky(THREEReal, new THREEReal.Scene());
  let minL = 1, maxL = 0;
  for (let i = 0; i < 9600; i++) {          // полный цикл суток шагами по 1/20 с
    skyTest.update(1 / 20, { x: 0, y: 20, z: 0 });
    minL = Math.min(minL, skyTest.lightLevel);
    maxL = Math.max(maxL, skyTest.lightLevel);
  }
  check('ночь тёмная, но не чёрная: минимальная яркость 0.15..0.3', minL >= 0.15 && minL <= 0.3, minL.toFixed(3));
  check('днём мир по-прежнему полностью освещён', maxL > 0.99, maxL.toFixed(3));
  const sky2 = new Sky(THREEReal, new THREEReal.Scene());
  let darkest = 255;
  for (let i = 0; i < 9600; i++) {
    sky2.update(1 / 20, { x: 0, y: 20, z: 0 });
    // Цвет хранится в линейном пространстве, сравниваем в sRGB, как на экране
    const srgb = Math.round(Math.pow(Math.max(0, sky2.scene.background.r), 1 / 2.2) * 255);
    darkest = Math.min(darkest, srgb);
  }
  check('фон неба ночью не проваливается в абсолютно чёрный', darkest > 8 && darkest < 40, 'тёмный тон ' + darkest);
}

// ---- Пещерный туман ----
{
  check('на поверхности мглы нет', caveFogTarget(30, 31, false) === 0 && caveFogTarget(30, 31, true) === 0);
  check('в закрытой пещере мгла сгущается полностью', caveFogTarget(30, 10, false) === 1);
  check('в открытом колодце или яме тьма ослаблена', Math.abs(caveFogTarget(30, 10, true) - CAVE_OPEN_CAP) < 1e-9
    && CAVE_OPEN_CAP < 0.5);
  let fast = 0;
  for (let i = 0; i < 3; i++) fast = stepCaveFog(fast, 1, 1 / 60);
  check('мгла не накрывает экран за пару кадров', fast < 0.25, fast.toFixed(3));
  let slow = 0;
  for (let i = 0; i < 90; i++) slow = stepCaveFog(slow, 1, 1 / 60);
  check('за полторы секунды под землёй мгла сгущается', slow > 0.7, slow.toFixed(3));
  let out = 1;
  for (let i = 0; i < 60; i++) out = stepCaveFog(out, 0, 1 / 60);
  check('на выходе из пещеры светает за секунду', out < 0.25, out.toFixed(3));
  check('в пещере видно дальше, чем раньше (дальняя граница мглы не меньше 30)',
    CAVE_FOG_FAR >= 30 && CAVE_FOG_FAR > CAVE_FOG_NEAR && CAVE_FOG_COLOR === 0x0a0e16);
}

// ---- Генерация: большие горы, большие пещеры, валуны и скалы ----
{
  const w = new World(4242);
  let maxH = 0, rocky = 0, n = 0;
  for (let x = -450; x < 450; x += 10) {
    for (let z = -450; z < 450; z += 10) {
      const h = w.heightAt(x, z);
      if (h > maxH) maxH = h;
      if (h >= 41) rocky++;
      n++;
    }
  }
  check('горы стали выше прежнего максимума (было ~53)', maxH >= 57, 'максимум ' + maxH);
  check('горы и скалы занимают заметную часть мира', rocky / n > 0.05, (rocky / n * 100).toFixed(1) + '% колонок');
  const S = CONFIG.CHUNK_SIZE;
  let air = 0, halls = 0, spires = 0, boulders = 0, chunks = 0;
  // Площадка пошире: скалы-пальцы встречаются не в каждом углу массива
  for (let cx = -6; cx <= 6; cx++) {
    for (let cz = -6; cz <= 6; cz++) {
      const c = w.getChunk(cx, cz);
      chunks++;
      for (let x = 0; x < S; x++) {
        for (let z = 0; z < S; z++) {
          const h = w.heightAt(cx * S + x, cz * S + z);
          let run = 0, mx = 0;
          for (let y = 4; y < Math.min(h - 2, 47); y++) {
            if (c.get(x, y, z) === BLOCK.AIR) { air++; run++; if (run > mx) mx = run; } else run = 0;
          }
          if (mx >= 7) halls++;
          // Глыбы над поверхностью: считаем каменные блоки выше рельефа
          // (деревья не в счёт — у них своя проверка ниже)
          let rise = 0;
          for (let y = h + 1; y < Math.min(h + 14, w.worldHeight); y++) {
            const id = c.get(x, y, z);
            if (id !== BLOCK.STONE && id !== BLOCK.COBBLE && id !== BLOCK.MOSSY
              && id !== BLOCK.SLATE && id !== BLOCK.GRAVEL && id !== BLOCK.SNOW) break;
            rise++;
          }
          if (rise >= 1) boulders++;
          if (rise >= 4) spires++;
        }
      }
    }
  }
  check('пещер стало больше (воздух под землёй вырос)', air / chunks > 600, (air / chunks).toFixed(0) + ' клеток/чанк');
  check('в пещерах появились высокие залы', halls > 20, 'столбцов-залов ' + halls);
  check('на поверхности есть валуны', boulders > 40, 'колонок с глыбами ' + boulders);
  check('встречаются высокие скалы-пальцы', spires > 3, 'скал ' + spires + ' на ' + chunks + ' чанков');
}

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);