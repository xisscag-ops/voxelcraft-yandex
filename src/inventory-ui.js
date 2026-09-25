// Окно инвентаря: сетка 27+9 ячеек, сетка крафта (2×2 / 3×3 на верстаке),
// предмет «в руке» за курсором, каталог блоков (креатив) и список рецептов
import { HOTBAR_SIZE } from './inventory.js';
import { itemIconEl } from './icons.js';
import { itemDef, itemName, itemDescription, maxStack } from './items.js';
import { canCraft, ingredients, emptyGrid, gridResult, craftFromGrid, needsTable,
  recipesFor, stationAllows, stationInfo } from './crafts.js';
import { SMELT_TIME, smeltResult } from './furnace.js';

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
    this.tab = 'craft';       // 'craft' | 'catalog'
    this.gridSize = 2;        // 2 — инвентарь, 3 — верстак
    this.grid = emptyGrid(2);
    this.station = null;      // { type: 'furnace', machine } | { type: 'chest', inv }
    this._furnaceSignature = '';
    this._paint = null;       // мазок зажатой кнопкой по клеткам (как в Minecraft)
    this._drag = null;        // настоящее перетаскивание стопки из ячейки в ячейку
    this.handlers = {
      onChange: null, onCraft: null, onPickCatalog: null, onLocked: null,
      onClose: null, onSelect: null, onSound: null, onQuickCraft: null,
      onStationChange: null,
    };
    this._els = {
      screen: document.getElementById('inventory-screen'),
      window: document.querySelector('#inventory-screen .inv-window'),
      side: document.querySelector('#inventory-screen .inv-side'),
      grid: document.getElementById('inv-main-grid'),
      hotbar: document.getElementById('inv-hotbar-row'),
      craftRow: document.getElementById('inv-craft-row'),
      craftGrid: document.getElementById('inv-craft-grid'),
      craftResult: document.getElementById('inv-craft-result'),
      craftTitle: document.getElementById('inv-craft-title'),
      sideTitle: document.getElementById('inv-side-title'),
      sideList: document.getElementById('inv-side-list'),
      modeLabel: document.getElementById('inv-mode-label'),
      tip: document.getElementById('inv-tip'),
      cursor: document.getElementById('cursor-item'),
      tabs: document.getElementById('inv-tabs'),
      furnacePanel: document.getElementById('inv-furnace-panel'),
      chestPanel: document.getElementById('inv-chest-panel'),
      chestGrid: document.getElementById('inv-chest-grid'),
      furnaceStatus: document.getElementById('furnace-status'),
      furnaceBurn: document.getElementById('furnace-burn-fill'),
      furnaceProgress: document.getElementById('furnace-progress-fill'),
      furnaceSlots: {
        input: document.getElementById('furnace-input-slot'),
        fuel: document.getElementById('furnace-fuel-slot'),
        output: document.getElementById('furnace-output-slot'),
      },
    };
    this._bind();
  }

  _bind() {
    document.getElementById('btn-inv-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onClose?.();
    });
    // Клик по фону — вернуть стопку из «руки» в инвентарь
    this._els.screen?.addEventListener('pointerdown', (e) => {
      if (e.target === this._els.screen) this.stashCarry();
    });
    for (const btn of this._els.tabs?.querySelectorAll('.inv-tab') || []) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._setTab(btn.dataset.tab);
      });
    }
    const move = (e) => this._moveCursor(e.clientX, e.clientY);
    document.addEventListener('mousemove', move);

    // Протаскивание с зажатой кнопкой: раскладываем предметы по клеткам крафта
    document.addEventListener('pointermove', (e) => this._onPaintMove(e));
    // touchend не знает clientX/Y — подставляем координаты последнего касания
    const endPaint = (e) => {
      this._paint = null;
      const t = e.changedTouches?.[0];
      this._endDrag(t ? { clientX: t.clientX, clientY: t.clientY, button: 0 } : e);
    };
    document.addEventListener('mouseup', endPaint);
    document.addEventListener('pointerup', endPaint);
    document.addEventListener('touchend', endPaint);
    window.addEventListener('blur', endPaint);
    document.addEventListener('touchmove', (e) => {
      const t = e.touches?.[0];
      if (t && this.open_) {
        this._moveCursor(t.clientX, t.clientY);
        // На телефоне протяжка приходит как touchmove — раскладываем предметы и оттуда
        const p = this._paint;
        if (p && this.carry) {
          this._onPaintMove({ clientX: t.clientX, clientY: t.clientY, pointerType: 'touch', buttons: 1 });
        }
      }
    }, { passive: true });
  }

  isOpen() { return this.open_; }

  /**
   * «Станок» для рецептов: верстак (3×3) или наковальня. Печь и сундук крафта
   * не дают, поэтому для них возвращается null (сетка 2×2 как в инвентаре).
   */
  craftStation() {
    const st = this.station;
    if (!st) return null;
    if (st.type === 'table' || st.type === 'anvil') return st;
    return null;
  }

  /** Открыть окно; mode — 'survival' | 'creative', gridSize — 2 (инвентарь) или 3 (верстак) */
  show({ inv, mode, hotbarIndex, catalog, gridSize = 2, tab = null, station = null }) {
    this.inv = inv;
    this.mode = mode;
    this.creative = mode === 'creative';
    this.hotbarIndex = hotbarIndex || 0;
    this.catalog = catalog || [];
    this.station = station;
    this._furnaceSignature = '';
    this.open_ = true;
    this.carry = null;
    this._drag = null;
    this._paint = null;
    this.setGridSize(gridSize, true);
    this._updateCraftTitle();
    // В креативе слева по умолчанию каталог, в выживании — рецепты
    this.tab = tab || (this.creative ? (this._userTab || 'catalog') : 'craft');
    this._els.screen?.classList.remove('hidden');
    this.render();
    this._moveCursor(this._lastX ?? window.innerWidth / 2, this._lastY ?? window.innerHeight / 2);
  }

  hide() {
    this.stashCarry();
    this.dumpGrid();
    this.open_ = false;
    this.station = null;
    this._drag = null;
    this._paint = null;
    this._furnaceSignature = '';
    this._els.screen?.classList.add('hidden');
    this._els.cursor?.classList.add('hidden');
  }

  /** Сменить размер сетки крафта; содержимое возвращается в инвентарь */
  setGridSize(size, dump = true) {
    // размер не менялся — сетку не трогаем (в ней могут остаться предметы)
    if (size === this.gridSize && this.grid.length === size * size) return;
    if (dump) this.dumpGrid();
    this.gridSize = size;
    this.grid = emptyGrid(size);
    this._updateCraftTitle();
  }

  /** Подпись над сеткой крафта: «Верстак» / «Наковальня» / «Крафт» */
  _updateCraftTitle() {
    const el = this._els.craftTitle;
    if (!el) return;
    const type = this.station?.type;
    el.textContent = type === 'anvil' ? this.i18n.t('anvil_craft_title')
      : type === 'table' || this.gridSize === 3 ? this.i18n.t('table_title')
        : this.i18n.t('craft_grid');
  }

  _setTab(tab) {
    if (tab === 'catalog' && !this.creative) return;
    this.tab = tab;
    this._userTab = tab;
    this.render();
    this.handlers.onSound?.('click');
  }

  /** Вернуть стопку из «руки» в инвентарь */
  stashCarry() {
    if (!this.carry || !this.inv) { this.carry = null; this._renderCursor(); return; }
    const left = this.inv.add(this.carry.key, this.carry.count);
    if (left > 0) this.carry.count = left;
    else this.carry = null;
    this._renderCursor();
    this.render();
    this.handlers.onChange?.();
  }

  /** Вернуть содержимое сетки крафта в инвентарь */
  dumpGrid() {
    if (!this.inv || !this.grid) return;
    let moved = false;
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      const left = this.inv.add(s.key, s.count);
      this.grid[i] = left > 0 ? { key: s.key, count: left } : null;
      moved = true;
    }
    if (moved) this.handlers.onChange?.();
  }

  // ---------------------------------------------------------------- Отрисовка
  render() {
    if (!this.inv) return;
    const els = this._els;
    const furnaceOpen = this.station?.type === 'furnace';
    const chestOpen = this.station?.type === 'chest';
    const anvilOpen = this.station?.type === 'anvil';
    const tableOpen = this.station?.type === 'table' || (!this.station && this.gridSize === 3);
    els.window?.classList.toggle('furnace-open', furnaceOpen);
    els.window?.classList.toggle('chest-open', chestOpen);
    els.side?.classList.toggle('hidden', furnaceOpen || chestOpen);
    els.craftRow?.classList.toggle('hidden', furnaceOpen || chestOpen);
    els.furnacePanel?.classList.toggle('hidden', !furnaceOpen);
    els.chestPanel?.classList.toggle('hidden', !chestOpen);
    if (els.modeLabel) {
      els.modeLabel.textContent = furnaceOpen
        ? this.i18n.t('furnace_title')
        : chestOpen ? this.i18n.t('chest_title')
          : anvilOpen ? this.i18n.t('anvil_title')
            : tableOpen ? this.i18n.t('table_title')
              : this.i18n.t(this.creative ? 'mode_creative' : 'mode_survival');
    }
    if (els.tip) {
      els.tip.textContent = furnaceOpen
        ? this.i18n.t('furnace_ui_hint')
        : chestOpen ? this.i18n.t('chest_hint')
          : anvilOpen ? this.i18n.t('anvil_hint')
            : this.tab === 'catalog' ? this.i18n.t('catalog_hint') : this.i18n.t('craft_hint');
    }
    if (chestOpen) this._renderGrid(els.chestGrid, 0, this.station.inv.size, this.station.inv, 'chest');
    // Вкладки: каталог есть только в креативе
    els.tabs?.querySelectorAll('.inv-tab').forEach((btn) => {
      const isCatalog = btn.dataset.tab === 'catalog';
      btn.classList.toggle('hidden', isCatalog && !this.creative);
      btn.classList.toggle('active', btn.dataset.tab === this.tab);
    });
    this._renderCraft();
    this._renderGrid(els.grid, 9, 36);
    this._renderGrid(els.hotbar, 0, 9);
    this._renderSide();
    this._renderFurnace(true);
    this._renderCursor();
  }

  /** Обновить интерфейс печи без перерисовки всего инвентаря. */
  updateStation(dt) {
    if (!this.open_ || this.station?.type !== 'furnace') return;
    this.station.machine.update(dt);
    this._renderFurnace(false);
  }

  _renderFurnace(forceSlots = false) {
    const machine = this.station?.type === 'furnace' ? this.station.machine : null;
    if (!machine) return;
    const slots = ['input', 'fuel', 'output'];
    const signature = slots.map((name) => {
      const s = machine.getSlot(name);
      return s ? `${name}:${s.key}:${s.count}` : `${name}:-`;
    }).join('|');
    if (forceSlots || signature !== this._furnaceSignature) {
      this._furnaceSignature = signature;
      for (const name of slots) {
        const el = this._els.furnaceSlots[name];
        if (!el) continue;
        const stack = machine.getSlot(name);
        el.innerHTML = '';
        el.classList.toggle('has-item', !!stack);
        if (stack) {
          const icon = itemIconEl(stack.key, 42);
          if (icon) el.appendChild(icon);
          if (stack.count > 1) {
            const count = document.createElement('span');
            count.className = 'islot-count';
            count.textContent = String(stack.count);
            el.appendChild(count);
          }
          el.title = `${itemName(stack.key, this.i18n.lang)} ×${stack.count}\n${itemDescription(stack.key, this.i18n.lang)}`;
        } else {
          el.title = this.i18n.t(name === 'input' ? 'furnace_slot_input' : name === 'fuel' ? 'furnace_slot_fuel' : 'furnace_slot_output');
        }
        el.onpointerdown = (e) => this._onFurnaceSlot(e, name);
        el.oncontextmenu = (e) => e.preventDefault();
      }
    }
    const burn = this._els.furnaceBurn;
    if (burn) {
      const pct = machine.burnTotal > 0 ? Math.max(0, Math.min(1, machine.burnRemaining / machine.burnTotal)) : 0;
      burn.style.height = `${pct * 100}%`;
    }
    const progress = this._els.furnaceProgress;
    if (progress) {
      const pct = Math.max(0, Math.min(1, machine.cookProgress / SMELT_TIME));
      progress.style.width = `${pct * 100}%`;
    }
    if (this._els.furnaceStatus) {
      const input = machine.getSlot('input');
      const output = machine.getSlot('output');
      const result = input && smeltResult(input.key);
      const outputBlocked = result && output && (output.key !== result || output.count >= maxStack(result));
      const statusKey = !input ? 'furnace_add_input'
        : outputBlocked ? 'furnace_output_full'
          : machine.burnRemaining > 0 || machine.getSlot('fuel') ? 'furnace_smelting'
            : 'furnace_add_fuel';
      this._els.furnaceStatus.textContent = this.i18n.t(statusKey);
    }
  }

  _onFurnaceSlot(e, name) {
    e.preventDefault();
    e.stopPropagation();
    const machine = this.station?.machine;
    if (!machine) return;
    if (e.shiftKey && !this.carry) {
      // Shift+клик: содержимое слота печи сразу в инвентарь
      const slot = machine.getSlot(name);
      if (slot) {
        const amount = Math.min(slot.count, this.inv.spaceFor(slot.key));
        if (amount > 0) {
          if (name === 'output') {
            const taken = machine.takeOutput(amount);
            if (taken) this.inv.add(taken.key, taken.count);
          } else {
            const key = slot.key;
            const rest = slot.count - amount;
            machine.setStack(name, rest > 0 ? { key, count: rest } : null);
            this.inv.add(key, amount);
          }
          this.handlers.onSound?.('pickup');
        } else ui_toast_full();
      }
      this._paint = null;
      this.render();
      this.handlers.onChange?.();
      this.handlers.onStationChange?.();
      return;
    }
    if (name === 'output') {
      const output = machine.getSlot('output');
      if (!output) return;
      if (!this.carry) {
        const amount = e.button === 2 ? Math.ceil(output.count / 2) : output.count;
        this.carry = machine.takeOutput(amount);
        this.handlers.onSound?.('pickup');
      } else if (this.carry.key === output.key) {
        const room = maxStack(output.key) - this.carry.count;
        const amount = Math.min(room, e.button === 2 ? 1 : room);
        if (amount > 0) {
          const taken = machine.takeOutput(amount);
          if (taken) this.carry.count += taken.count;
          this.handlers.onSound?.('pickup');
        }
      }
    } else {
      if (this.carry && !machine.accepts(name, this.carry.key)) return;
      const container = {
        get: () => machine.getSlot(name),
        setStack: (_index, stack) => machine.setStack(name, stack),
        clearSlot: () => machine.clearSlot(name),
      };
      this._mutate(container, 0, e.button === 2);
    }
    this._paint = null;
    this.render();
    this.handlers.onChange?.();
    this.handlers.onStationChange?.();
  }

  /** Сетка крафта и слот результата */
  _renderCraft() {
    const els = this._els;
    if (!els.craftGrid) return;
    const size = this.gridSize;
    els.craftGrid.className = 'craft-grid size' + size;
    els.craftGrid.innerHTML = '';
    for (let i = 0; i < size * size; i++) {
      const slot = document.createElement('div');
      slot.className = 'islot craft-cell';
      slot.dataset.index = String(i);
      const s = this.grid[i];
      if (s) {
        slot.title = `${itemName(s.key, this.i18n.lang)} ×${s.count}\n${itemDescription(s.key, this.i18n.lang)}`;
        const icon = itemIconEl(s.key, 36);
        if (icon) slot.appendChild(icon);
        if (s.count > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'islot-count';
          cnt.textContent = String(s.count);
          slot.appendChild(cnt);
        }
      }
      slot.addEventListener('pointerdown', (e) => this._onGridCell(e, i));
      slot.addEventListener('contextmenu', (e) => e.preventDefault());
      els.craftGrid.appendChild(slot);
    }
    // Результат (с учётом открытого станка: наковальня открывает металлические рецепты)
    const res = gridResult(this.grid, size, this.craftStation());
    const out = els.craftResult;
    if (!out) return;
    out.innerHTML = '';
    out.title = '';
    out.classList.toggle('ready', !!res);
    if (res) {
      out.title = `${itemName(res.out.key, this.i18n.lang)} ×${res.out.count}\n${itemDescription(res.out.key, this.i18n.lang)}`;
      const icon = itemIconEl(res.out.key, 40);
      if (icon) out.appendChild(icon);
      if (res.out.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'islot-count';
        cnt.textContent = String(res.out.count);
        out.appendChild(cnt);
      }
      const tip = document.createElement('div');
      tip.className = 'slot-tip';
      tip.textContent = itemName(res.out.key, this.i18n.lang);
      out.appendChild(tip);
    }
    out.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) this._shiftTakeResult();
      else this._takeResult(e.button === 2);
    };
    out.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Shift+клик по результату: скрафтить сколько получится сразу в инвентарь */
  _shiftTakeResult() {
    const st = this.craftStation();
    const out = craftFromGrid(this.grid, this.gridSize, this.inv, true, st);
    if (out === 'full') {
      // На всю стопку места нет — пробуем по одному
      if (craftFromGrid(this.grid, this.gridSize, this.inv, false, st) !== 'ok') { ui_toast_full(this); return; }
    } else if (out !== 'ok') return;
    this.handlers.onSound?.('craft');
    this.render();
    this.handlers.onChange?.();
  }

  _takeResult(all = false) {
    const before = this.carry ? { ...this.carry } : null;
    const st = this.craftStation();
    const res = gridResult(this.grid, this.gridSize, st);
    if (!res) return;
    if (this.carry && this.carry.key !== res.out.key) return;
    if (this.carry && this.carry.count + res.out.count > maxStack(res.out.key)) return;
    const out = craftFromGrid(this.grid, this.gridSize, this.inv, all, st);
    if (out === 'full') { ui_toast_full(this); return; }
    if (out !== 'ok') return;
    // результат — в руку (если рука свободна) иначе сразу в инвентарь
    if (before || this.carry) {
      if (!this.carry) this.carry = { key: res.out.key, count: 0 };
      this.carry.count += res.out.count;
      if (this.carry.count <= 0) this.carry = null;
    }
    this.handlers.onSound?.('craft');
    this.render();
    this.handlers.onChange?.();
  }

  _renderGrid(container, from, to, inv = this.inv, kind = 'inv') {
    if (!container || !inv) return;
    container.innerHTML = '';
    for (let i = from; i < to; i++) {
      const slot = document.createElement('div');
      slot.className = 'islot';
      slot.dataset.index = String(i);
      slot.dataset.container = kind;
      if (kind === 'inv' && i < HOTBAR_SIZE && i === this.hotbarIndex) slot.classList.add('selected');
      const stack = inv.get(i);
      if (stack) {
        slot.title = `${itemName(stack.key, this.i18n.lang)} ×${stack.count}\n${itemDescription(stack.key, this.i18n.lang)}`;
        const icon = itemIconEl(stack.key, 40);
        if (icon) slot.appendChild(icon);
        const def = itemDef(stack.key);
        const infinite = kind === 'inv' && this.creative && def?.kind === 'block';
        if (infinite || stack.count > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'islot-count';
          cnt.textContent = infinite ? '∞' : String(stack.count);
          slot.appendChild(cnt);
        }
      }
      slot.addEventListener('pointerdown', (e) => (kind === 'chest' ? this._onChestSlot(e, i) : this._onSlotDown(e, i)));
      slot.addEventListener('contextmenu', (e) => e.preventDefault());
      container.appendChild(slot);
    }
  }

  _renderSide() {
    const els = this._els;
    if (!els.sideList) return;
    els.sideList.innerHTML = '';
    if (this.tab === 'catalog') {
      if (els.sideTitle) els.sideTitle.textContent = this.i18n.t('catalog_title');
      els.sideList.className = 'inv-side-list catalog';
      for (const entry of this.catalog) {
        const cell = document.createElement('div');
        cell.className = 'cat-item' + (entry.locked ? ' locked' : '');
        cell.title = `${itemName(entry.key, this.i18n.lang)}\n${itemDescription(entry.key, this.i18n.lang)}`;
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
      return;
    }
    // Список рецептов (клик — быстрый крафт). Показываем только те, что доступны
    // на текущем станке: наковальня добавляет металлические инструменты.
    const st = this.craftStation();
    if (els.sideTitle) {
      els.sideTitle.textContent = st?.type === 'anvil'
        ? this.i18n.t('anvil_recipes') : this.i18n.t('craft_title');
    }
    els.sideList.className = 'inv-side-list recipes';
    for (const recipe of recipesFor(st)) {
      const ok = canCraft(this.inv, recipe, st);
      const row = document.createElement('div');
      row.className = 'recipe' + (ok ? ' ok' : '');
      row.dataset.id = recipe.id;
      const icon = itemIconEl(recipe.out.key, 36);
      if (icon) row.appendChild(icon);
      const info = document.createElement('div');
      info.className = 'recipe-info';
      const name = document.createElement('div');
      name.className = 'recipe-name';
      name.textContent = `${itemName(recipe.out.key, this.i18n.lang)} ×${recipe.out.count}`
        + (needsTable(recipe) ? ' · ' + this.i18n.t('need_table_short') : '');
      name.title = itemDescription(recipe.out.key, this.i18n.lang);
      if (recipe.station === 'anvil') {
        const badge = document.createElement('span');
        badge.className = 'recipe-station';
        badge.textContent = this.i18n.t('need_anvil_short');
        badge.title = this.i18n.t('need_anvil');
        name.appendChild(badge);
      }
      const desc = document.createElement('div');
      desc.className = 'recipe-desc';
      desc.textContent = itemDescription(recipe.out.key, this.i18n.lang);
      const ing = document.createElement('div');
      ing.className = 'recipe-ing';
      for (const x of ingredients(this.inv, recipe)) {
        const material = document.createElement('span');
        material.className = 'recipe-material' + (x.ok ? ' enough' : '');
        material.title = `${itemName(x.key, this.i18n.lang)} — ${itemDescription(x.key, this.i18n.lang)}`;
        const ingredientIcon = itemIconEl(x.key, 18);
        if (ingredientIcon) material.appendChild(ingredientIcon);
        const label = document.createElement('span');
        label.textContent = `${itemName(x.key, this.i18n.lang)} ${x.have}/${x.need}`;
        material.appendChild(label);
        ing.appendChild(material);
      }
      row.title = `${itemDescription(recipe.out.key, this.i18n.lang)}\n${this.i18n.t('craft_ingredients')}: `
        + ingredients(this.inv, recipe).map((x) => `${itemName(x.key, this.i18n.lang)} ${x.have}/${x.need}`).join(', ');
      info.append(name, desc, ing);
      row.appendChild(info);
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        // Рецепт требует наковальню, а открыт обычный инвентарь/верстак — подсказываем
        if (recipe.station && !stationAllows(recipe, stationInfo(st))) {
          this.handlers.onSound?.('deny');
          this.handlers.onNeedStation?.(recipe.station);
          return;
        }
        this.handlers.onQuickCraft?.(recipe);
      });
      els.sideList.appendChild(row);
    }
  }

  _renderCursor() {
    const cur = this._els.cursor;
    if (!cur) return;
    if (!this.carry) {
      cur.classList.add('hidden');
      cur.innerHTML = '';
      cur.title = '';
      return;
    }
    cur.classList.remove('hidden');
    cur.innerHTML = '';
    cur.title = `${itemName(this.carry.key, this.i18n.lang)} ×${this.carry.count}\n${itemDescription(this.carry.key, this.i18n.lang)}`;
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
    // Shift+клик «в хотбар» работает только когда не открыт верстак/печь/сундук/наковальня:
    // иначе стопка улетала бы из окна станка и путала игрока.
    if (e.shiftKey && !this.carry && !this.station) {
      this.quickMoveFromInventory(i);
      this._paint = null;
      this.render();
      this.handlers.onChange?.();
      return;
    }
    if (i < HOTBAR_SIZE && e.button === 0 && !this.carry) {
      this.hotbarIndex = i;
      this.handlers.onSelect?.(i);
    }
    this._mutate(this.inv, i, e.button === 2);
    this._startPaint('inv', i);          // зажатой кнопкой можно вести по ячейкам
    this._beginDrag(e, 'inv', i);        // а можно просто перетащить стопку в другую ячейку
    this.render();
    this.handlers.onChange?.();
  }

  /** Ячейка сундука: обычные ЛКМ/ПКМ, Shift+клик — сразу в инвентарь */
  _onChestSlot(e, i) {
    e.preventDefault();
    e.stopPropagation();
    const chest = this.station?.type === 'chest' ? this.station.inv : null;
    if (!chest || !this.inv) return;
    if (e.shiftKey && !this.carry) {
      const stack = chest.get(i);
      if (stack) {
        const left = this.inv.add(stack.key, stack.count);
        if (left === stack.count) ui_toast_full();
        else {
          chest.setStack(i, left > 0 ? { key: stack.key, count: left } : null);
          this.handlers.onSound?.('pickup');
        }
      }
      this._paint = null;
    } else {
      this._mutate(chest, i, e.button === 2);
      this._startPaint('chest', i);
      this._beginDrag(e, 'chest', i);
    }
    this.render();
    this.handlers.onChange?.();
    this.handlers.onStationChange?.();
  }

  /**
   * Быстрое перемещение (Shift+клик) стопки из инвентаря игрока:
   *  • открыт сундук — в сундук;
   *  • открыта печь — в слот сырья или топлива (что подходит);
   *  • открыт верстак — в сетку крафта;
   *  • иначе (или некуда) — между хотбаром и рюкзаком.
   * @returns {boolean} удалось ли что-то переложить
   */
  quickMoveFromInventory(i) {
    const stack = this.inv?.get(i);
    if (!stack) return false;
    const key = stack.key;
    let count = stack.count;
    const st = this.station;
    if (st?.type === 'chest') {
      count = st.inv.add(key, count);
    } else if (st?.type === 'furnace') {
      const machine = st.machine;
      for (const name of ['input', 'fuel']) {
        if (count <= 0 || !machine.accepts(name, key)) continue;
        const cur = machine.getSlot(name);
        if (!cur) {
          const put = Math.min(count, maxStack(key));
          machine.setStack(name, { key, count: put });
          count -= put;
        } else if (cur.key === key) {
          const put = Math.min(count, maxStack(key) - cur.count);
          if (put > 0) { machine.setStack(name, { key, count: cur.count + put }); count -= put; }
        }
      }
      if (count !== stack.count) this.handlers.onStationChange?.();
    } else if (this.gridSize === 3) {
      count = this._addToGrid(key, count);
    }
    if (count === stack.count) {
      // Станции нет или ей не подходит предмет — хотбар ⇄ рюкзак
      const [from, to] = i < HOTBAR_SIZE ? [HOTBAR_SIZE, this.inv.size] : [0, HOTBAR_SIZE];
      this.inv.clearSlot(i);
      count = addToRange(this.inv, from, to, key, count);
      if (count > 0) {
        // остаток возвращаем на место
        this.inv.setStack(i, { key, count });
        if (count === stack.count) return false;
      }
    } else {
      this.inv.setStack(i, count > 0 ? { key, count } : null);
    }
    this.handlers.onSound?.('place');
    return true;
  }

  /** Кладёт предметы в сетку крафта: сначала в такие же стопки, потом в пустую клетку */
  _addToGrid(key, count) {
    const max = maxStack(key);
    for (let k = 0; k < this.grid.length && count > 0; k++) {
      const c = this.grid[k];
      if (c && c.key === key && c.count < max) {
        const put = Math.min(count, max - c.count);
        c.count += put;
        count -= put;
      }
    }
    for (let k = 0; k < this.grid.length && count > 0; k++) {
      if (!this.grid[k]) {
        const put = Math.min(count, max);
        this.grid[k] = { key, count: put };
        count -= put;
      }
    }
    return count;
  }

  /** Обёртка сетки крафта в виде контейнера для общей логики кликов */
  _gridContainer() {
    return {
      get: (k) => this.grid[k],
      setStack: (k, stack) => { this.grid[k] = stack ? { key: stack.key, count: stack.count } : null; },
      clearSlot: (k) => { this.grid[k] = null; },
    };
  }

  /** Ячейка сетки крафта: кладём/забираем предметы как в инвентаре */
  _onGridCell(e, i) {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && !this.carry && this.grid[i]) {
      // Shift+клик по клетке крафта — вернуть стопку в инвентарь
      const s = this.grid[i];
      const left = this.inv.add(s.key, s.count);
      this.grid[i] = left > 0 ? { key: s.key, count: left } : null;
      if (left > 0) ui_toast_full();
      else this.handlers.onSound?.('pickup');
      this._paint = null;
      this.render();
      this.handlers.onChange?.();
      return;
    }
    this._mutate(this._gridContainer(), i, e.button === 2, true);
    this._startPaint('craft', i);        // дальше можно вести курсором по клеткам
    this._beginDrag(e, 'craft', i);      // либо перетащить стопку в другую клетку
    this.render();
    this.handlers.onChange?.();
  }

  // ---------------------------------------------------------------- Мазок зажатой кнопкой
  /**
   * Как в Minecraft: зажали ЛКМ/ПКМ, положили стопку в первую клетку и, не отпуская
   * кнопку, ведёте по остальным — в каждую новую клетку кладётся по одному предмету.
   */
  _startPaint(kind, index) {
    if (!this.carry) { this._paint = null; return; }
    const visited = new Set([index]);
    this._paint = { kind, visited };
  }

  _onPaintMove(e) {
    const d = this._drag;
    if (d) {
      const ex = e.clientX ?? 0, ey = e.clientY ?? 0;
      if (!this.carry || (e.pointerType !== 'touch' && e.buttons === 0)) { this._drag = null; return; }
      if (Math.abs(ex - d.x) > 8 || Math.abs(ey - d.y) > 8) {
        d.moved = true;
        d.x = ex; d.y = ey;              // веха обновляется, чтобы жест не «срывался»
        this._paint = null;              // drag отменяет «мазок по одному предмету»
      }
      return;
    }
    const p = this._paint;
    if (!p || !this.open_ || !this.carry) return;
    // Кнопку отпустили вне окна инвентаря — мазок заканчивается
    if (e.pointerType !== 'touch' && e.buttons === 0) { this._paint = null; return; }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const cell = el.closest('.craft-cell, .islot');
    if (!cell || !cell.dataset || cell.dataset.index == null) return;
    const isCraftCell = cell.classList.contains('craft-cell');
    const kind = isCraftCell ? 'craft' : cell.dataset.container === 'chest' ? 'chest' : 'inv';
    if (p.kind !== kind) return;
    const i = Number(cell.dataset.index);
    if (!Number.isFinite(i) || p.visited.has(i)) return;
    p.visited.add(i);
    const container = isCraftCell ? this._gridContainer()
      : kind === 'chest' ? (this.station?.type === 'chest' ? this.station.inv : null) : this.inv;
    if (!container) return;
    // В каждую новую клетку — ровно один предмет из стопки «в руке»
    this._mutate(container, i, true, isCraftCell);
    this.render();
    this.handlers.onChange?.();
  }

  // ---------------------------------------------------------------- Перетаскивание
  /**
   * Настоящий drag&drop: забрали стопку из ячейки, не отпуская кнопку повели курсор
   * и бросили в другую ячейку. Короткое движение (<8px) остаётся обычным кликом,
   * длинное — отменяет «мазок по одному предмету» и вместо этого роняет стопку.
   */
  _beginDrag(e, kind, index) {
    // Перетаскивать можно и мышью, и пальцем: взял стопку, повёл, бросил
    if (!this.carry) { this._drag = null; return; }
    this._drag = {
      kind, index,
      x: e.clientX ?? e.touches?.[0]?.clientX ?? 0,
      y: e.clientY ?? e.touches?.[0]?.clientY ?? 0,
      moved: false,
    };
  }

  _dragTarget(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    const cell = el?.closest?.('.craft-cell, .islot');
    if (!cell?.dataset || cell.dataset.index == null) return null;
    const isCraft = cell.classList.contains('craft-cell');
    const kind = isCraft ? 'craft' : cell.dataset.container === 'chest' ? 'chest' : 'inv';
    return { kind, index: Number(cell.dataset.index), el: cell };
  }

  _endDrag(e) {
    const d = this._drag;
    this._drag = null;
    if (!d || !this.open_ || !this.carry) return false;
    const t = this._dragTarget(e.clientX, e.clientY);
    if (!t || t.kind !== d.kind || t.index === d.index) return false;
    const container = t.kind === 'craft' ? this._gridContainer()
      : t.kind === 'chest' ? (this.station?.type === 'chest' ? this.station.inv : null) : this.inv;
    if (!container) return false;
    this._mutate(container, t.index, e.button === 2, t.kind === 'craft');
    this._paint = null;
    this.render();
    this.handlers.onChange?.();
    if (t.kind === 'chest') this.handlers.onStationChange?.();
    return true;
  }

  /**
   * Общая логика ЛКМ/ПКМ для контейнера (инвентарь или сетка крафта).
   * @param {boolean} singleOnly ПКМ: положить один предмет
   * @param {boolean} gridMode сетка крафта (нельзя забирать половину в руку, только по одному)
   */
  _mutate(container, i, rightButton, gridMode = false) {
    const cur = container.get(i);
    if (!this.carry) {
      if (!cur) return;
      if (rightButton) {
        const half = gridMode ? 1 : Math.ceil(cur.count / 2);
        this.carry = { key: cur.key, count: half };
        cur.count -= half;
        if (cur.count <= 0) container.clearSlot(i);
      } else {
        this.carry = { key: cur.key, count: cur.count };
        container.clearSlot(i);
      }
      this.handlers.onSound?.('pickup');
      return;
    }
    if (!cur) {
      const place = rightButton ? 1 : this.carry.count;
      container.setStack(i, { key: this.carry.key, count: place });
      this.carry.count -= place;
      if (this.carry.count <= 0) this.carry = null;
      this.handlers.onSound?.('place');
      return;
    }
    if (cur.key === this.carry.key && cur.count < maxStack(cur.key)) {
      const room = maxStack(cur.key) - cur.count;
      const take = Math.min(room, rightButton ? 1 : this.carry.count);
      cur.count += take;
      this.carry.count -= take;
      if (this.carry.count <= 0) this.carry = null;
      this.handlers.onSound?.('place');
      return;
    }
    if (rightButton) return;     // ПКМ по другому предмету — ничего
    const tmp = { key: cur.key, count: cur.count };
    container.setStack(i, this.carry);
    this.carry = tmp;
    this.handlers.onSound?.('click');
  }
}

/** Добавить предметы только в ячейки [from, to): сначала в такие же стопки, затем в пустые */
export function addToRange(inv, from, to, key, count) {
  const max = maxStack(key);
  for (let k = from; k < to && count > 0; k++) {
    const c = inv.get(k);
    if (c && c.key === key && c.count < max) {
      const put = Math.min(count, max - c.count);
      c.count += put;
      count -= put;
    }
  }
  for (let k = from; k < to && count > 0; k++) {
    if (!inv.get(k)) {
      const put = Math.min(count, max);
      inv.setStack(k, { key, count: put });
      count -= put;
    }
  }
  return count;
}

// Подсказка «нет места» — выносим в отдельную функцию, чтобы не тянуть ui внутрь класса
let _fullToast = null;
export function setFullToast(fn) { _fullToast = fn; }
function ui_toast_full() { _fullToast?.(); }
