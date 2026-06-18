/**
 * Mobile Pathology Testing Profiles
 * Extends Playwright with mobile device emulation for clinician apps.
 *
 * Profiles: iPhone 14, Samsung Galaxy S24, iPad Air, Galaxy Tab
 * Each profile sets: viewport, userAgent, touch events, deviceScaleFactor
 */

import { devices } from "playwright";

const PROFILES = {
  "iphone-14": {
    name: "iPhone 14",
    device: "iPhone 14 Pro Max",
    viewport: { width: 430, height: 932 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    deviceScaleFactor: 3,
    isMobile: true
  },
  "galaxy-s24": {
    name: "Samsung Galaxy S24",
    device: "Samsung Galaxy S24",
    viewport: { width: 412, height: 915 },
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
    hasTouch: true,
    deviceScaleFactor: 3,
    isMobile: true
  },
  "ipad-air": {
    name: "iPad Air",
    device: "iPad Air (5th gen)",
    viewport: { width: 820, height: 1180 },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    hasTouch: true,
    deviceScaleFactor: 2,
    isMobile: true
  },
  "galaxy-tab": {
    name: "Galaxy Tab S9",
    device: "Samsung Galaxy Tab S9",
    viewport: { width: 800, height: 1280 },
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Safari/537.36",
    hasTouch: true,
    deviceScaleFactor: 2,
    isMobile: false
  },
  "desktop": {
    name: "Desktop (Default)",
    device: "Desktop",
    viewport: { width: 1280, height: 900 },
    userAgent: "",
    hasTouch: false,
    deviceScaleFactor: 1,
    isMobile: false
  }
};

export function getProfiles() {
  return Object.entries(PROFILES).map(([id, p]) => ({
    id, name: p.name, device: p.device,
    viewport: `${p.viewport.width}x${p.viewport.height}`,
    touch: p.hasTouch
  }));
}

export function getProfile(id) {
  return PROFILES[id] || PROFILES["desktop"];
}

export function getProfileConfig(id) {
  const profile = getProfile(id);
  return {
    viewport: profile.viewport,
    userAgent: profile.userAgent || undefined,
    hasTouch: profile.hasTouch,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile
  };
}

export function createMobileContext(browser, profileId) {
  const config = getProfileConfig(profileId);
  return browser.newContext(config);
}
