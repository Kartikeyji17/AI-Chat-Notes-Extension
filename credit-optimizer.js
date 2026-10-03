// All functions here run locally — zero AI calls.

async function hashText(text) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCachedNoteId(hash) {
  return getHashEntry(hash); // from db.js
}

async function setCachedNoteId(hash, noteId) {
  return putHashEntry(hash, noteId); // from db.js
}

function isTrivial(transcript) {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return wordCount < 40;
}

function trimTranscript(transcript) {
  const lines = transcript.split("\n");
  const out = [];
  let lastLine = null;
  for (let line of lines) {
    const cleaned = line.replace(/[ \t]+/g, " ").trimEnd();
    if (cleaned === lastLine && cleaned.trim() !== "") continue;
    out.push(cleaned);
    lastLine = cleaned;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Keep the request within a predictable token budget while preserving messages.
function compactTranscript(transcript, maxChars = 24000) {
  const cleaned = trimTranscript(transcript);
  if (cleaned.length <= maxChars) return cleaned;

  const marker = "[... middle of conversation omitted to save tokens ...]";
  const sliceMessage = (message, budget) => {
    if (message.length <= budget) return message;
    if (budget <= 1) return message.slice(0, budget);
    const tailLength = Math.floor(budget / 2);
    return message.slice(0, budget - tailLength) + message.slice(message.length - tailLength);
  };
  const messages = cleaned.split(/\n\n(?=\[[^\]]+\])/);
  const first = messages[0];
  if (first.length >= maxChars) return sliceMessage(first, maxChars);
  if (maxChars <= marker.length + 4) return cleaned.slice(0, maxChars);

  const tail = [];
  let remaining = maxChars - first.length - marker.length - 4;
  for (let index = messages.length - 1; index > 0 && remaining > 0; index--) {
    const separatorLength = tail.length > 0 ? 2 : 0;
    const budget = remaining - separatorLength;
    if (budget <= 0) break;
    const message = messages[index];
    tail.unshift(sliceMessage(message, budget));
    remaining -= separatorLength + Math.min(message.length, budget);
  }

  if (tail.length === 0) return first.slice(0, maxChars);
  return `${first}\n\n${marker}\n\n${tail.join("\n\n")}`;
}

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","to","of","in","on","for",
  "and","or","but","with","as","at","by","from","this","that","these","those","it","its",
  "i","you","he","she","we","they","them","his","her","their","our","your","my","me",
  "do","does","did","have","has","had","will","would","can","could","should","not","no",
  "so","if","then","than","also","just","like","what","how","why","when","where","which",
  "user","assistant","please","can","tell","explain","about","some","more","one","get",
  "overview","explanation","key","facts","definitions","doubts","resolved","counter",
  "arguments","viewpoints","open","questions","other",
]);

function extractLocalTags(text, maxTags = 4) {
  const words = text
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTags)
    .map(([w]) => w);
}

function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function findRelatedByLocalSimilarity(existingNotes, newTags, threshold = 0.25) {
  return existingNotes
    .filter((n) => jaccardSimilarity(n.tags || [], newTags) >= threshold)
    .map((n) => n.id);
}

function buildTrivialNote(payload, title) {
  const firstUser = payload.messages.find((m) => m.role === "user");
  const firstAssistant = payload.messages.find((m) => m.role === "assistant" || m.role === "page");
  return `## ${title}\n**Quick note** — ${firstUser ? firstUser.text : ""}\n\n${
    firstAssistant ? firstAssistant.text.slice(0, 500) : ""
  }`;
}

function searchTokens(text) {
  return new Set(String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .map((word) => word.replace(/(?:ing|ed|es|s)$/, "")));
}

function semanticMatchScore(note, query) {
  const queryText = String(query || "").trim().toLowerCase();
  if (!queryText) return 0;
  const noteText = [note.title, note.summary, note.content, ...(note.tags || [])].join(" ").toLowerCase();
  const queryTokens = searchTokens(queryText);
  const noteTokens = searchTokens(noteText);
  let matches = 0;
  for (const token of queryTokens) if (noteTokens.has(token) || noteText.includes(token)) matches++;
  const overlap = queryTokens.size ? matches / queryTokens.size : 0;
  const phraseBonus = noteText.includes(queryText) ? 0.5 : 0;
  return overlap + phraseBonus;
}

if (typeof module !== "undefined") {
  module.exports = {
    trimTranscript,
    compactTranscript,
    extractLocalTags,
    jaccardSimilarity,
    findRelatedByLocalSimilarity,
  };
}