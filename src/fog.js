// Пещерный туман: насколько игрок «под землёй» и как быстро мгла приходит/уходит.
// Вынесено из главного цикла отдельным модулем, чтобы значения и сглаживание
// проверялись тестом без браузера (см. smoke-test.mjs).
export const CAVE_FOG_NEAR = 6;          // ближняя граница мглы под землёй
export const CAVE_FOG_FAR = 38;          // дальняя граница: в пещере видно дальше, чем раньше
export const CAVE_FOG_COLOR = 0x0a0e16;  // цвет мглы под землёй
export const CAVE_OPEN_CAP = 0.35;       // в открытом колодце/яме тьма не такая глухая
export const CAVE_FOG_ATTACK = 3.2;      // скорость сгущения, 1/с
export const CAVE_FOG_RELEASE = 1.6;     // скорость рассеивания, 1/с

/**
 * Насколько глубоко игрок под поверхностью.
 * @param {number} surfaceH высота поверхности в колонке игрока
 * @param {number} y позиция ног игрока
 * @param {boolean} roofOpen видно ли небо над головой (сквозь колодец, яму)
 */
export function caveFogTarget(surfaceH, y, roofOpen) {
  const raw = Math.max(0, Math.min(1, (surfaceH - 5 - y) / 9));
  return raw * (roofOpen ? CAVE_OPEN_CAP : 1);
}

/**
 * Сглаживает «подземность» во времени: мгла приходит быстрее, чем уходит,
 * поэтому короткий провал в яму не гасит экран мгновенно.
 * @param {number} prev предыдущее значение (0..1)
 * @param {number} target целевое значение (0..1)
 * @param {number} dt секунды
 */
export function stepCaveFog(prev, target, dt) {
  const rate = target > prev ? CAVE_FOG_ATTACK : CAVE_FOG_RELEASE;
  const k = 1 - Math.exp(-rate * dt);
  const v = prev + (target - prev) * k;
  return v < 0.01 ? 0 : v;
}
