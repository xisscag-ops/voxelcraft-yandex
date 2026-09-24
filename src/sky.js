// Небо: цвет фона/тумана, солнце, луна, звёзды, смена дня и ночи
export class Sky {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.time = 0.3;           // 0..1 (0.25 ~ полдень)
    this.dayLength = 480;      // секунд на полный цикл
    this.paused = false;

    this.scene.fog = new THREE.Fog(0x87ceeb, 24, 70);

    // Солнце и луна — простые квады, всегда «в небе»
    const sunGeo = new THREE.PlaneGeometry(6, 6);
    this.sunMat = new THREE.MeshBasicMaterial({ color: 0xfff4c0, fog: false, depthWrite: false });
    this.sun = new THREE.Mesh(sunGeo, this.sunMat);
    const moonGeo = new THREE.PlaneGeometry(4, 4);
    this.moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false, depthWrite: false });
    this.moon = new THREE.Mesh(moonGeo, this.moonMat);
    scene.add(this.sun);
    scene.add(this.moon);

    // Звёзды
    const starCount = 300;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI * 0.5;
      const r = 320;
      positions[i * 3] = Math.cos(a) * Math.cos(b) * r;
      positions[i * 3 + 1] = Math.sin(b) * r + 30;
      positions[i * 3 + 2] = Math.sin(a) * Math.cos(b) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, fog: false, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(starGeo, this.starMat);
    scene.add(this.stars);

    this._dayColor = new THREE.Color(0x87ceeb);
    this._nightColor = new THREE.Color(0x0a1024);
    this._sunsetColor = new THREE.Color(0xf28c5a);
    this._tmp = new THREE.Color();
    this.lightLevel = 1;
  }

  setTime(t) { this.time = t - Math.floor(t); }

  update(dt, playerPos) {
    if (!this.paused) {
      this.time = (this.time + dt / this.dayLength) % 1;
    }
    const THREE = this.THREE;
    const t = this.time;
    // Угол солнца: 0.25 — зенит, 0.75 — полночь
    const ang = (t - 0.25) * Math.PI * 2;
    const sx = Math.cos(ang), sy = Math.sin(ang);

    const dayness = Math.max(0, Math.min(1, sy * 2 + 0.25));       // 0 ночь, 1 день
    const sunset = Math.max(0, 1 - Math.abs(sy) * 4) * (sy > -0.2 ? 1 : 0);

    this.lightLevel = 0.22 + dayness * 0.78;

    // Цвет неба
    this._tmp.copy(this._nightColor).lerp(this._dayColor, dayness);
    this._tmp.lerp(this._sunsetColor, sunset * 0.55);
    this.scene.background = this._tmp;
    this.scene.fog.color.copy(this._tmp);
    const far = this.viewDistance ? this.viewDistance * 16 : 80;
    this.scene.fog.near = far * 0.45;
    this.scene.fog.far = far;

    // Позиция солнца/луны относительно камеры
    const cx = playerPos.x, cy = playerPos.y + 8, cz = playerPos.z;
    const R = 300;
    this.sun.position.set(cx + sx * R, cy + sy * R, cz + 20);
    this.sun.lookAt(cx, cy, cz);
    this.moon.position.set(cx - sx * R, cy - sy * R, cz + 20);
    this.moon.lookAt(cx, cy, cz);
    this.sunMat.color.setHSL(0.13, 0.9, 0.55 + dayness * 0.35);
    this.sun.visible = sy > -0.35;
    this.moon.visible = sy < 0.35;

    // Звёзды — только ночью
    this.stars.position.set(cx, 0, cz);
    this.starMat.opacity = Math.max(0, 1 - dayness * 1.6);
    this.stars.visible = this.starMat.opacity > 0.02;
  }

  serialize() { return this.time; }
}
