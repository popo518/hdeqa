const DB_NAME = 'hadiqati-db';
const DB_VERSION = 1;
const STORES = ['profiles','gardens','tasks','sessions','inventory','objects','settings','favorites','history','syncQueue'];

let dbPromise;

export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية.'));
    request.onblocked = () => reject(new Error('قاعدة البيانات مشغولة في نافذة أخرى. أغلق النسخ الأخرى ثم أعد المحاولة.'));
  });
  return dbPromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('فشلت عملية قاعدة البيانات.'));
  });
}

export async function readAll(storeName) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).getAll());
}

export async function readOne(storeName, id) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).get(id));
}

export async function writeOne(storeName, record) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(record);
  await transactionDone(tx);
  return record;
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('لم يكتمل حفظ البيانات.'));
    tx.onabort = () => reject(tx.error || new Error('تم إلغاء عملية الحفظ.'));
  });
}

export async function loadSnapshot() {
  const db = await openDatabase();
  const tx = db.transaction(STORES, 'readonly');
  const values = await Promise.all(STORES.map(name => requestResult(tx.objectStore(name).getAll())));
  const records = Object.fromEntries(STORES.map((name, i) => [name, values[i]]));
  return {
    schemaVersion: DB_VERSION,
    profile: records.profiles.find(x => x.id === 'current') || null,
    garden: records.gardens.find(x => x.id === 'current') || null,
    tasks: records.tasks,
    sessions: records.sessions,
    inventory: records.inventory,
    objects: records.objects,
    settings: records.settings.find(x => x.id === 'current') || null,
    favorites: records.favorites,
    history: records.history.slice(-500),
    syncQueue: records.syncQueue
  };
}

export async function saveSnapshot(snapshot) {
  const db = await openDatabase();
  const names = STORES;
  const tx = db.transaction(names, 'readwrite');
  const records = {
    profiles: snapshot.profile ? [snapshot.profile] : [],
    gardens: snapshot.garden ? [snapshot.garden] : [],
    tasks: snapshot.tasks || [],
    sessions: snapshot.sessions || [],
    inventory: snapshot.inventory || [],
    objects: snapshot.objects || [],
    settings: snapshot.settings ? [snapshot.settings] : [],
    favorites: snapshot.favorites || [],
    history: (snapshot.history || []).slice(-500),
    syncQueue: snapshot.syncQueue || []
  };
  for (const name of names) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of records[name]) store.put(record);
  }
  await transactionDone(tx);
  return true;
}

export async function clearUserData() {
  const db = await openDatabase();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  await transactionDone(tx);
}

export async function exportBackup(snapshot) {
  const safe = structuredClone(snapshot);
  if (safe.settings) {
    delete safe.settings.supabaseUrl;
    delete safe.settings.supabaseAnonKey;
  }
  return {
    app: 'حديقتي',
    format: 'hadiqati-backup',
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    snapshot: safe
  };
}

export function validateBackup(payload) {
  if (!payload || payload.format !== 'hadiqati-backup' || !payload.snapshot) {
    throw new Error('الملف ليس نسخة احتياطية صالحة لتطبيق حديقتي.');
  }
  const s = payload.snapshot;
  if (!Number.isInteger(payload.schemaVersion) || payload.schemaVersion > DB_VERSION || payload.schemaVersion < 1) {
    throw new Error('إصدار النسخة غير مدعوم.');
  }
  for (const key of ['tasks','sessions','inventory','objects','favorites','history']) {
    if (!Array.isArray(s[key])) throw new Error(`بيانات ${key} غير صالحة.`);
    if (s[key].length > 10000) throw new Error('النسخة تحتوي سجلات أكثر من الحد المسموح.');
  }
  if (!s.profile || typeof s.profile.nickname !== 'string' || !s.garden || !s.settings) throw new Error('النسخة ناقصة؛ لم يتم تغيير بياناتك الحالية.');
  if (!s.garden.playerPosition || !Number.isFinite(s.garden.playerPosition.x) || !Number.isFinite(s.garden.playerPosition.y)) throw new Error('إحداثيات الشخصية في النسخة غير صالحة.');
  if (s.objects.some(o => !o || typeof o.id !== 'string' || !['sapling','palm','flower','bench','fountain','lamp'].includes(o.itemId) || !Number.isFinite(o.x) || !Number.isFinite(o.y))) throw new Error('تحتوي النسخة على عنصر أو إحداثيات غير صالحة.');
  if (s.tasks.some(t => !t || typeof t.id !== 'string' || typeof t.title !== 'string' || t.title.length > 80)) throw new Error('تحتوي النسخة على مهمة غير صالحة.');
  if (s.inventory.some(i => !i || typeof i.itemId !== 'string' || !Number.isInteger(i.count) || i.count < 0 || i.count > 10000)) throw new Error('بيانات المخزون غير صالحة.');
  const jsonSize = new Blob([JSON.stringify(payload)]).size;
  if (jsonSize > 8 * 1024 * 1024) throw new Error('حجم النسخة أكبر من 8 ميغابايت.');
  return s;
}

export async function getMeta(id) {
  return readOne('meta', id);
}

export async function setMeta(id, value) {
  return writeOne('meta', { id, value, updatedAt: new Date().toISOString() });
}
