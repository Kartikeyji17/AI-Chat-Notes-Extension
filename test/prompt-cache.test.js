const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

process.env.DB_PATH = path.join(os.tmpdir(), `ai-chat-notes-test-${process.pid}.sqlite`);
const { hashTranscript } = require("../backend/server.js");

test("prompt version changes produce different backend cache hashes", () => {
  assert.notEqual(hashTranscript("gemini", "same transcript", 1), hashTranscript("gemini", "same transcript", 2));
});
