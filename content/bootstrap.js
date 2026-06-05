/**
 * Tiny entry script (not bundled). Chrome loads this first.
 * Waits for DAT's splash screen to finish before importing the heavy module.
 */
const MODULE = chrome.runtime.getURL("dist/content.js");

function isDatHost() {
  return /one\.dat\.com|power\.dat\.com/.test(location.hostname);
}

function isDatSplash() {
  const text = document.body?.textContent || "";
  return /Loading DAT One/i.test(text);
}

function hasBoard() {
  return Boolean(
    document.querySelector(
      '[role="grid"], [role="treegrid"], .ag-root, .ag-center-cols-container, [role="table"]'
    )
  );
}

async function waitForDatReady() {
  if (!isDatHost()) return;

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (!isDatSplash() && (hasBoard() || location.pathname.includes("search"))) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function start() {
  try {
    await waitForDatReady();
    if (isDatHost()) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const mod = await import(MODULE);
    if (typeof mod.boot === "function") {
      await mod.boot();
    }
  } catch (error) {
    console.error("[LoadExtension] bootstrap failed:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => start(), { once: true });
} else {
  start();
}
