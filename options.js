const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const modelHintEl = document.getElementById("modelHint");
const savedEl = document.getElementById("saved");

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-4-5-20250929",
  openai: "gpt-4o-mini",
  gemini: "gemini-3.6-flash",
};

function updateHint() {
  modelHintEl.textContent = "Default: " + DEFAULT_MODELS[providerEl.value];
}

providerEl.addEventListener("change", () => {
  modelEl.value = DEFAULT_MODELS[providerEl.value];
  updateHint();
});

(async function init() {
  const { apiKey, model, provider } = await chrome.storage.local.get(["apiKey", "model", "provider"]);
  providerEl.value = provider || "anthropic";
  if (apiKey) apiKeyEl.value = apiKey;
  modelEl.value = model || DEFAULT_MODELS[providerEl.value];
  updateHint();
})();

document.getElementById("saveBtn").addEventListener("click", async () => {
  const provider = providerEl.value;
  await chrome.storage.local.set({
    provider,
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim() || DEFAULT_MODELS[provider],
  });
  savedEl.textContent = "Saved.";
  setTimeout(() => (savedEl.textContent = ""), 1500);
});