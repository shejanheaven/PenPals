// On-device storage (IndexedDB): collections, saved cards, and your card photos.
// Nothing leaves the phone except what you export.

const DB_NAME = "binder";
const VERSION = 1;
let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", { keyPath: "id" });
      if (!db.objectStoreNames.contains("items")) {
        const items = db.createObjectStore("items", { keyPath: "id" });
        items.createIndex("collectionId", "collectionId");
      }
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function store(name, mode = "readonly") {
  return (await open()).transaction(name, mode).objectStore(name);
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Ask iOS/Chrome not to evict our data under storage pressure.
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

// ── collections ──
export async function listCollections() {
  const all = await done((await store("collections")).getAll());
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCollection(c) {
  const now = Date.now();
  const rec = { id: uid(), createdAt: now, emoji: "📒", ...c, updatedAt: now };
  await done((await store("collections", "readwrite")).put(rec));
  return rec;
}

export async function deleteCollection(id) {
  const items = await listItems(id);
  for (const it of items) await deleteItem(it);
  await done((await store("collections", "readwrite")).delete(id));
}

// ── items ──
export async function listItems(collectionId) {
  const s = await store("items");
  const all = collectionId ? await done(s.index("collectionId").getAll(collectionId)) : await done(s.getAll());
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getItem(id) {
  return done((await store("items")).get(id));
}

export async function saveItem(item) {
  const now = Date.now();
  const rec = { id: uid(), addedAt: now, qty: 1, ...item, updatedAt: now };
  await done((await store("items", "readwrite")).put(rec));
  return rec;
}

export async function deleteItem(item) {
  for (const pid of [item.photoId, item.backPhotoId]) if (pid) await deletePhoto(pid);
  await done((await store("items", "readwrite")).delete(item.id));
}

// ── photos ──
export async function savePhoto(blob) {
  const id = uid();
  await done((await store("photos", "readwrite")).put({ id, blob }));
  return id;
}

export async function getPhoto(id) {
  return id ? (await done((await store("photos")).get(id)))?.blob || null : null;
}

export async function deletePhoto(id) {
  await done((await store("photos", "readwrite")).delete(id));
}

// ── backup ──
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function exportAll({ includePhotos = true } = {}) {
  const collections = await listCollections();
  const items = await listItems();
  const photos = {};
  if (includePhotos) {
    for (const it of items) {
      for (const pid of [it.photoId, it.backPhotoId]) {
        const b = pid && (await getPhoto(pid));
        if (b) photos[pid] = await blobToDataUrl(b);
      }
    }
  }
  return { app: "binder", version: 1, exportedAt: new Date().toISOString(), collections, items, photos };
}

export async function importAll(data) {
  if (data?.app !== "binder") throw new Error("That file is not a Binder backup");
  // A fresh transaction per write: IndexedDB transactions auto-close across awaits.
  for (const [id, dataUrl] of Object.entries(data.photos || {})) {
    const blob = await (await fetch(dataUrl)).blob();
    await done((await store("photos", "readwrite")).put({ id, blob }));
  }
  for (const c of data.collections || []) await done((await store("collections", "readwrite")).put(c));
  for (const it of data.items || []) await done((await store("items", "readwrite")).put(it));
  return { collections: data.collections?.length || 0, items: data.items?.length || 0 };
}
