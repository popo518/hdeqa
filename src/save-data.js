// Persistence boundary: only known, bounded values are accepted from localStorage.
export const SAVE_VERSION = 2;
export const SAVE_QUALITY_LEVELS = Object.freeze(['auto', 'low', 'medium', 'high', 'ultra']);
export const SAVE_TASK_TARGETS = Object.freeze({ subhan: 100 });
export const SAVE_BUILD_TYPES = Object.freeze(['flower', 'bush', 'tree', 'bench', 'lantern', 'fountain', 'arch', 'rock']);

function boundedNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function emptyDaily(today) {
  return { day: today, tasks: {} };
}

export function parseGardenSave(raw, today, defaultSeeds = 3) {
  const fallback = {
    quality: 'auto',
    seeds: defaultSeeds,
    daily: emptyDaily(today),
    decorations: [],
  };
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1_000_000) return fallback;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.version !== SAVE_VERSION) return fallback;

  const daily = emptyDaily(today);
  if (data.daily && data.daily.day === today && data.daily.tasks && typeof data.daily.tasks === 'object') {
    for (const [taskId, target] of Object.entries(SAVE_TASK_TARGETS)) {
      const item = data.daily.tasks[taskId];
      const count = Math.floor(boundedNumber(item?.count, 0, target, 0));
      daily.tasks[taskId] = {
        count,
        completed: count >= target && item?.completed === true,
      };
    }
  }

  const decorations = Array.isArray(data.decorations)
    ? data.decorations.slice(0, 900).filter((item) => {
      return item && typeof item === 'object'
        && SAVE_BUILD_TYPES.includes(item.type)
        && Number.isFinite(Number(item.x))
        && Number.isFinite(Number(item.z))
        && Math.abs(Number(item.x)) <= 262
        && Math.abs(Number(item.z)) <= 262;
    }).map((item) => ({
      type: item.type,
      x: boundedNumber(item.x, -262, 262, 0),
      z: boundedNumber(item.z, -262, 262, 0),
      rotation: boundedNumber(item.rotation, -1000, 1000, 0),
    }))
    : [];

  return {
    quality: SAVE_QUALITY_LEVELS.includes(data.quality) ? data.quality : 'auto',
    seeds: Math.floor(boundedNumber(data.seeds, 0, 999999, defaultSeeds)),
    daily,
    decorations,
  };
}

export function serializeGardenSave(state) {
  const payload = {
    version: SAVE_VERSION,
    quality: SAVE_QUALITY_LEVELS.includes(state.quality) ? state.quality : 'auto',
    seeds: Math.floor(boundedNumber(state.seeds, 0, 999999, 0)),
    daily: state.daily,
    decorations: Array.isArray(state.decorations) ? state.decorations.slice(0, 900) : [],
  };
  return JSON.stringify(payload);
}
