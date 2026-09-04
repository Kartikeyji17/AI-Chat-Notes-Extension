const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
let allNotes = [];

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

function render(notes) {
  if (notes.length === 0) {
    listEl.innerHTML = '<div class="empty">No notes yet. Generate one from a chat page.</div>';
    return;
  }
  listEl.innerHTML = notes
    .map(
      (n) => `
    <div class="note" data-id="${n.id}">
      <div class="note-header">
        <p class="note-title">${escapeHtml(n.title)}</p>
        <span class="note-meta">${escapeHtml(n.site)} · ${fmtDate(n.createdAt)}</span>
      </div>
      <div class="note-body">${renderMarkdown(n.content)}</div>
      <textarea class="note-editbox"></textarea>
      <div class="note-actions">
        <button class="edit-only edit">Edit</button>
        <button class="edit-only export">Export .md</button>
        <button class="edit-only openSrc">Open source chat</button>
        <button class="edit-only delete">Delete</button>
        <button class="save-only save">Save</button>
        <button class="cancel-only cancel">Cancel</button>
      </div>
    </div>`
    )
    .join("");
}

async function loadNotes() {
  const { notes = [] } = await chrome.storage.local.get("notes");
  allNotes = notes;
  render(allNotes);
}

searchEl.addEventListener("input", () => {
  const q = searchEl.value.toLowerCase();
  const filtered = allNotes.filter(
    (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );
  render(filtered);
});

function downloadMarkdown(title, content) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = title.replace(/[^a-z0-9]+/gi, "_").slice(0, 50) + ".md";
  a.click();
  URL.revokeObjectURL(url);
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
    downloadMarkdown(note.title, note.content);
  } else if (e.target.classList.contains("edit")) {
    const textarea = noteEl.querySelector(".note-editbox");
    textarea.value = note.content;
    noteEl.classList.add("editing", "expanded");
  } else if (e.target.classList.contains("cancel")) {
    noteEl.classList.remove("editing");
  } else if (e.target.classList.contains("save")) {
    const textarea = noteEl.querySelector(".note-editbox");
    const { notes = [] } = await chrome.storage.local.get("notes");
    const idx = notes.findIndex((n) => n.id === id);
    if (idx !== -1) {
      notes[idx].content = textarea.value;
      await chrome.storage.local.set({ notes });
    }
    loadNotes();
  }
});

loadNotes();