const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generateBtn");
const btnText = document.getElementById("btnText");

migrateFromChromeStorageIfNeeded();

document.getElementById("openNotesBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("notes.html") });
});

document.getElementById("openOptionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(text) {
  statusEl.textContent = text;
}

function setLoading(isLoading, label) {
  generateBtn.disabled = isLoading;
  generateBtn.classList.toggle("loading", isLoading);
  btnText.textContent = label;
}

async function getSettings() {
  const { apiKey, model, provider, backendUrl } = await chrome.storage.local.get([
    "apiKey", "model", "provider", "backendUrl",
  ]);
  return { apiKey, provider: provider || "anthropic", model, backendUrl };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function captureAndCropDiagrams(diagramRects) {
  if (!diagramRects || diagramRects.length === 0) return [];
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  } catch {
    return [];
  }
  const img = await loadImage(dataUrl);
  const results = [];
  for (const d of diagramRects) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(d.width * d.scale);
    canvas.height = Math.round(d.height * d.scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(
      img,
      d.left * d.scale, d.top * d.scale, d.width * d.scale, d.height * d.scale,
      0, 0, canvas.width, canvas.height
    );
    results.push({ dataUrl: canvas.toDataURL("image/png"), caption: d.caption || "Diagram" });
  }
  return results;
}

generateBtn.addEventListener("click", async () => {
  setLoading(true, "Reading the chat...");
  setStatus("");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const payload = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" });

    if (!payload || payload.messages.length === 0) {
      setStatus("Couldn't find a conversation on this page.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    const rawTranscript = payload.messages.map((m) => `[${m.role.toUpperCase()}]\n${m.text}`).join("\n\n");
    const transcript = trimTranscript(rawTranscript).slice(0, 40000);

    const firstUserMsg = payload.messages.find((m) => m.role === "user");
    const title = (firstUserMsg ? firstUserMsg.text : payload.title).slice(0, 80);

    const hash = await hashText(transcript);
    const cachedId = await getCachedNoteId(hash);
    if (cachedId) {
      setStatus("Already have notes for this exact conversation. Open 'my notes' to view.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    const diagrams = await captureAndCropDiagrams(payload.diagrams);
    const existingNotes = await getAllNotes();

    if (isTrivial(transcript)) {
      const tags = extractLocalTags(transcript);
      const content = buildTrivialNote(payload, title);
      const relatedNoteIds = findRelatedByLocalSimilarity(existingNotes, tags);
      const note = {
        id: crypto.randomUUID(), title, site: payload.site, url: payload.url,
        createdAt: Date.now(), content, tags, transcript,
        provider: null, model: null,
        lastRevised: null, nextDue: Date.now(), intervalDays: 1,
        easeFactor: 2.5, repetitions: 0,
        diagrams, relatedNoteIds, isRevisit: relatedNoteIds.length > 0,
      };
      await putNote(note);
      await setCachedNoteId(hash, note.id);
      setStatus("Short exchange — saved a quick note locally, no AI credits used.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    const { apiKey, provider, model, backendUrl } = await getSettings();
    if (!apiKey && !backendUrl) {
      setStatus("Set your API key or Backend URL in Settings first.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    setLoading(true, payload.isSelection ? "Summarizing selection..." : "Generating notes...");
    const notesMarkdown = await callAI(provider, apiKey, model, transcript, backendUrl);

    const tags = extractLocalTags(transcript + " " + notesMarkdown);
    const relatedNoteIds = findRelatedByLocalSimilarity(existingNotes, tags);

    const note = {
      id: crypto.randomUUID(),
      title, site: payload.site, url: payload.url, createdAt: Date.now(),
      content: notesMarkdown, tags, transcript, provider, model,
      lastRevised: null, nextDue: Date.now(), intervalDays: 1,
      easeFactor: 2.5, repetitions: 0,
      diagrams, relatedNoteIds, isRevisit: relatedNoteIds.length > 0,
    };

    await putNote(note);
    await setCachedNoteId(hash, note.id);

    let msg = (payload.isSelection ? "Selection saved. " : "Saved. ") + "Open 'my notes' to view.";
    if (diagrams.length > 0) msg += ` (${diagrams.length} diagram screenshot${diagrams.length > 1 ? "s" : ""} captured)`;
    setStatus(msg);
  } catch (err) {
    setStatus("Error: " + err.message);
  } finally {
    setLoading(false, "Generate notes from this chat");
  }
});