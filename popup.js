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
  const { apiKey, model, provider, backendUrl, backendToken, storeTranscript, captureDiagrams } = await chrome.storage.local.get([
    "apiKey", "model", "provider", "backendUrl", "backendToken", "storeTranscript", "captureDiagrams",
  ]);
  return { apiKey, provider: provider || "gemini", model, backendUrl, backendToken, storeTranscript, captureDiagrams };
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

    const preview = payload.messages.slice(0, 3)
      .map((message) => `${String(message.role).toUpperCase()}: ${message.text}`)
      .join("\n\n")
      .slice(0, 1800);
    const confidence = Math.round((payload.confidence || 0) * 100);
    const warning = confidence < 60 ? "\n\nExtraction confidence is low; review the preview carefully." : "";
    if (!window.confirm(`Send this extracted content for note generation?\n\nSource: ${payload.site}\nMessages: ${payload.messages.length}\nConfidence: ${confidence}%\n\n${preview}${warning}`)) {
      setStatus("Generation cancelled.");
      return;
    }

    const settings = await getSettings();
    const diagrams = settings.captureDiagrams === false ? [] : await captureAndCropDiagrams(payload.diagrams);
    const result = await generateNoteFromPayload(payload, settings, diagrams);
    if (result.duplicate) {
      setStatus("Already have notes for this exact conversation. Open 'my notes' to view.");
      setLoading(false, "Generate notes from this chat");
      return;
    }
    setLoading(true, payload.isSelection ? "Summarizing selection..." : "Generating notes...");
    let msg = (payload.isSelection ? "Selection saved. " : "Saved. ") + "Open 'my notes' to view.";
    if (!result.note.provider) msg = "Short exchange saved locally, without an AI call. Open 'my notes' to view.";
    if (diagrams.length > 0) msg += ` (${diagrams.length} diagram screenshot${diagrams.length > 1 ? "s" : ""} captured)`;
    setStatus(msg);
  } catch (err) {
    setStatus("Error: " + err.message);
  } finally {
    setLoading(false, "Generate notes from this chat");
  }
});