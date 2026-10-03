# 🧠 AI Chat Notes

### Turn every AI conversation into a permanent, revisable memory.

**You learn something new from ChatGPT, Claude, or Gemini every single day. Then it vanishes into scroll history, never to be seen again.**
AI Chat Notes fixes that — one click (or zero clicks) turns any chat into a deep, structured, spaced-repetition-ready note, stored locally, forever yours.

![Manifest](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![Provider](https://img.shields.io/badge/AI%20provider-Gemini%20%7C%20Google%20AI%20Studio-orange)

---

## 📌 The Problem

Every day, millions of people have genuinely valuable learning conversations with AI —
debugging a concept, understanding a new framework, working through a doubt in
first-principles depth. And every day, that knowledge disappears the moment the tab
closes.

- You can't search across your ChatGPT history and your Claude history at once.
- Nothing resurfaces what you learned last week so you actually retain it.
- Copy-pasting into a notes app manually is friction nobody actually does consistently.
- Raw chat transcripts are not notes — they're noise: filler, typos, false starts,
  re-explanations.

**The result:** hours of genuine learning, gone. Not because the knowledge wasn't
valuable — because there was never a system turning conversation into memory.

## ✅ The Solution

AI Chat Notes sits quietly on top of ChatGPT, Claude, and Gemini and turns any
conversation into a clean, deep, revision-ready note — automatically filed, tagged,
linked to related past topics, and scheduled for spaced repetition — all without
leaving the page you're already on.

No new app to open. No manual copy-paste. No forgetting.

---

## ✨ Features

### 🎯 One-click (or zero-click) capture
Click the extension icon, or use `Ctrl+Shift+U` without even opening a popup. Select
partial text first to summarize just that portion.

### 🧹 It understands *you*, not just your words
Type in broken Hinglish, shorthand, or typo-riddled prompts — the AI reads past your
literal wording to the actual concept, and writes a clean, correct English heading and
explanation. Your notes look like they were written by someone who deeply understood
the topic, not transcribed by a stenographer.

### 📚 Deep notes, not shallow bullets
Every note includes:
- **Overview** — what it is, why it matters
- **Explanation** — full paragraphs, not one-liners
- **Key facts / definitions** — the memorizable core
- **Doubts resolved** — your follow-up questions, woven into the answer
- **Counter-arguments** — the nuance a critical thinker should know
- **Open questions** — what to explore next

Arrows (→), math symbols, emojis, and fenced code blocks are preserved exactly as the
AI wrote them — nothing gets flattened into plain text.

### 🔁 Repeated-topic detection
Asked about the same concept three weeks apart? AI Chat Notes notices, links the notes
together, and flags it — so you can see your own learning curve on a topic over time.

### 🖼️ Diagram capture
If a diagram or chart is on screen when you generate notes, it's screenshotted and
embedded directly into the note alongside its explanation.

### 🧠 Real spaced repetition (SM-2)
Not a gimmick "revise in 3 days" counter — the same ease-factor algorithm behind Anki.
Rate each revision **Again / Good / Easy** and the schedule adapts to how well you
actually know it.

### 💸 Built to minimize AI credit usage
This is the part most "AI wrapper" extensions never think about:
- **Content-hash caching** — regenerate the same chat twice, get the cached result, zero
  extra API cost.
- **Trivial-exchange local shortcut** — short/simple exchanges get a template note with
  no AI call at all.
- **Local tagging & topic-matching** — TF-IDF-style keyword extraction and Jaccard
  similarity run entirely in JavaScript. Tagging and repeat-detection cost **zero**
  tokens.
- **Token-trimmed transcripts** — filler and duplicate lines stripped before anything is
  sent to an API.
- **Gemini-first model defaults** — Google AI Studio is the current low-cost foundation,
  with bounded transcripts and local shortcuts to reduce token usage.
- **No AI vision calls for diagrams** — captions come from on-page text, never a paid
  vision model.

### 🗄️ Local-first storage, no lock-in
Notes live in IndexedDB in your own browser. Full JSON export/import for backup — your
data, your file, no account required.

### 🔌 Bring your own key, or your own backend
Use a Gemini API key from Google AI Studio directly from the browser, or point the
extension at your own lightweight Gemini backend (included, Node/Express + SQLite) for
server-side caching across devices and no per-browser key management.

---

## 🏗️ Architecture

```text
┌─────────────────────────────┐
│     ChatGPT / Claude / Gemini │
│            (active tab)       │
└──────────────┬────────────────┘
               │
               │ content.js — extracts conversation + on-screen diagrams
               ▼
┌─────────────────────────────┐
│        popup.js /            │
│       background.js          │
│   (trigger: click or shortcut)│
└──────────────┬────────────────┘
               │
      ┌────────┴─────────┐
      ▼                  ▼
┌─────────────┐   ┌──────────────────┐
│credit-      │   │      ai.js       │
│optimizer.js │   │ (Anthropic/OpenAI/│
│(hash cache, │   │ Gemini / your own │
│ local tags, │   │ backend proxy)    │
│ similarity, │   └─────────┬────────┘
│ trim, skip) │             │
└──────┬──────┘             ▼
       │             ┌───────────────┐
       └────────────▶│     db.js     │
                     │  (IndexedDB)  │
                     └───────┬───────┘
                             ▼
                     ┌──────────────────┐
                     │    notes.html    │
                     │ search, filter,  │
                     │ SM-2 revision,   │
                     │ edit, export     │
                     └──────────────────┘
```

**Optional backend** (Node/Express + SQLite): a thin proxy that holds one shared API
key, rate-limits requests, and caches identical transcripts **across all your devices**
— not just in one browser.

---

## 🧰 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Extension | Vanilla JS, Manifest V3 | Zero build step, fully auditable, no framework bloat |
| Storage | IndexedDB | No practical size ceiling, unlike `chrome.storage.local` |
| AI providers | Anthropic / OpenAI / Gemini | User's choice, BYOK by default |
| Backend (optional) | Node.js, Express, better-sqlite3 | Deploys anywhere, zero external DB dependency |
| Spaced repetition | SM-2 algorithm | The proven, Anki-grade scheduling model |
| Similarity matching | Jaccard / TF-IDF (pure JS) | Zero-cost topic linking, no AI call needed |

---

## 🚀 Installation

1. Clone or download this repo.
2. Go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**, select the project folder.
5. Click the extension icon → **Settings** → enter your API key (or your backend URL).

## 🖱️ Usage

1. Have a conversation on ChatGPT, Claude, or Gemini.
2. Click the extension icon → **Generate notes from this chat** — or hit `Ctrl+Shift+U`.
3. Open **My Notes** to search, filter by tag, revise (SM-2), or export as Markdown.

Optional: select any portion of text on the page before triggering generation to
summarize just that selection.

---

## 🗺️ Roadmap

- [x] Gemini generation via Google AI Studio
- [x] Deep, structured note generation with counter-arguments
- [x] Local repeated-topic detection
- [x] Diagram screenshot capture
- [x] SM-2 spaced repetition
- [x] Credit-minimization layer (hash caching, local tagging, trimming)
- [x] IndexedDB migration
- [x] Optional self-hosted backend with server-side caching
- [ ] Fully automatic per-message capture (no click needed) via a lightweight local
      classifier, once similarity-matching can replace the need for an AI-based
      topic-boundary decision
- [ ] In-browser semantic embeddings (transformers.js) for smarter topic linking
- [ ] Cross-platform topic merging (a concept discussed on both ChatGPT and Claude
      resolves to one note)
- [ ] Firefox/Edge port
- [ ] Chrome Web Store listing

---

## 🤝 Contributing

Issues and PRs welcome. This project intentionally avoids frameworks and build tooling
— keep contributions dependency-light where possible.

## 📄 License

MIT — use it, fork it, ship it.

---

<p align="center">Built because forgetting what you just learned shouldn't be the default.</p>
