"use strict";

const crypto = require("crypto");

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Deterministic badge based on verified lifetime player stats.
 */
function computeBadge(stats = {}) {
  const wins = Number(stats.wins || 0);
  const highestScore = Number(stats.highestScore || 0);
  const totalMatches = Number(stats.totalMatches || 0);

  if (wins >= 50 || highestScore >= 180) {
    return { id: "cosmic_legend", label: "Cosmic Legend", tier: 5 };
  }
  if (wins >= 25 || highestScore >= 140) {
    return { id: "star_blade", label: "Star Blade", tier: 4 };
  }
  if (wins >= 10 || highestScore >= 100) {
    return { id: "nova_striker", label: "Nova Striker", tier: 3 };
  }
  if (wins >= 3 || totalMatches >= 8) {
    return { id: "comet_hunter", label: "Comet Hunter", tier: 2 };
  }
  return { id: "lunar_cadet", label: "Lunar Cadet", tier: 1 };
}

/**
 * Generates a provably auditable, cryptographically secure random draw for Quick Play.
 * Outcome depends strictly on CSPRNG serverSeed + matchId, never on user identity,
 * wallet balance, or prior match history.
 */
function generateAuditableQuickPlayOutcome(matchId, winProbabilityPct, entryAmount, payoutMultiplier) {
  const safeWinProb = clamp(Number(winProbabilityPct || 45), 1, 95);
  const safeMult = clamp(Number(payoutMultiplier || 1.8), 1.05, 10);
  const serverSeed = crypto.randomBytes(32).toString("hex");
  const serverSeedHash = crypto.createHash("sha256").update(serverSeed).digest("hex");

  const digestHex = crypto
    .createHash("sha256")
    .update(`${serverSeed}:${matchId}`)
    .digest("hex");

  // 32-bit uniform integer mapped to [0, 100)
  const uint32 = parseInt(digestHex.slice(0, 8), 16);
  const rollFloat = uint32 / 0x100000000;
  const rollPct = Math.floor(rollFloat * 10000) / 100; // 0.00 to 99.99

  const isWin = rollPct < safeWinProb;
  const payout = isWin ? Math.round(Number(entryAmount) * safeMult) : 0;

  return {
    serverSeed,
    serverSeedHash,
    rollFloat,
    rollPct,
    winProbabilityPct: safeWinProb,
    payoutMultiplier: safeMult,
    outcome: isWin ? "won" : "lost",
    payout
  };
}

/**
 * Computes Duel Arena prize pool and virtual platform fee accounting.
 */
function calculateDuelPayout(entryAmount, platformFeePct = 10) {
  const entry = Math.max(0, Math.round(Number(entryAmount) || 0));
  const feePct = clamp(Number(platformFeePct ?? 10), 0, 40);
  const totalPool = entry * 2;
  const platformVirtualFee = Math.round(totalPool * (feePct / 100));
  const winnerReward = Math.max(0, totalPool - platformVirtualFee);
  return {
    entryAmount: entry,
    totalPool,
    platformFeePct: feePct,
    platformVirtualFee,
    winnerReward
  };
}

/**
 * Anti-cheat server-side telemetry verification for Cosmic Slice gameplay.
 * Recomputes score strictly from monotonic timestamps, spawn limits, combo windows,
 * and hazard rules.
 */
function validateAndScoreTelemetry(matchSpec, body) {
  const startedAt = Number(matchSpec.startedAt || Date.now());
  const durationSeconds = Number(matchSpec.durationSeconds || 45);
  const targetScore = Number(matchSpec.targetScore || 95);
  const maxMistakes = Number(matchSpec.maxMistakes ?? 2);

  const serverElapsedMs = Math.max(0, Date.now() - startedAt);
  const telemetry = body && typeof body.telemetry === "object" && body.telemetry ? body.telemetry : {};
  const slices = Array.isArray(telemetry.slices) ? telemetry.slices : [];
  const clientScore = Number(body && body.clientScore ? body.clientScore : 0);
  const mistakes = Number.isInteger(telemetry.mistakes)
    ? telemetry.mistakes
    : Number(telemetry.mistakes || 0);
  const hitSkull = Boolean(telemetry.hitSkull);
  const requestedSurvived = body && (body.survived === true || body.outcome === "won");

  const issues = [];

  if (!Number.isInteger(mistakes) || mistakes < 0 || mistakes > 20) {
    issues.push("Invalid mistakes counter");
  }

  if (requestedSurvived) {
    const minValidMs = Math.max(4000, (durationSeconds - 3.5) * 1000);
    const maxValidMs = (durationSeconds + 75) * 1000;
    if (serverElapsedMs < minValidMs) {
      issues.push(`Elapsed time too short (${serverElapsedMs}ms < ${minValidMs}ms)`);
    }
    if (serverElapsedMs > maxValidMs) {
      issues.push(`Session expired (${serverElapsedMs}ms > ${maxValidMs}ms)`);
    }
    if (hitSkull) {
      issues.push("Cannot survive round after slicing a skull hazard");
    }
    if (mistakes > maxMistakes) {
      issues.push(`Mistakes (${mistakes}) exceeded allowed limit (${maxMistakes})`);
    }
  }

  // Physical rate-limit on total slices
  const maxSlices = Math.ceil(durationSeconds * 4.5) + 18;
  if (slices.length > maxSlices) {
    issues.push(`Slice count (${slices.length}) exceeded physical spawn limit (${maxSlices})`);
  }

  let recomputedScore = 0;
  let validComets = 0;
  let validStars = 0;
  let prevTMs = -1;
  const maxStars = Math.ceil(durationSeconds / 5) + 4;

  for (let i = 0; i < Math.min(slices.length, maxSlices); i++) {
    const ev = slices[i];
    if (!ev || typeof ev !== "object") {
      issues.push("Malformed slice telemetry entry");
      break;
    }
    const tMs = Number(ev.tMs);
    if (!Number.isFinite(tMs) || tMs < 0 || tMs > serverElapsedMs + 3500) {
      issues.push("Out-of-bounds slice timestamp");
      break;
    }
    if (prevTMs >= 0 && tMs < prevTMs - 60) {
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
      const withinComboWindow = prevTMs >= 0 && tMs - prevTMs <= 360;
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

  if (Number.isFinite(clientScore) && clientScore > recomputedScore + 3) {
    issues.push(`Client score (${clientScore}) exceeded validated telemetry (${recomputedScore})`);
  }

  const survived =
    issues.length === 0 &&
    requestedSurvived &&
    !hitSkull &&
    mistakes <= maxMistakes;

  const validatedScore = Math.max(0, recomputedScore);
  const percentage = clamp(Math.round((validatedScore / Math.max(1, targetScore)) * 100), 0, 100);

  return {
    issues,
    tampered: issues.length > 0,
    survived,
    validatedScore,
    validComets,
    validStars,
    mistakes,
    hitSkull,
    serverElapsedMs,
    percentage
  };
}

module.exports = {
  clamp,
  computeBadge,
  generateAuditableQuickPlayOutcome,
  calculateDuelPayout,
  validateAndScoreTelemetry
};
