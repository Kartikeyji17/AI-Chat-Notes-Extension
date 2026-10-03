function detectDiagrams() {
  const diagrams = [];
  document.querySelectorAll("img, canvas, svg").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 60) return; // skip small icons/avatars
    if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) return; // only currently on-screen elements can be screenshotted
    const caption = (el.alt || el.getAttribute("aria-label") || "").trim();
    diagrams.push({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      scale: window.devicePixelRatio || 1,
      caption,
    });
  });
  return diagrams;
}

const EXTRACTOR_VERSION = "1.1";

function extractConversation() {
  const selectionText = window.getSelection().toString().trim();
  if (selectionText.length > 20) {
    return {
      site: location.hostname,
      url: location.href,
      title: document.title,
      messages: [{ role: "selection", text: selectionText }],
      isSelection: true,
      diagrams: detectDiagrams(),
    };
  }

  const host = location.hostname;
  const messages = [];
  let adapter = "unknown";
  let confidence = 0;

  if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    adapter = "chatgpt";
    const elements = document.querySelectorAll("[data-message-author-role], [data-testid='conversation-turn'], article[data-testid*='conversation-turn']");
    elements.forEach((el) => {
      const role = el.getAttribute("data-message-author-role") || "unknown";
      const text = el.innerText.trim();
      if (text && !messages.some((message) => message.role === role && message.text === text)) messages.push({ role, text });
    });
    confidence = messages.length > 0 && messages.every((message) => message.role !== "unknown") ? 1 : 0.6;
  } else if (host.includes("claude.ai")) {
    adapter = "claude";
    document
      .querySelectorAll('[data-testid="user-message"], [data-testid="chat-message"], [data-testid*="message-content"], .font-claude-message')
      .forEach((el) => {
        const isUser = el.matches('[data-testid="user-message"]');
        const text = el.innerText.trim();
        if (text && !messages.some((message) => message.text === text)) messages.push({ role: isUser ? "user" : "assistant", text });
      });
    confidence = messages.length > 0 ? 0.9 : 0;
  } else if (host.includes("gemini.google.com")) {
    adapter = "gemini";
    document.querySelectorAll("user-query, model-response").forEach((el) => {
      const isUser = el.tagName.toLowerCase() === "user-query";
      const text = el.innerText.trim();
      if (text && !messages.some((message) => message.text === text)) messages.push({ role: isUser ? "user" : "assistant", text });
    });
    confidence = messages.length > 0 ? 0.9 : 0;
  }

  if (messages.length === 0 && selectionText.length <= 20) {
    const text = document.body.innerText.trim();
    if (text && text.length < 50000) messages.push({ role: "page", text: text.slice(0, 20000) });
    confidence = text ? 0.25 : 0;
  }

  return {
    site: host,
    url: location.href,
    title: document.title,
    messages,
    isSelection: false,
    adapter,
    extractorVersion: EXTRACTOR_VERSION,
    confidence,
    diagrams: detectDiagrams(),
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT_CONVERSATION") {
    sendResponse(extractConversation());
  }
  return true;
});