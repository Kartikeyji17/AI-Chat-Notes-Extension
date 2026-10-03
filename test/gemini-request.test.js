const test = require("node:test");
const assert = require("node:assert/strict");

function response(data, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(data), json: async () => data };
}

test("extension callGemini sends the key in a header and uses model config", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response({ candidates: [{ content: { parts: [{ text: "note" }] } }] });
  };
  try {
    const { callGemini } = require("../ai.js");
    assert.equal(await callGemini("secret", "gemini-2.5-flash", "transcript"), "note");
    const body = JSON.parse(request.options.body);
    assert.ok(!request.url.includes("key="));
    assert.equal(request.options.headers["x-goog-api-key"], "secret");
    assert.deepEqual(body.generationConfig, { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } });
  } finally {
    global.fetch = originalFetch;
  }
});

test("backend callGemini sends the key in a header and uses model config", async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return response({ candidates: [{ content: { parts: [{ text: "note" }] } }] });
  };
  try {
    process.env.GEMINI_MODEL = "gemini-2.5-pro-preview";
    process.env.GEMINI_API_KEY = "secret";
    const { callGemini } = require("../backend/providers.js");
    assert.equal(await callGemini("transcript"), "note");
    const body = JSON.parse(request.options.body);
    assert.ok(!request.url.includes("key="));
    assert.equal(request.options.headers["x-goog-api-key"], "secret");
    assert.deepEqual(body.generationConfig, { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 128 } });
  } finally {
    global.fetch = originalFetch;
  }
});

test("callGemini reports non-OK responses with status", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => response({ error: "bad" }, false, 503);
  try {
    const { callGemini } = require("../ai.js");
    await assert.rejects(callGemini("secret", "gemini-2.5-flash", "transcript"), /Gemini 503/);
  } finally {
    global.fetch = originalFetch;
  }
});
