importScripts("db.js", "credit-optimizer.js", "ai.js", "generation.js");

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "generate-notes") return;

  try {
    await migrateFromChromeStorageIfNeeded();

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const payload = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" });
    if (!payload || payload.messages.length === 0) {
      badge("ERR", "#b33");
      return;
    }

    const { apiKey, provider, model, backendUrl, backendToken, storeTranscript, captureDiagrams } = await chrome.storage.local.get([
      "apiKey", "provider", "model", "backendUrl", "backendToken", "storeTranscript", "captureDiagrams",
    ]);
    const result = await generateNoteFromPayload(payload, {
      apiKey,
      provider: provider || "gemini",
      model,
      backendUrl,
      backendToken,
      storeTranscript,
      captureDiagrams,
    });
    if (result.duplicate) {
      badge("DUP", "#888");
      return;
    }

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