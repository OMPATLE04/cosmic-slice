(function () {
  "use strict";

  const authCard = document.getElementById("authCard");
  const authForm = document.getElementById("authForm");
  const pinInput = document.getElementById("pinInput");
  const authStatus = document.getElementById("authStatus");
  const dashboard = document.getElementById("dashboard");
  const refreshBtn = document.getElementById("refreshBtn");

  const statGames = document.getElementById("statGames");
  const statWinRate = document.getElementById("statWinRate");
  const statCredited = document.getElementById("statCredited");
  const statFlagged = document.getElementById("statFlagged");

  const tiersFields = document.getElementById("tiersFields");
  const durationInput = document.getElementById("durationInput");
  const targetScoreInput = document.getElementById("targetScoreInput");
  const maxMistakesInput = document.getElementById("maxMistakesInput");
  const configForm = document.getElementById("configForm");
  const configStatus = document.getElementById("configStatus");
  const resetHistoryBtn = document.getElementById("resetHistoryBtn");
  const historyBody = document.getElementById("historyBody");
  const securityBody = document.getElementById("securityBody");

  let adminPin = "";
  let currentConfig = null;

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
    currentConfig = data.config;
    statGames.textContent = String(data.stats.totalGames);
    statWinRate.textContent = `${data.stats.winRate}%`;
    statCredited.textContent = `₹${data.wallet.totalCredited}`;
    statFlagged.textContent = String(data.stats.flagged);

    durationInput.value = String(data.config.durationSeconds);
    targetScoreInput.value = String(data.config.targetScore);
    maxMistakesInput.value = String(data.config.maxMistakes);

    tiersFields.innerHTML = "";
    data.config.rewardTiers.forEach((tier, idx) => {
      const row = document.createElement("div");
      row.className = "field";
      const label = document.createElement("label");
      label.setAttribute("for", `tier_${idx}`);
      label.textContent = `${tier.label} score reward (₹)`;

      const input = document.createElement("input");
      input.type = "number";
      input.id = `tier_${idx}`;
      input.min = "0";
      input.max = "10000";
      input.value = String(tier.amount);
      input.dataset.index = String(idx);

      row.appendChild(label);
      row.appendChild(input);
      tiersFields.appendChild(row);
    });

    historyBody.innerHTML = "";
    if (!data.history.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" style="color: var(--muted);">No completed games yet.</td>`;
      historyBody.appendChild(tr);
    } else {
      for (const h of data.history) {
        const tr = document.createElement("tr");
        const shortId = h.gameId ? `${h.gameId.slice(0, 8)}…` : "-";
        tr.innerHTML = `
          <td title="${h.gameId}"><code>${shortId}</code></td>
          <td><span class="badge ${h.outcome}">${h.outcome.toUpperCase()}</span></td>
          <td>${h.validatedScore} / ${h.targetScore}</td>
          <td>${h.percentage}%</td>
          <td>${h.mistakes} / ${h.maxMistakes}</td>
          <td>${h.tierLabel}</td>
          <td><strong>₹${h.rewardAmount}</strong></td>
          <td style="color: var(--muted);">${h.lossReason || "Verified completion"}</td>
        `;
        historyBody.appendChild(tr);
      }
    }

    securityBody.innerHTML = "";
    if (!data.securityLog.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="3" style="color: var(--muted);">No security alerts recorded.</td>`;
      securityBody.appendChild(tr);
    } else {
      for (const ev of data.securityLog.slice(0, 20)) {
        const tr = document.createElement("tr");
        const gid = ev.details && ev.details.gameId ? `${String(ev.details.gameId).slice(0, 8)}…` : "-";
        const timeStr = new Date(ev.timestamp).toLocaleTimeString();
        tr.innerHTML = `
          <td>${timeStr}</td>
          <td><span class="badge flagged">${ev.reason}</span></td>
          <td><code>${gid}</code></td>
        `;
        securityBody.appendChild(tr);
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
    if (!currentConfig) return;
    configStatus.textContent = "Saving...";
    const nextTiers = currentConfig.rewardTiers.map((tier, idx) => {
      const el = document.getElementById(`tier_${idx}`);
      return {
        ...tier,
        amount: Number(el ? el.value : tier.amount)
      };
    });

    try {
      await api("/api/admin/config", {
        method: "POST",
        body: JSON.stringify({
          durationSeconds: Number(durationInput.value),
          targetScore: Number(targetScoreInput.value),
          maxMistakes: Number(maxMistakesInput.value),
          rewardTiers: nextTiers
        })
      });
      await loadState();
      configStatus.textContent = "Configuration saved and active immediately.";
    } catch (err) {
      configStatus.textContent = err.message;
    }
  });

  resetHistoryBtn.addEventListener("click", async () => {
    if (!confirm("Reset all stored game history, security logs, and credited wallet total?")) return;
    try {
      await api("/api/admin/reset-history", { method: "POST", body: "{}" });
      await loadState();
      configStatus.textContent = "History and ledger cleared.";
    } catch (err) {
      configStatus.textContent = err.message;
    }
  });
})();
