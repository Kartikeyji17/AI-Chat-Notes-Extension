const { systemPrompt: SYSTEM_PROMPT, maxOutputTokens: MAX_OUTPUT_TOKENS } = require("../shared/prompt.js");

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
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text || candidate.finishReason === "MAX_TOKENS") {
    throw new Error(candidate.finishReason === "MAX_TOKENS" ? "Gemini note generation reached the output token limit." : "Gemini returned no note content.");
  }
  return text;
}

async function callProvider(provider, transcript) {
  return callGemini(transcript);
}

module.exports = { callProvider };