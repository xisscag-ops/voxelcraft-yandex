// Простые процедурные звуки через WebAudio (без внешних файлов)
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.8;
    this.enabled = true;
    this._noiseBuf = null;
  }

  _ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      // Шумовой буфер (1 сек)
      const len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch (e) {
      this.enabled = false;
      return false;
    }
  }

  resume() {
    if (!this._ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.enabled ? v : 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? this.volume : 0;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  _burst({ freq = 800, dur = 0.12, type = 'lowpass', gain = 0.5, q = 1, pitchDrop = 0 }) {
    if (!this.enabled || !this._ensure()) return;
    if (this.ctx.state === 'suspended') return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.playbackRate.value = 0.5 + Math.random() * 0.5;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    if (pitchDrop) {
      filt.frequency.setValueAtTime(freq, t0);
      filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * pitchDrop), t0 + dur);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t0, Math.random() * 0.5, dur + 0.02);
    src.stop(t0 + dur + 0.05);
  }

  _tone({ freq = 440, dur = 0.1, gain = 0.15, type = 'square', slide = 0 }) {
    if (!this.enabled || !this._ensure()) return;
    if (this.ctx.state === 'suspended') return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  dig(kind = 'default') {
    if (kind === 'slow') this._burst({ freq: 1400, dur: 0.09, gain: 0.35, type: 'bandpass', q: 2 });
    else if (kind === 'fast') this._burst({ freq: 500, dur: 0.1, gain: 0.3, pitchDrop: 0.4 });
    else this._burst({ freq: 800, dur: 0.09, gain: 0.3, pitchDrop: 0.5 });
  }

  breakBlock(kind = 'default') {
    this.dig(kind);
    this._burst({ freq: 300, dur: 0.18, gain: 0.4, pitchDrop: 0.3 });
  }

  place() {
    this._burst({ freq: 600, dur: 0.08, gain: 0.35, pitchDrop: 0.6 });
    this._tone({ freq: 180, dur: 0.06, gain: 0.06, type: 'triangle' });
  }

  bowDraw() {
    // Скрип дерева при натяжении
    this._burst({ freq: 900, dur: 0.07, gain: 0.1, type: 'bandpass', q: 4, pitchDrop: 0.7 });
  }

  bowShoot(power = 1) {
    // Щелчок тетивы + свист улетающей стрелы
    this._tone({ freq: 900 + 500 * power, dur: 0.08, gain: 0.12, type: 'triangle', slide: -520 });
    this._burst({ freq: 2400, dur: 0.18, gain: 0.2 * power, type: 'bandpass', q: 1.4, pitchDrop: 0.5 });
    this._tone({ freq: 170, dur: 0.07, gain: 0.08, type: 'square', slide: -50 });
  }

  arrowHitBlock() {
    this._burst({ freq: 1100, dur: 0.07, gain: 0.25, pitchDrop: 0.3 });
    this._burst({ freq: 260, dur: 0.1, gain: 0.14, type: 'lowpass', pitchDrop: 0.5 });
  }

  arrowPickup() {
    this._tone({ freq: 1050, dur: 0.05, gain: 0.07, type: 'square', slide: 180 });
  }

  step(inWater = false) {
    if (inWater) this._burst({ freq: 900, dur: 0.1, gain: 0.12, type: 'bandpass', q: 3 });
    else this._burst({ freq: 420, dur: 0.06, gain: 0.1, pitchDrop: 0.5 });
  }

  jump() { this._tone({ freq: 260, dur: 0.08, gain: 0.05, type: 'sine', slide: 120 }); }
  land() { this._burst({ freq: 250, dur: 0.09, gain: 0.2, pitchDrop: 0.4 }); }
  splash() { this._burst({ freq: 1100, dur: 0.25, gain: 0.3, type: 'bandpass', q: 1.5, pitchDrop: 0.3 }); }
  uiClick() { this._tone({ freq: 700, dur: 0.05, gain: 0.08, type: 'square' }); }
  uiOk() { this._tone({ freq: 520, dur: 0.08, gain: 0.08, type: 'square', slide: 200 }); }
  /** «Нельзя» — низкий короткий сигнал (рецепт требует наковальню, инвентарь полон) */
  deny() { this._tone({ freq: 200, dur: 0.12, gain: 0.09, type: 'square', slide: -60 }); }
  /** Открытие наковальни: тяжёлый металлический звон */
  anvil() {
    this._burst({ freq: 420, dur: 0.12, gain: 0.22, pitchDrop: 0.5 });
    setTimeout(() => this._tone({ freq: 880, dur: 0.22, gain: 0.07, type: 'triangle', slide: -120 }), 40);
    setTimeout(() => this._tone({ freq: 1320, dur: 0.16, gain: 0.04, type: 'sine', slide: -80 }), 90);
  }
  reward() {
    this._tone({ freq: 440, dur: 0.12, gain: 0.1, type: 'square', slide: 220 });
    setTimeout(() => this._tone({ freq: 660, dur: 0.15, gain: 0.1, type: 'square', slide: 220 }), 120);
  }

  // ---- Звуки мобов (vol затухает с расстоянием) ----
  mobHop(vol = 1) {
    this._burst({ freq: 340, dur: 0.05, gain: 0.07 * vol, pitchDrop: 0.5 });
  }
  bleat(vol = 1) {
    // Короткое вибратто — «м-э-э»
    if (!this.enabled || !this._ensure() || this.ctx.state === 'suspended') return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t0);
    // Дрожание
    for (let i = 0; i < 6; i++) {
      osc.frequency.setValueAtTime(270 + (i % 2) * 60, t0 + i * 0.06);
    }
    osc.frequency.linearRampToValueAtTime(210, t0 + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05 * vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.42);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + 0.45);
  }
  chirp(vol = 1) {
    this._tone({ freq: 1850, dur: 0.07, gain: 0.035 * vol, type: 'sine', slide: 650 });
    setTimeout(() => this._tone({ freq: 2100, dur: 0.05, gain: 0.03 * vol, type: 'sine', slide: 400 }), 90);
  }

  // ---- Погода и амбиент ----
  startRainLoop() {
    if (!this.enabled || !this._ensure() || this._rainGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(0, Math.random() * 0.5);
    g.gain.linearRampToValueAtTime(0.11, this.ctx.currentTime + 1.5);
    this._rainGain = g;
    this._rainSrc = src;
  }

  stopRainLoop() {
    if (!this._rainGain) return;
    const g = this._rainGain, s = this._rainSrc;
    this._rainGain = null; this._rainSrc = null;
    g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
    setTimeout(() => { try { s.stop(); } catch (e) { /* noop */ } }, 1400);
  }

  setRainLevel(v) {
    if (v > 0.02) this.startRainLoop();
    else this.stopRainLoop();
    if (this._rainGain) this._rainGain.gain.linearRampToValueAtTime(0.001 + 0.12 * v, this.ctx.currentTime + 0.3);
  }

  thunder() {
    // Низкий раскатистый гром
    this._burst({ freq: 90, dur: 1.6, gain: 0.5, type: 'lowpass', pitchDrop: 0.5 });
    this._burst({ freq: 220, dur: 0.7, gain: 0.18, pitchDrop: 0.4 });
  }

  cricket(vol = 0.35) {
    // Короткий треск сверчка — пара писков
    this._tone({ freq: 4200, dur: 0.04, gain: 0.015 * vol, type: 'triangle' });
    setTimeout(() => this._tone({ freq: 4400, dur: 0.04, gain: 0.015 * vol, type: 'triangle' }), 70);
    setTimeout(() => this._tone({ freq: 4300, dur: 0.04, gain: 0.012 * vol, type: 'triangle' }), 140);
  }

  hurt() {
    // Боль: заметный низкий стон + резкий удар (громче прежнего)
    this._tone({ freq: 210, dur: 0.3, gain: 0.3, type: 'sawtooth', slide: -95 });
    this._tone({ freq: 120, dur: 0.22, gain: 0.22, type: 'square', slide: -40 });
    this._burst({ freq: 420, dur: 0.16, gain: 0.32, pitchDrop: 0.4 });
    this._burst({ freq: 1500, dur: 0.07, gain: 0.2, type: 'bandpass', q: 1.5 });
  }

  die() {
    // Смерть: глубокий вздох
    this._tone({ freq: 150, dur: 0.55, gain: 0.18, type: 'sawtooth', slide: -95 });
    this._burst({ freq: 200, dur: 0.4, gain: 0.14, pitchDrop: 0.6 });
  }

  hitMob() {
    this._burst({ freq: 520, dur: 0.08, gain: 0.3, pitchDrop: 0.5 });
  }

  // Писк/блеяние раненого моба
  mobHurt(type = 'bunny') {
    if (type === 'bunny') {
      this._tone({ freq: 1700, dur: 0.11, gain: 0.13, type: 'sine', slide: 900 });
      setTimeout(() => this._tone({ freq: 2100, dur: 0.07, gain: 0.09, type: 'sine', slide: 500 }), 70);
    } else if (type === 'sheep') {
      this._tone({ freq: 340, dur: 0.28, gain: 0.13, type: 'sawtooth', slide: -120 });
      setTimeout(() => this._tone({ freq: 280, dur: 0.2, gain: 0.1, type: 'sawtooth', slide: -80 }), 130);
    } else if (type === 'slime') {
      this._burst({ freq: 260, dur: 0.18, gain: 0.22, pitchDrop: 0.35, q: 3 });
      setTimeout(() => this._burst({ freq: 900, dur: 0.09, gain: 0.16, type: 'bandpass', q: 2 }), 90);
    } else if (type === 'zombie') {
      this._burst({ freq: 620, dur: 0.3, gain: 0.16, type: 'bandpass', q: 8, pitchDrop: 0.5 });
    } else {
      this._tone({ freq: 900, dur: 0.1, gain: 0.1, type: 'triangle', slide: 300 });
    }
  }

  mobDie() {
    this._burst({ freq: 380, dur: 0.25, gain: 0.25, type: 'bandpass', q: 2, pitchDrop: 0.6 });
  }

  zombieGroan(vol = 1) {
    // Низкое рычание: дрожащий низкий тон + шумовой хрип
    if (!this.enabled || !this._ensure() || this.ctx.state === 'suspended') return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(88, t0);
    osc.frequency.linearRampToValueAtTime(62, t0 + 0.85);
    const trem = this.ctx.createOscillator();
    trem.type = 'sine';
    trem.frequency.value = 17;
    const tremGain = this.ctx.createGain();
    tremGain.gain.value = 0.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.17 * vol, t0 + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
    trem.connect(tremGain);
    tremGain.connect(g.gain);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0); trem.start(t0);
    osc.stop(t0 + 0.95); trem.stop(t0 + 0.95);
    this._burst({ freq: 220, dur: 0.7, gain: 0.09 * vol, type: 'bandpass', q: 4, pitchDrop: 0.4 });
  }

  // ---- Новые мобы: паук, крипер, волк, рыба ----
  bark(vol = 1) {
    // Короткий лай: две резкие «гав»
    this._burst({ freq: 900, dur: 0.07, gain: 0.14 * vol, type: 'bandpass', q: 1.4, pitchDrop: 0.35 });
    setTimeout(() => this._burst({ freq: 760, dur: 0.08, gain: 0.12 * vol, type: 'bandpass', q: 1.4, pitchDrop: 0.3 }), 130);
  }

  hiss() {
    // Шипение паука
    this._burst({ freq: 2600, dur: 0.35, gain: 0.1, type: 'highpass', q: 0.9 });
  }

  fuse() {
    // Крипер: нарастающее шипение перед взрывом
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this._burst({ freq: 1800 + i * 300, dur: 0.09, gain: 0.09, type: 'highpass', q: 1.1 }), i * 130);
    }
  }

  explode() {
    this._burst({ freq: 220, dur: 0.55, gain: 0.5, pitchDrop: 0.25 });
    setTimeout(() => this._burst({ freq: 90, dur: 0.5, gain: 0.35, pitchDrop: 0.4 }), 40);
  }

  flop(vol = 1) {
    // Рыба бьётся на суше
    this._burst({ freq: 700, dur: 0.08, gain: 0.1 * vol, type: 'bandpass', q: 1.6, pitchDrop: 0.5 });
  }

  swim(vol = 1) {
    this._burst({ freq: 1200, dur: 0.14, gain: 0.05 * vol, type: 'bandpass', q: 1.2, pitchDrop: 0.5 });
  }

  // ---- Растения срываются мгновенно: сухой треск ----
  grassRustle() {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this._burst({
          freq: 1900 + Math.random() * 2800,
          dur: 0.03 + Math.random() * 0.03,
          gain: 0.16,
          type: 'highpass',
          q: 0.9,
        });
      }, i * 20 + Math.random() * 14);
    }
    this._burst({ freq: 3200, dur: 0.09, gain: 0.1, type: 'bandpass', q: 1.2, pitchDrop: 0.6 });
  }

  zombieAmbient(vol = 1) {
    // Хрип зомби
    this._burst({ freq: 300, dur: 0.45, gain: 0.1 * vol, type: 'bandpass', q: 7 });
  }

  burn() {
    // Шипение на рассвете
    this._burst({ freq: 2400, dur: 0.6, gain: 0.16, type: 'highpass', q: 0.8 });
  }

  crunch() {
    // Хруст яблока: два быстрых треска
    this._burst({ freq: 900, dur: 0.06, gain: 0.3, pitchDrop: 0.25 });
    setTimeout(() => this._burst({ freq: 700, dur: 0.07, gain: 0.28, pitchDrop: 0.3 }), 110);
  }

  burp() {
    // Довольная отрыжка после еды: низкий короткий «брр»
    this._tone({ freq: 150, dur: 0.22, gain: 0.16, type: 'sawtooth', slide: -60 });
    setTimeout(() => this._tone({ freq: 110, dur: 0.16, gain: 0.12, type: 'triangle', slide: -30 }), 130);
  }

  craft() {
    // «Молоток по верстаку»: два коротких стука и звон
    this._burst({ freq: 700, dur: 0.05, gain: 0.3, pitchDrop: 0.6 });
    setTimeout(() => this._burst({ freq: 520, dur: 0.06, gain: 0.26, pitchDrop: 0.5 }), 70);
    setTimeout(() => this._tone({ freq: 1180, dur: 0.09, gain: 0.09, type: 'triangle', slide: 260 }), 130);
  }

  pickup() {
    this._tone({ freq: 880, dur: 0.07, gain: 0.1, type: 'triangle', slide: 240 });
  }

  xp() {
    this._tone({ freq: 1100, dur: 0.12, gain: 0.07, type: 'sine', slide: 380 });
  }
}
