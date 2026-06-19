/**
 * Frame Manager — Shadow DOM & Cross-Origin iframe Piercing
 * Manages Playwright frame contexts for multi-window LIS interfaces.
 *
 * Many legacy LIS apps (Winpath, ICE, BloodTrack) embed iframes
 * or use Shadow DOM for modular UI components.
 */

export async function getActiveFrame(page) {
  // Check for iframes
  const frames = page.frames();
  if (frames.length > 1) {
    // Try main content frame first
    for (const frame of frames) {
      if (frame !== page.mainFrame()) {
        try {
          const body = await frame.waitForSelector("body", { timeout: 2000 }).catch(() => null);
          if (body) return { frame, source: "iframe", url: frame.url() };
        } catch {}
      }
    }
  }
  return { frame: page.mainFrame(), source: "main" };
}

export function getFrameDescription(frame, mainUrl) {
  if (frame === frame.page?.mainFrame()) return "main page";
  const url = frame.url();
  const name = frame.name();
  return `iframe${name ? ` "${name}"` : ""} [${url !== mainUrl ? url : "same-origin"}]`;
}

export async function waitForFrame(frame, selector, timeout = 8000) {
  try {
    await frame.waitForSelector(selector, { timeout });
    return true;
  } catch {
    return false;
  }
}

export async function clickInFrame(frame, selector) {
  try {
    await frame.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
    await frame.click(selector);
    return true;
  } catch {
    return false;
  }
}

export async function fillInFrame(frame, selector, value) {
  try {
    await frame.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
    await frame.fill(selector, value);
    return true;
  } catch {
    return false;
  }
}

export async function getAllFramesInfo(page) {
  const frames = page.frames();
  return frames.map(f => ({
    isMain: f === page.mainFrame(),
    url: f.url().slice(0, 100),
    name: f.name() || "(unnamed)",
    childCount: f.childFrames().length
  }));
}
