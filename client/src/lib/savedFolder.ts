// A pasta escolhida para as gravações fica lembrada (no IndexedDB do navegador, que guarda o "atalho" para a
// pasta, nunca o conteúdo). Na próxima gravação já vem marcada; o navegador só pede licença de novo se preciso.
const DB = 'concord-gravacao';
const STORE = 'pastas';
const KEY = 'gravacoes';

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return ((await run('readonly', (s) => s.get(KEY))) as FileSystemDirectoryHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveFolder(dir: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    await run<unknown>('readwrite', (s) => (dir ? s.put(dir, KEY) : s.delete(KEY)) as IDBRequest<unknown>);
  } catch {
    // sem IndexedDB (aba privada): só não lembra
  }
}

/** Ainda dá para escrever na pasta? Pede de novo se preciso (tem que ser logo depois do clique). */
export async function canWrite(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dir as PermissionHandle;
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}
