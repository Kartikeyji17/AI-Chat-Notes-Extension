importScripts("ai.js");

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "generate-notes") return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const payload = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" });
    if (!payload || payload.messages.length === 0) {
      badge("ERR", "#b33");
      return;
    }

    const { apiKey, provider, model } = await chrome.storage.local.get(["apiKey", "provider", "model"]);
    if (!apiKey) {
      badge("KEY", "#b33");
      return;
    }

    badge("...", "#d97757");
    const transcript = conversationToTranscript(payload);
    const rawOutput = await callAI(provider || "anthropic", apiKey, model, transcript);
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
      provider: provider || "anthropic",
      model,
      lastRevised: null,
      nextDue: Date.now(),
      intervalDays: 1,
    };

    const { notes = [] } = await chrome.storage.local.get("notes");
    notes.unshift(note);
    await chrome.storage.local.set({ notes });

    badge("OK", "#2e7d32");
  } catch (err) {
    badge("ERR", "#b33");
  }
});

function badge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 3000);
}