const { systemPrompt: SYSTEM_PROMPT, maxOutputTokens: MAX_OUTPUT_TOKENS } = require("../shared/prompt.js");
const { parseGeminiResponse, buildGenerationConfig } = require("../shared/gemini.js");

async function callGemini(transcript) {
  const model = process.env.GEMINI_MODEL;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: transcript }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: buildGenerationConfig(model),
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseGeminiResponse(data);
}

async function callProvider(provider, transcript) {
  return callGemini(transcript);
}

module.exports = { callProvider, callGemini };