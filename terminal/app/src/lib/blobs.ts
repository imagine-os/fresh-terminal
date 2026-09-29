/**
 * Image bytes for skins live in this browser's IndexedDB (records hold only
 * an "idb:<key>" reference). No media is stored server-side yet; see Canon
 * C-053 for the R2 plan. Falls back to memory when IndexedDB is unavailable.
 */
const DB_NAME = 'fresh-terminal-blobs';
const STORE = 'blobs';
const memory = new Map<string, Blob>();
const urls = new Map<string, string>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  memory.set(key, blob);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getBlob(key: string): Promise<Blob | null> {
  const cached = memory.get(key);
  if (cached) return cached;
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => {
        const blob = request.result instanceof Blob ? request.result : null;
        if (blob) memory.set(key, blob);
        resolve(blob);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** "idb:<key>" → object URL; https refs pass through; null when missing. */
export async function resolveImageRef(ref: string): Promise<string | null> {
  if (!ref.startsWith('idb:')) return ref;
  const key = ref.slice(4);
  const known = urls.get(key);
  if (known) return known;
  const blob = await getBlob(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

/** Re-encodes a generated PNG data URL as a JPEG (max 1600 px wide) to keep storage small. */
export async function compressDataUrl(dataUrl: string, maxWidth = 1600, quality = 0.82): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const image = new Image();
  image.decoding = 'async';
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d canvas');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('encode failed'))), 'image/jpeg', quality));
  const jpeg = canvas.toDataURL('image/jpeg', 0.7);
  return { blob, dataUrl: jpeg, width, height };
}
