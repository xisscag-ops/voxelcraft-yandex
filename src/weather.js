// Погода: дождь (линии-капли), снег (точки с покачиванием), гроза со вспышками
// Долгие ясные интервалы делают дождь заметно реже, а ливни — короче.
export const WEATHER_LIFECYCLE = { clear: [150, 280], rain: [28, 55] };

export class Weather {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.scene = scene;
    this.state = 'clear';       // 'clear' | 'rain'
    this.intensity = 0;         // 0..1 (плавное проявление)
    this.timer = 80 + Math.random() * 80;
    this.flashing = 0;          // длительность локального удара молнии
    this.thunderT = 0;          // таймер до грома (звук с задержкой)
    this.lightningGroup = null;
    this.lightningLife = 0;
    this.lightningStrike = null;
    this._rngSeed = Math.random() * 1000;

    // ---- Дождь: сегменты-капли ----
    this.rainCount = 500;
    this.rainPos = new Float32Array(this.rainCount * 2 * 3);
    this.rainVel = new Float32Array(this.rainCount);
    this.rainCol = new Float32Array(this.rainCount * 2 * 3);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainPosAttr = new THREE.BufferAttribute(this.rainPos, 3);
    this.rainColAttr = new THREE.BufferAttribute(this.rainCol, 3);
    this.rainPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.rainGeo.setAttribute('position', this.rainPosAttr);
    this.rainGeo.setAttribute('color', this.rainColAttr);
    this.rainMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 });
    this.rainLines = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    scene.add(this.rainLines);

    // ---- Снег: точки ----
    this.snowCount = 350;
    this.snowPos = new Float32Array(this.snowCount * 3);
    this.snowVel = new Float32Array(this.snowCount);
    this.snowPhase = new Float32Array(this.snowCount);
    this.snowGeo = new THREE.BufferGeometry();
    this.snowPosAttr = new THREE.BufferAttribute(this.snowPos, 3);
    this.snowPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.snowGeo.setAttribute('position', this.snowPosAttr);
    this.snowMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0, sizeAttenuation: true });
    this.snowPoints = new THREE.Points(this.snowGeo, this.snowMat);
    this.snowPoints.frustumCulled = false;
    this.snowPoints.visible = false;
    scene.add(this.snowPoints);

    this._filled = false;
  }

  // Тест/отладка: принудительная смена погоды
  force(state) {
    if (!WEATHER_LIFECYCLE[state]) return;
    this.state = state;
    this.timer = WEATHER_LIFECYCLE[state][0];
    this.intensity = state === 'clear' ? this.intensity : 1;
  }

  _removeLightning() {
    if (!this.lightningGroup) return;
    this.scene.remove(this.lightningGroup);
    this.lightningGroup.traverse((obj) => {
      if (obj.geometry && obj.geometry !== this.rainGeo && obj.geometry !== this.snowGeo) obj.geometry.dispose?.();
      if (obj.material && !Array.isArray(obj.material)) obj.material.dispose?.();
    });
    this.lightningGroup = null;
    this.lightningLife = 0;
    this.lightningStrike = null;
  }

  _createLightning(playerPos, world) {
    this._removeLightning();
    const THREE = this.THREE;
    const angle = Math.random() * Math.PI * 2;
    const distance = 10 + Math.random() * 20;
    const x = Math.floor(playerPos.x + Math.cos(angle) * distance);
    const z = Math.floor(playerPos.z + Math.sin(angle) * distance);
    const groundY = Math.max(1, world.heightAt(x, z) + 1);
    const topY = Math.min(world.worldHeight - 1, Math.max(groundY + 12, playerPos.y + 15));
    const startX = x + 0.5, startZ = z + 0.5;
    const vertices = [];
    let px = startX, pz = startZ;
    for (let y = topY; y > groundY; y -= 2.4) {
      const nextY = Math.max(groundY, y - 2.4);
      const nx = px + (Math.random() - 0.5) * 2.4;
      const nz = pz + (Math.random() - 0.5) * 2.4;
      vertices.push(px, y, pz, nx, nextY, nz);
      // Короткие боковые ответвления подчёркивают форму разряда.
      if (Math.random() < 0.35 && nextY > groundY + 3) {
        const side = Math.random() < 0.5 ? -1 : 1;
        vertices.push(nx, nextY, nz, nx + side * (1.2 + Math.random()), nextY - 1.1, nz + (Math.random() - 0.5) * 1.6);
      }
      px = nx; pz = nz;
    }
    if (vertices.length === 0) vertices.push(startX, topY, startZ, startX, groundY, startZ);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere?.();
    const core = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0xe7f4ff, transparent: true, opacity: 1, depthWrite: false,
    }));
    const halo = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
      color: 0x78baff, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    const group = new THREE.Group();
    group.add(halo, core);
    const light = new THREE.PointLight(0x9dcfff, 2.3, 13, 2);
    light.position.set(startX, groundY + 2, startZ);
    group.add(light);
    const impact = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.035, 8),
      new THREE.MeshBasicMaterial({ color: 0xd9edff, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    impact.position.set(startX, groundY + 0.02, startZ);
    group.add(impact);
    group.userData.materials = [core.material, halo.material, impact.material];
    group.userData.light = light;
    this.scene.add(group);
    this.lightningGroup = group;
    this.lightningLife = 0.55;
    this.lightningStrike = { x: startX, y: groundY, z: startZ, distance };
    return this.lightningStrike;
  }

  reset() {
    this._removeLightning();
    this.state = 'clear';
    this.intensity = 0;
    this.timer = 80 + Math.random() * 80;
    this.flashing = 0;
    this.thunderT = 0;
    this._filled = false;
    this.rainLines.visible = false;
    this.snowPoints.visible = false;
  }

  _fill(playerPos, world) {
    // Начальное размещение капель/снежинок вокруг игроя
    for (let i = 0; i < this.rainCount; i++) this._respawnDrop(i, playerPos, world, true);
    for (let i = 0; i < this.snowCount; i++) this._respawnFlake(i, playerPos, world, true);
    this._filled = true;
  }

  _respawnDrop(i, p, world, initial = false) {
    const x = p.x + (Math.random() - 0.5) * 36;
    const z = p.z + (Math.random() - 0.5) * 36;
    const top = p.y + 10 + Math.random() * 12;
    const y = initial ? p.y - 6 + Math.random() * (top - p.y + 6) : top;
    const k = i * 6;
    this.rainPos[k] = x; this.rainPos[k + 1] = y; this.rainPos[k + 2] = z;
    this.rainPos[k + 3] = x; this.rainPos[k + 4] = y - 0.7; this.rainPos[k + 5] = z;
    this.rainVel[i] = 14 + Math.random() * 8;
    const w = 0.55 + Math.random() * 0.25;
    for (const vi of [0, 3]) {
      this.rainCol[k + vi] = w * 0.75;
      this.rainCol[k + vi + 1] = w * 0.85;
      this.rainCol[k + vi + 2] = w;
    }
  }

  _respawnFlake(i, p, world, initial = false) {
    const x = p.x + (Math.random() - 0.5) * 32;
    const z = p.z + (Math.random() - 0.5) * 32;
    const top = p.y + 8 + Math.random() * 10;
    const y = initial ? p.y - 4 + Math.random() * (top - p.y + 4) : top;
    const k = i * 3;
    this.snowPos[k] = x; this.snowPos[k + 1] = y; this.snowPos[k + 2] = z;
    this.snowVel[i] = 1.1 + Math.random() * 1.1;
    this.snowPhase[i] = Math.random() * Math.PI * 2;
  }

  /**
   * @param {object} cbs { onThunder(flashToThunderDelay) } — гром со «световой» задержкой
   */
  update(dt, playerPos, world, level, cbs = {}) {
    // Смена погоды
    this.timer -= dt;
    if (this.timer <= 0) {
      const prev = this.state;
      this.state = this.state === 'clear' ? 'rain' : 'clear';
      const [a, b] = WEATHER_LIFECYCLE[this.state];
      this.timer = a + Math.random() * (b - a);
      if (cbs.onChange) cbs.onChange(this.state, prev);
    }
    const target = this.state === 'rain' ? 1 : 0;
    this.intensity += Math.sign(target - this.intensity) * dt * 0.25;
    this.intensity = Math.max(0, Math.min(1, this.intensity));

    const wet = this.intensity > 0.02;
    this.rainLines.visible = wet;
    this.snowPoints.visible = wet;
    if (!wet) {
      this.rainMat.opacity = 0;
      this.snowMat.opacity = 0;
    }

    // Молния — тонкий объёмный разряд в выбранной точке мира, без вспышки поверх экрана.
    if (this.state === 'rain' && this.intensity > 0.5) {
      if (this.flashing > 0) {
        this.flashing = Math.max(0, this.flashing - dt);
      } else if (Math.random() < dt * 0.03) {
        const strike = this._createLightning(playerPos, world);
        this.flashing = 0.35;
        this.thunderT = Math.max(0.12, strike.distance / 343);
        if (cbs.onFlash) cbs.onFlash(strike);
      }
    }
    if (this.lightningGroup) {
      this.lightningLife = Math.max(0, this.lightningLife - dt);
      const fade = this.lightningLife > 0.13 ? 1 : this.lightningLife / 0.13;
      const materials = this.lightningGroup.userData.materials || [];
      if (materials[0]) materials[0].opacity = fade;
      if (materials[1]) materials[1].opacity = 0.42 * fade;
      if (materials[2]) materials[2].opacity = 0.8 * fade;
      if (this.lightningGroup.userData.light) this.lightningGroup.userData.light.intensity = 2.3 * fade;
      if (this.lightningLife <= 0) this._removeLightning();
    }
    if (this.thunderT > 0) {
      this.thunderT -= dt;
      if (this.thunderT <= 0 && cbs.onThunder) cbs.onThunder(this.lightningStrike);
    }

    if (!this._filled) this._fill(playerPos, world);

    // ---- Капли ----
    if (wet) {
      const snowMode = this._localSnow(playerPos, world);
      // Частицы дождя прячем в режиме снега и наоборот
      this.rainMat.opacity = this.intensity * (snowMode ? 0 : 0.5);
      this.snowMat.opacity = this.intensity * (snowMode ? 0.9 : 0);
      this.rainMat.needsUpdate = true;

      if (!snowMode) {
        for (let i = 0; i < this.rainCount; i++) {
          const k = i * 6;
          const ny = this.rainPos[k + 1] - this.rainVel[i] * dt;
          this.rainPos[k + 1] = ny;
          this.rainPos[k + 4] = ny - 0.7;
          // У земли — перерождение сверху
          if (ny < (world.heightAt(Math.floor(this.rainPos[k]), Math.floor(this.rainPos[k + 2])) || 0) - 0.5) {
            this._respawnDrop(i, playerPos, world);
          }
        }
        this.rainPosAttr.needsUpdate = true;
      } else {
        for (let i = 0; i < this.snowCount; i++) {
          const k = i * 3;
          this.snowPhase[i] += dt;
          const ny = this.snowPos[k + 1] - this.snowVel[i] * dt;
          this.snowPos[k + 1] = ny;
          this.snowPos[k] += Math.sin(this.snowPhase[i]) * dt * 0.7;
          if (ny < (world.heightAt(Math.floor(this.snowPos[k]), Math.floor(this.snowPos[k + 2])) || 0) - 0.5) {
            this._respawnFlake(i, playerPos, world);
          }
        }
        this.snowPosAttr.needsUpdate = true;
      }
    }

    // Молния освещает только ближайшую область; глобальный множитель экрана не меняется.
    return 0;
  }

  // Над заснеженными горами осадки — снег
  _localSnow(p, world) {
    const h = world.heightAt(Math.floor(p.x), Math.floor(p.z));
    return h > 34;
  }

  // Прозрачность для звука дождя
  get wetness() { return this.intensity * (this.state === 'rain' ? 1 : 0); }
}
