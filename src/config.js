// Глобальные настройки игры
export const CONFIG = {
  // Мир
  CHUNK_SIZE: 16,
  WORLD_HEIGHT: 64,
  SEA_LEVEL: 22,
  VIEW_DISTANCE: 5,          // в чанках
  MAX_MESH_PER_FRAME: 2,     // чанков на кадр

  // Игрок
  PLAYER_WIDTH: 0.6,
  PLAYER_HEIGHT: 1.8,
  PLAYER_EYE: 1.62,
  GRAVITY: 28,
  JUMP_SPEED: 8.6,
  WALK_SPEED: 4.5,
  SPRINT_SPEED: 7.0,
  FLY_SPEED: 10,
  SWIM_SPEED: 3.0,
  REACH: 6,

  // Разрушение блоков (секунды удержания ЛКМ)
  BREAK_TIME: {
    default: 0.45,
    slow: 0.9,      // камень, кирпич, стекло
    fast: 0.25,     // земля, песок, листва
    instant: 0.08,  // трава, цветы
  },

  // Прочее
  SAVE_KEY: 'voxelcraft_save_v1',
  AUTO_SAVE_SEC: 30,
  INTERSTITIAL_MIN_SEC: 45,  // после стольких секунд игры можно показывать межстраничную рекламу
  INTERSTITIAL_COOLDOWN_MS: 3 * 60 * 1000,
};
