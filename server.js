"use strict";

const http = require("http");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { Server: SocketIOServer } = require("socket.io");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const db = require("./db");
const {
  hashPassword,
  verifyPassword,
  signAuthToken,
  createRateLimiter,
  createAuthMiddleware
} = require("./auth");
const {
  clamp,
  computeBadge,
  generateAuditableQuickPlayOutcome,
  calculateDuelPayout,
  validateAndScoreTelemetry
} = require("./gameLogic");
const { attachDuelManager } = require("./duelManager");

const ROOT_DIR = __dirname;
const BLOCKED_STATIC_FILES = new Set([
  ".env",
  ".env.example",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "render.yaml",
  "server.js",
  "db.js",
  "auth.js",
  "gameLogic.js",
  "duelManager.js"
]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseEntryOptions(raw) {
  if (!Array.isArray(raw)) return null;
  const cleaned = [...new Set(raw.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n >= 5 && n <= 10000))];
  cleaned.sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned.slice(0, 8) : null;
}

function createServerApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: { origin: false }
  });

  const { requireAuth, requireAdmin } = createAuthMiddleware(db);
  const duelStatsProvider = attachDuelManager(io, db);

  const authLimiter = createRateLimiter({ windowMs: 60000, max: 25, message: "Too many auth attempts. Please wait a minute." });
  const actionLimiter = createRateLimiter({ windowMs: 60000, max: 90, message: "Too many game requests. Slow down briefly." });

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  // Health & Public Config
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "nakshatra-cut", timestamp: new Date().toISOString() });
  });

  app.get("/api/config", asyncHandler(async (_req, res) => {
    const settings = await db.getAdminSettings();
    const qp = settings.quickPlay;
    const houseEdgePct = Math.round((100 - (qp.winProbabilityPct * qp.payoutMultiplier)) * 100) / 100;
    res.json({
      brandName: "Nakshatra Cut",
      currencyName: "Virtual Coins",
      disclaimer: "Strictly virtual entertainment. Virtual coins are non-redeemable and have zero monetary value.",
      quickPlay: {
        ...qp,
        houseEdgePct
      },
      duelArena: settings.duelArena,
      dailyRewards: settings.dailyRewards,
      difficulty: settings.difficulty,
      // Backward-compatible flat fields for core canvas
      durationSeconds: qp.durationSeconds,
      targetScore: qp.targetScore,
      maxMistakes: qp.maxMistakes
    });
  }));

  // Authentication
  app.post("/api/auth/register", authLimiter, asyncHandler(async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    const avatarColor = /^#[0-9a-fA-F]{6}$/.test(String(req.body.avatarColor || ""))
      ? String(req.body.avatarColor)
      : "#9542ff";

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "Username must be 3-20 letters, numbers, or underscores." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ error: "Password must be between 6 and 72 characters." });
    }

    const [byUser, byEmail] = await Promise.all([
      db.findUserByLogin(username),
      db.findUserByLogin(email)
    ]);
    if (byUser) return res.status(409).json({ error: "Username is already taken." });
    if (byEmail) return res.status(409).json({ error: "Email is already registered." });

    const passwordHash = await hashPassword(password);
    const user = await db.createUser({ username, email, passwordHash, avatarColor, role: "player" });
    const [settings, wallet, dailyRewards] = await Promise.all([
      db.getAdminSettings(),
      db.getWallet(user.userId),
      db.getDailyRewardsState(user.userId)
    ]);
    const token = signAuthToken(user, settings.hmacSecret);

    res.status(201).json({
      token,
      user,
      wallet,
      badge: computeBadge(user.stats),
      dailyRewards
    });
  }));

  app.post("/api/auth/login", authLimiter, asyncHandler(async (req, res) => {
    const login = String(req.body.login || req.body.username || req.body.email || "").trim();
    const password = String(req.body.password || "");

    if (!login || !password) {
      return res.status(400).json({ error: "Username/email and password are required." });
    }

    const userRecord = await db.findUserByLogin(login);
    if (!userRecord || !(await verifyPassword(password, userRecord.passwordHash))) {
      return res.status(401).json({ error: "Invalid username/email or password." });
    }
    if (userRecord.status === "suspended") {
      return res.status(403).json({ error: "Your account has been suspended by an administrator." });
    }

    await db.touchUserLogin(userRecord.userId);
    const { passwordHash: _omit, ...safeUser } = userRecord;
    const [settings, wallet, dailyRewards] = await Promise.all([
      db.getAdminSettings(),
      db.getWallet(safeUser.userId),
      db.getDailyRewardsState(safeUser.userId)
    ]);
    const token = signAuthToken(safeUser, settings.hmacSecret);

    res.json({
      token,
      user: safeUser,
      wallet,
      badge: computeBadge(safeUser.stats),
      dailyRewards
    });
  }));

  app.post("/api/auth/logout", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, asyncHandler(async (req, res) => {
    const [wallet, dailyRewards] = await Promise.all([
      db.getWallet(req.user.userId),
      db.getDailyRewardsState(req.user.userId)
    ]);
    res.json({
      user: req.user,
      wallet,
      badge: computeBadge(req.user.stats),
      dailyRewards
    });
  }));

  // Profile & Settings
  app.patch("/api/profile", requireAuth, asyncHandler(async (req, res) => {
    const updates = {};

    if (typeof req.body.username === "string") {
      const nextUsername = req.body.username.trim();
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(nextUsername)) {
        return res.status(400).json({ error: "Username must be 3-20 letters, numbers, or underscores." });
      }
      if (nextUsername.toLowerCase() !== req.user.usernameLower) {
        const existing = await db.findUserByLogin(nextUsername);
        if (existing) return res.status(409).json({ error: "Username is already taken." });
      }
      updates.username = nextUsername;
    }

    if (typeof req.body.avatarColor === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.avatarColor)) {
      updates.avatarColor = req.body.avatarColor;
    }

    if (req.body.settings && typeof req.body.settings === "object") {
      updates.settings = {
        soundEnabled: Boolean(req.body.settings.soundEnabled ?? req.user.settings?.soundEnabled ?? true),
        showHints: Boolean(req.body.settings.showHints ?? req.user.settings?.showHints ?? true)
      };
    }

    if (req.body.newPassword) {
      const currentPassword = String(req.body.currentPassword || "");
      const newPassword = String(req.body.newPassword || "");
      if (newPassword.length < 6 || newPassword.length > 72) {
        return res.status(400).json({ error: "New password must be 6-72 characters." });
      }
      const fullUser = await db.findUserWithPasswordById(req.user.userId);
      if (!(await verifyPassword(currentPassword, fullUser.passwordHash))) {
        return res.status(403).json({ error: "Current password is incorrect." });
      }
      updates.passwordHash = await hashPassword(newPassword);
    }

    const updated = await db.updateUserProfile(req.user.userId, updates);
    res.json({ user: updated, badge: computeBadge(updated.stats) });
  }));

  // Wallet & Transactions
  app.get("/api/wallet", requireAuth, asyncHandler(async (req, res) => {
    const [wallet, historyData] = await Promise.all([
      db.getWallet(req.user.userId),
      db.getUserHistory(req.user.userId, 50)
    ]);
    res.json({
      wallet,
      summary: historyData.summary,
      transactions: historyData.transactions,
      disclaimer: "Non-redeemable virtual coins only. Zero monetary value."
    });
  }));

  // Daily Rewards & Missions
  app.get("/api/daily", requireAuth, asyncHandler(async (req, res) => {
    const state = await db.getDailyRewardsState(req.user.userId);
    res.json(state);
  }));

  app.post("/api/daily/claim", requireAuth, actionLimiter, asyncHandler(async (req, res) => {
    const rewardKey = String(req.body.rewardKey || "").trim();
    if (!rewardKey) return res.status(400).json({ error: "rewardKey is required" });
    try {
      const result = await db.claimDailyReward(req.user.userId, rewardKey);
      res.json(result);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }
  }));

  // Mode 1: Quick Play (Single Player vs System with auditable CSPRNG outcome)
  app.post("/api/quickplay/start", requireAuth, actionLimiter, asyncHandler(async (req, res) => {
    const entryAmount = Math.round(Number(req.body.entryAmount || 0));
    const settings = await db.getAdminSettings();
    const qp = settings.quickPlay;

    if (!qp.entryOptions.includes(entryAmount)) {
      return res.status(400).json({ error: "Invalid Quick Play virtual entry amount." });
    }

    const matchId = crypto.randomUUID();
    let debit;
    try {
      debit = await db.debitWallet({
        userId: req.user.userId,
        amount: entryAmount,
        type: "quick_play_entry",
        referenceId: matchId,
        idempotencyKey: `quick_play_entry:${matchId}`,
        description: `Quick Play virtual entry (${entryAmount} virtual coins)`
      });
    } catch (err) {
      return res.status(err.code === "INSUFFICIENT_BALANCE" ? 400 : 500).json({ error: err.message });
    }

    const rngAudit = generateAuditableQuickPlayOutcome(
      matchId,
      qp.winProbabilityPct,
      entryAmount,
      qp.payoutMultiplier
    );

    const startedAt = Date.now();
    await db.createMatch({
      matchId,
      mode: "quick_play",
      status: "active",
      entryAmount,
      durationSeconds: qp.durationSeconds,
      targetScore: qp.targetScore,
      maxMistakes: qp.maxMistakes,
      difficulty: settings.difficulty,
      players: [{ userId: req.user.userId, username: req.user.username }],
      rngAudit,
      winnerOutcome: rngAudit.outcome,
      createdAt: new Date(startedAt).toISOString(),
      createdAtMs: startedAt,
      startedAt
    });

    res.json({
      matchId,
      entryAmount,
      startedAt,
      durationSeconds: qp.durationSeconds,
      targetScore: qp.targetScore,
      maxMistakes: qp.maxMistakes,
      difficulty: settings.difficulty,
      winProbabilityPct: rngAudit.winProbabilityPct,
      payoutMultiplier: rngAudit.payoutMultiplier,
      serverSeedHash: rngAudit.serverSeedHash,
      walletBalance: debit.wallet.balance
    });
  }));

  app.post("/api/quickplay/complete", requireAuth, actionLimiter, asyncHandler(async (req, res) => {
    const matchId = String(req.body.matchId || "").trim();
    if (!matchId) return res.status(400).json({ error: "matchId is required." });

    const existing = await db.findMatchById(matchId);
    if (!existing || existing.mode !== "quick_play" || existing.players[0]?.userId !== req.user.userId) {
      await db.logAudit("security", req.user.userId, "UNKNOWN_QUICKPLAY_MATCH", { matchId });
      return res.status(404).json({ error: "Invalid or unknown Quick Play match." });
    }

    const lockedMatch = await db.lockQuickPlayMatch(matchId, req.user.userId);
    if (!lockedMatch) {
      await db.logAudit("security", req.user.userId, "DUPLICATE_QUICKPLAY_CLAIM", {
        matchId,
        status: existing.status
      });
      return res.status(409).json({
        error: "Duplicate reward claim blocked: this match is already finalized.",
        matchId,
        result: existing.result || null
      });
    }

    const validation = validateAndScoreTelemetry(lockedMatch, req.body);
    if (validation.tampered) {
      await db.logAudit("security", req.user.userId, "QUICKPLAY_TELEMETRY_FLAGGED", {
        matchId,
        issues: validation.issues
      });
    }

    const rng = lockedMatch.rngAudit;
    const isFlagged = validation.tampered;
    const finalOutcome = isFlagged ? "flagged" : rng.outcome;
    const virtualReward = !isFlagged && rng.outcome === "won" ? rng.payout : 0;

    let walletBalance;
    if (virtualReward > 0) {
      const credit = await db.creditWallet({
        userId: req.user.userId,
        amount: virtualReward,
        type: "quick_play_win",
        referenceId: matchId,
        idempotencyKey: `quick_play_win:${matchId}`,
        description: `Quick Play win (${rng.payoutMultiplier}x on ${lockedMatch.entryAmount} virtual coins)`
      });
      walletBalance = credit.wallet.balance;
    } else {
      const w = await db.getWallet(req.user.userId);
      walletBalance = w.balance;
    }

    const lossReason = isFlagged
      ? `Anti-cheat flagged: ${validation.issues[0]}`
      : finalOutcome === "won"
        ? `System RNG roll ${rng.rollPct.toFixed(2)}% < ${rng.winProbabilityPct}% (1.8x win)`
        : `System RNG roll ${rng.rollPct.toFixed(2)}% >= ${rng.winProbabilityPct}%`;

    const resultPayload = {
      matchId,
      mode: "quick_play",
      outcome: finalOutcome,
      entryAmount: lockedMatch.entryAmount,
      virtualReward,
      netProfit: virtualReward - lockedMatch.entryAmount,
      validatedScore: validation.validatedScore,
      targetScore: lockedMatch.targetScore,
      percentage: validation.percentage,
      mistakes: validation.mistakes,
      maxMistakes: lockedMatch.maxMistakes,
      survived: validation.survived,
      verified: !isFlagged,
      lossReason,
      walletBalance,
      rngAudit: {
        serverSeedHash: rng.serverSeedHash,
        serverSeed: rng.serverSeed,
        rollPct: rng.rollPct,
        winProbabilityPct: rng.winProbabilityPct,
        payoutMultiplier: rng.payoutMultiplier
      }
    };

    await Promise.all([
      db.finalizeMatch(matchId, {
        status: finalOutcome === "flagged" ? "flagged" : "completed",
        result: resultPayload,
        completedAt: new Date().toISOString()
      }),
      db.recordMatchOutcomeForUser({
        userId: req.user.userId,
        username: req.user.username,
        matchId,
        mode: "quick_play",
        entryAmount: lockedMatch.entryAmount,
        playerScore: validation.validatedScore,
        percentage: validation.percentage,
        outcome: finalOutcome,
        virtualReward,
        verified: !isFlagged,
        lossReason
      })
    ]);

    res.json(resultPayload);
  }));

  // Leaderboard & History
  app.get("/api/leaderboard", asyncHandler(async (req, res) => {
    const period = req.query.period === "weekly" ? "weekly" : "all";
    const limit = Number(req.query.limit) >= 50 ? 50 : 10;
    const entries = await db.getLeaderboard({ period, limit });
    res.json({ period, limit, entries });
  }));

  app.get("/api/history", requireAuth, asyncHandler(async (req, res) => {
    const data = await db.getUserHistory(req.user.userId, 50);
    res.json(data);
  }));

  // Admin Protected Routes
  app.get("/api/admin/state", requireAdmin, asyncHandler(async (_req, res) => {
    const overview = await db.getAdminOverview();
    res.json({
      ...overview,
      liveDuel: duelStatsProvider.getStats()
    });
  }));

  app.post("/api/admin/config", requireAdmin, asyncHandler(async (req, res) => {
    const cur = await db.getAdminSettings();
    const qpIn = req.body.quickPlay || {};
    const daIn = req.body.duelArena || {};
    const drIn = req.body.dailyRewards || {};
    const diffIn = req.body.difficulty || {};

    const entryOptions = parseEntryOptions(qpIn.entryOptions || req.body.entryOptions) || cur.quickPlay.entryOptions;
    const duelEntryOptions = parseEntryOptions(daIn.entryOptions || req.body.entryOptions) || cur.duelArena.entryOptions;

    const nextSettings = {
      quickPlay: {
        winProbabilityPct: clamp(Number(qpIn.winProbabilityPct ?? cur.quickPlay.winProbabilityPct), 5, 90),
        payoutMultiplier: Math.round(clamp(Number(qpIn.payoutMultiplier ?? cur.quickPlay.payoutMultiplier), 1.1, 5) * 100) / 100,
        durationSeconds: Math.round(clamp(Number(qpIn.durationSeconds ?? cur.quickPlay.durationSeconds), 20, 180)),
        targetScore: Math.round(clamp(Number(qpIn.targetScore ?? cur.quickPlay.targetScore), 20, 500)),
        maxMistakes: Math.round(clamp(Number(qpIn.maxMistakes ?? cur.quickPlay.maxMistakes), 0, 5)),
        entryOptions
      },
      duelArena: {
        platformFeePct: Math.round(clamp(Number(daIn.platformFeePct ?? cur.duelArena.platformFeePct), 0, 35) * 10) / 10,
        durationSeconds: Math.round(clamp(Number(daIn.durationSeconds ?? qpIn.durationSeconds ?? cur.duelArena.durationSeconds), 20, 180)),
        targetScore: Math.round(clamp(Number(daIn.targetScore ?? qpIn.targetScore ?? cur.duelArena.targetScore), 20, 500)),
        maxMistakes: Math.round(clamp(Number(daIn.maxMistakes ?? qpIn.maxMistakes ?? cur.duelArena.maxMistakes), 0, 5)),
        entryOptions: duelEntryOptions,
        matchmakingTimeoutSec: Math.round(clamp(Number(daIn.matchmakingTimeoutSec ?? cur.duelArena.matchmakingTimeoutSec), 15, 120))
      },
      dailyRewards: {
        dailyLogin: Math.round(clamp(Number(drIn.dailyLogin ?? cur.dailyRewards.dailyLogin), 5, 1000)),
        missionPlay3: Math.round(clamp(Number(drIn.missionPlay3 ?? cur.dailyRewards.missionPlay3), 5, 1000)),
        missionWin2: Math.round(clamp(Number(drIn.missionWin2 ?? cur.dailyRewards.missionWin2), 5, 1000)),
        streakBonusPerDay: Math.round(clamp(Number(drIn.streakBonusPerDay ?? cur.dailyRewards.streakBonusPerDay), 0, 200)),
        achFirstWin: Math.round(clamp(Number(drIn.achFirstWin ?? cur.dailyRewards.achFirstWin), 10, 2000)),
        achScore80: Math.round(clamp(Number(drIn.achScore80 ?? cur.dailyRewards.achScore80), 10, 2000)),
        achStreak3: Math.round(clamp(Number(drIn.achStreak3 ?? cur.dailyRewards.achStreak3), 10, 2000))
      },
      difficulty: {
        speedScale: Math.round(clamp(Number(diffIn.speedScale ?? cur.difficulty.speedScale), 0.75, 1.75) * 100) / 100,
        skullChanceBoost: Math.round(clamp(Number(diffIn.skullChanceBoost ?? cur.difficulty.skullChanceBoost), 0, 0.25) * 100) / 100
      }
    };

    const saved = await db.updateAdminSettings(nextSettings, req.adminActor);
    res.json({ ok: true, config: saved });
  }));

  app.post("/api/admin/users/:userId/status", requireAdmin, asyncHandler(async (req, res) => {
    const userId = String(req.params.userId || "").trim();
    const status = String(req.body.status || "").trim();
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ error: "Status must be 'active' or 'suspended'." });
    }
    const updated = await db.setUserStatus(userId, status, req.adminActor);
    if (!updated) return res.status(404).json({ error: "User not found." });
    res.json({ ok: true, user: updated });
  }));

  // Block sensitive server/internal files from static serving
  app.use((req, res, next) => {
    const cleanPath = decodeURIComponent(req.path).replace(/^\/+/, "");
    const firstSeg = cleanPath.split("/")[0];
    if (
      BLOCKED_STATIC_FILES.has(cleanPath) ||
      firstSeg === "data" ||
      firstSeg === "tests" ||
      firstSeg === "node_modules" ||
      firstSeg.startsWith(".env")
    ) {
      return res.status(403).send("Forbidden");
    }
    return next();
  });

  app.use(express.static(ROOT_DIR, { etag: false, maxAge: 0 }));

  // Global JSON error handler for API routes
  app.use("/api", (err, _req, res, _next) => {
    console.error("API error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return { app, server, io, calculateDuelPayout };
}

async function start() {
  try {
    await db.connectDb();
    console.log("Connected to MongoDB.");
    const PORT = Number(process.env.PORT || 8765);
    const { server } = createServerApp();
    server.listen(PORT, () => {
      console.log(`Cosmic Slice server listening on http://localhost:${PORT}/`);
    });
  } catch (err) {
    console.error("Failed to start Cosmic Slice server:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  process.on("SIGINT", async () => {
    await db.closeDb();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await db.closeDb();
    process.exit(0);
  });
  start();
}

module.exports = { createServerApp, start };
