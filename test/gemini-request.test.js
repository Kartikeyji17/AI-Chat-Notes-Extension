const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

for (const file of ["ai.js", "backend/providers.js"]) {
  test(`${file} sends Gemini keys in the request header`, () => {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /generateContent\?key=/);
    assert.match(source, /x-goog-api-key/);
  });
}
