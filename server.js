"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./db");

const PORT = Number(process.env.PORT || 8765);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const ADMIN_PIN = process.env.COSMIC_ADMIN_PIN || "cosmic-admin";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function signSession(secret, gameId, startedAt, targetScore, durationSeconds) {
  const payload = `${gameId}:${startedAt}:${targetScore}:${durationSeconds}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyToken(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function resolveRewardTier(percentage, tiers) {
  const sorted = [...tiers].sort((a, b) => b.minPct - a.minPct);
  for (const tier of sorted) {
    if (percentage >= tier.minPct) {
      return tier;
    }
  }
  return sorted[sorted.length - 1] || { label: "Below 40%", minPct: 0, maxPct: 39, amount: 0 };
}

function validateAndScoreTelemetry(session, body) {
  const serverElapsedMs = Date.now() - session.startedAt;
  const telemetry = body && typeof body.telemetry === "object" && body.telemetry ? body.telemetry : {};
  const slices = Array.isArray(telemetry.slices) ? telemetry.slices : [];
  const clientScore = Number(body.clientScore || 0);
  const mistakes = Number.isInteger(telemetry.mistakes) ? telemetry.mistakes : Number(telemetry.mistakes || 0);
  const hitSkull = Boolean(telemetry.hitSkull);
  const requestedOutcome = body.outcome === "won" ? "won" : "lost";

  const issues = [];

  if (!Number.isInteger(mistakes) || mistakes < 0) {
    issues.push("Invalid mistakes counter");
  }

  // Timing verification for won rounds
  if (requestedOutcome === "won") {
    const minValidMs = Math.max(5000, (session.durationSeconds - 2.5) * 1000);
    const maxValidMs = (session.durationSeconds + 60) * 1000;
    if (serverElapsedMs < minValidMs) {
      issues.push(`Elapsed time too short (${serverElapsedMs}ms < ${minValidMs}ms)`);
    }
    if (serverElapsedMs > maxValidMs) {
      issues.push(`Session expired (${serverElapsedMs}ms > ${maxValidMs}ms)`);
    }
    if (hitSkull) {
      issues.push("Cannot win after hitting a skull hazard");
    }
    if (mistakes > session.maxMistakes) {
      issues.push(`Mistakes (${mistakes}) exceeded allowed limit (${session.maxMistakes})`);
    }
  }

  // Physical rate-limit on total slices
  const maxSlices = Math.ceil(session.durationSeconds * 4.2) + 14;
  if (slices.length > maxSlices) {
    issues.push(`Slice count (${slices.length}) exceeded physical spawn limit (${maxSlices})`);
  }

  let recomputedScore = 0;
  let validComets = 0;
  let validStars = 0;
  let prevTMs = -1;
  const maxStars = Math.ceil(session.durationSeconds / 5) + 3;

  for (let i = 0; i < Math.min(slices.length, maxSlices); i++) {
    const ev = slices[i];
    if (!ev || typeof ev !== "object") {
      issues.push("Malformed slice telemetry entry");
      break;
    }
    const tMs = Number(ev.tMs);
    if (!Number.isFinite(tMs) || tMs < 0 || tMs > serverElapsedMs + 2500) {
      issues.push("Out-of-bounds slice timestamp");
      break;
    }
    if (prevTMs >= 0 && tMs < prevTMs - 50) {
      issues.push("Non-monotonic slice timestamp");
      break;
    }

    if (ev.type === "star") {
      validStars += 1;
      if (validStars > maxStars) {
        issues.push("Star crystal count exceeded spawn limit");
        break;
      }
      recomputedScore += 5;
    } else if (ev.type === "comet") {
      validComets += 1;
      const withinComboWindow = prevTMs >= 0 && tMs - prevTMs <= 350;
      const rawCombo = Number(ev.combo || 1);
      const safeCombo = withinComboWindow ? clamp(Math.floor(rawCombo), 1, 4) : 1;
      const highBonus = ev.highIntercept === true ? 1 : 0;
      recomputedScore += safeCombo + highBonus;
    } else {
      issues.push("Unknown entity type in telemetry");
      break;
    }
    prevTMs = tMs;
  }

  // Check for blatant client score tampering
  if (Number.isFinite(clientScore) && clientScore > recomputedScore + 2) {
    issues.push(`Client score (${clientScore}) exceeded validated telemetry (${recomputedScore})`);
  }

  const finalOutcome =
    issues.length === 0 &&
    requestedOutcome === "won" &&
    !hitSkull &&
    mistakes <= session.maxMistakes
      ? "won"
      : "lost";

  const validatedScore = Math.max(0, recomputedScore);
  const percentage = clamp(Math.round((validatedScore / session.targetScore) * 100), 0, 100);

  return {
    issues,
    finalOutcome,
    validatedScore,
    validComets,
    validStars,
    mistakes,
    hitSkull,
    serverElapsedMs,
    percentage
  };
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function readJsonBody(req, maxBytes = 262144) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (_) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function isAdminAuthorized(req) {
  const pin = req.headers["x-admin-pin"];
  return typeof pin === "string" && verifyToken(ADMIN_PIN, pin);
}

async function handleApi(req, res, urlPath) {
  if (req.method === "GET" && urlPath === "/api/config") {
    const state = await db.getAppState();
    return sendJson(res, 200, {
      durationSeconds: state.config.durationSeconds,
      targetScore: state.config.targetScore,
      maxMistakes: state.config.maxMistakes,
      rewardTiers: state.config.rewardTiers,
      walletTotalCredited: state.wallet.totalCredited
    });
  }

  if (req.method === "POST" && urlPath === "/api/game/start") {
    const state = await db.getAppState();
    const gameId = crypto.randomUUID();
    const startedAt = Date.now();
    const durationSeconds = state.config.durationSeconds;
    const targetScore = state.config.targetScore;
    const maxMistakes = state.config.maxMistakes;
    const rewardTiersSnapshot = JSON.parse(JSON.stringify(state.config.rewardTiers));

    const startToken = signSession(
      state.hmacSecret,
      gameId,
      startedAt,
      targetScore,
      durationSeconds
    );

    await db.createSession({
      gameId,
      startedAt,
      durationSeconds,
      targetScore,
      maxMistakes,
      rewardTiersSnapshot,
      startToken,
      status: "active"
    });

    return sendJson(res, 200, {
      gameId,
      startToken,
      startedAt,
      durationSeconds,
      targetScore,
      maxMistakes,
      rewardTiers: rewardTiersSnapshot
    });
  }

  if (req.method === "POST" && urlPath === "/api/game/complete") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const gameId = typeof body.gameId === "string" ? body.gameId : "";
    const startToken = typeof body.startToken === "string" ? body.startToken : "";
    const existing = await db.findSession(gameId);

    if (!existing) {
      await db.logSecurityEvent("UNKNOWN_GAME_ID", { gameId });
      return sendJson(res, 404, { error: "Invalid or unknown gameId" });
    }

    if (!verifyToken(existing.startToken, startToken)) {
      await db.logSecurityEvent("INVALID_START_TOKEN", { gameId });
      return sendJson(res, 403, { error: "Invalid session signature" });
    }

    // Atomically lock session in MongoDB to prevent duplicate completion & crediting
    const session = await db.lockSessionForCompletion(gameId);
    if (!session) {
      await db.logSecurityEvent("DUPLICATE_CLAIM_BLOCKED", { gameId, status: existing.status });
      return sendJson(res, 409, {
        error: "Duplicate reward claim blocked: this game ID is already finalized.",
        gameId,
        result: existing.result || null
      });
    }

    const validation = validateAndScoreTelemetry(session, body);
    const tampered = validation.issues.length > 0;
    if (tampered) {
      await db.logSecurityEvent("TELEMETRY_VALIDATION_FAILED", {
        gameId,
        issues: validation.issues
      });
    }

    let rewardAmount = 0;
    let tier = resolveRewardTier(0, session.rewardTiersSnapshot);

    if (validation.finalOutcome === "won" && !tampered) {
      tier = resolveRewardTier(validation.percentage, session.rewardTiersSnapshot);
      rewardAmount = Number(tier.amount) || 0;
    }

    // Idempotent wallet credit guarded by unique index on credited_games.gameId
    const creditResult = await db.creditWalletOnce(gameId, rewardAmount);
    if (rewardAmount > 0 && !creditResult.credited) {
      rewardAmount = 0;
    }

    const lossReason = tampered
      ? `Anti-cheat flagged: ${validation.issues[0]}`
      : validation.finalOutcome === "lost"
        ? String(body.lossReason || "You exceeded allowed mistakes")
        : "";

    const record = {
      gameId,
      completedAt: new Date().toISOString(),
      durationSeconds: session.durationSeconds,
      serverElapsedMs: validation.serverElapsedMs,
      outcome: tampered ? "flagged" : validation.finalOutcome,
      lossReason,
      validatedScore: validation.validatedScore,
      targetScore: session.targetScore,
      percentage: validation.percentage,
      slicedComets: validation.validComets,
      slicedStars: validation.validStars,
      mistakes: validation.mistakes,
      maxMistakes: session.maxMistakes,
      tierLabel: validation.finalOutcome === "won" && !tampered ? tier.label : "No Reward (Lost)",
      rewardAmount,
      verified: !tampered
    };

    await db.finalizeSession(gameId, record.outcome, record);
    await db.insertHistoryRecord(record);

    return sendJson(res, 200, {
      ...record,
      walletTotalCredited: creditResult.walletTotalCredited,
      rewardTiers: session.rewardTiersSnapshot
    });
  }

  if (req.method === "GET" && urlPath === "/api/history") {
    const summary = await db.getHistorySummary(25);
    return sendJson(res, 200, summary);
  }

  // Admin endpoints
  if (urlPath.startsWith("/api/admin/")) {
    if (!isAdminAuthorized(req)) {
      return sendJson(res, 401, { error: "Unauthorized: valid Admin PIN required" });
    }

    if (req.method === "GET" && urlPath === "/api/admin/state") {
      const adminState = await db.getAdminState();
      return sendJson(res, 200, adminState);
    }

    if (req.method === "POST" && urlPath === "/api/admin/config") {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }

      const state = await db.getAppState();
      const durationSeconds = clamp(Number(body.durationSeconds || state.config.durationSeconds), 20, 180);
      const targetScore = clamp(Number(body.targetScore || state.config.targetScore), 20, 500);
      const maxMistakes = clamp(Number(body.maxMistakes ?? state.config.maxMistakes), 0, 5);

      let nextTiers = state.config.rewardTiers;
      if (Array.isArray(body.rewardTiers) && body.rewardTiers.length === 5) {
        nextTiers = state.config.rewardTiers.map((orig, idx) => {
          const incoming = body.rewardTiers[idx] || {};
          const amt = Number(incoming.amount);
          return {
            ...orig,
            amount: Number.isFinite(amt) && amt >= 0 && amt <= 10000 ? Math.round(amt) : orig.amount
          };
        });
      }

      const nextConfig = {
        durationSeconds: Math.round(durationSeconds),
        targetScore: Math.round(targetScore),
        maxMistakes: Math.round(maxMistakes),
        rewardTiers: nextTiers
      };
      await db.updateConfig(nextConfig);
      return sendJson(res, 200, { ok: true, config: nextConfig });
    }

    if (req.method === "POST" && urlPath === "/api/admin/reset-history") {
      await db.resetHistoryAndLedger();
      return sendJson(res, 200, { ok: true });
    }
  }

  return sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, urlPath) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.normalize(path.join(ROOT_DIR, safePath));
  if (
    !resolved.startsWith(ROOT_DIR) ||
    resolved.startsWith(DATA_DIR) ||
    path.basename(resolved).startsWith(".env")
  ) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = decodeURIComponent(parsed.pathname);

  if (urlPath.startsWith("/api/")) {
    handleApi(req, res, urlPath).catch((err) => {
      console.error("API error:", err);
      sendJson(res, 500, { error: "Internal server error" });
    });
    return;
  }

  serveStatic(req, res, urlPath);
});

async function start() {
  try {
    await db.connectDb();
    console.log("Connected to MongoDB.");
    server.listen(PORT, () => {
      console.log(`Cosmic Slice server listening on http://localhost:${PORT}/`);
    });
  } catch (err) {
    console.error("Failed to start Cosmic Slice server:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await db.closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await db.closeDb();
  process.exit(0);
});

start();
