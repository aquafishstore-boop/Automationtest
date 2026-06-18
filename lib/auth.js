/**
 * Authentication Module — LDAP + SAML + Session
 * Supports:
 *   - LDAP bind authentication (Active Directory / OpenLDAP)
 *   - SAML SSO (Azure AD / ADFS)
 *   - Local fallback users (config/auth-users.json)
 *   - Session-based auth with in-memory store
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const AUTH_USERS_FILE = process.env.AUTH_USERS_FILE || path.resolve(process.cwd(), "config", "auth-users.json");
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const LDAP_URL = process.env.LDAP_URL || "";
const LDAP_BASE = process.env.LDAP_BASE || "";
const SAML_ENTRYPOINT = process.env.SAML_ENTRYPOINT || "";
const SAML_ISSUER = process.env.SAML_ISSUER || "uat-tester";
const SESSION_MAX_AGE = parseInt(process.env.SESSION_MAX_AGE) || 86400000;

// In-memory session store
const sessions = new Map();

function loadLocalUsers() {
  if (!fs.existsSync(AUTH_USERS_FILE)) {
    seedDefaultUsers();
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(AUTH_USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function seedDefaultUsers() {
  const dir = path.dirname(AUTH_USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const users = [
    { username: "admin", password: hashPassword("admin"), role: "admin", displayName: "Administrator", trusts: ["default"] },
    { username: "tester", password: hashPassword("tester"), role: "tester", displayName: "UAT Tester", trusts: ["default"] },
    { username: "viewer", password: hashPassword("viewer"), role: "viewer", displayName: "Read Only", trusts: ["default"] }
  ];
  fs.writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2));
}

function hashPassword(pw) {
  return crypto.createHash("sha256").update(pw + "uatsalt").digest("hex");
}

function verifyPassword(pw, hash) {
  return hashPassword(pw) === hash;
}

function generateSession() {
  return crypto.randomBytes(24).toString("base64url");
}

async function authenticateLDAP(username, password) {
  if (!LDAP_URL) return null;
  // Simple LDAP bind via fetch to a REST LDAP gateway if available
  try {
    const resp = await fetch(`${LDAP_URL}/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, base: LDAP_BASE }),
      signal: AbortSignal.timeout(5000)
    });
    if (resp.ok) {
      const data = await resp.json();
      return { username, displayName: data.displayName || username, role: data.role || "tester", trusts: data.trusts || ["default"], source: "ldap" };
    }
  } catch {}
  return null;
}

function authenticateLocal(username, password) {
  const users = loadLocalUsers();
  const user = users.find(u => u.username === username);
  if (!user || !verifyPassword(password, user.password)) return null;
  return { username: user.username, displayName: user.displayName || user.username, role: user.role || "tester", trusts: user.trusts || ["default"], source: "local" };
}

export function authenticate(username, password) {
  if (!username || !password) return { error: "Username and password required" };
  // Try LDAP first, then local
  return authenticateLDAP(username, password) || authenticateLocal(username, password) || { error: "Invalid credentials" };
}

export function createSession(user) {
  const sid = generateSession();
  const session = { id: sid, user, createdAt: Date.now(), expiresAt: Date.now() + SESSION_MAX_AGE };
  sessions.set(sid, session);
  return sid;
}

export function getSession(sid) {
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (Date.now() > session.expiresAt) { sessions.delete(sid); return null; }
  return session;
}

export function destroySession(sid) {
  sessions.delete(sid);
}

export function getSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) { if (now > s.expiresAt) sessions.delete(id); }
  return Array.from(sessions.values()).map(s => ({ id: s.id, user: s.user, createdAt: s.createdAt, expiresAt: s.expiresAt }));
}

export function getUsers() {
  return loadLocalUsers().map(u => ({ username: u.username, displayName: u.displayName, role: u.role, trusts: u.trusts }));
}

export function setUser(username, config) {
  const users = loadLocalUsers();
  const idx = users.findIndex(u => u.username === username);
  if (idx >= 0) users[idx] = { ...users[idx], ...config };
  else users.push({ username, password: hashPassword(config.password || "changeme"), role: config.role || "tester", displayName: config.displayName || username, trusts: config.trusts || ["default"] });
  fs.writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2));
}

export function deleteUser(username) {
  let users = loadLocalUsers();
  users = users.filter(u => u.username !== username);
  fs.writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2));
}

// Express middleware
export function authMiddleware(req, res, next) {
  const sid = req.headers["authorization"]?.replace("Bearer ", "") || req.cookies?.session || req.query?.session;
  if (!sid) return res.status(401).json({ error: "Authentication required" });

  const session = getSession(sid);
  if (!session) return res.status(401).json({ error: "Invalid or expired session" });

  req.user = session.user;
  next();
}

export function roleMiddleware(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    next();
  };
}

export function getSAMLAuthURL() {
  if (!SAML_ENTRYPOINT) return null;
  const relayState = SAML_ISSUER;
  return `${SAML_ENTRYPOINT}?RelayState=${relayState}&SAMLRequest=${Buffer.from(`<?xml version="1.0"?><samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" AssertionConsumerServiceURL="${process.env.PUBLIC_URL || "https://localhost:3002"}/api/auth/saml/callback" Destination="${SAML_ENTRYPOINT}" ID="${generateSession()}" IssueInstant="${new Date().toISOString()}" ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Version="2.0"><saml:Issuer xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${SAML_ISSUER}</saml:Issuer></samlp:AuthnRequest>`).toString("base64")}`;
}

export function SAMLConfig() {
  return { entryPoint: SAML_ENTRYPOINT, issuer: SAML_ISSUER, enabled: !!SAML_ENTRYPOINT };
}
