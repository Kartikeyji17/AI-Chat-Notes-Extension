require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { getCached, setCached } = require("./db");
const { callProvider } = require("./providers");

const app = express();
app.use(express.json({ limit: "2mb" }));

const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors({
    origin: allowedOrigin ? allowedOrigin : true,
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

function hashTranscript(provider, transcript) {
  return crypto.createHash("sha256").update(provider + "::" + transcript).digest("hex");
}

app.post("/api/generate-notes", async (req, res) => {
  try {
    const { provider = "anthropic", transcript } = req.body || {};
    if (!transcript || typeof transcript !== "string") {
      return res.status(400).json({ error: "transcript is required" });
    }

    const hash = hashTranscript(provider, transcript);
    const cached = getCached(hash);
    if (cached) {
      return res.json({ content: cached, cached: true });
    }

    const content = await callProvider(provider, transcript);
    setCached(hash, content, provider);
    res.json({ content, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AI Chat Notes backend running on :${port}`));