// Поедание предметов: держим кнопку — персонаж жуёт, отпустили — предмет не тратится.
// Логика вынесена из main.js, чтобы её можно было проверить смоук-тестами.

export const EAT_TIME = 1.15;       // сколько держать кнопку, чтобы съесть предмет
export const CHEW_INTERVAL = 0.3;   // как часто хрустеть во время еды

export class Eating {
  constructor(time = EAT_TIME) {
    this.time = time;
    this.active = false;     // идёт ли поедание прямо сейчас
    this.t = 0;              // сколько уже продержали
    this.chewT = 0;          // таймер следующего хруста
    this.chews = 0;          // сколько раз хрустнули
    this.raised = 0;         // 0..1 — предмет поднесён ко рту (для анимации руки)
  }

  /**
   * @param {number} dt кадр
   * @param {boolean} hold держат ли кнопку
   * @param {boolean} canEat есть ли что есть (еда в руке и здоровье не полное)
   * @returns {'start'|'chew'|'done'|'cancel'|null} событие кадра
   */
  update(dt, hold, canEat = true) {
    const want = !!hold && canEat;
    let event = null;
    if (this.active && !want) {
      this.active = false;
      this.t = 0;
      this.chewT = 0;
      event = 'cancel';
    }
    if (!this.active && want) {
      this.active = true;
      this.t = 0;
      this.chewT = 0;
      event = 'start';
    }
    if (this.active) {
      this.t += dt;
      this.chewT -= dt;
      if (this.chewT <= 0) {
        this.chewT += CHEW_INTERVAL;
        if (event !== 'start') event = 'chew';
      }
      if (this.t >= this.time) {
        this.active = false;
        this.t = 0;
        this.chewT = 0;
        event = 'done';
      }
    }
    // Рука плавно подносит предмет ко рту и так же плавно опускается
    const target = this.active ? 1 : 0;
    this.raised += (target - this.raised) * Math.min(1, dt * 9);
    return event;
  }

  /** Сброс без событий (смерть, пауза) */
  reset() {
    this.active = false;
    this.t = 0;
    this.chewT = 0;
    this.raised = 0;
  }
}
