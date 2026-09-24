// Окно инвентаря (E / 🎒): 36 ячеек, каталог (креатив) или рецепты (выживание),
// предмет «в руке» следует за курсором. ЛКМ — взять/положить/поменять,
// ПКМ — положить по одному / взять половину.
import { maxStack, itemName } from './inventory.js';
import { RECIPES, canCraft } from './crafting.js';
import { itemIconCopy } from './icons.js';
import { BUILDER_PALETTE } from './blocks.js';

// Все блоки (кроме воды) + предметы
const CATALOG = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 101, 102, 103, 104, 105, 106, 107];
const SLOT_ICON = 40;
const LIST_ICON = 34;
const MAT_ICON = 22;
const CUR_ICON = 42;

export class InventoryUI {
  // api: { i18n, inventory, mode(), hotbarIndex(), unlocked(),
  //        onChange(), onClose(), onCraft(recipe), onToast(text), onSelectHotbar(i) }
  constructor(api) {
    this.api = api;
    this.held = null;      // { id, n } — предмет «в руке»
    this._press = null;    // зажатие на тач-экране
    this._mx = null;
    this._my = null;
    this._bindOnce();
  }

  _screen() {
    return document.getElementById('inventory-screen');
  }

  _bindOnce() {
    const screen = this._screen();
    if (!screen) return;

    // Курсор: позицию запоминаем всегда, видимый элемент двигаем только с предметом
    document.addEventListener('mousemove', (e) => {
      this._mx = e.clientX;
      this._my = e.clientY;
      this._moveCursor();
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!this.held) return;
      const t = e.changedTouches[0];
      this._mx = t.clientX;
      this._my = t.clientY;
      this._moveCursor();
    }, { passive: true });

    // Мышь (десктоп): ЛКМ / ПКМ
    screen.addEventListener('mousedown', (e) => {
      if (e.button === 1) return;
      e.preventDefault();
      const el = e.target.closest ? e.target.closest('.inv-slot') : null;
      if (el) this._tapSlot(Number(el.dataset.i), e.button === 0);
      else this._releaseHeld();
    });

    // Тач: тап — как ЛКМ, долгое нажатие — как ПКМ
    screen.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const slot = el && el.closest ? el.closest('.inv-slot') : null;
      this._press = null;
      if (slot) {
        const i = Number(slot.dataset.i);
        this._press = {
          i, x: t.clientX, y: t.clientY, done: false,
          timer: setTimeout(() => {
            if (!this._press) return;
            this._press.done = true;
            this._mx = this._press.x;
            this._my = this._press.y;
            this._tapSlot(i, false);
          }, 380),
        };
      }
    }, { passive: true });

    screen.addEventListener('touchmove', (e) => {
      if (!this._press) return;
      const t = e.changedTouches[0];
      if (Math.hypot(t.clientX - this._press.x, t.clientY - this._press.y) > 14) {
        clearTimeout(this._press.timer);
        this._press = null;
      }
    }, { passive: true });

    screen.addEventListener('touchend', (e) => {
      const p = this._press;
      this._press = null;
      if (!p) return;
      clearTimeout(p.timer);
      if (!p.done) {
        const t = e.changedTouches[0];
        this._mx = t.clientX;
        this._my = t.clientY;
        this._tapSlot(p.i, true);
      }
    }, { passive: true });

    screen.addEventListener('touchcancel', () => {
      if (this._press) clearTimeout(this._press.timer);
      this._press = null;
    });

    document.getElementById('btn-inv-close')?.addEventListener('click', () => this.api.onClose());
  }

  open() {
    this.held = null;
    this._screen().classList.remove('hidden');
    this.render();
  }

  close() {
    this.held = null;
    this._screen().classList.add('hidden');
    this._renderCursor();
  }

  // ---- Действия ----

  _tapSlot(i, left) {
    if (i < 9) this.api.onSelectHotbar(i);
    if (left) this._lmb(i);
    else this._rmb(i);
    this._finish();
  }

  _lmb(i) {
    const inv = this.api.inventory;
    const s = inv.slots[i];
    if (this.held) {
      if (!s) {
        inv.slots[i] = this.held;
        this.held = null;
      } else if (s.id === this.held.id && s.n < maxStack(s.id)) {
        const mv = Math.min(maxStack(s.id) - s.n, this.held.n);
        s.n += mv;
        this.held.n -= mv;
        if (this.held.n <= 0) this.held = null;
      } else {
        // Поменять местами
        inv.slots[i] = this.held;
        this.held = s;
      }
    } else if (s) {
      this.held = s;
      inv.slots[i] = null;
    }
  }

  _rmb(i) {
    const inv = this.api.inventory;
    const s = inv.slots[i];
    if (this.held) {
      // Положить по одному
      if (!s) {
        inv.slots[i] = { id: this.held.id, n: 1 };
        this.held.n--;
      } else if (s.id === this.held.id && s.n < maxStack(s.id)) {
        s.n++;
        this.held.n--;
      } else {
        return; // нельзя положить
      }
      if (this.held.n <= 0) this.held = null;
    } else if (s) {
      // Взять половину (от одной штуки — одну)
      const half = Math.ceil(s.n / 2);
      this.held = { id: s.id, n: half };
      s.n -= half;
      if (s.n <= 0) inv.slots[i] = null;
    }
  }

  // Клик по фону — вернуть предмет «в руке» в инвентарь (лишнее сгорает)
  _releaseHeld() {
    if (!this.held) return;
    this.api.inventory.add(this.held.id, this.held.n);
    this.held = null;
    this._finish();
  }

  _finish() {
    this.render();
    this.api.onChange();
  }

  // ---- Отрисовка ----

  render() {
    this._renderGrid();
    this._renderLeft();
    this._renderCursor();
  }

  _renderGrid() {
    const grid = document.getElementById('inv-grid');
    if (!grid) return;
    const inv = this.api.inventory;
    const mode = this.api.mode();
    const hb = this.api.hotbarIndex();
    grid.innerHTML = '';
    // Сверху — сумка (3 ряда), внизу — хотбар (первые 9 ячеек)
    const rows = [[], [], [], []];
    for (let i = 27; i <= 35; i++) rows[0].push(i);
    for (let i = 18; i <= 26; i++) rows[1].push(i);
    for (let i = 9; i <= 17; i++) rows[2].push(i);
    for (let i = 0; i <= 8; i++) rows[3].push(i);
    for (const row of rows) {
      const wrap = document.createElement('div');
      wrap.className = 'inv-row' + (row[0] < 9 ? ' hb-row' : '');
      for (const i of row) {
        const d = document.createElement('div');
        d.className = 'inv-slot' + (i === hb ? ' sel' : '');
        d.dataset.i = i;
        const it = inv.slots[i];
        if (it) {
          d.appendChild(itemIconCopy(it.id, SLOT_ICON));
          if (mode === 'survival' && it.n > 1) {
            const n = document.createElement('span');
            n.className = 'inv-count';
            n.textContent = it.n;
            d.appendChild(n);
          }
        }
        wrap.appendChild(d);
      }
      grid.appendChild(wrap);
    }
  }

  _renderLeft() {
    const title = document.getElementById('inv-left-title');
    const list = document.getElementById('inv-list');
    if (!title || !list) return;
    const t = this.api.i18n.t;
    const lang = this.api.i18n.lang;
    list.innerHTML = '';

    if (this.api.mode() === 'creative') {
      // Каталог: клик кладёт предмет в выбранный слот хотбара
      title.textContent = t('inv_catalog');
      list.className = 'inv-list catalog';
      const unlocked = this.api.unlocked();
      for (const id of CATALOG) {
        const d = document.createElement('div');
        const locked = !unlocked && BUILDER_PALETTE.includes(id);
        d.className = 'cat-item' + (locked ? ' locked' : '');
        d.title = itemName(id, lang);
        d.appendChild(itemIconCopy(id, LIST_ICON));
        d.addEventListener('click', () => {
          if (locked) {
            this.api.onToast(t('reward_lock_hint'));
            return;
          }
          const inv = this.api.inventory;
          const hb = this.api.hotbarIndex();
          inv.slots[hb] = { id, n: maxStack(id) }; // в креативе всё бесконечно
          this._finish();
        });
        list.appendChild(d);
      }
    } else {
      // Крафт: доступные рецепты подсвечены зелёным
      title.textContent = t('inv_recipes');
      list.className = 'inv-list recipes';
      const inv = this.api.inventory;
      for (const r of RECIPES) {
        const row = document.createElement('div');
        row.className = 'recipe' + (canCraft(inv, r) ? ' ok' : '');

        const res = document.createElement('div');
        res.className = 'r-res';
        res.title = itemName(r.out.id, lang);
        res.appendChild(itemIconCopy(r.out.id, LIST_ICON));
        if (r.out.n > 1) {
          const n = document.createElement('span');
          n.className = 'r-count';
          n.textContent = '×' + r.out.n;
          res.appendChild(n);
        }

        const arr = document.createElement('span');
        arr.className = 'r-arr';
        arr.textContent = '←';

        const ins = document.createElement('div');
        ins.className = 'r-in';
        for (const m of r.in) {
          const mi = document.createElement('span');
          mi.className = 'r-mat';
          mi.title = itemName(m.id, lang);
          mi.appendChild(itemIconCopy(m.id, MAT_ICON));
          const n = document.createElement('span');
          n.className = 'r-count';
          n.textContent = '×' + m.n;
          mi.appendChild(n);
          ins.appendChild(mi);
        }

        row.append(res, arr, ins);
        row.addEventListener('click', () => {
          if (!canCraft(this.api.inventory, r)) return;
          this.api.onCraft(r);
          this._finish();
        });
        list.appendChild(row);
      }
    }
  }

  _renderCursor() {
    const cur = document.getElementById('item-cursor');
    if (!cur) return;
    cur.innerHTML = '';
    if (!this.held) {
      cur.classList.add('hidden');
      return;
    }
    cur.classList.remove('hidden');
    cur.appendChild(itemIconCopy(this.held.id, CUR_ICON));
    if (this.held.n > 1) {
      const n = document.createElement('span');
      n.className = 'inv-count';
      n.textContent = this.held.n;
      cur.appendChild(n);
    }
    this._moveCursor();
  }

  _moveCursor() {
    const cur = document.getElementById('item-cursor');
    if (!cur || cur.classList.contains('hidden')) return;
    if (this._mx == null) return;
    cur.style.left = this._mx + 'px';
    cur.style.top = this._my + 'px';
  }
}
