"use strict";

const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const DEFAULT_REWARD_TIERS = [
  { id: "tier_0", label: "Below 40%", minPct: 0, maxPct: 39, amount: 0 },
  { id: "tier_1", label: "40–59%", minPct: 40, maxPct: 59, amount: 2 },
  { id: "tier_2", label: "60–74%", minPct: 60, maxPct: 74, amount: 5 },
  { id: "tier_3", label: "75–89%", minPct: 75, maxPct: 89, amount: 10 },
  { id: "tier_4", label: "90–100%", minPct: 90, maxPct: 100, amount: 20 }
];

const DEFAULT_CONFIG = {
  durationSeconds: 45,
  targetScore: 95,
  maxMistakes: 2, // 3 Moon Shields total; >2 mistakes (3rd hit) = Game Over
  rewardTiers: DEFAULT_REWARD_TIERS
};

let client = null;
let db = null;

function collections() {
  if (!db) {
    throw new Error("Database not initialized. Call connectDb() first.");
  }
  return {
    appState: db.collection("app_state"),
    sessions: db.collection("sessions"),
    creditedGames: db.collection("credited_games"),
    history: db.collection("history"),
    securityLog: db.collection("security_logs")
  };
}

async function connectDb() {
  if (db) return db;

  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri || uri.includes("<db_username>") || uri.includes("<db_password>")) {
    throw new Error(
      "MONGODB_URI is missing or still contains placeholders (<db_username>/<db_password>). Update cosmic-slice/.env with your MongoDB Atlas credentials."
    );
  }

  const dbName = (process.env.MONGODB_DB || "cosmic_slice").trim();
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000
  });
  await client.connect();
  db = client.db(dbName);

  const cols = collections();
  await Promise.all([
    cols.sessions.createIndex({ gameId: 1 }, { unique: true }),
    cols.sessions.createIndex({ status: 1, startedAt: 1 }),
    cols.creditedGames.createIndex({ gameId: 1 }, { unique: true }),
    cols.history.createIndex({ gameId: 1 }, { unique: true }),
    cols.history.createIndex({ completedAtMs: -1 }),
    cols.securityLog.createIndex({ createdAtMs: -1 })
  ]);

  // Ensure singleton state document exists
  await cols.appState.updateOne(
    { _id: "singleton" },
    {
      $setOnInsert: {
        _id: "singleton",
        hmacSecret: crypto.randomBytes(32).toString("hex"),
        config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
        wallet: {
          totalCredited: 0,
          currency: "INR"
        }
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

async function getAppState() {
  const { appState } = collections();
  const doc = await appState.findOne({ _id: "singleton" });
  return {
    hmacSecret: doc.hmacSecret,
    config: doc.config || JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    wallet: doc.wallet || { totalCredited: 0, currency: "INR" }
  };
}

async function createSession(session) {
  const { sessions } = collections();
  // Prune expired active sessions older than 24h occasionally
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  await sessions.deleteMany({ status: "active", startedAt: { $lt: cutoff } });
  await sessions.insertOne({ ...session });
}

async function findSession(gameId) {
  const { sessions } = collections();
  return sessions.findOne({ gameId }, { projection: { _id: 0 } });
}

async function lockSessionForCompletion(gameId) {
  const { sessions } = collections();
  const res = await sessions.findOneAndUpdate(
    { gameId, status: "active" },
    { $set: { status: "processing" } },
    { returnDocument: "after", projection: { _id: 0 } }
  );
  return res || null;
}

async function finalizeSession(gameId, status, result) {
  const { sessions } = collections();
  await sessions.updateOne(
    { gameId },
    { $set: { status, result } }
  );
}

async function creditWalletOnce(gameId, amount) {
  if (!(amount > 0)) {
    const state = await getAppState();
    return { credited: false, walletTotalCredited: state.wallet.totalCredited };
  }

  const { creditedGames, appState } = collections();
  try {
    await creditedGames.insertOne({
      gameId,
      amount,
      creditedAt: new Date().toISOString()
    });
  } catch (err) {
    // Duplicate key (E11000) -> already credited
    if (err && err.code === 11000) {
      const state = await getAppState();
      return { credited: false, walletTotalCredited: state.wallet.totalCredited };
    }
    throw err;
  }

  const updated = await appState.findOneAndUpdate(
    { _id: "singleton" },
    { $inc: { "wallet.totalCredited": amount } },
    { returnDocument: "after" }
  );

  return {
    credited: true,
    walletTotalCredited: updated?.wallet?.totalCredited ?? amount
  };
}

async function insertHistoryRecord(record) {
  const { history } = collections();
  await history.insertOne({
    ...record,
    completedAtMs: Date.now()
  });
}

async function logSecurityEvent(reason, details) {
  const { securityLog } = collections();
  await securityLog.insertOne({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    createdAtMs: Date.now(),
    reason,
    details
  });
}

async function getHistorySummary(recentLimit = 25) {
  const { history } = collections();
  const [state, totalGames, wins, recent] = await Promise.all([
    getAppState(),
    history.countDocuments({}),
    history.countDocuments({ outcome: "won" }),
    history
      .find({}, { projection: { _id: 0, completedAtMs: 0 } })
      .sort({ completedAtMs: -1 })
      .limit(recentLimit)
      .toArray()
  ]);

  return {
    walletTotalCredited: state.wallet.totalCredited,
    totalGames,
    wins,
    winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0,
    rewardTiers: state.config.rewardTiers,
    recent
  };
}

async function getAdminState() {
  const { history, securityLog } = collections();
  const [state, totalGames, wins, flagged, historyDocs, securityDocs] = await Promise.all([
    getAppState(),
    history.countDocuments({}),
    history.countDocuments({ outcome: "won" }),
    history.countDocuments({ outcome: "flagged" }),
    history
      .find({}, { projection: { _id: 0, completedAtMs: 0 } })
      .sort({ completedAtMs: -1 })
      .limit(250)
      .toArray(),
    securityLog
      .find({}, { projection: { _id: 0, createdAtMs: 0 } })
      .sort({ createdAtMs: -1 })
      .limit(100)
      .toArray()
  ]);

  return {
    config: state.config,
    wallet: state.wallet,
    stats: {
      totalGames,
      wins,
      losses: Math.max(0, totalGames - wins - flagged),
      flagged,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0
    },
    history: historyDocs,
    securityLog: securityDocs
  };
}

async function updateConfig(nextConfig) {
  const { appState } = collections();
  await appState.updateOne(
    { _id: "singleton" },
    { $set: { config: nextConfig } }
  );
  return nextConfig;
}

async function resetHistoryAndLedger() {
  const { appState, sessions, creditedGames, history, securityLog } = collections();
  await Promise.all([
    history.deleteMany({}),
    securityLog.deleteMany({}),
    sessions.deleteMany({}),
    creditedGames.deleteMany({}),
    appState.updateOne(
      { _id: "singleton" },
      { $set: { "wallet.totalCredited": 0 } }
    )
  ]);
}

module.exports = {
  DEFAULT_REWARD_TIERS,
  DEFAULT_CONFIG,
  connectDb,
  closeDb,
  getAppState,
  createSession,
  findSession,
  lockSessionForCompletion,
  finalizeSession,
  creditWalletOnce,
  insertHistoryRecord,
  logSecurityEvent,
  getHistorySummary,
  getAdminState,
  updateConfig,
  resetHistoryAndLedger
};
