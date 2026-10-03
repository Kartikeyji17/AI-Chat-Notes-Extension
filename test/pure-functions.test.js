const test = require("node:test");
const assert = require("node:assert/strict");

const {
  trimTranscript,
  compactTranscript,
  extractLocalTags,
  jaccardSimilarity,
  findRelatedByLocalSimilarity,
} = require("../credit-optimizer.js");
const { parseStructuredNote } = require("../generation.js");
const { renderMarkdown } = require("../markdown.js");
const { normalizeNote, isSafeDiagram } = require("../db.js");
const { sm2Update } = require("../notes.js");

test("trimTranscript removes repeated lines and excess blank lines", () => {
  assert.equal(trimTranscript("a\na\n\n\n b  \n"), "a\n\n b");
});

test("compactTranscript keeps the head and latest messages under budget", () => {
  const transcript = [
    "[USER] first question",
    `[ASSISTANT] ${"old explanation ".repeat(30)}`,
    `[SELECTION] ${"middle context ".repeat(30)}`,
    "[CUSTOM_ROLE] latest resolution",
  ].join("\n\n");
  const compacted = compactTranscript(transcript, 220);
  assert.ok(compacted.length <= 220);
  assert.match(compacted, /^\[USER\] first question/);
  assert.match(compacted, /\[CUSTOM_ROLE\] latest resolution$/);
  assert.match(compacted, /middle of conversation omitted to save tokens/);

  const oversized = compactTranscript(`[USER] ${"head ".repeat(100)}tail`, 40);
  assert.ok(oversized.length <= 40);
  assert.match(oversized, /^\[USER\]/);
  assert.match(oversized, /tail$/);
});

test("extractLocalTags excludes section-heading vocabulary", () => {
  const tags = extractLocalTags("overview explanation key facts definitions doubts resolved counter arguments viewpoints open questions other quantum physics");
  assert.ok(tags.includes("quantum"));
  assert.ok(tags.includes("physics"));
  for (const word of ["overview", "explanation", "key", "facts", "definitions", "doubts", "resolved", "counter", "arguments", "viewpoints", "open", "questions", "other"]) {
    assert.ok(!tags.includes(word), word);
  }
});

test("jaccard similarity and related-note threshold", () => {
  assert.equal(jaccardSimilarity(["a", "b"], ["b", "c"]), 1 / 3);
  assert.deepEqual(findRelatedByLocalSimilarity([{ id: "one", tags: ["a", "b"] }, { id: "two", tags: ["x"] }], ["b", "c"]), ["one"]);
  assert.deepEqual(findRelatedByLocalSimilarity([{ id: "one", tags: ["a", "b"] }], ["b", "c"], 0.4), []);
});

test("parseStructuredNote parses every section and tolerates missing sections", () => {
  const parsed = parseStructuredNote(`## Topic
**Overview** — A useful summary.
**Explanation** — ignored prose
**Key facts / definitions**
- Fact one
**Doubts resolved**
- Doubt answer
**Counter-arguments / other viewpoints**
- Nuance
**Open questions**
- Explore this`);
  assert.equal(parsed.summary, "A useful summary.");
  assert.deepEqual(parsed.keyFacts, ["Fact one"]);
  assert.deepEqual(parsed.doubtsResolved, ["Doubt answer"]);
  assert.deepEqual(parsed.counterArguments, ["Nuance"]);
  assert.deepEqual(parsed.openQuestions, ["Explore this"]);
  assert.deepEqual(parseStructuredNote("## Only title"), { summary: "", keyFacts: [], doubtsResolved: [], counterArguments: [], openQuestions: [] });
});

test("sm2Update resets quality 2 and grows quality 4/5 intervals", () => {
  const base = { repetitions: 0, intervalDays: 1, easeFactor: 2.5, reviewHistory: [] };
  const again = sm2Update(base, 2);
  assert.equal(again.repetitions, 0);
  assert.equal(again.intervalDays, 1);

  const goodFirst = sm2Update(base, 4);
  const goodSecond = sm2Update({ ...base, ...goodFirst }, 4);
  const goodThird = sm2Update({ ...base, ...goodSecond }, 4);
  assert.equal(goodFirst.intervalDays, 1);
  assert.equal(goodSecond.intervalDays, 6);
  assert.equal(goodThird.intervalDays, Math.round(6 * goodSecond.easeFactor));
  assert.ok(sm2Update({ ...base, easeFactor: 1.3 }, 2).easeFactor >= 1.3);
  assert.ok(sm2Update({ ...base, easeFactor: 1.3 }, 4).easeFactor >= 1.3);
  assert.ok(sm2Update({ ...base, easeFactor: 1.3 }, 5).easeFactor >= 1.3);
});

test("normalizeNote rejects invalid ids and truncates bounded fields", () => {
  assert.throws(() => normalizeNote({ id: "   " }), /Invalid note/);
  const note = normalizeNote({ id: "note-1", title: "x".repeat(300), summary: "y".repeat(6000), transcript: "z".repeat(600000) });
  assert.equal(note.title.length, 200);
  assert.equal(note.summary.length, 5000);
  assert.equal(note.transcript.length, 500000);
});

test("isSafeDiagram accepts only bounded base64 image data URLs", () => {
  assert.equal(isSafeDiagram({ dataUrl: "data:image/png;base64,AAAA" }), true);
  assert.equal(isSafeDiagram({ dataUrl: "javascript:alert(1)" }), false);
  assert.equal(isSafeDiagram({ dataUrl: 'data:image/png;base64,AAAA"' }), false);
  assert.equal(isSafeDiagram({ dataUrl: "http://example.com/x.png" }), false);
});

test("renderMarkdown escapes HTML in prose and code blocks", () => {
  const rendered = renderMarkdown("<script>alert(1)</script>\n\n```html\n<div>unsafe</div>\n```");
  assert.match(rendered, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(rendered, /&lt;div&gt;unsafe&lt;\/div&gt;/);
  assert.doesNotMatch(rendered, /<script>|<div>/);
});
