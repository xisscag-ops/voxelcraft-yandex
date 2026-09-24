// HTML-интерфейс: экраны, хотбар, HUD, тосты, настройки
import { itemIconEl } from './icons.js';
import { itemName, itemDef } from './items.js';

export class UI {
  constructor(i18n) {
    this.i18n = i18n;
    this.handlers = {
      onPlay: null, onResume: null, onSaveQuit: null, onNewWorld: null,
      onSettingsChange: null, onReward: null, onSlot: null, onPauseBtn: null,
      onToSpawn: null, onMode: null, onModeBack: null, onBag: null,
    };
    this._screens = ['loading-screen', 'menu-screen', 'mode-screen', 'pause-screen',
      'howto-screen', 'settings-screen', 'inventory-screen'];
    this._bind();
  }

  _bind() {
    const click = (id, fn) => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        e.stopPropagation();
        fn?.();
      });
    };
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
    click('btn-bag', () => this.handlers.onBag?.());
    click('btn-mode-survival', () => this.handlers.onMode?.('survival'));
    click('btn-mode-creative', () => this.handlers.onMode?.('creative'));
    click('btn-mode-back', () => this.handlers.onModeBack?.());

    // Настройки
    const vol = document.getElementById('set-volume');
    const volLabel = document.getElementById('set-volume-label');
    vol?.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      if (volLabel) volLabel.textContent = vol.value + '%';
      this.handlers.onSettingsChange?.({ volume: v });
    });
    const lang = document.getElementById('set-lang');
    lang?.addEventListener('change', () => {
      this.handlers.onSettingsChange?.({ lang: lang.value });
    });
    const vd = document.getElementById('set-viewdist');
    const vdLabel = document.getElementById('set-viewdist-label');
    vd?.addEventListener('input', () => {
      if (vdLabel) vdLabel.textContent = vd.value;
      this.handlers.onSettingsChange?.({ viewDistance: Number(vd.value) });
    });
    const snd = document.getElementById('set-sound');
    snd?.addEventListener('change', () => {
      this.handlers.onSettingsChange?.({ sound: snd.checked });
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
    // Кнопка «Продолжить», если сейв есть
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay && this._hasSave) btnPlay.textContent = t('continue');
    document.title = `${t('title')} — ${t('tagline')}`;
  }

  /** Подпись режима («Выживание» / «Креатив») на экране паузы */
  showModeLabel(mode) {
    const el = document.getElementById('pause-mode');
    if (!el) return;
    el.textContent = this.i18n.t('mode_now') + ': ' + this.i18n.t(mode === 'survival' ? 'mode_survival' : 'mode_creative');
  }

  setHasSave(v) {
    this._hasSave = v;
    const btnPlay = document.getElementById('btn-play');
    if (btnPlay) btnPlay.textContent = this.i18n.t(v ? 'continue' : 'play');
    document.getElementById('btn-new-world')?.classList.toggle('hidden', !v);
  }

  showScreen(id, overlay = false) {
    if (!overlay && (id === 'menu-screen' || id === 'pause-screen')) this._lastMain = id;
    for (const s of this._screens) {
      document.getElementById(s)?.classList.toggle('hidden', s !== id);
    }
    document.getElementById('hud')?.classList.toggle('hidden', id !== 'game');
    if (id === 'game') {
      document.getElementById('hud')?.classList.remove('hidden');
      for (const s of this._screens) document.getElementById(s)?.classList.add('hidden');
    }
  }

  showGame() {
    for (const s of this._screens) document.getElementById(s)?.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('hidden');
    this.setTouchVisible(true);
  }

  setTouchVisible(v) {
    document.getElementById('touch-controls')?.classList.toggle('hidden', !v);
    document.getElementById('btn-pause-hud')?.classList.toggle('hidden', !v);
  }

  setLoading(p, text) {
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
    const label = document.getElementById('loading-text');
    if (label && text) label.textContent = text;
  }

  // Хотбар: 9 ячеек инвентаря (слоты 0..8) с иконками и счётчиками
  buildHotbar(slots, lang, opts = {}) {
    const bar = document.getElementById('hotbar');
    if (!bar) return;
    this._hotbarSlots = slots;
    bar.innerHTML = '';
    for (let i = 0; i < slots.length; i++) {
      const stack = slots[i];
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.index = i;
      let title = '';
      if (stack) {
        const icon = itemIconEl(stack.key, 44);
        if (icon) slot.appendChild(icon);
        title = itemName(stack.key, lang);
        const inf = opts.creative && itemDef(stack.key)?.kind === 'block';
        if (inf || stack.count > 1) {
          const count = document.createElement('span');
          count.className = 'slot-count';
          count.textContent = inf ? '∞' : String(stack.count);
          slot.appendChild(count);
        }
      }
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = String(i + 1);
      slot.appendChild(num);
      const tip = document.createElement('div');
      tip.className = 'slot-tip';
      tip.textContent = title;
      slot.appendChild(tip);
      slot.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.handlers.onSlot?.(i); });
      bar.appendChild(slot);
    }
  }

  setHotbarSelection(i) {
    document.querySelectorAll('#hotbar .slot').forEach((el, k) => {
      el.classList.toggle('selected', k === i);
    });
  }

  toast(text, ms = 2600) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = text;
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

  setBlocksBuilt(n) {
    this._built = n;
  }

  setUnderwater(on) {
    document.getElementById('underwater')?.classList.toggle('visible', on);
  }

  setRotateHint(on) {
    document.getElementById('rotate-hint')?.classList.toggle('hidden', !on);
  }

  setRewardButton(unlocked) {
    for (const id of ['btn-reward', 'btn-reward2']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.disabled = unlocked;
      el.textContent = unlocked ? this.i18n.t('reward_got') : this.i18n.t('reward_btn');
    }
  }

  showAdOverlay(on) {
    document.getElementById('ad-overlay')?.classList.toggle('hidden', !on);
  }

  setHealthVisible(v) {
    const el = document.getElementById('hearts');
    if (el) el.classList.toggle('hidden', !v);
  }

  blinkHearts() {
    const el = document.getElementById('hearts');
    if (!el) return;
    el.classList.remove('blink');
    void el.offsetWidth;
    el.classList.add('blink');
  }

  shake() {
    const el = document.getElementById('hud');
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  setHealth(hp, max = 20) {
    const el = document.getElementById('hearts');
    if (!el) return;
    const n = Math.ceil(max / 2);
    if (el.childElementCount !== n) {
      el.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const sp = document.createElement('span');
        sp.textContent = '♥';
        el.appendChild(sp);
      }
    }
    for (let i = 0; i < n; i++) {
      const v = hp - i * 2;
      el.children[i].className = 'heart' + (v >= 2 ? ' full' : v === 1 ? ' half' : '');
    }
  }

  setApples(n, mode = 'survival') {
    const el = document.getElementById('apples');
    if (!el) return;
    if (n <= 0 || mode === 'creative') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = this.i18n.t('eat_hint') + ' ×' + n;
  }

  flashHurt() {
    const el = document.getElementById('hurt-flash');
    if (!el) return;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  flashLightning() {
    const el = document.getElementById('lightning');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth; // рестарт анимации
    el.classList.add('flash');
  }
}
