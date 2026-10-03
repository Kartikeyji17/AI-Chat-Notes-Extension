const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const modelEl = document.getElementById("model");
const modelHintEl = document.getElementById("modelHint");
const backendUrlEl = document.getElementById("backendUrl");
const backendTokenEl = document.getElementById("backendToken");
const storeTranscriptEl = document.getElementById("storeTranscript");
const captureDiagramsEl = document.getElementById("captureDiagrams");
const syncUrlEl = document.getElementById("syncUrl");
const syncAccountEl = document.getElementById("syncAccount");
const syncTokenEl = document.getElementById("syncToken");
const retentionDaysEl = document.getElementById("retentionDays");
const savedEl = document.getElementById("saved");

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
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
  const { apiKey, model, provider, backendUrl, backendToken, storeTranscript, captureDiagrams, retentionDays, syncUrl, syncAccount, syncToken } = await chrome.storage.local.get([
    "apiKey", "model", "provider", "backendUrl", "backendToken", "storeTranscript", "captureDiagrams", "retentionDays", "syncUrl", "syncAccount", "syncToken",
  ]);
  providerEl.value = provider && DEFAULT_MODELS[provider] ? provider : "gemini";
  if (apiKey) apiKeyEl.value = apiKey;
  if (backendUrl) backendUrlEl.value = backendUrl;
  if (backendToken) backendTokenEl.value = backendToken;
  storeTranscriptEl.checked = storeTranscript !== false;
  captureDiagramsEl.checked = captureDiagrams !== false;
  if (retentionDays) retentionDaysEl.value = retentionDays;
  if (syncUrl) syncUrlEl.value = syncUrl;
  if (syncAccount) syncAccountEl.value = syncAccount;
  if (syncToken) syncTokenEl.value = syncToken;
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
    backendToken: backendTokenEl.value.trim(),
    storeTranscript: storeTranscriptEl.checked,
    captureDiagrams: captureDiagramsEl.checked,
    retentionDays: retentionDaysEl.value ? Math.max(1, Math.min(3650, Number(retentionDaysEl.value))) : null,
    syncUrl: syncUrlEl.value.trim().replace(/\/$/, ""),
    syncAccount: syncAccountEl.value.trim(),
    syncToken: syncTokenEl.value.trim(),
  });
  savedEl.textContent = "Saved.";
  setTimeout(() => (savedEl.textContent = ""), 1500);
});

document.getElementById("deleteAllBtn").addEventListener("click", async () => {
  if (!confirm("Delete every locally stored note and duplicate index? This cannot be undone.")) return;
  await clearAllData();
  savedEl.textContent = "All local notes deleted.";
});

document.getElementById("removeTranscriptsBtn").addEventListener("click", async () => {
  if (!confirm("Remove every stored transcript while keeping generated notes?")) return;
  await removeAllTranscripts();
  savedEl.textContent = "Stored transcripts removed.";
});

document.getElementById("registerSyncBtn").addEventListener("click", async () => {
  const syncUrl = syncUrlEl.value.trim().replace(/\/$/, "");
  const account = syncAccountEl.value.trim();
  const bootstrapToken = backendTokenEl.value.trim();
  if (!syncUrl || !account || !bootstrapToken) {
    savedEl.textContent = "Enter sync URL, account, and backend token first.";
    return;
  }
  try {
    const response = await fetch(`${syncUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${bootstrapToken}` },
      body: JSON.stringify({ account }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Registration failed");
    syncTokenEl.value = data.token;
    await chrome.storage.local.set({ syncUrl, syncAccount: account, syncToken: data.token });
    savedEl.textContent = "Sync account registered.";
  } catch (error) {
    savedEl.textContent = error.message;
  }
});