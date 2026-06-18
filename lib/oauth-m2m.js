/**
 * OAuth 2.0 Machine-to-Machine Auth
 * Client credentials grant for CI/CD pipeline and external system integration.
 *
 * Config:
 *   M2M_CLIENT_ID — client identifier
 *   M2M_CLIENT_SECRET — client secret
 *   M2M_TOKEN_EXPIRY — token lifetime in seconds (default: 3600)
 */

import crypto from "crypto";

const M2M_CLIENT_ID = process.env.M2M_CLIENT_ID || "";
const M2M_CLIENT_SECRET = process.env.M2M_CLIENT_SECRET || "";
const TOKEN_EXPIRY = parseInt(process.env.M2M_TOKEN_EXPIRY) || 3600;

const tokens = new Map();
const clients = new Map();

if (M2M_CLIENT_ID && M2M_CLIENT_SECRET) {
  clients.set(M2M_CLIENT_ID, { clientSecret: M2M_CLIENT_SECRET, scopes: ["run:test", "read:result", "read:agent", "read:metrics"] });
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function registerClient(clientId, clientSecret, scopes = []) {
  clients.set(clientId, { clientSecret, scopes });
}

export function tokenEndpoint(req, res) {
  const { grant_type, client_id, client_secret, scope } = req.body || {};

  if (grant_type !== "client_credentials") {
    return res.status(400).json({ error: "unsupported_grant_type", error_description: "Only client_credentials supported" });
  }

  const client = clients.get(client_id);
  if (!client || client.clientSecret !== client_secret) {
    return res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
  }

  const accessToken = generateToken();
  const scopes = scope?.split(" ") || client.scopes;
  const expiresIn = TOKEN_EXPIRY;

  tokens.set(accessToken, { clientId: client_id, scopes, createdAt: Date.now(), expiresAt: Date.now() + expiresIn * 1000 });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: scopes.join(" ")
  });
}

export function introspectToken(req, res) {
  const { token } = req.body || {};
  const t = tokens.get(token);
  if (!t || Date.now() > t.expiresAt) {
    return res.json({ active: false });
  }
  res.json({
    active: true,
    client_id: t.clientId,
    scope: t.scopes.join(" "),
    exp: Math.floor(t.expiresAt / 1000)
  });
}

export function m2mMiddleware(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "missing_token" });

  const token = tokens.get(match[1]);
  if (!token || Date.now() > token.expiresAt) {
    return res.status(401).json({ error: "invalid_token", error_description: "Token expired or invalid" });
  }

  req.m2m = { clientId: token.clientId, scopes: token.scopes };
  next();
}

export function requireScopes(...requiredScopes) {
  return (req, res, next) => {
    const scopes = req.m2m?.scopes || [];
    const hasAll = requiredScopes.every(s => scopes.includes(s));
    if (!hasAll) {
      return res.status(403).json({ error: "insufficient_scope", required: requiredScopes, granted: scopes });
    }
    next();
  };
}

export function getM2MStatus() {
  return {
    enabled: clients.size > 0,
    clientCount: clients.size,
    activeTokens: tokens.size,
    tokenExpirySeconds: TOKEN_EXPIRY,
    endpoints: {
      token: "POST /api/oauth/token",
      introspect: "POST /api/oauth/introspect"
    }
  };
}
