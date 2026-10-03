require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { getCached, setCached, getSyncSnapshot, setSyncSnapshot, createAccount, getAccountByTokenHash, consumeUsage, getSyncHistory, exportState, importState } = require("./db");
const { callProvider } = require("./providers");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const backendToken = process.env.BACKEND_TOKEN;
const dailyRequestLimit = Number(process.env.DAILY_REQUEST_LIMIT || 100);
const dailyCharacterLimit = Number(process.env.DAILY_CHARACTER_LIMIT || 2000000);
const metrics = { requests: 0, cacheHits: 0, generations: 0, syncs: 0, errors: 0 };
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

if (isProduction && (!backendToken || allowedOrigins.length === 0)) {
  throw new Error("BACKEND_TOKEN and ALLOWED_ORIGINS are required in production.");
}
if (!Number.isInteger(dailyRequestLimit) || dailyRequestLimit <= 0 || !Number.isInteger(dailyCharacterLimit) || dailyCharacterLimit <= 0) {
  throw new Error("DAILY_REQUEST_LIMIT and DAILY_CHARACTER_LIMIT must be positive integers.");
}
if (isProduction && (!process.env.GEMINI_API_KEY || !process.env.GEMINI_MODEL)) {
  throw new Error("GEMINI_API_KEY and GEMINI_MODEL are required in production.");
}

app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, !isProduction);
      return callback(null, false);
    },
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  metrics.requests++;
  const startedAt = Date.now();
  res.on("finish", () => console.log(JSON.stringify({
    event: "http_request",
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    status: res.statusCode,
    durationMs: Date.now() - startedAt,
    account: req.accountId || null,
  })));
  next();
});

function authenticate(received) {
  if (!received) return null;
  if (backendToken && received === backendToken) return { accountId: "legacy" };
  const tokenHash = crypto.createHash("sha256").update(received).digest("hex");
  return getAccountByTokenHash(tokenHash);
}

function requireToken(req, res, next) {
  const received = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const account = authenticate(received);
  if (!account && (isProduction || backendToken)) return res.status(401).json({ error: "Unauthorized" });
  req.accountId = account?.accountId || "development";
  next();
}

function requireBootstrapToken(req, res, next) {
  const received = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!backendToken || received !== backendToken) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function hashTranscript(provider, transcript) {
  return crypto.createHash("sha256").update(provider + "::" + transcript).digest("hex");
}

app.post("/api/generate-notes", requireToken, async (req, res) => {
  try {
    const { provider = "gemini", transcript } = req.body || {};
    if (provider !== "gemini") return res.status(400).json({ error: "Unsupported provider" });
    if (!transcript || typeof transcript !== "string" || transcript.length > 40000) {
      return res.status(400).json({ error: "transcript must be a non-empty string under 40000 characters" });
    }
    if (!consumeUsage(req.accountId, dailyRequestLimit, dailyCharacterLimit, transcript.length)) {
      return res.status(429).json({ error: "Daily account quota exceeded" });
    }

    const hash = hashTranscript(provider, transcript);
    const cached = getCached(hash);
    if (cached) {
      metrics.cacheHits++;
      return res.json({ content: cached, cached: true });
    }

    const content = await callProvider(provider, transcript);
    metrics.generations++;
    setCached(hash, content, provider);
    res.json({ content, cached: false });
  } catch (err) {
    metrics.errors++;
    console.error("note generation failed", err);
    res.status(502).json({ error: "Note generation failed" });
  }
});

function validAccountId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{3,100}$/.test(value);
}

app.get("/api/sync", requireToken, (req, res) => {
  const accountId = req.query.account;
  if (!validAccountId(accountId)) return res.status(400).json({ error: "valid account is required" });
  if (accountId !== req.accountId && req.accountId !== "legacy" && req.accountId !== "development") {
    return res.status(403).json({ error: "account does not match token" });
  }
  res.json(getSyncSnapshot(accountId) || { notes: [], updatedAt: 0 });
});

app.put("/api/sync", requireToken, (req, res) => {
  const { account, notes } = req.body || {};
  if (!validAccountId(account) || !Array.isArray(notes) || notes.length > 5000) {
    return res.status(400).json({ error: "account and a notes array are required" });
  }
  const serializedSize = Buffer.byteLength(JSON.stringify(notes), "utf8");
  if (serializedSize > 4500000) return res.status(413).json({ error: "sync payload is too large" });
  if (account !== req.accountId && req.accountId !== "legacy" && req.accountId !== "development") {
    return res.status(403).json({ error: "account does not match token" });
  }
  metrics.syncs++;
  res.json({ updatedAt: setSyncSnapshot(account, notes) });
});

app.get("/api/sync/history", requireToken, (req, res) => {
  const account = req.query.account;
  if (!validAccountId(account)) return res.status(400).json({ error: "valid account is required" });
  if (account !== req.accountId && req.accountId !== "legacy" && req.accountId !== "development") {
    return res.status(403).json({ error: "account does not match token" });
  }
  res.json({ history: getSyncHistory(account) });
});

app.post("/api/auth/register", requireBootstrapToken, (req, res) => {
  const accountId = req.body?.account;
  if (!validAccountId(accountId)) return res.status(400).json({ error: "valid account is required" });
  const rawToken = crypto.randomBytes(32).toString("hex");
  try {
    createAccount(accountId, crypto.createHash("sha256").update(rawToken).digest("hex"));
    res.status(201).json({ account: accountId, token: rawToken });
  } catch {
    res.status(409).json({ error: "account already exists" });
  }
});

app.get("/api/metrics", requireBootstrapToken, (req, res) => res.json(metrics));

app.get("/api/admin/backup", requireBootstrapToken, (req, res) => res.json(exportState()));

app.post("/api/admin/restore", requireBootstrapToken, (req, res) => {
  try {
    importState(req.body);
    res.json({ restored: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`AI Chat Notes backend running on :${port}`));