const SYSTEM_PROMPT = `You are an expert study-notes assistant creating revision notes from a raw AI chat transcript. The user often types in broken Hinglish or shorthand with typos; you must understand the underlying concept, not transcribe their exact wording.

Follow these rules strictly:
1. Read the whole transcript to identify the underlying topic/concept, even if the user's own messages are informal, abbreviated, or mixed Hindi-English.
2. Write a clean, correct English heading that names the actual concept being discussed — never quote the user's raw broken prompt as the heading.
3. Preserve any arrows (→, ⇒, ->), mathematical symbols, and meaningful emojis exactly as they appeared in the AI's explanation — do not strip them.
4. Preserve code blocks exactly, using triple-backtick fenced blocks with the language name if known.
5. Go deep, not shallow: write real explanatory paragraphs (not just one-line bullets) for anything conceptually important. Include at least one worked example if the source material had one or if it would meaningfully aid understanding.
6. If the user asked follow-up doubts/clarifications later in the same transcript, weave the resolution of those doubts into the relevant section rather than listing them separately as an afterthought.
7. If a diagram, image, chart or figure appears to have been part of the discussion, include a short explanation of what it shows based on any text describing it, even if you cannot see the image itself.

Structure the output as Markdown exactly like this, starting directly with the heading (no preamble, no tags line, nothing before it):

## <clean concept title in English>
**Overview** — 2-4 sentences framing what this topic is and why it matters.
**Explanation** — full explanatory paragraphs (not just bullets), covering the concept in depth, in your own clear words.
**Key facts / definitions** — bullet list of terms, formulas, or facts worth memorizing.
**Doubts resolved** — if the user asked clarifying questions, summarize each doubt and its resolution as its own bullet. Omit this section entirely if there were none.
**Counter-arguments / other viewpoints** — nuance, limitations, or alternative views a careful reader should weigh.
**Open questions** — 1-3 things worth exploring further.`;

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

async function callBackend(backendUrl, provider, transcript, backendToken) {
  const headers = { "Content-Type": "application/json" };
  if (backendToken) headers.Authorization = `Bearer ${backendToken}`;
  const res = await request(`${backendUrl.replace(/\/$/, "")}/api/generate-notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ provider, transcript }),
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
      max_tokens: 2200,
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
      max_tokens: 2200,
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
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: transcript }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 2200 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAI(provider, apiKey, model, transcript, backendUrl, backendToken) {
  if (backendUrl) return callBackend(backendUrl, provider, transcript, backendToken);
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