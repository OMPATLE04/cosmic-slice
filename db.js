"use strict";

const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { computeBadge } = require("./gameLogic");

const DEFAULT_ENTRY_OPTIONS = [10, 20, 50, 100, 200, 500];

const DEFAULT_ADMIN_SETTINGS = {
  _id: "singleton",
  quickPlay: {
    winProbabilityPct: 45,
    payoutMultiplier: 1.8,
    durationSeconds: 45,
    targetScore: 95,
    maxMistakes: 2,
    entryOptions: DEFAULT_ENTRY_OPTIONS
  },
  duelArena: {
    platformFeePct: 10,
    durationSeconds: 45,
    targetScore: 95,
    maxMistakes: 2,
    entryOptions: DEFAULT_ENTRY_OPTIONS,
    matchmakingTimeoutSec: 45
  },
  dailyRewards: {
    dailyLogin: 50,
    missionPlay3: 30,
    missionWin2: 50,
    streakBonusPerDay: 10,
    achFirstWin: 100,
    achScore80: 75,
    achStreak3: 100
  },
  difficulty: {
    speedScale: 1.0,
    skullChanceBoost: 0
  },
  platformAccounting: {
    totalDuelVirtualFees: 0,
    totalCoinsIssued: 0,
    totalCoinsSpent: 0
  }
};

let client = null;
let db = null;

function todayUtcKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayUtcKey(date = new Date()) {
  const prev = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return prev.toISOString().slice(0, 10);
}

function weekStartIso(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function collections() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDb() first.");
  }
  return {
    users: db.collection("Users"),
    wallets: db.collection("Wallets"),
    transactions: db.collection("Transactions"),
    matches: db.collection("Matches"),
    gameHistory: db.collection("GameHistory"),
    leaderboard: db.collection("Leaderboard"),
    dailyRewards: db.collection("DailyRewards"),
    adminSettings: db.collection("AdminSettings"),
    auditLogs: db.collection("AuditLogs")
  };
}

async function connectDb(uriOverride, dbNameOverride) {
  if (db) return db;

  const uri = (uriOverride || process.env.MONGODB_URI || "").trim();
  if (!uri || uri.includes("<db_username>") || uri.includes("<db_password>")) {
    throw new Error(
      "MONGODB_URI is missing or still contains placeholders (<db_username>/<db_password>). Update cosmic-slice/.env with your MongoDB Atlas credentials."
    );
  }

  const dbName = (dbNameOverride || process.env.MONGODB_DB || "cosmic_slice").trim();
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);

  const cols = collections();
  await Promise.all([
    cols.users.createIndex({ userId: 1 }, { unique: true }),
    cols.users.createIndex({ usernameLower: 1 }, { unique: true }),
    cols.users.createIndex({ emailLower: 1 }, { unique: true }),
    cols.wallets.createIndex({ userId: 1 }, { unique: true }),
    cols.transactions.createIndex({ txId: 1 }, { unique: true }),
    cols.transactions.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }),
    cols.transactions.createIndex({ userId: 1, createdAtMs: -1 }),
    cols.matches.createIndex({ matchId: 1 }, { unique: true }),
    cols.matches.createIndex({ mode: 1, status: 1, createdAtMs: -1 }),
    cols.gameHistory.createIndex({ historyId: 1 }, { unique: true }),
    cols.gameHistory.createIndex({ matchId: 1, userId: 1 }, { unique: true }),
    cols.gameHistory.createIndex({ userId: 1, timestampMs: -1 }),
    cols.leaderboard.createIndex({ userId: 1 }, { unique: true }),
    cols.leaderboard.createIndex({ allTimeScore: -1, wins: -1 }),
    cols.leaderboard.createIndex({ weeklyKey: 1, weeklyScore: -1 }),
    cols.dailyRewards.createIndex({ userId: 1 }, { unique: true }),
    cols.auditLogs.createIndex({ auditId: 1 }, { unique: true }),
    cols.auditLogs.createIndex({ createdAtMs: -1 })
  ]);

  await cols.adminSettings.updateOne(
    { _id: "singleton" },
    {
      $setOnInsert: {
        ...JSON.parse(JSON.stringify(DEFAULT_ADMIN_SETTINGS)),
        hmacSecret: crypto.randomBytes(32).toString("hex"),
        updatedAt: new Date().toISOString()
      }
    },
    { upsert: true }
  );

  return db;
}

async function closeDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

async function logAudit(category, actorUserId, action, details = {}) {
  const { auditLogs } = collections();
  const entry = {
    auditId: crypto.randomUUID(),
    category,
    actorUserId: actorUserId || "system",
    action,
    details,
    createdAt: new Date().toISOString(),
    createdAtMs: Date.now()
  };
  await auditLogs.insertOne(entry);
  return entry;
}

async function getAdminSettings() {
  const { adminSettings } = collections();
  const doc = await adminSettings.findOne({ _id: "singleton" });
  return {
    hmacSecret: doc.hmacSecret,
    quickPlay: { ...DEFAULT_ADMIN_SETTINGS.quickPlay, ...(doc.quickPlay || {}) },
    duelArena: { ...DEFAULT_ADMIN_SETTINGS.duelArena, ...(doc.duelArena || {}) },
    dailyRewards: { ...DEFAULT_ADMIN_SETTINGS.dailyRewards, ...(doc.dailyRewards || {}) },
    difficulty: { ...DEFAULT_ADMIN_SETTINGS.difficulty, ...(doc.difficulty || {}) },
    platformAccounting: { ...DEFAULT_ADMIN_SETTINGS.platformAccounting, ...(doc.platformAccounting || {}) }
  };
}

async function updateAdminSettings(nextSettings, actorUserId) {
  const { adminSettings } = collections();
  const previous = await getAdminSettings();
  await adminSettings.updateOne(
    { _id: "singleton" },
    {
      $set: {
        quickPlay: nextSettings.quickPlay,
        duelArena: nextSettings.duelArena,
        dailyRewards: nextSettings.dailyRewards,
        difficulty: nextSettings.difficulty,
        updatedAt: new Date().toISOString()
      }
    }
  );
  await logAudit("admin_config", actorUserId, "UPDATE_SETTINGS", {
    previous: {
      quickPlay: previous.quickPlay,
      duelArena: previous.duelArena,
      dailyRewards: previous.dailyRewards,
      difficulty: previous.difficulty
    },
    next: {
      quickPlay: nextSettings.quickPlay,
      duelArena: nextSettings.duelArena,
      dailyRewards: nextSettings.dailyRewards,
      difficulty: nextSettings.difficulty
    }
  });
  return getAdminSettings();
}

async function creditWallet({ userId, amount, type, referenceId = null, idempotencyKey = null, description = "" }) {
  const safeAmount = Math.round(Number(amount || 0));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error("Credit amount must be a positive integer");
  }
  const { wallets, transactions, adminSettings } = collections();
  const txId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const idem = idempotencyKey || `${type}:${userId}:${referenceId || txId}`;

  // Insert ledger entry first with unique idempotencyKey so duplicates fail before wallet mutation
  try {
    await transactions.insertOne({
      txId,
      idempotencyKey: idem,
      userId,
      type,
      direction: "credit",
      amount: safeAmount,
      balanceAfter: null,
      referenceId,
      description,
      createdAt: nowIso,
      createdAtMs: nowMs
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existingWallet = await wallets.findOne({ userId }, { projection: { _id: 0 } });
      return { duplicate: true, wallet: existingWallet, tx: null };
    }
    throw err;
  }

  const updatedWallet = await wallets.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: safeAmount, totalEarned: safeAmount },
      $set: { updatedAt: nowIso }
    },
    { returnDocument: "after", projection: { _id: 0 } }
  );

  if (!updatedWallet) {
    await transactions.deleteOne({ txId });
    throw new Error("Wallet not found");
  }

  await Promise.all([
    transactions.updateOne({ txId }, { $set: { balanceAfter: updatedWallet.balance } }),
    adminSettings.updateOne(
      { _id: "singleton" },
      { $inc: { "platformAccounting.totalCoinsIssued": safeAmount } }
    )
  ]);

  return {
    duplicate: false,
    wallet: updatedWallet,
    tx: {
      txId,
      userId,
      type,
      direction: "credit",
      amount: safeAmount,
      balanceAfter: updatedWallet.balance,
      referenceId,
      description,
      createdAt: nowIso
    }
  };
}

async function debitWallet({ userId, amount, type, referenceId = null, idempotencyKey = null, description = "" }) {
  const safeAmount = Math.round(Number(amount || 0));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error("Debit amount must be a positive integer");
  }
  const { wallets, transactions, adminSettings } = collections();
  const txId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const idem = idempotencyKey || `${type}:${userId}:${referenceId || txId}`;

  // Atomic non-negative guard on balance >= safeAmount
  const updatedWallet = await wallets.findOneAndUpdate(
    { userId, balance: { $gte: safeAmount } },
    {
      $inc: { balance: -safeAmount, totalSpent: safeAmount },
      $set: { updatedAt: nowIso }
    },
    { returnDocument: "after", projection: { _id: 0 } }
  );

  if (!updatedWallet) {
    const cur = await wallets.findOne({ userId }, { projection: { _id: 0 } });
    if (!cur) throw new Error("Wallet not found");
    const err = new Error("Insufficient virtual coin balance");
    err.code = "INSUFFICIENT_BALANCE";
    throw err;
  }

  try {
    await transactions.insertOne({
      txId,
      idempotencyKey: idem,
      userId,
      type,
      direction: "debit",
      amount: safeAmount,
      balanceAfter: updatedWallet.balance,
      referenceId,
      description,
      createdAt: nowIso,
      createdAtMs: nowMs
    });
  } catch (err) {
    // Roll back atomic debit if duplicate idempotencyKey collided concurrently
    await wallets.updateOne(
      { userId },
      { $inc: { balance: safeAmount, totalSpent: -safeAmount } }
    );
    if (err && err.code === 11000) {
      const existingWallet = await wallets.findOne({ userId }, { projection: { _id: 0 } });
      return { duplicate: true, wallet: existingWallet, tx: null };
    }
    throw err;
  }

  await adminSettings.updateOne(
    { _id: "singleton" },
    { $inc: { "platformAccounting.totalCoinsSpent": safeAmount } }
  );

  return {
    duplicate: false,
    wallet: updatedWallet,
    tx: {
      txId,
      userId,
      type,
      direction: "debit",
      amount: safeAmount,
      balanceAfter: updatedWallet.balance,
      referenceId,
      description,
      createdAt: nowIso
    }
  };
}

async function createUser({ username, email, passwordHash, avatarColor = "#9542ff", role = "player" }) {
  const { users, wallets, dailyRewards, leaderboard } = collections();
  const userId = `CS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const nowIso = new Date().toISOString();
  const today = todayUtcKey();

  const userDoc = {
    userId,
    username,
    usernameLower: username.toLowerCase(),
    email,
    emailLower: email.toLowerCase(),
    passwordHash,
    role,
    avatarColor,
    status: "active",
    settings: {
      soundEnabled: true,
      showHints: true
    },
    stats: {
      totalMatches: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      quickPlayMatches: 0,
      quickPlayWins: 0,
      duelMatches: 0,
      duelWins: 0,
      highestScore: 0,
      totalScore: 0,
      currentStreak: 1,
      longestStreak: 1,
      lastActiveAt: nowIso
    },
    createdAt: nowIso,
    updatedAt: nowIso
  };

  await users.insertOne(userDoc);
  await wallets.insertOne({
    userId,
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    updatedAt: nowIso
  });

  await dailyRewards.insertOne({
    userId,
    lastLoginDate: null,
    streakDays: 0,
    claims: {},
    dailyProgress: {
      date: today,
      matchesPlayed: 0,
      wins: 0
    },
    updatedAt: nowIso
  });

  await leaderboard.insertOne({
    userId,
    username,
    avatarColor,
    totalMatches: 0,
    wins: 0,
    winRate: 0,
    highestScore: 0,
    allTimeScore: 0,
    weeklyKey: weekStartIso(),
    weeklyScore: 0,
    weeklyWins: 0,
    weeklyMatches: 0,
    badge: computeBadge(userDoc.stats),
    updatedAt: nowIso
  });

  // Grant 1,000 non-redeemable welcome virtual coins atomically
  await creditWallet({
    userId,
    amount: 1000,
    type: "signup_bonus",
    referenceId: userId,
    idempotencyKey: `signup_bonus:${userId}`,
    description: "Welcome virtual starter coins (non-redeemable)"
  });

  const { passwordHash: _omit, ...safeUser } = userDoc;
  return safeUser;
}

async function findUserByLogin(login) {
  const { users } = collections();
  const q = String(login || "").trim().toLowerCase();
  if (!q) return null;
  return users.findOne(
    { $or: [{ usernameLower: q }, { emailLower: q }] },
    { projection: { _id: 0 } }
  );
}

async function findUserById(userId) {
  const { users } = collections();
  return users.findOne({ userId }, { projection: { _id: 0, passwordHash: 0 } });
}

async function findUserWithPasswordById(userId) {
  const { users } = collections();
  return users.findOne({ userId }, { projection: { _id: 0 } });
}

async function touchUserLogin(userId) {
  const { users } = collections();
  await users.updateOne(
    { userId },
    { $set: { "stats.lastActiveAt": new Date().toISOString(), updatedAt: new Date().toISOString() } }
  );
}

async function updateUserProfile(userId, updates) {
  const { users, leaderboard } = collections();
  const setFields = { updatedAt: new Date().toISOString() };
  if (updates.username) {
    setFields.username = updates.username;
    setFields.usernameLower = updates.username.toLowerCase();
  }
  if (updates.avatarColor) {
    setFields.avatarColor = updates.avatarColor;
  }
  if (updates.settings) {
    setFields.settings = updates.settings;
  }
  if (updates.passwordHash) {
    setFields.passwordHash = updates.passwordHash;
  }

  const updated = await users.findOneAndUpdate(
    { userId },
    { $set: setFields },
    { returnDocument: "after", projection: { _id: 0, passwordHash: 0 } }
  );

  if (updated && (updates.username || updates.avatarColor)) {
    await leaderboard.updateOne(
      { userId },
      { $set: { username: updated.username, avatarColor: updated.avatarColor } }
    );
  }
  return updated;
}

async function getWallet(userId) {
  const { wallets } = collections();
  return wallets.findOne({ userId }, { projection: { _id: 0 } });
}

async function getTransactions(userId, limit = 40) {
  const { transactions } = collections();
  return transactions
    .find({ userId }, { projection: { _id: 0, idempotencyKey: 0, createdAtMs: 0 } })
    .sort({ createdAtMs: -1 })
    .limit(limit)
    .toArray();
}

async function createMatch(matchDoc) {
  const { matches } = collections();
  await matches.insertOne({ ...matchDoc });
  return matchDoc;
}

async function findMatchById(matchId) {
  const { matches } = collections();
  return matches.findOne({ matchId }, { projection: { _id: 0 } });
}

async function lockQuickPlayMatch(matchId, userId) {
  const { matches } = collections();
  return matches.findOneAndUpdate(
    { matchId, mode: "quick_play", status: "active", "players.0.userId": userId },
    { $set: { status: "processing" } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
}

async function finalizeMatch(matchId, fields) {
  const { matches } = collections();
  await matches.updateOne({ matchId }, { $set: fields });
}

async function recordPlatformVirtualFee(feeAmount) {
  const safeFee = Math.round(Number(feeAmount || 0));
  if (safeFee <= 0) return;
  const { adminSettings } = collections();
  await adminSettings.updateOne(
    { _id: "singleton" },
    { $inc: { "platformAccounting.totalDuelVirtualFees": safeFee } }
  );
}

async function recordMatchOutcomeForUser({
  userId,
  username,
  matchId,
  mode,
  entryAmount,
  playerScore,
  opponentUserId = null,
  opponentUsername = null,
  opponentScore = null,
  percentage = 0,
  outcome,
  virtualReward = 0,
  verified = true,
  lossReason = ""
}) {
  const { users, gameHistory, leaderboard, dailyRewards } = collections();
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const today = todayUtcKey(now);
  const wKey = weekStartIso(now);

  const netProfit = Number(virtualReward || 0) - Number(entryAmount || 0);
  const historyDoc = {
    historyId: crypto.randomUUID(),
    matchId,
    userId,
    username,
    opponentUserId,
    opponentUsername,
    mode,
    entryAmount: Number(entryAmount || 0),
    playerScore: Number(playerScore || 0),
    opponentScore: opponentScore !== null && opponentScore !== undefined ? Number(opponentScore) : null,
    percentage: Number(percentage || 0),
    outcome,
    virtualReward: Number(virtualReward || 0),
    netProfit,
    verified: Boolean(verified),
    lossReason,
    timestamp: nowIso,
    timestampMs: nowMs
  };

  try {
    await gameHistory.insertOne(historyDoc);
  } catch (err) {
    if (err && err.code === 11000) {
      return null;
    }
    throw err;
  }

  const isWin = outcome === "won";
  const isTie = outcome === "tie";
  const isLoss = outcome === "lost" || outcome === "flagged";

  const user = await users.findOne({ userId }, { projection: { _id: 0 } });
  if (user) {
    const prevStats = user.stats || {};
    const nextStats = {
      ...prevStats,
      totalMatches: Number(prevStats.totalMatches || 0) + 1,
      wins: Number(prevStats.wins || 0) + (isWin ? 1 : 0),
      losses: Number(prevStats.losses || 0) + (isLoss ? 1 : 0),
      ties: Number(prevStats.ties || 0) + (isTie ? 1 : 0),
      quickPlayMatches: Number(prevStats.quickPlayMatches || 0) + (mode === "quick_play" ? 1 : 0),
      quickPlayWins: Number(prevStats.quickPlayWins || 0) + (mode === "quick_play" && isWin ? 1 : 0),
      duelMatches: Number(prevStats.duelMatches || 0) + (mode === "duel_arena" ? 1 : 0),
      duelWins: Number(prevStats.duelWins || 0) + (mode === "duel_arena" && isWin ? 1 : 0),
      highestScore: Math.max(Number(prevStats.highestScore || 0), Number(playerScore || 0)),
      totalScore: Number(prevStats.totalScore || 0) + Number(playerScore || 0),
      lastActiveAt: nowIso
    };

    await users.updateOne(
      { userId },
      { $set: { stats: nextStats, updatedAt: nowIso } }
    );

    const existingLb = await leaderboard.findOne({ userId });
    const sameWeek = existingLb && existingLb.weeklyKey === wKey;
    const winRate = nextStats.totalMatches > 0
      ? Math.round((nextStats.wins / nextStats.totalMatches) * 100)
      : 0;
    const badge = computeBadge(nextStats);

    await leaderboard.updateOne(
      { userId },
      {
        $set: {
          username: user.username,
          avatarColor: user.avatarColor,
          totalMatches: nextStats.totalMatches,
          wins: nextStats.wins,
          winRate,
          highestScore: nextStats.highestScore,
          allTimeScore: nextStats.totalScore,
          weeklyKey: wKey,
          weeklyScore: (sameWeek ? Number(existingLb.weeklyScore || 0) : 0) + Number(playerScore || 0),
          weeklyWins: (sameWeek ? Number(existingLb.weeklyWins || 0) : 0) + (isWin ? 1 : 0),
          weeklyMatches: (sameWeek ? Number(existingLb.weeklyMatches || 0) : 0) + 1,
          badge,
          updatedAt: nowIso
        }
      },
      { upsert: true }
    );
  }

  // Update daily mission counters
  const dailyDoc = await dailyRewards.findOne({ userId });
  const sameDay = dailyDoc && dailyDoc.dailyProgress && dailyDoc.dailyProgress.date === today;
  const nextMatchesToday = (sameDay ? Number(dailyDoc.dailyProgress.matchesPlayed || 0) : 0) + 1;
  const nextWinsToday = (sameDay ? Number(dailyDoc.dailyProgress.wins || 0) : 0) + (isWin ? 1 : 0);

  await dailyRewards.updateOne(
    { userId },
    {
      $set: {
        dailyProgress: {
          date: today,
          matchesPlayed: nextMatchesToday,
          wins: nextWinsToday
        },
        updatedAt: nowIso
      }
    },
    { upsert: true }
  );

  return historyDoc;
}

async function getUserHistory(userId, limit = 30) {
  const { gameHistory, transactions } = collections();
  const [recent, allSummary, txList] = await Promise.all([
    gameHistory
      .find({ userId }, { projection: { _id: 0, timestampMs: 0 } })
      .sort({ timestampMs: -1 })
      .limit(limit)
      .toArray(),
    gameHistory
      .aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalMatches: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ["$outcome", "won"] }, 1, 0] } },
            losses: { $sum: { $cond: [{ $in: ["$outcome", ["lost", "flagged"]] }, 1, 0] } },
            ties: { $sum: { $cond: [{ $eq: ["$outcome", "tie"] }, 1, 0] } },
            netProfit: { $sum: "$netProfit" }
          }
        }
      ])
      .toArray(),
    getTransactions(userId, limit)
  ]);

  const s = allSummary[0] || { totalMatches: 0, wins: 0, losses: 0, ties: 0, netProfit: 0 };
  return {
    summary: {
      totalMatches: s.totalMatches,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
      netProfit: s.netProfit
    },
    recent,
    transactions: txList
  };
}

async function getLeaderboard({ period = "all", limit = 10 } = {}) {
  const { leaderboard } = collections();
  const safeLimit = limit >= 50 ? 50 : 10;
  const wKey = weekStartIso();

  if (period === "weekly") {
    const docs = await leaderboard
      .find(
        { weeklyKey: wKey, weeklyMatches: { $gt: 0 } },
        { projection: { _id: 0 } }
      )
      .sort({ weeklyScore: -1, weeklyWins: -1, highestScore: -1 })
      .limit(safeLimit)
      .toArray();
    return docs.map((d, idx) => ({
      rank: idx + 1,
      userId: d.userId,
      username: d.username,
      avatarColor: d.avatarColor,
      totalMatches: d.weeklyMatches || 0,
      wins: d.weeklyWins || 0,
      winRate: d.weeklyMatches > 0 ? Math.round((d.weeklyWins / d.weeklyMatches) * 100) : 0,
      highestScore: d.highestScore || 0,
      rankingScore: d.weeklyScore || 0,
      badge: d.badge || computeBadge(d)
    }));
  }

  const docs = await leaderboard
    .find({}, { projection: { _id: 0 } })
    .sort({ allTimeScore: -1, wins: -1, highestScore: -1 })
    .limit(safeLimit)
    .toArray();

  return docs.map((d, idx) => ({
    rank: idx + 1,
    userId: d.userId,
    username: d.username,
    avatarColor: d.avatarColor,
    totalMatches: d.totalMatches || 0,
    wins: d.wins || 0,
    winRate: d.winRate || 0,
    highestScore: d.highestScore || 0,
    rankingScore: d.allTimeScore || 0,
    badge: d.badge || computeBadge(d)
  }));
}

async function getDailyRewardsState(userId) {
  const { dailyRewards, users } = collections();
  const [settings, user, docRaw] = await Promise.all([
    getAdminSettings(),
    users.findOne({ userId }, { projection: { _id: 0 } }),
    dailyRewards.findOne({ userId }, { projection: { _id: 0 } })
  ]);

  const today = todayUtcKey();
  const doc = docRaw || {
    userId,
    lastLoginDate: null,
    streakDays: 0,
    claims: {},
    dailyProgress: { date: today, matchesPlayed: 0, wins: 0 }
  };

  const progress =
    doc.dailyProgress && doc.dailyProgress.date === today
      ? doc.dailyProgress
      : { date: today, matchesPlayed: 0, wins: 0 };

  const claims = doc.claims || {};
  const drCfg = settings.dailyRewards;
  const stats = (user && user.stats) || {};
  const streakPreview = doc.lastLoginDate === yesterdayUtcKey()
    ? Number(doc.streakDays || 0) + 1
    : doc.lastLoginDate === today
      ? Number(doc.streakDays || 1)
      : 1;
  const loginBonusAmount =
    Number(drCfg.dailyLogin || 50) +
    Math.min(6, Math.max(0, streakPreview - 1)) * Number(drCfg.streakBonusPerDay || 10);

  return {
    today,
    streakDays: Number(doc.streakDays || 0),
    lastLoginDate: doc.lastLoginDate,
    dailyProgress: progress,
    rewards: [
      {
        key: "daily_login",
        claimId: `daily_login:${today}`,
        category: "daily",
        title: "Daily Login Bonus",
        description: `Includes +${drCfg.streakBonusPerDay || 10} streak bonus/day`,
        amount: loginBonusAmount,
        progress: doc.lastLoginDate === today ? 1 : 0,
        target: 1,
        eligible: true,
        claimed: Boolean(claims[`daily_login:${today}`])
      },
      {
        key: "mission_play3",
        claimId: `mission_play3:${today}`,
        category: "mission",
        title: "Play 3 Matches Today",
        description: "Complete 3 Quick Play or Duel matches today",
        amount: Number(drCfg.missionPlay3 || 30),
        progress: Math.min(3, Number(progress.matchesPlayed || 0)),
        target: 3,
        eligible: Number(progress.matchesPlayed || 0) >= 3,
        claimed: Boolean(claims[`mission_play3:${today}`])
      },
      {
        key: "mission_win2",
        claimId: `mission_win2:${today}`,
        category: "mission",
        title: "Win 2 Matches Today",
        description: "Win 2 matches today in any mode",
        amount: Number(drCfg.missionWin2 || 50),
        progress: Math.min(2, Number(progress.wins || 0)),
        target: 2,
        eligible: Number(progress.wins || 0) >= 2,
        claimed: Boolean(claims[`mission_win2:${today}`])
      },
      {
        key: "ach_first_win",
        claimId: "ach_first_win",
        category: "achievement",
        title: "First Victory",
        description: "Win your very first Cosmic Slice match",
        amount: Number(drCfg.achFirstWin || 100),
        progress: Math.min(1, Number(stats.wins || 0)),
        target: 1,
        eligible: Number(stats.wins || 0) >= 1,
        claimed: Boolean(claims.ach_first_win)
      },
      {
        key: "ach_score_80",
        claimId: "ach_score_80",
        category: "achievement",
        title: "Comet Master (80+ Score)",
        description: "Reach a verified score of 80+ in a match",
        amount: Number(drCfg.achScore80 || 75),
        progress: Math.min(80, Number(stats.highestScore || 0)),
        target: 80,
        eligible: Number(stats.highestScore || 0) >= 80,
        claimed: Boolean(claims.ach_score_80)
      },
      {
        key: "ach_streak_3",
        claimId: "ach_streak_3",
        category: "achievement",
        title: "3-Day Login Streak",
        description: "Claim daily login 3 consecutive days",
        amount: Number(drCfg.achStreak3 || 100),
        progress: Math.min(3, Number(doc.streakDays || 0)),
        target: 3,
        eligible: Number(doc.streakDays || 0) >= 3,
        claimed: Boolean(claims.ach_streak_3)
      }
    ]
  };
}

async function claimDailyReward(userId, rewardKey) {
  const { dailyRewards, users } = collections();
  const state = await getDailyRewardsState(userId);
  const item = state.rewards.find((r) => r.key === rewardKey);
  if (!item) {
    const err = new Error("Unknown reward key");
    err.statusCode = 400;
    throw err;
  }
  if (item.claimed) {
    const err = new Error("Reward already claimed");
    err.statusCode = 409;
    throw err;
  }
  if (!item.eligible) {
    const err = new Error("Reward requirements not yet met");
    err.statusCode = 400;
    throw err;
  }

  const today = state.today;
  const claimField = `claims.${item.claimId}`;
  const nowIso = new Date().toISOString();

  // Atomic conditional claim lock on DailyRewards
  const updateSet = {
    [claimField]: true,
    updatedAt: nowIso
  };

  if (rewardKey === "daily_login") {
    const nextStreak =
      state.lastLoginDate === yesterdayUtcKey()
        ? state.streakDays + 1
        : state.lastLoginDate === today
          ? state.streakDays
          : 1;
    updateSet.lastLoginDate = today;
    updateSet.streakDays = nextStreak;
    await users.updateOne(
      { userId },
      {
        $set: { "stats.currentStreak": nextStreak },
        $max: { "stats.longestStreak": nextStreak }
      }
    );
  }

  const claimLock = await dailyRewards.findOneAndUpdate(
    { userId, [claimField]: { $ne: true } },
    { $set: updateSet },
    { returnDocument: "after" }
  );

  if (!claimLock) {
    const err = new Error("Reward already claimed");
    err.statusCode = 409;
    throw err;
  }

  const txType =
    item.category === "daily"
      ? "daily_login"
      : item.category === "mission"
        ? "daily_mission"
        : "achievement";

  const credit = await creditWallet({
    userId,
    amount: item.amount,
    type: txType,
    referenceId: item.claimId,
    idempotencyKey: `daily_claim:${userId}:${item.claimId}`,
    description: `${item.title} (${item.amount} virtual coins)`
  });

  if (credit.duplicate) {
    const err = new Error("Duplicate reward claim blocked");
    err.statusCode = 409;
    throw err;
  }

  return {
    claimedItem: { ...item, claimed: true },
    wallet: credit.wallet,
    state: await getDailyRewardsState(userId)
  };
}

async function getAdminOverview() {
  const { users, matches, gameHistory, auditLogs, wallets } = collections();
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    settings,
    totalUsers,
    activeUsers24h,
    totalMatches,
    quickPlayTotal,
    quickPlayWins,
    duelTotal,
    duelCompleted,
    duelTies,
    userList,
    recentMatches,
    auditList,
    walletSum,
    qpAccounting
  ] = await Promise.all([
    getAdminSettings(),
    users.countDocuments({}),
    users.countDocuments({ "stats.lastActiveAt": { $gte: cutoff24h } }),
    matches.countDocuments({}),
    matches.countDocuments({ mode: "quick_play" }),
    matches.countDocuments({ mode: "quick_play", winnerOutcome: "won" }),
    matches.countDocuments({ mode: "duel_arena" }),
    matches.countDocuments({ mode: "duel_arena", status: "completed" }),
    matches.countDocuments({ mode: "duel_arena", status: "tied" }),
    users
      .find({}, { projection: { _id: 0, passwordHash: 0 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray(),
    gameHistory
      .find({}, { projection: { _id: 0, timestampMs: 0 } })
      .sort({ timestampMs: -1 })
      .limit(100)
      .toArray(),
    auditLogs
      .find({}, { projection: { _id: 0, createdAtMs: 0 } })
      .sort({ createdAtMs: -1 })
      .limit(100)
      .toArray(),
    wallets
      .aggregate([
        {
          $group: {
            _id: null,
            totalBalances: { $sum: "$balance" },
            totalEarned: { $sum: "$totalEarned" },
            totalSpent: { $sum: "$totalSpent" }
          }
        }
      ])
      .toArray(),
    gameHistory
      .aggregate([
        { $match: { mode: "quick_play" } },
        {
          $group: {
            _id: null,
            entries: { $sum: "$entryAmount" },
            payouts: { $sum: "$virtualReward" }
          }
        }
      ])
      .toArray()
  ]);

  // Enrich users with wallet balance
  const walletDocs = await wallets.find({}, { projection: { _id: 0 } }).toArray();
  const walletByUser = new Map(walletDocs.map((w) => [w.userId, w]));
  const usersWithWallets = userList.map((u) => ({
    ...u,
    wallet: walletByUser.get(u.userId) || { balance: 0, totalEarned: 0, totalSpent: 0 }
  }));

  const wTotals = walletSum[0] || { totalBalances: 0, totalEarned: 0, totalSpent: 0 };
  const qpTotals = qpAccounting[0] || { entries: 0, payouts: 0 };
  const quickPlayNetProfit = Number(qpTotals.entries || 0) - Number(qpTotals.payouts || 0);
  const totalDuelVirtualFees = settings.platformAccounting.totalDuelVirtualFees || 0;

  return {
    config: {
      quickPlay: settings.quickPlay,
      duelArena: settings.duelArena,
      dailyRewards: settings.dailyRewards,
      difficulty: settings.difficulty
    },
    stats: {
      totalUsers,
      activeUsers24h,
      totalMatches,
      quickPlayTotal,
      quickPlayWins,
      quickPlayWinRate: quickPlayTotal > 0 ? Math.round((quickPlayWins / quickPlayTotal) * 100) : 0,
      duelTotal,
      duelCompleted,
      duelTies,
      totalCoinsIssued: settings.platformAccounting.totalCoinsIssued || wTotals.totalEarned,
      totalCoinsSpent: settings.platformAccounting.totalCoinsSpent || wTotals.totalSpent,
      totalCirculatingCoins: wTotals.totalBalances,
      totalDuelVirtualFees,
      quickPlayNetProfit,
      totalPlatformVirtualProfit: quickPlayNetProfit + totalDuelVirtualFees,
      fraudAlertsCount: auditList.filter((a) => a.category === "security").length
    },
    users: usersWithWallets,
    recentMatches,
    auditLogs: auditList
  };
}

async function setUserStatus(userId, status, actorUserId) {
  const { users } = collections();
  if (!["active", "suspended"].includes(status)) {
    throw new Error("Invalid status");
  }
  const updated = await users.findOneAndUpdate(
    { userId },
    { $set: { status, updatedAt: new Date().toISOString() } },
    { returnDocument: "after", projection: { _id: 0, passwordHash: 0 } }
  );
  if (updated) {
    await logAudit("admin_user", actorUserId, "SET_USER_STATUS", { userId, status });
  }
  return updated;
}

module.exports = {
  DEFAULT_ENTRY_OPTIONS,
  DEFAULT_ADMIN_SETTINGS,
  connectDb,
  closeDb,
  collections,
  logAudit,
  getAdminSettings,
  updateAdminSettings,
  creditWallet,
  debitWallet,
  createUser,
  findUserByLogin,
  findUserById,
  findUserWithPasswordById,
  touchUserLogin,
  updateUserProfile,
  getWallet,
  getTransactions,
  createMatch,
  findMatchById,
  lockQuickPlayMatch,
  finalizeMatch,
  recordPlatformVirtualFee,
  recordMatchOutcomeForUser,
  getUserHistory,
  getLeaderboard,
  getDailyRewardsState,
  claimDailyReward,
  getAdminOverview,
  setUserStatus
};
