"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const TOKEN_TTL = "7d";
const BCRYPT_ROUNDS = 10;

async function hashPassword(plainPassword) {
  return bcrypt.hash(String(plainPassword), BCRYPT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  return bcrypt.compare(String(plainPassword), String(passwordHash));
}

function getJwtSecret(dbSecret) {
  return (process.env.JWT_SECRET || dbSecret || "").trim();
}

function signAuthToken(user, dbSecret) {
  const secret = getJwtSecret(dbSecret);
  if (!secret) throw new Error("JWT secret unavailable");
  return jwt.sign(
    {
      sub: user.userId,
      username: user.username,
      role: user.role || "player"
    },
    secret,
    { expiresIn: TOKEN_TTL }
  );
}

function verifyAuthToken(token, dbSecret) {
  const secret = getJwtSecret(dbSecret);
  if (!token || !secret) return null;
  try {
    return jwt.verify(token, secret);
  } catch (_) {
    return null;
  }
}

function extractBearerToken(req) {
  const authHeader = req.headers && req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function verifyPinToken(expected, provided) {
  if (typeof expected !== "string" || typeof provided !== "string") return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Simple in-memory sliding-window rate limiter per IP + route bucket.
 */
function createRateLimiter({ windowMs = 60000, max = 60, message = "Too many requests, please try again shortly." } = {}) {
  const hits = new Map();

  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits.entries()) {
      if (now - entry.start > windowMs) {
        hits.delete(key);
      }
    }
  }, Math.max(10000, windowMs));
  if (timer.unref) timer.unref();

  return function rateLimitMiddleware(req, res, next) {
    if (process.env.DISABLE_RATE_LIMIT === "1") return next();
    const ip =
      (req.headers["x-forwarded-for"] && String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
      req.socket?.remoteAddress ||
      "local";
    const key = `${ip}:${req.baseUrl || ""}${req.path || ""}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { count: 1, start: now };
      hits.set(key, entry);
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

function createAuthMiddleware(db) {
  async function requireAuth(req, res, next) {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const settings = await db.getAdminSettings();
      const payload = verifyAuthToken(token, settings.hmacSecret);
      if (!payload || !payload.sub) {
        return res.status(401).json({ error: "Invalid or expired session token" });
      }
      const user = await db.findUserById(payload.sub);
      if (!user) {
        return res.status(401).json({ error: "Account not found" });
      }
      if (user.status === "suspended") {
        return res.status(403).json({ error: "Account suspended by administrator" });
      }
      req.user = user;
      req.authPayload = payload;
      return next();
    } catch (err) {
      return next(err);
    }
  }

  async function requireAdmin(req, res, next) {
    try {
      const adminPin = (process.env.COSMIC_ADMIN_PIN || "cosmic-admin").trim();
      const headerPin = req.headers["x-admin-pin"];
      if (typeof headerPin === "string" && verifyPinToken(adminPin, headerPin)) {
        req.adminActor = "pin_admin";
        return next();
      }

      const token = extractBearerToken(req);
      if (token) {
        const settings = await db.getAdminSettings();
        const payload = verifyAuthToken(token, settings.hmacSecret);
        if (payload && payload.sub) {
          const user = await db.findUserById(payload.sub);
          if (user && user.role === "admin" && user.status !== "suspended") {
            req.user = user;
            req.adminActor = user.userId;
            return next();
          }
        }
      }

      return res.status(401).json({ error: "Unauthorized: Admin PIN or admin account required" });
    } catch (err) {
      return next(err);
    }
  }

  return { requireAuth, requireAdmin };
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  extractBearerToken,
  verifyPinToken,
  createRateLimiter,
  createAuthMiddleware
};
