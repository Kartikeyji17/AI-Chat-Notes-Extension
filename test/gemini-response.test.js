const test = require("node:test");
const assert = require("node:assert/strict");
const { parseGeminiResponse, buildGenerationConfig } = require("../shared/gemini.js");

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
  assert.equal(parseGeminiResponse({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "partial" }] } }] }), "partial\n\n> ⚠ Note was truncated by the output token limit. Use Regenerate to retry.");
});

test("buildGenerationConfig disables thinking for flash models", () => {
  assert.deepEqual(buildGenerationConfig("gemini-2.5-flash"), { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } });
});

test("buildGenerationConfig uses a bounded thinking budget for pro models", () => {
  assert.deepEqual(buildGenerationConfig("gemini-2.5-pro-preview"), { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 128 } });
});

test("buildGenerationConfig omits thinking config for other models", () => {
  assert.deepEqual(buildGenerationConfig("gemini-1.5-pro"), { maxOutputTokens: 8192 });
});
