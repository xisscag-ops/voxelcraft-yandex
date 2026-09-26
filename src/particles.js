// Пиксель-частицы при разрушении блоков (Points с квадратными спрайтами)
export class Particles {
  constructor(THREE, scene, max = 300) {
    this.THREE = THREE;
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.grav = new Float32Array(max);   // своё ускорение: искры падают, дым всплывает
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('color', this.colAttr);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, color, n = 14) {
    const THREE = this.THREE;
    for (let i = 0; i < n; i++) {
      if (this.count >= this.max) break;
      const k = this.count++;
      this.pos[k * 3] = x + Math.random() * 0.8 + 0.1;
      this.pos[k * 3 + 1] = y + Math.random() * 0.8 + 0.1;
      this.pos[k * 3 + 2] = z + Math.random() * 0.8 + 0.1;
      this.vel[k * 3] = (Math.random() - 0.5) * 3;
      this.vel[k * 3 + 1] = Math.random() * 3.5 + 0.5;
      this.vel[k * 3 + 2] = (Math.random() - 0.5) * 3;
      const shade = 0.8 + Math.random() * 0.4;
      this.col[k * 3] = (color[0] / 255) * shade;
      this.col[k * 3 + 1] = (color[1] / 255) * shade;
      this.col[k * 3 + 2] = (color[2] / 255) * shade;
      this.life[k] = 0.6 + Math.random() * 0.4;
      this.grav[k] = 12;
    }
  }

  /** Одна частица с заданной скоростью, цветом и временем жизни */
  spawn(x, y, z, vx, vy, vz, color, life, grav = 12) {
    if (this.count >= this.max) return;
    const k = this.count++;
    this.pos[k * 3] = x;
    this.pos[k * 3 + 1] = y;
    this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx;
    this.vel[k * 3 + 1] = vy;
    this.vel[k * 3 + 2] = vz;
    this.col[k * 3] = color[0] / 255;
    this.col[k * 3 + 1] = color[1] / 255;
    this.col[k * 3 + 2] = color[2] / 255;
    this.life[k] = life;
    this.grav[k] = grav;
  }

  /**
   * Огонёк у дула: сноп искр вдоль выстрела и клуб дыма сверху.
   * Искры живут доли секунды и гаснут, дым всплывает и рассеивается.
   */
  flame(x, y, z, dx, dy, dz) {
    const EMBERS = [[255, 236, 170], [255, 186, 70], [255, 132, 32], [226, 84, 26]];
    for (let i = 0; i < 10; i++) {
      const s = 2.4 + Math.random() * 3.6;
      const jx = (Math.random() - 0.5) * 1.7;
      const jy = (Math.random() - 0.5) * 1.7 + 0.6;
      const jz = (Math.random() - 0.5) * 1.7;
      const c = EMBERS[(Math.random() * EMBERS.length) | 0];
      this.spawn(
        x + (Math.random() - 0.5) * 0.06, y + (Math.random() - 0.5) * 0.06, z + (Math.random() - 0.5) * 0.06,
        dx * s + jx, dy * s + jy, dz * s + jz,
        c, 0.1 + Math.random() * 0.16, 5);
    }
    // Дым: серые клубы поднимаются и сносятся по направлению выстрела
    for (let i = 0; i < 4; i++) {
      const g = 118 + ((Math.random() * 26) | 0);
      this.spawn(x, y + 0.02, z, dx * 1.1 + (Math.random() - 0.5) * 0.5,
        0.7 + Math.random() * 0.5, dz * 1.1 + (Math.random() - 0.5) * 0.5,
        [g, g, g + 6], 0.45 + Math.random() * 0.3, -1.6);
    }
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Свап с последним
        n--;
        if (i < n) {
          for (let a = 0; a < 3; a++) {
            this.pos[i * 3 + a] = this.pos[n * 3 + a];
            this.vel[i * 3 + a] = this.vel[n * 3 + a];
            this.col[i * 3 + a] = this.col[n * 3 + a];
          }
          this.life[i] = this.life[n];
          this.grav[i] = this.grav[n];
          i--;
        }
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }
}
