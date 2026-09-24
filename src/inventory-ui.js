// Окно инвентаря: сетка 27+9 ячеек, предмет «в руке» за курсором,
// каталог блоков (креатив) и список рецептов (выживание)
import { HOTBAR_SIZE } from './inventory.js';
import { itemIconEl } from './icons.js';
import { itemDef, itemName, maxStack } from './items.js';
import { RECIPES, canCraft, ingredients } from './crafts.js';

export class InventoryUI {
  constructor(i18n) {
    this.i18n = i18n;
    this.inv = null;
    this.mode = 'survival';
    this.creative = false;
    this.hotbarIndex = 0;
    this.catalog = [];        // [{ key, locked }]
    this.carry = null;        // { key, count } — стопка «в руке»
    this.open_ = false;
    this.handlers = {
      onChange: null, onCraft: null, onPickCatalog: null,
      onLocked: null, onClose: null, onSelect: null, onSound: null,
    };
    this._els = {
      screen: document.getElementById('inventory-screen'),
      grid: document.getElementById('inv-main-grid'),
      hotbar: document.getElementById('inv-hotbar-row'),
      sideTitle: document.getElementById('inv-side-title'),
      sideList: document.getElementById('inv-side-list'),
      modeLabel: document.getElementById('inv-mode-label'),
      tip: document.getElementById('inv-tip'),
      cursor: document.getElementById('cursor-item'),
    };
    this._bind();
  }

  _bind() {
    document.getElementById('btn-inv-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onClose?.();
    });
    // Клик по фону окна — вернуть стопку из «руки» в инвентарь
    this._els.screen?.addEventListener('pointerdown', (e) => {
      if (e.target === this._els.screen) this.stashCarry();
    });
    const move = (e) => this._moveCursor(e.clientX, e.clientY);
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', (e) => {
      const t = e.touches?.[0];
      if (t && this.open_) this._moveCursor(t.clientX, t.clientY);
    }, { passive: true });
  }

  isOpen() { return this.open_; }

  /** Открыть окно; mode — 'survival' | 'creative' */
  show({ inv, mode, hotbarIndex, catalog }) {
    this.inv = inv;
    this.mode = mode;
    this.creative = mode === 'creative';
    this.hotbarIndex = hotbarIndex || 0;
    this.catalog = catalog || [];
    this.open_ = true;
    this.carry = null;
    this._els.screen?.classList.remove('hidden');
    this.render();
    this._moveCursor(this._lastX ?? window.innerWidth / 2, this._lastY ?? window.innerHeight / 2);
  }

  hide() {
    this.stashCarry();
    this.open_ = false;
    this._els.screen?.classList.add('hidden');
    this._els.cursor?.classList.add('hidden');
  }

  /** Вернуть стопку из «руки» в инвентарь */
  stashCarry() {
    if (!this.carry || !this.inv) { this.carry = null; this._renderCursor(); return; }
    const left = this.inv.add(this.carry.key, this.carry.count);
    if (left > 0) {
      // места нет — оставляем в руке, чтобы игрок разложил сам
      this.carry.count = left;
    } else {
      this.carry = null;
    }
    this._renderCursor();
    this.render();
    this.handlers.onChange?.();
  }

  // ---------------------------------------------------------------- Отрисовка
  render() {
    if (!this.inv) return;
    const els = this._els;
    if (els.modeLabel) {
      els.modeLabel.textContent = this.i18n.t(this.creative ? 'mode_creative' : 'mode_survival');
    }
    if (els.tip) {
      els.tip.textContent = this.creative
        ? this.i18n.t('catalog_hint')
        : this.i18n.t('inv_hint');
    }
    // Основная сетка — 27 ячеек (слоты 9..35), затем хотбар 9 ячеек
    this._renderGrid(els.grid, 9, 36);
    this._renderGrid(els.hotbar, 0, 9);
    this._renderSide();
    this._renderCursor();
  }

  _renderGrid(container, from, to) {
    if (!container) return;
    container.innerHTML = '';
    for (let i = from; i < to; i++) {
      const slot = document.createElement('div');
      slot.className = 'islot';
      slot.dataset.index = String(i);
      if (i < HOTBAR_SIZE && i === this.hotbarIndex) slot.classList.add('selected');
      const stack = this.inv.get(i);
      if (stack) {
        const icon = itemIconEl(stack.key, 40);
        if (icon) slot.appendChild(icon);
        const def = itemDef(stack.key);
        const infinite = this.creative && def?.kind === 'block';
        if (infinite || stack.count > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'islot-count';
          cnt.textContent = infinite ? '∞' : String(stack.count);
          slot.appendChild(cnt);
        }
      }
      slot.addEventListener('pointerdown', (e) => this._onSlotDown(e, i));
      slot.addEventListener('contextmenu', (e) => e.preventDefault());
      container.appendChild(slot);
    }
  }

  _renderSide() {
    const els = this._els;
    if (!els.sideList) return;
    els.sideList.innerHTML = '';
    if (this.creative) {
      if (els.sideTitle) els.sideTitle.textContent = this.i18n.t('catalog_title');
      els.sideList.className = 'inv-side-list catalog';
      for (const entry of this.catalog) {
        const cell = document.createElement('div');
        cell.className = 'cat-item' + (entry.locked ? ' locked' : '');
        cell.title = itemName(entry.key, this.i18n.lang);
        const icon = itemIconEl(entry.key, 40);
        if (icon) cell.appendChild(icon);
        if (entry.locked) {
          const lock = document.createElement('span');
          lock.className = 'cat-lock';
          lock.textContent = '🔒';
          cell.appendChild(lock);
        }
        cell.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (entry.locked) this.handlers.onLocked?.(entry.key);
          else this.handlers.onPickCatalog?.(entry.key);
        });
        els.sideList.appendChild(cell);
      }
    } else {
      if (els.sideTitle) els.sideTitle.textContent = this.i18n.t('craft_title');
      els.sideList.className = 'inv-side-list recipes';
      for (const recipe of RECIPES) {
        const ok = canCraft(this.inv, recipe);
        const row = document.createElement('div');
        row.className = 'recipe' + (ok ? ' ok' : '');
        row.dataset.id = recipe.id;
        const icon = itemIconEl(recipe.out.key, 36);
        if (icon) row.appendChild(icon);
        const info = document.createElement('div');
        info.className = 'recipe-info';
        const name = document.createElement('div');
        name.className = 'recipe-name';
        name.textContent = `${itemName(recipe.out.key, this.i18n.lang)} ×${recipe.out.count}`;
        const ing = document.createElement('div');
        ing.className = 'recipe-ing';
        ing.textContent = ingredients(this.inv, recipe)
          .map((x) => `${itemName(x.key, this.i18n.lang)} ${x.have}/${x.need}`)
          .join(' · ');
        info.append(name, ing);
        row.appendChild(info);
        row.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.handlers.onCraft?.(recipe);
        });
        els.sideList.appendChild(row);
      }
    }
  }

  _renderCursor() {
    const cur = this._els.cursor;
    if (!cur) return;
    if (!this.carry) {
      cur.classList.add('hidden');
      cur.innerHTML = '';
      return;
    }
    cur.classList.remove('hidden');
    cur.innerHTML = '';
    const icon = itemIconEl(this.carry.key, 40);
    if (icon) cur.appendChild(icon);
    const cnt = document.createElement('span');
    cnt.className = 'islot-count';
    cnt.textContent = String(this.carry.count);
    cur.appendChild(cnt);
  }

  _moveCursor(x, y) {
    this._lastX = x;
    this._lastY = y;
    const cur = this._els.cursor;
    if (!cur || cur.classList.contains('hidden')) return;
    cur.style.left = x + 'px';
    cur.style.top = y + 'px';
  }

  // ---------------------------------------------------------------- Клики по ячейкам
  _onSlotDown(e, i) {
    e.preventDefault();
    e.stopPropagation();
    if (!this.inv) return;
    // Клик по хотбару с пустой рукой — ещё и выбор активного слота
    if (i < HOTBAR_SIZE && e.button === 0 && !this.carry) {
      this.hotbarIndex = i;
      this.handlers.onSelect?.(i);
    }
    if (e.button === 2) this._rightClick(i);
    else this._leftClick(i);
    this.render();
    this.handlers.onChange?.();
  }

  _leftClick(i) {
    const cur = this.inv.get(i);
    if (!this.carry) {
      if (!cur) return;
      this.carry = { key: cur.key, count: cur.count };
      this.inv.clearSlot(i);
      this.handlers.onSound?.('pickup');
      return;
    }
    if (!cur) {
      this.inv.setStack(i, this.carry);
      this.carry = null;
      this.handlers.onSound?.('place');
      return;
    }
    if (cur.key === this.carry.key && cur.count < maxStack(cur.key)) {
      // докладываем в стопку
      const room = maxStack(cur.key) - cur.count;
      const take = Math.min(room, this.carry.count);
      cur.count += take;
      this.carry.count -= take;
      if (this.carry.count <= 0) this.carry = null;
      this.handlers.onSound?.('place');
      return;
    }
    // обмен стопками
    const tmp = { key: cur.key, count: cur.count };
    this.inv.setStack(i, this.carry);
    this.carry = tmp;
    this.handlers.onSound?.('click');
  }

  _rightClick(i) {
    const cur = this.inv.get(i);
    if (!this.carry) {
      if (!cur) return;
      const half = Math.ceil(cur.count / 2);
      this.carry = { key: cur.key, count: half };
      cur.count -= half;
      if (cur.count <= 0) this.inv.clearSlot(i);
      this.handlers.onSound?.('pickup');
      return;
    }
    // кладём по одному
    if (!cur) {
      this.inv.setStack(i, { key: this.carry.key, count: 1 });
      this.carry.count -= 1;
    } else if (cur.key === this.carry.key && cur.count < maxStack(cur.key)) {
      cur.count += 1;
      this.carry.count -= 1;
    } else {
      return;
    }
    if (this.carry.count <= 0) this.carry = null;
    this.handlers.onSound?.('place');
  }
}
