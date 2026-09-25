// Мобы: зайчик, барашек и слизень из коробок, с ходьбой, прыжками и настроениями
import * as THREE from 'three';
import { isSolid, isLiquid, BLOCK } from './blocks.js';

// Затенение граней как у блоков мира
function partGeometry(w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.getAttribute('normal');
  const count = n.count;
  const cols = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const ny = n.getY(i);
    const nz = n.getZ(i);
    let shade = 0.8;
    if (ny > 0.5) shade = 1.0;
    else if (ny < -0.5) shade = 0.55;
    else if (Math.abs(nz) > 0.5) shade = 0.88;
    cols[i * 3] = color[0] * shade;
    cols[i * 3 + 1] = color[1] * shade;
    cols[i * 3 + 2] = color[2] * shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// Деталь с пивотом у верхнего края (для качающихся ног/ушей)
function pendulumPart(mat, geoCache, key, w, h, d, color) {
  if (!geoCache.has(key)) {
    const g = partGeometry(w, h, d, color);
    g.translate(0, -h / 2, 0); // пивот сверху
    geoCache.set(key, g);
  }
  return new THREE.Mesh(geoCache.get(key), mat);
}

function fixedPart(mat, geoCache, key, w, h, d, color) {
  if (!geoCache.has(key)) geoCache.set(key, partGeometry(w, h, d, color));
  return new THREE.Mesh(geoCache.get(key), mat);
}

// Материал «полностью красного» моба на время вспышки урона
const HURT_MAT = new THREE.MeshBasicMaterial({ color: 0xff3a2e });

// ---------------------------------------------------------------- Лица: глаза, зрачки, рты, зубы
const EYE_WHITE = [0.98, 0.98, 0.99];
const EYE_PUPIL = [0.06, 0.05, 0.08];
const MOUTH_DARK = [0.14, 0.08, 0.1];
const TOOTH = [0.96, 0.96, 0.9];

/** Пара глаз с белками и зрачками */
function addEyes(g, mat, geoCache, key, { y, z, dx, size = 0.09, sclera = EYE_WHITE, pupil = EYE_PUPIL, pupilScale = 0.5, glow = null }) {
  const eyes = [];
  for (const s of [-1, 1]) {
    const white = fixedPart(mat, geoCache, `${key}-eye`, size, size, size * 0.45, sclera);
    white.position.set(s * dx, y, z);
    g.add(white);
    eyes.push(white);
    if (pupil) {
      const p = fixedPart(mat, geoCache, `${key}-pup`, size * pupilScale, size * pupilScale, size * 0.5, pupil);
      p.position.set(s * dx, y - size * 0.06, z + size * 0.26);
      g.add(p);
      eyes.push(p);
    }
    if (glow) {
      const gl = fixedPart(glow.mat, geoCache, `${key}-glow`, size * 0.9, size * 0.9, size * 0.3, glow.color);
      gl.position.set(s * dx, y, z + size * 0.3);
      g.add(gl);
      eyes.push(gl);
    }
  }
  return eyes;
}

/** Рот: тёмная полоса (или оскал) + зубы */
function addMouth(g, mat, geoCache, key, { y, z, w = 0.16, h = 0.05, color = MOUTH_DARK, teeth = 0, tooth = TOOTH, grin = false }) {
  const mouth = fixedPart(mat, geoCache, `${key}-mouth`, w, h, 0.05, color);
  mouth.position.set(0, y, z);
  g.add(mouth);
  const parts = [mouth];
  if (teeth > 0) {
    const tw = w / (teeth * 1.7);
    for (let i = 0; i < teeth; i++) {
      const x = (i - (teeth - 1) / 2) * (w / Math.max(1, teeth - 0.4));
      const up = fixedPart(mat, geoCache, `${key}-tooth`, tw, grin ? 0.06 : 0.04, 0.04, tooth);
      up.position.set(x, y + h * 0.6, z + 0.01);
      g.add(up);
      parts.push(up);
      if (grin) {
        const down = fixedPart(mat, geoCache, `${key}-tooth`, tw, 0.05, 0.04, tooth);
        down.position.set(x, y - h * 0.6, z + 0.01);
        g.add(down);
        parts.push(down);
      }
    }
  }
  return parts;
}

const BUNNY_COLORS = [
  [0.93, 0.91, 0.88], // белый
  [0.62, 0.52, 0.42], // коричневый
  [0.55, 0.55, 0.58], // серый
];
const SHEEP_WOOL = [
  [0.95, 0.95, 0.97],
  [0.55, 0.55, 0.58],
  [0.35, 0.33, 0.32],
];

function buildBunny(mat, geoCache, ci) {
  const c = BUNNY_COLORS[ci % BUNNY_COLORS.length];
  const dark = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `bn-body-${ci}`, 0.46, 0.38, 0.62, c);
  body.position.set(0, 0.42, 0);
  const head = fixedPart(mat, geoCache, `bn-head-${ci}`, 0.34, 0.32, 0.3, c);
  head.position.set(0, 0.66, 0.34);
  const tail = fixedPart(mat, geoCache, `bn-tail-${ci}`, 0.16, 0.16, 0.14, [0.98, 0.97, 0.96]);
  tail.position.set(0, 0.5, -0.36);
  const ears = [];
  for (const s of [-1, 1]) {
    const ear = pendulumPart(mat, geoCache, `bn-ear-${ci}`, 0.1, 0.42, 0.11, c);
    ear.position.set(s * 0.1, 0.98, 0.3);
    ear.rotation.x = -0.15;
    const inner = fixedPart(mat, geoCache, `bn-earin-${ci}`, 0.05, 0.26, 0.02, [0.95, 0.68, 0.72]);
    inner.position.set(0, -0.14, 0.06);
    ear.add(inner);
    ears.push(ear);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `bn-leg-${ci}`, 0.11, 0.26, 0.11, dark);
    leg.position.set(sx * 0.15, 0.28, sz * 0.22);
    legs.push(leg);
    g.add(leg);
  }
  // Морда: глаза с зрачками, нос и рот с двумя зубками
  const face = addEyes(g, mat, geoCache, `bn-${ci}`, { y: 0.71, z: 0.5, dx: 0.1, size: 0.1 });
  const nose = fixedPart(mat, geoCache, `bn-nose-${ci}`, 0.06, 0.05, 0.04, [0.95, 0.6, 0.66]);
  nose.position.set(0, 0.65, 0.51);
  g.add(nose);
  const mouth = addMouth(g, mat, geoCache, `bn-${ci}`, { y: 0.59, z: 0.51, w: 0.12, h: 0.045, teeth: 2, grin: false });
  g.add(body, head, tail);
  return { group: g, legs, head, ears, hop: true, face, mouth, scale: 1.3 };
}

function buildSheep(mat, geoCache, ci) {
  const wool = SHEEP_WOOL[ci % SHEEP_WOOL.length];
  const skin = [0.46, 0.4, 0.36];
  const dark = [wool[0] * 0.68, wool[1] * 0.68, wool[2] * 0.68];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `sh-body-${ci}`, 0.78, 0.56, 0.86, wool);
  body.position.set(0, 0.62, -0.06);
  const puff = fixedPart(mat, geoCache, `sh-puff-${ci}`, 0.66, 0.24, 0.72, [Math.min(1, wool[0] * 1.05), Math.min(1, wool[1] * 1.05), Math.min(1, wool[2] * 1.05)]);
  puff.position.set(0, 0.96, -0.08);
  const head = fixedPart(mat, geoCache, `sh-head-${ci}`, 0.38, 0.36, 0.34, skin);
  head.position.set(0, 0.78, 0.52);
  const snout = fixedPart(mat, geoCache, `sh-snout-${ci}`, 0.24, 0.18, 0.14, [0.36, 0.3, 0.27]);
  snout.position.set(0, 0.68, 0.72);
  // Рога — выглядят суровее
  const horns = [];
  for (const s of [-1, 1]) {
    const horn = fixedPart(mat, geoCache, `sh-horn-${ci}`, 0.12, 0.11, 0.22, [0.32, 0.29, 0.26]);
    horn.position.set(s * 0.25, 0.98, 0.46);
    horn.rotation.z = s * 0.35;
    g.add(horn);
    horns.push(horn);
    const ear = fixedPart(mat, geoCache, `sh-ear-${ci}`, 0.14, 0.1, 0.18, skin);
    ear.position.set(s * 0.26, 0.82, 0.5);
    g.add(ear);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pendulumPart(mat, geoCache, `sh-leg-${ci}`, 0.14, 0.34, 0.14, dark);
    leg.position.set(sx * 0.22, 0.34, sz * 0.26);
    legs.push(leg);
    g.add(leg);
  }
  // Морда: глаза с горизонтальными зрачками и жующий рот
  const face = addEyes(g, mat, geoCache, `sh-${ci}`, { y: 0.83, z: 0.7, dx: 0.14, size: 0.11, pupilScale: 0.42 });
  const mouth = addMouth(g, mat, geoCache, `sh-${ci}`, { y: 0.61, z: 0.8, w: 0.2, h: 0.05, teeth: 4, grin: false });
  g.add(body, puff, head, snout);
  return { group: g, legs, head, ears: horns, hop: false, face, mouth, scale: 1.35 };
}

function buildSlime(mat, geoCache) {
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, 'sl-body', 0.62, 0.56, 0.62, [0.38, 0.78, 0.36]);
  body.position.set(0, 0.3, 0);
  const inner = fixedPart(mat, geoCache, 'sl-core', 0.3, 0.26, 0.3, [0.24, 0.6, 0.26]);
  inner.position.set(0, 0.24, 0);
  // Глаза с зрачками + широкий рот с зубами
  const face = addEyes(g, mat, geoCache, 'sl', { y: 0.42, z: 0.32, dx: 0.15, size: 0.11, pupilScale: 0.45 });
  const mouth = addMouth(g, mat, geoCache, 'sl', { y: 0.24, z: 0.35, w: 0.3, h: 0.08, teeth: 4, grin: false });
  // Капли по бокам
  for (const s of [-1, 1]) {
    const drip = fixedPart(mat, geoCache, 'sl-drip', 0.12, 0.12, 0.12, [0.32, 0.68, 0.32]);
    drip.position.set(s * 0.36, 0.16, 0.1);
    g.add(drip);
  }
  g.add(body, inner);
  return { group: g, legs: [], head: null, ears: [], hop: true, slime: body, face, mouth, scale: 1.45 };
}

const BIRD_COLORS = [
  [0.9, 0.9, 0.93],   // белая
  [0.55, 0.42, 0.32], // воробей
  [0.38, 0.48, 0.68], // синица
];

function wingPart(mat, geoCache, key, w, h, d, color, side) {
  if (!geoCache.has(key)) {
    const g = partGeometry(w, h, d, color);
    g.translate(side * w / 2, 0, 0); // пивот у корпуса
    geoCache.set(key, g);
  }
  return new THREE.Mesh(geoCache.get(key), mat);
}

function buildBird(mat, geoCache, ci) {
  const c = BIRD_COLORS[ci % BIRD_COLORS.length];
  const g = new THREE.Group();
  const body = fixedPart(mat, geoCache, `bd-body-${ci}`, 0.26, 0.22, 0.4, c);
  const head = fixedPart(mat, geoCache, `bd-head-${ci}`, 0.17, 0.16, 0.16, c);
  head.position.set(0, 0.12, 0.26);
  const beak = fixedPart(mat, geoCache, `bd-beak-${ci}`, 0.07, 0.05, 0.12, [0.95, 0.7, 0.25]);
  beak.position.set(0, 0.1, 0.4);
  const tail = fixedPart(mat, geoCache, `bd-tail-${ci}`, 0.11, 0.04, 0.2, c);
  tail.position.set(0, 0.02, -0.28);
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = wingPart(mat, geoCache, `bd-wing-${s}-${ci}`, 0.36, 0.04, 0.24, c, s);
    wing.position.set(s * 0.09, 0.06, 0.02);
    wings.push(wing);
    g.add(wing);
  }
  const face = addEyes(g, mat, geoCache, `bd-${ci}`, { y: 0.16, z: 0.36, dx: 0.07, size: 0.06, pupilScale: 0.55 });
  g.add(body, head, beak, tail);
  return { group: g, legs: [], head: null, ears: [], wings, hop: false, bird: true, face, scale: 1.25 };
}

// Хмарь — большой ночной охотник: балахон с капюшоном, светящиеся глаза,
// оскал с зубами, когтистые лапы и рваный хвост из теней
function buildGloom(mat, geoCache, eyeMat) {
  const g = new THREE.Group();
  const cloth = [0.105, 0.075, 0.155];     // тёмно-фиолетовая ткань — видно даже днём
  const clothDark = [0.055, 0.04, 0.09];
  const glow = { mat: eyeMat, color: [1, 1, 1] };

  // Тело-балахон (расширяется книзу) + горб сверху
  const body = fixedPart(mat, geoCache, 'gl-body', 0.66, 0.72, 0.5, cloth);
  body.position.set(0, 0.5, 0);
  const hem = fixedPart(mat, geoCache, 'gl-hem', 0.86, 0.2, 0.66, clothDark);
  hem.position.set(0, 0.14, 0);
  const hunch = fixedPart(mat, geoCache, 'gl-hunch', 0.54, 0.28, 0.44, clothDark);
  hunch.position.set(0, 1.02, -0.06);

  // Голова под капюшоном
  const head = fixedPart(mat, geoCache, 'gl-head', 0.5, 0.4, 0.44, cloth);
  head.position.set(0, 1.16, 0.02);
  const hood = fixedPart(mat, geoCache, 'gl-hood', 0.62, 0.2, 0.56, clothDark);
  hood.position.set(0, 1.34, -0.04);
  const hoodTip = fixedPart(mat, geoCache, 'gl-hoodtip', 0.18, 0.24, 0.18, clothDark);
  hoodTip.position.set(0, 1.44, -0.22);
  hoodTip.rotation.x = 0.5;

  // Светящиеся глаза (по два с каждой стороны — жутко), под ними оскал с зубами
  const eyes = [];
  for (const s of [-1, 1]) {
    const big = fixedPart(eyeMat, geoCache, 'gl-eye-big', 0.19, 0.14, 0.06, [1, 1, 1]);
    big.position.set(s * 0.15, 1.22, 0.28);
    const small = fixedPart(eyeMat, geoCache, 'gl-eye-small', 0.11, 0.08, 0.05, [1, 1, 1]);
    small.position.set(s * 0.16, 1.06, 0.28);
    const pupil = fixedPart(mat, geoCache, 'gl-pupil', 0.06, 0.09, 0.04, [0.02, 0.02, 0.03]);
    pupil.position.set(s * 0.15, 1.22, 0.315);
    g.add(big, small, pupil);
    eyes.push(big, small, pupil);
  }
  const mouth = addMouth(g, mat, geoCache, 'gl', { y: 0.9, z: 0.29, w: 0.42, h: 0.1, teeth: 5, grin: true });

  // Когтистые руки (качаются при полёте)
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = pendulumPart(mat, geoCache, 'gl-arm', 0.14, 0.5, 0.14, cloth);
    arm.position.set(s * 0.36, 0.86, 0.04);
    arm.rotation.z = s * 0.25;
    for (let i = -1; i <= 1; i++) {
      const claw = fixedPart(mat, geoCache, 'gl-claw', 0.035, 0.16, 0.035, [0.62, 0.6, 0.68]);
      claw.position.set(i * 0.06, -0.56, 0.03);
      claw.rotation.z = i * 0.25;
      arm.add(claw);
    }
    arms.push(arm);
    g.add(arm);
  }

  // Шипы на спине
  const spikes = [];
  for (let i = 0; i < 4; i++) {
    const sp = fixedPart(mat, geoCache, 'gl-spike', 0.09, 0.22 - i * 0.03, 0.09, clothDark);
    sp.position.set(0, 1.02 + i * 0.02, -0.3 - i * 0.02);
    sp.rotation.x = -0.4 - i * 0.1;
    spikes.push(sp);
    g.add(sp);
  }

  // Рваный хвост-дымка из трёх сегментов
  const wisps = [];
  for (let i = 0; i < 3; i++) {
    const seg = fixedPart(mat, geoCache, `gl-wisp${i}`, 0.3 - i * 0.07, 0.34, 0.3 - i * 0.07, clothDark);
    seg.position.set(Math.sin(i) * 0.08, -0.02 - i * 0.28, 0);
    wisps.push(seg);
    g.add(seg);
  }

  g.add(body, hem, hunch, head, hood, hoodTip);
  return {
    group: g, legs: [], head: null, ears: [], hop: false, gloom: true,
    face: eyes, mouth, arms, spikes, wisps, scale: 1.7,
  };
}

export class Mob {
  constructor(world, visuals, type, x, y, z) {
    this.world = world;
    this.v = visuals;
    this.type = type;            // 'bunny' | 'sheep' | 'slime' | 'bird'
    this.pos = { x, y, z };
    this.home = { x, y, z };
    this.heading = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.stateT = 1 + Math.random() * 2;
    this.thinkT = Math.random();
    this.animT = Math.random() * 10;
    this.soundT = 1 + Math.random() * 3;
    this.onSound = null;         // (kind, dist) => void
    this.onAttack = null;        // (mob, playerPos) => void
    this.speed = type === 'bunny' ? 2.2 : type === 'slime' ? 1.6 : type === 'gloom' ? 2.0 : 1.1;
    // Зайцы и овцы выдерживают 2–3 удара рукой
    this.hp = type === 'sheep' ? 3 : type === 'bunny' ? 2 : type === 'slime' ? 2 : type === 'gloom' ? 3 : 1;
    this.maxHp = this.hp;
    this.attackT = 0;
    this.flashT = 0;
    this.burnT = 0;
    this.fleeT = 0;
    this.kbX = 0; this.kbZ = 0; this.kbT = 0;
    this.dead = false;
    this.baseScale = visuals.scale || 1;
    visuals.group.scale.setScalar(this.baseScale);
    visuals.group.position.set(x, y, z);
    this.yBase = y;
  }

  // Хмарь: подкрадывается к игроку, висит над землёй, бьёт с дистанции 1.6
  updateGloom(dt, playerPos) {
    const v = this.v;
    this.animT += dt;
    this.tickFlash(dt);
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    this.heading = Math.atan2(dx, dz);
    if (dist > 1.15 && dist < 24) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
    }
    const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    this.yBase = (g ?? this.pos.y) + 0.3;
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 4);

    const hover = Math.sin(this.animT * 2.6) * 0.09;
    v.group.position.set(this.pos.x, this.pos.y + hover, this.pos.z);
    v.group.rotation.y = this.heading;
    v.group.rotation.z = Math.sin(this.animT * 2) * 0.05;
    // Анимация получения удара: отдача назад, сплющивание и дрожь
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT) / 0.35;      // 1 -> 0
      const pulse = Math.sin((1 - k) * Math.PI);        // 0 -> 1 -> 0
      v.group.rotation.x = -0.55 * pulse;               // отклоняется назад
      v.group.rotation.z += Math.sin(this.animT * 60) * 0.12 * k;
      const sc = this.baseScale;
      v.group.scale.set(sc * (1 + 0.25 * pulse), sc * (1 - 0.22 * pulse), sc * (1 + 0.25 * pulse));
      v.group.position.y += 0.12 * pulse;
    } else {
      v.group.rotation.x = 0;
      v.group.scale.setScalar(this.baseScale);
    }
    // Плавный отброс после удара (не сквозь блоки)
    this.applyKnockback(dt);

    // Лапы тянутся к игроку, шипы и хвост шевелятся
    if (v.arms) {
      for (let i = 0; i < v.arms.length; i++) {
        const s = i === 0 ? -1 : 1;
        const reach = dist < 6 ? 0.7 : 0.25;
        v.arms[i].rotation.x = -reach * 0.6 + Math.sin(this.animT * 2.2 + i) * 0.18;
        v.arms[i].rotation.z = s * (0.25 + Math.sin(this.animT * 1.7 + i) * 0.08);
      }
    }
    if (v.wisps) {
      for (let i = 0; i < v.wisps.length; i++) {
        v.wisps[i].position.x = Math.sin(this.animT * 2 + i * 0.9) * (0.08 + i * 0.05);
        v.wisps[i].rotation.z = Math.sin(this.animT * 1.6 + i) * 0.25;
      }
    }

    // Атака с рычанием
    this.attackT -= dt;
    if (dist < 1.9 && this.attackT <= 0) {
      this.attackT = 1.1;
      if (this.onSound) this.onSound('growl', dist);
      if (this.onAttack) this.onAttack(this, playerPos);
    }

    // Шёпот и рык при приближении
    this.soundT -= dt;
    if (this.soundT <= 0) {
      const near = dist < 10;
      this.soundT = near ? 2.4 + Math.random() * 2.6 : 3.5 + Math.random() * 4;
      if (this.onSound && dist < 20) this.onSound(near && Math.random() < 0.45 ? 'growl' : 'gloom', dist);
    }
  }

  knockback(dx, dz, power = 3.2) {
    const l = Math.hypot(dx, dz) || 1;
    this.kbX = (dx / l) * power;
    this.kbZ = (dz / l) * power;
    this.kbT = 0.22;
  }

  /** Звук удара (писк/блеяние/чавканье) */
  squeak() {
    if (this.onSound) this.onSound('hurt', 0, this.type);
  }

  /** Радиус попадания по мобу (для удара игрока) */
  hitRadius() {
    const base = this.type === 'sheep' ? 0.8 : this.type === 'slime' ? 0.62
      : this.type === 'gloom' ? 0.62 : this.type === 'bunny' ? 0.58 : 0.4;
    return base * this.baseScale;
  }

  /** Высота центра модели — по ней целимся и бьём частицами */
  centerY() {
    const base = this.type === 'sheep' ? 0.6 : this.type === 'gloom' ? 0.95
      : this.type === 'bird' ? 0.1 : 0.4;
    return base * this.baseScale;
  }

  /** Можно ли бить этого моба (птиц — нельзя) */
  hittable() {
    return this.type !== 'bird';
  }

  /** Полностью красный моб на время вспышки */
  setHurtTint(on) {
    const walk = (o) => {
      if (o.isMesh) {
        if (on) {
          if (!o.userData._baseMat) o.userData._baseMat = o.material;
          o.material = HURT_MAT;
        } else if (o.userData._baseMat) {
          o.material = o.userData._baseMat;
          o.userData._baseMat = null;
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(this.v.group);
  }

  /** Тик вспышки урона: 0.3 с красный, затем обратно */
  tickFlash(dt) {
    if (this.flashT <= 0) return;
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.flashT === 0) this.setHurtTint(false);
  }

  /** Отброс после удара — с проверкой блоков, чтобы не пролететь сквозь стену */
  applyKnockback(dt) {
    if (this.kbT <= 0) return;
    const step = Math.min(this.kbT, dt);
    this.kbT -= dt;
    const nx = this.pos.x + this.kbX * step;
    const nz = this.pos.z + this.kbZ * step;
    if (!this.blockedAt(nx, this.pos.z)) this.pos.x = nx;
    else this.kbX = 0;
    if (!this.blockedAt(this.pos.x, nz)) this.pos.z = nz;
    else this.kbZ = 0;
    if (!this.v.gloom) {
      // наземные мобы не залетают в воздух — только скользят по земле
      const g = this.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
      if (g !== null && Math.abs(g - this.pos.y) <= 1.5) this.yBase = g;
    }
  }

  blockedAt(x, z) {
    for (const dy of [0.3, 1.0]) {
      if (isSolid(this.world.getBlock(Math.floor(x), Math.floor(this.pos.y + dy), Math.floor(z)))) return true;
    }
    return false;
  }

  /** Убегает от точки (после удара) */
  fleeFrom(pos, time = 4.5) {
    const dx = this.pos.x - pos.x, dz = this.pos.z - pos.z;
    this.heading = Math.atan2(dx, dz);
    this.state = 'flee';
    this.fleeT = time;
    this.stateT = time;
  }

  hurt(n) {
    this.hp -= n;
    this.flashT = 0.3;
    this.setHurtTint(true);
    if (this.hp <= 0) {
      this.dead = true;
      this.setHurtTint(false);
      return true;
    }
    return false;
  }

  dispose(scene) {
    scene.remove(this.v.group);
    // Геометрия общая (кэш) — не удаляем
  }

  think(playerPos) {
    const dx = this.pos.x - playerPos.x;
    const dz = this.pos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    this.stateT -= 0.6;

    // После удара заяц и барашек убегают довольно долго
    if (this.fleeT > 0) {
      this.state = 'flee';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.type === 'bunny' && dist < 4.5) {
      this.state = 'flee';
      this.heading = Math.atan2(dx, dz);
      return;
    }
    if (this.state === 'flee' && dist > 7) this.state = 'idle';

    if (this.stateT <= 0) {
      const r = Math.random();
      if (this.type === 'sheep' && r < 0.35) {
        this.state = 'graze';
        this.stateT = 2 + Math.random() * 2.5;
      } else if (r < 0.55) {
        this.state = 'walk';
        this.heading += (Math.random() - 0.5) * 2.5;
        this.stateT = 1.5 + Math.random() * 2.5;
      } else {
        this.state = 'idle';
        this.stateT = 0.8 + Math.random() * 2;
      }
    }
  }

  // Высота поверхности под ногами; null — обрыв/вода (не идём)
  groundAt(x, z, fromY) {
    const y0 = Math.floor(fromY) + 1;
    for (let y = y0; y > y0 - 6; y--) {
      const b = this.world.getBlock(Math.floor(x), y, Math.floor(z));
      if (isSolid(b)) return y + 1;
    }
    return null;
  }

  update(dt, playerPos) {
    // Птицы летают отдельно — без привязки к земле
    if (this.type === 'bird') return this.updateBird(dt, playerPos);
    if (this.type === 'gloom') return this.updateGloom(dt, playerPos);

    this.thinkT -= dt;
    this.fleeT = Math.max(0, this.fleeT - dt);
    if (this.thinkT <= 0) {
      this.thinkT = 0.5 + Math.random() * 0.4;
      this.think(playerPos);
    }
    this.animT += dt;
    this.tickFlash(dt);
    this.applyKnockback(dt);

    const v = this.v;
    let moveSpeed = 0;
    if (this.state === 'walk') moveSpeed = this.speed;
    else if (this.state === 'flee') moveSpeed = this.speed * 1.7;

    if (moveSpeed > 0) {
      const nx = this.pos.x + Math.sin(this.heading) * moveSpeed * dt;
      const nz = this.pos.z + Math.cos(this.heading) * moveSpeed * dt;
      const g = this.groundAt(nx, nz, this.pos.y);
      // Не падаем с обрыва и не заходим в воду
      const targetWater = isLiquid(this.world.getBlock(Math.floor(nx), Math.floor((g ?? this.pos.y) - 1), Math.floor(nz)));
      if (g !== null && !targetWater && Math.abs(g - this.pos.y) <= 1.15) {
        this.pos.x = nx;
        this.pos.z = nz;
        this.yBase = g;
      } else {
        this.heading += Math.PI * (0.5 + Math.random() * 0.6); // разворот
      }
    }

    // Плавный подъём/спуск по рельефу
    this.pos.y += (this.yBase - this.pos.y) * Math.min(1, dt * 10);

    // Анимация
    const walking = moveSpeed > 0;
    const phase = this.animT * (walking ? 7 : 2);
    let yOff = 0;
    if (this.type === 'slime') {
      // Слизень: прыгает и сплющивается
      if (walking) {
        yOff = Math.abs(Math.sin(this.animT * 6)) * 0.4;
        const sq = 1 + Math.sin(this.animT * 12) * 0.15;
        v.slime.scale.set(2 - sq, sq, 2 - sq);
      } else {
        v.slime.scale.set(1 + Math.sin(this.animT * 2) * 0.04, 1 - Math.sin(this.animT * 2) * 0.04, 1 + Math.sin(this.animT * 2) * 0.04);
      }
    } else if (v.hop && walking) {
      // Зайчик: резкие прыжки
      yOff = Math.abs(Math.sin(this.animT * 7)) * 0.3;
    }

    v.group.position.set(this.pos.x, this.pos.y + yOff, this.pos.z);
    v.group.rotation.y = this.heading + Math.PI;

    // Отдача от удара: тряска и сплющивание
    if (this.flashT > 0) {
      const k = this.flashT / 0.3;
      const pulse = Math.sin((1 - k) * Math.PI);
      const sc = this.baseScale;
      v.group.rotation.x = -0.5 * pulse;
      v.group.rotation.z = Math.sin(this.animT * 60) * 0.14 * k;
      v.group.scale.set(sc * (1 + 0.2 * pulse), sc * (1 - 0.18 * pulse), sc * (1 + 0.2 * pulse));
      v.group.position.y += 0.1 * pulse;
    } else {
      v.group.rotation.x = 0;
      v.group.rotation.z = 0;
      v.group.scale.setScalar(this.baseScale);
    }

    // Ноги
    for (let i = 0; i < v.legs.length; i++) {
      const s = i % 2 === 0 ? 1 : -1;
      v.legs[i].rotation.x = walking ? Math.sin(phase) * 0.7 * s : Math.sin(this.animT * 1.5) * 0.04;
    }
    // Уши зайки покачиваются
    for (const ear of v.ears) {
      ear.rotation.x = -0.15 + Math.sin(this.animT * 5) * 0.12 + yOff * 0.3;
    }
    // Барашек щиплет траву
    if (v.head && this.type === 'sheep') {
      const target = this.state === 'graze' ? 0.85 : 0;
      v.head.rotation.x += (target - v.head.rotation.x) * Math.min(1, dt * 6);
      v.head.position.y = 0.62 - (this.state === 'graze' ? 0.14 : 0);
    }
    if (v.head && this.type === 'bunny') {
      v.head.rotation.x = Math.sin(this.animT * 3) * 0.08;
    }

    // Звуки: прыжок зайки, блеяние барашка
    const dist = Math.hypot(this.pos.x - playerPos.x, this.pos.z - playerPos.z);
    this.soundT -= dt;
    if (this.soundT <= 0 && this.onSound && dist < 14) {
      if (this.type === 'bunny' && walking && Math.random() < 0.35) {
        this.onSound('hop', dist);
        this.soundT = 0.7;
      } else if (this.type === 'sheep' && Math.random() < 0.12) {
        this.onSound('bleat', dist);
        this.soundT = 4;
      } else {
        this.soundT = 0.4;
      }
    }
  }

  updateBird(dt, playerPos) {
    this.animT += dt;
    const v = this.v;
    // Кружим вокруг точки спавна, плавно меняя курс
    this.heading += Math.sin(this.animT * 0.7 + this.pos.x) * dt * 0.9;
    // Возвращаемся, если залетели далеко от дома
    const hx = this.home.x - this.pos.x, hz = this.home.z - this.pos.z;
    if (hx * hx + hz * hz > 24 * 24) this.heading = Math.atan2(hx, hz);
    // Пугаемся игрока
    const dx = this.pos.x - playerPos.x, dz = this.pos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    let speed = 2.6;
    if (dist < 4) {
      this.heading = Math.atan2(dx, dz);
      speed = 5;
    }

    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    // Плавная волна высоты; держимся над землёй
    const targetY = this.home.y + Math.sin(this.animT * 0.9) * 1.6;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 2);

    v.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    v.group.rotation.y = this.heading + Math.PI;
    v.group.rotation.z = Math.sin(this.animT * 0.7) * 0.15; // крен в поворотах

    // Взмахи крыльев (в полёте чаще, в парении реже)
    const flap = Math.sin(this.animT * (dist < 4 ? 16 : 9)) * 0.85;
    if (v.wings) {
      v.wings[0].rotation.z = -flap;
      v.wings[1].rotation.z = flap;
    }

    this.soundT -= dt;
    if (this.soundT <= 0 && this.onSound && dist < 16 && Math.random() < 0.25) {
      this.onSound('chirp', dist);
    }
    if (this.soundT <= 0) this.soundT = 1.2;
  }
}

export class MobManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mobs = [];
    this.geoCache = new Map();
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.slimeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
    this.spawnT = 0;
    this.max = 10;
    this.onHop = null; // (dist) => void — звук
    this.onAttack = null; // (mob, playerPos) => void — атака Хмари
    this.onDeath = null;  // (mob) => void
    this.night = true;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x8ef6ff });
    this.gloomMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  }

  setLight(level) {
    const s = 0.32 + 0.68 * level;
    this.mat.color.setScalar(s);
    this.slimeMat.color.setScalar(s);
    this.gloomMat.color.setScalar(0.55 + 0.45 * level);
  }

  _randomType() {
    const r = Math.random();
    return r < 0.32 ? 'bunny' : r < 0.6 ? 'sheep' : r < 0.78 ? 'slime' : 'bird';
  }

  _buildVisuals(type) {
    const ci = (Math.random() * 3) | 0;
    if (type === 'bunny') return buildBunny(this.mat, this.geoCache, ci);
    if (type === 'sheep') return buildSheep(this.mat, this.geoCache, ci);
    if (type === 'gloom') return buildGloom(this.gloomMat, this.geoCache, this.eyeMat);
    if (type === 'bird') return buildBird(this.mat, this.geoCache, ci);
    return buildSlime(this.slimeMat, this.geoCache);
  }

  trySpawn(playerPos) {
    if (this.mobs.length >= this.max) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 16 + Math.random() * 18;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      const type = this._randomType();

      // Птицы — в небе над любой поверхностью
      if (type === 'bird') {
        if (h <= 2) continue;
        const visuals = this._buildVisuals(type);
        const mob = new Mob(this.world, visuals, type, x, Math.max(h + 7, this.world.seaLevel + 6) + Math.random() * 5, z);
        mob.onSound = this.onSound;
        this.scene.add(visuals.group);
        this.mobs.push(mob);
        return;
      }

      if (h <= this.world.seaLevel + 1) continue;
      // Проверяем настоящий блок сверху
      const top = this.world.getBlock(Math.floor(x), h, Math.floor(z));
      const above = this.world.getBlock(Math.floor(x), h + 1, Math.floor(z));
      const above2 = this.world.getBlock(Math.floor(x), h + 2, Math.floor(z));
      if ((top !== BLOCK.GRASS && top !== BLOCK.SNOW) || above !== BLOCK.AIR || above2 !== BLOCK.AIR) continue;
      const visuals = this._buildVisuals(type);
      const mob = new Mob(this.world, visuals, type, x + 0.5, h + 1, z + 0.5);
      mob.onSound = this.onSound;
      this.scene.add(visuals.group);
      this.mobs.push(mob);
      return;
    }
  }

  setNight(n) {
    this.night = n;
  }

  // Ночной спавн Хмари (и отдельный хук для тестов)
  trySpawnGloom(playerPos) {
    if (this.mobs.filter((m) => m.type === 'gloom').length >= 4) return null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 8 + Math.random() * 10;
      const x = playerPos.x + Math.sin(ang) * r;
      const z = playerPos.z + Math.cos(ang) * r;
      const h = this.world.heightAt(Math.floor(x), Math.floor(z));
      if (h <= this.world.seaLevel) continue;
      return this.spawnGloomAt(x + 0.5, h + 1, z + 0.5);
    }
    return null;
  }

  spawnGloomAt(x, y, z) {
    const visuals = buildGloom(this.gloomMat, this.geoCache, this.eyeMat);
    const mob = new Mob(this.world, visuals, 'gloom', x, y, z);
    mob.onSound = (k, d) => { if (this.onSound) this.onSound(k, d); };
    mob.onAttack = (m, pp) => { if (this.onAttack) this.onAttack(m, pp); };
    this.scene.add(visuals.group);
    this.mobs.push(mob);
    return mob;
  }

  update(dt, playerPos, active = true) {
    // Спавн/деспавн
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2.5;
      if (active) this.trySpawn(playerPos);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      if (m.dead) {
        this.mobs.splice(i, 1);
        m.dispose(this.scene);
        if (this.onDeath) this.onDeath(m);
        continue;
      }
      // Рассвет сжигает Хмарь
      if (m.type === 'gloom' && !this.night) {
        m.burnT += dt;
        if (m.burnT <= dt * 1.5 && this.onSound) this.onSound('burn', 3);
        if (m.burnT > 1.6) {
          this.mobs.splice(i, 1);
          m.dispose(this.scene);
          if (this.onDeath) this.onDeath(m);
          continue;
        }
      }
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 64 * 64) {
        m.dispose(this.scene);
        this.mobs.splice(i, 1);
        continue;
      }
      // Дальних обновляем реже
      if (d2 > 32 * 32 && (this.spawnT * 3) % 2 > 1) continue;
      m.update(dt, playerPos);
    }
  }

  clear() {
    for (const m of this.mobs) m.dispose(this.scene);
    this.mobs = [];
  }
}
