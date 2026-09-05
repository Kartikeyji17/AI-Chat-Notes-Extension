const DB_NAME = "ai_chat_notes_db";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const HASH_STORE = "hashIndex";

let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(HASH_STORE)) {
        db.createObjectStore(HASH_STORE, { keyPath: "hash" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

async function store(name, mode) {
  const db = await getDB();
  return db.transaction(name, mode).objectStore(name);
}

async function getAllNotes() {
  const s = await store(NOTES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getNoteById(id) {
  const s = await store(NOTES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = s.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function putNote(note) {
  const s = await store(NOTES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteNoteById(id) {
  const s = await store(NOTES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getHashEntry(hash) {
  const s = await store(HASH_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = s.get(hash);
    req.onsuccess = () => resolve(req.result ? req.result.noteId : null);
    req.onerror = () => reject(req.error);
  });
}

async function putHashEntry(hash, noteId) {
  const s = await store(HASH_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.put({ hash, noteId });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// One-time move of existing notes from chrome.storage.local into IndexedDB.
async function migrateFromChromeStorageIfNeeded() {
  const { migratedToIndexedDB } = await chrome.storage.local.get("migratedToIndexedDB");
  if (migratedToIndexedDB) return;

  const { notes = [], hashIndex = {} } = await chrome.storage.local.get(["notes", "hashIndex"]);
  for (const note of notes) {
    await putNote(note);
  }
  for (const [hash, noteId] of Object.entries(hashIndex)) {
    await putHashEntry(hash, noteId);
  }
  await chrome.storage.local.set({ migratedToIndexedDB: true });
}