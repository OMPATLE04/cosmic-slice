(function (global) {
  "use strict";

  const TOKEN_KEY = "cosmic_slice_jwt_v1";
  const DEFAULT_ENTRY_OPTIONS = [10, 20, 50, 100, 200, 500];

  // Canvas & HUD DOM
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const hudEl = document.getElementById("hud");
  const scoreValEl = document.getElementById("scoreVal");
  const perfValEl = document.getElementById("perfVal");
  const liveModeChipEl = document.getElementById("liveModeChip");
  const oppHudPillEl = document.getElementById("oppHudPill");
  const oppHudNameEl = document.getElementById("oppHudName");
  const oppScoreValEl = document.getElementById("oppScoreVal");
  const shieldsPillEl = document.getElementById("shieldsPill");
  const timerPillEl = document.getElementById("timerPill");
  const soundBtn = document.getElementById("soundBtn");
  const soundOnIcon = document.getElementById("soundOnIcon");
  const soundOffIcon = document.getElementById("soundOffIcon");

  // Countdown Overlay
  const countdownOverlay = document.getElementById("countdownOverlay");
  const countdownModeLabelEl = document.getElementById("countdownModeLabel");
  const countdownNumEl = document.getElementById("countdownNum");
  const countdownSubEl = document.getElementById("countdownSub");

  // Title Overlay
  const titleOverlay = document.getElementById("titleOverlay");
  const walletPillBtn = document.getElementById("walletPillBtn");
  const walletTotalValEl = document.getElementById("walletTotalVal");
  const openDailyBtn = document.getElementById("openDailyBtn");
  const openLeaderboardBtn = document.getElementById("openLeaderboardBtn");
  const openAuthOrProfileBtn = document.getElementById("openAuthOrProfileBtn");
  const titleKickerEl = document.getElementById("titleKicker");
  const userGreetingEl = document.getElementById("userGreeting");
  const shieldLegendTextEl = document.getElementById("shieldLegendText");
  const ctaQuickPlayBtn = document.getElementById("ctaQuickPlayBtn");
  const ctaDuelBtn = document.getElementById("ctaDuelBtn");
  const openDashboardBtn = document.getElementById("openDashboardBtn");
  const openHistoryBtn = document.getElementById("openHistoryBtn");
  const openSettingsBtn = document.getElementById("openSettingsBtn");

  // Game Over / Result Overlay
  const gameoverOverlay = document.getElementById("gameoverOverlay");
  const outcomeBadgeEl = document.getElementById("outcomeBadge");
  const resultTitleEl = document.getElementById("resultTitle");
  const lostReasonEl = document.getElementById("lostReason");
  const scoreBoxLabelEl = document.getElementById("scoreBoxLabel");
  const midBoxLabelEl = document.getElementById("midBoxLabel");
  const finalScoreEl = document.getElementById("finalScore");
  const finalPctEl = document.getElementById("finalPct");
  const finalRewardEl = document.getElementById("finalReward");
  const finalGameIdEl = document.getElementById("finalGameId");
  const metaDetailLabelEl = document.getElementById("metaDetailLabel");
  const finalTierEl = document.getElementById("finalTier");
  const finalVerifiedEl = document.getElementById("finalVerified");
  const rngAuditRowEl = document.getElementById("rngAuditRow");
  const finalRngAuditEl = document.getElementById("finalRngAudit");
  const continueBtn = document.getElementById("continueBtn");
  const resultSwitchModeBtn = document.getElementById("resultSwitchModeBtn");
  const resultHistoryBtn = document.getElementById("resultHistoryBtn");
  const resultHomeBtn = document.getElementById("resultHomeBtn");

  // Platform Modal & Views
  const platformModal = document.getElementById("platformModal");
  const modalTitleEl = document.getElementById("modalTitle");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const hubTabsEl = document.getElementById("hubTabs");

  const viewAuth = document.getElementById("viewAuth");
  const authTabLogin = document.getElementById("authTabLogin");
  const authTabRegister = document.getElementById("authTabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const authFormStatus = document.getElementById("authFormStatus");

  const viewDashboard = document.getElementById("viewDashboard");
  const dashBanner = document.getElementById("dashBanner");
  const dashStatsGrid = document.getElementById("dashStatsGrid");
  const dashGoQuickBtn = document.getElementById("dashGoQuickBtn");
  const dashGoDuelBtn = document.getElementById("dashGoDuelBtn");

  const viewQuickPlay = document.getElementById("viewQuickPlay");
  const qpEntryGrid = document.getElementById("qpEntryGrid");
  const qpPreviewBox = document.getElementById("qpPreviewBox");
  const qpStatus = document.getElementById("qpStatus");
  const startQuickPlayBtn = document.getElementById("startQuickPlayBtn");

  const viewDuel = document.getElementById("viewDuel");
  const duelRulesText = document.getElementById("duelRulesText");
  const duelFeeExplain = document.getElementById("duelFeeExplain");
  const duelLobbySetup = document.getElementById("duelLobbySetup");
  const duelEntryGrid = document.getElementById("duelEntryGrid");
  const duelPreviewBox = document.getElementById("duelPreviewBox");
  const duelStatus = document.getElementById("duelStatus");
  const joinDuelQueueBtn = document.getElementById("joinDuelQueueBtn");
  const duelQueueWaiting = document.getElementById("duelQueueWaiting");
  const duelWaitTitle = document.getElementById("duelWaitTitle");
  const duelWaitDetail = document.getElementById("duelWaitDetail");
  const duelWaitTimer = document.getElementById("duelWaitTimer");
  const cancelDuelQueueBtn = document.getElementById("cancelDuelQueueBtn");
  const duelOpponentCard = document.getElementById("duelOpponentCard");
  const duelOppName = document.getElementById("duelOppName");
  const duelOppBadge = document.getElementById("duelOppBadge");

  const viewWallet = document.getElementById("viewWallet");
  const walletSummaryGrid = document.getElementById("walletSummaryGrid");
  const walletTxList = document.getElementById("walletTxList");

  const viewDaily = document.getElementById("viewDaily");
  const dailyStreakBanner = document.getElementById("dailyStreakBanner");
  const dailyRewardsList = document.getElementById("dailyRewardsList");
  const dailyStatus = document.getElementById("dailyStatus");

  const viewLeaderboard = document.getElementById("viewLeaderboard");
  const lbPeriodAll = document.getElementById("lbPeriodAll");
  const lbPeriodWeekly = document.getElementById("lbPeriodWeekly");
  const lbLimit10 = document.getElementById("lbLimit10");
  const lbLimit50 = document.getElementById("lbLimit50");
  const leaderboardList = document.getElementById("leaderboardList");

  const viewHistory = document.getElementById("viewHistory");
  const historySummaryGrid = document.getElementById("historySummaryGrid");
  const matchHistoryList = document.getElementById("matchHistoryList");

  const viewProfile = document.getElementById("viewProfile");
  const profileInfoBanner = document.getElementById("profileInfoBanner");
  const profileForm = document.getElementById("profileForm");
  const passwordForm = document.getElementById("passwordForm");
  const profileStatus = document.getElementById("profileStatus");
  const logoutBtn = document.getElementById("logoutBtn");

  const audio = new global.CosmicAudio();

  // Viewport logical size
  let W = 420;
  let H = 746;
  let DPR = 1;

  // Auth & Platform state
  let authToken = loadToken();
  let currentUser = null;
  let currentWallet = { balance: 0, totalEarned: 0, totalSpent: 0 };
  let currentBadge = { label: "Lunar Cadet" };
  let pendingTabAfterLogin = "dashboard";
  let socket = null;

  let platformConfig = {
    quickPlay: {
      winProbabilityPct: 45,
      payoutMultiplier: 1.8,
      houseEdgePct: 19,
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
    difficulty: {
      speedScale: 1.0,
      skullChanceBoost: 0
    }
  };

  let selectedQpEntry = 50;
  let selectedDuelEntry = 50;
  let duelWaitInterval = null;
  let duelQueueJoinedAt = 0;
  let lbPeriod = "all";
  let lbLimit = 10;

  // Game state: "title" | "countdown" | "playing" | "impact" | "gameover"
  let state = "title";
  let time = 0;
  let lastFrame = 0;

  // Active Match & Anti-cheat telemetry
  let activeMatch = null; // { mode: "quick_play"|"duel_arena", matchId, durationSeconds, targetScore, maxMistakes, difficulty, seed, entryAmount, opponent }
  let matchRng = Math.random;
  let matchFinalized = false;
  let telemetrySlices = [];
  let runStartPerfMs = 0;
  let lastSlicePerfMs = -9999;
  let lastPlayedMode = "quick_play";

  // Gameplay progression & visual state
  let score = 0;
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
  let lossReason = "";

  // Screen effects
  let shakeTime = 0;
  let shakeMag = 0;
  let impactTimer = 0;
  let impactPoint = { x: 0, y: 0 };
  let impactIsSkull = false;

  let stars = [];
  let bgMeteors = [];
  let entities = [];
  let particles = [];
  let shards = [];
  let popups = [];
  let fireEmbers = [];
  let titleCometSliced = false;
  let titleTransition = 0;
  let countdownHandle = null;

  const pointer = {
    active: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    trail: []
  };

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadToken() {
    try {
      return global.localStorage.getItem(TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function saveToken(tok) {
    authToken = tok || "";
    try {
      if (tok) global.localStorage.setItem(TOKEN_KEY, tok);
      else global.localStorage.removeItem(TOKEN_KEY);
    } catch (_) {}
  }

  function createSeededRng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rand(min, max, rng = Math.random) {
    return min + rng() * (max - min);
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

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }
    const res = await fetch(path, { ...options, headers, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function syncUserUI() {
    if (currentUser) {
      walletTotalValEl.textContent = `₹${Number(currentWallet.balance || 0).toLocaleString()}`;
      openAuthOrProfileBtn.textContent = currentUser.username;
      userGreetingEl.textContent = `${currentUser.username} • ${currentBadge.label || "Lunar Cadet"}`;
      userGreetingEl.classList.remove("hidden");
    } else {
      walletTotalValEl.textContent = "Login";
      openAuthOrProfileBtn.textContent = "Login";
      userGreetingEl.classList.add("hidden");
    }
    const qp = platformConfig.quickPlay;
    const totalShields = Number(qp.maxMistakes ?? 2) + 1;
    shieldLegendTextEl.textContent = `${totalShields} Shield${totalShields === 1 ? "" : "s"}`;
    titleKickerEl.textContent = `${qp.durationSeconds || 45}s NAKSHATRA ARCADE`;
  }

  async function fetchConfig() {
    try {
      const data = await api("/api/config");
      platformConfig = data;
      const qpOpts = data.quickPlay?.entryOptions || DEFAULT_ENTRY_OPTIONS;
      const duelOpts = data.duelArena?.entryOptions || DEFAULT_ENTRY_OPTIONS;
      if (!qpOpts.includes(selectedQpEntry)) selectedQpEntry = qpOpts[0];
      if (!duelOpts.includes(selectedDuelEntry)) selectedDuelEntry = duelOpts[0];
      syncUserUI();
    } catch (_) {}
  }

  async function restoreSession() {
    await fetchConfig();
    if (!authToken) {
      syncUserUI();
      return;
    }
    try {
      const data = await api("/api/auth/me");
      currentUser = data.user;
      currentWallet = data.wallet;
      currentBadge = data.badge || { label: "Lunar Cadet" };
      if (currentUser.settings && typeof currentUser.settings.soundEnabled === "boolean") {
        setMutedState(!currentUser.settings.soundEnabled);
      }
      connectSocket();
    } catch (_) {
      saveToken("");
      currentUser = null;
    }
    syncUserUI();
  }

  function setMutedState(muted) {
    audio.setMuted(Boolean(muted));
    soundOnIcon.classList.toggle("hidden", Boolean(muted));
    soundOffIcon.classList.toggle("hidden", !muted);
  }

  // Socket.IO for Real-time Duel Arena
  function connectSocket() {
    if (!authToken || typeof global.io !== "function") return;
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    socket = global.io({
      auth: { token: authToken }
    });

    socket.on("duel:queued", (data) => {
      currentWallet.balance = data.walletBalance;
      syncUserUI();
      duelLobbySetup.classList.add("hidden");
      duelOpponentCard.classList.add("hidden");
      duelQueueWaiting.classList.remove("hidden");
      duelWaitTitle.textContent = "Searching for online opponent...";
      duelWaitDetail.textContent = `Escrowed ${data.entryAmount} virtual coins • Pool ${data.payout.totalPool} • Timeout ${data.timeoutSec}s`;
      duelQueueJoinedAt = Date.now();
      if (duelWaitInterval) clearInterval(duelWaitInterval);
      duelWaitInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - duelQueueJoinedAt) / 1000);
        duelWaitTimer.textContent = `Elapsed: ${secs}s / ${data.timeoutSec}s`;
      }, 500);
    });

    socket.on("duel:queue_cancelled", (data) => {
      if (duelWaitInterval) clearInterval(duelWaitInterval);
      if (typeof data.walletBalance === "number") {
        currentWallet.balance = data.walletBalance;
        syncUserUI();
      }
      resetDuelLobbyUI();
      const reasonMsg =
        data.reason === "timeout"
          ? "Matchmaking timed out. Virtual coins refunded."
          : "Queue cancelled. Virtual coins refunded.";
      duelStatus.textContent = reasonMsg;
    });

    socket.on("duel:error", (data) => {
      duelStatus.textContent = data.error || "Duel error.";
    });

    socket.on("duel:match_found", (data) => {
      if (duelWaitInterval) clearInterval(duelWaitInterval);
      duelQueueWaiting.classList.add("hidden");
      duelLobbySetup.classList.add("hidden");
      duelOpponentCard.classList.remove("hidden");
      duelOppName.textContent = `@${data.opponent.username}`;
      duelOppBadge.textContent = `${data.opponent.badge?.label || "Lunar Cadet"} • Entry ${data.entryAmount} Coins`;

      setTimeout(() => {
        closePlatformModal();
        startDuelMatch(data);
      }, 900);
    });

    socket.on("duel:opponent_progress", (data) => {
      oppScoreValEl.textContent = String(data.score || 0);
    });

    socket.on("duel:waiting_opponent", (data) => {
      if (state !== "gameover") {
        presentWaitingDuelScreen(data.yourScore);
      }
    });

    socket.on("duel:opponent_disconnected", (data) => {
      addPopup(W * 0.5, H * 0.25, `Opponent disconnected (${data.graceSeconds}s)...`, "#ffd166");
    });

    socket.on("duel:result", (data) => {
      if (typeof data.walletBalance === "number") {
        currentWallet.balance = data.walletBalance;
        syncUserUI();
      }
      renderDuelResult(data);
    });
  }

  function resetDuelLobbyUI() {
    if (duelWaitInterval) clearInterval(duelWaitInterval);
    duelLobbySetup.classList.remove("hidden");
    duelQueueWaiting.classList.add("hidden");
    duelOpponentCard.classList.add("hidden");
  }

  // Modal Navigation
  const allViews = [
    viewAuth,
    viewDashboard,
    viewQuickPlay,
    viewDuel,
    viewWallet,
    viewDaily,
    viewLeaderboard,
    viewHistory,
    viewProfile
  ];

  const viewTitles = {
    auth: "Account Access",
    dashboard: "Nakshatra Cut Hub",
    quickplay: "Mode 1: Quick Play",
    duel: "Mode 2: Duel Arena",
    wallet: "Wallet",
    daily: "Daily Rewards & Missions",
    leaderboard: "Nakshatra Leaderboard",
    history: "Match History",
    profile: "Profile & Settings"
  };

  function closePlatformModal() {
    platformModal.classList.add("hidden");
  }

  function openHub(tabName = "dashboard") {
    if (!currentUser && tabName !== "leaderboard") {
      pendingTabAfterLogin = tabName;
      showHubView("auth");
      return;
    }
    showHubView(tabName);
  }

  function showHubView(tabName) {
    platformModal.classList.remove("hidden");
    modalTitleEl.textContent = viewTitles[tabName] || "Cosmic Slice";
    allViews.forEach((v) => v.classList.add("hidden"));

    hubTabsEl.classList.toggle("hidden", tabName === "auth" || !currentUser);
    hubTabsEl.querySelectorAll(".tab-pill").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });

    if (tabName === "auth") {
      viewAuth.classList.remove("hidden");
      authFormStatus.textContent = "";
    } else if (tabName === "dashboard") {
      viewDashboard.classList.remove("hidden");
      renderDashboardView();
    } else if (tabName === "quickplay") {
      viewQuickPlay.classList.remove("hidden");
      renderQuickPlayView();
    } else if (tabName === "duel") {
      viewDuel.classList.remove("hidden");
      renderDuelView();
    } else if (tabName === "wallet") {
      viewWallet.classList.remove("hidden");
      loadWalletView();
    } else if (tabName === "daily") {
      viewDaily.classList.remove("hidden");
      loadDailyView();
    } else if (tabName === "leaderboard") {
      viewLeaderboard.classList.remove("hidden");
      loadLeaderboardView();
    } else if (tabName === "history") {
      viewHistory.classList.remove("hidden");
      loadHistoryView();
    } else if (tabName === "profile") {
      viewProfile.classList.remove("hidden");
      renderProfileView();
    }
  }

  function renderDashboardView() {
    if (!currentUser) return;
    const s = currentUser.stats || {};
    const winRate = s.totalMatches > 0 ? Math.round((s.wins / s.totalMatches) * 100) : 0;
    dashBanner.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <strong style="font-size:15px;">@${esc(currentUser.username)}</strong>
          <small style="display:block;color:#b7a4de;">ID: ${esc(currentUser.userId)} • ${esc(currentBadge.label || "Lunar Cadet")}</small>
        </div>
        <strong style="color:#fde047;font-size:16px;">₹${Number(currentWallet.balance || 0).toLocaleString()}</strong>
      </div>
    `;
    dashStatsGrid.innerHTML = `
      <div class="mini-stat"><span>Matches Played</span><strong>${Number(s.totalMatches || 0)}</strong></div>
      <div class="mini-stat"><span>Win Rate</span><strong>${winRate}%</strong></div>
      <div class="mini-stat"><span>Highest Score</span><strong>${Number(s.highestScore || 0)}</strong></div>
      <div class="mini-stat"><span>Login Streak</span><strong>${Number(s.currentStreak || 0)} Days</strong></div>
    `;
  }

  function renderQuickPlayView() {
    const qp = platformConfig.quickPlay;
    qpStatus.textContent = "";

    qpEntryGrid.innerHTML = "";
    for (const amt of qp.entryOptions || DEFAULT_ENTRY_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `entry-btn ${amt === selectedQpEntry ? "active" : ""}`;
      btn.textContent = `₹${amt}`;
      btn.addEventListener("click", () => {
        selectedQpEntry = amt;
        renderQuickPlayView();
      });
      qpEntryGrid.appendChild(btn);
    }

    const winReturn = Math.round(selectedQpEntry * qp.payoutMultiplier);
    qpPreviewBox.innerHTML = `
      <div class="meta-row"><span>Your Balance</span><strong>₹${Number(currentWallet.balance || 0).toLocaleString()}</strong></div>
      <div class="meta-row"><span>Entry Amount</span><strong>₹${selectedQpEntry}</strong></div>
      <div class="meta-row"><span>Random Draw Win (${qp.winProbabilityPct}% chance)</span><strong style="color:#4ade80;">+₹${winReturn} (${qp.payoutMultiplier}x)</strong></div>
      <div class="meta-row"><span>Random Draw Loss (${100 - qp.winProbabilityPct}% chance)</span><strong style="color:#fb7185;">₹0</strong></div>
    `;
  }

  function renderDuelView() {
    const da = platformConfig.duelArena;
    duelFeeExplain.textContent = `Platform virtual accounting fee: ${da.platformFeePct}% of total pool. Equal scores result in a tie and 100% refund to both players.`;
    duelStatus.textContent = "";

    duelEntryGrid.innerHTML = "";
    for (const amt of da.entryOptions || DEFAULT_ENTRY_OPTIONS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `entry-btn ${amt === selectedDuelEntry ? "active" : ""}`;
      btn.textContent = `₹${amt}`;
      btn.addEventListener("click", () => {
        selectedDuelEntry = amt;
        renderDuelView();
      });
      duelEntryGrid.appendChild(btn);
    }

    const pool = selectedDuelEntry * 2;
    const fee = Math.round(pool * (da.platformFeePct / 100));
    const winnerGet = pool - fee;
    duelPreviewBox.innerHTML = `
      <div class="meta-row"><span>Your Balance</span><strong>₹${Number(currentWallet.balance || 0).toLocaleString()}</strong></div>
      <div class="meta-row"><span>Total Pool (2 Players)</span><strong>₹${pool}</strong></div>
      <div class="meta-row"><span>Platform Fee (${da.platformFeePct}%)</span><strong>₹${fee}</strong></div>
      <div class="meta-row"><span>Winner Receives</span><strong style="color:#4ade80;">₹${winnerGet}</strong></div>
    `;
  }

  async function loadWalletView() {
    walletSummaryGrid.innerHTML = `<div class="mini-stat"><span>Loading...</span><strong>...</strong></div>`;
    walletTxList.innerHTML = "";
    try {
      const data = await api("/api/wallet");
      currentWallet = data.wallet;
      syncUserUI();
      walletSummaryGrid.innerHTML = `
        <div class="mini-stat"><span>Current Balance</span><strong>₹${Number(data.wallet.balance || 0).toLocaleString()}</strong></div>
        <div class="mini-stat"><span>Total Earned</span><strong style="color:#4ade80;">₹${Number(data.wallet.totalEarned || 0).toLocaleString()}</strong></div>
        <div class="mini-stat"><span>Total Spent</span><strong style="color:#fb7185;">₹${Number(data.wallet.totalSpent || 0).toLocaleString()}</strong></div>
        <div class="mini-stat"><span>Net Match P/L</span><strong>${Number(data.summary?.netProfit || 0) >= 0 ? "+" : "-"}₹${Math.abs(Number(data.summary?.netProfit || 0)).toLocaleString()}</strong></div>
      `;
      if (!data.transactions.length) {
        walletTxList.innerHTML = `<div class="list-row"><span>No transactions yet.</span></div>`;
        return;
      }
      for (const tx of data.transactions) {
        const div = document.createElement("div");
        div.className = "list-row";
        const sign = tx.direction === "credit" ? "+" : "-";
        const col = tx.direction === "credit" ? "#4ade80" : "#fb7185";
        div.innerHTML = `
          <div>
            <strong>${esc(tx.description || tx.type)}</strong>
            <small>${new Date(tx.createdAt).toLocaleString()} • Balance: ₹${Number(tx.balanceAfter || 0).toLocaleString()}</small>
          </div>
          <strong style="color:${col};">${sign}₹${Number(tx.amount || 0)}</strong>
        `;
        walletTxList.appendChild(div);
      }
    } catch (err) {
      walletTxList.innerHTML = `<div class="list-row"><span>${esc(err.message)}</span></div>`;
    }
  }

  async function loadDailyView() {
    dailyRewardsList.innerHTML = `<div class="list-row"><span>Loading daily rewards...</span></div>`;
    dailyStatus.textContent = "";
    try {
      const data = await api("/api/daily");
      renderDailyState(data);
    } catch (err) {
      dailyRewardsList.innerHTML = `<div class="list-row"><span>${esc(err.message)}</span></div>`;
    }
  }

  function renderDailyState(data) {
    dailyStreakBanner.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong>Consecutive Login Streak: ${Number(data.streakDays || 0)} Day(s)</strong>
          <small>Today: ${Number(data.dailyProgress?.matchesPlayed || 0)} matches • ${Number(data.dailyProgress?.wins || 0)} wins</small>
        </div>
        <strong style="color:#fde047;">₹${Number(currentWallet.balance || 0).toLocaleString()}</strong>
      </div>
    `;
    dailyRewardsList.innerHTML = "";
    for (const r of data.rewards || []) {
      const row = document.createElement("div");
      row.className = "list-row";
      let actionHtml = "";
      if (r.claimed) {
        actionHtml = `<span class="mini-btn" style="opacity:0.6;cursor:default;">Claimed</span>`;
      } else if (r.eligible) {
        actionHtml = `<button class="mini-btn" style="background:linear-gradient(135deg,#8b2cff,#d83bff);color:#fff;" data-claim="${esc(r.key)}" type="button">Claim +₹${r.amount}</button>`;
      } else {
        actionHtml = `<span class="mini-btn" style="opacity:0.55;cursor:default;">${r.progress}/${r.target}</span>`;
      }
      row.innerHTML = `
        <div>
          <strong>${esc(r.title)} (+₹${r.amount})</strong>
          <small>${esc(r.description)} • Progress: ${r.progress}/${r.target}</small>
        </div>
        ${actionHtml}
      `;
      dailyRewardsList.appendChild(row);
    }
    dailyRewardsList.querySelectorAll("button[data-claim]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-claim");
        dailyStatus.textContent = "Claiming...";
        try {
          const res = await api("/api/daily/claim", {
            method: "POST",
            body: JSON.stringify({ rewardKey: key })
          });
          currentWallet = res.wallet;
          syncUserUI();
          renderDailyState(res.state);
          dailyStatus.textContent = `Claimed +₹${res.claimedItem.amount} to your wallet!`;
          audio.playStarBonus();
        } catch (err) {
          dailyStatus.textContent = err.message;
        }
      });
    });
  }

  async function loadLeaderboardView() {
    lbPeriodAll.classList.toggle("active", lbPeriod === "all");
    lbPeriodWeekly.classList.toggle("active", lbPeriod === "weekly");
    lbLimit10.classList.toggle("active", lbLimit === 10);
    lbLimit50.classList.toggle("active", lbLimit === 50);

    leaderboardList.innerHTML = `<div class="list-row"><span>Loading rankings...</span></div>`;
    try {
      const data = await api(`/api/leaderboard?period=${lbPeriod}&limit=${lbLimit}`);
      leaderboardList.innerHTML = "";
      if (!data.entries.length) {
        leaderboardList.innerHTML = `<div class="list-row"><span>No ranked matches played yet.</span></div>`;
        return;
      }
      for (const row of data.entries) {
        const div = document.createElement("div");
        div.className = "list-row";
        div.innerHTML = `
          <div>
            <strong>#${row.rank} ${esc(row.username)} • <span style="color:#8ce8ff;">${esc(row.badge?.label || "Lunar Cadet")}</span></strong>
            <small>${row.totalMatches} matches • ${row.wins} wins (${row.winRate}%) • Best: ${row.highestScore}</small>
          </div>
          <strong style="color:#fde047;">${Number(row.rankingScore || 0).toLocaleString()} pts</strong>
        `;
        leaderboardList.appendChild(div);
      }
    } catch (err) {
      leaderboardList.innerHTML = `<div class="list-row"><span>${esc(err.message)}</span></div>`;
    }
  }

  async function loadHistoryView() {
    historySummaryGrid.innerHTML = "";
    matchHistoryList.innerHTML = `<div class="list-row"><span>Loading match history...</span></div>`;
    try {
      const data = await api("/api/history");
      const s = data.summary || {};
      historySummaryGrid.innerHTML = `
        <div class="mini-stat"><span>Wins / Losses</span><strong>${s.wins || 0} / ${s.losses || 0}</strong></div>
        <div class="mini-stat"><span>Ties • Net P/L</span><strong>${s.ties || 0} • ${(s.netProfit || 0) >= 0 ? "+" : "-"}₹${Math.abs(s.netProfit || 0)}</strong></div>
      `;
      matchHistoryList.innerHTML = "";
      if (!data.recent.length) {
        matchHistoryList.innerHTML = `<div class="list-row"><span>No completed matches yet.</span></div>`;
        return;
      }
      for (const m of data.recent) {
        const div = document.createElement("div");
        div.className = "list-row";
        const modeTxt = m.mode === "duel_arena" ? `DUEL vs ${m.opponentUsername || "Player"}` : "QUICK PLAY";
        const outColor = m.outcome === "won" ? "#4ade80" : m.outcome === "tie" ? "#8ce8ff" : "#fb7185";
        div.innerHTML = `
          <div>
            <strong>${esc(modeTxt)} • <span style="color:${outColor};">${esc(m.outcome).toUpperCase()}</span></strong>
            <small>Score: ${m.playerScore} • Entry: ₹${m.entryAmount} • ${new Date(m.timestamp).toLocaleString()}</small>
          </div>
          <strong style="color:${m.virtualReward > 0 ? "#4ade80" : "#bfb0de"};">+₹${m.virtualReward}</strong>
        `;
        matchHistoryList.appendChild(div);
      }
    } catch (err) {
      matchHistoryList.innerHTML = `<div class="list-row"><span>${esc(err.message)}</span></div>`;
    }
  }

  function renderProfileView() {
    if (!currentUser) return;
    const s = currentUser.stats || {};
    profileInfoBanner.innerHTML = `
      <div>
        <strong>@${esc(currentUser.username)}</strong> (${esc(currentUser.userId)})
        <small style="display:block;color:#b7a4de;">${esc(currentUser.email)} • Rank: ${esc(currentBadge.label || "Lunar Cadet")}</small>
        <small style="display:block;color:#8ce8ff;">Quick Play: ${s.quickPlayMatches || 0} (${s.quickPlayWins || 0} wins) • Duel Arena: ${s.duelMatches || 0} (${s.duelWins || 0} wins)</small>
      </div>
    `;
    document.getElementById("profUsername").value = currentUser.username;
    document.getElementById("profAvatarColor").value = currentUser.avatarColor || "#9542ff";
    document.getElementById("profSoundToggle").checked = !audio.isMuted();
    profileStatus.textContent = "";
  }

  // Gameplay & Canvas Mechanics
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

  function renderShieldPips() {
    const maxMistakes = activeMatch ? activeMatch.maxMistakes : Number(platformConfig.quickPlay?.maxMistakes ?? 2);
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
    const targetScore = activeMatch ? activeMatch.targetScore : Number(platformConfig.quickPlay?.targetScore || 95);
    const pct = clamp(Math.round((score / targetScore) * 100), 0, 100);
    scoreValEl.textContent = String(score);
    perfValEl.textContent = `${pct}%`;

    if (activeMatch && activeMatch.mode === "duel_arena") {
      liveModeChipEl.textContent = "DUEL";
      oppHudPillEl.classList.remove("hidden");
      oppHudNameEl.textContent = activeMatch.opponent?.username?.slice(0, 8) || "OPP";
    } else {
      liveModeChipEl.textContent = "QUICK";
      oppHudPillEl.classList.add("hidden");
    }

    const secs = Math.max(0, Math.ceil(roundRemaining));
    timerPillEl.textContent = `${secs}s`;
    timerPillEl.classList.toggle("urgent", secs <= 10);
    renderShieldPips();
  }

  function setState(nextState) {
    state = nextState;
    titleOverlay.classList.toggle("hidden", state !== "title");
    gameoverOverlay.classList.toggle("hidden", state !== "gameover");
    countdownOverlay.classList.toggle("hidden", state !== "countdown");
    hudEl.classList.toggle("dimmed", state !== "playing");
    syncHud();
  }

  function resetMatchVars(matchInfo) {
    activeMatch = matchInfo;
    matchRng = matchInfo.seed ? createSeededRng(matchInfo.seed) : Math.random;
    matchFinalized = false;
    telemetrySlices = [];
    lastSlicePerfMs = -9999;

    score = 0;
    slicedCount = 0;
    mistakes = 0;
    hitSkull = false;
    wave = 1;
    roundRemaining = matchInfo.durationSeconds;
    spawnTimer = 0.45;
    slowMoTimer = 0;
    comboCount = 0;
    comboTimer = 0;
    lastOutcome = "lost";
    lossReason = "";
    entities = [];
    particles = [];
    shards = [];
    popups = [];
    fireEmbers = [];
    shakeTime = 0;
    impactTimer = 0;
    impactIsSkull = false;
    oppScoreValEl.textContent = "0";
  }

  function beginCountdown(modeLabel, subText, msTotal, onGo) {
    if (countdownHandle) clearInterval(countdownHandle);
    setState("countdown");
    countdownModeLabelEl.textContent = modeLabel;
    countdownSubEl.textContent = subText;

    const endAt = Date.now() + msTotal;
    const tick = () => {
      const rem = endAt - Date.now();
      if (rem <= 0) {
        clearInterval(countdownHandle);
        countdownHandle = null;
        countdownNumEl.textContent = "SLICE!";
        audio.playStartBurst();
        runStartPerfMs = performance.now();
        setState("playing");
        if (onGo) onGo();
        return;
      }
      const sec = Math.ceil(rem / 1000);
      if (countdownNumEl.textContent !== String(sec)) {
        countdownNumEl.textContent = String(sec);
        audio.playClick();
      }
    };
    tick();
    countdownHandle = setInterval(tick, 100);
  }

  async function startQuickPlayMatch() {
    if (!currentUser) {
      openHub("quickplay");
      return;
    }
    qpStatus.textContent = "Starting verified Quick Play match...";
    startQuickPlayBtn.disabled = true;
    try {
      const data = await api("/api/quickplay/start", {
        method: "POST",
        body: JSON.stringify({ entryAmount: selectedQpEntry })
      });
      currentWallet.balance = data.walletBalance;
      syncUserUI();
      closePlatformModal();

      lastPlayedMode = "quick_play";
      resetMatchVars({
        mode: "quick_play",
        matchId: data.matchId,
        entryAmount: data.entryAmount,
        durationSeconds: data.durationSeconds,
        targetScore: data.targetScore,
        maxMistakes: data.maxMistakes,
        difficulty: data.difficulty || platformConfig.difficulty,
        winProbabilityPct: data.winProbabilityPct,
        payoutMultiplier: data.payoutMultiplier,
        serverSeedHash: data.serverSeedHash
      });

      beginCountdown(
        `QUICK PLAY • ₹${data.entryAmount}`,
        `Luck-Based Draw (${data.winProbabilityPct}% win • ${data.payoutMultiplier}x)`,
        2400
      );
    } catch (err) {
      qpStatus.textContent = err.message;
    } finally {
      startQuickPlayBtn.disabled = false;
    }
  }

  function startDuelMatch(data) {
    lastPlayedMode = "duel_arena";
    resetMatchVars({
      mode: "duel_arena",
      matchId: data.matchId,
      entryAmount: data.entryAmount,
      seed: data.seed,
      durationSeconds: data.durationSeconds,
      targetScore: data.targetScore,
      maxMistakes: data.maxMistakes,
      difficulty: data.difficulty || platformConfig.difficulty,
      payout: data.payout,
      opponent: data.opponent
    });

    const waitMs = Math.max(800, data.startAt - Date.now());
    beginCountdown(
      `DUEL ARENA vs @${data.opponent.username}`,
      `Pool ${data.payout.totalPool} Coins • Winner Gets ${data.payout.winnerReward}`,
      waitMs
    );
  }

  function presentWaitingDuelScreen(yourScore) {
    lastOutcome = "won";
    outcomeBadgeEl.textContent = "DUEL ARENA";
    outcomeBadgeEl.classList.add("won");
    resultTitleEl.textContent = "Waiting for Opponent";
    lostReasonEl.textContent = "Your verified score is submitted. Settling duel...";
    scoreBoxLabelEl.textContent = "YOUR SCORE";
    midBoxLabelEl.textContent = "OPPONENT";
    finalScoreEl.textContent = String(yourScore);
    finalPctEl.textContent = "...";
    finalRewardEl.textContent = "Pending";
    finalGameIdEl.textContent = activeMatch ? activeMatch.matchId.slice(0, 12) + "…" : "-";
    metaDetailLabelEl.textContent = "Status";
    finalTierEl.textContent = "Waiting for opponent finish";
    finalVerifiedEl.textContent = `${Number(currentWallet.balance || 0).toLocaleString()} Coins`;
    rngAuditRowEl.classList.add("hidden");
    continueBtn.textContent = "Play Again";
    continueBtn.dataset.action = "replay";
    setState("gameover");
  }

  function renderDuelResult(data) {
    lastOutcome = data.outcome === "won" || data.outcome === "tie" ? "won" : "lost";
    if (data.outcome === "won") {
      outcomeBadgeEl.textContent = "DUEL VICTORY";
      outcomeBadgeEl.classList.add("won");
      resultTitleEl.textContent = `You Win ₹${data.virtualReward}!`;
      spawnCelebrationSparks();
      audio.playStarBonus();
    } else if (data.outcome === "tie") {
      outcomeBadgeEl.textContent = "DUEL TIE • REFUNDED";
      outcomeBadgeEl.classList.add("won");
      resultTitleEl.textContent = `Tie! ₹${data.virtualReward} Refunded`;
    } else {
      outcomeBadgeEl.textContent = data.outcome === "flagged" ? "FLAGGED" : "DUEL LOST";
      outcomeBadgeEl.classList.remove("won");
      resultTitleEl.textContent = "Duel Lost";
    }
    lostReasonEl.textContent = data.summaryNote || "";
    scoreBoxLabelEl.textContent = "YOUR SCORE";
    midBoxLabelEl.textContent = `VS ${data.opponentUsername}`;
    finalScoreEl.textContent = String(data.yourScore);
    finalPctEl.textContent = String(data.opponentScore);
    finalRewardEl.textContent = data.virtualReward > 0 ? `+₹${data.virtualReward}` : "₹0";
    finalGameIdEl.textContent = data.matchId.slice(0, 12) + "…";
    metaDetailLabelEl.textContent = `Pool (${data.platformFeePct}% Fee)`;
    finalTierEl.textContent = `₹${data.totalPool} (₹${data.platformVirtualFee} fee)`;
    finalVerifiedEl.textContent = `₹${Number(currentWallet.balance || 0).toLocaleString()}`;
    rngAuditRowEl.classList.add("hidden");
    continueBtn.textContent = "Play Again";
    continueBtn.dataset.action = "replay";
    setState("gameover");
  }

  async function submitMatchOutcome(survived) {
    if (matchFinalized || !activeMatch) return;
    matchFinalized = true;

    const payload = {
      matchId: activeMatch.matchId,
      survived,
      outcome: survived ? "won" : "lost",
      lossReason,
      clientScore: score,
      telemetry: {
        mistakes,
        hitSkull,
        slices: telemetrySlices
      }
    };

    if (activeMatch.mode === "duel_arena") {
      if (socket && socket.connected) {
        socket.emit("duel:submit", payload);
      }
      presentWaitingDuelScreen(score);
      return;
    }

    // Mode 1: Quick Play completion
    scoreBoxLabelEl.textContent = "SCORE";
    midBoxLabelEl.textContent = "PERF";
    finalScoreEl.textContent = `${score}`;
    finalPctEl.textContent = `${clamp(Math.round((score / activeMatch.targetScore) * 100), 0, 100)}%`;
    finalRewardEl.textContent = "...";
    finalGameIdEl.textContent = `${activeMatch.matchId.slice(0, 12)}…`;
    metaDetailLabelEl.textContent = "Verification";
    finalTierEl.textContent = "Verifying match...";
    finalVerifiedEl.textContent = `${Number(currentWallet.balance || 0).toLocaleString()} Coins`;
    rngAuditRowEl.classList.add("hidden");
    continueBtn.textContent = "Play Again";
    continueBtn.dataset.action = "replay";
    setState("gameover");

    try {
      const data = await api("/api/quickplay/complete", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      currentWallet.balance = data.walletBalance;
      syncUserUI();

      if (data.outcome === "won") {
        lastOutcome = "won";
        outcomeBadgeEl.textContent = "QUICK PLAY WIN (LUCK DRAW)";
        outcomeBadgeEl.classList.add("won");
        resultTitleEl.textContent = `You Win ₹${data.virtualReward}!`;
        continueBtn.textContent = "Play Again";
        continueBtn.dataset.action = "replay";
        spawnCelebrationSparks();
        audio.playStarBonus();
      } else if (data.outcome === "flagged") {
        lastOutcome = "lost";
        outcomeBadgeEl.textContent = "ANTI-CHEAT BLOCKED";
        outcomeBadgeEl.classList.remove("won");
        resultTitleEl.textContent = "Score Rejected";
        continueBtn.textContent = "Back to Home";
        continueBtn.dataset.action = "home";
      } else {
        lastOutcome = "lost";
        outcomeBadgeEl.textContent = "LUCK-BASED DRAW • NO WIN";
        outcomeBadgeEl.classList.remove("won");
        resultTitleEl.textContent = "No Reward This Round";
        continueBtn.textContent = "Back to Home";
        continueBtn.dataset.action = "home";
      }

      lostReasonEl.textContent =
        data.outcome === "won"
          ? `₹${data.virtualReward} added to your wallet via random server draw.`
          : data.outcome === "flagged"
            ? data.lossReason
            : "Decided by random server draw (luck-based). Play for fun — never chase losses.";
      finalScoreEl.textContent = `${data.validatedScore}/${data.targetScore}`;
      finalPctEl.textContent = `${data.percentage}%`;
      finalRewardEl.textContent = data.virtualReward > 0 ? `+₹${data.virtualReward}` : "₹0";
      finalTierEl.textContent = data.verified ? "Verified" : "Flagged";
      finalVerifiedEl.textContent = `₹${Number(data.walletBalance || 0).toLocaleString()}`;

      // Refresh profile stats silently
      api("/api/auth/me").then((me) => {
        currentUser = me.user;
        currentBadge = me.badge;
        syncUserUI();
      }).catch(() => {});
    } catch (err) {
      finalTierEl.textContent = err.message;
      finalRewardEl.textContent = "0";
    }
  }

  function spawnCelebrationSparks() {
    for (let i = 0; i < 44; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 90 + Math.random() * 260;
      particles.push({
        x: W * 0.5,
        y: H * 0.32,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2.5 + Math.random() * 4.5,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
        color: i % 3 === 0 ? "#fde047" : i % 3 === 1 ? "#8ce8ff" : "#ff82d6"
      });
    }
  }

  function triggerLoss(x, y, isSkull, reasonText) {
    if (state !== "playing") return;
    lastOutcome = "lost";
    impactIsSkull = isSkull;
    impactPoint = { x, y };
    lossReason = reasonText;
    impactTimer = 0.85;
    shakeTime = 0.55;
    shakeMag = isSkull ? 14 : 18;
    audio.playExplosion(isSkull);

    const burstColor = isSkull ? "#ff7c2b" : "#ffd27d";
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 300;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (isSkull ? 0 : 80),
        r: 2.5 + Math.random() * 5.5,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        color: i % 2 === 0 ? "#ffffff" : burstColor
      });
    }
    setState("impact");
  }

  function triggerRoundEnd() {
    if (state !== "playing") return;
    audio.playStartBurst();
    for (const ent of entities) {
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 40 + Math.random() * 140;
        particles.push({
          x: ent.x,
          y: ent.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          r: 2 + Math.random() * 2.5,
          life: 0.45,
          maxLife: 0.45,
          color: "#9ef8ff"
        });
      }
    }
    entities = [];
    submitMatchOutcome(true);
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
      r: type === "skull" ? W * 0.066 : type === "star" ? W * 0.052 : rand(W * 0.048, W * 0.06, matchRng),
      rot: rand(0, Math.PI * 2, matchRng),
      rotSpeed: rand(-2.8, 2.8, matchRng),
      craterSeed: rand(0, 100, matchRng),
      weaveAmp: opts.weaveAmp || 0,
      weaveFreq: opts.weaveFreq || 0,
      diveBoost: Boolean(opts.diveBoost),
      boosted: false,
      sliced: false
    };
  }

  function spawnWaveEntities() {
    const duration = activeMatch ? activeMatch.durationSeconds : 45;
    const elapsed = duration - roundRemaining;
    const progress = clamp(elapsed / duration, 0, 1);
    const diffScale = Number(activeMatch?.difficulty?.speedScale || 1.0);
    const skullBoost = Number(activeMatch?.difficulty?.skullChanceBoost || 0);

    wave = Math.min(5, 1 + Math.floor(progress * 5));
    const speedScale = (1.0 + progress * 0.88) * diffScale;

    const patterns = ["standard"];
    if (wave >= 2) patterns.push("crossfire", "sine_weave");
    if (wave >= 3) patterns.push("dive_boost", "skull_escort");
    if (wave >= 4) patterns.push("meteor_storm");

    const pattern = patterns[Math.floor(matchRng() * patterns.length)];

    if (pattern === "crossfire") {
      const speed = rand(215, 265, matchRng) * speedScale;
      entities.push(createEntity("comet", W * 0.14, -40, W * 0.8, speed));
      entities.push(createEntity("comet", W * 0.86, -72, W * 0.2, speed));
      if (matchRng() < 0.55 + skullBoost) {
        entities.push(createEntity("skull", W * 0.5, -55, W * 0.5, speed * 1.02));
      }
      return;
    }

    if (pattern === "sine_weave") {
      const count = wave >= 4 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        const isSkull = i === count - 1 && matchRng() < 0.45 + skullBoost;
        const x = rand(W * 0.22, W * 0.78, matchRng);
        entities.push(
          createEntity(isSkull ? "skull" : "comet", x, -45 - i * 60, x, rand(195, 250, matchRng) * speedScale, {
            weaveAmp: rand(65, 115, matchRng),
            weaveFreq: rand(4.2, 6.2, matchRng)
          })
        );
      }
      return;
    }

    if (pattern === "dive_boost") {
      const x1 = rand(W * 0.18, W * 0.82, matchRng);
      const x2 = clamp(x1 + (x1 > W * 0.5 ? -W * 0.34 : W * 0.34), W * 0.15, W * 0.85);
      entities.push(createEntity("comet", x1, -40, rand(W * 0.2, W * 0.8, matchRng), 165 * speedScale, { diveBoost: true }));
      entities.push(createEntity("comet", x2, -85, rand(W * 0.2, W * 0.8, matchRng), 180 * speedScale, { diveBoost: true }));
      return;
    }

    if (pattern === "skull_escort") {
      const cx = rand(W * 0.26, W * 0.74, matchRng);
      const speed = rand(210, 255, matchRng) * speedScale;
      entities.push(createEntity("comet", cx, -50, cx + rand(-30, 30, matchRng), speed));
      entities.push(createEntity("skull", cx - W * 0.15, -62, cx - W * 0.14, speed * 1.03));
      entities.push(createEntity("skull", cx + W * 0.15, -62, cx + W * 0.14, speed * 1.03));
      return;
    }

    if (pattern === "meteor_storm") {
      const lanes = [0.16, 0.38, 0.62, 0.84].sort(() => matchRng() - 0.5);
      for (let i = 0; i < 3; i++) {
        const x = W * lanes[i];
        entities.push(
          createEntity("comet", x, -40 - i * 44, clamp(x + rand(-60, 60, matchRng), W * 0.15, W * 0.85), rand(225, 285, matchRng) * speedScale)
        );
      }
      if (matchRng() < 0.7) {
        entities.push(
          createEntity("skull", W * lanes[3], -70, W * 0.5, rand(220, 270, matchRng) * speedScale, {
            weaveAmp: 55,
            weaveFreq: 5.0
          })
        );
      }
      return;
    }

    const count = wave >= 3 ? 2 : matchRng() < 0.45 ? 2 : 1;
    const usedX = [];
    for (let i = 0; i < count; i++) {
      let type = "comet";
      const skullChance = clamp(0.18 + wave * 0.04 + skullBoost, 0.18, 0.42);
      if (i > 0 || matchRng() < 0.45) {
        if (matchRng() < skullChance) type = "skull";
      }
      if (type === "comet" && wave >= 2 && matchRng() < 0.07) {
        type = "star";
      }

      let x = rand(W * 0.14, W * 0.86, matchRng);
      for (let tries = 0; tries < 5; tries++) {
        if (usedX.every((ux) => Math.abs(ux - x) > W * 0.17)) break;
        x = rand(W * 0.14, W * 0.86, matchRng);
      }
      usedX.push(x);

      const targetX = clamp(x + rand(-W * 0.24, W * 0.24, matchRng), W * 0.14, W * 0.86);
      const speed = rand(185, 245, matchRng) * speedScale;
      entities.push(createEntity(type, x, -42 - i * 48, targetX, speed));
    }
  }

  function spawnSliceExplosion(ent, cutAngle) {
    const isStar = ent.type === "star";
    const mainColor = isStar ? "#fde047" : "#bae6fd";
    const glowColor = isStar ? "#38bdf8" : "#f59e0b";

    const perp = cutAngle + Math.PI * 0.5;
    for (let side = -1; side <= 1; side += 2) {
      const speed = 110 + Math.random() * 80;
      shards.push({
        x: ent.x + Math.cos(perp) * side * 6,
        y: ent.y + Math.sin(perp) * side * 6,
        vx: ent.vx * 0.35 + Math.cos(perp) * side * speed,
        vy: ent.vy * 0.25 + Math.sin(perp) * side * speed - 45,
        r: ent.r * 0.72,
        rot: cutAngle + (side > 0 ? 0 : Math.PI),
        rotSpeed: side * (4 + Math.random() * 4),
        life: 0.55,
        maxLife: 0.55,
        color: isStar ? "#fef08a" : "#7dd3fc"
      });
    }

    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 230;
      particles.push({
        x: ent.x,
        y: ent.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: 2 + Math.random() * 3.5,
        life: 0.28 + Math.random() * 0.3,
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
          triggerLoss(ent.x, ent.y, true, "You hit a Void Plasma Mine!");
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

        syncHud();
        if (activeMatch && activeMatch.mode === "duel_arena" && socket && socket.connected) {
          socket.emit("duel:progress", { score, mistakes });
        }
      }
    }
  }

  function triggerTitleStart(cutAngle) {
    if (titleCometSliced) return;
    titleCometSliced = true;
    titleTransition = 0.36;
    audio.playStartBurst();

    const orb = getTitleOrbGeometry();
    spawnSliceExplosion(
      { type: "comet", x: orb.cx, y: orb.cy, vx: 0, vy: 0, r: W * 0.095 },
      cutAngle
    );
  }

  function resetToTitle() {
    titleCometSliced = false;
    titleTransition = 0;
    activeMatch = null;
    entities = [];
    particles = [];
    shards = [];
    popups = [];
    bgMeteors = [];
    setState("title");
    syncUserUI();
  }

  // Stars & Canvas Resize
  function initStars() {
    stars = [];
    for (let i = 0; i < 42; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random() * 0.88,
        size: 1.1 + Math.random() * 1.7,
        cross: Math.random() < 0.32,
        phase: Math.random() * Math.PI * 2,
        speed: 1.2 + Math.random() * 2.0
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

  // Simulation Update
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
          x: fromRight ? W * (0.35 + Math.random() * 0.7) : -30 + Math.random() * (W * 0.4),
          y: -25,
          vx: fromRight ? -(130 + Math.random() * 80) : 100 + Math.random() * 70,
          vy: 140 + Math.random() * 80,
          len: 42 + Math.random() * 32,
          r: 3.5 + Math.random() * 2
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
          titleCometSliced = false;
          openHub("quickplay");
        }
      }
    }

    if (state === "playing") {
      // Animated fire embers rising subtly from horizon
      if (Math.random() < dt * 16 && fireEmbers.length < 28) {
        fireEmbers.push({
          x: Math.random() * W,
          y: H - 10,
          vx: (Math.random() - 0.5) * 28,
          vy: -(38 + Math.random() * 55),
          r: 1.5 + Math.random() * 2.5,
          life: 0.9 + Math.random() * 0.7,
          maxLife: 1.6,
          color: Math.random() < 0.5 ? "#ffb057" : "#ff6b3d"
        });
      }

      const prevTimer = Math.ceil(roundRemaining);
      roundRemaining = Math.max(0, roundRemaining - dt);
      if (Math.ceil(roundRemaining) !== prevTimer) {
        syncHud();
      }

      if (roundRemaining <= 0) {
        triggerRoundEnd();
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
      const duration = activeMatch ? activeMatch.durationSeconds : 45;
      const progress = clamp((duration - roundRemaining) / duration, 0, 1);

      spawnTimer -= dt * timeScale;
      if (spawnTimer <= 0) {
        spawnWaveEntities();
        const interval = clamp(1.16 - progress * 0.68, 0.44, 1.16);
        spawnTimer = rand(interval * 0.8, interval * 1.15, matchRng);
      }

      const planet = getPlanetGeometry();
      const maxMistakes = activeMatch ? activeMatch.maxMistakes : 2;

      for (let i = entities.length - 1; i >= 0; i--) {
        const ent = entities[i];

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

            if (activeMatch && activeMatch.mode === "duel_arena" && socket && socket.connected) {
              socket.emit("duel:progress", { score, mistakes });
            }

            if (mistakes > maxMistakes) {
              triggerLoss(ent.x, ent.y, false, "Planetary shields shattered! Exceeded allowed mistakes.");
              return;
            } else {
              shakeTime = 0.28;
              shakeMag = 10;
              audio.playExplosion(false);
              const shieldsLeft = maxMistakes + 1 - mistakes;
              addPopup(ent.x, ent.y - 26, `SHIELD HIT! (${shieldsLeft} left)`, "#ff8a70");
              for (let p = 0; p < 14; p++) {
                const ang = Math.PI + Math.random() * Math.PI;
                const spd = 60 + Math.random() * 150;
                particles.push({
                  x: ent.x,
                  y: ent.y,
                  vx: Math.cos(ang) * spd,
                  vy: Math.sin(ang) * spd,
                  r: 2 + Math.random() * 3,
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
        submitMatchOutcome(false);
      }
    }

    for (let i = fireEmbers.length - 1; i >= 0; i--) {
      const f = fireEmbers[i];
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) fireEmbers.splice(i, 1);
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

  // Drawing Helpers (Original Nakshatra Cut Astral Artwork)
  function drawStarCross(x, y, size, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#e0f2fe";
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
        ctx.fillStyle = `rgba(224, 242, 254, ${(twinkle * 0.75 * tintAlpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawComet(x, y, r, vx, vy, rot, tailScale = 1, danger = 0, boosted = false) {
    const speed = Math.hypot(vx, vy) || 1;
    const angle = Math.atan2(-vy / speed, -vx / speed);
    const tailLen = r * 5.4 * tailScale * (boosted ? 1.35 : 1);

    ctx.save();
    ctx.translate(x, y);

    if (danger > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(245, 158, 11, ${(0.72 * danger).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.42 + 0.14 * Math.sin(time * 18)), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(angle);

    // Electric Cyan -> Solar Saffron plasma tail
    const outerGrad = ctx.createLinearGradient(0, 0, tailLen, 0);
    outerGrad.addColorStop(0, boosted ? "rgba(251, 191, 36, 0.96)" : "rgba(56, 189, 248, 0.92)");
    outerGrad.addColorStop(0.38, "rgba(37, 99, 235, 0.65)");
    outerGrad.addColorStop(0.74, "rgba(245, 158, 11, 0.34)");
    outerGrad.addColorStop(1, "rgba(14, 165, 233, 0)");

    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.12, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(tailLen, 0);
    ctx.closePath();
    ctx.fill();

    const innerGrad = ctx.createLinearGradient(0, 0, tailLen * 0.58, 0);
    innerGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
    innerGrad.addColorStop(0.45, "rgba(125, 211, 252, 0.65)");
    innerGrad.addColorStop(1, "rgba(251, 191, 36, 0)");
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(tailLen * 0.58, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Faceted Crystalline Meteoroid Body
    ctx.rotate(rot);
    const sides = 7;
    const bodyGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.15);
    bodyGrad.addColorStop(0, "#e0f2fe");
    bodyGrad.addColorStop(0.5, "#38bdf8");
    bodyGrad.addColorStop(1, "#1e3a8a");

    ctx.shadowColor = boosted ? "rgba(251, 191, 36, 0.95)" : "rgba(56, 189, 248, 0.85)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rad = r * (i % 2 === 0 ? 1.08 : 0.86);
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Glowing golden crystalline vein inside meteoroid
    ctx.strokeStyle = "rgba(253, 224, 71, 0.75)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.15);
    ctx.lineTo(0, r * 0.1);
    ctx.lineTo(r * 0.42, -r * 0.25);
    ctx.moveTo(0, r * 0.1);
    ctx.lineTo(-r * 0.1, r * 0.52);
    ctx.stroke();

    ctx.restore();
  }

  function drawHazardMine(ent) {
    const { x, y, r, rot } = ent;
    ctx.save();
    ctx.translate(x, y);

    // Pulsing Crimson Warning Halo
    const pulse = 1.28 + 0.14 * Math.sin(time * 10 + ent.craterSeed);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.55)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating 8-Spike Void Plasma Mine
    ctx.rotate(rot * 1.1);
    ctx.shadowColor = "rgba(239, 68, 68, 0.85)";
    ctx.shadowBlur = 16;

    const spikeGrad = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r * 1.4);
    spikeGrad.addColorStop(0, "#fb923c");
    spikeGrad.addColorStop(0.65, "#dc2626");
    spikeGrad.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = spikeGrad;

    ctx.beginPath();
    const spikes = 16;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * 1.38 : r * 0.78;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Dark carbon armored octagon core
    ctx.fillStyle = "#180912";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = Math.cos(a) * r * 0.7;
      const py = Math.sin(a) * r * 0.7;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Unstable crimson-gold plasma eye core
    const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 0.42);
    coreGrad.addColorStop(0, "#fef08a");
    coreGrad.addColorStop(0.5, "#ef4444");
    coreGrad.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
    ctx.fill();

    // Hazard X cross
    ctx.strokeStyle = "#180912";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.22, -r * 0.22);
    ctx.lineTo(r * 0.22, r * 0.22);
    ctx.moveTo(r * 0.22, -r * 0.22);
    ctx.lineTo(-r * 0.22, r * 0.22);
    ctx.stroke();

    ctx.restore();
  }

  function drawStarCrystal(ent) {
    const { x, y, r, rot } = ent;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.strokeStyle = "rgba(253, 224, 71, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowColor = "rgba(251, 191, 36, 0.9)";
    ctx.shadowBlur = 18;
    const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.5, "#fde047");
    grad.addColorStop(1, "#0ea5e9");

    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * 1.18 : r * 0.42;
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

    // Protective Orbital Energy Shield Arc above Nakshatra Planet
    if (!shattered) {
      const shieldColor =
        mistakes === 0
          ? "rgba(52, 211, 153, 0.45)"
          : mistakes === 1
            ? "rgba(251, 191, 36, 0.45)"
            : "rgba(239, 68, 68, 0.5)";
      ctx.save();
      ctx.strokeStyle = shieldColor;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = shieldColor;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 8, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    const bodyGrad = ctx.createLinearGradient(cx, cy - radius, cx, H);
    if (shattered) {
      bodyGrad.addColorStop(0, "#64748b");
      bodyGrad.addColorStop(0.55, "#334155");
      bodyGrad.addColorStop(1, "#0f172a");
    } else {
      bodyGrad.addColorStop(0, "#22d3ee");
      bodyGrad.addColorStop(0.45, "#0369a1");
      bodyGrad.addColorStop(1, "#08203e");
    }

    ctx.fillStyle = bodyGrad;
    ctx.fillRect(0, cy - radius - 10, W, radius + 30);

    // Golden-teal planetary atmosphere bands & crystalline ridges
    ctx.strokeStyle = shattered ? "rgba(148, 163, 184, 0.25)" : "rgba(253, 224, 71, 0.28)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy + 28, radius * 0.94, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();

    ctx.fillStyle = shattered ? "#475569" : "rgba(16, 185, 129, 0.35)";
    ctx.beginPath();
    ctx.ellipse(W * 0.28, H - W * 0.11, W * 0.16, W * 0.04, -0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = shattered ? "#334155" : "rgba(251, 191, 36, 0.3)";
    ctx.beginPath();
    ctx.ellipse(W * 0.74, H - W * 0.09, W * 0.18, W * 0.045, 0.12, 0, Math.PI * 2);
    ctx.fill();

    if (mistakes > 0 || shattered) {
      ctx.strokeStyle = shattered ? "#f97316" : "rgba(248, 113, 113, 0.85)";
      ctx.lineWidth = shattered ? 4.5 : 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(W * 0.14, H - W * 0.03);
      ctx.lineTo(W * 0.27, H - W * 0.085);
      ctx.lineTo(W * 0.38, H - W * 0.05);
      if (mistakes >= 2 || shattered) {
        ctx.lineTo(W * 0.51, H - W * 0.11);
        ctx.lineTo(W * 0.64, H - W * 0.06);
      }
      if (shattered) {
        ctx.lineTo(W * 0.78, H - W * 0.095);
        ctx.lineTo(W * 0.9, H - W * 0.03);
      }
      ctx.stroke();
    }

    if (shattered) {
      const glow = ctx.createRadialGradient(impactPoint.x, impactPoint.y, 4, impactPoint.x, impactPoint.y, W * 0.24);
      glow.addColorStop(0, "rgba(255, 240, 180, 0.95)");
      glow.addColorStop(0.45, "rgba(239, 68, 68, 0.65)");
      glow.addColorStop(1, "rgba(239, 68, 68, 0)");
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
    ctx.shadowColor = "rgba(56, 189, 248, 0.95)";
    ctx.shadowBlur = 14;
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < leftSide.length; i++) ctx.lineTo(leftSide[i].x, leftSide[i].y);
    const tip = pts[pts.length - 1];
    ctx.lineTo(tip.x, tip.y);
    for (let i = rightSide.length - 1; i >= 1; i--) ctx.lineTo(rightSide[i].x, rightSide[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function renderTitleScene() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#040818");
    bg.addColorStop(0.48, "#0c2252");
    bg.addColorStop(1, "#06112b");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const neb = ctx.createRadialGradient(W * 0.84, H * 0.16, 10, W * 0.84, H * 0.16, W * 0.56);
    neb.addColorStop(0, "rgba(14, 165, 233, 0.42)");
    neb.addColorStop(0.55, "rgba(245, 158, 11, 0.16)");
    neb.addColorStop(1, "rgba(6, 17, 43, 0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, H);

    drawStars(0.95);

    for (const m of bgMeteors) {
      drawComet(m.x, m.y, m.r, m.vx, m.vy, 0, 1.35, 0, false);
    }

    const orb = getTitleOrbGeometry();
    const aura = ctx.createRadialGradient(orb.cx, orb.cy, orb.r * 0.72, orb.cx, orb.cy, orb.r * 1.28);
    aura.addColorStop(0, "rgba(56, 189, 248, 0.6)");
    aura.addColorStop(0.65, "rgba(245, 158, 11, 0.2)");
    aura.addColorStop(1, "rgba(6, 17, 43, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(orb.cx, orb.cy, orb.r * 1.28, 0, Math.PI * 2);
    ctx.fill();

    // Rotating Nakshatra Golden Ring around portal
    ctx.save();
    ctx.translate(orb.cx, orb.cy);
    ctx.rotate(time * 0.22);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.45)";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, orb.r * 1.07, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#040814";
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
        ctx.strokeStyle = `rgba(56, 189, 248, ${(0.24 / k).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, headR * (1.28 + k * 0.34), 0, Math.PI * 2);
        ctx.stroke();
      }
      drawComet(cx, cy, headR, -1, 0.68, time * 0.45, 1.85, 0, false);
    }
  }

  function renderGameplayScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#050c24");
    sky.addColorStop(0.42, "#0d2454");
    sky.addColorStop(0.76, "#16427a");
    sky.addColorStop(1, "#29749c");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (slowMoTimer > 0) {
      const alpha = clamp(slowMoTimer / 0.5, 0, 1) * 0.16;
      ctx.fillStyle = `rgba(253, 224, 71, ${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawStars(0.9);

    for (const f of fireEmbers) {
      ctx.save();
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1) * 0.7;
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const planet = getPlanetGeometry();
    drawPlanet(state === "impact");

    for (const ent of entities) {
      if (ent.type === "comet") {
        const dist = Math.hypot(ent.x - planet.cx, ent.y - planet.cy) - planet.radius;
        const danger = clamp(1 - dist / (W * 0.24), 0, 1);
        drawComet(ent.x, ent.y, ent.r, ent.vx, ent.vy, ent.rot, 1.0, danger, ent.boosted);
      } else if (ent.type === "skull") {
        drawHazardMine(ent);
      } else if (ent.type === "star") {
        drawStarCrystal(ent);
      }
    }

    if (state === "impact") {
      const elapsed = 0.85 - impactTimer;
      if (elapsed > 0.35) {
        const flashPhase = (elapsed - 0.35) / 0.5;
        const flashAlpha = Math.sin(clamp(flashPhase, 0, 1) * Math.PI);
        ctx.fillStyle = `rgba(255, 255, 255, ${(flashAlpha * 0.96).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function renderGameOverScene() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    if (lastOutcome === "won") {
      sky.addColorStop(0, "#061130");
      sky.addColorStop(0.55, "#0e3a6e");
      sky.addColorStop(1, "#156b8c");
    } else {
      sky.addColorStop(0, "#450a1e");
      sky.addColorStop(0.55, "#991b1b");
      sky.addColorStop(1, "#d97706");
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    drawStars(lastOutcome === "won" ? 0.9 : 0.42);
    if (lastOutcome === "won") {
      drawPlanet(false);
    }
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
      ctx.translate((Math.random() - 0.5) * 2 * mag, (Math.random() - 0.5) * 2 * mag);
    }

    if (state === "title") {
      renderTitleScene();
    } else if (state === "countdown" || state === "playing" || state === "impact") {
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

  // Event Listeners
  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  }

  function pushTrailPoint(x, y) {
    pointer.trail.push({ x, y, t: performance.now() });
    if (pointer.trail.length > 22) pointer.trail.shift();
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (!platformModal.classList.contains("hidden")) return;
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
    setMutedState(nextMuted);
    if (!nextMuted) audio.playClick();
  });

  // Top & Title Buttons
  walletPillBtn.addEventListener("click", () => openHub("wallet"));
  openDailyBtn.addEventListener("click", () => openHub("daily"));
  openLeaderboardBtn.addEventListener("click", () => openHub("leaderboard"));
  openAuthOrProfileBtn.addEventListener("click", () => openHub(currentUser ? "profile" : "auth"));
  ctaQuickPlayBtn.addEventListener("click", () => openHub("quickplay"));
  ctaDuelBtn.addEventListener("click", () => openHub("duel"));
  openDashboardBtn.addEventListener("click", () => openHub("dashboard"));
  openHistoryBtn.addEventListener("click", () => openHub("history"));
  openSettingsBtn.addEventListener("click", () => openHub("profile"));

  // Result Overlay Buttons
  continueBtn.addEventListener("click", () => {
    audio.playClick();
    const action = continueBtn.dataset.action;
    resetToTitle();
    if (action !== "home") {
      openHub(lastPlayedMode === "duel_arena" ? "duel" : "quickplay");
    }
  });
  resultSwitchModeBtn.addEventListener("click", () => {
    resetToTitle();
    openHub("dashboard");
  });
  resultHistoryBtn.addEventListener("click", () => {
    resetToTitle();
    openHub("history");
  });
  resultHomeBtn.addEventListener("click", resetToTitle);

  // Modal & Tabs
  closeModalBtn.addEventListener("click", closePlatformModal);
  platformModal.addEventListener("click", (e) => {
    if (e.target === platformModal) closePlatformModal();
  });

  hubTabsEl.querySelectorAll(".tab-pill").forEach((btn) => {
    btn.addEventListener("click", () => openHub(btn.getAttribute("data-tab")));
  });

  dashGoQuickBtn.addEventListener("click", () => openHub("quickplay"));
  dashGoDuelBtn.addEventListener("click", () => openHub("duel"));

  // Auth Tabs & Forms
  authTabLogin.addEventListener("click", () => {
    authTabLogin.classList.add("active");
    authTabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    authFormStatus.textContent = "";
  });

  authTabRegister.addEventListener("click", () => {
    authTabRegister.classList.add("active");
    authTabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    authFormStatus.textContent = "";
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authFormStatus.textContent = "Signing in...";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: document.getElementById("loginIdentifier").value.trim(),
          password: document.getElementById("loginPassword").value
        })
      });
      saveToken(data.token);
      currentUser = data.user;
      currentWallet = data.wallet;
      currentBadge = data.badge;
      syncUserUI();
      connectSocket();
      openHub(pendingTabAfterLogin || "dashboard");
    } catch (err) {
      authFormStatus.textContent = err.message;
    }
  });

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authFormStatus.textContent = "Creating account & granting 1,000 virtual coins...";
    try {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: document.getElementById("regUsername").value.trim(),
          email: document.getElementById("regEmail").value.trim(),
          password: document.getElementById("regPassword").value,
          avatarColor: document.getElementById("regAvatarColor").value
        })
      });
      saveToken(data.token);
      currentUser = data.user;
      currentWallet = data.wallet;
      currentBadge = data.badge;
      syncUserUI();
      connectSocket();
      openHub(pendingTabAfterLogin || "dashboard");
    } catch (err) {
      authFormStatus.textContent = err.message;
    }
  });

  // Quick Play & Duel Queue Actions
  startQuickPlayBtn.addEventListener("click", startQuickPlayMatch);

  joinDuelQueueBtn.addEventListener("click", () => {
    if (!socket || !socket.connected) {
      connectSocket();
      duelStatus.textContent = "Connecting to Duel Arena server... click again in a moment.";
      return;
    }
    duelStatus.textContent = "";
    socket.emit("duel:join_queue", { entryAmount: selectedDuelEntry });
  });

  cancelDuelQueueBtn.addEventListener("click", () => {
    if (socket && socket.connected) {
      socket.emit("duel:cancel_queue");
    }
  });

  // Leaderboard Filters
  lbPeriodAll.addEventListener("click", () => { lbPeriod = "all"; loadLeaderboardView(); });
  lbPeriodWeekly.addEventListener("click", () => { lbPeriod = "weekly"; loadLeaderboardView(); });
  lbLimit10.addEventListener("click", () => { lbLimit = 10; loadLeaderboardView(); });
  lbLimit50.addEventListener("click", () => { lbLimit = 50; loadLeaderboardView(); });

  // Profile & Settings
  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    profileStatus.textContent = "Saving...";
    const soundEnabled = document.getElementById("profSoundToggle").checked;
    try {
      const data = await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          username: document.getElementById("profUsername").value.trim(),
          avatarColor: document.getElementById("profAvatarColor").value,
          settings: { soundEnabled, showHints: true }
        })
      });
      currentUser = data.user;
      currentBadge = data.badge;
      setMutedState(!soundEnabled);
      syncUserUI();
      renderProfileView();
      profileStatus.textContent = "Profile & settings saved.";
    } catch (err) {
      profileStatus.textContent = err.message;
    }
  });

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    profileStatus.textContent = "Updating password...";
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: document.getElementById("profCurPwd").value,
          newPassword: document.getElementById("profNewPwd").value
        })
      });
      passwordForm.reset();
      profileStatus.textContent = "Password updated securely.";
    } catch (err) {
      profileStatus.textContent = err.message;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (_) {}
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    saveToken("");
    currentUser = null;
    currentWallet = { balance: 0, totalEarned: 0, totalSpent: 0 };
    closePlatformModal();
    resetToTitle();
  });

  // Boot
  initStars();
  resize();
  global.addEventListener("resize", resize);
  if (global.ResizeObserver) {
    new global.ResizeObserver(resize).observe(canvas);
  }
  restoreSession();
  setState("title");
  global.requestAnimationFrame(loop);
})(window);
