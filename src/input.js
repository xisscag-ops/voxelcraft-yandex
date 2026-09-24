// Ввод: клавиатура/мышь (Pointer Lock) + сенсорное управление
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this.move = { forward: 0, right: 0 };       // -1..1
    this.jump = false;
    this.sneak = false;
    this.sprint = false;
    this.locked = false;
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.handlers = {
      onToggleFly: null, onDigit: null, onScroll: null, onPause: null,
      onActionBreak: null, onActionPlace: null,
    };
    this._flyTapT = 0;
    this._swallowLook = 0;
    this._joystick = { active: false, id: -1, baseX: 0, baseY: 0, x: 0, y: 0 };
    this._look = { id: -1, lastX: 0, lastY: 0, moved: 0, startTime: 0 };
    this._buttons = new Set();
    this._bind();
  }

  requestLock(el) {
    if (this.isTouch) return;
    el.requestPointerLock?.();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape') this.handlers.onPause?.();
      if (e.code === 'KeyF') this.handlers.onToggleFly?.();
      if (e.code === 'F1') e.preventDefault();
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) this.handlers.onDigit?.(n - 1);
      }
      if (e.code === 'Space') {
        // двойное нажатие пробела — полёт
        const now = performance.now();
        if (now - this._flyTapT < 280) this.handlers.onToggleFly?.();
        this._flyTapT = now;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement != null;
      if (this.locked && !was) {
        // Сбрасываем «скачок» первого движения после захвата мыши
        this.mouse.dx = 0; this.mouse.dy = 0;
        this._swallowLook = 2;
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this._swallowLook > 0) { this._swallowLook--; return; }
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.handlers.onScroll?.(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    if (this.isTouch) this._bindTouch();
    this._bindButtons();
  }

  _bindTouch() {
    const joyEl = document.getElementById('joystick');
    const knob = document.getElementById('joy-knob');
    const lookZone = document.getElementById('look-zone');

    const joyRect = () => joyEl.getBoundingClientRect();

    const onTouchStart = (e) => {
      for (const t of e.changedTouches) {
        const jr = joyRect();
        const inJoy = t.clientX >= jr.left - 20 && t.clientX <= jr.right + 20 &&
          t.clientY >= jr.top - 20 && t.clientY <= jr.bottom + 20;
        if (inJoy && this._joystick.id === -1) {
          this._joystick.active = true;
          this._joystick.id = t.identifier;
          this._joystick.baseX = t.clientX;
          this._joystick.baseY = t.clientY;
          this._joystick.x = 0; this._joystick.y = 0;
        } else if (t.clientX < window.innerWidth * 0.5) {
          // Левая половина вне джойстика — тоже джойстик (свободное место)
          if (this._joystick.id === -1) {
            this._joystick.active = true;
            this._joystick.id = t.identifier;
            this._joystick.baseX = t.clientX;
            this._joystick.baseY = t.clientY;
            joyEl.style.left = t.clientX + 'px';
            joyEl.style.top = t.clientY + 'px';
          }
        } else if (this._look.id === -1) {
          this._look.id = t.identifier;
          this._look.lastX = t.clientX;
          this._look.lastY = t.clientY;
          this._look.moved = 0;
          this._look.startTime = performance.now();
        }
      }
    };

    const onTouchMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystick.id) {
          const dx = t.clientX - this._joystick.baseX;
          const dy = t.clientY - this._joystick.baseY;
          const max = 52;
          const len = Math.hypot(dx, dy) || 1;
          const cl = Math.min(1, len / max);
          this._joystick.x = (dx / len) * cl;
          this._joystick.y = (dy / len) * cl;
          if (knob) knob.style.transform = `translate(${(dx / len) * cl * max}px, ${(dy / len) * cl * max}px)`;
        } else if (t.identifier === this._look.id) {
          const dx = t.clientX - this._look.lastX;
          const dy = t.clientY - this._look.lastY;
          this._look.lastX = t.clientX;
          this._look.lastY = t.clientY;
          this._look.moved += Math.abs(dx) + Math.abs(dy);
          this.mouse.dx += dx * 1.5;
          this.mouse.dy += dy * 1.5;
        }
      }
      e.preventDefault();
    };

    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joystick.id) {
          this._joystick.active = false;
          this._joystick.id = -1;
          this._joystick.x = 0; this._joystick.y = 0;
          if (knob) knob.style.transform = 'translate(0,0)';
          joyEl.style.left = '';
          joyEl.style.top = '';
        } else if (t.identifier === this._look.id) {
          // Короткий тап по экрану — сломать блок
          if (this._look.moved < 14 && performance.now() - this._look.startTime < 260) {
            this.handlers.onActionBreak?.();
          }
          this._look.id = -1;
        }
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);
  }

  _bindButtons() {
    const map = [
      ['btn-jump', 'jump'],
      ['btn-sneak', 'sneak'],
      ['btn-place', 'place'],
      ['btn-fly', 'fly'],
      ['btn-break', 'break'],
    ];
    for (const [id, action] of map) {
      const el = document.getElementById(id);
      if (!el) continue;
      const down = (e) => {
        e.preventDefault();
        this._buttons.add(action);
        if (action === 'fly') this.handlers.onToggleFly?.();
        if (action === 'place') this.handlers.onActionPlace?.();
        // «break» — удерживаемое действие: работает через breakHeld (как ЛКМ),
        // поэтому по нажатию ничего не делаем
      };
      const up = (e) => { e.preventDefault(); this._buttons.delete(action); };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      // Чтобы работало и мышью в десктопной эмуляции
      el.addEventListener('mousedown', down);
      el.addEventListener('mouseup', up);
    }
  }

  setJoystickVisible(v) {
    document.getElementById('touch-controls')?.classList.toggle('hidden', !v);
  }

  update() {
    // Клавиатура
    let f = 0, r = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    // Джойстик
    f += -this._joystick.y;
    r += this._joystick.x;
    this.move.forward = Math.max(-1, Math.min(1, f));
    this.move.right = Math.max(-1, Math.min(1, r));

    this.jump = this.keys.has('Space') || this._buttons.has('jump');
    this.sneak = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this._buttons.has('sneak');
    this.sprint = this.keys.has('ControlLeft') || this.keys.has('ControlRight') ||
      (this.isTouch && this._joystick.active && Math.hypot(this._joystick.x, this._joystick.y) > 0.92);
    this.breakHeld = this.mouse.left || this._buttons.has('break');
    this.placeHeld = this.mouse.right;
  }

  consumeLook() {
    const dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = 0; this.mouse.dy = 0;
    return { dx, dy };
  }
}
