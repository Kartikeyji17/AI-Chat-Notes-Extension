importScripts("db.js", "credit-optimizer.js", "ai.js");

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

    const { apiKey, provider, model, backendUrl } = await chrome.storage.local.get([
      "apiKey", "provider", "model", "backendUrl",
    ]);
    if (!apiKey && !backendUrl) {
      badge("KEY", "#b33");
      return;
    }

    const rawTranscript = payload.messages.map((m) => `[${m.role.toUpperCase()}]\n${m.text}`).join("\n\n");
    const transcript = compactTranscript(rawTranscript);

    const hash = await hashText(transcript);
    const cachedId = await getCachedNoteId(hash);
    if (cachedId) {
      badge("DUP", "#888");
      return;
    }

    badge("...", "#d97757");
    const existingNotes = await getAllNotes();
    const firstUserMsg = payload.messages.find((m) => m.role === "user");
    const title = (firstUserMsg ? firstUserMsg.text : payload.title).slice(0, 80);

    let content, tags, usedProvider = provider || "gemini", usedModel = model;
    if (isTrivial(transcript)) {
      tags = extractLocalTags(transcript);
      content = buildTrivialNote(payload, title);
      usedProvider = null;
      usedModel = null;
    } else {
      content = await callAI(usedProvider, apiKey, usedModel, transcript, backendUrl);
      tags = extractLocalTags(transcript + " " + content);
    }
    const relatedNoteIds = findRelatedByLocalSimilarity(existingNotes, tags);

    const note = {
      id: crypto.randomUUID(),
      title, site: payload.site, url: payload.url, createdAt: Date.now(),
      content, tags, transcript,
      provider: usedProvider, model: usedModel,
      lastRevised: null, nextDue: Date.now(), intervalDays: 1,
      easeFactor: 2.5, repetitions: 0,
      diagrams: [], relatedNoteIds, isRevisit: relatedNoteIds.length > 0,
    };

    await putNote(note);
    await setCachedNoteId(hash, note.id);

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