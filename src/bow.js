// Крупный составной лук от первого лица + летящие стрелы.
import * as THREE from 'three';
import { raycastVoxel } from './raycast.js';

const up = new THREE.Vector3(0, 1, 0);

function beam(parent, from, to, width, depth, material) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const part = new THREE.Mesh(new THREE.BoxGeometry(width, a.distanceTo(b), depth), material);
  part.position.copy(a).add(b).multiplyScalar(0.5);
  part.quaternion.setFromUnitVectors(up, b.sub(a).normalize());
  part.renderOrder = 1001;
  parent.add(part);
  return part;
}

export function createBowModel() {
  const group = new THREE.Group();
  const mat = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const wood = mat(0x8c4c25), edge = mat(0xc28745), grip = mat(0x30251e);
  const cord = mat(0xe9d6a9), brass = mat(0xd1ad64), shaft = mat(0x9e7650), feather = mat(0xf3ece0);
  // Изогнутая деревянная дуга, светлая накладка и металлические наконечники.
  const curve = [[0.025, 0], [0.08, 0.16], [0.155, 0.33], [0.21, 0.46], [0.205, 0.58]];
  for (const sign of [-1, 1]) {
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1];
      beam(group, [a[0], sign * a[1], 0], [b[0], sign * b[1], 0], 0.085 - i * 0.01, 0.095, wood);
      beam(group, [a[0] + 0.025, sign * a[1], 0.055], [b[0] + 0.025, sign * b[1], 0.055], 0.018, 0.022, edge);
    }
    beam(group, [0.205, sign * 0.52, 0], [0.2, sign * 0.6, 0], 0.065, 0.11, brass);
  }
  beam(group, [-0.005, -0.145, 0.04], [-0.005, 0.145, 0.04], 0.118, 0.14, grip);
  for (const y of [-0.12, -0.06, 0, 0.06, 0.12])
    beam(group, [-0.07, y, 0.114], [0.06, y + 0.03, 0.114], 0.014, 0.014, edge);
  // Тетива из двух отрезков (центральный узел оттягивается при выстреле).
  const stringTop = beam(group, [0.2, 0.6, 0], [-0.09, 0, 0.075], 0.012, 0.012, cord);
  const stringBottom = beam(group, [-0.09, 0, 0.075], [0.2, -0.6, 0], 0.012, 0.012, cord);
  const arrow = new THREE.Group();
  beam(arrow, [-0.095, 0, 0.48], [-0.095, 0, -0.56], 0.024, 0.024, shaft);
  beam(arrow, [-0.095, 0, -0.55], [-0.095, 0, -0.64], 0.062, 0.062, brass);
  for (const y of [-0.07, 0.07])
    beam(arrow, [-0.095, y, 0.41], [-0.095, y * 0.7, 0.25], 0.05, 0.022, feather);
  group.add(arrow);
  group.traverse((node) => { if (node.isMesh) node.frustumCulled = false; });
  return { group, arrow, stringTop, stringBottom };
}

export class Arrows {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.max = 32;
    this.shaftGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.48, 5);
    this.tipGeo = new THREE.ConeGeometry(0.052, 0.14, 4);
    this.featherGeo = new THREE.BoxGeometry(0.095, 0.12, 0.018);
    this.wood = new THREE.MeshBasicMaterial({ color: 0x9f784e });
    this.metal = new THREE.MeshBasicMaterial({ color: 0xb9c0c7 });
    this.feather = new THREE.MeshBasicMaterial({ color: 0xf0e4c7 });
    this.onHitMob = null;
    this.onHitBlock = null;
  }

  fire(origin, direction) {
    if (this.projectiles.length >= this.max) return false;
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.shaftGeo, this.wood));
    const tip = new THREE.Mesh(this.tipGeo, this.metal);
    tip.position.y = 0.31;
    const f1 = new THREE.Mesh(this.featherGeo, this.feather);
    f1.position.y = -0.19;
    const f2 = new THREE.Mesh(this.featherGeo, this.feather);
    f2.position.y = -0.19; f2.rotation.y = Math.PI / 2;
    group.add(tip, f1, f2);
    group.position.set(origin.x, origin.y, origin.z).addScaledVector(dir, 0.18);
    group.quaternion.setFromUnitVectors(up, dir);
    this.scene.add(group);
    this.projectiles.push({ group, vel: dir.multiplyScalar(29), life: 2.4 });
    return true;
  }

  _remove(i) {
    this.scene.remove(this.projectiles[i].group);
    this.projectiles.splice(i, 1);
  }

  update(dt, world, mobs) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const arrow = this.projectiles[i];
      arrow.life -= dt;
      if (arrow.life <= 0) { this._remove(i); continue; }
      const start = arrow.group.position;
      const travel = arrow.vel.clone().multiplyScalar(dt);
      const dist = travel.length();
      if (dist < 1e-6) continue;
      const dir = travel.clone().multiplyScalar(1 / dist);
      const block = raycastVoxel(world, start.x, start.y, start.z, dir.x, dir.y, dir.z, dist);
      let bestT = block?.t ?? dist + 1;
      let target = null;
      for (const mob of mobs) {
        if (mob.dead) continue;
        const radius = mob.type === 'bird' ? 0.33 : mob.type === 'gloom' ? 0.38 : 0.53;
        const height = mob.type === 'bird' ? 0 : mob.type === 'spider' ? 0.38 : 0.48;
        const dx = mob.pos.x - start.x, dy = mob.pos.y + height - start.y, dz = mob.pos.z - start.z;
        const t = dx * dir.x + dy * dir.y + dz * dir.z;
        if (t < 0 || t > Math.min(dist, bestT)) continue;
        const radialSq = dx * dx + dy * dy + dz * dz - t * t;
        if (radialSq < radius * radius) { bestT = t; target = mob; }
      }
      if (target) {
        target.hurt(2);
        target.knockback(dir.x, dir.z, 3.4);
        this.onHitMob?.(target);
        this._remove(i);
      } else if (block) {
        this.onHitBlock?.(block);
        this._remove(i);
      } else {
        start.add(travel);
        arrow.vel.y -= 8 * dt;
        arrow.group.quaternion.setFromUnitVectors(up, arrow.vel.clone().normalize());
      }
    }
  }

  clear() {
    while (this.projectiles.length) this._remove(this.projectiles.length - 1);
  }
}
