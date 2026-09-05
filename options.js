const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const modelHintEl = document.getElementById("modelHint");
const backendUrlEl = document.getElementById("backendUrl");
const savedEl = document.getElementById("saved");

const DEFAULT_MODELS = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  gemini: "gemini-3.6-flash",
};

function updateHint() {
  const isDefault = modelEl.value.trim() === DEFAULT_MODELS[providerEl.value];
  modelHintEl.textContent = isDefault
    ? "Using the cheapest tier for this provider (recommended)."
    : `Custom model set — costs may be higher than the default (${DEFAULT_MODELS[providerEl.value]}).`;
}

providerEl.addEventListener("change", () => {
  modelEl.value = DEFAULT_MODELS[providerEl.value];
  updateHint();
});
modelEl.addEventListener("input", updateHint);

(async function init() {
  const { apiKey, model, provider, backendUrl } = await chrome.storage.local.get([
    "apiKey", "model", "provider", "backendUrl",
  ]);
  providerEl.value = provider || "anthropic";
  if (apiKey) apiKeyEl.value = apiKey;
  if (backendUrl) backendUrlEl.value = backendUrl;
  modelEl.value = model || DEFAULT_MODELS[providerEl.value];
  updateHint();
})();

document.getElementById("saveBtn").addEventListener("click", async () => {
  const provider = providerEl.value;
  await chrome.storage.local.set({
    provider,
    apiKey: apiKeyEl.value.trim(),
    model: modelEl.value.trim() || DEFAULT_MODELS[provider],
    backendUrl: backendUrlEl.value.trim(),
  });
  savedEl.textContent = "Saved.";
  setTimeout(() => (savedEl.textContent = ""), 1500);
});