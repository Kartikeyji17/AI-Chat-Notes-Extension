const promptConfig = typeof AIChatNotesPrompt !== "undefined" ? AIChatNotesPrompt : require("./shared/prompt.js");
const geminiConfig = typeof AIChatNotesGemini !== "undefined" ? AIChatNotesGemini : require("./shared/gemini.js");
const { systemPrompt: SYSTEM_PROMPT, maxOutputTokens: MAX_OUTPUT_TOKENS } = promptConfig;

async function request(url, options, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("The AI request timed out. Try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function callBackend(backendUrl, provider, transcript, backendToken, { refresh = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (backendToken) headers.Authorization = `Bearer ${backendToken}`;
  const res = await request(`${backendUrl.replace(/\/$/, "")}/api/generate-notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ provider, transcript, ...(refresh ? { refresh: true } : {}) }),
  });
  if (!res.ok) throw new Error(`Backend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content || "";
}

async function callAnthropic(apiKey, model, transcript) {
  const res = await request("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.find((b) => b.type === "text")?.text || "";
}

async function callOpenAI(apiKey, model, transcript) {
  const res = await request("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGemini(apiKey, model, transcript) {
  const res = await request(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: transcript }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return geminiConfig.parseGeminiResponse(data);
}

async function callAI(provider, apiKey, model, transcript, backendUrl, backendToken, options = {}) {
  if (backendUrl) return callBackend(backendUrl, provider, transcript, backendToken, options);
  if (provider === "openai") return callOpenAI(apiKey, model, transcript);
  if (provider === "anthropic") return callAnthropic(apiKey, model, transcript);
  if (provider !== "gemini") throw new Error(`Unsupported provider: ${provider}`);
  return callGemini(apiKey, model, transcript);
}

function defaultModelForProvider(provider) {
  return { gemini: "gemini-2.5-flash", openai: "gpt-4o-mini", anthropic: "claude-3-5-haiku-latest" }[provider] || "gemini-2.5-flash";
}

function conversationToTranscript(payload) {
  return payload.messages
    .map((m) => `[${m.role.toUpperCase()}]\n${m.text}`)
    .join("\n\n")
    .slice(0, 40000);
}

function extractTags(markdown) {
  const match = markdown.match(/^Tags:\s*(.+)$/im);
  if (!match) return [];
  return match[1].split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5);
}
function stripTagsLine(markdown) {
  return markdown.replace(/^Tags:\s*.+$/im, "").trim();
}

if (typeof module !== "undefined") module.exports = { callGemini };