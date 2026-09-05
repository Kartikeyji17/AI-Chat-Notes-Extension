const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const tagBarEl = document.getElementById("tagBar");
const dueBannerEl = document.getElementById("dueBanner");
const exportAllBtn = document.getElementById("exportAllBtn");
const importFileEl = document.getElementById("importFile");

let allNotes = [];
let activeTag = null;

migrateFromChromeStorageIfNeeded().then(loadNotes);

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
  };
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

function relatedNotesHtml(note) {
  if (!note.relatedNoteIds || note.relatedNoteIds.length === 0) return "";
  const links = note.relatedNoteIds
    .map((id) => allNotes.find((n) => n.id === id))
    .filter(Boolean)
    .map((n) => `<span class="related-link" data-target="${n.id}">${escapeHtml(n.title)}</span>`)
    .join(", ");
  if (!links) return "";
  return `<div class="related-row">🔁 Revisited topic — related: ${links}</div>`;
}

function diagramsHtml(note) {
  if (!note.diagrams || note.diagrams.length === 0) return "";
  return `<div class="note-diagrams">${note.diagrams
    .map((d) => `<figure><img src="${d.dataUrl}" /><figcaption>${escapeHtml(d.caption || "Diagram")}</figcaption></figure>`)
    .join("")}</div>`;
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
        <p class="note-title">${escapeHtml(n.title)}${due ? '<span class="due-badge">due</span>' : ""}${n.isRevisit ? '<span class="revisit-badge">🔁 revisited</span>' : ""}</p>
        <span class="note-meta">${escapeHtml(n.site)} · ${fmtDate(n.createdAt)}${n.easeFactor ? ` · ease ${n.easeFactor.toFixed(1)}` : ""}</span>
      </div>
      <div class="note-tags">
        ${(n.tags || []).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("")}
      </div>
      ${relatedNotesHtml(n)}
      <div class="note-body">${renderMarkdown(n.content)}${diagramsHtml(n)}</div>
      <textarea class="note-editbox"></textarea>
      <div class="note-actions">
        <span class="edit-only revise-group">
          <button class="revise" data-q="2">Again</button>
          <button class="revise" data-q="4">Good</button>
          <button class="revise" data-q="5">Easy</button>
        </span>
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
  allNotes = await getAllNotes();
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
  const notes = await getAllNotes();
  downloadFile(`ai-chat-notes-backup-${Date.now()}.json`, JSON.stringify(notes, null, 2), "application/json");
});

importFileEl.addEventListener("change", async () => {
  const file = importFileEl.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    if (!Array.isArray(imported)) throw new Error("Invalid backup file.");

    const existing = await getAllNotes();
    const existingIds = new Set(existing.map((n) => n.id));
    let addedCount = 0;
    for (const n of imported) {
      if (n && n.id && !existingIds.has(n.id)) {
        await putNote(n);
        existingIds.add(n.id);
        addedCount++;
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
    const targetEl = listEl.querySelector(`.note[data-id="${targetId}"]`);
    if (targetEl) {
      targetEl.classList.add("expanded");
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  if (e.target.classList.contains("note-title") || e.target.closest(".note-header")) {
    if (!noteEl.classList.contains("editing")) noteEl.classList.toggle("expanded");
    return;
  }

  if (e.target.classList.contains("delete")) {
    await deleteNoteById(id);
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
    await putNote({ ...note, content: textarea.value });
    loadNotes();
  } else if (e.target.classList.contains("revise")) {
    const quality = parseInt(e.target.dataset.q, 10);
    const patch = sm2Update(note, quality);
    await putNote({ ...note, ...patch });
    loadNotes();
  } else if (e.target.classList.contains("regen")) {
    if (!note.transcript) {
      alert("No stored transcript for this note. Re-generate from the source chat instead.");
      return;
    }
    e.target.disabled = true;
    e.target.textContent = "...";
    try {
      const { apiKey, backendUrl } = await chrome.storage.local.get(["apiKey", "backendUrl"]);
      const provider = note.provider || "anthropic";
      const model = note.model;
      const content = await callAI(provider, apiKey, model, note.transcript, backendUrl);
      const tags = extractLocalTags(note.transcript + " " + content);
      await putNote({ ...note, content, tags });
      loadNotes();
    } catch (err) {
      alert("Regenerate failed: " + err.message);
      e.target.disabled = false;
      e.target.textContent = "Regenerate";
    }
  }
});