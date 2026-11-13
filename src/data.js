export const GRAPHICS_PROFILES = [
  { id: 'auto', label: 'تلقائي' },
  { id: 'battery', label: 'توفير البطارية' },
  { id: 'very-low', label: 'منخفض جدًا' },
  { id: 'low', label: 'منخفض' },
  { id: 'medium', label: 'متوسط' },
  { id: 'high', label: 'مرتفع' },
  { id: 'ultra', label: 'فائق' },
];

export const TASKS = [
  { id: 'fajr', title: 'صلاة الفجر', description: 'سجّلها بنفسك بعد أدائها.', kind: 'prayer', timeKey: 'fajr', reward: { wood: 2 }, window: 'all' },
  { id: 'dhuhr', title: 'صلاة الظهر', description: 'تذكير اختياري، والإنجاز يُسجّل بتأكيدك.', kind: 'prayer', timeKey: 'dhuhr', reward: { stone: 2 }, window: 'all' },
  { id: 'asr', title: 'صلاة العصر', description: 'سجّل الإنجاز بنفسك؛ التطبيق لا يتحقق من الفعل الواقعي.', kind: 'prayer', timeKey: 'asr', reward: { seeds: 2 }, window: 'all' },
  { id: 'maghrib', title: 'صلاة المغرب', description: 'تذكير اختياري بحسب الوقت الذي تضبطه.', kind: 'prayer', timeKey: 'maghrib', reward: { wood: 2 }, window: 'all' },
  { id: 'isha', title: 'صلاة العشاء', description: 'سجّل الإنجاز بنفسك بعد أدائها.', kind: 'prayer', timeKey: 'isha', reward: { stone: 2 }, window: 'all' },
  { id: 'morning-adhkar', title: 'أذكار الصباح', description: 'اقرأها من مصدر موثوق، ثم سجّل تذكيرك هنا.', kind: 'adhkar', timeKey: 'morning', reward: { seeds: 2, wood: 1 }, window: 'morning' },
  { id: 'evening-adhkar', title: 'أذكار المساء', description: 'اقرأها من مصدر موثوق، ثم سجّل تذكيرك هنا.', kind: 'adhkar', timeKey: 'evening', reward: { seeds: 2, stone: 1 }, window: 'evening' },
  { id: 'quran', title: 'ورد من القرآن', description: 'وردك الشخصي بالقدر الذي اخترته.', kind: 'optional', reward: { seeds: 1, stone: 1 }, window: 'all' },
  { id: 'kindness', title: 'عمل خير أو إحسان', description: 'عمل خير تختاره في يومك.', kind: 'optional', reward: { wood: 2, seeds: 1 }, window: 'all' },
];

export const BUILD_ITEMS = [
  { id: 'flower', name: 'زهرة', emoji: '🌼', description: 'زهرة صغيرة تضيف لونًا للمروج.', cost: { seeds: 2 }, radius: 0.6 },
  { id: 'flowerbed', name: 'أحواض زهور', emoji: '🌷', description: 'مجموعة زهور في رقعة واحدة.', cost: { seeds: 4 }, radius: 1.3 },
  { id: 'tree', name: 'شجرة', emoji: '🌳', description: 'شجرة ظلّ لتزيين الحديقة.', cost: { seeds: 3, wood: 1 }, radius: 1.4 },
  { id: 'bench', name: 'مقعد خشبي', emoji: '🪑', description: 'مكان هادئ بجوار الطبيعة.', cost: { wood: 5 }, radius: 1.5 },
  { id: 'fountain', name: 'نافورة', emoji: '⛲', description: 'نافورة حجرية صغيرة.', cost: { stone: 6, wood: 2 }, radius: 1.8 },
  { id: 'cottage', name: 'كوخ صغير', emoji: '🏡', description: 'بيت ريفي صغير يضيف حياة للمكان.', cost: { wood: 12, stone: 8 }, radius: 3.2 },
];

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createInitialState() {
  const now = new Date().toISOString();
  const starterLots = [
    { id: 'starter-seeds', resource: 'seeds', quantity: 8, remaining: 8, taskId: 'starter-kit', transactionId: 'starter-kit', earnedAt: now },
    { id: 'starter-wood', resource: 'wood', quantity: 12, remaining: 12, taskId: 'starter-kit', transactionId: 'starter-kit', earnedAt: now },
    { id: 'starter-stone', resource: 'stone', quantity: 10, remaining: 10, taskId: 'starter-kit', transactionId: 'starter-kit', earnedAt: now },
  ];
  return {
    schemaVersion: 1,
    worldSeed: Math.floor(Math.random() * 2_000_000_000),
    player: { x: 8, z: 8, yaw: 0 },
    resources: { seeds: 8, wood: 12, stone: 10 },
    resourceLots: starterLots,
    transactions: [{ id: 'starter-kit', type: 'starter', taskId: 'starter-kit', date: localDateKey(), createdAt: now, resources: { seeds: 8, wood: 12, stone: 10 }, note: 'حزمة بداية افتراضية داخل اللعبة' }],
    completions: {},
    placedItems: [],
    history: [{ id: 'welcome', type: 'welcome', title: 'بداية الحديقة', description: 'بدأت رحلتك في عالمك الأخضر.', createdAt: now }],
    settings: {
      graphics: 'auto', movementSpeed: 6, cameraDistance: 10,
      notificationsEnabled: false, morningTime: '07:00', eveningTime: '18:00',
      prayerTimes: { fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' },
      quietHours: false, reducedMotion: false,
    },
    notificationLog: {},
  };
}

export function normalizeState(input) {
  const fresh = createInitialState();
  if (!input || typeof input !== 'object') return fresh;
  const state = { ...fresh, ...input };
  state.player = { ...fresh.player, ...(input.player || {}) };
  state.resources = { ...fresh.resources, ...(input.resources || {}) };
  state.settings = { ...fresh.settings, ...(input.settings || {}) };
  state.settings.prayerTimes = { ...fresh.settings.prayerTimes, ...(input.settings?.prayerTimes || {}) };
  state.resourceLots = Array.isArray(input.resourceLots) ? input.resourceLots : fresh.resourceLots;
  state.transactions = Array.isArray(input.transactions) ? input.transactions : fresh.transactions;
  state.placedItems = Array.isArray(input.placedItems) ? input.placedItems : [];
  state.history = Array.isArray(input.history) ? input.history : fresh.history;
  state.completions = input.completions && typeof input.completions === 'object' ? input.completions : {};
  state.notificationLog = input.notificationLog && typeof input.notificationLog === 'object' ? input.notificationLog : {};
  return state;
}

export function taskInstanceId(taskId, date = localDateKey()) {
  return `${date}:${taskId}`;
}

export function rewardText(reward = {}) {
  const labels = { seeds: 'بذور', wood: 'خشب', stone: 'حجر' };
  return Object.entries(reward).filter(([, value]) => value > 0).map(([key, value]) => `${value} ${labels[key] || key}`).join(' • ') || 'بدون موارد';
}

export function canAfford(resources, cost) {
  return Object.entries(cost).every(([key, amount]) => (resources[key] || 0) >= amount);
}

export function resourceSummary(resources) {
  return [
    { key: 'seeds', label: 'بذور', emoji: '✿' },
    { key: 'wood', label: 'خشب', emoji: '▥' },
    { key: 'stone', label: 'حجر', emoji: '◈' },
  ].map(item => ({ ...item, amount: resources[item.key] || 0 }));
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-JO', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
