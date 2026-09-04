const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generateBtn");
const btnText = document.getElementById("btnText");

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
  const { apiKey, model, provider } = await chrome.storage.local.get(["apiKey", "model", "provider"]);
  return { apiKey, provider: provider || "anthropic", model };
}

generateBtn.addEventListener("click", async () => {
  setLoading(true, "Reading the chat...");
  setStatus("");

  try {
    const { apiKey, provider, model } = await getSettings();
    if (!apiKey) {
      setStatus("Set your API key in Settings first.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const payload = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" });

    if (!payload || payload.messages.length === 0) {
      setStatus("Couldn't find a conversation on this page.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    setLoading(true, payload.isSelection ? "Summarizing selection..." : "Generating notes...");
    const transcript = conversationToTranscript(payload);
    const rawOutput = await callAI(provider, apiKey, model, transcript);
    const tags = extractTags(rawOutput);
    const notesMarkdown = stripTagsLine(rawOutput);

    const firstUserMsg = payload.messages.find((m) => m.role === "user");
    const title = (firstUserMsg ? firstUserMsg.text : payload.title).slice(0, 80);

    const note = {
      id: crypto.randomUUID(),
      title,
      site: payload.site,
      url: payload.url,
      createdAt: Date.now(),
      content: notesMarkdown,
      tags,
      transcript,
      provider,
      model,
      lastRevised: null,
      nextDue: Date.now(),
      intervalDays: 1,
    };

    const { notes = [] } = await chrome.storage.local.get("notes");
    notes.unshift(note);
    await chrome.storage.local.set({ notes });

    setStatus((payload.isSelection ? "Selection saved. " : "Saved. ") + "Open 'my notes' to view.");
  } catch (err) {
    setStatus("Error: " + err.message);
  } finally {
    setLoading(false, "Generate notes from this chat");
  }
});