(function (global) {
  "use strict";

  const STORAGE_KEY_BEST = "cosmic_slice_best_v1";

  const DEFAULT_TIERS = [
    { id: "tier_0", label: "Below 40%", minPct: 0, maxPct: 39, amount: 0 },
    { id: "tier_1", label: "40–59%", minPct: 40, maxPct: 59, amount: 2 },
    { id: "tier_2", label: "60–74%", minPct: 60, maxPct: 74, amount: 5 },
    { id: "tier_3", label: "75–89%", minPct: 75, maxPct: 89, amount: 10 },
    { id: "tier_4", label: "90–100%", minPct: 90, maxPct: 100, amount: 20 }
  ];

  // DOM Elements
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const hudEl = document.getElementById("hud");
  const scoreValEl = document.getElementById("scoreVal");
  const perfValEl = document.getElementById("perfVal");
  const liveTierChipEl = document.getElementById("liveTierChip");
  const shieldsPillEl = document.getElementById("shieldsPill");
  const timerPillEl = document.getElementById("timerPill");
  const soundBtn = document.getElementById("soundBtn");
  const soundOnIcon = document.getElementById("soundOnIcon");
  const soundOffIcon = document.getElementById("soundOffIcon");

  const titleOverlay = document.getElementById("titleOverlay");
  const walletTotalValEl = document.getElementById("walletTotalVal");
  const shieldLegendTextEl = document.getElementById("shieldLegendText");

  const gameoverOverlay = document.getElementById("gameoverOverlay");
  const outcomeBadgeEl = document.getElementById("outcomeBadge");
  const resultTitleEl = document.getElementById("resultTitle");
  const lostReasonEl = document.getElementById("lostReason");
  const finalScoreEl = document.getElementById("finalScore");
  const finalPctEl = document.getElementById("finalPct");
  const finalRewardEl = document.getElementById("finalReward");
  const finalGameIdEl = document.getElementById("finalGameId");
  const finalTierEl = document.getElementById("finalTier");
  const finalVerifiedEl = document.getElementById("finalVerified");
  const continueBtn = document.getElementById("continueBtn");

  const infoModal = document.getElementById("infoModal");
  const openInfoBtn = document.getElementById("openInfoBtn");
  const resultHistoryBtn = document.getElementById("resultHistoryBtn");
  const closeInfoBtn = document.getElementById("closeInfoBtn");
  const modalDurationEl = document.getElementById("modalDuration");
  const modalMistakesEl = document.getElementById("modalMistakes");
  const modalTargetEl = document.getElementById("modalTarget");
  const modalTierListEl = document.getElementById("modalTierList");
  const modalHistoryListEl = document.getElementById("modalHistoryList");

  const audio = new global.CosmicAudio();

  // Viewport logical size
  let W = 420;
  let H = 746;
  let DPR = 1;

  // Game state: "title" | "playing" | "impact" | "gameover"
  let state = "title";
  let time = 0;
  let lastFrame = 0;

  // Admin-configurable Round Rules
  let serverConfig = {
    durationSeconds: 45,
    targetScore: 95,
    maxMistakes: 2,
    rewardTiers: DEFAULT_TIERS,
    walletTotalCredited: 0
  };

  // Active Session & Telemetry (Anti-cheat)
  let activeSession = null;
  let sessionFinalized = false;
  let telemetrySlices = [];
  let runStartPerfMs = 0;
  let lastSlicePerfMs = -9999;

  // Progression & Stats
  let score = 0;
  let bestScore = loadBestScore();
  let slicedCount = 0;
  let mistakes = 0;
  let hitSkull = false;
  let wave = 1;
  let roundRemaining = 45;
  let spawnTimer = 0;
  let slowMoTimer = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let lastOutcome = "lost";
  let lossReason = "Better luck next time";

  // Screen effects
  let shakeTime = 0;
  let shakeMag = 0;
  let impactTimer = 0;
  let impactPoint = { x: 0, y: 0 };
  let impactIsSkull = false;

  // Entities & Visuals
  let stars = [];
  let bgMeteors = [];
  let entities = [];
  let particles = [];
  let shards = [];
  let popups = [];
  let titleCometSliced = false;
  let titleTransition = 0;

  // Pointer / Blade Trail
  const pointer = {
    active: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    trail: []
  };

  function loadBestScore() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY_BEST);
      const parsed = parseInt(raw || "0", 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch (_) {
      return 0;
    }
  }

  function saveBestScore(val) {
    try {
      global.localStorage.setItem(STORAGE_KEY_BEST, String(val));
    } catch (_) {}
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function distPointToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    if (lenSq < 0.0001) return Math.hypot(px - ax, py - ay);
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lenSq, 0, 1);
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.hypot(px - cx, py - cy);
  }

  function getPlanetGeometry() {
    const radius = W * 0.74;
    const cx = W * 0.5;
    const cy = H + radius - W * 0.19;
    return { cx, cy, radius };
  }

  function getTitleOrbGeometry() {
    return {
      cx: W * 0.5,
      cy: H * 0.49,
      r: W * 0.355
    };
  }

  function resolveTierLocally(pct, tiers) {
    const sorted = [...tiers].sort((a, b) => b.minPct - a.minPct);
    for (const t of sorted) {
      if (pct >= t.minPct) return t;
    }
    return sorted[sorted.length - 1] || { label: "Below 40%", amount: 0 };
  }

  async function fetchServerConfig() {
    if (global.location.protocol === "file:") return;
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      serverConfig = {
        durationSeconds: data.durationSeconds || 45,
        targetScore: data.targetScore || 95,
        maxMistakes: typeof data.maxMistakes === "number" ? data.maxMistakes : 2,
        rewardTiers: Array.isArray(data.rewardTiers) ? data.rewardTiers : DEFAULT_TIERS,
        walletTotalCredited: Number(data.walletTotalCredited || 0)
      };
      syncTitleConfigUI();
    } catch (_) {}
  }

  function syncTitleConfigUI() {
    walletTotalValEl.textContent = `₹${serverConfig.walletTotalCredited}`;
    const totalShields = serverConfig.maxMistakes + 1;
    shieldLegendTextEl.textContent = `${totalShields} Shield${totalShields === 1 ? "" : "s"}`;
    const kicker = document.querySelector(".title-kicker");
    if (kicker) {
      kicker.textContent = `${serverConfig.durationSeconds}s SKILL CHALLENGE`;
    }
  }

  async function requestNewSession() {
    if (global.location.protocol === "file:") {
      return null;
    }
    try {
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      if (!res.ok) return null;
      const data = await res.json();
      serverConfig.durationSeconds = data.durationSeconds;
      serverConfig.targetScore = data.targetScore;
      serverConfig.maxMistakes = data.maxMistakes;
      serverConfig.rewardTiers = data.rewardTiers || serverConfig.rewardTiers;
      return data;
    } catch (_) {
      return null;
    }
  }

  async function submitGameResult(outcome) {
    if (sessionFinalized) return;
    sessionFinalized = true;

    const targetScore = activeSession ? activeSession.targetScore : serverConfig.targetScore;
    const tiers = activeSession ? activeSession.rewardTiers : serverConfig.rewardTiers;
    const localPct = clamp(Math.round((score / targetScore) * 100), 0, 100);
    const localTier = resolveTierLocally(localPct, tiers);

    // Show immediate local calculation while awaiting backend validation
    finalScoreEl.textContent = `${score}/${targetScore}`;
    finalPctEl.textContent = `${localPct}%`;
    finalRewardEl.textContent = outcome === "won" ? `₹${localTier.amount}` : "₹0";
    finalTierEl.textContent = outcome === "won" ? localTier.label : "No Reward (Lost)";
    finalGameIdEl.textContent = activeSession ? `${activeSession.gameId.slice(0, 12)}…` : "OFFLINE";
    finalVerifiedEl.textContent = activeSession ? "Validating..." : "Offline Preview";

    if (!activeSession) {
      return;
    }

    try {
      const res = await fetch("/api/game/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: activeSession.gameId,
          startToken: activeSession.startToken,
          outcome,
          lossReason,
          clientScore: score,
          telemetry: {
            mistakes,
            hitSkull,
            slices: telemetrySlices
          }
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        finalVerifiedEl.textContent = data.error || "Rejected";
        finalRewardEl.textContent = "₹0";
        return;
      }

      serverConfig.walletTotalCredited = Number(data.walletTotalCredited || serverConfig.walletTotalCredited);
      syncTitleConfigUI();

      finalScoreEl.textContent = `${data.validatedScore}/${data.targetScore}`;
      finalPctEl.textContent = `${data.percentage}%`;
      finalRewardEl.textContent = `₹${data.rewardAmount}`;
      finalTierEl.textContent = data.tierLabel;
      finalGameIdEl.textContent = data.gameId;
      finalVerifiedEl.textContent = data.verified ? "Verified & Credited" : "Flagged";

      if (data.outcome === "flagged") {
        outcomeBadgeEl.textContent = "ANTI-CHEAT BLOCKED";
        outcomeBadgeEl.classList.remove("won");
        resultTitleEl.textContent = "Score Rejected";
        lostReasonEl.textContent = data.lossReason;
      }
    } catch (_) {
      finalVerifiedEl.textContent = "Server Unreachable";
    }
  }

  function renderShieldPips() {
    const maxMistakes = activeSession ? activeSession.maxMistakes : serverConfig.maxMistakes;
    const totalShields = maxMistakes + 1;
    const remaining = Math.max(0, totalShields - mistakes);
    shieldsPillEl.innerHTML = "";
    for (let i = 0; i < totalShields; i++) {
      const pip = document.createElement("span");
      pip.className = i < remaining ? "shield-pip" : "shield-pip broken";
      shieldsPillEl.appendChild(pip);
    }
  }

  function syncHud() {
    const targetScore = activeSession ? activeSession.targetScore : serverConfig.targetScore;
    const tiers = activeSession ? activeSession.rewardTiers : serverConfig.rewardTiers;
    const pct = clamp(Math.round((score / targetScore) * 100), 0, 100);
    const tier = resolveTierLocally(pct, tiers);

    scoreValEl.textContent = String(score);
    perfValEl.textContent = `${pct}%`;
    liveTierChipEl.textContent = `₹${tier.amount}`;

    const secs = Math.max(0, Math.ceil(roundRemaining));
    timerPillEl.textContent = `${secs}s`;
    timerPillEl.classList.toggle("urgent", secs <= 10);
    renderShieldPips();
  }

  function setState(nextState) {
    state = nextState;
    titleOverlay.classList.toggle("hidden", state !== "title");
    gameoverOverlay.classList.toggle("hidden", state !== "gameover");
    hudEl.classList.toggle("dimmed", state !== "playing");
    syncHud();
  }

  function initStars() {
    stars = [];
    for (let i = 0; i < 42; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.88,
        size: rand(1.1, 2.8),
        cross: Math.random() < 0.32,
        phase: rand(0, Math.PI * 2),
        speed: rand(1.2, 3.2)
      });
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(300, rect.width);
    H = Math.max(480, rect.height);
    DPR = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  async function startRun() {
    activeSession = await requestNewSession();
    sessionFinalized = false;
    telemetrySlices = [];
    runStartPerfMs = performance.now();
    lastSlicePerfMs = -9999;

    score = 0;
    slicedCount = 0;
    mistakes = 0;
    hitSkull = false;
    wave = 1;
    roundRemaining = activeSession ? activeSession.durationSeconds : serverConfig.durationSeconds;
    spawnTimer = 0.45;
    slowMoTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    lastOutcome = "lost";
    entities = [];
    particles = [];
    shards = [];
    popups = [];
    shakeTime = 0;
    impactTimer = 0;
    impactIsSkull = false;
    setState("playing");
  }

  function resetToTitle() {
    titleCometSliced = false;
    titleTransition = 0;
    entities = [];
    particles = [];
    shards = [];
    popups = [];
    bgMeteors = [];
    setState("title");
    fetchServerConfig();
  }

  function triggerLoss(x, y, isSkull, reasonText) {
    if (state !== "playing") return;
    lastOutcome = "lost";
    impactIsSkull = isSkull;
    impactPoint = { x, y };
    lossReason = reasonText;
    impactTimer = 0.92;
    shakeTime = 0.55;
    shakeMag = isSkull ? 14 : 18;
    audio.playExplosion(isSkull);

    const burstColor = isSkull ? "#ff7c2b" : "#ffd27d";
    for (let i = 0; i < 40; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(80, 380);
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (isSkull ? 0 : 80),
        r: rand(2.5, 8),
        life: rand(0.4, 0.9),
        maxLife: 0.9,
        color: i % 2 === 0 ? "#ffffff" : burstColor
      });
    }

    if (score > bestScore) {
      bestScore = score;
      saveBestScore(bestScore);
    }

    setState("impact");
  }

  function triggerVictory() {
    if (state !== "playing") return;
    lastOutcome = "won";
    lossReason = "Moon defended through all 5 waves!";
    audio.playStartBurst();

    // Dissolve remaining entities cleanly into celebratory sparks
    for (const ent of entities) {
      for (let i = 0; i < 8; i++) {
        const ang = rand(0, Math.PI * 2);
        const spd = rand(40, 180);
        particles.push({
          x: ent.x,
          y: ent.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: rand(2, 4.5),
          life: 0.45,
          maxLife: 0.45,
          color: "#9ef8ff"
        });
      }
    }
    entities = [];

    if (score > bestScore) {
      bestScore = score;
      saveBestScore(bestScore);
    }

    presentResultScreen("won");
  }

  function presentResultScreen(outcome) {
    if (outcome === "won") {
      outcomeBadgeEl.textContent = "CHALLENGE COMPLETE";
      outcomeBadgeEl.classList.add("won");
      resultTitleEl.textContent = "Moon Defended!";
    } else {
      outcomeBadgeEl.textContent = "ROUND LOST";
      outcomeBadgeEl.classList.remove("won");
      resultTitleEl.textContent = "You lost!";
    }
    lostReasonEl.textContent = lossReason;
    setState("gameover");
    submitGameResult(outcome);
  }

  function createEntity(type, x, y, targetX, speed, opts = {}) {
    const dx = targetX - x;
    const dy = H * 0.85 - y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      type,
      x,
      y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      r: type === "skull" ? W * 0.066 : type === "star" ? W * 0.052 : rand(W * 0.048, W * 0.06),
      rot: rand(0, Math.PI * 2),
      rotSpeed: rand(-2.8, 2.8),
      craterSeed: rand(0, 100),
      weaveAmp: opts.weaveAmp || 0,
      weaveFreq: opts.weaveFreq || 0,
      diveBoost: Boolean(opts.diveBoost),
      boosted: false,
      sliced: false
    };
  }

  function spawnWaveEntities() {
    const duration = activeSession ? activeSession.durationSeconds : serverConfig.durationSeconds;
    const elapsed = duration - roundRemaining;
    const progress = clamp(elapsed / duration, 0, 1);

    wave = Math.min(5, 1 + Math.floor(progress * 5));
    const speedScale = 1.0 + progress * 0.88;

    // Choose unpredictable obstacle pattern unlocked by wave
    const patterns = ["standard"];
    if (wave >= 2) patterns.push("crossfire", "sine_weave");
    if (wave >= 3) patterns.push("dive_boost", "skull_escort");
    if (wave >= 4) patterns.push("meteor_storm");

    const pattern = patterns[Math.floor(Math.random() * patterns.length)];

    if (pattern === "crossfire") {
      const speed = rand(215, 265) * speedScale;
      entities.push(createEntity("comet", W * 0.14, -40, W * 0.8, speed));
      entities.push(createEntity("comet", W * 0.86, -72, W * 0.2, speed));
      if (Math.random() < 0.55) {
        entities.push(createEntity("skull", W * 0.5, -55, W * 0.5, speed * 1.02));
      }
      return;
    }

    if (pattern === "sine_weave") {
      const count = wave >= 4 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const isSkull = i === count - 1 && Math.random() < 0.45;
        const x = rand(W * 0.22, W * 0.78);
        entities.push(
          createEntity(isSkull ? "skull" : "comet", x, -45 - i * 60, x, rand(195, 250) * speedScale, {
            weaveAmp: rand(65, 115),
            weaveFreq: rand(4.2, 6.2)
          })
        );
      }
      return;
    }

    if (pattern === "dive_boost") {
      const x1 = rand(W * 0.18, W * 0.82);
      const x2 = clamp(x1 + (x1 > W * 0.5 ? -W * 0.34 : W * 0.34), W * 0.15, W * 0.85);
      entities.push(
        createEntity("comet", x1, -40, rand(W * 0.2, W * 0.8), 165 * speedScale, { diveBoost: true })
      );
      entities.push(
        createEntity("comet", x2, -85, rand(W * 0.2, W * 0.8), 180 * speedScale, { diveBoost: true })
      );
      return;
    }

    if (pattern === "skull_escort") {
      const cx = rand(W * 0.26, W * 0.74);
      const speed = rand(210, 255) * speedScale;
      entities.push(createEntity("comet", cx, -50, cx + rand(-30, 30), speed));
      entities.push(createEntity("skull", cx - W * 0.15, -62, cx - W * 0.14, speed * 1.03));
      entities.push(createEntity("skull", cx + W * 0.15, -62, cx + W * 0.14, speed * 1.03));
      return;
    }

    if (pattern === "meteor_storm") {
      const lanes = [0.16, 0.38, 0.62, 0.84].sort(() => Math.random() - 0.5);
      for (let i = 0; i < 3; i++) {
        const x = W * lanes[i];
        entities.push(
          createEntity("comet", x, -40 - i * 44, clamp(x + rand(-60, 60), W * 0.15, W * 0.85), rand(225, 285) * speedScale)
        );
      }
      if (Math.random() < 0.7) {
        entities.push(
          createEntity("skull", W * lanes[3], -70, W * 0.5, rand(220, 270) * speedScale, {
            weaveAmp: 55,
            weaveFreq: 5.0
          })
        );
      }
      return;
    }

    // Standard wave mix
    const count = wave >= 3 ? 2 : Math.random() < 0.45 ? 2 : 1;
    const usedX = [];
    for (let i = 0; i < count; i++) {
      let type = "comet";
      const skullChance = clamp(0.18 + wave * 0.04, 0.18, 0.36);
      if (i > 0 || Math.random() < 0.45) {
        if (Math.random() < skullChance) type = "skull";
      }
      if (type === "comet" && wave >= 2 && Math.random() < 0.07) {
        type = "star";
      }

      let x = rand(W * 0.14, W * 0.86);
      for (let tries = 0; tries < 5; tries++) {
        if (usedX.every((ux) => Math.abs(ux - x) > W * 0.17)) break;
        x = rand(W * 0.14, W * 0.86);
      }
      usedX.push(x);

      const targetX = clamp(x + rand(-W * 0.24, W * 0.24), W * 0.14, W * 0.86);
      const speed = rand(185, 245) * speedScale;
      entities.push(createEntity(type, x, -42 - i * 48, targetX, speed));
    }
  }

  function spawnSliceExplosion(ent, cutAngle) {
    const isStar = ent.type === "star";
    const mainColor = isStar ? "#8ef6ff" : "#fff7e0";
    const glowColor = isStar ? "#38b6ff" : "#ff73d0";

    const perp = cutAngle + Math.PI * 0.5;
    for (let side = -1; side <= 1; side += 2) {
      const speed = rand(110, 190);
      shards.push({
        x: ent.x + Math.cos(perp) * side * 6,
        y: ent.y + Math.sin(perp) * side * 6,
        vx: ent.vx * 0.35 + Math.cos(perp) * side * speed,
        vy: ent.vy * 0.25 + Math.sin(perp) * side * speed - 45,
        r: ent.r * 0.72,
        rot: cutAngle + (side > 0 ? 0 : Math.PI),
        rotSpeed: side * rand(4, 8),
        life: 0.55,
        maxLife: 0.55,
        color: isStar ? "#b5fbff" : "#fff9eb"
      });
    }

    for (let i = 0; i < 18; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(60, 290);
      particles.push({
        x: ent.x,
        y: ent.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: rand(2, 5.5),
        life: rand(0.28, 0.58),
        maxLife: 0.58,
        color: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? mainColor : glowColor
      });
    }
  }

  function addPopup(x, y, text, color = "#ffffff") {
    popups.push({
      x: clamp(x, 60, W - 60),
      y: clamp(y, 82, H - 145),
      text,
      color,
      life: 0.75,
      maxLife: 0.75
    });
  }

  function checkSliceSegment(ax, ay, bx, by) {
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 2) return;

    if (segLen > 14) {
      audio.playWhoosh(clamp(segLen / 55, 0.2, 1));
    }

    if (state === "title" && !titleCometSliced) {
      const orb = getTitleOrbGeometry();
      const d = distPointToSegment(orb.cx, orb.cy, ax, ay, bx, by);
      if (d <= orb.r * 0.55) {
        triggerTitleStart(Math.atan2(by - ay, bx - ax));
      }
      return;
    }

    if (state !== "playing") return;

    const cutAngle = Math.atan2(by - ay, bx - ax);

    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      if (ent.sliced) continue;

      const hitRadius = ent.type === "skull" ? ent.r * 0.85 : ent.r * 1.18;
      const dist = distPointToSegment(ent.x, ent.y, ax, ay, bx, by);

      if (dist <= hitRadius) {
        ent.sliced = true;

        if (ent.type === "skull") {
          hitSkull = true;
          triggerLoss(ent.x, ent.y, true, "You sliced a Skull Hazard!");
          return;
        }

        entities.splice(i, 1);
        slicedCount += 1;

        const nowPerf = performance.now();
        const tMs = Math.max(0, Math.round(nowPerf - runStartPerfMs));
        const withinCombo = nowPerf - lastSlicePerfMs <= 340;
        comboCount = withinCombo ? Math.min(4, comboCount + 1) : 1;
        comboTimer = 0.34;
        lastSlicePerfMs = nowPerf;

        if (ent.type === "star") {
          const pts = 5;
          score += pts;
          slowMoTimer = 2.6;
          telemetrySlices.push({ tMs, type: "star", combo: 1, highIntercept: false });
          audio.playStarBonus();
          spawnSliceExplosion(ent, cutAngle);
          addPopup(ent.x, ent.y, `+${pts} SLOW-MO!`, "#8cf6ff");
        } else {
          const highIntercept = ent.y < H * 0.45;
          const pts = comboCount + (highIntercept ? 1 : 0);
          score += pts;
          telemetrySlices.push({ tMs, type: "comet", combo: comboCount, highIntercept });
          audio.playSlice(comboCount);
          spawnSliceExplosion(ent, cutAngle);

          if (comboCount >= 2) {
            addPopup(ent.x, ent.y, `+${pts} COMBO x${comboCount}!`, "#ffd670");
          } else if (highIntercept) {
            addPopup(ent.x, ent.y, `+${pts} HIGH CUT!`, "#b8f1ff");
          } else {
            addPopup(ent.x, ent.y, "+1", "#ffffff");
          }
        }

        if (score > bestScore) {
          bestScore = score;
          saveBestScore(bestScore);
        }
        syncHud();
      }
    }
  }

  function triggerTitleStart(cutAngle) {
    if (titleCometSliced) return;
    titleCometSliced = true;
    titleTransition = 0.38;
    audio.playStartBurst();

    const orb = getTitleOrbGeometry();
    spawnSliceExplosion(
      { type: "comet", x: orb.cx, y: orb.cy, vx: 0, vy: 0, r: W * 0.095 },
      cutAngle
    );
  }

  // Modal helpers
  async function openInfoModal() {
    infoModal.classList.remove("hidden");
    modalDurationEl.textContent = `${serverConfig.durationSeconds}s`;
    modalMistakesEl.textContent = String(serverConfig.maxMistakes);
    modalTargetEl.textContent = String(serverConfig.targetScore);

    modalTierListEl.innerHTML = "";
    for (const tier of serverConfig.rewardTiers) {
      const div = document.createElement("div");
      div.className = "tier-item";
      div.innerHTML = `<span>${tier.label} score</span><strong>₹${tier.amount}</strong>`;
      modalTierListEl.appendChild(div);
    }

    modalHistoryListEl.innerHTML = `<div class="history-item"><span>Loading history...</span></div>`;
    if (global.location.protocol === "file:") {
      modalHistoryListEl.innerHTML = `<div class="history-item"><span>Run via http://localhost:8765 to view persistent backend history.</span></div>`;
      return;
    }

    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      const data = await res.json();
      modalHistoryListEl.innerHTML = "";
      if (!data.recent || data.recent.length === 0) {
        modalHistoryListEl.innerHTML = `<div class="history-item"><span>No completed games recorded yet.</span></div>`;
        return;
      }
      for (const item of data.recent.slice(0, 10)) {
        const div = document.createElement("div");
        div.className = "history-item";
        const tag = item.outcome === "won" ? "WON" : item.outcome === "flagged" ? "BLOCKED" : "LOST";
        div.innerHTML = `
          <div>
            <strong>${tag} • ${item.percentage}% (${item.validatedScore}/${item.targetScore})</strong>
            <small>ID: ${item.gameId.slice(0, 10)}… • Mistakes: ${item.mistakes}/${item.maxMistakes}</small>
          </div>
          <strong style="color:${item.rewardAmount > 0 ? "#4ade80" : "#bfb0de"}">₹${item.rewardAmount}</strong>
        `;
        modalHistoryListEl.appendChild(div);
      }
    } catch (_) {
      modalHistoryListEl.innerHTML = `<div class="history-item"><span>Could not load history.</span></div>`;
    }
  }

  openInfoBtn.addEventListener("click", openInfoModal);
  resultHistoryBtn.addEventListener("click", openInfoModal);
  closeInfoBtn.addEventListener("click", () => infoModal.classList.add("hidden"));
  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) infoModal.classList.add("hidden");
  });

  // Pointer input handling
  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
  }

  function pushTrailPoint(x, y) {
    pointer.trail.push({ x, y, t: performance.now() });
    if (pointer.trail.length > 22) {
      pointer.trail.shift();
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!infoModal.classList.contains("hidden")) return;
    canvas.setPointerCapture(e.pointerId);
    audio.ensureContext();
    const pos = getCanvasCoords(e);
    pointer.active = true;
    pointer.x = pos.x;
    pointer.y = pos.y;
    pointer.prevX = pos.x;
    pointer.prevY = pos.y;
    pointer.trail = [];
    pushTrailPoint(pos.x, pos.y);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointer.active) return;
    const pos = getCanvasCoords(e);
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
    pointer.x = pos.x;
    pointer.y = pos.y;
    pushTrailPoint(pos.x, pos.y);
    checkSliceSegment(pointer.prevX, pointer.prevY, pointer.x, pointer.y);
  });

  function endPointer(e) {
    if (!pointer.active) return;
    if (state === "title" && !titleCometSliced && pointer.trail.length <= 3) {
      const orb = getTitleOrbGeometry();
      if (Math.hypot(pointer.x - orb.cx, pointer.y - orb.cy) <= orb.r * 0.95) {
        triggerTitleStart(-Math.PI * 0.25);
      }
    }
    pointer.active = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  soundBtn.addEventListener("click", () => {
    const nextMuted = !audio.isMuted();
    audio.setMuted(nextMuted);
    soundOnIcon.classList.toggle("hidden", nextMuted);
    soundOffIcon.classList.toggle("hidden", !nextMuted);
    if (!nextMuted) audio.playClick();
  });

  continueBtn.addEventListener("click", () => {
    audio.playClick();
    startRun();
  });

  global.addEventListener("keydown", (e) => {
    if (!infoModal.classList.contains("hidden")) {
      if (e.code === "Escape") infoModal.classList.add("hidden");
      return;
    }
    if (e.code === "Space" || e.code === "Enter") {
      if (state === "title" && !titleCometSliced) {
        triggerTitleStart(-Math.PI * 0.25);
      } else if (state === "gameover") {
        audio.playClick();
        startRun();
      }
    }
  });

  // Update simulation
  function update(dt) {
    time += dt;

    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
    }

    const nowMs = performance.now();
    while (pointer.trail.length > 0 && nowMs - pointer.trail[0].t > 135) {
      pointer.trail.shift();
    }

    if (state === "title") {
      if (Math.random() < dt * 0.9 && bgMeteors.length < 3) {
        const fromRight = Math.random() < 0.7;
        bgMeteors.push({
          x: fromRight ? rand(W * 0.35, W * 1.05) : rand(-30, W * 0.4),
          y: -25,
          vx: fromRight ? -rand(130, 210) : rand(100, 170),
          vy: rand(140, 220),
          len: rand(42, 74),
          r: rand(3.5, 5.5)
        });
      }
      for (let i = bgMeteors.length - 1; i >= 0; i--) {
        const m = bgMeteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y > H + 80 || m.x < -100 || m.x > W + 100) {
          bgMeteors.splice(i, 1);
        }
      }

      if (titleCometSliced) {
        titleTransition -= dt;
        if (titleTransition <= 0) {
          startRun();
        }
      }
    }

    if (state === "playing") {
      const prevTimer = Math.ceil(roundRemaining);
      roundRemaining = Math.max(0, roundRemaining - dt);
      if (Math.ceil(roundRemaining) !== prevTimer) {
        syncHud();
      }

      if (roundRemaining <= 0) {
        triggerVictory();
        return;
      }

      if (comboTimer > 0) {
        comboTimer = Math.max(0, comboTimer - dt);
        if (comboTimer === 0) comboCount = 0;
      }

      if (slowMoTimer > 0) {
        slowMoTimer = Math.max(0, slowMoTimer - dt);
      }

      const timeScale = slowMoTimer > 0 ? 0.5 : 1.0;
      const duration = activeSession ? activeSession.durationSeconds : serverConfig.durationSeconds;
      const progress = clamp((duration - roundRemaining) / duration, 0, 1);

      spawnTimer -= dt * timeScale;
      if (spawnTimer <= 0) {
        spawnWaveEntities();
        const interval = clamp(1.16 - progress * 0.68, 0.44, 1.16);
        spawnTimer = rand(interval * 0.8, interval * 1.15);
      }

      const planet = getPlanetGeometry();
      const maxMistakes = activeSession ? activeSession.maxMistakes : serverConfig.maxMistakes;

      for (let i = entities.length - 1; i >= 0; i--) {
        const ent = entities[i];

        // Dive-boost acceleration mid-sky
        if (ent.diveBoost && !ent.boosted && ent.y > H * 0.27) {
          ent.boosted = true;
          ent.vx *= 1.3;
          ent.vy *= 1.65;
        }

        const weaveVx = ent.weaveAmp
          ? Math.cos(time * ent.weaveFreq + ent.craterSeed) * ent.weaveAmp
          : 0;

        ent.x = clamp(ent.x + (ent.vx + weaveVx) * dt * timeScale, ent.r * 1.1, W - ent.r * 1.1);
        ent.y += ent.vy * dt * timeScale;
        ent.rot += ent.rotSpeed * dt;

        if (ent.type === "comet") {
          const distToPlanet = Math.hypot(ent.x - planet.cx, ent.y - planet.cy);
          if (distToPlanet <= planet.radius + ent.r * 0.65) {
            entities.splice(i, 1);
            mistakes += 1;
            syncHud();

            if (mistakes > maxMistakes) {
              triggerLoss(ent.x, ent.y, false, "Moon shields shattered! Exceeded allowed mistakes.");
              return;
            } else {
              shakeTime = 0.28;
              shakeMag = 10;
              audio.playExplosion(false);
              const shieldsLeft = maxMistakes + 1 - mistakes;
              addPopup(ent.x, ent.y - 26, `SHIELD HIT! (${shieldsLeft} left)`, "#ff8a70");
              for (let p = 0; p < 14; p++) {
                const ang = rand(Math.PI, Math.PI * 2);
                const spd = rand(60, 210);
                particles.push({
                  x: ent.x,
                  y: ent.y,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  r: rand(2, 5),
                  life: 0.45,
                  maxLife: 0.45,
                  color: p % 2 === 0 ? "#ffd27d" : "#ff6f59"
                });
              }
              continue;
            }
          }
        }

        if (ent.y > H + 110) {
          entities.splice(i, 1);
        }
      }
    }

    if (state === "impact") {
      impactTimer -= dt;
      if (impactTimer <= 0) {
        presentResultScreen("lost");
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 320 * dt;
      s.rot += s.rotSpeed * dt;
      s.life -= dt;
      if (s.life <= 0) shards.splice(i, 1);
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      const pop = popups[i];
      pop.y -= 44 * dt;
      pop.life -= dt;
      if (pop.life <= 0) popups.splice(i, 1);
    }
  }

  // Drawing helpers
  function drawStarCross(x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(x, y - size * 1.9);
    ctx.quadraticCurveTo(x, y, x + size * 1.9, y);
    ctx.quadraticCurveTo(x, y, x, y + size * 1.9);
    ctx.quadraticCurveTo(x, y, x - size * 1.9, y);
    ctx.quadraticCurveTo(x, y, x, y - size * 1.9);
    ctx.fill();
    ctx.restore();
  }

  function drawStars(tintAlpha = 1) {
    for (const s of stars) {
      const twinkle = 0.38 + 0.62 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
      const sx = s.x * W;
      const sy = s.y * H;
      if (s.cross) {
        drawStarCross(sx, sy, s.size, twinkle * tintAlpha);
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${(twinkle * 0.75 * tintAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawComet(x, y, r, vx, vy, rot, tailScale = 1, danger = 0, boosted = false) {
    const speed = Math.hypot(vx, vy) || 1;
    const angle = Math.atan2(-vy / speed, -vx / speed);
    const tailLen = r * 5.2 * tailScale * (boosted ? 1.35 : 1);

    ctx.save();
    ctx.translate(x, y);

    if (danger > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 102, 82, ${(0.55 * danger).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.38 + 0.14 * Math.sin(time * 18)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(angle);

    const outerGrad = ctx.createLinearGradient(0, 0, tailLen, 0);
    outerGrad.addColorStop(0, boosted ? "rgba(255, 120, 60, 0.96)" : "rgba(255, 162, 74, 0.92)");
    outerGrad.addColorStop(0.35, "rgba(255, 79, 200, 0.72)");
    outerGrad.addColorStop(0.72, "rgba(116, 44, 214, 0.35)");
    outerGrad.addColorStop(1, "rgba(76, 22, 160, 0)");

    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.18, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(tailLen, 0);
    ctx.closePath();
    ctx.fill();

    const innerGrad = ctx.createLinearGradient(0, 0, tailLen * 0.55, 0);
    innerGrad.addColorStop(0, "rgba(255, 245, 190, 0.95)");
    innerGrad.addColorStop(0.45, "rgba(255, 152, 84, 0.55)");
    innerGrad.addColorStop(1, "rgba(255, 92, 196, 0)");
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(tailLen * 0.58, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.rotate(rot);
    const headGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
    headGrad.addColorStop(0, "#ffffff");
    headGrad.addColorStop(0.7, "#fff9ea");
    headGrad.addColorStop(1, "#f2dec4");

    ctx.shadowColor = boosted ? "rgba(255, 130, 80, 0.95)" : "rgba(255, 214, 155, 0.85)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(182, 174, 196, 0.36)";
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.18, r * 0.24, 0, Math.PI * 2);
    ctx.arc(r * 0.3, r * 0.22, r * 0.19, 0, Math.PI * 2);
    ctx.arc(-r * 0.05, r * 0.42, r * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawSkullHazard(ent) {
    const { x, y, r } = ent;
    ctx.save();
    ctx.translate(x, y);

    const flameGrad = ctx.createLinearGradient(0, -r * 1.75, 0, r * 1.25);
    flameGrad.addColorStop(0, "#fff275");
    flameGrad.addColorStop(0.45, "#ffa73b");
    flameGrad.addColorStop(1, "#ff6b2b");

    ctx.fillStyle = flameGrad;
    ctx.shadowColor = "rgba(255, 130, 36, 0.65)";
    ctx.shadowBlur = 16;

    ctx.beginPath();
    const lobes = 14;
    for (let i = 0; i <= lobes; i++) {
      const a = (i / lobes) * Math.PI * 2;
      const topStretch = Math.sin(a) < 0 ? 1.55 - Math.sin(a) * 0.35 : 1.15;
      const wobble =
        1 +
        0.13 * Math.sin(a * 4 + time * 11 + ent.craterSeed) +
        0.08 * Math.cos(a * 3 - time * 8);
      const rx = Math.cos(a) * r * 1.25 * wobble;
      const ry = Math.sin(a) * r * topStretch * wobble - r * 0.14;
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#16112b";
    ctx.beginPath();
    ctx.arc(0, -r * 0.08, r * 0.74, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(r * 0.46, r * 0.38);
    ctx.lineTo(r * 0.36, r * 0.66);
    ctx.lineTo(r * 0.22, r * 0.66);
    ctx.lineTo(r * 0.22, r * 0.48);
    ctx.lineTo(r * 0.12, r * 0.48);
    ctx.lineTo(r * 0.12, r * 0.66);
    ctx.lineTo(0, r * 0.66);
    ctx.lineTo(0, r * 0.48);
    ctx.lineTo(-r * 0.12, r * 0.48);
    ctx.lineTo(-r * 0.12, r * 0.66);
    ctx.lineTo(-r * 0.22, r * 0.66);
    ctx.lineTo(-r * 0.22, r * 0.48);
    ctx.lineTo(-r * 0.36, r * 0.66);
    ctx.lineTo(-r * 0.46, r * 0.38);
    ctx.closePath();
    ctx.fill();

    const eyeGrad = ctx.createLinearGradient(0, -r * 0.1, 0, r * 0.18);
    eyeGrad.addColorStop(0, "#ffe47a");
    eyeGrad.addColorStop(0.55, "#ff5b2e");
    eyeGrad.addColorStop(1, "#d9162a");

    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.moveTo(-r * 0.48, -r * 0.14);
    ctx.lineTo(-r * 0.1, r * 0.02);
    ctx.lineTo(-r * 0.22, r * 0.16);
    ctx.lineTo(-r * 0.46, r * 0.08);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(r * 0.48, -r * 0.14);
    ctx.lineTo(r * 0.1, r * 0.02);
    ctx.lineTo(r * 0.22, r * 0.16);
    ctx.lineTo(r * 0.46, r * 0.08);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ff7847";
    ctx.beginPath();
    ctx.moveTo(0, r * 0.16);
    ctx.lineTo(r * 0.08, r * 0.3);
    ctx.lineTo(-r * 0.08, r * 0.3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawStarCrystal(ent) {
    const { x, y, r, rot } = ent;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.shadowColor = "rgba(105, 240, 255, 0.9)";
    ctx.shadowBlur = 18;
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.55, "#8ef6ff");
    grad.addColorStop(1, "#2cb1ff");

    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * 1.15 : r * 0.44;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlanet(shattered = false) {
    const { cx, cy, radius } = getPlanetGeometry();

    if (!shattered) {
      const mx = W * 0.9;
      const my = H - W * 0.21;
      const mr = W * 0.038;
      const moonGrad = ctx.createLinearGradient(mx, my - mr, mx, my + mr);
      moonGrad.addColorStop(0, "#ffffff");
      moonGrad.addColorStop(1, "#b498ff");
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const bodyGrad = ctx.createLinearGradient(cx, cy - radius, cx, H);
    if (shattered) {
      bodyGrad.addColorStop(0, "#9d9ea8");
      bodyGrad.addColorStop(0.55, "#74757f");
      bodyGrad.addColorStop(1, "#55565f");
    } else {
      bodyGrad.addColorStop(0, "#aa78ff");
      bodyGrad.addColorStop(0.5, "#8b52ef");
      bodyGrad.addColorStop(1, "#6631c9");
    }

    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, cy - radius - 10, W, radius + 30);

    ctx.fillStyle = shattered ? "#5f6069" : "#6734c4";
    ctx.beginPath();
    ctx.ellipse(W * 0.34, H - W * 0.145, W * 0.14, W * 0.036, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shattered ? "#8e8f99" : "#9c6cf7";
    ctx.beginPath();
    ctx.ellipse(W * 0.345, H - W * 0.14, W * 0.125, W * 0.025, -0.15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = shattered ? "#6a6b75" : "#7e44e3";
    ctx.beginPath();
    ctx.moveTo(W * 0.54, H - W * 0.11);
    ctx.quadraticCurveTo(W * 0.72, H - W * 0.16, W * 0.78, H - W * 0.13);
    ctx.quadraticCurveTo(W * 0.9, H - W * 0.07, W * 0.78, H - W * 0.04);
    ctx.quadraticCurveTo(W * 0.62, H - W * 0.04, W * 0.54, H - W * 0.11);
    ctx.fill();

    ctx.fillStyle = shattered ? "#9a9ba6" : "#b387ff";
    ctx.beginPath();
    ctx.moveTo(W * 0.69, H - W * 0.13);
    ctx.quadraticCurveTo(W * 0.75, H - W * 0.155, W * 0.785, H - W * 0.142);
    ctx.quadraticCurveTo(W * 0.76, H - W * 0.115, W * 0.69, H - W * 0.13);
    ctx.fill();

    // Progressive cracks per mistake + full fracture on shatter
    if (mistakes > 0 || shattered) {
      ctx.strokeStyle = shattered ? "#484952" : "rgba(56, 22, 108, 0.75)";
      ctx.lineWidth = shattered ? 4.5 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(W * 0.12, H - W * 0.03);
      ctx.lineTo(W * 0.24, H - W * 0.08);
      ctx.lineTo(W * 0.34, H - W * 0.05);
      if (mistakes >= 2 || shattered) {
        ctx.lineTo(W * 0.48, H - W * 0.105);
        ctx.lineTo(W * 0.6, H - W * 0.06);
      }
      if (shattered) {
        ctx.lineTo(W * 0.74, H - W * 0.095);
        ctx.lineTo(W * 0.92, H - W * 0.03);
      }
      ctx.stroke();
    }

    if (shattered) {
      const glow = ctx.createRadialGradient(
        impactPoint.x,
        impactPoint.y,
        4,
        impactPoint.x,
        impactPoint.y,
        W * 0.24
      );
      glow.addColorStop(0, "rgba(255, 240, 180, 0.95)");
      glow.addColorStop(0.45, "rgba(255, 138, 60, 0.65)");
      glow.addColorStop(1, "rgba(255, 120, 40, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, cy - radius - 10, W, radius + 30);
    }

    ctx.restore();
  }

  function drawBladeTrail() {
    const pts = pointer.trail;
    if (pts.length < 2) return;

    const leftSide = [];
    const rightSide = [];
    const nowMs = performance.now();

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const next = pts[Math.min(i + 1, pts.length - 1)];
      const prev = pts[Math.max(i - 1, 0)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const progress = i / (pts.length - 1);
      const ageFactor = clamp(1 - (nowMs - p.t) / 140, 0, 1);
      const halfWidth = Math.sin(progress * Math.PI * 0.78) * 10.5 * ageFactor;

      leftSide.push({ x: p.x + nx * halfWidth, y: p.y + ny * halfWidth });
      rightSide.push({ x: p.x - nx * halfWidth, y: p.y - ny * halfWidth });
    }

    ctx.save();
    ctx.shadowColor = "rgba(182, 238, 255, 0.95)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < leftSide.length; i++) {
      ctx.lineTo(leftSide[i].x, leftSide[i].y);
    }
    const tip = pts[pts.length - 1];
    ctx.lineTo(tip.x, tip.y);
    for (let i = rightSide.length - 1; i >= 1; i--) {
      ctx.lineTo(rightSide[i].x, rightSide[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderTitleScene() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#210948");
    bg.addColorStop(0.45, "#3b147c");
    bg.addColorStop(1, "#260a52");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const neb = ctx.createRadialGradient(W * 0.88, H * 0.14, 10, W * 0.88, H * 0.14, W * 0.52);
    neb.addColorStop(0, "rgba(148, 40, 255, 0.55)");
    neb.addColorStop(0.5, "rgba(110, 24, 210, 0.22)");
    neb.addColorStop(1, "rgba(40, 10, 88, 0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);

    drawStars(0.95);

    for (const m of bgMeteors) {
      drawComet(m.x, m.y, m.r, m.vx, m.vy, 0, 1.35, 0, false);
    }

    const orb = getTitleOrbGeometry();

    const aura = ctx.createRadialGradient(orb.cx, orb.cy, orb.r * 0.72, orb.cx, orb.cy, orb.r * 1.24);
    aura.addColorStop(0, "rgba(114, 34, 245, 0.7)");
    aura.addColorStop(0.65, "rgba(114, 34, 245, 0.22)");
    aura.addColorStop(1, "rgba(40, 10, 90, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(orb.cx, orb.cy, orb.r * 1.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#060711";
    ctx.beginPath();
    ctx.arc(orb.cx, orb.cy, orb.r, 0, Math.PI * 2);
    ctx.fill();

    drawStarCross(orb.cx + orb.r * 0.16, orb.cy - orb.r * 0.45, 2.2, 0.75);
    drawStarCross(orb.cx - orb.r * 0.45, orb.cy + orb.r * 0.3, 2.0, 0.7);

    if (!titleCometSliced) {
      const bobY = Math.sin(time * 2.3) * 4;
      const cx = orb.cx + 2;
      const cy = orb.cy + 4 + bobY;
      const headR = W * 0.068;

      for (let k = 1; k <= 3; k++) {
        ctx.strokeStyle = `rgba(255, 224, 156, ${(0.22 / k).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, headR * (1.28 + k * 0.34), 0, Math.PI * 2);
        ctx.stroke();
      }

      drawComet(cx, cy, headR, -1, 0.68, time * 0.2, 1.85, 0, false);
    }
  }

  function renderGameplayScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#2b0d59");
    sky.addColorStop(0.42, "#622bc2");
    sky.addColorStop(0.76, "#9c72f5");
    sky.addColorStop(1, "#d8c8ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (slowMoTimer > 0) {
      const alpha = clamp(slowMoTimer / 0.5, 0, 1) * 0.16;
      ctx.fillStyle = `rgba(72, 220, 255, ${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawStars(0.9);

    const planet = getPlanetGeometry();
    drawPlanet(state === "impact");

    for (const ent of entities) {
      if (ent.type === "comet") {
        const dist = Math.hypot(ent.x - planet.cx, ent.y - planet.cy) - planet.radius;
        const danger = clamp(1 - dist / (W * 0.24), 0, 1);
        drawComet(ent.x, ent.y, ent.r, ent.vx, ent.vy, ent.rot, 1.0, danger, ent.boosted);
      } else if (ent.type === "skull") {
        drawSkullHazard(ent);
      } else if (ent.type === "star") {
        drawStarCrystal(ent);
      }
    }

    if (state === "impact") {
      const elapsed = 0.92 - impactTimer;
      if (elapsed > 0.38) {
        const flashPhase = (elapsed - 0.38) / 0.54;
        const flashAlpha = Math.sin(clamp(flashPhase, 0, 1) * Math.PI);
        ctx.fillStyle = `rgba(255, 255, 255, ${(flashAlpha * 0.96).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function renderGameOverScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (lastOutcome === "won") {
      sky.addColorStop(0, "#231259");
      sky.addColorStop(0.55, "#5928b5");
      sky.addColorStop(1, "#a76bff");
    } else {
      sky.addColorStop(0, "#cf2e6e");
      sky.addColorStop(0.55, "#ee5464");
      sky.addColorStop(1, "#ff7c52");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    const beamGrad = ctx.createLinearGradient(0, 0, 0, H);
    beamGrad.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    beamGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(W * 0.2, 0);
    ctx.lineTo(W * 0.8, 0);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawStars(lastOutcome === "won" ? 0.9 : 0.42);

    if (lastOutcome === "won") {
      drawPlanet(false);
      return;
    }

    ctx.save();
    ctx.fillStyle = "rgba(255, 210, 206, 0.36)";
    ctx.beginPath();
    ctx.moveTo(W * 0.56, H * 0.84);
    ctx.bezierCurveTo(W * 0.22, H * 0.72, W * 0.36, H * 0.54, 0, H * 0.41);
    ctx.lineTo(0, H * 0.52);
    ctx.bezierCurveTo(W * 0.22, H * 0.62, W * 0.14, H * 0.75, W * 0.44, H * 0.86);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    function drawCloud(cx, cy, scale) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(255, 190, 128, 0.68)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 28, 10, 0, 0, Math.PI * 2);
      ctx.arc(-6, -2, 11, 0, Math.PI * 2);
      ctx.arc(8, -1, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawCloud(W * 0.62 + Math.sin(time * 0.4) * 5, H * 0.085, 1.0);
    drawCloud(W * 0.26 - Math.sin(time * 0.35) * 5, H * 0.48, 0.95);

    function drawPolyShard(cx, cy, scale, flip = 1) {
      ctx.save();
      ctx.translate(cx, cy + Math.sin(time * 1.7 + cx) * 6);
      ctx.scale(scale * flip, scale);
      ctx.fillStyle = "#ffcab8";
      ctx.beginPath();
      ctx.moveTo(-14, -26);
      ctx.lineTo(2, -18);
      ctx.lineTo(-2, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ec6b5c";
      ctx.beginPath();
      ctx.moveTo(2, -18);
      ctx.lineTo(15, -24);
      ctx.lineTo(-2, 28);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffe5dc";
      ctx.beginPath();
      ctx.moveTo(-14, -26);
      ctx.lineTo(-4, -33);
      ctx.lineTo(15, -24);
      ctx.lineTo(2, -18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    drawPolyShard(W * 0.2, H * 0.21, 1.05, 1);
    drawPolyShard(W * 0.81, H * 0.52, 0.9, -1);

    ctx.fillStyle = "#b83254";
    ctx.beginPath();
    ctx.moveTo(0, H * 0.92);
    ctx.lineTo(W * 0.44, H * 0.78);
    ctx.lineTo(W * 0.82, H * 0.88);
    ctx.lineTo(W, H * 0.85);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    const mtnGrad = ctx.createLinearGradient(W * 0.4, H * 0.7, W * 0.7, H);
    mtnGrad.addColorStop(0, "#5c27b8");
    mtnGrad.addColorStop(0.55, "#421c7c");
    mtnGrad.addColorStop(1, "#2a123f");
    ctx.fillStyle = mtnGrad;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.93);
    ctx.quadraticCurveTo(W * 0.52, H * 0.9, W * 0.79, H * 0.715);
    ctx.lineTo(W, H * 0.76);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
  }

  function renderEffectsAndTrail() {
    for (const s of shards) {
      ctx.save();
      ctx.globalAlpha = clamp(s.life / s.maxLife, 0, 1);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const pop of popups) {
      ctx.save();
      ctx.globalAlpha = clamp(pop.life / pop.maxLife, 0, 1);
      ctx.font = "800 17px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = pop.color;
      ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
      ctx.shadowBlur = 8;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

    drawBladeTrail();
  }

  function render() {
    ctx.save();
    if (shakeTime > 0) {
      const mag = shakeMag * (shakeTime / 0.55);
      ctx.translate(rand(-mag, mag), rand(-mag, mag));
    }

    if (state === "title") {
      renderTitleScene();
    } else if (state === "playing" || state === "impact") {
      renderGameplayScene();
    } else if (state === "gameover") {
      renderGameOverScene();
    }

    renderEffectsAndTrail();
    ctx.restore();
  }

  function loop(now) {
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    update(dt);
    render();
    global.requestAnimationFrame(loop);
  }

  // Boot
  initStars();
  resize();
  global.addEventListener("resize", resize);
  if (global.ResizeObserver) {
    new global.ResizeObserver(resize).observe(canvas);
  }
  resetToTitle();
  global.requestAnimationFrame(loop);
})(window);
