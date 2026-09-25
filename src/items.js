// Выпадающие предметы: яблоки с листвы и стрелы (подбор после выстрела)
import * as THREE from 'three';
import { buildArrowModel } from './projectiles.js';

const APPLE = { color: 0xd64545, stem: 0x6b4a2b };

export class ItemDrops {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    this.stemGeo = new THREE.BoxGeometry(0.08, 0.1, 0.08);
    this.mats = {
      apple: new THREE.MeshBasicMaterial({ color: APPLE.color }),
      stem: new THREE.MeshBasicMaterial({ color: APPLE.stem }),
    };
    this.onPickup = null; // (kind) => void
    this.max = 40;
  }

  spawn(x, y, z, kind = 'apple') {
    if (this.items.length >= this.max) return null;
    const g = new THREE.Group();
    if (kind === 'arrow') {
      // Стрела лежит на земле и медленно вращается — как выпавший предмет
      const arrow = buildArrowModel(1);
      arrow.rotation.y = Math.PI / 2;
      arrow.position.y = 0.08;
      g.add(arrow);
    } else {
      const body = new THREE.Mesh(this.geo, this.mats[kind] || this.mats.apple);
      const stem = new THREE.Mesh(this.stemGeo, this.mats.stem);
      stem.position.y = 0.18;
      g.add(body, stem);
    }
    g.position.set(x, y, z);
    this.scene.add(g);
    const it = {
      kind,
      group: g,
      vel: { x: (Math.random() - 0.5) * 1.2, y: 2.2, z: (Math.random() - 0.5) * 1.2 },
      t: 0,
      life: 90,
      rest: false,
    };
    this.items.push(it);
    return it;
  }

  _floorY(world, x, y, z) {
    // Верхняя грань первого твёрдого блока снизу (в радиусе падения)
    for (let yy = Math.floor(y); yy > Math.floor(y) - 5; yy--) {
      const b = world.getBlock(Math.floor(x), yy, Math.floor(z));
      if (b && b !== 13) return yy + 1; // 13 = вода (упрощённо)
    }
    return null;
  }

  update(dt, world, playerPos) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      it.life -= dt;
      const p = it.group.position;

      if (!it.rest) {
        it.vel.y -= 9 * dt;
        p.x += it.vel.x * dt;
        p.y += it.vel.y * dt;
        p.z += it.vel.z * dt;
        const fy = this._floorY(world, p.x, p.y, p.z);
        if (fy !== null && p.y <= fy + 0.16) {
          p.y = fy + 0.16;
          it.vel.x *= 0.3; it.vel.z *= 0.3;
          if (Math.abs(it.vel.y) < 1.2) { it.rest = true; it.vel.y = 0; }
          else it.vel.y = -it.vel.y * 0.25; // мягкий рикошет
        }
      } else {
        p.y += Math.sin(it.t * 3) * 0.0016;
      }

      it.group.rotation.y += dt * 1.8;

      // Подбор
      const dx = p.x - playerPos.x, dz = p.z - playerPos.z, dy = p.y - (playerPos.y + 0.9);
      if (dx * dx + dz * dz + dy * dy < 1.7) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
        if (this.onPickup) this.onPickup(it.kind);
        continue;
      }

      // Старые исчезают
      if (it.life <= 0) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items.length = 0;
  }
}
