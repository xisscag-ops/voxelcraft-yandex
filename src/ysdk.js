// Обёртка над SDK Яндекс Игр. Если SDK недоступен (локальный запуск/превью) —
// игра работает с заглушками и localStorage.
export class Ysdk {
  constructor() {
    this.ysdk = null;
    this.player = null;
    this.available = false;
    this.lang = 'ru';
    this._adCooldown = 0;
    this._onPauseForAd = null;
    this._onResumeAfterAd = null;
  }

  /**
   * @param {object} cbs { onPause, onResume } — пауза игры на время рекламы
   */
  async init(cbs = {}) {
    this._onPauseForAd = cbs.onPause || (() => {});
    this._onResumeAfterAd = cbs.onResume || (() => {});
    try {
      await this._loadScript('https://sdk.games.s3.yandex.net/sdk.js', 6000);
      if (!window.YaGames) throw new Error('YaGames not found');
      this.ysdk = await window.YaGames.init();
      this.available = true;
      this.lang = this.ysdk?.environment?.i18n?.lang === 'en' ? 'en' : 'ru';
      try {
        this.player = await this.ysdk.getPlayer({ scopes: false });
      } catch (e) {
        this.player = null;
      }
    } catch (e) {
      console.warn('Yandex Games SDK недоступен, локальный режим:', e?.message || e);
      this.available = false;
    }
    return this.available;
  }

  _loadScript(src, timeoutMs) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      const to = setTimeout(() => reject(new Error('SDK load timeout')), timeoutMs);
      s.onload = () => { clearTimeout(to); resolve(); };
      s.onerror = () => { clearTimeout(to); reject(new Error('SDK load error')); };
      document.head.appendChild(s);
    });
  }

  // Сигнал «игра готова к взаимодействию» (обязателен для модерации Яндекса)
  gameplayReady() {
    try { this.ysdk?.features?.LoadingAPI?.ready(); } catch (e) { /* noop */ }
  }

  gameplayStart() {
    try { this.ysdk?.features?.GameplayAPI?.start(); } catch (e) { /* noop */ }
  }

  gameplayStop() {
    try { this.ysdk?.features?.GameplayAPI?.stop(); } catch (e) { /* noop */ }
  }

  /**
   * Межстраничная реклама (с кулдауном). Возвращает Promise.
   */
  showFullscreen() {
    return new Promise((resolve) => {
      if (!this.available || !this.ysdk?.adv?.showFullscreenAdv) return resolve(false);
      if (Date.now() < this._adCooldown) return resolve(false);
      this._onPauseForAd();
      this.gameplayStop();
      this.ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => { this._onResumeAfterAd(); this.gameplayStart(); resolve(true); },
          onError: () => { this._onResumeAfterAd(); this.gameplayStart(); resolve(false); },
        },
      });
      this._adCooldown = Date.now() + 60000; // Яндекс сам ограничивает частоту, но подстрахуемся
    });
  }

  /**
   * Реклама за вознаграждение. Promise<boolean> — смотрел до конца?
   */
  showRewarded() {
    return new Promise((resolve) => {
      if (!this.available || !this.ysdk?.adv?.showRewardedVideo) return resolve(false);
      this._onPauseForAd();
      this.gameplayStop();
      let got = false;
      this.ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => { got = true; },
          onClose: () => { this._onResumeAfterAd(); this.gameplayStart(); resolve(got); },
          onError: () => { this._onResumeAfterAd(); this.gameplayStart(); resolve(false); },
        },
      });
    });
  }

  // Сохранение данных игрока (облако Яндекса, иначе localStorage)
  async save(data) {
    const payload = JSON.stringify(data);
    try {
      if (this.player?.setData) {
        await this.player.setData({ voxelcraft: data }, true);
        return true;
      }
    } catch (e) { /* fallback ниже */ }
    try {
      localStorage.setItem('voxelcraft_save_v1', payload);
      return true;
    } catch (e) {
      return false;
    }
  }

  async load() {
    try {
      if (this.player?.getData) {
        const d = await this.player.getData(['voxelcraft']);
        if (d && d.voxelcraft) return d.voxelcraft;
      }
    } catch (e) { /* fallback ниже */ }
    try {
      const raw = localStorage.getItem('voxelcraft_save_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // Лучшие результаты / геймплей-достижения (необязательно, безопасно)
  setStats(map) {
    try { this.ysdk?.getLeaderboards?.().then((lb) => lb.setLeaderboardScore('blocks', map.blocks || 0)).catch(() => {}); } catch (e) { /* noop */ }
  }
}
