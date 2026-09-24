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

  step(inWater = false) {
    if (inWater) this._burst({ freq: 900, dur: 0.1, gain: 0.12, type: 'bandpass', q: 3 });
    else this._burst({ freq: 420, dur: 0.06, gain: 0.1, pitchDrop: 0.5 });
  }

  jump() { this._tone({ freq: 260, dur: 0.08, gain: 0.05, type: 'sine', slide: 120 }); }
  land() { this._burst({ freq: 250, dur: 0.09, gain: 0.2, pitchDrop: 0.4 }); }
  splash() { this._burst({ freq: 1100, dur: 0.25, gain: 0.3, type: 'bandpass', q: 1.5, pitchDrop: 0.3 }); }
  uiClick() { this._tone({ freq: 700, dur: 0.05, gain: 0.08, type: 'square' }); }
  uiOk() { this._tone({ freq: 520, dur: 0.08, gain: 0.08, type: 'square', slide: 200 }); }
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
}
