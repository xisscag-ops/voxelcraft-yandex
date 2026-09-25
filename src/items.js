// Подбираемые яблоки, руда, уголь, пшеница и сферы опыта.
import * as THREE from 'three';
import { isSolid, blockBounds } from './blocks.js';

export class ItemDrops {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    this.stemGeo = new THREE.BoxGeometry(0.07, 0.10, 0.07);
    this.orbGeo = new THREE.OctahedronGeometry(0.16, 0);
    this.mats = {
      apple: new THREE.MeshBasicMaterial({ color: 0xda4545 }),
      stem: new THREE.MeshBasicMaterial({ color: 0x6b4a2b }),
      ore: new THREE.MeshBasicMaterial({ color: 0xbd7650 }),
      coal: new THREE.MeshBasicMaterial({ color: 0x27282e }),
      wheat: new THREE.MeshBasicMaterial({ color: 0xeac564 }),
      xp: new THREE.MeshBasicMaterial({ color: 0x95ff3b }),
    };
    this.onPickup = null; // (kind, amount) => void
    this.max = 80;
  }

  spawn(x, y, z, kind = 'apple', amount = 1) {
    if (!this.mats[kind] || this.items.length >= this.max) return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(kind === 'xp' ? this.orbGeo : this.geo, this.mats[kind]);
    group.add(body);
    if (kind === 'apple' || kind === 'wheat') {
      const stem = new THREE.Mesh(this.stemGeo, this.mats.stem);
      stem.position.y = 0.18;
      group.add(stem);
    }
    if (kind === 'ore') {
      const grain = new THREE.Mesh(this.stemGeo, this.mats.coal);
      grain.position.set(0.13, 0.04, 0.12);
      group.add(grain);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    const it = {
      kind, amount, group,
      vel: { x: (Math.random() - 0.5) * 1.2, y: 2.2, z: (Math.random() - 0.5) * 1.2 },
      t: 0, life: kind === 'xp' ? 55 : 90, rest: false,
    };
    this.items.push(it);
    return it;
  }

  _floorY(world, x, y, z) {
    for (let yy = Math.floor(y); yy > Math.floor(y) - 5; yy--) {
      const id = world.getBlock(Math.floor(x), yy, Math.floor(z));
      if (isSolid(id)) return yy + blockBounds(id).maxY;
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
          else it.vel.y = -it.vel.y * 0.25;
        }
      } else {
        p.y += Math.sin(it.t * 3) * 0.0016;
      }
      it.group.rotation.y += dt * (it.kind === 'xp' ? 3.5 : 1.8);
      if (it.kind === 'xp') it.group.position.y += Math.sin(it.t * 5) * 0.002;

      const dx = p.x - playerPos.x, dz = p.z - playerPos.z, dy = p.y - (playerPos.y + 0.9);
      if (dx * dx + dz * dz + dy * dy < 2.4) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
        this.onPickup?.(it.kind, it.amount);
        continue;
      }
      if (it.life <= 0) {
        this.scene.remove(it.group);
        this.items.splice(i, 1);
      }
    }
  }

  serialize() {
    return this.items.map((it) => ({
      kind: it.kind, amount: it.amount,
      x: it.group.position.x, y: it.group.position.y, z: it.group.position.z,
      life: it.life,
    }));
  }

  load(saved) {
    this.clear();
    for (const data of (Array.isArray(saved) ? saved : []).slice(0, this.max)) {
      if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isFinite(data.z)) continue;
      const it = this.spawn(data.x, data.y, data.z, data.kind, Math.max(1, data.amount | 0));
      if (it) it.life = Math.max(0, Math.min(90, Number(data.life) || 30));
    }
  }

  clear() {
    for (const it of this.items) this.scene.remove(it.group);
    this.items.length = 0;
  }
}
