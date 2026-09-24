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
          i--;
        }
        continue;
      }
      this.vel[i * 3 + 1] -= 12 * dt;
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
