const DB_NAME = 'my-garden-local';
const DB_VERSION = 1;
const STORE = 'records';
const STATE_KEY = 'main-state';
const FALLBACK_KEY = 'my-garden-state-v1';

let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB غير متاح'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر فتح قاعدة البيانات'));
    request.onblocked = () => reject(new Error('قاعدة البيانات قيد الاستخدام في نافذة أخرى'));
  });
  return databasePromise;
}

export async function loadSavedState() {
  try {
    const db = await openDatabase();
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (value) return { state: value, storage: 'indexeddb' };
  } catch (error) {
    console.warn('IndexedDB read fallback:', error);
  }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (raw) return { state: JSON.parse(raw), storage: 'localStorage' };
  } catch (error) {
    console.warn('Fallback read failed:', error);
  }
  return { state: null, storage: 'new' };
}

export async function saveState(state) {
  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(state, STATE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('تعذر حفظ البيانات'));
      tx.onabort = () => reject(tx.error || new Error('أُلغيت عملية الحفظ'));
    });
    try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(state)); } catch { /* IndexedDB remains primary. */ }
    return { ok: true, storage: 'indexeddb' };
  } catch (error) {
    console.warn('IndexedDB write fallback:', error);
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
      return { ok: true, storage: 'localStorage' };
    } catch (fallbackError) {
      return { ok: false, error: fallbackError || error };
    }
  }
}

export function requestPersistentStorage() {
  if (navigator.storage?.persist) return navigator.storage.persist().catch(() => false);
  return Promise.resolve(false);
}
