"use strict";

const crypto = require("crypto");
const { verifyAuthToken } = require("./auth");
const { validateAndScoreTelemetry, calculateDuelPayout, computeBadge } = require("./gameLogic");

/**
 * Real-time Socket.IO Duel Arena matchmaking, synchronization, validation, and settlement.
 */
function attachDuelManager(io, db) {
  // Queue keyed by entryAmount -> Array<{ socket, userId, username, avatarColor, badge, ticketId, joinedAt, timeoutHandle }>
  const queues = new Map();
  // Active matches in memory keyed by matchId
  const activeDuels = new Map();
  // Quick lookup userId -> { matchId, socketId }
  const userActiveMatch = new Map();

  function getQueue(entryAmount) {
    if (!queues.has(entryAmount)) queues.set(entryAmount, []);
    return queues.get(entryAmount);
  }

  async function removeAndRefundQueueEntry(entryAmount, ticketId, reason) {
    const q = getQueue(entryAmount);
    const idx = q.findIndex((item) => item.ticketId === ticketId);
    if (idx === -1) return null;
    const [entry] = q.splice(idx, 1);
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);

    try {
      const refund = await db.creditWallet({
        userId: entry.userId,
        amount: entryAmount,
        type: "duel_queue_refund",
        referenceId: ticketId,
        idempotencyKey: `duel_queue_refund:${ticketId}`,
        description: `Duel Arena queue ${reason} refund (${entryAmount} virtual coins)`
      });
      entry.socket.emit("duel:queue_cancelled", {
        reason,
        entryAmount,
        walletBalance: refund.wallet ? refund.wallet.balance : undefined
      });
    } catch (err) {
      console.error("Queue refund error:", err.message);
    }
    return entry;
  }

  async function settleDuelMatch(matchId, forcedReason = null) {
    const duel = activeDuels.get(matchId);
    if (!duel || duel.settling || duel.settled) return;
    duel.settling = true;

    if (duel.graceTimer) clearTimeout(duel.graceTimer);
    if (duel.matchHardTimeout) clearTimeout(duel.matchHardTimeout);

    const [pA, pB] = duel.players;
    const payout = duel.payout;

    try {
      const aDisconn = Boolean(pA.disconnected && !pA.submission);
      const bDisconn = Boolean(pB.disconnected && !pB.submission);
      const aFlagged = Boolean(pA.submission && pA.submission.tampered);
      const bFlagged = Boolean(pB.submission && pB.submission.tampered);

      const aScore = pA.submission ? pA.submission.validatedScore : 0;
      const bScore = pB.submission ? pB.submission.validatedScore : 0;

      let outcomeType = "completed"; // "completed" | "tied" | "cancelled"
      let winner = null;
      let loser = null;
      let summaryNote = "";

      if ((aDisconn && bDisconn) || (aFlagged && bFlagged)) {
        outcomeType = "tied";
        summaryNote = aFlagged && bFlagged
          ? "Both submissions failed verification; virtual entries refunded."
          : "Both players disconnected; virtual entries refunded.";
      } else if (aDisconn || aFlagged) {
        winner = pB;
        loser = pA;
        summaryNote = aFlagged
          ? `${pA.username} flagged by anti-cheat; ${pB.username} wins.`
          : `${pA.username} disconnected; ${pB.username} wins by forfeit.`;
      } else if (bDisconn || bFlagged) {
        winner = pA;
        loser = pB;
        summaryNote = bFlagged
          ? `${pB.username} flagged by anti-cheat; ${pA.username} wins.`
          : `${pB.username} disconnected; ${pA.username} wins by forfeit.`;
      } else if (aScore > bScore) {
        winner = pA;
        loser = pB;
        summaryNote = `${pA.username} won (${aScore} vs ${bScore}).`;
      } else if (bScore > aScore) {
        winner = pB;
        loser = pA;
        summaryNote = `${pB.username} won (${bScore} vs ${aScore}).`;
      } else {
        outcomeType = "tied";
        summaryNote = `Tie match (${aScore} - ${bScore})! Both players refunded.`;
      }

      const playerResults = {};

      if (outcomeType === "tied") {
        const [refA, refB] = await Promise.all([
          db.creditWallet({
            userId: pA.userId,
            amount: duel.entryAmount,
            type: "duel_tie_refund",
            referenceId: matchId,
            idempotencyKey: `duel_tie:${matchId}:${pA.userId}`,
            description: `Duel Arena tie refund (${duel.entryAmount} virtual coins)`
          }),
          db.creditWallet({
            userId: pB.userId,
            amount: duel.entryAmount,
            type: "duel_tie_refund",
            referenceId: matchId,
            idempotencyKey: `duel_tie:${matchId}:${pB.userId}`,
            description: `Duel Arena tie refund (${duel.entryAmount} virtual coins)`
          })
        ]);

        playerResults[pA.userId] = {
          outcome: "tie",
          reward: duel.entryAmount,
          walletBalance: refA.wallet?.balance ?? null
        };
        playerResults[pB.userId] = {
          outcome: "tie",
          reward: duel.entryAmount,
          walletBalance: refB.wallet?.balance ?? null
        };
      } else {
        const winCredit = await db.creditWallet({
          userId: winner.userId,
          amount: payout.winnerReward,
          type: "duel_win",
          referenceId: matchId,
          idempotencyKey: `duel_win:${matchId}:${winner.userId}`,
          description: `Duel Arena victory vs ${loser.username} (${payout.winnerReward} virtual coins)`
        });

        await db.recordPlatformVirtualFee(payout.platformVirtualFee);
        const loserWallet = await db.getWallet(loser.userId);

        playerResults[winner.userId] = {
          outcome: "won",
          reward: payout.winnerReward,
          walletBalance: winCredit.wallet?.balance ?? null
        };
        playerResults[loser.userId] = {
          outcome: loser.submission?.tampered ? "flagged" : "lost",
          reward: 0,
          walletBalance: loserWallet?.balance ?? null
        };
      }

      // Record GameHistory, user stats, and leaderboard for both players
      await Promise.all([
        db.recordMatchOutcomeForUser({
          userId: pA.userId,
          username: pA.username,
          matchId,
          mode: "duel_arena",
          entryAmount: duel.entryAmount,
          playerScore: aScore,
          opponentUserId: pB.userId,
          opponentUsername: pB.username,
          opponentScore: bScore,
          percentage: pA.submission ? pA.submission.percentage : 0,
          outcome: playerResults[pA.userId].outcome,
          virtualReward: playerResults[pA.userId].reward,
          verified: !aFlagged,
          lossReason: forcedReason || summaryNote
        }),
        db.recordMatchOutcomeForUser({
          userId: pB.userId,
          username: pB.username,
          matchId,
          mode: "duel_arena",
          entryAmount: duel.entryAmount,
          playerScore: bScore,
          opponentUserId: pA.userId,
          opponentUsername: pA.username,
          opponentScore: aScore,
          percentage: pB.submission ? pB.submission.percentage : 0,
          outcome: playerResults[pB.userId].outcome,
          virtualReward: playerResults[pB.userId].reward,
          verified: !bFlagged,
          lossReason: forcedReason || summaryNote
        }),
        db.finalizeMatch(matchId, {
          status: outcomeType,
          winnerUserId: winner ? winner.userId : null,
          platformVirtualFee: outcomeType === "tied" ? 0 : payout.platformVirtualFee,
          summaryNote,
          players: duel.players.map((p) => ({
            userId: p.userId,
            username: p.username,
            score: p.submission ? p.submission.validatedScore : 0,
            mistakes: p.submission ? p.submission.mistakes : 0,
            verified: !(p.submission && p.submission.tampered),
            disconnected: Boolean(p.disconnected)
          })),
          completedAt: new Date().toISOString()
        })
      ]);

      duel.settled = true;

      for (const player of duel.players) {
        const opp = duel.players.find((x) => x.userId !== player.userId);
        const resObj = playerResults[player.userId];
        userActiveMatch.delete(player.userId);

        io.to(player.socketId).emit("duel:result", {
          matchId,
          outcome: resObj.outcome,
          yourScore: player.submission ? player.submission.validatedScore : 0,
          opponentScore: opp.submission ? opp.submission.validatedScore : 0,
          opponentUsername: opp.username,
          entryAmount: duel.entryAmount,
          totalPool: payout.totalPool,
          platformFeePct: payout.platformFeePct,
          platformVirtualFee: outcomeType === "tied" ? 0 : payout.platformVirtualFee,
          virtualReward: resObj.reward,
          walletBalance: resObj.walletBalance,
          summaryNote
        });
      }
    } catch (err) {
      console.error("Duel settlement failed:", err);
    } finally {
      activeDuels.delete(matchId);
    }
  }

  async function pairPlayers(entryAmount) {
    const q = getQueue(entryAmount);
    while (q.length >= 2) {
      const p1 = q.shift();
      // Find first opponent with different userId
      const oppIdx = q.findIndex((x) => x.userId !== p1.userId);
      if (oppIdx === -1) {
        q.unshift(p1);
        return;
      }
      const [p2] = q.splice(oppIdx, 1);

      if (p1.timeoutHandle) clearTimeout(p1.timeoutHandle);
      if (p2.timeoutHandle) clearTimeout(p2.timeoutHandle);

      const settings = await db.getAdminSettings();
      const duelCfg = settings.duelArena;
      const payout = calculateDuelPayout(entryAmount, duelCfg.platformFeePct);
      const matchId = crypto.randomUUID();
      const seed = crypto.randomBytes(8).readUInt32BE(0);
      const now = Date.now();
      const startAt = now + 3200; // 3.2s synchronized countdown

      const duelState = {
        matchId,
        entryAmount,
        seed,
        durationSeconds: duelCfg.durationSeconds,
        targetScore: duelCfg.targetScore,
        maxMistakes: duelCfg.maxMistakes,
        difficulty: settings.difficulty,
        payout,
        createdAt: now,
        startedAt: startAt,
        settled: false,
        settling: false,
        graceTimer: null,
        matchHardTimeout: null,
        players: [
          {
            userId: p1.userId,
            username: p1.username,
            avatarColor: p1.avatarColor,
            badge: p1.badge,
            socketId: p1.socket.id,
            ticketId: p1.ticketId,
            submission: null,
            disconnected: false
          },
          {
            userId: p2.userId,
            username: p2.username,
            avatarColor: p2.avatarColor,
            badge: p2.badge,
            socketId: p2.socket.id,
            ticketId: p2.ticketId,
            submission: null,
            disconnected: false
          }
        ]
      };

      activeDuels.set(matchId, duelState);
      userActiveMatch.set(p1.userId, { matchId, socketId: p1.socket.id });
      userActiveMatch.set(p2.userId, { matchId, socketId: p2.socket.id });

      await db.createMatch({
        matchId,
        mode: "duel_arena",
        status: "playing",
        entryAmount,
        seed,
        durationSeconds: duelCfg.durationSeconds,
        targetScore: duelCfg.targetScore,
        maxMistakes: duelCfg.maxMistakes,
        platformFeePct: payout.platformFeePct,
        prizePool: payout.totalPool,
        players: [
          { userId: p1.userId, username: p1.username },
          { userId: p2.userId, username: p2.username }
        ],
        createdAt: new Date(now).toISOString(),
        createdAtMs: now,
        startedAt: startAt
      });

      // Hard timeout safety so matches always settle even if both clients vanish
      duelState.matchHardTimeout = setTimeout(() => {
        settleDuelMatch(matchId, "Match time expired.");
      }, (duelCfg.durationSeconds + 25) * 1000);
      if (duelState.matchHardTimeout.unref) duelState.matchHardTimeout.unref();

      const emitMatchFound = (selfPlayer, oppPlayer) => {
        io.to(selfPlayer.socketId).emit("duel:match_found", {
          matchId,
          entryAmount,
          seed,
          startAt,
          countdownMs: 3200,
          durationSeconds: duelCfg.durationSeconds,
          targetScore: duelCfg.targetScore,
          maxMistakes: duelCfg.maxMistakes,
          difficulty: settings.difficulty,
          payout,
          opponent: {
            userId: oppPlayer.userId,
            username: oppPlayer.username,
            avatarColor: oppPlayer.avatarColor,
            badge: oppPlayer.badge
          }
        });
      };

      emitMatchFound(duelState.players[0], duelState.players[1]);
      emitMatchFound(duelState.players[1], duelState.players[0]);
    }
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error("Authentication required"));
      const settings = await db.getAdminSettings();
      const payload = verifyAuthToken(token, settings.hmacSecret);
      if (!payload || !payload.sub) return next(new Error("Invalid session token"));
      const user = await db.findUserById(payload.sub);
      if (!user || user.status === "suspended") return next(new Error("Unauthorized user"));
      socket.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;

    socket.on("duel:join_queue", async (payload = {}) => {
      try {
        const entryAmount = Math.round(Number(payload.entryAmount || 0));
        const settings = await db.getAdminSettings();
        const duelCfg = settings.duelArena;

        if (!duelCfg.entryOptions.includes(entryAmount)) {
          socket.emit("duel:error", { error: "Invalid Duel Arena entry amount." });
          return;
        }

        // Prevent duplicate queue/match membership for same user
        if (userActiveMatch.has(user.userId)) {
          socket.emit("duel:error", { error: "You already have an active Duel match." });
          return;
        }
        for (const q of queues.values()) {
          if (q.some((item) => item.userId === user.userId)) {
            socket.emit("duel:error", { error: "Already waiting in matchmaking queue." });
            return;
          }
        }

        const ticketId = crypto.randomUUID();
        const debit = await db.debitWallet({
          userId: user.userId,
          amount: entryAmount,
          type: "duel_entry",
          referenceId: ticketId,
          idempotencyKey: `duel_entry:${ticketId}`,
          description: `Duel Arena entry escrow (${entryAmount} virtual coins)`
        });

        const timeoutSec = Math.max(15, Number(duelCfg.matchmakingTimeoutSec || 45));
        const timeoutHandle = setTimeout(() => {
          removeAndRefundQueueEntry(entryAmount, ticketId, "timeout");
        }, timeoutSec * 1000);
        if (timeoutHandle.unref) timeoutHandle.unref();

        const queueItem = {
          socket,
          userId: user.userId,
          username: user.username,
          avatarColor: user.avatarColor || "#9542ff",
          badge: computeBadge(user.stats),
          ticketId,
          entryAmount,
          joinedAt: Date.now(),
          timeoutHandle
        };

        getQueue(entryAmount).push(queueItem);

        socket.emit("duel:queued", {
          ticketId,
          entryAmount,
          timeoutSec,
          walletBalance: debit.wallet.balance,
          payout: calculateDuelPayout(entryAmount, duelCfg.platformFeePct)
        });

        await pairPlayers(entryAmount);
      } catch (err) {
        socket.emit("duel:error", { error: err.message || "Could not join matchmaking." });
      }
    });

    socket.on("duel:cancel_queue", async () => {
      for (const [entryAmount, q] of queues.entries()) {
        const found = q.find((item) => item.userId === user.userId && item.socket.id === socket.id);
        if (found) {
          await removeAndRefundQueueEntry(entryAmount, found.ticketId, "cancelled");
          return;
        }
      }
    });

    socket.on("duel:progress", (payload = {}) => {
      const active = userActiveMatch.get(user.userId);
      if (!active) return;
      const duel = activeDuels.get(active.matchId);
      if (!duel || duel.settled) return;
      const opp = duel.players.find((p) => p.userId !== user.userId);
      if (opp) {
        io.to(opp.socketId).emit("duel:opponent_progress", {
          score: Math.max(0, Math.round(Number(payload.score || 0))),
          mistakes: Math.max(0, Math.round(Number(payload.mistakes || 0)))
        });
      }
    });

    socket.on("duel:submit", async (payload = {}) => {
      const matchId = payload.matchId;
      const duel = activeDuels.get(matchId);
      if (!duel || duel.settled) return;

      const player = duel.players.find((p) => p.userId === user.userId);
      if (!player || player.submission) return;

      const validation = validateAndScoreTelemetry(
        {
          startedAt: duel.startedAt,
          durationSeconds: duel.durationSeconds,
          targetScore: duel.targetScore,
          maxMistakes: duel.maxMistakes
        },
        payload
      );

      if (validation.tampered) {
        await db.logAudit("security", user.userId, "DUEL_TELEMETRY_FLAGGED", {
          matchId,
          issues: validation.issues
        });
      }

      player.submission = validation;

      const opp = duel.players.find((p) => p.userId !== user.userId);
      if (opp && !opp.submission) {
        io.to(player.socketId).emit("duel:waiting_opponent", {
          matchId,
          yourScore: validation.validatedScore
        });
      }

      if (duel.players.every((p) => Boolean(p.submission) || p.disconnected)) {
        await settleDuelMatch(matchId);
      } else if (!duel.graceTimer) {
        // Give the opponent up to 8s after first player finishes to submit
        duel.graceTimer = setTimeout(() => {
          settleDuelMatch(matchId);
        }, 8000);
        if (duel.graceTimer.unref) duel.graceTimer.unref();
      }
    });

    socket.on("disconnect", async () => {
      // 1. Refund if waiting in queue
      for (const [entryAmount, q] of queues.entries()) {
        const found = q.find((item) => item.userId === user.userId && item.socket.id === socket.id);
        if (found) {
          await removeAndRefundQueueEntry(entryAmount, found.ticketId, "disconnected");
        }
      }

      // 2. Handle mid-match disconnect fairly
      const active = userActiveMatch.get(user.userId);
      if (active && active.socketId === socket.id) {
        const duel = activeDuels.get(active.matchId);
        if (duel && !duel.settled) {
          const player = duel.players.find((p) => p.userId === user.userId);
          const opp = duel.players.find((p) => p.userId !== user.userId);
          if (player) {
            player.disconnected = true;
          }
          if (opp && !opp.disconnected) {
            io.to(opp.socketId).emit("duel:opponent_disconnected", {
              matchId: duel.matchId,
              graceSeconds: 5
            });
          }
          setTimeout(() => {
            const latest = activeDuels.get(duel.matchId);
            if (latest && !latest.settled) {
              settleDuelMatch(duel.matchId, "Opponent disconnected during match.");
            }
          }, 5000);
        }
      }
    });
  });

  return {
    getStats: () => ({
      queuedPlayers: Array.from(queues.values()).reduce((sum, q) => sum + q.length, 0),
      activeDuels: activeDuels.size
    })
  };
}

module.exports = { attachDuelManager };
