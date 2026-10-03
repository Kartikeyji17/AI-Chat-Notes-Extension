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

  const messages = cleaned.split(/\n\n(?=\[(?:USER|ASSISTANT|PAGE)\])/);
  const kept = [];
  let length = 0;

  for (const message of messages) {
    const separatorLength = kept.length > 0 ? 2 : 0;
    if (length + separatorLength + message.length > maxChars) break;
    kept.push(message);
    length += separatorLength + message.length;
  }

  if (kept.length === 0) return cleaned.slice(0, maxChars);
  return kept.join("\n\n") + "\n\n[Transcript truncated to save tokens.]";
}

const STOPWORDS = new Set([
  "the","a","an","is","are","was","were","be","been","being","to","of","in","on","for",
  "and","or","but","with","as","at","by","from","this","that","these","those","it","its",
  "i","you","he","she","we","they","them","his","her","their","our","your","my","me",
  "do","does","did","have","has","had","will","would","can","could","should","not","no",
  "so","if","then","than","also","just","like","what","how","why","when","where","which",
  "user","assistant","please","can","tell","explain","about","some","more","one","get",
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