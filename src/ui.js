// HTML-интерфейс: экраны, хотбар, HUD, тосты, настройки
import { itemName } from './inventory.js';
import { itemIconCopy } from './icons.js';

export class UI {
  constructor(i18n) {
    this.i18n = i18n;
    this.handlers = {
      onPlay: null, onResume: null, onSaveQuit: null, onNewWorld: null,
      onSettingsChange: null, onReward: null, onSlot: null, onPauseBtn: null,
      onToSpawn: null, onMode: null, onModeBack: null,
    };
    this._screens = ['loading-screen', 'menu-screen', 'mode-screen', 'pause-screen', 'howto-screen', 'settings-screen'];
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
    click('btn-mode-survival', () => this.handlers.onMode?.('survival'));
    click('btn-mode-creative', () => this.handlers.onMode?.('creative'));
    click('btn-mode-back', () => this.handlers.onModeBack?.());
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

  setHasSave(v) {
    this._hasSave = v;
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

  // Хотбар: первые 9 ячеек инвентаря. В креативе счётчик не показываем (бесконечно)
  refreshHotbar(inv, mode, selected, lang) {
    const bar = document.getElementById('hotbar');
    if (!bar) return;
    bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === selected ? ' selected' : '');
      slot.dataset.index = i;
      const it = inv.slots[i];
      if (it) {
        const icon = itemIconCopy(it.id, 44);
        icon.className = 'slot-icon';
        slot.appendChild(icon);
        if (mode === 'survival' && it.n > 1) {
          const cnt = document.createElement('span');
          cnt.className = 'slot-count';
          cnt.textContent = it.n;
          slot.appendChild(cnt);
        }
        const tip = document.createElement('div');
        tip.className = 'slot-tip';
        tip.textContent = itemName(it.id, lang);
        slot.appendChild(tip);
      }
      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = i + 1;
      slot.appendChild(num);
      slot.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.handlers.onSlot?.(i); });
      bar.appendChild(slot);
    }
  }

  setHotbarSelection(i) {
    document.querySelectorAll('#hotbar .slot').forEach((el, k) => {
      el.classList.toggle('selected', k === i);
    });
  }

  // Режим: в креативе скрываем сердечки и еду, в выживании прячем кнопку полёта
  setMode(mode) {
    this._mode = mode;
    document.getElementById('status-row')?.classList.toggle('hidden', mode === 'creative');
    document.getElementById('btn-fly')?.classList.toggle('hidden', mode !== 'creative');
  }

  // Встряска интерфейса при уроне
  shakeUI() {
    const el = document.getElementById('hud');
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // Мигание сердечек при уроне
  blinkHearts() {
    const el = document.getElementById('hearts');
    if (!el) return;
    el.classList.remove('blink');
    void el.offsetWidth;
    el.classList.add('blink');
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

  setApples(n) {
    const el = document.getElementById('apples');
    if (!el) return;
    el.classList.toggle('hidden', n <= 0);
    el.textContent = 'F  🍎 ×' + n;
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
