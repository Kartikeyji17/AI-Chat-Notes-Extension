const DB_NAME = "ai_chat_notes_db";
const DB_VERSION = 2;
const NOTES_STORE = "notes";
const HASH_STORE = "hashIndex";
const MAX_NOTE_CONTENT = 500000;

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
      const notesStore = e.target.transaction.objectStore(NOTES_STORE);
      if (!notesStore.indexNames.contains("byDue")) notesStore.createIndex("byDue", "nextDue");
      if (!notesStore.indexNames.contains("byCreatedAt")) notesStore.createIndex("byCreatedAt", "createdAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getDB() {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

function normalizeNote(note) {
  if (!note || typeof note !== "object" || typeof note.id !== "string" || !note.id) {
    throw new Error("Invalid note.");
  }
  const content = typeof note.content === "string" ? note.content : "";
  if (content.length > MAX_NOTE_CONTENT) throw new Error("Note content is too large.");
  return {
    schemaVersion: Number.isFinite(note.schemaVersion) ? note.schemaVersion : 2,
    id: note.id.slice(0, 200),
    title: String(note.title || "Untitled note").slice(0, 200),
    site: String(note.site || "unknown").slice(0, 200),
    url: String(note.url || "").slice(0, 2000),
    createdAt: Number.isFinite(note.createdAt) ? note.createdAt : Date.now(),
    updatedAt: Number.isFinite(note.updatedAt) ? note.updatedAt : (Number.isFinite(note.createdAt) ? note.createdAt : Date.now()),
    content,
    summary: typeof note.summary === "string" ? note.summary.slice(0, 5000) : "",
    keyFacts: Array.isArray(note.keyFacts) ? note.keyFacts.filter((item) => typeof item === "string").slice(0, 100) : [],
    doubtsResolved: Array.isArray(note.doubtsResolved) ? note.doubtsResolved.filter((item) => typeof item === "string").slice(0, 100) : [],
    counterArguments: Array.isArray(note.counterArguments) ? note.counterArguments.filter((item) => typeof item === "string").slice(0, 100) : [],
    openQuestions: Array.isArray(note.openQuestions) ? note.openQuestions.filter((item) => typeof item === "string").slice(0, 100) : [],
    flashcards: Array.isArray(note.flashcards) ? note.flashcards.filter((card) => card && typeof card.question === "string" && typeof card.answer === "string").slice(0, 100) : [],
    tags: Array.isArray(note.tags) ? note.tags.filter((tag) => typeof tag === "string").slice(0, 30) : [],
    transcript: typeof note.transcript === "string" ? note.transcript.slice(0, MAX_NOTE_CONTENT) : "",
    provider: typeof note.provider === "string" ? note.provider : null,
    model: typeof note.model === "string" ? note.model : null,
    lastRevised: Number.isFinite(note.lastRevised) ? note.lastRevised : null,
    nextDue: Number.isFinite(note.nextDue) ? note.nextDue : Date.now(),
    intervalDays: Number.isFinite(note.intervalDays) ? note.intervalDays : 1,
    easeFactor: Number.isFinite(note.easeFactor) ? note.easeFactor : 2.5,
    repetitions: Number.isFinite(note.repetitions) ? note.repetitions : 0,
    reviewHistory: Array.isArray(note.reviewHistory) ? note.reviewHistory.slice(-100) : [],
    diagrams: Array.isArray(note.diagrams) ? note.diagrams.filter(isSafeDiagram).slice(0, 20) : [],
    relatedNoteIds: Array.isArray(note.relatedNoteIds) ? note.relatedNoteIds.filter((id) => typeof id === "string").slice(0, 100) : [],
    isRevisit: Boolean(note.isRevisit),
  };
}

function isSafeDiagram(diagram) {
  return diagram && typeof diagram.dataUrl === "string" &&
    /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(diagram.dataUrl) &&
    diagram.dataUrl.length <= 4000000;
}

async function store(name, mode) {
  const db = await getDB();
  return db.transaction(name, mode).objectStore(name);
}

async function getAllNotes() {
  const s = await store(NOTES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = s.getAll();
    req.onsuccess = () => resolve((req.result || []).map((note) => {
      try { return normalizeNote(note); } catch { return null; }
    }).filter(Boolean));
    req.onerror = () => reject(req.error);
  });
}

async function getNoteById(id) {
  const s = await store(NOTES_STORE, "readonly");
  return new Promise((resolve, reject) => {
    const req = s.get(id);
    req.onsuccess = () => {
      try { resolve(req.result ? normalizeNote(req.result) : null); } catch { resolve(null); }
    };
    req.onerror = () => reject(req.error);
  });
}

async function putNote(note) {
  note = normalizeNote(note);
  note.updatedAt = Date.now();
  const s = await store(NOTES_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = s.put(note);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteNoteById(id) {
  const s = await store(NOTES_STORE, "readwrite");
  await new Promise((resolve, reject) => {
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  const hashStore = await store(HASH_STORE, "readwrite");
  return new Promise((resolve, reject) => {
    const req = hashStore.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      if (cursor.value.noteId === id) cursor.delete();
      cursor.continue();
    };
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
    try { await putNote(note); } catch { }
  }
  for (const [hash, noteId] of Object.entries(hashIndex)) {
    await putHashEntry(hash, noteId);
  }
  await chrome.storage.local.set({ migratedToIndexedDB: true });
}

async function clearAllData() {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction([NOTES_STORE, HASH_STORE], "readwrite");
    transaction.objectStore(NOTES_STORE).clear();
    transaction.objectStore(HASH_STORE).clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getNotesPage({ offset = 0, limit = 50, sort = "newest" } = {}) {
  const db = await getDB();
  const transaction = db.transaction(NOTES_STORE, "readonly");
  const store = transaction.objectStore(NOTES_STORE);
  const indexName = sort === "due" ? "byDue" : "byCreatedAt";
  const direction = sort === "newest" ? "prev" : "next";
  return new Promise((resolve, reject) => {
    const notes = [];
    let skipped = 0;
    const request = store.index(indexName).openCursor(null, direction);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || notes.length >= limit) return resolve(notes);
      if (skipped < offset) {
        skipped++;
        cursor.continue();
        return;
      }
      try { notes.push(normalizeNote(cursor.value)); } catch { }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

async function removeAllTranscripts() {
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTES_STORE, "readwrite");
    const request = transaction.objectStore(NOTES_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const note = cursor.value;
      if (note.transcript) cursor.update({ ...note, transcript: "" });
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function pruneExpiredTranscripts(retentionDays) {
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 86400000;
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(NOTES_STORE, "readwrite");
    const request = transaction.objectStore(NOTES_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const note = cursor.value;
      if (note.transcript && (note.updatedAt || note.createdAt || 0) < cutoff) {
        cursor.update({ ...note, transcript: "", updatedAt: Date.now() });
      }
      cursor.continue();
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}