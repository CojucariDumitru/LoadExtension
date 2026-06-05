/**
 * Tiny entry script (not bundled). Chrome loads this first.
 * Waits for DAT's splash screen to finish before importing the heavy module.
 */
const BUILD = "0.4.0";
const MODULE = chrome.runtime.getURL("dist/content.js");

function isDatHost() {
  return /one\.dat\.com|power\.dat\.com/.test(location.hostname);
}

function isDatSplash() {
  const text = document.body?.textContent || "";
  return /Loading DAT One/i.test(text);
}

async function waitForDatReady() {
  if (!isDatHost()) return;

  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const pastSplash = !isDatSplash();
    const hasBoard = Boolean(
      document.querySelector('[role="grid"]') || document.querySelector('[role="table"]')
    );
    if (pastSplash && (hasBoard || location.pathname.includes("search"))) return;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function start() {
  await waitForDatReady();
  if (isDatHost()) {
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  const mod = await import(MODULE);
  if (typeof mod.boot === "function") {
    await mod.boot();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => start(), { once: true });
} else {
  start();
}
