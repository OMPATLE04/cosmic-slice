"use strict";

const assert = require("assert");
const crypto = require("crypto");
const path = require("path");
const { io: ioClient } = require("socket.io-client");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
process.env.DISABLE_RATE_LIMIT = "1";
process.env.COSMIC_ADMIN_PIN = "test-admin-pin";

const db = require("../db");
const { createServerApp } = require("../server");

const TEST_DB_NAME = `cosmic_slice_test_${Date.now()}`;

async function reqJson(baseUrl, urlPath, options = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function connectSocket(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(baseUrl, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true
    });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
}

function waitForEvent(socket, eventName, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function buildValidSlices(count, durationMs = 2400) {
  const slices = [];
  const step = Math.max(80, Math.floor((durationMs - 300) / Math.max(1, count)));
  for (let i = 0; i < count; i++) {
    slices.push({
      tMs: 150 + i * step,
      type: "comet",
      combo: 1,
      highIntercept: false
    });
  }
  return slices;
}

async function run() {
  let server;
  let ioServer;
  const openSockets = [];
  try {
    await db.connectDb(process.env.MONGODB_URI, TEST_DB_NAME);
    const appBundle = createServerApp();
    server = appBundle.server;
    ioServer = appBundle.io;

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Test server running at ${baseUrl} on DB ${TEST_DB_NAME}`);

    // 1. Register two users & verify 1,000 starter coins
    const r1 = await reqJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: "alpha_blade",
        email: "alpha@example.com",
        password: "Password123"
      })
    });
    assert.strictEqual(r1.status, 201, "User 1 registration failed");
    assert.strictEqual(r1.data.wallet.balance, 1000, "Starter coins must be 1000");

    const r2 = await reqJson(baseUrl, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: "beta_comet",
        email: "beta@example.com",
        password: "Password123"
      })
    });
    assert.strictEqual(r2.status, 201, "User 2 registration failed");
    assert.strictEqual(r2.data.wallet.balance, 1000, "User 2 starter coins must be 1000");

    const tok1 = r1.data.token;
    const tok2 = r2.data.token;

    // 2. Login verification
    const loginRes = await reqJson(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: "alpha_blade", password: "Password123" })
    });
    assert.strictEqual(loginRes.status, 200, "Login must succeed");
    const badLogin = await reqJson(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: "alpha_blade", password: "WrongPassword" })
    });
    assert.strictEqual(badLogin.status, 401, "Invalid password must return 401");
    console.log("PASS: Registration, login, and 1,000 starter coin wallet");

    // 3. Daily bonus claim & duplicate claim prevention
    const d1 = await reqJson(baseUrl, "/api/daily/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({ rewardKey: "daily_login" })
    });
    assert.strictEqual(d1.status, 200, "First daily login claim should succeed");
    assert.strictEqual(d1.data.wallet.balance, 1050, "Balance should increase by 50");

    const dDup = await reqJson(baseUrl, "/api/daily/claim", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({ rewardKey: "daily_login" })
    });
    assert.strictEqual(dDup.status, 409, "Duplicate daily claim must be rejected");
    console.log("PASS: Daily bonus & duplicate claim prevention");

    // 4. Quick Play coin deduction, insufficient balance, CSPRNG audit, duplicate prevention, anti-cheat
    const qpStart = await reqJson(baseUrl, "/api/quickplay/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({ entryAmount: 50 })
    });
    assert.strictEqual(qpStart.status, 200, "Quick Play start should succeed");
    assert.strictEqual(qpStart.data.walletBalance, 1000, "Entry 50 deducted from 1050");

    const qpDone = await reqJson(baseUrl, "/api/quickplay/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({
        matchId: qpStart.data.matchId,
        survived: false,
        clientScore: 12,
        telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(12, 4000) }
      })
    });
    assert.strictEqual(qpDone.status, 200, "Quick Play complete should succeed");
    const expectedHash = crypto.createHash("sha256").update(qpDone.data.rngAudit.serverSeed).digest("hex");
    assert.strictEqual(expectedHash, qpStart.data.serverSeedHash, "Committed CSPRNG seed hash must match revealed seed");
    if (qpDone.data.outcome === "won") {
      assert.strictEqual(qpDone.data.virtualReward, 90, "1.8x of 50 must be 90");
    } else {
      assert.strictEqual(qpDone.data.virtualReward, 0, "Loss payout must be 0");
    }

    // Duplicate Quick Play submission blocked
    const qpDup = await reqJson(baseUrl, "/api/quickplay/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({
        matchId: qpStart.data.matchId,
        survived: false,
        clientScore: 12,
        telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(12, 4000) }
      })
    });
    assert.strictEqual(qpDup.status, 409, "Duplicate Quick Play completion must return 409");

    // Tampered client score rejected
    const qpTamperStart = await reqJson(baseUrl, "/api/quickplay/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({ entryAmount: 10 })
    });
    const qpTamperDone = await reqJson(baseUrl, "/api/quickplay/complete", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok1}` },
      body: JSON.stringify({
        matchId: qpTamperStart.data.matchId,
        survived: false,
        clientScore: 999,
        telemetry: { mistakes: 0, hitSkull: false, slices: buildValidSlices(3, 1500) }
      })
    });
    assert.strictEqual(qpTamperDone.data.outcome, "flagged", "Tampered score must be flagged");
    assert.strictEqual(qpTamperDone.data.virtualReward, 0, "Flagged score gets 0 reward");

    // Insufficient balance check (try 500 three times from ~1000)
    await reqJson(baseUrl, "/api/quickplay/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok2}` },
      body: JSON.stringify({ entryAmount: 500 })
    });
    await reqJson(baseUrl, "/api/quickplay/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok2}` },
      body: JSON.stringify({ entryAmount: 500 })
    });
    const lowBal = await reqJson(baseUrl, "/api/quickplay/start", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok2}` },
      body: JSON.stringify({ entryAmount: 10 })
    });
    assert.strictEqual(lowBal.status, 400, "Insufficient balance must be rejected");
    // Credit beta_comet back 1000 for Duel tests
    await db.creditWallet({
      userId: r2.data.user.userId,
      amount: 1000,
      type: "admin_adjust",
      referenceId: "test_topup",
      idempotencyKey: "test_topup_beta",
      description: "Test topup"
    });
    console.log("PASS: Quick Play deduction, CSPRNG audit, duplicate block, anti-cheat, insufficient balance");

    // 5. Duel Arena: Queue cancel + refund
    const s1 = await connectSocket(baseUrl, tok1);
    const s2 = await connectSocket(baseUrl, tok2);
    openSockets.push(s1, s2);
    s1.on("duel:error", (e) => console.error("s1 duel:error:", e));
    s2.on("duel:error", (e) => console.error("s2 duel:error:", e));

    const w1Before = (await reqJson(baseUrl, "/api/wallet", { headers: { Authorization: `Bearer ${tok1}` } })).data.wallet.balance;
    const queuedP = waitForEvent(s1, "duel:queued");
    s1.emit("duel:join_queue", { entryAmount: 100 });
    const qInfo = await queuedP;
    assert.strictEqual(qInfo.walletBalance, w1Before - 100, "Queue join should escrow 100 coins");

    const cancelP = waitForEvent(s1, "duel:queue_cancelled");
    s1.emit("duel:cancel_queue");
    const cInfo = await cancelP;
    assert.strictEqual(cInfo.walletBalance, w1Before, "Queue cancel should refund 100 coins");
    console.log("PASS: Duel Arena queue escrow and cancellation refund");

    // 6. Duel Arena: Matchmaking, synchronization, higher score wins (180 payout, 20 fee)
    const w2Before = (await reqJson(baseUrl, "/api/wallet", { headers: { Authorization: `Bearer ${tok2}` } })).data.wallet.balance;
    const m1P = waitForEvent(s1, "duel:match_found");
    const m2P = waitForEvent(s2, "duel:match_found");
    s1.emit("duel:join_queue", { entryAmount: 100 });
    s2.emit("duel:join_queue", { entryAmount: 100 });
    const [m1, m2] = await Promise.all([m1P, m2P]);
    assert.strictEqual(m1.matchId, m2.matchId, "Both players must share matchId");
    assert.strictEqual(m1.seed, m2.seed, "Both players must share identical deterministic seed");

    const res1P = waitForEvent(s1, "duel:result");
    const res2P = waitForEvent(s2, "duel:result");
    s1.emit("duel:submit", {
      matchId: m1.matchId,
      survived: false,
      clientScore: 15,
      telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(15, 2500) }
    });
    s2.emit("duel:submit", {
      matchId: m2.matchId,
      survived: false,
      clientScore: 8,
      telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(8, 2500) }
    });
    const [res1, res2] = await Promise.all([res1P, res2P]);
    assert.strictEqual(res1.outcome, "won", "Higher verified score must win");
    assert.strictEqual(res1.virtualReward, 180, "Winner receives 180 out of 200 pool (10% fee)");
    assert.strictEqual(res1.walletBalance, w1Before - 100 + 180, "Winner balance updated accurately");
    assert.strictEqual(res2.outcome, "lost", "Lower score loses");
    assert.strictEqual(res2.walletBalance, w2Before - 100, "Loser wallet deducted 100");
    console.log("PASS: Duel Arena matchmaking, identical seed, verified winner payout (180) & 10% virtual fee");

    // 7. Duel Arena: Tie & full refund logic
    const w1TieBefore = res1.walletBalance;
    const w2TieBefore = res2.walletBalance;
    const tm1P = waitForEvent(s1, "duel:match_found");
    const tm2P = waitForEvent(s2, "duel:match_found");
    s1.emit("duel:join_queue", { entryAmount: 50 });
    s2.emit("duel:join_queue", { entryAmount: 50 });
    const [tm1, tm2] = await Promise.all([tm1P, tm2P]);

    const tRes1P = waitForEvent(s1, "duel:result");
    const tRes2P = waitForEvent(s2, "duel:result");
    s1.emit("duel:submit", {
      matchId: tm1.matchId,
      survived: false,
      clientScore: 10,
      telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(10, 2000) }
    });
    s2.emit("duel:submit", {
      matchId: tm2.matchId,
      survived: false,
      clientScore: 10,
      telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(10, 2000) }
    });
    const [tRes1, tRes2] = await Promise.all([tRes1P, tRes2P]);
    assert.strictEqual(tRes1.outcome, "tie", "Equal scores must tie");
    assert.strictEqual(tRes1.walletBalance, w1TieBefore, "Tie refunds player 1 fully");
    assert.strictEqual(tRes2.walletBalance, w2TieBefore, "Tie refunds player 2 fully");
    console.log("PASS: Duel Arena tie & full refund");

    // 8. Duel Arena: Disconnection handling
    const dm1P = waitForEvent(s1, "duel:match_found");
    const dm2P = waitForEvent(s2, "duel:match_found");
    s1.emit("duel:join_queue", { entryAmount: 20 });
    s2.emit("duel:join_queue", { entryAmount: 20 });
    const [dm1] = await Promise.all([dm1P, dm2P]);

    const dRes1P = waitForEvent(s1, "duel:result", 10000);
    s1.emit("duel:submit", {
      matchId: dm1.matchId,
      survived: false,
      clientScore: 6,
      telemetry: { mistakes: 1, hitSkull: true, slices: buildValidSlices(6, 1500) }
    });
    s2.disconnect();
    const dRes1 = await dRes1P;
    assert.strictEqual(dRes1.outcome, "won", "Connected player must win when opponent disconnects");
    assert.strictEqual(dRes1.virtualReward, 36, "90% of 40 pool = 36 coins");
    s1.disconnect();
    console.log("PASS: Duel Arena disconnection forfeit handling");

    // 9. Leaderboard & History verification
    const lbAll = await reqJson(baseUrl, "/api/leaderboard?period=all&limit=10");
    const lbWeekly = await reqJson(baseUrl, "/api/leaderboard?period=weekly&limit=50");
    assert.strictEqual(lbAll.status, 200);
    assert.strictEqual(lbWeekly.status, 200);
    assert(lbAll.data.entries.length >= 2, "Leaderboard must contain ranked players");

    const hist1 = await reqJson(baseUrl, "/api/history", { headers: { Authorization: `Bearer ${tok1}` } });
    assert.strictEqual(hist1.status, 200);
    assert(hist1.data.recent.length >= 4, "Game history persisted across matches");
    console.log("PASS: Leaderboard (all-time & weekly) & Game History");

    // 10. Admin permissions, config audit log, and user suspension
    const unauthAdmin = await reqJson(baseUrl, "/api/admin/state");
    assert.strictEqual(unauthAdmin.status, 401, "Admin route must reject unauthorized access");

    const authAdmin = await reqJson(baseUrl, "/api/admin/state", {
      headers: { "x-admin-pin": "test-admin-pin" }
    });
    assert.strictEqual(authAdmin.status, 200);
    assert.strictEqual(authAdmin.data.stats.totalUsers, 2);
    assert.strictEqual(authAdmin.data.stats.totalDuelVirtualFees, 24, "Virtual fees tracked: 20 + 4 = 24");

    const cfgUpd = await reqJson(baseUrl, "/api/admin/config", {
      method: "POST",
      headers: { "x-admin-pin": "test-admin-pin" },
      body: JSON.stringify({
        quickPlay: { winProbabilityPct: 45, payoutMultiplier: 1.8, durationSeconds: 45, targetScore: 95, maxMistakes: 2 },
        duelArena: { platformFeePct: 10, matchmakingTimeoutSec: 45 }
      })
    });
    assert.strictEqual(cfgUpd.status, 200);

    const susp = await reqJson(baseUrl, `/api/admin/users/${r2.data.user.userId}/status`, {
      method: "POST",
      headers: { "x-admin-pin": "test-admin-pin" },
      body: JSON.stringify({ status: "suspended" })
    });
    assert.strictEqual(susp.status, 200);
    const suspLogin = await reqJson(baseUrl, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: "beta_comet", password: "Password123" })
    });
    assert.strictEqual(suspLogin.status, 403, "Suspended user login must be blocked");
    console.log("PASS: Admin permissions, virtual accounting, audit logging, and user suspension");

    console.log("\nALL 10 INTEGRATION TEST SUITES PASSED!");
  } finally {
    for (const s of openSockets) {
      try { s.close(); } catch (_) {}
    }
    if (ioServer) {
      try { ioServer.close(); } catch (_) {}
    }
    if (server) {
      try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      const cols = db.collections();
      if (cols && cols.users) {
        await Promise.all(Object.values(cols).map((c) => c.drop().catch(() => {})));
      }
    } catch (_) {}
    await db.closeDb();
  }
}

run().catch((err) => {
  console.error("TEST SUITE FAILED:", err);
  process.exit(1);
});
