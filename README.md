# Nakshatra Cut — Virtual Gaming Platform

**Nakshatra Cut** is an arcade meteoroid-slicing virtual gaming platform built with **Node.js, Express, Socket.IO, MongoDB, and HTML5 Canvas**.

> **Virtual Entertainment Notice:** All coins in Cosmic Slice are strictly non-redeemable **Virtual Coins** with zero monetary value. No real-money deposits, withdrawals, or cash prizes exist.

---

## Features

- **Mode 1 — Quick Play (Single Player vs System):**
  - Entry options: `10`, `20`, `50`, `100`, `200`, `500` virtual coins.
  - Auditable server-side CSPRNG outcomes (`45%` win probability, `1.8x` payout, `19%` theoretical house edge, SHA-256 seed commitment revealed on completion).
  - Interactive 5-wave comet & meteor slicing gameplay with progressive difficulty, fire embers, shields, slow-motion star crystals, and skull hazards.
- **Mode 2 — Duel Arena (Real-time 1v1 Multiplayer via Socket.IO):**
  - Live matchmaking queue matching distinct online users with equal entry amounts, timeout & cancel refunds.
  - Synchronized countdown and identical deterministic wave seed for both players.
  - Server-side telemetry anti-cheat validation; higher verified score wins (`10%` virtual accounting fee; `100%` refund on ties; fair disconnect handling).
- **Accounts, Wallets & Progression:**
  - Registration & login with `bcryptjs` password hashing and signed JWT sessions.
  - Every new player starts with `1,000` virtual coins and an immutable `Transactions` ledger (`balance >= 0` enforced atomically).
  - Daily Login Bonus, Login Streaks, Daily Missions, and Achievements with duplicate-claim protection.
  - All-Time & Weekly Leaderboard (Top 10 / Top 50) with ranking badges.
- **Protected Admin Dashboard (`/admin.html`):**
  - Platform metrics, Quick Play & Duel stats, virtual coin accounting, user suspension controls, configurable odds/fees/entry options/daily rewards, and immutable `AuditLogs`.

---

## Project Setup

### 1. Install Dependencies
```bash
cd cosmic-slice
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in your values:
```env
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@cluster0.gv0ihnu.mongodb.net/cosmic_slice?retryWrites=true&w=majority&appName=Cluster0
MONGODB_DB=cosmic_slice
PORT=8765
COSMIC_ADMIN_PIN=your-strong-admin-pin
JWT_SECRET=optional-random-hex-secret
```

### 3. Database Setup (MongoDB)
- Create a MongoDB Atlas cluster (or local MongoDB instance) and add your IP / `0.0.0.0/0` in **Security → Network Access**.
- On startup, `db.js` automatically initializes indexes and default `AdminSettings` across all 9 collections:
  `Users`, `Wallets`, `Transactions`, `Matches`, `GameHistory`, `Leaderboard`, `DailyRewards`, `AdminSettings`, `AuditLogs`.

### 4. Development & Test Commands
```bash
# Start server
npm start

# Run automated end-to-end test suite (requires MONGODB_URI in .env)
npm test
```

### 5. Production Deployment (Render / Railway)
1. Push `cosmic-slice/` to GitHub (`.env` and `node_modules/` are ignored via `.gitignore`).
2. Create a Node Web Service (`Build Command: npm install`, `Start Command: npm start`).
3. Set `MONGODB_URI`, `MONGODB_DB`, and `COSMIC_ADMIN_PIN` in the host's Environment Variables (do not override `PORT`).
