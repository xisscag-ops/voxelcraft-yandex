// Ввод: клавиатура/мышь (Pointer Lock) + сенсорное управление
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // одиночные нажатия (съедаются в игровом кадре)
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this.move = { forward: 0, right: 0 };       // -1..1
    this.jump = false;
    this.sneak = false;
    this.sprint = false;
    this.locked = false;
    this.enabled = false;       // ввод обрабатывается только в состоянии игры
    this.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.handlers = {
      onToggleFly: null, onDigit: null, onScroll: null, onPause: null,
      onActionBreak: null, onActionPlace: null, onToggleInventory: null,
      onFullscreenChange: null,
    };
    this.allowFullscreen = true;   // настройка «Полный экран» (settings.fullscreen)
    this.keysLocked = false;
    this._flyTapT = 0;
    this._swallowLook = 0;
    this._joystick = { active: false, id: -1, baseX: 0, baseY: 0, x: 0, y: 0 };
    this._look = { id: -1, lastX: 0, lastY: 0, moved: 0, startTime: 0 };
    this._buttons = new Set();
    this._bind();
  }

  requestLock(el) {
    if (this.isTouch) return;
    try {
      const p = el.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* браузер может отклонить запрос — игрок просто кликнет ещё раз */ }
  }

  // Защита от браузерных сочетаний клавиш, зума, прокрутки, выделения и жестов,
  // чтобы игра занимала весь экран и страница никуда не сдвигалась
  _bindGuards() {
    const BLOCK_KEYS = new Set([
      'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
      'Home', 'End', 'Backspace', 'AltLeft', 'AltRight', 'ContextMenu', 'MetaLeft', 'MetaRight',
      'F1', 'F3', 'F5', 'F6', 'F7', 'BrowserBack', 'BrowserForward', 'BrowserRefresh', 'BrowserSearch',
      'Slash', 'Quote',
    ]);
    const guardKey = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Ctrl/Cmd/Alt + что угодно (зум, сохранение, печать, поиск, закладки и т.п.)
      if (e.ctrlKey || e.metaKey || e.altKey || BLOCK_KEYS.has(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', guardKey, { capture: true });
    window.addEventListener('keyup', guardKey, { capture: true });
    // Зум колесом с Ctrl и тачпадом (pinch)
    window.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey || this.locked) e.preventDefault(); },
      { passive: false, capture: true });
    // Жесты Safari
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    }
    // Двойной тап-зум, выделение, перетаскивание, контекстное меню
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('selectstart', (e) => e.preventDefault());
    document.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    // Средняя кнопка мыши — автопрокрутка; боковые — «назад/вперёд»
    window.addEventListener('mousedown', (e) => { if (e.button !== 0 && e.button !== 2) e.preventDefault(); });
    window.addEventListener('auxclick', (e) => e.preventDefault());
    window.addEventListener('mouseup', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); });
    // Страница не должна прокручиваться ни при каких условиях
    const pin = () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); };
    window.addEventListener('scroll', pin, { passive: true });
    window.addEventListener('resize', pin);
  }

  // Полноэкранный режим + захват клавиш.
  // Через Keyboard Lock API (Chrome/Edge) забираем себе игровые клавиши целиком,
  // включая модификаторы: тогда Ctrl+W, Ctrl+S, Ctrl+T и прочие сочетания не уходят
  // браузеру, а Esc не выкидывает из полного экрана — он открывает меню паузы.
  // Вне полного экрана (а также в iframe Яндекс Игр) API недоступно: там Ctrl+W
  // остаётся системным сочетанием браузера, и предотвратить его нельзя.
  async enterFullscreen() {
    if (this.allowFullscreen === false) { await this.lockKeys(); return; }
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (e) { /* iframe без allowfullscreen — не критично */ }
    await this.lockKeys();
  }

  /** Захват клавиш доступен только в полном экране и только в Chromium-браузерах */
  async lockKeys() {
    if (!document.fullscreenElement || !navigator.keyboard?.lock) return false;
    try {
      await navigator.keyboard.lock([
        'Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyI', 'KeyN', 'KeyT', 'KeyQ',
        'Tab', 'AltLeft', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight', 'F3',
      ]);
      this.keysLocked = true;
    } catch (e) {
      this.keysLocked = false;   // Safari/Firefox/iframe — Esc останется за браузером
    }
    return this.keysLocked;
  }

  unlockKeys() {
    try { if (this.keysLocked) navigator.keyboard?.unlock?.(); } catch (e) { /* noop */ }
    this.keysLocked = false;
  }

  exitFullscreen() {
    this.unlockKeys();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* noop */ }
  }

  _bind() {
    this._bindGuards();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Escape') this.handlers.onPause?.();
      if (e.code === 'KeyE') this.handlers.onToggleInventory?.();
      if (e.code === 'KeyI') this.handlers.onToggleInventory?.();
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

    // Полный экран: пока мы в нём, игровые клавиши (в том числе Esc) захвачены
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      if (on) this.lockKeys();
      else this.unlockKeys();
      this.handlers.onFullscreenChange?.(on);
    });

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

    if (this.isTouch) this._bindTouch();
    this._bindButtons();
  }

  _bindTouch() {
    const joyEl = document.getElementById('joystick');
    const knob = document.getElementById('joy-knob');
    const lookZone = document.getElementById('look-zone');

    const joyRect = () => joyEl.getBoundingClientRect();

    const onTouchStart = (e) => {
      if (!this.enabled) return;   // окно инвентаря/меню: жесты не перехватываем
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
      if (!this.enabled) return;
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
      if (!this.enabled) return;
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
        if (action === 'break') this.handlers.onActionBreak?.();
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

  /** Нажатие, которое нужно обработать ровно один раз */
  consumePress(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  clearPresses() { this.pressed.clear(); }

  consumeLook() {
    const dx = this.mouse.dx, dy = this.mouse.dy;
    this.mouse.dx = 0; this.mouse.dy = 0;
    return { dx, dy };
  }
}
