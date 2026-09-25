// Стрелы: полёт с гравитацией, попадание в блоки и мобов, подбор выпущенных стрел
import * as THREE from 'three';
import { isSolid } from './blocks.js';

// ---- Модель стрелы (общая для снарядов и для лука в руках) ----
export const ARROW_GEO = {
  shaft: new THREE.BoxGeometry(0.032, 0.032, 0.6).translate(0, 0, 0.32),
  head: new THREE.ConeGeometry(0.05, 0.14, 4).rotateX(Math.PI / 2).translate(0, 0, 0.62),
  featherA: new THREE.BoxGeometry(0.11, 0.02, 0.14).translate(0, 0, 0.1),
  featherB: new THREE.BoxGeometry(0.02, 0.11, 0.14).translate(0, 0, 0.1),
};

export function arrowMaterials() {
  return {
    shaft: new THREE.MeshBasicMaterial({ color: 0x9c7548 }),
    head: new THREE.MeshBasicMaterial({ color: 0xd8dde6 }),
    feather: new THREE.MeshBasicMaterial({ color: 0xe0574c }),
  };
}

/**
 * Стрела: начало координат — пятка (хвост), сама стрела смотрит в +Z.
 * @param {number} scale масштаб модели
 * @param {object} [mats] свои материалы (для лука в руках — с depthTest: false)
 */
export function buildArrowModel(scale = 1, mats = null) {
  const m = mats || arrowMaterials();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ARROW_GEO.shaft, m.shaft));
  g.add(new THREE.Mesh(ARROW_GEO.head, m.head));
  g.add(new THREE.Mesh(ARROW_GEO.featherA, m.feather));
  g.add(new THREE.Mesh(ARROW_GEO.featherB, m.feather));
  if (scale !== 1) g.scale.setScalar(scale);
  return g;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();

export class Arrows {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.max = 48;
    this.gravity = 13;        // м/с² — стрела летит по дуге
  }

  get flying() { return this.list.filter((a) => a.state === 'fly').length; }
  get stuck() { return this.list.filter((a) => a.state === 'stuck').length; }

  /**
   * Выстрел.
   * @param {object} cb { onMob(mob, arrow), onBlock(arrow), onPickup(n) }
   */
  shoot(x, y, z, dx, dy, dz, speed, dmg, cb = {}) {
    if (this.list.length >= this.max) {
      // Освобождаем самую старую летящую стрелу
      const i = this.list.findIndex((a) => a.state === 'fly');
      if (i >= 0) this._remove(i);
      else return null;
    }
    const l = Math.hypot(dx, dy, dz) || 1;
    const group = buildArrowModel();
    group.position.set(x, y, z);
    this.scene.add(group);
    const arrow = {
      group,
      state: 'fly',
      dmg,
      t: 0,
      life: 22,                       // сколько стрела лежит воткнутой
      vel: { x: (dx / l) * speed, y: (dy / l) * speed, z: (dz / l) * speed },
      cb,
    };
    this._aim(arrow);
    this.list.push(arrow);
    return arrow;
  }

  _aim(a) {
    _dir.set(a.vel.x, a.vel.y, a.vel.z);
    const l = _dir.length() || 1;
    _dir.divideScalar(l);
    a.group.quaternion.setFromUnitVectors(Z_AXIS, _dir);
  }

  _remove(i) {
    const a = this.list[i];
    this.scene.remove(a.group);
    this.list.splice(i, 1);
  }

  /**
   * @param {object} world мир (getBlock)
   * @param {Array} mobs мобы для проверки попадания
   */
  update(dt, world, mobs, playerPos) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];

      // ---- Воткнутая стрела: лежит, гаснет и подбирается игроком ----
      if (a.state === 'stuck') {
        a.life -= dt;
        if (a.life <= 0) { this._remove(i); continue; }
        if (a.life < 2.5) a.group.scale.setScalar(Math.max(0.05, a.life / 2.5));
        if (playerPos && a.pickup) {
          const dx = a.group.position.x - playerPos.x;
          const dy = a.group.position.y - (playerPos.y + 0.9);
          const dz = a.group.position.z - playerPos.z;
          if (dx * dx + dz * dz + dy * dy < 2.2) {
            const cb = a.cb;
            this._remove(i);
            if (cb?.onPickup) cb.onPickup(1);
          }
        }
        continue;
      }

      // ---- Полёт ----
      a.t += dt;
      if (a.t > 12) { this._remove(i); continue; }
      const p = a.group.position;
      const vel = a.vel;
      const stepX = vel.x * dt, stepY = vel.y * dt, stepZ = vel.z * dt;
      const dist = Math.hypot(stepX, stepY, stepZ);
      const sub = Math.max(1, Math.min(48, Math.ceil(dist / 0.1)));
      let hitBlock = false, hitMob = null;
      let lx = p.x, ly = p.y, lz = p.z;         // последняя свободная точка
      for (let s = 1; s <= sub; s++) {
        const t = s / sub;
        const nx = p.x + stepX * t, ny = p.y + stepY * t, nz = p.z + stepZ * t;
        if (isSolid(world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) {
          hitBlock = true;
          break;
        }
        if (mobs) {
          for (const m of mobs) {
            if (m.dead) continue;
            const mx = nx - m.pos.x, mz = nz - m.pos.z;
            const my = ny - (m.pos.y + 0.4);
            if (mx * mx + mz * mz < 0.5 * 0.5 && my > -0.5 && my < 0.95) { hitMob = m; break; }
          }
          if (hitMob) break;
        }
        lx = nx; ly = ny; lz = nz;
      }

      if (hitMob) {
        _dir.set(vel.x, vel.y, vel.z).normalize();
        const mob = hitMob;
        const cb = a.cb;
        this._remove(i);
        if (cb?.onMob) cb.onMob(mob, a, _dir);
        continue;
      }

      if (hitBlock) {
        // Стрела втыкается в блок и её можно подобрать
        _dir.set(vel.x, vel.y, vel.z).normalize();
        p.set(lx, ly, lz);
        a.group.quaternion.setFromUnitVectors(Z_AXIS, _dir);
        a.state = 'stuck';
        a.pickup = true;
        a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
        const cb = a.cb;
        if (cb?.onBlock) cb.onBlock(a);
        continue;
      }

      p.set(p.x + stepX, p.y + stepY, p.z + stepZ);
      vel.y -= this.gravity * dt;
      const drag = Math.max(0, 1 - 0.25 * dt);
      vel.x *= drag; vel.z *= drag;
      this._aim(a);
    }
  }

  clear() {
    for (const a of this.list) this.scene.remove(a.group);
    this.list.length = 0;
  }
}
