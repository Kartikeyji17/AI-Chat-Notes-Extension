function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let codeBuffer = [];

  function closeList() {
    if (inList) { html += "</ul>"; inList = false; }
  }

  for (let raw of lines) {
    const trimmed = raw.trim();

    if (trimmed.startsWith("```")) {
      if (!inCode) {
        inCode = true;
        codeBuffer = [];
      } else {
        inCode = false;
        html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(raw);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html += `<h2>${inlineMd(trimmed.slice(3))}</h2>`;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMd(trimmed.slice(2))}</li>`;
    } else if (trimmed === "") {
      closeList();
    } else {
      closeList();
      html += `<p>${inlineMd(trimmed)}</p>`;
    }
  }
  closeList();
  if (inCode) html += `<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`;
  return html;
}

function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

if (typeof module !== "undefined") module.exports = { renderMarkdown, escapeHtml };