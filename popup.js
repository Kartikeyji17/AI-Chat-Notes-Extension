const statusEl = document.getElementById("status");
const generateBtn = document.getElementById("generateBtn");
const btnText = document.getElementById("btnText");

document.getElementById("openNotesBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("notes.html") });
});

document.getElementById("openOptionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(text) {
  statusEl.textContent = text;
}

function setLoading(isLoading, label) {
  generateBtn.disabled = isLoading;
  generateBtn.classList.toggle("loading", isLoading);
  btnText.textContent = label;
}

async function getSettings() {
  const { apiKey, model, provider } = await chrome.storage.local.get(["apiKey", "model", "provider"]);
  return { apiKey, provider: provider || "anthropic", model };
}

const SYSTEM_PROMPT = `You are a study-notes assistant. You will be given a transcript of a conversation the user had with an AI.
Turn it into tight revision notes in Markdown, using this structure:

## <short topic title>
**Summary** — 3-5 bullet points capturing the core idea, in plain words.
**Key facts / definitions** — bullet list of terms or facts worth memorizing.
**Counter-arguments / other viewpoints** — anything from the conversation that pushes back, adds nuance, or a critical reader should weigh (if none were discussed, infer the most important objection or limitation a careful reader should consider).
**Open questions** — 1-3 things worth exploring further.

Be concise. No preamble, no restating the instructions, just the notes.`;

async function callAnthropic(apiKey, model, transcript) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content.find((b) => b.type === "text")?.text || "";
}

async function callOpenAI(apiKey, model, transcript) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
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
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: transcript }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 1200 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAI(provider, apiKey, model, transcript) {
  if (provider === "openai") return callOpenAI(apiKey, model, transcript);
  if (provider === "gemini") return callGemini(apiKey, model, transcript);
  return callAnthropic(apiKey, model, transcript);
}

function conversationToTranscript(payload) {
  return payload.messages
    .map((m) => `[${m.role.toUpperCase()}]\n${m.text}`)
    .join("\n\n")
    .slice(0, 40000);
}

generateBtn.addEventListener("click", async () => {
  setLoading(true, "Reading the chat...");
  setStatus("");

  try {
    const { apiKey, provider, model } = await getSettings();
    if (!apiKey) {
      setStatus("Set your API key in Settings first.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const payload = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" });

    if (!payload || payload.messages.length === 0) {
      setStatus("Couldn't find a conversation on this page.");
      setLoading(false, "Generate notes from this chat");
      return;
    }

    setLoading(true, "Generating notes...");
    const transcript = conversationToTranscript(payload);
    const notesMarkdown = await callAI(provider, apiKey, model, transcript);

    const firstUserMsg = payload.messages.find((m) => m.role === "user");
    const title = (firstUserMsg ? firstUserMsg.text : payload.title).slice(0, 80);

    const note = {
      id: crypto.randomUUID(),
      title,
      site: payload.site,
      url: payload.url,
      createdAt: Date.now(),
      content: notesMarkdown,
    };

    const { notes = [] } = await chrome.storage.local.get("notes");
    notes.unshift(note);
    await chrome.storage.local.set({ notes });

    setStatus("Saved. Open 'my notes' to view.");
  } catch (err) {
    setStatus("Error: " + err.message);
  } finally {
    setLoading(false, "Generate notes from this chat");
  }
});