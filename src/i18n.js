// Локализация (русский по умолчанию — основная аудитория Яндекс Игр)
export const STRINGS = {
  ru: {
    title: 'VoxelCraft',
    tagline: 'Воксельная песочница',
    play: 'Играть',
    new_world: 'Новый мир',
    worlds: 'Миры',
    worlds_title: 'Сохранённые миры',
    worlds_empty: 'Пока нет сохранённых миров.',
    create_world: 'Создать мир',
    delete_world: 'Удалить мир',
    delete_world_confirm: 'Это действие нельзя отменить.',
    world_name: 'Название мира',
    world_name_placeholder: 'Мой мир',
    world_seed: 'Сид (необязательно)',
    world_seed_placeholder: 'Случайный',
    world_seed_short: 'сид',
    world_mode: 'Режим игры',
    difficulty: 'Сложность',
    difficulty_peaceful: 'Мирная',
    difficulty_easy: 'Лёгкая',
    difficulty_normal: 'Обычная',
    difficulty_hard: 'Сложная',
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
      колесо/1-9 — выбор слота, пробел — прыжок, Ctrl — бег, Shift — красться (в полёте — вниз),
      <b>E</b> — инвентарь и крафт, <b>F</b> — съесть яблоко сразу, Esc — пауза.
      С едой в руке удерживайте <b>ЛКМ</b> — персонаж жуёт, и предмет уходит в дело.<br><br>
      <b>Миры:</b> создавайте отдельные миры, задавайте имя, сид, режим и сложность; прогресс
      каждого мира хранится отдельно. В «Выживании» блоки выпадают в мир — подойдите, чтобы подобрать,
      установка тратит блоки, инструменты ускоряют работу, а мобы наносят урон. В «Креативе» все блоки
      бесконечны, блоки ломаются почти мгновенно, полёт — двойным пробелом, а игрок бессмертен.<br><br>
      <b>Крафт:</b> откройте инвентарь (E). Слева — список рецептов (доступные подсвечены зелёным,
      клик — быстрый крафт), справа вверху — сетка 2×2: кладите предметы ЛКМ/ПКМ и забирайте результат.
      Рецепты «3×3» (кирки, топоры, мечи) требуют <b>верстак</b>: 4 доски в сетке 2×2 → верстак,
      поставьте его и нажмите ПКМ. Железные, золотые и алмазные инструменты куются только
      на <b>наковальне</b> (3 слитка + 4 доски). Стопки в инвентаре можно <b>перетаскивать</b> мышью,
      а Shift+клик перекладывает их в хотбар — если не открыт верстак, печь или сундук.<br><br>
      <b>Добыча:</b> овцы дают шерсть и мясо, волки — мясо и клыки, мясо жарится в печи.
      Две плиты в одной клетке складываются в полный блок, из берёзовых брёвен получаются
      берёзовые доски, а забор не даёт пройти.<br><br>
      <b>Телефон:</b> слева — джойстик, справа — обзор; короткий тап — сломать блок,
      а с едой в руке — удерживайте палец, чтобы поесть.
      Кнопки: прыжок, поставить, копать, слот «🎒» — инвентарь.<br><br>
      Прогресс (мир, инвентарь, яблоки) сохраняется автоматически.`,
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
    hint_guide: 'H — справочник по игре (на телефоне — кнопка с книжкой)',
    cave_warn: 'В темноте пещеры что-то шевелится…',
    loot_found: 'В сундуке припрятаны припасы!',
    guide_title: 'Справочник по игре',
    guide_s1_title: 'Управление',
    guide_s1: 'Движение — WASD или стрелки, прыжок — пробел, бег — двойное W или Ctrl.<br>'
      + 'Приседать — Shift или C (не упадёте с края). Полёт в креативе — двойной пробел.<br>'
      + 'ЛКМ — сломать блок, ПКМ — поставить блок или использовать предмет.<br>'
      + 'Колёсико или 1–9 — слот быстрого доступа, E/I — инвентарь и крафт.<br>'
      + 'H — этот справочник, Esc — пауза (долгое нажатие — выход из полного экрана).<br>'
      + 'На телефоне: виртуальный джойстик слева, кнопки действий справа, книжка — справочник.',
    guide_s2_title: 'Режимы игры',
    guide_s2: '<b>Выживание</b> — здоровье, голод, мобы и падение с высоты. Ресурсы добываются руками и инструментами.<br>'
      + '<b>Креатив</b> — бессмертие, полёт, мгновенное разрушение блоков и полная палитра блоков.<br>'
      + 'Сложность «мирная» отключает враждебных мобов.',
    guide_s3_title: 'Крафт и станки',
    guide_s3: 'Откройте инвентарь (E) — там список рецептов. Для продвинутых рецептов нужен станок:<br>'
      + '<b>Верстак</b> — основа: доски, палки, инструменты, факелы.<br>'
      + '<b>Печь</b> — плавка руды (железо, золото), готовка мяса и хлеба.<br>'
      + '<b>Наковальня</b> — мощные инструменты, включая алмазный молот: он выламывает область 3×3 за один удар.<br>'
      + 'Каменные станки (верстак, печь, наковальня) ставятся как обычные блоки.',
    guide_s4_title: 'Пещеры и ночь',
    guide_s4: 'На карте есть входы в пещеры — воронки и разломы в земле. Внизу темно даже днём: возьмите факелы.<br>'
      + 'В пещерах встречаются руды, лианы, светящиеся грибы и сундуки с лутом.<br>'
      + 'Ночью темнеет по-настоящему: без факелов не видно ничего. Утром нечисть сгорает на солнце — но не под землёй.<br>'
      + 'Лёд скользкий: на нём заносит, а после остановки игрока ещё катит.',
    guide_s5_title: 'Мобы и охота',
    guide_s5: '<b>Птицы и овцы</b> — мирные: из них мясо и перья/шерсть.<br>'
      + '<b>Пауки</b> встречаются и на поверхности ночью, и в пещерах в любое время суток.<br>'
      + '<b>Зомби</b> приходят ночью — постройте укрытие или отбейтесь мечом.<br>'
      + '<b>Криперы</b> взрываются вплотную — бейте издалека, лучше луком.<br>'
      + 'Волки нападают, если их задеть. Рыба плавает в океанах — добывается копьём.',
    guide_s6_title: 'Советы выживальщика',
    guide_s6: 'Ешьте вовремя (F — быстрый перекус). Голод лечит здоровье.<br>'
      + 'Копая вниз, не выкапывайте блок прямо под собой.<br>'
      + 'Мостик в пещере удобнее строить из факелов и досок — факел ещё и освещает.<br>'
      + 'Заблудились? Ставьте заметные столбы или запоминайте вход в пещеру.<br>'
      + 'Вода растекается: пруд заполнится обратно, если вычерпать яму.',

    hint_place: 'ПКМ — поставить блок',
    hint_fly: 'Дважды пробел — полёт (креатив)',
    hint_bow: 'Лук: выберите его в слоте и удерживайте ПКМ, чтобы натянуть тетиву',
    esc_fullscreen: 'Esc — пауза. Чтобы выйти из полного экрана, удерживайте Esc',
    fullscreen_off: 'Полный экран браузера выключен',
    fullscreen: 'Полный экран',
    no_arrows: 'Нет стрел — сделайте их из палки и камня',
    arrow_pickup: 'Стрела подобрана',
    bow_pickup: 'Лук в инвентаре: удерживайте ПКМ, чтобы стрелять',
    to_spawn: 'К спавну',
    to_spawn_ok: 'Вы у дома!',
    rain_start: 'Пошёл дождь…',
    rain_stop: 'Небо проясняется',
    blocks_built: 'Построено блоков',
    died: 'Вы погибли!',
    death_cause_fall: 'Причина: падение.',
    death_cause_creeper: 'Причина: взрыв крипера.',
    death_cause_zombie: 'Причина: атака зомби.',
    death_cause_spider: 'Причина: атака паука.',
    death_cause_wolf: 'Причина: атака волка.',
    death_cause_slime: 'Причина: атака слайма.',
    death_cause_unknown: 'Причина: неизвестна.',
    respawned: 'Возрождение у спавна',
    apple_get: 'Яблоко подобрано (F — съесть)',
    eat_ok: 'Хрусть! +2 сердца',
    eat_none: 'Яблок нет',
    eat_full: 'Ты сыт — здоровье полное',
    mode_title: 'Выберите режим',
    mode_sub: 'Режим сохранится вместе с миром',
    mode_survival: 'Выживание',
    mode_survival_sub: 'Ломайте блоки, собирайте ресурсы и крафтите — мобы опасны',
    mode_creative: 'Креатив',
    mode_creative_sub: 'Все блоки бесконечны, полёт двойным пробелом, бессмертие',
    mode_now: 'Режим',
    inv_title: 'Инвентарь',
    inv_hint: 'ЛКМ — взять/положить стопку, ПКМ — по одному или половину. Стопку можно перетащить мышью в другую ячейку.',
    craft_grid: 'Крафт 2×2',
    craft_hint: 'Собирайте предметы в сетке, результат — справа. Клик по рецепту — быстрый крафт, Shift+клик — переложить (работает, когда верстак/печь/сундук закрыты)',
    table_title: 'Верстак 3×3',
    table_hint: 'ПКМ по верстаку — крафт 3×3',
    need_table: 'Нужен верстак',
    need_table_short: '3×3',
    anvil_title: 'Наковальня',
    anvil_craft_title: 'Ковка 3×3',
    anvil_hint: 'На наковальне куются железные, золотые и алмазные инструменты. Перетащите слитки в сетку или кликните по рецепту слева.',
    anvil_recipes: 'Ковка',
    need_anvil: 'Нужна наковальня: 3 железных слитка + 4 доски → поставьте её и нажмите ПКМ',
    need_anvil_short: 'наковальня',
    anvil_open: 'Наковальня открыта',
    sneak_hint: 'Shift — красться: медленнее, но не упадёте с края',
    music: 'Музыка',
    music_hint: 'Треки берутся из папки music/ (music1.mp3 … music4.mp3)',
    dropped: 'Выпало',
    craft_take: 'Заберите результат',
    craft_nothing: 'Такой рецепт неизвестен',
    table_open: 'Верстак открыт',
    craft_title: 'Крафт',
    craft_ok: 'Скрафчено',
    craft_missing: 'Не хватает материалов',
    craft_no_room: 'Нет места в инвентаре',
    catalog_title: 'Каталог',
    catalog_hint: 'Клик — положить в выбранный слот хотбара',
    catalog_locked: 'Набор строителя закрыт — посмотрите рекламу',
    inv_full: 'Инвентарь полон',
    bag_hint: 'E — инвентарь',
    eat_hint: '🍎 ЛКМ/F',
    fly_creative_only: 'Полёт доступен только в креативе',
    block_drop: 'Подобрано',
    hint_inventory: 'E — инвентарь и крафт',
    hint_eat: 'Яблоко: удерживайте ЛКМ, чтобы съесть (или F — сразу)',
    hint_table: '4 доски в сетке крафта → верстак: на нём открывается крафт 3×3',
    toggle_mode: 'Сменить режим: Выживание/Креатив',
    mode_switched_survival: 'Режим: Выживание',
    mode_switched_creative: 'Режим: Креатив',
    wheat_get: 'Пшеница подобрана (3 → хлеб)',
    bread_get: 'Хлеб подобран',
    furnace_title: 'Плавка',
    furnace_ui_hint: 'ПКМ по печи открывает меню. Shift+клик — быстро переложить сырьё или топливо.',
    chest_title: 'Сундук',
    chest_hint: 'Shift+клик по предмету — мгновенно переложить между сундуком и инвентарём',
    quick_move_hint: 'Shift+клик — быстро переложить предмет',
    furnace_input: 'Сырьё',
    furnace_fuel: 'Топливо',
    furnace_output: 'Результат',
    furnace_slot_input: 'Сюда: сырое железо, сырое золото, песок или булыжник',
    furnace_slot_fuel: 'Сюда: уголь, палки, доски или брёвна',
    furnace_slot_output: 'Здесь появится результат плавки',
    furnace_add_input: 'Положите в печь сырьё: руду, песок или булыжник',
    furnace_add_fuel: 'Добавьте топливо: уголь, палки, доски или брёвна',
    furnace_smelting: 'Печь работает — дождитесь результата',
    furnace_output_full: 'Освободите слот результата, чтобы продолжить плавку',
    furnace_controls: 'ЛКМ — взять стопку, ПКМ — половину; в слот печи ПКМ кладёт один предмет',
    craft_ingredients: 'Материалы',
    zombie_warn: 'Ночью опасно: рядом бродит зомби!',
    xp_get: 'Опыт получен',
  },
  en: {
    title: 'VoxelCraft',
    tagline: 'Voxel sandbox',
    play: 'Play',
    new_world: 'New world',
    worlds: 'Worlds',
    worlds_title: 'Saved worlds',
    worlds_empty: 'No saved worlds yet.',
    create_world: 'Create world',
    delete_world: 'Delete world',
    delete_world_confirm: 'This action cannot be undone.',
    world_name: 'World name',
    world_name_placeholder: 'My world',
    world_seed: 'Seed (optional)',
    world_seed_placeholder: 'Random',
    world_seed_short: 'seed',
    world_mode: 'Game mode',
    difficulty: 'Difficulty',
    difficulty_peaceful: 'Peaceful',
    difficulty_easy: 'Easy',
    difficulty_normal: 'Normal',
    difficulty_hard: 'Hard',
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
      wheel/1-9 — pick slot, Space — jump, Ctrl — sprint, Shift — sneak (down while flying),
      <b>E</b> — inventory & crafting, <b>F</b> — eat an apple instantly, Esc — pause.
      With food in hand hold <b>LMB</b> — the character chews and the item is used up.<br><br>
      <b>Worlds:</b> create separate worlds with a name, seed, mode and difficulty; each keeps its own progress.
      In <b>Survival</b> broken blocks drop into the world, so walk close to collect them; placing consumes blocks,
      tools make work faster and mobs can hurt you. In <b>Creative</b> every block is infinite,
      blocks break almost instantly, double-tap Space flies and you cannot die.<br><br>
      <b>Crafting:</b> open the inventory (E). The recipe list is on the left (available ones are
      green, click for instant crafting), the 2×2 grid is above: place items with LMB/RMB and take the
      result. Recipes marked “3×3” (pickaxes, axes, swords) need a <b>crafting table</b>:
      4 planks in the 2×2 grid → table, place it and press RMB. Iron, golden and diamond tools
      can only be forged on an <b>anvil</b> (3 ingots + 4 planks). Stacks can be <b>dragged</b>
      between slots, and Shift+click moves them to the hotbar — unless a table, furnace or chest is open.<br><br>
      <b>Gathering:</b> sheep drop wool and meat, wolves drop meat and fangs, meat can be cooked
      in a furnace. Two slabs in one cell merge into a full block, birch logs make birch planks,
      and fences block the way.<br><br>
      <b>Mobile:</b> joystick on the left, look on the right; quick tap — break a block,
      with food in hand hold your finger to eat.
      Buttons: jump, place, dig, «🎒» — inventory.<br><br>
      Progress (world, inventory, apples) saves automatically.`,
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
    hint_guide: 'H — open the game guide (use the book button on touch)',
    cave_warn: 'Something stirs in the cave darkness…',
    loot_found: 'Supplies hidden in the chest!',
    guide_title: 'Game guide',
    guide_s1_title: 'Controls',
    guide_s1: 'Move — WASD or arrows, jump — space, sprint — double-W or Ctrl.<br>'
      + 'Sneak — Shift or C (you will not fall off edges). Fly in creative — double space.<br>'
      + 'LMB — break a block, RMB — place a block or use an item.<br>'
      + 'Mouse wheel or 1–9 — hotbar slot, E/I — inventory and crafting.<br>'
      + 'H — this guide, Esc — pause (hold Esc to leave fullscreen).<br>'
      + 'On touch: left joystick moves, action buttons on the right, book button opens the guide.',
    guide_s2_title: 'Game modes',
    guide_s2: '<b>Survival</b> — health, hunger, mobs and fall damage. Gather resources by hand and with tools.<br>'
      + '<b>Creative</b> — invincibility, flight, instant block breaking and the full block palette.<br>'
      + 'Peaceful difficulty turns off hostile mobs.',
    guide_s3_title: 'Crafting and stations',
    guide_s3: 'Open the inventory (E) — the recipe list is there. Advanced recipes need a station:<br>'
      + '<b>Crafting table</b> — basics: planks, sticks, tools, torches.<br>'
      + '<b>Furnace</b> — smelting ores (iron, gold), cooking meat and bread.<br>'
      + '<b>Anvil</b> — powerful tools, including the diamond hammer: it breaks a 3×3 area in one swing.<br>'
      + 'Stone stations (table, furnace, anvil) are placed like regular blocks.',
    guide_s4_title: 'Caves and night',
    guide_s4: 'The map has cave entrances — pits and rifts in the ground. It is dark down there even at noon: bring torches.<br>'
      + 'Caves hold ores, vines, glowing mushrooms and loot chests.<br>'
      + 'Nights get truly dark: without a torch you see nothing. At dawn the undead burn in the sun — but not underground.<br>'
      + 'Ice is slippery: you drift on it and keep sliding after you stop.',
    guide_s5_title: 'Mobs and hunting',
    guide_s5: '<b>Birds and sheep</b> are peaceful: they give meat and feathers/wool.<br>'
      + '<b>Spiders</b> appear on the surface at night and in caves at any time.<br>'
      + '<b>Zombies</b> come at night — build a shelter or fight them off with a sword.<br>'
      + '<b>Creepers</b> explode at point-blank — keep your distance, a bow works best.<br>'
      + 'Wolves attack if provoked. Fish swim in the oceans — catch them with a spear.',
    guide_s6_title: 'Survival tips',
    guide_s6: 'Eat on time (F for a quick snack). Hunger heals you.<br>'
      + 'When digging down, never mine the block right beneath you.<br>'
      + 'Bridge through caves with torches and planks — a torch also lights the way.<br>'
      + 'Lost? Place tall markers or memorize the cave entrance.<br>'
      + 'Water flows: a dug-out pit in the ocean fills back in.',

    hint_place: 'RMB — place a block',
    hint_fly: 'Double-tap Space to fly (Creative)',
    hint_bow: 'Bow: select it and hold RMB to draw the string',
    esc_fullscreen: 'Esc — pause. Hold Esc to leave fullscreen',
    fullscreen_off: 'Browser fullscreen is off',
    fullscreen: 'Fullscreen',
    no_arrows: 'No arrows — craft them from a stick and stone',
    arrow_pickup: 'Arrow picked up',
    bow_pickup: 'Bow in inventory: hold RMB to shoot',
    to_spawn: 'To spawn',
    to_spawn_ok: 'Welcome home!',
    rain_start: 'It starts raining…',
    rain_stop: 'The sky clears up',
    blocks_built: 'Blocks built',
    died: 'You died!',
    death_cause_fall: 'Cause: fall damage.',
    death_cause_creeper: 'Cause: creeper explosion.',
    death_cause_zombie: 'Cause: zombie attack.',
    death_cause_spider: 'Cause: spider attack.',
    death_cause_wolf: 'Cause: wolf attack.',
    death_cause_slime: 'Cause: slime attack.',
    death_cause_unknown: 'Cause: unknown.',
    respawned: 'Respawned at spawn',
    apple_get: 'Apple picked up (F to eat)',
    eat_ok: 'Crunch! +2 hearts',
    eat_none: 'No apples',
    eat_full: 'Not hungry — health is full',
    mode_title: 'Choose a mode',
    mode_sub: 'The mode is stored in this world',
    mode_survival: 'Survival',
    mode_survival_sub: 'Break blocks, gather resources and craft — mobs are dangerous',
    mode_creative: 'Creative',
    mode_creative_sub: 'Infinite blocks, double-tap space to fly, immortal',
    mode_now: 'Mode',
    inv_title: 'Inventory',
    inv_hint: 'LMB — take/put a stack, RMB — one item or half. You can drag a stack into another slot.',
    craft_grid: 'Crafting 2×2',
    craft_hint: 'Arrange items in the grid; the result is on the right. Click a recipe to craft instantly, Shift+click to move items (only when no table/furnace/chest is open)',
    table_title: 'Table 3×3',
    table_hint: 'RMB on a crafting table — 3×3 crafting',
    need_table: 'Crafting table required',
    need_table_short: '3×3',
    anvil_title: 'Anvil',
    anvil_craft_title: 'Smithing 3×3',
    anvil_hint: 'Iron, golden and diamond tools are forged on the anvil. Drag ingots into the grid or click a recipe on the left.',
    anvil_recipes: 'Smithing',
    need_anvil: 'Anvil required: 3 iron ingots + 4 planks → place it and press RMB',
    need_anvil_short: 'anvil',
    anvil_open: 'Anvil opened',
    sneak_hint: 'Shift — sneak: slower, but you will not fall off edges',
    music: 'Music',
    music_hint: 'Tracks are loaded from the music/ folder (music1.mp3 … music4.mp3)',
    dropped: 'Dropped',
    craft_take: 'Take the result',
    craft_nothing: 'Unknown recipe',
    table_open: 'Crafting table opened',
    craft_title: 'Crafting',
    craft_ok: 'Crafted',
    craft_missing: 'Not enough materials',
    craft_no_room: 'No room in inventory',
    catalog_title: 'Catalog',
    catalog_hint: 'Click to put an item into the selected hotbar slot',
    catalog_locked: 'Builder Pack is locked — watch an ad',
    inv_full: 'Inventory is full',
    bag_hint: 'E — inventory',
    eat_hint: '🍎 LMB/F',
    fly_creative_only: 'Flying is available in Creative only',
    block_drop: 'Picked up',
    hint_inventory: 'E — inventory & crafting',
    hint_eat: 'Apple: hold LMB to eat it (or press F instantly)',
    hint_table: '4 planks in the crafting grid → crafting table with 3×3 recipes',
    toggle_mode: 'Switch mode: Survival/Creative',
    mode_switched_survival: 'Mode: Survival',
    mode_switched_creative: 'Mode: Creative',
    wheat_get: 'Wheat picked up (3 → bread)',
    bread_get: 'Bread picked up',
    furnace_title: 'Smelting',
    furnace_ui_hint: 'Right-click the furnace to open it. Shift+click moves ingredients or fuel instantly.',
    chest_title: 'Chest',
    chest_hint: 'Shift+click an item to move it between the chest and your inventory',
    quick_move_hint: 'Shift+click to move an item quickly',
    furnace_input: 'Ingredient',
    furnace_fuel: 'Fuel',
    furnace_output: 'Output',
    furnace_slot_input: 'Accepts raw iron, raw gold, sand or cobblestone',
    furnace_slot_fuel: 'Accepts coal, sticks, planks or logs',
    furnace_slot_output: 'Smelted items appear here',
    furnace_add_input: 'Add an ingredient: ore, sand or cobblestone',
    furnace_add_fuel: 'Add fuel: coal, sticks, planks or logs',
    furnace_smelting: 'Smelting in progress — wait for the result',
    furnace_output_full: 'Collect the output to continue smelting',
    furnace_controls: 'LMB takes a stack, RMB takes half; RMB on a furnace slot places one item',
    craft_ingredients: 'Materials',
    zombie_warn: 'Night is dangerous: a zombie is nearby!',
    xp_get: 'XP gained',
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
