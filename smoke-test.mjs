// Смоук-тест логики мира и мешера без браузера (node smoke-test.mjs)
import { World } from './src/world.js';
import { meshChunk } from './src/mesher.js';
import { raycastVoxel } from './src/raycast.js';
import { BLOCK, blockBounds, blockDrop, isSolid, isOpaque, isDecor, isSlab } from './src/blocks.js';
import { Inventory, ITEM, RECIPES, blockKey, starterInventory } from './src/inventory.js';
import { Player } from './src/physics.js';
import { ItemDrops } from './src/items.js';
import { MobManager, isHiddenSpawn } from './src/mobs.js';
import { Arrows, createBowModel } from './src/bow.js';
import { Sky } from './src/sky.js';
import { STRINGS } from './src/i18n.js';
import * as Three from 'three';

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
function check(name, cond) {
  if (cond) console.log('OK  ', name);
  else { console.log('FAIL', name); failed++; }
}

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
    if (h < 3 || h > 58) return false;
  }
  return true;
})());

// Блоки: get/set и правки
const h = world.heightAt(0, 0);
const before = world.getBlock(0, h, 0);
check('setBlock works', world.setBlock(0, h + 2, 0, 10));
check('getBlock after set', world.getBlock(0, h + 2, 0) === 10);
check('edit recorded', world.edits.has(`0,${h + 2},0`));

// Пересоздание чанка воспроизводит правки
world.chunks.delete('0,0');
const c0b = world.getChunk(0, 0);
check('edit survives regen', c0b.get(0, h + 2, 0) === 10);

// Спавн
const spawn = world.findSpawn();
check('spawn above water', spawn.y > 22);

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
check('shades in range', opaque.col.every((v) => v >= 0.2 && v <= 1.001));

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

// Обход треугольников: нормали верхних граней должны смотреть вверх
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
  return up > 100 && up > down * 2;
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

// ---- Декоративная трава ----
const wd = new World(987654);
let decorCount = 0;
for (let cz = -2; cz <= 2; cz++) {
  for (let cx = -2; cx <= 2; cx++) {
    const c = wd.getChunk(cx, cz);
    for (const v of c.blocks) if (v >= 15 && v <= 19) decorCount++;
  }
}
check('decor (grass/flowers) generated', decorCount > 5);

// Крестовый меш: +8 вершин и +24 индекса на один декор-блок
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

// Разметка: кнопка «К спавну» и слой молний
const html = await (await import('node:fs/promises')).readFile(new URL('./index.html', import.meta.url), 'utf8');
check('btn-home + lightning in markup', html.includes('id="btn-home"') && html.includes('id="lightning"'));

// ---- Новые блоки и добыча ----
check('old block IDs preserved, new blocks defined', BLOCK.CLOVER === 19 && BLOCK.PLANK_SLAB === 20 && BLOCK.COAL_ORE === 27);
check('slabs are solid but not opaque', isSlab(BLOCK.PLANK_SLAB) && isSolid(BLOCK.PLANK_SLAB) && !isOpaque(BLOCK.PLANK_SLAB));
check('slab / torch bounds are partial', blockBounds(BLOCK.PLANK_SLAB).maxY === 0.5 &&
  blockBounds(BLOCK.PLANK_SLAB_TOP).minY === 0.5 && blockBounds(BLOCK.TORCH).maxX < 1);
check('breaking ore returns an item, not an ore block', blockDrop(BLOCK.IRON_ORE) === ITEM.ORE &&
  blockDrop(BLOCK.COAL_ORE) === ITEM.COAL && blockDrop(BLOCK.STONE) === blockKey(BLOCK.COBBLE));
const oreWorld = new World(34567);
let ironCount = 0, coalCount = 0;
for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
  for (const block of oreWorld.getChunk(cx, cz).blocks) {
    if (block === BLOCK.IRON_ORE) ironCount++;
    if (block === BLOCK.COAL_ORE) coalCount++;
  }
}
check('both ores generated in the world', ironCount > 0 && coalCount > 0);
const ht = world2.heightAt(4, 4);
world2.setBlock(4, ht + 2, 4, BLOCK.TORCH);
check('placed torch is tracked and restored from edits', world2.torches.has(`4,${ht + 2},4`) && (() => {
  const restored = new World(world2.seed);
  restored.loadEdits(world2.serializeEdits());
  return restored.torches.has(`4,${ht + 2},4`);
})());
world2.setBlock(4, ht + 2, 4, BLOCK.AIR);
check('breaking a torch removes its light source', world2.torches.size === 0);

// Фиктивный небольшой мир: точная геометрия и хитбокс, без генерируемого рельефа.
const testBlocks = new Map();
const flat = {
  chunkSize: 2, worldHeight: 3,
  getBlock(x, y, z) { return testBlocks.get(`${x},${y},${z}`) || BLOCK.AIR; },
};
testBlocks.set('0,0,0', BLOCK.PLANK_SLAB);
const slabMesh = meshChunk(THREE, flat, 0, 0).opaque;
check('lower slab mesh ends at y = 0.5', Math.max(...slabMesh.pos.filter((_, i) => i % 3 === 1)) === 0.5);
let ray = raycastVoxel(flat, 0.5, 1.5, 0.5, 0, -1, 0, 3);
check('raycast hits the top of a lower slab', ray?.id === BLOCK.PLANK_SLAB && ray.ny === 1 && ray.py === 0.5);
testBlocks.set('1,0,0', BLOCK.STONE);
ray = raycastVoxel(flat, -0.5, 0.75, 0.5, 1, 0, 0, 3);
check('ray passes above lower slab to block behind it', ray?.x === 1 && ray.id === BLOCK.STONE);
const slabBeside = meshChunk(THREE, flat, 0, 0).opaque;
check('face of full cube next to slab is clipped, not omitted', slabBeside.pos.some((v, i) =>
  i % 3 === 1 && v === 0.5 && slabBeside.pos[i - 1] === 1));
testBlocks.clear();
testBlocks.set('0,0,0', BLOCK.TORCH);
const torchMesh = meshChunk(THREE, flat, 0, 0);
check('torch has its own full-bright mesh', torchMesh.torch.idx.length === 24 && torchMesh.opaque.isEmpty());
check('torch can be aimed at without blocking whole cell',
  raycastVoxel(flat, 0.5, 1, 0.5, 0, -1, 0, 2)?.id === BLOCK.TORCH &&
  raycastVoxel(flat, 0.1, 1, 0.1, 0, -1, 0, 2) === null);

const slabPlayer = new Player(flat);
testBlocks.clear(); testBlocks.set('0,0,0', BLOCK.COBBLE_SLAB);
slabPlayer.pos = { x: 0.5, y: 1.8, z: 0.5 };
for (let i = 0; i < 45; i++) slabPlayer.update({ forward: 0, right: 0, sprint: false, jump: false, sneak: false }, 0.05);
check('player lands on half-height slab', slabPlayer.onGround && Math.abs(slabPlayer.pos.y - 0.5) < 0.01);
check('creative is invulnerable and flying is mode-limited', (() => {
  const p = new Player(flat);
  const blocked = !p.toggleFly() && p.hurt(2);
  p.mode = 'creative';
  return blocked && !p.hurt(2) && p.toggleFly();
})());
check('XP levels persist in player save', (() => {
  const p = new Player(flat); p.addXP(7);
  const q = new Player(flat); q.deserialize(p.serialize());
  return p.level === 1 && q.level === 1 && q.xp === p.xp;
})());

// Крафт, топливо и подбор предметов.
const bag = starterInventory();
check('starter survival inventory includes food, bow and furnace', bag.get(ITEM.BREAD) > 0 &&
  bag.get(ITEM.BOW) === 1 && bag.get(blockKey(BLOCK.FURNACE)) > 0);
const recipe = RECIPES.find((r) => r.id === 'plank_slab');
const planksBefore = bag.get(blockKey(BLOCK.PLANKS));
check('crafting slabs consumes planks and grants slabs', bag.craft(recipe) &&
  bag.get(blockKey(BLOCK.PLANKS)) === planksBefore - 2 && bag.get(blockKey(BLOCK.PLANK_SLAB)) === 8);
const smelting = new Inventory({ ore: 2, [blockKey(BLOCK.PLANKS)]: 1, coal: 1 });
const smelt = RECIPES.find((r) => r.id === 'smelt_ore');
check('furnace recipe consumes ore and one fuel at a time', smelting.craft(smelt) &&
  smelting.get(ITEM.ORE) === 1 && smelting.get(ITEM.COAL) === 0 && smelting.get(ITEM.INGOT) === 1 &&
  smelting.craft(smelt) && smelting.get(blockKey(BLOCK.PLANKS)) === 0 && !smelting.craft(smelt));
check('inventory survives save/load', new Inventory(bag.serialize()).get(blockKey(BLOCK.PLANK_SLAB)) === 8);
const scene = new Three.Scene();
const drops = new ItemDrops(scene);
let picked = null;
drops.onPickup = (kind, amount) => { picked = [kind, amount]; };
drops.spawn(0.5, 1, 0.5, ITEM.ORE, 2);
drops.update(0.016, flat, { x: 0.5, y: 0, z: 0.5 });
check('physical ore drop is collected once with its amount', picked?.[0] === ITEM.ORE && picked?.[1] === 2 && drops.items.length === 0);
drops.spawn(3, 1, 0, 'xp', 3);
const savedDrops = drops.serialize();
drops.load(savedDrops);
check('uncollected drops survive save/load', drops.items.length === 1 && drops.items[0].amount === 3);

// Мобы и боевой лук.
check('spawn behind player, outside sight and at a safe distance',
  isHiddenSpawn({ x: 0, z: 0 }, 0, 0, 25) &&
  !isHiddenSpawn({ x: 0, z: 0 }, 0, 0, -25) &&
  !isHiddenSpawn({ x: 0, z: 0 }, 0, 0, 5));
const manager = new MobManager(scene, world2);
manager.setNight(true);
const spider = manager.spawnSpiderAt(0.5, h + 1, 0.5);
check('spider is black and has eight articulated legs', spider.v.spider && spider.v.legs.length === 8 &&
  spider.v.group.children[0].geometry.attributes.color.array[0] < 0.2);
const gloom = manager.spawnGloomAt(3.5, h + 1, 0.5);
check('smaller gloom has a detailed scary face', gloom.v.group.scale.x < 0.8 && gloom.v.group.children.length > 10);
let deaths = 0;
manager.onDeath = () => deaths++;
spider.hurt(3);
manager.update(0.016, { x: 0, y: h + 1, z: 0 }, 0, false);
check('killed spider triggers death loot exactly once', deaths === 1 && !manager.mobs.includes(spider));
manager.setNight(false);
manager.update(2, { x: 0, y: h + 1, z: 0 }, 0, false);
check('gloom burned by daylight drops no kill loot', deaths === 1 && !manager.mobs.includes(gloom));
check('bow model has grip, limbs, string, arrow and details', createBowModel().group.children.length > 20);
const shots = new Arrows(scene);
const dummy = { pos: { x: 0, y: 0, z: -1 }, dead: false, type: 'spider', hurt(n) { this.damage = n; }, knockback() {} };
check('bow shoots a real projectile that can hit a mob', shots.fire({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }) && (() => {
  shots.update(0.05, { getBlock: () => BLOCK.AIR }, [dummy]);
  return dummy.damage === 2 && shots.projectiles.length === 0;
})());
shots.clear(); manager.clear(); drops.clear();
check('mode selectors, furnace and XP bar exist in UI',
  ['mode-menu', 'mode-pause', 'inventory-screen', 'btn-eat', 'xp-fill'].every((id) => html.includes(`id="${id}"`)));
const skyClock = new Sky(Three, new Three.Scene());
skyClock.setTime(0.25); skyClock.update(0, { x: 0, y: 20, z: 0 });
const middayLight = skyClock.lightLevel;
skyClock.setTime(0.75); skyClock.update(0, { x: 0, y: 20, z: 0 });
check('day/night clock: noon is bright, midnight is dark', middayLight > 0.9 && skyClock.lightLevel < 0.3);
check('torch lighting hook targets existing Three.js shader chunks',
  Three.ShaderLib.basic.vertexShader.includes('#include <begin_vertex>') &&
  Three.ShaderLib.basic.fragmentShader.includes('#include <color_fragment>'));
check('new menus, food and touch controls translated in both languages',
  ['creative', 'survival', 'furnace_title', 'reward_creative', 'touch_inventory', 'bread_eaten']
    .every((key) => STRINGS.ru[key] && STRINGS.en[key]));

console.log(failed === 0 ? '\nВсе проверки пройдены' : `\nПровалено проверок: ${failed}`);
process.exit(failed ? 1 : 0);