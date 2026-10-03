if (typeof document === "undefined") {
  globalThis.document = { getElementById: () => ({ addEventListener() {} }), addEventListener() {} };
}

const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const tagBarEl = document.getElementById("tagBar");
const dueBannerEl = document.getElementById("dueBanner");
const exportAllBtn = document.getElementById("exportAllBtn");
const importFileEl = document.getElementById("importFile");
const reviewBtn = document.getElementById("reviewBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const siteFilterEl = document.getElementById("siteFilter");
const providerFilterEl = document.getElementById("providerFilter");
const syncBtn = document.getElementById("syncBtn");
const manageTagsBtn = document.getElementById("manageTagsBtn");

let allNotes = [];
let activeTag = null;
let visibleLimit = 50;
let reviewMode = false;
let reviewIndex = 0;
let pagedMode = false;
let hasMorePages = false;

if (typeof chrome !== "undefined") migrateFromChromeStorageIfNeeded().then(loadNotes);

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

function isDue(note) {
  return (note.nextDue || 0) <= Date.now();
}

function sm2Update(note, quality) {
  let ease = note.easeFactor || 2.5;
  let reps = note.repetitions || 0;
  let interval = note.intervalDays || 1;

  if (quality < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ease);
    reps += 1;
  }

  ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (ease < 1.3) ease = 1.3;

  return {
    easeFactor: ease,
    repetitions: reps,
    intervalDays: interval,
    lastRevised: Date.now(),
    nextDue: Date.now() + interval * 86400000,
    reviewHistory: [...(note.reviewHistory || []), { quality, reviewedAt: Date.now() }].slice(-100),
  };
}

function getFilteredSorted() {
  const q = searchEl.value.toLowerCase();
  let notes = allNotes.filter((note) => !q || semanticMatchScore(note, q) > 0);
  if (activeTag) notes = notes.filter((n) => (n.tags || []).includes(activeTag));
  if (siteFilterEl.value) notes = notes.filter((n) => n.site === siteFilterEl.value);
  if (providerFilterEl.value) notes = notes.filter((n) => (n.provider || "local") === providerFilterEl.value);

  const sort = sortEl.value;
  notes = [...notes].sort((a, b) => {
    if (q) return semanticMatchScore(b, q) - semanticMatchScore(a, q);
    if (sort === "due") {
      const aDue = isDue(a) ? 0 : 1;
      const bDue = isDue(b) ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      return (a.nextDue || 0) - (b.nextDue || 0);
    }
    if (sort === "oldest") return a.createdAt - b.createdAt;
    if (sort === "site") return (a.site || "").localeCompare(b.site || "");
    return b.createdAt - a.createdAt;
  });
  return notes;
}

function renderDueBanner() {
  const dueCount = allNotes.filter(isDue).length;
  const masteredCount = allNotes.filter((note) => note.repetitions >= 5 && !isDue(note)).length;
  const reviewedToday = allNotes.reduce((total, note) => total + (note.reviewHistory || []).filter((review) => review.reviewedAt > Date.now() - 86400000).length, 0);
  dueBannerEl.innerHTML = dueCount > 0
    ? `<div class="banner">${dueCount} note${dueCount > 1 ? "s" : ""} due for revision. Reviewed today: ${reviewedToday}. Mastered: ${masteredCount}.</div>`
    : `<div class="banner quiet">Reviewed today: ${reviewedToday}. Mastered: ${masteredCount}.</div>`;
}

function renderTagBar() {
  const tagSet = new Set();
  allNotes.forEach((n) => (n.tags || []).forEach((t) => tagSet.add(t)));
  const tags = [...tagSet].sort();
  if (tags.length === 0) {
    tagBarEl.innerHTML = "";
    return;
  }
  tagBarEl.innerHTML =
    `<button class="tag-chip ${activeTag === null ? "active" : ""}" data-tag="" aria-pressed="${activeTag === null}">All</button>` +
    tags
      .map((t) => `<button class="tag-chip ${activeTag === t ? "active" : ""}" data-tag="${escapeHtml(t)}" aria-pressed="${activeTag === t}">${escapeHtml(t)}</button>`)
      .join("");
}

async function renderFilterOptions() {
  const sourceNotes = pagedMode ? await getAllNotes() : allNotes;
  const sites = [...new Set(sourceNotes.map((note) => note.site).filter(Boolean))].sort();
  const providers = [...new Set(sourceNotes.map((note) => note.provider || "local"))].sort();
  const siteValue = siteFilterEl.value;
  const providerValue = providerFilterEl.value;
  siteFilterEl.innerHTML = '<option value="">All sites</option>' + sites.map((site) => `<option value="${escapeHtml(site)}">${escapeHtml(site)}</option>`).join("");
  providerFilterEl.innerHTML = '<option value="">All providers</option>' + providers.map((provider) => `<option value="${escapeHtml(provider)}">${escapeHtml(provider)}</option>`).join("");
  siteFilterEl.value = sites.includes(siteValue) ? siteValue : "";
  providerFilterEl.value = providers.includes(providerValue) ? providerValue : "";
}

function relatedNotesHtml(note) {
  if (!note.relatedNoteIds || note.relatedNoteIds.length === 0) return "";
  const links = note.relatedNoteIds
    .map((id) => allNotes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => `<button class="related-link" data-target="${escapeHtml(n.id)}">${escapeHtml(n.title)}</button>`)
    .join(", ");
  if (!links) return "";
  return `<div class="related-row">🔁 Revisited topic — related: ${links}</div>`;
}

function diagramsHtml(note) {
  if (!note.diagrams || note.diagrams.length === 0) return "";
  return `<div class="note-diagrams">${note.diagrams
    .filter(isSafeDiagram)
    .map((d) => `<figure><img src="${d.dataUrl}" /><figcaption>${escapeHtml(d.caption || "Diagram")}</figcaption></figure>`)
    .join("")}</div>`;
}

function editorHtml(note) {
  const listValue = (items) => (items || []).join("\n");
  return `<div class="note-editor">
    <label>Title<input class="edit-title" value="${escapeHtml(note.title)}" /></label>
    <label>Summary<textarea class="edit-summary">${escapeHtml(note.summary || "")}</textarea></label>
    <label>Key facts<textarea class="edit-keyfacts">${escapeHtml(listValue(note.keyFacts))}</textarea></label>
    <label>Doubts resolved<textarea class="edit-doubts">${escapeHtml(listValue(note.doubtsResolved))}</textarea></label>
    <label>Counter-arguments<textarea class="edit-counter">${escapeHtml(listValue(note.counterArguments))}</textarea></label>
    <label>Open questions<textarea class="edit-open">${escapeHtml(listValue(note.openQuestions))}</textarea></label>
    <label>Markdown<textarea class="note-editbox">${escapeHtml(note.content)}</textarea></label>
  </div>`;
}

function render() {
  const notes = getFilteredSorted();
  const dueNotes = notes.filter(isDue);
  const shownNotes = reviewMode ? dueNotes.slice(reviewIndex, reviewIndex + 1) : notes.slice(0, visibleLimit);
  reviewBtn.textContent = reviewMode ? `Exit review (${Math.min(reviewIndex + 1, dueNotes.length)}/${dueNotes.length})` : `Review due${dueNotes.length ? ` (${dueNotes.length})` : ""}`;
  loadMoreBtn.hidden = reviewMode || (pagedMode ? !hasMorePages : notes.length <= visibleLimit);
  if (reviewMode && dueNotes.length === 0) {
    listEl.innerHTML = '<div class="empty">No notes are due. Nice work.</div>';
    return;
  }
  if (notes.length === 0) {
    listEl.innerHTML = '<div class="empty">No notes match.</div>';
    return;
  }
  listEl.innerHTML = shownNotes
    .map((n) => {
      const due = isDue(n);
      return `
    <div class="note" data-id="${escapeHtml(n.id)}">
      <div class="note-header" role="button" tabindex="0" aria-expanded="false">
        <p class="note-title">${escapeHtml(n.title)}${due ? '<span class="due-badge">due</span>' : ""}${n.isRevisit ? '<span class="revisit-badge">🔁 revisited</span>' : ""}</p>
        <span class="note-meta">${escapeHtml(n.site)} · ${fmtDate(n.createdAt)}${n.easeFactor ? ` · ease ${n.easeFactor.toFixed(1)}` : ""}</span>
      </div>
      <div class="note-tags">
        ${(n.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}
      </div>
      ${relatedNotesHtml(n)}
      <div class="note-body">${renderMarkdown(n.content)}${diagramsHtml(n)}</div>
      <div class="flashcards">${(n.flashcards || []).map((card) => `<article class="flashcard"><strong>${escapeHtml(card.question)}</strong><p>${escapeHtml(card.answer)}</p></article>`).join("")}</div>
      ${editorHtml(n)}
      <div class="note-actions">
        <span class="edit-only revise-group">
          <button class="revise" data-q="2">Again</button>
          <button class="revise" data-q="4">Good</button>
          <button class="revise" data-q="5">Easy</button>
        </span>
        <button class="edit-only regen">Regenerate</button>
        <button class="edit-only cards">Flashcards</button>
        <button class="edit-only edit">Edit</button>
        <button class="edit-only export">Export .md</button>
        <button class="edit-only openSrc">Open source chat</button>
        <button class="edit-only delete">Delete</button>
        <button class="save-only save">Save</button>
        <button class="cancel-only cancel">Cancel</button>
      </div>
    </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadNotes() {
  const { retentionDays } = await chrome.storage.local.get("retentionDays");
  await pruneExpiredTranscripts(retentionDays);
  const canPage = !searchEl.value.trim() && !activeTag && !siteFilterEl.value && !providerFilterEl.value && ["due", "newest"].includes(sortEl.value);
  pagedMode = canPage;
  if (canPage) {
    allNotes = await getNotesPage({ limit: visibleLimit, sort: sortEl.value });
    hasMorePages = allNotes.length === visibleLimit;
  } else {
    allNotes = await getAllNotes();
    hasMorePages = false;
  }
  renderDueBanner();
  await renderFilterOptions();
  renderTagBar();
  render();
}

let searchTimer;
searchEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadNotes, 150);
});
sortEl.addEventListener("change", loadNotes);
siteFilterEl.addEventListener("change", loadNotes);
providerFilterEl.addEventListener("change", loadNotes);
reviewBtn.addEventListener("click", () => {
  reviewMode = !reviewMode;
  reviewIndex = 0;
  render();
});
loadMoreBtn.addEventListener("click", async () => {
  if (!pagedMode) {
    visibleLimit += 50;
    render();
    return;
  }
  const next = await getNotesPage({ offset: allNotes.length, limit: 50, sort: sortEl.value });
  allNotes = allNotes.concat(next);
  hasMorePages = next.length === 50;
  render();
});

tagBarEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".tag-chip");
  if (!chip) return;
  activeTag = chip.dataset.tag || null;
  renderTagBar();
  render();
});

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

exportAllBtn.addEventListener("click", async () => {
  const notes = await getAllNotes();
  downloadFile(`ai-chat-notes-backup-${Date.now()}.json`, JSON.stringify(notes, null, 2), "application/json");
});

async function syncNotes() {
  const settings = await chrome.storage.local.get(["syncUrl", "syncAccount", "syncToken"]);
  if (!settings.syncUrl || !settings.syncAccount || !settings.syncToken) {
    throw new Error("Configure Sync URL, account name, and token in Settings first.");
  }
  const baseUrl = settings.syncUrl.replace(/\/$/, "");
  const parsedUrl = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsedUrl.protocol) ||
      (parsedUrl.protocol === "http:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname))) {
    throw new Error("Sync URL must use HTTPS, except for localhost.");
  }
  const auth = { Authorization: `Bearer ${settings.syncToken}` };
  const remoteResponse = await fetch(`${baseUrl}/api/sync?account=${encodeURIComponent(settings.syncAccount)}`, { headers: auth });
  if (!remoteResponse.ok) throw new Error(`Sync download failed (${remoteResponse.status}).`);
  const remote = await remoteResponse.json();
  const merged = new Map((await getAllNotes()).map((note) => [note.id, note]));
  for (const remoteNote of Array.isArray(remote.notes) ? remote.notes : []) {
    const localNote = merged.get(remoteNote.id);
    if (!localNote || (remoteNote.updatedAt || 0) > (localNote.updatedAt || 0)) merged.set(remoteNote.id, remoteNote);
  }
  for (const note of merged.values()) await putNote(note);
  const uploadNotes = await getAllNotes();
  const uploadResponse = await fetch(`${baseUrl}/api/sync`, {
    method: "PUT",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ account: settings.syncAccount, notes: uploadNotes }),
  });
  if (!uploadResponse.ok) throw new Error(`Sync upload failed (${uploadResponse.status}).`);
  await loadNotes();
}

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing...";
  try {
    await syncNotes();
    syncBtn.textContent = "Synced";
  } catch (error) {
    alert(error.message);
    syncBtn.textContent = "Sync";
  } finally {
    syncBtn.disabled = false;
  }
});

manageTagsBtn.addEventListener("click", async () => {
  const current = prompt("Tag to rename:");
  if (!current) return;
  const replacement = prompt(`Rename '${current}' to (leave blank to remove it):`, current);
  if (replacement === null) return;
  const oldTag = current.trim().toLowerCase();
  const newTag = replacement.trim().toLowerCase();
  for (const note of await getAllNotes()) {
    if (!(note.tags || []).includes(oldTag)) continue;
    const tags = [...new Set(note.tags.map((tag) => tag === oldTag ? newTag : tag).filter(Boolean))];
    await putNote({ ...note, tags });
  }
  activeTag = null;
  await loadNotes();
});

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (text.length > 25 * 1024 * 1024) throw new Error("Backup file is too large.");
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid backup file.");

    const existing = await getAllNotes();
    const existingIds = new Set(existing.map((n) => n.id));
    let addedCount = 0;
    for (const n of imported) {
      if (n && n.id && !existingIds.has(n.id)) {
        try {
          await putNote(n);
          existingIds.add(n.id);
          addedCount++;
        } catch {
          // Skip malformed records and continue importing valid notes.
        }
      }
    }
    loadNotes();
    alert(`Imported. ${addedCount} new note(s) added.`);
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    importFileEl.value = "";
  }
});

listEl.addEventListener("click", async (e) => {
  const noteEl = e.target.closest(".note");
  if (!noteEl) return;
  const id = noteEl.dataset.id;
  const note = allNotes.find((n) => n.id === id);
  if (!note) return;

  if (e.target.classList.contains("related-link")) {
    const targetId = e.target.dataset.target;
    const targetEl = listEl.querySelector(`.note[data-id="${CSS.escape(targetId)}"]`);
    if (targetEl) {
      targetEl.classList.add("expanded");
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  if (e.target.classList.contains("cards")) {
    noteEl.classList.toggle("show-cards");
    noteEl.classList.add("expanded");
    return;
  }

  if (e.target.classList.contains("note-title") || e.target.closest(".note-header")) {
    if (!noteEl.classList.contains("editing")) {
      noteEl.classList.toggle("expanded");
      noteEl.querySelector(".note-header").setAttribute("aria-expanded", noteEl.classList.contains("expanded"));
    }
    return;
  }

  if (e.target.classList.contains("delete")) {
    await deleteNoteById(id);
    loadNotes();
  } else if (e.target.classList.contains("openSrc")) {
    try {
      const sourceUrl = new URL(note.url);
      if (!["http:", "https:"].includes(sourceUrl.protocol)) throw new Error("Unsupported source URL");
      chrome.tabs.create({ url: sourceUrl.href });
    } catch {
      alert("This note does not have a valid web source URL.");
    }
  } else if (e.target.classList.contains("export")) {
    downloadFile(note.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 50) + ".md", note.content, "text/markdown");
  } else if (e.target.classList.contains("edit")) {
    noteEl.classList.add("editing", "expanded");
  } else if (e.target.classList.contains("cancel")) {
    noteEl.classList.remove("editing");
  } else if (e.target.classList.contains("save")) {
    const textarea = noteEl.querySelector(".note-editbox");
    const lines = (selector) => noteEl.querySelector(selector).value.split("\n").map((line) => line.trim()).filter(Boolean);
    await putNote({
      ...note,
      title: noteEl.querySelector(".edit-title").value.trim() || "Untitled note",
      content: textarea.value,
      summary: noteEl.querySelector(".edit-summary").value.trim(),
      keyFacts: lines(".edit-keyfacts"),
      doubtsResolved: lines(".edit-doubts"),
      counterArguments: lines(".edit-counter"),
      openQuestions: lines(".edit-open"),
    });
    loadNotes();
  } else if (e.target.classList.contains("revise")) {
    const quality = parseInt(e.target.dataset.q, 10);
    const patch = sm2Update(note, quality);
    await putNote({ ...note, ...patch });
    if (reviewMode) reviewIndex++;
    loadNotes();
  } else if (e.target.classList.contains("regen")) {
    if (!note.transcript) {
      alert("No stored transcript for this note. Re-generate from the source chat instead.");
      return;
    }
    e.target.disabled = true;
    e.target.textContent = "...";
    try {
    const { apiKey, backendUrl, backendToken, model: settingsModel, provider: settingsProvider } = await chrome.storage.local.get(["apiKey", "backendUrl", "backendToken", "model", "provider"]);
    const provider = note.provider || settingsProvider || "gemini";
    const model = note.model || settingsModel || defaultModelForProvider(provider);
    const content = await callAI(provider, apiKey, model, note.transcript, backendUrl, backendToken, { refresh: true });
    const structured = parseStructuredNote(content);
      const tags = extractLocalTags(note.transcript + " " + content);
        const flashcards = structured.keyFacts.slice(0, 20).map((fact) => ({
          question: `What is the important point about ${note.title}?`,
          answer: fact,
        }));
        await putNote({ ...note, content, tags, ...structured, flashcards, model, provider });
      loadNotes();
    } catch (err) {
      alert("Regenerate failed: " + err.message);
      e.target.disabled = false;
      e.target.textContent = "Regenerate";
    }
  }
});

listEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const header = e.target.closest(".note-header");
  if (!header) return;
  e.preventDefault();
  const note = header.closest(".note");
  note?.classList.toggle("expanded");
  header.setAttribute("aria-expanded", note?.classList.contains("expanded") ? "true" : "false");
});

document.addEventListener("keydown", (e) => {
  if (!reviewMode || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const qualityByKey = { "1": "2", "2": "4", "3": "5" };
  if (!qualityByKey[e.key]) return;
  const button = listEl.querySelector(`.revise[data-q="${qualityByKey[e.key]}"]`);
  if (button) {
    e.preventDefault();
    button.click();
  }
});

if (typeof module !== "undefined") module.exports = { sm2Update };