// Миграция старого одиночного сохранения и структура списка миров.
export const WORLD_DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];

export function emptyWorldProfile() {
  return {
    profileVersion: 1,
    activeWorldId: null,
    worlds: [],
    settings: {},
    paletteUnlocked: false,
  };
}

function safeMode(value) {
  return value === 'survival' ? 'survival' : 'creative';
}

function safeDifficulty(value) {
  return WORLD_DIFFICULTIES.includes(value) ? value : 'normal';
}

function safeWorldRecord(record, index) {
  if (!record || typeof record !== 'object') return null;
  const seed = Number.isFinite(Number(record.seed)) ? Number(record.seed) | 0 : 0;
  const id = String(record.id || `world-${index + 1}-${seed}`);
  return {
    id,
    name: String(record.name || `Мир ${index + 1}`).slice(0, 32),
    seed,
    difficulty: safeDifficulty(record.difficulty ?? record.save?.difficulty),
    mode: safeMode(record.mode ?? record.save?.mode),
    save: record.save && typeof record.save === 'object' ? record.save : null,
    createdAt: Number(record.createdAt) || 0,
    updatedAt: Number(record.updatedAt) || 0,
  };
}

/**
 * Преобразует текущий профиль или прежний одиночный сейв в безопасный профиль.
 * Старый мир не теряется — он становится первым миром списка.
 */
export function normalizeWorldProfile(raw) {
  if (raw && raw.profileVersion === 1 && Array.isArray(raw.worlds)) {
    const worlds = raw.worlds.map(safeWorldRecord).filter(Boolean);
    const requestedId = String(raw.activeWorldId || '');
    const activeWorldId = worlds.some((world) => world.id === requestedId)
      ? requestedId
      : (worlds[0]?.id ?? null);
    return {
      profileVersion: 1,
      activeWorldId,
      worlds,
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      paletteUnlocked: !!raw.paletteUnlocked,
    };
  }

  if (raw && typeof raw === 'object' && raw.seed != null) {
    const seed = Number(raw.seed) | 0;
    const record = safeWorldRecord({
      id: `legacy-${seed}`,
      name: raw.worldName || 'Старый мир',
      seed,
      difficulty: raw.difficulty,
      mode: raw.mode,
      save: raw,
    }, 0);
    return {
      profileVersion: 1,
      activeWorldId: record.id,
      worlds: [record],
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      paletteUnlocked: !!raw.paletteUnlocked,
    };
  }

  return emptyWorldProfile();
}

export function createWorldRecord({ name, seed, difficulty = 'normal', mode = 'survival' }, now = Date.now(), random = Math.random) {
  const normalizedSeed = Number(seed) | 0;
  const suffix = Math.floor(random() * 0x100000000).toString(36);
  return {
    id: `world-${Number(now).toString(36)}-${suffix}`,
    name: String(name || '').trim().slice(0, 32) || 'Новый мир',
    seed: normalizedSeed,
    difficulty: safeDifficulty(difficulty),
    mode: safeMode(mode),
    save: null,
    createdAt: Number(now) || Date.now(),
    updatedAt: Number(now) || Date.now(),
  };
}

export function serializeWorldProfile(profile, activeSave = null, settings = null, paletteUnlocked = false) {
  const worlds = profile.worlds.map((world) => world.id === profile.activeWorldId && activeSave
    ? { ...world, save: activeSave, seed: activeSave.seed | 0,
      mode: safeMode(activeSave.mode), difficulty: safeDifficulty(activeSave.difficulty),
      updatedAt: Date.now() }
    : { ...world });
  return {
    profileVersion: 1,
    activeWorldId: worlds.some((world) => world.id === profile.activeWorldId)
      ? profile.activeWorldId
      : (worlds[0]?.id ?? null),
    worlds,
    settings: settings && typeof settings === 'object' ? { ...settings } : { ...profile.settings },
    paletteUnlocked: !!paletteUnlocked,
  };
}
