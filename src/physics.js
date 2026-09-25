// Физика игрока: AABB против вокселей, ходьба, прыжки, плавание, полёт
import { CONFIG } from './config.js';
import { isSolid, isLiquid, isSlab } from './blocks.js';

const HW = CONFIG.PLAYER_WIDTH / 2;
const PH = CONFIG.PLAYER_HEIGHT;
const EPS = 0.001;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = { x: 0.5, y: 40, z: 0.5 };   // центр подошвы
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.headInWater = false;
    this.sprinting = false;
    this.moving = false;
    this._stepAcc = 0;
    this.events = { onStep: null, onJump: null, onLand: null, onSplash: null };
    this._wasFlying = false;
    // Здоровье и урон от падений
    this.hp = 20; this.maxHp = 20;
    this.hurtT = 0; this.regenT = 0; this._fallFrom = null;
    // Режим игры: в креативе игрок бессмертен и умеет летать
    this.invulnerable = false;
    this.canFly = true;
  }

  lookDir() {
    const cp = Math.cos(this.pitch);
    return {
      x: -Math.sin(this.yaw) * cp,
      y: Math.sin(this.pitch),
      z: -Math.cos(this.yaw) * cp,
    };
  }

  eyePos() {
    return { x: this.pos.x, y: this.pos.y + CONFIG.PLAYER_EYE, z: this.pos.z };
  }

  /** Урон с неуязвимостью 0.7 с. true — если урон прошёл */
  hurt(n) {
    if (this.invulnerable) return false;
    if (this.hurtT > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - n);
    this.hurtT = 0.7;
    this.regenT = 0;
    if (this.events.onHurt) this.events.onHurt(n);
    if (this.hp <= 0 && this.events.onDeath) this.events.onDeath();
    return true;
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.events.onHeal) this.events.onHeal(n);
  }

  // Пересечение AABB с блоками (полублок — только нижние 0.5)
  collides(px, py, pz) {
    const x0 = Math.floor(px - HW), x1 = Math.floor(px + HW - EPS);
    const y0 = Math.floor(py), y1 = Math.floor(py + PH - EPS);
    const z0 = Math.floor(pz - HW), z1 = Math.floor(pz + HW - EPS);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const id = this.world.getBlock(x, y, z);
          if (!isSolid(id)) continue;
          if (isSlab(id)) {
            const top = y + 0.5;
            // игрок стоит ровно на верхней грани полублока — касание, не пересечение
            if (py >= top - 1e-6) continue;
            // игрок полностью под полублоком? полублок висит у потолка — тогда пересекается только если его низ перекрывается
            if (py + PH <= y + 1e-6) continue;
            // уже проверили что по Y есть перекрытие [y, top) vs [py, py+PH)
            if (py >= top || py + PH <= y) continue;
            return true;
          }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * @param {object} input { forward, right, jump, sneak, sprint }
   * @param {number} dt секунды
   */
  update(input, dt) {
    const w = this.world;
    // Регенерация и отслеживание падения
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp > 0 && this.hp < this.maxHp && this.hurtT <= 0) {
      this.regenT += dt;
      if (this.regenT > 8) { this.regenT = 0; this.hp = Math.min(this.maxHp, this.hp + 1); }
    } else if (this.hurtT > 0) {
      this.regenT = 0;
    }
    if (!this.onGround && !this.flying && this.vel.y < 0) {
      this._fallFrom = Math.max(this._fallFrom ?? this.pos.y, this.pos.y);
    } else if (this.onGround || this.flying) {
      this._fallFrom = null;
    }
    // Вода?
    const feet = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    const head = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + CONFIG.PLAYER_EYE), Math.floor(this.pos.z));
    const wasWater = this.inWater;
    this.inWater = isLiquid(feet);
    this.headInWater = isLiquid(head);
    if (this.inWater && !wasWater && this.vel.y < -4 && this.events.onSplash) this.events.onSplash();

    // Направление взгляда по горизонту
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let fx = -sin, fz = -cos;
    let rx = cos, rz = -sin;
    let mx = fx * input.forward + rx * input.right;
    let mz = fz * input.forward + rz * input.right;
    const mlen = Math.hypot(mx, mz);
    this.moving = mlen > 0.05;
    if (mlen > 0) { mx /= mlen; mz /= mlen; }

    if (this.flying) {
      const sp = CONFIG.FLY_SPEED * (input.sprint ? 1.8 : 1);
      const vy = (input.jump ? sp : 0) - (input.sneak ? sp : 0);
      this.vel.x = mx * sp;
      this.vel.z = mz * sp;
      this.vel.y = vy;
      this._move(dt);
      this.onGround = false;
    } else if (this.inWater) {
      const sp = CONFIG.SWIM_SPEED;
      this.vel.x = mx * sp;
      this.vel.z = mz * sp;
      this.vel.y -= CONFIG.GRAVITY * 0.25 * dt;
      if (input.jump) this.vel.y = Math.min(this.vel.y + CONFIG.GRAVITY * dt, 3.5);
      this.vel.y = Math.max(-4, Math.min(4, this.vel.y));
      this._move(dt);
    } else {
      const sp = input.sprint ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED;
      const accel = this.onGround ? 12 : 4;
      const targetX = mx * sp, targetZ = mz * sp;
      this.vel.x += (targetX - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (targetZ - this.vel.z) * Math.min(1, accel * dt);
      this.vel.y -= CONFIG.GRAVITY * dt;
      if (input.jump && this.onGround) {
        this.vel.y = CONFIG.JUMP_SPEED;
        this.onGround = false;
        if (this.events.onJump) this.events.onJump();
      }
      const wasGround = this.onGround;
      this._move(dt);
      if (!wasGround && this.onGround) {
        if (this.events.onLand) this.events.onLand();
        const fall = (this._fallFrom ?? this.pos.y) - this.pos.y;
        this._fallFrom = null;
        if (fall > 3.2 && this.hp > 0) this.hurt(Math.min(8, Math.floor(fall - 3)));
      }
    }

    // Шаги
    if (this.onGround && this.moving) {
      this._stepAcc += dt * (this.sprinting ? 1.5 : 1);
      if (this._stepAcc > 0.42) {
        this._stepAcc = 0;
        if (this.events.onStep) this.events.onStep(this.inWater);
      }
    }

    // Не даём упасть под мир
    if (this.pos.y < -8) {
      this.pos.y = H_SAFE();
      this.vel.y = 0;
    }

    if (this.flying) this._wasFlying = true;
  }

  // есть ли перед игроком только полублок на уровне ног (на который можно зашагнуть)
  _slabStepTop(px, py, pz) {
    const x0 = Math.floor(px - HW), x1 = Math.floor(px + HW - EPS);
    const y0 = Math.floor(py), y1 = Math.floor(py + PH - EPS);
    const z0 = Math.floor(pz - HW), z1 = Math.floor(pz + HW - EPS);
    let slabTop = null;
    let hasFullBlocker = false;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const id = this.world.getBlock(x, y, z);
          if (!isSolid(id)) continue;
          if (isSlab(id)) {
            const top = y + 0.5;
            if (py >= top - 1e-6) continue;
            if (py + PH <= y + 1e-6) continue;
            if (py >= top || py + PH <= y) continue;
            slabTop = Math.max(slabTop ?? -Infinity, top);
          } else {
            hasFullBlocker = true;
          }
        }
      }
    }
    if (hasFullBlocker) return null;
    return slabTop;
  }

  _move(dt) {
    const step = (axis, amount) => {
      if (!amount) return;
      const p = { ...this.pos };
      p[axis] += amount;
      if (!this.collides(p.x, p.y, p.z)) {
        this.pos[axis] = p[axis];
        return;
      }
      // автошаг на полублок: если впереди только полублок, поднимемся на него
      if ((axis === 'x' || axis === 'z') && !this.flying && !this.inWater) {
        const top = this._slabStepTop(p.x, p.y, p.z);
        if (top !== null) {
          const liftedY = top + 0.001;
          // потолок над полублоком свободен?
          if (!this.collides(p.x, liftedY, p.z) && !this.collides(this.pos.x, liftedY, this.pos.z)) {
            this.pos.y = liftedY;
            // пробуем снова горизонтальный шаг с новой высоты
            if (!this.collides(p.x, this.pos.y, p.z)) {
              this.pos[axis] = p[axis];
              return;
            }
            // откат если всё равно упираемся (узкий потолок)
            // оставляем y как есть, дальше упремся
          }
        }
      }
      // Шаг по чуть-чуть (тонкого туннеля не будет: скорость*dt < размера блока)
      const dir = Math.sign(amount);
      const rem = Math.abs(amount);
      const stepSize = 0.05;
      let moved = 0;
      while (moved + stepSize <= rem) {
        moved += stepSize;
        const q = { ...this.pos };
        q[axis] += dir * moved;
        if (this.collides(q.x, q.y, q.z)) break;
        this.pos[axis] = q[axis];
      }
      // Упираемся
      this.vel[axis] = 0;
      if (axis === 'y' && dir < 0) this.onGround = true;
    };

    this.onGround = false;

    step('x', this.vel.x * dt);
    step('z', this.vel.z * dt);
    step('y', this.vel.y * dt);
    if (this.vel.y === 0 && this.onGround) {
      // прилипание к земле (учёт полублока)
      const q = { ...this.pos }; q.y -= 0.05;
      if (!this.collides(q.x, q.y, q.z)) this.onGround = false;
    }
  }

  toggleFly() {
    if (!this.canFly) { this.flying = false; return false; }
    this.flying = !this.flying;
    if (this.flying) this.vel.y = 0;
    return this.flying;
  }

  /** Сброс полёта (например, при выходе из креатива) */
  stopFly() {
    this.flying = false;
  }

  serialize() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch, flying: this.flying, hp: this.hp,
    };
  }

  deserialize(d) {
    this.pos.x = d.x; this.pos.y = d.y; this.pos.z = d.z;
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.hp = d.hp != null ? d.hp : 20;
    if (this.hp <= 0) this.hp = this.maxHp;
    this.flying = !!d.flying;
    this.vel = { x: 0, y: 0, z: 0 };
  }
}

function H_SAFE() {
  return CONFIG.WORLD_HEIGHT - 10;
}
