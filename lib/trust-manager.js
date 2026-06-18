/**
 * Multi-Trust Configuration Manager
 * Loads NHS trust-specific configs and resolves the active trust per request.
 *
 * Trust config files: config/trusts/{trust-id}.json
 * Each trust has: name, systems[], urls, credentials, patients[], tags[], defaultScript
 */

import fs from "fs";
import path from "path";

const TRUSTS_DIR = process.env.TRUSTS_DIR || path.resolve(process.cwd(), "config", "trusts");

let trustsCache = null;
let trustsCacheTime = 0;
const CACHE_TTL = 30000;

function getTrustFiles() {
  if (!fs.existsSync(TRUSTS_DIR)) {
    fs.mkdirSync(TRUSTS_DIR, { recursive: true });
    seedDefaultTrust();
    return fs.readdirSync(TRUSTS_DIR).filter(f => f.endsWith(".json"));
  }
  return fs.readdirSync(TRUSTS_DIR).filter(f => f.endsWith(".json"));
}

function loadTrusts() {
  const now = Date.now();
  if (trustsCache && now - trustsCacheTime < CACHE_TTL) return trustsCache;

  const trusts = {};
  for (const file of getTrustFiles()) {
    try {
      const fp = path.join(TRUSTS_DIR, file);
      const content = JSON.parse(fs.readFileSync(fp, "utf-8"));
      const id = path.basename(file, ".json");
      trusts[id] = { id, ...content };
    } catch (err) {
      console.error(`[TrustManager] Failed to load ${file}:`, err.message);
    }
  }

  trustsCache = trusts;
  trustsCacheTime = now;
  return trusts;
}

function seedDefaultTrust() {
  const defaultTrust = {
    name: "Default Trust",
    nhsRegion: "England",
    systems: ["Surrey ICE", "HPV ICE", "Winpath Enterprise", "BloodTrack", "Cellavision", "Immulink", "WES", "Cyres"],
    urls: {
      "Surrey ICE": "",
      "Winpath Enterprise": "",
      "BloodTrack": "",
      "Cellavision": ""
    },
    credentials: {
      username: "",
      password: ""
    },
    tags: ["default"],
    patients: [],
    defaultScript: ""
  };
  const fp = path.join(TRUSTS_DIR, "default.json");
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, JSON.stringify(defaultTrust, null, 2));
    console.log("[TrustManager] Created default trust config");
  }
}

export function getTrusts() {
  return loadTrusts();
}

export function getTrust(id) {
  const trusts = loadTrusts();
  return trusts[id] || null;
}

export function setTrust(id, config) {
  const fp = path.join(TRUSTS_DIR, `${id}.json`);
  fs.writeFileSync(fp, JSON.stringify(config, null, 2));
  trustsCache = null;
  return getTrust(id);
}

export function deleteTrust(id) {
  if (id === "default") throw new Error("Cannot delete the default trust");
  const fp = path.join(TRUSTS_DIR, `${id}.json`);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  trustsCache = null;
}

export function getTrustsSummary() {
  const trusts = loadTrusts();
  return Object.entries(trusts).map(([id, t]) => ({
    id,
    name: t.name || id,
    nhsRegion: t.nhsRegion || "Unknown",
    systemCount: (t.systems || []).length,
    patientCount: (t.patients || []).length,
    configured: !!(t.urls && Object.values(t.urls).some(v => v))
  }));
}

export function resolveTrust(req) {
  const trusts = loadTrusts();
  const trustId = req.headers["x-trust-id"] || req.query.trust || req.body?.trustId || process.env.DEFAULT_TRUST || "default";
  const trust = trusts[trustId];
  if (!trust) return { id: "default", ...trusts["default"], warning: `Trust '${trustId}' not found, using default` };
  return { id: trustId, ...trust };
}

export function getPatientsForTrust(trustId, allPatients) {
  const trust = getTrust(trustId);
  if (!trust || !trust.tags?.length) return allPatients || [];
  const trustTags = trust.tags.map(t => t.toLowerCase());
  return (allPatients || []).filter(p =>
    p.tags?.some(pt => trustTags.includes(pt.toLowerCase())) ||
    p.systems?.some(ps => trust.systems?.some(ts => ps.toLowerCase().includes(ts.toLowerCase())))
  );
}

export function clearTrustCache() { trustsCache = null; }
