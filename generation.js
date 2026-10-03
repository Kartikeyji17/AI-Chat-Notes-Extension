function createNoteFromPayload(payload, settings, diagrams = []) {
  return generateNoteFromPayload(payload, settings, diagrams);
}

function parseStructuredNote(markdown) {
  const sections = { summary: "", keyFacts: [], doubtsResolved: [], counterArguments: [], openQuestions: [] };
  const lines = markdown.split("\n");
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^\*\*(Overview|Key facts \/ definitions|Doubts resolved|Counter-arguments \/ other viewpoints|Open questions)\*\*/i);
    if (heading) {
      current = {
        Overview: "summary",
        "Key facts / definitions": "keyFacts",
        "Doubts resolved": "doubtsResolved",
        "Counter-arguments / other viewpoints": "counterArguments",
        "Open questions": "openQuestions",
      }[heading[1]];
      continue;
    }
    if (!current || !line.trim()) continue;
    if (current === "summary") sections.summary += `${line.replace(/^\*\*.*?\*\*\s*[—-]?\s*/, "").trim()} `;
    else if (/^[-*]\s+/.test(line.trim())) sections[current].push(line.trim().replace(/^[-*]\s+/, ""));
  }
  sections.summary = sections.summary.trim().slice(0, 5000);
  return sections;
}

async function generateNoteFromPayload(payload, settings, diagrams = []) {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    throw new Error("No conversation was found on this page.");
  }

  const rawTranscript = payload.messages
    .map((message) => `[${String(message.role || "unknown").toUpperCase()}]\n${String(message.text || "")}`)
    .join("\n\n");
  const transcript = compactTranscript(rawTranscript);
  if (!transcript) throw new Error("The conversation was empty.");

  const hash = await hashText(transcript);
  const cachedId = await getCachedNoteId(hash);
  if (cachedId) return { duplicate: true, noteId: cachedId };

  const firstUserMessage = payload.messages.find((message) => message.role === "user");
  const title = (firstUserMessage?.text || payload.title || "Untitled note")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Untitled note";
  const existingNotes = await getAllNotes();
  const trivial = isTrivial(transcript);
  let content;
  let provider = null;
  let model = null;

  if (trivial) {
    content = buildTrivialNote(payload, title);
  } else {
    const selectedProvider = settings.provider || "gemini";
    if (settings.backendUrl) {
      const backendUrl = new URL(settings.backendUrl);
      if (!['http:', 'https:'].includes(backendUrl.protocol) ||
          (backendUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(backendUrl.hostname))) {
        throw new Error("Backend URL must use HTTPS, except for localhost.");
      }
    }
    if (settings.backendUrl && selectedProvider !== "gemini") {
      throw new Error("The included backend currently supports Gemini only.");
    }
    if (!settings.apiKey && !settings.backendUrl) {
      throw new Error("Set an API key or backend URL in Settings first.");
    }
    provider = settings.backendUrl ? selectedProvider : selectedProvider;
    model = settings.model || defaultModelForProvider(selectedProvider);
    content = await callAI(selectedProvider, settings.apiKey, model, transcript, settings.backendUrl, settings.backendToken);
    if (!content.trim()) throw new Error("The AI provider returned an empty note.");
  }

  const tags = extractLocalTags(transcript + " " + content);
  const relatedNoteIds = findRelatedByLocalSimilarity(existingNotes, tags);
  const structured = parseStructuredNote(content);
  const flashcards = structured.keyFacts.slice(0, 20).map((fact) => ({
    question: `What is the important point about ${title}?`,
    answer: fact,
  }));
  const note = normalizeNote({
    schemaVersion: 2,
    id: crypto.randomUUID(),
    title,
    site: payload.site || "unknown",
    url: payload.url || "",
    createdAt: Date.now(),
    content,
    tags,
    transcript: settings.storeTranscript === false ? "" : transcript,
    ...structured,
    flashcards,
    provider,
    model,
    lastRevised: null,
    nextDue: Date.now(),
    intervalDays: 1,
    easeFactor: 2.5,
    repetitions: 0,
    diagrams,
    relatedNoteIds,
    isRevisit: relatedNoteIds.length > 0,
  });

  await putNote(note);
  for (const related of existingNotes.filter((existing) => relatedNoteIds.includes(existing.id))) {
    await putNote({
      ...related,
      relatedNoteIds: [...new Set([...(related.relatedNoteIds || []), note.id])],
      isRevisit: true,
    });
  }
  await setCachedNoteId(hash, note.id);
  return { duplicate: false, note };
}
