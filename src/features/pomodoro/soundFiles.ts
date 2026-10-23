/**
 * The user's own audio files, kept in IndexedDB. They can be large, and they are
 * tied to this device, so they do not belong in Firestore with the rest of the data.
 */

export interface SoundFile {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

const DB = 'planner-sounds';
const STORE = 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('音源の保存先を開けませんでした'));
    };
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('音源の読み書きに失敗しました'));
      }),
  );
}

export const listSoundFiles = () => run<SoundFile[]>('readonly', (s) => s.getAll() as IDBRequest<SoundFile[]>);
export const getSoundFile = (id: string) => run<SoundFile | undefined>('readonly', (s) => s.get(id) as IDBRequest<SoundFile | undefined>);
export const deleteSoundFile = (id: string) => run<undefined>('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);

export async function putSoundFile(id: string, file: File): Promise<SoundFile> {
  const rec: SoundFile = { id, name: file.name, blob: file, addedAt: Date.now() };
  await run('readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>);
  return rec;
}
