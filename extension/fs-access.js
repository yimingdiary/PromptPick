const DB_NAME = "promptnest-extension";
const STORE_NAME = "handles";
const ROOT_KEY = "project-root";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);

    Promise.resolve(callback(store, transaction)).then(resolve).catch(reject);
  });
}

export async function saveProjectRootHandle(handle) {
  return withStore("readwrite", (store) => {
    store.put(handle, ROOT_KEY);
  });
}

export async function getProjectRootHandle() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ROOT_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearProjectRootHandle() {
  return withStore("readwrite", (store) => {
    store.delete(ROOT_KEY);
  });
}

export async function verifyHandlePermission(handle, writable = true) {
  if (!handle) {
    return false;
  }

  const options = writable ? { mode: "readwrite" } : {};

  if ((await handle.queryPermission(options)) === "granted") {
    return true;
  }

  if ((await handle.requestPermission(options)) === "granted") {
    return true;
  }

  return false;
}

export async function ensureProjectFiles(rootHandle) {
  const dataHandle = await rootHandle.getDirectoryHandle("data", { create: true });
  const itemsHandle = await dataHandle.getDirectoryHandle("items", { create: true });
  const indexHandle = await dataHandle.getFileHandle("index.json", { create: true });
  const imagesHandle = await rootHandle.getDirectoryHandle("images", { create: true });

  return {
    dataHandle,
    itemsHandle,
    indexHandle,
    imagesHandle
  };
}

export async function readJsonFile(fileHandle, fallbackValue) {
  try {
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) {
      return fallbackValue;
    }
    return JSON.parse(text);
  } catch {
    return fallbackValue;
  }
}

export async function writeJsonFile(fileHandle, value) {
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(value, null, 2)}\n`);
  await writable.close();
}

export async function writeBlobFile(fileHandle, value) {
  const writable = await fileHandle.createWritable();
  await writable.write(value);
  await writable.close();
}

export function slugifyFileName(value) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[^\p{L}\p{N}\-_ ]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "promptnest-item";
}

export function buildItemId(title) {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
  return `${timestamp}-${slugifyFileName(title)}`;
}
