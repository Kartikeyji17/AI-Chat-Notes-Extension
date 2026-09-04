const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const tagBarEl = document.getElementById("tagBar");
const dueBannerEl = document.getElementById("dueBanner");
const exportAllBtn = document.getElementById("exportAllBtn");
const importFileEl = document.getElementById("importFile");

let allNotes = [];
let activeTag = null;

const REVISION_STEPS = [1, 3, 7, 16, 35, 90]; // days

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

function isDue(note) {
  return (note.nextDue || 0) <= Date.now();
}

function getFilteredSorted() {
  const q = searchEl.value.toLowerCase();
  let notes = allNotes.filter(
    (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
  if (activeTag) notes = notes.filter((n) => (n.tags || []).includes(activeTag));

  const sort = sortEl.value;
  notes = [...notes].sort((a, b) => {
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
  dueBannerEl.innerHTML = dueCount > 0
    ? `<div class="banner">${dueCount} note${dueCount > 1 ? "s" : ""} due for revision.</div>`
    : "";
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
    `<span class="tag-chip ${activeTag === null ? "active" : ""}" data-tag="">All</span>` +
    tags
      .map((t) => `<span class="tag-chip ${activeTag === t ? "active" : ""}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
      .join("");
}

function render() {
  const notes = getFilteredSorted();
  if (notes.length === 0) {
    listEl.innerHTML = '<div class="empty">No notes match.</div>';
    return;
  }
  listEl.innerHTML = notes
    .map((n) => {
      const due = isDue(n);
      return `
    <div class="note" data-id="${n.id}">
      <div class="note-header">
        <p class="note-title">${escapeHtml(n.title)}${due ? '<span class="due-badge">due</span>' : ""}</p>
        <span class="note-meta">${escapeHtml(n.site)} · ${fmtDate(n.createdAt)}</span>
      </div>
      <div class="note-tags">
        ${(n.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="note-body">${renderMarkdown(n.content)}</div>
      <textarea class="note-editbox"></textarea>
      <div class="note-actions">
        <button class="edit-only revise">Mark revised</button>
        <button class="edit-only regen">Regenerate</button>
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
  const { notes = [] } = await chrome.storage.local.get("notes");
  allNotes = notes;
  renderDueBanner();
  renderTagBar();
  render();
}

searchEl.addEventListener("input", render);
sortEl.addEventListener("change", render);

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
  const { notes = [] } = await chrome.storage.local.get("notes");
  downloadFile(`ai-chat-notes-backup-${Date.now()}.json`, JSON.stringify(notes, null, 2), "application/json");
});

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid backup file.");

    const { notes = [] } = await chrome.storage.local.get("notes");
    const existingIds = new Set(notes.map((n) => n.id));
    const merged = [...notes];
    imported.forEach((n) => {
      if (n && n.id && !existingIds.has(n.id)) {
        merged.push(n);
        existingIds.add(n.id);
      }
    });
    await chrome.storage.local.set({ notes: merged });
    loadNotes();
    alert(`Imported. ${merged.length - notes.length} new note(s) added.`);
  } catch (err) {
    alert("Import failed: " + err.message);
  } finally {
    importFileEl.value = "";
  }
});

async function updateNote(id, patch) {
  const { notes = [] } = await chrome.storage.local.get("notes");
  const idx = notes.findIndex((n) => n.id === id);
  if (idx !== -1) {
    notes[idx] = { ...notes[idx], ...patch };
    await chrome.storage.local.set({ notes });
  }
  return notes;
}

listEl.addEventListener("click", async (e) => {
  const noteEl = e.target.closest(".note");
  if (!noteEl) return;
  const id = noteEl.dataset.id;
  const note = allNotes.find((n) => n.id === id);
  if (!note) return;

  if (e.target.classList.contains("note-title") || e.target.closest(".note-header")) {
    if (!noteEl.classList.contains("editing")) noteEl.classList.toggle("expanded");
    return;
  }

  if (e.target.classList.contains("delete")) {
    const { notes = [] } = await chrome.storage.local.get("notes");
    await chrome.storage.local.set({ notes: notes.filter((n) => n.id !== id) });
    loadNotes();
  } else if (e.target.classList.contains("openSrc")) {
    chrome.tabs.create({ url: note.url });
  } else if (e.target.classList.contains("export")) {
    downloadFile(note.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 50) + ".md", note.content, "text/markdown");
  } else if (e.target.classList.contains("edit")) {
    const textarea = noteEl.querySelector(".note-editbox");
    textarea.value = note.content;
    noteEl.classList.add("editing", "expanded");
  } else if (e.target.classList.contains("cancel")) {
    noteEl.classList.remove("editing");
  } else if (e.target.classList.contains("save")) {
    const textarea = noteEl.querySelector(".note-editbox");
    await updateNote(id, { content: textarea.value });
    loadNotes();
  } else if (e.target.classList.contains("revise")) {
    const stepIdx = REVISION_STEPS.indexOf(note.intervalDays || 1);
    const nextIdx = Math.min(stepIdx + 1, REVISION_STEPS.length - 1);
    const nextDays = REVISION_STEPS[nextIdx === -1 ? 0 : nextIdx];
    await updateNote(id, {
      lastRevised: Date.now(),
      intervalDays: nextDays,
      nextDue: Date.now() + nextDays * 86400000,
    });
    loadNotes();
  } else if (e.target.classList.contains("regen")) {
    if (!note.transcript) {
      alert("No stored transcript for this note (made before Regenerate was added). Re-generate from the source chat instead.");
      return;
    }
    e.target.disabled = true;
    e.target.textContent = "...";
    try {
      const { apiKey } = await chrome.storage.local.get("apiKey");
      const provider = note.provider || "anthropic";
      const model = note.model;
      const rawOutput = await callAI(provider, apiKey, model, note.transcript);
      const tags = extractTags(rawOutput);
      const content = stripTagsLine(rawOutput);
      await updateNote(id, { content, tags });
      loadNotes();
    } catch (err) {
      alert("Regenerate failed: " + err.message);
      e.target.disabled = false;
      e.target.textContent = "Regenerate";
    }
  }
});

loadNotes();