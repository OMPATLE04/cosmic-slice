(function () {
  "use strict";

  const authCard = document.getElementById("authCard");
  const authForm = document.getElementById("authForm");
  const pinInput = document.getElementById("pinInput");
  const authStatus = document.getElementById("authStatus");
  const dashboard = document.getElementById("dashboard");
  const refreshBtn = document.getElementById("refreshBtn");

  const statUsers = document.getElementById("statUsers");
  const statActiveUsers = document.getElementById("statActiveUsers");
  const statMatches = document.getElementById("statMatches");
  const statLiveDuels = document.getElementById("statLiveDuels");
  const statQuickPlay = document.getElementById("statQuickPlay");
  const statQuickPlayWin = document.getElementById("statQuickPlayWin");
  const statDuels = document.getElementById("statDuels");
  const statDuelTies = document.getElementById("statDuelTies");
  const statIssued = document.getElementById("statIssued");
  const statCirculating = document.getElementById("statCirculating");
  const statSpent = document.getElementById("statSpent");
  const statPlatformFees = document.getElementById("statPlatformFees");
  const statFraud = document.getElementById("statFraud");

  const configForm = document.getElementById("configForm");
  const configStatus = document.getElementById("configStatus");
  const qpWinProb = document.getElementById("qpWinProb");
  const qpMult = document.getElementById("qpMult");
  const qpDuration = document.getElementById("qpDuration");
  const qpTarget = document.getElementById("qpTarget");
  const qpMistakes = document.getElementById("qpMistakes");
  const duelFeePct = document.getElementById("duelFeePct");
  const duelTimeout = document.getElementById("duelTimeout");
  const entryOptionsInput = document.getElementById("entryOptionsInput");
  const drLogin = document.getElementById("drLogin");
  const drPlay3 = document.getElementById("drPlay3");
  const drWin2 = document.getElementById("drWin2");
  const diffSpeed = document.getElementById("diffSpeed");

  const auditBody = document.getElementById("auditBody");
  const usersBody = document.getElementById("usersBody");
  const historyBody = document.getElementById("historyBody");

  let adminPin = "";

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-pin": adminPin,
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function renderDashboard(data) {
    const s = data.stats || {};
    const live = data.liveDuel || {};
    statUsers.textContent = String(s.totalUsers || 0);
    statActiveUsers.textContent = `${s.activeUsers24h || 0} active (24h)`;
    statMatches.textContent = String(s.totalMatches || 0);
    statLiveDuels.textContent = `${live.activeDuels || 0} active duels • ${live.queuedPlayers || 0} queued`;
    statQuickPlay.textContent = String(s.quickPlayTotal || 0);
    statQuickPlayWin.textContent = `${s.quickPlayWinRate || 0}% system win rate`;
    statDuels.textContent = String(s.duelTotal || 0);
    statDuelTies.textContent = `${s.duelTies || 0} ties refunded`;
    statIssued.textContent = `${Number(s.totalCoinsIssued || 0).toLocaleString()} coins`;
    statCirculating.textContent = `${Number(s.totalCirculatingCoins || 0).toLocaleString()} circulating`;
    statSpent.textContent = `${Number(s.totalCoinsSpent || 0).toLocaleString()} coins`;
    statPlatformFees.textContent = `${Number(s.totalDuelVirtualFees || 0).toLocaleString()} virtual fees`;
    statFraud.textContent = String(s.fraudAlertsCount || 0);

    const cfg = data.config || {};
    const qp = cfg.quickPlay || {};
    const da = cfg.duelArena || {};
    const dr = cfg.dailyRewards || {};
    const diff = cfg.difficulty || {};

    qpWinProb.value = String(qp.winProbabilityPct ?? 45);
    qpMult.value = String(qp.payoutMultiplier ?? 1.8);
    qpDuration.value = String(qp.durationSeconds ?? 45);
    qpTarget.value = String(qp.targetScore ?? 95);
    qpMistakes.value = String(qp.maxMistakes ?? 2);

    duelFeePct.value = String(da.platformFeePct ?? 10);
    duelTimeout.value = String(da.matchmakingTimeoutSec ?? 45);
    entryOptionsInput.value = (qp.entryOptions || [10, 20, 50, 100, 200, 500]).join(", ");

    drLogin.value = String(dr.dailyLogin ?? 50);
    drPlay3.value = String(dr.missionPlay3 ?? 30);
    drWin2.value = String(dr.missionWin2 ?? 50);
    diffSpeed.value = String(diff.speedScale ?? 1.0);

    auditBody.innerHTML = "";
    const logs = data.auditLogs || [];
    if (!logs.length) {
      auditBody.innerHTML = `<tr><td colspan="4" style="color: var(--muted);">No audit or fraud logs yet.</td></tr>`;
    } else {
      for (const ev of logs.slice(0, 40)) {
        const tr = document.createElement("tr");
        const timeStr = new Date(ev.createdAt).toLocaleString();
        tr.innerHTML = `
          <td>${esc(timeStr)}</td>
          <td><span class="badge ${esc(ev.category)}">${esc(ev.category)}</span></td>
          <td>${esc(ev.action)}</td>
          <td><code>${esc(ev.actorUserId)}</code></td>
        `;
        auditBody.appendChild(tr);
      }
    }

    usersBody.innerHTML = "";
    const users = data.users || [];
    if (!users.length) {
      usersBody.innerHTML = `<tr><td colspan="8" style="color: var(--muted);">No registered players yet.</td></tr>`;
    } else {
      for (const u of users) {
        const tr = document.createElement("tr");
        const nextStatus = u.status === "suspended" ? "active" : "suspended";
        const btnLabel = u.status === "suspended" ? "Activate" : "Suspend";
        tr.innerHTML = `
          <td><code>${esc(u.userId)}</code></td>
          <td><strong>${esc(u.username)}</strong></td>
          <td style="color: var(--muted);">${esc(u.email)}</td>
          <td><strong>${Number(u.wallet?.balance || 0).toLocaleString()}</strong></td>
          <td>${Number(u.stats?.totalMatches || 0)} / ${Number(u.stats?.wins || 0)}</td>
          <td>${Number(u.stats?.highestScore || 0)}</td>
          <td><span class="badge ${esc(u.status)}">${esc(u.status).toUpperCase()}</span></td>
          <td><button class="btn small ${u.status === "suspended" ? "primary" : "danger"}" data-uid="${esc(u.userId)}" data-next="${nextStatus}">${btnLabel}</button></td>
        `;
        usersBody.appendChild(tr);
      }
      usersBody.querySelectorAll("button[data-uid]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const uid = btn.getAttribute("data-uid");
          const next = btn.getAttribute("data-next");
          try {
            await api(`/api/admin/users/${encodeURIComponent(uid)}/status`, {
              method: "POST",
              body: JSON.stringify({ status: next })
            });
            await loadState();
          } catch (err) {
            configStatus.textContent = err.message;
          }
        });
      });
    }

    historyBody.innerHTML = "";
    const matches = data.recentMatches || [];
    if (!matches.length) {
      historyBody.innerHTML = `<tr><td colspan="8" style="color: var(--muted);">No completed matches yet.</td></tr>`;
    } else {
      for (const m of matches) {
        const tr = document.createElement("tr");
        const shortId = m.matchId ? `${m.matchId.slice(0, 8)}…` : "-";
        const modeLabel = m.mode === "duel_arena" ? "DUEL ARENA" : "QUICK PLAY";
        tr.innerHTML = `
          <td title="${esc(m.matchId)}"><code>${esc(shortId)}</code></td>
          <td>${modeLabel}</td>
          <td>${esc(m.username)}</td>
          <td>${esc(m.opponentUsername || "System RNG")}</td>
          <td>${Number(m.entryAmount || 0)}</td>
          <td>${Number(m.playerScore || 0)}</td>
          <td><span class="badge ${esc(m.outcome)}">${esc(m.outcome).toUpperCase()}</span></td>
          <td><strong>${Number(m.virtualReward || 0)} coins</strong></td>
        `;
        historyBody.appendChild(tr);
      }
    }
  }

  async function loadState() {
    const data = await api("/api/admin/state");
    authCard.classList.add("hidden");
    dashboard.classList.remove("hidden");
    refreshBtn.classList.remove("hidden");
    renderDashboard(data);
  }

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    adminPin = pinInput.value.trim();
    authStatus.textContent = "Verifying...";
    try {
      await loadState();
      authStatus.textContent = "";
    } catch (err) {
      authStatus.textContent = err.message;
    }
  });

  refreshBtn.addEventListener("click", () => {
    loadState().catch((err) => {
      configStatus.textContent = err.message;
    });
  });

  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    configStatus.textContent = "Saving...";
    const parsedEntries = entryOptionsInput.value
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 5);

    try {
      await api("/api/admin/config", {
        method: "POST",
        body: JSON.stringify({
          quickPlay: {
            winProbabilityPct: Number(qpWinProb.value),
            payoutMultiplier: Number(qpMult.value),
            durationSeconds: Number(qpDuration.value),
            targetScore: Number(qpTarget.value),
            maxMistakes: Number(qpMistakes.value),
            entryOptions: parsedEntries
          },
          duelArena: {
            platformFeePct: Number(duelFeePct.value),
            matchmakingTimeoutSec: Number(duelTimeout.value),
            durationSeconds: Number(qpDuration.value),
            targetScore: Number(qpTarget.value),
            maxMistakes: Number(qpMistakes.value),
            entryOptions: parsedEntries
          },
          dailyRewards: {
            dailyLogin: Number(drLogin.value),
            missionPlay3: Number(drPlay3.value),
            missionWin2: Number(drWin2.value)
          },
          difficulty: {
            speedScale: Number(diffSpeed.value)
          }
        })
      });
      await loadState();
      configStatus.textContent = "Configuration saved and recorded in Audit Logs.";
    } catch (err) {
      configStatus.textContent = err.message;
    }
  });
})();
