// Локализация (русский по умолчанию — основная аудитория Яндекс Игр)
export const STRINGS = {
  ru: {
    title: 'VoxelCraft',
    tagline: 'Воксельная песочница',
    play: 'Играть',
    new_world: 'Новый мир',
    continue: 'Продолжить',
    settings: 'Настройки',
    howto: 'Как играть',
    back: 'Назад',
    resume: 'Продолжить игру',
    save_quit: 'Сохранить и выйти',
    pause: 'Пауза',
    sound: 'Звук',
    language: 'Язык',
    view_distance: 'Дальность прорисовки',
    reward_title: 'Набор строителя',
    reward_desc: 'Посмотрите рекламу и разблокируйте декоративные блоки: стекло, кирпич, светокамень и другие.',
    reward_btn: 'Смотреть рекламу',
    reward_got: 'Набор строителя разблокирован!',
    reward_fail: 'Реклама не загрузилась. Попробуйте позже.',
    ad_loading: 'Загрузка рекламы…',
    saved: 'Игра сохранена',
    save_fail: 'Не удалось сохранить',
    loading: 'Генерация мира…',
    ready: 'Мир готов!',
    howto_text: `
      <b>ПК:</b> WASD — движение, мышь — обзор, ЛКМ — сломать (удерживать), ПКМ — поставить,
      колесо/1-9 — выбор блока, пробел — прыжок, Ctrl — бег, Shift — вниз в полёте,
      двойной пробел или F — режим полёта, Esc — пауза.<br><br>
      <b>Телефон:</b> слева — джойстик, справа — обзор; короткий тап — сломать блок.
      Кнопки: прыжок, поставить, полёт, вниз/вверх.<br><br>
      Ставьте и ломайте блоки, стройте что угодно. Прогресс сохраняется автоматически.`,
    howto_title: 'Как играть',
    pause_hint: 'Esc — пауза и освобождение мыши',
    unlocked_blocks: 'Открыты новые блоки в панели!',
    rotate_device: 'Поверните телефон горизонтально',
    need_space: 'VoxelCraft',
    fps: 'FPS',
    pos: 'Координаты',
    day: 'День',
    night: 'Ночь',
    quit_confirm: 'Выйти в меню? (игра сохранится)',
    close: 'Закрыть',
    volume: 'Громкость',
    music_off: 'Выкл',
    fly_on: 'Режим полёта: включён',
    fly_off: 'Режим полёта: выключен',
    hint_break: 'Удерживайте ЛКМ, чтобы сломать блок',
    hint_place: 'ПКМ — поставить блок',
    hint_fly: 'Дважды пробел — полёт',
  },
  en: {
    title: 'VoxelCraft',
    tagline: 'Voxel sandbox',
    play: 'Play',
    new_world: 'New world',
    continue: 'Continue',
    settings: 'Settings',
    howto: 'How to play',
    back: 'Back',
    resume: 'Resume',
    save_quit: 'Save & quit',
    pause: 'Pause',
    sound: 'Sound',
    language: 'Language',
    view_distance: 'View distance',
    reward_title: 'Builder Pack',
    reward_desc: 'Watch an ad to unlock decorative blocks: glass, brick, glowstone and more.',
    reward_btn: 'Watch ad',
    reward_got: 'Builder Pack unlocked!',
    reward_fail: 'Ad failed to load. Try again later.',
    ad_loading: 'Loading ad…',
    saved: 'Game saved',
    save_fail: 'Save failed',
    loading: 'Generating world…',
    ready: 'World ready!',
    howto_text: `
      <b>Desktop:</b> WASD — move, mouse — look, LMB — break (hold), RMB — place,
      wheel/1-9 — pick block, Space — jump, Ctrl — sprint, Shift — down while flying,
      double-tap Space or F — fly mode, Esc — pause.<br><br>
      <b>Mobile:</b> joystick on the left, look on the right; quick tap — break a block.
      Buttons: jump, place, fly, up/down.<br><br>
      Break and place blocks, build anything. Click a mob to scare it away.
      Progress saves automatically.`,
    howto_title: 'How to play',
    pause_hint: 'Esc — pause & release mouse',
    unlocked_blocks: 'New blocks unlocked in the hotbar!',
    rotate_device: 'Rotate your phone to landscape',
    need_space: 'VoxelCraft',
    fps: 'FPS',
    pos: 'Position',
    day: 'Day',
    night: 'Night',
    quit_confirm: 'Quit to menu? (game will save)',
    close: 'Close',
    volume: 'Volume',
    music_off: 'Off',
    fly_on: 'Fly mode: on',
    fly_off: 'Fly mode: off',
    hint_break: 'Hold LMB to break a block',
    hint_place: 'RMB — place a block',
    hint_fly: 'Double-tap Space to fly',
  },
};

export class I18n {
  constructor(lang = 'ru') {
    this.lang = STRINGS[lang] ? lang : 'ru';
  }
  t(key) {
    return STRINGS[this.lang][key] ?? STRINGS.ru[key] ?? key;
  }
  setLang(lang) {
    if (STRINGS[lang]) this.lang = lang;
  }
}
