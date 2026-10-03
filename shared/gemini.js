(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./prompt.js"));
  else root.AIChatNotesGemini = factory(root.AIChatNotesPrompt);
})(typeof globalThis !== "undefined" ? globalThis : this, function (prompt) {
  function parseGeminiResponse(data) {
    const candidate = data?.candidates?.[0];
    if (!candidate) {
      const reason = data?.promptFeedback?.blockReason;
      throw new Error(reason ? `Gemini returned no candidate (blocked: ${reason})` : "Gemini returned no note content.");
    }
    const text = candidate.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) throw new Error("Gemini returned no note content.");
    if (candidate.finishReason === "MAX_TOKENS") throw new Error("Gemini note generation reached the output token limit.");
    return text;
  }

  return { parseGeminiResponse };
});
