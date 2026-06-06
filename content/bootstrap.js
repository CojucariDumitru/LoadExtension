/**
 * Tiny entry script (not bundled). Chrome loads this first.
 */
const BUILD = "0.5.0";
const MODULE = chrome.runtime.getURL("dist/content.js");

function showBootStatus(text) {
  let el = document.getElementById("loadextension-toolbar");
  if (!el) {
    el = document.createElement("div");
    el.id = "loadextension-toolbar";
    el.className = "le-toolbar";
    document.documentElement.appendChild(el);
  }
  el.innerHTML = `
    <img src="${chrome.runtime.getURL("icons/icon16.png")}" alt="" width="16" height="16" />
    <strong>LoadExtension</strong>
    <span class="le-version">v${BUILD}</span>
    <span id="le-load-count">${text}</span>
  `;
}

function isDatHost() {
  return /one\.dat\.com|power\.dat\.com/.test(location.hostname);
}

function isDatSplash() {
  return /Loading DAT One/i.test(document.body?.textContent || "");
}

function hasBoard() {
  return Boolean(
    document.querySelector(
      '[role="grid"], [role="treegrid"], [role="table"], [role="row"], .ag-root, .ag-center-cols-container'
    )
  );
}

async function waitForDatReady() {
  if (!isDatHost()) return;

  showBootStatus("waiting for DAT…");
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (!isDatSplash() && hasBoard()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function start() {
  try {
    showBootStatus("starting…");
    await waitForDatReady();
    if (isDatHost()) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const mod = await import(MODULE);
    if (typeof mod.boot === "function") {
      await mod.boot();
    } else {
      showBootStatus("boot missing — rebuild");
    }
  } catch (error) {
    console.error("[LoadExtension] bootstrap failed:", error);
    showBootStatus("error — rebuild extension");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => start(), { once: true });
} else {
  start();
}
