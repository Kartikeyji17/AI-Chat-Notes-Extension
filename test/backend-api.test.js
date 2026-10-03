const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.NODE_ENV = "development";
process.env.BACKEND_TOKEN = "test-token";
process.env.DAILY_REQUEST_LIMIT = "4";
process.env.DAILY_CHARACTER_LIMIT = "100000";
process.env.DB_PATH = path.join(os.tmpdir(), `ai-chat-notes-api-${process.pid}.sqlite`);

const providerModule = require("../backend/providers.js");
let providerCalls = 0;
providerModule.callProvider = async () => `generated-${++providerCalls}`;
const { app } = require("../backend/server.js");

test("backend generation enforces auth, caches, refreshes, validates, and enforces quota", async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/api/generate-notes`;
    const post = async (body, token = "test-token") => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

    assert.equal((await post({ transcript: "auth check" }, "")).status, 401);
    const first = await post({ provider: "gemini", transcript: "same transcript" });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { content: "generated-1", cached: false });

    const second = await post({ provider: "gemini", transcript: "same transcript" });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { content: "generated-1", cached: true });
    assert.equal(providerCalls, 1);

    const refreshed = await post({ provider: "gemini", transcript: "same transcript", refresh: true });
    assert.equal(refreshed.status, 200);
    assert.deepEqual(await refreshed.json(), { content: "generated-2", cached: false });
    assert.equal(providerCalls, 2);

    const updatedCache = await post({ provider: "gemini", transcript: "same transcript" });
    assert.deepEqual(await updatedCache.json(), { content: "generated-2", cached: true });

    assert.equal((await post({ transcript: "x".repeat(40001) })).status, 400);
    assert.equal((await post({ transcript: "quota request" })).status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
