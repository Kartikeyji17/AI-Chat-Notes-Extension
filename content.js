function extractConversation() {
  const selectionText = window.getSelection().toString().trim();
  if (selectionText.length > 20) {
    return {
      site: location.hostname,
      url: location.href,
      title: document.title,
      messages: [{ role: "selection", text: selectionText }],
      isSelection: true,
    };
  }

  const host = location.hostname;
  const messages = [];

  if (host.includes("chatgpt.com") || host.includes("openai.com")) {
    document.querySelectorAll("[data-message-author-role]").forEach((el) => {
      const role = el.getAttribute("data-message-author-role") || "unknown";
      const text = el.innerText.trim();
      if (text) messages.push({ role, text });
    });
  } else if (host.includes("claude.ai")) {
    document
      .querySelectorAll('[data-testid="user-message"], [data-testid="chat-message"], .font-claude-message')
      .forEach((el) => {
        const isUser = el.matches('[data-testid="user-message"]');
        const text = el.innerText.trim();
        if (text) messages.push({ role: isUser ? "user" : "assistant", text });
      });
  } else if (host.includes("gemini.google.com")) {
    document.querySelectorAll("user-query, model-response").forEach((el) => {
      const isUser = el.tagName.toLowerCase() === "user-query";
      const text = el.innerText.trim();
      if (text) messages.push({ role: isUser ? "user" : "assistant", text });
    });
  }

  if (messages.length === 0) {
    const text = document.body.innerText.trim();
    if (text) messages.push({ role: "page", text: text.slice(0, 20000) });
  }

  return { site: host, url: location.href, title: document.title, messages, isSelection: false };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT_CONVERSATION") {
    sendResponse(extractConversation());
  }
  return true;
});