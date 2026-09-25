// Фоновая музыка игры.
//
// Положите свои треки в папку music/ рядом с index.html (mp3 или ogg) —
// они подхватятся автоматически и будут играть во время геймплея.
// Файлы ищутся по списку MUSIC_FILES: music1, music2, music3, …
// (можно также бросить один файл с именем theme.mp3 / theme.ogg).
//
// Музыка играет только в состоянии «game», плавно затихает в меню, паузе
// и инвентаре, и полностью подчиняется общей громкости и выключателю звука.
// Если файлов нет — ничего не происходит (игра остаётся полностью офлайновой).

export const MUSIC_DIR = 'music/';
export const MUSIC_FILES = [
  'music1.mp3', 'music2.mp3', 'music3.mp3', 'music4.mp3',
  'theme.mp3',
  'music1.ogg', 'music2.ogg', 'music3.ogg', 'music4.ogg',
  'theme.ogg',
];

export class Music {
  /**
   * @param {object} opts
   * @param {(path: string) => Promise<boolean>} opts.probe проверка доступности файла
   * @param {(path: string) => HTMLAudioElement} opts.create создание элемента
   */
  constructor(opts = {}) {
    this.dir = opts.dir || MUSIC_DIR;
    this.files = opts.files || MUSIC_FILES;
    this.probe = opts.probe || defaultProbe;
    this.create = opts.create || defaultCreate;
    // Если проверка файлов недоступна (сервер не отвечает на HEAD, игра лежит
    // не по http), считаем, что треки могут быть, и доверяем ошибке <audio>:
    // несуществующий файл сам выпадет из плейлиста.
    this.assumeOnProbeFailure = opts.assumeOnProbeFailure !== false;
    this.playlist = [];
    this.audio = null;
    this.index = -1;
    this.enabled = true;
    this.volume = 0.45;          // музыка тише эффектов
    this.ducking = 1;            // 1 — игра, 0.22 — меню/пауза
    this._targetDuck = 1;
    this._loaded = false;
    this._loading = false;
    this._ready = false;
  }

  /** Один раз ищем, какие треки лежат в папке music/ */
  async discover() {
    if (this._loaded || this._loading) return this.playlist;
    this._loading = true;
    const found = [];
    let probeFailed = false;
    for (const file of this.files) {
      let ok = false;
      try {
        // eslint-disable-next-line no-await-in-loop
        ok = await this.probe(this.dir + file);
      } catch (e) {
        probeFailed = true;
        ok = false;
      }
      if (ok) found.push(this.dir + file);
    }
    // Ни один файл не подтверждён и проверка вообще не работает — берём весь
    // список, лишнее отсеит обработчик error в _next().
    this.playlist = found.length === 0 && probeFailed && this.assumeOnProbeFailure
      ? this.files.map((f) => this.dir + f)
      : found;
    this._loaded = true;
    this._loading = false;
    return found;
  }

  get available() { return this.playlist.length > 0; }

  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this._setGain(0);
    else this._applyGain();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this._applyGain();
  }

  /** Играем (геймплей) или приглушаем (меню, пауза, инвентарь) */
  setPlaying(on) {
    this._targetDuck = on ? 1 : 0.18;
    if (on) void this._start();
    this._applyGain();
  }

  async _start() {
    if (!this._loaded) await this.discover();
    if (!this.available || !this._ready) {
      this._ready = true;
      this._next();
    }
    if (this.audio && this.audio.paused) {
      try { await this.audio.play(); } catch (e) { /* автоплей заблокирован — попробуем позже */ }
    }
  }

  _next() {
    if (!this.available) return;
    const shuffle = this.playlist.length > 1;
    let next = shuffle ? (Math.random() * this.playlist.length) | 0 : (this.index + 1) % this.playlist.length;
    if (shuffle && this.playlist.length > 2 && next === this.index) next = (next + 1) % this.playlist.length;
    this.index = next;
    const src = this.playlist[next];
    const audio = this.create(src);
    audio.loop = !shuffle;
    audio.volume = 0;
    audio.addEventListener('ended', () => { if (audio === this.audio) this._next(); });
    audio.addEventListener('error', () => {
      // битый/недоступный файл — убираем из списка и пробуем следующий
      this.playlist = this.playlist.filter((p) => p !== src);
      if (audio === this.audio) { this.audio = null; setTimeout(() => this._next(), 400); }
    });
    this.audio = audio;
    this._applyGain();
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* ждём жеста пользователя */ });
  }

  _applyGain() {
    const target = this.enabled ? this.volume * this.ducking : 0;
    this._setGain(target);
  }

  _setGain(v) {
    if (this.audio) {
      try { this.audio.volume = Math.max(0, Math.min(1, v)); } catch (e) { /* noop */ }
    }
  }

  /** Плавное затухание/нарастание громкости (вызывается из игрового цикла) */
  update(dt) {
    if (Math.abs(this.ducking - this._targetDuck) < 0.005) {
      this.ducking = this._targetDuck;
    } else {
      this.ducking += (this._targetDuck - this.ducking) * Math.min(1, dt * 3);
    }
    this._applyGain();
  }

  pause() {
    if (this.audio && !this.audio.paused) this.audio.pause();
  }

  resume() {
    if (this.audio && this.audio.paused && this._targetDuck > 0.5) {
      const p = this.audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
}

function defaultProbe(path) {
  return fetch(path, { method: 'HEAD' }).then((r) => r.ok);
}

function defaultCreate(path) {
  const audio = new Audio(path);
  audio.preload = 'auto';
  return audio;
}
