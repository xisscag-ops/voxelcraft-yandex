// HTML-интерфейс: меню режимов, хотбар, крафт, HUD, настройки и тосты.
import { BLOCKS } from './blocks.js';
import { slotKey, itemName, ITEM_ICONS, RECIPES, ITEM } from './inventory.js';
import { tileIcon, slabIcon, itemIcon } from './textures.js';

export class UI {
  constructor(i18n) {
    this.i18n = i18n;
    this.handlers = {
      onPlay: null, onResume: null, onSaveQuit: null, onNewWorld: null,
      onSettingsChange: null, onReward: null, onSlot: null, onPauseBtn: null,
      onToSpawn: null, onModeChange: null, onOpenInventory: null,
      onCloseInventory: null, onCraft: null, onEat: null,
    };
    this._screens = ['loading-screen', 'menu-screen', 'pause-screen', 'inventory-screen', 'howto-screen', 'settings-screen'];
    this._bind();
  }

  _bind() {
    const click = (id, fn) => document.getElementById(id)?.addEventListener('click', (e) => {
      e.stopPropagation(); fn?.();
    });
    click('btn-play', () => this.handlers.onPlay?.());
    click('btn-new-world', () => this.handlers.onNewWorld?.());
    click('btn-resume', () => this.handlers.onResume?.());
    click('btn-save-quit', () => this.handlers.onSaveQuit?.());
    click('btn-settings', () => this.showScreen('settings-screen', true));
    click('btn-settings2', () => this.showScreen('settings-screen', true));
    click('btn-settings-back', () => this.showScreen(this._lastMain || 'menu-screen'));
    click('btn-howto', () => this.showScreen('howto-screen', true));
    click('btn-howto-back', () => this.showScreen(this._lastMain || 'menu-screen'));
    click('btn-reward', () => this.handlers.onReward?.());
    click('btn-reward2', () => this.handlers.onReward?.());
    click('btn-home', () => this.handlers.onToSpawn?.());
    click('btn-pause-hud', () => this.handlers.onPauseBtn?.());
    click('btn-inventory-hud', () => this.handlers.onOpenInventory?.());
    click('btn-inventory-back', () => this.handlers.onCloseInventory?.());
    click('btn-eat', () => this.handlers.onEat?.());

    for (const id of ['mode-menu', 'mode-pause']) {
      document.getElementById(id)?.addEventListener('change', (e) => {
        this.setMode(e.target.value);
        this.handlers.onModeChange?.(e.target.value);
      });
    }
    const vol = document.getElementById('set-volume');
    const volLabel = document.getElementById('set-volume-label');
    vol?.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      if (volLabel) volLabel.textContent = vol.value + '%';
      this.handlers.onSettingsChange?.({ volume: v });
    });
    document.getElementById('set-lang')?.addEventListener('change', (e) => {
      this.handlers.onSettingsChange?.({ lang: e.target.value });
    });
    const vd = document.getElementById('set-viewdist');
    const vdLabel = document.getElementById('set-viewdist-label');
    vd?.addEventListener('input', () => {
      if (vdLabel) vdLabel.textContent = vd.value;
      this.handlers.onSettingsChange?.({ viewDistance: Number(vd.value) });
    });
    document.getElementById('set-sound')?.addEventListener('change', (e) => {
      this.handlers.onSettingsChange?.({ sound: e.target.checked });
    });
  }

  applySettings(s) {
    const vol = document.getElementById('set-volume');
    const volLabel = document.getElementById('set-volume-label');
    if (vol) { vol.value = Math.round((s.volume ?? 0.8) * 100); if (volLabel) volLabel.textContent = vol.value + '%'; }
    const lang = document.getElementById('set-lang');
    if (lang) lang.value = s.lang || 'ru';
    const vd = document.getElementById('set-viewdist');
    const vdLabel = document.getElementById('set-viewdist-label');
    if (vd) { vd.value = s.viewDistance ?? 5; if (vdLabel) vdLabel.textContent = vd.value; }
    const snd = document.getElementById('set-sound');
    if (snd) snd.checked = s.sound !== false;
  }

  applyI18n() {
    const t = (k) => this.i18n.t(k);
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    const volTitle = document.getElementById('set-volume-title');
    if (volTitle) volTitle.textContent = t('volume');
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && this._hasSave) btnPlay.textContent = t('continue');
    this.setMode(this.mode || 'survival');
    document.title = `${t('title')} — ${t('tagline')}`;
  }

  setHasSave(v) { this._hasSave = v; }

  setMode(mode) {
    this.mode = mode === 'creative' ? 'creative' : 'survival';
    for (const id of ['mode-menu', 'mode-pause']) {
      const el = document.getElementById(id);
      if (el) el.value = this.mode;
    }
    const label = document.getElementById('mode-label');
    if (label) label.textContent = this.i18n.t(this.mode);
    document.getElementById('hearts')?.classList.toggle('hidden', this.mode === 'creative');
    document.getElementById('food-status')?.classList.toggle('hidden', this.mode === 'creative');
    document.getElementById('xp-hud')?.classList.toggle('hidden', this.mode === 'creative');
    document.getElementById('btn-fly')?.classList.toggle('hidden', this.mode !== 'creative');
  }

  showScreen(id, overlay = false) {
    if (!overlay && (id === 'menu-screen' || id === 'pause-screen')) this._lastMain = id;
    for (const s of this._screens) {
      document.getElementById(s)?.classList.toggle('hidden', s !== id);
    }
    document.getElementById('hud')?.classList.toggle('hidden', id !== 'game');
  }

  showGame() {
    for (const s of this._screens) document.getElementById(s)?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    this.setTouchVisible(true);
  }

  setTouchVisible(v) {
    document.getElementById('touch-controls')?.classList.toggle('hidden', !v);
    document.getElementById('btn-pause-hud')?.classList.toggle('hidden', !v);
    document.getElementById('btn-inventory-hud')?.classList.toggle('hidden', !v);
  }

  setLoading(p, text) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
    const label = document.getElementById('loading-text');
    if (label && text) label.textContent = text;
  }

  buildHotbar(ids, lang) {
    const bar = document.getElementById('hotbar');
    if (!bar) return;
    this.palette = ids;
    bar.innerHTML = '';
    ids.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = i;
      const def = typeof id === 'number' ? BLOCKS[id] : null;
      if (def?.tiles) {
        const icon = def.shape === 'slab' ? slabIcon(def.tiles[2], 44)
          : tileIcon(def.tiles[3] ?? def.tiles[2], 44);
        icon.className = 'slot-icon';
        slot.appendChild(icon);
      } else if (id === ITEM.BOW || id === ITEM.BREAD) {
        const icon = itemIcon(id, 44);
        icon.className = 'slot-icon';
        slot.appendChild(icon);
      } else {
        const symbol = document.createElement('span');
        symbol.className = 'slot-symbol';
        symbol.textContent = ITEM_ICONS[id] || '?';
        slot.appendChild(symbol);
      }
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = i < 9 ? i + 1 : '·';
      slot.appendChild(num);
      const count = document.createElement('span');
      count.className = 'slot-count';
      slot.appendChild(count);
      const tip = document.createElement('div');
      tip.className = 'slot-tip';
      tip.textContent = itemName(slotKey(id), lang);
      slot.appendChild(tip);
      slot.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.handlers.onSlot?.(i); });
      bar.appendChild(slot);
    });
  }

  setHotbarCounts(inventory, mode) {
    document.querySelectorAll('#hotbar .slot').forEach((slot) => {
      const id = this.palette?.[Number(slot.dataset.index)];
      const count = inventory.get(slotKey(id));
      slot.classList.toggle('empty', mode !== 'creative' && count === 0);
      slot.querySelector('.slot-count').textContent = mode === 'creative' ? '∞' : String(count || '');
    });
  }

  setHotbarSelection(i) {
    const bar = document.getElementById('hotbar');
    if (!bar) return;
    for (const el of bar.children) el.classList.toggle('selected', Number(el.dataset.index) === i);
    const selected = bar.children[i];
    if (!selected || bar.classList.contains('hidden')) return;
    const a = selected.getBoundingClientRect(), b = bar.getBoundingClientRect();
    if (a.left < b.left + 8) bar.scrollLeft += a.left - b.left - 8;
    if (a.right > b.right - 8) bar.scrollLeft += a.right - b.right + 8;
  }

  showInventory(inventory, station, mode) {
    const lang = this.i18n.lang;
    const t = (k) => this.i18n.t(k);
    const title = document.getElementById('inventory-title');
    if (title) title.textContent = t(station === 'furnace' ? 'furnace_title' : 'inventory_title');
    const stock = document.getElementById('inventory-stock');
    if (stock) {
      stock.innerHTML = '';
      for (const [key, n] of Object.entries(inventory.counts)) {
        if (n <= 0) continue;
        const chip = document.createElement('span');
        chip.className = 'stock-chip';
        chip.textContent = `${itemName(key, lang)} ×${n}`;
        stock.appendChild(chip);
      }
    }
    const recipes = document.getElementById('inventory-recipes');
    if (!recipes) return;
    recipes.innerHTML = '';
    if (mode === 'creative') {
      const p = document.createElement('p');
      p.textContent = t('creative_hint');
      recipes.appendChild(p);
      return;
    }
    for (const recipe of RECIPES) {
      if (recipe.station && station !== 'furnace') continue;
      const btn = document.createElement('button');
      btn.className = 'recipe-btn';
      btn.disabled = !inventory.canCraft(recipe);
      const name = document.createElement('span');
      name.textContent = `${itemName(recipe.output, lang)} ×${recipe.amount}`;
      const ingredients = document.createElement('small');
      ingredients.textContent = Object.entries(recipe.inputs)
        .map(([key, n]) => `${itemName(key, lang)} ×${n}`).join(' + ') +
        (recipe.fuel ? ` + ${t('fuel')}` : '');
      btn.append(name, ingredients);
      btn.addEventListener('click', () => this.handlers.onCraft?.(recipe.id));
      recipes.appendChild(btn);
    }
  }

  toast(text, ms = 2600) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('in-menu', this._screens.some((s) => !document.getElementById(s)?.classList.contains('hidden')));
    el.classList.add('visible');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('visible'), ms);
  }

  setBreakProgress(p) {
    const el = document.getElementById('break-bar');
    const fill = document.getElementById('break-fill');
    if (!el || !fill) return;
    if (p <= 0) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    fill.style.width = Math.min(100, p * 100) + '%';
  }

  setDebug(visible, fps, pos, light) {
    const el = document.getElementById('debug');
    if (!el) return;
    el.classList.toggle('hidden', !visible);
    if (!visible) return;
    el.textContent =
      `FPS: ${fps.toFixed(0)}  |  XYZ: ${pos.x.toFixed(1)} / ${pos.y.toFixed(1)} / ${pos.z.toFixed(1)}` +
      `  |  ${light > 0.5 ? this.i18n.t('day') : this.i18n.t('night')}` +
      (this._built != null ? `  |  ${this.i18n.t('blocks_built')}: ${this._built}` : '');
  }

  setBlocksBuilt(n) { this._built = n; }
  setUnderwater(on) { document.getElementById('underwater')?.classList.toggle('visible', on); }
  setRotateHint(on) { document.getElementById('rotate-hint')?.classList.toggle('hidden', !on); }

  setRewardButton(unlocked) {
    for (const id of ['btn-reward', 'btn-reward2']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.disabled = unlocked || this.mode === 'creative';
      el.textContent = this.mode === 'creative' ? this.i18n.t('reward_creative')
        : unlocked ? this.i18n.t('reward_got') : this.i18n.t('reward_btn');
    }
  }

  showAdOverlay(on) { document.getElementById('ad-overlay')?.classList.toggle('hidden', !on); }

  setHealth(hp, max = 20) {
    const el = document.getElementById('hearts');
    if (!el) return;
    const n = Math.ceil(max / 2);
    if (el.childElementCount !== n) {
      el.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const sp = document.createElement('span');
        sp.textContent = '♥'; el.appendChild(sp);
      }
    }
    for (let i = 0; i < n; i++) {
      const v = hp - i * 2;
      el.children[i].className = 'heart' + (v >= 2 ? ' full' : v === 1 ? ' half' : '');
    }
  }

  setFood(inventory) {
    const el = document.getElementById('food-status');
    if (el) el.textContent = `F  🍞 ×${inventory.get(ITEM.BREAD)}  🍎 ×${inventory.get(ITEM.APPLE)}   ➶ ×${inventory.get(ITEM.ARROW)}`;
  }

  setXP(level, xp, needed) {
    const label = document.getElementById('xp-level');
    const fill = document.getElementById('xp-fill');
    if (label) label.textContent = level;
    if (fill) fill.style.width = Math.min(100, xp / needed * 100) + '%';
  }

  flashHurt() {
    const el = document.getElementById('hurt-flash');
    if (!el) return;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  flashLightning() {
    const el = document.getElementById('lightning');
    if (!el) return;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
}
