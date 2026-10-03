const test = require("node:test");
const assert = require("node:assert/strict");
const { parseGeminiResponse } = require("../shared/gemini.js");

test("parseGeminiResponse returns normal Gemini text", () => {
  assert.equal(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "note" }] } }] }), "note");
});

test("parseGeminiResponse joins multiple text parts", () => {
  assert.equal(parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "one" }, { text: "two" }] } }] }), "onetwo");
});

test("parseGeminiResponse reports empty candidates and block reasons", () => {
  assert.throws(() => parseGeminiResponse({ candidates: [] }), /Gemini returned no note content/);
  assert.throws(() => parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }), /Gemini returned no candidate \(blocked: SAFETY\)/);
});

test("parseGeminiResponse reports empty text", () => {
  assert.throws(() => parseGeminiResponse({ candidates: [{ content: { parts: [] } }] }), /Gemini returned no note content/);
});

test("parseGeminiResponse reports MAX_TOKENS", () => {
  assert.throws(() => parseGeminiResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] }), /output token limit/);
});
