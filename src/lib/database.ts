let database: Promise<IDBDatabase>;
function open() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('canvaspilot-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('data').objectStore('data').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeLocal(key: string, value: unknown) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('data', 'readwrite');
    transaction.objectStore('data').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage is full.'));
  });
}
