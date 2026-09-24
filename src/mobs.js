// Мобы: кабаны (блуждают по земле) и птицы (кружат в небе)
// Модели собраны из коробок — своя стилистика, никаких чужих ассетов
import { isSolid, isLiquid } from './blocks.js';

const BOAR = { body: 0x8a6a4a, head: 0x9a7a58, snout: 0xc9a18a, leg: 0x6b5238, tusk: 0xf0ece0, eye: 0x1c1610 };
const BIRD = { body: 0xe8e8f0, wing: 0xc8ccdc, beak: 0xf0a030, tail: 0xb0b4c4, eye: 0x1c1610 };

const MAX_BOARS = 8;
const MAX_BIRDS = 4;
const DESPAWN = 64;

export class Mobs {
  constructor(THREE, scene, world) {
    this.THREE = THREE;
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = [];
    this.spawnTimer = 0.6;
    this.rngState = (Date.now() ^ (Math.random() * 1e9)) | 0;
    this._mats = new Map();   // цвет -> {mat, base}
  }

  rand() {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) | 0;
    return ((this.rngState >>> 8) & 0xffffff) / 0x1000000;
  }

  mat(hex) {
    let entry = this._mats.get(hex);
    if (!entry) {
      const m = new this.THREE.MeshBasicMaterial({ color: hex });
      entry = { mat: m, base: new this.THREE.Color(hex) };
      this._mats.set(hex, entry);
    }
    return entry.mat;
  }

  box(w, h, d, color) {
    const THREE = this.THREE;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.mat(color));
    return mesh;
  }

  // ------------------------------- Модели -------------------------------
  _buildBoar() {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const body = this.box(0.55, 0.5, 0.9, BOAR.body); body.position.y = 0.55; g.add(body);
    const head = this.box(0.4, 0.38, 0.38, BOAR.head); head.position.set(0, 0.6, -0.6); g.add(head);
    const snout = this.box(0.2, 0.16, 0.12, BOAR.snout); snout.position.set(0, 0.52, -0.82); g.add(snout);
    const tuskL = this.box(0.05, 0.05, 0.1, BOAR.tusk); tuskL.position.set(0.12, 0.46, -0.86); g.add(tuskL);
    const tuskR = this.box(0.05, 0.05, 0.1, BOAR.tusk); tuskR.position.set(-0.12, 0.46, -0.86); g.add(tuskR);
    const eyeL = this.box(0.06, 0.06, 0.02, BOAR.eye); eyeL.position.set(0.14, 0.68, -0.8); g.add(eyeL);
    const eyeR = this.box(0.06, 0.06, 0.02, BOAR.eye); eyeR.position.set(-0.14, 0.68, -0.8); g.add(eyeR);
    const earL = this.box(0.08, 0.12, 0.04, BOAR.head); earL.position.set(0.14, 0.84, -0.55); g.add(earL);
    const earR = this.box(0.08, 0.12, 0.04, BOAR.head); earR.position.set(-0.14, 0.84, -0.55); g.add(earR);
    const tail = this.box(0.06, 0.06, 0.2, BOAR.leg); tail.position.set(0, 0.7, 0.5); tail.rotation.x = -0.5; g.add(tail);
    const legs = [];
    for (const [lx, lz] of [[0.16, 0.3], [-0.16, 0.3], [0.16, -0.3], [-0.16, -0.3]]) {
      const leg = this.box(0.14, 0.34, 0.14, BOAR.leg);
      leg.position.set(lx, 0.17, lz);
      g.add(leg);
      legs.push(leg);
    }
    return { group: g, parts: { legs, head } };
  }

  _buildBird() {
    const THREE = this.THREE;
    const g = new THREE.Group();
    const body = this.box(0.26, 0.24, 0.4, BIRD.body); g.add(body);
    const head = this.box(0.18, 0.18, 0.18, BIRD.body); head.position.set(0, 0.12, -0.28); g.add(head);
    const beak = this.box(0.06, 0.05, 0.12, BIRD.beak); beak.position.set(0, 0.1, -0.4); g.add(beak);
    const eyeL = this.box(0.04, 0.04, 0.02, BIRD.eye); eyeL.position.set(0.08, 0.16, -0.36); g.add(eyeL);
    const eyeR = this.box(0.04, 0.04, 0.02, BIRD.eye); eyeR.position.set(-0.08, 0.16, -0.36); g.add(eyeR);
    const tail = this.box(0.16, 0.04, 0.18, BIRD.tail); tail.position.set(0, 0.04, 0.28); g.add(tail);
    // Крылья с пивотом у корпуса
    const wingL = this.box(0.3, 0.03, 0.2, BIRD.wing); wingL.position.set(0.26, 0.05, 0.02); g.add(wingL);
    const wingR = this.box(0.3, 0.03, 0.2, BIRD.wing); wingR.position.set(-0.26, 0.05, 0.02); g.add(wingR);
    return { group: g, parts: { wingL, wingR } };
  }

  // ------------------------------- Спавн -------------------------------
  // Тип колонки: где земля и есть ли сверху вода
  columnInfo(x, z) {
    const wx = Math.floor(x), wz = Math.floor(z);
    for (let y = this.world.worldHeight - 1; y >= 0; y--) {
      const b = this.world.getBlock(wx, y, wz);
      if (isLiquid(b)) return { groundY: y + 1, water: true, top: b };
      if (isSolid(b)) return { groundY: y + 1, water: false, top: b };
    }
    return { groundY: 0, water: true, top: 0 };
  }

  spawnAround(playerPos, seaLevel) {
    const counts = { boar: 0, bird: 0 };
    for (const m of this.list) counts[m.type]++;
    this.spawnTimer = 1.2;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = this.rand() * Math.PI * 2;
      const r = 14 + this.rand() * 18;
      const x = playerPos.x + Math.cos(a) * r;
      const z = playerPos.z + Math.sin(a) * r;
      const info = this.columnInfo(x, z);

      if (counts.boar < MAX_BOARS && !info.water && info.groundY > seaLevel + 1 && info.groundY < 42) {
        // сверху должно быть два блока воздуха
        const gy = Math.floor(info.groundY);
        if (this.world.getBlock(Math.floor(x), gy, Math.floor(z)) === 0 &&
            this.world.getBlock(Math.floor(x), gy + 1, Math.floor(z)) === 0) {
          this.add('boar', x, info.groundY, z);
          counts.boar++;
          return;
        }
      }
      if (counts.bird < MAX_BIRDS) {
        const gy = info.groundY + 4 + this.rand() * 6;
        this.add('bird', x, gy, z);
        counts.bird++;
        return;
      }
    }
  }

  add(type, x, y, z) {
    const built = type === 'boar' ? this._buildBoar() : this._buildBird();
    built.group.position.set(x, y, z);
    this.group.add(built.group);
    const mob = {
      type,
      pos: { x, y, z },
      yaw: this.rand() * Math.PI * 2,
      group: built.group,
      parts: built.parts,
      mode: 'idle',            // idle | walk | flee
      timer: 1 + this.rand() * 2,
      anim: this.rand() * 10,
      flee: 0,
      home: { x, z },
      ang: this.rand() * Math.PI * 2,
      radius: 5 + this.rand() * 9,
      chirpT: 2 + this.rand() * 6,
    };
    this.list.push(mob);
    return mob;
  }

  // ------------------------------- Попадание -------------------------------
  tryHit(eye, dir, maxDist) {
    let best = null;
    let bestT = maxDist;
    for (const m of this.list) {
      const cy = m.pos.y + (m.type === 'bird' ? 0.35 : 0.55);
      const r = m.type === 'bird' ? 0.55 : 0.8;
      const ox = m.pos.x - eye.x, oy = cy - eye.y, oz = m.pos.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bestT) continue;
      const px = eye.x + dir.x * t - m.pos.x;
      const py = eye.y + dir.y * t - cy;
      const pz = eye.z + dir.z * t - m.pos.z;
      if (px * px + py * py + pz * pz < r * r) {
        best = { mob: m, dist: t };
        bestT = t;
      }
    }
    return best;
  }

  hit(mob, fromPos, sfx) {
    mob.flee = 3;
    mob.mode = 'flee';
    mob.yaw = Math.atan2(mob.pos.x - fromPos.x, mob.pos.z - fromPos.z);
    if (mob.type === 'bird') {
      mob.flee = 2.5;
      sfx?.chirp();
    } else {
      sfx?.squeak();
    }
  }

  // ------------------------------- Обновление -------------------------------
  update(dt, playerPos, light) {
    // Подсветка день/ночь
    const k = 0.3 + 0.7 * light;
    for (const { mat, base } of this._mats.values()) {
      mat.color.copy(base).multiplyScalar(k);
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnAround(playerPos, this.world.seaLevel);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > DESPAWN * DESPAWN) {
        this.group.remove(m.group);
        m.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
        this.list.splice(i, 1);
        continue;
      }
      // Не обсчитываем далёких каждый кадр
      if (distSq > 40 * 40 && (i & 3) !== 0) continue;

      if (m.type === 'boar') this._updateBoar(m, dt, playerPos);
      else this._updateBird(m, dt, playerPos);

      m.group.position.set(m.pos.x, m.pos.y, m.pos.z);
      m.group.rotation.y = m.yaw;
    }
  }

  _updateBoar(m, dt, playerPos) {
    m.anim += dt * 6;
    m.timer -= dt;

    let speed = 0;
    if (m.flee > 0) {
      m.flee -= dt;
      speed = 4.2;
    } else if (m.timer <= 0) {
      // Новое «решение»
      if (m.mode === 'walk') {
        m.mode = 'idle';
        m.timer = 1 + this.rand() * 2.5;
      } else {
        m.mode = 'walk';
        m.yaw += (this.rand() - 0.5) * 2.5;
        m.timer = 2 + this.rand() * 3;
      }
    }
    if (m.mode === 'walk' && m.flee <= 0) speed = 1.3;

    if (speed > 0) {
      // Вперёд по направлению взгляда: yaw=0 -> -Z (как у камеры)
      const dirX = -Math.sin(m.yaw), dirZ = -Math.cos(m.yaw);
      const nx = m.pos.x + dirX * speed * dt;
      const nz = m.pos.z + dirZ * speed * dt;
      const info = this.columnInfo(nx, nz);
      const blocked = info.water ||
        info.groundY > m.pos.y + 1.1 ||
        info.groundY < m.pos.y - 3;
      if (blocked && m.flee <= 0) {
        m.yaw += Math.PI * (0.5 + this.rand());
        m.timer = 0.3;
      } else if (blocked) {
        m.yaw += 1.2 * dt * 3;
      } else {
        m.pos.x = nx;
        m.pos.z = nz;
        // Плавный подъём/спуск по рельефу + «прыжок» на ступеньку
        const dy = info.groundY - m.pos.y;
        if (dy > 0.35) m.pos.y += Math.min(dy, 8 * dt);
        else m.pos.y += dy * Math.min(1, 12 * dt);
      }
    }

    // Анимация ног
    const legs = m.parts.legs;
    const swing = speed > 0 ? Math.sin(m.anim * (speed > 2 ? 2.2 : 1.2)) * 0.5 : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    legs[2].rotation.x = -swing;
    legs[3].rotation.x = swing;
    legs[0].position.y = 0.17 + Math.max(0, swing) * 0.08;
    legs[1].position.y = 0.17 + Math.max(0, -swing) * 0.08;
    legs[2].position.y = 0.17 + Math.max(0, -swing) * 0.08;
    legs[3].position.y = 0.17 + Math.max(0, swing) * 0.08;
    m.parts.head.position.y = 0.6 + Math.sin(m.anim * 0.7) * 0.02;
  }

  _updateBird(m, dt, playerPos) {
    m.anim += dt * 9;
    if (m.flee > 0) {
      m.flee -= dt;
      // Улетает вверх и в сторону
      m.pos.y += 3.5 * dt;
      const dirX = -Math.sin(m.yaw), dirZ = -Math.cos(m.yaw);
      m.pos.x += dirX * 5 * dt;
      m.pos.z += dirZ * 5 * dt;
    } else {
      // Круги вокруг «дома»
      m.ang += dt * 0.35;
      const tx = m.home.x + Math.cos(m.ang) * m.radius;
      const tz = m.home.z + Math.sin(m.ang) * m.radius;
      const dx = tx - m.pos.x, dz = tz - m.pos.z;
      const want = Math.atan2(-dx, -dz);
      // Плавный поворот
      let d = want - m.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.yaw += d * Math.min(1, 2 * dt);
      m.pos.x += -Math.sin(m.yaw) * 3.2 * dt;
      m.pos.z += -Math.cos(m.yaw) * 3.2 * dt;
      // Лёгкое покачивание по высоте
      const gy = this.columnInfo(m.pos.x, m.pos.z).groundY;
      const wantY = gy + 5 + Math.sin(m.ang * 2) * 1.5;
      m.pos.y += (wantY - m.pos.y) * Math.min(1, 1.5 * dt);
    }

    // Хлопки крыльев
    const flap = Math.sin(m.anim) * (m.flee > 0 ? 0.9 : 0.55);
    m.parts.wingL.rotation.z = flap;
    m.parts.wingR.rotation.z = -flap;
    m.group.rotation.x = Math.sin(m.anim * 0.5) * 0.06;

    // Редкое чириканье, если птица близко
    m.chirpT -= dt;
    if (m.chirpT <= 0) {
      m.chirpT = 5 + this.rand() * 10;
      const dx = m.pos.x - playerPos.x, dz = m.pos.z - playerPos.z;
      if (dx * dx + dz * dz < 25 * 25) this._onChirp?.();
    }
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.list) {
      m.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    }
    this.list = [];
    for (const { mat } of this._mats.values()) mat.dispose();
    this._mats.clear();
  }
}
